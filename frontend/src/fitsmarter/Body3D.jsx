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
import { loadHuman, stage, shape, regionMap, regionWeights, geometryOf } from './human.js'
import { withPattern, clock as patternClock, definition, scan, scanColor } from './patterns.js'
import { tierIndex, TIERS } from './tiers.js'
import { muscleScale } from './skins.js'

/* ---------- one material: every point carries its level (patterns.js draws the look) ---------- */
const bodyMaterial = () => withPattern(new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, clearcoat: 0.25, clearcoatRoughness: 0.2, envMapIntensity: 1.1 }))
// Each level's base colour, metalness and roughness (the patterns add the rest).
const FINISH = {
  none: [0x5b6474, 0.2, 0.6], iron: [0x6e757f, 0.75, 0.5], bronze: [0xc27a43, 1, 0.28], silver: [0xf2f5f9, 1, 0.12], gold: [0xffbf2a, 1, 0.12],
  ruby: [0xa80d24, 0.3, 0.14], emerald: [0x0b2a18, 0.1, 0.45], diamond: [0xc9d2de, 1, 0.16], champion: [0x3a1f70, 0.05, 0.5],
  symmetric: [0x7f9fff, 0.9, 0.1], olympian: [0xf4efe6, 0, 0.4],
}
// Rim lights in the level's colours, like the references (Diamond red and blue, Emerald green…).
const RIM = {
  diamond: [0xff2a4a, 0x2f7dff], emerald: [0x2dff6a, 0x0f8f4a], champion: [0xb07aff, 0x3fcfaa], gold: [0xffd27a, 0xff9a3c],
  olympian: [0xfff1d6, 0xbfd4ff], ruby: [0xff3355, 0xff8866], symmetric: [0x7fb2ff, 0xd07fff],
}
const fin = id => { const v = FINISH[id] || FINISH.none; return { c: new THREE.Color(v[0]), m: v[1], r: v[2], t: id === 'none' ? -1 : tierIndex(id) } }

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
    const rim2 = new THREE.DirectionalLight(0x7fb2ff, 0); rim2.position.set(2.2, 1.2, -1.6); scene.add(rim2)
    const glint = [new THREE.PointLight(0xffffff, 0, 4), new THREE.PointLight(0xffffff, 0, 4)]; glint.forEach(l => scene.add(l))
    const fig = new THREE.Group(); scene.add(fig)
    const body = new THREE.Mesh(new THREE.BufferGeometry(), bodyMaterial()); fig.add(body)
    let human = null, regionOf = () => null, regions = [], pending = null
    loadHuman().then(h => {
      human = h; regionOf = regionMap(h); regions = regionWeights(h)
      body.geometry.dispose(); body.geometry = geometryOf(h)
      if (pending) api.current?.apply(pending)
    }).catch(() => setNogl(true))
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
      const local = hit && body.worldToLocal(hit.point.clone())
      const slug = hit && hit.face && regionOf(hit.face.a)
      if (slug) api.current?.onMuscle?.(slug)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
    const ro = new ResizeObserver(size); ro.observe(el); size()
    let party = null, raf = 0
    // the change of level: the body morphs from the old shape to the new one while a band of the new
    // level's light sweeps over it (up when you climb, down when you drop) with a burst of sparks
    let trans = null
    const GLOW = [0x7fa6e6, 0xff9959, 0xd9e6ff, 0xffc74d, 0xff334d, 0x4dff73, 0xbfebff, 0xb873ff, 0x8cbfff, 0xffdb8c]
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
      if (s.skin === 'symmetric') body.material.color?.setHSL((t * 0.08) % 1, 0.5, 0.85)
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
      if (trans) {
        const k = Math.min(1, (performance.now() - trans.t0) / 2200), e = k * k * (3 - 2 * k)
        const g = body.geometry, pa = g.getAttribute('position'), arr = pa.array
        for (let i = 0; i < arr.length; i++) arr[i] = trans.from[i] + (trans.to[i] - trans.from[i]) * e
        pa.needsUpdate = true; g.computeVertexNormals()
        scan.value = trans.up ? -0.1 + e * 2.0 : 1.9 - e * 2.0
        fig.scale.setScalar(1 + Math.sin(Math.PI * k) * (trans.up ? 0.045 : -0.03))
        if (!party) {
          const p = burst.geometry.attributes.position
          for (let i = 0; i < p.count; i++) { const a = i * 2.399, r = 0.25 + k * 0.9 * (0.5 + (i % 7) / 10); p.setXYZ(i, Math.cos(a + k * 3) * r, scan.value + Math.sin(i * 1.7) * 0.05, Math.sin(a + k * 3) * r) }
          p.needsUpdate = true; burst.material.opacity = Math.sin(Math.PI * k)
        }
        if (k >= 1) { scan.value = -10; fig.scale.setScalar(1); if (!party) { burst.visible = false; burst.material.color.set(0xffffff) } g.computeBoundingSphere(); trans = null }
      }
      controls.update()
      renderer.render(scene, camera)
    }
    frame()
    // development only: point the camera anywhere (close-ups of the hands while posing them)
    if (import.meta.env.DEV) window.__fsCam = { set(x, y, z, tx, ty, tz) { controls.autoRotate = false; camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.minDistance = 0.1; controls.update() } }
    api.current = {
      state: {},
      apply(state) {
        this.state = state
        const rc = RIM[state.skin]
        rim.color.set(rc ? rc[0] : 0x7fb2ff); rim.intensity = rc ? 3.2 : 1.6
        rim2.color.set(rc ? rc[1] : 0x7fb2ff); rim2.intensity = rc ? 3.2 : 0
        if (!human) { pending = state; return }
        // the whole body from the overall level; each region from its muscle's own level
        const lv = Math.max(-1, state.level), all = (lv + 1) / 10
        const local = {}
        // the physique from the average level of the main muscles (fitness-progression looks);
        // each muscle a little bigger or smaller than that by its own level
        const MAJOR = ['chest', 'lats', 'side-delts', 'biceps', 'triceps', 'forearm', 'quadriceps', 'hamstring', 'gluteal', 'calves', 'abs']
        const ti = m => (state.map?.[m] ? tierIndex(state.map[m].tier.id) : -1)
        const avgT = MAJOR.reduce((a, m) => a + Math.max(0, ti(m)), 0) / MAJOR.length
        const body0 = stage(avgT)
        for (const slug of Object.keys(state.map || {})) local[slug] = stage(Math.max(0, ti(slug))).extra - body0.extra
        const absLv = state.map?.abs ? (ti('abs') + 1) / 10 : 0
        const pos = shape(human, { ...body0, local })
        // carved abs follow the abs' own level, never less than the body's overall
        definition.value = 0.25 + absLv * 0.95
        const g = body.geometry
        const prev = this.shown
        this.shown = { skin: state.skin, level: lv }
        if (prev && prev.skin !== state.skin && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          trans = { t0: performance.now(), from: Float32Array.from(g.getAttribute('position').array), to: pos, up: lv >= prev.level }
          scanColor.value.set(GLOW[Math.max(0, lv)]); if (!trans.up) scanColor.value.multiplyScalar(0.6)
          if (!party) { burst.material.color.set(GLOW[Math.max(0, lv)]); burst.visible = true }
        } else if (trans) {
          trans.to = pos   // the same level drawn again mid-change: keep morphing, towards the latest shape
        } else {
          g.getAttribute('position').array.set(pos); g.getAttribute('position').needsUpdate = true
          g.computeVertexNormals(); g.computeBoundingSphere()
        }
        const marble = state.skin === 'olympian'
        const col = g.getAttribute('color'), c = col.array, mrA = g.getAttribute('aMR'), mr = mrA.array
        const tA = g.getAttribute('aTier'), ta = tA.array, sA = g.getAttribute('aSeam'), sa = sA.array
        const skin = fin(state.skin)
        // each region's look from its muscle's level (front or back of the limb); untrained: the overall look
        const looks = regions.map(r => {
          const f = m => (state.map?.[m] ? fin(state.map[m].tier.id) : null)
          return { front: f(r.tap(1)), back: f(r.tap(-1)) }
        })
        const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
        for (let v = 0; v < human.nv; v++) {
          // the two regions this point belongs to most
          let k1 = -1, w1 = 0, w2 = 0
          for (let k = 0; k < regions.length; k++) { const w = regions[k].w[v]; if (w > w1) { w2 = w1; w1 = w; k1 = k } else if (w > w2) w2 = w }
          const zr = k1 >= 0 ? human.base[v * 3 + 2] - regions[k1].zMid : 0
          const L = k1 >= 0 ? looks[k1] : null
          const own = L ? (zr >= 0 ? L.front || L.back : L.back || L.front) || skin : skin
          // inside the muscle its own look, outside the overall one; the change happens at the groove
          const a = ss(0.4, 0.6, w1)
          c[v * 3] = skin.c.r + (own.c.r - skin.c.r) * a; c[v * 3 + 1] = skin.c.g + (own.c.g - skin.c.g) * a; c[v * 3 + 2] = skin.c.b + (own.c.b - skin.c.b) * a
          mr[v * 2] = skin.m + (own.m - skin.m) * a; mr[v * 2 + 1] = skin.r + (own.r - skin.r) * a
          ta[v] = a > 0.5 ? own.t : skin.t
          // grooves: muscle edge, between two muscles, and between the front and back of a limb
          const edge = 1 - Math.min(1, Math.abs(w1 - 0.5) / 0.09)
          const between = w2 > 0.35 ? 1 - Math.min(1, (w1 - w2) / 0.1) : 0
          const fb = L && L.front && L.back && L.front.t !== L.back.t && w1 > 0.5 ? 1 - Math.min(1, Math.abs(zr) / 0.014) : 0
          sa[v] = Math.max(edge * (w1 > 0.2 ? 1 : 0), between, fb)
        }
        mrA.needsUpdate = true; tA.needsUpdate = true; sA.needsUpdate = true
        col.needsUpdate = true
        twinkle.visible = ['diamond', 'symmetric'].includes(state.skin)
        // the circling white lights make Diamond sparkle; on other looks they would wash the colour out
        glint.forEach(l => { l.intensity = state.skin === 'diamond' ? 6 : 0 })
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
