// Shared helpers for filling Word (.docx) templates with content controls. No external libraries.

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const xmlEscape = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export const BODY_RPR = '<w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:cstheme="majorHAnsi"/>' +
  '<w:color w:val="000000"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>'

const BOX_RPR = '<w:rPr><w:rFonts w:ascii="MS Gothic" w:eastAsia="MS Gothic" w:hAnsi="MS Gothic" w:hint="eastAsia"/></w:rPr>'
const RUN = /<w:r(?=[\s>])[^>]*>[\s\S]*?<\/w:r>/g
const INNER_SDT = /<w:sdt>(?:(?!<w:sdt>)[\s\S])*?<\/w:sdt>/g
const EMPTY_P = /<w:p\b[^>]*?(?:\/>|>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?<\/w:p>)/

export function makeRuns(text, rPr = '') {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line, i) => `<w:r>${rPr}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`)
    .join('')
}

/**
 * Fills plain-text content controls by tag and sets checkbox controls in document order.
 * @param {Record<string,string>} values  tag -> text
 * @param {boolean[]} checks              state for the 1st, 2nd, ... checkbox control
 */
export function fillContentControls(xml, values, checks = []) {
  let checkbox = 0
  return xml.replace(INNER_SDT, (sdt) => {
    const prEnd = sdt.indexOf('</w:sdtPr>')
    if (prEnd < 0) return sdt
    let pr = sdt.slice(0, prEnd)
    let rest = sdt.slice(prEnd)

    if (pr.includes('<w14:checkbox>')) {
      const on = !!checks[checkbox++]
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

/** Writes text into the first empty paragraph of the table row that follows a heading. */
export function fillAfterHeading(xml, heading, text) {
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

/**
 * For option lists written as plain paragraphs (e.g. bulleted with a hollow-square bullet, no checkbox
 * controls): within the table cell after `heading`, replaces each option's bullet with a ☒ / ☐ mark.
 */
export function markPlainOptions(xml, heading, options, selected) {
  const h = xml.indexOf(heading)
  if (h < 0) return xml
  const cellEnd = xml.indexOf('</w:tc>', h)
  const cell = xml.slice(h, cellEnd).replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
    const text = [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('').trim()
    if (!options.includes(text)) return p
    const box = `<w:r>${BOX_RPR}<w:t xml:space="preserve">${selected.includes(text) ? '\u2612' : '\u2610'}  </w:t></w:r>`
    const out = p.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, '')
    return out.includes('</w:pPr>') ? out.replace('</w:pPr>', `</w:pPr>${box}`) : out.replace(/^(<w:p\b[^>]*>)/, `$1${box}`)
  })
  return xml.slice(0, h) + cell + xml.slice(cellEnd)
}

/** Appends text to the paragraph that contains a plain label such as "Employee Name:". */
export function fillAfterLabel(xml, label, text, rPr = BODY_RPR) {
  const i = xml.indexOf(`${label}</w:t></w:r>`)
  if (i < 0) return xml
  const pEnd = xml.indexOf('</w:p>', i)
  return xml.slice(0, pEnd) + makeRuns(text, rPr) + xml.slice(pEnd)
}

/** Fills the cells of the table row directly below the header row that contains `heading`. */
export function fillRowBelowHeading(xml, heading, texts, rPr = BODY_RPR) {
  const h = xml.indexOf(heading)
  if (h < 0) return xml
  const headerEnd = xml.indexOf('</w:tr>', h)
  const starts = [xml.indexOf('<w:tr ', headerEnd), xml.indexOf('<w:tr>', headerEnd)].filter((i) => i >= 0)
  if (!starts.length) return xml
  const rowStart = Math.min(...starts)
  const rowEnd = xml.indexOf('</w:tr>', rowStart)
  let cell = 0
  const row = xml.slice(rowStart, rowEnd).replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => {
    const text = texts[cell++]
    const m = text == null ? null : EMPTY_P.exec(tc)
    if (!m) return tc
    const p = m[0]
    const filled = p.endsWith('/>') ? `${p.slice(0, -2)}>${makeRuns(text, rPr)}</w:p>` : p.replace(/<\/w:p>$/, `${makeRuns(text, rPr)}</w:p>`)
    return tc.slice(0, m.index) + filled + tc.slice(m.index + p.length)
  })
  return xml.slice(0, rowStart) + row + xml.slice(rowEnd)
}

export function parseDate(value) {
  if (value instanceof Date) return value
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value)
}

export const longDate = (value) =>
  parseDate(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
