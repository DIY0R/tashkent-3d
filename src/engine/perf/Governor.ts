import { perf } from './Profiler'

/**
 * Frame-rate governor. Replaces the old "5 s under 27 fps -> drop a whole preset" rule with small
 * steps that are hard to see, cheapest-to-notice first:
 *
 *   level 0  full resolution, shadows every frame
 *   level 1  render scale 0.90
 *   level 2  render scale 0.80, shadow map refreshed every second frame
 *   level 3  render scale 0.72
 *   level 4  render scale 0.64
 *   beyond   the caller steps the preset down (medium -> low), level returns to 0
 *
 * The render scale multiplies the pixel ratio of the preset; the canvas keeps its CSS size, so
 * the browser upscales and SMAA still runs on the result. It steps down when the mean frame
 * interval of a 1 s window (slowest tenth ignored) stays over the budget, and tries one step up after a calm period;
 * if that step up does not hold, the wait before the next try doubles (no oscillation).
 * Only active while `autoQuality` is on. `?gov=0` turns it off.
 */

export const GOVERNOR_LEVELS: { scale: number; shadowEvery: number }[] = [
  { scale: 1, shadowEvery: 1 },
  { scale: 0.9, shadowEvery: 1 },
  { scale: 0.8, shadowEvery: 2 },
  { scale: 0.72, shadowEvery: 2 },
  { scale: 0.64, shadowEvery: 2 },
]

/** step down when the average frame takes longer than this (ms): under ~48 fps */
const SLOW_MS = 21
/** a window counts as calm under this (ms): ~57 fps or better */
const CALM_MS = 17.6
const WINDOW_S = 1

export interface GovernorHost {
  /** apply render scale and shadow refresh interval */
  applyLevel(scale: number, shadowEvery: number): void
  /** all levels used up and still slow: lower the preset; returns false when there is nothing lower */
  stepPresetDown(fps: number): boolean
}

export class Governor {
  enabled = true
  level = 0
  private readonly host: GovernorHost
  private readonly samples = new Float32Array(240)
  private n = 0
  private time = 0
  private slowWindows = 0
  private calmWindows = 0
  /** calm seconds needed before trying a step up; doubles when a step up fails */
  private upWait = 12
  private sinceUp = Infinity
  private cooldown = 0

  constructor(host: GovernorHost) {
    this.host = host
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('gov') === '0') this.enabled = false
  }

  get scale(): number {
    return GOVERNOR_LEVELS[this.level].scale
  }
  get shadowEvery(): number {
    return GOVERNOR_LEVELS[this.level].shadowEvery
  }

  /** Back to full quality (after a preset change). */
  reset() {
    this.setLevel(0)
    this.slowWindows = this.calmWindows = 0
    this.n = 0
    this.time = 0
    this.cooldown = 3
  }

  private setLevel(l: number) {
    if (l === this.level) return
    this.level = l
    const s = GOVERNOR_LEVELS[l]
    this.host.applyLevel(s.scale, s.shadowEvery)
  }

  /**
   * @param dt real frame interval in seconds
   * @param steady false while numbers are not meaningful (loading, tiles streaming in, hidden tab)
   */
  update(dt: number, steady: boolean) {
    if (perf.enabled) perf.extra['governor'] = `level ${this.level}  scale ${this.scale.toFixed(2)}  shadows 1/${this.shadowEvery}${this.enabled ? '' : '  (off)'}`
    if (!this.enabled) return
    if (!steady || dt > 0.25) {
      // a hitch or a pause is not a slow GPU
      this.n = 0
      this.time = 0
      return
    }
    if (this.cooldown > 0) { this.cooldown -= dt; return }
    if (this.n < this.samples.length) this.samples[this.n++] = dt * 1000
    this.time += dt
    this.sinceUp += dt
    if (this.time < WINDOW_S) return
    // mean of the fastest 90 % of the window: with vsync a struggling GPU alternates between 16.7 and
    // 33.3 ms frames, which a median reads as one or the other; the slowest tenth is hitches
    const s = this.samples.subarray(0, this.n).sort()
    const keep = Math.max(1, Math.floor(this.n * 0.9))
    let sum = 0
    for (let i = 0; i < keep; i++) sum += s[i]
    const avg = sum / keep
    this.n = 0
    this.time = 0

    if (avg > SLOW_MS) {
      this.calmWindows = 0
      this.slowWindows++
      // a failed step up is undone quickly; otherwise wait for two slow windows in a row
      const failedUp = this.sinceUp < 6
      if (this.slowWindows >= 2 || failedUp) {
        this.slowWindows = 0
        if (failedUp) this.upWait = Math.min(240, this.upWait * 2)
        this.sinceUp = Infinity
        if (this.level < GOVERNOR_LEVELS.length - 1) {
          this.setLevel(this.level + 1)
          this.cooldown = 1.5
        } else if (avg > 36 && this.host.stepPresetDown(1000 / avg)) {
          // under ~28 fps at the smallest scale
          this.reset()
        }
      }
    } else {
      this.slowWindows = 0
      if (avg < CALM_MS) this.calmWindows++
      else this.calmWindows = 0
      if (this.level > 0 && this.calmWindows >= this.upWait) {
        this.calmWindows = 0
        this.setLevel(this.level - 1)
        this.sinceUp = 0
        this.cooldown = 1
      }
    }
  }
}
