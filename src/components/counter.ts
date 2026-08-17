import type { Store } from '../state/store.ts';
import { COVERAGE, SEAT_TOTAL, lookup, scopeCoverage } from '../data/loader.ts';
import { downloadShareCard } from './share-card.ts';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The site's thesis in one line: "63 of 195 seats filled." */
export function mountCounter(container: HTMLElement, store: Store): void {
  const fraction = document.createElement('div');
  fraction.className = 'counter-fraction';
  const label = document.createElement('div');
  label.className = 'counter-label';
  const passportLine = document.createElement('div');
  passportLine.className = 'counter-passport';
  container.append(fraction, label, passportLine);

  let displayed = 0;
  let ticker: number | null = null;

  function setFraction(n: number): void {
    fraction.innerHTML = '';
    const strong = document.createElement('span');
    strong.textContent = String(n);
    const of = document.createElement('span');
    of.className = 'of';
    of.textContent = ` / ${SEAT_TOTAL}`;
    fraction.append(strong, of);
  }

  function animateTo(target: number): void {
    if (ticker) cancelAnimationFrame(ticker);
    if (reducedMotion() || displayed === 0) {
      displayed = target;
      setFraction(target);
      return;
    }
    const from = displayed;
    const start = performance.now();
    const duration = 400;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      displayed = Math.round(from + (target - from) * eased);
      setFraction(displayed);
      if (t < 1) ticker = requestAnimationFrame(tick);
    };
    ticker = requestAnimationFrame(tick);
  }

  function render(): void {
    const state = store.get();
    const totals = COVERAGE.totals[state.scope];
    animateTo(totals.covered);

    label.innerHTML = '';
    label.append('seats filled · ');
    const missing = document.createElement('span');
    missing.className = 'missing-count';
    missing.textContent = String(totals.missing);
    label.append(missing, ' missing');

    // Personal passport count against available coverage in scope
    const cov = scopeCoverage(state.scope);
    const stampedSeats = [...state.passport].filter(
      (code) => lookup.seats.has(code) && (cov.countries[code] ?? 0) > 0,
    ).length;
    passportLine.replaceChildren();
    if (stampedSeats > 0) {
      passportLine.append(`You've eaten ${stampedSeats} of the ${totals.covered} available · `);
      const share = document.createElement('button');
      share.type = 'button';
      share.className = 'link-button';
      share.textContent = 'share card ↓';
      share.title = 'Download your stamped map as an image';
      share.addEventListener('click', () => {
        void downloadShareCard(store.get().passport, store.get().scope);
      });
      passportLine.appendChild(share);
    }
  }

  render();
  store.subscribe((state, prev) => {
    if (state.scope !== prev.scope || state.passport !== prev.passport) render();
  });
}

/** GTA | Toronto-only segmented control. */
export function mountScopeToggle(container: HTMLElement, store: Store): void {
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Geographic scope');
  const options: { value: 'gta' | 'toronto'; label: string; title: string }[] = [
    { value: 'gta', label: 'GTA', title: 'Toronto plus first-ring suburbs' },
    { value: 'toronto', label: 'Toronto only', title: 'The amalgamated City of Toronto' },
  ];
  const buttons = options.map((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.title = opt.title;
    btn.addEventListener('click', () => store.set({ scope: opt.value }));
    container.appendChild(btn);
    return { btn, value: opt.value };
  });

  function render(): void {
    const { scope } = store.get();
    for (const { btn, value } of buttons) btn.setAttribute('aria-pressed', String(scope === value));
  }

  render();
  store.subscribe((state, prev) => {
    if (state.scope !== prev.scope) render();
  });
}
