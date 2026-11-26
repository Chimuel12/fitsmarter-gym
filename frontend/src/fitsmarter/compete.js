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
export const GOOGLE_WEB_CLIENT = '935670655430-vs349l9s67139r1h9piutif039oj647j.apps.googleusercontent.com'
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
export async function saveProfile(user, name, consent = null) {
  const { F, db } = await sdk()
  await F.setDoc(F.doc(db, 'users', user.uid), { uid: user.uid, name: name || user.displayName || (user.email || '').split('@')[0], photo: consent?.photo ? user.photoURL || '' : '', createdAt: Date.now() }, { merge: true })
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
/** Leave a group and take back what you shared there: your posts and the kudos you gave. */
export async function leaveGroup(uid, id) {
  const { F, db } = await sdk()
  await forgetIn(F, db, uid, id)
  await F.updateDoc(F.doc(db, 'groups', id), { members: F.arrayRemove(uid) })
}
async function forgetIn(F, db, uid, gid) {
  const feed = F.collection(db, 'groups', gid, 'feed')
  const [mine, liked] = await Promise.all([F.getDocs(F.query(feed, F.where('uid', '==', uid))), F.getDocs(F.query(feed, F.where('kudos', 'array-contains', uid)))])
  await Promise.all([...mine.docs.map(d => F.deleteDoc(d.ref)), ...liked.docs.filter(d => d.data().uid !== uid).map(d => F.updateDoc(d.ref, { kudos: F.arrayRemove(uid) }))])
}
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
export function postOf(w, prof, consent = { weights: true }) {
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
    const lift = { ex: e.id, n: ex ? exerciseNameFor(ex) : e.id, pct: Math.round(pct * 10) / 10, tier: tierFor(pct).id }
    // weights and reps only when you chose to share them; the level is always shown
    lifts.push(consent?.weights ? { ...lift, w: Number(best.s.w) || 0, r: Number(best.s.r) || 0 } : lift)
  }
  const volume = Math.round(workoutVolume(w) || 0), durationS = Math.min(86400, Math.round((workoutDuration(w) || 0) / 1000))
  const points = Math.min(400, Math.round(sets * 2 + volume / 250))
  lifts.sort((a, b) => b.pct - a.pct)
  return { start: startOf(w), durationS, sets, volume, points, unit: prof.unit, title: w.name || w.title || '', lifts: lifts.slice(0, 6) }
}
/* ---------- privacy (GDPR): consent, what is shared, how long, export, delete ---------- */
export const CONSENT_V = 1
export const KEEP_DAYS = 90
export const PRIVACY_URL = 'https://chimuel12.github.io/fitsmarter-gym/privacy.html'
/** Your consent and sharing choices, or null when you have not agreed yet. */
export async function getConsent(uid) {
  const { F, db } = await sdk(), s = await F.getDoc(F.doc(db, 'users', uid))
  const c = s.exists() ? s.data().consent : null
  return c && c.v >= CONSENT_V ? c : null
}
/** Saves your yes (with the choices) and the profile that goes with it. */
export async function giveConsent(user, name, { photo = false, weights = false, past = false } = {}) {
  const consent = { v: CONSENT_V, at: Date.now(), age16: true, photo: !!photo, weights: !!weights, past: !!past }
  const { F, db } = await sdk()
  await F.setDoc(F.doc(db, 'users', user.uid), { uid: user.uid, name: name || user.displayName || (user.email || '').split('@')[0], photo: photo ? user.photoURL || '' : '', consent }, { merge: true })
  return consent
}
export async function updateChoices(user, consent, patch) {
  const next = { ...consent, ...patch }
  const { F, db } = await sdk()
  await F.setDoc(F.doc(db, 'users', user.uid), { consent: next, photo: next.photo ? user.photoURL || '' : '' }, { merge: true })
  return next
}
/** Workouts from this time on are shared: the last 30 days, or only from your yes on. */
export const shareFrom = (consent, now = Date.now()) => Math.max(now - 30 * 864e5, consent?.past ? 0 : consent?.at || now)
/** Your posts older than this are deleted: after KEEP_DAYS, and anything from before your yes
 *  when you chose not to share earlier workouts. */
