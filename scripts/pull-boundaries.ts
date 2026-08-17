/**
 * Fetches the boundary polygon for each GTA municipality (from Nominatim, by
 * the same pinned OSM relation ids used for the Overpass pulls) into
 * data/raw/boundaries.json. Used to assign Overture places a municipality by
 * point-in-polygon at build time.
 *
 *   npm run data:boundaries
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MUNICIPALITIES } from './config.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const features: { name: string; geometry: unknown }[] = [];
for (const muni of MUNICIPALITIES) {
  if (muni.relationId === null) throw new Error(`No relationId for ${muni.slug}`);
  const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=R${muni.relationId}&polygon_geojson=1&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'tablefor6ix.ca data pipeline (contact: iwork@cvu.org)' },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status} for ${muni.name}`);
  const body = (await res.json()) as { geojson?: { type: string; coordinates: unknown } }[];
  const geometry = body[0]?.geojson;
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
    throw new Error(`No polygon returned for ${muni.name}`);
  }
  features.push({ name: muni.name, geometry });
  console.log(`${muni.name}: ${geometry.type}`);
  await sleep(1100); // Nominatim etiquette: max 1 req/s
}

writeFileSync(
  fileURLToPath(new URL('../data/raw/boundaries.json', import.meta.url)),
  JSON.stringify({
    source: 'OpenStreetMap via Nominatim (ODbL)',
    fetchedAt: new Date().toISOString(),
    features,
  }) + '\n',
);
console.log(`${features.length} boundaries → data/raw/boundaries.json`);
