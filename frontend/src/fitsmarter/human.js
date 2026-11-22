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
 * The physique for a level, like the four bodies of a fitness progression:
 *   levels 1–2   lean and slim, a narrow frame, little muscle
 *   levels 3–4   athletic: low fat, visible abs, light muscle
 *   levels 5–7   well proportioned: a full chest, round shoulders, clear six-pack
 *   levels 8–10  strong and defined: big chest, shoulders and arms, deep cuts
 * t is the tier index (0 iron … 9 olympian, fractions blend). Returns { muscle, lean, extra }.
 */
const STAGES = [[0, -0.2, 0.7, -0.5], [2.5, 0.3, 0.8, 0.1], [5, 0.7, 0.75, 0.7], [8, 0.95, 0.65, 1.25], [9, 1.0, 0.6, 1.45]]
export function stage(t) {
  t = Math.max(0, Math.min(9, t))
  let k = 0; while (k < STAGES.length - 2 && t > STAGES[k + 1][0]) k++
  const [a, b] = [STAGES[k], STAGES[k + 1]], f = (t - a[0]) / (b[0] - a[0]), e = f * f * (3 - 2 * f)
  const mix = i => a[i] + (b[i] - a[i]) * e
  return { muscle: mix(1), lean: mix(2), extra: mix(3) }
}