export const keepFrom = (consent, now = Date.now()) => Math.max(now - KEEP_DAYS * 864e5, consent?.past ? 0 : consent?.at || 0)

/** Post your recent workouts to every group (idempotent: one post per workout id), bring older
 *  posts in line with your choices, and delete the ones past their time. */
export async function syncWorkouts(user, name, S, prof, groups, consent) {
  if (!groups.length || !consent) return 0
  const { F, db } = await sdk(), since = shareFrom(consent), cut = keepFrom(consent)
  const ws = (S?.workouts || []).filter(w => w?.id && startOf(w) >= since && (w.entries || []).some(e => doneSets(e).length))
  const photo = consent.photo ? user.photoURL || '' : ''
  const b = F.writeBatch(db)
  let n = 0
  for (const w of ws) {
    const post = { ...postOf(w, prof, consent), uid: user.uid, name, photo }
    for (const g of groups) { b.set(F.doc(db, 'groups', g.id, 'feed', String(w.id)), post, { merge: true }); n++ }
  }
  if (n) await b.commit()
  const fresh = new Set(ws.map(w => String(w.id)))
  await Promise.all(groups.map(async g => {
    const mine = await F.getDocs(F.query(F.collection(db, 'groups', g.id, 'feed'), F.where('uid', '==', user.uid)))
    await Promise.all(mine.docs.map(d => {
      const p = d.data()
      if (!(p.start >= cut)) return F.deleteDoc(d.ref)
      if (fresh.has(d.id)) return null
      const lifts = consent.weights ? p.lifts : (p.lifts || []).map(({ w, r, ...l }) => l)
      return p.photo !== photo || p.name !== name || JSON.stringify(lifts) !== JSON.stringify(p.lifts) ? F.updateDoc(d.ref, { photo, name, lifts: lifts || [] }) : null
    }))
  }))
  return ws.length
}

/** Everything the friends feature keeps about you, as one JSON file. */
export async function exportMine(user, groups) {
  const { F, db } = await sdk()
  const prof = await F.getDoc(F.doc(db, 'users', user.uid))
  const out = { exportedAt: new Date().toISOString(), account: { uid: user.uid, email: user.email || null, name: user.displayName || null, signIn: user.providerData?.map(p => p.providerId) || [] }, profile: prof.exists() ? prof.data() : null, groups: [] }
  for (const g of groups) {
    const feed = F.collection(db, 'groups', g.id, 'feed')
    const [mine, liked] = await Promise.all([F.getDocs(F.query(feed, F.where('uid', '==', user.uid))), F.getDocs(F.query(feed, F.where('kudos', 'array-contains', user.uid)))])
    out.groups.push({ id: g.id, name: g.name, owner: g.owner === user.uid, posts: mine.docs.map(d => ({ id: d.id, ...d.data() })), kudosGivenTo: liked.docs.map(d => d.id) })
  }
  return out
}

/** Google or your password once more: deleting an account needs a fresh sign-in. */
export async function reauth(user, password = '') {
  const { A } = await sdk()
  if ((user.providerData || []).some(p => p.providerId === 'password')) return A.reauthenticateWithCredential(user, A.EmailAuthProvider.credential(user.email, password))
  if (await isAndroid()) {
    const { registerPlugin } = await import('@capacitor/core')
    const { idToken } = await registerPlugin('GoogleSignIn').signIn({ clientId: GOOGLE_WEB_CLIENT })
    return A.reauthenticateWithCredential(user, A.GoogleAuthProvider.credential(idToken))
  }
  return A.reauthenticateWithPopup(user, new A.GoogleAuthProvider())
}
/** Deletes your friends account: your posts and kudos in every group, your profile, the account. */
export async function deleteAccount(user, groups) {
  const { A, F, db } = await sdk()
  for (const g of groups) await leaveGroup(user.uid, g.id)
  for (const sub of ['activities', 'routines']) {
    const docs = await F.getDocs(F.collection(db, 'users', user.uid, sub)).catch(() => null)
    if (docs) await Promise.all(docs.docs.map(d => F.deleteDoc(d.ref)))
  }
  await F.deleteDoc(F.doc(db, 'users', user.uid))
  await A.deleteUser(user)
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
