// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('./compete.js', () => ({ signInGoogle: vi.fn(), sdk: vi.fn() }))
vi.mock('../lib/mobile.js', async o => ({ ...(await o()), isAndroid: async () => false }))
import { useStore } from '../store/useStore.js'
import { syncNow, readCfg } from './drive.js'

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
