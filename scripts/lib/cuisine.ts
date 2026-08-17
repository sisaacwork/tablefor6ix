import type { CuisineMap } from './schema.ts';

/** "Thaï Express!" → "thaiexpress" — shared by chain matching, dedupe, and DineSafe matching. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** `"Sichuan; Hong-Kong,dim sum"` → `["sichuan", "hong_kong", "dim_sum"]` */
export function tokenize(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[;,]/)
    .map((t) => t.trim().replace(/[\s-]+/g, '_'))
    .filter(Boolean);
}

export interface MappingResult {
  countries: Set<string>;
  regions: Set<string>;
  entities: Set<string>;
  unmapped: string[];
}

export function mapCuisines(tokens: string[], map: CuisineMap): MappingResult {
  const result: MappingResult = {
    countries: new Set(),
    regions: new Set(),
    entities: new Set(),
    unmapped: [],
  };
  const dropSet = new Set(map.drop);
  for (const raw of tokens) {
    const token = map.aliases[raw] ?? raw;
    if (dropSet.has(token)) continue;
    const entry = map.map[token];
    if (!entry) {
      result.unmapped.push(token);
      continue;
    }
    entry.countries?.forEach((c) => result.countries.add(c));
    entry.regions?.forEach((r) => result.regions.add(r));
    entry.entities?.forEach((e) => result.entities.add(e));
  }
  return result;
}
