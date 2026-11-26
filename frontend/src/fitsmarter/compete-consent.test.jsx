// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const byText = txt => [...document.querySelectorAll('button,label,h3,span')].find(e => e.textContent.trim() === txt || (e.tagName === 'SPAN' && e.textContent.startsWith(txt)))
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)) })
const click = el => act(async () => { el.click() })
const m = vi.hoisted(() => ({ giveConsent: null, syncWorkouts: null, joinGroup: null }))
vi.mock('./compete.js', async o => {
  const real = await o()
  const user = { uid: 'u1', displayName: 'Ana', photoURL: 'p.png', providerData: [{ providerId: 'google.com' }] }
  m.giveConsent = vi.fn(async (u, n, c) => ({ v: 1, at: Date.now(), ...c }))
  m.syncWorkouts = vi.fn(async () => 0)
  m.joinGroup = vi.fn(async () => 'ABC123')
  return { ...real, watchUser: async cb => { cb(user); return () => {} }, getConsent: async () => null, giveConsent: m.giveConsent,
    saveProfile: vi.fn(async () => {}), watchGroups: async (uid, cb) => { cb([{ id: 'G', name: 'Crew', members: ['u1'] }]); return () => {} },
    watchFeed: async (g, s, cb) => { cb([]); return () => {} }, profilesOf: async () => ({}), syncWorkouts: m.syncWorkouts, joinGroup: m.joinGroup }
})
import Compete from './Compete.jsx'

describe('competing starts with a clear yes', () => {
  it('shares nothing until you are 16+ and agree, then saves only the choices you made', async () => {
    location.hash = '#/compete?join=ABC123'
    const div = document.createElement('div'); document.body.append(div)
    await act(async () => { createRoot(div).render(<Compete />) })
    await flush()
    const agree = byText('Agree and continue')
    expect(agree.disabled).toBe(true)
    expect(m.syncWorkouts).not.toHaveBeenCalled()
    expect(m.joinGroup).not.toHaveBeenCalled()       // an invite waits for the yes
    await click(byText('I am 16 or older').closest('label').querySelector('input'))
    expect(agree.disabled).toBe(true)
    await click(byText('I agree to share this with my groups').closest('label').querySelector('input'))
    await click(byText('Show the weights and reps of my best lifts').closest('label').querySelector('input'))
    expect(agree.disabled).toBe(false)
    await click(agree); await flush()
    expect(m.giveConsent).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), expect.anything(), { photo: false, weights: true, past: false })
    expect(byText('Your privacy')).toBeTruthy()
    expect(m.syncWorkouts).toHaveBeenCalled()
    expect(m.syncWorkouts.mock.calls.at(-1)[5]).toMatchObject({ weights: true, photo: false })
    expect(m.joinGroup).toHaveBeenCalled()
    expect(byText('Download my data')).toBeTruthy()
    expect(byText('Delete my account')).toBeTruthy()
  })
})
