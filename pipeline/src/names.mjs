// Name helpers: Uzbek apostrophe normalisation, uz/ru/en transliteration and localized
// street names (`n`, `nr`, `ne` in the tiles; `{uz, ru, en}` for the global labels).

const ZW = /[​-‍⁠﻿­]/g;
const APOS = "'ʻʼ‘’`´ʹ′";
const OKINA = 'ʻ'; // ʻ in oʻ / gʻ
const TUTUQ = '’'; // ’ tutuq belgisi
const isLetter = (c) => !!c && /\p{L}/u.test(c);
export const isCyrillic = (s) => /[Ѐ-ӿ]/.test(s);
const squash = (s) => (s ? String(s).replace(ZW, '').replace(/\s+/g, ' ').trim() : '');

/**
 * Uzbek display name: zero-width characters removed, whitespace collapsed, and every
 * apostrophe-like mark after a letter turned into U+02BB after o/g (oʻ, gʻ) or U+2019
 * otherwise (tutuq belgisi). A few frequent OSM typos of "koʻchasi" are repaired.
 */
export function cleanName(raw) {
  const s = squash(raw).replace(/(\p{L})['ʻʼ‘’`´ʹ′]{2,}/gu, "$1'");
  if (!s) return '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (APOS.includes(c) && isLetter(s[i - 1])) out += /[oOgG]/.test(s[i - 1]) ? OKINA : TUTUQ;
    else out += c;
  }
  if (isCyrillic(out)) return out;
  return out
    .replace(/\b([Kk])ocha(si)?(?![\p{L}ʻ’])/gu, `$1o${OKINA}cha$2`)
    .replace(/\b([Kk])oʻch(?:si|as)(?![\p{L}ʻ’])/gu, `$1o${OKINA}chasi`);
}

/** Lower case with both Uzbek marks as "'" (same length as the input), for pattern matching. */
const foldUz = (s) => {
  let out = '';
  for (const c of s) {
    const l = c === OKINA || c === TUTUQ ? "'" : c.toLowerCase();
    out += l.length === 1 ? l : c;
  }
  return out;
};

// ---------------------------------------------------------------- transliteration
const C2L = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: TUTUQ, ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o' + OKINA, қ: 'q', ғ: 'g' + OKINA, ҳ: 'h',
};
const VOW = 'аеёиоуыэюяў';
/** Cyrillic (Uzbek or Russian) -> Uzbek Latin. */
export function cyr2lat(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const lo = ch.toLowerCase();
    let r = C2L[lo];
    if (r === undefined) { out += ch; continue; }
    if (lo === 'е') {
      const prev = i ? s[i - 1].toLowerCase() : ' ';
      if (!/[Ѐ-ӿ]/.test(prev) || VOW.includes(prev) || prev === 'ъ' || prev === 'ь') r = 'ye';
    }
    if (ch !== lo && r) r = r[0].toUpperCase() + r.slice(1);
    out += r;
  }
  return out;
}

const C2E = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};
/** Cyrillic (Russian or Uzbek) -> plain English-friendly Latin. */
export function cyr2en(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const lo = ch.toLowerCase();
    let r = C2E[lo];
    if (r === undefined) { out += ch; continue; }
    if (lo === 'д' && (s[i + 1] || '').toLowerCase() === 'ж') { r = 'j'; i++; }
    else if (lo === 'е') {
      const prev = i ? s[i - 1].toLowerCase() : ' ';
      if (!/[Ѐ-ӿ]/.test(prev) || VOW.includes(prev) || prev === 'ъ' || prev === 'ь') r = 'ye';
    } else if (lo === 'й' && i && 'иы'.includes(s[i - 1].toLowerCase()) && !isLetter(s[i + 1])) r = ''; // -ий, -ый -> -i, -y
    if (ch !== lo && r) r = r[0].toUpperCase() + r.slice(1);
    out += r;
  }
  return out;
}

