// FitSmarter push server: one Durable Object holds every subscription and every notification
// waiting to go out, and wakes itself with an alarm at the next one. No accounts: a browser is
// its push subscription, and only the page holding that subscription's `auth` secret (16 random
// bytes the browser made and only shares with its push server) can change what it receives.
//
// Storage keys:
//   s:<id>               { endpoint, keys: { p256dh, auth }, deviceId, created, lastTest }
//   j:<id>:rest          { due, msg }   the end of the current rest
//   j:<id>:day:<date>    { due, msg }   a workout-day reminder, booked by the page (it knows its clock)
import { sendPush } from './webpush.js'

export const MAX_SUBS = 5000
export const MAX_DAYS = 14
const TEST_GAP_MS = 10_000
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/
const KEY_RE = /^[A-Za-z0-9_-]+={0,2}$/

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
// One line of plain text, as a notification shows it.
export const clean = (v, max = 120) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')
const deviceIdOf = v => (typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : undefined)
export function endpointError(raw) {
  if (typeof raw !== 'string' || raw.length > 1024) return 'invalid endpoint'
  let u
  try { u = new URL(raw) } catch { return 'invalid endpoint' }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return 'invalid endpoint'
  if (!PUSH_HOSTS.test(u.hostname)) return 'not a known push service'
  return null
}
const keysOk = k => k && [k.p256dh, k.auth].every(v => typeof v === 'string' && v.length <= 256 && KEY_RE.test(v))
async function idOf(endpoint) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))
  return [...h.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('')
}
// constant-time enough for 22 characters that are compared once per request
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0

export class Hub {
  constructor(ctx, env, { now = () => Date.now(), fetchImpl = (...a) => fetch(...a) } = {}) {
    this.st = ctx.storage
    this.env = env
    this.now = now
    this.fetchImpl = fetchImpl
  }

  vapid() {
    return { publicKey: this.env.VAPID_PUBLIC, privateJwk: JSON.parse(this.env.VAPID_PRIVATE), subject: this.env.VAPID_SUBJECT || 'https://github.com/Chimuel12/fitsmarter-gym' }
  }

  // The caller's subscription, when it proves it holds it ({ endpoint, auth } in the body).
  async owned(body) {
    if (endpointError(body?.endpoint)) return null
    const id = await idOf(body.endpoint)
    const sub = await this.st.get('s:' + id)
    return sub && same(sub.keys.auth, body.auth) ? { id, sub } : null
  }

