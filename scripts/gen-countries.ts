/**
 * Generates data/countries.json: the 195 "seats" (193 UN members + Palestine +
 * Vatican City), the non-seat entities (Taiwan, Hong Kong, Kosovo, Tibet), and
 * the list of world-atlas 110m features that render inert.
 *
 * Run once and commit the output; re-run only if world-countries/world-atlas
 * versions change. `build-data.ts` re-verifies the topojson join on every build.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wc: WorldCountry[] = require('world-countries');
const atlas = JSON.parse(
  readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'),
);

interface WorldCountry {
  cca2: string;
  cca3: string;
  ccn3?: string;
  name: { common: string; official: string };
  altSpellings: string[];
  unMember: boolean;
  subregion: string;
  latlng: [number, number];
  demonyms?: { eng?: { m?: string } };
}

const atlasFeatures: { id: string | null; name: string }[] =
  atlas.objects.countries.geometries.map((g: { id?: string; properties: { name: string } }) => ({
    id: g.id ?? null,
    name: g.properties.name,
  }));
const atlasIds = new Set(atlasFeatures.filter((f) => f.id !== null).map((f) => f.id as string));

// world-countries v5 flags Vatican City as unMember (it's an observer, like
// Palestine); 194 flagged + PSE = exactly the 195 we want.
const seatsRaw = wc.filter((c) => c.unMember || c.cca3 === 'PSE');
if (seatsRaw.length !== 195) {
  throw new Error(`Expected 195 seats, got ${seatsRaw.length}`);
}

const NAME_OVERRIDES: Record<string, string> = {
  CIV: "Côte d'Ivoire",
  COD: 'DR Congo',
  COG: 'Republic of the Congo',
  MKD: 'North Macedonia',
};

const EXTRA_ALIASES: Record<string, string[]> = {
  NLD: ['Holland'],
  MMR: ['Burma'],
  CIV: ['Ivory Coast'],
  CZE: ['Czech Republic'],
  TUR: ['Turkey'],
  SWZ: ['Swaziland'],
  CPV: ['Cape Verde'],
  TLS: ['East Timor'],
};

const MIDDLE_EASTERN = new Set([
  'SYR', 'LBN', 'JOR', 'IRQ', 'YEM', 'SAU', 'ARE', 'KWT', 'QAT', 'BHR', 'OMN', 'PSE', 'ISR', 'EGY',
]);

function nudgeFor(c: WorldCountry): string | null {
  if (c.subregion === 'Caribbean') return 'caribbean';
  if (c.subregion === 'Western Africa') return 'west_african';
  if (MIDDLE_EASTERN.has(c.cca3)) return 'middle_eastern';
  return null;
}

function aliasesFor(c: WorldCountry): string[] {
  const name = NAME_OVERRIDES[c.cca3] ?? c.name.common;
  const raw = [c.name.common, c.name.official, ...c.altSpellings, ...(EXTRA_ALIASES[c.cca3] ?? [])];
  const seen = new Set<string>([name.toLowerCase()]);
  const out: string[] = [];
  for (const a of raw) {
    // Latin-script alternates only; skip the bare cca2 code and duplicates.
    if (a === c.cca2 || a.length < 3) continue;
    if (!/^[ -ɏ'’.,()-]+$/.test(a)) continue;
    const key = a.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

const seats = seatsRaw
  .map((c) => {
    const numeric = c.ccn3;
    if (!numeric) throw new Error(`No ccn3 for ${c.cca3}`);
    return {
      iso3: c.cca3,
      numeric,
      name: NAME_OVERRIDES[c.cca3] ?? c.name.common,
      demonym: c.demonyms?.eng?.m || (NAME_OVERRIDES[c.cca3] ?? c.name.common),
      aliases: aliasesFor(c),
      lat: c.latlng[0],
      lng: c.latlng[1],
      in110m: atlasIds.has(numeric),
      nudge: nudgeFor(c),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

const hkg = wc.find((c) => c.cca3 === 'HKG');
if (!hkg) throw new Error('HKG missing from world-countries');

const entities = [
  {
    code: 'TWN',
    numeric: '158',
    name: 'Taiwan',
    demonym: 'Taiwanese',
    aliases: ['Republic of China', 'Formosa'],
    lat: 23.7,
    lng: 121.0,
    in110m: true,
    topojsonName: null as string | null,
  },
  {
    code: 'HKG',
    numeric: null as string | null,
    name: 'Hong Kong',
    demonym: 'Hong Kong',
    aliases: ['HK'],
    lat: hkg.latlng[0],
    lng: hkg.latlng[1],
    in110m: false,
    topojsonName: null as string | null,
  },
  {
    code: 'XKX',
    numeric: null as string | null,
    name: 'Kosovo',
    demonym: 'Kosovar',
    aliases: ['Kosova'],
    lat: 42.67,
    lng: 21.17,
    in110m: true,
    // world-atlas gives Kosovo no numeric id; join this feature by name.
    topojsonName: 'Kosovo',
  },
  {
    code: 'TIB',
    numeric: null as string | null,
    name: 'Tibet',
    demonym: 'Tibetan',
    aliases: ['Bod'],
    lat: 29.65,
    lng: 91.1,
    in110m: false,
    topojsonName: null as string | null,
  },
];

// Every 110m feature must be a seat, an entity, or explicitly inert.
const seatNumerics = new Set(seats.map((s) => s.numeric));
const entityNumerics = new Set(entities.filter((e) => e.numeric).map((e) => e.numeric));
const entityNames = new Set(entities.filter((e) => e.topojsonName).map((e) => e.topojsonName));
const inertFeatures = atlasFeatures
  .filter(
    (f) =>
      !(f.id && seatNumerics.has(f.id)) &&
      !(f.id && entityNumerics.has(f.id)) &&
      !entityNames.has(f.name),
  )
  .map((f) => ({ id: f.id, name: f.name }));

const missingPolygons = seats.filter((s) => !s.in110m).map((s) => s.iso3);
console.log(`Seats: ${seats.length}`);
console.log(`Seats without a 110m polygon (${missingPolygons.length}): ${missingPolygons.join(', ')}`);
console.log(`Inert 110m features (${inertFeatures.length}): ${inertFeatures.map((f) => f.name).join(', ')}`);

const outPath = fileURLToPath(new URL('../data/countries.json', import.meta.url));
mkdirSync(fileURLToPath(new URL('../data', import.meta.url)), { recursive: true });
writeFileSync(outPath, JSON.stringify({ seats, entities, inertFeatures }, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