// Established Russian / English forms that plain transliteration gets wrong.
const RU_WORDS = {
  toshkent: 'Ташкент', "o'zbekiston": 'Узбекистан', chilonzor: 'Чиланзар', yunusobod: 'Юнусабад', mirobod: 'Мирабад',
  olmazor: 'Алмазар', yashnobod: 'Яшнабад', yakkasaroy: 'Яккасарай', shayxontohur: 'Шайхантахур', buxoro: 'Бухара',
  "farg'ona": 'Фергана', xorazm: 'Хорезм', andijon: 'Андижан', "qo'qon": 'Коканд', termiz: 'Термез', bobur: 'Бабур',
  temur: 'Темур', olimjon: 'Алимджан', oybek: 'Айбек', "g'ulom": 'Гулям', moskva: 'Москва', "qo'yliq": 'Куйлюк',
};
const EN_WORDS = {
  toshkent: 'Tashkent', "o'zbekiston": 'Uzbekistan', buxoro: 'Bukhara', "farg'ona": 'Fergana', xorazm: 'Khorezm',
  samarqand: 'Samarkand', moskva: 'Moscow',
};
const WORD = /[\p{L}ʻ’]+/gu;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const L2C_DI = { sh: 'ш', ch: 'ч', yo: 'ё', yu: 'ю', ya: 'я', ye: 'е', ts: 'ц' };
const L2C = {
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н',
  o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з',
};
function wordToCyr(w) {
  const known = RU_WORDS[foldUz(w)];
  if (known) return known;
  let out = '';
  for (let i = 0; i < w.length; ) {
    const c = w[i];
    const lo = c.toLowerCase();
    const next = w[i + 1];
    const upper = c !== lo;
    let r, step = 1;
    if (c === OKINA || c === TUTUQ) { i++; continue; }
    if ((lo === 'o' || lo === 'g') && next === OKINA) { r = lo === 'o' ? 'у' : 'г'; step = 2; }
    else if (lo === 'i' && (next || '').toLowerCase() === 'y' && i + 2 === w.length && i > 0) { r = 'и'; step = 2; } // Navoiy -> Навои
    else if (next && L2C_DI[lo + next.toLowerCase()] && w[i + 2] !== OKINA) { r = L2C_DI[lo + next.toLowerCase()]; step = 2; }
    else {
      r = L2C[lo];
      if (r === undefined) r = c;
      else if (lo === 'e' && i === 0) r = 'э';
    }
    out += upper ? cap(r) : r;
    i += step;
  }
  return out;
}
/** Uzbek Latin -> Cyrillic readable by Russian speakers (approximate). */
export const lat2cyr = (s) => s.replace(WORD, wordToCyr);

/** Uzbek Latin -> plain English-friendly Latin (no U+02BB, x -> kh). */
export function uz2en(s) {
  return s.replace(WORD, (w) => {
    const known = EN_WORDS[foldUz(w)];
    if (known) return known;
    return w.replace(/[ʻ’]/g, '').replace(/X/g, 'Kh').replace(/x/g, 'kh');
  });
}

