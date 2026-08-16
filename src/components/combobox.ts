import type { Store } from '../state/store.ts';
import type { Selection } from '../types.ts';
import { COUNTRIES, REGION_LABELS, scopeCoverage } from '../data/loader.ts';

interface Option {
  selection: Selection;
  name: string;
  kindLabel: string | null;
  haystack: string;
}

/** ARIA 1.2 combobox over seats + entities + regions — the primary keyboard path. */
export function mountCombobox(container: HTMLElement, store: Store): void {
  const options: Option[] = [
    ...COUNTRIES.seats.map((s) => ({
      selection: { kind: 'country', code: s.iso3 } as Selection,
      name: s.name,
      kindLabel: null,
      haystack: [s.name, s.iso3, ...s.aliases].join(' ').toLowerCase(),
    })),
    ...COUNTRIES.entities.map((e) => ({
      selection: { kind: 'entity', code: e.code } as Selection,
      name: e.name,
      kindLabel: 'beyond the 195',
      haystack: [e.name, e.code, ...e.aliases].join(' ').toLowerCase(),
    })),
    ...Object.entries(REGION_LABELS).map(([key, label]) => ({
      selection: { kind: 'region', code: key } as Selection,
      name: label,
      kindLabel: 'regional',
      haystack: label.toLowerCase(),
    })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'combobox-list');
  input.setAttribute('aria-label', 'Find a country');
  input.placeholder = 'Find a country…';

  const list = document.createElement('ul');
  list.id = 'combobox-list';
  list.className = 'combobox-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Countries');
  list.hidden = true;

  container.append(input, list);

  let filtered: Option[] = [];
  let active = -1;

  function countFor(o: Option): number {
    const cov = scopeCoverage(store.get().scope);
    if (o.selection.kind === 'country') return cov.countries[o.selection.code] ?? 0;
    if (o.selection.kind === 'entity') return cov.entities[o.selection.code] ?? 0;
    return cov.regions[o.selection.code] ?? 0;
  }

  function close(): void {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function choose(o: Option): void {
    store.set({ selection: o.selection, selectedRestaurant: null, mobileScreen: 'city', view: 'map' });
    input.value = '';
    close();
  }

  function setActive(i: number): void {
    active = i;
    [...list.children].forEach((el, idx) => {
      el.setAttribute('aria-selected', String(idx === active));
      if (idx === active) {
        input.setAttribute('aria-activedescendant', el.id);
        (el as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function open(): void {
    const q = input.value.trim().toLowerCase();
    filtered = q
      ? options.filter((o) => o.haystack.includes(q))
      : options.filter((o) => countFor(o) > 0);
    list.replaceChildren();
    filtered.slice(0, 60).forEach((o, i) => {
      const li = document.createElement('li');
      li.id = `cb-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      const name = document.createElement('span');
      name.className = 'opt-name';
      name.textContent = o.name;
      li.appendChild(name);
      if (o.kindLabel) {
        const kind = document.createElement('span');
        kind.className = 'opt-kind';
        kind.textContent = o.kindLabel;
        li.appendChild(kind);
      }
      const count = document.createElement('span');
      count.className = 'opt-count';
      const n = countFor(o);
      count.textContent = n > 0 ? String(n) : 'none yet';
      li.appendChild(count);
      li.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus on input
        choose(o);
      });
      list.appendChild(li);
    });
    list.hidden = filtered.length === 0;
    input.setAttribute('aria-expanded', String(!list.hidden));
    active = -1;
  }

  input.addEventListener('input', open);
  input.addEventListener('focus', open);
  input.addEventListener('blur', () => close());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) open();
      const n = Math.min(filtered.length, 60);
      if (n === 0) return;
      setActive(e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n);
    } else if (e.key === 'Enter') {
      const pick = active >= 0 ? filtered[active] : filtered.length === 1 ? filtered[0] : undefined;
      if (pick) {
        e.preventDefault();
        choose(pick);
      }
    } else if (e.key === 'Escape') {
      if (!list.hidden) {
        close();
      } else {
        input.value = '';
      }
    }
  });
}
