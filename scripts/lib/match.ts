/** Fuzzy name/place matching shared by the DineSafe liveness check and the
 * Overture-vs-OSM dedupe. */
import { normalizeName } from './cuisine.ts';

export function metres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 111_320;
  const dLng = (lng2 - lng1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

const bigrams = (s: string): Set<string> => {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
};

export function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let hits = 0;
  for (const g of A) if (B.has(g)) hits++;
  return (2 * hits) / (A.size + B.size);
}

// Generic words that don't identify a specific restaurant — a shared
// distinctive token ("kabul", "kibo") means same place, a generic one
// ("sushi", "grill") does not.
const GENERIC = new Set([
  'restaurant', 'cafe', 'caffe', 'coffee', 'kitchen', 'house', 'grill', 'grille', 'express',
  'sushi', 'ramen', 'pizza', 'pizzeria', 'shawarma', 'kebab', 'kabob', 'kabab', 'noodle',
  'noodles', 'thai', 'chinese', 'indian', 'japanese', 'korean', 'vietnamese', 'halal',
  'food', 'foods', 'eatery', 'diner', 'bistro', 'cuisine', 'authentic', 'original',
  'famous', 'golden', 'royal', 'star', 'king', 'queen', 'chef', 'taste', 'spice', 'curry',
  'roti', 'tandoori', 'wok', 'garden', 'palace', 'villa', 'casa', 'little', 'great',
]);

export function distinctiveTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !GENERIC.has(t)),
  );
}

export interface NamedPoint {
  norm: string;
  tokens: Set<string>;
  lat: number;
  lng: number;
}

export function toNamedPoint(name: string, lat: number, lng: number): NamedPoint {
  return { norm: normalizeName(name), tokens: distinctiveTokens(name), lat, lng };
}

/**
 * strict: names must basically be the same name (dedupe across sources).
 * lenient: also accepts a shared distinctive token — tolerates renames, for
 * the liveness check where missing a rename means wrongly declaring a place dead.
 */
export function namesMatch(a: NamedPoint, b: NamedPoint, mode: 'strict' | 'lenient'): boolean {
  if (
    a.norm === b.norm ||
    (a.norm.length >= 5 && b.norm.includes(a.norm)) ||
    (b.norm.length >= 5 && a.norm.includes(b.norm)) ||
    dice(a.norm, b.norm) >= 0.72
  ) {
    return true;
  }
  return mode === 'lenient' && [...a.tokens].some((t) => b.tokens.has(t));
}

/** ~200m spatial grid for nearby-candidate lookup. */
export class PointGrid<T extends NamedPoint> {
  private cell = 0.002;
  private grid = new Map<string, T[]>();

  add(point: T): void {
    const key = `${Math.round(point.lat / this.cell)}|${Math.round(point.lng / this.cell)}`;
    const bucket = this.grid.get(key) ?? [];
    bucket.push(point);
    this.grid.set(key, bucket);
  }

  /** True if a matching-named point exists within `radius` metres. */
  hasMatch(point: NamedPoint, radius: number, mode: 'strict' | 'lenient'): boolean {
    const ci = Math.round(point.lat / this.cell);
    const cj = Math.round(point.lng / this.cell);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const candidate of this.grid.get(`${ci + di}|${cj + dj}`) ?? []) {
          if (
            metres(point.lat, point.lng, candidate.lat, candidate.lng) <= radius &&
            namesMatch(point, candidate, mode)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
