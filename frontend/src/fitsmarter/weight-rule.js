// FitSmarter: one weight rule per exercise type, so every lifter logs the same way. The type comes
// from the catalogue's equipment (exercise.eq), never from a setting that applies to everything:
//   barbell, Smith machine, EZ and trap bar:      the plates on ONE side; the bar is added for you
//   dumbbells & kettlebells:                       the weight of ONE bell (or both, if you chose that)
//   machines (selector or plate-loaded), cables:   the number on the stack / what the machine shows
//   leg press and sleds:                           all the plates you loaded
//   medicine ball, plate, sandbag, landmine…:      the weight of that object
//   assisted machines:                             the assistance (counterweight)
//   bodyweight:                                    reps, plus any added load (belt, vest)
//   bands, balls, rollers, suspension trainers:    nothing to weigh
// openGym keeps storing the total on the bar, so stats, progression and sync are unchanged;
// only what is typed and shown in the weight column is per side.
import { loadKindFor, baseWeightFor } from '../lib/plates.js'
import { exerciseOf } from '../lib/exercises.js'
import { isBellEx } from '../lib/dumbbells.js'

const r2 = v => Math.round(v * 100) / 100
const STACK = new Set(['cable', 'leverage machine'])
const LOADED = new Set(['sled machine'])
const OBJECT = new Set(['medicine ball', 'weight plate', 'sandbag', 'landmine', 'macebell', 'hammer', 'tire'])
const NOTHING = new Set(['band', 'resistance band', 'suspension trainer', 'stability ball', 'bosu ball', 'roller', 'massage ball', 'wheel roller', 'rope'])

/** The rule for one exercise in this profile: { kind, base }.
 *  kind: 'side' | 'bell' | 'bellTotal' | 'stack' | 'loaded' | 'object' | 'assist' | 'bw' | 'none' */
export function weightRule(S, cfg, { bw = false, bells = 'as' } = {}) {
  const eq = exerciseOf(cfg?.id)?.eq || ''
  if (eq === 'assisted') return { kind: 'assist', base: 0 }
  if (bw) return { kind: 'bw', base: 0 }
  if (loadKindFor(S, cfg) === 'pairs') return { kind: 'side', base: baseWeightFor(S, cfg?.id) }
  if (isBellEx(cfg?.id)) return { kind: bells === 'total' ? 'bellTotal' : 'bell', base: 0 }
  if (LOADED.has(eq)) return { kind: 'loaded', base: 0 }
  if (OBJECT.has(eq)) return { kind: 'object', base: 0 }
  if (NOTHING.has(eq)) return { kind: 'none', base: 0 }
  return { kind: 'stack', base: 0 }   // cables, machines, anything else with a number on it
}

/** The weight column for a per-side exercise: shows plates per side, stores bar + 2 × side. */
export function perSideColumn(col, base, unit, t) {
  return {
    ...col,
    hd: t('Per side ({0})', unit),
    view: total => r2(Math.max(0, (Number(total) - base) / 2)),
    store: side => (side === '' || side == null ? side : r2(base + 2 * Number(side))),
  }
}

/** One plain sentence under the set header saying how to enter the weight (null: nothing to say). */
export function ruleText(rule, unit, t) {
  switch (rule.kind) {
    case 'side': return rule.base > 0
      ? t('Enter the plates on ONE side. The {0} {1} bar is added for you.', rule.base, unit)
      : t('Enter the plates on ONE side.')
    case 'bell': return t('Enter the weight of ONE dumbbell (20 in each hand → 20).')
    case 'bellTotal': return t('Enter both dumbbells together (20 in each hand → 40).')
    case 'stack': return t('Machine: enter the number on the weight stack or the machine’s display.')
    case 'loaded': return t('Enter all the plates you loaded, both sides together.')
    case 'object': return t('Enter the weight of the ball, plate or bag you used.')
    case 'assist': return t('Assisted: enter the help (counterweight). Less help means stronger.')
    case 'bw': return t('Bodyweight: log your reps; add weight only if you wear a belt or vest.')
    default: return null
  }
}
