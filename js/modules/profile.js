import { escapeHtml as e } from '../core/validation.js'

const FIELDS = [
  ['Associate Name', 'name'],
  ['Employee Number', 'employee_no'],
  ['Role', 'role'],
  ['Program', 'program'],
  ['AM', 'am'],
  ['Manager Name', 'manager_name'],
  ['OM', 'om'],
  ['Email Address', 'email'],
  ['Domain ID', 'domain'],
  ['Position', 'position'],
  ['Tower', 'tower'],
  ['Hire Date', 'hire_date'],
]

export const initials = (name = '') =>
  name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?'

export default {
  title: () => 'My Profile',
  mount(el, { profile: p, portal }) {
    el.innerHTML = `
      <section class="card hero">
        <div class="hero-avatar">${e(initials(p.name))}</div>
        <div class="hero-text">
          <h2>${e(p.name)}</h2>
          <div class="hero-badges">
            <span class="chip">${e(p.role)}</span>
            <span class="chip chip-soft">${portal === 'manager' ? 'Manager Portal' : 'Associate Portal'}</span>
            ${p.program ? `<span class="chip chip-soft">${e(p.program)}</span>` : ''}
          </div>
        </div>
      </section>
      <section class="card panel">
        <div class="panel-head"><h3>Employee Information</h3></div>
        <div class="info-grid">
          ${FIELDS.map(([label, key]) => `
            <div class="info-item">
              <span class="info-label">${label}</span>
              <span class="info-value">${e(p[key]) || '<span class="muted">—</span>'}</span>
            </div>`).join('')}
        </div>
      </section>`
  },
}
