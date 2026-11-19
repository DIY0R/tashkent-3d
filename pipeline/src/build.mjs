// Builds public/tiles/{manifest.json,t_x_z.json,global.json} from the NDJSON extract.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  EXTRACT_FILE, TILES_DIR, DERIVED_DIR, PARENTS_FILE, BUILDING_NAMES_FILE, CITY_RELATION, TILE, LAT0, LON0, toX, toZ,
} from './config.mjs';
import {
  signedArea, orient, centroid, pip, bboxOf, dpLine, dpRing, hash01, assembleRings, PolyIndex, SegGrid, lineLength,
} from './geom.mjs';
import { nameUz, names3, cleanName, localNames, fixLabel } from './names.mjs';
import { classifyBuilding, roofShape, colour } from './rules.mjs';

const T0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
const MAX_TREES_PER_TILE = 4000;

// ---------------------------------------------------------------- helpers
const project = (g) => {
  const out = new Array(g.length);
  for (let i = 0; i < g.length; i += 2) {
    out[i] = toX(g[i] / 1e7);
    out[i + 1] = toZ(g[i + 1] / 1e7);
  }
  return out;
};
const tkey = (tx, tz) => (tx + 500) * 1000 + (tz + 500);
const tileOf = (v) => Math.floor(v / TILE);
const yes = (v) => v !== undefined && v !== 'no';
const num = (v) => {
  if (v === undefined) return NaN;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
/** ring in meters -> integer decimeter ring relative to (ox, oz); null if degenerate. ccw = map-CCW. */
function encodeRing(p, ox, oz, ccw) {
  const out = [];
  for (let i = 0; i < p.length; i += 2) {
    const x = Math.round((p[i] - ox) * 10), z = Math.round((p[i + 1] - oz) * 10);
    const n = out.length;
    if (n && out[n - 2] === x && out[n - 1] === z) continue;
    out.push(x, z);
  }
  while (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  if (out.length < 6) return null;
  const a = signedArea(out);
  if (Math.abs(a) < 50) return null; // < 0.5 m2
  return a < 0 === ccw ? out : orient(out, ccw);
}
function encodePoly(outer, holes, ox, oz) {
  const p = encodeRing(outer, ox, oz, true);
  if (!p) return null;
  const o = { p };
  if (holes && holes.length) {
    const hs = holes.map((h) => encodeRing(h, ox, oz, false)).filter(Boolean);
    if (hs.length) o.h = hs;
  }
  return o;
}
function encodeLine(p, ox, oz) {
  const out = [];
  for (let i = 0; i < p.length; i += 2) {
    const x = Math.round((p[i] - ox) * 10), z = Math.round((p[i + 1] - oz) * 10);
    const n = out.length;
    if (n && out[n - 2] === x && out[n - 1] === z) continue;
    out.push(x, z);
  }
  return out.length >= 4 ? out : null;
}
/** Split a polyline (meters) at tile borders. cb(tx, tz, localDecimeterFlatArray) */
function splitByTiles(p, cb) {
  let cur = null, ctx = 0, ctz = 0;
  const emit = () => { if (cur && cur.length >= 4) cb(ctx, ctz, cur); cur = null; };
  const L = TILE * 10;
  const clamp = (v) => (v < 0 ? 0 : v > L ? L : v);
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], az = p[i - 1], bx = p[i], bz = p[i + 1];
    const ts = [0, 1];
    const kx0 = Math.floor(Math.min(ax, bx) / TILE) + 1, kx1 = Math.ceil(Math.max(ax, bx) / TILE) - 1;
    for (let k = kx0; k <= kx1; k++) { const t = (k * TILE - ax) / (bx - ax); if (t > 0 && t < 1) ts.push(t); }
    const kz0 = Math.floor(Math.min(az, bz) / TILE) + 1, kz1 = Math.ceil(Math.max(az, bz) / TILE) - 1;
    for (let k = kz0; k <= kz1; k++) { const t = (k * TILE - az) / (bz - az); if (t > 0 && t < 1) ts.push(t); }
    if (ts.length > 2) ts.sort((a, b) => a - b);
    for (let j = 1; j < ts.length; j++) {
      const t0 = ts[j - 1], t1 = ts[j];
      if (t1 - t0 < 1e-12) continue;
      const tm = (t0 + t1) / 2;
      const tx = tileOf(ax + (bx - ax) * tm), tz = tileOf(az + (bz - az) * tm);
      const ox = tx * TILE, oz = tz * TILE;
      const x0 = clamp(Math.round((ax + (bx - ax) * t0 - ox) * 10)), z0 = clamp(Math.round((az + (bz - az) * t0 - oz) * 10));
      const x1 = clamp(Math.round((ax + (bx - ax) * t1 - ox) * 10)), z1 = clamp(Math.round((az + (bz - az) * t1 - oz) * 10));
      if (!cur || tx !== ctx || tz !== ctz) { emit(); cur = [x0, z0]; ctx = tx; ctz = tz; }
      const n = cur.length;
      if (cur[n - 2] !== x1 || cur[n - 1] !== z1) cur.push(x1, z1);
    }
  }
  emit();
}

