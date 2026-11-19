import * as THREE from 'three'
import { rng, type RGB, type UVR } from './geom'

/**
 * One 2048x1024 canvas atlas per station, drawn at build time (no image files).
 * All ornament here is original procedural drawing in the spirit of the real stations.
 */

export type DesignId = 'kosmonavtlar' | 'navoiy' | 'mustaqillik'

/** Colour scheme: the accent (ceramic) hues and the stone hues are shifted separately. */
export interface Variant {
  accentHue: number
  accentSat: number
  accentLight: number
  stoneHue: number
  stoneSat: number
  /** tint of the lamps, sRGB hex */
  light: string
}

export const VARIANTS: Variant[] = [
  { accentHue: 0, accentSat: 1, accentLight: 1, stoneHue: 0, stoneSat: 1, light: '#ffffff' },
  { accentHue: -0.15, accentSat: 0.9, accentLight: 1, stoneHue: 0.02, stoneSat: 0.9, light: '#f2fff4' },
  { accentHue: 0.41, accentSat: 0.72, accentLight: 0.96, stoneHue: -0.01, stoneSat: 1.15, light: '#fff0de' },
  { accentHue: 0.1, accentSat: 0.85, accentLight: 1.02, stoneHue: 0.55, stoneSat: 0.5, light: '#eef2ff' },
]

const W = 2048, H = 1024
const REG = {
  wall: [0, 0, 512, 640],
  feat: [512, 0, 512, 512],
  ceil: [1024, 0, 512, 512],
  floor: [1536, 0, 512, 512],
  sign: [0, 656, 1024, 112],
  exit: [0, 784, 512, 96],
  white: [600, 800, 64, 64],
  col: [1024, 512, 256, 512],
  misc: [1280, 512, 512, 512],
  stone: [1792, 512, 256, 256],
  extra: [1792, 768, 256, 256],
} as const
export type Region = keyof typeof REG

export interface Atlas {
  texture: THREE.CanvasTexture
  uv: Record<Region, UVR>
  /** quarter of the feature region (2 x 2 grid), for the four medallions */
  featQuarter(i: number): UVR
  /** shifts an accent colour into this station's scheme (linear RGB out) */
  accent(hex: string, k?: number): RGB
  stone(hex: string, k?: number): RGB
  light(k: number): RGB
}

function uvOf(r: readonly number[], inset = 1.5): UVR {
  return [(r[0] + inset) / W, 1 - (r[1] + r[3] - inset) / H, (r[0] + r[2] - inset) / W, 1 - (r[1] + inset) / H]
}

type Ctx = CanvasRenderingContext2D
type Rnd = () => number

const hsl = { h: 0, s: 0, l: 0 }
const col = new THREE.Color()
function shift(hex: string, dh: number, ks: number, kl: number): THREE.Color {
  col.set(hex)
  // HSL in sRGB so the canvas and the vertex colours agree
  col.getHSL(hsl, THREE.SRGBColorSpace)
  return col.setHSL((((hsl.h + dh) % 1) + 1) % 1, Math.min(1, hsl.s * ks), Math.min(1, hsl.l * kl), THREE.SRGBColorSpace)
}
function css(c: THREE.Color): string {
  return `#${c.getHexString(THREE.SRGBColorSpace)}`
}

function lerpHex(a: string, b: string, t: number): string {
  const ca = new THREE.Color(a), cb = new THREE.Color(b)
  return `#${ca.lerp(cb, t).getHexString()}`
}

function region(ctx: Ctx, r: readonly number[], fn: (w: number, h: number) => void) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(r[0], r[1], r[2], r[3])
  ctx.clip()
  ctx.translate(r[0], r[1])
  fn(r[2], r[3])
  ctx.restore()
}

