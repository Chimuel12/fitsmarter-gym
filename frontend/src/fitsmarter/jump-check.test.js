import { describe, it, expect } from 'vitest'
import { CATALOGUE } from '../lib/exercises.js'
import { suspiciousJump, baselineOf } from './jump-check.js'
import { tierFor, percentileOf } from './tiers.js'

const MAN = { sex: 'm', weight: 80, height: 178, birthYear: 1995 }
const bench = CATALOGUE.find(e => (e.n || '').toLowerCase() === 'barbell bench press')
const W = (date, w) => ({ id: date, d: date, date, entries: [{ id: bench.id, sets: [{ w, r: 10, done: true }] }] })
const entry = { id: bench.id, sets: [] }

describe('a set that jumps several levels at once', () => {
  it('is fine a level or two above last time', () => {
    const S = { unit: 'kg', workouts: [W('2026-11-01', 50)] }
    expect(suspiciousJump(S, entry, { w: 55, r: 10 }, MAN)).toBe(null)
  })
  it('is flagged three or more levels above last time: Silver to Diamond, both sides typed per side', () => {
    const S = { unit: 'kg', workouts: [W('2026-11-01', 50)] }
    const from = tierFor(percentileOf(bench, 50, MAN))
    const j = suspiciousJump(S, entry, { w: 100, r: 10 }, MAN)
    expect(j).toMatchObject({ from: { id: from.id }, by: 'exercise' })
    expect(j.to.id).toBe(tierFor(percentileOf(bench, 100, MAN)).id)
  })
  it('with no history, only a first set already at Diamond or above', () => {
    const S = { unit: 'kg', workouts: [] }
    expect(baselineOf(S, bench.id, MAN)).toBe(null)
    expect(suspiciousJump(S, entry, { w: 70, r: 10 }, MAN)).toBe(null)
    expect(suspiciousJump(S, entry, { w: 140, r: 10 }, MAN)?.to.id).toMatch(/diamond|champion|symmetric|olympian/)
  })
  it('ignores sets with no reps or no weight', () => {
    const S = { unit: 'kg', workouts: [W('2026-11-01', 40)] }
    expect(suspiciousJump(S, entry, { w: 200, r: 0 }, MAN)).toBe(null)
    expect(suspiciousJump(S, entry, { w: 0, r: 10 }, MAN)).toBe(null)
  })
})
