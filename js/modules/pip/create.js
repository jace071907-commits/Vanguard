import { FileStager } from '../../core/files.js'
import { toast } from '../../core/toast.js'
import { setBusy } from '../../core/ui.js'
import { makeCaseId } from '../nte/create.js'
import { CATEGORY, FILE_ACCEPT, formatBytes, handleError, pipApi, saveBlob, uploadFiles, validateFile } from './api.js'
import { generatePipDocx, pipFileName } from './document.js'

const DATES = [
  { id: 'enrollmentDate', label: 'PIP Enrollment Date' },
  { id: 'startDate', label: 'Start of Review Date' },
  { id: 'endDate', label: 'End of Review Date' },
]

const TEXTS = [
  { id: 'core', label: 'Core Performance Dimensions', hint: 'Based on the Performance Evaluation Form.' },
  { id: 'concern', label: 'Performance Concern', hint: 'Describe the specific areas of performance requiring improvement.' },
  { id: 'expectation', label: 'Expectation', hint: 'Describe the solution / expected performance and how progress will be measured.' },
]

export default {
  title: () => 'Create PIP',

  mount(el, { navigate, refreshBell }) {
    el.innerHTML = `
      <form class="card form-container" id="pipForm" novalidate>
        <header class="form-header">
          <div>
            <h2>Performance Improvement Plan</h2>
            <p class="muted small">Enter the associate's DOMAIN to load their details from the employee directory.</p>
          </div>
          <div class="case-id-badge" id="caseBadge" hidden><span class="muted small">CASE ID</span><strong id="caseIdText" class="mono"></strong></div>
        </header>

        <section class="form-section">
          <h3 class="section-title"><span class="section-num">1</span> Employee Information</h3>
          <div class="form-grid">
            <label class="field">
              <span>DOMAIN <em class="req">*</em></span>
              <div class="input-wrap">
                <span class="input-icon">@</span>
                <input id="domain" autocomplete="off" placeholder="e.g. AL97637" autocapitalize="characters" />
                <span class="input-status" id="domainStatus"></span>
              </div>
            </label>
            <label class="field">
              <span>CASE ID</span>
              <div class="input-wrap readonly"><input id="caseId" readonly tabindex="-1" placeholder="Generated automatically" /></div>
            </label>
            <label class="field">
              <span>Employee Name</span>
              <div class="input-wrap readonly"><input id="employeeName" readonly tabindex="-1" /></div>
            </label>
            <label class="field">
              <span>Department</span>
              <div class="input-wrap readonly"><input id="department" readonly tabindex="-1" /></div>
            </label>
          </div>
        </section>

        <section class="form-section">
          <h3 class="section-title"><span class="section-num">2</span> PIP Information</h3>
          <div class="form-grid">
            ${DATES.map((d) => `
              <label class="field">
                <span>${d.label} <em class="req">*</em></span>
                <div class="input-wrap"><input type="date" id="${d.id}" /></div>
              </label>`).join('')}
          </div>
        </section>

        ${TEXTS.map((t, i) => `
          <section class="form-section">
            <h3 class="section-title"><span class="section-num">${i + 3}</span> ${t.label} <em class="req">*</em></h3>
            <p class="muted small">${t.hint}</p>
            <textarea id="${t.id}" rows="6" class="textarea" maxlength="20000"></textarea>
          </section>`).join('')}

        <section class="form-section doc-actions">
          <div>
            <h3 class="section-title"><span class="section-num">6</span> PIP Document</h3>
            <p class="muted small">Generates the completed PIP.docx from the official template and downloads it. Fields are kept.</p>
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost" id="clearBtn">Clear</button>
            <button type="button" class="btn btn-primary" id="createBtn">Create PIP</button>
          </div>
        </section>

        <section class="form-section">
          <h3 class="section-title"><span class="section-num">7</span> Attachments / Supporting Documents</h3>
          <p class="muted small">DOCX, PDF, PNG, JPG, JPEG, XLSX · up to 25 MB each. Uploaded on Submit.</p>
          <ul class="file-list" id="files"></ul>
        </section>

        <footer class="form-footer">
          <button type="button" class="btn btn-ghost" id="backBtn">← Back</button>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost" id="attachBtn">⇪ Attach Files</button>
            <button type="submit" class="btn btn-primary" id="submitBtn">Submit</button>
          </div>
        </footer>
      </form>`

    const $ = (s) => el.querySelector(s)
    const files = new FileStager($('#files'), { accept: FILE_ACCEPT, validate: validateFile, formatBytes })
    let employee = null
    let lookedUp = ''
    let lookupSeq = 0
    let submitted = false
    let busy = false

    // End of review can't be before start of review.
    $('#startDate').addEventListener('change', () => { $('#endDate').min = $('#startDate').value })

    const setDomainStatus = (state, text = '') => {
      const s = $('#domainStatus')
      s.dataset.state = state
      s.textContent = text
    }

    const fillEmployee = () => {
      $('#employeeName').value = employee?.name ?? ''
      $('#department').value = employee?.program ?? ''
      const caseId = employee ? makeCaseId(employee.domain) : ''
      $('#caseId').value = caseId
      $('#caseIdText').textContent = caseId
      $('#caseBadge').hidden = !caseId
    }

    async function lookup() {
      const domain = $('#domain').value.trim()
      if (domain.toUpperCase() === lookedUp.toUpperCase() && (employee || !domain)) return
      lookedUp = domain
      employee = null
      fillEmployee()
      if (!domain) return setDomainStatus('')
      const seq = ++lookupSeq
      setDomainStatus('loading', '…')
      try {
        const res = await pipApi.lookup(domain)
        if (seq !== lookupSeq) return
        employee = res.employee
        $('#domain').value = employee.domain
        lookedUp = employee.domain
        if (!$('#enrollmentDate').value && res.today) $('#enrollmentDate').value = String(res.today).slice(0, 10)
        fillEmployee()
        setDomainStatus('ok', '✓')
      } catch (err) {
        if (seq !== lookupSeq) return
        setDomainStatus('error', '!')
        handleError(err)
      }
    }

    let debounce
    $('#domain').addEventListener('input', () => {
      clearTimeout(debounce)
      debounce = setTimeout(lookup, 700)
    })
    $('#domain').addEventListener('change', () => { clearTimeout(debounce); lookup() })
    $('#domain').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(debounce); lookup() }
    })

    const values = () => ({
      domain: employee?.domain,
      caseId: $('#caseId').value,
      enrollmentDate: $('#enrollmentDate').value,
      startDate: $('#startDate').value,
      endDate: $('#endDate').value,
      core: $('#core').value.trim(),
      concern: $('#concern').value.trim(),
      expectation: $('#expectation').value.trim(),
    })

    const validate = (v) => {
      if (!employee) return 'Enter a valid DOMAIN to load the employee information.'
      for (const d of DATES) if (!v[d.id]) return `${d.label} is required.`
      if (v.endDate < v.startDate) return 'End of Review Date cannot be before the Start of Review Date.'
      for (const t of TEXTS) if (!v[t.id]) return `${t.label} is required.`
      return null
    }

    const docData = (v) => ({
      employeeName: employee.name,
      department: employee.program,
      enrollmentDate: v.enrollmentDate,
      startDate: v.startDate,
      endDate: v.endDate,
      core: v.core,
      concern: v.concern,
      expectation: v.expectation,
    })

    const isDirty = () => !submitted && (employee || TEXTS.some((t) => $(`#${t.id}`).value) || files.files.length)

    const setLocked = (locked) => {
      el.querySelectorAll('input, textarea, button').forEach((c) => {
        if (!['backBtn', 'clearBtn', 'createBtn'].includes(c.id)) c.disabled = locked
      })
      files.setDisabled(locked)
    }

    // ---- Create PIP: generate + download, keep fields ----
    $('#createBtn').addEventListener('click', async () => {
      const v = values()
      const problem = validate(v)
      if (problem) return toast.warning(problem)
      const btn = $('#createBtn')
      setBusy(btn, true, 'Generating…')
      try {
        saveBlob(await generatePipDocx(docData(v)), pipFileName(v.caseId))
        toast.success(`PIP document for ${v.caseId} generated.`)
      } catch (err) {
        toast.error(`Could not generate PIP.docx: ${err.message}`)
      } finally {
        setBusy(btn, false)
      }
    })

    // ---- Clear ----
    $('#clearBtn').addEventListener('click', () => {
      if (busy || (isDirty() && !confirm('Clear all fields and attachments?'))) return
      $('#pipForm').reset()
      $('#endDate').min = ''
      employee = null
      lookedUp = ''
      files.clear()
      fillEmployee()
      setDomainStatus('')
      submitted = false
      setLocked(false)
      $('#domain').focus()
    })

    $('#attachBtn').addEventListener('click', () => files.open())
    $('#backBtn').addEventListener('click', () => {
      if (!busy && (!isDirty() || confirm('Leave this page? Unsaved changes will be lost.'))) navigate('pip')
    })

    // ---- Submit: save PIP record, generated document and attachments ----
    $('#pipForm').addEventListener('submit', async (ev) => {
      ev.preventDefault()
      if (busy || submitted) return
      const v = values()
      const problem = validate(v)
      if (problem) return toast.warning(problem)

      busy = true
      const btn = $('#submitBtn')
      setBusy(btn, true, 'Saving PIP…')
      setLocked(true)
      try {
        let res
        try {
          res = await pipApi.create(v)
        } catch (err) {
          if (err.code !== 'duplicate') throw err
          v.caseId = makeCaseId(employee.domain)
          $('#caseId').value = v.caseId
          $('#caseIdText').textContent = v.caseId
          res = await pipApi.create(v)
        }
        submitted = true
        const caseId = res.case.case_id

        setBusy(btn, true, 'Uploading files…')
        const doc = await generatePipDocx(docData(v))
        const docFile = new File([doc], pipFileName(caseId), { type: doc.type })
        const docResult = await uploadFiles(caseId, [docFile], CATEGORY.document, { silent: true })
        const fileResult = await uploadFiles(caseId, files.files, CATEGORY.manager, { silent: true })
        const failed = [...docResult.failed, ...fileResult.failed]

        if (failed.length) toast.warning(`Saved ${caseId}, but some files failed: ${failed.map((f) => `${f.name} (${f.message})`).join(', ')}. You can re-upload them from the case page.`, 9000)
        else toast.success(`PIP ${caseId} submitted successfully.`)
        refreshBell?.()
        navigate(`pip/case/${encodeURIComponent(caseId)}`)
      } catch (err) {
        handleError(err)
        if (!submitted) setLocked(false)
      } finally {
        busy = false
        setBusy(btn, false)
      }
    })

    $('#domain').focus()
    const beforeUnload = (ev) => { if (isDirty()) { ev.preventDefault(); ev.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  },
}
