// FitSmarter strength tiers on top of openGym's history (AGPL-3.0, part of this fork).
//
// Every logged set becomes a 10-rep equivalent and is compared with the table of its movement family
// (families.js: Strength Level's community standards for men and women, at the top 90 / 80 / 50 /
// 20 / 5 %), scaled to the lifter's body weight, age and height. Close variants use a ratio and
// exercises named after nothing known are estimated from their main muscle. Each muscle takes the
// tier of its most recent session (openGym's muscle weights: primary fully, assisting at 60 %).
import { buildPlannedEntry } from '../lib/session-start.js'
import { POLICY_NAME } from '../lib/progression.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { entryDbLoad } from '../lib/dumbbells.js'
import { exerciseOf } from '../lib/exercises.js'
import { musclesOf } from '../lib/muscles.js'
import { FAMILIES, familyOf } from './families.js'

/* ---------- tiers: boundaries from the reference table ---------- */
export const TIERS = [
  { id: 'iron', n: 'Iron', top: 100, c: '#7B828C', c2: '#4A5058' },
  { id: 'bronze', n: 'Bronze', top: 90, c: '#C98B5B', c2: '#7A4A2A' },
  { id: 'silver', n: 'Silver', top: 80, c: '#D9DEE5', c2: '#8B95A3' },
  { id: 'gold', n: 'Gold', top: 65, c: '#F7CF4A', c2: '#B8860B' },
  { id: 'ruby', n: 'Ruby', top: 50, c: '#F25C6B', c2: '#A3162B' },
  { id: 'emerald', n: 'Emerald', top: 35, c: '#43D689', c2: '#127A45' },
  { id: 'diamond', n: 'Diamond', top: 20, c: '#BFEFFF', c2: '#4FB3E8' },
  { id: 'champion', n: 'Champion', top: 10, c: '#C9A6FF', c2: '#7B4DFF' },
  { id: 'symmetric', n: 'Symmetric', top: 5, c: '#7FB2FF', c2: '#2F5BFF' },
  // the best there is: a Greek statue in white marble
  { id: 'olympian', n: 'Olympian', top: 1, c: '#FFFFFF', c2: '#C9BFAE' },
]
export const TIER_TEXT = {
  iron: 'Just starting. Every lifter begins here.',
  bronze: 'Stronger than 1 in 10 gym-goers. Consistency is paying off.',
  silver: 'Stronger than 1 in 5. Solid beginner-to-intermediate strength.',
  gold: 'Above a third of the gym. Clear, steady progress.',
  ruby: 'Better than half the gym: the true middle-to-upper level.',
  emerald: 'Top third. Serious, structured training.',
  diamond: 'Top 20%. Advanced lifter; people notice.',
  champion: 'Top 10%. Years of hard, smart training.',
  symmetric: 'Top 5%. Elite strength for your size, age and sex.',
  olympian: 'Top 1%. A Greek statue: strength very few ever reach.',
}
export const tierFor = pct => [...TIERS].reverse().find(t => 100 - pct <= t.top + 0.05) || TIERS[0]
export const tierIndex = id => Math.max(0, TIERS.findIndex(t => t.id === id))
export const topTxt = pct => { const t = 100 - pct; return t < 1 ? '<1' : String(Math.round(t)) }

/* ---------- the tables: one per movement family (families.js) ---------- */
const Z = [-1.2816, -0.8416, 0, 0.8416, 1.645]
const BASE = FAMILIES
// body-weight scaling from the bench-press reference table (65–100 kg), power law outside it
const BW = [[65, 0.83], [75, 0.948], [80, 1], [90, 1.089], [100, 1.17]]
function bwFactor(bw) {
  if (bw <= 65) return 0.83 * Math.pow(bw / 65, 0.9)
  if (bw >= 100) return 1.17 * Math.pow(bw / 100, 0.7)
  for (let i = 0; i < BW.length - 1; i++) { const [a, fa] = BW[i], [b, fb] = BW[i + 1]; if (bw <= b) return fa + (fb - fa) * (bw - a) / (b - a) }
  return 1
}
const ageFactor = a => !a ? 1 : a < 14 ? 0.7 : a < 23 ? 0.86 + (a - 14) * 0.0156 : a <= 40 ? 1 : Math.max(0.6, 1 - (a - 40) * 0.009)

/* ---------- how an openGym exercise is rated: families.js ---------- */
/** { base, k, hand, conf } for an exercise, or null when it cannot be rated (cardio, stretches…). */
export const rateOf = familyOf
export const isRepsRated = exOrId => !!BASE[rateOf(exOrId)?.base]?.reps

