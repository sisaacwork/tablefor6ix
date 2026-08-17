import type { Store } from '../state/store.ts';
import {
  displayName,
  demonym,
  coverageCount,
  restaurantsFor,
  lookup,
  REGION_LABELS,
  scopeCoverage,
} from '../data/loader.ts';
import { openSubmitDialog } from './submit-dialog.ts';

export function mountEmptyState(container: HTMLElement, store: Store): void {
  function render(): void {
    const state = store.get();
    const selection = state.selection;
    if (!selection) {
      container.hidden = true;
      container.replaceChildren();
      return;
    }

    const filteredCount = state.restaurants
      ? restaurantsFor(state.restaurants, selection, state.scope, state.area).length
      : state.area
        ? 1 // restaurants not loaded yet — don't flash the empty state
        : coverageCount(selection, state.scope);
    const show = filteredCount === 0;
    container.hidden = !show;
    if (!show) {
      container.replaceChildren();
      return;
    }

    const name = displayName(selection);
    container.replaceChildren();

    const h3 = document.createElement('h3');
    h3.textContent = state.area
      ? `No ${demonym(selection)} restaurant in ${state.area} on the map.`
      : `No ${demonym(selection)} restaurant in Toronto yet — that we know of.`;
    container.appendChild(h3);

    // Inside an area: the fix is usually to widen out, not to submit.
    if (state.area) {
      const cityWide = coverageCount(selection, state.scope);
      if (cityWide > 0) {
        const p = document.createElement('p');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'link-button';
        btn.textContent = `See all ${cityWide} ${state.scope === 'toronto' ? 'in Toronto' : 'across the GTA'}`;
        btn.addEventListener('click', () => store.set({ area: null, selectedRestaurant: null }));
        p.append(btn, ' — or pick another cuisine from the chips above.');
        container.appendChild(p);
        return;
      }
    }

    if (state.scope === 'toronto' && coverageCount(selection, 'gta') > 0) {
      const p = document.createElement('p');
      const n = coverageCount(selection, 'gta');
      p.textContent = `But there ${n === 1 ? 'is' : 'are'} ${n} in the wider GTA — switch the scope above to see ${n === 1 ? 'it' : 'them'}.`;
      container.appendChild(p);
    }

    const invite = document.createElement('p');
    const tellUs = document.createElement('button');
    tellUs.type = 'button';
    tellUs.className = 'link-button';
    tellUs.textContent = 'Know one? Tell us';
    tellUs.addEventListener('click', () => openSubmitDialog(name));
    invite.append(tellUs, ' — every suggestion goes on the map.');
    container.appendChild(invite);

    // Region nudge: the nearest thing we do have
    if (selection.kind === 'country') {
      const seat = lookup.seats.get(selection.code);
      const nudgeKey = seat?.nudge;
      if (nudgeKey) {
        const count = scopeCoverage(state.scope).regions[nudgeKey] ?? 0;
        if (count > 0) {
          const nudge = document.createElement('p');
          nudge.className = 'nudge';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'link-button';
          btn.textContent = `${count} ${REGION_LABELS[nudgeKey]} spot${count === 1 ? '' : 's'}`;
          btn.addEventListener('click', () =>
            store.set({
              selection: { kind: 'region', code: nudgeKey },
              selectedRestaurant: null,
            }),
          );
          nudge.append('Nearest thing on the map right now: ', btn, ' listed regionally.');
          container.appendChild(nudge);
        }
      }
    }
  }

  render();
  store.subscribe((state, prev) => {
    if (
      state.selection !== prev.selection ||
      state.area !== prev.area ||
      state.scope !== prev.scope ||
      state.restaurants !== prev.restaurants
    ) {
      render();
    }
  });
}
