export interface Restaurant {
  id: string;
  name: string;
  countries: string[];
  regions: string[];
  entities: string[];
  lat: number;
  lng: number;
  address: string | null;
  municipality: string;
  neighbourhood: string | null;
  website: string | null;
  station: { name: string; kind: 'subway' | 'streetcar'; m: number } | null;
  verified: boolean;
  note: string | null;
  source: 'osm' | 'manual' | 'overture';
}

export interface Seat {
  iso3: string;
  iso2: string;
  numeric: string;
  name: string;
  demonym: string;
  aliases: string[];
  lat: number;
  lng: number;
  in110m: boolean;
  nudge: string | null;
}

export interface Entity {
  code: string;
  iso2: string | null;
  numeric: string | null;
  name: string;
  demonym: string;
  aliases: string[];
  lat: number;
  lng: number;
  in110m: boolean;
  topojsonName: string | null;
}

export interface Countries {
  seats: Seat[];
  entities: Entity[];
  inertFeatures: { id: string | null; name: string }[];
}

export interface ScopeCoverage {
  countries: Record<string, number>;
  entities: Record<string, number>;
  regions: Record<string, number>;
}

export interface Coverage {
  generatedAt: string;
  seats: number;
  scopes: { gta: ScopeCoverage; toronto: ScopeCoverage };
  totals: { gta: CoverageTotal; toronto: CoverageTotal };
}

export interface CoverageTotal {
  covered: number;
  missing: number;
}

export type Scope = 'gta' | 'toronto';
export type View = 'map' | 'missing' | 'areas' | 'about';
export type SelectionKind = 'country' | 'entity' | 'region';

export interface Selection {
  kind: SelectionKind;
  code: string;
}

export interface AppState {
  scope: Scope;
  view: View;
  selection: Selection | null;
  /** Neighbourhood/municipality filter — coexists with selection ("Vietnam within Kensington"). */
  area: string | null;
  selectedRestaurant: string | null;
  restaurants: Restaurant[] | null;
  mobileScreen: 'world' | 'city';
  passport: ReadonlySet<string>;
}