const BELL = /dumbbell|kettlebell/

/* ---------- the lifter ---------- */
const LB = 0.45359237
/** Body weight (kg), sex, age and height from the openGym profile plus FitSmarter's own height. */
export function profileOf(S, extra = {}) {
  const list = Array.isArray(S?.bodyweight) ? S.bodyweight : []
  const last = [...list].filter(b => Number(b?.w) > 0).sort((a, b) => String(a.d).localeCompare(String(b.d))).at(-1)
  const kg = last ? Number(last.w) * (S?.unit === 'lb' ? LB : 1) : 0
  const sex = /^f/i.test(S?.sex || S?.body || '') ? 'f' : 'm'
  return { weight: kg, sex, birthYear: Number(S?.birthYear) || 0, height: Number(extra.height) || 0, unit: S?.unit === 'lb' ? 'lb' : 'kg' }
}

export function standards(exOrId, prof = {}) {
  const r = rateOf(exOrId), b = r && BASE[r.base]
  if (!b) return null
  const fem = prof.sex === 'f', bw = prof.weight || (fem ? 64 : 80), refH = fem ? 164 : 178, h = prof.height || refH
  const age = prof.birthYear ? new Date().getFullYear() - prof.birthYear : 0
  // a family with its own women's table (most): that table, centred on a 64 kg woman; else the men's × fem
  const own = fem && b.f, table = own ? b.f : b.m, refBw = own ? 64 : 80
  const adj = (fem && !own ? b.fem : 1) * ageFactor(age) * Math.pow(h / refH, b.lever)
  return b.reps ? table.map(v => v * adj * Math.pow(refBw / bw, 0.6) * r.k) : table.map(v => v * adj * bwFactor(bw) / bwFactor(refBw) * r.k)
}
const phi = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p }
/** Percentile of a 10-rep-equivalent weight (kg) or a rep count — log-linear between the anchors. */
export function percentileOf(exOrId, value, prof) {
  const st = standards(exOrId, prof)
  if (!st || !(value > 0)) return 0
  const s = st.map(v => Math.max(v, 0.4)), L = s.map(Math.log), x = Math.log(value)
  let i = 0; while (i < 3 && x > L[i + 1]) i++
  const z = Z[i] + (x - L[i]) * (Z[i + 1] - Z[i]) / ((L[i + 1] - L[i]) || 1e-6)
  return Math.max(0.5, Math.min(99.9, phi(z) * 100))
}
const e1rm = (w, r) => (r <= 1 ? w : w * (1 + Math.min(r, 20) / 30))
/** A logged set's rating value: reps for bodyweight exercises, else the 10-rep equivalent in kg. */
export function setValue(exOrId, s, unit = 'kg', dbLoad = 'as') {
  const r = Number(s?.r) || 0
  if (!(r > 0)) return 0
  if (isRepsRated(exOrId)) return r
  let w = Number(s?.w) || 0
  if (!(w > 0)) return 0
  if (unit === 'lb') w *= LB
  // dumbbell standards are per hand: a "both together" weight is two bells
  if (rateOf(exOrId)?.hand && dbLoad === 'total') w /= 2
  return e1rm(w, r) / (1 + 10 / 30)
}
/** 10-rep weight (kg) or reps that reaches the top X % for this lifter. */
export function weightAtTop(exOrId, top, prof) {
  const st = standards(exOrId, prof)
  if (!st) return 0
  const want = 100 - top + 0.05
  let lo = Math.log(0.4), hi = Math.log(Math.max(...st) * 4)
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; percentileOf(exOrId, Math.exp(m), prof) < want ? lo = m : hi = m }
  return Math.exp(hi)
}
export function nextTier(exOrId, pct, prof) {
  const i = TIERS.indexOf(tierFor(pct)) + 1
  if (i >= TIERS.length) return null
  return { tier: TIERS[i], value: weightAtTop(exOrId, TIERS[i].top, prof) }
}

