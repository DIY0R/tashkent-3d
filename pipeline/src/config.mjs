// Shared configuration and geo helpers for the Toshkent 3D data pipeline.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const RAW_DIR = path.join(ROOT, 'data', 'raw');
export const DERIVED_DIR = path.join(RAW_DIR, 'derived');
export const TILES_DIR = path.join(ROOT, 'public', 'tiles');
export const LANDMARKS_FILE = process.env.LANDMARKS_FILE || path.join(ROOT, 'content', 'landmarks.json');
export const PBF_FILE = path.join(RAW_DIR, 'uzbekistan-latest.osm.pbf');
export const PBF_URL = 'https://download.geofabrik.de/asia/uzbekistan-latest.osm.pbf';
export const EXTRACT_FILE = path.join(DERIVED_DIR, 'tashkent-extract.ndjson');
export const PARENTS_FILE = path.join(DERIVED_DIR, 'building-parents.json');
export const BUILDING_NAMES_FILE = path.join(DERIVED_DIR, 'building-names.json');

export const LAT0 = 41.31108;
export const LON0 = 69.27966;
export const TILE = 500; // meters
export const CITY_RELATION = 2216724; // Toshkent shahri, admin_level=4
// Extract bbox (covers the whole city relation with a margin): s, w, n, e
export const BBOX = [41.14, 69.08, 41.46, 69.5];

const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KZ = 110574;
export const toX = (lon) => (lon - LON0) * KX;
export const toZ = (lat) => -(lat - LAT0) * KZ;
export const toLon = (x) => x / KX + LON0;
export const toLat = (z) => -z / KZ + LAT0;

export const USER_AGENT = 'toshkent3d-data-pipeline/1.0 (educational 3D city model; node fetch)';
