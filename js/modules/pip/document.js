// Populates assets/templates/PIP.docx and returns the completed Performance Improvement Plan.
//
// The PIP template has no content controls, so values are placed by position:
//   "Employee Name:" / "PIP Enrollment Date:" / "Department:" / "Start of Review Date:" / "End of Review Date:"
//     -> value appended after the label in the same cell
//   Row below the "Core Performance Dimensions | Performance Concern(s) | Expectation (s)" header
//     -> one value per column
import { readZip } from '../../core/zip.js'
import { DOCX_MIME, fillAfterLabel, fillRowBelowHeading, longDate } from '../../core/docx.js'

export const TEMPLATE_URL = 'assets/templates/PIP.docx'

// Matches the template's 10pt body text, not bold.
const VALUE_RPR = '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
const fmt = (d) => (d ? longDate(d) : '')

export async function fillPipDocx(templateBuffer, data) {
  const zip = await readZip(templateBuffer)
  let xml = await zip.readText('word/document.xml')

  xml = fillAfterLabel(xml, 'Employee Name:', data.employeeName, VALUE_RPR)
  xml = fillAfterLabel(xml, 'PIP Enrollment Date:', fmt(data.enrollmentDate), VALUE_RPR)
  xml = fillAfterLabel(xml, 'Department:', data.department, VALUE_RPR)
  xml = fillAfterLabel(xml, 'Start of Review Date:', fmt(data.startDate), VALUE_RPR)
  xml = fillAfterLabel(xml, 'End of Review Date:', fmt(data.endDate), VALUE_RPR)
  xml = fillRowBelowHeading(xml, 'Core Performance Dimensions', [data.core, data.concern, data.expectation], VALUE_RPR)

  zip.writeText('word/document.xml', xml)
  return zip.toBlob(DOCX_MIME)
}

let templateCache = null

export async function generatePipDocx(data) {
  if (!templateCache) {
    const res = await fetch(TEMPLATE_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error('PIP.docx template could not be loaded.')
    templateCache = await res.arrayBuffer()
  }
  return fillPipDocx(templateCache, data)
}

export const pipFileName = (caseId) => `PIP_${caseId}.docx`
export { longDate }
