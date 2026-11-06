// Runs synchronously in <head> to apply the saved theme before first paint (prevents a flash of the wrong theme).
(function () {
  try {
    var d = document.documentElement
    var m = localStorage.getItem('vg-mode')
    var a = localStorage.getItem('vg-accent')
    d.dataset.mode = m || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    if (a) d.dataset.accent = a
  } catch (e) { /* storage disabled */ }
})()
