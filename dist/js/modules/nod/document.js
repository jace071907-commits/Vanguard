// Populates assets/templates/NOD.docx and returns the completed Notice of Decision.
//
// Template mapping:
//   ASSOCIATE NAME, POSITION, EMPLOYEE NO., FORM DATE, ADDRESS, EMAIL ADDRESS, AM, OM, HIRE DATE -> same-named fields
//   Program cell  -> its content control is tagged "MODE OF SERVICE" in the template (also accepts "PROGRAM")
//   Mode of Service options are plain text in the template -> prefixed with ☒ / ☐
//   6 Decision checkboxes (in order)            -> Decision
//   row after "Infraction Details:"             -> Infraction Details
//   row after "Basis of Decision:"              -> Basis of Decision
import { readZip } from '../../core/zip.js'
import { DOCX_MIME, fillAfterHeading, fillContentControls, longDate, markPlainOptions } from '../../core/docx.js'

export const TEMPLATE_URL = 'assets/templates/NOD.docx'
export const MODES = ['Personal Service', 'Registered Mail', 'Private Courier', 'Email']
export const DECISIONS = ['Documented Coaching', 'Verbal Warning', 'Written Warning', 'Final Written Warning', 'Dismissal', 'Absolved']

export async function fillNodDocx(templateBuffer, data) {
  const zip = await readZip(templateBuffer)
  let xml = await zip.readText('word/document.xml')

  xml = fillContentControls(xml, {
    'ASSOCIATE NAME': data.associateName,
    POSITION: data.position,
    'EMPLOYEE NO.': data.employeeNo,
    'FORM DATE': longDate(data.formDate),
    ADDRESS: data.address,
    'EMAIL ADDRESS': data.email,
    'MODE OF SERVICE': data.program,
    PROGRAM: data.program,
    AM: data.supervisor,
    OM: data.operationsManager,
    'HIRE DATE': data.hireDate,
  }, DECISIONS.map((d) => d === data.decision))
  xml = markPlainOptions(xml, 'Mode of Service</w:t>', MODES, data.modes ?? [])
  xml = fillAfterHeading(xml, 'Infraction Details:', data.infraction)
  xml = fillAfterHeading(xml, 'Basis of Decision:', data.basis)

  zip.writeText('word/document.xml', xml)
  return zip.toBlob(DOCX_MIME)
}

let templateCache = null

export async function generateNodDocx(data) {
  if (!templateCache) {
    const res = await fetch(TEMPLATE_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error('NOD.docx template could not be loaded.')
    templateCache = await res.arrayBuffer()
  }
  return fillNodDocx(templateCache, data)
}

export const nodFileName = (caseId) => `NOD_${caseId}.docx`
export { longDate }
