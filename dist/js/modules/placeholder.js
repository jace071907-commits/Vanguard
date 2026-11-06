/** Empty module tab (NOD / PIP for now). */
export const blankModule = (label) => ({
  title: () => label,
  mount(el) {
    el.innerHTML = '<section class="card panel blank-module" aria-label="Empty module"></section>'
  },
})

/** Placeholder page for future features. */
export const comingSoon = (label, description) => ({
  title: () => label,
  mount(el) {
    el.innerHTML = `
      <section class="card panel placeholder">
        <div class="empty-icon">▤</div>
        <h2>${label}</h2>
        <p class="muted">${description}</p>
        <span class="chip">Coming soon</span>
      </section>`
  },
})
