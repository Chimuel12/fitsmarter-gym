import { describe, it, expect } from 'vitest'
import { decideForgotten } from '../lib/forgotten-workout.js'

const MIN = 60 * 1000, start = Date.parse('2026-11-21T17:00:00Z')
// A busy workout: a set ticked every 5 minutes, so the 45-minute idle question never comes.
const busy = now => ({ start, entries: [{ id: '0025', sets: Array.from({ length: Math.floor((now - start) / (5 * MIN)) }, (_, i) => ({ w: 60, r: 8, done: true, at: start + (i + 1) * 5 * MIN })) }] })
const prefs = { askMin: 45, graceMin: 5, maxMin: 120 }

describe('FitSmarter: a workout is saved 2 hours after it started', () => {
  it('asks at 2 hours even while sets are still being logged', () => {
    expect(decideForgotten({ A: busy(start + 100 * MIN), now: start + 100 * MIN, prefs }).state).toBe('active')
    expect(decideForgotten({ A: busy(start + 100 * MIN), now: start + 100 * MIN, prefs }).askAt).toBe(start + 120 * MIN)
    expect(decideForgotten({ A: busy(start + 121 * MIN), now: start + 121 * MIN, prefs }).state).toBe('ask')
  })
  it('saves by itself when nobody answers within 5 minutes', () => {
    const now = start + 126 * MIN
    expect(decideForgotten({ A: busy(now), now, prefs, askedAt: start + 120 * MIN }).state).toBe('end')
  })
  it('gives 30 more minutes after "Keep going"', () => {
    const snoozeAt = start + 121 * MIN, now = start + 140 * MIN
    expect(decideForgotten({ A: busy(now), now, prefs, snoozeAt }).state).toBe('active')
    expect(decideForgotten({ A: busy(now), now, prefs, snoozeAt }).askAt).toBe(snoozeAt + 30 * MIN)
  })
  it('without the cap (openGym) the busy workout is never asked', () => {
    const now = start + 180 * MIN
    expect(decideForgotten({ A: busy(now), now, prefs: { askMin: 45, graceMin: 5, maxMin: 0 } }).state).toBe('active')
  })
})