// ---------------------------------------------------------------- pass A: boundary
log('reading boundary');
const memberGeom = new Map(); // way id -> int lon/lat flat (only relation members)
let cityRel = null;
{
  const rl = readline.createInterface({ input: fs.createReadStream(EXTRACT_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.startsWith('{"t":"r"')) {
      const o = JSON.parse(line);
      if (o.id === CITY_RELATION) cityRel = o;
    } else if (line.includes('"mm":1')) {
      const o = JSON.parse(line);
      if (o.mm) memberGeom.set(o.id, o.g);
    }
  }
}
if (!cityRel) throw new Error('city boundary relation not found in extract');
if (cityRel.partial) throw new Error('city boundary is incomplete; enlarge BBOX in config.mjs');
const relRings = (rel, roleTest) =>
  assembleRings(rel.m.filter((m) => roleTest(m.role)).map((m) => memberGeom.get(m.ref)).filter(Boolean)).map(project);
const cityRings = relRings(cityRel, (r) => r !== 'inner');
cityRings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
const CITY = cityRings[0];
if (!CITY) throw new Error('could not assemble the city boundary ring');
const cityAreaKm2 = Math.abs(signedArea(CITY)) / 1e6;
const inCity = (x, z) => pip(x, z, CITY);

// tile set = tiles that intersect the city polygon
const tileSet = new Set();
{
  const bb = bboxOf(CITY);
  for (let tx = tileOf(bb[0]); tx <= tileOf(bb[2]); tx++)
    for (let tz = tileOf(bb[1]); tz <= tileOf(bb[3]); tz++)
      if (inCity((tx + 0.5) * TILE, (tz + 0.5) * TILE)) tileSet.add(tkey(tx, tz));
  for (let i = 0, j = CITY.length - 2; i < CITY.length; j = i, i += 2) {
    const len = Math.hypot(CITY[i] - CITY[j], CITY[i + 1] - CITY[j + 1]);
    const steps = Math.max(1, Math.ceil(len / 50));
    for (let s = 0; s <= steps; s++)
      tileSet.add(tkey(tileOf(CITY[j] + ((CITY[i] - CITY[j]) * s) / steps), tileOf(CITY[j + 1] + ((CITY[i + 1] - CITY[j + 1]) * s) / steps)));
  }
}
const inTiles = (x, z) => tileSet.has(tkey(tileOf(x), tileOf(z)));
const anyInTiles = (p) => {
  for (let i = 0; i < p.length; i += 2) if (inTiles(p[i], p[i + 1])) return true;
  return false;
};
log(`city boundary: ${CITY.length / 2} pts, ${cityAreaKm2.toFixed(1)} km2, ${tileSet.size} tiles`);

// ---------------------------------------------------------------- pass B: features
const outlines = []; // buildings
const parts = []; // building:part
const roads = [], paths = [], rails = [];
const realTrees = [], treeRows = [];
const areas = []; // tile areas
const waters = [], greens = [], waterways = [];
const labels = [];
const districts = [];
const stats = { tagBuilding: {}, heightSource: { height: 0, levels: 0, neighbour: 0, default: 0 }, skipped: {} };
const bump = (o, k) => (o[k] = (o[k] || 0) + 1);

const ROAD = {
  motorway: ['motorway', 24], trunk: ['trunk', 24], primary: ['primary', 18], secondary: ['secondary', 14],
  tertiary: ['tertiary', 10], residential: ['residential', 7], unclassified: ['residential', 7],
  living_street: ['residential', 6], road: ['residential', 7], service: ['service', 5], raceway: ['service', 8],
  busway: ['service', 7],
  motorway_link: ['motorway', 8], trunk_link: ['trunk', 8], primary_link: ['primary', 7.5],
  secondary_link: ['secondary', 7], tertiary_link: ['tertiary', 6.5],
};
const PATH = { footway: 2.5, path: 2, pedestrian: 6, steps: 2.5, cycleway: 2.5, track: 3.5 };
const GREEN = (t) => {
  if (t.leisure === 'park' || t.leisure === 'nature_reserve' || t.tourism === 'zoo' || t.landuse === 'recreation_ground' || t.landuse === 'village_green' || t.leisure === 'playground') return 'park';
  if (t.leisure === 'garden' || t.landuse === 'orchard') return 'garden';
  if (t.landuse === 'forest' || t.natural === 'wood' || t.natural === 'scrub') return 'forest';
  if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') return 'cemetery';
  if (t.landuse === 'grass' || t.landuse === 'meadow' || t.landuse === 'flowerbed') return 'grass';
  return null;
};

function addBuilding(ref, id, tags, polys, isPart) {
  for (const poly of polys) {
    const area = Math.abs(signedArea(poly.outer)) - poly.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);
    if (area < 4) { bump(stats.skipped, 'building<4m2'); continue; }
    const [cx, cz] = centroid(poly.outer);
    if (!inTiles(cx, cz)) continue;
    if (!isPart) bump(stats.tagBuilding, tags.building);
    const b = { ref, id, outer: poly.outer, holes: poly.holes, area, cx, cz, tags, isPart };
    (isPart ? parts : outlines).push(b);
  }
}

