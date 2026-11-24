import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hub, endpointError } from '../src/hub.js'
import worker from '../src/index.js'
import { b64u } from '../src/webpush.js'
import { decrypt, browser } from './helpers.js'

function storage() {
  const m = new Map(); let alarm = null
  return {
    m, get alarm() { return alarm },
    async get(k) { return structuredClone(m.get(k)) },
    async put(k, v) { m.set(k, structuredClone(v)) },
    async delete(k) { for (const x of [].concat(k)) m.delete(x) },
    async list({ prefix = '', limit = Infinity } = {}) { return new Map([...m].filter(([k]) => k.startsWith(prefix)).sort().slice(0, limit)) },
    async setAlarm(t) { alarm = t }, async deleteAlarm() { alarm = null },
  }
}
async function setup() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const env = { VAPID_PUBLIC: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)), VAPID_PRIVATE: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)), ALLOWED_ORIGINS: 'https://chimuel12.github.io' }
  const st = storage(), clock = { t: 1_800_000_000_000 }, sent = [], service = { status: 201 }
  const b = await browser(), endpoint = 'https://web.push.apple.com/QH' + b64u(crypto.getRandomValues(new Uint8Array(12)))
  const fetchImpl = async (url, init) => { sent.push({ url, msg: JSON.parse(await decrypt(init.body, b.pair, b.keys.auth)), auth: init.headers.Authorization }); return new Response(null, { status: service.status }) }
  const hub = new Hub({ storage: st }, env, { now: () => clock.t, fetchImpl })
  const call = async (method, path, body) => { const r = await hub.fetch(new Request('https://push.example' + path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })); return { status: r.status, body: await r.json() } }
  const me = { endpoint, auth: b.keys.auth }
  return { env, st, clock, sent, service, hub, call, me, sub: { endpoint, keys: b.keys } }
}

test('accepts only real push services', () => {
  assert.equal(endpointError('https://web.push.apple.com/abc'), null)
  assert.equal(endpointError('https://fcm.googleapis.com/fcm/send/x'), null)
  assert.ok(endpointError('https://evil.example/abc'))
  assert.ok(endpointError('http://web.push.apple.com/abc'))
  assert.ok(endpointError('https://web.push.apple.com.evil.example/abc'))
})

test('subscribe, status, and a test notification the browser can read', async () => {
  const { call, me, sub, sent } = await setup()
  assert.equal((await call('GET', '/api/push/public-key')).body.key.length, 87)
  assert.equal((await call('POST', '/api/push/subscribe', { subscription: sub, deviceId: 'device-123' })).status, 200)
  assert.deepEqual((await call('GET', '/api/push/status?endpoint=' + encodeURIComponent(me.endpoint))).body, { subscribed: true, deviceId: 'device-123' })
  assert.equal((await call('POST', '/api/push/test', me)).status, 200)
  assert.equal(sent[0].msg.tag, 'test')
  assert.match(sent[0].auth, /^vapid t=.+, k=.+$/)
  assert.equal((await call('POST', '/api/push/test', me)).status, 429)   // not twice in ten seconds
})

test('nothing works without the subscription\'s auth secret, and nobody can re-key it', async () => {
  const { call, me, sub } = await setup()
  await call('POST', '/api/push/subscribe', { subscription: sub })
  assert.equal((await call('POST', '/api/push/test', { ...me, auth: 'AAAAAAAAAAAAAAAAAAAAAA' })).status, 403)
  assert.equal((await call('POST', '/api/push/rest-timer', { endpoint: me.endpoint, seconds: 5 })).status, 403)
  const other = await browser()
  assert.equal((await call('POST', '/api/push/subscribe', { subscription: { endpoint: me.endpoint, keys: other.keys } })).status, 409)
})

