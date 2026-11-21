// FitSmarter: the body as one sculpted surface, like a statue. An original figure described as a
// signed distance field: a base body (head, torso, limbs) plus the muscles on top, all blended
// smoothly into one skin. Each muscle's size follows its level, and so does its definition: an
// untrained or low-level muscle melts softly into the body, a high-level one stands out with
// sharp grooves (the six-pack at Diamond is carved, at Silver it is a gentle hint).
// Pure maths, no three.js: field(p) for a point, sample(grid) for a whole grid.

/* ---------- distance primitives (metres, y up, the body faces +z) ---------- */
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z)
function ellipsoid(px, py, pz, c, r) {
  const x = px - c[0], y = py - c[1], z = pz - c[2]
  const k0 = len3(x / r[0], y / r[1], z / r[2]), k1 = len3(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]))
  return k1 === 0 ? -Math.min(...r) : k0 * (k0 - 1) / k1
}
// A capsule from a to b that tapers from ra to rb.
function cone(px, py, pz, a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2]
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2]
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)))
  return len3(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h)
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25 }

/* ---------- the base body (the same for everyone) ---------- */
// Each shape: its distance function, and a bounding sphere (centre, radius) for quick rejects.
const S = [-1, 1]
const E = (c, r) => ({ f: (x, y, z) => ellipsoid(x, y, z, c, r), c, R: Math.max(...r) })
const Cn = (a, b, ra, rb) => ({ f: (x, y, z) => cone(x, y, z, a, b, ra, rb), c: a.map((v, i) => (v + b[i]) / 2), R: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 + Math.max(ra, rb) })
const TORSO = [
  Cn([0, 1.46, -0.015], [0, 1.57, -0.004], 0.056, 0.046),  // neck
  E([0, 1.33, -0.01], [0.155, 0.16, 0.1]),              // ribcage
  E([0, 1.425, -0.012], [0.19, 0.055, 0.082]),          // shoulder girdle (the V)
  E([0, 1.2, -0.004], [0.128, 0.11, 0.086]),            // lower ribs
  E([0, 1.08, -0.004], [0.112, 0.11, 0.08]),            // waist
  E([0, 0.94, -0.008], [0.14, 0.092, 0.094]),           // pelvis
]
const HEAD = [
  E([0, 1.68, -0.004], [0.074, 0.092, 0.088]),         // cranium
  E([0, 1.612, 0.026], [0.05, 0.052, 0.06]),           // jaw and chin
  E([0, 1.655, 0.084], [0.01, 0.022, 0.014]),          // nose
  E([0, 1.69, 0.06], [0.06, 0.016, 0.03]),             // brow
]
const LIMBS = S.map(s => [
  [E([s * 0.19, 1.415, -0.008], [0.05, 0.045, 0.05]),                                  // shoulder joint
    Cn([s * 0.2, 1.405, 0], [s * 0.243, 1.135, -0.005], 0.044, 0.034),                  // upper arm
    Cn([s * 0.243, 1.13, -0.002], [s * 0.268, 0.878, 0.018], 0.036, 0.024),             // forearm
    E([s * 0.275, 0.815, 0.024], [0.021, 0.052, 0.034]),                                // hand
    Cn([s * 0.278, 0.8, 0.026], [s * 0.283, 0.72, 0.03], 0.019, 0.011)],                // fingers
  [Cn([s * 0.088, 0.92, 0], [s * 0.1, 0.52, 0.005], 0.082, 0.05),                       // thigh
    E([s * 0.1, 0.5, 0.018], [0.045, 0.048, 0.042]),                                    // knee
    Cn([s * 0.1, 0.49, 0], [s * 0.104, 0.085, -0.012], 0.048, 0.03),                    // shin
    E([s * 0.105, 0.04, 0.045], [0.038, 0.032, 0.1])],                                  // foot
]).flat()
// The union of a group, skipping shapes too far away to matter.
function group(list, x, y, z, k) {
  let d = 1e9
  for (const sh of list) {
    const lb = Math.hypot(x - sh.c[0], y - sh.c[1], z - sh.c[2]) - sh.R
    if (lb > d + k) continue
    d = smin(d, sh.f(x, y, z), k)
  }
  return d
}
const near = (list, x, y, z) => list.some(sh => Math.hypot(x - sh.c[0], y - sh.c[1], z - sh.c[2]) - sh.R < 0.08)

