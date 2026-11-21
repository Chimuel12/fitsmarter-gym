// FitSmarter strength tiers on top of openGym's history (AGPL-3.0, part of this fork).
//
// Every logged set becomes a 10-rep equivalent and is compared with reference 10-rep weights for
// active gym-goers: an 80 kg man at the top 90 / 80 / 50 / 20 / 5 %, scaled to the lifter's body
// weight, sex, age and height. Variations and machines are rated against the closest base lift
// with a ratio, so they are estimates. Each muscle takes the tier of its best exercise
// (openGym's own muscle weights: primary muscles fully, assisting ones at 60 %).
import { buildPlannedEntry } from '../lib/session-start.js'
import { POLICY_NAME } from '../lib/progression.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { entryDbLoad } from '../lib/dumbbells.js'
import { exerciseOf } from '../lib/exercises.js'
import { musclesOf } from '../lib/muscles.js'

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
}
export const tierFor = pct => [...TIERS].reverse().find(t => 100 - pct <= t.top + 0.05) || TIERS[0]
export const tierIndex = id => Math.max(0, TIERS.findIndex(t => t.id === id))
export const topTxt = pct => { const t = 100 - pct; return t < 1 ? '<1' : String(Math.round(t)) }

/* ---------- reference 10-rep weights, 80 kg man (top 90 / 80 / 50 / 20 / 5 %) ---------- */
const Z = [-1.2816, -0.8416, 0, 0.8416, 1.645]
const BASE = {
  bench: { m: [37.5, 49, 67.5, 90, 116], fem: 0.55, lever: -0.25 },
  squat: { m: [49, 71, 94, 124, 154], fem: 0.68, lever: -0.15 },
  deadlift: { m: [60, 86, 112.5, 146, 180], fem: 0.68, lever: 0.2 },
  ohp: { m: [24, 34, 43.5, 56, 71], fem: 0.55, lever: -0.25 },
  row: { m: [34, 45, 60, 79, 101], fem: 0.58, lever: 0 },
  curl: { m: [16.5, 22.5, 31.5, 41, 52.5], fem: 0.55, lever: 0 },
  pullup: { m: [1, 3, 8, 14, 20], fem: 0.3, reps: true, lever: -0.3 },
  pushup: { m: [8, 15, 28, 42, 55], fem: 0.45, reps: true, lever: -0.2 },
  dip: { m: [3, 8, 15, 24, 32], fem: 0.4, reps: true, lever: -0.2 },
  legraise: { m: [3, 6, 12, 18, 25], fem: 0.7, reps: true, lever: 0 },
  bwlegs: { m: [10, 15, 25, 35, 50], fem: 0.85, reps: true, lever: 0 },
}
// body-weight scaling from the bench-press reference table (65–100 kg), power law outside it
const BW = [[65, 0.83], [75, 0.948], [80, 1], [90, 1.089], [100, 1.17]]
function bwFactor(bw) {
  if (bw <= 65) return 0.83 * Math.pow(bw / 65, 0.9)
  if (bw >= 100) return 1.17 * Math.pow(bw / 100, 0.7)
  for (let i = 0; i < BW.length - 1; i++) { const [a, fa] = BW[i], [b, fb] = BW[i + 1]; if (bw <= b) return fa + (fb - fa) * (bw - a) / (b - a) }
  return 1
}
const ageFactor = a => !a ? 1 : a < 14 ? 0.7 : a < 23 ? 0.86 + (a - 14) * 0.0156 : a <= 40 ? 1 : Math.max(0.6, 1 - (a - 40) * 0.009)

