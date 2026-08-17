/**
 * Pulls the TTC GTFS feed (City of Toronto Open Data) and condenses it to
 * data/raw/ttc-stops.json: subway stations (route_type 1) and streetcar stops
 * (route_type 0). build-data.ts precomputes each restaurant's nearest stop.
 *
 *   npm run data:gtfs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const PACKAGE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=ttc-routes-and-schedules';

const pkg = (await (await fetch(PACKAGE_URL)).json()) as {
  success: boolean;
  result: { resources: { format: string; url: string; last_modified: string }[] };
};
const resource = pkg.result.resources.find((r) => r.format === 'ZIP');
if (!resource) throw new Error('GTFS ZIP resource not found');
console.log(`Fetching ${resource.url} (last modified ${resource.last_modified})…`);
const zip = new Uint8Array(await (await fetch(resource.url)).arrayBuffer());
const files = unzipSync(zip);
const text = (name: string): string => {
  const file = files[name];
  if (!file) throw new Error(`${name} missing from GTFS zip`);
  return new TextDecoder().decode(file);
};

/** Minimal CSV parse (handles quoted fields) → array of records keyed by header. */
function parseCsv(src: string): Record<string, string>[] {
  const lines = src.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = cells[i] ?? ''));
    return rec;
  });
}
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') out.push(cur), (cur = '');
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const routes = parseCsv(text('routes.txt'));
const subwayRoutes = new Set(routes.filter((r) => r['route_type'] === '1').map((r) => r['route_id']!));
const tramRoutes = new Set(routes.filter((r) => r['route_type'] === '0').map((r) => r['route_id']!));
console.log(`Routes: ${subwayRoutes.size} subway, ${tramRoutes.size} streetcar`);

const subwayTrips = new Set<string>();
const tramTrips = new Set<string>();
for (const t of parseCsv(text('trips.txt'))) {
  if (subwayRoutes.has(t['route_id']!)) subwayTrips.add(t['trip_id']!);
  else if (tramRoutes.has(t['route_id']!)) tramTrips.add(t['trip_id']!);
}

// stop_times.txt is ~190MB — scan it line by line without materializing records.
const subwayStopIds = new Set<string>();
const tramStopIds = new Set<string>();
{
  const src = text('stop_times.txt');
  const header = splitLine(src.slice(0, src.indexOf('\n')));
  const tripCol = header.indexOf('trip_id');
  const stopCol = header.indexOf('stop_id');
  let pos = src.indexOf('\n') + 1;
  while (pos < src.length) {
    const end = src.indexOf('\n', pos);
    const line = src.slice(pos, end === -1 ? src.length : end);
    pos = end === -1 ? src.length : end + 1;
    if (!line) continue;
    const cells = line.split(','); // stop_times has no quoted fields in TTC feed
    const trip = cells[tripCol]!;
    if (subwayTrips.has(trip)) subwayStopIds.add(cells[stopCol]!);
    else if (tramTrips.has(trip)) tramStopIds.add(cells[stopCol]!);
  }
}

const titleCase = (s: string): string =>
  s.toLowerCase().replace(/(^|[\s\-(/])[a-z]/g, (m) => m.toUpperCase());

interface Stop {
  name: string;
  lat: number;
  lng: number;
}
const subwayByName = new Map<string, { lat: number; lng: number; n: number }>();
const streetcar: Stop[] = [];
for (const s of parseCsv(text('stops.txt'))) {
  const id = s['stop_id']!;
  const lat = Number(s['stop_lat']);
  const lng = Number(s['stop_lon']);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  if (subwayStopIds.has(id)) {
    // "FINCH STATION - SUBWAY PLATFORM" → "Finch Station"; average platforms.
    const name = titleCase(s['stop_name']!.split(' - ')[0]!.trim());
    const agg = subwayByName.get(name) ?? { lat: 0, lng: 0, n: 0 };
    agg.lat += lat;
    agg.lng += lng;
    agg.n++;
    subwayByName.set(name, agg);
  } else if (tramStopIds.has(id)) {
    streetcar.push({ name: titleCase(s['stop_name']!), lat, lng });
  }
}
const subway: Stop[] = [...subwayByName.entries()]
  .map(([name, a]) => ({ name, lat: +(a.lat / a.n).toFixed(6), lng: +(a.lng / a.n).toFixed(6) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const out = {
  source: 'TTC Routes and Schedules (City of Toronto Open Data, Open Government Licence – Toronto)',
  url: 'https://open.toronto.ca/dataset/ttc-routes-and-schedules/',
  fetchedAt: new Date().toISOString(),
  subway,
  streetcar,
};
writeFileSync(
  fileURLToPath(new URL('../data/raw/ttc-stops.json', import.meta.url)),
  JSON.stringify(out) + '\n',
);
console.log(`${subway.length} subway stations, ${streetcar.length} streetcar stops → data/raw/ttc-stops.json`);
console.log(`Sample stations: ${subway.slice(0, 5).map((s) => s.name).join(' · ')}`);
