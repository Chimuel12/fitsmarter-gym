import assert from 'node:assert/strict'
import { b64u, unb64u } from '../src/webpush.js'

// The browser's side, written from the RFC independently of encrypt()
const te = new TextEncoder()
async function hk(salt, ikm, info, n) { const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, n * 8)) }
export async function decrypt(body, uaPair, auth) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen)
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', uaPair.publicKey))
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPair.privateKey, 256))
  const ikm = await hk(unb64u(auth), shared, new Uint8Array([...te.encode('WebPush: info\0'), ...uaPub, ...asPub]), 32)
  const cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12)
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct))
  assert.equal(pt.at(-1), 2)
  return new TextDecoder().decode(pt.slice(0, -1))
}
export async function browser() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const auth = b64u(crypto.getRandomValues(new Uint8Array(16)))
  return { pair, keys: { p256dh: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)), auth } }
}

