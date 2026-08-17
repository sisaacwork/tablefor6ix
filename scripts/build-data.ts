/**
 * Cleans data/raw/*.json into public/data/restaurants.json + coverage.json.
 * Purely local — never touches the network. Ends with a report including
 * unmapped cuisine tokens by frequency (the iteration loop for cuisine-map.json).
 *
 *   npm run data:build              build + report
 *   npm run data:build -- --strict  additionally fail if any token is unmapped (CI)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  RestaurantSchema,
  CuisineMapSchema,
  OverridesSchema,
  type Restaurant,
} from './lib/schema.ts';
import { loadCountries, verifyTopojsonJoin } from './lib/countries.ts';
import { tokenize, mapCuisines, normalizeName } from './lib/cuisine.ts';

const strict = process.argv.includes('--strict');
const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// ---- load inputs ----------------------------------------------------------
const countries = loadCountries();
verifyTopojsonJoin(countries);
const seatCodes = new Set(countries.seats.map((s) => s.iso3));
const entityCodes = new Set(countries.entities.map((e) => e.code));

const cuisineMap = CuisineMapSchema.parse(
  JSON.parse(readFileSync(dir('../data/cuisine-map.json'), 'utf8')),
);
const regionKeys = new Set(Object.keys(cuisineMap.regions));
for (const [token, entry] of Object.entries(cuisineMap.map)) {
  entry.countries?.forEach((c) => {
    if (!seatCodes.has(c)) throw new Error(`cuisine-map "${token}": unknown country ${c}`);
  });
  entry.regions?.forEach((r) => {
    if (!regionKeys.has(r)) throw new Error(`cuisine-map "${token}": undeclared region ${r}`);
  });
  entry.entities?.forEach((e) => {
    if (!entityCodes.has(e)) throw new Error(`cuisine-map "${token}": unknown entity ${e}`);
  });
}

const overrides = OverridesSchema.parse(
  JSON.parse(readFileSync(dir('../data/overrides.json'), 'utf8')),
);

const chainNames = new Set<string>(
  (
    JSON.parse(readFileSync(dir('../data/chains.json'), 'utf8')) as { names: string[] }
  ).names.map(normalizeName),
);

const rawFiles = readdirSync(dir('../data/raw'))
  .filter((f) => f.endsWith('.json'))
  .filter((f) => f !== 'dinesafe.json');
if (rawFiles.length === 0) throw new Error('No raw dumps in data/raw — run npm run data:pull first');

// ---- merge + clean --------------------------------------------------------
interface RawElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const dropCounts: Record<string, number> = {};
const drop = (reason: string) => {
  dropCounts[reason] = (dropCounts[reason] ?? 0) + 1;
};
const unmappedFreq = new Map<string, { count: number; examples: string[] }>();
const seen = new Map<string, Restaurant>();
let boundaryDupes = 0;

for (const file of rawFiles) {
  const dump = JSON.parse(readFileSync(dir(`../data/raw/${file}`), 'utf8'));
  const municipality: string = dump.municipality;
  for (const el of dump.elements as RawElement[]) {
    const id = `osm-${el.type}-${el.id}`;
    if (seen.has(id)) {
      boundaryDupes++;
      continue;
    }
    const tags = el.tags ?? {};
    const name = tags['name']?.trim();
    if (!name) {
      drop('no name');
      continue;
    }
    if (chainNames.has(normalizeName(name))) {
      drop('chain');
      continue;
    }
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) {
      drop('no coordinates');
      continue;
    }
    const mapping = mapCuisines(tokenize(tags['cuisine'] ?? ''), cuisineMap);
    for (const token of mapping.unmapped) {
      const entry = unmappedFreq.get(token) ?? { count: 0, examples: [] };
      entry.count++;
      if (entry.examples.length < 3) entry.examples.push(name);
      unmappedFreq.set(token, entry);
    }
    if (!mapping.countries.size && !mapping.regions.size && !mapping.entities.size) {
      drop(mapping.unmapped.length ? 'only unmapped cuisines' : 'only dropped cuisines');
      continue;
    }
    const address =
      tags['addr:housenumber'] && tags['addr:street']
        ? `${tags['addr:housenumber']} ${tags['addr:street']}`
        : (tags['addr:street'] ?? null);
    seen.set(id, {
      id,
      name,
      countries: [...mapping.countries].sort(),
      regions: [...mapping.regions].sort(),
      entities: [...mapping.entities].sort(),
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      address,
      municipality,
      neighbourhood: tags['addr:suburb'] ?? null,
      website: tags['website'] ?? tags['contact:website'] ?? null,
      verified: false,
      note: null,
      source: 'osm',
    });
  }
}

// ---- near-duplicate pass (node + building way for the same place) ---------
const byNameCell = new Map<string, Restaurant>();
const nearDupes: string[] = [];
for (const r of seen.values()) {
  const key = `${normalizeName(r.name)}|${r.lat.toFixed(3)}|${r.lng.toFixed(3)}`;
  const existing = byNameCell.get(key);
  if (!existing) {
    byNameCell.set(key, r);
    continue;
  }
  // Prefer the node (usually the actual POI) over the building outline.
  const keep = existing.id.startsWith('osm-node-') ? existing : r;
  const discard = keep === existing ? r : existing;
  byNameCell.set(key, keep);
  nearDupes.push(discard.id);
}
let restaurants = [...byNameCell.values()];

// ---- DineSafe liveness cross-check (City of Toronto only) -----------------
// A Toronto restaurant with no licensed food premise of a matching name
// nearby is almost certainly closed. Escape hatch: overrides.keepIds.
interface DinesafeEntry {
  name: string;
  lat: number;
  lng: number;
}
let dinesafeDropped: Restaurant[] = [];
const dinesafePath = dir('../data/raw/dinesafe.json');
if (existsSync(dinesafePath)) {
  const dinesafe = JSON.parse(readFileSync(dinesafePath, 'utf8')) as {
    establishments: DinesafeEntry[];
  };
  // Generic words that don't identify a specific restaurant — a shared
  // distinctive token ("kabul", "kibo") means same place renamed slightly,
  // a shared generic one ("sushi", "grill") does not.
  const GENERIC = new Set([
    'restaurant', 'cafe', 'caffe', 'coffee', 'kitchen', 'house', 'grill', 'grille', 'express',
    'sushi', 'ramen', 'pizza', 'pizzeria', 'shawarma', 'kebab', 'kabob', 'kabab', 'noodle',
    'noodles', 'thai', 'chinese', 'indian', 'japanese', 'korean', 'vietnamese', 'halal',
    'food', 'foods', 'eatery', 'diner', 'bistro', 'cuisine', 'authentic', 'original',
    'famous', 'golden', 'royal', 'star', 'king', 'queen', 'chef', 'taste', 'spice', 'curry',
    'roti', 'tandoori', 'wok', 'garden', 'palace', 'villa', 'casa', 'little', 'great',
  ]);
  const distinctiveTokens = (name: string): Set<string> =>
    new Set(
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4 && !GENERIC.has(t)),
    );

  const CELL = 0.002; // ~200m grid
  const grid = new Map<string, { norm: string; tokens: Set<string>; lat: number; lng: number }[]>();
  for (const e of dinesafe.establishments) {
    const key = `${Math.round(e.lat / CELL)}|${Math.round(e.lng / CELL)}`;
    const bucket = grid.get(key) ?? [];
    bucket.push({ norm: normalizeName(e.name), tokens: distinctiveTokens(e.name), lat: e.lat, lng: e.lng });
    grid.set(key, bucket);
  }

  const bigrams = (s: string): Set<string> => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const dice = (a: string, b: string): number => {
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    const A = bigrams(a);
    const B = bigrams(b);
    let hits = 0;
    for (const g of A) if (B.has(g)) hits++;
    return (2 * hits) / (A.size + B.size);
  };
  const metres = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const dLat = (lat2 - lat1) * 111_320;
    const dLng = (lng2 - lng1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
    return Math.hypot(dLat, dLng);
  };

  const nameMatches = (a: string, b: string, aTokens: Set<string>, bTokens: Set<string>): boolean =>
    a === b ||
    (a.length >= 5 && b.includes(a)) ||
    (b.length >= 5 && a.includes(b)) ||
    dice(a, b) >= 0.72 ||
    [...aTokens].some((t) => bTokens.has(t));

  const keepIds = new Set(overrides.keepIds);
  const alive = (r: Restaurant): boolean => {
    if (r.municipality !== 'Toronto' || r.source !== 'osm' || keepIds.has(r.id)) return true;
    const norm = normalizeName(r.name);
    const tokens = distinctiveTokens(r.name);
    const ci = Math.round(r.lat / CELL);
    const cj = Math.round(r.lng / CELL);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const e of grid.get(`${ci + di}|${cj + dj}`) ?? []) {
          if (metres(r.lat, r.lng, e.lat, e.lng) <= 150 && nameMatches(norm, e.norm, tokens, e.tokens))
            return true;
        }
      }
    }
    return false;
  };

  dinesafeDropped = restaurants.filter((r) => !alive(r));
  restaurants = restaurants.filter((r) => !dinesafeDropped.includes(r));
} else {
  console.warn('⚠ data/raw/dinesafe.json missing — liveness check skipped (npm run data:dinesafe)');
}

// ---- overrides overlay ----------------------------------------------------
const staleOverrides: string[] = [];
const removeIds = new Set(overrides.remove.map((r) => r.id));
for (const { id } of overrides.remove) {
  if (!restaurants.some((r) => r.id === id)) staleOverrides.push(`remove ${id}`);
}
restaurants = restaurants.filter((r) => !removeIds.has(r.id));
for (const [id, patch] of Object.entries(overrides.patch)) {
  const target = restaurants.find((r) => r.id === id);
  if (!target) {
    staleOverrides.push(`patch ${id}`);
    continue;
  }
  Object.assign(target, patch);
}
for (const added of overrides.add) {
  if (!added.id.startsWith('manual-')) throw new Error(`overrides.add id must start with "manual-": ${added.id}`);
  restaurants.push(added);
}
restaurants.sort((a, b) => a.id.localeCompare(b.id));

// ---- validate -------------------------------------------------------------
const municipalityNames = new Set<string>();
for (const r of restaurants) {
  RestaurantSchema.parse(r);
  municipalityNames.add(r.municipality);
  for (const c of r.countries) {
    if (!seatCodes.has(c)) throw new Error(`${r.id}: unknown country ${c}`);
    if (regionKeys.has(c)) throw new Error(`${r.id}: region "${c}" leaked into countries[]`);
  }
  r.regions.forEach((x) => {
    if (!regionKeys.has(x)) throw new Error(`${r.id}: unknown region ${x}`);
  });
  r.entities.forEach((x) => {
    if (!entityCodes.has(x)) throw new Error(`${r.id}: unknown entity ${x}`);
  });
}

// ---- coverage -------------------------------------------------------------
type ScopeKey = 'gta' | 'toronto';
function coverageFor(scope: ScopeKey) {
  const subset = scope === 'gta' ? restaurants : restaurants.filter((r) => r.municipality === 'Toronto');
  const countryCounts: Record<string, number> = {};
  for (const s of countries.seats) countryCounts[s.iso3] = 0;
  const entityCounts: Record<string, number> = {};
  for (const e of countries.entities) entityCounts[e.code] = 0;
  const regionCounts: Record<string, number> = {};
  for (const k of regionKeys) regionCounts[k] = 0;
  for (const r of subset) {
    r.countries.forEach((c) => (countryCounts[c] = (countryCounts[c] ?? 0) + 1));
    r.entities.forEach((e) => (entityCounts[e] = (entityCounts[e] ?? 0) + 1));
    r.regions.forEach((g) => (regionCounts[g] = (regionCounts[g] ?? 0) + 1));
  }
  return { countries: countryCounts, entities: entityCounts, regions: regionCounts };
}
const gta = coverageFor('gta');
const toronto = coverageFor('toronto');
const covered = (c: Record<string, number>) => Object.values(c).filter((n) => n > 0).length;
const coverage = {
  generatedAt: new Date().toISOString().slice(0, 10),
  seats: countries.seats.length,
  scopes: { gta, toronto },
  totals: {
    gta: { covered: covered(gta.countries), missing: countries.seats.length - covered(gta.countries) },
    toronto: { covered: covered(toronto.countries), missing: countries.seats.length - covered(toronto.countries) },
  },
};
z.record(z.string(), z.number()).parse(gta.countries);
if (Object.keys(gta.countries).length !== 195) throw new Error('coverage must have exactly 195 country keys');

// ---- write ----------------------------------------------------------------
mkdirSync(dir('../public/data'), { recursive: true });
// one record per line: compact but diff-stable
const restaurantsJson = '[\n' + restaurants.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n';
writeFileSync(dir('../public/data/restaurants.json'), restaurantsJson);
writeFileSync(dir('../public/data/coverage.json'), JSON.stringify(coverage, null, 1) + '\n');

// ---- report ---------------------------------------------------------------
const byMuni = new Map<string, number>();
for (const r of restaurants) byMuni.set(r.municipality, (byMuni.get(r.municipality) ?? 0) + 1);
const topCountries = Object.entries(gta.countries)
  .filter(([, n]) => n > 0)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);

console.log(`\n=== tablefor6ix data build ===`);
console.log(`Restaurants: ${restaurants.length} (boundary dupes merged: ${boundaryDupes}, near-dupes merged: ${nearDupes.length})`);
if (dinesafeDropped.length) {
  console.log(`DineSafe liveness: dropped ${dinesafeDropped.length} Toronto entries with no licensed match`);
  console.log(`  sample: ${dinesafeDropped.slice(0, 8).map((r) => r.name).join(' · ')}`);
}
console.log(`Municipalities: ${[...byMuni.entries()].map(([m, n]) => `${m} ${n}`).join(', ')}`);
console.log(`Dropped: ${Object.entries(dropCounts).map(([r, n]) => `${r}: ${n}`).join(', ') || 'none'}`);
console.log(`\nCoverage — GTA: ${coverage.totals.gta.covered}/195 · Toronto only: ${coverage.totals.toronto.covered}/195`);
console.log(`Entities (GTA): ${Object.entries(gta.entities).map(([e, n]) => `${e} ${n}`).join(', ')}`);
console.log(`Regions (GTA): ${Object.entries(gta.regions).map(([r, n]) => `${r} ${n}`).join(', ')}`);
console.log(`\nTop countries: ${topCountries.map(([c, n]) => `${c} ${n}`).join(', ')}`);
if (staleOverrides.length) console.log(`\n⚠ Stale overrides: ${staleOverrides.join(', ')}`);

if (unmappedFreq.size) {
  const sorted = [...unmappedFreq.entries()].sort((a, b) => b[1].count - a[1].count);
  const affected = sorted.reduce((sum, [, v]) => sum + v.count, 0);
  console.log(`\nUNMAPPED CUISINES (${sorted.length} tokens, ${affected} occurrences):`);
  for (const [token, { count, examples }] of sorted.slice(0, 40)) {
    console.log(`  ${String(count).padStart(4)}  ${token.padEnd(24)} (e.g. ${examples.join('; ')})`);
  }
  if (sorted.length > 40) console.log(`  … and ${sorted.length - 40} more`);
  if (strict) {
    console.error('\n--strict: unmapped cuisines remain; map or drop them in data/cuisine-map.json');
    process.exit(1);
  }
} else {
  console.log('\nAll cuisine tokens mapped or dropped. ✓');
}
