// FitSmarter: compete with friends (groups, leaderboard, feed). Part of this AGPL fork.
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { TIERS, profileOf } from './tiers.js'
import { Gem, GemDefs, levelsSheet } from './Hub.jsx'
import { watchUser, signInGoogle, signInEmail, signOutFs, saveProfile, profilesOf, watchGroups, createGroup, joinGroup, leaveGroup, watchFeed, kudos, syncWorkouts, METRICS, board } from './compete.js'
import './fitsmarter.css'

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
    <p className="fs-muted">{t('Your workouts stay on this device. Sign in only to share workout summaries with your groups and climb the leaderboard.')}</p>
    <button className="btn fs-full" disabled={busy} onClick={() => signInGoogle().catch(e => { if (e?.code !== 'cancelled' && e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') toast(t('Google sign-in failed') + (e?.code ? ` (${e.code})` : '')) })}>{t('Continue with Google')}</button>
    <div className="fs-or">{t('or with email')}</div>
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

export default function Compete() {
  const S = useStore(s => s.S)
  const prof = useMemo(() => profileOf(S, { height: Number(localStorage.getItem('fs_height')) || 0 }), [S])
  const [user, setUser] = useState(undefined)
  const [groups, setGroups] = useState([])
  const [gid, setGid] = useState(() => localStorage.getItem(GID_KEY) || '')
  const [posts, setPosts] = useState([])
  const [people, setPeople] = useState({})
  const [period, setPeriod] = useState('week'), [metric, setMetric] = useState('points')
  const [shared, setShared] = useState(null)
  const name = user ? (people[user.uid]?.name || user.displayName || (user.email || '').split('@')[0]) : ''

  useEffect(() => { let off; watchUser(u => setUser(u || null)).then(f => { off = f }).catch(() => setUser(null)); return () => off && off() }, [])
  useEffect(() => { if (user) saveProfile(user).catch(() => {}) }, [user])
  useEffect(() => { // an invite link: #/compete?join=CODE
    if (!user) return
    const code = new URLSearchParams(location.hash.split('?')[1] || '').get('join')
    if (!code) return
    history.replaceState(null, '', location.pathname + '#/compete')
    joinGroup(user.uid, code).then(id => { setGid(id); toast(t('You joined the group')) }).catch(e => toast(e.message))
  }, [user])
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
    if (!user || !groups.length) return
    syncWorkouts(user, name, S, prof, groups).then(setShared).catch(() => setShared(null))
  }, [user, groups, S?.workouts?.length])
  const g = groups.find(x => x.id === gid)
  useEffect(() => { if (g) profilesOf(g.members).then(setPeople).catch(() => {}) }, [g?.members?.join()])

  if (user === undefined) return <><Head /><p className="fs-muted" style={{ margin: 16 }}>{t('Loading…')}</p></>
  if (!user) return <><Head /><SignIn /></>
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
    {!g ? <div className="card fs-empty-card"><h3>{t('Race your friends')}</h3><p className="fs-muted">{t('Create a group and share its code, or join one with a friend’s code. Your workouts are shared as summaries: sets, volume, best lifts and their levels.')}</p></div> : <>
      <div className="card">
        <div className="fs-seg">{['week', 'month'].map(p => <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>{p === 'week' ? t('This week') : t('This month')}</button>)}</div>
        <div className="fs-seg">{Object.entries(METRICS).map(([k, x]) => <button key={k} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}>{t(x.n)}</button>)}</div>
        {top.length > 0 && <div className="fs-podium">{[1, 0, 2].map(i => top[i] ? <div key={i} className={'p' + (i + 1)}>
          <Avatar p={top[i].p} size={i ? 50 : 64} /><b>{top[i].p.uid === user.uid ? t('You') : String(top[i].p.name).split(' ')[0]}</b><em>{fmtV(top[i].v)} <small>{m.u}</small></em><div className="blk">{i + 1}</div></div> : <div key={i} />)}</div>}
        <div className="fs-board">{b.map((x, i) => <div key={x.p.uid} className={'fs-brow' + (x.p.uid === user.uid ? ' me' : '')}>
          <span className="rk">{i + 1}</span><Avatar p={x.p} /><div><b>{x.p.uid === user.uid ? `${name} (${t('you')})` : x.p.name}</b><small>{t('{0} workouts', x.n)}</small></div><span className="v">{fmtV(x.v)}<small>{m.u}</small></span></div>)}</div>
        {metric === 'tiers' && <button className="btn fs-full" onClick={() => levelsSheet(prof)}>{t('What do the levels mean?')}</button>}
        <p className="fs-small fs-muted">{t('Points: 2 per set plus 1 per 250 kg of volume. Weeks start on Monday.')} {shared != null && t('{0} of your workouts from the last 30 days are shared.', shared)}</p>
      </div>
      <div className="card fs-invite"><div><small className="fs-muted">{t('Invite code')}</small><div className="fs-code">{g.id}</div></div>
        <button className="btn" onClick={share}>{t('Invite friends')}</button>
        <button className="btn fs-danger" onClick={() => leaveGroup(user.uid, g.id)}>{t('Leave group')}</button></div>
      <div className="fs-feed">{posts.slice(0, 40).map(p => {
        const mine = (p.kudos || []).includes(user.uid)
        return <div key={p.id} className="card fs-post">
          <div className="fs-ph"><Avatar p={p} /><div><b>{p.uid === user.uid ? name : p.name}</b><small>{ago(p.start)}{p.title ? ` · ${p.title}` : ''}</small></div></div>
          <div className="fs-st"><div><small>{t('Time')}</small><b>{fmtDur(p.durationS)}</b></div><div><small>{t('Sets')}</small><b>{p.sets}</b></div><div><small>{t('Volume')}</small><b>{Math.round(p.volume).toLocaleString()} {p.unit || 'kg'}</b></div><div><small>{t('Points')}</small><b>{p.points}</b></div></div>
          {(p.lifts || []).map(l => <div key={l.ex} className="fs-lift"><span>{l.n}</span><small>{l.w ? `${l.w} × ${l.r}` : t('{0} reps', l.r)}</small><span className="fs-chip"><Gem tier={tierById(l.tier)} size={16} />{tierById(l.tier).n}</span></div>)}
          <button className={'fs-kudo' + (mine ? ' on' : '')} disabled={p.uid === user.uid} onClick={() => kudos(gid, p.id, user.uid, !mine).catch(() => toast(t('Could not save kudos')))}>👏 {(p.kudos || []).length || ''} {p.uid === user.uid ? t('kudos') : mine ? t('Given') : t('Kudos')}</button>
        </div>
      })}{!posts.length && <p className="fs-muted" style={{ margin: 16 }}>{t('No workouts in this group yet.')}</p>}</div>
    </>}
  </>
}

function Head({ right = null }) {
  return <div className="hdr"><div style={{ flex: 1 }}><h1>{t('Compete')}</h1><div className="sub">{t('Leaderboards and workouts from your groups')}</div></div>{right}</div>
}
