import { describe, it, expect } from 'vitest'
import { postOf, board } from './compete.js'

const MAN = { sex: 'm', weight: 80, height: 178, birthYear: 1995, unit: 'kg' }
const now = Date.now()
const workout = { id: 'w1', start: now - 3600e3, end: now, entries: [
  { id: '0025', sets: [{ w: 90, r: 10, done: true }, { w: 90, r: 8, done: true }, { w: 60, r: 10, done: false }] },
  { id: '0043', sets: [{ w: 100, r: 10, done: true }] },
] }

describe('a workout as friends see it', () => {
  it('counts done sets, keeps integer points within the security rules and rates the best lift', () => {
    const p = postOf(workout, MAN)
    expect(p.sets).toBe(3)
    expect(Number.isInteger(p.points) && p.points <= 400).toBe(true)
    expect(Number.isInteger(p.durationS)).toBe(true)
    expect(p.durationS).toBe(3600)
    const bench = p.lifts.find(l => l.ex === '0025')
    expect(bench).toMatchObject({ w: 90, r: 10, tier: 'diamond' })
  })
})

describe('the leaderboard', () => {
  const posts = [
    { uid: 'a', name: 'Ana', start: now, points: 30, volume: 4000, lifts: [{ ex: '0025', pct: 85 }] },
    { uid: 'b', name: 'Ben', start: now, points: 50, volume: 2000, lifts: [{ ex: '0025', pct: 40 }] },
    { uid: 'a', name: 'Ana', start: now, points: 10, volume: 1000, lifts: [{ ex: '0025', pct: 60 }] },
  ]
  const members = [{ uid: 'a', name: 'Ana' }, { uid: 'b', name: 'Ben' }, { uid: 'c', name: 'Cy' }]
  it('sums points and lists members without workouts at zero', () => {
    const b = board(posts, members, 'week', 'points')
    expect(b.map(x => [x.p.uid, x.v])).toEqual([['b', 50], ['a', 40], ['c', 0]])
  })
  it('ranks by volume in tonnes and by the tier of each member’s best lift', () => {
    expect(board(posts, members, 'week', 'volume')[0].p.uid).toBe('a')
    const tiers = board(posts, members, 'week', 'tiers')
    expect(tiers[0].p.uid).toBe('a')   // best bench at the 85th percentile beats the 40th
  })
})
