import type { Store } from '../state/store.ts';
import { COUNTRIES, COVERAGE, scopeCoverage } from '../data/loader.ts';
import { submissionUrl } from '../submit.ts';

/** The Missing: every zero-coverage country, as a wall of names. */
export function mountMissing(container: HTMLElement, store: Store): void {
  function render(): void {
    const state = store.get();
    container.hidden = state.view !== 'missing';
    if (container.hidden) return;

    const cov = scopeCoverage(state.scope);
    const missing = COUNTRIES.seats.filter((s) => (cov.countries[s.iso3] ?? 0) === 0);

    container.replaceChildren();
    const h2 = document.createElement('h2');
    h2.textContent = 'The Missing';
    const sub = document.createElement('p');
    sub.className = 'missing-sub';
    sub.textContent = `${missing.length} of ${COVERAGE.seats} countries with no ${
      state.scope === 'toronto' ? 'Toronto' : 'GTA'
    } restaurant on the map — that we know of. Know one? Every name is a link.`;
    container.append(h2, sub);

    const wall = document.createElement('ul');
    wall.className = 'missing-wall';
    for (const seat of missing) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = submissionUrl(seat.name);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = seat.name;
      a.title = `Suggest a ${seat.name} restaurant`;
      li.appendChild(a);
      wall.appendChild(li);
    }
    container.appendChild(wall);
  }

  render();
  store.subscribe((state, prev) => {
    if (state.view !== prev.view || state.scope !== prev.scope) render();
  });
}
