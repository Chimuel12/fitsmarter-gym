// FitSmarter body hub: every muscle in the tier of its best exercise, growing with the tier,
// plus the levels explainer and how to log weights. Part of this AGPL fork.
import { shareImage } from '../lib/share-image.js'
import Media from '../components/Media.jsx'
import { loadKindFor, baseWeightFor } from '../lib/plates.js'
import { aboutYouSheet } from '../components/StrengthLevel.jsx'
import { bwSheet } from '../sheets.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { MUSCLES, INERT, MUSCLE_NAME, musclesOf } from '../lib/muscles.js'
import { CATALOGUE, exerciseOf, isClassicEx } from '../lib/exercises.js'
import { exerciseNameFor } from '../lib/i18n-core.js'
import { t } from '../lib/i18n.js'
import { TIERS, TIER_TEXT, tierFor, tierIndex, topTxt, profileOf, muscleTiers, overall, nextTier, weightAtTop, rateOf, isRepsRated, GAP } from './tiers.js'
import { changesSince, markSeen } from './progress.js'
import { SKINS, skinOf, skinLevel, skinClasses, muscleScale, nextSkin } from './skins.js'
import { LookDefs } from './looks.jsx'
import './fitsmarter.css'

const HEIGHT_KEY = 'fs_height'
const readHeight = () => { try { return Number(localStorage.getItem(HEIGHT_KEY)) || 0 } catch { return 0 } }
const LB = 0.45359237

