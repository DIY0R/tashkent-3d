import * as THREE from 'three'
import type { SharedUniforms } from '../env/Environment'
import { NOISE } from './materials'

/**
 * Stylized Tashkent street trees as one parametrized model.
 *
 * Every tree is an instance of the same unit model: crown radius 0.5, height 1, crown between
 * y = 0.36 and 1. The instance matrix scales it to (crown width, height, crown width) in meters,
 * so wide plane trees (chinar), columnar poplars and small mulberries/acacias share one draw call.
 * The vertex shader keeps the trunk radius in meters, slides the crown down for columnar trees
 * (height / width > 3), adds wind sway and does the per-tree LOD switch.
 *
 * Geometry levels: 0 detailed (only trees within `uLodR` of the camera), 1 medium (up to `uMidR`),
 * 2 low; medium and low crossfade by size over `uMidR.y` m.
 */

interface Buf {
  pos: number[]
  nor: number[]
  /** outward direction of the lobe surface (for the ragged leaf silhouette); zero for the trunk */
  rim: number[]
  col: number[]
  part: number[]
}

function lobe(out: Buf, detail: number, cx: number, cy: number, cz: number, rx: number, ry: number, seed: number, tint: number) {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const p = g.attributes.position as THREE.BufferAttribute
  const d = new THREE.Vector3(), v = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize()
    // lumpy surface; a function of the direction only, so shared corners stay closed
    const r = 1
      + 0.17 * Math.sin(4.1 * d.x + 1.7 * seed) * Math.cos(3.7 * d.z + seed)
      + 0.12 * Math.sin(5.3 * d.y + 2.3 * d.x + seed * 2.1)
      + 0.07 * Math.sin(9.1 * d.z + 7.3 * d.y + seed * 3.3)
    v.copy(d).multiplyScalar(r)
    if (v.y < 0) v.y *= 0.62 // flatter underside
    v.set(cx + v.x * rx, cy + v.y * ry, cz + v.z * rx)
    // soft normals: partly the lobe's own, partly those of the whole crown
    c.set(v.x, (v.y - 0.66) * 1.4, v.z).normalize()
    n.copy(d).lerp(c, 0.55)
    n.y += 0.45
    n.normalize()
    const t = THREE.MathUtils.smoothstep(v.y, 0.36, 0.92)
    const edge = Math.min(1, Math.hypot(v.x, v.z) / 0.45)
    const shade = (0.8 + 0.2 * t) * (0.93 + 0.07 * edge) * tint
    out.pos.push(v.x, v.y, v.z)
    out.nor.push(n.x, n.y, n.z)
    out.rim.push(d.x / rx, d.y / ry, d.z / rx)
    out.col.push(shade, shade, shade)
    out.part.push(0)
  }
  g.dispose()
}

const BARK: [number, number, number] = [0.6, 0.55, 0.47]

/** Tapered tube from a to b. x/z are meters (the shader keeps them unscaled), y is in units of tree height. */
function limb(out: Buf, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, sides: number) {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1)
    const quad: [number, number, number, number, number][] = [
      [ax + c0 * r0, ay, az + s0 * r0, c0, s0],
      [ax + c1 * r0, ay, az + s1 * r0, c1, s1],
      [bx + c1 * r1, by, bz + s1 * r1, c1, s1],
      [bx + c0 * r1, by, bz + s0 * r1, c0, s0],
    ]
    for (const k of [0, 2, 1, 0, 3, 2]) {
      const q = quad[k]
      out.pos.push(q[0], q[1], q[2])
      out.nor.push(q[3], 0.15, q[4])
      out.rim.push(0, 0, 0)
      const sh = 0.8 + 0.2 * Math.min(1, q[1] / 0.3)
      out.col.push(BARK[0] * sh, BARK[1] * sh, BARK[2] * sh)
      out.part.push(1)
    }
  }
}

function finish(b: Buf, level: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  // geometry level for the shader's per-tree switch (one program serves the medium and low meshes)
  g.setAttribute('aLod', new THREE.BufferAttribute(new Float32Array(b.part.length).fill(level), 1))
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nor), 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.col), 3))
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(b.part), 1))
  g.setAttribute('aRim', new THREE.BufferAttribute(new Float32Array(b.rim), 3))
  g.normalizeNormals()
  return g
}

