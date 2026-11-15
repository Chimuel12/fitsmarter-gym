// FitSmarter: one weight rule per exercise type, so every lifter logs the same way.
//   barbell (and two-sided plate machines): the plates on ONE side; the bar is added for you
//   dumbbells & kettlebells: the weight of ONE bell
//   machines with a stack, cables, bands: the number on the stack
//   bodyweight: reps (and any added load, e.g. a dip belt)
// openGym keeps storing the total on the bar, so stats, progression and sync are unchanged;
// only what is typed and shown in the weight column is per side.
import { loadKindFor, baseWeightFor } from '../lib/plates.js'

const r2 = v => Math.round(v * 100) / 100

/** The rule for one exercise in this profile: { kind: 'side' | 'bell' | 'stack' | 'bw', base } */
export function weightRule(S, cfg, { bw = false, bells = 'as' } = {}) {
  if (bw) return { kind: 'bw', base: 0 }
  const lk = loadKindFor(S, cfg)
  if (lk === 'pairs') return { kind: 'side', base: baseWeightFor(S, cfg?.id) }
  if (bells === 'each' || bells === 'total') return { kind: 'bell', base: 0 }
  return { kind: 'stack', base: 0 }
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

/** One plain sentence under the set header saying how to enter the weight. */
export function ruleText(rule, unit, t) {
  if (rule.kind === 'side') return rule.base > 0
    ? t('Enter the plates on ONE side. The {0} {1} bar is added for you.', rule.base, unit)
    : t('Enter the plates on ONE side.')
  if (rule.kind === 'bell') return t('Enter the weight of ONE dumbbell (20 in each hand → 20).')
  if (rule.kind === 'bw') return t('Bodyweight: log your reps; add weight only if you wear a belt or vest.')
  return t('Enter the number shown on the weight stack.')
}