function handleArea(ref, id, tags, polys) {
  if (!polys.length) return;
  if (yes(tags.building)) {
    if (tags.location === 'underground' || tags.building === 'proposed') return;
    return addBuilding(ref, id, tags, polys, false);
  }
  if (yes(tags['building:part'])) return addBuilding(ref, id, tags, polys, true);
  const name3 = tags.name || tags['name:uz'] ? names3(tags) : null;
  let kind = null;
  if (tags.highway) {
    if ((tags.highway === 'pedestrian' || tags.highway === 'footway') && (tags.area === 'yes' || ref[0] === 'r')) kind = 'pedestrian';
    else return;
  } else if (tags.place === 'square') kind = 'plaza';
  else if (tags.amenity === 'parking') {
    if (/underground|multi-storey|rooftop/.test(tags.parking || '')) return;
    kind = 'parking';
  } else if (tags.leisure === 'pitch') kind = 'sports';
  else if (tags.landuse === 'construction') kind = 'construction';
  if (tags.place === 'square' && name3) {
    const big = polys.reduce((a, b) => (Math.abs(signedArea(a.outer)) > Math.abs(signedArea(b.outer)) ? a : b));
    const [cx, cz] = centroid(big.outer);
    if (inCity(cx, cz)) labels.push({ x: cx, z: cz, n: name3, k: 'square', w: Math.abs(signedArea(big.outer)) });
  }
  if (kind) {
    for (const poly of polys) {
      const a = Math.abs(signedArea(poly.outer));
      if (a < 15) continue;
      const [cx, cz] = centroid(poly.outer);
      if (!inTiles(cx, cz)) continue;
      areas.push({ outer: poly.outer, holes: poly.holes, k: kind, cx, cz, names: kind === 'pedestrian' || kind === 'plaza' ? localNames(tags, true) : null });
    }
    return;
  }
  if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.landuse === 'reservoir' || tags.landuse === 'basin') {
    if (yes(tags.tunnel) || tags.covered === 'yes' || tags.location === 'underground' || tags.water === 'wastewater') return;
    for (const poly of polys) if (anyInTiles(poly.outer)) waters.push({ outer: poly.outer, holes: poly.holes, n: nameUz(tags) });
    return;
  }
  const gk = GREEN(tags);
  if (gk) {
    for (const poly of polys) {
      if (!anyInTiles(poly.outer)) continue;
      const a = Math.abs(signedArea(poly.outer));
      greens.push({ outer: poly.outer, holes: poly.holes, k: gk, area: a, dense: tags.landuse === 'orchard' ? 1 : 0, scrub: tags.natural === 'scrub' ? 1 : 0 });
      if (name3 && ((gk === 'park' && a >= 20000) || (gk === 'garden' && a >= 30000)) && tags.leisure !== 'playground') {
        const [cx, cz] = centroid(poly.outer);
        if (inCity(cx, cz)) labels.push({ x: cx, z: cz, n: name3, k: 'park', w: a });
      }
    }
  }
}

function handleLine(id, tags, p) {
  if (!anyInTiles(p)) return;
  if (tags.highway) {
    if (yes(tags.tunnel)) return bump(stats.skipped, 'tunnel road/path');
    if (tags.area === 'yes') return;
    const hw = tags.highway;
    const names = localNames(tags);
    const br = yes(tags.bridge) ? 1 : 0;
    if (ROAD[hw]) {
      const [k, dw] = ROAD[hw];
      let w = num(tags.width);
      const lanes = num(tags.lanes);
      const oneway = tags.oneway === 'yes' || tags.oneway === '-1' || tags.junction === 'roundabout';
      if (!(w >= 2.5 && w <= 60)) {
        if (lanes >= 1 && lanes <= 12) w = Math.max(hw === 'service' ? 3.5 : 4.5, lanes * 3.5 + 1);
        else if (hw === 'service') w = /driveway|parking_aisle|alley/.test(tags.service || '') ? 4 : 5;
        else w = oneway && !hw.endsWith('_link') && dw >= 10 ? Math.round(dw * 0.6) : dw;
      }
      roads.push({ id, p: dpLine(p, 0.25), w: Math.round(w * 10) / 10, k, names, br, link: hw.endsWith('_link') ? 1 : 0, hw });
    } else if (PATH[hw]) {
      let w = num(tags.width);
      if (!(w >= 1 && w <= 30)) w = PATH[hw];
      paths.push({ id, p: dpLine(p, 0.25), w: Math.round(w * 10) / 10, k: hw, names, br });
    } else bump(stats.skipped, 'highway=' + hw);
    return;
  }
  if (tags.railway) {
    if (yes(tags.tunnel) || tags.location === 'underground' || num(tags.layer) < 0) return bump(stats.skipped, 'tunnel rail');
    const k = tags.railway === 'tram' ? 'tram' : tags.railway === 'subway' ? 'subway' : 'rail';
    rails.push({ id, p: dpLine(p, 0.25), k, br: yes(tags.bridge) ? 1 : 0 });
    return;
  }
  if (tags.waterway) {
    const ww = tags.waterway;
    if (yes(tags.tunnel) || tags.location === 'underground') return;
    const n = nameUz(tags);
    let w = num(tags.width);
    if (!(w >= 0.5 && w <= 300)) {
      if (ww === 'river') w = 30;
      else if (ww === 'canal') w = n ? 12 : 5;
      else if (ww === 'stream') w = 3;
      else if ((ww === 'drain' || ww === 'ditch') && n) w = 2;
      else return;
    } else if (!/^(river|canal|stream|drain|ditch)$/.test(ww)) return;
    waterways.push({ p, w: Math.round(w * 10) / 10, n: n.replace(/^uz:/, '') });
    return;
  }
  if (tags.natural === 'tree_row') treeRows.push({ id, p });
}