function buildGeometry(level: number): THREE.BufferGeometry {
  const b: Buf = { pos: [], nor: [], rim: [], col: [], part: [] }
  if (level === 0) {
    lobe(b, 2, 0, 0.7, 0, 0.39, 0.3, 1.3, 1)
    lobe(b, 1, 0.25, 0.56, 0.06, 0.23, 0.19, 4.1, 0.95)
    lobe(b, 1, -0.2, 0.58, 0.17, 0.24, 0.2, 7.7, 1.04)
    lobe(b, 1, -0.1, 0.55, -0.25, 0.23, 0.18, 2.2, 0.97)
    lobe(b, 1, 0.14, 0.6, -0.2, 0.2, 0.19, 5.9, 1.05)
    lobe(b, 1, 0.04, 0.87, -0.03, 0.22, 0.14, 9.4, 1.06)
    limb(b, 0, 0, 0, 0, 0.62, 0, 0.26, 0.1, 7)
    limb(b, 0, 0.3, 0, 1.5, 0.52, 0.5, 0.1, 0.04, 4)
    limb(b, 0, 0.33, 0, -1.2, 0.54, 1.0, 0.09, 0.04, 4)
    limb(b, 0, 0.31, 0, -0.5, 0.52, -1.5, 0.09, 0.04, 4)
  } else if (level === 1) {
    lobe(b, 1, 0, 0.68, 0, 0.46, 0.33, 1.3, 1)
    limb(b, 0, 0, 0, 0, 0.6, 0, 0.26, 0.11, 4)
  } else {
    lobe(b, 0, 0, 0.68, 0, 0.47, 0.33, 1.3, 1)
    limb(b, 0, 0, 0, 0, 0.55, 0, 0.26, 0.14, 3)
  }
  return finish(b, level)
}

const VERT_PARS = /* glsl */ `
attribute float aPart;
attribute vec3 aRim;
attribute float aLod;
uniform float uTime;
uniform vec3 uCamPos;
uniform float uLodR;
uniform vec2 uMidR;
varying float vPart;
varying vec3 vTreeW;
varying vec3 vRimN;`

const VERT_BODY = /* glsl */ `
vPart = aPart;
vTreeW = transformed;
vRimN = vec3(0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
{
  vec3 ip = instanceMatrix[3].xyz;
  float W = length(instanceMatrix[0].xyz);
  float H = instanceMatrix[1].y;
  float rnd = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float columnar = smoothstep(2.6, 3.4, H / W);
  if (aPart > 0.5) {
    // trunk and branches: radius in meters, whatever the crown width;
    // columnar trees have no spreading branches (they are pulled into the trunk)
    float r = max(length(transformed.xz), 0.3);
    transformed.xz *= (0.5 + 0.035 * H) / W * mix(1.0, 0.3 / r, columnar);
  } else {
    #ifndef TREE_NEAR
    // medium -> low crossfade: in the band both are drawn, the medium crown shrinks into the low one
    // while the low one grows to full size, so the outline changes smoothly (no pop)
    float fm = smoothstep(uMidR.x, uMidR.x + uMidR.y, length(vec2(distance(ip.xz, uCamPos.xz), uCamPos.y * 0.6)));
    float cs = aLod < 1.5 ? mix(1.0, 0.78, fm) : mix(0.94, 1.0, fm);
    transformed = vec3(0.0, 0.68, 0.0) + (transformed - vec3(0.0, 0.68, 0.0)) * cs;
    #endif
    // columnar trees (poplars): the crown starts close to the ground
    float drop = columnar * (0.8 + 0.12 * rnd);
    transformed.y = mix(transformed.y, 0.1 + (transformed.y - 0.36) * 1.4, drop);
  }
  // the leaf pattern is fixed to the tree at rest, so it does not swim when the tree sways
  vTreeW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  mat3 im = mat3(instanceMatrix);
  vRimN = normalMatrix * (im * (aRim / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]))));
  // wind: slow sway that grows with height, plus a little leaf flutter
  float ph = ip.x * 0.37 + ip.z * 0.21 + rnd * 6.0;
  float bend = max(transformed.y - 0.25, 0.0);
  bend *= bend;
  float sway = sin(uTime * 1.3 + ph) + 0.4 * sin(uTime * 2.9 + ph * 1.7);
  transformed.x += sway * bend * 0.34 / W;
  transformed.z += cos(uTime * 1.1 + ph * 1.3) * bend * 0.24 / W;
  #ifdef TREE_NEAR
  transformed += normal * (sin(uTime * 2.6 + position.x * 23.0 + position.y * 17.0 + ph) * 0.006 * (1.0 - aPart));
  #endif
  // per-tree LOD: detailed trees only inside uLodR, the simple versions outside
  float dcam = distance(ip.xz, uCamPos.xz);
  #ifdef TREE_NEAR
  if (dcam > uLodR) transformed = vec3(0.0);
  #else
  #ifndef TREE_SHADOW
  if (dcam <= uLodR) transformed = vec3(0.0);
  #endif
  // medium within uMidR.x, low beyond uMidR.x + uMidR.y (trunks switch in the middle of the band)
  float dm = length(vec2(dcam, uCamPos.y * 0.6));
  float sw = aLod < 1.5 ? (aPart > 0.5 ? uMidR.x + 0.5 * uMidR.y : uMidR.x + uMidR.y) : (aPart > 0.5 ? uMidR.x + 0.5 * uMidR.y : uMidR.x);
  if (aLod < 1.5 ? dm > sw : dm <= sw) transformed = vec3(0.0);
  #endif
}
#endif`

