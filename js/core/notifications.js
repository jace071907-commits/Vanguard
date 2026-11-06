import { nteApi, handleError } from '../modules/nte/api.js'
import { escapeHtml as e } from './validation.js'

const POLL_MS = 30000
const ICONS = {
  nte_new: '✉',
  nte_manager_files: '⇪',
  nte_acknowledged: '✓',
  nte_response: '✎',
  nte_associate_files: '⇪',
  nod_new: '⚖',
  nod_manager_files: '⇪',
  nod_acknowledged: '✓',
  nod_response: '✎',
  nod_associate_files: '⇪',
  pip_new: '◎',
  pip_manager_files: '⇪',
  pip_acknowledged: '✓',
  pip_response: '✎',
  pip_associate_files: '⇪',
}

// Notification type prefix -> module route (e.g. "nod_new" -> #/nod/case/<id>).
const caseLink = (n) => {
  const mod = String(n.type).split('_')[0]
  return `#/${['nod', 'pip'].includes(mod) ? mod : 'nte'}/case/${encodeURIComponent(n.case_id ?? '')}`
}

const timeAgo = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

/** Notification bell (upper-right). Opening the panel marks everything as viewed and resets the badge. */
export function mountBell(host) {
  host.classList.add('bell-wrap')
  host.innerHTML = `
    <button type="button" class="bell-btn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>
      <span class="bell-badge" hidden>0</span>
    </button>
    <div class="bell-panel card" hidden>
      <div class="bell-head"><strong>Notifications</strong><span class="muted small" data-count></span></div>
      <ul class="bell-list"></ul>
    </div>`
  const btn = host.querySelector('.bell-btn')
  const badge = host.querySelector('.bell-badge')
  const panel = host.querySelector('.bell-panel')
  const list = host.querySelector('.bell-list')
  let items = []
  let timer

  const setBadge = (n) => {
    badge.hidden = !n
    badge.textContent = n > 99 ? '99+' : n
    btn.classList.toggle('has-unread', n > 0)
  }

  const render = () => {
    host.querySelector('[data-count]').textContent = items.length ? `${items.length} recent` : ''
    list.innerHTML = items.length
      ? items.map((n) => `
          <li><a class="bell-item ${n.viewed ? '' : 'unread'}" href="${caseLink(n)}" data-id="${n.id}">
            <span class="bell-icon">${ICONS[n.type] ?? '•'}</span>
            <span class="bell-text"><span>${e(n.message)}</span><small class="muted">${timeAgo(n.created_at)}</small></span>
          </a></li>`).join('')
      : '<li class="bell-empty muted">You\'re all caught up.</li>'
  }

  async function refresh() {
    try {
      const res = await nteApi.notifications()
      items = res.items
      setBadge(res.unread)
      if (!panel.hidden) render()
    } catch (err) {
      if (err.code === 'no_session' || err.code === 'role_changed') {
        clearInterval(timer)
        handleError(err)
      }
    }
  }

  async function open() {
    panel.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    render()
    if (items.some((n) => !n.viewed)) {
      setBadge(0)
      try {
        await nteApi.markViewed(null)
      } catch (err) {
        handleError(err)
      }
      items = items.map((n) => ({ ...n, viewed: true }))
    }
  }

  const close = () => {
    panel.hidden = true
    btn.setAttribute('aria-expanded', 'false')
    render()
  }

  btn.addEventListener('click', () => (panel.hidden ? open() : close()))
  list.addEventListener('click', (ev) => { if (ev.target.closest('.bell-item')) close() })
  document.addEventListener('click', (ev) => { if (!panel.hidden && !host.contains(ev.target)) close() })
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !panel.hidden) close() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh() })

  refresh()
  timer = setInterval(refresh, POLL_MS)
  return { refresh }
}
