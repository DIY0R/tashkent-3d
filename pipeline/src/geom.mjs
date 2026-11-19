// Small 2D geometry helpers on flat coordinate arrays [x1,z1,x2,z2,...].

/** Shoelace signed area in the (x, z) plane. With z pointing south, a ring that is
 *  counter-clockwise on a north-up map has a NEGATIVE value here. */
export function signedArea(p) {
  let a = 0;
  const n = p.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return a / 2;
}
export function reverseRing(p) {
  const out = new Array(p.length);
  for (let i = 0, j = p.length - 2; i < p.length; i += 2, j -= 2) {
    out[i] = p[j];
    out[i + 1] = p[j + 1];
  }
  return out;
}
/** Force map-CCW (ccw=true => signedArea < 0) or map-CW orientation. */
export function orient(p, ccw) {
  const a = signedArea(p);
  return a < 0 === ccw ? p : reverseRing(p);
}
export function centroid(p) {
  let a = 0, cx = 0, cz = 0;
  const n = p.length;
  const ox = p[0], oz = p[1];
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const x0 = p[j] - ox, z0 = p[j + 1] - oz, x1 = p[i] - ox, z1 = p[i + 1] - oz;
    const f = x0 * z1 - x1 * z0;
    a += f;
    cx += (x0 + x1) * f;
    cz += (z0 + z1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sz = 0;
    for (let i = 0; i < n; i += 2) { sx += p[i]; sz += p[i + 1]; }
    return [sx / (n / 2), sz / (n / 2)];
  }
  return [ox + cx / (3 * a), oz + cz / (3 * a)];
}
export function pip(x, z, p) {
  let inside = false;
  const n = p.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const zi = p[i + 1], zj = p[j + 1];
    if (zi > z !== zj > z && x < ((p[j] - p[i]) * (z - zi)) / (zj - zi) + p[i]) inside = !inside;
  }
  return inside;
}
export function bboxOf(p) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i];
    if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < z0) z0 = p[i + 1];
    if (p[i + 1] > z1) z1 = p[i + 1];
  }
  return [x0, z0, x1, z1];
}
export function lineLength(p) {
  let l = 0;
  for (let i = 2; i < p.length; i += 2) l += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return l;
}
function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qz = az + t * dz - pz;
  return qx * qx + qz * qz;
}
export { segDist2 };

