import type { Store } from '../state/store.ts';
import {
  displayName,
  demonym,
  coverageCount,
  lookup,
  REGION_LABELS,
  scopeCoverage,
} from '../data/loader.ts';
import { openSubmitDialog } from './submit-dialog.ts';

export function mountEmptyState(container: HTMLElement, store: Store): void {
  function render(): void {
    const state = store.get();
    const selection = state.selection;
    const show = !!selection && coverageCount(selection, state.scope) === 0;
    container.hidden = !show;
    if (!show || !selection) {
      container.replaceChildren();
      return;
    }

    const name = displayName(selection);
    container.replaceChildren();

    const h3 = document.createElement('h3');
    h3.textContent = `No ${demonym(selection)} restaurant in Toronto yet — that we know of.`;
    container.appendChild(h3);

    if (state.scope === 'toronto' && coverageCount(selection, 'gta') > 0) {
      const p = document.createElement('p');
      const n = coverageCount(selection, 'gta');
      p.innerHTML = '';
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
          btn.textContent = `${count} ${REGION_LABELS[nudgeKey]} spot${count === 1 ? '' : 's'}`;
          btn.style.textDecoration = 'underline';
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
    if (state.selection !== prev.selection || state.scope !== prev.scope) render();
  });
}
