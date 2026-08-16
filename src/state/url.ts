import type { AppState, Selection, View } from '../types.ts';
import type { Store } from './store.ts';
import { lookup } from '../data/loader.ts';

/**
 * URL scheme: ?c=ETH | ?c=r:caribbean | ?c=x:TWN, ?r=<restaurant id>,
 * ?scope=toronto (absent = gta), ?view=missing|about.
 */

export function parseUrl(search: string): Partial<AppState> {
  const params = new URLSearchParams(search);
  const out: Partial<AppState> = {};

  const scope = params.get('scope');
  out.scope = scope === 'toronto' ? 'toronto' : 'gta';

  const view = params.get('view');
  out.view = view === 'missing' || view === 'about' ? (view as View) : 'map';

  const c = params.get('c');
  if (c) {
    let selection: Selection | null = null;
    if (c.startsWith('r:') && lookup.regions.has(c.slice(2))) {
      selection = { kind: 'region', code: c.slice(2) };
    } else if (c.startsWith('x:') && lookup.entities.has(c.slice(2))) {
      selection = { kind: 'entity', code: c.slice(2) };
    } else if (lookup.seats.has(c.toUpperCase())) {
      selection = { kind: 'country', code: c.toUpperCase() };
    }
    if (selection) {
      out.selection = selection;
      out.mobileScreen = 'city';
    }
  }

  const r = params.get('r');
  if (r && /^(osm|manual)-[a-z]*-?\d+$/.test(r)) out.selectedRestaurant = r;

  return out;
}

function serialize(state: AppState): string {
  const params = new URLSearchParams();
  if (state.selection) {
    const { kind, code } = state.selection;
    params.set('c', kind === 'region' ? `r:${code}` : kind === 'entity' ? `x:${code}` : code);
  }
  if (state.selectedRestaurant) params.set('r', state.selectedRestaurant);
  if (state.scope === 'toronto') params.set('scope', 'toronto');
  if (state.view !== 'map') params.set('view', state.view);
  const qs = params.toString();
  return qs ? `?${qs}` : location.pathname;
}

export function bindUrl(store: Store): void {
  let applying = false;

  store.subscribe((state, prev) => {
    if (applying) return;
    const next = serialize(state);
    const current = location.search || location.pathname;
    if (next === current) return;
    if (state.view !== prev.view) history.pushState(null, '', next);
    else history.replaceState(null, '', next);
  });

  window.addEventListener('popstate', () => {
    applying = true;
    store.set({
      selection: null,
      selectedRestaurant: null,
      mobileScreen: 'world',
      ...parseUrl(location.search),
    });
    applying = false;
  });
}
