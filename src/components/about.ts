import type { Store } from '../state/store.ts';
import { COVERAGE } from '../data/loader.ts';
import { REPO_URL, submissionUrl } from '../submit.ts';

export function mountAbout(container: HTMLElement, store: Store): void {
  let rendered = false;

  function render(): void {
    const state = store.get();
    container.hidden = state.view !== 'about';
    if (container.hidden || rendered) return;
    rendered = true;

    container.innerHTML = `
      <h2>About</h2>
      <p>Table for 6ix maps where to eat the world in Toronto: every restaurant we know of,
      organized by the country its food comes from. ${COVERAGE.totals.gta.covered} of
      ${COVERAGE.seats} countries are represented so far. The gaps are the point —
      see <strong>Missing Countries</strong>.</p>

      <h3>What counts as a country</h3>
      <p>The denominator is 195: the 193 member states of the United Nations plus the two
      observer states, Palestine and the Vatican. That is a convention, not a claim about
      what a country is. Taiwan, Hong Kong, Kosovo, and Tibet all have real restaurants in
      Toronto and real communities behind them; they appear on the map as searchable places
      of their own, marked "beyond the 195," and they never inflate the count. Reasonable
      people draw these lines differently — this is just where we drew ours, and we'd rather
      say so plainly than pretend the question doesn't exist.</p>

      <h3>What counts as Toronto</h3>
      <p>The default scope is the GTA — Toronto plus Mississauga, Brampton, Markham,
      Richmond Hill, Vaughan, Pickering, Ajax, Oakville, Aurora, and Newmarket — because
      a huge share of the region's food is north of Steeles or west of Kipling. The
      "Toronto only" toggle narrows to the amalgamated city.</p>

      <h3>Regional cuisines</h3>
      <p>Some restaurants are Caribbean, West African, or Middle Eastern rather than any one
      country's — so that's how we list them. We don't spread a "Caribbean" restaurant across
      thirteen island nations to pump up the number; the count's credibility is the site's
      credibility.</p>

      <h3>The data</h3>
      <p>Seeded from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
      (© OpenStreetMap contributors, <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>)
      and <a href="https://overturemaps.org/">Overture Maps</a> (CDLA-Permissive 2.0),
      cross-checked against the City of Toronto's
      <a href="https://open.toronto.ca/dataset/dinesafe/">DineSafe</a> registry of licensed food
      premises so closed restaurants don't linger, cleaned by hand, and maintained in a public
      repo — the derived database is <a href="${REPO_URL}">right here</a>. Franchise chains are
      deliberately excluded: a burrito franchise is not what a map of the world's food in
      Toronto is for. It will still have mistakes and gaps.
      <a href="${submissionUrl()}">Corrections and additions are welcome</a>.
      Your passport stamps live in your browser only; there are no accounts and no tracking.</p>
    `;
  }

  render();
  store.subscribe((state, prev) => {
    if (state.view !== prev.view) render();
  });
}
