import { store } from '@/state/store'
import { Birds } from './Birds'
import { flyRadius, focus, updateFocus } from './focus'
import { Fountains } from './Fountains'
import type { AmbientSystem, EngineContext } from './index'
import { Pedestrians } from './Pedestrians'
import { RoadNet } from './RoadNet'
import { Traffic } from './Traffic'

/** radius (m) of the road graph kept around the player */
const NET_RADIUS = { low: [500, 950], medium: [650, 1350], high: [700, 1650] } as const

/**
 * City life around the player: traffic, pedestrians, birds and fountains.
 * Registered once by the engine; scales with the quality preset and the movement mode.
 */
export class AmbientLife implements AmbientSystem {
  id = 'life'
  readonly net = new RoadNet()
  readonly traffic = new Traffic(this.net)
  readonly people = new Pedestrians(this.net)
  readonly birds = new Birds()
  readonly fountains = new Fountains(this.net)
  /** smoothed CPU time of update() in ms, and the worst frame since the last reset */
  cpuMs = 0
  cpuMax = 0

  init(ctx: EngineContext) {
    this.traffic.init(ctx)
    this.people.init(ctx)
    this.birds.init(ctx)
    this.fountains.init(ctx)
  }

  update(dt: number, ctx: EngineContext) {
    const t0 = performance.now()
    const q = store.getState().quality
    updateFocus(ctx)
    const fly = focus.fly
    this.net.setRadius(fly ? flyRadius(NET_RADIUS[q][1]) + 50 : NET_RADIUS[q][0])
    this.net.update(dt, ctx)
    this.traffic.update(dt, ctx, q)
    this.people.update(dt, ctx, q)
    this.birds.update(dt, ctx, q)
    this.fountains.update(dt, q)
    const ms = performance.now() - t0
    this.cpuMs += (ms - this.cpuMs) * 0.05
    if (ms > this.cpuMax) this.cpuMax = ms
  }

  /** Numbers for the debug console: `__tk.life.stats()`. */
  stats() {
    return {
      cpuMs: +this.cpuMs.toFixed(3), cpuMax: +this.cpuMax.toFixed(3),
      cars: this.traffic.count, people: this.people.count,
      roadEdges: this.net.roads.length, walkEdges: this.net.walks.length,
    }
  }

  dispose() {
    this.traffic.dispose()
    this.people.dispose()
    this.birds.dispose()
    this.fountains.dispose()
    this.net.dispose()
  }
}