/** soft mottling and veins on top of a filled area */
function marble(ctx: Ctx, w: number, h: number, rnd: Rnd, vein: string, strength = 1) {
  for (let i = 0; i < 46; i++) {
    const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 90
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const light = rnd() > 0.5
    g.addColorStop(0, light ? `rgba(255,255,255,${0.1 * strength})` : `rgba(40,30,20,${0.09 * strength})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  ctx.strokeStyle = vein
  for (let i = 0; i < 16; i++) {
    ctx.globalAlpha = (0.08 + rnd() * 0.16) * strength
    ctx.lineWidth = 0.6 + rnd() * 1.6
    ctx.beginPath()
    let x = rnd() * w, y = rnd() * h
    ctx.moveTo(x, y)
    const dir = rnd() * Math.PI * 2
    for (let k = 0; k < 7; k++) {
      x += Math.cos(dir + (rnd() - 0.5) * 1.4) * 34
      y += Math.sin(dir + (rnd() - 0.5) * 1.4) * 34
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function speckle(ctx: Ctx, w: number, h: number, rnd: Rnd, n: number, colors: string[], maxAlpha = 0.5) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.12 + rnd() * maxAlpha
    ctx.fillStyle = colors[(rnd() * colors.length) | 0]
    const s = 1 + rnd() * 2.2
    ctx.fillRect(rnd() * w, rnd() * h, s, s)
  }
  ctx.globalAlpha = 1
}

/** masonry courses; block widths wrap around so the region tiles horizontally */
function blocks(ctx: Ctx, w: number, h: number, rows: number, rnd: Rnd, tones: string[], joint: string) {
  const rh = h / rows
  for (let r = 0; r < rows; r++) {
    const cols = 3 + ((r + (rnd() > 0.6 ? 1 : 0)) % 2)
    const bw = w / cols
    const off = (r % 2) * bw * 0.5 + (rnd() - 0.5) * 20
    for (let c = -1; c <= cols; c++) {
      const x = off + c * bw
      ctx.fillStyle = tones[(rnd() * tones.length) | 0]
      ctx.fillRect(x, r * rh, bw, rh)
      // each slab a touch lighter or darker
      ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${rnd() * 0.08})` : `rgba(0,0,0,${rnd() * 0.08})`
      ctx.fillRect(x, r * rh, bw, rh)
      ctx.fillStyle = joint
      ctx.fillRect(x - 1, r * rh, 2, rh)
    }
    ctx.fillStyle = joint
    ctx.fillRect(0, r * rh - 1, w, 2)
  }
}

