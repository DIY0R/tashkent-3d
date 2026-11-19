import * as THREE from 'three'
import type { EngineContext } from './index'

/**
 * The point the ambient systems populate around: the player, or the spot a scripted camera
 * (start screen, tour) looks at when it is far away from the player.
 */
export const focus = { x: 0, z: 0, fly: false, alt: 0 }

const fwd = new THREE.Vector3()

export function updateFocus(ctx: EngineContext) {
  const p = ctx.player.position, c = ctx.camera.position
  const away = Math.hypot(c.x - p.x, c.z - p.z) > 160 || c.y - p.y > 160
  focus.fly = away || ctx.player.mode === 'fly'
  focus.alt = c.y
  if (!focus.fly) {
    focus.x = p.x
    focus.z = p.z
    return
  }
  // from the air (or a scripted camera): populate the ground the camera looks at
  ctx.camera.getWorldDirection(fwd)
  const reach = fwd.y < -0.05 ? Math.min(900, c.y / -fwd.y) : 500
  const tx = c.x + fwd.x * reach, tz = c.z + fwd.z * reach
  // move in steps so the systems do not rescan on every small camera turn
  if (Math.hypot(tx - focus.x, tz - focus.z) > 60) {
    focus.x = tx
    focus.z = tz
  }
}

/** Radius (m) to populate in fly mode: grows with altitude up to `max`. */
export function flyRadius(max: number): number {
  return Math.min(max, 260 + focus.alt * 2.2)
}
