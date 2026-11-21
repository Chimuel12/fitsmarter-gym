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
  add('torso-vshape-incr', Math.min(1, ((local.lats || 0) + (local['side-delts'] || 0)) / 2) * 0.5)
  pose(p)
  return p
}

/* MakeHuman's body stands in an A-pose (arms about 49° below horizontal). A natural, relaxed
   stance: each arm turns down about its shoulder joint to hang beside the body, the elbows bend a
   little forward and the hands rest by the thighs. Like a simple skeleton: only points near the
   arm's own axis move, blended in across the shoulder so the deltoid and armpit stay smooth. */
const SHOULDER = [0.172, 1.372, -0.12], ARM_DIR = [0.655, -0.756]   // from the measured A-pose
const DROP = 0.6, BEND = 0.32, UPPER = 0.27                      // radians, radians, metres to the elbow
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
function pose(p) {
  for (let i = 0; i < p.length; i += 3) {
    const s = Math.sign(p[i]) || 1
    const dx = p[i] - s * SHOULDER[0], dy = p[i + 1] - SHOULDER[1]
    const t = dx * s * ARM_DIR[0] + dy * ARM_DIR[1]                  // along the arm
    const px = dx - s * ARM_DIR[0] * t, py = dy - ARM_DIR[1] * t       // away from its axis
    const perp = Math.hypot(px, py)
    const lim = 0.095 + 0.09 * ss(0.12, 0.34, t)
    if (t < -0.04 || perp > lim + 0.03) continue
    // fades out both up the shoulder and out to the side, so no triangle is torn at the armpit
    const w = ss(-0.04, 0.07, t) * (1 - ss(lim - 0.03, lim + 0.03, perp))
    // down about the shoulder (in the body's plane)
    const a = -s * DROP * w, c = Math.cos(a), sn = Math.sin(a)
    let x = dx * c - dy * sn, y = dx * sn + dy * c, z = p[i + 2]
    // the elbow: the forearm and hand swing a little forward
    const e = ss(UPPER - 0.03, UPPER + 0.04, t)
    if (e > 0) {
      const ex = s * ARM_DIR[0] * UPPER, ey = ARM_DIR[1] * UPPER
      const exr = ex * c - ey * sn, eyr = ex * sn + ey * c         // the elbow, already lowered
      const b = BEND * e, cb = Math.cos(b), sb = Math.sin(b)
      const ry = y - eyr, rz = z - SHOULDER[2]
      y = eyr + ry * cb - rz * sb; z = SHOULDER[2] + ry * sb + rz * cb
    }
    p[i] = s * SHOULDER[0] + x; p[i + 1] = SHOULDER[1] + y; p[i + 2] = z
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
