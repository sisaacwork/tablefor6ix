import countriesJson from '../../data/countries.json';
import cuisineMapJson from '../../data/cuisine-map.json';
import coverageJson from '../../public/data/coverage.json';
import type {
  Countries,
  Coverage,
  Restaurant,
  Scope,
  ScopeCoverage,
  Seat,
  Entity,
  Selection,
} from '../types.ts';

export const COUNTRIES = countriesJson as Countries;
export const COVERAGE = coverageJson as Coverage;
export const SEAT_TOTAL = COVERAGE.seats;

export const REGION_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries((cuisineMapJson as { regions: Record<string, { label: string }> }).regions).map(
    ([key, { label }]) => [key, label],
  ),
);

export const lookup = {
  seats: new Map<string, Seat>(COUNTRIES.seats.map((s) => [s.iso3, s])),
  entities: new Map<string, Entity>(COUNTRIES.entities.map((e) => [e.code, e])),
  regions: new Map<string, string>(Object.entries(REGION_LABELS)),
};

export function displayName(selection: Selection): string {
  if (selection.kind === 'country') return lookup.seats.get(selection.code)?.name ?? selection.code;
  if (selection.kind === 'entity') return lookup.entities.get(selection.code)?.name ?? selection.code;
  return lookup.regions.get(selection.code) ?? selection.code;
}

/** "ET" → "🇪🇹". Empty string when there's no flag (regions, Tibet). */
export function flagEmoji(kind: 'country' | 'entity', code: string): string {
  const iso2 =
    kind === 'country' ? lookup.seats.get(code)?.iso2 : lookup.entities.get(code)?.iso2;
  if (!iso2) return '';
  return iso2.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** The single flag used for a restaurant's map pin (first country, then entity). */
export function primaryFlag(r: Restaurant): string | null {
  for (const c of r.countries) {
    const flag = flagEmoji('country', c);
    if (flag) return flag;
  }
  for (const e of r.entities) {
    const flag = flagEmoji('entity', e);
    if (flag) return flag;
  }
  return null;
}

/** Flags for a restaurant's countries + entities, e.g. "🇹🇹 🇬🇾". */
export function restaurantFlags(r: Restaurant): string {
  return [
    ...r.countries.map((c) => flagEmoji('country', c)),
    ...r.entities.map((e) => flagEmoji('entity', e)),
  ]
    .filter(Boolean)
    .join(' ');
}

/** "Trinidad and Tobago · Guyana · Caribbean" — the cuisine line for a restaurant. */
export function cuisineLabel(r: Restaurant): string {
  return [
    ...r.countries.map((c) => lookup.seats.get(c)?.name ?? c),
    ...r.entities.map((e) => lookup.entities.get(e)?.name ?? e),
    ...r.regions.map((g) => lookup.regions.get(g) ?? g),
  ].join(' · ');
}

/** Grouping key for the reverse view: neighbourhood inside Toronto, municipality outside. */
export function areaOf(r: Restaurant): string {
  return r.municipality === 'Toronto' ? (r.neighbourhood ?? 'Toronto — unmapped') : r.municipality;
}

/** "Ecuadorian" for ECU, "Middle Eastern" for the region, etc. */
export function demonym(selection: Selection): string {
  if (selection.kind === 'country')
    return lookup.seats.get(selection.code)?.demonym ?? displayName(selection);
  if (selection.kind === 'entity')
    return lookup.entities.get(selection.code)?.demonym ?? displayName(selection);
  return displayName(selection);
}

export function scopeCoverage(scope: Scope): ScopeCoverage {
  return COVERAGE.scopes[scope];
}

export function coverageCount(selection: Selection, scope: Scope): number {
  const cov = scopeCoverage(scope);
  if (selection.kind === 'country') return cov.countries[selection.code] ?? 0;
  if (selection.kind === 'entity') return cov.entities[selection.code] ?? 0;
  return cov.regions[selection.code] ?? 0;
}

export function matchesSelection(r: Restaurant, selection: Selection): boolean {
  if (selection.kind === 'country') return r.countries.includes(selection.code);
  if (selection.kind === 'entity') return r.entities.includes(selection.code);
  return r.regions.includes(selection.code);
}

/**
 * The filter pipeline: area (its own geography — the scope toggle doesn't
 * apply inside one), then scope, then selection. Area alone → the whole area.
 */
export function restaurantsFor(
  restaurants: Restaurant[],
  selection: Selection | null,
  scope: Scope,
  area: string | null,
): Restaurant[] {
  if (!selection && !area) return [];
  return restaurants
    .filter((r) => (area ? areaOf(r) === area : true))
    .filter((r) => (area || scope === 'gta' ? true : r.municipality === 'Toronto'))
    .filter((r) => (selection ? matchesSelection(r, selection) : true))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** Per-country/entity counts inside one area — drives the choropleth while an area is active. */
export function areaCoverage(
  restaurants: Restaurant[],
  area: string,
): { countries: Record<string, number>; entities: Record<string, number> } {
  const countries: Record<string, number> = {};
  const entities: Record<string, number> = {};
  for (const r of restaurants) {
    if (areaOf(r) !== area) continue;
    r.countries.forEach((c) => (countries[c] = (countries[c] ?? 0) + 1));
    r.entities.forEach((e) => (entities[e] = (entities[e] ?? 0) + 1));
  }
  return { countries, entities };
}

let restaurantsPromise: Promise<Restaurant[]> | null = null;

export function fetchRestaurants(): Promise<Restaurant[]> {
  restaurantsPromise ??= fetch(`${import.meta.env.BASE_URL}data/restaurants.json?v=${__BUILD_STAMP__}`)
    .then((res) => {
      if (!res.ok) throw new Error(`restaurants.json: HTTP ${res.status}`);
      return res.json() as Promise<Restaurant[]>;
    })
    .catch((err) => {
      restaurantsPromise = null; // allow retry
      throw err;
    });
  return restaurantsPromise;
}