/** Leaf clump noise from the rest position of the tree (world space, about 1 m features). */
const LEAF = /* glsl */ `
float leafNoise(vec3 p, float f) {
  return 0.5 * (tNoise(p.xz * f + vec2(p.y * 1.7, -p.y * 1.3) * f) + tNoise(p.xy * f * 1.3 + vec2(p.z * 1.1, p.z * 0.7) * f));
}`

export class TreeLibrary {
  /** 0 detailed, 1 medium, 2 low (the far blobs are baked into the building mesh by the worker) */
  readonly geometries: THREE.BufferGeometry[]
  /** Largest tree height (m), for manual bounding spheres. */
  readonly maxHeight = 20
  private readonly matNear: THREE.MeshLambertMaterial
  private readonly matFar: THREE.MeshLambertMaterial
  private readonly depthNear: THREE.MeshDepthMaterial
  private readonly depthFar: THREE.MeshDepthMaterial
  private readonly uCamPos = { value: new THREE.Vector3() }
  private readonly uLodR = { value: 0 }
  private readonly uMidR = { value: new THREE.Vector2(0, 1) }

  constructor(shared: SharedUniforms) {
    this.geometries = [0, 1, 2].map(buildGeometry)
    const patchVertex = (shader: { uniforms: Record<string, unknown>; vertexShader: string }) => {
      shader.uniforms.uTime = shared.uTime
      shader.uniforms.uCamPos = this.uCamPos
      shader.uniforms.uLodR = this.uLodR
      shader.uniforms.uMidR = this.uMidR
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>${VERT_PARS}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>${VERT_BODY}`)
    }
    const lit = (near: boolean) => {
      const m = new THREE.MeshLambertMaterial({ vertexColors: true })
      if (near) m.defines = { TREE_NEAR: '' }
      m.onBeforeCompile = (shader) => {
        patchVertex(shader)
        shader.uniforms.uSkyHorizon = shared.uSkyHorizon
        shader.uniforms.uDaylight = shared.uDaylight
        shader.uniforms.uNight = shared.uNight
        // the trunk keeps its own colour instead of the per-tree leaf colour
        shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
if (aPart > 0.5) vColor.rgb = color.rgb;`)
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
uniform vec3 uSkyHorizon;
uniform float uDaylight;
uniform float uNight;
varying float vPart;
varying vec3 vTreeW;
varying vec3 vRimN;
${NOISE}
${LEAF}`)
          .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 c = pow(diffuseColor.rgb, vec3(2.2));
  if (vPart < 0.5) {
    // leaf clumps: light and dark patches, yellow-green where the light catches
    float n = leafNoise(vTreeW, 0.55);
    float n2 = leafNoise(vTreeW + 7.3, 2.4);
    #ifdef TREE_NEAR
    // ragged, leafy outline: cut holes where the crown surface turns away from the viewer
    float rim = abs(dot(normalize(vRimN), normalize(vViewPosition)));
    if (rim < 0.42 && n2 * 0.7 + leafNoise(vTreeW + 3.1, 6.1) * 0.3 > 0.3 + rim * 0.9) discard;
    c *= mix(0.76, 1.0, smoothstep(0.26, 0.58, n2));
    #endif
    c *= 0.82 + 0.3 * n + 0.14 * (n2 - 0.5);
    c = mix(c, c * vec3(1.1, 1.04, 0.8), smoothstep(0.5, 0.85, n) * 0.5);
  } else {
    // plane-tree bark: pale patches
    c *= 0.78 + 0.44 * tNoise(vTreeW.xz * 5.0 + vTreeW.y * 2.2);
  }
  diffuseColor.rgb = c;
}`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// light scattered through the foliage keeps the shaded side from going black; lamps at night
totalEmissiveRadiance += diffuseColor.rgb * (uSkyHorizon * (0.3 * uDaylight) + vec3(1.0, 0.72, 0.42) * (0.05 * uNight)) * (1.0 - vPart);`)
      }
      m.customProgramCacheKey = () => (near ? 'tk-tree-v6-near' : 'tk-tree-v6-far')
      return m
    }
    // shadows always come from the simple models (also for the detailed trees, which do not cast)
    const depth = (near: boolean) => {
      const m = new THREE.MeshDepthMaterial()
      m.defines = near ? { TREE_NEAR: '' } : { TREE_SHADOW: '' }
      m.onBeforeCompile = (shader) => {
        patchVertex(shader)
        // holes in the shadow of the crowns: dappled light under the trees
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
varying float vPart;
varying vec3 vTreeW;
${NOISE}`)
          .replace('void main() {', `void main() {
  if (vPart < 0.5 && tNoise(vTreeW.xz * 0.8 + vTreeW.y * 0.9) + 0.35 * tNoise(vTreeW.xz * 2.6) < 0.62) discard;`)
      }
      m.customProgramCacheKey = () => (near ? 'tk-tree-depth5-near' : 'tk-tree-depth5-far')
      return m
    }
    this.matNear = lit(true)
    this.matFar = lit(false)
    this.depthNear = depth(true)
    this.depthFar = depth(false)
  }

  /**
   * Camera position, the radius (m) inside which the detailed model is used (0 turns it off) and the
   * medium -> low switch: radius and crossfade band (distance = hypot(horizontal, 0.6 camera height)).
   */
  setLod(camera: THREE.Vector3, radius: number, midRadius: number, midBand: number) {
    this.uCamPos.value.copy(camera)
    this.uLodR.value = radius
    this.uMidR.value.set(midRadius, midBand)
  }

  /** One InstancedMesh for a geometry level, using the given (shared) instance attributes. */
  createMesh(level: number, matrix: THREE.InstancedBufferAttribute, color: THREE.InstancedBufferAttribute, count: number, castShadow: boolean): THREE.InstancedMesh {
    const near = level === 0
    const mesh = new THREE.InstancedMesh(this.geometries[level], near ? this.matNear : this.matFar, count)
    mesh.instanceMatrix = matrix
    mesh.instanceColor = color
    mesh.customDepthMaterial = near ? this.depthNear : this.depthFar
    mesh.castShadow = castShadow && !near
    mesh.receiveShadow = false
    mesh.matrixAutoUpdate = false
    return mesh
  }

  dispose() {
    for (const g of this.geometries) g.dispose()
    this.matNear.dispose()
    this.matFar.dispose()
    this.depthNear.dispose()
    this.depthFar.dispose()
  }
}

