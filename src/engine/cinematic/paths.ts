import * as THREE from 'three'
import { CameraPath, type PathKey } from './CameraPath'
import { LANDMARK_INFO } from './landmarkInfo'

/**
 * Clock used behind the start screen: sun about 9 degrees above the horizon in the west-north-west.
 * Shots are composed for this light: the camera stays west or north of what it looks at.
 */
export const GOLDEN_HOUR = 18.3

/** meters per second along the start-screen loop */
export const BACKDROP_SPEED = 24

// local meters used when an id is missing from content/landmarks.json
const FALLBACK: Record<string, [number, number]> = {
  'amir-temur-square': [8, -11], 'hotel-uzbekistan': [258, -31], 'tv-tower': [432, -3826], 'minor-mosque': [-374, -2695],
  'hazrati-imam': [-3308, -2890], 'chorsu-bazaar': [-3725, -1736], 'nest-one': [-2317, -109], 'navoi-theatre': [-681, 206],
  'kukeldash-madrasah': [-3629, -1364],
}

/** Point `dx` east and `dz` south of a landmark at height y. */
function at(id: string, dx: number, y: number, dz: number): [number, number, number] {
  const l = LANDMARK_INFO.get(id)
  const [x, z] = l ? [l.x, l.z] : FALLBACK[id] ?? [0, 0]
  return [x + dx, y, z + dz]
}

/**
 * Start-screen loop, about 16 km (11 minutes), clockwise seen from above:
 * Amir Temur Square -> north to the TV tower -> west past Minor mosque to Hazrati Imam ->
 * south over Chorsu and Kukeldash to Tashkent City -> east past the Navoi theatre.
 */
export function backdropPath(): CameraPath {
  const sq = 'amir-temur-square', tv = 'tv-tower', mn = 'minor-mosque', hi = 'hazrati-imam', ch = 'chorsu-bazaar'
  const kk = 'kukeldash-madrasah', no = 'nest-one', nv = 'navoi-theatre'
  const keys: PathKey[] = [
    // the square and Hotel Uzbekistan across the park, lit from behind the camera
    { p: at(sq, -170, 80, 150), t: at(sq, 120, 28, -40), fov: 46 },
    { p: at(sq, -150, 100, -230), t: at(sq, 200, 35, -330), fov: 48 },
    // north over the centre, the tower ahead
    { p: at(sq, -150, 130, -800), t: at(tv, -30, 150, 1200), fov: 50 },
    { p: at(tv, -380, 170, 1700), t: at(tv, 0, 170, 0), fov: 50 },
    { p: at(tv, -560, 180, 780), t: at(tv, 0, 175, 0), fov: 48 },
    // round the west side of the tower
    { p: at(tv, -760, 170, 60), t: at(tv, 0, 185, 0), fov: 48 },
    // south past Minor mosque, on its sunlit side
    { p: at(mn, -330, 85, -220), t: at(mn, 0, 14, 0), fov: 48 },
    { p: at(mn, -330, 95, 300), t: at(mn, -200, 20, 900), fov: 50 },
    // west over the old city, the towers of Tashkent City far to the left
    { p: at(hi, 1500, 150, -60), t: at(hi, 500, 40, 900), fov: 52 },
    // Hazrati Imam: along its north side, then round the west
    { p: at(hi, 330, 95, -400), t: at(hi, 0, 22, 20), fov: 50 },
    { p: at(hi, -420, 100, -200), t: at(hi, 0, 22, 60), fov: 48 },
    // south: Chorsu dome, Kukeldash
    { p: at(ch, -380, 100, -150), t: at(ch, 0, 12, 0), fov: 48 },
    { p: at(ch, -330, 110, 600), t: at(kk, 0, 10, 0), fov: 50 },
    // Tashkent City: Nest One (266 m) from the west and south-west, kept high and well clear of the towers
    { p: at(no, -1350, 200, -650), t: at(no, 0, 130, 0), fov: 50 },
    { p: at(no, -850, 210, 220), t: at(no, 0, 140, 0), fov: 48 },
    { p: at(no, 50, 200, 760), t: at(no, 800, 50, -150), fov: 52 },
    // east to the Navoi theatre (it faces west) and back to the square
    { p: at(nv, -900, 150, 100), t: at(nv, 0, 15, 0), fov: 50 },
    { p: at(nv, -300, 110, -150), t: at(nv, 0, 12, 0), fov: 48 },
    // north of the 60 m apartment blocks west of the square, then down to the first key
    { p: at(sq, -430, 100, 60), t: at(sq, 60, 26, -30), fov: 47 },
  ]
  return new CameraPath(keys, true, 50)
}

/** Seconds of the opening move (eased; the dip to black around it is extra). */
export const INTRO_SECONDS = 9

/**
 * Opening move: about 330 m, from 125 m up behind the player's left shoulder down to the given end camera.
 * Keys are laid out in the frame of the end camera (right, up, back), so it works for any
 * position and heading. The last key IS the end camera: position and view direction match exactly.
 */
export function introPath(end: THREE.Vector3, forward: THREE.Vector3, endFov: number): CameraPath {
  const fh = new THREE.Vector3(forward.x, 0, forward.z)
  if (fh.lengthSq() < 1e-6) fh.set(0, 0, -1)
  fh.normalize()
  const right = new THREE.Vector3(-fh.z, 0, fh.x)
  const rel = (side: number, up: number, back: number): [number, number, number] => [
    end.x + right.x * side - fh.x * back,
    end.y + up,
    end.z + right.z * side - fh.z * back,
  ]
  const last = end.clone().addScaledVector(forward, 50)
  const keys: PathKey[] = [
    { p: rel(-150, 125, 290), t: rel(30, 24, -100), fov: 48 },
    { p: rel(-82, 84, 185), t: rel(15, 16, -85), fov: 48 },
    { p: rel(-16, 40, 92), t: rel(0, 8, -55), fov: 50 },
    { p: rel(6, 9.5, 34), t: rel(0, 1.5, -50), fov: 54 },
    { p: [end.x, end.y, end.z], t: [last.x, last.y, last.z], fov: endFov },
  ]
  return new CameraPath(keys, false, 50)
}
