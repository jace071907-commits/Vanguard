// Populates assets/templates/NTE.docx (Word content controls) and returns the completed document.
//
// Template mapping (content control tag -> form field):
//   ASSOCIATE NAME -> Associate's Name      POSITION      -> Position
//   EMPLOYEE NO.   -> Employee Number       FORM DATE     -> Date Was Form Filled Out
//   ADDRESS        -> Address               EMAIL ADDRESS -> Email Address
//   PROGRAM        -> Program               AM            -> Immediate Supervisor
//   OM             -> Operations Manager    HIRE DATE     -> Hire Date
//   4 checkboxes (in order)          -> Mode of Service
//   row after "DETAILED STATEMENT OF FACTS:"       -> Detailed Statement of Facts
//   row after "ALLEGEDLY VIOLATED POLICY AND ..."  -> Allegedly Violated Policy and Possible Sanction
//   first "[DATE]" (written explanation due)       -> form date + 5 calendar days
import { readZip } from '../../core/zip.js'

export const TEMPLATE_URL = 'assets/templates/NTE.docx'
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const MODES = ['Personal Service', 'Registered Mail', 'Private Courier', 'Email']
export const RESPONSE_DAYS = 5

const xmlEscape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const BODY_RPR = '<w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:cstheme="majorHAnsi"/>' +
  '<w:color w:val="000000"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>'

const RUN = /<w:r(?=[\s>])[^>]*>[\s\S]*?<\/w:r>/g
const INNER_SDT = /<w:sdt>(?:(?!<w:sdt>)[\s\S])*?<\/w:sdt>/g
const EMPTY_P = /<w:p\b[^>]*?(?:\/>|>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?<\/w:p>)/

function makeRuns(text, rPr = '') {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line, i) => `<w:r>${rPr}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`)
    .join('')
}

export function parseDate(value) {
  if (value instanceof Date) return value
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value)
}

export const longDate = (value) =>
  parseDate(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export function dueDate(formDate) {
  const d = new Date(parseDate(formDate))
  d.setDate(d.getDate() + RESPONSE_DAYS)
  return d
}

function fillContentControls(xml, values, modes) {
  let checkbox = 0
  return xml.replace(INNER_SDT, (sdt) => {
    const prEnd = sdt.indexOf('</w:sdtPr>')
    if (prEnd < 0) return sdt
    let pr = sdt.slice(0, prEnd)
    let rest = sdt.slice(prEnd)

    if (pr.includes('<w14:checkbox>')) {
      const on = modes.includes(MODES[checkbox++])
      return (pr + rest)
        .replace(/<w14:checked w14:val="[^"]*"\/>/, `<w14:checked w14:val="${on ? 1 : 0}"/>`)
        .replace(/<w:t>[\u2610\u2612]<\/w:t>/, `<w:t>${on ? '\u2612' : '\u2610'}</w:t>`)
    }

    const tag = /<w:tag w:val="([^"]*)"\/>/.exec(pr)?.[1]
    if (!tag || !(tag in values) || !pr.includes('<w:text')) return sdt

    const rPr = (/<w:sdtPr>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(pr)?.[1] ?? '').replace(/<w:rStyle w:val="PlaceholderText"\/>/, '')
    pr = pr.replace('<w:showingPlcHdr/>', '')
    let replaced = false
    rest = rest.replace(RUN, () => (replaced ? '' : ((replaced = true), makeRuns(values[tag], rPr))))
    if (!replaced) rest = rest.replace(/(<w:sdtContent>(?:<w:p\b[^>]*>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?)?)/, `$1${makeRuns(values[tag], rPr)}`)
    return pr + rest
  })
}

// Writes text into the first empty paragraph of the table row that follows a heading.
function fillAfterHeading(xml, heading, text) {
  const h = xml.indexOf(heading)
  if (h < 0) return xml
  const starts = [xml.indexOf('<w:tr ', h), xml.indexOf('<w:tr>', h)].filter((i) => i >= 0)
  if (!starts.length) return xml
  const rowStart = Math.min(...starts)
  const rowEnd = xml.indexOf('</w:tr>', rowStart)
  const row = xml.slice(rowStart, rowEnd)
  const m = EMPTY_P.exec(row)
  if (!m) return xml
  const p = m[0]
  const filled = p.endsWith('/>')
    ? `${p.slice(0, -2)}>${makeRuns(text, BODY_RPR)}</w:p>`
    : p.replace(/<\/w:p>$/, `${makeRuns(text, BODY_RPR)}</w:p>`)
  return xml.slice(0, rowStart) + row.slice(0, m.index) + filled + row.slice(m.index + p.length) + xml.slice(rowEnd)
}

/** Fills the template bytes with NTE data and returns a .docx Blob. */
export async function fillNteDocx(templateBuffer, data) {
  const zip = await readZip(templateBuffer)
  let xml = await zip.readText('word/document.xml')

  xml = fillContentControls(xml, {
    'ASSOCIATE NAME': data.associateName,
    POSITION: data.position,
    'EMPLOYEE NO.': data.employeeNo,
    'FORM DATE': longDate(data.formDate),
    ADDRESS: data.address,
    'EMAIL ADDRESS': data.email,
    PROGRAM: data.program,
    AM: data.supervisor,
    OM: data.operationsManager,
    'HIRE DATE': data.hireDate,
  }, data.modes ?? [])
  xml = fillAfterHeading(xml, 'DETAILED STATEMENT OF FACTS:', data.facts)
  xml = fillAfterHeading(xml, 'ALLEGEDLY VIOLATED POLICY AND POSSIBLE SANCTION:', data.violation)
  xml = xml.replace('[DATE]', xmlEscape(longDate(dueDate(data.formDate))))

  zip.writeText('word/document.xml', xml)
  return zip.toBlob(DOCX_MIME)
}

let templateCache = null

/** Fetches the template (cached) and generates the completed NTE. */
export async function generateNteDocx(data) {
  if (!templateCache) {
    const res = await fetch(TEMPLATE_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error('NTE.docx template could not be loaded.')
    templateCache = await res.arrayBuffer()
  }
  return fillNteDocx(templateCache, data)
}

export const nteFileName = (caseId) => `NTE_${caseId}.docx`