/* ---------- the hub: best rating per exercise and per muscle ---------- */
const doneSet = s => s && (s.done === undefined || s.done) && Number(s.r) > 0
/** Best set per exercise across openGym's workouts: { [exId]: { pct, tier, s, at } } */
export function bestByExercise(S, prof) {
  const out = {}
  for (const w of S?.workouts || []) for (const e of w.entries || []) {
    if (!rateOf(e.id)) continue
    const dbLoad = entryDbLoad(e)
    for (const s of e.sets || []) {
      if (!doneSet(s)) continue
      const v = setValue(e.id, s, S.unit, dbLoad)
      if (v > 0 && (!out[e.id] || v > out[e.id].v)) out[e.id] = { v, s, at: w.date || w.d || w.start || null, dbLoad }
    }
  }
  for (const [id, b] of Object.entries(out)) { b.pct = percentileOf(id, b.v, prof); b.tier = tierFor(b.pct) }
  return out
}
/* ---------- the latest picture, not the all-time best ---------- */
// A body that shows what you lift now: each exercise is rated by its most recent session (its best
// set that day), so 25 kg yesterday replaces 35 kg months ago, levels and muscle size included.
// The previous session and the all-time record ride along for the trend and the progression.
const whenOf = w => { const t = Date.parse(w?.start) || Number(w?.start) || Date.parse(w?.date) || Date.parse(w?.d); return Number.isFinite(t) ? t : 0 }
export function latestByExercise(S, prof) {
  const sessions = {}
  const ws = [...(S?.workouts || [])].sort((a, b) => whenOf(a) - whenOf(b))
  for (const w of ws) for (const e of w.entries || []) {
    if (!rateOf(e.id)) continue
    const dbLoad = entryDbLoad(e)
    const done = (e.sets || []).filter(doneSet)
    if (!done.length) continue
    let top = null
    for (const s of done) { const v = setValue(e.id, s, S.unit, dbLoad); if (v > 0 && (!top || v > top.v)) top = { v, s } }
    if (!top) continue
    ;(sessions[e.id] = sessions[e.id] || []).push({ ...top, at: whenOf(w), sets: done, dbLoad })
  }
  const out = {}
  for (const [id, list] of Object.entries(sessions)) {
    const last = list[list.length - 1], prev = list.length > 1 ? list[list.length - 2] : null
    const best = list.reduce((b, x) => (x.v > b.v ? x : b), list[0])
    out[id] = { ...last, prev, best, pct: percentileOf(id, last.v, prof), tier: tierFor(percentileOf(id, last.v, prof)),
      trend: prev ? (last.v > prev.v * 1.005 ? 'up' : last.v < prev.v * 0.995 ? 'down' : 'flat') : null,
      change: prev ? Math.round((last.v / prev.v - 1) * 1000) / 10 : null }
  }
  return out
}
/** Muscle → { pct, tier, ex, s, prim, at, trend, change, next } from each muscle's most recent session.
 *  The exercises that work it as a main mover decide; one that only assists counts when nothing
 *  else has trained it, at 60 %. Of two sessions, the later one; on the same day, the stronger. */
export function muscleTiers(S, prof, { cap = true } = {}) {
  const latest = latestByExercise(S, prof), out = {}
  for (const [id, b] of Object.entries(latest)) {
    for (const [m, wgt] of Object.entries(musclesOf(exerciseOf(id)) || {})) {
      const prim = wgt >= 0.75, pct = prim ? b.pct : b.pct * 0.6
      const cur = out[m]
      const better = !cur || (prim && !cur.prim) || (prim === cur.prim && (b.at > cur.at || (b.at === cur.at && pct > cur.pct)))
      if (better) out[m] = { pct, tier: tierFor(pct), ex: id, s: b.s, prim, at: b.at, trend: b.trend, change: b.change, best: b.best, prev: b.prev,
        bestPct: b.best ? percentileOf(id, b.best.v, prof) * (prim ? 1 : 0.6) : pct,
        next: planTarget(S, id) || overloadTarget(id, b, S.unit) }
    }
  }
  return cap ? balanceCap(out) : out
}

/* ---------- balance: no Diamond chest on Silver legs ---------- */
// Strength is built by the whole body, not muscle by muscle: the big lifts load the legs, back and
// trunk together, a weak link limits what the strong ones can show (a bench needs leg drive and a
// stable back), and lifters who train for years end up within a couple of levels everywhere.
// So a muscle can be at most GAP levels above the weakest trained region (push, pull, legs, core).
// A region with nothing logged yet holds nothing back. Muscle memory: a region keeps credit for the
// level it once reached, one below its record, because detrained muscle keeps its extra nuclei and
// gets strength back far faster than the first time. The small muscles follow the cap but do not
// set it. The real level stays in `raw`.
export const GAP = 3
export const REGIONS = {
  push: ['chest', 'front-delts', 'triceps'],
  pull: ['lats', 'upper-back', 'biceps'],
  legs: ['quadriceps', 'hamstring', 'gluteal', 'calves'],
  core: ['abs', 'obliques', 'lower-back'],
}
const lvl = pct => TIERS.indexOf(tierFor(pct))
/** Each region's level: the mean of its trained muscles (record minus one counts), null if none. */
export function regionLevels(map) {
  return Object.fromEntries(Object.entries(REGIONS).map(([k, ms]) => {
    const v = ms.filter(m => map[m]).map(m => { const r = map[m]; return Math.max(lvl(r.raw?.pct ?? r.pct), lvl(r.bestPct ?? r.pct) - 1) })
    return [k, v.length ? Math.floor(v.reduce((a, b) => a + b, 0) / v.length) : null]
  }))
}
/** The map with every muscle held to the weakest region + GAP; `capped` says by which region. */
export function balanceCap(map) {
  const trained = Object.entries(regionLevels(map)).filter(([, v]) => v !== null).sort((a, b) => a[1] - b[1])
  if (trained.length < 2) return map   // one region alone has nothing to be out of balance with
  const [weak, low] = trained[0]
  const max = Math.min(TIERS.length - 1, low + GAP), out = {}
  for (const [m, r] of Object.entries(map)) {
    if (lvl(r.pct) <= max) { out[m] = r; continue }
    const pct = 100 - TIERS[max].top
    out[m] = { ...r, pct, tier: TIERS[max], raw: { pct: r.pct, tier: r.tier }, capped: { by: weak, at: TIERS[low], max: TIERS[max] } }
  }
  return out
}

