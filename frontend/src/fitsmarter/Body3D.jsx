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
import { loadHuman, shape, regionMap, regionWeights, geometryOf } from './human.js'
import { withPattern, clock as patternClock, definition } from './patterns.js'
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

/* ---------- colour: a hint of each muscle's own level on the skin ---------- */
const hex = c => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]
// Each level's own finish for a muscle: colour, metalness, roughness.
const FINISH = {
  iron: [0x7b828c, 0.7, 0.55], bronze: [0xc27a43, 1, 0.3], silver: [0xf2f5f9, 1, 0.12], gold: [0xffc534, 1, 0.16],
  ruby: [0xd0102a, 0.25, 0.12], emerald: [0x17a35d, 0.25, 0.25], diamond: [0xe6f8ff, 0.35, 0.04], champion: [0x7b4fe0, 0.35, 0.28],
  symmetric: [0x8fb4ff, 0.85, 0.1], olympian: [0xf4efe6, 0, 0.42],
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
    const body = new THREE.Mesh(new THREE.BufferGeometry(), look('none')); body.material.vertexColors = true; fig.add(body)
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
        // the overall level's colour and finish everywhere; each muscle's own on top (vertex attributes)
        const skinCol = mat.color.clone(), skinMR = [mat.metalness ?? 0.5, mat.roughness ?? 0.5]
        mat.color.set(0xffffff); mat.vertexColors = true
        body.material = mat; old.dispose?.()
        if (!human) { pending = state; return }
        // the whole body from the overall level; each region from its muscle's own level
        const lv = Math.max(-1, state.level), all = (lv + 1) / 10
        const local = {}
        // each part grows with its own muscle's level only (past MakeHuman's maximum at the top);
        // the whole body moves only a little, with the average of all of them
        for (const [slug, r] of Object.entries(state.map || {})) local[slug] = (tierIndex(r.tier.id) + 1) / 10 * 1.5
        const MAJOR = ['chest', 'lats', 'side-delts', 'biceps', 'triceps', 'forearm', 'quadriceps', 'hamstring', 'gluteal', 'calves', 'abs']
        const avg = MAJOR.reduce((a, m) => a + (local[m] || 0) / 1.5, 0) / MAJOR.length
        const absLv = state.map?.abs ? (tierIndex(state.map.abs.tier.id) + 1) / 10 : 0
        const pos = shape(human, { muscle: 0.15 + avg * 0.7, lean: Math.min(1, 0.15 + absLv * 0.85), local })
        // carved abs follow the abs' own level, never less than the body's overall
        definition.value = absLv * 1.2
        const g = body.geometry
        g.getAttribute('position').array.set(pos); g.getAttribute('position').needsUpdate = true
        g.computeVertexNormals(); g.computeBoundingSphere()
        const marble = state.skin === 'olympian'
        const col = g.getAttribute('color'), c = col.array, mrA = g.getAttribute('aMR'), mr = mrA.array
        // the finish each region shows, from its muscle's level (front or back of the limb)
        const fin = regions.map(r => {
          const front = r.tap(1), back = r.tap(-1)
          const f = m => { const t = state.map?.[m]; if (!t) return null; const v = FINISH[t.tier.id]; return v && { c: new THREE.Color(v[0]), m: v[1], r: v[2] } }
          return { front: f(front), back: f(back) }
        })
        const tmp = new THREE.Color()
        for (let v = 0; v < human.nv; v++) {
          let wr = 0, rr = 0, gg = 0, bb = 0, mm = 0, ro = 0
          const zr = human.base[v * 3 + 2]
          for (let k = 0; k < regions.length; k++) {
            const w = regions[k].w[v]; if (!w) continue
            const f = zr - regions[k].zMid >= 0 ? fin[k].front || fin[k].back : fin[k].back || fin[k].front
            if (!f) continue
            wr += w; rr += f.c.r * w; gg += f.c.g * w; bb += f.c.b * w; mm += f.m * w; ro += f.r * w
          }
          const a = Math.min(1, wr)
          if (wr > 0) { rr /= wr; gg /= wr; bb /= wr; mm /= wr; ro /= wr }
          tmp.setRGB(skinCol.r + (rr - skinCol.r) * a, skinCol.g + (gg - skinCol.g) * a, skinCol.b + (bb - skinCol.b) * a)
          c[v * 3] = tmp.r; c[v * 3 + 1] = tmp.g; c[v * 3 + 2] = tmp.b
          mr[v * 2] = skinMR[0] + (mm - skinMR[0]) * a; mr[v * 2 + 1] = skinMR[1] + (ro - skinMR[1]) * a
        }
        mrA.needsUpdate = true
        col.needsUpdate = true
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
