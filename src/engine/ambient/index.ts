import type * as THREE from 'three'
import type { Environment } from '../env/Environment'
import type { TileManager } from '../world/TileManager'
import type { Player } from '../player/Player'

/** What an ambient system gets every frame. */
export interface EngineContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  env: Environment
  tiles: TileManager
  player: Player
  /** seconds since start */
  time: number
}

/**
 * Ambient systems (cars, people, birds, street lights, ...) implement this and are
 * registered with engine.addSystem(). See docs/ENGINE.md.
 */
export interface AmbientSystem {
  id: string
  init?(ctx: EngineContext): void
  update(dt: number, ctx: EngineContext): void
  dispose?(): void
}
