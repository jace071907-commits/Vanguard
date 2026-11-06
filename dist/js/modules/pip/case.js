import { FileStager, fileIcon } from '../../core/files.js'
import { toast } from '../../core/toast.js'
import { setBusy } from '../../core/ui.js'
import { escapeHtml as e } from '../../core/validation.js'
import {
  CATEGORY, FILE_ACCEPT, downloadAttachment, formatBytes, handleError, pipApi, saveBlob, statusClass, uploadFiles, validateFile,
} from './api.js'
import { generatePipDocx, longDate, pipFileName } from './document.js'

const STEPS = [
  { key: 'created_at', label: 'Issued' },
  { key: 'acknowledged_at', label: 'Acknowledged' },
  { key: 'responded_at', label: 'Responded' },
  { key: 'completed_at', label: 'Completed' },
]

const DETAILS = [
  ['Employee Name', 'employee_name'],
  ['Domain', 'domain'],
  ['Department', 'department'],
  ['PIP Enrollment Date', 'enrollment_date', longDate],
  ['Start of Review Date', 'start_date', longDate],
  ['End of Review Date', 'end_date', longDate],
  ['Issued By', 'created_by_name'],
]

const dt = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '')
const text = (v) => (v ? `<div class="prose">${e(v)}</div>` : '<span class="muted">—</span>')

function fileRows(list, emptyText) {
  return list.length
    ? `<ul class="file-list">${list.map((a) => `
        <li class="file-item">
          <span class="file-icon">${fileIcon(a.file_name)}</span>
          <span class="file-name" title="${e(a.file_name)}">${e(a.file_name)}<small class="muted">${dt(a.created_at)}${a.file_size ? ` · ${formatBytes(a.file_size)}` : ''}</small></span>
          <button type="button" class="btn btn-ghost btn-sm" data-download="${e(a.id)}" ${a.available ? '' : 'disabled title="File not available"'}>⇩ Download</button>
        </li>`).join('')}</ul>`
    : `<p class="muted small">${emptyText}</p>`
}

const docData = (c) => ({
  employeeName: c.employee_name,
  department: c.department,
  enrollmentDate: c.enrollment_date,
  startDate: c.start_date,
  endDate: c.end_date,
  core: c.core,
  concern: c.concern,
  expectation: c.expectation,
})

