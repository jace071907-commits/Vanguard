import { toast } from './toast.js'
import { escapeHtml as e } from './validation.js'

const ICONS = { pdf: 'PDF', docx: 'DOC', xlsx: 'XLS', png: 'IMG', jpg: 'IMG', jpeg: 'IMG' }
export const fileIcon = (name = '') => ICONS[name.split('.').pop().toLowerCase()] ?? 'FILE'

/**
 * Staged multi-file picker. Files are kept in memory until the caller uploads them.
 * @param {HTMLElement} host  element that will contain the file list
 * @param {{ accept: string, validate: (f: File) => string|null, formatBytes: (n:number)=>string }} opts
 */
export class FileStager {
  constructor(host, { accept, validate, formatBytes }) {
    this.host = host
    this.validate = validate
    this.formatBytes = formatBytes
    this.files = []
    this.disabled = false
    this.input = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept, hidden: true })
    this.input.addEventListener('change', () => {
      this.add([...this.input.files])
      this.input.value = ''
    })
    host.after(this.input)
    host.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-remove]')
      if (btn && !this.disabled) {
        this.files.splice(Number(btn.dataset.remove), 1)
        this.render()
      }
    })
    this.render()
  }

  open() {
    if (!this.disabled) this.input.click()
  }

  add(list) {
    for (const f of list) {
      const problem = this.validate(f)
      if (problem) toast.warning(problem)
      else if (!this.files.some((x) => x.name === f.name && x.size === f.size)) this.files.push(f)
    }
    this.render()
  }

  clear() {
    this.files = []
    this.render()
  }

  setDisabled(disabled) {
    this.disabled = disabled
    this.render()
  }

  render() {
    this.host.innerHTML = this.files.length
      ? this.files.map((f, i) => `
          <li class="file-item">
            <span class="file-icon">${fileIcon(f.name)}</span>
            <span class="file-name" title="${e(f.name)}">${e(f.name)}</span>
            <span class="file-size">${this.formatBytes(f.size)}</span>
            ${this.disabled ? '' : `<button type="button" class="icon-btn" data-remove="${i}" aria-label="Remove ${e(f.name)}">×</button>`}
          </li>`).join('')
      : '<li class="file-empty">No files attached.</li>'
  }
}