/** Douglas-Peucker on an open polyline. */
export function dpLine(p, tol) {
  const n = p.length / 2;
  if (n <= 2) return Array.from(p);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [0, n - 1];
  const t2 = tol * tol;
  while (stack.length) {
    const b = stack.pop(), a = stack.pop();
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(p[2 * i], p[2 * i + 1], p[2 * a], p[2 * a + 1], p[2 * b], p[2 * b + 1]);
      if (d > md) { md = d; mi = i; }
    }
    if (md > t2) { keep[mi] = 1; stack.push(a, mi, mi, b); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
  return out;
}
/** Douglas-Peucker on a closed ring (first point not repeated). */
export function dpRing(p, tol) {
  const n = p.length / 2;
  if (n <= 4) return Array.from(p);
  // split at the vertex farthest from vertex 0
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) {
    const d = (p[2 * i] - p[0]) ** 2 + (p[2 * i + 1] - p[1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const a = [], b = [];
  for (let i = 0; i <= far; i++) a.push(p[2 * i], p[2 * i + 1]);
  for (let i = far; i < n; i++) b.push(p[2 * i], p[2 * i + 1]);
  b.push(p[0], p[1]);
  const sa = dpLine(a, tol), sb = dpLine(b, tol);
  const out = sa.slice(0, sa.length - 2).concat(sb.slice(0, sb.length - 2));
  return out.length >= 6 ? out : Array.from(p);
}

/** Deterministic hash -> [0,1). Accepts large integer ids. */
export function hash01(a, b = 0) {
  let h = (a % 4294967296) ^ Math.imul(Math.floor(a / 4294967296) | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Stitch member ways (flat int lon/lat arrays) into closed rings. Unclosable chains are dropped. */
export function assembleRings(ways) {
  const rings = [];
  const open = [];
  for (const g of ways) {
    if (g.length >= 8 && g[0] === g[g.length - 2] && g[1] === g[g.length - 1]) rings.push(g.slice(0, g.length - 2));
    else if (g.length >= 4) open.push(g);
  }
  const used = new Uint8Array(open.length);
  const ends = new Map();
  const key = (x, y) => x + ',' + y;
  open.forEach((g, i) => {
    for (const k of [key(g[0], g[1]), key(g[g.length - 2], g[g.length - 1])]) {
      let l = ends.get(k);
      if (!l) ends.set(k, (l = []));
      l.push(i);
    }
  });
  for (let s = 0; s < open.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    let chain = Array.from(open[s]);
    for (;;) {
      const ex = chain[chain.length - 2], ey = chain[chain.length - 1];
      if (chain.length >= 8 && ex === chain[0] && ey === chain[1]) {
        rings.push(chain.slice(0, chain.length - 2));
        break;
      }
      const cand = (ends.get(key(ex, ey)) || []).find((i) => !used[i]);
      if (cand === undefined) break; // cannot close
      used[cand] = 1;
      const g = open[cand];
      if (g[0] === ex && g[1] === ey) for (let i = 2; i < g.length; i++) chain.push(g[i]);
      else for (let i = g.length - 4; i >= 0; i -= 2) chain.push(g[i], g[i + 1]);
    }
  }
  return rings;
}

/** Grid index of polygons for point-in-polygon queries. */
export class PolyIndex {
  constructor(cell = 50) {
    this.cell = cell;
    this.cells = new Map();
    this.polys = [];
  }
  add(outer, holes) {
    const bb = bboxOf(outer);
    const idx = this.polys.length;
    this.polys.push({ bb, outer, holes: holes && holes.length ? holes : null });
    const c = this.cell;
    for (let i = Math.floor(bb[0] / c); i <= Math.floor(bb[2] / c); i++)
      for (let j = Math.floor(bb[1] / c); j <= Math.floor(bb[3] / c); j++) {
        const k = (i + 4096) * 8192 + (j + 4096);
        let l = this.cells.get(k);
        if (!l) this.cells.set(k, (l = []));
        l.push(idx);
      }
    return idx;
  }
  /** index of a polygon containing the point, or -1. With smallest=true returns the smallest-area match. */
  find(x, z) {
    const c = this.cell;
    const l = this.cells.get((Math.floor(x / c) + 4096) * 8192 + (Math.floor(z / c) + 4096));
    if (!l) return -1;
    for (const idx of l) {
      const q = this.polys[idx];
      if (x < q.bb[0] || x > q.bb[2] || z < q.bb[1] || z > q.bb[3]) continue;
      if (!pip(x, z, q.outer)) continue;
      if (q.holes && q.holes.some((h) => pip(x, z, h))) continue;
      return idx;
    }
    return -1;
  }
  findAll(x, z) {
    const c = this.cell;
    const l = this.cells.get((Math.floor(x / c) + 4096) * 8192 + (Math.floor(z / c) + 4096));
    const out = [];
    if (!l) return out;
    for (const idx of l) {
      const q = this.polys[idx];
      if (x < q.bb[0] || x > q.bb[2] || z < q.bb[1] || z > q.bb[3]) continue;
      if (!pip(x, z, q.outer)) continue;
      if (q.holes && q.holes.some((h) => pip(x, z, h))) continue;
      out.push(idx);
    }
    return out;
  }
  contains(x, z) {
    return this.find(x, z) >= 0;
  }
}

/** Grid index of thick line segments (road corridors). */
export class SegGrid {
  constructor(cell = 25, margin = 4) {
    this.cell = cell;
    this.margin = margin;
    this.cells = new Map();
    this.s = []; // x1,z1,x2,z2,halfWidth,flag
  }
  addLine(p, hw, flag) {
    const c = this.cell;
    for (let i = 2; i < p.length; i += 2) {
      const x1 = p[i - 2], z1 = p[i - 1], x2 = p[i], z2 = p[i + 1];
      const idx = this.s.length;
      this.s.push(x1, z1, x2, z2, hw, flag);
      const m = hw + this.margin;
      const i0 = Math.floor((Math.min(x1, x2) - m) / c), i1 = Math.floor((Math.max(x1, x2) + m) / c);
      const j0 = Math.floor((Math.min(z1, z2) - m) / c), j1 = Math.floor((Math.max(z1, z2) + m) / c);
      for (let a = i0; a <= i1; a++)
        for (let b = j0; b <= j1; b++) {
          const k = (a + 4096) * 8192 + (b + 4096);
          let l = this.cells.get(k);
          if (!l) this.cells.set(k, (l = []));
          l.push(idx);
        }
    }
  }
  /** true if the point is closer than halfWidth + extra to a segment whose flag is <= maxFlag. extra must be <= margin. */
  near(x, z, extra, maxFlag) {
    const c = this.cell;
    const l = this.cells.get((Math.floor(x / c) + 4096) * 8192 + (Math.floor(z / c) + 4096));
    if (!l) return false;
    const s = this.s;
    for (const i of l) {
      if (s[i + 5] > maxFlag) continue;
      const r = s[i + 4] + extra;
      if (segDist2(x, z, s[i], s[i + 1], s[i + 2], s[i + 3]) < r * r) return true;
    }
    return false;
  }
}
