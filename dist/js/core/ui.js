// Small shared DOM helpers.
export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

export function bindPasswordToggles(root = document) {
  $$('[data-toggle-pw]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      const ids = btn.dataset.togglePw.split(',')
      const show = $(`#${ids[0]}`).type === 'password'
      ids.forEach((id) => { $(`#${id}`).type = show ? 'text' : 'password' })
      btn.textContent = show ? 'Hide' : 'Show'
    })
  })
}

export function setBusy(btn, busy, label) {
  if (busy) {
    btn.dataset.label = btn.innerHTML
    btn.innerHTML = `<span class="spinner"></span> ${label}`
  } else if (btn.dataset.label) {
    btn.innerHTML = btn.dataset.label
  }
  btn.disabled = busy
}

export function showError(el, message) {
  el.textContent = message || ''
  el.hidden = !message
}
