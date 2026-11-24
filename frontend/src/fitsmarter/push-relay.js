// FitSmarter: the browser-only app (GitHub Pages) has no server, so its push notifications go
// through the FitSmarter push server (push-worker/, a Cloudflare Worker) at VITE_PUSH_URL. It
// speaks the same /api/push/* routes as openGym's api, without accounts: a browser is its push
// subscription, and every call but subscribe carries the subscription's endpoint and auth secret.
// The workout-day reminder is booked from here, because only the page knows the plan and its clock.
import { MOBILE } from '../lib/mobile.js'
import { STANDALONE } from '../lib/demo.js'
import { todayISO, isoOf } from '../lib/format.js'
import { effectiveRoutine } from '../lib/history.js'
import { excusedOn } from '../lib/day-notes.js'

export const PUSH_URL = STANDALONE && !MOBILE ? String(import.meta.env.VITE_PUSH_URL || '').replace(/\/+$/, '') : ''

async function mySubscription() {
  try { return (await navigator.serviceWorker?.getRegistration?.())?.pushManager?.getSubscription?.() || null } catch { return null }
}

/** Like api(), against the push server. */
export async function relay(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase()
  let body = opts.body
  if (method === 'POST' && !path.endsWith('/subscribe')) {
    const given = body ? JSON.parse(body) : {}
    if (!given.auth) {
      const j = (await mySubscription())?.toJSON?.()
      Object.assign(given, { endpoint: given.endpoint || j?.endpoint, auth: j?.keys?.auth })
    }
    body = JSON.stringify(given)
  }
  const res = await fetch(PUSH_URL + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body } : {}) })
  let data = {}
  try { data = await res.json() } catch { /* not JSON */ }
  if (!res.ok) throw Object.assign(new Error(data.error || 'HTTP ' + res.status), { status: res.status, body: data })
  return data
}

export const REMINDER_DAYS = 14
/** The next days with a workout planned, at the reminder's time on this device's clock. */
export function reminderDays(S, now = new Date()) {
  const r = S?.reminder
  if (!r?.on) return []
  const [hh, mm] = String(r.time || '08:00').split(':').map(Number)
  const out = []
  for (let i = 0; i < REMINDER_DAYS; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh || 0, mm || 0)
    if (at <= now) continue
    const iso = isoOf(at)
    if ((S.workouts || []).some(w => (w?.d || w?.date) === iso)) continue
    try {
      if (excusedOn(S, iso)) continue
      const routine = effectiveRoutine(S, iso)
      if (!routine) continue
      out.push({ date: iso, due: at.getTime(), title: `${routine.name} today 💪`, body: "It's on your plan. Let's go 💪" })
    } catch { /* a plan this cannot read books nothing for that day */ }
  }
  return out
}

/** Keeps the push server's bookings in step with the plan: on start and after every change. */
let started = false
export function watchReminders(useStore) {
  if (started || !PUSH_URL) return
  started = true
  let last = null, tm = null
  const book = async () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !(await mySubscription())) return
    const days = reminderDays(useStore.getState().S)
    const key = todayISO() + JSON.stringify(days)
    if (key === last) return
    try { await relay('/api/push/reminders', { method: 'POST', body: JSON.stringify({ days }) }); last = key } catch { /* tried again on the next change */ }
  }
  book()
  useStore.subscribe(() => { clearTimeout(tm); tm = setTimeout(book, 2000) })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) book() })
}
