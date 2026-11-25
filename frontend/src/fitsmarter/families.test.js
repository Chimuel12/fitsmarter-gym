import { describe, it, expect } from 'vitest'
import { CATALOGUE } from '../lib/exercises.js'
import { FAMILIES, familyOf } from './families.js'
import { weightAtTop, percentileOf, tierFor } from './tiers.js'

const ex = n => CATALOGUE.find(e => (e.n || '').toLowerCase() === n)
const MAN = { sex: 'm', weight: 80, height: 178, birthYear: 1995 }, WOMAN = { sex: 'f', weight: 64, height: 164, birthYear: 1995 }

describe('one table per movement, from Strength Level', () => {
  it('turns the 1RM standards into 10-rep anchors at the top 90/80/50/20/5 %', () => {
    // hack squat machine, men: 58 / 99 / 152 / 217 / 289 kg 1RM
    expect(FAMILIES.hackMachine.m.slice(1)).toEqual([74.3, 114, 162.8, 216.8])
    expect(FAMILIES.pullup.reps).toBe(true)
  })
  it('rates the sled hack squat on its own table, all plates, no longer 1.6 × the squat', () => {
    expect(familyOf(ex('sled hack squat'))).toMatchObject({ base: 'hackMachine', k: 1, conf: 'direct' })
    expect(tierFor(percentileOf(ex('sled hack squat'), 80, MAN)).id).toBe('silver')
    expect(tierFor(percentileOf(ex('sled hack squat'), 120, MAN)).id).toBe('ruby')
  })
  it('halves a one-leg version of a two-leg machine', () => {
    expect(familyOf(ex('sled 45 degrees one leg press'))).toMatchObject({ base: 'legPressSled', k: 0.5 })
  })
  it('does not rate sled pushes, carries, bands or planks', () => {
    for (const n of ['power sled push', 'farmers walk']) expect(familyOf(ex(n))).toBe(null)
    expect(CATALOGUE.filter(e => /band/.test(e.eq)).every(e => familyOf(e) === null)).toBe(true)
  })
  it('rates a dumbbell press per dumbbell, and a goblet squat by its one bell', () => {
    expect(familyOf(ex('dumbbell bench press'))).toMatchObject({ base: 'dbBench', hand: true })
    expect(familyOf(ex('dumbbell goblet squat'))).toMatchObject({ base: 'goblet', hand: false })
  })
  it('a calf raise on the leg press is a calf raise', () => {
    expect(familyOf(ex('lever seated squat calf raise on leg press machine')).base).toBe('calfMachine')
  })
  it('uses the women\'s own table', () => {
    // bench, women, top 50 %: 51 kg 1RM → 38 kg × 10
    expect(weightAtTop(ex('barbell bench press'), 50, WOMAN)).toBeCloseTo(38.3, 0)
  })
})
