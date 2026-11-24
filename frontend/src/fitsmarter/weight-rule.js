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

/** How to enter the weight, said plainly: { head, detail } (null: nothing to say). The head is
 *  the rule in a few words, the detail a worked example. */
export function ruleParts(rule, unit, t) {
  switch (rule.kind) {
    case 'side': return rule.base > 0
      ? { head: t('Enter the weight of the plates on ONE side'), detail: t('The {0} {1} bar is added for you. 20 on each side → type 20 ({2} {1} in total).', rule.base, unit, 40 + rule.base) }
      : { head: t('Enter the weight of the plates on ONE side'), detail: t('20 on each side → type 20.') }
    case 'bell': return { head: t('Enter the weight of ONE dumbbell'), detail: t('20 in each hand → type 20.') }
    case 'bellTotal': return { head: t('Enter both dumbbells together'), detail: t('20 in each hand → type 40.') }
    case 'stack': return { head: t('Enter the number on the machine'), detail: t('The weight stack where the pin is, or the display. Machine with plates: add up all the plates on it.') }
    case 'loaded': return { head: t('Enter all the plates you loaded'), detail: t('Both sides together, without the sled itself.') }
    case 'object': return { head: t('Enter the weight of what you held'), detail: t('The ball, plate or bag.') }
    case 'assist': return { head: t('Enter the help (counterweight)'), detail: t('Less help means stronger.') }
    case 'bw': return { head: t('Log your reps'), detail: t('Add weight only if you wear a belt or vest.') }
    default: return null
  }
}

/** The total a per-side entry puts on the bar, for the line under the hint. */
export function sideTotalText(rule, total, unit, t) {
  if (rule?.kind !== 'side' || !(Number(total) > 0)) return null
  return t('Last entered: {0} per side + {1} {2} bar = {3} {2} on the bar', r2((Number(total) - rule.base) / 2), rule.base, unit, r2(Number(total)))
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
