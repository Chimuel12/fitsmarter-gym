// FitSmarter: what changed since you last looked — each muscle's level up or down, for the Body
// animations and the note after a workout. "Last looked" is this device's memory (localStorage).
import { tierIndex, TIERS, muscleTiers, profileOf } from './tiers.js'

const KEY = 'fs_muscle_seen'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
/** slug → tier index (−1 untrained) for a muscle map. */
export const levelsOf = map => Object.fromEntries(Object.entries(map).map(([m, r]) => [m, tierIndex(r.tier.id)]))
/** [{ slug, dir: 'up' | 'down', from, to }] against what was seen last; nothing the first time. */
export function changesSince(map, seen = read()) {
  if (!seen) return []
  const now = levelsOf(map), out = []
  for (const m of new Set([...Object.keys(now), ...Object.keys(seen)])) {
    const a = seen[m] ?? -1, b = now[m] ?? -1
    if (a !== b) out.push({ slug: m, dir: b > a ? 'up' : 'down', from: TIERS[a] || null, to: TIERS[b] || null })
  }
  return out.sort((x, y) => (x.dir === y.dir ? 0 : x.dir === 'up' ? -1 : 1))
}
export const markSeen = map => { try { localStorage.setItem(KEY, JSON.stringify(levelsOf(map))) } catch { /* private */ } }
/** The changes the store's state would show on Body now (for the note after a workout). */
export function pendingChanges(S) {
  let height = 0
  try { height = Number(localStorage.getItem('fs_height')) || 0 } catch { /* */ }
  return changesSince(muscleTiers(S, profileOf(S, { height })))
}

/** After a workout is saved: a note with what moved, and a tap to see it on Body. */
let watching = false
export function watchFinishes({ useStore, useUI, navigate, t }) {
  if (watching) return
  watching = true
  let count = (useStore.getState().S?.workouts || []).length
  useStore.subscribe(st => {
    const n = (st.S?.workouts || []).length
    if (n <= count) { count = n; return }
    count = n
    if (st.S?.active) return
    setTimeout(() => {
      const c = pendingChanges(useStore.getState().S)
      if (!c.length) return
      const up = c.filter(x => x.dir === 'up').length, down = c.length - up
      const msg = up && down ? t('▲ {0} up · ▼ {1} down', up, down) : up ? t('▲ {0} muscles level up!', up) : t('▼ {0} muscles dropped a level', down)
      useUI.getState().toast(msg, { action: t('See Body'), onAction: () => navigate('/body'), ms: 6000 })
    }, 1500)
  })
}
