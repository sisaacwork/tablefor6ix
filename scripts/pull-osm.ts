/**
 * Pulls restaurants/fast food/cafes with a cuisine tag from Overpass, one
 * query per GTA municipality, and caches each response in data/raw/<slug>.json
 * (committed — site builds never touch the network).
 *
 *   npm run data:pull -- --resolve        print candidate relation ids for pinning
 *   npm run data:pull                     fetch municipalities missing a raw file
 *   npm run data:pull -- --force          re-fetch everything
 *   npm run data:pull -- --only=vaughan   re-fetch one municipality
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MUNICIPALITIES } from './config.ts';
import { overpass } from './lib/overpass.ts';

const RAW_DIR = fileURLToPath(new URL('../data/raw', import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const force = args.includes('--force');
const resolve = args.includes('--resolve');
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? null;

async function resolveRelationIds() {
  for (const muni of MUNICIPALITIES) {
    const query = `
[out:json][timeout:120];
area["ISO3166-2"="CA-ON"][admin_level=4]->.on;
relation["boundary"="administrative"]["name"="${muni.name}"](area.on);
out ids tags;
`;
    const data = await overpass(query);
    const candidates = (data.elements ?? []).map((el: any) => ({
      id: el.id,
      admin_level: el.tags?.admin_level,
      name: el.tags?.name,
      wikidata: el.tags?.wikidata,
    }));
    console.log(`${muni.name}: ${JSON.stringify(candidates)}`);
    await sleep(2000);
  }
}

async function pull() {
  mkdirSync(RAW_DIR, { recursive: true });
  for (const muni of MUNICIPALITIES) {
    if (only && muni.slug !== only) continue;
    const outPath = `${RAW_DIR}/${muni.slug}.json`;
    if (!force && !only && existsSync(outPath)) {
      console.log(`skip ${muni.slug} (cached; use --force to re-fetch)`);
      continue;
    }
    if (muni.relationId === null) {
      throw new Error(`No relationId pinned for ${muni.slug} — run with --resolve and pin it in scripts/config.ts`);
    }
    console.log(`fetching ${muni.slug} (relation ${muni.relationId})…`);
    const query = `
[out:json][timeout:180];
area(${3600000000 + muni.relationId})->.muni;
(
  nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["cuisine"](area.muni);
);
out center tags;
`;
    const data = await overpass(query);
    const dump = {
      municipality: muni.name,
      slug: muni.slug,
      relationId: muni.relationId,
      fetchedAt: new Date().toISOString(),
      elements: data.elements ?? [],
    };
    writeFileSync(outPath, JSON.stringify(dump, null, 1) + '\n');
    console.log(`  ${dump.elements.length} elements → data/raw/${muni.slug}.json`);
    await sleep(2000);
  }
}

if (resolve) await resolveRelationIds();
else await pull();
