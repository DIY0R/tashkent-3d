import * as THREE from 'three'
import { perf } from './Profiler'

/**
 * Two things that keep work off the frame without changing the picture. Runs once per frame,
 * right before rendering. `?gate=0` turns it off for comparison.
 *
 * 1. Shader warm-up. three.js compiles a material's program the first time an object is drawn,
 *    which blocks the frame (tens to hundreds of ms per program on Windows/ANGLE). Here every
 *    object that enters the scene is compiled ahead with `renderer.compile` (non-blocking with
 *    KHR_parallel_shader_compile) and kept out of the draw lists until its programs report ready.
 *    The object appears a few frames later instead of freezing the frame. Without the extension
 *    programs always report ready and nothing changes.
 *
 * 2. Tight culling for city tiles. A tile is 500 m wide and three.js culls by bounding sphere
 *    (radius ~450 m), so tiles beside and behind the camera were drawn in full, and the shadow
 *    pass drew every tile whose sphere touched the long shadow frustum. Tiles carry their real
 *    box (`group.userData.tkTile`); it is tested against the view frustum, and against the shadow
 *    box in light space. Tiles that fail both are skipped; tiles that only fail the second stop
 *    casting shadows. Street-detail chunks get the same shadow test.
 *
 * Textures of new objects are uploaded a few per frame (`initTexture`) before the objects show,
 * and the depth programs of the shadow pass are warmed up the same way (see warmDepth).
 *
 * Objects are hidden through `layers` (mask 0), not `visible`: the systems that own them keep
 * using `visible` for their own level-of-detail logic.
 */

const COMPILING = 1
const CULLED = 2
/** an object is shown anyway after this long, whatever the compile status says */
const COMPILE_TIMEOUT_MS = 4000

/** texture uploads per frame stop after this many ms (at least one is always done) */
const TEXTURE_BUDGET_MS = 3

interface ProgramLike { isReady(): boolean }
interface Waiting { object: THREE.Object3D; programs: ProgramLike[]; textures: THREE.Texture[]; since: number }
type Props = { get(o: object): { currentProgram?: ProgramLike; __webglInit?: boolean } }

/** Same mapping as WebGLShadowMap: shadows are drawn with the back faces of single-sided materials. */
const SHADOW_SIDE: Record<number, THREE.Side> = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide }
export interface TileBox { x0: number; z0: number; size: number; h: number }

type Drawable = THREE.Mesh | THREE.Points | THREE.Line

function isDrawable(o: THREE.Object3D): o is Drawable {
  return (o as THREE.Mesh).isMesh === true || (o as THREE.Points).isPoints === true || (o as THREE.Line).isLine === true
}

