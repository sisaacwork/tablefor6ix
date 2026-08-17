/**
 * Pulls the City of Toronto's 158 official neighbourhood polygons (Open
 * Government Licence – Toronto) into data/raw/neighbourhoods.json.
 * build-data.ts assigns each Toronto restaurant its neighbourhood by
 * point-in-polygon; suburbs use the municipality as their area.
 *
 *   npm run data:areas
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PACKAGE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=neighbourhoods';

const pkg = (await (await fetch(PACKAGE_URL)).json()) as {
  result: { resources: { format: string; name: string; url: string }[] };
};
const resource = pkg.result.resources.find((r) => r.name === 'Neighbourhoods - 4326.geojson');
if (!resource) throw new Error('Neighbourhoods GeoJSON resource not found');
console.log(`Fetching ${resource.url}…`);
const geo = (await (await fetch(resource.url)).json()) as {
  features: {
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }[];
};

const features = geo.features.map((f) => ({
  // AREA_NAME like "Danforth (66)" in some vintages — strip the trailing id.
  name: String(f.properties['AREA_NAME'] ?? f.properties['AREA_NA7'] ?? '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim(),
  geometry: f.geometry,
}));
if (features.length < 150 || features.some((f) => !f.name)) {
  throw new Error(`Unexpected neighbourhoods payload (${features.length} features)`);
}

const out = {
  source: 'City of Toronto Neighbourhoods (Open Government Licence – Toronto)',
  url: 'https://open.toronto.ca/dataset/neighbourhoods/',
  fetchedAt: new Date().toISOString(),
  features,
};
writeFileSync(
  fileURLToPath(new URL('../data/raw/neighbourhoods.json', import.meta.url)),
  JSON.stringify(out) + '\n',
);
console.log(`${features.length} neighbourhoods → data/raw/neighbourhoods.json`);
console.log(`Sample: ${features.slice(0, 5).map((f) => f.name).join(' · ')}`);
