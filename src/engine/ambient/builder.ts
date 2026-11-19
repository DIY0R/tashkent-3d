import * as THREE from 'three'

type RGB = [number, number, number]

export function hex(c: string): RGB {
  const col = new THREE.Color(c)
  return [col.r, col.g, col.b]
}

/**
 * Tiny flat-shaded geometry builder for the procedural ambient models.
 * Every vertex carries a colour and one free vec3 (`aV`) whose meaning is up to the model.
 */
export class Builder {
  private readonly pos: number[] = []
  private readonly nor: number[] = []
  private readonly col: number[] = []
  private readonly ext: number[] = []
  /** value written to aV for the following faces */
  v: RGB = [0, 0, 0]

  /** Quad a-b-c-d, counter-clockwise seen from the front. */
  quad(a: RGB, b: RGB, c: RGB, d: RGB, color: RGB, normal?: RGB) {
    let n = normal
    if (!n) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const l = Math.hypot(nx, ny, nz) || 1
      n = [nx / l, ny / l, nz / l]
    }
    for (const p of [a, b, c, a, c, d]) {
      this.pos.push(p[0], p[1], p[2])
      this.nor.push(n[0], n[1], n[2])
      this.col.push(color[0], color[1], color[2])
      this.ext.push(this.v[0], this.v[1], this.v[2])
    }
  }

  tri(a: RGB, b: RGB, c: RGB, color: RGB) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2])
      this.nor.push(nx / l, ny / l, nz / l)
      this.col.push(color[0], color[1], color[2])
      this.ext.push(this.v[0], this.v[1], this.v[2])
    }
  }

  /**
   * Box whose top rectangle may differ from the bottom one (a frustum).
   * bottom: x0..x1, z0..z1 at y0; top: X0..X1, Z0..Z1 at y1. No bottom face.
   */
  frustum(
    x0: number, x1: number, z0: number, z1: number, y0: number,
    X0: number, X1: number, Z0: number, Z1: number, y1: number,
    side: RGB, top: RGB = side, topV?: RGB,
  ) {
    const a: RGB = [x0, y0, z0], b: RGB = [x1, y0, z0], c: RGB = [x1, y0, z1], d: RGB = [x0, y0, z1]
    const A: RGB = [X0, y1, Z0], B: RGB = [X1, y1, Z0], C: RGB = [X1, y1, Z1], D: RGB = [X0, y1, Z1]
    this.quad(b, a, A, B, side) // -z
    this.quad(d, c, C, D, side) // +z
    this.quad(a, d, D, A, side) // -x
    this.quad(c, b, B, C, side) // +x
    const keep = this.v
    if (topV) this.v = topV
    this.quad(A, D, C, B, top) // +y
    this.v = keep
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: RGB, top: RGB = color) {
    this.frustum(x0, x1, z0, z1, y0, x0, x1, z0, z1, y1, color, top)
  }

  /** Recolours the first vertex of the last triangle (the centre of a fan). */
  hubColor(color: RGB) {
    const o = this.col.length - 9
    this.col[o] = color[0]; this.col[o + 1] = color[1]; this.col[o + 2] = color[2]
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3))
    g.setAttribute('aV', new THREE.BufferAttribute(new Float32Array(this.ext), 3))
    return g
  }

  get triangles(): number {
    return this.pos.length / 9
  }
}
