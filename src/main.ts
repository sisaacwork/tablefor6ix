import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

import { createStore } from './state/store.ts';
import { bindUrl, parseUrl } from './state/url.ts';
import { getStamps } from './state/passport.ts';
import { fetchRestaurants, displayName, coverageCount } from './data/loader.ts';
import { mountWorldMap } from './components/world-map.ts';
import { mountTorontoMap } from './components/toronto-map.ts';
import { mountCityHeader } from './components/city-header.ts';
import { mountListPanel } from './components/list-panel.ts';
import { mountEmptyState } from './components/empty-state.ts';
import { mountCombobox } from './components/combobox.ts';
import { mountCounter, mountScopeToggle } from './components/counter.ts';
import { mountSurprise } from './components/surprise.ts';
import { mountMissing } from './components/missing.ts';
import { mountAbout } from './components/about.ts';
import type { AppState } from './types.ts';

const el = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node;
};

const initial: AppState = {
  scope: 'gta',
  view: 'map',
  selection: null,
  selectedRestaurant: null,
  restaurants: null,
  mobileScreen: 'world',
  passport: getStamps(),
  ...parseUrl(location.search),
};

const store = createStore(initial);
bindUrl(store);

mountCounter(el('counter'), store);
mountScopeToggle(el('scope-toggle'), store);
mountCombobox(el('combobox'), store);
mountSurprise(el('surprise') as HTMLButtonElement, store);
mountWorldMap(el('world-map'), store);
mountTorontoMap(el('toronto-map'), store);
mountCityHeader(el('city-header'), store);
mountListPanel(el('list-panel'), store);
mountEmptyState(el('empty-state'), store);
mountMissing(el('missing-view'), store);
mountAbout(el('about-view'), store);

// ---- view switching (map | missing | about) ----
const main = el('main');
const navMissing = el('nav-missing');
const navAbout = el('nav-about');
navMissing.addEventListener('click', () => {
  store.set({ view: store.get().view === 'missing' ? 'map' : 'missing' });
});
navAbout.addEventListener('click', () => {
  store.set({ view: store.get().view === 'about' ? 'map' : 'about' });
});

function renderShell(): void {
  const state = store.get();
  main.hidden = state.view !== 'map';
  document.querySelector<HTMLElement>('.controls')!.hidden = state.view !== 'map';
  navMissing.setAttribute('aria-pressed', String(state.view === 'missing'));
  navAbout.setAttribute('aria-pressed', String(state.view === 'about'));
  document.body.dataset['mobileScreen'] = state.mobileScreen;
}
renderShell();

// ---- selection announcements for screen readers ----
const liveRegion = el('live-region');
store.subscribe((state, prev) => {
  if (state.view !== prev.view || state.mobileScreen !== prev.mobileScreen) renderShell();
  if (state.selection !== prev.selection && state.selection) {
    const count = coverageCount(state.selection, state.scope);
    liveRegion.textContent =
      count > 0
        ? `${displayName(state.selection)}. ${count} restaurant${count === 1 ? '' : 's'} shown.`
        : `${displayName(state.selection)}. No restaurants yet.`;
    // Tablet (stacked) layout: bring the Toronto map into view on selection
    if (matchMedia('(min-width: 768px) and (max-width: 1023px)').matches) {
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      el('city-panel').scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    }
  }
});

// ---- restaurants: load lazily, but eagerly when a deep link needs them ----
function loadRestaurants(): void {
  fetchRestaurants()
    .then((restaurants) => store.set({ restaurants }))
    .catch((err) => console.error('Failed to load restaurants', err));
}
if (initial.selection) loadRestaurants();
else if ('requestIdleCallback' in window) requestIdleCallback(() => loadRestaurants());
else setTimeout(loadRestaurants, 800);

// Restaurant data is also needed the moment any selection happens
store.subscribe((state, prev) => {
  if (state.selection && state.selection !== prev.selection && !state.restaurants) {
    loadRestaurants();
  }
});
