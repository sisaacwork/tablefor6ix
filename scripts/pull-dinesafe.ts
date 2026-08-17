/**
 * Pulls City of Toronto DineSafe open data (food-premise inspections; Open
 * Government Licence – Toronto) and condenses it to unique establishments in
 * data/raw/dinesafe.json. Used by build-data.ts as a liveness cross-check:
 * an OSM restaurant in Toronto with no matching licensed establishment is
 * almost certainly closed.
 *
 *   npm run data:dinesafe
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PACKAGE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=dinesafe';

interface InspectionRow {
  estId: string;
  estName: string;
  address: string;
  latitude: string;
  longitude: string;
  inspectionDate: string | null;
}

const pkg = (await (await fetch(PACKAGE_URL)).json()) as {
  success: boolean;
  result: { resources: { format: string; name: string; url: string; last_modified: string }[] };
};
if (!pkg.success) throw new Error('CKAN package_show failed');
const resource = pkg.result.resources.find(
  (r: { format: string; name: string }) => r.format === 'JSON' && r.name === 'Dinesafe.json',
);
if (!resource) throw new Error('Dinesafe.json resource not found in CKAN package');

console.log(`Fetching ${resource.url} (last modified ${resource.last_modified})…`);
const rows = (await (await fetch(resource.url)).json()) as InspectionRow[];
console.log(`${rows.length} inspection rows`);

const establishments = new Map<string, { name: string; lat: number; lng: number }>();
for (const row of rows) {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!row.estId || !row.estName || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  if (lat === 0 || lng === 0) continue;
  establishments.set(row.estId, { name: row.estName, lat, lng });
}

const out = {
  source: 'City of Toronto DineSafe (Open Government Licence – Toronto)',
  url: 'https://open.toronto.ca/dataset/dinesafe/',
  fetchedAt: new Date().toISOString(),
  establishments: [...establishments.values()].sort((a, b) => a.name.localeCompare(b.name)),
};
const outPath = fileURLToPath(new URL('../data/raw/dinesafe.json', import.meta.url));
writeFileSync(outPath, JSON.stringify(out) + '\n');
console.log(`${out.establishments.length} unique establishments → data/raw/dinesafe.json`);
