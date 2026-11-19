import type { Quality } from '@/state/store'
import type { PostFXOptions } from './env/PostFX'

// Quality presets. Kept apart from Engine.ts so the UI can read them without pulling the
// engine (three.js) into the first chunk.

export interface QualityPreset {
  /** upper limit for devicePixelRatio */
  maxPixelRatio: number
  /** upper limit for rendered pixels (width x height): big or HiDPI screens are rendered smaller and upscaled */
  maxPixels: number
  /** 0 disables shadows */
  shadowMapSize: number
  shadowRadius: number
  post: PostFXOptions | null
  walkRadius: number
  flyRadius: number
  treeRadius: number
  treeNearRadius: number
  skylineRadius: number
  fogFar: number
  maxTiles: number
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: {
    maxPixelRatio: 0.85, maxPixels: 1.5e6, shadowMapSize: 1024, shadowRadius: 70, post: null,
    walkRadius: 800, flyRadius: 1600, treeRadius: 400, treeNearRadius: 60, skylineRadius: 5000, fogFar: 5000, maxTiles: 70,
  },
  medium: {
    maxPixelRatio: 1, maxPixels: 2.1e6, shadowMapSize: 2048, shadowRadius: 95, post: { bloom: true, smaa: true, vignette: true },
    walkRadius: 1200, flyRadius: 2400, treeRadius: 700, treeNearRadius: 120, skylineRadius: 7000, fogFar: 7000, maxTiles: 120,
  },
  high: {
    maxPixelRatio: 1.5, maxPixels: 3.7e6, shadowMapSize: 4096, shadowRadius: 120, post: { bloom: true, smaa: true, vignette: true },
    walkRadius: 1400, flyRadius: 3000, treeRadius: 1000, treeNearRadius: 250, skylineRadius: 9000, fogFar: 9000, maxTiles: 180,
  },
}
