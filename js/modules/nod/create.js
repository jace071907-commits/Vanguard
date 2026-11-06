import { FileStager } from '../../core/files.js'
import { toast } from '../../core/toast.js'
import { setBusy } from '../../core/ui.js'
import { makeCaseId } from '../nte/create.js'
import { CATEGORY, FILE_ACCEPT, formatBytes, handleError, nodApi, saveBlob, uploadFiles, validateFile } from './api.js'
import { DECISIONS, MODES, generateNodDocx, longDate, nodFileName } from './document.js'

// Read-only fields auto-filled from the Supabase "User" table.
const AUTO_FIELDS = [
  { id: 'associateName', label: "Associate's Name", from: (emp) => emp.name },
  { id: 'position', label: 'Position', from: (emp) => emp.position },
  { id: 'employeeNo', label: 'Employee Number', from: (emp) => emp.employee_no },
  { id: 'formDate', label: 'Date Was Form Filled Out', from: (emp, today) => longDate(today) },
  { id: 'address', label: 'Address', from: (emp) => emp.address, wide: true },
  { id: 'email', label: 'Email Address', from: (emp) => emp.email },
  { id: 'program', label: 'Program', from: (emp) => emp.program },
  { id: 'supervisor', label: 'Immediate Supervisor', from: (emp) => emp.am },
  { id: 'operationsManager', label: 'Operations Manager', from: (emp) => emp.om },
  { id: 'hireDate', label: 'Hire Date', from: (emp) => emp.hire_date },
]

