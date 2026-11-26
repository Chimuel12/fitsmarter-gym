// FitSmarter: your first workout is saved in your own cloud. A new user (nothing logged yet, Google
// Drive not connected) who starts a workout is asked to connect Google Drive first, so a cleared
// browser, a lost phone or a second device never costs the progress. Connecting also brings back
// what an earlier install already saved there. The only other way out is to cancel the workout.
import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { readCfg, connectDrive } from './drive.js'

/** True when this state starts a first workout with no cloud behind it. */
export const needsCloud = (S, cfg = readCfg()) =>
  !!S?.active && !S.active.backfill && !S.active.editingWorkoutId && !(S.workouts || []).length && !cfg.on

function CloudSheet({ close, cancel }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const connect = () => {
    setBusy(true); setErr('')
    connectDrive().then(() => close(), e => { setBusy(false); setErr(e?.code === 'cancelled' ? '' : e?.message || t('Google Drive did not answer. Try again.')) })
  }
  return <div className="fs-sheet fs-cloud">
    <div className="fs-cloud-icon" aria-hidden="true">☁️</div>
    <h2>{t('Save your workouts in your cloud')}</h2>
    <p>{t('Before your first workout, connect your Google Drive. Every workout is saved there, so clearing the browser, losing your phone or switching devices never loses your progress, and your phone and computer show the same history.')}</p>
    <p className="fs-small fs-muted">{t('FitSmarter only sees its own file in your Drive, nothing else. If you used FitSmarter before, your history comes back.')}</p>
    {err && <p className="fs-cloud-err" role="alert">{err}</p>}
    <button className="btn fs-primary fs-full" disabled={busy} onClick={connect}>{busy ? t('Connecting…') : t('Connect Google Drive')}</button>
    <button className="btn fs-full" disabled={busy} onClick={cancel}>{t('Cancel this workout')}</button>
  </div>
}

let watching = false, open = false
/** Watches for a first workout without a cloud and asks to connect before it goes on. */
export function watchFirstWorkout({ useStore, useUI, navigate }) {
  if (watching) return
  watching = true
  const check = () => {
    const st = useStore.getState()
    if (open || st.tourSandbox || !needsCloud(st.S)) return
    open = true
    const done = () => { open = false }
    useUI.getState().openSheet(close => <CloudSheet
      close={() => { done(); close() }}
      cancel={() => { done(); close(); useStore.getState().update(s => { s.active = null }); useUI.getState().stopRest?.(); navigate('/home') }} />,
    { kind: 'center', locked: true })
  }
  check()
  useStore.subscribe(check)
}
