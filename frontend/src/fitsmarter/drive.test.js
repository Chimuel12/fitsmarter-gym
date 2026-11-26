// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('./compete.js', () => ({ signInGoogle: vi.fn(), sdk: vi.fn(), GOOGLE_WEB_CLIENT: 'client-id' }))
vi.mock('../lib/mobile.js', async o => ({ ...(await o()), isAndroid: async () => false }))
import { useStore } from '../store/useStore.js'
import { syncNow, readCfg, syncOnOpen, driveToken, friendly, disconnectDrive } from './drive.js'

// A tiny Google Drive: files by id, with the calls drive.js makes.
function fakeDrive() {
  const files = {}
  let n = 0
  globalThis.fetch = vi.fn(async (url, o = {}) => {
    const u = new URL(url), m = o.method || 'GET', ok = b => ({ ok: true, status: 200, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)) })
    if (u.pathname.endsWith('/files') && m === 'GET') return ok({ files: Object.values(files).filter(f => f.app === 'data').map(f => ({ id: f.id, parents: f.parents })) })
    if (u.pathname.endsWith('/files') && m === 'POST' && !u.pathname.includes('upload')) { const meta = JSON.parse(o.body); const id = 'F' + ++n; files[id] = { id, ...meta, app: meta.appProperties?.fitsmarter }; return ok({ id, name: meta.name }) }
    if (u.pathname.includes('/upload/') && m === 'POST') { const [, metaPart, bodyPart] = o.body.split(/--fs\w+\r\n/); const meta = JSON.parse(metaPart.split('\r\n\r\n')[1]); const id = 'F' + ++n; files[id] = { id, ...meta, app: 'data', body: bodyPart.split('\r\n\r\n')[1].split('\r\n--')[0] }; return ok({ id, parents: meta.parents }) }
    const id = u.pathname.split('/').pop()
    if (u.pathname.includes('/upload/') && m === 'PATCH') { files[id].body = o.body; return ok({}) }
    if (u.searchParams.get('alt') === 'media') return ok(files[id].body)
    if (files[id]) return ok({ id, name: files[id].name, parents: files[id].parents, trashed: false })
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
  })
  return files
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  sessionStorage.setItem('fs_drive_token', JSON.stringify({ token: 'T', exp: Date.now() + 3600e3 }))
  localStorage.setItem('fs_drive', JSON.stringify({ on: true }))
})

describe('Google Drive sync', () => {
  it('makes the FitSmarter folder and the data file on the first sync', async () => {
    const files = fakeDrive()
    useStore.getState().replaceState({ ...useStore.getState().S, workouts: [{ id: 'w1', date: '2026-11-10', entries: [] }] })
    await syncNow()
    const data = Object.values(files).find(f => f.app === 'data'), folder = Object.values(files).find(f => f.app === 'folder')
    expect(folder.name).toBe('FitSmarter')
    expect(data.parents).toEqual([folder.id])
    expect(JSON.parse(data.body).workouts.map(w => w.id)).toContain('w1')
    expect(readCfg()).toMatchObject({ fileId: data.id, folderId: folder.id, folderName: 'FitSmarter' })
  })
  it('keeps the workouts of both devices', async () => {
    const files = fakeDrive()
    files.F9 = { id: 'F9', name: 'FitSmarter data.json', parents: ['P'], app: 'data',
      body: JSON.stringify({ ...useStore.getState().S, _ts: 1, workouts: [{ id: 'phone', date: '2026-11-11', entries: [] }] }) }
    useStore.getState().replaceState({ ...useStore.getState().S, workouts: [{ id: 'laptop', date: '2026-11-12', entries: [] }] })
    await syncNow()
    const ids = useStore.getState().S.workouts.map(w => w.id).sort()
    expect(ids).toEqual(['laptop', 'phone'])
    expect(JSON.parse(files.F9.body).workouts.map(w => w.id).sort()).toEqual(['laptop', 'phone'])
    expect(readCfg().fileId).toBe('F9')
  })
})

describe('opening Body', () => {
  it('pulls what another device saved to Drive', async () => {
    const files = fakeDrive()
    files.F9 = { id: 'F9', app: 'data', parents: ['P'], body: JSON.stringify({ ...useStore.getState().S, workouts: [{ id: 'phone', date: '2026-11-20', entries: [] }] }) }
    await syncOnOpen()
    expect(useStore.getState().S.workouts.map(w => w.id)).toContain('phone')
  })
  it('does nothing without Drive and never throws', async () => {
    localStorage.setItem('fs_drive', JSON.stringify({ on: false }))
    globalThis.fetch = vi.fn()
    expect(await syncOnOpen()).toBe(null)
    expect(fetch).not.toHaveBeenCalled()
    localStorage.setItem('fs_drive', JSON.stringify({ on: true })); sessionStorage.clear()
    expect(await syncOnOpen()).toBe(null)   // key ran out, no tap: quiet
  })
})

describe('renewing the Drive key in a browser', () => {
  it('asks Google directly (no Firebase window) for the remembered account and keeps the key', async () => {
    disconnectDrive()   // no key kept
    localStorage.setItem('fs_drive', JSON.stringify({ on: true, email: 'me@example.com' }))
    let asked
    window.google = { accounts: { oauth2: { initTokenClient: c => ({ requestAccessToken: o => { asked = { hint: c.hint, scope: c.scope, prompt: o.prompt }; c.callback({ access_token: 'NEW', expires_in: 3599 }) } }) } } }
    expect(await driveToken({ interactive: true })).toBe('NEW')
    expect(asked).toEqual({ hint: 'me@example.com', scope: 'https://www.googleapis.com/auth/drive.file', prompt: '' })
    expect(await driveToken()).toBe('NEW')   // kept: no second window
    delete window.google
  })
  it('turns sign-in errors into words to act on', () => {
    expect(friendly({ code: 'auth/network-request-failed' }).message).toMatch(/internet connection/)
    expect(friendly({ code: 'popup_failed_to_open' }).message).toMatch(/pop-ups/)
    expect(friendly({ code: 'auth/popup-closed-by-user' }).code).toBe('cancelled')
  })
})
