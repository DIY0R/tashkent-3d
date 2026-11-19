// Building classification and height rules. Everything is deterministic (hash of the OSM id).
import { hash01 } from './geom.mjs';

export const LEVEL_H = 3.2;
const num = (v) => {
  if (v === undefined) return NaN;
  const s = String(v).replace(',', '.');
  let n = parseFloat(s);
  if (/ft|'/.test(s)) n *= 0.3048;
  return Number.isFinite(n) ? n : NaN;
};

const KIND = {
  house: 'house', detached: 'house', semidetached_house: 'house', bungalow: 'house', terrace: 'house', hut: 'house',
  cabin: 'house', farm: 'house', villa: 'house', static_caravan: 'house',
  apartments: 'apartments', dormitory: 'apartments', appartments: 'apartments',
  residential: 'residential',
  commercial: 'commercial', office: 'office',
  retail: 'retail', supermarket: 'retail', kiosk: 'retail', shop: 'retail', store: 'retail', mall: 'retail', marketplace: 'retail',
  industrial: 'industrial', manufacture: 'industrial', factory: 'industrial',
  warehouse: 'warehouse', hangar: 'warehouse', storage_tank: 'warehouse',
  school: 'school', kindergarten: 'school',
  university: 'university', college: 'university',
  hospital: 'hospital', clinic: 'hospital',
  mosque: 'religious', church: 'religious', cathedral: 'religious', chapel: 'religious', religious: 'religious',
  temple: 'religious', synagogue: 'religious', shrine: 'religious', madrasa: 'religious', monastery: 'religious',
  government: 'government',
  public: 'public', civic: 'public', train_station: 'public', transportation: 'public', stadium: 'public',
  sports_hall: 'public', sports_centre: 'public', grandstand: 'public', pavilion: 'public', theatre: 'public',
  museum: 'public', library: 'public', station: 'public',
  hotel: 'hotel',
  garage: 'garage', garages: 'garage', carport: 'garage', parking: 'garage',
  shed: 'shed', greenhouse: 'shed', barn: 'shed', sty: 'shed', cowshed: 'shed', stable: 'shed', toilets: 'shed',
  service: 'shed', guardhouse: 'shed', container: 'shed', farm_auxiliary: 'shed', transformer_tower: 'shed',
};
const AMENITY = {
  school: 'school', kindergarten: 'school', music_school: 'school', university: 'university', college: 'university',
  hospital: 'hospital', clinic: 'hospital', doctors: 'hospital', place_of_worship: 'religious',
  townhall: 'government', police: 'government', courthouse: 'government', embassy: 'government',
  public_building: 'public', community_centre: 'public', theatre: 'public', library: 'public', arts_centre: 'public',
  cinema: 'public', marketplace: 'retail', cafe: 'retail', restaurant: 'retail', fast_food: 'retail', pharmacy: 'retail',
  fuel: 'retail', car_wash: 'retail', bank: 'commercial', post_office: 'public', toilets: 'shed', shelter: 'shed',
};

/** kind from explicit tags only; 'other' when unknown (building=yes etc.) */
function taggedKind(t) {
  let k = KIND[t.building] || 'other';
  if (k === 'other') {
    if (t.amenity && AMENITY[t.amenity]) k = AMENITY[t.amenity];
    else if (t.tourism === 'hotel' || t.tourism === 'hostel' || t.tourism === 'guest_house') k = 'hotel';
    else if (t.tourism === 'museum') k = 'public';
    else if (t.office === 'government' || t.government) k = 'government';
    else if (t.office) k = 'office';
    else if (t.shop) k = 'retail';
    else if (t.religion && t.building !== 'yes') k = 'religious';
  }
  return k;
}

// Level distributions for untagged buildings, derived from the tagged buildings of the same
// footprint class in Tashkent (see README "Height rules"). [levels, cumulative probability]
const pick = (table, u) => {
  for (const [lv, p] of table) if (u < p) return lv;
  return table[table.length - 1][0];
};
const YES_LEVELS = [
  [300, [[1, 0.55], [2, 1]]],
  [450, [[1, 0.25], [2, 0.65], [3, 0.77], [4, 0.9], [5, 0.95], [9, 1]]],
  [700, [[1, 0.1], [2, 0.32], [3, 0.45], [4, 0.65], [5, 0.75], [7, 0.83], [9, 0.95], [12, 1]]],
  [1500, [[1, 0.05], [2, 0.19], [3, 0.3], [4, 0.68], [5, 0.82], [7, 0.87], [9, 0.98], [12, 1]]],
  [5000, [[2, 0.15], [3, 0.37], [4, 0.65], [5, 0.78], [7, 0.85], [9, 0.97], [12, 1]]],
  [Infinity, [[1, 0.05], [2, 0.33], [3, 0.75], [4, 0.95], [5, 1]]],
];
const APT_LEVELS = [
  [450, [[4, 0.45], [5, 0.65], [9, 0.9], [12, 1]]],
  [700, [[4, 0.4], [5, 0.6], [7, 0.7], [9, 0.9], [12, 1]]],
  [2500, [[4, 0.6], [5, 0.82], [9, 0.97], [12, 1]]],
  [Infinity, [[5, 0.4], [9, 0.85], [12, 1]]],
];
const byArea = (tables, area) => tables.find(([max]) => area < max)[1];

/**
 * tags: effective tags (for parts without own height tags: the parent's).
 * hintLv: median levels of similar tagged neighbours (or 0).
 * Returns { k, ht, mh, lv, src } with src in height|levels|neighbour|default.
 */
export function classifyBuilding(tags, area, id, hintLv = 0, kindTags = tags) {
  let k = taggedKind(kindTags);
  const u = hash01(id, 7);
  const v = hash01(id, 13);
  let height = num(tags.height ?? tags['building:height']);
  if (!(height >= 1.5 && height <= 420)) height = NaN;
  let levels = num(tags['building:levels']);
  if (!(levels > 0 && levels <= 90)) levels = NaN;
  let roofH = num(tags['roof:height']);
  if (!(roofH > 0 && roofH < 60)) {
    const rl = num(tags['roof:levels']);
    roofH = rl > 0 && rl < 10 ? rl * 3 : 0;
  }
  let mh = num(tags.min_height);
  if (!(mh > 0 && mh < 400)) {
    const ml = num(tags['building:min_level']);
    mh = ml > 0 && ml < 90 ? ml * LEVEL_H : 0;
  }
  let ht, lv, src;
  if (height) {
    ht = height;
    lv = levels || Math.max(1, Math.round((height - roofH) / LEVEL_H));
    src = 'height';
  } else if (levels) {
    lv = levels;
    ht = levels * LEVEL_H + roofH;
    src = 'levels';
  } else {
    src = 'default';
    switch (k) {
      case 'house': lv = area > 200 && u < 0.45 ? 2 : u < 0.12 ? 2 : 1; ht = lv * LEVEL_H + 0.3 + v * 1.2; break;
      case 'apartments': lv = hintLv || pick(byArea(APT_LEVELS, area), u); ht = lv * LEVEL_H; break;
      case 'residential': lv = hintLv || (area < 300 ? (u < 0.5 ? 1 : 2) : u < 0.5 ? 2 : 3); ht = lv * LEVEL_H + v * 0.8; break;
      case 'commercial': lv = hintLv || 1 + Math.floor(u * 3); ht = lv * 3.6 + 0.6; break;
      case 'office': lv = hintLv || 3 + Math.floor(u * 5); ht = lv * 3.4; break;
      case 'retail': lv = hintLv || (area > 1500 ? 2 : 1); ht = lv * 4 + 0.5 + v * 1.5; break;
      case 'industrial': lv = 2; ht = 6 + u * 5; break;
      case 'warehouse': lv = 1; ht = 5 + u * 4; break;
      case 'school': lv = hintLv || (area < 400 ? 1 : area < 1200 ? 2 : 3); ht = lv * 3.5 + 0.5; break;
      case 'university': lv = hintLv || 4 + Math.floor(u * 2); ht = lv * 3.6; break;
      case 'hospital': lv = hintLv || 3 + Math.floor(u * 3); ht = lv * 3.4; break;
      case 'religious': lv = 1; ht = 7 + u * 6; break;
      case 'government': lv = hintLv || 4 + Math.floor(u * 3); ht = lv * 3.6; break;
      case 'public': lv = 2; ht = 7 + u * 5; break;
      case 'hotel': lv = hintLv || 5 + Math.floor(u * 5); ht = lv * LEVEL_H; break;
      case 'garage': lv = 1; ht = 2.6 + u * 0.6; break;
      case 'shed': lv = 1; ht = 2.4 + u * 0.8; break;
      default:
        if (tags.building === 'roof' || tags['building:part'] === 'roof') { lv = 1; ht = 4 + u * 1.5; }
        else if (area < 30) { lv = 1; ht = 2.5 + u * 0.8; }
        else if (area < 200) { lv = u < 0.15 ? 2 : 1; ht = lv * LEVEL_H + 0.3 + v * 1.2; }
        else {
          lv = hintLv || pick(byArea(YES_LEVELS, area), u);
          ht = lv * LEVEL_H + (lv <= 2 ? 0.3 + v * 1.2 : 0);
          if (area >= 5000 && !hintLv) ht = lv * 4;
        }
        if (hintLv && area >= 200) src = 'neighbour';
    }
    if (hintLv && k !== 'other' && lv === hintLv) src = 'neighbour';
  }
  // refine the generic kind (building=yes) from size and levels
  if (k === 'other' && tags.building !== 'roof' && tags['building:part'] !== 'roof' && !kindTags.name) {
    if (area < 30) k = 'shed';
    else if (lv <= 2 && area < 450) k = 'house';
    else if (lv >= 4 && area >= 250 && area < 3000) k = 'apartments';
  }
  if (mh >= ht - 0.5) mh = 0;
  return { k, ht: Math.round(ht * 10) / 10, mh: Math.round(mh * 10) / 10, lv: Math.max(1, Math.round(lv)), src };
}

const ROOF = {
  flat: 'flat', gabled: 'gabled', hipped: 'hipped', 'half-hipped': 'hipped', gambrel: 'gabled', mansard: 'hipped',
  pyramidal: 'pyramidal', dome: 'dome', onion: 'dome', round: 'round', skillion: 'skillion', saltbox: 'gabled',
  double_saltbox: 'gabled', quadruple_saltbox: 'gabled', cone: 'pyramidal',
};
export const roofShape = (v) => (v ? ROOF[v] || null : null);

const NAMED = {
  white: '#f2f2f2', black: '#222222', grey: '#9a9a9a', gray: '#9a9a9a', red: '#b5483a', brown: '#8a6248', yellow: '#e0cf8a',
  beige: '#e3d6bd', blue: '#5b84b1', green: '#6f9b6a', orange: '#d9905a', pink: '#e3b3b3', silver: '#c0c4c8',
  cream: '#efe6cf', tan: '#d2b48c', lightgrey: '#cfcfcf', lightgray: '#cfcfcf', darkgrey: '#666666', darkgray: '#666666',
  maroon: '#7a2f2f', turquoise: '#4fb3b0', lightblue: '#a9c9e2', sandybrown: '#d9a066', ivory: '#f5f1e3',
};
export function colour(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase().replace(/[\s_-]/g, '');
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return NAMED[s] || null;
}
