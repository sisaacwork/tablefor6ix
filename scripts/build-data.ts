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
import { tokenize, mapCuisines, normalizeName, makeChainMatcher } from './lib/cuisine.ts';
import { PointGrid, toNamedPoint } from './lib/match.ts';
import { withBbox, containsPoint } from './lib/geo.ts';

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

const isChain = makeChainMatcher(
  (JSON.parse(readFileSync(dir('../data/chains.json'), 'utf8')) as { names: string[] }).names,
);

// "Amal (Toronto)" / "Hey Noodles (Scarborough)" → the suffix is a locality
// marker, not part of the name. Municipalities plus former boroughs.
const LOCALITY_SUFFIXES = new Set([
  'toronto', 'scarborough', 'north york', 'etobicoke', 'east york', 'york', 'downsview',
  'mississauga', 'brampton', 'markham', 'richmond hill', 'vaughan', 'thornhill', 'woodbridge',
  'pickering', 'ajax', 'oakville', 'aurora', 'newmarket', 'downtown', 'uptown', 'midtown',
]);
function stripLocalitySuffix(name: string): string {
  return name
    .replace(/\s*\(([^)]+)\)\s*$/, (full, inner: string) =>
      LOCALITY_SUFFIXES.has(inner.trim().toLowerCase()) ? '' : full,
    )
    .trim();
}