test('the end of a rest goes out when it is due, and a cancel takes it back', async () => {
  const { call, me, sub, sent, st, clock, hub } = await setup()
  await call('POST', '/api/push/subscribe', { subscription: sub })
  await call('POST', '/api/push/rest-timer', { ...me, seconds: 90, next: 'Bench press, 80 kg × 8' })
  assert.equal(st.alarm, clock.t + 90_000)
  clock.t += 60_000; await hub.alarm()
  assert.equal(sent.length, 0)
  clock.t += 30_000; await hub.alarm()
  assert.deepEqual(sent[0].msg, { title: 'Rest over 💪', body: 'Bench press, 80 kg × 8', tag: 'rest-timer' })
  assert.equal(st.alarm, null)
  await call('POST', '/api/push/rest-timer', { ...me, seconds: 60 })
  await call('POST', '/api/push/rest-timer', { ...me, seconds: 120 })   // a new rest replaces the old
  await call('POST', '/api/push/rest-timer/cancel', me)
  clock.t += 200_000; await hub.alarm()
  assert.equal(sent.length, 1)
})

test('workout-day reminders: booked by the page, replaced on every booking, never sent hours late', async () => {
  const { call, me, sub, sent, st, clock, hub } = await setup()
  await call('POST', '/api/push/subscribe', { subscription: sub })
  const day = 86_400_000, t0 = clock.t
  const r = await call('POST', '/api/push/reminders', { ...me, days: [
    { date: '2027-01-15', due: t0 + 3_600_000, title: '🏋️ Push today', body: 'On your plan' },
    { date: '2027-01-16', due: t0 + day + 3_600_000, title: '🦵 Legs today' },
    { date: '2027-01-01', due: t0 - 1000, title: 'past' },
    { date: '2027-03-01', due: t0 + 40 * day, title: 'too far' }] })
  assert.equal(r.body.booked, 2)
  assert.equal(st.alarm, t0 + 3_600_000)
  // the first day got trained: the page books again without it
  await call('POST', '/api/push/reminders', { ...me, days: [{ date: '2027-01-16', due: t0 + day + 3_600_000, title: '🦵 Legs today' }] })
  assert.equal(st.alarm, t0 + day + 3_600_000)
  clock.t = t0 + day + 3_600_000; await hub.alarm()
  assert.deepEqual(sent.map(s => s.msg.title), ['🦵 Legs today'])
  await call('POST', '/api/push/reminders', { ...me, days: [{ date: '2027-01-17', due: clock.t + day, title: 'late' }] })
  clock.t += day + 3 * 3_600_000; await hub.alarm()   // the server slept through it: dropped
  assert.equal(sent.length, 1)
})

test('a subscription the push service says is gone is forgotten with its bookings', async () => {
  const { call, me, sub, st, service, clock, hub } = await setup()
  await call('POST', '/api/push/subscribe', { subscription: sub })
  await call('POST', '/api/push/rest-timer', { ...me, seconds: 5 })
  await call('POST', '/api/push/reminders', { ...me, days: [{ date: '2027-01-15', due: clock.t + 86_400_000, title: 'x' }] })
  service.status = 410
  clock.t += 5000; await hub.alarm()
  assert.equal([...st.m.keys()].length, 0)
  assert.equal(st.alarm, null)
})

test('the worker answers CORS only for the app\'s own site', async () => {
  const env = { ALLOWED_ORIGINS: 'https://chimuel12.github.io', HUB: { idFromName: () => 1, get: () => ({ fetch: async () => new Response('{"key":"k"}', { status: 200 }) }) } }
  const pre = await worker.fetch(new Request('https://w.example/api/push/subscribe', { method: 'OPTIONS', headers: { Origin: 'https://chimuel12.github.io' } }), env)
  assert.equal(pre.status, 204)
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://chimuel12.github.io')
  const ok = await worker.fetch(new Request('https://w.example/api/push/public-key', { headers: { Origin: 'https://chimuel12.github.io' } }), env)
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://chimuel12.github.io')
  const bad = await worker.fetch(new Request('https://w.example/api/push/public-key', { headers: { Origin: 'https://evil.example' } }), env)
  assert.equal(bad.status, 403)
})
