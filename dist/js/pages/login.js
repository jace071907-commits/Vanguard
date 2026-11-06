import { api, checkConnection } from '../core/api.js'
import { applyStoredTheme, mountThemeControls } from '../core/theme.js'
import { flushQueuedToast, queueToast, toast } from '../core/toast.js'
import { PAGES, redirectIfSignedIn, session } from '../core/session.js'
import { $, $$, bindPasswordToggles, setBusy, showError } from '../core/ui.js'

const PORTALS = {
  associate: { title: 'Associate Login', hint: 'For Associates and SMEs.' },
  manager: { title: 'Manager Login', hint: 'For Team Leads, Supervisors, Managers and other leadership roles.' },
}

let portal = 'associate'

applyStoredTheme()
mountThemeControls()
bindPasswordToggles()
flushQueuedToast()
redirectIfSignedIn()
verifyDatabase()

const tabs = $('.seg-tabs')
$$('[data-portal]').forEach((btn) =>
  btn.addEventListener('click', () => {
    portal = btn.dataset.portal
    tabs.dataset.active = portal
    $$('[data-portal]').forEach((b) => {
      b.classList.toggle('active', b === btn)
      b.setAttribute('aria-selected', b === btn)
    })
    $('#portalTitle').textContent = PORTALS[portal].title
    $('#portalHint').textContent = PORTALS[portal].hint
    showError($('#loginError'))
  }),
)

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const domain = $('#domain').value.trim()
  const password = $('#password').value
  const errorEl = $('#loginError')
  const btn = $('#loginBtn')
  showError(errorEl)

  if (!domain || !password) {
    showError(errorEl, 'Please enter your username (Domain ID) and password.')
    toast.warning('Please enter your username and password.')
    return
  }

  setBusy(btn, true, 'Signing in…')
  try {
    const res = await api.login(domain, password, portal)
    session.save(res.token)
    if (res.stage === 'setup') {
      queueToast('warning', res.needs_password
        ? 'First-time login detected. Please complete your account setup.'
        : 'Please register your company email address to continue.')
      window.location.replace(PAGES.setup)
    } else {
      queueToast('success', `Welcome back, ${res.profile.first_name || res.profile.name}!`)
      window.location.replace(PAGES.app)
    }
  } catch (err) {
    showError(errorEl, err.message)
    if (err.code === 'wrong_portal' || err.code === 'locked') toast.warning(err.message)
    else toast.error(err.message)
    setBusy(btn, false)
    $('#password').select()
  }
})

async function verifyDatabase() {
  const el = $('#dbStatus')
  const txt = el.querySelector('.txt')
  try {
    const s = await checkConnection()
    if (s.not_installed) {
      el.dataset.state = 'warn'
      txt.textContent = 'Connected · User table found · run setup.sql'
      toast.warning('Database functions are not installed yet. Run supabase/setup.sql in Supabase.')
    } else {
      el.dataset.state = 'ok'
      txt.textContent = `Connected · ${Number(s.user_count).toLocaleString()} users`
    }
  } catch (err) {
    el.dataset.state = 'error'
    txt.textContent = 'Database unavailable'
    toast.error(err.message)
  }
}
