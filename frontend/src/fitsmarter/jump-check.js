// FitSmarter: a set that would jump you several levels at once is more often a typo than a
// miracle: both sides' plates typed into a per-side column, kilos and pounds mixed up, an extra
// zero. Strength moves a level or two over weeks, not three in a session, so a set three or more
// levels above where you were (on this exercise, else on the muscle, else overall) is checked
// with you before it counts. With nothing to compare against, a first set already at Diamond is.
import { exerciseOf } from '../lib/exercises.js'
import { musclesOf } from '../lib/muscles.js'
import { entryDbLoad } from '../lib/dumbbells.js'
import { TIERS, tierFor, tierIndex, rateOf, setValue, percentileOf, latestByExercise, muscleTiers, overall } from './tiers.js'

export const JUMP = 3
export const FIRST_LIMIT = tierIndex('diamond')

const mainMuscle = id => Object.entries(musclesOf(exerciseOf(id)) || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null

/** Where you stood before this set: { tier, by: 'exercise' | 'muscle' | 'overall' } or null. */
export function baselineOf(S, exId, prof) {
  const ex = latestByExercise(S, prof)[exId]
  if (ex) return { tier: ex.tier, by: 'exercise' }
  const map = muscleTiers(S, prof), m = mainMuscle(exId)
  if (m && map[m]) return { tier: map[m].tier, by: 'muscle' }
  const ov = overall(map)
  return ov ? { tier: ov.tier, by: 'overall' } : null
}

/** null, or { from, to, by } when this set is suspiciously far above where you were. */
export function suspiciousJump(S, entry, set, prof) {
  if (!entry || !set || !rateOf(entry.id) || !(Number(set.r) > 0)) return null
  const v = setValue(entry.id, set, S?.unit || 'kg', entryDbLoad(entry))
  if (!(v > 0)) return null
  const to = tierFor(percentileOf(entry.id, v, prof)), base = baselineOf(S, entry.id, prof)
  const ti = TIERS.indexOf(to)
  if (base ? ti - TIERS.indexOf(base.tier) < JUMP : ti < FIRST_LIMIT) return null
  return { from: base?.tier || null, to, by: base?.by || null }
}
