// FitSmarter: a one-time card on Home in the phone app, so the workout-day reminder is one tap
// away instead of buried in Settings → Reminders. Same switch, same notification (lib/mobile.js).
import { useState } from 'react'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { MOBILE, syncReminder } from '../lib/mobile.js'
import { STANDALONE } from '../lib/demo.js'
import { localTZ } from '../lib/format.js'
import './fitsmarter.css'

const KEY = 'fs_remind_card'
const dismissed = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

export default function ReminderCard() {
  const S = useStore(s => s.S), update = useStore(s => s.update)
  const [time, setTime] = useState(S.reminder?.time && S.reminder.time !== '08:00' ? S.reminder.time : '18:00')
  const [gone, setGone] = useState(dismissed)
  if (!STANDALONE || !MOBILE || S.reminder?.on || gone) return null
  const hide = () => { try { localStorage.setItem(KEY, '1') } catch { /* private */ } setGone(true) }
  const on = async () => {
    const reminder = { ...(S.reminder || DEF.reminder), on: true, nudge: true, time, tz: localTZ() }
    const ok = await syncReminder({ ...S, reminder }, true)
    if (!ok) { try { useUI.getState().toast?.(t('Allow notifications for FitSmarter in your phone settings.')) } catch { /* */ } return }
    update(s => { s.reminder = reminder })
    hide()
  }
  return <div className="card fs-remind">
    <div className="fs-remind-h"><span aria-hidden="true">🔔</span><b>{t('Never miss a workout day')}</b></div>
    <p className="fs-muted">{t('A notification on the days your plan has a workout, and a nudge if the day goes by without one.')}</p>
    <label className="fs-remind-t">{t('Remind me at')}<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
    <div className="fs-two"><button className="btn fs-primary" onClick={on}>{t('Turn on')}</button><button className="btn" onClick={hide}>{t('Not now')}</button></div>
  </div>
}
