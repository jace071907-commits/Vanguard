import { ApiError, rpc, storage } from '../../core/api.js'
import { session } from '../../core/session.js'
import { FILE_TYPES, saveBlob } from '../nte/api.js'

export { FILE_ACCEPT, STATUSES, formatBytes, handleError, saveBlob, statusClass, validateFile } from '../nte/api.js'

const token = () => session.token()

export const CATEGORY = { document: 'NOD Document', manager: 'Manager Upload', associate: 'Associate Upload' }

export const nodApi = {
  // Same User-table lookup as NTE (manager only).
  lookup: (domain) => rpc('vanguard_nte_lookup', { p_token: token(), p_domain: domain }),
  create: ({ caseId, domain, modes, decision, infraction, basis }) =>
    rpc('vanguard_nod_create', {
      p_token: token(), p_case_id: caseId, p_domain: domain, p_modes: modes,
      p_decision: decision, p_infraction: infraction, p_basis: basis,
    }),
  list: () => rpc('vanguard_nod_list', { p_token: token() }),
  get: (caseId) => rpc('vanguard_nod_get', { p_token: token(), p_case_id: caseId }),
  acknowledge: (caseId) => rpc('vanguard_nod_acknowledge', { p_token: token(), p_case_id: caseId }),
  respond: (caseId, response) => rpc('vanguard_nod_respond', { p_token: token(), p_case_id: caseId, p_response: response }),
  close: (caseId) => rpc('vanguard_nod_close', { p_token: token(), p_case_id: caseId }),
}

/** Uploads one file to Supabase Storage (nod-files) and records it in "NOD Attachment". */
export async function uploadFile(caseId, file, category, { silent = false, fileName = file.name } = {}) {
  const type = FILE_TYPES[fileName.split('.').pop().toLowerCase()]
  if (!type) throw new ApiError(`"${fileName}" is not an allowed file type.`, 'bad_file')
  const ticket = await rpc('vanguard_nod_upload_begin', {
    p_token: token(), p_case_id: caseId, p_file_name: fileName, p_content_type: type,
    p_size: file.size, p_category: category, p_silent: silent,
  })
  await storage.upload(ticket.bucket, ticket.path, file, type)
  return rpc('vanguard_nod_upload_complete', { p_token: token(), p_path: ticket.path })
}

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

export async function downloadAttachment(attachmentId) {
  const grant = await rpc('vanguard_nod_file_access', { p_token: token(), p_attachment_id: attachmentId })
  saveBlob(await storage.download(grant.bucket, grant.path), grant.file_name)
}
