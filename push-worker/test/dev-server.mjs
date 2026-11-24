// Runs the push server in Node for local testing: node test/dev-server.mjs [port]
// Same code as the Worker; storage in memory, the alarm checked every second.
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import worker, { Hub } from '../src/index.js'

const port = Number(process.argv[2]) || 8787
const v = JSON.parse(fs.readFileSync(os.homedir() + '/.fitsmarter/vapid.json', 'utf8'))
const m = new Map(); let alarm = null
const storage = {
  async get(k) { return structuredClone(m.get(k)) }, async put(k, x) { m.set(k, structuredClone(x)) },
  async delete(k) { for (const x of [].concat(k)) m.delete(x) },
  async list({ prefix = '', limit = Infinity } = {}) { return new Map([...m].filter(([k]) => k.startsWith(prefix)).sort().slice(0, limit)) },
  async setAlarm(t) { alarm = t }, async deleteAlarm() { alarm = null },
}
const env = { VAPID_PUBLIC: v.publicKey, VAPID_PRIVATE: JSON.stringify(v.privateJwk), ALLOWED_ORIGINS: 'http://localhost:5199,https://chimuel12.github.io' }
const hub = new Hub({ storage }, env)
env.HUB = { idFromName: () => 'hub', get: () => hub }
setInterval(() => { if (alarm && alarm <= Date.now()) { alarm = null; hub.alarm().catch(e => console.error('alarm', e)) } }, 1000)
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c)
  const r = await worker.fetch(new Request('http://localhost:' + port + req.url, { method: req.method, headers: req.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) }), env)
  console.log(req.method, req.url.split('?')[0], r.status)
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()))
}).listen(port, () => console.log('push server on http://localhost:' + port))
