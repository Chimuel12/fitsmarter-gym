import { describe, it, expect } from 'vitest'
import { CATALOGUE } from '../lib/exercises.js'
import { rateOf, percentileOf, tierFor, weightAtTop, setValue, muscleTiers, overall, profileOf, TIERS, latestByExercise, overloadTarget, tierIndex } from './tiers.js'

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
    expect(TIERS).toHaveLength(10)
  })
})

describe('the body follows the latest session', () => {
  const W = (date, w, r = 10) => ({ id: date, date, entries: [{ id: bench().id, sets: [{ w, r, done: true }] }] })
  it('uses yesterday\'s 25 kg, not the 70 kg from months ago', () => {
    const S = { unit: 'kg', workouts: [W('2026-11-17', 25), W('2026-06-01', 70)] }
    const map = muscleTiers(S, MAN)
    expect(map.chest.s.w).toBe(25)
    expect(map.chest.tier.id).toBe(tierFor(percentileOf(bench(), 25, MAN)).id)
    expect(tierIndex(map.chest.tier.id)).toBeLessThan(tierIndex(tierFor(percentileOf(bench(), 70, MAN)).id))
    expect(map.chest.trend).toBe('down')
    expect(map.chest.best.s.w).toBe(70)
  })
  it('goes back up when you lift more again', () => {
    const S = { unit: 'kg', workouts: [W('2026-06-01', 70), W('2026-11-17', 25), W('2026-11-18', 30)] }
    const b = latestByExercise(S, MAN)[bench().id]
    expect(b.s.w).toBe(30)
    expect(b.trend).toBe('up')
    expect(b.prev.s.w).toBe(25)
  })
})

describe('progressive overload', () => {
  it('adds a rep until 12, then 2.5 kg on a barbell and back to 8 reps', () => {
    expect(overloadTarget(bench(), { s: { w: 60, r: 9 } })).toEqual({ w: 60, r: 10, why: 'reps' })
    expect(overloadTarget(bench(), { s: { w: 60, r: 12 } })).toEqual({ w: 62.5, r: 8, why: 'weight' })
  })
  it('adds 2 kg on dumbbells', () => {
    const curl = CATALOGUE.find(e => /dumbbell/.test(e.eq || '') && /curl/.test((e.n || '').toLowerCase()))
    expect(overloadTarget(curl, { s: { w: 12, r: 12 } })).toEqual({ w: 14, r: 8, why: 'weight' })
  })
  it('is part of each trained muscle', () => {
    const S = { unit: 'kg', workouts: [{ id: 'a', date: '2026-11-18', entries: [{ id: bench().id, sets: [{ w: 60, r: 12, done: true }] }] }] }
    expect(muscleTiers(S, MAN).chest.next).toEqual({ w: 62.5, r: 8, why: 'weight' })
  })
})

describe('one progression: the plan decides', () => {
  it('shows what the routine would start with, and why', () => {
    const id = bench().id
    const S = { unit: 'kg', routines: [{ id: 'r1', name: 'Push', ex: [{ id, sets: 3, reps: 8, weight: 60 }] }],
      workouts: [{ id: 'w1', date: '2026-11-18', start: '2026-11-18T10:00:00Z', routineId: 'r1', entries: [{ id, rid: 'r1', target: { sets: 3, reps: 8, weight: 60 }, sets: [1, 2, 3].map(() => ({ w: 60, r: 8, done: true })) }] }] }
    const n = muscleTiers(S, MAN).chest.next
    expect(n).toMatchObject({ w: 62.5, r: 8, why: 'plan', kind: 'up', policy: 'linear', routine: 'Push' })
    expect(n.reason[0]).toMatch(/Every rep/)
  })
  it('holds the weight when the reps were missed', () => {
    const id = bench().id
    const S = { unit: 'kg', routines: [{ id: 'r1', name: 'Push', ex: [{ id, sets: 3, reps: 8, weight: 60 }] }],
      workouts: [{ id: 'w1', date: '2026-11-18', start: '2026-11-18T10:00:00Z', routineId: 'r1', entries: [{ id, rid: 'r1', target: { sets: 3, reps: 8, weight: 60 }, sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 6, done: true }, { w: 60, r: 5, done: true }] }] }] }
    expect(muscleTiers(S, MAN).chest.next).toMatchObject({ w: 60, why: 'plan' })
  })
})
