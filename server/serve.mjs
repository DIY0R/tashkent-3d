// Production static server for Toshkent 3D (no dependencies).
// Serves dist/ with precompressed .br/.gz files (see tools/compress.mjs), cache headers and SPA fallback.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, process.env.ROOT_DIR || '../dist')
const PORT = Number(process.env.PORT || 8090)
const HOST = process.env.HOST || '0.0.0.0'
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
}

function cacheControl(rel) {
  if (rel === '/index.html') return 'no-cache'
  if (rel.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  if (rel.startsWith('/tiles/')) return 'public, max-age=86400, stale-while-revalidate=604800'
  // not hashed, change rarely
  if (rel.startsWith('/fonts/')) return 'public, max-age=604800, stale-while-revalidate=2592000'
  if (/^\/(models|places)\//.test(rel)) return 'public, max-age=86400, stale-while-revalidate=604800'
  return 'public, max-age=3600'
}

function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0])
  if (rel.endsWith('/')) rel += 'index.html'
  const abs = path.normalize(path.join(ROOT, rel))
  if (!abs.startsWith(ROOT)) return null
  try { if (fs.statSync(abs).isFile()) return { abs, rel } } catch {}
  // SPA fallback for paths without an extension
  if (!path.extname(rel)) return { abs: path.join(ROOT, 'index.html'), rel: '/index.html' }
  return null
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }
  const f = resolveFile(req.url || '/')
  if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return }
  const ext = path.extname(f.abs).toLowerCase()
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl(f.rel),
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Accept-Encoding',
  }
  const accept = String(req.headers['accept-encoding'] || '')
  let file = f.abs
  if (/\bbr\b/.test(accept) && fs.existsSync(file + '.br')) { file += '.br'; headers['Content-Encoding'] = 'br' }
  else if (/\bgzip\b/.test(accept) && fs.existsSync(file + '.gz')) { file += '.gz'; headers['Content-Encoding'] = 'gzip' }
  let st
  try { st = fs.statSync(file) } catch { res.writeHead(404).end(); return }
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`
  headers.ETag = etag
  headers['Content-Length'] = st.size
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return }
  res.writeHead(200, headers)
  if (req.method === 'HEAD') { res.end(); return }
  fs.createReadStream(file).pipe(res)
})
server.listen(PORT, HOST, () => console.log(`Toshkent 3D on http://${HOST}:${PORT}`))
