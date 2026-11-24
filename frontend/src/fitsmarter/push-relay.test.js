// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { reminderDays } from './push-relay.js'
import { DEF } from '../store/useStore.js'

// Monday 2027-01-11, 07:00 local
const NOW = new Date(2027, 0, 11, 7, 0)
const plan = extra => ({ ...structuredClone(DEF), routines: [{ id: 'p', name: 'Push', ex: [{ id: 'x' }] }, { id: 'l', name: 'Legs', ex: [{ id: 'y' }] }],
  week: { 1: 'p', 3: 'l' }, reminder: { on: true, time: '18:00' }, ...extra })

describe('workout-day reminders for the push server', () => {
  it('books the planned days in the next two weeks, at the reminder time', () => {
    const d = reminderDays(plan(), NOW)
    expect(d.map(x => x.date)).toEqual(['2027-01-11', '2027-01-13', '2027-01-18', '2027-01-20'])
    expect(d[0]).toMatchObject({ due: new Date(2027, 0, 11, 18, 0).getTime(), title: 'Push today 💪' })
    expect(d[1].title).toBe('Legs today 💪')
  })
  it('skips a day already trained and a time already past', () => {
    expect(reminderDays(plan({ workouts: [{ d: '2027-01-11', entries: [] }] }), NOW)[0].date).toBe('2027-01-13')
    expect(reminderDays(plan(), new Date(2027, 0, 11, 19, 0))[0].date).toBe('2027-01-13')
  })
  it('books nothing with the reminder off', () => {
    expect(reminderDays(plan({ reminder: { on: false, time: '18:00' } }), NOW)).toEqual([])
  })
})
