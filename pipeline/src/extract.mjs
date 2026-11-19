// Pass 1: wanted relations (+ their member way ids).
// Pass 2: nodes inside BBOX (id -> coordinate table), wanted ways, tagged nodes.
// Output: data/raw/derived/tashkent-extract.ndjson (nodes, ways, then relations).
import fs from 'node:fs';
import { PBF_FILE, EXTRACT_FILE, DERIVED_DIR, BBOX, CITY_RELATION } from './config.mjs';
import { readBlobs, parseBlock } from './pbf.mjs';

const force = process.argv.includes('--force');
if (!force && fs.existsSync(EXTRACT_FILE) && fs.statSync(EXTRACT_FILE).mtimeMs >= fs.statSync(PBF_FILE).mtimeMs) {
  console.log('cached  tashkent-extract.ndjson');
  process.exit(0);
}
fs.mkdirSync(DERIVED_DIR, { recursive: true });
const t0 = Date.now();

const RX = {
  railway: /^(rail|tram|subway|light_rail|narrow_gauge|monorail)$/,
  amenity: /^(parking|grave_yard)$/,
  leisure: /^(pitch|park|garden|stadium|track|nature_reserve|playground)$/,
  landuse: /^(construction|grass|forest|cemetery|meadow|village_green|recreation_ground|reservoir|basin|orchard|flowerbed)$/,
  natural: /^(water|wood|scrub|tree_row)$/,
};
function wantedArea(t) {
  return (
    t.building || t['building:part'] || t.place === 'square' ||
    (t.amenity && RX.amenity.test(t.amenity)) || (t.leisure && RX.leisure.test(t.leisure)) ||
    (t.landuse && RX.landuse.test(t.landuse)) || (t.natural && RX.natural.test(t.natural)) ||
    t.waterway === 'riverbank' || t.tourism === 'zoo'
  );
}
function wantedWay(t) {
  return wantedArea(t) || t.highway || t.waterway || (t.railway && RX.railway.test(t.railway));
}
function wantedNode(t) {
  return t.natural === 'tree' || t.railway === 'station' || t.station === 'subway' || t.place === 'square';
}
function wantedRelation(id, t) {
  if (id === CITY_RELATION) return true;
  if (t.type === 'boundary') return t.boundary === 'administrative' && t.admin_level === '6';
  if (t.type !== 'multipolygon') return false;
  return wantedArea(t) || t.highway === 'pedestrian';
}

// ---- pass 1: relations
const relations = [];
const memberWays = new Set();
for await (const blob of readBlobs(PBF_FILE)) {
  if (blob.type !== 'OSMData') continue;
  parseBlock(blob.data, {
    relation(id, tagsFn, membersFn) {
      const tags = tagsFn();
      if (!wantedRelation(id, tags)) return;
      const m = membersFn().filter((x) => x.type === 1 || (x.type === 0 && (x.role === 'label' || x.role === 'admin_centre')));
      relations.push({ id, tags, m });
      for (const x of m) if (x.type === 1) memberWays.add(x.ref);
    },
  });
}
console.log(`pass 1: ${relations.length} candidate relations, ${memberWays.size} member ways (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// ---- pass 2: nodes + ways
const [S, W, N, E] = BBOX.map((v) => Math.round(v * 1e7));
let cap = 1 << 22;
let nIds = new Float64Array(cap);
let nLat = new Int32Array(cap);
let nLon = new Int32Array(cap);
let nn = 0;
let sorted = true;
const out = fs.createWriteStream(EXTRACT_FILE + '.tmp');
let pending = [];
const write = async (obj) => {
  pending.push(JSON.stringify(obj));
  if (pending.length >= 2000) await flush();
};
const flush = async () => {
  if (!pending.length) return;
  const s = pending.join('\n') + '\n';
  pending = [];
  if (!out.write(s)) await new Promise((r) => out.once('drain', r));
};
function findNode(id) {
  let lo = 0;
  let hi = nn - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = nIds[mid];
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
const counts = { nodes: 0, ways: 0, relations: 0, partialWays: 0 };
const keptWays = new Set();
const queue = [];
for await (const blob of readBlobs(PBF_FILE)) {
  if (blob.type !== 'OSMData') continue;
  parseBlock(blob.data, {
    node(id, lat, lon, tagsFn) {
      if (lat < S || lat > N || lon < W || lon > E) return;
      if (nn === cap) {
        cap *= 2;
        const a = new Float64Array(cap); a.set(nIds); nIds = a;
        const b = new Int32Array(cap); b.set(nLat); nLat = b;
        const c = new Int32Array(cap); c.set(nLon); nLon = c;
      }
      if (nn && nIds[nn - 1] > id) sorted = false;
      nIds[nn] = id; nLat[nn] = lat; nLon[nn] = lon; nn++;
      const tags = tagsFn();
      if (tags && wantedNode(tags)) {
        counts.nodes++;
        queue.push({ t: 'n', id, tags, g: [lon, lat] });
      }
    },
    way(id, tagsFn, refsFn) {
      if (!sorted) throw new Error('PBF nodes are not sorted by id; unsupported');
      const isMember = memberWays.has(id);
      const tags = tagsFn();
      if (!isMember && !wantedWay(tags)) return;
      const refs = refsFn();
      const g = [];
      let missing = 0;
      for (const ref of refs) {
        const i = findNode(ref);
        if (i < 0) missing++;
        else g.push(nLon[i], nLat[i]);
      }
      if (g.length < 4) return;
      const o = { t: 'w', id, tags, g };
      if (isMember) o.mm = 1;
      if (missing) { o.partial = 1; counts.partialWays++; }
      keptWays.add(id);
      counts.ways++;
      queue.push(o);
    },
  });
  for (const o of queue) await write(o);
  queue.length = 0;
}
for (const r of relations) {
  const ways = r.m.filter((x) => x.type === 1);
  const have = ways.filter((x) => keptWays.has(x.ref));
  if (!have.length) continue;
  const o = { t: 'r', id: r.id, tags: r.tags, m: have.map((x) => ({ ref: x.ref, role: x.role })) };
  if (have.length < ways.length) o.partial = 1;
  for (const x of r.m) {
    if (x.type !== 0) continue;
    const i = findNode(x.ref);
    if (i >= 0) o[x.role] = [nLon[i], nLat[i]];
  }
  counts.relations++;
  await write(o);
}
await flush();
await new Promise((r) => out.end(r));
fs.renameSync(EXTRACT_FILE + '.tmp', EXTRACT_FILE);
console.log(
  `extract: ${nn} nodes in bbox; kept ${counts.nodes} tagged nodes, ${counts.ways} ways (${counts.partialWays} partial), ${counts.relations} relations -> ` +
    `${(fs.statSync(EXTRACT_FILE).size / 1048576).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
);
