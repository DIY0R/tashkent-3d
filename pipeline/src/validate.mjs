// Validates public/tiles against the data contract in docs/BRIEF.md and prints size statistics.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { TILES_DIR, TILE, toX, toZ, LAT0, LON0 } from './config.mjs';
import { signedArea, centroid } from './geom.mjs';

const errors = [];
const warns = [];
const err = (m) => { if (errors.length < 60) errors.push(m); else if (errors.length === 60) errors.push('... more errors suppressed'); };
const L = TILE * 10;
const KINDS = new Set(['house', 'apartments', 'residential', 'commercial', 'office', 'retail', 'industrial', 'warehouse', 'school', 'university', 'hospital', 'religious', 'government', 'public', 'hotel', 'garage', 'shed', 'other']);
const ROADK = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service']);
const PATHK = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track']);
const RAILK = new Set(['rail', 'tram', 'subway']);
const AREAK = new Set(['parking', 'pedestrian', 'plaza', 'sports', 'construction']);
const ROOFK = new Set(['flat', 'gabled', 'hipped', 'pyramidal', 'dome', 'round', 'skillion']);
// names: `n` uses U+02BB (oʻ, gʻ) and U+2019 (tutuq) only; `nr` / `ne` are optional, need `n` and differ from it
const BAD_APOS = /\p{L}['ʼ‘`´ʹ′]|[\u200b-\u200d\ufeff]|^\s|\s$|\s\s/u;
const nameStats = { n: 0, nr: 0, ne: 0 };
function checkNames(o, where, localized = true) {
  for (const k of ['n', 'nr', 'ne']) if (o[k] !== undefined && (typeof o[k] !== 'string' || !o[k])) return err(`${where}: ${k} must be a non-empty string`);
  if (o.n === undefined) {
    if (o.nr !== undefined || o.ne !== undefined) err(`${where}: nr/ne without n`);
    return;
  }
  nameStats.n++;
  if (BAD_APOS.test(o.n)) err(`${where}: n "${o.n}" has a raw apostrophe, zero-width character or stray space`);
  if (/[oOgG]\u2019/.test(o.n)) err(`${where}: n "${o.n}" uses U+2019 after o/g (must be U+02BB)`);
  if (!localized && (o.nr !== undefined || o.ne !== undefined)) err(`${where}: nr/ne only allowed on landmark buildings`);
  if (o.nr !== undefined) { nameStats.nr++; if (o.nr === o.n) err(`${where}: nr equals n`); if (!/[Ѐ-ӿ]/.test(o.nr)) err(`${where}: nr "${o.nr}" has no Cyrillic letters`); }
  if (o.ne !== undefined) { nameStats.ne++; if (o.ne === o.n) err(`${where}: ne equals n`); if (/[Ѐ-ӿʻ]/.test(o.ne)) err(`${where}: ne "${o.ne}" has Cyrillic letters or U+02BB`); }
}
const isInts = (a) => Array.isArray(a) && a.length % 2 === 0 && a.every(Number.isInteger);

function checkRing(p, wantOuter, where) {
  if (!isInts(p)) return err(`${where}: ring is not a flat integer array`);
  if (p.length < 6) return err(`${where}: ring with < 3 points`);
  if (p[0] === p[p.length - 2] && p[1] === p[p.length - 1]) err(`${where}: first point repeated at the end`);
  const a = signedArea(p);
  if (a === 0) return err(`${where}: zero-area ring`);
  // convention: outer rings are CCW on a north-up map => shoelace area in (x, z) is negative
  if (a < 0 !== wantOuter) err(`${where}: wrong winding (${wantOuter ? 'outer must have negative' : 'hole must have positive'} signed area in x/z)`);
}
function checkPoly(o, where) {
  checkRing(o.p, true, where);
  if (o.h !== undefined) {
    if (!Array.isArray(o.h) || !o.h.length) err(`${where}: h must be a non-empty array of rings`);
    else o.h.forEach((h, i) => checkRing(h, false, `${where} hole ${i}`));
  }
}
function checkLine(p, where, inTile) {
  if (!isInts(p) || p.length < 4) return err(`${where}: bad line`);
  if (inTile) for (const v of p) if (v < 0 || v > L) return err(`${where}: line leaves its tile (${v})`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(TILES_DIR, 'manifest.json'), 'utf8'));
if (manifest.v !== 1 || manifest.tileSize !== TILE) err('manifest: bad v/tileSize');
if (manifest.origin[0] !== LAT0 || manifest.origin[1] !== LON0) err('manifest: bad origin');
if (!Array.isArray(manifest.bounds) || manifest.bounds.length !== 4) err('manifest: bad bounds');
const listed = new Set(manifest.tiles.map((t) => `t_${t.x}_${t.z}.json`));
for (const f of fs.readdirSync(TILES_DIR)) if (/^t_.*\.json$/.test(f) && !listed.has(f)) err(`${f}: file not in manifest`);

const tot = { tiles: 0, buildings: 0, roads: 0, paths: 0, rail: 0, trees: 0, areas: 0, lm: 0, named: 0, bytes: 0, gz: 0, maxBytes: 0, maxTile: '', maxTrees: 0, holes: 0 };
const named = []; // named buildings for the sanity check
const ids = new Map();
for (const mt of manifest.tiles) {
  const name = `t_${mt.x}_${mt.z}.json`;
  const file = path.join(TILES_DIR, name);
  if (!fs.existsSync(file)) { err(`${name}: listed in manifest but missing`); continue; }
  const buf = fs.readFileSync(file);
  const t = JSON.parse(buf);
  tot.tiles++; tot.bytes += buf.length; tot.gz += zlib.gzipSync(buf, { level: 6 }).length;
  if (buf.length > tot.maxBytes) { tot.maxBytes = buf.length; tot.maxTile = name; }
  if (buf.length > 500 * 1024) err(`${name}: larger than 500 KB`);
  if (buf.includes('\n')) err(`${name}: not compact JSON`);
  if (t.v !== 1 || t.x !== mt.x || t.z !== mt.z) err(`${name}: bad v/x/z`);
  if (mt.x * TILE < manifest.bounds[0] || mt.z * TILE < manifest.bounds[1] || (mt.x + 1) * TILE > manifest.bounds[2] || (mt.z + 1) * TILE > manifest.bounds[3]) err(`${name}: outside manifest bounds`);
  for (const k of ['buildings', 'roads', 'paths', 'rail', 'trees', 'areas']) if (!Array.isArray(t[k])) err(`${name}: missing ${k}`);
  if (t.buildings.length !== mt.b) err(`${name}: manifest b=${mt.b} but ${t.buildings.length} buildings`);
  if (Math.abs(mt.kb - buf.length / 1024) > 1.5) err(`${name}: manifest kb=${mt.kb} but file is ${(buf.length / 1024).toFixed(1)} KB`);
  t.buildings.forEach((b, i) => {
    const w = `${name} building ${b.id}`;
    if (!Number.isInteger(b.id)) err(`${w}: id not integer`);
    checkPoly(b, w);
    if (!(b.ht > 0 && b.ht <= 420)) err(`${w}: bad ht ${b.ht}`);
    if (!(b.mh >= 0 && b.mh < b.ht)) err(`${w}: bad mh ${b.mh}`);
    if (!(Number.isInteger(b.lv) && b.lv >= 1)) err(`${w}: bad lv ${b.lv}`);
    if (!KINDS.has(b.k)) err(`${w}: bad kind ${b.k}`);
    if (b.rf !== undefined && !ROOFK.has(b.rf)) err(`${w}: bad rf ${b.rf}`);
    if (b.c !== undefined && !/^#[0-9a-f]{6}$/.test(b.c)) err(`${w}: bad colour ${b.c}`);
    if (isInts(b.p) && b.p.length >= 6) {
      const [cx, cz] = centroid(b.p);
      if (cx < -10 || cz < -10 || cx > L + 10 || cz > L + 10) err(`${w}: centroid outside its tile`);
      if (b.n) named.push({ n: b.n, x: mt.x * TILE + cx / 10, z: mt.z * TILE + cz / 10 });
    }
    checkNames(b, w, !!b.lm);
    if (b.h) tot.holes++;
    if (b.lm) tot.lm++;
    if (b.n) tot.named++;
    ids.set(b.id, (ids.get(b.id) || 0) + 1);
  });
  t.roads.forEach((r, i) => {
    checkLine(r.p, `${name} road ${i}`, true);
    if (!(r.w >= 2 && r.w <= 60)) err(`${name} road ${i}: bad width ${r.w}`);
    if (!ROADK.has(r.k)) err(`${name} road ${i}: bad kind ${r.k}`);
    if (r.br !== undefined && r.br !== 1) err(`${name} road ${i}: bad br`);
    checkNames(r, `${name} road ${i}`);
  });
  t.paths.forEach((r, i) => {
    checkLine(r.p, `${name} path ${i}`, true);
    if (!(r.w >= 1 && r.w <= 30)) err(`${name} path ${i}: bad width`);
    if (!PATHK.has(r.k)) err(`${name} path ${i}: bad kind ${r.k}`);
    checkNames(r, `${name} path ${i}`);
  });
  t.rail.forEach((r, i) => {
    checkLine(r.p, `${name} rail ${i}`, true);
    if (!RAILK.has(r.k)) err(`${name} rail ${i}: bad kind ${r.k}`);
  });
  if (!isInts(t.trees)) err(`${name}: trees not a flat integer array`);
  else if (t.trees.some((v) => v < 0 || v >= L)) err(`${name}: tree outside tile`);
  if (t.trees.length / 2 > 4000) err(`${name}: more than 4000 trees`);
  tot.maxTrees = Math.max(tot.maxTrees, t.trees.length / 2);
  t.areas.forEach((a, i) => {
    checkPoly(a, `${name} area ${i}`);
    if (!AREAK.has(a.k)) err(`${name} area ${i}: bad kind ${a.k}`);
    checkNames(a, `${name} area ${i}`);
  });
  tot.buildings += t.buildings.length; tot.roads += t.roads.length; tot.paths += t.paths.length;
  tot.rail += t.rail.length; tot.trees += t.trees.length / 2; tot.areas += t.areas.length;
}
const dupIds = [...ids.values()].filter((c) => c > 1).length;
if (dupIds) warns.push(`${dupIds} building ids appear more than once (multipolygon relations with several outer rings share the relation id)`);

// ---- global.json
const gbuf = fs.readFileSync(path.join(TILES_DIR, 'global.json'));
const g = JSON.parse(gbuf);
const ggz = zlib.gzipSync(gbuf, { level: 6 }).length;
if (gbuf.length > 3 * 1048576) warns.push(`global.json is ${(gbuf.length / 1048576).toFixed(2)} MB (> 3 MB target)`);
g.water.forEach((w, i) => checkPoly(w, `global water ${i}`));
g.green.forEach((w, i) => { checkPoly(w, `global green ${i}`); if (!['park', 'grass', 'forest', 'garden', 'cemetery'].includes(w.k)) err(`global green ${i}: bad kind`); });
g.waterways.forEach((w, i) => { checkLine(w.p, `global waterway ${i}`, false); if (!(w.w > 0)) err(`global waterway ${i}: bad width`); });
checkRing(g.boundary, true, 'global boundary');
if (g.skyline.cell !== 100 || !Array.isArray(g.skyline.cells) || g.skyline.cells.length % 4 || !g.skyline.cells.every(Number.isInteger)) err('global skyline malformed');
else for (let i = 0; i < g.skyline.cells.length; i += 4) if (g.skyline.cells[i + 3] < 1 || g.skyline.cells[i + 3] > 255 || g.skyline.cells[i + 2] < 1) { err('global skyline: bad cell values'); break; }
for (const l of g.labels) {
  if (!Number.isInteger(l.x) || !Number.isInteger(l.z)) err('label: non-integer position');
  if (!l.n || !l.n.uz || !l.n.ru || !l.n.en) err(`label ${JSON.stringify(l.n)}: missing a language`);
  if (!['district', 'metro', 'square', 'park'].includes(l.k)) err(`label: bad kind ${l.k}`);
  if (l.n && l.n.uz && BAD_APOS.test(l.n.uz)) err(`label "${l.n.uz}": raw apostrophe in uz`);
  if (l.n && l.n.en && /[Ѐ-ӿʻ]/.test(l.n.en)) err(`label "${l.n.en}": Cyrillic or U+02BB in en`);
}

// ---- sanity: famous places at the expected local coordinates
const sane = [];
function expectNear(what, lat, lon, finder, maxDist) {
  const ex = toX(lon), ez = toZ(lat);
  const hit = finder(ex, ez);
  if (!hit) { warns.push(`sanity: nothing found in the data for "${what}" (expected near x=${ex.toFixed(0)}, z=${ez.toFixed(0)})`); return; }
  const d = Math.hypot(hit.x - ex, hit.z - ez);
  sane.push(`  ${what}: expected (${ex.toFixed(0)}, ${ez.toFixed(0)}), data "${hit.n}" at (${hit.x.toFixed(0)}, ${hit.z.toFixed(0)}), off by ${d.toFixed(0)} m`);
  if (d > maxDist) err(`sanity: ${what} is ${d.toFixed(0)} m away from the expected position`);
}
const nearest = (list, ex, ez) => list.reduce((a, b) => (!a || Math.hypot(b.x - ex, b.z - ez) < Math.hypot(a.x - ex, a.z - ez) ? b : a), null);
const label = (re, k) => (ex, ez) =>
  nearest(
    g.labels.filter((q) => (!k || q.k === k) && (re.test(q.n.uz) || re.test(q.n.en) || re.test(q.n.ru))).map((l) => ({ x: l.x / 10, z: l.z / 10, n: `${l.n.uz} [${l.k}]` })),
    ex, ez,
  );
const building = (re) => (ex, ez) => nearest(named.filter((b) => re.test(b.n)), ex, ez);
expectNear('Amir Temur Square', 41.31108, 69.27966, label(/Amir Tem?ur|Amir Timur/i), 400);
expectNear('Chorsu (metro, next to the bazaar)', 41.3267, 69.235, label(/^Chorsu/i, 'metro'), 400);
expectNear('Tashkent TV Tower (building at its base)', 41.3456, 69.2848, building(/teleminora|телебашн|tv tower/i), 300);
expectNear('Mustaqillik maydoni', 41.3163, 69.2675, label(/Mustaqillik/i, 'square'), 500);
expectNear('Toshkent railway station (metro)', 41.2925, 69.2874, label(/^Toshkent$/i, 'metro'), 500);
expectNear('Hotel Uzbekistan', 41.3117, 69.2826, building(/zbekiston|Uzbekistan|Узбекистан/i), 300);
// north must be -z, east +x
const metroN = g.labels.find((l) => l.k === 'metro' && /^Yunusobod/i.test(l.n.uz));
if (metroN && !(metroN.z < -30000)) err('sanity: Yunusobod metro should be far north (negative z)');

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`tiles: ${tot.tiles}   buildings: ${tot.buildings} (${tot.named} named, ${tot.holes} with holes, ${tot.lm} landmark-tagged)`);
console.log(`roads: ${tot.roads}   paths: ${tot.paths}   rail: ${tot.rail}   areas: ${tot.areas}   trees: ${tot.trees} (max ${tot.maxTrees} in a tile)`);
console.log(`names: ${nameStats.n} named features, ${nameStats.nr} with nr, ${nameStats.ne} with ne`);
console.log(`global: water ${g.water.length}, waterways ${g.waterways.length}, green ${g.green.length}, skyline cells ${g.skyline.cells.length / 4}, labels ${g.labels.length}`);
console.log(`size: tiles ${mb(tot.bytes)} (gzip ${mb(tot.gz)}), largest ${tot.maxTile} ${(tot.maxBytes / 1024).toFixed(0)} KB, global.json ${mb(gbuf.length)} (gzip ${mb(ggz)})`);
console.log(`total: ${mb(tot.bytes + gbuf.length)} raw, ${mb(tot.gz + ggz)} gzip`);
console.log('sanity:');
for (const s of sane) console.log(s);
for (const w of warns) console.log('WARN  ' + w);
if (errors.length) {
  for (const e of errors) console.log('ERROR ' + e);
  console.log(`validation FAILED with ${errors.length} error(s)`);
  process.exit(1);
}
console.log('validation OK');
