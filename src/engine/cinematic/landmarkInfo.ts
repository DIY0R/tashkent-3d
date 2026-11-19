import { latLonToLocal } from '../geo'

/** What the camera needs to know about a landmark (content/landmarks.json). */
export interface LandmarkInfo {
  id: string
  x: number
  z: number
  /** clockwise from north, degrees; the model front faces this way */
  rotationDeg: number
  /** largest footprint side, meters */
  size: number
  height: number
}

const files = import.meta.glob<unknown>('/content/landmarks.json', { eager: true, import: 'default' })

function load(): Map<string, LandmarkInfo> {
  const out = new Map<string, LandmarkInfo>()
  const raw = Object.values(files)[0]
  const list: unknown = Array.isArray(raw) ? raw : (raw as { landmarks?: unknown } | undefined)?.landmarks
  if (!Array.isArray(list)) return out
  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item.id !== 'string') continue
    const pos = item.position as Record<string, unknown> | undefined
    const lat = Number(item.lat ?? pos?.lat)
    const lon = Number(item.lon ?? item.lng ?? pos?.lon ?? pos?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const model = item.model as { footprintM?: unknown; heightM?: unknown } | undefined
    const fp = Array.isArray(model?.footprintM) ? (model.footprintM as unknown[]).map(Number).filter(Number.isFinite) : []
    const { x, z } = latLonToLocal(lat, lon)
    out.set(item.id, {
      id: item.id, x, z,
      rotationDeg: Number(item.rotationDeg) || 0,
      size: fp.length ? Math.max(...fp) : 60,
      height: Number(model?.heightM) || 25,
    })
  }
  return out
}

export const LANDMARK_INFO = load()

/** Order used by playTour() when no ids are given: centre, Tashkent City, old city, north. */
export const DEFAULT_TOUR = [
  'amir-temur-square', 'hotel-uzbekistan', 'navoi-theatre', 'mustaqillik-square', 'nest-one',
  'kukeldash-madrasah', 'chorsu-bazaar', 'hazrati-imam', 'minor-mosque', 'tv-tower',
]
