// FitSmarter: compete with friends (groups, leaderboard, feed). Part of this AGPL fork.
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { TIERS, profileOf } from './tiers.js'
import { Gem, GemDefs } from './Hub.jsx'
import { watchUser, signInGoogle, signInEmail, signOutFs, saveProfile, profilesOf, watchGroups, createGroup, joinGroup, leaveGroup, watchFeed, kudos, syncWorkouts, METRICS, board, getConsent, giveConsent, updateChoices, exportMine, reauth, deleteAccount, PRIVACY_URL, KEEP_DAYS } from './compete.js'
import { MOBILE, shareExportBlob } from '../lib/mobile.js'
import './fitsmarter.css'

// The iPhone app: Google refuses its sign-in inside an app's web view and there is no native one here.
export const IOS_APP = typeof window !== 'undefined' && window.Capacitor?.getPlatform?.() === 'ios'
const GID_KEY = 'fs_gid'
const tierById = id => TIERS.find(x => x.id === id) || TIERS[0]
const toast = msg => { try { useUI.getState().toast?.(msg) } catch { /* no toast in this build */ } }
const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const Avatar = ({ p, size = 36 }) => <span className="fs-av" style={{ width: size, height: size, fontSize: size * 0.38 }}>
  {p?.photo ? <img src={p.photo} alt="" referrerPolicy="no-referrer" /> : initials(p?.name)}</span>
