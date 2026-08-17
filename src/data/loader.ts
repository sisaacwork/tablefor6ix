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
  if (selection.kind === 'area') return selection.code;
  return lookup.regions.get(selection.code) ?? selection.code;
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

export function coverageCount(
  selection: Selection,
  scope: Scope,
  restaurants?: Restaurant[] | null,
): number {
  if (selection.kind === 'area') {
    return restaurants ? restaurants.filter((r) => areaOf(r) === selection.code).length : 0;
  }
  const cov = scopeCoverage(scope);
  if (selection.kind === 'country') return cov.countries[selection.code] ?? 0;
  if (selection.kind === 'entity') return cov.entities[selection.code] ?? 0;
  return cov.regions[selection.code] ?? 0;
}

export function matchesSelection(r: Restaurant, selection: Selection): boolean {
  if (selection.kind === 'country') return r.countries.includes(selection.code);
  if (selection.kind === 'entity') return r.entities.includes(selection.code);
  if (selection.kind === 'area') return areaOf(r) === selection.code;
  return r.regions.includes(selection.code);
}

export function restaurantsFor(
  restaurants: Restaurant[],
  selection: Selection,
  scope: Scope,
): Restaurant[] {
  return restaurants
    // An area IS its own scope — the toggle doesn't apply to it.
    .filter((r) => (selection.kind === 'area' || scope === 'gta' ? true : r.municipality === 'Toronto'))
    .filter((r) => matchesSelection(r, selection))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
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
