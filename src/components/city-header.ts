import type { Store } from '../state/store.ts';
import { displayName, restaurantsFor, flagEmoji } from '../data/loader.ts';
import { toggleStamp } from '../state/passport.ts';
import { areaChips } from './areas.ts';

export function mountCityHeader(container: HTMLElement, store: Store): void {
  function render(): void {
    const state = store.get();
    container.replaceChildren();

    const back = document.createElement('button');
    back.className = 'mobile-back';
    back.type = 'button';
    back.textContent = '← World map';
    back.addEventListener('click', () => {
      store.set({ selection: null, area: null, selectedRestaurant: null, mobileScreen: 'world' });
      const combobox = document.querySelector<HTMLInputElement>('.combobox input');
      combobox?.focus();
    });
    container.appendChild(back);

    // Active area filter, always clearable
    if (state.area) {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'area-filter-tag';
      tag.title = 'Clear the neighbourhood filter';
      tag.setAttribute('aria-label', `Clear neighbourhood filter: ${state.area}`);
      tag.append(`${state.area} `, Object.assign(document.createElement('span'), { textContent: '✕' }));
      tag.addEventListener('click', () => store.set({ area: null, selectedRestaurant: null }));
      container.appendChild(tag);
    }

    const h2 = document.createElement('h2');
    if (state.selection) {
      const flag =
        state.selection.kind !== 'region'
          ? flagEmoji(state.selection.kind, state.selection.code)
          : '';
      h2.textContent = `${flag ? `${flag} ` : ''}${displayName(state.selection)}`;
    } else {
      h2.textContent = state.area ?? 'Toronto';
    }
    h2.tabIndex = -1;
    container.appendChild(h2);

    if (!state.selection && !state.area) return;

    const count = state.restaurants
      ? restaurantsFor(state.restaurants, state.selection, state.scope, state.area).length
      : 0;
    if (count > 0) {
      const span = document.createElement('span');
      span.className = 'city-count';
      span.textContent = `${count} restaurant${count === 1 ? '' : 's'}${
        state.selection && state.area ? ` in ${state.area}` : ''
      }`;
      container.appendChild(span);
    }

    if (state.selection && state.selection.kind !== 'region') {
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

    if (state.area && state.restaurants) {
      container.appendChild(
        areaChips(state.restaurants, state.area, state.selection, (selection) => {
          const current = store.get().selection;
          const same =
            current && current.kind === selection.kind && current.code === selection.code;
          store.set({ selection: same ? null : selection, selectedRestaurant: null });
        }),
      );
    }
  }

  render();
  store.subscribe((state, prev) => {
    if (
      state.selection !== prev.selection ||
      state.area !== prev.area ||
      state.scope !== prev.scope ||
      state.passport !== prev.passport ||
      state.restaurants !== prev.restaurants
    ) {
      render();
      // Mobile screen swap: move focus to the heading
      if (
        (state.selection !== prev.selection || state.area !== prev.area) &&
        (state.selection || state.area) &&
        matchMedia('(max-width: 767px)').matches
      ) {
        container.querySelector('h2')?.focus();
      }
    }
  });
}
