import { mapData, type MapTile, type Packed } from '@/engine/query/mapData'

export interface MapColors {
  ground: string
  block: string
  road: string
  green: string
  water: string
  primary: string
  foreground: string
  muted: string
  north: string
}

/** Reads the map tokens from an element inside the HUD (`.dark`) scope. */
export function readMapColors(el: Element): MapColors {
  const cs = getComputedStyle(el)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    ground: v('--map-ground', 'black'),
    block: v('--map-block', 'gray'),
    road: v('--map-road', 'silver'),
    green: v('--map-green', 'green'),
    water: v('--map-water', 'teal'),
    primary: v('--primary', 'white'),
    foreground: v('--foreground', 'white'),
    muted: v('--muted-foreground', 'silver'),
    north: v('--north', 'red'),
  }
}

export interface MapView {
  /** world point at the centre of the canvas */
  cx: number
  cz: number
  /** CSS pixels per meter */
  scale: number
  /** canvas size in CSS pixels */
  w: number
  h: number
  dpr: number
}

function polyPath(pk: Packed, i: number, path: Path2D, close: boolean) {
  const a = pk.off[i], b = pk.off[i + 1]
  if (b - a < 2) return
  path.moveTo(pk.pts[a * 2], pk.pts[a * 2 + 1])
  for (let j = a + 1; j < b; j++) path.lineTo(pk.pts[j * 2], pk.pts[j * 2 + 1])
  if (close) path.closePath()
}

function tilePaths(t: MapTile): NonNullable<MapTile['paths']> {
  if (t.paths) return t.paths
  const buildings = new Path2D()
  for (let i = 0; i < t.buildings.off.length - 1; i++) polyPath(t.buildings, i, buildings, true)
  const roads: [Path2D, Path2D, Path2D] = [new Path2D(), new Path2D(), new Path2D()]
  for (let i = 0; i < t.roads.off.length - 1; i++) polyPath(t.roads, i, roads[t.roadClass[i]], false)
  t.paths = { buildings, roads }
  return t.paths
}

/**
 * Draws the flat plan: ground, green, water, buildings, roads. North is up.
 * Flat fills only (DESIGN 9.5). Returns nothing; missing tiles are requested and appear later.
 */
export function drawMap(ctx: CanvasRenderingContext2D, view: MapView, colors: MapColors, load = true) {
  const { cx, cz, scale, w, h, dpr } = view
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = colors.ground
  ctx.fillRect(0, 0, w, h)
  if (!mapData.ready()) return

  const halfW = w / 2 / scale, halfH = h / 2 / scale
  const minX = cx - halfW, maxX = cx + halfW, minZ = cz - halfH, maxZ = cz + halfH
  // world meters -> canvas
  const k = scale * dpr
  ctx.setTransform(k, 0, 0, k, (w / 2 - cx * scale) * dpr, (h / 2 - cz * scale) * dpr)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const px = 1 / scale // one CSS pixel in meters

  const g = mapData.global
  if (g) {
    const fillSet = (pk: Packed, box: Float32Array, color: string, minSize: number) => {
      const path = new Path2D()
      for (let i = 0; i < pk.off.length - 1; i++) {
        const b = i * 4
        if (box[b] > maxX || box[b + 2] < minX || box[b + 1] > maxZ || box[b + 3] < minZ) continue
        if (box[b + 2] - box[b] < minSize && box[b + 3] - box[b + 1] < minSize) continue
        polyPath(pk, i, path, true)
      }
      ctx.fillStyle = color
      ctx.fill(path)
    }
    fillSet(g.green, g.greenBox, colors.green, px * 1.5)
    fillSet(g.water, g.waterBox, colors.water, px)
    ctx.strokeStyle = colors.water
    const ww = g.waterways
    for (let i = 0; i < ww.off.length - 1; i++) {
      const width = Math.max(g.waterwayW[i], px * 1.2)
      if (g.waterwayW[i] < px * 0.35) continue
      const path = new Path2D()
      polyPath(ww, i, path, false)
      ctx.lineWidth = width
      ctx.stroke(path)
    }
    if (scale < 0.2 && g.boundary.length >= 6) {
      const path = new Path2D()
      path.moveTo(g.boundary[0], g.boundary[1])
      for (let i = 2; i + 1 < g.boundary.length; i += 2) path.lineTo(g.boundary[i], g.boundary[i + 1])
      path.closePath()
      ctx.strokeStyle = colors.muted
      ctx.globalAlpha = 0.55
      ctx.lineWidth = px
      ctx.stroke(path)
      ctx.globalAlpha = 1
    }
  }

  const showBuildings = scale >= 0.16
  const showMinor = scale >= 0.11
  const tiles: MapTile[] = []
  mapData.forTiles(minX, minZ, maxX, maxZ, load, (t) => tiles.push(t))
  if (showBuildings) {
    ctx.fillStyle = colors.block
    for (const t of tiles) ctx.fill(tilePaths(t).buildings)
  }
  ctx.strokeStyle = colors.road
  // minor, secondary, main: real width with a minimum so thin streets stay visible
  const widths = [Math.max(5, px * 1), Math.max(8, px * 1.6), Math.max(12, px * 2.4)]
  for (let c = showMinor ? 0 : 1; c < 3; c++) {
    ctx.lineWidth = widths[c]
    ctx.globalAlpha = c === 0 ? 0.6 : c === 1 ? 0.8 : 1
    for (const t of tiles) ctx.stroke(tilePaths(t).roads[c])
  }
  ctx.globalAlpha = 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** Player arrow with a 13 % view cone (DESIGN 9.5), heading in degrees clockwise from north. */
export function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, headingDeg: number, colors: MapColors) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((headingDeg * Math.PI) / 180)
  ctx.fillStyle = colors.foreground
  ctx.globalAlpha = 0.13
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.arc(0, 0, 48, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.moveTo(0, -12)
  ctx.lineTo(8.5, 9)
  ctx.lineTo(0, 5)
  ctx.lineTo(-8.5, 9)
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 1.5
  ctx.strokeStyle = colors.ground
  ctx.stroke()
  ctx.fill()
  ctx.restore()
}

/** Landmark mark: a primary square with a ground-colour outline. */
export function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colors: MapColors) {
  const s = size / 2
  ctx.fillStyle = colors.ground
  ctx.fillRect(x - s - 1.5, y - s - 1.5, size + 3, size + 3)
  ctx.fillStyle = colors.primary
  ctx.fillRect(x - s, y - s, size, size)
}