function spacedText(ctx: Ctx, text: string, cx: number, cy: number, maxW: number, size: number, fill: string, edge: string | null) {
  ctx.font = `600 ${size}px Georgia, 'Times New Roman', 'DejaVu Serif', serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const chars = [...text]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const natural = widths.reduce((a, b) => a + b, 0)
  let gap = size * 0.42
  let scale = 1
  const total = natural + gap * (chars.length - 1)
  if (total > maxW) { scale = maxW / total; gap *= scale }
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, 1)
  let x = -(natural + (gap / scale) * (chars.length - 1)) / 2
  for (let i = 0; i < chars.length; i++) {
    const px = x + widths[i] / 2
    if (edge) { ctx.fillStyle = edge; ctx.fillText(chars[i], px - 1.5, -1.5) }
    ctx.fillStyle = fill
    ctx.fillText(chars[i], px, 0)
    x += widths[i] + gap / scale
  }
  ctx.restore()
}

function star(ctx: Ctx, cx: number, cy: number, points: number, r0: number, r1: number, rot = 0) {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i / (points * 2)) * Math.PI * 2
    const r = i % 2 ? r1 : r0
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function petal(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, fill: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(wid, -len * 0.45, 0, -len)
  ctx.quadraticCurveTo(-wid, -len * 0.45, 0, 0)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.restore()
}

function tileGrid(ctx: Ctx, w: number, h: number, step: number, alpha: number) {
  ctx.strokeStyle = `rgba(10,20,30,${alpha})`
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
  for (let y = 0; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
  ctx.stroke()
}

interface PaintCtx {
  ctx: Ctx
  rnd: Rnd
  name: string
  /** accent colour as css */
  A: (hex: string) => string
  /** stone colour as css */
  S: (hex: string) => string
}

// ---------------------------------------------------------------- Kosmonavtlar

const K_GRAD: [number, string][] = [[0, '#0a1348'], [0.22, '#132c8c'], [0.42, '#1f55b4'], [0.6, '#3f93cf'], [0.8, '#9ccde2'], [1, '#e9f0ea']]
const K_BAND = '#63bcdc'
function kGrad(t: number, A: (h: string) => string): string {
  const tt = Math.min(1, Math.max(0, t))
  for (let i = 1; i < K_GRAD.length; i++) {
    if (tt <= K_GRAD[i][0]) {
      const a = K_GRAD[i - 1], b = K_GRAD[i]
      return A(lerpHex(a[1], b[1], (tt - a[0]) / (b[0] - a[0])))
    }
  }
  return A(K_GRAD[K_GRAD.length - 1][1])
}

function kStrips(p: PaintCtx, w: number, h: number, rows: number, tAt: (row: number, x: number) => number | null) {
  const { ctx, rnd } = p
  const rh = h / rows
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 60
    while (x < w) {
      const len = 46 + rnd() * 110
      const t = tAt(r, x + len / 2)
      ctx.fillStyle = t === null ? p.A(K_BAND) : kGrad(t + (rnd() - 0.5) * 0.035, p.A)
      ctx.fillRect(x, r * rh, len, rh)
      ctx.fillStyle = 'rgba(0,0,10,0.35)'
      ctx.fillRect(x, r * rh, 1, rh)
      x += len
    }
    // glazed strip: light catches the upper edge, the joint below is dark
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(0, r * rh + 1, w, 2)
    ctx.fillStyle = 'rgba(0,0,20,0.42)'
    ctx.fillRect(0, (r + 1) * rh - 1.5, w, 1.5)
  }
}

function paintKosmonavtlar(p: PaintCtx) {
  const { ctx, rnd } = p
  region(ctx, REG.wall, (w, h) => {
    const rows = 46
    kStrips(p, w, h, rows, (r, x) => {
      const t = r / (rows - 1)
      if (t > 0.455 && t < 0.61) return null
      // the dark glaze runs down in uneven tongues, as on the real wall (periods divide the width)
      const k = (Math.PI * 2) / w
      const wob = Math.sin(x * k * 3 + 1.3) * 0.5 + Math.sin(x * k * 7 + 0.4) * 0.3 + Math.sin(x * k * 13) * 0.2
      const bell = Math.sin(Math.PI * t)
      return t + wob * 0.09 * bell
    })
  })
  region(ctx, REG.sign, (w, h) => {
    kStrips(p, w, h, 8, () => null)
    spacedText(ctx, p.name.toUpperCase(), w / 2, h / 2 + 2, w - 60, 70, '#33251a', 'rgba(255,240,210,0.6)')
  })
  // four medallions
  region(ctx, REG.feat, () => {
    for (let i = 0; i < 4; i++) {
      const ox = (i % 2) * 256, oy = Math.floor(i / 2) * 256
      ctx.save()
      ctx.translate(ox + 128, oy + 128)
      ctx.fillStyle = p.A('#1b3f9c')
      ctx.fillRect(-128, -128, 256, 256)
      const ringCols = ['#9fc8ec', '#5f97dc', '#2f63c4', '#1b3f9c', '#7fb2e6', '#2a56b6']
      for (let k = 0; k < ringCols.length; k++) {
        ctx.beginPath()
        ctx.arc(0, 0, 127 - k * 7, 0, Math.PI * 2)
        ctx.fillStyle = p.A(ringCols[k])
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,30,0.35)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      const g = ctx.createRadialGradient(-20, -26, 6, 0, 0, 86)
      g.addColorStop(0, '#5d6f76')
      g.addColorStop(1, '#232d36')
      ctx.beginPath()
      ctx.arc(0, 0, 84, 0, Math.PI * 2)
      ctx.fillStyle = g
      ctx.fill()
      ctx.save()
      ctx.clip()
      const hi = '#b4c2c4', mid = '#7c8d92'
      ctx.lineCap = 'round'
      // stars on every relief
      for (let s = 0; s < 14; s++) {
        ctx.fillStyle = `rgba(200,215,220,${0.3 + rnd() * 0.5})`
        const a = rnd() * 6.28, r = 30 + rnd() * 50
        ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2, 2)
      }
      if (i === 0) {
        // helmeted figure
        ctx.fillStyle = mid
        ctx.beginPath(); ctx.ellipse(0, 78, 62, 44, 0, Math.PI, 0); ctx.fill()
        ctx.fillStyle = hi
        ctx.beginPath(); ctx.arc(0, -6, 36, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#26323a'
        ctx.beginPath(); ctx.ellipse(0, -8, 23, 17, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(150,175,185,0.55)'
        ctx.beginPath(); ctx.ellipse(-7, -12, 9, 5, -0.5, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(190,210,215,0.7)'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(-4, -8, 16, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke()
        ctx.strokeStyle = hi; ctx.lineWidth = 5
        ctx.beginPath(); ctx.ellipse(0, 34, 26, 7, 0, 0, Math.PI * 2); ctx.stroke()
      } else if (i === 1) {
        // rocket and its trail
        ctx.rotate(0.6)
        ctx.strokeStyle = mid; ctx.lineWidth = 9
        ctx.beginPath(); ctx.moveTo(0, 30); ctx.quadraticCurveTo(-18, 70, -50, 96); ctx.stroke()
        ctx.fillStyle = hi
        ctx.beginPath(); ctx.moveTo(0, -62); ctx.quadraticCurveTo(17, -30, 13, 30); ctx.lineTo(-13, 30); ctx.quadraticCurveTo(-17, -30, 0, -62); ctx.fill()
        ctx.fillStyle = mid
        ctx.beginPath(); ctx.moveTo(13, 6); ctx.lineTo(30, 36); ctx.lineTo(13, 30); ctx.fill()
        ctx.beginPath(); ctx.moveTo(-13, 6); ctx.lineTo(-30, 36); ctx.lineTo(-13, 30); ctx.fill()
        ctx.fillStyle = '#26323a'
        ctx.beginPath(); ctx.arc(0, -24, 6, 0, Math.PI * 2); ctx.fill()
      } else if (i === 2) {
        // planet, ring, small satellite
        ctx.fillStyle = mid
        ctx.beginPath(); ctx.arc(-8, 10, 34, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = hi; ctx.lineWidth = 4
        ctx.beginPath(); ctx.ellipse(-8, 10, 62, 16, -0.4, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = hi
        ctx.fillRect(34, -52, 12, 12)
        ctx.fillRect(18, -49, 14, 6)
        ctx.fillRect(48, -49, 14, 6)
      } else {
        // sun, crescent and a comet
        ctx.fillStyle = hi
        star(ctx, -22, 14, 12, 34, 20)
        ctx.fill()
        ctx.fillStyle = mid
        ctx.beginPath(); ctx.arc(-22, 14, 15, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = hi
        ctx.beginPath(); ctx.arc(40, -34, 17, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#313d45'
        ctx.beginPath(); ctx.arc(47, -38, 15, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = mid; ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(-62, -46); ctx.lineTo(-28, -60); ctx.stroke()
      }
      ctx.restore()
      ctx.strokeStyle = 'rgba(150,165,170,0.8)'
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(0, 0, 84, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
  })
  // nave ceiling: night sky with a band of dense stars
  region(ctx, REG.ceil, (w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, p.A('#080d2c'))
    g.addColorStop(0.5, p.A('#14236a'))
    g.addColorStop(1, p.A('#080d2c'))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = h / 2 + (rnd() + rnd() - 1) * h * 0.2, r = 18 + rnd() * 50
      const gg = ctx.createRadialGradient(x, y, 0, x, y, r)
      gg.addColorStop(0, 'rgba(150,180,255,0.1)')
      gg.addColorStop(1, 'rgba(150,180,255,0)')
      ctx.fillStyle = gg
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    for (let i = 0; i < 620; i++) {
      const band = rnd() < 0.6
      const x = rnd() * w, y = band ? h / 2 + (rnd() + rnd() - 1) * h * 0.22 : rnd() * h
      ctx.fillStyle = `rgba(${220 + rnd() * 35},${225 + rnd() * 30},255,${0.35 + rnd() * 0.65})`
      const s = rnd() < 0.08 ? 3 : rnd() < 0.3 ? 2 : 1.2
      ctx.fillRect(x, y, s, s)
    }
    ctx.strokeStyle = 'rgba(235,240,255,0.9)'
    ctx.lineWidth = 1.2
    for (let i = 0; i < 16; i++) {
      const x = 20 + rnd() * (w - 40), y = 20 + rnd() * (h - 40), s = 5 + rnd() * 6
      ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke()
    }
  })
  // glass-clad column face: one dark pane between two metal trims
  region(ctx, REG.col, (w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0)
    g.addColorStop(0, p.A('#0a2028'))
    g.addColorStop(0.3, p.A('#16454f'))
    g.addColorStop(0.42, p.A('#2c7078'))
    g.addColorStop(0.5, p.A('#143f49'))
    g.addColorStop(1, p.A('#081a21'))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(190,240,236,0.22)'
    ctx.fillRect(w * 0.38, 0, 5, h)
    for (let y = 0; y < h; y += 170) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, y, w, 3)
      ctx.fillStyle = 'rgba(160,200,200,0.25)'
      ctx.fillRect(0, y + 3, w, 1.5)
    }
    ctx.fillStyle = '#6f7c82'
    ctx.fillRect(0, 0, 9, h)
    ctx.fillRect(w - 9, 0, 9, h)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(9, 0, 2, h)
    ctx.fillRect(w - 11, 0, 2, h)
  })
  region(ctx, REG.floor, (w, h) => {
    ctx.fillStyle = p.S('#63666b')
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = p.S('#7b7f84')
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4); ctx.fillRect(-120, -120, 240, 240); ctx.restore()
    ctx.fillStyle = p.S('#2c2e34')
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) ctx.fillRect(x - 60, y - 60, 120, 120)
    ctx.fillRect(0, -5, w, 10); ctx.fillRect(0, h - 5, w, 10); ctx.fillRect(-5, 0, 10, h); ctx.fillRect(w - 5, 0, 10, h)
    speckle(ctx, w, h, rnd, 5200, ['#2a2c30', '#c9cbcd', '#5d6066'], 0.35)
  })
  // end wall mosaic: orbits around a blue planet
  region(ctx, REG.misc, (w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, p.A('#0a1348'))
    g.addColorStop(1, p.A('#1f55b4'))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(230,235,255,${0.3 + rnd() * 0.6})`
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2)
    }
    ctx.lineWidth = 6
    const rings = ['#9fc8ec', '#5f97dc', '#e9f0ea', '#63bcdc']
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = p.A(rings[i])
      ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 90 + i * 44, 40 + i * 30, -0.35, 0, Math.PI * 2); ctx.stroke()
    }
    const pg = ctx.createRadialGradient(w / 2 - 20, h / 2 - 22, 4, w / 2, h / 2, 64)
    pg.addColorStop(0, p.A('#cfeaf4'))
    pg.addColorStop(1, p.A('#2f63c4'))
    ctx.fillStyle = pg
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 62, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#e9e2c8'
    for (const [x, y] of [[92, 150], [410, 360], [372, 108]]) { ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill() }
    tileGrid(ctx, w, h, 16, 0.3)
  })
  region(ctx, REG.stone, (w, h) => {
    ctx.fillStyle = p.S('#9a9da0')
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, rnd, 1500, ['#3a3c40', '#d2d4d6'], 0.3)
  })
}

