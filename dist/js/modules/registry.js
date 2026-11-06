import nteDashboard from './nte/dashboard.js'
import nteCreate from './nte/create.js'
import nteCase from './nte/case.js'
import nodDashboard from './nod/dashboard.js'
import nodCreate from './nod/create.js'
import nodCase from './nod/case.js'
import pipDashboard from './pip/dashboard.js'
import pipCreate from './pip/create.js'
import pipCase from './pip/case.js'
import profile from './profile.js'
import { comingSoon } from './placeholder.js'

const ALL = ['associate', 'manager']
const MANAGER = ['manager']

/** Main module tabs (top bar). */
export const TABS = [
  { id: 'nte', label: 'Notice to Explain', short: 'NTE', home: 'nte' },
  { id: 'nod', label: 'Notice of Decision', short: 'NOD', home: 'nod' },
  { id: 'pip', label: 'Performance Improvement Plan', short: 'PIP', home: 'pip' },
]

/**
 * Sidebar menu per portal. `keys` = route `nav` keys that highlight the item.
 * `route: 'tab-home'` links to the dashboard of the currently selected tab.
 */
export const NAV = {
  manager: [
    { group: 'Corrective Actions', items: [
      { route: 'tab-home', label: 'Dashboard', icon: '◫', keys: ['nte-home', 'nod-home', 'pip-home'] },
      { route: 'nte/create', label: 'Create NTE', icon: '✎', keys: ['nte/create'] },
      { route: 'nod/create', label: 'Create NOD', icon: '⚖', keys: ['nod/create'] },
      { route: 'pip/create', label: 'Create PIP', icon: '◎', keys: ['pip/create'] },
      { route: 'reports', label: 'View Reports', icon: '▤', keys: ['reports'] },
    ] },
    { group: 'Account', items: [{ route: 'profile', label: 'My Profile', icon: '☺', keys: ['profile'] }] },
  ],
  associate: [
    { group: 'My Cases', items: [
      { route: 'nte', label: 'My NTE Cases', icon: '✉', keys: ['nte-home'] },
      { route: 'nod', label: 'My NOD Cases', icon: '⚖', keys: ['nod-home'] },
      { route: 'pip', label: 'My PIP Cases', icon: '◎', keys: ['pip-home'] },
    ] },
    { group: 'Account', items: [{ route: 'profile', label: 'My Profile', icon: '☺', keys: ['profile'] }] },
  ],
}

/**
 * Routes. `view` = { title(ctx), mount(el, ctx) -> optional cleanup }.
 * `portals` is enforced on every navigation (after the server re-validates the session).
 */
export const ROUTES = [
  { path: 'nte', tab: 'nte', nav: 'nte-home', portals: ALL, view: nteDashboard },
  { path: 'nte/create', tab: 'nte', nav: 'nte/create', portals: MANAGER, view: nteCreate },
  { path: 'nte/case/:id', tab: 'nte', nav: 'nte-home', portals: ALL, view: nteCase },

  { path: 'nod', tab: 'nod', nav: 'nod-home', portals: ALL, view: nodDashboard },
  { path: 'nod/create', tab: 'nod', nav: 'nod/create', portals: MANAGER, view: nodCreate },
  { path: 'nod/case/:id', tab: 'nod', nav: 'nod-home', portals: ALL, view: nodCase },

  { path: 'pip', tab: 'pip', nav: 'pip-home', portals: ALL, view: pipDashboard },
  { path: 'pip/create', tab: 'pip', nav: 'pip/create', portals: MANAGER, view: pipCreate },
  { path: 'pip/case/:id', tab: 'pip', nav: 'pip-home', portals: ALL, view: pipCase },

  { path: 'reports', tab: null, nav: 'reports', portals: MANAGER, view: comingSoon('View Reports', 'Corrective action reporting and analytics will be available in a future release.') },
  { path: 'nte/reports', tab: null, nav: 'reports', portals: MANAGER, view: comingSoon('View Reports', 'Corrective action reporting and analytics will be available in a future release.') },
  { path: 'profile', tab: null, nav: 'profile', portals: ALL, view: profile },
]

export function matchRoute(path) {
  const parts = path.split('/').filter(Boolean)
  for (const route of ROUTES) {
    const pattern = route.path.split('/')
    if (pattern.length !== parts.length) continue
    const params = {}
    const ok = pattern.every((seg, i) => {
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = decodeURIComponent(parts[i])
        return true
      }
      return seg === parts[i]
    })
    if (ok) return { route, params }
  }
  return null
}
