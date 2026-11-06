export const ACCENTS = ['blue', 'violet', 'green', 'orange', 'pink', 'grey']

const root = document.documentElement
const store = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage disabled */ } },
}

export function applyStoredTheme() {
  const mode = store.get('vg-mode') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const accent = ACCENTS.includes(store.get('vg-accent')) ? store.get('vg-accent') : 'blue'
  root.dataset.mode = mode
  root.dataset.accent = accent
  syncLogos()
}

export function setMode(mode) {
  root.dataset.mode = mode
  store.set('vg-mode', mode)
  syncLogos()
  document.dispatchEvent(new CustomEvent('vg:theme'))
}

export function setAccent(accent) {
  root.dataset.accent = accent
  store.set('vg-accent', accent)
  document.dispatchEvent(new CustomEvent('vg:theme'))
}

function syncLogos() {
  const src = root.dataset.mode === 'dark' ? 'assets/img/vw.png' : 'assets/img/vb.png'
  document.querySelectorAll('img[data-logo]').forEach((img) => { img.src = src })
}

// Renders the mode toggle + color selector into every [data-theme-controls] element.
export function mountThemeControls() {
  document.querySelectorAll('[data-theme-controls]:not([data-mounted])').forEach((host) => {
    host.dataset.mounted = ''
    host.classList.add('theme-controls')
    host.innerHTML = `
      <div class="swatches" role="radiogroup" aria-label="Theme color">
        ${ACCENTS.map((a) => `<button type="button" class="swatch swatch-${a}" data-accent="${a}" role="radio" title="${a[0].toUpperCase() + a.slice(1)}"></button>`).join('')}
      </div>
      <button type="button" class="mode-toggle" aria-label="Toggle dark mode"><span class="mode-knob"></span></button>`
    host.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => setAccent(b.dataset.accent)))
    host.querySelector('.mode-toggle').addEventListener('click', () => setMode(root.dataset.mode === 'dark' ? 'light' : 'dark'))
  })
  if (!listening) document.addEventListener('vg:theme', syncControls)
  listening = true
  syncControls()
}

let listening = false

function syncControls() {
  document.querySelectorAll('.swatch').forEach((b) => {
    const on = b.dataset.accent === root.dataset.accent
    b.classList.toggle('active', on)
    b.setAttribute('aria-checked', on)
  })
  document.querySelectorAll('.mode-knob').forEach((k) => { k.textContent = root.dataset.mode === 'dark' ? '☾' : '☀' })
}