log('reading features');
{
  const rl = readline.createInterface({ input: fs.createReadStream(EXTRACT_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    const o = JSON.parse(line);
    const tags = o.tags || {};
    if (o.t === 'n') {
      const x = toX(o.g[0] / 1e7), z = toZ(o.g[1] / 1e7);
      if (tags.natural === 'tree') { if (inTiles(x, z)) realTrees.push(x, z); }
      if ((tags.station === 'subway' || (tags.railway === 'station' && tags.subway === 'yes')) && tags.name && inTiles(x, z))
        labels.push({ x, z, n: names3(tags), k: 'metro', w: 0 });
      if (tags.place === 'square' && tags.name && inCity(x, z)) labels.push({ x, z, n: names3(tags), k: 'square', w: 0 });
    } else if (o.t === 'w') {
      const g = o.g;
      const closed = g.length >= 8 && g[0] === g[g.length - 2] && g[1] === g[g.length - 1];
      const p = project(g);
      const areaTagged = yes(tags.building) || yes(tags['building:part']) || tags.place === 'square' || tags.amenity || tags.leisure || tags.landuse ||
        tags.natural === 'water' || tags.natural === 'wood' || tags.natural === 'scrub' || tags.waterway === 'riverbank' || tags.tourism === 'zoo' ||
        (tags.highway && tags.area === 'yes');
      if (closed && areaTagged) handleArea('way/' + o.id, o.id, tags, [{ outer: p.slice(0, p.length - 2), holes: [] }]);
      else if (tags.highway || tags.railway || tags.waterway || tags.natural === 'tree_row') handleLine(o.id, tags, p);
    } else if (o.t === 'r') {
      if (o.id === CITY_RELATION) continue;
      if (tags.type === 'boundary') { districts.push(o); continue; }
      const outers = relRings(o, (r) => r !== 'inner');
      const inners = relRings(o, (r) => r === 'inner');
      const polys = outers.map((outer) => ({ outer, holes: [] }));
      for (const h of inners) {
        const host = polys.find((q) => pip(h[0], h[1], q.outer) || pip(h[2], h[3], q.outer));
        if (host) host.holes.push(h);
      }
      handleArea('relation/' + o.id, -o.id, tags, polys);
    }
  }
}
memberGeom.clear();
log(`raw: ${outlines.length} buildings, ${parts.length} parts, ${roads.length} roads, ${paths.length} paths, ${rails.length} rail, ${realTrees.length / 2} trees, ${areas.length} areas, ${waters.length} water, ${greens.length} green`);

// ---------------------------------------------------------------- building parts
const outlineIdx = new PolyIndex(100);
for (const b of outlines) outlineIdx.add(b.outer, b.holes);
const partArea = new Float64Array(outlines.length);
for (const pt of parts) {
  const hits = outlineIdx.findAll(pt.cx, pt.cz);
  let best = -1;
  for (const h of hits) if (best < 0 || outlines[h].area < outlines[best].area) best = h;
  pt.parent = best;
  if (best >= 0) partArea[best] += pt.area;
}
const buildings = [];
const parents = {}; // part id -> parent osm ref (for landmark tagging)
const buildingNames = {}; // building id -> [nr, ne] (applied to landmark buildings by tag-landmarks)
let droppedOutlines = 0, keptParts = 0, droppedParts = 0;
// neighbour hint: median building:levels of tagged buildings of similar footprint within ~150 m
const lvGrid = new Map();
const LG = 150;
for (const b of outlines) {
  const lv = num(b.tags['building:levels']);
  if (!(lv > 0 && lv <= 90) || b.area < 150) continue;
  const k = (Math.floor(b.cx / LG) + 4096) * 8192 + (Math.floor(b.cz / LG) + 4096);
  let l = lvGrid.get(k);
  if (!l) lvGrid.set(k, (l = []));
  l.push(b.cx, b.cz, b.area, lv);
}
function neighbourLevels(b) {
  if (b.area < 200) return 0;
  const ci = Math.floor(b.cx / LG), cj = Math.floor(b.cz / LG);
  const c = [];
  for (let a = ci - 1; a <= ci + 1; a++)
    for (let d = cj - 1; d <= cj + 1; d++) {
      const l = lvGrid.get((a + 4096) * 8192 + (d + 4096));
      if (!l) continue;
      for (let i = 0; i < l.length; i += 4) {
        if (Math.hypot(l[i] - b.cx, l[i + 1] - b.cz) > 150) continue;
        const r = l[i + 2] / b.area;
        if (r > 0.7 && r < 1.45) c.push(l[i + 3]);
      }
    }
  if (c.length < 2) return 0;
  c.sort((x, y) => x - y);
  return Math.round(c[(c.length - 1) >> 1]);
}
function finishBuilding(b, inherit) {
  const t = b.tags;
  const it = inherit ? inherit.tags : null;
  const own = t.height || t['building:levels'] || t.min_height || t['building:min_level'];
  const ht_tags = it && !own ? { ...it, 'building:part': t['building:part'] } : t;
  const base = inherit || b;
  const hasH = ht_tags.height || ht_tags['building:levels'];
  const H = classifyBuilding(ht_tags, base.area, base.id, hasH ? 0 : neighbourLevels(base), it || t);
  const kind = H.k;
  bump(stats.heightSource, H.src);
  const o = { id: b.id, ref: b.ref, outer: b.outer, holes: b.holes, area: b.area, cx: b.cx, cz: b.cz, ht: H.ht, mh: H.mh, lv: H.lv, k: kind };
  const rf = roofShape(t['roof:shape'] || (it && !b.isPart ? it['roof:shape'] : undefined));
  if (rf) o.rf = rf;
  const c = colour(t['building:colour'] || t['building:color'] || (it ? it['building:colour'] : undefined));
  if (c) o.c = c;
  const names = localNames(t, true, true) || (it ? localNames(it, true, true) : null);
  if (names) {
    o.n = names.n;
    // nr / ne are applied by tag-landmarks.mjs, only to landmark buildings
    if (names.nr || names.ne) buildingNames[b.id] = [names.nr || '', names.ne || ''];
  }
  buildings.push(o);
}
outlines.forEach((b, i) => {
  if (partArea[i] >= 0.6 * b.area) { b.dropped = true; droppedOutlines++; } else finishBuilding(b, null);
});
for (const pt of parts) {
  const par = pt.parent >= 0 ? outlines[pt.parent] : null;
  if (par && !par.dropped) { droppedParts++; continue; }
  if (par) parents[pt.id] = par.ref;
  finishBuilding(pt, par);
  keptParts++;
}
log(`buildings: ${buildings.length} (outlines replaced by parts: ${droppedOutlines}, parts kept: ${keptParts}, parts dropped: ${droppedParts})`);

// ---------------------------------------------------------------- spatial indexes
const bIdx = new PolyIndex(50);
for (const b of buildings) if (b.mh < 3) bIdx.add(b.outer, null);
const waterIdx = new PolyIndex(100);
for (const w of waters) waterIdx.add(w.outer, w.holes);
const areaIdx = new PolyIndex(50);
for (const a of areas) areaIdx.add(a.outer, a.holes);
const seg = new SegGrid(25, 4);
for (const r of roads) seg.addLine(r.p, r.w / 2, 0);
for (const r of rails) seg.addLine(r.p, 2.5, 0);
for (const r of paths) seg.addLine(r.p, r.w / 2, 1);
for (const w of waterways) seg.addLine(w.p, w.w / 2, 0);

// ---------------------------------------------------------------- tiles
const tiles = new Map();
const getTile = (tx, tz) => {
  const k = tkey(tx, tz);
  let t = tiles.get(k);
  if (!t) tiles.set(k, (t = { x: tx, z: tz, buildings: [], roads: [], paths: [], rail: [], areas: [], tReal: [], tStreet: [], tPark: [] }));
  return t;
};
for (const b of buildings) {
  const tx = tileOf(b.cx), tz = tileOf(b.cz);
  const poly = encodePoly(dpRing(b.outer, 0.1), b.holes.map((h) => dpRing(h, 0.1)), tx * TILE, tz * TILE);
  if (!poly) { bump(stats.skipped, 'degenerate building'); b.dead = true; continue; }
  const o = { id: b.id, p: poly.p };
  if (poly.h) o.h = poly.h;
  o.ht = b.ht; o.mh = b.mh; o.lv = b.lv; o.k = b.k;
  if (b.rf) o.rf = b.rf;
  if (b.c) o.c = b.c;
  if (b.n) o.n = b.n;
  getTile(tx, tz).buildings.push(o);
}
let roadKm = 0, pathKm = 0, railKm = 0;
for (const r of roads)
  splitByTiles(r.p, (tx, tz, p) => {
    if (!tileSet.has(tkey(tx, tz))) return;
    const o = { p, w: r.w, k: r.k };
    if (r.names) Object.assign(o, r.names);
    if (r.br) o.br = 1;
    getTile(tx, tz).roads.push(o);
    roadKm += lineLength(p) / 1e4;
  });
for (const r of paths)
  splitByTiles(r.p, (tx, tz, p) => {
    if (!tileSet.has(tkey(tx, tz))) return;
    const o = { p, w: r.w, k: r.k };
    if (r.names) Object.assign(o, r.names);
    if (r.br) o.br = 1;
    getTile(tx, tz).paths.push(o);
    pathKm += lineLength(p) / 1e4;
  });
for (const r of rails)
  splitByTiles(r.p, (tx, tz, p) => {
    if (!tileSet.has(tkey(tx, tz))) return;
    const o = { p, k: r.k };
    if (r.br) o.br = 1;
    getTile(tx, tz).rail.push(o);
    railKm += lineLength(p) / 1e4;
  });
for (const a of areas) {
  const tx = tileOf(a.cx), tz = tileOf(a.cz);
  const poly = encodePoly(dpRing(a.outer, 0.2), a.holes.map((h) => dpRing(h, 0.2)), tx * TILE, tz * TILE);
  if (!poly) continue;
  poly.k = a.k;
  if (a.names) Object.assign(poly, a.names);
  getTile(tx, tz).areas.push(poly);
}
log(`lines split: roads ${roadKm.toFixed(0)} km, paths ${pathKm.toFixed(0)} km, rail ${railKm.toFixed(0)} km`);

// ---------------------------------------------------------------- trees
const treeCells = new Map();
const TC = 5;
function treeFree(x, z, minD) {
  const ci = Math.floor(x / TC), cj = Math.floor(z / TC);
  const d2 = minD * minD;
  for (let a = ci - 1; a <= ci + 1; a++)
    for (let b = cj - 1; b <= cj + 1; b++) {
      const l = treeCells.get((a + 8192) * 16384 + (b + 8192));
      if (!l) continue;
      for (let i = 0; i < l.length; i += 2) if ((l[i] - x) ** 2 + (l[i + 1] - z) ** 2 < d2) return false;
    }
  return true;
}
function treeAdd(x, z, list) {
  const k = (Math.floor(x / TC) + 8192) * 16384 + (Math.floor(z / TC) + 8192);
  let l = treeCells.get(k);
  if (!l) treeCells.set(k, (l = []));
  l.push(x, z);
  getTile(tileOf(x), tileOf(z))[list].push(x, z);
}
const tc = { real: 0, row: 0, street: 0, park: 0 };
for (let i = 0; i < realTrees.length; i += 2) {
  const x = realTrees[i], z = realTrees[i + 1];
  if (!treeFree(x, z, 1.5)) continue;
  treeAdd(x, z, 'tReal'); tc.real++;
}
function walkLine(p, spacing, phase, cb) {
  let next = phase, acc = 0, idx = 0;
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], az = p[i - 1], dx = p[i] - ax, dz = p[i + 1] - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    while (next <= acc + len) {
      const t = (next - acc) / len;
      cb(ax + dx * t, az + dz * t, dx / len, dz / len, idx++);
      next += spacing;
    }
    acc += len;
  }
}
for (const r of treeRows)
  walkLine(r.p, 8, 2, (x, z) => {
    if (!inTiles(x, z) || bIdx.contains(x, z) || seg.near(x, z, 0.5, 0) || !treeFree(x, z, 3)) return;
    treeAdd(x, z, 'tReal'); tc.row++;
  });