// ---------------------------------------------------------------- generic parts of street names
const ordinalEn = (n) => {
  const v = n % 100;
  return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
};
const NUMBERED = { "o'tish": ['проезд', 'Passage'], tor: ['переулок', 'Lane'], berk: ['тупик', 'Dead End'] };
const RE_NUMBERED = /^(.*?)\s*(?:(\d+)\s*-?\s*(?:(?:in|n)?chi\b)?\s*-?\s*)?(o'tish|tor|berk)\s+(?:ko'chasi|ko'cha|yo'li)$/;
// [pattern on the folded name, Russian generic (in front), English generic (behind)]
const SUFFIX = [
  [/^(.+?)\s+shoh\s+ko'chasi$/, 'проспект', 'Avenue'],
  [/^(.+?)\s+ko'cha(?:si)?$/, 'улица', 'Street'],
  [/^(.+?)\s+maydoni$/, 'площадь', 'Square'],
  [/^(.+?)\s+(?:mavzesi|dahasi)$/, 'массив', 'Quarter'],
  [/^(.+?)\s+xiyoboni$/, 'аллея', 'Alley', 'сквер', 'Garden'],
  [/^(.+?)\s+(?:nomidagi\s+)?(?:madaniyat\s+va\s+)?(?:istirohat\s+)?bog'i$/, 'парк', 'Park'],
  [/^(.+?)\s+mahallasi$/, 'махалля', 'Mahalla'],
  [/^(.+?)\s+ko'prigi$/, 'мост', 'Bridge'],
];

const PAREN = /^(.*[^\s(])\s*(\([^()]*\))$/; // "Bunyodkor shoh koʻchasi (dublyor)"
/**
 * Russian and English forms derived from an Uzbek Latin name: the proper part is
 * transliterated, the generic part translated. `area` picks сквер / Garden for "xiyoboni".
 */
export function deriveFromUz(n, area = false) {
  const par = PAREN.exec(n);
  if (par) {
    const d = deriveFromUz(par[1], area);
    const dub = foldUz(par[2]) === '(dublyor)';
    return { ru: `${d.ru} ${dub ? '(дублёр)' : lat2cyr(par[2])}`, en: `${d.en} ${dub ? '(service road)' : uz2en(par[2])}` };
  }
  const f = foldUz(n);
  if (f.length !== n.length) return { ru: lat2cyr(n), en: uz2en(n) };
  const base = (m) => n.slice(0, m[1].length).trim();
  let m = RE_NUMBERED.exec(f);
  if (m) {
    const b = base(m);
    const [gr, ge] = NUMBERED[m[3]];
    const num = m[2] ? Number(m[2]) : 0;
    if (!b) return { ru: num ? `${num}-й ${gr}` : cap(gr), en: num ? `${ordinalEn(num)} ${ge}` : ge };
    return {
      ru: num ? `${lat2cyr(b)} ${num}-й ${gr}` : `${gr} ${lat2cyr(b)}`,
      en: num ? `${uz2en(b)} ${ordinalEn(num)} ${ge}` : `${uz2en(b)} ${ge}`,
    };
  }
  m = /^(.+?)\s+(\d+)\s*-?\s*mavze(?:si)?$/.exec(f);
  if (m) return { ru: `${lat2cyr(base(m))}, ${m[2]}-й квартал`, en: `${uz2en(base(m))} Quarter ${m[2]}` };
  for (const [re, gr, ge, grArea, geArea] of SUFFIX) {
    m = re.exec(f);
    if (m) return { ru: `${area && grArea ? grArea : gr} ${lat2cyr(base(m))}`, en: `${uz2en(base(m))} ${area && geArea ? geArea : ge}` };
  }
  m = /^(.+?)\s+yo'li$/.exec(f);
  if (m) return { ru: `${lat2cyr(base(m))} йули`, en: `${uz2en(base(m))} Road` };
  return { ru: lat2cyr(n), en: uz2en(n) };
}

// Russian generic words and the adjective endings that agree with them.
const RU_GENERIC = {
  улица: /(ая|яя|ья)$/i, площадь: /(ая|яя|ья)$/i, аллея: /(ая|яя|ья)$/i,
  проспект: /(ый|ий|ой|-й)$/i, переулок: /(ый|ий|ой|-й)$/i, проезд: /(ый|ий|ой|-й)$/i, тупик: /(ый|ий|ой|-й)$/i,
  бульвар: /(ый|ий|ой|-й)$/i, парк: /(ый|ий|ой|-й)$/i, сквер: /(ый|ий|ой|-й)$/i, шоссе: /(ое|ее)$/i,
};
/**
 * OSM name:ru for a street: generic word in lower case; "Навои улица" becomes "улица Навои"
 * unless an agreeing adjective or a number precedes it ("Паркентская улица", "Райхон 1-й проезд").
 */
export function tidyRuStreet(raw) {
  // one spelling for the city's central name (OSM has both Тимура and Темура)
  const s = squash(raw).replace(/Амир(а?) Тимур/g, 'Амир$1 Темур');
  if (!s) return '';
  const par = PAREN.exec(s);
  if (par) return `${tidyRuStreet(par[1])} ${par[2]}`;
  const w = s.split(' ');
  if (w.length < 2) return s;
  const first = w[0].toLowerCase();
  if (RU_GENERIC[first]) { w[0] = first; return w.join(' '); }
  const last = w[w.length - 1].toLowerCase();
  const adj = RU_GENERIC[last];
  if (!adj) return s;
  const prev = w[w.length - 2];
  w[w.length - 1] = last;
  if (adj.test(prev) || /^\d+$/.test(prev)) return w.join(' ');
  return `${last} ${w.slice(0, -1).join(' ')}`;
}

// Cyrillic look-alikes that OSM mappers typed inside Latin names.
const HOMOGLYPH = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', к: 'k', А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X' };
const EN_GENERIC = /\b(street|avenue|passage|road|square|lane|alley|drive|highway|boulevard|park|garden|zoo|dead end)(?=$| \()/i;
/** OSM name:en: no Uzbek marks, generic word capitalised. Empty when it is not usable Latin text. */
export function tidyEn(raw) {
  let s = squash(raw);
  if (!s) return '';
  if (isCyrillic(s) && /[A-Za-z]/.test(s)) s = s.replace(/[Ѐ-ӿ]/g, (c) => HOMOGLYPH[c] ?? c);
  if (isCyrillic(s)) return '';
  s = s.replace(/\bAmir Timur\b/g, 'Amir Temur').replace(/([A-Za-z])[ʻʼ‘`]/g, (_, c) => (/[oOgG]/.test(c) ? c : `${c}'`));
  return s.replace(EN_GENERIC, (g) => g.replace(/\b[a-z]/g, (c) => c.toUpperCase()));
}

const RU_TO_EN = { улица: 'Street', проспект: 'Avenue', площадь: 'Square', переулок: 'Lane', проезд: 'Passage', тупик: 'Dead End', аллея: 'Alley', бульвар: 'Boulevard', шоссе: 'Highway' };
/** English form of a Russian street name ("улица Навои" -> "Navoi Street"). */
export function enFromRu(ru) {
  const w = ru.split(' ');
  if (w.length === 1) return RU_TO_EN[ru.toLowerCase()] || cyr2en(ru);
  const first = RU_TO_EN[w[0].toLowerCase()];
  if (first) return `${cyr2en(w.slice(1).join(' '))} ${first}`;
  const last = RU_TO_EN[w[w.length - 1].toLowerCase()];
  if (!last) return cyr2en(ru);
  const rest = w.slice(0, -1);
  const num = /^(\d+)-?[йяе]$/.exec(rest[rest.length - 1] || '');
  if (num) return `${cyr2en(rest.slice(0, -1).join(' '))} ${ordinalEn(Number(num[1]))} ${last}`.trim();
  return `${cyr2en(rest.join(' '))} ${last}`;
}

/** Uzbek display name for buildings/roads: name:uz, else name (may be Cyrillic). */
export function nameUz(tags) {
  return cleanName(tags['name:uz'] || tags.name || '');
}

/**
 * Tile names: `n` (Uzbek, see nameUz) plus `nr` / `ne` only when they differ from `n`.
 * Russian: name:ru (tidied), else the Cyrillic `n`, else derived from the Uzbek name.
 * English: name:en (tidied), else derived from the Uzbek or the Russian name.
 */
export function localNames(tags, area = false, building = false) {
  const n = nameUz(tags);
  if (!n) return null;
  const cyr = isCyrillic(n);
  if (building) {
    // buildings carry proper names and brands: only tagged translations, nothing derived
    const o = { n };
    const ru = isCyrillic(tags['name:ru'] || '') ? squash(tags['name:ru']) : '';
    const en = tidyEn(tags['name:en']) || (cyr ? cyr2en(n) : '');
    if (ru && ru !== n) o.nr = ru;
    if (en && en !== n) o.ne = en;
    return o;
  }
  // codes such as "M39" have nothing to translate
  const derived = cyr ? null : /[a-z]/.test(n) ? deriveFromUz(n, area) : { ru: n, en: n };
  const tagRu = tidyRuStreet(tags['name:ru']);
  const ru = (isCyrillic(tagRu) && tagRu) || (cyr ? tidyRuStreet(n) : derived.ru);
  const en = tidyEn(tags['name:en']) || (cyr ? enFromRu(isCyrillic(ru) ? ru : n) : derived.en);
  const o = { n };
  if (ru && ru !== n) o.nr = ru;
  if (en && en !== n) o.ne = en;
  return o;
}

/** { uz, ru, en } for labels; missing languages are derived. */
export function names3(tags) {
  const name = cleanName(tags.name);
  let uz = cleanName(tags['name:uz-Latn'] || tags['name:uz'] || '');
  if (!uz) uz = name;
  if (isCyrillic(uz)) uz = cyr2lat(uz);
  const derived = deriveFromUz(uz, true);
  let ru = squash(tags['name:ru']);
  if (!ru) ru = isCyrillic(name) ? name : derived.ru;
  const en = tidyEn(tags['name:en'] || tags.int_name) || derived.en;
  return { uz, ru, en };
}

// Latin look-alikes typed inside Cyrillic names ("Юнyc").
const HOMOGLYPH_RU = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к', A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', X: 'Х' };
const fixRu = (s) => s.replace(/[\p{L}]+/gu, (w) => (/[Ѐ-ӿ]/.test(w) && /[A-Za-z]/.test(w) ? w.replace(/[A-Za-z]/g, (c) => HOMOGLYPH_RU[c] ?? c) : w));
const U = OKINA;
// Corrections for labels whose OSM names are misspelt, Russian-only or carry old names.
const LABEL_FIX = {
  'district:Yangi hayot tumani': { uz: 'Yangihayot tumani', en: 'Yangihayot District' },
  'district:Shayhontohur tumani': { uz: 'Shayxontohur tumani' },
  'district:Bektemir tumani': { ru: 'Бектемирский район' },
  'metro:Amir Temur xiyoboni': { ru: 'Амир Темур хиёбони', en: 'Amir Temur Xiyoboni' },
  'metro:Ozbekiston': { uz: `O${U}zbekiston` },
  'metro:Qipchok': { uz: 'Qipchoq' },
  'metro:Chinor': { ru: 'Чинор', en: 'Chinor' },
  [`metro:Xalqlar do${U}stligi`]: { en: 'Xalqlar Dostligi' },
  'square:Mustaqillik maydoni': { ru: 'площадь Мустакиллик' },
  'square:Ploshad Kosmonavtov': { uz: 'Kosmonavtlar maydoni' },
  'square:Teatralnaya maydoni': { uz: 'Teatr maydoni' },
  'square:Dvorets aviastroiteley': { uz: 'Aviasozlar saroyi', en: 'Aircraft Builders Palace' },
  [`square:Xalqlar Do${U}stligi`]: { uz: `Xalqlar do${U}stligi maydoni`, ru: 'площадь Дружбы народов', en: 'Xalqlar Dostligi Square' },
  'park:Skver': { uz: 'Amir Temur xiyoboni', ru: 'сквер Амира Темура', en: 'Amir Temur Square' },
  'park:Akmalya Ikramova park': { uz: `Akmal Ikromov bog${U}i`, ru: 'парк Акмаля Икрамова', en: 'Akmal Ikramov Park' },
  'park:PKiO "Bogishamol"': { uz: `Bog${U}ishamol bog${U}i`, ru: 'парк «Богишамол»', en: 'Bogishamol Park' },
  [`park:Furqat istirohat va madaniyat bo${U}gi`]: { uz: `Furqat nomidagi madaniyat va istirohat bog${U}i`, ru: 'парк имени Фурката', en: 'Furqat Park' },
  [`park:G${U}afur G${U}ulom nomdagi istirohat bog${U}i`]: { uz: `G${U}afur G${U}ulom nomidagi istirohat bog${U}i`, ru: 'парк имени Гафура Гуляма', en: 'Gafur Gulyam Park' },
  [`park:"G${U}alaba Bogi" yodgorlik majmuasi`]: { uz: `G${U}alaba bog${U}i`, ru: 'Парк Победы', en: 'Victory Park' },
  'park:Anhor Lokomotiv Bogi': { uz: `Anhor Lokomotiv bog${U}i`, en: 'Anhor Lokomotiv Park' },
  'park:Botanical Garden named after Fyodor Rusanov': { uz: `Botanika bog${U}i`, ru: 'Ботанический сад', en: 'Botanical Garden' },
  [`park:O${U}zbekiston milliy bog${U}i`]: { en: 'Alisher Navoi National Park' },
  'park:Sergeli Markaziy Xiyoboni': { uz: 'Sergeli markaziy xiyoboni' },
  'park:Shahidlar xotirasi xiyoboni': { ru: 'аллея памяти жертв репрессий', en: 'Memorial Alley of the Victims of Repression' },
  'park:Adiblar xiyoboni': { en: "Writers' Alley" },
  'park:Moviy Gumbazlar xiyoboni': { uz: 'Moviy gumbazlar xiyoboni', ru: 'сквер «Голубые купола»', en: 'Blue Domes Garden' },
  [`park:Bolajon bog${U}i`]: { en: 'Bolajon Park' },
  [`park:Bobur nomidagi eko bog${U}i`]: { ru: 'экопарк имени Бабура' },
  'park:"Uchtepa" Eco Park': { uz: `Uchtepa ekobog${U}i`, ru: 'экопарк «Учтепа»', en: 'Uchtepa Eco Park' },
  [`park:Yangi O${U}zbekiston bog${U}i`]: { ru: 'парк «Янги Узбекистан»', en: 'Yangi Uzbekistan Park' },
  'park:Tashkent City Park': { ru: 'парк «Ташкент-Сити»' },
};
/** Final clean-up of a global label `{ n: {uz, ru, en}, k }` (in place). */
export function fixLabel(l) {
  const n = l.n;
  if (l.k === 'metro' || l.k === 'park') {
    // old Soviet names in brackets ("Novza (Hamza)") are dropped
    for (const k of ['uz', 'ru', 'en']) n[k] = n[k].replace(/\s*\([^()]*\)$/, '') || n[k];
  }
  n.ru = fixRu(n.ru);
  if (l.k !== 'metro' && l.k !== 'district') n.ru = tidyRuStreet(n.ru);
  Object.assign(n, LABEL_FIX[`${l.k}:${n.uz}`]);
  return l;
}
