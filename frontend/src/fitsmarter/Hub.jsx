// FitSmarter body hub: every muscle in the tier of its best exercise, growing with the tier,
// plus the levels explainer and how to log weights. Part of this AGPL fork.
import { aboutYouSheet } from '../components/StrengthLevel.jsx'
import { bwSheet } from '../sheets.jsx'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { MUSCLES, INERT, MUSCLE_NAME, musclesOf } from '../lib/muscles.js'
import { CATALOGUE, exerciseOf, isClassicEx } from '../lib/exercises.js'
import { exerciseNameFor } from '../lib/i18n-core.js'
import { t } from '../lib/i18n.js'
import { TIERS, TIER_TEXT, tierFor, tierIndex, topTxt, profileOf, muscleTiers, overall, nextTier, weightAtTop, rateOf, isRepsRated } from './tiers.js'
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
    <radialGradient id="fsg-orb" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#fff" /><stop offset=".25" stopColor="#9CC2FF" /><stop offset="1" stopColor="#2F5BFF" /></radialGradient>
  </defs></svg>
}

// untrained muscles look thin; every tier adds size, Symmetric is clearly bulked
const growth = r => (!r ? 0.82 : 0.86 + tierIndex(r.tier.id) * 0.045)

function Body({ view, map, onMuscle }) {
  return <svg className="fs-body" viewBox={view.vb} role="group" aria-label={t('Muscle map')}>
    {INERT.map(slug => (view.p[slug] || []).map((d, i) => <path key={slug + i} className={slug === 'hair' ? 'fs-hair' : 'fs-skin'} d={d} />))}
    {MUSCLES.map(slug => (view.p[slug] || []).map((d, i) => {
      const r = map[slug]
      return <path key={slug + i} d={d} className={'fs-mus' + (r ? ' on' : '')}
        style={{ transform: `scale(${growth(r).toFixed(3)})`, fill: r ? `url(#fsg-${r.tier.id})` : undefined }}
        onClick={() => onMuscle(slug)}><title>{t(MUSCLE_NAME[slug])}</title></path>
    }))}
  </svg>
}

const nameOf = id => { const ex = exerciseOf(id); return ex ? exerciseNameFor(ex) : id }
const fmtW = (kg, unit) => { const v = unit === 'lb' ? kg / LB : kg; return `${Math.round(v * 2) / 2} ${unit}` }
const setText = (id, s, unit) => (isRepsRated(id) ? t('{0} reps', s.r) : `${+(+s.w).toFixed(1)} ${unit} × ${s.r}`)
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
  const r = map[slug], nx = r && rateOf(r.ex) ? nextTier(r.ex, r.prim ? r.pct : r.pct / 0.6, prof) : null
  const sug = CATALOGUE.filter(e => rateOf(e) && (musclesOf(e)[slug] || 0) >= 0.75).sort((a, b) => Number(isClassicEx(b)) - Number(isClassicEx(a))).slice(0, 6)
  useUI.getState().openSheet(close => <div className="fs-sheet">
    <GemDefs />
    <h2>{t(MUSCLE_NAME[slug])}</h2>
    {r ? <>
      <div className="fs-mhead"><Gem tier={r.tier} size={56} /><div><b>{r.tier.n}</b><span>{t('Top {0}% of gym-goers like you', topTxt(r.pct))}</span></div></div>
      <p><b>{t('Best')}:</b> {nameOf(r.ex)} · {setText(r.ex, r.s, prof.unit)}{r.prim ? '' : ` · ${t('assisting muscle, counts 60%')}`}</p>
      {nx && <p className="fs-next"><Gem tier={nx.tier} size={18} /> {t('Next: {0} at {1} × 10 on {2}', nx.tier.n, isRepsRated(r.ex) ? t('{0} reps', Math.ceil(nx.value)) : fmtW(nx.value, prof.unit), nameOf(r.ex))}</p>}
    </> : <p className="fs-muted">{t('Not trained yet. Log one of these to light it up:')}</p>}
    <div className="fs-sug">{sug.map(e => <div key={e.id}>{exerciseNameFor(e)}</div>)}</div>
    <button className="btn fs-full" onClick={() => { close(); nav('/library') }}>{t('Browse exercises')}</button>
  </div>)
}

export default function Hub() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const geo = useGeometry()
  const [height, setHeight] = useState(readHeight)
  const prof = useMemo(() => profileOf(S, { height }), [S, height])
  const map = useMemo(() => muscleTiers(S, prof), [S, prof])
  const ov = overall(map)
  const g = geo && (geo[prof.sex === 'f' ? 'female' : 'male'] || geo.male)
  const trained = Object.entries(map).sort((a, b) => b[1].pct - a[1].pct)
  const onMuscle = slug => muscleSheet(slug, map, prof, nav)
  const saveHeight = v => { const n = Math.round(Number(v)) || 0; setHeight(n); try { n ? localStorage.setItem(HEIGHT_KEY, String(n)) : localStorage.removeItem(HEIGHT_KEY) } catch { /* private mode */ } }
  const missing = !prof.weight || !S?.birthYear || !height
  return <>
    <div className="hdr"><div style={{ flex: 1 }}><h1>{t('Body')}</h1><div className="sub">{t('Your strength level, muscle by muscle')}</div></div>
      <button className="btn fs-lvlbtn" onClick={() => nav('/stats')}>{t('Stats')}</button></div>
    <div className="fs-hub">
      <GemDefs />
      <div className="fs-tiers">{TIERS.slice(1).map(tr => <button key={tr.id} className={ov?.tier.id === tr.id ? 'on' : ''} onClick={() => levelsSheet(prof)} aria-label={tr.n}>
        <Gem tier={tr} size={26} /><small>{t('{0}%', tr.top)}</small></button>)}</div>
      <div className="fs-stage">
        <div className="fs-call tl">{ov ? <Gem tier={ov.tier} size={34} /> : null}<b>{t('Overall')}</b><small>{ov ? `${ov.tier.n} · ${t('top {0}%', topTxt(ov.pct))}` : t('No lifts yet')}</small></div>
        <div className="fs-call tr"><b>{t('Train next')}</b><small>{ov ? t(MUSCLE_NAME[ov.weakest]) : t('Anything')}</small></div>
        {g ? <div className="fs-bodies"><Body view={g.front} map={map} onMuscle={onMuscle} /><Body view={g.back} map={map} onMuscle={onMuscle} /></div> : <div className="fs-bodies ph" />}
      </div>
      <div className="fs-list">{trained.length ? trained.map(([slug, r]) => <button key={slug} className="fs-row" onClick={() => onMuscle(slug)}>
        <Gem tier={r.tier} size={24} /><div><b>{t(MUSCLE_NAME[slug])}</b><small>{nameOf(r.ex)} · {setText(r.ex, r.s, prof.unit)}{r.prim ? '' : ` (${t('assisting')})`}</small></div>
        <span>{r.tier.n}<small>{t('Top {0}%', topTxt(r.pct))}</small></span></button>)
        : <p className="fs-empty">{t('Log weights and reps: your muscles light up and grow. Tap a gem for the levels.')}</p>}</div>
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
