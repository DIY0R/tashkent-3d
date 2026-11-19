import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The engine (three.js, postprocessing, all 3D code) is loaded with a dynamic import so the start
 * sheet can paint from the small UI chunk. This adds <link rel="modulepreload"> for the engine chunk
 * and its static dependencies, so the browser fetches them in parallel with the UI chunk instead
 * of discovering them only after the UI chunk has run. See docs/research/optimization.md.
 */
function preloadEngine(): Plugin {
  return {
    name: 'tk-preload-engine',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return html
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk')
        const engine = chunks.find((c) => c.isDynamicEntry && (c.facadeModuleId ?? '').endsWith('/src/engine/Engine.ts'))
        if (!engine) return html
        const seen = new Set<string>()
        const visit = (file: string) => {
          if (seen.has(file)) return
          seen.add(file)
          const c = bundle[file]
          if (c && c.type === 'chunk') for (const dep of c.imports) visit(dep)
        }
        visit(engine.fileName)
        const tags = [...seen]
          .filter((f) => !html.includes(f))
          .map((f) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `/${f}` }, injectTo: 'head' as const }))
        return { html, tags }
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadEngine()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // three.js changes far less often than the engine code: its own long-cached chunk
            { name: 'three', test: /node_modules[\\/](three|postprocessing)[\\/]/, priority: 20 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  server: { host: '127.0.0.1' },
})
