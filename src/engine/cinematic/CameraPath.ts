import * as THREE from 'three'

/** One camera key: position, look-at point, optional field of view (degrees). */
export interface PathKey {
  p: [number, number, number]
  t: [number, number, number]
  fov?: number
}

export interface Shot {
  position: THREE.Vector3
  target: THREE.Vector3
  fov: number
}

export function makeShot(): Shot {
  return { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 }
}

export const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }
export const smoother = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * t * (t * (t * 6 - 15) + 10) }

/**
 * Camera path through keys: centripetal Catmull-Rom for the position, Catmull-Rom for the look-at
 * point and the field of view on the same parameter. `sample(u)` takes u as the fraction of the
 * path LENGTH, so a linear u is a constant speed and any easing of u is an easing of the speed.
 * The camera is always built with lookAt and a fixed up vector, so it never rolls.
 */
export class CameraPath {
  readonly closed: boolean
  /** meters */
  readonly length: number
  private readonly pos: THREE.CatmullRomCurve3
  private readonly tgt: THREE.CatmullRomCurve3
  private readonly fovs: number[]

  constructor(keys: PathKey[], closed = false, defaultFov = 50) {
    this.closed = closed
    this.pos = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.p)), closed, 'centripetal')
    this.tgt = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.t)), closed, 'centripetal')
    this.fovs = keys.map((k) => k.fov ?? defaultFov)
    this.pos.arcLengthDivisions = Math.max(400, keys.length * 400)
    this.length = this.pos.getLength()
  }

  sample(u: number, out: Shot): Shot {
    u = this.closed ? u - Math.floor(u) : Math.min(1, Math.max(0, u))
    const t = this.pos.getUtoTmapping(u, 0)
    this.pos.getPoint(t, out.position)
    this.tgt.getPoint(t, out.target)
    out.fov = this.fovAt(t)
    return out
  }

  /** Uniform Catmull-Rom on the key values, clamped to their range (no overshoot). */
  private fovAt(t: number): number {
    const f = this.fovs
    const n = f.length
    const segs = this.closed ? n : n - 1
    const x = t * segs
    let i = Math.floor(x)
    if (!this.closed && i >= segs) i = segs - 1
    const w = x - i
    const at = (k: number) => (this.closed ? f[((k % n) + n) % n] : f[Math.min(n - 1, Math.max(0, k))])
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    const v = 0.5 * (2 * p1 + (p2 - p0) * w + (2 * p0 - 5 * p1 + 4 * p2 - p3) * w * w + (3 * p1 - p0 - 3 * p2 + p3) * w * w * w)
    return Math.min(Math.max(p1, p2), Math.max(Math.min(p1, p2), v))
  }
}
