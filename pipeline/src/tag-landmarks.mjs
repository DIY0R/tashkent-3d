// Sets `lm` on buildings that belong to a modeled landmark (content/landmarks.json), together
// with their localized names `nr` / `ne` (from building-names.json, written by build.mjs).
// Fast and repeatable: only rewrites tiles whose buildings change. Safe to rerun any time.
import fs from 'node:fs';
import path from 'node:path';
import { TILES_DIR, LANDMARKS_FILE, PARENTS_FILE, BUILDING_NAMES_FILE } from './config.mjs';

const t0 = Date.now();
let landmarks = [];
if (fs.existsSync(LANDMARKS_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(LANDMARKS_FILE, 'utf8'));
    landmarks = Array.isArray(raw) ? raw : Array.isArray(raw.landmarks) ? raw.landmarks : Object.values(raw);
  } catch (e) {
    console.error(`tag-landmarks: cannot parse ${LANDMARKS_FILE}: ${e.message}`);
    process.exit(1);
  }
} else console.log('tag-landmarks: content/landmarks.json not found; clearing any existing lm tags');

const refToLm = new Map(); // "way/123" -> landmark id
for (const l of landmarks) {
  if (!l || !l.id) continue;
  for (const ref of l.osmIds || l.osm_ids || []) {
    const m = /^(way|relation|w|r)\/?(\d+)$/.exec(String(ref).trim());
    if (m) refToLm.set((m[1][0] === 'w' ? 'way/' : 'relation/') + m[2], l.id);
  }
}
const parents = fs.existsSync(PARENTS_FILE) ? JSON.parse(fs.readFileSync(PARENTS_FILE, 'utf8')) : {};
const localNames = fs.existsSync(BUILDING_NAMES_FILE) ? JSON.parse(fs.readFileSync(BUILDING_NAMES_FILE, 'utf8')) : {};
const lmOf = (id) => {
  const own = refToLm.get(id < 0 ? 'relation/' + -id : 'way/' + id);
  if (own) return own;
  const par = parents[id];
  return par ? refToLm.get(par) : undefined;
};

const manifestPath = path.join(TILES_DIR, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const matched = new Map(); // landmark id -> building count
let changedTiles = 0, tagged = 0;
for (const mt of manifest.tiles) {
  const file = path.join(TILES_DIR, `t_${mt.x}_${mt.z}.json`);
  const text = fs.readFileSync(file, 'utf8');
  const tile = JSON.parse(text);
  let changed = false;
  for (const b of tile.buildings) {
    const lm = lmOf(b.id);
    if (lm) { matched.set(lm, (matched.get(lm) || 0) + 1); tagged++; }
    const [nr, ne] = (lm && b.n && localNames[b.id]) || [];
    if (b.lm !== lm || b.nr !== (nr || undefined) || b.ne !== (ne || undefined)) {
      delete b.lm; delete b.nr; delete b.ne;
      if (nr) b.nr = nr;
      if (ne) b.ne = ne;
      if (lm) b.lm = lm;
      changed = true;
    }
  }
  if (changed) {
    const json = JSON.stringify(tile);
    fs.writeFileSync(file, json);
    mt.kb = Math.max(1, Math.round(Buffer.byteLength(json) / 1024));
    changedTiles++;
  }
}
if (changedTiles) fs.writeFileSync(manifestPath, JSON.stringify(manifest));
const withIds = landmarks.filter((l) => l && l.id && (l.osmIds || l.osm_ids || []).length);
const unmatched = withIds.filter((l) => !matched.has(l.id)).map((l) => l.id);
console.log(
  `tag-landmarks: ${landmarks.length} landmarks (${withIds.length} with osmIds), ${tagged} buildings tagged for ${matched.size} landmarks, ` +
    `${changedTiles} tiles rewritten in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
);
if (unmatched.length) console.log(`  no building matched (osmIds are not building footprints inside the city): ${unmatched.join(', ')}`);