/* ---------- progressive overload ---------- */
// One progression, the plan's: when the exercise is in a routine, the target is exactly what
// starting that routine would put on the first work set (lib/session-start.js, with the rule the
// exercise has in the routine: linear by default, or double, Greyskull, …), and its reason.
// Only an exercise in no routine falls back to the double progression below.
export function planTarget(S, exId) {
  const routines = (S?.routines || []).filter(r => (r?.ex || []).some(c => c?.id === exId))
  if (!routines.length) return null
  const lastRid = [...(S?.workouts || [])].reverse().flatMap(w => (w.entries || []).filter(e => e.id === exId).map(e => e.rid || w.routineId)).find(Boolean)
  const r = routines.find(x => x.id === lastRid) || routines[0]
  try {
    const cfg = r.ex.find(c => c?.id === exId)
    const e = buildPlannedEntry(S, cfg, r)
    const set = (e?.sets || []).find(s => !isWarmupRow(s)) || e?.sets?.[0]
    if (!set) return null
    const plan = e.plan || {}
    return { w: Number(set.w) || 0, r: Number(set.r) || null, sec: set.sec || null, why: 'plan', kind: plan.kind || 'hold',
      reason: Array.isArray(plan.why) ? plan.why : null, policy: plan.policy || 'off', policyName: POLICY_NAME[plan.policy] || null, routine: r.name || '' }
  } catch { return null }
}

// Double progression in a 6 to 12 rep range: add a rep each session at the same weight; once the
// top set reaches 12, add the smallest sensible step and drop back to 8. Body-weight lifts add reps.
export const REP_LOW = 8, REP_HIGH = 12
export function weightStep(exOrId, unit = 'kg') {
  const eq = (typeof exOrId === 'string' ? exerciseOf(exOrId) : exOrId)?.eq || ''
  if (unit === 'lb') return BELL.test(eq) ? 5 : /barbell|ez|smith|trap/.test(eq) ? 5 : 10
  return BELL.test(eq) ? 2 : /barbell|ez|smith|trap/.test(eq) ? 2.5 : 5
}
/** What to aim for next time from a session { s: its top set }: { w, r, why: 'reps' | 'weight' }. */
export function overloadTarget(exOrId, session, unit = 'kg') {
  const s = session?.s
  if (!s) return null
  const w = Number(s.w) || 0, r = Number(s.r) || 0
  if (isRepsRated(exOrId) || !w) return { w, r: r + 1, why: 'reps' }
  if (r >= REP_HIGH) return { w: Math.round((w + weightStep(exOrId, unit)) * 100) / 100, r: REP_LOW, why: 'weight' }
  return { w, r: r + 1, why: 'reps' }
}

const MAJORS = ['chest', 'front-delts', 'lats', 'upper-back', 'biceps', 'triceps', 'quadriceps', 'hamstring', 'gluteal', 'abs', 'calves']
/** Overall level, balance and strongest/weakest across the major groups. */
export function overall(map) {
  const v = MAJORS.map(m => map[m]?.pct || 0), trained = v.filter(x => x > 0)
  if (!trained.length) return null
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length)
  const weakest = MAJORS.map(m => [m, map[m]?.pct || 0]).sort((a, b) => a[1] - b[1])[0][0]
  return { pct: mean, tier: tierFor(mean), balance: Math.max(0, Math.round(100 - sd * 1.6)), trained: trained.length, total: MAJORS.length, weakest }
}
