import { geoEqualEarth, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import atlasJson from 'world-atlas/countries-110m.json';
import type { Store } from '../state/store.ts';
import type { Selection } from '../types.ts';
import { COUNTRIES, scopeCoverage } from '../data/loader.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Target {
  selection: Selection;
  name: string;
  el: SVGElement; // path or circle
  feature: GeoPermissibleObjects | null; // null → point-rendered
  lng: number;
  lat: number;
}

function step(count: number): number {
  if (count >= 10) return 3;
  if (count >= 3) return 2;
  return count > 0 ? 1 : 0;
}

export function mountWorldMap(container: HTMLElement, store: Store): void {
  const atlas = atlasJson as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const world = feature(atlas, atlas.objects.countries);

  const byNumeric = new Map(world.features.filter((f) => f.id).map((f) => [String(f.id), f]));
  const byName = new Map(world.features.map((f) => [f.properties.name, f]));
  const claimedNames = new Set<string>();

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'World map of Toronto restaurant coverage');
  container.appendChild(svg);

  const gSphere = document.createElementNS(SVG_NS, 'g');
  const gCountries = document.createElementNS(SVG_NS, 'g');
  const gPoints = document.createElementNS(SVG_NS, 'g');
  const gStamps = document.createElementNS(SVG_NS, 'g');
  svg.append(gSphere, gCountries, gPoints, gStamps);

  const spherePath = document.createElementNS(SVG_NS, 'path');
  spherePath.setAttribute('fill', 'none');
  spherePath.setAttribute('stroke', 'var(--line)');
  spherePath.setAttribute('stroke-width', '1');
  gSphere.appendChild(spherePath);

  const targets: Target[] = [];

  const addTarget = (t: Target) => {
    t.el.classList.add(t.feature ? 'country' : 'small-seat');
    t.el.setAttribute('role', 'button');
    t.el.setAttribute('tabindex', '0');
    t.el.addEventListener('click', () => select(t.selection));
    t.el.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        select(t.selection);
      }
    });
    targets.push(t);
  };

  function select(selection: Selection): void {
    const current = store.get().selection;
    const same = current && current.kind === selection.kind && current.code === selection.code;
    store.set({
      selection: same ? null : selection,
      selectedRestaurant: null,
      mobileScreen: same ? 'world' : 'city',
    });
  }

  // Seats with polygons
  for (const seat of COUNTRIES.seats) {
    if (!seat.in110m) continue;
    const f = byNumeric.get(seat.numeric);
    if (!f) continue;
    claimedNames.add(f.properties.name);
    const el = document.createElementNS(SVG_NS, 'path');
    gCountries.appendChild(el);
    addTarget({
      selection: { kind: 'country', code: seat.iso3 },
      name: seat.name,
      el,
      feature: f as GeoPermissibleObjects,
      lng: seat.lng,
      lat: seat.lat,
    });
  }

  // Entities with polygons (Taiwan by numeric, Kosovo by name)
  for (const entity of COUNTRIES.entities) {
    if (!entity.in110m) continue;
    const f = entity.numeric ? byNumeric.get(entity.numeric) : byName.get(entity.topojsonName ?? '');
    if (!f) continue;
    claimedNames.add(f.properties.name);
    const el = document.createElementNS(SVG_NS, 'path');
    gCountries.appendChild(el);
    addTarget({
      selection: { kind: 'entity', code: entity.code },
      name: entity.name,
      el,
      feature: f as GeoPermissibleObjects,
      lng: entity.lng,
      lat: entity.lat,
    });
  }

  // Inert features: visible, not interactive
  const inertEls: { el: SVGPathElement; feature: GeoPermissibleObjects }[] = [];
  for (const f of world.features) {
    if (claimedNames.has(f.properties.name)) continue;
    if (f.properties.name === 'Antarctica') continue;
    const el = document.createElementNS(SVG_NS, 'path');
    el.classList.add('country', 'inert');
    el.setAttribute('aria-hidden', 'true');
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = f.properties.name;
    el.appendChild(title);
    gCountries.appendChild(el);
    inertEls.push({ el, feature: f as GeoPermissibleObjects });
  }

  // Point-rendered seats and entities (no 110m polygon)
  for (const seat of COUNTRIES.seats) {
    if (seat.in110m) continue;
    const el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('r', '3.5');
    gPoints.appendChild(el);
    addTarget({
      selection: { kind: 'country', code: seat.iso3 },
      name: seat.name,
      el,
      feature: null,
      lng: seat.lng,
      lat: seat.lat,
    });
  }
  for (const entity of COUNTRIES.entities) {
    if (entity.in110m) continue;
    const el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('r', '3.5');
    gPoints.appendChild(el);
    addTarget({
      selection: { kind: 'entity', code: entity.code },
      name: entity.name,
      el,
      feature: null,
      lng: entity.lng,
      lat: entity.lat,
    });
  }

  // ---- projection / layout ----
  const projection = geoEqualEarth();
  const path = geoPath(projection);

  function layout(): void {
    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width, 280);
    const height = Math.max(rect.height, 240);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    projection.fitSize([width, height], { type: 'Sphere' });
    spherePath.setAttribute('d', path({ type: 'Sphere' }) ?? '');
    for (const t of targets) {
      if (t.feature) {
        (t.el as SVGPathElement).setAttribute('d', path(t.feature) ?? '');
      } else {
        const p = projection([t.lng, t.lat]);
        if (p) {
          t.el.setAttribute('cx', String(p[0]));
          t.el.setAttribute('cy', String(p[1]));
        }
      }
    }
    for (const { el, feature: f } of inertEls) el.setAttribute('d', path(f) ?? '');
    renderStamps();
  }

  function stampPosition(t: Target): [number, number] | null {
    if (t.feature) {
      const c = path.centroid(t.feature);
      return Number.isFinite(c[0]) ? [c[0], c[1]] : null;
    }
    return projection([t.lng, t.lat]);
  }

  function renderStamps(): void {
    gStamps.replaceChildren();
    const { passport } = store.get();
    for (const t of targets) {
      if (!passport.has(t.selection.code)) continue;
      const p = stampPosition(t);
      if (!p) continue;
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.classList.add('stamp-mark');
      ring.setAttribute('cx', String(p[0]));
      ring.setAttribute('cy', String(p[1]));
      ring.setAttribute('r', '5.5');
      gStamps.appendChild(ring);
    }
  }

  // ---- state rendering ----
  function render(): void {
    const state = store.get();
    const cov = scopeCoverage(state.scope);
    for (const t of targets) {
      const { kind, code } = t.selection;
      const count =
        kind === 'country' ? (cov.countries[code] ?? 0) : (cov.entities[code] ?? 0);
      const s = step(count);
      t.el.classList.toggle('covered', s > 0);
      t.el.classList.toggle('zero', s === 0);
      if (s > 0) t.el.dataset['step'] = String(s);
      else delete t.el.dataset['step'];
      if (!t.feature) t.el.setAttribute('fill', s > 0 ? 'var(--accent)' : 'var(--muted)');

      const selected =
        !!state.selection && state.selection.kind === kind && state.selection.code === code;
      t.el.classList.toggle('selected', selected);
      t.el.setAttribute('aria-pressed', String(selected));
      if (selected) t.el.parentElement?.appendChild(t.el); // raise so outline isn't overdrawn
      t.el.setAttribute(
        'aria-label',
        count > 0
          ? `${t.name} — ${count} restaurant${count === 1 ? '' : 's'}`
          : `${t.name} — no restaurants yet`,
      );
    }
    renderStamps();
  }

  const observer = new ResizeObserver(() => layout());
  observer.observe(container);
  layout();
  render();

  store.subscribe((state, prev) => {
    if (
      state.scope !== prev.scope ||
      state.selection !== prev.selection ||
      state.passport !== prev.passport ||
      state.mobileScreen !== prev.mobileScreen
    ) {
      render();
    }
  });
}
