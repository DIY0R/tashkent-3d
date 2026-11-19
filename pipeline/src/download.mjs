// Downloads the Geofabrik Uzbekistan extract (OpenStreetMap, ODbL) into data/raw/.
// Cached: reruns are offline. Use --force to refetch.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { RAW_DIR, PBF_FILE, PBF_URL, USER_AGENT } from './config.mjs';

const force = process.argv.includes('--force');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(RAW_DIR, { recursive: true });

if (!force && fs.existsSync(PBF_FILE) && fs.statSync(PBF_FILE).size > 1e7) {
  console.log(`cached  ${path.basename(PBF_FILE)} (${(fs.statSync(PBF_FILE).size / 1048576).toFixed(1)} MB)`);
} else {
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(PBF_URL, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const expected = Number(res.headers.get('content-length') || 0);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(PBF_FILE + '.tmp'));
      const size = fs.statSync(PBF_FILE + '.tmp').size;
      if (expected && size !== expected) throw new Error(`size mismatch ${size} != ${expected}`);
      fs.renameSync(PBF_FILE + '.tmp', PBF_FILE);
      fs.writeFileSync(
        path.join(RAW_DIR, 'SOURCE.txt'),
        `OpenStreetMap data extract by Geofabrik GmbH\n(c) OpenStreetMap contributors, ODbL 1.0\nurl: ${res.url}\nlast-modified: ${res.headers.get('last-modified')}\ndownloaded: ${new Date().toISOString()}\nbytes: ${size}\n`,
      );
      console.log(`fetched ${res.url}  ${(size / 1048576).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      break;
    } catch (e) {
      if (attempt >= 6) throw new Error(`download failed: ${e.message}`);
      const wait = 5000 * 2 ** attempt;
      console.log(`  attempt ${attempt} failed (${e.message}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}
