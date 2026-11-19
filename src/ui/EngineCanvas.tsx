import { useEffect, useRef } from 'react'
import type { Engine } from '@/engine/Engine'
import { setEngine } from '@/engine/query/engineRef'
import { useUi } from '@/ui/uiStore'
import { useStore } from '@/state/store'

declare global {
  interface Window {
    /** Debug handle to the running engine. */
    __tk?: Engine
    /** Debug handle to the zustand store. */
    __tkStore?: typeof useStore
  }
}

// The engine (three.js and everything 3D) is a separate chunk: the start sheet paints from the small
// UI chunk while this one downloads. index.html preloads it, so both arrive in parallel.
const engineModule = import('@/engine/Engine')

/** Full-size container that owns the engine instance. */
export function EngineCanvas() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let engine: Engine | null = null
    let cancelled = false
    window.__tkStore = useStore
    const fail = (err: unknown) => {
      // no WebGL 2 (or the chunk failed to load): the start sheet shows what to do
      console.error('[engine] failed to start', err)
      useUi.setState({ engineError: true })
    }
    engineModule.then(({ Engine }) => {
      if (cancelled) return
      try {
        engine = new Engine(el)
      } catch (err) {
        fail(err)
        return
      }
      setEngine(engine)
      window.__tk = engine
      engine.start()
    }, fail)
    return () => {
      cancelled = true
      if (!engine) return
      engine.dispose()
      setEngine(null)
      if (window.__tk === engine) delete window.__tk
    }
  }, [])
  return <div ref={ref} className="absolute inset-0" />
}
