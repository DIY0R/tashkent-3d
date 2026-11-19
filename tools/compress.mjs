// Precompress text assets in dist/ to .br and .gz (run after vite build).
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import os from 'node:os'
const ROOT = path.resolve(import.meta.dirname, '..', process.env.ROOT_OVERRIDE || 'dist')
const EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.gltf', '.bin', '.txt', '.wasm', '.ttf', '.glb'])
const files = []
;(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (EXT.has(path.extname(p)) && fs.statSync(p).size > 1024) files.push(p) } })(ROOT)
let raw = 0, br = 0
// scripts, styles and the big shared data files are fetched by every visitor: maximum brotli level for them
const quality = (p, buf) => (p.includes(`${path.sep}assets${path.sep}`) || buf.length > 300_000 || p.endsWith('.html') ? 11 : 9)
const t0 = Date.now()
const limit = Math.max(2, os.cpus().length - 4)
let i = 0
async function worker() {
  while (i < files.length) {
    const p = files[i++]
    const buf = await fs.promises.readFile(p)
    const [b, g] = await Promise.all([
      new Promise((r, j) => zlib.brotliCompress(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality(p, buf), [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }, (e, o) => e ? j(e) : r(o))),
      new Promise((r, j) => zlib.gzip(buf, { level: 9 }, (e, o) => e ? j(e) : r(o))),
    ])
    raw += buf.length; br += b.length
    await fs.promises.writeFile(p + '.br', b)
    await fs.promises.writeFile(p + '.gz', g)
  }
}
await Promise.all(Array.from({ length: limit }, worker))
console.log(`compressed ${files.length} files: ${(raw / 1e6).toFixed(1)} MB -> ${(br / 1e6).toFixed(1)} MB brotli in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