/**
 * Street lamp post: unit height (the instance matrix scales y to the lamp height and x/z stay 1),
 * the arm points along +x. `aEmit` marks the glowing underside of the head.
 */
export function createLampGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], emit: number[] = []
  const C: [number, number, number] = [0.17, 0.19, 0.19]
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: [number, number, number], bottomEmit: number, bottom: boolean) => {
    const faces: [number[], number[], number[], number[], number[]][] = [
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]],
      [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]],
      [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]],
      [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [0, 0, 1]],
      [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]],
    ]
    if (bottom) faces.push([[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]])
    for (const f of faces) {
      const n = f[4]
      const e = n[1] < -0.5 ? bottomEmit : 0
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const p = f[k]
        pos.push(p[0], p[1], p[2])
        nor.push(n[0], n[1], n[2])
        col.push(c[0], c[1], c[2])
        emit.push(e)
      }
    }
  }
  // y is a fraction of the lamp height; the shader-free trick: thin parts are given in meters / 9
  box(-0.09, 0, -0.09, 0.09, 0.06, 0.09, C, 0, false) // base
  box(-0.055, 0.06, -0.055, 0.055, 1, 0.055, C, 0, false) // pole
  box(0, 0.985, -0.035, 1.9, 1, 0.035, C, 0, true) // arm
  box(1.5, 0.972, -0.14, 2.25, 0.986, 0.14, [0.75, 0.72, 0.62], 1, true) // head
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3))
  g.setAttribute('aEmit', new THREE.BufferAttribute(new Float32Array(emit), 1))
  return g
}
