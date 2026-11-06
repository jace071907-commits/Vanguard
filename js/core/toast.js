const ICONS = { success: '✓', warning: '!', error: '✕', info: 'i' }
const TITLES = { success: 'Success', warning: 'Warning', error: 'Error', info: 'Notice' }

function stack() {
  let el = document.querySelector('.toast-stack')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast-stack'
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
  }
  return el
}

function show(type, message, duration = 4500) {
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.innerHTML = `<span class="toast-icon">${ICONS[type]}</span>
    <div class="toast-body"><strong>${TITLES[type]}</strong><p></p></div>
    <button type="button" class="toast-close" aria-label="Dismiss">×</button>`
  el.querySelector('p').textContent = message
  const close = () => {
    el.classList.add('leaving')
    setTimeout(() => el.remove(), 300)
  }
  el.querySelector('.toast-close').addEventListener('click', close)
  stack().appendChild(el)
  setTimeout(close, duration)
}

export const toast = {
  success: (m, d) => show('success', m, d),
  warning: (m, d) => show('warning', m, d),
  error: (m, d) => show('error', m, d),
  info: (m, d) => show('info', m, d),
}

// Messages carried across a page redirect.
export function queueToast(type, message) {
  sessionStorage.setItem('vg-toast', JSON.stringify({ type, message }))
}

export function flushQueuedToast() {
  const raw = sessionStorage.getItem('vg-toast')
  if (!raw) return
  sessionStorage.removeItem('vg-toast')
  try {
    const { type, message } = JSON.parse(raw)
    toast[type]?.(message)
  } catch { /* ignore */ }
}