const INFLATE = [
  ['torso-muscle-pectoral-incr', 0.016], ['torso-muscle-dorsi-incr', 0.01],
  ['l-upperarm-shoulder-muscle-incr', 0.014], ['r-upperarm-shoulder-muscle-incr', 0.014],
  ['l-upperarm-muscle-incr', 0.013], ['r-upperarm-muscle-incr', 0.013],
  ['l-lowerarm-muscle-incr', 0.006], ['r-lowerarm-muscle-incr', 0.006],
  ['l-upperleg-muscle-incr', 0.015], ['r-upperleg-muscle-incr', 0.015],
  ['l-lowerleg-muscle-incr', 0.008], ['r-lowerleg-muscle-incr', 0.008],
]
// the rest shape's normals and each muscle's weight, computed once per body
function restData(h) {
  if (h._rest) return h._rest
  const n = new Float32Array(h.nv * 3), b = h.base, ix = h.index
  for (let f = 0; f < ix.length; f += 3) {
    const a = ix[f] * 3, c = ix[f + 1] * 3, e = ix[f + 2] * 3
    const ux = b[c] - b[a], uy = b[c + 1] - b[a + 1], uz = b[c + 2] - b[a + 2], vx = b[e] - b[a], vy = b[e + 1] - b[a + 1], vz = b[e + 2] - b[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const v of [a, c, e]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l }
  // weight: how far the muscle's own target moves each point, so the swelling peaks in the belly of
  // the muscle and fades smoothly to nothing at its edges (a round muscle, not a slab)
  const rw = {}
  for (const [name] of INFLATE) {
    const t = h.targets[name]; if (!t) continue
    const w = new Float32Array(h.nv); let max = 0
    for (let k = 0; k < t.idx.length; k++) { const m = Math.hypot(t.d[k * 3], t.d[k * 3 + 1], t.d[k * 3 + 2]); w[t.idx[k]] = m; if (m > max) max = m }
    for (let i = 0; i < h.nv; i++) w[i] = Math.pow(w[i] / (max || 1), 0.75)
    rw[name] = w
  }
  return (h._rest = { n, rw })
}

/**
 * The body's positions: the overall physique { muscle 0–1, lean 0–1, extra 0–1 } and, per muscle,
 * how much bigger or smaller it is than the rest ({ slug: -1…1 }). Returns a fresh Float32Array.
 */
export function shape(h, { muscle = 0.3, lean = 0.5, extra = 0, local = {} }) {
  const p = new Float32Array(h.base)
  const add = (name, w) => {
    const t = h.targets[name]
    if (!t || !w) return
    const s = w / 10000
    for (let k = 0; k < t.idx.length; k++) { const i = t.idx[k] * 3; p[i] += t.d[k * 3] * s; p[i + 1] += t.d[k * 3 + 1] * s; p[i + 2] += t.d[k * 3 + 2] * s }
  }
  // the whole body: towards max muscle, and from average to low fat
  add('universal-male-young-maxmuscle-averageweight', muscle * (1 - lean))
  add('universal-male-young-maxmuscle-minweight', muscle * lean)
  add('universal-male-young-averagemuscle-minweight', (1 - muscle) * lean)
  // each region: the overall build plus how far its own muscle is ahead or behind
  const w = {}
  for (const [slug, v] of Object.entries(local)) for (const t of REGION[slug] || []) w[t] = Math.max(w[t] ?? -9, v)
  const g = extra / 1.45   // -0.1 at the first level … 1 at the top
  const part = (t, k, cap = 0.9) => add(t, Math.max(-0.4, Math.min(cap, (extra + (w[t] || 0)) * k)))
  part('torso-muscle-pectoral-incr', 0.6)
  part('torso-muscle-dorsi-incr', 0.5)
  for (const s of ['l', 'r']) {
    part(s + '-upperarm-shoulder-muscle-incr', 0.4, 0.6)
    part(s + '-upperarm-muscle-incr', 0.5)
    part(s + '-lowerarm-muscle-incr', 0.5)
    part(s + '-upperleg-muscle-incr', 0.45)
    part(s + '-lowerleg-muscle-incr', 0.4)
  }
  add('stomach-pregnant-decr', 0.3 + lean * 0.5)
  // A classical statue's proportions at the top (like Polykleitos' Doryphoros): wide shoulders, a
  // deep chest, a strong neck, thick forearms and upper arms, solid thighs and calves, a firm waist.
  // Every level below has the same body scaled down towards a slim beginner; each muscle also
  // follows its own level (its offset from the rest).
  const m = (name, v) => add(`measure-${name}-${v >= 0 ? 'incr' : 'decr'}`, Math.min(1.2, Math.abs(v)))
  const o = slug => local[slug] || 0
  m('shoulder-dist', g * 0.7 + o('side-delts') * 0.4)
  m('bust-circ', g * 0.75 + o('chest') * 0.5)
  m('frontchest-dist', g * 0.35)
  m('underbust-circ', g * 0.45 + o('lats') * 0.3)
  m('neck-circ', g * 0.55 + o('trapezius') * 0.3)
  m('upperarm-circ', g * 0.9 + (o('biceps') + o('triceps')) * 0.3)
  m('wrist-circ', g * 0.45)
  m('thigh-circ', g * 0.75 + (o('quadriceps') + o('hamstring')) * 0.3)
  m('calf-circ', g * 0.8 + o('calves') * 0.5)
  m('waist-circ', g * 0.1)
  m('hips-circ', g * 0.15 + o('gluteal') * 0.3)
  // the forearms: MakeHuman has no circumference for them, so the forearm is scaled across
  const fa = Math.max(-0.3, Math.min(1, g * 0.8 + o('forearm') * 0.5))
  if (fa > 0) for (const s of ['l', 'r']) { add(s + '-lowerarm-scale-horiz-incr', fa * 0.7); add(s + '-lowerarm-scale-depth-incr', fa * 0.9) }
  else for (const s of ['l', 'r']) add(s + '-lowerarm-muscle-decr', -fa)
  // a little roundness in the belly of each muscle, fading to its edges
  const { n, rw } = restData(h)
  for (const [t, mm] of INFLATE) {
    const r = rw[t]; if (!r) continue
    const d = Math.max(-0.3, Math.min(1.6, extra + (w[t] || 0))) * mm * 0.45
    if (!d) continue
    for (let i = 0; i < h.nv; i++) { const a = r[i]; if (a > 0.01) { const k = d * a; p[i * 3] += n[i * 3] * k; p[i * 3 + 1] += n[i * 3 + 1] * k; p[i * 3 + 2] += n[i * 3 + 2] * k } }
  }
  // the V of a trained back and shoulders
  add('torso-vshape-incr', Math.max(0, Math.min(0.4, extra * 0.2 + (o('lats') + o('side-delts')) * 0.15)))
  pose(p, h)
  return p
}

/* A natural standing pose with MakeHuman's own skeleton (default.mhskel, CC0): each bone turns
   about its joint, children follow their parents, and the skin follows the bones by MakeHuman's
   weights. Angles in radians about the body's axes (x across, y up, z forward), for the left side;
   the right side mirrors them. */
const POSE = {
  // contrapposto, like a Greek statue: weight on the right leg, the left one relaxed, hips and
  // shoulders tilted against each other, head turned a little. Names with .L/.R are not mirrored.
  'root': [['z', -0.1]],
  'spine05': [['z', 0.04]], 'spine04': [['z', 0.05]], 'spine02': [['z', 0.06]], 'spine01': [['y', 0.08]],
  'neck02': [['y', 0.32], ['x', 0.1]],
  'upperleg01.R': [['z', 0.1]], 'lowerleg02.R': [['z', -0.02]],
  'upperleg01.L': [['z', 0.13], ['x', -0.24]], 'lowerleg01.L': [['x', 0.5]], 'foot.L': [['x', -0.2], ['y', 0.25]],
  'upperarm01': [['z', -0.58]],                   // arms down to the sides
  'lowerarm01': [['x', 0.42], ['z', 0.3]],        // forearm down beside the thigh, elbow softly bent
  'lowerarm02': [['twist', -1.2]],                // turn the forearm about itself: palm to the thigh, thumb forward
  'wrist': [['x', 0.08]],                         // a straight, relaxed wrist
  'finger1-1': [['y', -0.1]], 'finger1-2': [['x', 0.2]], 'finger1-3': [['x', 0.25]],
  'finger2-1': [['x', 0.3]], 'finger2-2': [['x', 0.45]], 'finger2-3': [['x', 0.35]],
  'finger3-1': [['x', 0.34]], 'finger3-2': [['x', 0.5]], 'finger3-3': [['x', 0.38]],
  'finger4-1': [['x', 0.38]], 'finger4-2': [['x', 0.55]], 'finger4-3': [['x', 0.4]],
  'finger5-1': [['x', 0.42]], 'finger5-2': [['x', 0.6]], 'finger5-3': [['x', 0.42]],
}
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }
let mats = null
function boneMatrices(h) {
  if (mats) return mats
  const out = [], q = new THREE.Quaternion(), r = new THREE.Quaternion()
  for (const b of h.bones) {
    const own1 = POSE[b.name], side = own1 ? 1 : b.name.endsWith('.R') ? -1 : 1, key = own1 ? b.name : b.name.replace(/\.[LR]$/, '')
    q.identity()
    // 'twist' turns about the bone's own length (head to tail), like turning a forearm
    const own = new THREE.Vector3(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]).normalize()
    for (const [ax, ang] of POSE[key] || []) q.multiply(r.setFromAxisAngle(ax === 'twist' ? own : AXES[ax], ax === 'x' ? ang : ang * side))
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