// ---------------------------------------------------------------- Alisher Navoiy

function navoiPanel(p: PaintCtx, w: number, h: number, scene: boolean) {
  const { ctx, rnd } = p
  const archPath = (inset: number) => {
    const x0 = w * 0.09 + inset, x1 = w * 0.91 - inset, yb = h * 0.96 - inset, ys = h * 0.5, ya = h * 0.05 + inset
    ctx.beginPath()
    ctx.moveTo(x0, yb)
    ctx.lineTo(x0, ys)
    ctx.quadraticCurveTo(x0, ya + (ys - ya) * 0.28, w / 2, ya)
    ctx.quadraticCurveTo(x1, ya + (ys - ya) * 0.28, x1, ys)
    ctx.lineTo(x1, yb)
    ctx.closePath()
  }
  archPath(0)
  ctx.fillStyle = '#efe8d8'
  ctx.fill()
  archPath(14)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, p.A(scene ? '#0d2f6e' : '#0e6f78'))
  g.addColorStop(1, p.A(scene ? '#167f86' : '#12488a'))
  ctx.fillStyle = g
  ctx.fill()
  ctx.save()
  archPath(14)
  ctx.clip()
  const cx = w / 2
  if (scene) {
    // garden at night: moon, cypresses, a domed pavilion, flowers
    for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(240,240,220,${0.3 + rnd() * 0.6})`; ctx.fillRect(rnd() * w, rnd() * h * 0.6, 2, 2) }
    ctx.fillStyle = '#f0e6c0'
    ctx.beginPath(); ctx.arc(cx + 86, h * 0.26, 30, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = p.A('#0f3a74')
    ctx.beginPath(); ctx.arc(cx + 98, h * 0.245, 27, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = p.A('#0a5a50')
    for (const x of [cx - 150, cx - 104, cx + 150]) {
      ctx.beginPath(); ctx.moveTo(x, h * 0.88); ctx.quadraticCurveTo(x - 26, h * 0.6, x, h * 0.3); ctx.quadraticCurveTo(x + 26, h * 0.6, x, h * 0.88); ctx.fill()
    }
    ctx.fillStyle = '#e9e2cf'
    ctx.fillRect(cx - 62, h * 0.6, 124, h * 0.28)
    ctx.fillStyle = p.A('#2fa3a8')
    ctx.beginPath(); ctx.ellipse(cx, h * 0.6, 50, 56, 0, Math.PI, 0); ctx.fill()
    ctx.fillStyle = p.A('#0d2f6e')
    ctx.beginPath(); ctx.moveTo(cx - 20, h * 0.88); ctx.lineTo(cx - 20, h * 0.72); ctx.quadraticCurveTo(cx, h * 0.64, cx + 20, h * 0.72); ctx.lineTo(cx + 20, h * 0.88); ctx.fill()
    for (let i = 0; i < 26; i++) {
      const x = w * 0.14 + rnd() * w * 0.72, y = h * (0.88 + rnd() * 0.06)
      ctx.fillStyle = ['#e9e2cf', '#d9b24c', '#d97a6a'][i % 3]
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    // islimi: a stem with mirrored scrolls, leaves and rosettes
    ctx.strokeStyle = '#efe8d8'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(cx, h * 0.93); ctx.lineTo(cx, h * 0.14); ctx.stroke()
    for (let i = 0; i < 6; i++) {
      const y = h * (0.86 - i * 0.125)
      const reach = (w * 0.3) * (1 - i * 0.1)
      for (const s of [-1, 1]) {
        ctx.strokeStyle = '#efe8d8'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(cx, y)
        ctx.bezierCurveTo(cx + s * reach * 0.5, y - 6, cx + s * reach, y - 30, cx + s * reach * 0.82, y - 58)
        ctx.bezierCurveTo(cx + s * reach * 0.66, y - 78, cx + s * reach * 0.42, y - 60, cx + s * reach * 0.56, y - 42)
        ctx.stroke()
        petal(ctx, cx + s * reach * 0.5, y - 12, 34, 12, s * 1.1, p.A('#8fd6cf'))
        petal(ctx, cx + s * reach * 0.86, y - 50, 28, 11, s * -0.5, '#d9b24c')
        ctx.fillStyle = '#efe8d8'
        ctx.beginPath(); ctx.arc(cx + s * reach * 0.56, y - 44, 7, 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.fillStyle = '#d9b24c'
    star(ctx, cx, h * 0.52, 8, 40, 22, Math.PI / 8); ctx.fill()
    ctx.fillStyle = p.A('#0d2f6e')
    star(ctx, cx, h * 0.52, 8, 25, 13, 0); ctx.fill()
    ctx.fillStyle = '#efe8d8'
    ctx.beginPath(); ctx.arc(cx, h * 0.52, 6, 0, Math.PI * 2); ctx.fill()
  }
  tileGrid(ctx, w, h, 32, 0.22)
  ctx.restore()
  archPath(14)
  ctx.strokeStyle = p.A('#0a3f52')
  ctx.lineWidth = 3
  ctx.stroke()
}

function paintNavoiy(p: PaintCtx) {
  const { ctx, rnd } = p
  const stoneTones = ['#b7ab98', '#c2b6a2', '#aca08e', '#bdae9c', '#b3a593']
  region(ctx, REG.wall, (w, h) => {
    blocks(ctx, w, h, 8, rnd, stoneTones.map(p.S), 'rgba(60,50,40,0.45)')
    marble(ctx, w, h, rnd, '#6d5f50', 0.9)
  })
  region(ctx, REG.feat, (w, h) => {
    ctx.fillStyle = p.S('#b7ab98')
    ctx.fillRect(0, 0, w, h)
    marble(ctx, w, h, rnd, '#6d5f50', 0.6)
    navoiPanel(p, w, h, false)
  })
  region(ctx, REG.misc, (w, h) => {
    ctx.fillStyle = p.S('#b7ab98')
    ctx.fillRect(0, 0, w, h)
    marble(ctx, w, h, rnd, '#6d5f50', 0.6)
    navoiPanel(p, w, h, true)
  })
  // dome: white ground, star net, rings of flowers
  region(ctx, REG.ceil, (w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2 - 4
    ctx.fillStyle = '#f1efe6'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = p.A('#5f8f9c')
    ctx.lineWidth = 2
    for (const [skip, r] of [[5, 0.97], [3, 0.6]] as const) {
      ctx.beginPath()
      for (let i = 0; i <= 16; i++) {
        const a = ((i * skip) / 16) * Math.PI * 2
        const x = cx + Math.cos(a) * R * r, y = cy + Math.sin(a) * R * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.beginPath()
    for (let i = 0; i <= 16; i++) {
      const a = ((i * 7) / 16) * Math.PI * 2
      const x = cx + Math.cos(a) * R * 0.97, y = cy + Math.sin(a) * R * 0.97
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    const rowsOf: [number, number, number, number, string[]][] = [
      [0.86, 16, 34, 0, ['#1f6f78', '#27458f']],
      [0.7, 16, 28, 0.5, ['#27458f', '#7a3f8c']],
      [0.53, 16, 27, 0, ['#2f8f6a', '#1f6f78']],
      [0.35, 8, 26, 0.5, ['#27458f', '#2f8f6a']],
    ]
    for (const [rr, n, size, phase, cols] of rowsOf) {
      for (let i = 0; i < n; i++) {
        const a = ((i + phase) / n) * Math.PI * 2
        const x = cx + Math.cos(a) * R * rr, y = cy + Math.sin(a) * R * rr
        const out = a + Math.PI / 2
        ctx.strokeStyle = p.A('#2f8f6a')
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(a) * size * 1.2, y - Math.sin(a) * size * 1.2); ctx.stroke()
        petal(ctx, x, y, size * 1.2, size * 0.58, out, p.A(cols[i % 2]))
        petal(ctx, x, y, size * 0.8, size * 0.36, out + 0.7, p.A(cols[(i + 1) % 2]))
        petal(ctx, x, y, size * 0.8, size * 0.36, out - 0.7, p.A(cols[(i + 1) % 2]))
        petal(ctx, x, y, size * 0.95, size * 0.42, out + 2.2, p.A('#2f8f6a'))
        petal(ctx, x, y, size * 0.95, size * 0.42, out - 2.2, p.A('#2f8f6a'))
        ctx.fillStyle = i % 2 ? '#c9566a' : '#d9b24c'
        ctx.beginPath(); ctx.arc(x, y, size * 0.22, 0, Math.PI * 2); ctx.fill()
      }
    }
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      ctx.fillStyle = p.A(i % 2 ? '#27458f' : '#2f8f6a')
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.945, cy + Math.sin(a) * R * 0.945, 4, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = p.A('#27458f')
    star(ctx, cx, cy, 16, R * 0.2, R * 0.09); ctx.fill()
    ctx.fillStyle = '#d9b24c'
    star(ctx, cx, cy, 8, R * 0.1, R * 0.05, 0.2); ctx.fill()
    ctx.strokeStyle = p.A('#1f6f78')
    ctx.lineWidth = 12
    ctx.beginPath(); ctx.arc(cx, cy, R - 6, 0, Math.PI * 2); ctx.stroke()
  })
  region(ctx, REG.col, (w, h) => {
    blocks(ctx, w, h, 5, rnd, ['#b6b5ae', '#aeada6', '#bdbcb4'].map(p.S), 'rgba(50,50,50,0.4)')
    marble(ctx, w, h, rnd, '#55585c', 0.6)
  })
  region(ctx, REG.floor, (w, h) => {
    ctx.fillStyle = p.S('#6b3d31')
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, rnd, 4200, ['#2d1712', '#a06a58', '#4a2a22'], 0.4)
    const starAt = (x: number, y: number, r: number) => {
      ctx.fillStyle = '#2b2422'
      star(ctx, x, y, 8, r + 9, (r + 9) * 0.76, Math.PI / 8); ctx.fill()
      ctx.fillStyle = p.S('#8d8a84')
      star(ctx, x, y, 8, r, r * 0.76, Math.PI / 8); ctx.fill()
    }
    starAt(w / 2, h / 2, 112)
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) starAt(x, y, 54)
    speckle(ctx, w, h, rnd, 2200, ['#6d6a64', '#d6d3cc'], 0.25)
  })
  region(ctx, REG.sign, (w, h) => {
    ctx.fillStyle = p.A('#12404a')
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#d8cfb8'
    ctx.lineWidth = 4
    ctx.strokeRect(8, 8, w - 16, h - 16)
    spacedText(ctx, p.name.toUpperCase(), w / 2, h / 2 + 2, w - 90, 58, '#efe8d8', null)
  })
  region(ctx, REG.stone, (w, h) => {
    ctx.fillStyle = p.S('#b6b5ae')
    ctx.fillRect(0, 0, w, h)
    marble(ctx, w, h, rnd, '#55585c', 0.8)
  })
}

// ---------------------------------------------------------------- Mustaqillik maydoni

function paintMustaqillik(p: PaintCtx) {
  const { ctx, rnd } = p
  region(ctx, REG.wall, (w, h) => {
    blocks(ctx, w, h, 6, rnd, ['#c4beb4', '#c6bba8', '#c0aea4', '#aea498', '#bbb4aa', '#cbc3b6', '#b9b0a4'].map(p.S), 'rgba(70,60,50,0.4)')
    marble(ctx, w, h, rnd, '#7a6a5c', 1.2)
  })
  // carved plaster (ganch) lattice; tiles in both directions with a period of 256 px
  region(ctx, REG.feat, (w, h) => {
    ctx.fillStyle = '#e4e0d6'
    ctx.fillRect(0, 0, w, h)
    const draw = (dx: number, dy: number, stroke: string, lw: number) => {
      ctx.strokeStyle = stroke
      ctx.lineWidth = lw
      for (let gx = 0; gx <= 4; gx++) {
        for (let gy = 0; gy <= 4; gy++) {
          const x = gx * 128 + dx, y = gy * 128 + dy
          star(ctx, x, y, 8, 52, 30, Math.PI / 8); ctx.stroke()
          star(ctx, x, y, 8, 24, 12, 0); ctx.stroke()
          star(ctx, x + 64, y + 64, 4, 34, 15, Math.PI / 4); ctx.stroke()
          ctx.beginPath(); ctx.arc(x + 64, y + 64, 7, 0, Math.PI * 2); ctx.stroke()
        }
      }
    }
    draw(2, 2, 'rgba(120,112,98,0.6)', 3.5)
    draw(-1.2, -1.2, 'rgba(255,255,255,0.95)', 3)
    draw(0, 0, '#d8d3c8', 2)
  })
  // shallow dome: white bowl with fine ribs and a bead ring
  region(ctx, REG.ceil, (w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2
    ctx.fillStyle = '#e6e1d6'
    ctx.fillRect(0, 0, w, h)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
    g.addColorStop(0, '#fffdf6')
    g.addColorStop(0.7, '#f4f0e6')
    g.addColorStop(1, '#dcd6c8')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(120,110,95,0.12)'
    ctx.lineWidth = 2
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2); ctx.lineTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86); ctx.stroke()
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      ctx.fillStyle = 'rgba(150,140,122,0.55)'
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9, 5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.strokeStyle = 'rgba(130,120,104,0.6)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.955, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.2, 0, Math.PI * 2); ctx.stroke()
  })
  region(ctx, REG.col, (w, h) => {
    ctx.fillStyle = p.S('#cfccc5')
    ctx.fillRect(0, 0, w, h)
    marble(ctx, w, h, rnd, '#6c7076', 0.6)
    ctx.fillStyle = 'rgba(70,70,70,0.35)'
    ctx.fillRect(w / 2 - 1, 0, 2, h)
    for (let y = 0; y < h; y += h / 4) ctx.fillRect(0, y, w, 2)
    ctx.fillRect(0, 0, 2, h)
  })
  region(ctx, REG.floor, (w, h) => {
    ctx.fillStyle = p.S('#807d77')
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = p.S('#6f3b2c')
    star(ctx, w / 2, h / 2, 4, 236, 236 * 0.92, Math.PI / 8); ctx.fill()
    ctx.fillStyle = p.S('#807d77')
    star(ctx, w / 2, h / 2, 4, 120, 120 * 0.76, 0); ctx.fill()
    ctx.fillStyle = p.S('#6f3b2c')
    star(ctx, w / 2, h / 2, 4, 60, 60 * 0.76, Math.PI / 4); ctx.fill()
    ctx.fillStyle = '#39302c'
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-44, -44, 88, 88); ctx.restore() }
    speckle(ctx, w, h, rnd, 5200, ['#3a2a25', '#d3cfc8', '#6d655e'], 0.33)
  })
  region(ctx, REG.misc, (w, h) => {
    ctx.fillStyle = p.S('#d6d2c9')
    ctx.fillRect(0, 0, w, h)
    marble(ctx, w, h, rnd, '#6c7076', 1)
    const cx = w / 2, cy = h / 2
    ctx.strokeStyle = p.A('#2c7f95')
    ctx.lineWidth = 14
    ctx.beginPath(); ctx.arc(cx, cy, 206, 0, Math.PI * 2); ctx.stroke()
    for (const [dx, stroke] of [[3, 'rgba(110,104,92,0.8)'], [-2, 'rgba(255,255,255,0.95)'], [0, '#cfcabd']] as const) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = 6
      star(ctx, cx + dx, cy + dx, 12, 184, 108, 0); ctx.stroke()
      star(ctx, cx + dx, cy + dx, 12, 108, 60, Math.PI / 12); ctx.stroke()
      star(ctx, cx + dx, cy + dx, 6, 60, 28, 0); ctx.stroke()
    }
    ctx.fillStyle = p.A('#2c7f95')
    ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fill()
  })
  region(ctx, REG.sign, (w, h) => {
    ctx.fillStyle = p.S('#d9d4ca')
    ctx.fillRect(0, 0, w, h)
    marble(ctx, w, h, rnd, '#6c7076', 0.6)
    ctx.strokeStyle = 'rgba(80,70,60,0.5)'
    ctx.lineWidth = 3
    ctx.strokeRect(6, 6, w - 12, h - 12)
    spacedText(ctx, p.name.toUpperCase(), w / 2, h / 2 + 2, w - 90, 58, '#3d2f24', 'rgba(255,255,255,0.7)')
  })
  region(ctx, REG.stone, (w, h) => {
    ctx.fillStyle = p.S('#cfccc5')
    ctx.fillRect(0, 0, w, h)
    marble(ctx, w, h, rnd, '#6c7076', 1)
  })
}

// ---------------------------------------------------------------- atlas

export function createAtlas(design: DesignId, variant: Variant, name: string, seed: number, maxAnisotropy: number): Atlas {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas is not available')
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, W, H)
  const A = (hex: string) => css(shift(hex, variant.accentHue, variant.accentSat, variant.accentLight))
  const S = (hex: string) => css(shift(hex, variant.stoneHue, variant.stoneSat, 1))
  const p: PaintCtx = { ctx, rnd: rng(seed), name, A, S }
  if (design === 'kosmonavtlar') paintKosmonavtlar(p)
  else if (design === 'navoiy') paintNavoiy(p)
  else paintMustaqillik(p)

  region(ctx, REG.white, (w, h) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h) })
  region(ctx, REG.exit, (w, h) => {
    ctx.fillStyle = '#16323f'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#e8eef0'
    ctx.lineWidth = 3
    ctx.strokeRect(5, 5, w - 10, h - 10)
    spacedText(ctx, 'CHIQISH', w / 2 + 40, h / 2 + 2, w - 170, 46, '#f2f5f5', null)
    ctx.strokeStyle = '#f2f5f5'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(52, 70); ctx.lineTo(52, 26); ctx.moveTo(34, 44); ctx.lineTo(52, 26); ctx.lineTo(70, 44); ctx.stroke()
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = Math.min(4, maxAnisotropy)
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true

  const uv = {} as Record<Region, UVR>
  for (const k of Object.keys(REG) as Region[]) uv[k] = uvOf(REG[k], k === 'white' ? 16 : 1.5)
  const lightCol = new THREE.Color(variant.light)
  const lin = (c: THREE.Color, k: number): RGB => [c.r * k, c.g * k, c.b * k]
  return {
    texture,
    uv,
    featQuarter(i: number): UVR {
      const r = REG.feat
      return uvOf([r[0] + (i % 2) * 256, r[1] + Math.floor(i / 2) * 256, 256, 256], 2)
    },
    accent: (hex, k = 1) => lin(shift(hex, variant.accentHue, variant.accentSat, variant.accentLight).clone(), k),
    stone: (hex, k = 1) => lin(shift(hex, variant.stoneHue, variant.stoneSat, 1).clone(), k),
    light: (k) => [lightCol.r * k, lightCol.g * k, lightCol.b * k],
  }
}
