/**
 * Coordinate contract (docs/BRIEF.md). Everyone uses this module.
 * Origin: Amir Temur Square. Local meters, three.js axes:
 * x = east, y = up, z = south (north is -z).
 */
export const LAT0 = 41.31108
export const LON0 = 69.27966
export const TILE_SIZE = 500

const DEG2RAD = Math.PI / 180
export const M_PER_DEG_LAT = 110574
export const M_PER_DEG_LON = 111320 * Math.cos(LAT0 * DEG2RAD)

export interface LocalXZ {
  x: number
  z: number
}

export function latLonToLocal(lat: number, lon: number): LocalXZ {
  return {
    x: (lon - LON0) * M_PER_DEG_LON,
    z: -(lat - LAT0) * M_PER_DEG_LAT,
  }
}

export function localToLatLon(x: number, z: number): { lat: number; lon: number } {
  return {
    lat: LAT0 - z / M_PER_DEG_LAT,
    lon: LON0 + x / M_PER_DEG_LON,
  }
}

export function tileCoord(v: number, tileSize = TILE_SIZE): number {
  return Math.floor(v / tileSize)
}

export function tileOf(x: number, z: number, tileSize = TILE_SIZE): { tx: number; tz: number } {
  return { tx: Math.floor(x / tileSize), tz: Math.floor(z / tileSize) }
}

/** Min corner of a tile in world meters. */
export function tileOrigin(tx: number, tz: number, tileSize = TILE_SIZE): LocalXZ {
  return { x: tx * tileSize, z: tz * tileSize }
}

export function tileKey(tx: number, tz: number): string {
  return `${tx}_${tz}`
}

/** Compass heading in degrees (0 = north, 90 = east) from a yaw where forward = (sin yaw, -cos yaw). */
export function yawToHeadingDeg(yaw: number): number {
  const d = (yaw / DEG2RAD) % 360
  return d < 0 ? d + 360 : d
}