/* ---------- how an openGym exercise is rated ---------- */
// (regex on the name, base lift, ratio with a bar/machine, ratio per dumbbell)
const RULES = [
  [/bench press|floor press|board press|pin press/, 'bench', 1, 0.37], [/decline.*press/, 'bench', 1.05, 0.38], [/incline.*press/, 'bench', 0.84, 0.33],
  [/chest press/, 'bench', 1, 0.37], [/\bfly\b|flye|crossover|pec deck|butterfly/, 'bench', 0.5, 0.16], [/pullover/, 'row', 0.6, 0.3],
  [/front squat/, 'squat', 0.8, 0.3], [/hack squat|leg press|sled/, 'squat', 1.6, 0.3], [/squat/, 'squat', 1, 0.3], [/lunge|split squat|step.?up/, 'squat', 0.55, 0.25],
  [/romanian|stiff.?leg|good morning/, 'deadlift', 0.75, 0.35], [/deadlift|rack pull/, 'deadlift', 1, 0.4], [/hip thrust|glute bridge/, 'squat', 1.1, 0.4],
  [/military|overhead press|shoulder press|push press|arnold/, 'ohp', 1, 0.42], [/upright row/, 'ohp', 0.9, 0.35],
  [/lateral raise|front raise|rear delt|reverse fl/, 'curl', 0.7, 0.3], [/shrug/, 'deadlift', 0.8, 0.35],
  [/pulldown|pull.?down/, 'row', 1, 0.45], [/\brow\b|rows/, 'row', 1, 0.48],
  [/leg extension/, 'squat', 0.6, 0.2], [/leg curl/, 'squat', 0.45, 0.2], [/calf/, 'squat', 1, 0.35],
  [/hammer curl/, 'curl', 1, 0.48], [/curl/, 'curl', 1, 0.45],
  // a kickback is one arm; an overhead or lying dumbbell extension holds one bell with both hands
  [/kickback/, 'curl', 1, 0.25], [/pushdown|push.?down|skull|triceps? (extension|press)|french press/, 'curl', 1, 0.6], [/close.?grip.*bench/, 'bench', 0.9, 0.35],
  [/crunch|twist|wood ?chop|ab roll/, 'bench', 0.5, 0.2], [/hyperextension|back extension/, 'deadlift', 0.45, 0.2], [/adduct|abduct/, 'squat', 0.7, 0.3],
]
const BW_RULES = [[/pull.?ups?|chin.?ups?/, 'pullup'], [/\bdips?\b/, 'dip'], [/push.?ups?/, 'pushup'], [/leg raise|knee raise|crunch|sit.?up|v.?up|jackknife/, 'legraise'], [/squat|lunge|step.?up|pistol/, 'bwlegs']]
const FALLBACK = { chest: ['bench', 0.5], 'front-delts': ['ohp', 0.6], 'side-delts': ['curl', 0.5], 'rear-delts': ['curl', 0.5], lats: ['row', 0.8], 'upper-back': ['row', 0.8],
  biceps: ['curl', 0.8], triceps: ['curl', 0.9], forearm: ['curl', 0.7], trapezius: ['deadlift', 0.6], 'lower-back': ['deadlift', 0.45], quadriceps: ['squat', 0.7],
  hamstring: ['squat', 0.45], gluteal: ['squat', 0.8], calves: ['squat', 0.9], adductors: ['squat', 0.6], abs: ['bench', 0.4], obliques: ['bench', 0.4] }
const BW_FALLBACK = { abs: 'legraise', obliques: 'legraise', quadriceps: 'bwlegs', gluteal: 'bwlegs', hamstring: 'bwlegs', calves: 'bwlegs', chest: 'pushup', triceps: 'dip', lats: 'pullup', biceps: 'pullup' }
const BELL = /dumbbell|kettlebell/
const isBodyweight = eq => /body ?weight|bodyweight|assisted|band/.test(eq || '')

const RATE = new Map()
/** { base, k, hand } for an exercise, or null when it cannot be rated (cardio, stretches…). */
export function rateOf(exOrId) {
  const ex = exerciseOf(exOrId)
  if (!ex) return null
  if (RATE.has(ex)) return RATE.get(ex)
  const name = (ex.n || '').toLowerCase(), eq = (ex.eq || '').toLowerCase()
  const mus = Object.entries(musclesOf(ex)).sort((a, b) => b[1] - a[1]).map(([m]) => m)
  let r = null
  if (ex.bp !== 'cardio' && !/stretch|mobility|foam|roll/.test(name) && mus.length) {
    if (isBodyweight(eq)) {
      const base = (BW_RULES.find(([re]) => re.test(name)) || [])[1] || BW_FALLBACK[mus[0]]
      if (base) r = { base, k: 1, hand: false }
    } else {
      const bell = BELL.test(eq), rule = RULES.find(([re]) => re.test(name))
      const [base, k] = rule ? [rule[1], bell ? rule[3] : rule[2]] : FALLBACK[mus[0]] ? [FALLBACK[mus[0]][0], FALLBACK[mus[0]][1] * (bell ? 0.45 : 1)] : [null, 0]
      if (base) r = { base, k: eq.includes('cable') && rule ? k * 0.9 : k, hand: bell }
    }
  }
  RATE.set(ex, r)
  return r
}
export const isRepsRated = exOrId => !!BASE[rateOf(exOrId)?.base]?.reps

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
  const fem = prof.sex === 'f', bw = prof.weight || (fem ? 62 : 80), refH = fem ? 164 : 178, h = prof.height || refH
  const age = prof.birthYear ? new Date().getFullYear() - prof.birthYear : 0
  const adj = (fem ? b.fem : 1) * ageFactor(age) * Math.pow(h / refH, b.lever)
  return b.reps ? b.m.map(v => v * adj * Math.pow(80 / bw, 0.6) * r.k) : b.m.map(v => v * adj * bwFactor(bw) * r.k)
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
export function muscleTiers(S, prof) {
  const latest = latestByExercise(S, prof), out = {}
  for (const [id, b] of Object.entries(latest)) {
    for (const [m, wgt] of Object.entries(musclesOf(exerciseOf(id)) || {})) {
      const prim = wgt >= 0.75, pct = prim ? b.pct : b.pct * 0.6
      const cur = out[m]
      const better = !cur || (prim && !cur.prim) || (prim === cur.prim && (b.at > cur.at || (b.at === cur.at && pct > cur.pct)))
      if (better) out[m] = { pct, tier: tierFor(pct), ex: id, s: b.s, prim, at: b.at, trend: b.trend, change: b.change, best: b.best, prev: b.prev,
        next: planTarget(S, id) || overloadTarget(id, b, S.unit) }
    }
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
