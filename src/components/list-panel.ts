import type { Store } from '../state/store.ts';
import { restaurantsFor } from '../data/loader.ts';

export function mountListPanel(container: HTMLElement, store: Store): void {
  function render(): void {
    const state = store.get();
    container.replaceChildren();

    if (!state.selection) {
      const hint = document.createElement('p');
      hint.className = 'city-hint';
      hint.textContent =
        'Pick a country on the world map — or search for one — to see where to eat it in Toronto.';
      container.appendChild(hint);
      return;
    }
    if (!state.restaurants) {
      const hint = document.createElement('p');
      hint.className = 'city-hint';
      hint.textContent = 'Loading restaurants…';
      container.appendChild(hint);
      return;
    }

    const list = restaurantsFor(state.restaurants, state.selection, state.scope);
    if (list.length === 0) return; // empty state component handles this

    const ul = document.createElement('ul');
    for (const r of list) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'restaurant';
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(state.selectedRestaurant === r.id));
      btn.addEventListener('click', () => store.set({ selectedRestaurant: r.id }));

      const name = document.createElement('span');
      name.className = 'r-name';
      name.textContent = r.name;
      btn.appendChild(name);
      if (r.verified) {
        const check = document.createElement('span');
        check.className = 'r-verified';
        check.textContent = ' ✓';
        check.title = 'Verified';
        btn.appendChild(check);
      }

      const meta = document.createElement('div');
      meta.className = 'r-meta';
      const station = r.station
        ? `${r.station.kind === 'subway' ? '🚇' : '🚋'} ${r.station.name}`
        : null;
      meta.textContent = [r.address, r.neighbourhood, r.municipality, station]
        .filter(Boolean)
        .join(' · ');
      btn.appendChild(meta);

      if (r.note) {
        const note = document.createElement('div');
        note.className = 'r-note';
        note.textContent = r.note;
        btn.appendChild(note);
      }

      li.appendChild(btn);
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }

  render();
  store.subscribe((state, prev) => {
    if (
      state.selection !== prev.selection ||
      state.scope !== prev.scope ||
      state.restaurants !== prev.restaurants ||
      state.selectedRestaurant !== prev.selectedRestaurant
    ) {
      render();
    }
  });
}
