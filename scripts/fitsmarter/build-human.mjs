// FitSmarter: turns MakeHuman's CC0 base body and a few of its CC0 targets (morphs) into one
// compact file for the app: frontend/public/fitsmarter/human.bin.
//   node scripts/fitsmarter/build-human.mjs <folder with base.obj and the .target files>
// Only the "body" group is kept (no eyes, teeth, helpers). Units: metres, feet on y = 0.
// Layout (little-endian): u32 header length, JSON header, then per the header's offsets:
// positions f32[nv*3], indices u32[ni], per target u16 index[n] + i16 delta[n*3] (0.1 mm),
// then the skeleton's skin: u8 bone[nv*4] + u8 weight[nv*4] (the four strongest bones, /255).
// The skeleton itself (default.mhskel: bones, parents, joint positions) is in the header.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
const TARGETS = [
  'caucasian-male-young', 'african-male-young', 'asian-male-young',
  'universal-male-young-averagemuscle-averageweight', 'universal-male-young-averagemuscle-minweight',
  'universal-male-young-maxmuscle-averageweight', 'universal-male-young-maxmuscle-minweight',
  'l-upperarm-muscle-incr', 'r-upperarm-muscle-incr', 'l-lowerarm-muscle-incr', 'r-lowerarm-muscle-incr',
  'l-upperarm-shoulder-muscle-incr', 'r-upperarm-shoulder-muscle-incr', 'l-upperleg-muscle-incr', 'r-upperleg-muscle-incr',
  'l-lowerleg-muscle-incr', 'r-lowerleg-muscle-incr', 'torso-muscle-dorsi-incr', 'torso-muscle-pectoral-incr',
  'torso-vshape-incr', 'stomach-pregnant-decr',
  // measurements, to give the strongest level a classical statue's proportions and scale them down
  ...['bust-circ', 'calf-circ', 'hips-circ', 'neck-circ', 'shoulder-dist', 'thigh-circ', 'upperarm-circ', 'waist-circ',
    'wrist-circ', 'underbust-circ', 'frontchest-dist'].flatMap(m => [`measure-${m}-incr`, `measure-${m}-decr`]),
  ...['l', 'r'].flatMap(s => ['lowerarm-scale-horiz-incr', 'lowerarm-scale-depth-incr', 'upperarm-muscle-decr', 'lowerarm-muscle-decr',
    'upperleg-muscle-decr', 'lowerleg-muscle-decr'].map(t => `${s}-${t}`)),
]
const UNIT = 0.1   // MakeHuman works in decimetres

const obj = readFileSync(join(dir, 'base.obj'), 'utf8').split('\n')
const V = [], faces = []
let group = ''
for (const l of obj) {
  if (l.startsWith('v ')) { const [, x, y, z] = l.split(/\s+/); V.push([+x, +y, +z]) }
  else if (l.startsWith('g ')) group = l.slice(2).trim()
  else if (l.startsWith('f ') && group === 'body') faces.push(l.slice(2).trim().split(/\s+/).map(t => parseInt(t, 10) - 1))
}
// keep only the vertices the body uses, renumbered
const map = new Int32Array(V.length).fill(-1), keep = []
for (const f of faces) for (const v of f) if (map[v] < 0) { map[v] = keep.length; keep.push(v) }
const idx = []
for (const f of faces) for (let i = 1; i + 1 < f.length; i++) idx.push(map[f[0]], map[f[i]], map[f[i + 1]])

// the body as MakeHuman shows it by default (male, young, average): base + race targets / 3 + universal
const readTarget = name => {
  const out = new Map()
  for (const l of readFileSync(join(dir, name + '.target'), 'utf8').split('\n')) {
    if (!l || l[0] === '#') continue
    const [i, x, y, z] = l.trim().split(/\s+/)
    if (map[+i] >= 0) out.set(map[+i], [+x * UNIT, +y * UNIT, +z * UNIT])
  }
  return out
}
const rawTarget = name => {
  const out = new Map()
  for (const l of readFileSync(join(dir, name + '.target'), 'utf8').split('\n')) {
    if (!l || l[0] === '#') continue
    const [i, x, y, z] = l.trim().split(/\s+/)
    out.set(+i, [+x * UNIT, +y * UNIT, +z * UNIT])
  }
  return out
}
const pos = new Float32Array(keep.length * 3)
keep.forEach((v, i) => { pos[i * 3] = V[v][0] * UNIT; pos[i * 3 + 1] = V[v][1] * UNIT; pos[i * 3 + 2] = V[v][2] * UNIT })
const targets = Object.fromEntries(TARGETS.map(n => [n, readTarget(n)]))
// bake the default male into the base so the app only blends the muscle targets
const bake = (name, w) => { for (const [i, d] of targets[name]) { pos[i * 3] += d[0] * w; pos[i * 3 + 1] += d[1] * w; pos[i * 3 + 2] += d[2] * w } }
for (const r of ['caucasian', 'african', 'asian']) bake(`${r}-male-young`, 1 / 3)
// feet on the floor, centred
let minY = Infinity, maxY = -Infinity, cx = 0, cz = 0
for (let i = 0; i < keep.length; i++) { minY = Math.min(minY, pos[i * 3 + 1]); maxY = Math.max(maxY, pos[i * 3 + 1]); cx += pos[i * 3]; cz += pos[i * 3 + 2] }
cx /= keep.length; cz /= keep.length
for (let i = 0; i < keep.length; i++) { pos[i * 3] -= cx; pos[i * 3 + 1] -= minY; pos[i * 3 + 2] -= cz }