export class RenderGate {
  enabled = true
  /**
   * Staged texture uploads and shadow-pass program warm-up. Written after the last benchmark run
   * and not measured yet, so off by default: `?warm=full` turns them on.
   */
  full = false
  /** debug counters, also published to the profiler */
  stats = { waiting: 0, compiled: 0, tiles: 0, tilesDrawn: 0, tilesShadow: 0, detailShadow: 0 }

  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly camera: THREE.PerspectiveCamera
  private seen = new WeakSet<THREE.Object3D>()
  private readonly flags = new WeakMap<THREE.Object3D, number>()
  /** castShadow as the owner set it */
  private readonly castWanted = new WeakMap<THREE.Object3D, boolean>()
  private waiting: Waiting[] = []
  // textures: uploaded a few per frame before the objects that use them are shown
  private readonly texQueue: THREE.Texture[] = []
  private readonly texPending = new WeakSet<THREE.Texture>()
  private texSeen = new WeakSet<THREE.Texture>()
  // shadow pass programs (depth materials), see warmDepth()
  private readonly depthVariants = new Map<string, THREE.MeshDepthMaterial>()
  private depthPrograms = new Map<string, ProgramLike | null>()
  private depthTarget: THREE.WebGLRenderTarget | null = null
  private readonly sceneLights: THREE.Object3D[] = []
  private readonly depthBatch: THREE.Object3D[] = []
  /** stand-ins for a scene: three.js only calls traverse / traverseVisible on them */
  private readonly lightRig = {
    isScene: false,
    traverseVisible: (cb: (o: THREE.Object3D) => void) => { for (const l of this.sceneLights) cb(l) },
  }
  private readonly depthRig = {
    traverseVisible: (_cb: (o: THREE.Object3D) => void) => {},
    traverse: (cb: (o: THREE.Object3D) => void) => { for (const o of this.depthBatch) cb(o) },
  }
  private readonly frustum = new THREE.Frustum()
  private readonly m4 = new THREE.Matrix4()
  private readonly box = new THREE.Box3()
  private readonly right = new THREE.Vector3()
  private readonly up = new THREE.Vector3()
  private readonly v = new THREE.Vector3()
  private readonly yAxis = new THREE.Vector3(0, 1, 0)
  private detailGroup: THREE.Object3D | null = null
  private frame = 0

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('gate') === '0') this.enabled = false
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('warm') === 'full') this.full = true
  }

  /** True when no object is waiting for its shader programs. */
  get idle(): boolean {
    return this.waiting.length === 0 && this.texQueue.length === 0
  }

  /** Programs depend on the render target, tone mapping and shadow settings: forget what was compiled. */
  invalidate() {
    this.seen = new WeakSet()
    this.depthPrograms = new Map()
  }

  private setFlag(o: THREE.Object3D, bit: number, on: boolean) {
    const cur = this.flags.get(o) ?? 0
    const next = on ? cur | bit : cur & ~bit
    if (next === cur) return
    this.flags.set(o, next)
    o.layers.mask = next === 0 ? 1 : 0
  }

  // ------------------------------------------------------------------ shader warm-up

  private compileNew(root: THREE.Object3D, target: THREE.WebGLRenderTarget | null, now: number) {
    const renderer = this.renderer
    // the program variant depends on the target (output colour space, tone mapping)
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(target)
    let materials: Set<THREE.Material> | null = null
    try {
      materials = renderer.compile(root, this.camera, this.scene) as unknown as Set<THREE.Material>
    } catch (err) {
      console.warn('[gate] compile failed', err)
    }
    renderer.setRenderTarget(prev)
    const props = renderer.properties as unknown as Props
    const notReady = new Map<THREE.Material, ProgramLike>()
    if (materials) {
      for (const m of materials) {
        const p = props.get(m).currentProgram
        if (p && !p.isReady()) notReady.set(m, p)
      }
    }
    const shadows = this.full && renderer.shadowMap.enabled
    if (shadows) {
      this.sceneLights.length = 0
      this.scene.traverseVisible((o) => { if ((o as THREE.Light).isLight) this.sceneLights.push(o) })
    }
    // keep the objects that use a program still being compiled, or a texture not yet uploaded,
    // out of the draw lists
    root.traverse((o) => {
      if (!isDrawable(o)) return
      const mat = o.material
      const programs: ProgramLike[] = []
      const textures: THREE.Texture[] = []
      if (Array.isArray(mat)) {
        for (const m of mat) { const p = notReady.get(m); if (p) programs.push(p); this.collectTextures(m, textures, props) }
      } else if (mat) {
        const p = notReady.get(mat)
        if (p) programs.push(p)
        this.collectTextures(mat, textures, props)
        if (shadows && (o.castShadow || o.userData.tkCast === true) && (o as THREE.Mesh).isMesh) {
          const dp = this.warmDepth(o as THREE.Mesh, mat, props)
          if (dp && !dp.isReady()) programs.push(dp)
        }
      }
      if (programs.length === 0 && textures.length === 0) return
      this.setFlag(o, COMPILING, true)
      this.waiting.push({ object: o, programs, textures, since: now })
    })
  }

  // ------------------------------------------------------------------ textures

  /** Queues the material's textures that are not on the GPU yet; they are listed in `out`. */
  private collectTextures(mat: THREE.Material, out: THREE.Texture[], props: Props) {
    if (!this.full) return
    const check = (v: unknown) => {
      const t = v as THREE.Texture | null | undefined
      if (!t || t.isTexture !== true || (t as { isRenderTargetTexture?: boolean }).isRenderTargetTexture) return
      if (this.texPending.has(t)) { out.push(t); return }
      if (this.texSeen.has(t)) return
      this.texSeen.add(t)
      // no data yet (still loading) or already uploaded: nothing to stage
      if (t.version === 0 || !t.image || props.get(t).__webglInit === true) return
      this.texPending.add(t)
      this.texQueue.push(t)
      out.push(t)
    }
    const m = mat as unknown as Record<string, unknown>
    for (const k in m) {
      const v = m[k]
      if (v !== null && typeof v === 'object') check(v)
    }
    const uniforms = (mat as THREE.ShaderMaterial).uniforms as Record<string, { value: unknown }> | undefined
    if (uniforms) for (const k in uniforms) check(uniforms[k]?.value)
  }

  /** Uploads queued textures: one at least, then more while the time budget lasts. */
  private uploadTextures() {
    if (this.texQueue.length === 0) return
    const t0 = performance.now()
    do {
      const t = this.texQueue.shift()!
      try { this.renderer.initTexture(t) } catch { /* shown anyway */ }
      this.texPending.delete(t)
    } while (this.texQueue.length > 0 && performance.now() - t0 < TEXTURE_BUDGET_MS)
  }

  // ------------------------------------------------------------------ shadow pass programs

  /**
   * The shadow pass draws with depth materials that three.js picks internally, so `compile` on the
   * scene does not cover them and their programs were built (blocking) at the first shadow frame.
   * This compiles a program with the same cache key ahead of time: the object's own
   * `customDepthMaterial`, or a `MeshDepthMaterial` set up the way WebGLShadowMap sets up its shared
   * one, on a stand-in that inherits everything else from the object, with a non-canvas target bound
   * and no fog (the shadow pass has neither). If three.js derives a different key after all, it
   * simply compiles its own program as before.
   */
  private warmDepth(o: THREE.Mesh, material: THREE.Material, props: Props): ProgramLike | null {
    const m = material as THREE.MeshBasicMaterial
    const side = material.shadowSide !== null ? material.shadowSide : SHADOW_SIDE[material.side]
    const alphaTest = material.alphaToCoverage === true ? 0.5 : material.alphaTest
    let depth = o.customDepthMaterial as THREE.MeshDepthMaterial | undefined
    if (!depth) {
      const key = `${side}|${m.map?.uuid ?? ''}|${m.alphaMap?.uuid ?? ''}|${alphaTest}`
      depth = this.depthVariants.get(key)
      if (!depth) {
        depth = new THREE.MeshDepthMaterial()
        this.depthVariants.set(key, depth)
      }
    }
    depth.side = side
    depth.alphaMap = m.alphaMap ?? null
    depth.alphaTest = alphaTest
    depth.map = m.map ?? null
    const g = o.geometry
    const inst = o as unknown as THREE.InstancedMesh
    const sig = `${depth.uuid}|${side}|${alphaTest}|${m.map ? 1 : 0}|${inst.isInstancedMesh ? (inst.instanceColor ? 2 : 1) : 0}|${(o as unknown as THREE.SkinnedMesh).isSkinnedMesh ? 1 : 0}|${g.morphAttributes.position ? 1 : 0}|${g.attributes.uv ? 1 : 0}|${g.attributes.color ? 1 : 0}`
    const known = this.depthPrograms.get(sig)
    if (known !== undefined) return known
    const renderer = this.renderer
    if (!this.depthTarget) this.depthTarget = new THREE.WebGLRenderTarget(1, 1)
    const proxy = Object.create(o) as THREE.Mesh
    proxy.material = depth
    this.depthBatch.length = 0
    this.depthBatch.push(proxy)
    const prev = renderer.getRenderTarget()
    let program: ProgramLike | null = null
    try {
      renderer.setRenderTarget(this.depthTarget)
      renderer.compile(this.depthRig as unknown as THREE.Object3D, this.camera, this.lightRig as unknown as THREE.Scene)
      program = props.get(depth).currentProgram ?? null
    } catch (err) {
      console.warn('[gate] depth warm-up failed', err)
    }
    renderer.setRenderTarget(prev)
    this.depthBatch.length = 0
    this.depthPrograms.set(sig, program)
    return program
  }

  private scan(o: THREE.Object3D, target: THREE.WebGLRenderTarget | null, now: number) {
    if (!this.seen.has(o)) {
      // a new subtree: compile all of it at once and mark it as seen
      o.traverse((c) => this.seen.add(c))
      this.compileNew(o, target, now)
      return
    }
    const ch = o.children
    for (let i = 0; i < ch.length; i++) this.scan(ch[i], target, now)
  }

  private pollWaiting(now: number) {
    if (this.waiting.length === 0) return
    let n = 0
    for (const w of this.waiting) {
      let ready = now - w.since > COMPILE_TIMEOUT_MS
      if (!ready) {
        ready = true
        for (const p of w.programs) if (!p.isReady()) { ready = false; break }
        if (ready) for (const t of w.textures) if (this.texPending.has(t)) { ready = false; break }
      }
      if (ready) { this.setFlag(w.object, COMPILING, false); this.stats.compiled++ }
      else this.waiting[n++] = w
    }
    this.waiting.length = n
  }

  // ------------------------------------------------------------------ culling

  private setCast(o: THREE.Object3D, allowed: boolean) {
    // what the owner wants: `userData.tkCast` when it keeps that up to date (StreetDetail changes
    // it with the quality preset), else castShadow as it was when the object was first seen
    let wanted = o.userData.tkCast as boolean | undefined
    if (wanted === undefined) {
      wanted = this.castWanted.get(o)
      if (wanted === undefined) { wanted = o.castShadow; this.castWanted.set(o, wanted) }
    }
    const want = wanted && allowed
    if (o.castShadow !== want) o.castShadow = want
  }

  /** True when the box, pushed along the light, can fall into the shadow camera's rectangle. */
  private reachesShadow(box: THREE.Box3, cx: number, cy: number, r: number): boolean {
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    const v = this.v
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
      const u = v.dot(this.right), w = v.dot(this.up)
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (w < minV) minV = w
      if (w > maxV) maxV = w
    }
    return maxU >= cx - r && minU <= cx + r && maxV >= cy - r && minV <= cy + r
  }

  private cull(tiles: THREE.Object3D, sun: THREE.DirectionalLight, lightDir: THREE.Vector3) {
    const cam = this.camera
    cam.updateMatrixWorld()
    this.m4.multiplyMatrices(cam.projectionMatrix, this.m4.copy(cam.matrixWorld).invert())
    this.frustum.setFromProjectionMatrix(this.m4)

    const shadows = this.renderer.shadowMap.enabled && sun.castShadow
    let r = 0, cu = 0, cv = 0
    if (shadows) {
      // same basis as Environment.update: right = y x L, up = L x right
      this.right.crossVectors(this.yAxis, lightDir).normalize()
      this.up.crossVectors(lightDir, this.right).normalize()
      // a little slack: the shadow map may be a frame older than this test (see Governor)
      r = sun.shadow.camera.right * 1.08 + 4
      cu = sun.target.position.dot(this.right)
      cv = sun.target.position.dot(this.up)
    }
    const box = this.box
    const st = this.stats
    st.tiles = st.tilesDrawn = st.tilesShadow = st.detailShadow = 0
    const groups = tiles.children
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      const t = g.userData.tkTile as TileBox | undefined
      if (!t) continue
      st.tiles++
      if (!g.visible) continue
      // buildings belong to the tile of their centroid and may stick out a little
      const pad = 70
      box.min.set(t.x0 - pad, -1, t.z0 - pad)
      box.max.set(t.x0 + t.size + pad, Math.max(t.h + 8, 26), t.z0 + t.size + pad)
      const inView = this.frustum.intersectsBox(box)
      const inShadow = shadows && this.reachesShadow(box, cu, cv, r)
      if (inView) st.tilesDrawn++
      if (inShadow) st.tilesShadow++
      const hide = !inView && !inShadow
      const ch = g.children
      for (let k = 0; k < ch.length; k++) {
        const c = ch[k]
        this.setFlag(c, CULLED, hide)
        this.setCast(c, inShadow)
      }
    }

    // street detail: 250 m chunks with exact boxes; only the shadow test (three.js culls the view)
    if (!this.detailGroup || this.detailGroup.parent === null) this.detailGroup = this.scene.getObjectByName('street-detail') ?? null
    const dg = this.detailGroup
    if (dg && dg.visible) {
      const ch = dg.children
      for (let k = 0; k < ch.length; k++) {
        const c = ch[k] as THREE.Mesh
        const bb = c.geometry?.boundingBox
        if (!bb || !c.visible) continue
        box.min.copy(bb.min).add(c.position)
        box.max.copy(bb.max).add(c.position)
        const inShadow = shadows && this.reachesShadow(box, cu, cv, r)
        if (inShadow) st.detailShadow++
        this.setCast(c, inShadow)
      }
    }
  }

  // ------------------------------------------------------------------ frame

  /**
   * @param sceneTarget render target the scene is drawn into (the composer's input buffer), null = canvas
   * @param tiles the TileManager group
   */
  update(sceneTarget: THREE.WebGLRenderTarget | null, tiles: THREE.Object3D, sun: THREE.DirectionalLight, lightDir: THREE.Vector3) {
    if (!this.enabled) return
    const now = performance.now()
    this.frame++
    this.uploadTextures()
    this.pollWaiting(now)
    this.scan(this.scene, sceneTarget, now)
    this.cull(tiles, sun, lightDir)
    if (perf.enabled && (this.frame & 15) === 0) {
      const s = this.stats
      s.waiting = this.waiting.length
      perf.extra['gate'] = `tiles ${s.tilesDrawn}/${s.tiles} drawn, ${s.tilesShadow} cast; detail ${s.detailShadow} cast; compiling ${s.waiting}`
    }
  }
}
