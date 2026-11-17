// FitSmarter: your data in your own Google Drive. Part of this AGPL fork.
//
// One file, "FitSmarter data.json", in a folder of your Drive that you choose (or "FitSmarter",
// made for you). Every device signed in with the same Google account reads it, merges it with
// what it has (lib/sync-merge.js mergeStates: the same field-by-field merge openGym's own server
// sync uses, so a workout logged on one phone and a plan edited on another both survive) and
// writes the merged copy back. Nothing goes to any server of ours.
//
// Access is Google's narrowest Drive scope, drive.file: the app sees only the files it made or
// you picked for it, never the rest of your Drive. On Android the phone's Google account grants
// it once and then hands a fresh key silently (GoogleSignInPlugin.authorize), so the sync runs on
// its own. In a browser the key lasts an hour; after that a tap on "Sync now" renews it.
import { useStore } from '../store/useStore.js'
import { mergeStates } from '../lib/sync-merge.js'
import { isAndroid } from '../lib/mobile.js'
import { signInGoogle, sdk } from './compete.js'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const API = 'https://www.googleapis.com/drive/v3', UP = 'https://www.googleapis.com/upload/drive/v3'
const FILE_NAME = 'FitSmarter data.json', FOLDER_NAME = 'FitSmarter'
const CFG_KEY = 'fs_drive', TOKEN_KEY = 'fs_drive_token'
const PICKER_KEY = 'AIzaSyBBuc37VHJW_-lMzeszrKm9vSiIiQWWhzg'   // Picker API only, this site only
const APP_ID = '935670655430'

/* ---------- state everyone can watch ---------- */
const subs = new Set()
let status = { busy: false, error: null }
export const readCfg = () => { try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null') || {} } catch { return {} } }
const writeCfg = c => { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)) } catch { /* private mode */ } emit() }
const emit = () => subs.forEach(f => { try { f() } catch { /* a listener */ } })
export const driveState = () => ({ ...readCfg(), ...status })
export function onDrive(fn) { subs.add(fn); return () => subs.delete(fn) }
const setStatus = s => { status = { ...status, ...s }; emit() }

/* ---------- the key to Drive ---------- */
let mem = null
const cached = () => {
  if (!mem) try { mem = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null') } catch { mem = null }
  return mem && mem.exp > Date.now() + 60e3 ? mem.token : null
}
const keep = token => { mem = { token, exp: Date.now() + 50 * 60e3 }; try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(mem)) } catch { /* private */ } return token }
const native = async () => (await import('@capacitor/core')).registerPlugin('GoogleSignIn')

/** A Drive key. interactive: may show Google's screens (only from a tap). */
export async function driveToken({ interactive = false } = {}) {
  const c = cached()
  if (c) return c
  if (await isAndroid()) {
    const r = await (await native()).authorize({ scopes: [DRIVE_SCOPE], interactive })
    if (r.email && r.email !== readCfg().email) writeCfg({ ...readCfg(), email: r.email })
    return keep(r.accessToken)
  }
  if (!interactive) throw Object.assign(new Error('Tap Sync now to reconnect Google Drive'), { code: 'needs-tap' })
  const { A } = await sdk()
  const res = await signInGoogle({ scopes: [DRIVE_SCOPE] })
  const token = A.GoogleAuthProvider.credentialFromResult(res)?.accessToken
  if (!token) throw new Error('Google gave no Drive access')
  return keep(token)
}

async function call(token, url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } })
  if (r.status === 401) { mem = null; try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* */ } throw Object.assign(new Error('Google Drive asked to sign in again'), { code: 'auth' }) }
  if (!r.ok) throw new Error(`Google Drive ${r.status}`)
  return r
}
const json = async (token, url, opts) => (await call(token, url, opts)).json()

