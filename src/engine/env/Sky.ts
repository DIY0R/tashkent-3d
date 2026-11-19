import * as THREE from 'three'
import type { SharedUniforms } from './Environment'

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 0.0);
  gl_Position = projectionMatrix * vec4(p.xyz, 1.0);
  gl_Position.z = gl_Position.w; // far plane
}`

const FRAG = /* glsl */ `
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunColor;
uniform float uNight;
uniform float uDaylight;
uniform float uTime;
uniform sampler2D uCloudTex;
varying vec3 vDir;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  // wide hazy band at the horizon (exactly the fog colour at h = 0), then the zenith colour
  float t = pow(smoothstep(0.0, 0.8, h), 0.62);
  vec3 col = mix(uSkyHorizon, uSkyZenith, t);

  // sun glow and disc
  float sd = max(dot(d, uSunDir), 0.0);
  float sunUp = smoothstep(-0.12, 0.02, uSunDir.y);
  float aboveHorizon = smoothstep(-0.01, 0.06, d.y);
  float low = 1.0 - smoothstep(0.0, 0.5, uSunDir.y);
  col += uSunColor * (pow(sd, 5.0) * (0.1 + 0.16 * low) + pow(sd, 50.0) * 0.45) * sunUp * mix(0.35, 1.0, aboveHorizon);
  float disc = smoothstep(0.99978, 0.9999, sd);
  col += uSunColor * disc * 14.0 * sunUp * aboveHorizon;

  // moon
  float md = max(dot(d, uMoonDir), 0.0);
  float moon = smoothstep(0.99975, 0.9999, md);
  col += (vec3(0.75, 0.82, 1.0) * moon * 2.2 + vec3(0.25, 0.32, 0.5) * pow(md, 300.0) * 0.5) * uNight;

  // stars
  float starMask = 1.0;
  // soft cloud layer: two scrolling samples of a tiling noise texture on a plane above the city
  if (d.y > 0.015) {
    vec2 uv = d.xz / (d.y + 0.14) * 0.1 + uTime * vec2(0.0011, 0.0004);
    float n = texture2D(uCloudTex, uv).r * 0.62 + texture2D(uCloudTex, uv * 2.7 + vec2(0.37, 0.11) - uTime * vec2(0.0006, 0.0)).r * 0.38;
    float cov = smoothstep(0.5, 0.74, n);
    // cheap self shadowing: thicker parts are darker underneath, edges towards the sun are bright
    float thick = smoothstep(0.6, 0.9, n);
    vec3 lit = mix(uSkyHorizon * 1.1 + vec3(0.12) * uDaylight, uSunColor * (0.42 + 0.58 * uDaylight), 0.5 * uDaylight);
    lit *= 1.0 - 0.22 * thick;
    lit += uSunColor * pow(sd, 4.0) * 0.3 * sunUp * (1.0 - thick);
    // at night the clouds pick up a little of the city's warm light
    lit += vec3(0.05, 0.036, 0.026) * uNight;
    float a = cov * smoothstep(0.015, 0.2, d.y) * 0.82;
    col = mix(col, lit, a);
    starMask = 1.0 - a;
  }
  if (uNight > 0.01 && d.y > 0.0) {
    vec3 g = d * 190.0;
    vec3 cell = floor(g);
    float s = hash13(cell);
    if (s > 0.9925) {
      vec3 f = fract(g) - 0.5;
      float star = smoothstep(0.42, 0.0, length(f));
      float tw = 0.75 + 0.25 * sin(uTime * (1.5 + s * 40.0) + s * 600.0);
      col += vec3(0.9, 0.93, 1.0) * star * tw * (s - 0.9925) * 260.0 * uNight * smoothstep(0.02, 0.3, d.y) * starMask;
    }
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

/** Tiling fbm value noise (R8), used for the cloud layer. */
function cloudTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size)
  const acc = new Float32Array(size * size)
  let seed = 1234567
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    return (seed >>> 8) / 16777216
  }
  let amp = 0.5, total = 0
  for (const period of [4, 8, 16, 32, 64]) {
    const lattice = new Float32Array(period * period)
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand()
    const cell = size / period
    for (let y = 0; y < size; y++) {
      const fy = y / cell, y0 = Math.floor(fy), ty = fy - y0
      const sy = ty * ty * (3 - 2 * ty)
      for (let x = 0; x < size; x++) {
        const fx = x / cell, x0 = Math.floor(fx), tx = fx - x0
        const sx = tx * tx * (3 - 2 * tx)
        const a = lattice[(y0 % period) * period + (x0 % period)], b = lattice[(y0 % period) * period + ((x0 + 1) % period)]
        const c = lattice[((y0 + 1) % period) * period + (x0 % period)], d = lattice[((y0 + 1) % period) * period + ((x0 + 1) % period)]
        acc[y * size + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp
      }
    }
    total += amp
    amp *= 0.5
  }
  for (let i = 0; i < acc.length; i++) data[i] = Math.max(0, Math.min(255, Math.round((acc[i] / total) * 255)))
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

/**
 * Gradient sky dome with sun, moon, stars and a soft cloud layer. Follows the camera and is drawn
 * at the far plane after the opaque scene (renderOrder 5) and before the flat ground layers, which
 * do not write depth.
 */
export class Sky {
  readonly mesh: THREE.Mesh
  constructor(shared: SharedUniforms) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSkyZenith: shared.uSkyZenith,
        uSkyHorizon: shared.uSkyHorizon,
        uSunDir: shared.uSunDir,
        uMoonDir: shared.uMoonDir,
        uSunColor: shared.uSunColor,
        uNight: shared.uNight,
        uDaylight: shared.uDaylight,
        uTime: shared.uTime,
        uCloudTex: { value: cloudTexture() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
      fog: false,
    })
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
    this.mesh.matrixAutoUpdate = false
  }
}
