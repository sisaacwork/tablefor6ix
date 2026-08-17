import type { Store } from '../state/store.ts';
import type { Restaurant } from '../types.ts';
import { areaOf, lookup, REGION_LABELS } from '../data/loader.ts';

interface AreaSummary {
  name: string;
  suburb: boolean;
  restaurants: number;
  countries: Set<string>;
  entities: Set<string>;
  regions: Set<string>;
}

/**
 * The reverse view: Toronto's geography → the world's. Each neighbourhood
 * (and each suburb) ranked by how many countries it covers.
 */
export function mountAreas(container: HTMLElement, store: Store): void {
  function summarize(restaurants: Restaurant[]): AreaSummary[] {
    const areas = new Map<string, AreaSummary>();
    for (const r of restaurants) {
      const name = areaOf(r);
      const area =
        areas.get(name) ??
        {
          name,
          suburb: r.municipality !== 'Toronto',
          restaurants: 0,
          countries: new Set<string>(),
          entities: new Set<string>(),
          regions: new Set<string>(),
        };
      area.restaurants++;
      r.countries.forEach((c) => area.countries.add(c));
      r.entities.forEach((e) => area.entities.add(e));
      r.regions.forEach((g) => area.regions.add(g));
      areas.set(name, area);
    }
    return [...areas.values()].sort(
      (a, b) => b.countries.size - a.countries.size || b.restaurants - a.restaurants,
    );
  }

  function render(): void {
    const state = store.get();
    container.hidden = state.view !== 'areas';
    if (container.hidden) return;
    container.replaceChildren();

    const h2 = document.createElement('h2');
    h2.textContent = 'Neighbourhoods';
    const sub = document.createElement('p');
    sub.className = 'missing-sub';
    container.append(h2, sub);

    if (!state.restaurants) {
      sub.textContent = 'Loading…';
      return;
    }
    const areas = summarize(state.restaurants);
    sub.textContent =
      'The map, run in reverse: how much of the world each corner of the city serves. Every count is a link.';

    const list = document.createElement('ol');
    list.className = 'area-list';
    for (const area of areas) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'area-row';
      btn.addEventListener('click', () =>
        store.set({
          selection: { kind: 'area', code: area.name },
          selectedRestaurant: null,
          mobileScreen: 'city',
          view: 'map',
        }),
      );

      const name = document.createElement('span');
      name.className = 'area-name';
      name.textContent = area.name;
      if (area.suburb) {
        const tag = document.createElement('span');
        tag.className = 'area-tag';
        tag.textContent = 'suburb';
        name.appendChild(tag);
      }
      const stats = document.createElement('span');
      stats.className = 'area-stats';
      const extras = [
        area.entities.size > 0 ? `+${area.entities.size}` : null,
        area.regions.size > 0
          ? `${area.regions.size} region${area.regions.size === 1 ? '' : 's'}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');
      stats.textContent = `${area.countries.size} ${area.countries.size === 1 ? 'country' : 'countries'}${
        extras ? ` (${extras})` : ''
      } · ${area.restaurants} restaurant${area.restaurants === 1 ? '' : 's'}`;

      btn.append(name, stats);
      li.appendChild(btn);
      list.appendChild(li);
    }
    container.appendChild(list);
  }

  render();
  store.subscribe((state, prev) => {
    if (state.view !== prev.view || state.restaurants !== prev.restaurants) render();
  });
}

/** Country chips for an area selection, rendered under the city header. */
export function areaChips(
  restaurants: Restaurant[],
  areaName: string,
  onPick: (kind: 'country' | 'entity' | 'region', code: string) => void,
): HTMLElement {
  const subset = restaurants.filter((r) => areaOf(r) === areaName);
  const counts = new Map<string, { kind: 'country' | 'entity' | 'region'; label: string; n: number }>();
  for (const r of subset) {
    for (const c of r.countries) {
      const key = `c:${c}`;
      const entry = counts.get(key) ?? {
        kind: 'country' as const,
        label: lookup.seats.get(c)?.name ?? c,
        n: 0,
      };
      entry.n++;
      counts.set(key, entry);
    }
    for (const e of r.entities) {
      const key = `x:${e}`;
      const entry = counts.get(key) ?? {
        kind: 'entity' as const,
        label: lookup.entities.get(e)?.name ?? e,
        n: 0,
      };
      entry.n++;
      counts.set(key, entry);
    }
    for (const g of r.regions) {
      const key = `r:${g}`;
      const entry = counts.get(key) ?? {
        kind: 'region' as const,
        label: REGION_LABELS[g] ?? g,
        n: 0,
      };
      entry.n++;
      counts.set(key, entry);
    }
  }
  const wrap = document.createElement('div');
  wrap.className = 'area-chips';
  const sorted = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  for (const [key, { kind, label, n }] of sorted) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = `${label} ${n}`;
    chip.addEventListener('click', () => onPick(kind, key.slice(2)));
    wrap.appendChild(chip);
  }
  return wrap;
}
