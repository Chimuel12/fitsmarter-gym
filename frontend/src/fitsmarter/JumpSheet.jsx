// FitSmarter: "Diamond? Check the weight". Asked before a set is ticked when it would jump several
// levels (jump-check.js), in place of openGym's own typo question. It says what was logged in the
// exercise's own terms (per side, one dumbbell, the stack). "It's right" ticks the set; "Fix the
// weight" leaves it unticked and takes you to its weight with the field selected.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exerciseOf } from '../lib/exercises.js'
import { exerciseNameFor } from '../lib/i18n-core.js'
import { t } from '../lib/i18n.js'
import { profileOf } from './tiers.js'
import { suspiciousJump } from './jump-check.js'
import { weightRule, ruleParts } from './weight-rule.js'
import { Gem, GemDefs } from './Hub.jsx'

const r2 = v => Math.round(v * 100) / 100
const asked = new Set()   // a set you already said is right is not asked about again

/** What the set means, said the way the exercise is logged. */
export function loggedText(rule, set, unit) {
  const w = Number(set.w) || 0
  switch (rule.kind) {
    case 'side': return t('You entered {0} {1} per side: {2} {1} on the bar in total.', r2((w - rule.base) / 2), unit, r2(w))
    case 'bell': return t('You entered {0} {1} for one dumbbell.', r2(w), unit)
    case 'bellTotal': return t('You entered {0} {1} for both dumbbells together.', r2(w), unit)
    case 'bw': return t('You entered {0} reps with {1} {2} added.', set.r, r2(w), unit)
    default: return t('You entered {0} {1} × {2}.', r2(w), unit, set.r)
  }
}

// The set's weight field: scrolled to, focused and selected, ready to retype.
function focusWeight(idx, i) {
  const scope = document.querySelector(`[data-exidx="${idx}"]`) || document
  const row = scope.querySelectorAll('.setrow, .setrow-side')[i]
  const input = row?.querySelector('input')
  row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  if (input) setTimeout(() => { input.focus(); input.select?.() }, 350)
}

/** Before a set is ticked: true when it asked ("It's right" then runs `onRight`), false to go on. */
export function askJump(idx, i, onRight) {
  const S = useStore.getState().S
  const entry = S.active?.entries?.[idx], set = entry?.sets?.[i]
  if (!set) return false
  const key = `${S.active.start || ''}:${idx}:${i}:${set.w}:${set.r}`
  if (asked.has(key)) return false
  let height = 0
  try { height = Number(localStorage.getItem('fs_height')) || 0 } catch { /* private mode */ }
  const jump = suspiciousJump(S, entry, set, profileOf(S, { height }))
  if (!jump) return false
  asked.add(key)
  const rule = weightRule(S, { id: entry.id }), how = ruleParts(rule, S.unit, t)
  const ex = exerciseOf(entry.id), name = ex ? exerciseNameFor(ex) : entry.id
  useUI.getState().openSheet(close => <div className="fs-sheet fs-jump">
    <GemDefs />
    <div className="fs-jump-gems">{jump.from ? <><Gem tier={jump.from} size={40} /><span>→</span></> : null}<Gem tier={jump.to} size={56} /></div>
    <h2>{t('{0}? Check the weight', jump.to.n)}</h2>
    <p>{jump.from
      ? t('This set takes {0} from {1} straight to {2}. That is rare in one session, and usually a typo.', name, jump.from.n, jump.to.n)
      : t('This set puts {0} at {1} on your first log, the top {2}% of gym-goers. Make sure the weight is right.', name, jump.to.n, jump.to.top)}</p>
    <p className="fs-jump-logged">{loggedText(rule, set, S.unit)}</p>
    {how && <p className="fs-rule"><b>{how.head}</b>{how.detail && <span>{how.detail}</span>}</p>}
    <div className="fs-two">
      <button className="btn fs-primary" onClick={() => { close(); focusWeight(idx, i) }}>{t('Fix the weight')}</button>
      <button className="btn" onClick={() => { close(); onRight?.() }}>{t('It’s right')}</button>
    </div>
  </div>, { kind: 'center' })
  return true
}