const STREET = { trunk: 0.05, primary: 0.05, secondary: 0.08, tertiary: 0.15, residential: 0.3 };
const LIVING_SKIP = 0.55; // mahalla lanes (highway=living_street): sparse trees
for (const r of roads) {
  if (r.br || r.link || STREET[r.k] === undefined) continue;
  const skipP = r.hw === 'living_street' ? LIVING_SKIP : STREET[r.k];
  const spacing = (r.k === 'residential' ? 13 : 11) + 3 * hash01(r.id, 1);
  for (const side of [-1, 1]) {
    walkLine(r.p, spacing, side > 0 ? spacing * 0.5 : spacing, (x0, z0, ux, uz, i) => {
      const h1 = hash01(r.id, i * 4 + side + 2), h2 = hash01(r.id, i * 4 + side + 100003), h3 = hash01(r.id, i * 4 + side + 200003);
      if (h1 < skipP) return;
      const off = r.w / 2 + 2 + h2 * 0.8;
      const along = (h3 - 0.5) * 2.4;
      const x = x0 + ux * along - uz * side * off, z = z0 + uz * along + ux * side * off;
      if (!inTiles(x, z) || bIdx.contains(x, z) || seg.near(x, z, 1.2, 0) || waterIdx.contains(x, z) || !treeFree(x, z, 4.5)) return;
      treeAdd(x, z, 'tStreet'); tc.street++;
    });
  }
}
const PARK_STEP = { forest: 8, park: 14, garden: 12, cemetery: 15, grass: 0 };
greens.sort((a, b) => a.area - b.area);
for (const g of greens) {
  let step = PARK_STEP[g.k];
  if (g.dense) step = 9;
  if (g.scrub) step = 18;
  if (!step) continue;
  const bb = bboxOf(g.outer);
  const salt = step * 7919;
  for (let i = Math.floor(bb[0] / step); i <= Math.floor(bb[2] / step); i++)
    for (let j = Math.floor(bb[1] / step); j <= Math.floor(bb[3] / step); j++) {
      const x = (i + 0.1 + 0.8 * hash01(i * 65537 + j, salt)) * step, z = (j + 0.1 + 0.8 * hash01(j * 65537 + i, salt + 1)) * step;
      if (!pip(x, z, g.outer) || g.holes.some((h) => pip(x, z, h))) continue;
      if (!inTiles(x, z) || bIdx.contains(x, z) || seg.near(x, z, 1, 1) || waterIdx.contains(x, z) || areaIdx.contains(x, z) || !treeFree(x, z, 4)) continue;
      treeAdd(x, z, 'tPark'); tc.park++;
    }
}
log(`trees before cap: real ${tc.real}, rows ${tc.row}, street ${tc.street}, park ${tc.park}`);

