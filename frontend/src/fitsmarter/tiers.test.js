import { describe, it, expect } from 'vitest'
import { CATALOGUE } from '../lib/exercises.js'
import { rateOf, percentileOf, tierFor, weightAtTop, setValue, muscleTiers, overall, profileOf, TIERS } from './tiers.js'

const byName = n => CATALOGUE.find(e => (e.n || '').toLowerCase() === n)
const MAN = { sex: 'm', weight: 80, height: 178, birthYear: 1995 }
const bench = () => byName('barbell bench press')

describe('the reference table (80 kg man, 10 reps)', () => {
  it('rates the catalogue bench press against the bench reference', () => {
    expect(bench()).toBeTruthy()
    expect(rateOf(bench())).toMatchObject({ base: 'bench', k: 1, hand: false })
  })
  it('puts the table weights on their tier boundaries', () => {
    const ex = bench()
    const tier = w => tierFor(percentileOf(ex, w, MAN)).id
    expect(tier(37.5)).toBe('bronze')     // top 90 %
    expect(tier(49)).toBe('silver')       // top 80 %
    expect(tier(67.5)).toBe('ruby')       // top 50 %
    expect(tier(90)).toBe('diamond')      // top 20 %
    expect(tier(116)).toBe('symmetric')   // top 5 %
    expect(tier(30)).toBe('iron')
  })
  it('scales with body weight like the bench table (65 kg → 56, 100 kg → 79 for the top 50 %)', () => {
    expect(weightAtTop(bench(), 50, { ...MAN, weight: 65 })).toBeCloseTo(56, 0)
    expect(weightAtTop(bench(), 50, { ...MAN, weight: 100 })).toBeCloseTo(79, 0)
  })
})

describe('logged sets', () => {
  it('turns weight × reps into a 10-rep equivalent', () => {
    expect(setValue(bench(), { w: 67.5, r: 10 })).toBeCloseTo(67.5, 5)
    expect(setValue(bench(), { w: 60, r: 15 })).toBeGreaterThan(60)
  })
  it('reads lb profiles in kg and a "both together" dumbbell weight as two bells', () => {
    expect(setValue(bench(), { w: 100, r: 10 }, 'lb')).toBeCloseTo(45.36, 1)
    const curl = CATALOGUE.find(e => /dumbbell/.test(e.eq || '') && /curl/.test((e.n || '').toLowerCase()))
    expect(setValue(curl, { w: 40, r: 10 }, 'kg', 'total')).toBeCloseTo(setValue(curl, { w: 20, r: 10 }, 'kg', 'each'), 5)
  })
  it('lights the bench muscles and leaves the legs untrained', () => {
    const S = { unit: 'kg', workouts: [{ date: '2026-11-10', entries: [{ id: bench().id, sets: [{ w: 90, r: 10, done: true }] }] }] }
    const map = muscleTiers(S, MAN)
    expect(map.chest.tier.id).toBe('diamond')
    expect(map.quadriceps).toBeUndefined()
    const o = overall(map)
    expect(o.trained).toBeGreaterThan(0)
    expect(o.balance).toBeLessThan(100)
  })
  it('rates a two-handed dumbbell triceps extension well below the top', () => {
    const ext = CATALOGUE.find(e => (e.n || '').toLowerCase() === 'dumbbell standing triceps extension')
    const tier = tierFor(percentileOf(ext, 20, MAN)).id
    expect(['ruby', 'emerald', 'diamond']).toContain(tier)
  })
  it('reads the lifter from the openGym profile', () => {
    const p = profileOf({ unit: 'lb', sex: 'female', birthYear: 2000, bodyweight: [{ d: '2026-01-01', w: 150 }, { d: '2026-02-01', w: 140 }] }, { height: 170 })
    expect(p).toMatchObject({ sex: 'f', birthYear: 2000, height: 170 })
    expect(p.weight).toBeCloseTo(63.5, 1)
    expect(TIERS).toHaveLength(9)
  })
})