  async fetch(req) {
    const url = new URL(req.url), route = `${req.method} ${url.pathname.replace(/^.*?\/api\/push/, '/api/push')}`
    let body = {}
    if (req.method === 'POST') {
      const text = await req.text()
      if (text.length > 16_384) return json(413, { error: 'too large' })
      try { body = text ? JSON.parse(text) : {} } catch { return json(400, { error: 'invalid JSON' }) }
    }
    switch (route) {
      case 'GET /api/push/public-key': return json(200, { key: this.env.VAPID_PUBLIC })
      case 'GET /api/push/status': {
        const endpoint = url.searchParams.get('endpoint') || ''
        if (endpointError(endpoint)) return json(200, { subscribed: false })
        const sub = await this.st.get('s:' + await idOf(endpoint))
        return json(200, sub ? { subscribed: true, deviceId: sub.deviceId || null } : { subscribed: false })
      }
      case 'POST /api/push/subscribe': {
        const s = body.subscription
        const bad = endpointError(s?.endpoint) || (keysOk(s?.keys) ? null : 'invalid subscription keys')
        if (bad) return json(400, { error: bad })
        const id = await idOf(s.endpoint), prev = await this.st.get('s:' + id)
        // The endpoint alone is a URL; whoever learned it must not re-key it to themselves.
        if (prev && !same(prev.keys.auth, s.keys.auth)) return json(409, { error: 'this subscription is registered with other keys' })
        if (!prev && (await this.st.list({ prefix: 's:', limit: MAX_SUBS })).size >= MAX_SUBS) return json(503, { error: 'full' })
        await this.st.put('s:' + id, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, deviceId: deviceIdOf(body.deviceId) || prev?.deviceId, created: prev?.created || this.now(), lastTest: prev?.lastTest || 0 })
        return json(200, { ok: true })
      }
    }
    const me = await this.owned(body)
    if (!me) return json(403, { error: 'unknown subscription' })
    switch (route) {
      case 'POST /api/push/unsubscribe':
        await this.drop(me.id)
        return json(200, { ok: true })
      case 'POST /api/push/test': {
        if (this.now() - (me.sub.lastTest || 0) < TEST_GAP_MS) return json(429, { error: 'wait a few seconds' })
        await this.st.put('s:' + me.id, { ...me.sub, lastTest: this.now() })
        const status = await this.deliver(me.id, me.sub, { title: 'FitSmarter', body: clean(body.body) || 'Test notification ✅ This is what alerts look like.', tag: 'test' })
        return status < 300 ? json(200, { ok: true }) : json(502, { error: `push service answered ${status}` })
      }
      case 'POST /api/push/rest-timer': {
        const n = typeof body.seconds === 'number' || typeof body.seconds === 'string' ? Number(body.seconds) : NaN
        if (!(n >= 1)) return json(400, { error: 'seconds required' })
        const due = this.now() + Math.min(3600, Math.round(n)) * 1000
        await this.book(`j:${me.id}:rest`, due, { title: clean(body.title, 60) || 'Rest over 💪', body: clean(body.next) || 'Time for your next set.', tag: 'rest-timer' })
        return json(200, { ok: true })
      }
      case 'POST /api/push/rest-timer/cancel':
        await this.st.delete(`j:${me.id}:rest`)
        return json(200, { ok: true })
      case 'POST /api/push/reminders': {
        // The page books the next days itself: [{ date: 'YYYY-MM-DD', due: ms, title, body }].
        // Each booking replaces the last one, so a day trained or a plan changed drops out.
        const old = await this.st.list({ prefix: `j:${me.id}:day:` })
        if (old.size) await this.st.delete([...old.keys()])
        const now = this.now(), days = (Array.isArray(body.days) ? body.days : [])
          .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d?.date) && Number.isFinite(d?.due) && d.due > now && d.due < now + (MAX_DAYS + 1) * 86_400_000)
          .slice(0, MAX_DAYS)
        for (const d of days) await this.book(`j:${me.id}:day:${d.date}`, d.due, { title: clean(d.title, 80) || 'Workout planned today', body: clean(d.body) || "It's on your plan. Let's go 💪", tag: 'reminder' })
        if (!days.length) await this.wake()
        return json(200, { ok: true, booked: days.length })
      }
    }
    return json(404, { error: 'not found' })
  }

  async book(key, due, msg) {
    await this.st.put(key, { due, msg })
    await this.wake()
  }

  // The alarm goes off at the earliest booking, or not at all.
  async wake() {
    let next = Infinity
    for (const j of (await this.st.list({ prefix: 'j:' })).values()) next = Math.min(next, j.due)
    if (next === Infinity) await this.st.deleteAlarm()
    else await this.st.setAlarm(Math.max(next, this.now()))
  }

  async alarm() {
    const now = this.now(), due = []
    for (const [key, j] of await this.st.list({ prefix: 'j:' })) if (j.due <= now + 1000) due.push([key, j])
    if (due.length) await this.st.delete(due.map(([k]) => k))
    await Promise.all(due.map(async ([key, j]) => {
      const id = key.split(':')[1], sub = await this.st.get('s:' + id)
      // a reminder that slept through its window (more than 30 minutes late) is not sent at all
      if (sub && !(key.includes(':day:') && now - j.due > 30 * 60_000)) await this.deliver(id, sub, j.msg)
    }))
    await this.wake()
  }

  async deliver(id, sub, msg) {
    let status = 0
    try { status = await sendPush(sub, msg, this.vapid(), { fetchImpl: this.fetchImpl }) } catch { return 0 }
    // gone for good: the browser unsubscribed or the app was removed from the home screen
    if (status === 404 || status === 410) await this.drop(id)
    return status
  }

  async drop(id) {
    const jobs = await this.st.list({ prefix: `j:${id}:` })
    await this.st.delete(['s:' + id, ...jobs.keys()])
    await this.wake()
  }
}