export default {
  title: () => 'Create NOD',

  mount(el, { navigate, refreshBell }) {
    el.innerHTML = `
      <form class="card form-container" id="nodForm" novalidate>
        <header class="form-header">
          <div>
            <h2>Notice of Decision</h2>
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
            ${AUTO_FIELDS.map((f) => `
              <label class="field ${f.wide ? 'span-2' : ''}">
                <span>${f.label}</span>
                <div class="input-wrap readonly"><input id="${f.id}" readonly tabindex="-1" /></div>
              </label>`).join('')}
          </div>
        </section>

        <section class="form-section">
          <h3 class="section-title"><span class="section-num">2</span> Mode of Service <em class="req">*</em></h3>
          <div class="check-group">
            ${MODES.map((m) => `
              <label class="check">
                <input type="checkbox" name="mode" value="${m}" />
                <span class="check-box"></span><span>${m}</span>
              </label>`).join('')}
          </div>
        </section>

        <section class="form-section">
          <h3 class="section-title"><span class="section-num">3</span> Decision <em class="req">*</em></h3>
          <p class="muted small">Upon reviewing the facts related to the case and having considered all circumstances, the company has decided to impose the penalty of (select one):</p>
          <div class="check-group">
            ${DECISIONS.map((d) => `
              <label class="check">
                <input type="checkbox" name="decision" value="${d}" />
                <span class="check-box"></span><span>${d}</span>
              </label>`).join('')}
          </div>
        </section>

        <section class="form-section">
          <h3 class="section-title"><span class="section-num">4</span> Infraction Details <em class="req">*</em></h3>
          <p class="muted small">State the details of the infraction and sanction based on the company policies. Attach a copy of the Notice to Explain (NTE) document and written explanation.</p>
          <textarea id="infraction" rows="7" class="textarea" maxlength="20000"></textarea>
        </section>

        <section class="form-section">
          <h3 class="section-title"><span class="section-num">5</span> Basis of Decision <em class="req">*</em></h3>
          <p class="muted small">State the basis of the decision, evidence relied upon, and any aggravating or mitigating factors, if applicable.</p>
          <textarea id="basis" rows="6" class="textarea" maxlength="20000"></textarea>
        </section>

        <section class="form-section doc-actions">
          <div>
            <h3 class="section-title"><span class="section-num">6</span> NOD Document</h3>
            <p class="muted small">Generates the completed NOD.docx from the official template and downloads it. Fields are kept.</p>
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost" id="clearBtn">Clear</button>
            <button type="button" class="btn btn-primary" id="createBtn">Create NOD</button>
          </div>
        </section>

        <section class="form-section">
          <h3 class="section-title"><span class="section-num">7</span> Attachments / Supporting Evidence</h3>
          <p class="muted small">DOCX, PDF, PNG, JPG, JPEG, XLSX · up to 25 MB each. Uploaded on Submit.</p>
          <ul class="file-list" id="files"></ul>
        </section>

        <footer class="form-footer">
          <button type="button" class="btn btn-ghost" id="backBtn">← Back</button>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost" id="attachBtn">⇪ Attach File</button>
            <button type="submit" class="btn btn-primary" id="submitBtn">Submit</button>
          </div>
        </footer>
      </form>`

    const $ = (s) => el.querySelector(s)
    const files = new FileStager($('#files'), { accept: FILE_ACCEPT, validate: validateFile, formatBytes })
    let employee = null
    let today = null
    let lookedUp = ''
    let lookupSeq = 0
    let submitted = false
    let busy = false

    // Decision is a single choice: checking one clears the others.
    el.querySelectorAll('input[name="decision"]').forEach((box) =>
      box.addEventListener('change', () => {
        if (box.checked) el.querySelectorAll('input[name="decision"]').forEach((o) => { if (o !== box) o.checked = false })
      }))

    const setDomainStatus = (state, text = '') => {
      const s = $('#domainStatus')
      s.dataset.state = state
      s.textContent = text
    }

    const fillEmployee = () => {
      AUTO_FIELDS.forEach((f) => { $(`#${f.id}`).value = employee ? (f.from(employee, today) ?? '') : '' })
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
        const res = await nodApi.lookup(domain)
        if (seq !== lookupSeq) return
        employee = res.employee
        today = res.today
        $('#domain').value = employee.domain
        lookedUp = employee.domain
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
      modes: [...el.querySelectorAll('input[name="mode"]:checked')].map((c) => c.value),
      decision: el.querySelector('input[name="decision"]:checked')?.value ?? '',
      infraction: $('#infraction').value.trim(),
      basis: $('#basis').value.trim(),
    })

    const validate = (v) => {
      if (!employee) return 'Enter a valid DOMAIN to load the employee information.'
      if (!v.modes.length) return 'Select at least one Mode of Service.'
      if (!v.decision) return 'Select a Decision.'
      if (!v.infraction) return 'Infraction Details is required.'
      if (!v.basis) return 'Basis of Decision is required.'
      return null
    }

    const docData = (v) => ({
      caseId: v.caseId,
      associateName: employee.name,
      position: employee.position,
      employeeNo: employee.employee_no,
      formDate: today,
      address: employee.address,
      email: employee.email,
      program: employee.program,
      supervisor: employee.am,
      operationsManager: employee.om,
      hireDate: employee.hire_date,
      modes: v.modes,
      decision: v.decision,
      infraction: v.infraction,
      basis: v.basis,
    })

    const isDirty = () => !submitted && (employee || $('#infraction').value || $('#basis').value || files.files.length)

    const setLocked = (locked) => {
      el.querySelectorAll('input, textarea, button').forEach((c) => {
        if (!['backBtn', 'clearBtn', 'createBtn'].includes(c.id)) c.disabled = locked
      })
      files.setDisabled(locked)
    }

    // ---- Create NOD: generate + download, keep fields ----
    $('#createBtn').addEventListener('click', async () => {
      const v = values()
      const problem = validate(v)
      if (problem) return toast.warning(problem)
      const btn = $('#createBtn')
      setBusy(btn, true, 'Generating…')
      try {
        saveBlob(await generateNodDocx(docData(v)), nodFileName(v.caseId))
        toast.success(`NOD document for ${v.caseId} generated.`)
      } catch (err) {
        toast.error(`Could not generate NOD.docx: ${err.message}`)
      } finally {
        setBusy(btn, false)
      }
    })

    // ---- Clear ----
    $('#clearBtn').addEventListener('click', () => {
      if (busy || (isDirty() && !confirm('Clear all fields and attachments?'))) return
      $('#nodForm').reset()
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
      if (!busy && (!isDirty() || confirm('Leave this page? Unsaved changes will be lost.'))) navigate('nod')
    })

    // ---- Submit: save NOD record, generated document and attachments ----
    $('#nodForm').addEventListener('submit', async (ev) => {
      ev.preventDefault()
      if (busy || submitted) return
      const v = values()
      const problem = validate(v)
      if (problem) return toast.warning(problem)

      busy = true
      const btn = $('#submitBtn')
      setBusy(btn, true, 'Saving NOD…')
      setLocked(true)
      try {
        let res
        try {
          res = await nodApi.create(v)
        } catch (err) {
          if (err.code !== 'duplicate') throw err
          v.caseId = makeCaseId(employee.domain)
          $('#caseId').value = v.caseId
          $('#caseIdText').textContent = v.caseId
          res = await nodApi.create(v)
        }
        submitted = true
        const caseId = res.case.case_id

        setBusy(btn, true, 'Uploading files…')
        const doc = await generateNodDocx(docData(v))
        const docFile = new File([doc], nodFileName(caseId), { type: doc.type })
        const docResult = await uploadFiles(caseId, [docFile], CATEGORY.document, { silent: true })
        const fileResult = await uploadFiles(caseId, files.files, CATEGORY.manager, { silent: true })
        const failed = [...docResult.failed, ...fileResult.failed]

        if (failed.length) toast.warning(`Saved ${caseId}, but some files failed: ${failed.map((f) => `${f.name} (${f.message})`).join(', ')}. You can re-upload them from the case page.`, 9000)
        else toast.success(`NOD ${caseId} submitted successfully.`)
        refreshBell?.()
        navigate(`nod/case/${encodeURIComponent(caseId)}`)
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
