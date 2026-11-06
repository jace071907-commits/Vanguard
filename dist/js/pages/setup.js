import { api } from '../core/api.js'
import { applyStoredTheme, mountThemeControls } from '../core/theme.js'
import { flushQueuedToast, queueToast, toast } from '../core/toast.js'
import { PAGES, logout, requireSession, session } from '../core/session.js'
import { $, bindPasswordToggles, setBusy, showError } from '../core/ui.js'
import { PASSWORD_RULES, validateEmail, validatePassword } from '../core/validation.js'

applyStoredTheme()
mountThemeControls()
bindPasswordToggles()

const state = await requireSession('setup')
document.body.classList.remove('guarded')
flushQueuedToast()

$('#userName').textContent = state.profile.name || state.profile.domain
$('#cancelBtn').addEventListener('click', () => logout('Account setup cancelled.'))
goToStep(state.needs_password ? 1 : 2)

function goToStep(step) {
  $('#passwordForm').hidden = step !== 1
  $('#emailForm').hidden = step !== 2
  document.querySelectorAll('.stepper [data-step]').forEach((li) => {
    const n = Number(li.dataset.step)
    li.classList.toggle('active', n === step)
    li.classList.toggle('done', n < step)
  })
  document.querySelector('.step-line').classList.toggle('done', step > 1)
  ;(step === 1 ? $('#newPw') : $('#email')).focus()
}

function handleError(err, errorEl) {
  if (err.code === 'no_session') {
    session.clear()
    queueToast('warning', err.message)
    window.location.replace(PAGES.login)
    return
  }
  showError(errorEl, err.message)
  toast[err.code === 'network' ? 'error' : 'warning'](err.message)
}

// ---- Step 1: password ----
const rulesEl = $('#pwRules')
const renderRules = () => {
  const pw = $('#newPw').value
  const confirm = $('#confirmPw').value
  rulesEl.innerHTML = [
    ...PASSWORD_RULES.map((r) => `<li class="${r.test(pw) ? 'ok' : ''}">${r.label}</li>`),
    `<li class="${pw && pw === confirm ? 'ok' : ''}">Passwords match</li>`,
  ].join('')
}
$('#newPw').addEventListener('input', renderRules)
$('#confirmPw').addEventListener('input', renderRules)
renderRules()

$('#passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const errorEl = $('#pwError')
  const problem = validatePassword($('#newPw').value, $('#confirmPw').value)
  if (problem) {
    showError(errorEl, problem)
    toast.warning(problem)
    return
  }
  showError(errorEl)
  const btn = $('#pwBtn')
  setBusy(btn, true, 'Saving…')
  try {
    const res = await api.setPassword(session.token(), $('#newPw').value)
    toast.success('Password updated successfully.')
    if (res.needs_email) goToStep(2)
    else finish()
  } catch (err) {
    handleError(err, errorEl)
  } finally {
    setBusy(btn, false)
  }
})

// ---- Step 2: email ----
$('#emailForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const errorEl = $('#emailError')
  const email = $('#email').value.trim().toLowerCase()
  const problem = validateEmail(email)
  if (problem) {
    showError(errorEl, problem)
    toast.warning(problem)
    return
  }
  showError(errorEl)
  const btn = $('#emailBtn')
  setBusy(btn, true, 'Saving…')
  try {
    await api.registerEmail(session.token(), email)
    finish()
  } catch (err) {
    handleError(err, errorEl)
    setBusy(btn, false)
  }
})

function finish() {
  $('#passwordForm').hidden = true
  $('#emailForm').hidden = true
  $('#cancelBtn').hidden = true
  $('#doneView').hidden = false
  document.querySelectorAll('.stepper [data-step]').forEach((li) => li.classList.add('done'))
  document.querySelector('.step-line').classList.add('done')
  toast.success('Account Successfully Created')
  setTimeout(() => window.location.replace(PAGES.app), 2200)
}
