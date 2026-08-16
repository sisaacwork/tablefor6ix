import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { CountriesSchema, type Countries } from './schema.ts';

const require = createRequire(import.meta.url);

export function loadCountries(): Countries {
  const path = fileURLToPath(new URL('../../data/countries.json', import.meta.url));
  return CountriesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * Asserts the countries.json ↔ world-atlas 110m join is airtight:
 * every seat/entity marked in110m matches exactly one feature, and every
 * feature is claimed by a seat, an entity, or the explicit inert list.
 * Catches a world-atlas version bump silently changing feature ids.
 */
export function verifyTopojsonJoin(countries: Countries): void {
  const atlas = JSON.parse(
    readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'),
  );
  const features: { id: string | null; name: string }[] =
    atlas.objects.countries.geometries.map(
      (g: { id?: string; properties: { name: string } }) => ({
        id: g.id ?? null,
        name: g.properties.name,
      }),
    );
  const byId = new Map(features.filter((f) => f.id).map((f) => [f.id as string, f]));
  const byName = new Map(features.map((f) => [f.name, f]));
  const claimed = new Set<{ id: string | null; name: string }>();

  const errors: string[] = [];
  for (const seat of countries.seats) {
    const feature = byId.get(seat.numeric);
    if (seat.in110m && !feature) errors.push(`Seat ${seat.iso3} marked in110m but feature ${seat.numeric} not found`);
    if (!seat.in110m && feature) errors.push(`Seat ${seat.iso3} marked !in110m but feature ${seat.numeric} exists`);
    if (feature) claimed.add(feature);
  }
  for (const entity of countries.entities) {
    const feature = entity.numeric
      ? byId.get(entity.numeric)
      : entity.topojsonName
        ? byName.get(entity.topojsonName)
        : undefined;
    if (entity.in110m && !feature) errors.push(`Entity ${entity.code} marked in110m but feature not found`);
    if (feature) claimed.add(feature);
  }
  const inertNames = new Set(countries.inertFeatures.map((f) => f.name));
  for (const feature of features) {
    if (!claimed.has(feature) && !inertNames.has(feature.name)) {
      errors.push(`Feature ${feature.id ?? 'null'} "${feature.name}" is neither claimed nor inert`);
    }
  }
  if (errors.length) {
    throw new Error(`Topojson join verification failed:\n  ${errors.join('\n  ')}`);
  }
}
