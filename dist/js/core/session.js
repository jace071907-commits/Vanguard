import { api } from './api.js'
import { queueToast } from './toast.js'

// The session token lives in sessionStorage: scoped to this tab and cleared when it closes.
// It is only a random reference; the server validates it (and the user's role) on every page.
const KEY = 'vg-session'

export const session = {
  token: () => sessionStorage.getItem(KEY),
  save: (token) => sessionStorage.setItem(KEY, token),
  clear: () => sessionStorage.removeItem(KEY),
}

export const PAGES = { login: 'index.html', setup: 'setup.html', app: 'app.html' }

const go = (page) => window.location.replace(page)

/**
 * Server-side guard for protected pages.
 * @param {'setup'|'active'} requiredStage
 * @returns session payload ({ stage, portal, profile, ... }) or never resolves when redirecting.
 */
export async function requireSession(requiredStage) {
  const token = session.token()
  if (!token) {
    go(PAGES.login)
    return new Promise(() => {})
  }
  try {
    const data = await api.session(token)
    if (data.stage !== requiredStage) {
      go(data.stage === 'setup' ? PAGES.setup : PAGES.app)
      return new Promise(() => {})
    }
    return data
  } catch (err) {
    session.clear()
    queueToast(err.code === 'network' ? 'error' : 'warning', err.message)
    go(PAGES.login)
    return new Promise(() => {})
  }
}

export async function logout(message = 'You have been signed out.') {
  const token = session.token()
  session.clear()
  if (token) await api.logout(token).catch(() => {})
  queueToast('success', message)
  go(PAGES.login)
}

// If already signed in, skip the login page.
export async function redirectIfSignedIn() {
  const token = session.token()
  if (!token) return
  try {
    const data = await api.session(token)
    go(data.stage === 'setup' ? PAGES.setup : PAGES.app)
  } catch {
    session.clear()
  }
}
