import { latLonToLocal } from '@/engine/geo'
import { nearestLabel } from '@/engine/query/mapData'
import { pick, translate } from '@/i18n'
import type { Language } from '@/state/store'

export interface LandmarkPhoto {
  file: string
  author: string
  license: string
  source: string
}

export interface Landmark {
  id: string
  category: string
  x: number
  z: number
  lat: number
  lon: number
  rotationDeg: number
  name: unknown
  short: unknown
  year: unknown
  facts: unknown[]
  photos: LandmarkPhoto[]
  /** footprint width/depth and height in meters when known */
  size: [number, number]
  height: number
}

// content/landmarks.json is written by the content agent; it may be missing or partial.
const files = import.meta.glob<unknown>('/content/landmarks.json', { eager: true, import: 'default' })

function load(): Landmark[] {
  const raw = Object.values(files)[0]
  const list: unknown = Array.isArray(raw) ? raw : (raw as { landmarks?: unknown } | undefined)?.landmarks
  if (!Array.isArray(list)) return []
  const out: Landmark[] = []
  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item.id !== 'string') continue
    const pos = item.position as Record<string, unknown> | undefined
    const lat = Number(item.lat ?? pos?.lat)
    const lon = Number(item.lon ?? item.lng ?? pos?.lon ?? pos?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !item.name) continue
    const { x, z } = latLonToLocal(lat, lon)
    const model = item.model as { footprintM?: unknown; heightM?: unknown } | undefined
    const fp = Array.isArray(model?.footprintM) ? (model.footprintM as unknown[]).map(Number) : []
    const photos: LandmarkPhoto[] = []
    if (Array.isArray(item.photos)) {
      for (const p of item.photos as Record<string, unknown>[]) {
        if (!p || typeof p.file !== 'string') continue
        photos.push({
          file: import.meta.env.BASE_URL + p.file.replace(/^\//, ''),
          author: typeof p.author === 'string' ? p.author : '',
          license: typeof p.license === 'string' ? p.license : '',
          source: typeof p.source === 'string' ? p.source : '',
        })
      }
    }
    out.push({
      id: item.id,
      category: typeof item.category === 'string' ? item.category : typeof item.kind === 'string' ? item.kind : 'other',
      x, z, lat, lon,
      rotationDeg: Number(item.rotationDeg) || 0,
      name: item.name,
      short: item.short ?? item.text ?? '',
      year: item.year ?? '',
      facts: Array.isArray(item.facts) ? item.facts : [],
      photos,
      size: [Number.isFinite(fp[0]) ? fp[0] : 30, Number.isFinite(fp[1]) ? fp[1] : 30],
      height: Number(model?.heightM) || 0,
    })
  }
  return out
}

export const LANDMARKS: Landmark[] = load()
const BY_ID = new Map(LANDMARKS.map((l) => [l.id, l]))

export function landmarkById(id: string | null): Landmark | null {
  return id ? BY_ID.get(id) ?? null : null
}

const KNOWN_KINDS = new Set(['religious', 'square', 'park', 'museum', 'theatre', 'market', 'modern', 'hotel', 'government', 'monument', 'tower'])
/** i18n key suffix for a category (falls back to "other"). */
export function kindOf(l: Landmark): string {
  return KNOWN_KINDS.has(l.category) ? l.category : 'other'
}

/** District name (from the global labels) for a point; empty until the labels are loaded. */
export function districtAt(lang: Language, x: number, z: number): string {
  const l = nearestLabel(x, z, ['district'])
  return l ? pick(lang, l.n) : ''
}

/** Year text: plain years and ranges only (they read the same in every language). */
export function yearText(l: Landmark): string {
  const y = l.year
  if (typeof y === 'number') return String(y)
  if (typeof y !== 'string' || !/^[\d\s–-]+$/.test(y)) return ''
  return y.trim().replace(/\s*-\s*/g, '–')
}

/** One row of the card's fact list: a label/value pair, or a plain sentence. */
export type FactRow = { label: string; value: string } | { text: string }

// facts that already state a date; with one of them the generic "year" row is left out
const DATED = new Set(['opened', 'built', 'founded', 'completed', 'named'])

/**
 * Facts of a landmark for the card (content/landmarks.json):
 *   { key, value }    label from the i18n key `fact.<key>`, the same in every language
 *   { label, value }  own label `{uz, ru, en}`
 *   { uz, ru, en }    a sentence, shown on a full row
 * `value` is `{uz, ru, en}` or a plain string when it reads the same everywhere.
 */
export function factRows(lang: Language, l: Landmark): { rows: FactRow[]; dated: boolean } {
  const rows: FactRow[] = []
  let dated = false
  for (const raw of l.facts) {
    if (!raw || typeof raw !== 'object') {
      if (typeof raw === 'string' && raw) rows.push({ text: pick(lang, raw) })
      continue
    }
    const f = raw as { key?: unknown; label?: unknown; value?: unknown }
    const value = f.value === undefined ? '' : pick(lang, typeof f.value === 'number' ? String(f.value) : f.value)
    const label = typeof f.key === 'string' ? translate(lang, `fact.${f.key}`) : pick(lang, f.label)
    if (value && label) {
      rows.push({ label, value })
      if (typeof f.key === 'string' && DATED.has(f.key)) dated = true
    } else {
      const text = pick(lang, raw)
      if (text) rows.push({ text })
    }
  }
  return { rows, dated }
}

/**
 * Where to put the player to look at a landmark: in front of it (model front = north turned
 * clockwise by rotationDeg), facing it. Walk: near the entrance; fly: higher and farther.
 */
export function viewpoint(l: Landmark, fly: boolean): { x: number; z: number; y?: number; heading: number } {
  const r = (l.rotationDeg * Math.PI) / 180
  const fx = Math.sin(r), fz = -Math.cos(r)
  const depth = Math.max(l.size[0], l.size[1]) * 0.5
  const h = l.height || 20
  const d = fly ? depth + Math.max(140, h * 1.1) : depth + Math.min(140, Math.max(25, h * 0.6))
  const heading = (((l.rotationDeg + 180) % 360) + 360) % 360
  return { x: l.x + fx * d, z: l.z + fz * d, y: fly ? Math.max(45, h * 0.55) : undefined, heading }
}