export default {
  title: ({ params }) => params.id,

  async mount(el, ctx) {
    const { params, portal, navigate, refreshBell } = ctx
    const manager = portal === 'manager'
    // Fresh root per mount so listeners from a previous render are dropped on reload.
    const root = document.createElement('div')
    root.className = 'view-stack'
    el.replaceChildren(root)
    root.innerHTML = '<div class="card panel center"><span class="spinner lg"></span></div>'

    let data
    try {
      data = await pipApi.get(params.id)
    } catch (err) {
      root.innerHTML = `<section class="card panel placeholder"><div class="empty-icon">!</div><h2>Case unavailable</h2>
        <p class="muted">${e(err.message)}</p><a class="btn btn-ghost" href="#/pip">← Back to cases</a></section>`
      return handleError(err)
    }

    const c = data.case
    const docs = data.attachments.filter((a) => a.category === CATEGORY.document)
    const managerFiles = data.attachments.filter((a) => a.category === CATEGORY.manager || (!a.category && a.uploader === 'Manager'))
    const associateFiles = data.attachments.filter((a) => a.category === CATEGORY.associate || (!a.category && a.uploader === 'Associate'))
    const completed = c.status === 'Completed'
    const acknowledged = c.status !== 'Pending Acknowledgement'
    const responded = !!(c.response && c.response.trim())
    const reached = STEPS.filter((s) => c[s.key]).length

    root.innerHTML = `
      <section class="card case-header">
        <div class="case-title">
          <span class="muted small">CASE ID</span>
          <h2 class="mono">${e(c.case_id)}</h2>
          <span class="status-chip ${statusClass(c.status)}">${e(c.status)}</span>
        </div>
        <div class="case-meta">
          <div><span class="muted small">Enrolled</span><strong>${c.enrollment_date ? longDate(c.enrollment_date) : '—'}</strong></div>
          <div><span class="muted small">Review Period</span><strong>${c.start_date ? longDate(c.start_date) : '—'} – ${c.end_date ? longDate(c.end_date) : '—'}</strong></div>
          <div><span class="muted small">${manager ? 'Employee' : 'Issued By'}</span><strong>${e(manager ? c.employee_name : c.created_by_name ?? '—')}</strong></div>
        </div>
        <ol class="timeline">
          ${STEPS.map((s, i) => `
            <li class="${c[s.key] ? 'done' : i === reached ? 'current' : ''}">
              <span class="tl-dot">${c[s.key] ? '✓' : i + 1}</span>
              <span class="tl-label">${s.label}</span>
              <small class="muted">${dt(c[s.key])}</small>
            </li>`).join('')}
        </ol>
      </section>

      ${!manager && !acknowledged ? `
        <section class="card panel ack-banner">
          <div>
            <h3>Acknowledgement Required</h3>
            <p class="muted small">Please review your Performance Improvement Plan below, including the attached documents. By clicking <strong>Acknowledge Receipt</strong> you confirm that you have received and read this plan and understand the expectations and review period.</p>
          </div>
          <button type="button" class="btn btn-primary" id="ackBtn">Acknowledge Receipt</button>
        </section>` : ''}

      <section class="card panel">
        <div class="panel-head"><h3>Performance Improvement Plan Details</h3></div>
        <div class="info-grid">
          ${DETAILS.map(([label, key, fmt]) => `
            <div class="info-item">
              <span class="info-label">${label}</span>
              <span class="info-value">${c[key] ? e(fmt ? fmt(c[key]) : c[key]) : '<span class="muted">—</span>'}</span>
            </div>`).join('')}
        </div>
        <div class="detail-block">
          <h4>Core Performance Dimensions</h4>
          ${text(c.core)}
        </div>
        <div class="detail-block">
          <h4>Performance Concern</h4>
          ${text(c.concern)}
        </div>
        <div class="detail-block">
          <h4>Expectation</h4>
          ${text(c.expectation)}
        </div>
      </section>

      <section class="doc-grid">
        <div class="card panel">
          <div class="panel-head"><h3>Generated PIP Document</h3></div>
          ${docs.length ? fileRows(docs, '') : `
            <ul class="file-list"><li class="file-item">
              <span class="file-icon">DOC</span>
              <span class="file-name">${e(pipFileName(c.case_id))}<small class="muted">Generated from the PIP template</small></span>
              <button type="button" class="btn btn-ghost btn-sm" id="regenBtn">⇩ Download</button>
            </li></ul>`}
        </div>
        <div class="card panel">
          <div class="panel-head"><h3>Manager Attachments &amp; Supporting Documents</h3></div>
          ${fileRows(managerFiles, 'No files uploaded by the manager.')}
          ${manager && !completed ? `
            <div class="upload-box">
              <ul class="file-list" id="mgrFiles"></ul>
              <div class="btn-row">
                <button type="button" class="btn btn-ghost" id="mgrAttach">⇪ Attach Files</button>
                <button type="button" class="btn btn-primary" id="mgrUpload">Upload Additional Files</button>
              </div>
            </div>` : ''}
        </div>
      </section>

      <section class="card panel ${!manager && !acknowledged ? 'locked' : ''}">
        <div class="panel-head">
          <h3>Associate Response</h3>
          ${responded ? `<span class="muted small">Submitted ${c.response_date ? longDate(c.response_date) : ''}</span>` : ''}
        </div>
        ${responded || manager || completed ? `
          ${responded ? text(c.response) : `<p class="muted">${completed ? 'This PIP is completed.' : 'Awaiting the associate\'s response.'}</p>`}
          <div class="detail-block">
            <h4>Associate Supporting Documents</h4>
            ${fileRows(associateFiles, 'No files uploaded by the associate.')}
          </div>` : `
          <form id="responseForm" class="response-form" novalidate>
            <label class="field">
              <span>Response <em class="req">*</em></span>
              <textarea id="response" class="textarea" rows="8" maxlength="20000" placeholder="Write your response here…" ${acknowledged ? '' : 'disabled'}></textarea>
            </label>
            <label class="field response-date">
              <span>Response Date</span>
              <div class="input-wrap readonly"><input value="${longDate(new Date())}" readonly tabindex="-1" /></div>
            </label>
            <div class="field">
              <span>Attach Files</span>
              <ul class="file-list" id="assocFiles"></ul>
            </div>
            <div class="form-footer">
              <button type="button" class="btn btn-ghost" data-back>← Back</button>
              <div class="btn-row">
                <button type="button" class="btn btn-ghost" id="assocAttach" ${acknowledged ? '' : 'disabled'}>⇪ Attach Files</button>
                <button type="submit" class="btn btn-primary" id="respondBtn" ${acknowledged ? '' : 'disabled'}>Submit</button>
              </div>
            </div>
          </form>`}
      </section>

      ${manager || responded || completed ? `
        <div class="form-footer page-actions">
          <button type="button" class="btn btn-ghost" data-back>← Back</button>
          ${manager && !completed ? '<button type="button" class="btn btn-primary" id="completeBtn">Mark PIP as Completed</button>' : ''}
        </div>` : ''}`

    const $ = (s) => root.querySelector(s)
    const reload = () => this.mount(el, ctx)

    root.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => navigate('pip')))

    root.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-download]')
      if (!btn) return
      setBusy(btn, true, '')
      try {
        await downloadAttachment(btn.dataset.download)
      } catch (err) {
        handleError(err)
      } finally {
        setBusy(btn, false)
      }
    })

    $('#regenBtn')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget
      setBusy(btn, true, '')
      try {
        saveBlob(await generatePipDocx(docData(c)), pipFileName(c.case_id))
      } catch (err) {
        toast.error(`Could not generate PIP.docx: ${err.message}`)
      } finally {
        setBusy(btn, false)
      }
    })

    $('#ackBtn')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget
      setBusy(btn, true, 'Acknowledging…')
      try {
        await pipApi.acknowledge(c.case_id)
        toast.success('PIP acknowledged. You may now submit your response.')
        refreshBell?.()
        reload()
      } catch (err) {
        handleError(err)
        setBusy(btn, false)
      }
    })

    if ($('#responseForm')) {
      const stager = new FileStager($('#assocFiles'), { accept: FILE_ACCEPT, validate: validateFile, formatBytes })
      if (!acknowledged) stager.setDisabled(true)
      $('#assocAttach').addEventListener('click', () => stager.open())
      $('#responseForm').addEventListener('submit', async (ev) => {
        ev.preventDefault()
        const response = $('#response').value.trim()
        if (!response) return toast.warning('Please enter your response.')
        if (!confirm('Submit your response? It cannot be edited after submission.')) return
        const btn = $('#respondBtn')
        setBusy(btn, true, 'Submitting…')
        stager.setDisabled(true)
        try {
          await pipApi.respond(c.case_id, response)
          if (stager.files.length) {
            setBusy(btn, true, 'Uploading files…')
            const r = await uploadFiles(c.case_id, stager.files, CATEGORY.associate)
            if (r.failed.length) toast.warning(`Response saved, but some files failed: ${r.failed.map((f) => `${f.name} (${f.message})`).join(', ')}`, 9000)
          }
          toast.success('Your response has been submitted.')
          reload()
        } catch (err) {
          handleError(err)
          setBusy(btn, false)
          stager.setDisabled(false)
        }
      })
    }

    if ($('#mgrFiles')) {
      const stager = new FileStager($('#mgrFiles'), { accept: FILE_ACCEPT, validate: validateFile, formatBytes })
      $('#mgrAttach').addEventListener('click', () => stager.open())
      $('#mgrUpload').addEventListener('click', async (ev) => {
        if (!stager.files.length) return toast.warning('Attach at least one file first.')
        const btn = ev.currentTarget
        setBusy(btn, true, 'Uploading…')
        stager.setDisabled(true)
        try {
          const r = await uploadFiles(c.case_id, stager.files, CATEGORY.manager)
          if (r.failed.length) toast.warning(`Some files failed: ${r.failed.map((f) => `${f.name} (${f.message})`).join(', ')}`, 9000)
          if (r.uploaded) toast.success(`${r.uploaded} file(s) uploaded. The associate has been notified.`)
          reload()
        } catch (err) {
          handleError(err)
          setBusy(btn, false)
          stager.setDisabled(false)
        }
      })
    }

    $('#completeBtn')?.addEventListener('click', async (ev) => {
      if (!confirm(`Mark PIP ${c.case_id} as completed? No further responses or uploads will be accepted.`)) return
      const btn = ev.currentTarget
      setBusy(btn, true, 'Completing…')
      try {
        await pipApi.complete(c.case_id)
        toast.success(`PIP ${c.case_id} marked as completed.`)
        reload()
      } catch (err) {
        handleError(err)
        setBusy(btn, false)
      }
    })
  },
}
