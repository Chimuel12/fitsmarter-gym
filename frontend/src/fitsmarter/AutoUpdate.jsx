// FitSmarter: updates without hunting for them. The Android app checks this repository's latest
// release once a day when it opens (lib/update.js) and, when there is a newer one, asks once with
// a single button. The download is checked against the release's SHA-256 before Android's own
// installer opens; Android always asks the person to confirm the install itself.
import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { isAndroid } from '../lib/mobile.js'
import { getChannel } from '../lib/channel.js'
import { checkForUpdate, downloadAndInstall, fetchChecksum, forgetDownloadedUpdate } from '../lib/update.js'
import { confirmSheet } from '../sheets.jsx'

const SEEN = 'fs_update_asked'
const DAY = 864e5

function Progress({ bind }) {
  const [pct, setPct] = useState(0)
  useEffect(() => { bind((got, total) => setPct(total > 0 ? Math.min(100, Math.round(got / total * 100)) : 0)) }, [bind])
  return <div style={{ textAlign: 'center', padding: '8px 0' }}>
    <h3>{t('Downloading update…')}</h3>
    <div style={{ margin: '16px 0', height: 6, borderRadius: 3, background: 'var(--fill-3)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct + '%', background: 'var(--acc)', borderRadius: 3, transition: 'width .2s' }} /></div>
    <div className="muted small">{pct ? t('{0} %', pct) : t('Starting download…')}</div>
  </div>
}

/** Download, verify and hand the update to Android's installer, with a progress sheet. */
export async function installUpdate(info) {
  let close = null, set = () => {}
  useUI.getState().openSheet(c => { close = c; return <Progress bind={fn => { set = fn }} /> }, { locked: true })
  try {
    const hash = await fetchChecksum(info.hashUrl, info.hashApiUrl).catch(() => null)
    if (!/^[0-9a-f]{64}$/i.test(hash || '')) throw new Error(t('Checksum not available, so not installing'))
    await downloadAndInstall(info.apkUrl, hash, (got, total) => set(got, total), info.apkApiUrl)
  } catch (e) {
    try { useUI.getState().toast?.(t('Update failed: {0}', e.message)) } catch { /* no toast */ }
  } finally { close && close() }
}

export default function AutoUpdate() {
  useEffect(() => {
    let gone = false
    ;(async () => {
      if (!(await isAndroid()) || (await getChannel()) !== 'sideload') return
      const info = await checkForUpdate().catch(() => null)
      if (gone || !info) return
      if (!info.hasUpdate) { forgetDownloadedUpdate(); return }
      if (!info.apkUrl) return
      let asked = {}
      try { asked = JSON.parse(localStorage.getItem(SEEN) || '{}') } catch { /* fresh */ }
      if (asked.v === info.latestVersion && Date.now() - asked.at < DAY) return
      try { localStorage.setItem(SEEN, JSON.stringify({ v: info.latestVersion, at: Date.now() })) } catch { /* private */ }
      confirmSheet({
        title: t('FitSmarter {0} is ready', info.latestVersion),
        message: t('Update now. Your data stays on this phone.'),
        confirmText: t('Update'),
        onConfirm: () => installUpdate(info),
      })
    })()
    return () => { gone = true }
  }, [])
  return null
}