const ago = ts => { const m = Math.round((Date.now() - ts) / 6e4); if (m < 60) return t('{0} min ago', Math.max(1, m)); const h = Math.round(m / 60); if (h < 24) return t('{0} h ago', h); return new Date(ts).toLocaleDateString() }
const fmtDur = s => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m` }

function SignIn() {
  const [email, setEmail] = useState(''), [pass, setPass] = useState(''), [busy, setBusy] = useState(false)
  const go = async create => {
    setBusy(true)
    try { await signInEmail(email, pass, create) } catch (e) {
      toast({ 'auth/invalid-credential': t('Wrong email or password'), 'auth/email-already-in-use': t('That email already has an account'), 'auth/weak-password': t('Use at least 6 characters') }[e?.code] || t('Sign-in failed'))
    } finally { setBusy(false) }
  }
  return <div className="card fs-signin">
    <h3>{t('Compete with friends')}</h3>
    {!IOS_APP && <button className="btn fs-full" disabled={busy} onClick={() => signInGoogle().catch(e => { if (e?.code !== 'cancelled' && e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') toast(t('Google sign-in failed') + (e?.code ? ` (${e.code})` : '')) })}>{t('Continue with Google')}</button>}
    {!IOS_APP && <div className="fs-or">{t('or with email')}</div>}
    <label className="fs-field">{t('Email')}<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="fs-field">{t('Password')}<input type="password" autoComplete="current-password" value={pass} onChange={e => setPass(e.target.value)} /></label>
    <div className="fs-two"><button className="btn" disabled={busy || !email || pass.length < 6} onClick={() => go(false)}>{t('Sign in')}</button>
      <button className="btn" disabled={busy || !email || pass.length < 6} onClick={() => go(true)}>{t('Create account')}</button></div>
  </div>
}

function askSheet(title, label, placeholder, onOk, upper = false) {
  useUI.getState().openSheet(close => {
    let v = ''
    return <div className="fs-sheet"><h2>{title}</h2>
      <label className="fs-field">{label}<input autoFocus placeholder={placeholder} maxLength={upper ? 6 : 40} style={upper ? { textTransform: 'uppercase', letterSpacing: '.2em', fontWeight: 700 } : undefined}
        onChange={e => { v = e.target.value }} onKeyDown={e => { if (e.key === 'Enter') { close(); onOk(v) } }} /></label>
      <button className="btn fs-full" onClick={() => { close(); onOk(v) }}>{t('Done')}</button></div>
  })
}

/* ---------- privacy: a clear yes before anything is shared ---------- */
const Check = ({ on, set, children }) => <label className="fs-check"><input type="checkbox" checked={on} onChange={e => set(e.target.checked)} /><span>{children}</span></label>

function Consent({ onYes, onNo }) {
  const [photo, setPhoto] = useState(false), [weights, setWeights] = useState(false), [past, setPast] = useState(false)
  const [age, setAge] = useState(false), [ok, setOk] = useState(false), [busy, setBusy] = useState(false)
  return <div className="card fs-consent">
    <h3>{t('Before you compete')}</h3>
    <p>{t('Your groups will see a summary of each workout you finish: date, duration, number of sets, volume, points and the level of your best lifts, with your name. Only members of your groups see it.')}</p>
    <p className="fs-small fs-muted">{t('Never shared: your body weight, height, age, measurements, notes or full history. The summaries are kept in Google Firebase and deleted after {0} days. You can leave a group, download or delete everything at any time.', KEEP_DAYS)}</p>
    <div className="fs-choices">
      <small className="fs-muted">{t('You choose (all off by default)')}</small>
      <Check on={photo} set={setPhoto}>{t('Show my Google profile picture')}</Check>
      <Check on={weights} set={setWeights}>{t('Show the weights and reps of my best lifts')}</Check>
      <Check on={past} set={setPast}>{t('Also share my workouts from the last 30 days')}</Check>
    </div>
    <div className="fs-choices">
      <Check on={age} set={setAge}>{t('I am 16 or older')}</Check>
      <Check on={ok} set={setOk}>{t('I agree to share this with my groups')} (<a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">{t('privacy policy')}</a>)</Check>
    </div>
    <button className="btn fs-full fs-primary" disabled={!age || !ok || busy} onClick={() => { setBusy(true); onYes({ photo, weights, past }).catch(() => { setBusy(false); toast(t('Could not save. Try again.')) }) }}>{t('Agree and continue')}</button>
    <button className="btn fs-full" disabled={busy} onClick={onNo}>{t('Not now')}</button>
  </div>
}

function download(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  if (MOBILE) return shareExportBlob(blob, name).catch(() => {})
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  toast(t('File saved'))
}

function deleteSheet(user, groups) {
  const email = (user.providerData || []).some(p => p.providerId === 'password')
  useUI.getState().openSheet(close => {
    let pass = ''
    const go = async e => {
      const btn = e.currentTarget; btn.disabled = true
      try {
        await reauth(user, pass)          // first, straight from the tap: Google's window may open only now
        await deleteAccount(user, groups)
        close(); toast(t('Your friends account and everything you shared are deleted'))
      } catch (err) {
        btn.disabled = false
        if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return
        toast(err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' ? t('Wrong password') : t('Could not delete. Try again.'))
      }
    }
    return <div className="fs-sheet"><h2>{t('Delete my friends account?')}</h2>
      <p>{t('This deletes your profile, every workout summary and kudos you shared in your groups, and your sign-in. It cannot be undone. Your workouts on this device and in Google Drive stay.')}</p>
      {email && <label className="fs-field">{t('Password')}<input type="password" autoComplete="current-password" onChange={e => { pass = e.target.value }} /></label>}
      <button className="btn fs-full fs-danger" onClick={go}>{t('Delete for good')}</button>
      <button className="btn fs-full" onClick={close}>{t('Cancel')}</button></div>
  })
}

function Privacy({ user, consent, setConsent, groups }) {
  const set = patch => updateChoices(user, consent, patch).then(setConsent, () => toast(t('Could not save. Try again.')))
  return <div className="card fs-privacy">
    <h3>{t('Your privacy')}</h3>
    <Check on={!!consent.photo} set={v => set({ photo: v })}>{t('Show my Google profile picture')}</Check>
    <Check on={!!consent.weights} set={v => set({ weights: v })}>{t('Show the weights and reps of my best lifts')}</Check>
    <p className="fs-small fs-muted">{t('Summaries are deleted after {0} days. Leaving a group deletes what you shared in it.', KEEP_DAYS)}</p>
    <div className="fs-two">
      <button className="btn" onClick={() => exportMine(user, groups).then(d => download(d, 'fitsmarter-friends-data.json'), () => toast(t('Could not download. Try again.')))}>{t('Download my data')}</button>
      <button className="btn fs-danger" onClick={() => deleteSheet(user, groups)}>{t('Delete my account')}</button>
    </div>
    <a className="fs-small" href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">{t('Privacy policy')}</a>
  </div>
}

export default function Compete() {
  const S = useStore(s => s.S)
  const prof = useMemo(() => profileOf(S, { height: Number(localStorage.getItem('fs_height')) || 0 }), [S])
  const [user, setUser] = useState(undefined)
  const [groups, setGroups] = useState([])
  const [gid, setGid] = useState(() => localStorage.getItem(GID_KEY) || '')
  const [posts, setPosts] = useState([])
  const [people, setPeople] = useState({})
  const [period, setPeriod] = useState('week'), [metric, setMetric] = useState('points')
  const [consent, setConsent] = useState(undefined)   // undefined: loading, null: not agreed yet
  const name = user ? (people[user.uid]?.name || user.displayName || (user.email || '').split('@')[0]) : ''

  useEffect(() => { let off; watchUser(u => setUser(u || null)).then(f => { off = f }).catch(() => setUser(null)); return () => off && off() }, [])
  useEffect(() => { setConsent(undefined); if (user) getConsent(user.uid).then(setConsent, () => setConsent(null)) }, [user])
  const agreed = !!(user && consent)
  useEffect(() => { if (agreed) saveProfile(user, null, consent).catch(() => {}) }, [agreed])
  useEffect(() => { // an invite link: #/compete?join=CODE (after your yes)
    if (!agreed) return
    const code = new URLSearchParams(location.hash.split('?')[1] || '').get('join')
    if (!code) return
    history.replaceState(null, '', location.pathname + '#/compete')
    joinGroup(user.uid, code).then(id => { setGid(id); toast(t('You joined the group')) }).catch(e => toast(e.message))
  }, [agreed])
  useEffect(() => {
    if (!user) return
    let off; watchGroups(user.uid, gs => { setGroups(gs); if (!gs.find(g => g.id === gid)) setGid(gs[0]?.id || '') }).then(f => { off = f })
    return () => off && off()
  }, [user])
  useEffect(() => {
    if (!user || !gid) { setPosts([]); return }
    localStorage.setItem(GID_KEY, gid)
    const d = new Date(), since = Math.min(+new Date(d.getFullYear(), d.getMonth(), 1), Date.now() - 14 * 864e5)
    let off; watchFeed(gid, since, setPosts).then(f => { off = f })
    return () => off && off()
  }, [user, gid])
  useEffect(() => { // share your recent workouts with your groups
    if (!agreed || !groups.length) return
    syncWorkouts(user, name, S, prof, groups, consent).catch(() => {})
  }, [agreed, consent, groups, S?.workouts?.length])
  const g = groups.find(x => x.id === gid)
  useEffect(() => { if (g) profilesOf(g.members).then(setPeople).catch(() => {}) }, [g?.members?.join()])

  if (user === undefined) return <><Head /><p className="fs-muted" style={{ margin: 16 }}>{t('Loading…')}</p></>
  if (!user) return <><Head /><SignIn /></>
  if (consent === undefined) return <><Head /><p className="fs-muted" style={{ margin: 16 }}>{t('Loading…')}</p></>
  if (!consent) return <><Head right={<button className="btn fs-lvlbtn" onClick={() => signOutFs()}>{t('Sign out')}</button>} />
    <Consent onYes={c => giveConsent(user, name, c).then(setConsent)} onNo={() => signOutFs()} /></>
  const members = (g?.members || []).map(u => people[u] || { uid: u, name: '…' })
  const b = g ? board(posts, members, period, metric) : []
  const top = b.slice(0, 3), m = METRICS[metric]
  const fmtV = v => (metric === 'volume' ? v.toFixed(1) : Math.round(v).toLocaleString())
  const share = async () => {
    const url = `${location.origin}${location.pathname}#/compete?join=${g.id}`, text = t('Join "{0}" on FitSmarter. Code: {1}', g.name, g.id)
    if (navigator.share) { try { await navigator.share({ title: 'FitSmarter', text, url }) } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(`${text}\n${url}`); toast(t('Invite link copied')) } catch { toast(url) } }
  }
  return <>
    <Head right={<button className="btn fs-lvlbtn" onClick={() => signOutFs()}>{t('Sign out')}</button>} />
    <GemDefs />
    <div className="fs-groups">
      {groups.map(x => <button key={x.id} className={x.id === gid ? 'on' : ''} onClick={() => setGid(x.id)}>{x.name}</button>)}
      <button onClick={() => askSheet(t('New group'), t('Group name'), t('e.g. Uni crew'), async v => { if (v.trim()) { const id = await createGroup(user.uid, v.trim()); setGid(id) } })}>+ {t('New group')}</button>
      <button onClick={() => askSheet(t('Join a group'), t('Invite code'), 'ABC123', async v => { try { setGid(await joinGroup(user.uid, v)) } catch (e) { toast(e.message) } }, true)}>{t('Join')}</button>
    </div>
    {!g ? <div className="card fs-empty-card"><h3>{t('Race your friends')}</h3><p className="fs-muted">{t('Create a group or join one with a friend’s code.')}</p></div> : <>
      <div className="card">
        <div className="fs-seg">{['week', 'month'].map(p => <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>{p === 'week' ? t('This week') : t('This month')}</button>)}</div>
        <div className="fs-seg">{Object.entries(METRICS).filter(([k]) => k === 'points' || k === 'tiers').map(([k, x]) => <button key={k} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}>{t(x.n)}</button>)}</div>
        {top.length > 0 && <div className="fs-podium">{[1, 0, 2].map(i => top[i] ? <div key={i} className={'p' + (i + 1)}>
          <Avatar p={top[i].p} size={i ? 50 : 64} /><b>{top[i].p.uid === user.uid ? t('You') : String(top[i].p.name).split(' ')[0]}</b><em>{fmtV(top[i].v)} <small>{m.u}</small></em><div className="blk">{i + 1}</div></div> : <div key={i} />)}</div>}
        <div className="fs-board">{b.map((x, i) => <div key={x.p.uid} className={'fs-brow' + (x.p.uid === user.uid ? ' me' : '')}>
          <span className="rk">{i + 1}</span><Avatar p={x.p} /><div><b>{x.p.uid === user.uid ? `${name} (${t('you')})` : x.p.name}</b><small>{t('{0} workouts', x.n)}</small></div><span className="v">{fmtV(x.v)}<small>{m.u}</small></span></div>)}</div>
      </div>
      <div className="card fs-invite"><div><small className="fs-muted">{t('Invite code')}</small><div className="fs-code">{g.id}</div></div>
        <button className="btn" onClick={share}>{t('Invite friends')}</button>
        <button className="btn fs-danger" onClick={() => leaveGroup(user.uid, g.id).then(() => toast(t('You left the group. What you shared there is deleted.')), () => toast(t('Could not leave. Try again.')))}>{t('Leave group')}</button></div>
      <div className="fs-feed">{posts.slice(0, 40).map(p => {
        const mine = (p.kudos || []).includes(user.uid)
        return <div key={p.id} className="card fs-post">
          <div className="fs-ph"><Avatar p={p} /><div><b>{p.uid === user.uid ? name : p.name}</b><small>{ago(p.start)}{p.title ? ` · ${p.title}` : ''}</small></div></div>
          <div className="fs-st"><div><small>{t('Time')}</small><b>{fmtDur(p.durationS)}</b></div><div><small>{t('Sets')}</small><b>{p.sets}</b></div><div><small>{t('Volume')}</small><b>{Math.round(p.volume).toLocaleString()} {p.unit || 'kg'}</b></div><div><small>{t('Points')}</small><b>{p.points}</b></div></div>
          {(p.lifts || []).map(l => <div key={l.ex} className="fs-lift"><span>{l.n}</span><small>{l.w ? `${l.w} × ${l.r}` : l.r ? t('{0} reps', l.r) : ''}</small><span className="fs-chip"><Gem tier={tierById(l.tier)} size={16} />{tierById(l.tier).n}</span></div>)}
          <button className={'fs-kudo' + (mine ? ' on' : '')} disabled={p.uid === user.uid} onClick={() => kudos(gid, p.id, user.uid, !mine).catch(() => toast(t('Could not save kudos')))}>👏 {(p.kudos || []).length || ''} {p.uid === user.uid ? t('kudos') : mine ? t('Given') : t('Kudos')}</button>
        </div>
      })}{!posts.length && <p className="fs-muted" style={{ margin: 16 }}>{t('No workouts in this group yet.')}</p>}</div>
    </>}
    <Privacy user={user} consent={consent} setConsent={setConsent} groups={groups} />
  </>
}

function Head({ right = null }) {
  return <div className="hdr"><div style={{ flex: 1 }}><h1>{t('Compete')}</h1><div className="sub">{t('Leaderboards and workouts from your groups')}</div></div>{right}</div>
}
