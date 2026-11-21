import { describe, it, expect } from 'vitest'
import { TIERS } from './tiers.js'
import { SKINS, skinClasses, muscleScale, nextSkin } from './skins.js'

describe('skins', () => {
  it('has a skin for every level', () => { for (const tr of TIERS) expect(SKINS[tr.id].unlock).toBeTruthy() })
  it('switches on more effects as the level goes up', () => {
    expect(skinClasses(-1)).toBe('')
    expect(skinClasses(3)).toBe('fx-def fx-metal fx-aura')
    expect(skinClasses(8).split(' ')).toHaveLength(8)
    expect(skinClasses(9)).toContain('fx-marble')
    expect(skinClasses(9)).not.toContain('fx-holo')
  })
  it('grows a muscle 6 % a level, more on the back and shoulders from Champion', () => {
    const r = id => ({ tier: TIERS.find(x => x.id === id) })
    expect(muscleScale(null, 'chest', 0)).toBeCloseTo(0.78)
    expect(muscleScale(r('iron'), 'chest', 0)).toBeCloseTo(0.84)
    expect(muscleScale(r('symmetric'), 'chest', 8)).toBeCloseTo(1.32)
    expect(muscleScale(r('gold'), 'lats', 7)).toBeCloseTo(1.02 * 1.06)
  })
  it('names the next skin, none after Symmetric', () => {
    expect(nextSkin(-1).id).toBe('iron')
    expect(nextSkin(8).id).toBe('olympian')
    expect(nextSkin(9)).toBe(null)
  })
})