// the skeleton: joint positions from MakeHuman's joint helper vertices (same race blend, same shift)
const sk = JSON.parse(readFileSync(join(dir, 'default.mhskel'), 'utf8'))
const races = ['caucasian', 'african', 'asian'].map(r => rawTarget(`${r}-male-young`))
const at = vi => { const p = V[vi].map(v => v * UNIT); for (const t of races) { const d = t.get(vi); if (d) for (let c = 0; c < 3; c++) p[c] += d[c] / 3 } return [p[0] - cx, p[1] - minY, p[2] - cz] }
const joint = name => { const vs = sk.joints[name]; const p = [0, 0, 0]; for (const v of vs) { const q = at(v); for (let c = 0; c < 3; c++) p[c] += q[c] / vs.length } return p.map(v => +v.toFixed(5)) }
const names = Object.keys(sk.bones), order = []
const visit = n => { if (order.includes(n)) return; const pa = sk.bones[n].parent; if (pa) visit(pa); order.push(n) }
names.forEach(visit)
const bones = order.map(n => ({ name: n, parent: sk.bones[n].parent ? order.indexOf(sk.bones[n].parent) : -1, head: joint(sk.bones[n].head), tail: joint(sk.bones[n].tail) }))
// the skin: each body vertex's four strongest bones
const wj = JSON.parse(readFileSync(join(dir, 'default_weights.mhw'), 'utf8')).weights
const per = Array.from({ length: keep.length }, () => [])
for (const [bn, list] of Object.entries(wj)) { const bi = order.indexOf(bn); if (bi < 0) continue; for (const [vi, w] of list) if (map[vi] >= 0) per[map[vi]].push([bi, w]) }
const sb = new Uint8Array(keep.length * 4), sw = new Uint8Array(keep.length * 4)
per.forEach((l, i) => { l.sort((a, b) => b[1] - a[1]); const top = l.slice(0, 4), sum = top.reduce((a, b) => a + b[1], 0) || 1; top.forEach(([b, w], k) => { sb[i * 4 + k] = b; sw[i * 4 + k] = Math.round(w / sum * 255) }) })

const blend = TARGETS.slice(3)
const header = { nv: keep.length, ni: idx.length, height: maxY - minY, targets: blend.map(n => ({ name: n, n: targets[n].size })), bones, license: 'MakeHuman base mesh and targets, CC0 1.0 (makehumancommunity/makehuman)' }
const parts = [Buffer.from(pos.buffer), Buffer.from(new Uint32Array(idx).buffer)]
for (const n of blend) {
  const ent = [...targets[n]]
  const ii = new Uint16Array(ent.map(e => e[0])), dd = new Int16Array(ent.length * 3)
  ent.forEach(([, d], k) => { for (let c = 0; c < 3; c++) dd[k * 3 + c] = Math.max(-32767, Math.min(32767, Math.round(d[c] * 10000))) })
  parts.push(Buffer.from(ii.buffer), Buffer.from(dd.buffer))
}
parts.push(Buffer.from(sb.buffer), Buffer.from(sw.buffer))
const hj = Buffer.from(JSON.stringify(header))
const pad = (4 - ((4 + hj.length) % 4)) % 4
const out = Buffer.concat([Buffer.from(new Uint32Array([hj.length + pad]).buffer), hj, Buffer.alloc(pad, 32), ...parts])
writeFileSync('frontend/public/fitsmarter/human.bin', out)
console.log(JSON.stringify({ bones: bones.length, nv: header.nv, tris: idx.length / 3, height: header.height.toFixed(3), bytes: out.length }))
