// FitSmarter push server (Cloudflare Worker): the browser-only app on GitHub Pages has no server
// of its own, so this one sends its notifications: the end of a rest, the workout-day reminder
// and the test. Every request goes to one Durable Object (hub.js); this file only answers CORS
// for the app's own origins.
export { Hub } from './hub.js'

const origins = env => String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
function cors(req, env) {
  const o = req.headers.get('Origin') || ''
  return origins(env).includes(o)
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
    : null
}

export default {
  async fetch(req, env) {
    const c = cors(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: c ? 204 : 403, headers: c || {} })
    // A browser on another site gets nothing; a request with no Origin (curl, the worker) is fine.
    if (req.headers.get('Origin') && !c) return new Response('{"error":"origin not allowed"}', { status: 403, headers: { 'Content-Type': 'application/json' } })
    if (!new URL(req.url).pathname.includes('/api/push/')) return new Response('FitSmarter push server', { status: 200 })
    const hub = env.HUB.get(env.HUB.idFromName('hub'))
    const res = await hub.fetch(req)
    const out = new Response(res.body, res)
    for (const [k, v] of Object.entries(c || {})) out.headers.set(k, v)
    out.headers.set('Cache-Control', 'no-store')
    return out
  },
}
