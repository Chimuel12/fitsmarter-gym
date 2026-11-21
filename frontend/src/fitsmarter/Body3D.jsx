// FitSmarter: the body in 3D (three.js). An original stylised figure built from rounded shapes:
// a "skin" (head, torso, limbs) in the material of your overall level, and every muscle on top
// in the material of its own level. Iron is matte, bronze and gold are polished metal, silver is
// a mirror, ruby and emerald are gemstone, diamond is clear and sparkles, Champion and Symmetric
// shimmer. Muscles grow with their level and the abs carve out more the higher they are.
// Drag to turn, pinch to zoom, tap a muscle. celebrate() plays the 3-second level-up and
// snapshot() returns the picture for sharing.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js'
import { makeBody, BOUNDS, fillGrid } from './sculpt.js'
import { withPattern, clock as patternClock } from './patterns.js'
import { tierIndex, TIERS } from './tiers.js'
import { muscleScale } from './skins.js'

/* ---------- materials: one look per level ---------- */
const LOOK = {
  untrained: () => new THREE.MeshStandardMaterial({ color: 0x343b4b, roughness: 0.75, metalness: 0.15 }),
  none: () => new THREE.MeshStandardMaterial({ color: 0x5b6474, roughness: 0.7, metalness: 0.2 }),
  iron: () => new THREE.MeshStandardMaterial({ color: 0x7b828c, roughness: 0.62, metalness: 0.65 }),
  bronze: () => new THREE.MeshStandardMaterial({ color: 0xc27a43, roughness: 0.3, metalness: 1, envMapIntensity: 1.5 }),
  silver: () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 1, envMapIntensity: 3.4 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xffc534, roughness: 0.16, metalness: 1, envMapIntensity: 1.4 }),
  ruby: () => new THREE.MeshPhysicalMaterial({ color: 0xe0112b, roughness: 0.04, metalness: 0, transmission: 0.45, thickness: 0.4, ior: 1.77, clearcoat: 1, clearcoatRoughness: 0.02, attenuationColor: 0x8a0015, attenuationDistance: 0.25 }),
  emerald: () => new THREE.MeshPhysicalMaterial({ color: 0x0e3d24, roughness: 0.5, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.35 }),
  diamond: () => new THREE.MeshPhysicalMaterial({ color: 0xf4fdff, roughness: 0, metalness: 0, transmission: 1, thickness: 0.5, ior: 2.42, dispersion: 4, clearcoat: 1, clearcoatRoughness: 0, iridescence: 0.55, iridescenceIOR: 1.8, specularIntensity: 1 }),
  champion: () => new THREE.MeshPhysicalMaterial({ color: 0x3a1f70, roughness: 0.55, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.4 }),
  symmetric: () => new THREE.MeshPhysicalMaterial({ color: 0x8fb4ff, roughness: 0.08, metalness: 0.85, clearcoat: 1, iridescence: 1, iridescenceIOR: 2.2 }),
  // Olympian: white marble, like a Greek statue: soft, a little waxy, faint veins (vertex colours)
  olympian: () => new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.42, metalness: 0, sheen: 0.6, sheenRoughness: 0.5, sheenColor: 0xffffff, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.9 }),
}
const look = id => withPattern((LOOK[id] || LOOK.none)(), id)

