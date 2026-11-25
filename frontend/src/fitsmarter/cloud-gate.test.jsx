// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { needsCloud } from './CloudGate.jsx'

const active = { id: 'a', start: 1, entries: [] }
describe('first workout needs the cloud', () => {
  it('asks a new user who starts a workout without Google Drive', () => {
    expect(needsCloud({ workouts: [], active }, {})).toBe(true)
  })
  it('does not ask once Drive is on, once a workout is logged, or with no workout running', () => {
    expect(needsCloud({ workouts: [], active }, { on: true })).toBe(false)
    expect(needsCloud({ workouts: [{ id: 'w' }], active }, {})).toBe(false)
    expect(needsCloud({ workouts: [], active: null }, {})).toBe(false)
  })
  it('leaves a past workout being logged or edited alone', () => {
    expect(needsCloud({ workouts: [], active: { ...active, backfill: true } }, {})).toBe(false)
    expect(needsCloud({ workouts: [], active: { ...active, editingWorkoutId: 'x' } }, {})).toBe(false)
  })
})