let GEO = null, PENDING = null
function useGeometry() {
  const [g, setG] = useState(GEO)
  useEffect(() => {
    if (GEO) return
    let alive = true
    PENDING = PENDING || import('../lib/body-geometry.js').then(m => (GEO = m.default))
    PENDING.then(v => { if (alive) setG(v) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return g
}

/* ---------- gems: one shape per tier, gradients from the hub's shared <defs> ---------- */
const SHAPES = {
  iron: 'M12 2 L21 6 L21 14 Q21 20 12 23 Q3 20 3 14 L3 6 Z', bronze: 'M12 2 L21 6 L21 14 Q21 20 12 23 Q3 20 3 14 L3 6 Z',
  silver: 'M12 1.5 L22.5 12 L12 22.5 L1.5 12 Z', gold: 'M12 1.5 L22.5 9 L18.5 22 L5.5 22 L1.5 9 Z', ruby: 'M12 1.5 L20 5 L22.5 13 L17 21.5 L7 21.5 L1.5 13 L4 5 Z',
  emerald: 'M7 1.5 L17 1.5 L22.5 7 L22.5 17 L17 22.5 L7 22.5 L1.5 17 L1.5 7 Z', diamond: 'M5 4 L19 4 L23 9 L12 22.5 L1 9 Z', champion: 'M2 6 L7 10 L12 2 L17 10 L22 6 L20 21 L4 21 Z',
  olympian: 'M12 1.5 L22.5 7 L1.5 7 Z M2.5 8.2 H21.5 V10 H2.5 Z M4 11 H7 V19 H4 Z M10.5 11 H13.5 V19 H10.5 Z M17 11 H20 V19 H17 Z M2 20 H22 V22.5 H2 Z',
}
export function Gem({ tier, size = 24 }) {
  const spark = <path d="M12 8 l1 2.6 2.6 1 -2.6 1 -1 2.6 -1 -2.6 -2.6 -1 2.6 -1z" fill="#fff" opacity=".85" />
  return <svg className="fs-gem" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    {tier.id === 'symmetric' ? <circle cx="12" cy="12" r="10.5" fill="url(#fsg-orb)" />
      : <path d={SHAPES[tier.id]} fill={`url(#fsg-${tier.id})`} stroke="rgba(255,255,255,.35)" strokeWidth=".8" />}
    {spark}
  </svg>
}
export function GemDefs() {
  return <svg className="fs-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
    {TIERS.map(tr => <linearGradient key={tr.id} id={`fsg-${tr.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={tr.c} /><stop offset="1" stopColor={tr.c2} /></linearGradient>)}
    {Object.entries(SKINS).map(([id, s]) => <linearGradient key={id} id={`fsskin-${id}`} x1="0" y1="0" x2=".6" y2="1">{s.stops.map((c, i) => <stop key={i} offset={i / (s.stops.length - 1)} stopColor={c} />)}</linearGradient>)}
    <radialGradient id="fsg-orb" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#fff" /><stop offset=".25" stopColor="#9CC2FF" /><stop offset="1" stopColor="#2F5BFF" /></radialGradient>
  </defs></svg>
}

// The skin follows your overall level (skins.js); each muscle keeps its own colour and size.
function Body({ view, map, onMuscle, skin = 'none', level = -1, moved = {} }) {
  const top = level >= 0 ? TIERS[level] : null
  return <div className="fs-figure">
    {level >= 8 && <span className="fs-halo" aria-hidden="true" />}
    <svg className="fs-body" viewBox={view.vb} role="group" aria-label={t('Muscle map')}>
      {INERT.map(slug => (view.p[slug] || []).map((d, i) => <path key={slug + i} className={slug === 'hair' ? 'fs-hair' : 'fs-skin'} d={d}
        style={slug === 'hair' ? undefined : { fill: skin === 'none' ? 'url(#fsskin-none)' : `url(#fsl-${skin})` }} />))}
      {MUSCLES.map(slug => (view.p[slug] || []).map((d, i) => {
        const r = map[slug], strong = !!r && !!top && tierIndex(r.tier.id) >= level
        return <path key={slug + i} d={d} className={'fs-mus' + (r ? ' on' : '') + (r?.capped ? ' held' : '') + (strong ? ' strong' : '') + (moved[slug] ? ' anim-' + moved[slug] : '')}
          style={{ transform: `scale(${muscleScale(r, slug, level).toFixed(3)})`, fill: r ? `url(#fsl-${r.tier.id})` : undefined }}
          onClick={() => onMuscle(slug)}><title>{t(MUSCLE_NAME[slug])}</title></path>
      }))}
    </svg>
  </div>
}

/* The body on a turntable: drag sideways to turn it (it keeps spinning a little and settles on
   the front or the back), the button turns it round, and it sways gently while left alone.
   A drag never counts as a tap on a muscle. */
function Turntable({ front, back }) {
  const [deg, setDeg] = useState(0)
  const [held, setHeld] = useState(false)
  const st = useRef({ x: 0, y: 0, d: 0, v: 0, t: 0, moved: false, raf: 0, id: null })
  const settle = (from, v) => {
    cancelAnimationFrame(st.current.raf)
    let d = from, vel = v
    const step = () => {
      vel *= 0.93; d += vel
      if (Math.abs(vel) < 0.4) {
        const target = Math.round(d / 180) * 180, start = d, t0 = performance.now()
        const ease = now => { const k = Math.min(1, (now - t0) / 380), e = 1 - (1 - k) ** 3; setDeg(start + (target - start) * e); if (k < 1) st.current.raf = requestAnimationFrame(ease) }
        st.current.raf = requestAnimationFrame(ease); return
      }
      setDeg(d); st.current.raf = requestAnimationFrame(step)
    }
    st.current.raf = requestAnimationFrame(step)
  }
  useEffect(() => () => cancelAnimationFrame(st.current.raf), [])
  const down = e => {
    cancelAnimationFrame(st.current.raf)
    Object.assign(st.current, { x: e.clientX, y: e.clientY, d: deg, v: 0, t: performance.now(), moved: false, id: e.pointerId })
    setHeld(true)
  }
  const move = e => {
    const s = st.current
    if (s.id !== e.pointerId) return
    const dx = e.clientX - s.x
    if (!s.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - s.y)) { s.moved = true; e.currentTarget.setPointerCapture?.(e.pointerId) }
    if (!s.moved) return
    const now = performance.now(), nd = s.d + dx * 0.7
    s.v = (nd - deg) / Math.max(16, now - s.t) * 16; s.t = now
    setDeg(nd)
  }
  const up = e => {
    const s = st.current
    if (s.id !== e.pointerId) return
    s.id = null; setHeld(false)
    if (s.moved) settle(deg, s.v)
  }
  // A drag ends with a click on whatever is under the finger: swallowed, so it opens nothing.
  const click = e => { if (st.current.moved) { e.stopPropagation(); e.preventDefault(); st.current.moved = false } }
  const turn = () => { cancelAnimationFrame(st.current.raf); const start = deg, target = Math.round(deg / 180) * 180 + 180, t0 = performance.now()
    const ease = now => { const k = Math.min(1, (now - t0) / 650), e = k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2; setDeg(start + (target - start) * e); if (k < 1) st.current.raf = requestAnimationFrame(ease) }
    st.current.raf = requestAnimationFrame(ease) }
  return <div className="fs-turnwrap">
    <div className={'fs-turn' + (held ? ' held' : '')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={click}>
      <div className="fs-spin" style={{ transform: `rotateY(${deg}deg)` }}>
        <div className="fs-face front">{front}</div>
        <div className="fs-face back">{back}</div>
      </div>
    </div>
    <button className="fs-turnbtn" onClick={turn} aria-label={t('Turn the body around')}>↻</button>
    <div className="fs-turnhint">{t('Drag to turn · tap a muscle')}</div>
  </div>
}

/** All the skins, the ones you have and the ones still ahead. */
export function skinsSheet(level) {
  useUI.getState().openSheet(() => <div className="fs-sheet">
    <GemDefs />
    <h2>{t('Skins')}</h2>
    <p className="fs-muted">{t('Your body changes as your overall level goes up. Train every muscle group to raise it.')}</p>
    <div className="fs-skins">{TIERS.map((tr, i) => <div key={tr.id} className={'fs-skinrow' + (i <= level ? ' got' : '')}>
      <span className="fs-swatch" style={{ background: `linear-gradient(135deg, ${SKINS[tr.id].stops.join(', ')})` }} />
      <div><b>{tr.n} {i <= level ? '✓' : '🔒'}</b><small>{t(SKINS[tr.id].unlock)}</small>{i > level && <small>{t('Overall top {0}%', tr.top)}</small>}</div>
    </div>)}</div>
  </div>)
}

const SEEN_KEY = 'fs_skin_seen'
/** The picture to share: the body as it is now on a story-sized card, with the level. */
async function bodyPicture(tier) {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d'), stops = SKINS[tier?.id || 'none'].stops
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0b1020'); bg.addColorStop(1, '#151b33'); g.fillStyle = bg; g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W / 2, H * 0.52, 40, W / 2, H * 0.52, 700); glow.addColorStop(0, stops[0] + '88'); glow.addColorStop(1, '#0000'); g.fillStyle = glow; g.fillRect(0, 0, W, H)
  g.textAlign = 'center'; g.fillStyle = '#fff'
  g.font = '800 92px -apple-system, Inter, system-ui, sans-serif'; g.fillText(tier ? tier.n : 'FitSmarter', W / 2, 230)
  g.font = '600 44px -apple-system, Inter, system-ui, sans-serif'; g.fillStyle = '#C9D4EA'
  g.fillText(tier ? t('Top {0}% of gym-goers', tier.top) : t('My body, level by level'), W / 2, 300)
  g.font = '800 54px -apple-system, Inter, system-ui, sans-serif'; g.fillStyle = '#4C8DFF'; g.fillText('FitSmarter', W / 2, H - 120)
  return new Promise(r => c.toBlob(r, 'image/png'))
}
async function shareBody(tier) {
  const blob = await bodyPicture(tier)
  const toast = m => { try { useUI.getState().toast(m) } catch { /* */ } }
  await shareImage(blob, `fitsmarter-${tier?.id || 'body'}.png`, 'FitSmarter', toast)
}

function unlockSheet(tier) {
  useUI.getState().openSheet(close => <div className="fs-sheet fs-unlock" style={{ '--skin-a': SKINS[tier.id].stops[0], '--skin-b': SKINS[tier.id].stops.at(-1) }}>
    <GemDefs />
    <div className="fs-unlock-orb"><Gem tier={tier} size={84} /></div>
    <h2>{t('New skin: {0}', tier.n)}</h2>
    <p>{t(SKINS[tier.id].unlock)}</p>
    <div className="fs-two"><button className="btn fs-primary" onClick={() => shareBody(tier)}>{t('Share')}</button>
      <button className="btn" onClick={close}>{t('Nice!')}</button></div>
    <p className="fs-small fs-muted">{t('Instagram, WhatsApp or anywhere: a picture of your body at {0}.', tier.n)}</p>
  </div>, { kind: 'center' })
}

const REGION_NAME = { push: 'chest, shoulders and triceps', pull: 'back and biceps', legs: 'legs', core: 'abs and lower back' }
// the region holding the body back, if any muscle is held
const heldBy = map => Object.values(map).find(r => r.capped)?.capped || null
const nameOf = id => { const ex = exerciseOf(id); return ex ? exerciseNameFor(ex) : id }
const fmtW = (kg, unit) => { const v = unit === 'lb' ? kg / LB : kg; return `${Math.round(v * 2) / 2} ${unit}` }
const setText = (id, s, unit) => (isRepsRated(id) ? t('{0} reps', s.r) : `${+(+s.w).toFixed(1)} ${unit} × ${s.r}`)
const ARROW = { up: '▲', down: '▼', flat: '=' }
const Trend = ({ r }) => r?.trend ? <i className={'fs-trend ' + r.trend} aria-label={t(r.trend === 'up' ? 'Stronger than last time' : r.trend === 'down' ? 'Weaker than last time' : 'Same as last time')}>{ARROW[r.trend]}{r.change ? ` ${Math.abs(r.change)}%` : ''}</i> : null
// The target as you will type it: a barbell's plates per side (fitsmarter/weight-rule.js), the rest as stored.
const sideOf = (id, w) => { const base = baseWeightFor(useStore.getState().S, id); return Math.max(0, Math.round((w - base) / 2 * 100) / 100) }
const nextText = (id, n, unit) => {
  if (!n) return ''
  if (n.sec) return `${n.sec} s`
  if (isRepsRated(id) || !n.w) return t('{0} reps', n.r)
  const w = `${+(+n.w).toFixed(2)} ${unit}${n.r ? ` × ${n.r}` : ''}`
  return loadKindFor(useStore.getState().S, { id }) === 'pairs' ? `${w} (${t('{0} per side', sideOf(id, n.w))})` : w
}
const whyText = n => {
  if (n.why === 'plan') return [n.reason ? t(...n.reason) : '', n.routine ? t('{0} · {1}', n.routine, t(n.policyName || '')) : ''].filter(Boolean).join(' · ')
  return n.why === 'weight' ? t('You reached {0} reps: add weight and start again at {1}.', 12, 8) : t('Same weight, one more rep. At {0} reps you add weight.', 12)
}
const dayText = ts => (ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')
const BENCH = () => CATALOGUE.find(e => (e.n || '').toLowerCase() === 'barbell bench press')

export function levelsSheet(prof) {
  const ex = BENCH()
  useUI.getState().openSheet(close => <div className="fs-sheet">
    <GemDefs />
    <h2>{t('Strength levels')}</h2>
    <p className="fs-muted">{t('Every set you log becomes a 10-rep equivalent and is compared with gym-goers of your sex, body weight, age and height. Each muscle takes the level of its best exercise.')}</p>
    <div className="fs-lvls">{TIERS.slice(1).map(tr => <div key={tr.id} className="fs-lvl">
      <Gem tier={tr} size={34} />
      <div><b>{tr.n} <span>{t('top {0}%', tr.top)}</span></b><small>{t(TIER_TEXT[tr.id])}</small></div>
      {ex && <em>{fmtW(weightAtTop(ex, tr.top, prof), prof.unit)}</em>}
    </div>)}</div>
    <p className="fs-muted fs-small">{prof.weight
      ? t('Right column: barbell bench press, total weight × 10 reps for each level, for you ({0}).', fmtW(prof.weight, prof.unit))
      : t('Right column: barbell bench press, total weight × 10 reps for each level, for an 80 kg man. Log your body weight for your own numbers.')} {t('Below Bronze is Iron.')}</p>
    <div className="fs-howlog"><h3>{t('Balance')}</h3><p className="fs-small">{t('A muscle can be at most {0} levels above the weakest part of your body you train: legs, back and biceps, chest, shoulders and triceps, or abs and lower back. Strong lifts need the whole body, so no Diamond chest on Iron legs. A part you have never trained holds nothing back. Muscle memory counts: a part you trained before keeps credit for one level below its record.', GAP)}</p></div>
    <div className="fs-howlog"><h3>{t('How to log weights')}</h3><ul>
      <li><b>{t('Barbell')}</b> {t('Enter the plates on ONE side. The bar is added for you.')}</li>
      <li><b>{t('Dumbbells and kettlebells')}</b> {t('Enter the weight of ONE dumbbell (20 in each hand → 20).')}</li>
      <li><b>{t('Machines and cables')}</b> {t('Enter the number shown on the weight stack.')}</li>
      <li><b>{t('Bodyweight')}</b> {t('Log your reps; add weight only if you wear a belt or vest.')}</li>
    </ul></div>
    <button className="btn fs-full" onClick={close}>{t('Got it')}</button>
  </div>)
}

function muscleSheet(slug, map, prof, nav) {
  const r = map[slug], raw = r?.raw?.pct ?? r?.pct, nx = r && !r.capped && rateOf(r.ex) ? nextTier(r.ex, r.prim ? raw : raw / 0.6, prof) : null
  const sug = CATALOGUE.filter(e => rateOf(e) && (musclesOf(e)[slug] || 0) >= 0.75).sort((a, b) => Number(isClassicEx(b)) - Number(isClassicEx(a))).slice(0, 6)
  useUI.getState().openSheet(close => <MuscleSheet slug={slug} r={r} nx={nx} sug={sug} prof={prof} close={close} nav={nav} />)
}

// The muscle's card: the exercise's animation on top (the one you trained it with last, or a
// suggestion; tap another suggestion to see that one), then the numbers.
function MuscleSheet({ slug, r, nx, sug, prof, close, nav }) {
  const [shown, setShown] = useState(r?.ex || sug[0]?.id || null)
  const ex = shown ? exerciseOf(shown) : null
  return <div className="fs-sheet">
    <GemDefs />
    <h2>{t(MUSCLE_NAME[slug])}</h2>
    {ex && <div className="fs-exanim"><Media ex={ex} /><small>{exerciseNameFor(ex)}</small></div>}
    {r ? <>
      <div className="fs-mhead"><Gem tier={r.tier} size={56} /><div><b>{r.tier.n}</b><span>{t('Top {0}% of gym-goers like you', topTxt(r.raw ? r.raw.pct : r.pct))}</span></div></div>
      {r.capped && <div className="fs-held"><b>🔒 {t('Held at {0}', r.tier.n)}</b>
        <span>{t('Your lifts here are {0}, but your {1} are at {2}. A muscle can be at most {3} levels above your weakest part of the body.', r.raw.tier.n, t(REGION_NAME[r.capped.by]), r.capped.at.n, GAP)}</span>
        <small>{t('Bring your {0} to {1} to unlock {2}.', t(REGION_NAME[r.capped.by]), TIERS[Math.max(0, tierIndex(r.raw.tier.id) - GAP)].n, r.raw.tier.n)}</small></div>}
      <div className="fs-kv"><span>{t('Latest')} · {dayText(r.at)}</span><b>{nameOf(r.ex)} · {setText(r.ex, r.s, prof.unit)} <Trend r={r} /></b></div>
      {r.prev && <div className="fs-kv"><span>{t('Before')} · {dayText(r.prev.at)}</span><b>{setText(r.ex, r.prev.s, prof.unit)}</b></div>}
      {r.best && r.best.at !== r.at && r.best.at !== r.prev?.at && <div className="fs-kv"><span>{t('Record')} · {dayText(r.best.at)}</span><b>{setText(r.ex, r.best.s, prof.unit)}</b></div>}
      {r.next && <div className="fs-overload"><b>{t('Progressive overload')}</b>
        <span>{t('Next time on {0}: {1}', nameOf(r.ex), nextText(r.ex, r.next, prof.unit))}</span>
        <small>{whyText(r.next)}</small>
        {r.next.why !== 'plan' && <small>{t('Not in any routine yet: add it to a routine and your plan sets the weight.')}</small>}</div>}
      {!r.prim && <p className="fs-small fs-muted">{t('assisting muscle, counts 60%')}</p>}
      <p className="fs-small fs-muted">{t('Levels and muscle size follow your most recent session, not your all-time best.')}</p>
      {nx && <p className="fs-next"><Gem tier={nx.tier} size={18} /> {t('Next: {0} at {1} × 10 on {2}', nx.tier.n, isRepsRated(r.ex) ? t('{0} reps', Math.ceil(nx.value)) : fmtW(nx.value, prof.unit), nameOf(r.ex))}</p>}
    </> : <p className="fs-muted">{t('Not trained yet. Log one of these to light it up:')}</p>}
    <div className="fs-sug">{[...(r ? [exerciseOf(r.ex)] : []), ...sug.filter(e => e.id !== r?.ex)].filter(Boolean).map(e =>
      <button key={e.id} className={e.id === shown ? 'on' : ''} onClick={() => setShown(e.id)}>{exerciseNameFor(e)}</button>)}</div>
    <button className="btn fs-full" onClick={() => { close(); nav('/library') }}>{t('Browse exercises')}</button>
  </div>
}

export default function Hub() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const geo = useGeometry()
  const [height, setHeight] = useState(readHeight)
  const prof = useMemo(() => profileOf(S, { height }), [S, height])
  const map = useMemo(() => muscleTiers(S, prof), [S, prof])
  const ov = overall(map), held = heldBy(map)
  const g = geo && (geo[prof.sex === 'f' ? 'female' : 'male'] || geo.male)
  const trained = Object.entries(map).sort((a, b) => b[1].pct - a[1].pct)
  const onMuscle = slug => muscleSheet(slug, map, prof, nav)
  const saveHeight = v => { const n = Math.round(Number(v)) || 0; setHeight(n); try { n ? localStorage.setItem(HEIGHT_KEY, String(n)) : localStorage.removeItem(HEIGHT_KEY) } catch { /* private mode */ } }
  const missing = !prof.weight || !S?.birthYear || !height
  // #/body?skin=gold previews a skin without changing anything (and without the unlock sheet).
  // a level to look at instead of your own: a gem tapped in the strip, or #/body?skin=gold
  const [peek, setPeek] = useState(null)
  const preview = peek || new URLSearchParams(location.hash.split('?')[1] || '').get('skin')
  const forced = preview && TIERS.some(x => x.id === preview) ? preview : null
  const skin = forced || skinOf(ov), level = forced ? tierIndex(forced) : skinLevel(ov), upcoming = nextSkin(level)
  // A level you reach for the first time shows its new skin once.
  useEffect(() => {
    if (forced || level < 0) return   // nothing loaded yet, or nothing trained: nothing to compare
    let seen = -1
    try { seen = Number(localStorage.getItem(SEEN_KEY) ?? -1) } catch { /* private mode */ }
    if (level > seen && level >= 0) {
      const tier = TIERS[level]
      setTimeout(() => unlockSheet(tier), 400)
    }
    if (level !== seen) try { localStorage.setItem(SEEN_KEY, String(level)) } catch { /* private mode */ }
  }, [level])
  // Since you last looked: muscles that went up glow green, down glow red, and a note says which.
  const [moves, setMoves] = useState([])
  useEffect(() => {
    if (forced) return
    const c = changesSince(map)
    markSeen(map)
    if (!c.length) return
    setMoves(c)
    const tm = setTimeout(() => setMoves([]), 7000)
    return () => clearTimeout(tm)
  }, [JSON.stringify(Object.entries(map).map(([m, r]) => [m, r.tier.id]))])
  // a level being previewed: every muscle wears it
  const shown = useMemo(() => (forced ? Object.fromEntries(MUSCLES.map(m => [m, { ...map[m], pct: map[m]?.pct ?? 0, tier: TIERS[level], capped: null }])) : map), [forced, map, level])
  // The special effect when something changes: a wave of light up the body and rising sparks for
  // an improvement, a red wave down, falling shards and a shake for a drop. It plays when muscles
  // moved since you last looked, and when you switch the level you are looking at.
  const [fx, setFx] = useState(null)
  const lastLevel = useRef(level)
  const play = dir => { const id = Date.now(); setFx({ dir, id }); setTimeout(() => setFx(f => (f?.id === id ? null : f)), 2400) }
  useEffect(() => { if (level !== lastLevel.current && lastLevel.current !== null) play(level > lastLevel.current ? 'up' : 'down'); lastLevel.current = level }, [level])
  useEffect(() => { if (moves.length) play(moves.filter(x => x.dir === 'up').length >= moves.filter(x => x.dir === 'down').length ? 'up' : 'down') }, [moves])
  const moved = fx && !moves.length ? Object.fromEntries(MUSCLES.map(m => [m, fx.dir])) : Object.fromEntries(moves.map(x => [x.slug, x.dir]))
  return <>
    <div className="hdr"><div style={{ flex: 1 }}><h1>{t('Body')}</h1><div className="sub">{t('Your strength level, muscle by muscle')}</div></div>
      <button className="btn fs-lvlbtn" onClick={() => nav('/stats')}>{t('Stats')}</button></div>
    <div className="fs-hub">
      <GemDefs /><LookDefs />
      <div className="fs-tiers">{TIERS.slice(1).map(tr => <button key={tr.id} className={(forced ? forced === tr.id : ov?.tier.id === tr.id) ? 'on' : ''}
        onClick={() => setPeek(p => (p === tr.id ? null : tr.id))} aria-label={t('See the body at {0}', tr.n)} aria-pressed={forced === tr.id}>
        <Gem tier={tr} size={24} /><small>{t('{0}%', tr.top)}</small></button>)}</div>
      <div className="fs-peekbar">{forced
        ? <><span>{t('Preview: {0}', TIERS[tierIndex(forced)].n)}</span><button onClick={() => { setPeek(null); if (location.hash.includes('skin=')) location.hash = '#/body' }}>{t('Back to my body')}</button></>
        : <><span>{t('Tap a level to see your body at it')}</span><button onClick={() => levelsSheet(prof)}>{t('What the levels mean')}</button></>}</div>
      <div className={'fs-stage skin-' + skin + ' ' + skinClasses(level) + (fx ? ' fx-now-' + fx.dir : '')} style={{ '--skin-a': SKINS[skin].stops[0], '--skin-b': SKINS[skin].stops.at(-1) }}>
        {moves.length > 0 && <div className="fs-delta" role="status" onClick={() => setMoves([])}>{[...moves.filter(x => x.dir === 'up').slice(0, 3), ...moves.filter(x => x.dir === 'down').slice(0, 2)].map(x => <div key={x.slug} className={x.dir}>
          <i>{x.dir === 'up' ? '▲' : '▼'}</i><b>{t(MUSCLE_NAME[x.slug])}</b><span>{x.from ? x.from.n : t('Untrained')} → {x.to ? x.to.n : t('Untrained')}</span></div>)}
          {moves.length > Math.min(3, moves.filter(x => x.dir === 'up').length) + Math.min(2, moves.filter(x => x.dir === 'down').length) && <small>{t('+{0} more', moves.length - Math.min(3, moves.filter(x => x.dir === 'up').length) - Math.min(2, moves.filter(x => x.dir === 'down').length))}</small>}</div>}
        {level >= 3 && <div className="fs-aura" aria-hidden="true" />}
        {fx && <div key={fx.id} className={'fs-fx ' + fx.dir} aria-hidden="true"><span className="fs-fx-wave" />
          {Array.from({ length: 22 }, (_, i) => <i key={i} style={{ '--i': i, '--x': ((i * 37) % 100) + '%' }} />)}<b>{fx.dir === 'up' ? '▲' : '▼'}</b></div>}
        {level >= 7 && <div className="fs-particles" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>}
        <div className="fs-call tl">{ov ? <Gem tier={ov.tier} size={34} /> : null}<b>{t('Overall')}</b><small>{ov ? `${ov.tier.n} · ${t('top {0}%', topTxt(ov.pct))}` : t('No lifts yet')}</small></div>
        <div className="fs-call tr"><b>{t('Train next')}</b><small>{held ? `🔒 ${t(REGION_NAME[held.by])}` : ov ? t(MUSCLE_NAME[ov.weakest]) : t('Anything')}</small></div>
        {g ? <Turntable front={<Body view={g.front} map={shown} onMuscle={onMuscle} skin={skin} level={level} moved={moved} />}
          back={<Body view={g.back} map={shown} onMuscle={onMuscle} skin={skin} level={level} moved={moved} />} /> : <div className="fs-bodies ph" />}
        {g && <button className="fs-sharebtn" onClick={() => shareBody(level >= 0 ? TIERS[level] : null)} aria-label={t('Share')}>{t('Share')}</button>}
      </div>
      <button className="fs-nextskin" onClick={() => skinsSheet(level)}>
        <span className="fs-swatch" style={{ background: `linear-gradient(135deg, ${SKINS[upcoming ? upcoming.id : skin].stops.join(', ')})` }} />
        <span>{upcoming ? <><b>{t('Next skin: {0}', upcoming.n)}</b><small>{t('{0} Reach overall top {1}%.', t(SKINS[upcoming.id].unlock), upcoming.top)}</small></>
          : <><b>{t('Every skin unlocked')}</b><small>{t('You are a Greek statue. Keep it.')}</small></>}</span>
        <i>›</i>
      </button>
      {!trained.length && <p className="fs-empty">{t('Log weights and reps: your muscles light up and grow. Tap a gem for the levels.')}</p>}
    </div>
    {missing && <div className="card fs-prof">
      <h3>{t('For accurate levels')}</h3>
      <label className="fs-field">{t('Height (cm)')}<input type="number" inputMode="numeric" min="120" max="230" defaultValue={height || ''} onBlur={e => saveHeight(e.target.value)} /></label>
      <p className="fs-small fs-muted">{t('Sex: {0} · Birth year: {1} · Body weight: {2}', prof.sex === 'f' ? t('Female') : t('Male'), S?.birthYear || '–', prof.weight ? fmtW(prof.weight, prof.unit) : '–')}</p>
      <div className="fs-two">
        {!prof.weight && <button className="btn" onClick={() => bwSheet()}>{t('Body weight')}</button>}
        {!S?.birthYear && <button className="btn" onClick={() => aboutYouSheet()}>{t('Sex and birth year')}</button>}
      </div>
    </div>}
  </>
}