/* ---------- the sculpture: the body's distance field turned into one smooth surface ---------- */
const RES = 128
const SIZE = BOUNDS.max.map((v, i) => v - BOUNDS.min[i]), MID = BOUNDS.max.map((v, i) => (v + BOUNDS.min[i]) / 2)
const hex = c => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]
const TINT = Object.fromEntries(TIERS.map(t => [t.id, hex(parseInt(t.c.slice(1), 16))]))
// marble veins: thin dark lines from a cheap wavy pattern (only on the marble level)
const vein = (x, y, z) => { const v = Math.sin(31 * x + 9 * Math.sin(14 * y + 6 * z) + 22 * z + 5 * Math.sin(40 * y)); return Math.abs(v) < 0.06 ? 0.8 : 1 }
// The grid is sculpted in a worker; without workers (old browsers, tests) right here.
let worker = null, seq = 0
const waiting = new Map()
function gridFor(states) {
  try {
    if (!worker) {
      worker = new Worker(new URL('./sculpt.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = e => { waiting.get(e.data.id)?.(e.data.field); waiting.delete(e.data.id) }
    }
    const id = ++seq
    return new Promise(ok => { waiting.set(id, ok); worker.postMessage({ id, states, res: RES }) })
  } catch { return Promise.resolve(fillGrid(states, RES)) }
}
/** Sculpt the body for these muscle states, then colour it: a hint of each muscle's level, marble veins. */
async function sculpt(mc, states, { marble = false, tint = true } = {}) {
  const tok = (mc.userData.tok || 0) + 1; mc.userData.tok = tok
  const grid = await gridFor(states)
  if (mc.userData.tok !== tok) return   // a newer sculpt is on its way
  mc.reset(); mc.field.set(grid); mc.update()
  const { nearest } = makeBody(states)
  const pos = mc.positionArray, n = mc.count
  let col = mc.geometry.getAttribute('color')
  if (!col || col.array.length < pos.length) { col = new THREE.BufferAttribute(new Float32Array(pos.length), 3); mc.geometry.setAttribute('color', col) }
  const c = col.array
  for (let i = 0; i < n; i++) {
    // positions are in the grid's own space (−1…1); back to metres for the lookups
    const x = MID[0] + pos[i * 3] * SIZE[0] / 2, y = MID[1] + pos[i * 3 + 1] * SIZE[1] / 2, z = MID[2] + pos[i * 3 + 2] * SIZE[2] / 2
    let r = 1, g = 1, b = 1
    if (tint) { const m = nearest(x, y, z), st = m && states[m]; if (st?.tier) { const t = TINT[st.tier]; r = 0.7 + 0.3 * t[0]; g = 0.7 + 0.3 * t[1]; b = 0.7 + 0.3 * t[2] } }
    if (marble) { const v = vein(x, y, z); r *= v; g *= v; b *= v }
    c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b
  }
  col.needsUpdate = true
  col.updateRanges = [{ start: 0, count: n * 3 }]
}
function makeSculpture(material) {
  const mc = new MarchingCubes(RES, material, false, false, 300000)
  mc.isolation = 0
  mc.scale.set(SIZE[0] / 2, SIZE[1] / 2, SIZE[2] / 2)
  mc.position.set(MID[0], MID[1], MID[2])
  return mc
}

/* ---------- sparkles for gemstone levels, a burst for the level-up ---------- */
function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15, 'rgba(255,255,255,.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2
  g.beginPath(); g.moveTo(32, 2); g.lineTo(32, 62); g.moveTo(2, 32); g.lineTo(62, 32); g.stroke()
  return new THREE.CanvasTexture(c)
}
function sparkles(n, spread, color) {
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * spread[0]; pos[i * 3 + 1] = Math.random() * spread[1]; pos[i * 3 + 2] = (Math.random() - 0.5) * spread[2] }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, map: starTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
}

