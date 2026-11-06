import { escapeHtml as e } from '../../core/validation.js'
import { STATUSES, handleError, nodApi, statusClass } from './api.js'
import { longDate } from './document.js'

const KPIS = [
  { key: 'total', label: 'Total NOD Cases', icon: '⚖', tone: 'accent' },
  { key: 'pending', label: 'Pending Acknowledgement', icon: '◷', tone: 'warning' },
  { key: 'responded', label: 'Responded Cases', icon: '✎', tone: 'success' },
  { key: 'closed', label: 'Closed Cases', icon: '✓', tone: 'neutral' },
]

export default {
  title: ({ portal }) => (portal === 'manager' ? 'Dashboard' : 'My NOD Cases'),

  async mount(el, { portal, navigate }) {
    const manager = portal === 'manager'
    el.innerHTML = `
      <section class="kpi-grid">
        ${KPIS.map((k) => `
          <div class="card kpi-card tone-${k.tone}">
            <div class="kpi-icon">${k.icon}</div>
            <div class="kpi-body">
              <div class="kpi-value" data-kpi="${k.key}"><span class="skeleton"></span></div>
              <div class="kpi-label">${k.label}</div>
            </div>
          </div>`).join('')}
      </section>

      <section class="card panel">
        <div class="panel-head">
          <div>
            <h3>${manager ? 'Notices of Decision I Issued' : 'Notices of Decision Assigned to Me'}</h3>
            <p class="muted small">${manager ? 'Only NODs you issued are shown.' : 'Select a case to view, acknowledge and respond.'}</p>
          </div>
          ${manager ? '<a class="btn btn-primary" href="#/nod/create">+ Create NOD</a>' : ''}
        </div>

        <div class="filter-bar">
          <div class="input-wrap grow">
            <span class="input-icon">⌕</span>
            <input id="q" type="search" placeholder="Search by case ID${manager ? ', associate or domain' : ''}…" />
          </div>
          <select id="status" aria-label="Status filter">
            <option value="">All statuses</option>
            ${STATUSES.map((s) => `<option>${s}</option>`).join('')}
          </select>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Case ID</th>
              ${manager ? '<th>Associate</th><th>Domain</th>' : '<th>Issued By</th>'}
              <th>Date Issued</th><th>Decision</th><th>Status</th><th></th>
            </tr></thead>
            <tbody id="rows"><tr><td colspan="7" class="table-loading"><span class="spinner lg"></span></td></tr></tbody>
          </table>
        </div>
      </section>`

    const rowsEl = el.querySelector('#rows')
    let cases = []

    const render = () => {
      const q = el.querySelector('#q').value.trim().toLowerCase()
      const st = el.querySelector('#status').value
      const list = cases.filter((c) =>
        (!st || c.status === st) &&
        (!q || [c.case_id, c.associate_name, c.domain, c.created_by_name, c.decision].some((v) => String(v ?? '').toLowerCase().includes(q))))
      rowsEl.innerHTML = list.length
        ? list.map((c) => `
            <tr data-case="${e(c.case_id)}" tabindex="0">
              <td data-label="Case ID"><strong class="mono">${e(c.case_id)}</strong></td>
              ${manager
                ? `<td data-label="Associate">${e(c.associate_name)}</td><td data-label="Domain">${e(c.domain)}</td>`
                : `<td data-label="Issued By">${e(c.created_by_name ?? '—')}</td>`}
              <td data-label="Date Issued">${c.form_date ? longDate(c.form_date) : '—'}</td>
              <td data-label="Decision"><span class="decision-chip">${e(c.decision ?? '—')}</span></td>
              <td data-label="Status"><span class="status-chip ${statusClass(c.status)}">${e(c.status)}</span></td>
              <td class="row-action">›</td>
            </tr>`).join('')
        : `<tr><td colspan="7"><div class="empty-state">
             <div class="empty-icon">NOD</div>
             <h3>${cases.length ? 'No matching cases' : 'No NOD cases yet'}</h3>
             <p class="muted small">${cases.length ? 'Try a different search or status filter.' : manager ? 'NODs you issue will appear here.' : 'You have no Notices of Decision.'}</p>
           </div></td></tr>`
    }

    el.querySelector('#q').addEventListener('input', render)
    el.querySelector('#status').addEventListener('change', render)
    const open = (tr) => tr?.dataset.case && navigate(`nod/case/${encodeURIComponent(tr.dataset.case)}`)
    rowsEl.addEventListener('click', (ev) => open(ev.target.closest('tr[data-case]')))
    rowsEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(ev.target.closest('tr[data-case]')) })

    try {
      const res = await nodApi.list()
      cases = res.cases
      KPIS.forEach((k) => { el.querySelector(`[data-kpi="${k.key}"]`).textContent = res.kpis[k.key] ?? 0 })
      render()
    } catch (err) {
      rowsEl.innerHTML = `<tr><td colspan="7" class="muted center">${e(err.message)}</td></tr>`
      KPIS.forEach((k) => { el.querySelector(`[data-kpi="${k.key}"]`).textContent = '—' })
      handleError(err)
    }
  },
}
