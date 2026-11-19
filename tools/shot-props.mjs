// Screenshots of the main app (dev server on 5210) at given places, one browser session.
// Usage (ALWAYS through the lock):
//   flock /tmp/tashkent-pw.lock node tools/shot-props.mjs <quality> <out.png,x,z,headingDeg,time,pitch> [more specs...]
import { chromium, CHROMIUM_PATH } from './pw.mjs'
const [q = 'medium', ...specs] = process.argv.slice(2)
const url = `http://127.0.0.1:5210/?q=${q}&t=13`
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  // no hot reload while the shots are taken (other agents edit files in parallel)
  await page.addInitScript(() => {
    const WS = window.WebSocket
    window.WebSocket = function (url, protocols) {
      const p = Array.isArray(protocols) ? protocols : [protocols]
      if (p.includes('vite-hmr') || p.includes('vite-ping')) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }
      return new WS(url, protocols)
    }
  })
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url, { waitUntil: 'load', timeout: 90000 })
  await page.waitForFunction(() => window.__tk && window.__tkStore && window.__tkStore.getState().ready, null, { timeout: 240000, polling: 1000 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)
  for (const spec of specs) {
    const [out, x, z, heading, time = '13', pitch = '-0.05', eye = '1.7'] = spec.split(',')
    // the camera is placed by hand (eye level, no third-person rig) so shots do not depend on the player code
    const place = ([x, z, heading, pitch, time, eye]) => {
      const e = window.__tk
      window.__tkStore.getState().setTimeOfDay(time)
      const h = (heading * Math.PI) / 180
      if (!e.__shot) { e.__shot = true; e.player.teleport(x - Math.sin(h) * 2, z + Math.cos(h) * 2, { heading, instant: true }); e.player.update = () => {} }
      e.player.position.set(x - Math.sin(h) * 2, 0, z + Math.cos(h) * 2)
      if (e.player.mesh) e.player.mesh.visible = false
      e.camera.position.set(x, eye, z)
      e.camera.up.set(0, 1, 0)
      e.camera.lookAt(x + Math.sin(h) * 10, eye + Math.tan(pitch) * 10, z - Math.cos(h) * 10)
    }
    const args = [+x, +z, +heading, +pitch, +time, +eye]
    await page.evaluate(place, args)
    await page.waitForTimeout(3000)
    await page.waitForFunction(() => {
      const e = window.__tk
      const sd = e.systems?.find?.((s) => s.id === 'street-detail')
      return e.tiles.pendingCount === 0 && (!sd || (!sd.busy && sd.stats.tiles > 0))
    }, null, { timeout: 240000, polling: 1000 }).catch(() => errors.push('tiles timeout'))
    await page.evaluate(place, args)
    await page.waitForTimeout(7000)
    await page.screenshot({ path: out })
    const info = await page.evaluate(() => {
      const e = window.__tk
      const sd = e.systems?.find?.((s) => s.id === 'street-detail')
      const st = window.__tkStore.getState().stats
      const p = e.player.position
      return JSON.stringify({ draws: st.drawCalls, tris: st.triangles, cpu: st.frameMs, detail: sd?.stats, pos: [p.x, p.z] })
    }).catch(() => 'no info')
    console.log(out, info)
  }
  // cost of the street detail at the last place: draw calls with / without it, CPU per update
  const cost = await page.evaluate(async () => {
    const e = window.__tk
    const sd = e.systems?.find?.((s) => s.id === 'street-detail')
    if (!sd) return 'no street-detail system'
    const wait = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })
    const o = sd.update.bind(sd)
    let ms = 0, n = 0
    sd.update = (dt, ctx) => { const t = performance.now(); o(dt, ctx); ms += performance.now() - t; n++ }
    await wait(3)
    const withIt = e.renderer.info.render.calls, trisWith = e.renderer.info.render.triangles
    sd.group.visible = false
    const keep = sd.update
    sd.update = () => {}
    await wait(3)
    const without = e.renderer.info.render.calls, trisWithout = e.renderer.info.render.triangles
    sd.update = keep
    for (let i = 0; i < 200; i++) sd.timer = 0, sd.update(0.016, e.ctx)
    return JSON.stringify({ drawCallsWith: withIt, drawCallsWithout: without, trisWith, trisWithout, updateMsFull: ms / n, updates: n })
  }).catch((e) => 'cost failed: ' + e)
  console.log('COST', cost)
  if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 8).join('\n'))
} finally { await browser.close() }