// ---------------------------------------------------------------- skyline
const sky = new Map();
for (const b of buildings) {
  if (b.dead) continue;
  const cx = Math.floor(b.cx / 100), cz = Math.floor(b.cz / 100);
  const k = (cx + 2000) * 4000 + (cz + 2000);
  let c = sky.get(k);
  if (!c) sky.set(k, (c = { cx, cz, h: 0, a: 0 }));
  if (b.mh < 3) c.a += b.area;
  if (b.area >= 30 && b.ht > c.h) c.h = b.ht;
}
const skyCells = [];
for (const c of [...sky.values()].sort((a, b) => a.cx - b.cx || a.cz - b.cz)) {
  const cov = Math.min(255, Math.round((c.a / 10000) * 255));
  if (cov < 3 || c.h <= 0) continue;
  skyCells.push(c.cx, c.cz, Math.round(c.h), cov);
}

// ---------------------------------------------------------------- write tiles
fs.mkdirSync(TILES_DIR, { recursive: true });
for (const f of fs.readdirSync(TILES_DIR)) if (/^t_-?\d+_-?\d+\.json$/.test(f)) fs.unlinkSync(path.join(TILES_DIR, f));
const manifestTiles = [];
let totalBytes = 0, maxBytes = 0, maxTile = '', treeTotal = 0, cappedTiles = 0;
const totals = { buildings: 0, roads: 0, paths: 0, rail: 0, areas: 0 };
let minTX = Infinity, minTZ = Infinity, maxTX = -Infinity, maxTZ = -Infinity;
for (const t of [...tiles.values()].sort((a, b) => a.x - b.x || a.z - b.z)) {
  if (!tileSet.has(tkey(t.x, t.z))) continue;
  // tree cap: real trees first, then street trees, then park trees (both thinned deterministically)
  const thin = (arr, keep) => {
    if (arr.length / 2 <= keep) return arr;
    const idx = Array.from({ length: arr.length / 2 }, (_, i) => i);
    idx.sort((a, b) => hash01(Math.round(arr[2 * a] * 10), Math.round(arr[2 * a + 1] * 10)) - hash01(Math.round(arr[2 * b] * 10), Math.round(arr[2 * b + 1] * 10)));
    const out = [];
    for (const i of idx.slice(0, Math.max(0, keep))) out.push(arr[2 * i], arr[2 * i + 1]);
    return out;
  };
  const before = (t.tReal.length + t.tStreet.length + t.tPark.length) / 2;
  const real = thin(t.tReal, MAX_TREES_PER_TILE);
  const street = thin(t.tStreet, MAX_TREES_PER_TILE - real.length / 2);
  const park = thin(t.tPark, MAX_TREES_PER_TILE - real.length / 2 - street.length / 2);
  if (before > MAX_TREES_PER_TILE) cappedTiles++;
  const trees = [];
  const ox = t.x * TILE, oz = t.z * TILE;
  for (const arr of [real, street, park])
    for (let i = 0; i < arr.length; i += 2)
      trees.push(Math.min(4999, Math.max(0, Math.round((arr[i] - ox) * 10))), Math.min(4999, Math.max(0, Math.round((arr[i + 1] - oz) * 10))));
  const out = { v: 1, x: t.x, z: t.z, buildings: t.buildings, roads: t.roads, paths: t.paths, rail: t.rail, trees, areas: t.areas };
  if (!t.buildings.length && !t.roads.length && !t.paths.length && !t.rail.length && !trees.length && !t.areas.length) continue;
  const json = JSON.stringify(out);
  const bytes = Buffer.byteLength(json);
  fs.writeFileSync(path.join(TILES_DIR, `t_${t.x}_${t.z}.json`), json);
  manifestTiles.push({ x: t.x, z: t.z, b: t.buildings.length, kb: Math.max(1, Math.round(bytes / 1024)) });
  totalBytes += bytes;
  if (bytes > maxBytes) { maxBytes = bytes; maxTile = `t_${t.x}_${t.z}`; }
  treeTotal += trees.length / 2;
  totals.buildings += t.buildings.length; totals.roads += t.roads.length; totals.paths += t.paths.length;
  totals.rail += t.rail.length; totals.areas += t.areas.length;
  minTX = Math.min(minTX, t.x); minTZ = Math.min(minTZ, t.z); maxTX = Math.max(maxTX, t.x); maxTZ = Math.max(maxTZ, t.z);
}
const manifest = {
  v: 1, origin: [LAT0, LON0], tileSize: TILE,
  bounds: [minTX * TILE, minTZ * TILE, (maxTX + 1) * TILE, (maxTZ + 1) * TILE],
  tiles: manifestTiles,
};
fs.writeFileSync(path.join(TILES_DIR, 'manifest.json'), JSON.stringify(manifest));
fs.mkdirSync(DERIVED_DIR, { recursive: true });
fs.writeFileSync(PARENTS_FILE, JSON.stringify(parents));
fs.writeFileSync(BUILDING_NAMES_FILE, JSON.stringify(buildingNames));
log(`tiles written: ${manifestTiles.length}, ${(totalBytes / 1048576).toFixed(1)} MB, max ${maxTile} ${(maxBytes / 1024).toFixed(0)} KB, trees ${treeTotal} (${cappedTiles} tiles capped)`);

