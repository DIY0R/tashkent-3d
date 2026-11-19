import { chromium, devices, CHROMIUM_PATH } from './pw.mjs'
const [url, out, dev = 'Pixel 7'] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
try {
  const ctx = await browser.newContext(dev === 'desktop' ? { viewport: { width: 1366, height: 768 } } : devices[dev])
  const page = await ctx.newPage()
  const logs = []
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 300)) })
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e).slice(0, 400)))
  page.on('requestfailed', (r) => logs.push('REQFAIL: ' + r.url() + ' ' + r.failure()?.errorText))
  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'load', timeout: 90000 })
  console.log('load', Date.now() - t0, 'ms')
  await page.waitForTimeout(12000)
  await page.screenshot({ path: out })
  const rootLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? -1)
  console.log('root html length', rootLen)
  console.log([...new Set(logs)].slice(0, 25).join('\n'))
} finally { await browser.close() }
