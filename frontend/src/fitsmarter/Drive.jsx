// FitSmarter: Settings → Google Drive. Part of this AGPL fork.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { MOBILE } from '../lib/mobile.js'
import { IOS_APP } from './Compete.jsx'
import { driveState, onDrive, connectDrive, disconnectDrive, chooseFolder, syncNow } from './drive.js'
import './fitsmarter.css'

const toast = m => { try { useUI.getState().toast?.(m) } catch { /* */ } }
const when = ts => {
  if (!ts) return t('Not yet')
  const m = Math.round((Date.now() - ts) / 6e4)
  return m < 1 ? t('Just now') : m < 60 ? t('{0} min ago', m) : new Date(ts).toLocaleString()
}
const fail = e => { if (e?.code !== 'cancelled' && e?.code !== 'auth/popup-closed-by-user') toast(e?.message || t('Sync failed')) }

export function useDrive() {
  const [s, set] = useState(driveState)
  useEffect(() => onDrive(() => set(driveState())), [])
  return s
}

export default function Drive() {
  const s = useDrive(), nav = useNavigate()
  const [, tick] = useState(0)
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 30e3); return () => clearInterval(i) }, [])
  return <div className="narrow">
    <div className="sp-nav"><button className="sp-back" onClick={() => nav('/settings')}><span>‹ {t('Settings')}</span></button></div>
    <div className="hdr"><div style={{ flex: 1 }}><h1>Google Drive</h1><div className="sub">{t('Your data, in your own Drive, on every device')}</div></div></div>
    {IOS_APP ? <div className="card fs-drive"><p className="fs-muted">{t('On iPhone, open FitSmarter in Safari to use Google Drive sync: chimuel12.github.io/fitsmarter-gym')}</p></div> : !s.on ? <div className="card fs-drive">
      <p className="fs-muted">{t('Sign in with Google and FitSmarter keeps a copy of all your data in a folder of your Drive, and keeps every phone and browser with your account in sync. It sees only its own file, never the rest of your Drive.')}</p>
      <button className="btn fs-full fs-primary" disabled={s.busy} onClick={() => connectDrive().catch(fail)}>{s.busy ? t('Connecting…') : t('Continue with Google')}</button>
    </div> : <div className="card fs-drive">
      <div className="fs-kv"><span>{t('Account')}</span><b>{s.email || '–'}</b></div>
      <div className="fs-kv"><span>{t('Folder')}</span>{s.folderId
        ? <a href={`https://drive.google.com/drive/folders/${s.folderId}`} target="_blank" rel="noopener noreferrer"><b>{s.folderName || 'FitSmarter'}</b></a>
        : <b>{s.folderName || 'FitSmarter'}</b>}</div>
      <div className="fs-kv"><span>{t('Last sync')}</span><b>{s.busy ? t('Syncing…') : when(s.last)}</b></div>
      {s.error && <p className="fs-small fs-warn">{s.error === 'tap' ? t('Tap Sync now to reconnect Google Drive.') : s.error}</p>}
      <button className="btn fs-full fs-primary" disabled={s.busy} onClick={() => syncNow({ interactive: true }).then(() => toast(t('Synced'))).catch(fail)}>{t('Sync now')}</button>
      <div className="fs-two">
        {!MOBILE && <button className="btn" disabled={s.busy} onClick={() => chooseFolder().catch(fail)}>{t('Change folder')}</button>}
        <button className="btn fs-danger" onClick={disconnectDrive}>{t('Disconnect')}</button>
      </div>
      <p className="fs-small fs-muted">{MOBILE
        ? t('Syncs on its own when you open the app and after each change. To keep it somewhere else, move the folder in Google Drive: FitSmarter follows it.')
        : t('Syncs on its own when you open the page and after each change. You can also move the folder anywhere in your Drive.')}</p>
    </div>}
  </div>
}
