// Dev-only preview: /landmark-preview.html?id=tv-tower&yaw=30&pitch=15&dist=200&t=17&target=40&w=1280&h=800
// Renders one landmark module (or all of them in a row with id=all) with simple lighting.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { loadLandmarks } from '../engine/landmarks'

const q = new URLSearchParams(location.search)
const id = q.get('id') ?? 'all'
const yaw = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 35))
const pitch = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? 15))
const hour = Number(q.get('t') ?? 15)

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

const night = hour < 6 || hour > 19.5
const scene = new THREE.Scene()
scene.background = new THREE.Color(night ? 0x0b1424 : 0xa9c3d8)
scene.add(new THREE.HemisphereLight(night ? 0x334466 : 0xcfe3f5, night ? 0x111111 : 0x8a7f6a, night ? 0.4 : 1.4))
const sun = new THREE.DirectionalLight(night ? 0x8899cc : 0xfff1dc, night ? 0.3 : 2.6)
const sunAng = ((hour - 6) / 12) * Math.PI
sun.position.set(Math.cos(sunAng) * 300, Math.max(0.15, Math.sin(sunAng)) * 300, -150)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -250, right: 250, top: 250, bottom: -250, far: 1200 })
scene.add(sun)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x8d8a80, roughness: 1 }))
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const mods = await loadLandmarks(id === 'all' ? null : [id])
let x = 0
const t0 = performance.now()
let tris = 0
for (const m of mods) {
  const g = m.build()
  const box = new THREE.Box3().setFromObject(g)
  const size = box.getSize(new THREE.Vector3())
  if (id === 'all') { g.position.x = x + size.x / 2; x += size.x + 40 }
  g.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; const geo = mesh.geometry; tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * ((o as THREE.InstancedMesh).count ?? 1) } })
  scene.add(g)
}
const buildMs = performance.now() - t0
const bounds = new THREE.Box3()
scene.children.forEach((c) => { if (c !== ground && (c as THREE.Group).isGroup) bounds.expandByObject(c) })
const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3())
const radius = bounds.isEmpty() ? 50 : bounds.getSize(new THREE.Vector3()).length() / 2
if (q.get('target')) center.y = Number(q.get('target'))
const dist = Number(q.get('dist') ?? radius * 2.2)
const camera = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 45), innerWidth / innerHeight, 0.5, 8000)
camera.position.set(center.x + Math.sin(yaw) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z - Math.cos(yaw) * Math.cos(pitch) * dist)
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.copy(center)
controls.update()
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() })
let frames = 0
renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
  if (++frames === 2) {
    document.getElementById('info')!.textContent = `${mods.map((m) => m.id).join(', ') || 'no module: ' + id} · ${Math.round(tris)} tris · ${renderer.info.render.calls} draws · build ${buildMs.toFixed(0)} ms`
    ;(window as unknown as { __ready: boolean }).__ready = true
  }
})
