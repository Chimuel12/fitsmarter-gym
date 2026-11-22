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
    const skinBone = new Uint8Array(buf, o, head.nv * 4); o += head.nv * 4
    const skinW = new Uint8Array(buf, o, head.nv * 4); o += head.nv * 4
    return { ...head, base, index, targets, skinBone, skinW }
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
  add('torso-vshape-incr', Math.min(1, ((local.lats || 0) + (local['side-delts'] || 0)) / 2) * 0.5)
  pose(p, h)
  return p
}

/* A natural standing pose with MakeHuman's own skeleton (default.mhskel, CC0): each bone turns
   about its joint, children follow their parents, and the skin follows the bones by MakeHuman's
   weights. Angles in radians about the body's axes (x across, y up, z forward), for the left side;
   the right side mirrors them. */
const POSE = {
  'upperarm01': [['z', -0.58]],                   // arms down to the sides
  'lowerarm01': [['x', 0.42], ['z', 0.3]],        // forearm down beside the thigh, elbow softly bent
  'lowerarm02': [['y', -0.35]],                   // turn the forearm so the palm faces the thigh
  'wrist': [['x', 0.3], ['z', -0.1]],             // a relaxed wrist
  'finger1-1': [['y', -0.15]], 'finger1-2': [['x', 0.15]], 'finger1-3': [['x', 0.15]],
  'finger2-1': [['x', 0.18]], 'finger2-2': [['x', 0.28]], 'finger2-3': [['x', 0.22]],
  'finger3-1': [['x', 0.22]], 'finger3-2': [['x', 0.32]], 'finger3-3': [['x', 0.24]],
  'finger4-1': [['x', 0.26]], 'finger4-2': [['x', 0.36]], 'finger4-3': [['x', 0.26]],
  'finger5-1': [['x', 0.3]], 'finger5-2': [['x', 0.4]], 'finger5-3': [['x', 0.28]],
}
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }
let mats = null
function boneMatrices(h) {
  if (mats) return mats
  const out = [], q = new THREE.Quaternion(), r = new THREE.Quaternion()
  for (const b of h.bones) {
    const side = b.name.endsWith('.R') ? -1 : 1, key = b.name.replace(/\.[LR]$/, '')
    q.identity()
    for (const [ax, ang] of POSE[key] || []) q.multiply(r.setFromAxisAngle(AXES[ax], ax === 'x' ? ang : ang * side))
    const hd = new THREE.Vector3(...b.head)
    const local = new THREE.Matrix4().makeTranslation(hd.x, hd.y, hd.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-hd.x, -hd.y, -hd.z))
    out.push(b.parent >= 0 ? out[b.parent].clone().multiply(local) : local)
  }
  return (mats = out.map(m => m.elements))
}
function pose(p, h) {
  if (!h?.bones || !h.skinBone) return
  const M = boneMatrices(h)
  for (let v = 0; v < h.nv; v++) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2]
    let nx = 0, ny = 0, nz = 0, wsum = 0
    for (let k = 0; k < 4; k++) {
      const w = h.skinW[v * 4 + k] / 255; if (!w) continue
      const e = M[h.skinBone[v * 4 + k]]
      nx += w * (e[0] * x + e[4] * y + e[8] * z + e[12]); ny += w * (e[1] * x + e[5] * y + e[9] * z + e[13]); nz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]); wsum += w
    }
    if (wsum > 0) { p[v * 3] = nx / wsum; p[v * 3 + 1] = ny / wsum; p[v * 3 + 2] = nz / wsum }
  }
}

/**
 * For colour: each vertex's share in each muscle region, from how far that region's target moves
 * it (0–1, softened), so a muscle's colour fades smoothly into its neighbours. Built once.
 * Returns [{ name, w: Float32Array(nv) }].
 */
export function regionWeights(h) {
  const out = []
  for (const name of Object.keys(TAP)) {
    const t = h.targets[name]; if (!t) continue
    const w = new Float32Array(h.nv); let max = 0
    for (let k = 0; k < t.idx.length; k++) { const m = Math.hypot(t.d[k * 3], t.d[k * 3 + 1], t.d[k * 3 + 2]); w[t.idx[k]] = m; if (m > max) max = m }
    let zs = 0, ws = 0
    for (let i = 0; i < h.nv; i++) { w[i] = Math.min(1, Math.sqrt(w[i] / (max || 1)) * 1.6); if (w[i] > 0.5) { zs += h.base[i * 3 + 2]; ws++ } }
    out.push({ name, w, tap: TAP[name], zMid: ws ? zs / ws : 0 })
  }
  return out
}

/** For taps: vertex → the target that moves it most (built once). */
export function regionMap(h) {
  const best = new Float32Array(h.nv), who = new Array(h.nv), mid = {}
  for (const r of regionWeights(h)) mid[r.name] = r.zMid
  for (const name of Object.keys(TAP)) {
    const t = h.targets[name]; if (!t) continue
    for (let k = 0; k < t.idx.length; k++) {
      const m = Math.abs(t.d[k * 3]) + Math.abs(t.d[k * 3 + 1]) + Math.abs(t.d[k * 3 + 2])
      if (m > best[t.idx[k]]) { best[t.idx[k]] = m; who[t.idx[k]] = name }
    }
  }
  // front or back: against the middle of that region in the rest shape, not the body's centre
  return vi => (who[vi] ? TAP[who[vi]](h.base[vi * 3 + 2] - mid[who[vi]]) : null)
}

export function geometryOf(h) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(h.base), 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(h.nv * 3).fill(1), 3))
  g.setAttribute('aMR', new THREE.BufferAttribute(new Float32Array(h.nv * 2).fill(0.5), 2))
  g.setAttribute('aTier', new THREE.BufferAttribute(new Float32Array(h.nv).fill(-1), 1))
  g.setAttribute('aSeam', new THREE.BufferAttribute(new Float32Array(h.nv), 1))
  g.setIndex(new THREE.BufferAttribute(h.index, 1))
  g.computeVertexNormals()
  return g
}
