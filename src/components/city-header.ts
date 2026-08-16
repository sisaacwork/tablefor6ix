import type { Store } from '../state/store.ts';
import { displayName, coverageCount } from '../data/loader.ts';
import { toggleStamp } from '../state/passport.ts';

export function mountCityHeader(container: HTMLElement, store: Store): void {
  function render(): void {
    const state = store.get();
    container.replaceChildren();

    const back = document.createElement('button');
    back.className = 'mobile-back';
    back.type = 'button';
    back.textContent = '← World map';
    back.addEventListener('click', () => {
      store.set({ selection: null, selectedRestaurant: null, mobileScreen: 'world' });
      const combobox = document.querySelector<HTMLInputElement>('.combobox input');
      combobox?.focus();
    });
    container.appendChild(back);

    const h2 = document.createElement('h2');
    if (!state.selection) {
      h2.textContent = 'Toronto';
      container.appendChild(h2);
      return;
    }

    h2.textContent = displayName(state.selection);
    h2.tabIndex = -1;
    container.appendChild(h2);

    const count = coverageCount(state.selection, state.scope);
    if (count > 0) {
      const span = document.createElement('span');
      span.className = 'city-count';
      span.textContent = `${count} restaurant${count === 1 ? '' : 's'}`;
      container.appendChild(span);
    }

    if (state.selection.kind !== 'region') {
      const code = state.selection.code;
      const stamped = state.passport.has(code);
      const stamp = document.createElement('button');
      stamp.className = 'stamp-toggle';
      stamp.type = 'button';
      stamp.setAttribute('aria-pressed', String(stamped));
      stamp.textContent = stamped ? 'Stamped ✓' : 'Stamp it';
      stamp.title = 'Mark that you have eaten this country in Toronto';
      stamp.addEventListener('click', () => {
        store.set({ passport: toggleStamp(code) });
      });
      container.appendChild(stamp);
    }
  }

  render();
  store.subscribe((state, prev) => {
    if (
      state.selection !== prev.selection ||
      state.scope !== prev.scope ||
      state.passport !== prev.passport
    ) {
      render();
      // Mobile screen swap: move focus to the heading
      if (
        state.selection &&
        state.selection !== prev.selection &&
        matchMedia('(max-width: 767px)').matches
      ) {
        container.querySelector('h2')?.focus();
      }
    }
  });
}