/* ---------- the muscles: [slug, centre, radii] per side ---------- */
const MUSCLE_SHAPES = []
const M = (slug, c, r, mirror = true) => { for (const s of mirror ? S : [1]) MUSCLE_SHAPES.push({ slug, c: [s * c[0], c[1], c[2]], r }) }
M('chest', [0.08, 1.345, 0.068], [0.092, 0.064, 0.05])
M('front-delts', [0.198, 1.415, 0.032], [0.042, 0.06, 0.04])
M('side-delts', [0.222, 1.405, -0.002], [0.04, 0.066, 0.05])
M('rear-delts', [0.2, 1.41, -0.04], [0.042, 0.058, 0.038])
M('trapezius', [0.075, 1.49, -0.035], [0.08, 0.038, 0.045])
M('trapezius', [0.04, 1.38, -0.075], [0.045, 0.07, 0.03])
M('lats', [0.125, 1.25, -0.045], [0.062, 0.125, 0.05])
M('upper-back', [0.07, 1.34, -0.082], [0.068, 0.065, 0.034])
M('serratus', [0.13, 1.24, 0.045], [0.03, 0.06, 0.03])
M('biceps', [0.227, 1.27, 0.026], [0.032, 0.072, 0.033])
M('triceps', [0.234, 1.29, -0.03], [0.035, 0.085, 0.034])
M('forearm', [0.25, 1.04, 0.014], [0.033, 0.075, 0.031])
M('obliques', [0.1, 1.1, 0.03], [0.034, 0.075, 0.045])
M('lower-back', [0.042, 1.08, -0.07], [0.036, 0.085, 0.03])
M('gluteal', [0.072, 0.9, -0.07], [0.08, 0.082, 0.06])
M('hip-flexors', [0.08, 0.92, 0.065], [0.035, 0.05, 0.03])
M('quadriceps', [0.12, 0.69, 0.03], [0.045, 0.14, 0.048])     // vastus lateralis
M('quadriceps', [0.093, 0.72, 0.058], [0.04, 0.15, 0.038])    // rectus femoris
M('quadriceps', [0.072, 0.585, 0.042], [0.036, 0.062, 0.038]) // vastus medialis (teardrop)
M('hamstring', [0.1, 0.72, -0.048], [0.05, 0.15, 0.045])
M('adductors', [0.055, 0.77, 0.005], [0.036, 0.1, 0.042])
M('calves', [0.114, 0.345, -0.032], [0.031, 0.082, 0.04])
M('calves', [0.088, 0.34, -0.03], [0.03, 0.075, 0.04])
M('tibialis', [0.114, 0.3, 0.026], [0.018, 0.08, 0.02])
for (const y of [1.21, 1.14, 1.07]) M('abs', [0.029, y, 0.07], [0.027, 0.031, 0.02])
export const MUSCLE_SLUGS = [...new Set(MUSCLE_SHAPES.map(m => m.slug))]

/**
 * The body for a set of muscle states: { slug: { grow, def } }, grow ≈ 0.8–1.3 (size), def 0–1
 * (definition). Returns field(x, y, z) → signed distance (negative inside) and nearest(x, y, z)
 * → the muscle a surface point belongs to.
 */
export function makeBody(states = {}) {
  const ms = MUSCLE_SHAPES.map(m => {
    const st = states[m.slug] || { grow: 0.8, def: 0 }
    const g = st.grow, d = st.def
    // abs stand out mostly forward with definition; other muscles grow all round
    const r = m.slug === 'abs' ? [m.r[0] * (0.9 + 0.2 * d), m.r[1] * (0.92 + 0.12 * d), m.r[2] * (0.35 + 0.9 * d)] : m.r.map(v => v * g)
    const c = m.slug === 'abs' ? [m.c[0], m.c[1], m.c[2] + 0.004 + d * 0.006] : m.c
    // blend radius: soft for low levels (melts in), tight for high levels (carved grooves)
    const k = 0.05 - 0.038 * d
    return { slug: m.slug, c, r, k }
  })
  // torso and head blend broadly; each limb blends tightly so the legs stay two legs
  const base = (x, y, z) => {
    let d = group(TORSO, x, y, z, 0.085)
    if (y > 1.5) d = smin(d, group(HEAD, x, y, z, 0.03), 0.035)
    for (const limb of LIMBS) {
      if (!near(limb, x, y, z)) continue
      d = smin(d, group(limb, x, y, z, 0.025), 0.028)
    }
    return d
  }
  const field = (x, y, z) => {
    let d = base(x, y, z)
    for (const m of ms) {
      // quick reject: far from this muscle, it changes nothing
      const dx = x - m.c[0], dy = y - m.c[1], dz = z - m.c[2], rr = Math.max(m.r[0], m.r[1], m.r[2]) + 0.06
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue
      d = smin(d, ellipsoid(x, y, z, m.c, m.r), m.k)
    }
    return d
  }
  const nearest = (x, y, z) => {
    let best = null, bd = 0.03
    for (const m of ms) { const e = ellipsoid(x, y, z, m.c, m.r); if (e < bd) { bd = e; best = m.slug } }
    return best
  }
  return { field, nearest }
}

/** The box the body fits in (metres) and the grid that samples it. */
export const BOUNDS = { min: [-0.36, -0.01, -0.2], max: [0.36, 1.8, 0.2] }

/**
 * The grid for marching cubes (res³, x fastest), as −distance × 100 so the inside is positive:
 * exact near the surface, one value per block far from it.
 */
export function fillGrid(states, res) {
  const { field } = makeBody(states)
  const n = res, f = new Float32Array(n * n * n)
  const SIZE = BOUNDS.max.map((v, i) => v - BOUNDS.min[i]), MID = BOUNDS.max.map((v, i) => (v + BOUNDS.min[i]) / 2)
  const X = i => MID[0] + ((i - n / 2) / (n / 2)) * SIZE[0] / 2
  const Y = i => MID[1] + ((i - n / 2) / (n / 2)) * SIZE[1] / 2
  const Z = i => MID[2] + ((i - n / 2) / (n / 2)) * SIZE[2] / 2
  const B = 4, cell = Math.hypot(SIZE[0], SIZE[1], SIZE[2]) / n * B * 0.75
  for (let bz = 0; bz < n; bz += B) for (let by = 0; by < n; by += B) for (let bx = 0; bx < n; bx += B) {
    const dc = field(X(bx + B / 2), Y(by + B / 2), Z(bz + B / 2)), far = Math.abs(dc) > cell
    for (let z = bz; z < Math.min(n, bz + B); z++) for (let y = by; y < Math.min(n, by + B); y++) for (let x = bx; x < Math.min(n, bx + B); x++)
      f[x + y * n + z * n * n] = -(far ? dc : field(X(x), Y(y), Z(z))) * 100
  }
  return f
}
