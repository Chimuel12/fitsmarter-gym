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
import { tierIndex } from './tiers.js'
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
  emerald: () => new THREE.MeshPhysicalMaterial({ color: 0x12c46a, roughness: 0.04, metalness: 0, transmission: 0.45, thickness: 0.4, ior: 1.58, clearcoat: 1, clearcoatRoughness: 0.02, attenuationColor: 0x064d2a, attenuationDistance: 0.25 }),
  diamond: () => new THREE.MeshPhysicalMaterial({ color: 0xf4fdff, roughness: 0, metalness: 0, transmission: 1, thickness: 0.5, ior: 2.42, dispersion: 4, clearcoat: 1, clearcoatRoughness: 0, iridescence: 0.55, iridescenceIOR: 1.8, specularIntensity: 1 }),
  champion: () => new THREE.MeshPhysicalMaterial({ color: 0x9c6bff, roughness: 0.12, metalness: 0.7, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6 }),
  symmetric: () => new THREE.MeshPhysicalMaterial({ color: 0x8fb4ff, roughness: 0.08, metalness: 0.85, clearcoat: 1, iridescence: 1, iridescenceIOR: 2.2 }),
}
const look = id => (LOOK[id] || LOOK.none)()

/* ---------- the figure: rounded shapes in metres, facing +z ---------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z)
function limb(a, b, r) {
  const len = a.distanceTo(b)
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r * 0.2), 8, 20)
  const m = new THREE.Mesh(g)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize())
  return m
}
function blob(p, r, s = [1, 1, 1], tilt = 0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28))
  m.position.copy(p); m.scale.set(...s); m.rotation.z = tilt
  return m
}
function roundBox(w, h, d, r) {
  const shape = new THREE.Shape(), x = -w / 2, y = -h / 2
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r)
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r)
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y)
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: d * 0.6, bevelSize: r * 0.7, bevelSegments: 6, curveSegments: 10 })
  g.translate(0, 0, -d / 2)
  return g
}

function skinParts() {
  const parts = [
    blob(V(0, 1.645, 0), 0.105, [0.92, 1.12, 1]),                 // head
    limb(V(0, 1.5, -0.005), V(0, 1.57, 0), 0.052),                 // neck
    blob(V(0, 1.3, 0), 0.142, [1.12, 1.25, 0.72]),                 // ribcage
    limb(V(0, 1.16, 0), V(0, 1.0, 0), 0.105),                       // waist
    blob(V(0, 0.93, 0), 0.14, [1.05, 0.66, 0.72]),                  // pelvis
  ]
  for (const s of [-1, 1]) {
    parts.push(
      limb(V(s * 0.235, 1.42, 0), V(s * 0.27, 1.13, 0), 0.032),    // upper arm
      limb(V(s * 0.27, 1.13, 0), V(s * 0.295, 0.87, 0.01), 0.027),  // forearm
      blob(V(s * 0.3, 0.805, 0.012), 0.042, [0.8, 1.25, 0.55]),     // hand
      limb(V(s * 0.09, 0.9, 0), V(s * 0.1, 0.5, 0.005), 0.052),     // thigh
      limb(V(s * 0.1, 0.5, 0.005), V(s * 0.1, 0.09, -0.01), 0.038), // shin
      blob(V(s * 0.102, 0.04, 0.045), 0.05, [0.85, 0.5, 1.9]),      // foot
      blob(V(s * 0.1, 0.5, 0.02), 0.04, [1, 0.8, 0.7]),             // knee
    )
  }
  return parts
}

// slug → [mesh, …] (both sides). Each mesh keeps its rest scale in userData.base.
function muscleParts() {
  const M = {}, add = (slug, m) => { m.userData.slug = slug; m.userData.base = m.scale.clone(); (M[slug] = M[slug] || []).push(m) }
  for (const s of [-1, 1]) {
    add('chest', blob(V(s * 0.082, 1.345, 0.105), 0.085, [1.12, 0.72, 0.43], s * 0.12))
    add('front-delts', blob(V(s * 0.215, 1.425, 0.04), 0.050, [0.90, 1.10, 0.74]))
    add('side-delts', blob(V(s * 0.248, 1.43, 0), 0.048, [0.75, 1.15, 0.84]))
    add('rear-delts', blob(V(s * 0.212, 1.425, -0.045), 0.048, [0.90, 1.10, 0.70]))
    add('trapezius', blob(V(s * 0.075, 1.475, -0.04), 0.073, [1.25, 0.50, 0.56], -s * 0.35))
    add('lats', blob(V(s * 0.13, 1.24, -0.07), 0.096, [0.62, 1.35, 0.40], s * 0.18))
    add('upper-back', blob(V(s * 0.07, 1.36, -0.1), 0.069, [1.05, 0.85, 0.40]))
    add('serratus', blob(V(s * 0.145, 1.24, 0.07), 0.038, [0.55, 1.05, 0.42]))
    add('biceps', blob(V(s * 0.25, 1.275, 0.032), 0.038, [0.95, 2.00, 0.89], s * -0.12))
    add('triceps', blob(V(s * 0.255, 1.28, -0.034), 0.040, [0.95, 2.10, 0.89], s * -0.12))
    add('forearm', blob(V(s * 0.282, 1.02, 0.012), 0.036, [1.00, 2.30, 0.89], s * -0.09))
    add('obliques', blob(V(s * 0.118, 1.09, 0.055), 0.048, [0.60, 1.40, 0.52]))
    add('lower-back', blob(V(s * 0.045, 1.07, -0.098), 0.044, [0.75, 1.50, 0.42]))
    add('gluteal', blob(V(s * 0.075, 0.9, -0.098), 0.082, [1.00, 0.90, 0.73]))
    add('hip-flexors', blob(V(s * 0.075, 0.9, 0.08), 0.044, [0.80, 1.10, 0.47], s * 0.5))
    add('quadriceps', blob(V(s * 0.098, 0.71, 0.04), 0.072, [1.00, 2.60, 0.83]))
    add('hamstring', blob(V(s * 0.098, 0.72, -0.042), 0.062, [1.00, 2.50, 0.77]))
    add('adductors', blob(V(s * 0.05, 0.75, 0.005), 0.046, [0.70, 2.10, 0.74]))
    add('calves', blob(V(s * 0.1, 0.3, -0.035), 0.048, [1.00, 2.10, 0.89]))
    add('tibialis', blob(V(s * 0.1, 0.29, 0.03), 0.029, [0.85, 2.60, 0.66]))
  }
  // Six abs, rounded blocks over the waist: how far they stand out is the definition.
  const absG = roundBox(0.052, 0.058, 0.012, 0.016)
  for (const y of [1.205, 1.128, 1.051]) for (const s of [-1, 1]) {
    const m = new THREE.Mesh(absG); m.position.set(s * 0.034, y, 0.1); add('abs', m)
  }
  return M
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
    camera.position.set(0, 0.95, 4.6)
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1f2e, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 2.5, 2.2); scene.add(key)
    const rim = new THREE.DirectionalLight(0x7fb2ff, 1.6); rim.position.set(-2, 1.5, -2); scene.add(rim)
    const glint = [new THREE.PointLight(0xffffff, 0, 4), new THREE.PointLight(0xffffff, 0, 4)]; glint.forEach(l => scene.add(l))
    const fig = new THREE.Group(); scene.add(fig)
    const skinMeshes = skinParts(); skinMeshes.forEach(m => fig.add(m))
    const muscles = muscleParts(); Object.values(muscles).flat().forEach(m => fig.add(m))
    const twinkle = sparkles(70, [1.1, 1.9, 0.6], 0xffffff); twinkle.visible = false; scene.add(twinkle)
    const burst = sparkles(160, [0.1, 0.1, 0.1], 0xffffff); burst.visible = false; scene.add(burst)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.86, 0); controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08
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
      const hit = ray.intersectObjects(Object.values(muscles).flat(), false)[0]
      if (hit) api.current?.onMuscle?.(hit.object.userData.slug)
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
      const s = api.current?.state || {}
      // gem levels sparkle: lights circling the figure and twinkling stars
      if (s.level >= 6) {
        glint[0].position.set(Math.cos(t * 1.3) * 1.2, 1.4 + Math.sin(t * 2) * 0.3, Math.sin(t * 1.3) * 1.2)
        glint[1].position.set(Math.cos(-t * 0.9 + 2) * 1.1, 0.8, Math.sin(-t * 0.9 + 2) * 1.1)
        twinkle.material.opacity = 0.55 + Math.sin(t * 6) * 0.35
        twinkle.rotation.y = t * 0.15
      }
      if (s.level >= 8) { const hue = (t * 0.08) % 1; skinMeshes.forEach(m => m.material.color?.setHSL(hue, 0.7, 0.72)) }
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
        const sm = look(state.skin); skinMeshes.forEach(m => { m.material?.dispose?.(); m.material = sm })
        const cache = {}
        ;(this.mats || []).forEach(m => m.dispose?.())
        for (const [slug, list] of Object.entries(muscles)) {
          const r = state.map[slug], id = r ? r.tier.id : 'untrained'
          const mat = cache[id] || (cache[id] = look(id))
          const k = muscleScale(r, slug, state.level)
          for (const m of list) {
            m.material = mat
            if (slug === 'abs') {
              // definition: barely there untrained, carved out at Diamond and above
              const lv = r ? tierIndex(r.tier.id) : -1, def = Math.max(0, (lv + 1) / 9)
              m.scale.set(k, k, 0.35 + def * 1.9); m.position.z = 0.096 + def * 0.012
            } else m.scale.copy(m.userData.base).multiplyScalar(0.8 + (k - 0.78) * 0.75)
          }
        }
        this.mats = Object.values(cache)
        twinkle.visible = state.level >= 6
        glint.forEach(l => { l.intensity = state.level >= 6 ? 6 : 0 })
      },
      celebrate() { return new Promise(done => { controls.autoRotate = true; burst.visible = true; party = { t0: performance.now(), done } }) },
      // the picture to share: always from the front, whatever angle you left it at
      snapshot() {
        const pos = camera.position.clone(), tgt = controls.target.clone()
        camera.position.set(0, 0.95, 4.4); camera.lookAt(0, 0.86, 0)
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
