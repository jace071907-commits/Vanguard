export const TEMP_PASSWORD = 'Welcome123'

export const PASSWORD_RULES = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'num', label: 'One number', test: (p) => /\d/.test(p) },
]

export function validatePassword(pw, confirm) {
  const failed = PASSWORD_RULES.find((r) => !r.test(pw))
  if (failed) return `Password requirement not met: ${failed.label.toLowerCase()}.`
  if (pw === TEMP_PASSWORD) return 'New password cannot be the temporary password.'
  if (pw !== confirm) return 'Passwords do not match.'
  return null
}

// Firstname.Lastname@carelon.com (multi-part names allowed, e.g. juan.dela.cruz@carelon.com)
export const CARELON_EMAIL = /^[a-z]+(-[a-z]+)*(\.[a-z]+(-[a-z]+)*)+@carelon\.com$/

export function validateEmail(email) {
  const e = email.trim().toLowerCase()
  if (!e) return 'Company email address is required.'
  if (!e.endsWith('@carelon.com')) return 'Only @carelon.com email addresses are allowed.'
  if (!CARELON_EMAIL.test(e)) return 'Email must follow the format Firstname.Lastname@carelon.com'
  return null
}

export const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
