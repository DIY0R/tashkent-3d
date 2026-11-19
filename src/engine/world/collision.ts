import type { CollisionData } from './types'

export interface CollideResult {
  x: number
  z: number
  hit: boolean
}

/**
 * Pushes a circle out of the building edges of one tile grid.
 * Edges are oriented: outward normal = (dz, -dx) / len.
 * `y` is the height of the feet: edges of buildings entirely below it or starting above head are ignored.
 */
export function collideGrid(c: CollisionData, out: CollideResult, radius: number, y: number): void {
  const { minX, minZ, cell, nx, nz, cellStart, cellEdges, edges } = c
  const x = out.x, z = out.z
  let i0 = Math.floor((x - radius - minX) / cell), i1 = Math.floor((x + radius - minX) / cell)
  let j0 = Math.floor((z - radius - minZ) / cell), j1 = Math.floor((z + radius - minZ) / cell)
  if (i1 < 0 || j1 < 0 || i0 >= nx || j0 >= nz) return
  if (i0 < 0) i0 = 0
  if (j0 < 0) j0 = 0
  if (i1 >= nx) i1 = nx - 1
  if (j1 >= nz) j1 = nz - 1
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const ci = j * nx + i
      for (let k = cellStart[ci], end = cellStart[ci + 1]; k < end; k++) {
        const e = cellEdges[k] * 6
        if (y >= edges[e + 4] - 0.05 || y + 1.7 < edges[e + 5]) continue
        const ax = edges[e], az = edges[e + 1], bx = edges[e + 2], bz = edges[e + 3]
        const dx = bx - ax, dz = bz - az
        const len2 = dx * dx + dz * dz
        if (len2 < 1e-6) continue
        let t = ((out.x - ax) * dx + (out.z - az) * dz) / len2
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const px = ax + dx * t, pz = az + dz * t
        let rx = out.x - px, rz = out.z - pz
        const d2 = rx * rx + rz * rz
        if (d2 >= radius * radius) continue
        const len = Math.sqrt(len2)
        const onx = dz / len, onz = -dx / len
        const side = rx * onx + rz * onz
        let d = Math.sqrt(d2)
        if (side < 0 && t > 0 && t < 1) {
          // centre slipped just behind the wall: push back out through it
          out.x = px + onx * radius
          out.z = pz + onz * radius
        } else {
          if (d < 1e-5) { rx = onx; rz = onz; d = 1 }
          out.x = px + (rx / d) * radius
          out.z = pz + (rz / d) * radius
        }
        out.hit = true
      }
    }
  }
}

/**
 * First hit of the 3D segment (x0,y0,z0)->(x1,y1,z1) with building walls, as a fraction 0..1 (1 = no hit).
 */
export function raycastGrid(c: CollisionData, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, best: number): number {
  const { minX, minZ, cell, nx, nz, cellStart, cellEdges, edges } = c
  let i0 = Math.floor((Math.min(x0, x1) - minX) / cell), i1 = Math.floor((Math.max(x0, x1) - minX) / cell)
  let j0 = Math.floor((Math.min(z0, z1) - minZ) / cell), j1 = Math.floor((Math.max(z0, z1) - minZ) / cell)
  if (i1 < 0 || j1 < 0 || i0 >= nx || j0 >= nz) return best
  if (i0 < 0) i0 = 0
  if (j0 < 0) j0 = 0
  if (i1 >= nx) i1 = nx - 1
  if (j1 >= nz) j1 = nz - 1
  const rx = x1 - x0, rz = z1 - z0
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const ci = j * nx + i
      for (let k = cellStart[ci], end = cellStart[ci + 1]; k < end; k++) {
        const e = cellEdges[k] * 6
        const ax = edges[e], az = edges[e + 1]
        const sx = edges[e + 2] - ax, sz = edges[e + 3] - az
        const den = rx * sz - rz * sx
        if (Math.abs(den) < 1e-9) continue
        const t = ((ax - x0) * sz - (az - z0) * sx) / den
        if (t <= 0 || t >= best) continue
        const u = ((ax - x0) * rz - (az - z0) * rx) / den
        if (u < 0 || u > 1) continue
        const y = y0 + (y1 - y0) * t
        if (y > edges[e + 4] || y < edges[e + 5]) continue
        best = t
      }
    }
  }
  return best
}

/** Even-odd test: is the point inside any building footprint of this grid (at height y)? */
export function insideGrid(c: CollisionData, x: number, z: number, y: number, stamp: Uint32Array, stampId: number): boolean {
  const { minX, minZ, cell, nx, nz, cellStart, cellEdges, edges } = c
  const j = Math.floor((z - minZ) / cell)
  const i0 = Math.floor((x - minX) / cell)
  if (j < 0 || j >= nz || i0 < 0 || i0 >= nx) return false
  let crossings = 0
  for (let i = i0; i < nx; i++) {
    const ci = j * nx + i
    for (let k = cellStart[ci], end = cellStart[ci + 1]; k < end; k++) {
      const id = cellEdges[k]
      if (stamp[id] === stampId) continue
      stamp[id] = stampId
      const e = id * 6
      if (y >= edges[e + 4] || y + 1.7 < edges[e + 5]) continue
      const az = edges[e + 1], bz = edges[e + 3]
      if (az > z === bz > z) continue
      const ax = edges[e], bx = edges[e + 2]
      const xi = ax + ((z - az) / (bz - az)) * (bx - ax)
      if (xi > x) crossings++
    }
  }
  return (crossings & 1) === 1
}
