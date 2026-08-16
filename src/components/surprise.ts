import type { Store } from '../state/store.ts';
import { scopeCoverage } from '../data/loader.ts';

/**
 * Random covered country, weighted 1/sqrt(count) so the one-restaurant
 * countries surface more often than Italy does.
 */
export function mountSurprise(button: HTMLButtonElement, store: Store): void {
  button.addEventListener('click', () => {
    const state = store.get();
    const cov = scopeCoverage(state.scope);
    const current = state.selection?.kind === 'country' ? state.selection.code : null;
    const candidates = Object.entries(cov.countries).filter(
      ([code, count]) => count > 0 && code !== current,
    );
    if (candidates.length === 0) return;
    const weights = candidates.map(([, count]) => 1 / Math.sqrt(count));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    let pick = candidates[candidates.length - 1]![0];
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) {
        pick = candidates[i]![0];
        break;
      }
    }
    store.set({
      selection: { kind: 'country', code: pick },
      selectedRestaurant: null,
      mobileScreen: 'city',
      view: 'map',
    });
  });
}
