/**
 * Pulls restaurant-ish places for the GTA from Overture Maps (CDLA-Permissive
 * 2.0 — free to redistribute) into data/raw/overture.json. Overture's places
 * layer is sourced largely from Meta business listings, so it's considerably
 * fresher than OSM; build-data.ts merges it as a supplemental source after
 * deduping against OSM.
 *
 *   npm run data:overture                 use the pinned release
 *   npm run data:overture -- --latest     discover and print the newest release
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance } from '@duckdb/node-api';

/** Pin the release so re-runs are reproducible; bump deliberately. */
const RELEASE = '2026-07-22.0';
const BBOX = { west: -79.9, east: -78.9, south: 43.3, north: 44.1 };
const MIN_CONFIDENCE = 0.75;

if (process.argv.includes('--latest')) {
  const xml = await (
    await fetch('https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/')
  ).text();
  const releases = [...xml.matchAll(/<Prefix>release\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]);
  console.log(`Available releases: ${releases.join(', ')}\nPinned: ${RELEASE}`);
  process.exit(0);
}

console.log(`Querying Overture ${RELEASE} places for the GTA (this takes a few minutes)…`);
const instance = await DuckDBInstance.create(':memory:');
const conn = await instance.connect();
await conn.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';");
const url = `s3://overturemaps-us-west-2/release/${RELEASE}/theme=places/type=place/*.parquet`;
const result = await conn.run(`
  SELECT
    id,
    names.primary AS name,
    categories.primary AS category,
    confidence,
    bbox.xmin AS lng,
    bbox.ymin AS lat,
    addresses[1].freeform AS address,
    websites[1] AS website
  FROM read_parquet('${url}', hive_partitioning=1)
  WHERE bbox.xmin > ${BBOX.west} AND bbox.xmax < ${BBOX.east}
    AND bbox.ymin > ${BBOX.south} AND bbox.ymax < ${BBOX.north}
    AND confidence >= ${MIN_CONFIDENCE}
    AND (categories.primary LIKE '%restaurant%' OR categories.primary IN ('cafe', 'coffee_shop'))
    AND names.primary IS NOT NULL
`);
const rows = (await result.getRowObjectsJson()) as {
  id: string;
  name: string;
  category: string;
  confidence: number;
  lng: number;
  lat: number;
  address: string | null;
  website: string | null;
}[];

const places = rows.map((r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  confidence: Number(r.confidence),
  lat: Number(Number(r.lat).toFixed(6)),
  lng: Number(Number(r.lng).toFixed(6)),
  address: r.address ?? null,
  website: r.website ?? null,
}));

writeFileSync(
  fileURLToPath(new URL('../data/raw/overture.json', import.meta.url)),
  JSON.stringify({
    source: `Overture Maps ${RELEASE} places theme (CDLA-Permissive 2.0)`,
    url: 'https://overturemaps.org/',
    release: RELEASE,
    minConfidence: MIN_CONFIDENCE,
    fetchedAt: new Date().toISOString(),
    places,
  }) + '\n',
);
console.log(`${places.length} places (confidence ≥ ${MIN_CONFIDENCE}) → data/raw/overture.json`);