const AUXILIARY_RAW = new Set([
  'dinesafe.json',
  'ttc-stops.json',
  'neighbourhoods.json',
  'overture.json',
  'boundaries.json',
]);
const rawFiles = readdirSync(dir('../data/raw'))
  .filter((f) => f.endsWith('.json'))
  .filter((f) => !AUXILIARY_RAW.has(f));
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
    const name = stripLocalitySuffix(tags['name']?.trim() ?? '');
    if (!name) {
      drop('no name');
      continue;
    }
    if (isChain(name)) {
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
      station: null,
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

// ---- Overture supplemental source -----------------------------------------
// Fresher than OSM (largely Meta business listings). Places that map to a
// cuisine, aren't chains, fall inside a GTA municipality, and don't match an
// existing OSM entry get added with source: 'overture'.
let overtureAdded = 0;
let overtureDupes = 0;
const overtureUnmapped = new Map<string, number>();
const overturePath = dir('../data/raw/overture.json');
const boundariesPath = dir('../data/raw/boundaries.json');
if (existsSync(overturePath) && existsSync(boundariesPath)) {
  interface OverturePlace {
    id: string;
    name: string;
    category: string;
    confidence: number;
    lat: number;
    lng: number;
    address: string | null;
    website: string | null;
  }
  const overture = JSON.parse(readFileSync(overturePath, 'utf8')) as { places: OverturePlace[] };
  const boundaries = JSON.parse(readFileSync(boundariesPath, 'utf8')) as {
    features: { name: string; geometry: { type: string; coordinates: unknown } }[];
  };
  const boundaryBbox = boundaries.features.map((f) => withBbox(f as never)) as ((typeof boundaries.features)[number] & import('./lib/geo.ts').BboxFeature)[];
  const municipalityAt = (lat: number, lng: number): string | null =>
    boundaryBbox.find((f) => containsPoint(f, lng, lat))?.name ?? null;

  const existingGrid = new PointGrid();
  for (const r of restaurants) existingGrid.add(toNamedPoint(r.name, r.lat, r.lng));

  for (const place of overture.places) {
    // "persian_iranian_restaurant" → "persian_iranian" → aliases → cuisine map
    const token = place.category.replace(/_restaurant$/, '');
    const mapping = mapCuisines(tokenize(token), cuisineMap);
    if (!mapping.countries.size && !mapping.regions.size && !mapping.entities.size) {
      if (mapping.unmapped.length) {
        overtureUnmapped.set(token, (overtureUnmapped.get(token) ?? 0) + 1);
      }
      continue;
    }
    if (isChain(place.name)) continue;
    const cleanName = stripLocalitySuffix(place.name);
    if (!cleanName) continue;
    const point = toNamedPoint(cleanName, place.lat, place.lng);
    if (existingGrid.hasMatch(point, 150, 'strict')) {
      overtureDupes++;
      continue;
    }
    const municipality = municipalityAt(place.lat, place.lng);
    if (!municipality) continue; // inside the bbox but outside our 11 municipalities
    restaurants.push({
      id: `ovt-${place.id}`,
      name: cleanName,
      countries: [...mapping.countries].sort(),
      regions: [...mapping.regions].sort(),
      entities: [...mapping.entities].sort(),
      lat: place.lat,
      lng: place.lng,
      address: place.address,
      municipality,
      neighbourhood: null,
      website: place.website,
      station: null,
      verified: false,
      note: null,
      source: 'overture',
    });
    existingGrid.add(point); // dedupe Overture against itself too
    overtureAdded++;
  }
} else {
  console.warn('⚠ overture.json/boundaries.json missing — Overture merge skipped (npm run data:overture / data:boundaries)');
}

// ---- DineSafe liveness cross-check (City of Toronto only) -----------------
// A Toronto restaurant with no licensed food premise of a matching name
// nearby is almost certainly closed. Escape hatch: overrides.keepIds.
let dinesafeDropped: Restaurant[] = [];
const dinesafePath = dir('../data/raw/dinesafe.json');
if (existsSync(dinesafePath)) {
  const dinesafe = JSON.parse(readFileSync(dinesafePath, 'utf8')) as {
    establishments: { name: string; lat: number; lng: number }[];
  };
  const grid = new PointGrid();
  for (const e of dinesafe.establishments) grid.add(toNamedPoint(e.name, e.lat, e.lng));

  const keepIds = new Set(overrides.keepIds);
  const alive = (r: Restaurant): boolean => {
    if (r.municipality !== 'Toronto' || r.source === 'manual' || keepIds.has(r.id)) return true;
    return grid.hasMatch(toNamedPoint(r.name, r.lat, r.lng), 150, 'lenient');
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

// ---- enrich: nearest TTC stop + Toronto neighbourhood ---------------------
{
  const metres = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const dLat = (lat2 - lat1) * 111_320;
    const dLng = (lng2 - lng1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
    return Math.hypot(dLat, dLng);
  };

  const stopsPath = dir('../data/raw/ttc-stops.json');
  if (existsSync(stopsPath)) {
    interface Stop {
      name: string;
      lat: number;
      lng: number;
    }
    const ttc = JSON.parse(readFileSync(stopsPath, 'utf8')) as { subway: Stop[]; streetcar: Stop[] };
    const nearest = (r: Restaurant, stops: Stop[]): { stop: Stop; m: number } | null => {
      let best: { stop: Stop; m: number } | null = null;
      for (const stop of stops) {
        const m = metres(r.lat, r.lng, stop.lat, stop.lng);
        if (!best || m < best.m) best = { stop, m };
      }
      return best;
    };
    let subwayCount = 0;
    let tramCount = 0;
    for (const r of restaurants) {
      // Subway wins within a reasonable walk; streetcar covers the dense core.
      const sub = nearest(r, ttc.subway);
      const tram = nearest(r, ttc.streetcar);
      if (sub && sub.m <= 1200) {
        r.station = { name: sub.stop.name, kind: 'subway', m: Math.round(sub.m) };
        subwayCount++;
      } else if (tram && tram.m <= 600) {
        r.station = { name: tram.stop.name, kind: 'streetcar', m: Math.round(tram.m) };
        tramCount++;
      }
    }
    console.log(`TTC: ${subwayCount} near a subway station, ${tramCount} near a streetcar stop`);
  } else {
    console.warn('⚠ data/raw/ttc-stops.json missing — stations skipped (npm run data:gtfs)');
  }

  const hoodsPath = dir('../data/raw/neighbourhoods.json');
  if (existsSync(hoodsPath)) {
    const hoods = JSON.parse(readFileSync(hoodsPath, 'utf8')) as {
      features: { name: string; geometry: { type: string; coordinates: unknown } }[];
    };
    const hoodBbox = hoods.features.map((f) => withBbox(f as never)) as ((typeof hoods.features)[number] & import('./lib/geo.ts').BboxFeature)[];
    let assigned = 0;
    for (const r of restaurants) {
      if (r.municipality !== 'Toronto') continue;
      const hit = hoodBbox.find((f) => containsPoint(f, r.lng, r.lat));
      if (hit) {
        r.neighbourhood = hit.name;
        assigned++;
      }
    }
    console.log(`Neighbourhoods: assigned ${assigned} Toronto restaurants`);
  } else {
    console.warn('⚠ data/raw/neighbourhoods.json missing — areas skipped (npm run data:areas)');
  }
}

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
if (overtureAdded || overtureDupes) {
  console.log(`Overture: added ${overtureAdded} new, skipped ${overtureDupes} already in OSM`);
  if (overtureUnmapped.size) {
    const top = [...overtureUnmapped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log(`  unmapped categories: ${top.map(([t, n]) => `${t}(${n})`).join(' ')}`);
  }
}
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
