// FitSmarter: compete with friends. Part of this AGPL fork.
//
// openGym itself stays in guest mode (everything on this device). Competing is opt-in: sign in with
// Google or email, create or join a group by its 6-letter code, and a summary of each workout
// (date, duration, sets, volume, best lifts and their tiers) is posted to your groups. The
// Firebase SDK is loaded from Google's CDN on demand, so openGym gains no npm dependency.
// Security rules: firestore.rules in the FitSmarter repository (deployed to fitsmarter-z2bit).
import { entryDbLoad } from '../lib/dumbbells.js'
import CONFIG from './firebase-config.js'
import { isAndroid } from '../lib/mobile.js'
import { workoutVolume, workoutDuration } from '../lib/history.js'
import { exerciseOf } from '../lib/exercises.js'
import { exerciseNameFor } from '../lib/i18n-core.js'
import { rateOf, setValue, percentileOf, tierFor, tierIndex } from './tiers.js'

const V = '10.14.1', CDN = `https://www.gstatic.com/firebasejs/${V}`
let fb = null
export async function sdk() {
  if (fb) return fb
  const [{ initializeApp }, A, F] = await Promise.all([
    import(/* @vite-ignore */ `${CDN}/firebase-app.js`), import(/* @vite-ignore */ `${CDN}/firebase-auth.js`), import(/* @vite-ignore */ `${CDN}/firebase-firestore.js`)])
  const app = initializeApp(CONFIG)
  fb = { A, F, auth: A.getAuth(app), db: F.getFirestore(app) }
  return fb
}
export const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')

/* ---------- account ---------- */
export async function watchUser(cb) {
  const { A, auth } = await sdk()
  return A.onAuthStateChanged(auth, cb)
}
// The web client of the Google provider (Firebase Auth): Android asks Google for a token for it.
const GOOGLE_WEB_CLIENT = '935670655430-vs349l9s67139r1h9piutif039oj647j.apps.googleusercontent.com'
export async function signInGoogle({ scopes = [], hint = '' } = {}) {
  const { A, auth } = await sdk(), p = new A.GoogleAuthProvider()
  scopes.forEach(s => p.addScope(s))
  if (await isAndroid()) {
    // Google blocks its sign-in page inside the app's WebView: the phone's account picker signs in.
    const { registerPlugin } = await import('@capacitor/core')
    const { idToken } = await registerPlugin('GoogleSignIn').signIn({ clientId: GOOGLE_WEB_CLIENT })
    return A.signInWithCredential(auth, A.GoogleAuthProvider.credential(idToken))
  }
  // A popup, also when installed: a redirect needs the auth domain's storage, which browsers now
  // partition away from this site, so it would come back signed out.
  // Renewing a key for an account already chosen: Google is told which one, and when you are still
  // signed in to it and already said yes, the window closes by itself without asking anything.
  p.setCustomParameters(hint ? { login_hint: hint } : { prompt: 'select_account' })
  return A.signInWithPopup(auth, p)
}
export async function signInEmail(email, pass, create) {
  const { A, auth } = await sdk()
  return create ? A.createUserWithEmailAndPassword(auth, email, pass) : A.signInWithEmailAndPassword(auth, email, pass)
}
export async function signOutFs() { const { A, auth } = await sdk(); return A.signOut(auth) }
export async function saveProfile(user, name) {
  const { F, db } = await sdk()
  await F.setDoc(F.doc(db, 'users', user.uid), { uid: user.uid, name: name || user.displayName || (user.email || '').split('@')[0], photo: user.photoURL || '', createdAt: Date.now() }, { merge: true })
}
export async function profilesOf(uids) {
  const { F, db } = await sdk(), out = {}
  await Promise.all(uids.map(async u => { const s = await F.getDoc(F.doc(db, 'users', u)); if (s.exists()) out[u] = s.data() }))
  return out
}