// ---------------------------------------------------------------- global.json
const g10 = (p) => p.map((v) => v); // meters; encodeRing scales by 10 with origin 0
const gWater = [];
for (const w of waters) {
  const a = Math.abs(signedArea(w.outer));
  if (a < 150) continue;
  const tol = a > 20000 ? 2 : 1;
  const poly = encodePoly(dpRing(g10(w.outer), tol), w.holes.filter((h) => Math.abs(signedArea(h)) > 100).map((h) => dpRing(h, tol)), 0, 0);
  if (poly) gWater.push(poly);
}
const gGreen = [];
const GREEN_MIN = { park: 400, garden: 500, forest: 500, cemetery: 500, grass: 800 };
for (const g of greens.sort((a, b) => b.area - a.area)) {
  if (g.area < GREEN_MIN[g.k]) continue;
  const tol = g.area > 50000 ? 3 : 1.5;
  const poly = encodePoly(dpRing(g.outer, tol), g.holes.filter((h) => Math.abs(signedArea(h)) > 400).map((h) => dpRing(h, tol)), 0, 0);
  if (!poly) continue;
  poly.k = g.k;
  gGreen.push(poly);
}
const gWaterways = [];
for (const w of waterways) {
  const p = encodeLine(dpLine(w.p, 1.5), 0, 0);
  if (!p) continue;
  const o = { p, w: w.w };
  if (w.n) o.n = w.n;
  gWaterways.push(o);
}
// district labels
const RU_DISTRICT = {
  bektemir: 'Бектемирский район', chilonzor: 'Чиланзарский район', mirobod: 'Мирабадский район',
  'mirzo ulugbek': 'Мирзо-Улугбекский район', olmazor: 'Алмазарский район', sergeli: 'Сергелийский район',
  shayhontohur: 'Шайхантахурский район', uchtepa: 'Учтепинский район', yakkasaroy: 'Яккасарайский район',
  yashnobod: 'Яшнабадский район', yunusobod: 'Юнусабадский район', 'yangi hayot': 'Янгихаётский район', yangihayot: 'Янгихаётский район',
};
for (const d of districts) {
  const name = cleanName(d.tags.name || '');
  if (d.partial || !/tuman/i.test(name)) continue;
  const rings = [];
  // member geometries were cleared; districts are re-read below if needed
  d._name = name;
}
{
  // re-read member ways of district relations (cheap second scan of member lines only)
  const need = new Set();
  for (const d of districts) if (d._name) for (const m of d.m) need.add(m.ref);
  const geom = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(EXTRACT_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"mm":1')) continue;
    const o = JSON.parse(line);
    if (need.has(o.id)) geom.set(o.id, o.g);
  }
  for (const d of districts) {
    if (!d._name) continue;
    const rings = assembleRings(d.m.filter((m) => m.role !== 'inner').map((m) => geom.get(m.ref)).filter(Boolean)).map(project);
    if (!rings.length) continue;
    rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
    let [cx, cz] = centroid(rings[0]);
    if (!inCity(cx, cz)) continue;
    if (d.label) { cx = toX(d.label[0] / 1e7); cz = toZ(d.label[1] / 1e7); }
    const base = d._name.replace(/\s*tumani?$/i, '').trim();
    const key = base.toLowerCase().replace(/[^a-z ]/g, '');
    const n3 = names3(d.tags);
    const n = {
      uz: `${base} tumani`,
      ru: cleanName(d.tags['name:ru']) || RU_DISTRICT[key] || n3.ru,
      en: cleanName(d.tags['name:en'] || '').replace(/\bdistrict\b/i, 'District') || `${base.replace(/'/g, '')} District`,
    };
    labels.push({ x: cx, z: cz, n, k: 'district', w: 1e12 });
  }
}
// dedupe labels (same kind + same name within 600 m), biggest first
labels.sort((a, b) => b.w - a.w);
const gLabels = [];
for (const l of labels) {
  if (!l.n.uz) continue;
  fixLabel(l);
  if (gLabels.some((o) => o.k === l.k && o.n.uz.toLowerCase() === l.n.uz.toLowerCase() && Math.hypot(o.x - l.x * 10, o.z - l.z * 10) < 6000)) continue;
  gLabels.push({ x: Math.round(l.x * 10), z: Math.round(l.z * 10), n: l.n, k: l.k });
}
const order = { district: 0, metro: 1, square: 2, park: 3 };
gLabels.sort((a, b) => order[a.k] - order[b.k] || a.n.uz.localeCompare(b.n.uz));
const global = {
  v: 1,
  water: gWater,
  waterways: gWaterways,
  green: gGreen,
  boundary: encodeRing(dpRing(CITY, 3), 0, 0, true),
  skyline: { cell: 100, cells: skyCells },
  labels: gLabels,
};
const gjson = JSON.stringify(global);
fs.writeFileSync(path.join(TILES_DIR, 'global.json'), gjson);
const part = (k) => (Buffer.byteLength(JSON.stringify(global[k])) / 1024).toFixed(0) + ' KB';
log(`global.json ${(Buffer.byteLength(gjson) / 1024).toFixed(0)} KB: water ${gWater.length} (${part('water')}), waterways ${gWaterways.length} (${part('waterways')}), green ${gGreen.length} (${part('green')}), skyline ${skyCells.length / 4} cells (${part('skyline')}), labels ${gLabels.length}`);

const labelCounts = {};
for (const l of gLabels) bump(labelCounts, l.k);
const kinds = {};
for (const b of buildings) if (!b.dead) bump(kinds, b.k);
const topTags = Object.fromEntries(Object.entries(stats.tagBuilding).sort((a, b) => b[1] - a[1]).slice(0, 25));
fs.writeFileSync(
  path.join(DERIVED_DIR, 'stats.json'),
  JSON.stringify({
    builtAt: new Date().toISOString(), cityAreaKm2, tiles: manifestTiles.length, tileBytes: totalBytes, maxTile, maxTileBytes: maxBytes,
    globalBytes: Buffer.byteLength(gjson), ...totals, trees: treeTotal, treeSources: tc, cappedTiles, roadKm, pathKm, railKm,
    heightSource: stats.heightSource, kinds, buildingTagTop: topTags, droppedOutlines, keptParts, droppedParts,
    water: gWater.length, waterways: gWaterways.length, green: gGreen.length, skylineCells: skyCells.length / 4, labels: labelCounts, skipped: stats.skipped,
    buildSeconds: (Date.now() - T0) / 1000,
  }, null, 1),
);
log('done');
