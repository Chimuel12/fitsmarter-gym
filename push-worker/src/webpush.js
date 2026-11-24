// FitSmarter push server: Web Push with nothing but WebCrypto, so it runs on Cloudflare Workers
// (and in Node for the tests) without a dependency. Two standards:
// - RFC 8291 message encryption (aes128gcm): the payload is encrypted to the browser's own keys,
//   so the push service (Apple, Google, Mozilla) only carries ciphertext.
// - RFC 8292 VAPID: a short ES256-signed token says which server sends, so the push service
//   accepts it only from the holder of the private key the browser subscribed with.
const te = new TextEncoder()
const subtle = crypto.subtle

export const b64u = buf => {
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const unb64u = str => {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0))
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}
async function hkdf(salt, ikm, info, len) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8))
}
// A P-256 point (65 bytes, 0x04 || x || y) as a JWK, private when `d` is given.
const pointJwk = (raw, d) => ({ kty: 'EC', crv: 'P-256', x: b64u(raw.slice(1, 33)), y: b64u(raw.slice(33, 65)), ...(d ? { d: b64u(d) } : {}), ext: true })

/** RFC 8291: the body to POST for `payload` (a string) to a browser with keys p256dh and auth.
 *  `fixed` pins the salt and the sender's key pair (the RFC's example in the tests). */
export async function encrypt(payload, { p256dh, auth }, fixed = null) {
  const ua = unb64u(p256dh), secret = unb64u(auth)
  if (ua.length !== 65 || ua[0] !== 4 || secret.length !== 16) throw new Error('bad subscription keys')
  let asPriv, asPub
  if (fixed) {
    asPub = unb64u(fixed.asPublic)
    asPriv = await subtle.importKey('jwk', pointJwk(asPub, unb64u(fixed.asPrivate)), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  } else {
    const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    asPriv = pair.privateKey
    asPub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey))
  }
  const uaKey = await subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPriv, 256))
  const ikm = await hkdf(secret, shared, concat(te.encode('WebPush: info\0'), ua, asPub), 32)
  const salt = fixed ? unb64u(fixed.salt) : crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12)
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // one record: the payload and the 0x02 delimiter that marks the last record, no padding
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(te.encode(payload), new Uint8Array([2]))))
  const rs = new Uint8Array([0, 0, 16, 0])   // record size 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct)
}

/** RFC 8292: the Authorization header for one endpoint. `vapid` = { publicKey (b64u point), privateJwk, subject }. */
export async function vapidHeader(endpoint, vapid, now = Date.now()) {
  const aud = new URL(endpoint).origin
  const head = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })))
  const key = await subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${head}.${claims}`))   // raw r || s, as JWT wants
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`
}

/** Sends one notification ({ title, body, tag }) and answers the push service's status. */
export async function sendPush(sub, message, vapid, { ttl = 3600, fetchImpl = fetch } = {}) {
  const body = await encrypt(JSON.stringify(message), sub.keys)
  const res = await fetchImpl(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(sub.endpoint, vapid), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'high' },
    body,
  })
  return res.status
}