const Body3D = forwardRef(function Body3D({ map, skin = 'none', level = -1, onMuscle, fallback = null }, ref) {
  const host = useRef(null), api = useRef(null)
  const [nogl, setNogl] = useState(false)
  useEffect(() => {
    const el = host.current
    let renderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }) } catch { setNogl(true); return }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20)
    camera.position.set(0, 0.95, 3.95)
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1f2e, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 2.5, 2.2); scene.add(key)
    const rim = new THREE.DirectionalLight(0x7fb2ff, 1.6); rim.position.set(-2, 1.5, -2); scene.add(rim)
    const glint = [new THREE.PointLight(0xffffff, 0, 4), new THREE.PointLight(0xffffff, 0, 4)]; glint.forEach(l => scene.add(l))
    const fig = new THREE.Group(); scene.add(fig)
    const body = makeSculpture(look('none')); body.material.vertexColors = true; fig.add(body)
    let nearestOf = () => null
    const twinkle = sparkles(70, [1.1, 1.9, 0.6], 0xffffff); twinkle.visible = false; scene.add(twinkle)
    const burst = sparkles(160, [0.1, 0.1, 0.1], 0xffffff); burst.visible = false; scene.add(burst)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.9, 0); controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08
    controls.minDistance = 2.4; controls.maxDistance = 5.6; controls.minPolarAngle = Math.PI * 0.32; controls.maxPolarAngle = Math.PI * 0.62
    controls.autoRotate = true; controls.autoRotateSpeed = 0.7; controls.rotateSpeed = 0.8
    let idle = 0
    controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idle) })
    controls.addEventListener('end', () => { idle = setTimeout(() => { controls.autoRotate = true }, 4000) })
    // a tap (not a drag) on a muscle opens it
    const ray = new THREE.Raycaster(), pt = new THREE.Vector2(); let downAt = null
    const onDown = e => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() } }
    const onUp = e => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8 || performance.now() - downAt.t > 450) return
      const r = renderer.domElement.getBoundingClientRect()
      pt.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(pt, camera)
      const hit = ray.intersectObject(body, false)[0]
      const slug = hit && nearestOf(hit.point.x, hit.point.y, hit.point.z)
      if (slug) api.current?.onMuscle?.(slug)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
    const ro = new ResizeObserver(size); ro.observe(el); size()
    let party = null, raf = 0
    const clock = new THREE.Clock()
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const t = clock.getElapsedTime()
      patternClock.value = t
      const s = api.current?.state || {}
      // gem levels sparkle: lights circling the figure and twinkling stars
      if (s.level >= 6) {
        glint[0].position.set(Math.cos(t * 1.3) * 1.2, 1.4 + Math.sin(t * 2) * 0.3, Math.sin(t * 1.3) * 1.2)
        glint[1].position.set(Math.cos(-t * 0.9 + 2) * 1.1, 0.8, Math.sin(-t * 0.9 + 2) * 1.1)
        twinkle.material.opacity = 0.55 + Math.sin(t * 6) * 0.35
        twinkle.rotation.y = t * 0.15
      }
      if (s.skin === 'symmetric') body.material.color?.setHSL((t * 0.08) % 1, 0.7, 0.72)
      if (party) {
        const k = (performance.now() - party.t0) / 3000
        if (k >= 1) { fig.scale.setScalar(1); burst.visible = false; controls.autoRotateSpeed = 0.7; key.intensity = 2.2; party.done?.(); party = null }
        else {
          controls.autoRotateSpeed = 0.7 + Math.sin(Math.PI * k) * 22
          fig.scale.setScalar(1 + Math.sin(Math.PI * k) * 0.07)
          key.intensity = 2.2 + Math.sin(Math.PI * Math.min(1, k * 2)) * 4
          const p = burst.geometry.attributes.position
          for (let i = 0; i < p.count; i++) { const a = i * 2.399, r = k * 1.6 * (0.6 + (i % 7) / 10); p.setXYZ(i, Math.cos(a) * r, 0.95 + Math.sin(i) * k * 0.9, Math.sin(a) * r) }
          p.needsUpdate = true; burst.material.opacity = 1 - k
        }
      }
      controls.update()
      renderer.render(scene, camera)
    }
    frame()
    api.current = {
      state: {},
      apply(state) {
        this.state = state
        const old = body.material, mat = look(state.skin)
        mat.vertexColors = true
        body.material = mat; old.dispose?.()
        // each muscle's size and definition from its own level
        const states = {}
        for (const [slug, r] of Object.entries(state.map || {})) {
          const lv = tierIndex(r.tier.id)
          states[slug] = { grow: 0.82 + (muscleScale(r, slug, state.level) - 0.78) * 0.8, def: Math.min(1, (lv + 1) / 9), tier: r.tier.id }
        }
        const marble = state.skin === 'olympian'
        sculpt(body, states, { marble: false, tint: ['none', 'iron', 'bronze', 'silver', 'gold'].includes(state.skin) })
        nearestOf = makeBody(states).nearest
        twinkle.visible = state.level >= 6 && !marble
        glint.forEach(l => { l.intensity = state.level >= 6 && !marble ? 6 : 0 })
      },
      celebrate() { return new Promise(done => { controls.autoRotate = true; burst.visible = true; party = { t0: performance.now(), done } }) },
      // the picture to share: always from the front, whatever angle you left it at
      snapshot() {
        const pos = camera.position.clone(), tgt = controls.target.clone()
        camera.position.set(0, 0.95, 3.95); camera.lookAt(0, 0.9, 0)
        renderer.render(scene, camera)
        const c = document.createElement('canvas'); c.width = renderer.domElement.width; c.height = renderer.domElement.height
        c.getContext('2d').drawImage(renderer.domElement, 0, 0)
        camera.position.copy(pos); controls.target.copy(tgt); camera.lookAt(tgt)
        return c
      },
      onMuscle: null,
    }
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); clearTimeout(idle)
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp)
      scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => m.dispose?.()) })
      pmrem.dispose(); renderer.dispose(); renderer.domElement.remove()
    }
  }, [])
  const tapRef = useRef(onMuscle); tapRef.current = onMuscle
  useEffect(() => { if (api.current) { api.current.onMuscle = slug => tapRef.current?.(slug); api.current.apply({ map, skin, level }) } }, [map, skin, level])
  useImperativeHandle(ref, () => ({ celebrate: () => api.current?.celebrate(), snapshot: () => api.current?.snapshot() }), [])
  if (nogl) return fallback
  return <div className="fs-3d" ref={host} role="img" aria-label="3D body" />
})
export default Body3D
