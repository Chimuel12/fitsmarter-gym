import { describe, it, expect } from 'vitest'
import { balanceCap, regionLevels, muscleTiers, TIERS, tierIndex, GAP } from './tiers.js'
import { CATALOGUE } from '../lib/exercises.js'

const at = (id, extra = {}) => { const i = TIERS.findIndex(t => t.id === id); return { pct: 100 - TIERS[i].top, tier: TIERS[i], ...extra } }
const body = (up, legs) => ({ chest: at(up), 'front-delts': at(up), triceps: at(up), lats: at(up), 'upper-back': at(up), biceps: at(up),
  quadriceps: at(legs), hamstring: at(legs), gluteal: at(legs), calves: at(legs) })
const LEGS = ['quadriceps', 'hamstring', 'gluteal', 'calves']

describe('balance cap', () => {
  it('allows three levels of difference', () => expect(GAP).toBe(3))
  it('holds a Diamond chest to Emerald when the legs are Silver', () => {
    const m = balanceCap(body('diamond', 'silver'))
    expect(m.chest.tier.id).toBe('emerald')
    expect(m.chest.raw.tier.id).toBe('diamond')
    expect(m.chest.capped.by).toBe('legs')
    expect(m.quadriceps.tier.id).toBe('silver')
    expect(m.quadriceps.capped).toBeUndefined()
  })
  it('leaves a body within three levels alone', () => {
    const m = balanceCap(body('diamond', 'gold'))
    expect(m.chest.tier.id).toBe('diamond')
    expect(m.chest.capped).toBeUndefined()
  })
  it('works the other way: strong legs, weak arms', () => {
    const m = balanceCap(body('bronze', 'champion'))
    expect(m.quadriceps.tier.id).toBe('ruby')
    expect(m.quadriceps.capped.by).toMatch(/push|pull/)
  })
  it('muscle memory: a region keeps credit for one level below its record', () => {
    const map = body('champion', 'silver')
    expect(balanceCap(map).chest.tier.id).toBe('emerald')
    for (const m of LEGS) map[m].bestPct = 100 - TIERS[tierIndex('emerald')].top
    expect(regionLevels(map).legs).toBe(tierIndex('ruby'))
    expect(balanceCap(map).chest.tier.id).toBe('champion')
  })
  it('a region never trained holds nothing back', () => {
    expect(regionLevels({ chest: at('diamond') }).legs).toBe(null)
    expect(balanceCap({ chest: at('diamond') }).chest.tier.id).toBe('diamond')
    const noLegs = body('diamond', 'iron'); for (const m of LEGS) delete noLegs[m]
    expect(balanceCap(noLegs).chest.tier.id).toBe('diamond')
  })
  it('the core counts as a region: weak abs hold the rest back', () => {
    const m = balanceCap({ ...body('diamond', 'diamond'), abs: at('iron') })
    expect(m.chest.tier.id).toBe('gold')
    expect(m.chest.capped.by).toBe('core')
  })
  it('is applied to the body from real workouts, and can be turned off', () => {
    const find = n => CATALOGUE.find(e => (e.n || '').toLowerCase() === n)
    const S = { unit: 'kg', workouts: [{ id: 'a', date: '2026-11-18', entries: [
      { id: find('barbell bench press').id, sets: [{ w: 110, r: 10, done: true }] },
      { id: find('barbell full squat').id, sets: [{ w: 30, r: 10, done: true }] }] }] }
    const MAN = { sex: 'm', weight: 80, height: 178, birthYear: 1995 }
    const raw = muscleTiers(S, MAN, { cap: false }), capped = muscleTiers(S, MAN)
    expect(tierIndex(raw.chest.tier.id) - tierIndex(raw.quadriceps.tier.id)).toBeGreaterThan(GAP)
    expect(tierIndex(capped.chest.tier.id)).toBe(tierIndex(raw.quadriceps.tier.id) + GAP)
  })
})
