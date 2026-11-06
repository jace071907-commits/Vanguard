import { applyStoredTheme, mountThemeControls } from '../core/theme.js'
import { flushQueuedToast, toast } from '../core/toast.js'
import { logout, requireSession } from '../core/session.js'
import { mountBell } from '../core/notifications.js'
import { $ } from '../core/ui.js'
import { NAV, TABS, matchRoute } from '../modules/registry.js'
import { initials } from '../modules/profile.js'

applyStoredTheme()
mountThemeControls()

let state = await requireSession('active')
document.body.classList.remove('guarded')
flushQueuedToast()

const shell = $('#shell')
const view = $('#view')
const bell = mountBell($('#bell'))
let cleanup = null
let navToken = 0
let lastCaseTab = 'nte'

renderNav()
renderTabs()
renderUser()
window.addEventListener('hashchange', route)
route()

$('#logoutBtn').addEventListener('click', () => logout())
$('#menuBtn').addEventListener('click', () => shell.classList.toggle('nav-open'))
$('#scrim').addEventListener('click', () => shell.classList.remove('nav-open'))

function renderNav() {
  $('#nav').innerHTML = NAV[state.portal].map((g) => `
    <div class="nav-group">
      <span class="nav-group-label">${g.group}</span>
      ${g.items.map((i) => `
        <a class="nav-item" href="#/${i.route === 'tab-home' ? 'nte' : i.route}" data-route="${i.route}" data-keys="${i.keys.join(' ')}">
          <span class="nav-icon">${i.icon}</span><span>${i.label}</span>
        </a>`).join('')}
    </div>`).join('')
}

function renderTabs() {
  $('#moduleTabs').innerHTML = TABS.map((t) => `
    <a class="module-tab" role="tab" href="#/${t.home}" data-tab="${t.id}" title="${t.label}">
      <span class="module-tab-short">${t.short}</span><span class="module-tab-label">${t.label}</span>
    </a>`).join('')
}

function renderUser() {
  const p = state.profile
  $('#userAvatar').textContent = initials(p.name)
  $('#userName').textContent = p.name || p.domain
  $('#userName').title = p.name || ''
  $('#userRole').textContent = `${p.role} · ${p.domain}`
}

const navigate = (path) => { location.hash = `#/${path}` }

async function route() {
  const token = ++navToken
  const path = location.hash.replace(/^#\/?/, '') || 'nte'

  // Every navigation re-validates the session and role on the server.
  state = await requireSession('active')
  if (token !== navToken) return
  renderUser()

  const match = matchRoute(path)
  if (!match || !match.route.portals.includes(state.portal)) {
    if (match) toast.warning('You do not have permission to access that page.')
    location.replace('#/nte')
    return
  }
  const { route: r, params } = match

  // "Dashboard" follows the selected tab (NTE or NOD dashboard).
  if (['nte', 'nod', 'pip'].includes(r.tab)) lastCaseTab = r.tab
  document.querySelectorAll('.nav-item').forEach((a) => {
    if (a.dataset.route === 'tab-home') a.setAttribute('href', `#/${lastCaseTab}`)
    a.classList.toggle('active', a.dataset.keys.split(' ').includes(r.nav))
  })
  document.querySelectorAll('.module-tab').forEach((a) => {
    const on = a.dataset.tab === r.tab
    a.classList.toggle('active', on)
    a.setAttribute('aria-selected', on)
  })

  const ctx = { profile: state.profile, portal: state.portal, params, navigate, refreshBell: bell.refresh }
  const title = r.view.title(ctx)
  const tab = TABS.find((t) => t.id === r.tab)
  $('#pageTitle').textContent = title
  $('#pageCrumb').textContent = ['VANGUARD', tab?.label, title !== tab?.label ? title : null].filter(Boolean).join('  /  ')
  document.title = `VANGUARD | ${title}`

  if (typeof cleanup === 'function') cleanup()
  view.innerHTML = '<div class="view-anim"></div>'
  cleanup = await r.view.mount(view.firstElementChild, ctx)
  shell.classList.remove('nav-open')
  view.focus({ preventScroll: true })
  window.scrollTo({ top: 0 })
}
