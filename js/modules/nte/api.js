import { ApiError, rpc, storage } from '../../core/api.js'
import { PAGES, session } from '../../core/session.js'
import { queueToast, toast } from '../../core/toast.js'
import { DOCX_MIME } from './document.js'

const token = () => session.token()

export const STATUSES = ['Pending Acknowledgement', 'Acknowledged', 'Responded', 'Closed']
export const CATEGORY = { document: 'NTE Document', manager: 'Manager Upload', associate: 'Associate Upload' }

export const FILE_TYPES = {
  docx: DOCX_MIME,
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
export const FILE_ACCEPT = Object.keys(FILE_TYPES).map((e) => `.${e}`).join(',')
export const MAX_FILE_BYTES = 25 * 1024 * 1024

export function validateFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (!FILE_TYPES[ext]) return `"${file.name}" is not allowed. Use DOCX, PDF, PNG, JPG, JPEG or XLSX.`
  if (file.size === 0) return `"${file.name}" is empty.`
  if (file.size > MAX_FILE_BYTES) return `"${file.name}" exceeds the 25 MB limit.`
  return null
}

export const nteApi = {
  lookup: (domain) => rpc('vanguard_nte_lookup', { p_token: token(), p_domain: domain }),
  create: ({ caseId, domain, modes, facts, violation }) =>
    rpc('vanguard_nte_create', { p_token: token(), p_case_id: caseId, p_domain: domain, p_modes: modes, p_facts: facts, p_violation: violation }),
  list: () => rpc('vanguard_nte_list', { p_token: token() }),
  get: (caseId) => rpc('vanguard_nte_get', { p_token: token(), p_case_id: caseId }),
  acknowledge: (caseId) => rpc('vanguard_nte_acknowledge', { p_token: token(), p_case_id: caseId }),
  respond: (caseId, response) => rpc('vanguard_nte_respond', { p_token: token(), p_case_id: caseId, p_response: response }),
  close: (caseId) => rpc('vanguard_nte_close', { p_token: token(), p_case_id: caseId }),
  notifications: () => rpc('vanguard_notifications', { p_token: token() }),
  markViewed: (ids = null) => rpc('vanguard_notifications_viewed', { p_token: token(), p_ids: ids }),
}

/** Uploads one file to Supabase Storage and records it in "NTE Attachments". */
export async function uploadFile(caseId, file, category, { silent = false, fileName = file.name } = {}) {
  const ext = fileName.split('.').pop().toLowerCase()
  const type = FILE_TYPES[ext]
  if (!type) throw new ApiError(`"${fileName}" is not an allowed file type.`, 'bad_file')
  const ticket = await rpc('vanguard_upload_begin', {
    p_token: token(), p_case_id: caseId, p_file_name: fileName, p_content_type: type,
    p_size: file.size, p_category: category, p_silent: silent,
  })
  await storage.upload(ticket.bucket, ticket.path, file, type)
  return rpc('vanguard_upload_complete', { p_token: token(), p_path: ticket.path })
}

/** Uploads several files; returns { uploaded, failed: [{ name, message }] }. */
export async function uploadFiles(caseId, files, category, options) {
  const failed = []
  let uploaded = 0
  for (const file of files) {
    try {
      await uploadFile(caseId, file, category, options)
      uploaded++
    } catch (err) {
      if (err.code === 'no_session') throw err
      failed.push({ name: file.name, message: err.message })
    }
  }
  return { uploaded, failed }
}

export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function downloadAttachment(attachmentId) {
  const grant = await rpc('vanguard_file_access', { p_token: token(), p_attachment_id: attachmentId })
  const blob = await storage.download(grant.bucket, grant.path)
  saveBlob(blob, grant.file_name)
}

/** Standard error handling for NTE screens: expired sessions go back to login. */
export function handleError(err) {
  if (err?.code === 'no_session' || err?.code === 'role_changed') {
    session.clear()
    queueToast('warning', err.message)
    window.location.replace(PAGES.login)
    return
  }
  toast[err?.code === 'network' ? 'error' : 'warning'](err?.message || 'Something went wrong.')
}

export const formatBytes = (n) =>
  !n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`

export const statusClass = (s) => `status-${String(s || '').toLowerCase().replace(/\s+/g, '-')}`
