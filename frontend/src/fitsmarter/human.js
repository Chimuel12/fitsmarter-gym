// FitSmarter: the realistic human body. MakeHuman's base mesh and muscle targets (CC0 1.0,
// makehumancommunity/makehuman), packed by scripts/fitsmarter/build-human.mjs into
// public/fitsmarter/human.bin. The overall level sets how muscular and lean the whole body is
// (MakeHuman's universal muscle/weight targets); each muscle's own level grows its region with
// MakeHuman's local targets (pectorals, lats, shoulders, upper and lower arms and legs, waist).
import * as THREE from 'three'

let loading = null
/** The packed body: { base, index, targets: { name: { idx, d } }, nv }. Loaded once. */
export function loadHuman() {
  if (!loading) loading = fetch(new URL('fitsmarter/human.bin', document.baseURI)).then(r => { if (!r.ok) throw new Error('human ' + r.status); return r.arrayBuffer() }).then(buf => {
    const hl = new Uint32Array(buf, 0, 1)[0]
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)))
    let o = 4 + hl
    const base = new Float32Array(buf, o, head.nv * 3); o += head.nv * 12
    const index = new Uint32Array(buf, o, head.ni); o += head.ni * 4
    const targets = {}
    for (const t of head.targets) {
      const idx = new Uint16Array(buf, o, t.n); o += t.n * 2
      const d = new Int16Array(buf, o, t.n * 3); o += t.n * 6
      targets[t.name] = { idx, d }
    }
    return { ...head, base, index, targets }
  })
  return loading
}

// Which local targets each muscle drives (both sides).
const REGION = {
  chest: ['torso-muscle-pectoral-incr'],
  lats: ['torso-muscle-dorsi-incr'], 'upper-back': ['torso-muscle-dorsi-incr'],
  'front-delts': ['l-upperarm-shoulder-muscle-incr', 'r-upperarm-shoulder-muscle-incr'],
  'side-delts': ['l-upperarm-shoulder-muscle-incr', 'r-upperarm-shoulder-muscle-incr'],
  'rear-delts': ['l-upperarm-shoulder-muscle-incr', 'r-upperarm-shoulder-muscle-incr'],
  biceps: ['l-upperarm-muscle-incr', 'r-upperarm-muscle-incr'], triceps: ['l-upperarm-muscle-incr', 'r-upperarm-muscle-incr'],
  forearm: ['l-lowerarm-muscle-incr', 'r-lowerarm-muscle-incr'],
  quadriceps: ['l-upperleg-muscle-incr', 'r-upperleg-muscle-incr'], hamstring: ['l-upperleg-muscle-incr', 'r-upperleg-muscle-incr'],
  gluteal: ['l-upperleg-muscle-incr', 'r-upperleg-muscle-incr'], adductors: ['l-upperleg-muscle-incr', 'r-upperleg-muscle-incr'],
  calves: ['l-lowerleg-muscle-incr', 'r-lowerleg-muscle-incr'], tibialis: ['l-lowerleg-muscle-incr', 'r-lowerleg-muscle-incr'],
  abs: ['stomach-pregnant-decr'], obliques: ['stomach-pregnant-decr'],
}
// Reverse: a target's region → the muscle a tap on it means (front or back of the limb).
const TAP = {
  'torso-muscle-pectoral-incr': () => 'chest', 'torso-muscle-dorsi-incr': () => 'lats',
  'l-upperarm-shoulder-muscle-incr': z => (z >= 0 ? 'front-delts' : 'rear-delts'), 'r-upperarm-shoulder-muscle-incr': z => (z >= 0 ? 'front-delts' : 'rear-delts'),
  'l-upperarm-muscle-incr': z => (z >= 0 ? 'biceps' : 'triceps'), 'r-upperarm-muscle-incr': z => (z >= 0 ? 'biceps' : 'triceps'),
  'l-lowerarm-muscle-incr': () => 'forearm', 'r-lowerarm-muscle-incr': () => 'forearm',
  'l-upperleg-muscle-incr': z => (z >= 0 ? 'quadriceps' : 'hamstring'), 'r-upperleg-muscle-incr': z => (z >= 0 ? 'quadriceps' : 'hamstring'),
  'l-lowerleg-muscle-incr': z => (z >= 0 ? 'tibialis' : 'calves'), 'r-lowerleg-muscle-incr': z => (z >= 0 ? 'tibialis' : 'calves'),
  'stomach-pregnant-decr': () => 'abs',
}

/**
 * The body's positions for a state: overall { muscle 0–1, lean 0–1 } and per-muscle growth
 * levels { slug: 0–1 }. Returns a fresh Float32Array.
 */
export function shape(h, { muscle = 0.3, lean = 0.3, local = {} }) {
  const p = new Float32Array(h.base)
  const add = (name, w) => {
    const t = h.targets[name]
    if (!t || !w) return
    const s = w / 10000
    for (let k = 0; k < t.idx.length; k++) { const i = t.idx[k] * 3; p[i] += t.d[k * 3] * s; p[i + 1] += t.d[k * 3 + 1] * s; p[i + 2] += t.d[k * 3 + 2] * s }
  }
  // the whole body: towards max muscle, and from average to low fat as definition grows
  add('universal-male-young-maxmuscle-averageweight', muscle * (1 - lean))
  add('universal-male-young-maxmuscle-minweight', muscle * lean)
  add('universal-male-young-averagemuscle-minweight', (1 - muscle) * lean)
  // each region: the strongest of the muscles that drive it
  const w = {}
  for (const [slug, v] of Object.entries(local)) for (const t of REGION[slug] || []) w[t] = Math.max(w[t] || 0, v)
  for (const [t, v] of Object.entries(w)) add(t, v)
  // the V: broad back and shoulders together
  add('torso-vshape-incr', Math.min(1, ((local.lats || 0) + (local['side-delts'] || 0)) / 2) * 0.8)
  pose(p)
  return p
}

/* MakeHuman's body stands in an A-pose. Lower the arms to the sides, like a statue: each arm
   vertex turns about its shoulder, blended in across the shoulder so the armpit stays smooth. */
const ARM_DOWN = 0.56   // radians
function pose(p) {
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], ax = Math.abs(x)
    if (ax < 0.13 || y < 1.08 - (ax - 0.15) * 1.1) continue
    const w = Math.min(1, Math.max(0, (ax - 0.13) / 0.09)), s = Math.sign(x)
    const px = s * 0.165, py = 1.395, a = -s * ARM_DOWN * w * w * (3 - 2 * w)
    const dx = x - px, dy = y - py, c = Math.cos(a), sn = Math.sin(a)
    p[i] = px + dx * c - dy * sn; p[i + 1] = py + dx * sn + dy * c
  }
}

/** For taps: vertex → the target that moves it most (built once). */
export function regionMap(h) {
  const best = new Float32Array(h.nv), who = new Array(h.nv)
  for (const name of Object.keys(TAP)) {
    const t = h.targets[name]; if (!t) continue
    for (let k = 0; k < t.idx.length; k++) {
      const m = Math.abs(t.d[k * 3]) + Math.abs(t.d[k * 3 + 1]) + Math.abs(t.d[k * 3 + 2])
      if (m > best[t.idx[k]]) { best[t.idx[k]] = m; who[t.idx[k]] = name }
    }
  }
  return (vi, z) => (who[vi] ? TAP[who[vi]](z) : null)
}

export function geometryOf(h) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(h.base), 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(h.nv * 3).fill(1), 3))
  g.setIndex(new THREE.BufferAttribute(h.index, 1))
  g.computeVertexNormals()
  return g
}
