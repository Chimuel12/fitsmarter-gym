import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encrypt, vapidHeader, b64u, unb64u } from '../src/webpush.js'
import { decrypt, browser } from './helpers.js'
const te = new TextEncoder()

// RFC 8291 Appendix A
const A = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  out: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

test('matches the RFC 8291 example byte for byte', async () => {
  const out = await encrypt(A.plaintext, { p256dh: A.uaPublic, auth: A.auth }, { salt: A.salt, asPrivate: A.asPrivate, asPublic: A.asPublic })
  assert.equal(b64u(out), A.out)
})

test('a fresh browser can read what was sent to it', async () => {
  const b = await browser()
  const body = await encrypt('{"title":"Rest over 💪"}', b.keys)
  assert.equal(await decrypt(body, b.pair, b.keys.auth), '{"title":"Rest over 💪"}')
})

test('the VAPID token verifies with the public key and names the push service', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publicKey = b64u(await crypto.subtle.exportKey('raw', pair.publicKey))
  const h = await vapidHeader('https://web.push.apple.com/abc', { publicKey, privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), subject: 'https://example.org' }, 1_700_000_000_000)
  const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/)
  assert.equal(k, publicKey)
  const [a, b, s] = jwt.split('.')
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, unb64u(s), te.encode(`${a}.${b}`)))
  const claims = JSON.parse(new TextDecoder().decode(unb64u(b)))
  assert.deepEqual(claims, { aud: 'https://web.push.apple.com', exp: 1_700_000_000 + 43200, sub: 'https://example.org' })
})