/* ---------- Drive files ---------- */
async function findData(token) {
  const q = encodeURIComponent("appProperties has { key='fitsmarter' and value='data' } and trashed=false")
  const r = await json(token, `${API}/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,parents,modifiedTime)`)
  return r.files?.[0] || null
}
async function makeFolder(token, name = FOLDER_NAME) {
  return json(token, `${API}/files?fields=id,name`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', appProperties: { fitsmarter: 'folder' } }) })
}
async function folderName(token, id) { try { return (await json(token, `${API}/files/${id}?fields=name`)).name } catch { return null } }
async function createData(token, folderId, body) {
  const meta = { name: FILE_NAME, mimeType: 'application/json', parents: [folderId], appProperties: { fitsmarter: 'data' } }
  const b = 'fs' + Math.random().toString(36).slice(2)
  const payload = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`
  return json(token, `${UP}/files?uploadType=multipart&fields=id,parents`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: payload })
}
const writeData = (token, id, body) => call(token, `${UP}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
const readData = async (token, id) => { const t = await (await call(token, `${API}/files/${id}?alt=media`)).text(); try { return JSON.parse(t) } catch { return null } }

/* ---------- connect, choose a folder, disconnect ---------- */
/** From a tap: Google sign-in (the same account Compete uses) and access to the app's Drive files. */
export async function connectDrive() {
  if (await isAndroid()) {
    try { const { auth } = await sdk(); if (!auth.currentUser) await signInGoogle() } catch { /* Drive works without Compete */ }
  }
  const token = await driveToken({ interactive: true })
  let email = readCfg().email
  try { email = (await json(token, `${API}/about?fields=user(emailAddress)`)).user?.emailAddress || email } catch { /* keep */ }
  writeCfg({ ...readCfg(), on: true, email })
  return syncNow({ interactive: true })
}
export function disconnectDrive() {
  mem = null
  try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* */ }
  writeCfg({})
  setStatus({ error: null })
}

/** Google's own folder picker (in a browser). Moves the data file there if it exists already. */
export async function chooseFolder() {
  const token = await driveToken({ interactive: true })
  await new Promise((ok, no) => {
    if (window.google?.picker) return ok()
    const s = document.createElement('script')
    s.src = 'https://apis.google.com/js/api.js'
    s.onload = () => window.gapi.load('picker', { callback: ok, onerror: no })
    s.onerror = no
    document.head.appendChild(s)
  })
  const P = window.google.picker
  const picked = await new Promise(ok => {
    const view = new P.DocsView(P.ViewId.FOLDERS).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder')
    new P.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(PICKER_KEY).setAppId(APP_ID)
      .setTitle('Choose where FitSmarter keeps your data').setOrigin(location.origin)
      .setCallback(d => { if (d.action === P.Action.PICKED) ok(d.docs[0]); else if (d.action === P.Action.CANCEL) ok(null) })
      .build().setVisible(true)
  })
  if (!picked) return null
  const cfg = readCfg()
  if (cfg.fileId) {
    const f = await json(token, `${API}/files/${cfg.fileId}?fields=parents`).catch(() => null)
    const from = (f?.parents || []).join(',')
    if (from !== picked.id) await call(token, `${API}/files/${cfg.fileId}?addParents=${picked.id}${from ? '&removeParents=' + from : ''}`, { method: 'PATCH' })
  }
  writeCfg({ ...readCfg(), folderId: picked.id, folderName: picked.name })
  return syncNow({ interactive: true })
}

/* ---------- the sync ---------- */
const strip = S => { const { _ts, ...rest } = S || {}; return JSON.stringify(rest) }
let running = null
/** Read the Drive copy, merge, write both ways. Resolves to the time it finished. */
export function syncNow(opts = {}) {
  if (!running) running = doSync(opts).finally(() => { running = null })
  return running
}
async function doSync({ interactive = false } = {}) {
  const cfg = readCfg()
  if (!cfg.on) return null
  setStatus({ busy: true, error: null })
  try {
    const token = await driveToken({ interactive })
    let fileId = cfg.fileId, folderId = cfg.folderId
    if (fileId) { const ok = await json(token, `${API}/files/${fileId}?fields=id,trashed,parents`).catch(() => null); if (!ok || ok.trashed) fileId = null; else folderId = ok.parents?.[0] || folderId }
    if (!fileId) { const f = await findData(token); if (f) { fileId = f.id; folderId = f.parents?.[0] || folderId } }
    const local = useStore.getState().S
    let remote = fileId ? await readData(token, fileId) : null
    const merged = remote ? mergeStates(local, remote) : local
    if (strip(merged) !== strip(local)) useStore.getState().replaceState(merged, false)
    const body = JSON.stringify(useStore.getState().S)
    if (!fileId) {
      if (!folderId) folderId = (await makeFolder(token)).id
      fileId = (await createData(token, folderId, body)).id
    } else if (!remote || strip(remote) !== strip(useStore.getState().S)) await writeData(token, fileId, body)
    const name = folderId && folderId !== cfg.folderId ? await folderName(token, folderId) : cfg.folderName
    writeCfg({ ...readCfg(), fileId, folderId, folderName: name || cfg.folderName || FOLDER_NAME, last: Date.now() })
    setStatus({ busy: false, error: null })
    return Date.now()
  } catch (e) {
    setStatus({ busy: false, error: e.code === 'needs-tap' || e.code === 'needs-consent' ? 'tap' : (e.message || 'Sync failed') })
    throw e
  }
}

/* ---------- on its own: at start, when the app comes back, a few seconds after a change ---------- */
let started = false
export function startDriveSync() {
  if (started) return
  started = true
  const quiet = () => syncNow().catch(() => {})
  if (readCfg().on) quiet()
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && readCfg().on) quiet() })
  let tm = null, last = useStore.getState().S
  useStore.subscribe(st => {
    if (st.S === last) return
    last = st.S
    if (!readCfg().on || running) return
    clearTimeout(tm)
    tm = setTimeout(quiet, 6000)
  })
}
