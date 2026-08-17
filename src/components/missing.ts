import type { Store } from '../state/store.ts';
import { COUNTRIES, COVERAGE, scopeCoverage } from '../data/loader.ts';
import { openSubmitDialog } from './submit-dialog.ts';

/** Missing Countries: every zero-coverage country, as a wall of names. */
export function mountMissing(container: HTMLElement, store: Store): void {
  function render(): void {
    const state = store.get();
    container.hidden = state.view !== 'missing';
    if (container.hidden) return;

    const cov = scopeCoverage(state.scope);
    const missing = COUNTRIES.seats.filter((s) => (cov.countries[s.iso3] ?? 0) === 0);

    container.replaceChildren();
    const h2 = document.createElement('h2');
    h2.textContent = 'Missing Countries';
    const sub = document.createElement('p');
    sub.className = 'missing-sub';
    sub.textContent = `${missing.length} of ${COVERAGE.seats} countries with no ${
      state.scope === 'toronto' ? 'Toronto' : 'GTA'
    } restaurant on the map (yet). Know one? Click a country below and let us know.`;
    container.append(h2, sub);

    const wall = document.createElement('ul');
    wall.className = 'missing-wall';
    for (const seat of missing) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = seat.name;
      btn.title = `Suggest a ${seat.name} restaurant`;
      btn.addEventListener('click', () => openSubmitDialog(seat.name));
      li.appendChild(btn);
      wall.appendChild(li);
    }
    container.appendChild(wall);
  }

  render();
  store.subscribe((state, prev) => {
    if (state.view !== prev.view || state.scope !== prev.scope) render();
  });
}