/* ---------- groups ---------- */
export async function watchGroups(uid, cb) {
  const { F, db } = await sdk()
  return F.onSnapshot(F.query(F.collection(db, 'groups'), F.where('members', 'array-contains', uid)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => cb([]))
}
export async function createGroup(uid, name) {
  const { F, db } = await sdk(), id = randomCode()
  await F.setDoc(F.doc(db, 'groups', id), { id, name, owner: uid, members: [uid], createdAt: Date.now() })
  return id
}
export async function joinGroup(uid, code) {
  const { F, db } = await sdk(), id = String(code || '').trim().toUpperCase(), ref = F.doc(db, 'groups', id)
  const s = await F.getDoc(ref)
  if (!s.exists()) throw new Error('No group with that code.')
  await F.updateDoc(ref, { members: F.arrayUnion(uid) })
  return id
}
export async function leaveGroup(uid, id) { const { F, db } = await sdk(); await F.updateDoc(F.doc(db, 'groups', id), { members: F.arrayRemove(uid) }) }
export async function watchFeed(gid, since, cb) {
  const { F, db } = await sdk()
  return F.onSnapshot(F.query(F.collection(db, 'groups', gid, 'feed'), F.where('start', '>=', since), F.orderBy('start', 'desc')), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => cb([]))
}
export async function kudos(gid, postId, uid, on) {
  const { F, db } = await sdk()
  await F.updateDoc(F.doc(db, 'groups', gid, 'feed', postId), { kudos: on ? F.arrayUnion(uid) : F.arrayRemove(uid) })
}

/* ---------- workouts → posts ---------- */
const startOf = w => { const t = Date.parse(w?.start) || Number(w?.start) || Date.parse(w?.date); return Number.isFinite(t) ? t : 0 }
const doneSets = e => (e.sets || []).filter(s => s && (s.done === undefined || s.done) && Number(s.r) > 0)
/** A workout as the summary friends see; points are integers capped at 400 (security rules). */
export function postOf(w, prof) {
  const lifts = []
  let sets = 0
  for (const e of w.entries || []) {
    const ds = doneSets(e)
    sets += ds.length
    if (!rateOf(e.id) || !ds.length) continue
    const dbLoad = entryDbLoad(e)
    const best = ds.reduce((b, s) => { const v = setValue(e.id, s, prof.unit, dbLoad); return v > b.v ? { v, s } : b }, { v: 0, s: null })
    if (!best.s) continue
    const pct = percentileOf(e.id, best.v, prof), ex = exerciseOf(e.id)
    lifts.push({ ex: e.id, n: ex ? exerciseNameFor(ex) : e.id, w: Number(best.s.w) || 0, r: Number(best.s.r) || 0, pct: Math.round(pct * 10) / 10, tier: tierFor(pct).id })
  }
  const volume = Math.round(workoutVolume(w) || 0), durationS = Math.min(86400, Math.round((workoutDuration(w) || 0) / 1000))
  const points = Math.min(400, Math.round(sets * 2 + volume / 250))
  lifts.sort((a, b) => b.pct - a.pct)
  return { start: startOf(w), durationS, sets, volume, points, unit: prof.unit, title: w.name || w.title || '', lifts: lifts.slice(0, 6) }
}
/** Post the last 30 days of workouts to every group (idempotent: one post per workout id). */
export async function syncWorkouts(user, name, S, prof, groups) {
  if (!groups.length) return 0
  const { F, db } = await sdk(), since = Date.now() - 30 * 864e5
  const ws = (S?.workouts || []).filter(w => w?.id && startOf(w) >= since && (w.entries || []).some(e => doneSets(e).length))
  const b = F.writeBatch(db)
  let n = 0
  for (const w of ws) {
    const post = { ...postOf(w, prof), uid: user.uid, name, photo: user.photoURL || '' }
    for (const g of groups) { b.set(F.doc(db, 'groups', g.id, 'feed', String(w.id)), post, { merge: true }); n++ }
  }
  if (n) await b.commit()
  return ws.length
}

/* ---------- leaderboard ---------- */
export const METRICS = {
  points: { n: 'Points', f: p => p.points || 0, u: 'pts' },
  volume: { n: 'Volume', f: p => (p.volume || 0) / 1000, u: 't' },
  workouts: { n: 'Workouts', f: () => 1, u: '' },
  tiers: { n: 'Tiers', f: () => 0, u: 'pts' },
}
export function board(posts, members, period, metric) {
  const d = new Date(), since = period === 'week'
    ? (() => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return +x })()
    : +new Date(d.getFullYear(), d.getMonth(), 1)
  const tot = {}
  members.forEach(p => { tot[p.uid] = { p, v: 0, n: 0 } })
  const inP = posts.filter(p => p.start >= since)
  inP.forEach(p => { const t = tot[p.uid] || (tot[p.uid] = { p: { uid: p.uid, name: p.name, photo: p.photo }, v: 0, n: 0 }); t.v += METRICS[metric].f(p); t.n++ })
  if (metric === 'tiers') { // tier points (Bronze 1 … Symmetric 8) of each member's best lift per exercise
    const best = {}
    inP.forEach(p => (p.lifts || []).forEach(l => { const k = p.uid + '|' + l.ex; best[k] = Math.max(best[k] || 0, l.pct || 0) }))
    Object.values(tot).forEach(t => { t.v = 0 })
    Object.entries(best).forEach(([k, pct]) => { const t = tot[k.split('|')[0]]; if (t) t.v += tierIndex(tierFor(pct).id) })
  }
  return Object.values(tot).sort((a, b) => b.v - a.v || String(a.p.name).localeCompare(String(b.p.name)))
}
