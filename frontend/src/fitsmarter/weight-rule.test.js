import { describe, it, expect } from 'vitest'
import { CATALOGUE } from '../lib/exercises.js'
import { weightRule, ruleText } from './weight-rule.js'
import { dbLoadFor, entryDbLoad, volumeFactor } from '../lib/dumbbells.js'

const find = (eq, re) => CATALOGUE.find(e => e.eq === eq && re.test((e.n || '').toLowerCase()))
const rule = ex => weightRule({ unit: 'kg' }, { id: ex.id }, { bells: dbLoadFor({}, ex.id) }).kind
const t = (s, ...a) => a.reduce((x, v, i) => x.replace(`{${i}}`, v), s)

describe('the weight to log matches the equipment', () => {
  it('asks a machine for its stack, never for a dumbbell', () => {
    for (const ex of [find('leverage machine', /chest press|press/), find('cable', /fly|row|pushdown|curl/)]) {
      expect(ex).toBeTruthy()
      expect(dbLoadFor({}, ex.id)).toBe('as')
      expect(rule(ex)).toBe('stack')
      expect(ruleText({ kind: rule(ex) }, 'kg', t)).toMatch(/stack/)
    }
  })
  it('asks dumbbells for one bell, a barbell for one side, a leg press for all plates', () => {
    expect(rule(find('dumbbell', /curl/))).toBe('bell')
    expect(rule(find('barbell', /bench press/))).toBe('side')
    expect(rule(find('sled machine', /leg press/))).toBe('loaded')
    expect(rule(find('assisted', /pull|chin|dip/))).toBe('assist')
    expect(rule(find('medicine ball', /./))).toBe('object')
  })
  it('has nothing to weigh for bands and rollers', () => {
    expect(ruleText({ kind: rule(find('roller', /./)) }, 'kg', t)).toBe(null)
  })
  it('reads an old "each" stamp on a machine as entered, so its volume is not doubled', () => {
    const m = find('leverage machine', /press/)
    const entry = { id: m.id, target: { dbLoad: 'each' } }
    expect(entryDbLoad(entry)).toBe('as')
    expect(volumeFactor(entry)).toBe(1)
    const d = find('dumbbell', /curl/)
    expect(volumeFactor({ id: d.id, target: { dbLoad: 'each' } })).toBe(2)
  })
  it('gives every catalogue exercise a rule', () => {
    const kinds = {}
    for (const e of CATALOGUE) { const k = rule(e); kinds[k] = (kinds[k] || 0) + 1 }
    expect(Object.keys(kinds).every(k => ['side', 'bell', 'bellTotal', 'stack', 'loaded', 'object', 'assist', 'bw', 'none'].includes(k))).toBe(true)
    expect(kinds.bell).toBe(CATALOGUE.filter(e => e.eq === 'dumbbell' || e.eq === 'kettlebell').length)
  })
})

describe('the hint card', async () => {
  const { ruleParts, sideTotalText } = await import('./weight-rule.js')
  const t = (s, ...a) => s.replace(/\{(\d)\}/g, (_, i) => a[i])
  it('says per side for a barbell, with the bar and an example', () => {
    const p = ruleParts({ kind: 'side', base: 20 }, 'kg', t)
    expect(p.head).toBe('Enter the weight of the plates on ONE side')
    expect(p.detail).toContain('20 kg bar is added')
    expect(p.detail).toContain('60 kg in total')
    expect(sideTotalText({ kind: 'side', base: 20 }, 100, 'kg', t)).toBe('Last entered: 40 per side + 20 kg bar = 100 kg on the bar')
  })
  it('says the number on the machine for a machine', () => {
    expect(ruleParts({ kind: 'stack', base: 0 }, 'kg', t).head).toBe('Enter the number on the machine')
  })
})
