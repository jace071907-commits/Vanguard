import { CONFIG } from '../config.js'

const REST = `${CONFIG.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`
const HEADERS = { apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }

export class ApiError extends Error {
  constructor(message, code = 'error') {
    super(message)
    this.code = code
  }
}

export async function rpc(fn, args = {}) {
  let res
  try {
    res = await fetch(`${REST}/rpc/${fn}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(args) })
  } catch {
    throw new ApiError('Unable to reach the server. Check your network connection.', 'network')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (body?.code === 'PGRST202') throw new ApiError('VANGUARD database functions are not installed. Run supabase/setup.sql.', 'not_installed')
    throw new ApiError(body?.message || `Request failed (${res.status})`, body?.code || 'http')
  }
  if (body && body.ok === false) throw new ApiError(body.message, body.code)
  return body
}

// Connection check: verifies the REST endpoint responds and the "User" table exists, then gets the row count.
export async function checkConnection() {
  try {
    return await rpc('vanguard_status')
  } catch (err) {
    if (err.code !== 'not_installed') throw err
    const res = await fetch(`${REST}/User?select=DOMAIN&limit=1`, { headers: { ...HEADERS, Prefer: 'count=exact' } })
    if (!res.ok) throw new ApiError('Connected, but the "User" table was not found.', 'no_table')
    return { ok: true, table: 'User', user_count: null, not_installed: true }
  }
}

const STORAGE = `${CONFIG.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object`
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/')

// Supabase Storage. Access is only granted to paths issued by the vanguard_* RPCs (see supabase/nte.sql).
export const storage = {
  async upload(bucket, path, file, contentType) {
    let res
    try {
      res = await fetch(`${STORAGE}/${bucket}/${encodePath(path)}`, {
        method: 'POST',
        headers: { apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': contentType, 'x-upsert': 'false', 'cache-control': '3600' },
        body: file,
      })
    } catch {
      throw new ApiError('Upload failed: unable to reach storage.', 'network')
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new ApiError(`Upload failed: ${body?.message || body?.error || res.status}`, 'storage')
    }
  },

  async download(bucket, path) {
    let res
    try {
      res = await fetch(`${STORAGE}/authenticated/${bucket}/${encodePath(path)}`, { headers: { apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY } })
    } catch {
      throw new ApiError('Download failed: unable to reach storage.', 'network')
    }
    if (!res.ok) throw new ApiError(`Download failed (${res.status}).`, 'storage')
    return res.blob()
  },
}

export const api = {
  login: (domain, password, portal) => rpc('vanguard_login', { p_domain: domain, p_password: password, p_portal: portal }),
  session: (token) => rpc('vanguard_session', { p_token: token }),
  setPassword: (token, password) => rpc('vanguard_set_password', { p_token: token, p_new_password: password }),
  registerEmail: (token, email) => rpc('vanguard_register_email', { p_token: token, p_email: email }),
  logout: (token) => rpc('vanguard_logout', { p_token: token }),
}
