# Table for 6ix — build handoff

**Domain:** tablefor6ix.ca
**One line:** A map of Toronto's food from every country in the world. Click a country, see where to eat it here.

This document is the spec. Read the whole thing before writing code — the data section is the part that determines whether this project works, and it's easy to get wrong by starting with the map.

---

## 1. Constraints (non-negotiable)

1. **Zero recurring cost beyond the domain.** No paid API tiers, no database server, no serverless functions that require a billing card. Free-tier static hosting only.
2. **No user accounts, no login, no backend.** Anything that looks like user state lives in `localStorage`.
3. **No API keys committed to the repo, and ideally no API keys at all.** This is a public repo on a static host; anything shipped to the client is public. Choose services that don't require a key.
4. **Data ships with the site.** Restaurant data is a static JSON file in the repo, not a runtime API call. This is what makes the whole thing free and fast.
5. **The site must work on a phone.** Two side-by-side maps is a desktop layout; see §6 for the mobile behaviour.

---

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Vite + vanilla TS, or Astro | No SSR needed. Keep the bundle small. Do **not** reach for Next.js. |
| World map | D3 (`d3-geo`, `d3-selection`) rendering TopoJSON | Gives full control over projection and click targets, no tile server, no key. |
| World map data | Natural Earth 110m countries via the `world-atlas` package | Small (~100KB), ISO-coded, MIT-ish licensing. 110m is the right resolution — 50m is overkill and slow to hit-test. |
| Toronto map | Leaflet | Smaller and simpler than MapLibre for a marker-on-basemap use case. |
| Toronto basemap tiles | CARTO Positron (`light_all`) or standard OSM tiles | Both free and keyless for low-traffic hobby use. Verify current usage policies before shipping and add the required attribution. |
| Restaurant data | Static `restaurants.json` in the repo | See §3. |
| Hosting | Cloudflare Pages (preferred) or GitHub Pages | Free, custom domain, automatic deploys from git, generous bandwidth. |
| Domain | `.ca` registrar — Cloudflare Registrar does **not** sell `.ca`, so use Namecheap/Porkbun/easyDNS and point nameservers at Cloudflare | Flag this to Isaac; it's the one thing that costs money. |

**Upgrade path to note but not build now:** if tile usage or basemap styling becomes a problem, swap Leaflet+raster tiles for MapLibre GL + a Protomaps `.pmtiles` extract of the GTA served as a static file from the same host. Keyless, unlimited, self-contained. Adds ~30–60MB to the deploy and meaningful complexity — not for v1.

---

## 3. Data — read this before anything else

This project lives or dies on the restaurant dataset. There is no free, redistributable API that answers "restaurants in Toronto by country of cuisine." Google Places forbids storing results, costs money at volume, and needs a key. Yelp's API is restrictive. Do not design around either.

### Source of truth: a curated JSON file in the repo

**Seed it from OpenStreetMap.** OSM has `amenity=restaurant|fast_food|cafe` with a `cuisine=*` tag, and its coverage of Toronto's diaspora restaurants is genuinely good. Pull once via the Overpass API with a script, then commit the cleaned result. This is a build-time script, not a runtime dependency.

- Bounding box: Toronto proper plus first-ring suburbs — Mississauga, Brampton, Markham, Richmond Hill, Scarborough, North York, Etobicoke, Vaughan. **Do not limit to the old City of Toronto.** A huge share of the interesting country coverage (Afghan, Sri Lankan, Filipino, Persian, Guyanese, Ethiopian) is north of Steeles or out past Kipling, and a site that stops at the city line will look like it thinks the world ends at Bloor.
- OSM is **ODbL** — attribution is required and share-alike applies to the derived database. Put attribution in the footer and a `DATA.md` in the repo. Say so plainly.
- Expect the Overpass dump to be messy: free-text cuisine values, semicolon-delimited multi-values, misspellings, closed restaurants. Write the cleaning script to be re-runnable, and keep manual corrections in a separate overlay file so a re-pull doesn't wipe them.

### The mapping problem

`cuisine=*` in OSM is not a country code. It's things like `chinese`, `szechuan`, `hakka`, `caribbean`, `west_african`, `pizza`. You need a hand-written **cuisine → ISO 3166-1 alpha-3** lookup table, committed as `cuisine-map.json`. Build it iteratively: run the script, dump every unmapped cuisine value sorted by frequency, map the top ones, repeat.

Rules for the mapping:
- A restaurant may map to **multiple countries**. Nepali/Tibetan, Trinidadian/Guyanese, Persian/Afghan places are common and real. The relation is many-to-many.
- Regional cuisines map to their country (`szechuan` → CHN, `sicilian` → ITA).
- Genuinely multi-country cuisines (`caribbean`, `west_african`, `middle_eastern`) should **not** be silently fanned out to every constituent country — that would fake coverage. Give them a `region` field and surface them separately as "regional, not country-specific." Getting this wrong is the difference between an honest map and an inflated one.
- Cuisines with no country (`pizza`, `burger`, `sandwich`, `coffee_shop`) get dropped.

### Schema

```json
{
  "id": "osm-node-123456789",
  "name": "Restaurant name",
  "countries": ["ETH", "ERI"],
  "region": null,
  "lat": 43.6532,
  "lng": -79.3832,
  "address": "123 Danforth Ave",
  "neighbourhood": "Greektown",
  "website": "https://...",
  "verified": false,
  "note": "Optional one-line editorial note from Isaac",
  "source": "osm"
}
```

Also generate a derived `coverage.json` at build time: `{ "ETH": 12, "TUV": 0, ... }` for all 195 UN member states, so the world map can colour itself without loading the full restaurant file up front.

### Expected outcome — set expectations now

Toronto will cover somewhere in the range of 60–100 countries with real restaurants. **The majority of the world's countries will have zero.** Do not treat this as a failure state to hide. The gaps are the most interesting thing on the site and should be designed for deliberately (§5, "The Missing").

---

## 4. Core interaction

1. World map renders as a choropleth: countries with ≥1 Toronto restaurant are filled in the accent colour with intensity by count; countries with zero are a flat muted fill.
2. Click (or keyboard-select) a country → the Toronto map pans/zooms to fit that country's restaurants and drops markers; a list panel populates alongside.
3. Selected country gets a persistent outline on the world map. Selection is reflected in the URL as `?c=ETH` so any country view is linkable and shareable.
4. Clicking a zero-coverage country does **not** do nothing. It shows a proper empty state: "No Ecuadorian restaurant in Toronto yet — that we know of." plus a submit link and a nudge toward the nearest thing (same region, if a `region` match exists).
5. Marker click → popup with name, address, neighbourhood, nearest subway/RT station if computed, website link.

**Accessibility:** the world map cannot be the only way to select a country. Ship a searchable country list — a combobox with type-ahead — that drives the same selection state. Map polygons need `role="button"`, `tabindex`, accessible names, and visible focus. This is also just better UX: nobody can find Eritrea on a Mercator projection quickly.

**Projection:** use Equal Earth, not Web Mercator. It's an equal-area projection, it looks distinctive, and on a site about every country in the world it's the honest choice — Mercator inflates the countries with the least representation in Toronto's restaurant scene and shrinks the ones with the most.

---

## 5. Features beyond the core

Build in this order. Everything here is cheap because there's no backend.

**Tier 1 — build with v1**

- **The counter.** "108 of 195 seats filled." Persistent in the header. This is the site's thesis in one line and it should never be more than a glance away.
- **The Missing.** A dedicated view listing every country with zero coverage, as a wall of names. Each one links to the submission form. This turns the site's biggest weakness into its call to action and its best social-share object.
- **Passport.** Users tick countries they've eaten in Toronto. Stored in `localStorage`, no account. Shows as stamps on the world map and as a personal count against the site's coverage: "You've eaten 23 of the 108 available." This is the feature that makes people come back.
- **Surprise me.** A button that picks a random covered country and drops you into it. Weight toward countries with fewer restaurants so it surfaces the unusual ones rather than serving Italian every time.
- **Deep links.** `?c=ETH` for country, `?r=osm-node-123` for a single restaurant.

**Tier 2 — if time allows**

- **Reverse view.** Click a Toronto neighbourhood or ward → see which countries it covers. This is the version of the site that's actually about Toronto's geography rather than the world's, and it's the one that would interest a planning audience.
- **Nearest station.** Precompute the closest TTC subway/streetcar stop for each restaurant at build time using the open TTC GTFS feed (City of Toronto Open Data, free). Show it in the popup. Cheap, purely static, and it makes the site usable for actually planning a night out.
- **Passport share card.** Render the user's stamped map to a canvas and offer a PNG download. No server needed.
- **Coverage over time.** If the dataset is versioned in git, a small line chart of countries covered by month. Very much your kind of thing, and it costs nothing but a build script.

**Explicitly out of scope for v1:** reviews, ratings, hours, photos, price levels, booking. All of these require a paid API or constant maintenance and none of them are what the site is for. Link out to the restaurant's own site and stop.

### Submissions without a backend

Use a **prefilled GitHub Issue link** with an issue template (`/issues/new?template=add-restaurant.yml&title=...`). Free, zero infrastructure, keeps data changes in the same place as the code, and gives a public record of contributions. Fall back to a Google Form only if Isaac wants submissions from people without GitHub accounts — in which case use both and label them clearly.

---

## 6. Layout and responsive behaviour

**Desktop (≥1024px):** world map and Toronto map side by side, roughly 55/45, with the restaurant list as a scrollable panel beneath or beside the Toronto map. Both maps visible at once is the whole conceit — don't break it on desktop.

**Tablet (768–1023px):** stack vertically, world map on top at reduced height, Toronto map below. Selecting a country scrolls the Toronto map into view.

**Mobile (<768px):** do not try to show both maps. Default to the world map full-bleed; selecting a country transitions to the Toronto view with a persistent back control and the selected country named in the header. Treat it as two screens with a clear relationship, not one cramped screen.

---

## 7. Design direction

The brief here is *atlas*, not *food blog*. No stock photography of plates, no warm-cream-and-terracotta restaurant-website palette, no script fonts. The reference points are reference works: transit diagrams, ordnance survey sheets, the endpapers of an old world atlas.

- **Palette:** a cool paper ground rather than a warm cream, a near-black ink for type, one saturated accent used exclusively for coverage/selection, a muted neutral for the zero-coverage countries, and a single warm tone reserved for passport stamps. Five values, no gradients. The accent should be the only high-chroma thing on the page so that the map reads instantly.
- **Type:** pair a characterful display face with a workmanlike body face, plus a mono or condensed grotesque for the data furniture — country codes, counts, coordinates. Use the utility face for anything numeric. Country names in the list should be set in the display face at a size that makes the list itself feel like the point.
- **Signature element:** the counter. Give it real presence — the fraction against 195, animating on selection, with the missing-country count as its shadow. It's the one place to spend boldness. Everything else stays quiet.
- **Motion:** the transition from world selection to Toronto markers should be one orchestrated moment — country outline locks, Toronto map eases to fit bounds, markers stagger in over ~300ms. Nothing else on the site animates. Respect `prefers-reduced-motion`.
- **Copy:** plain and specific. Empty states are invitations, not apologies — "No Ecuadorian restaurant in Toronto yet — that we know of" and a link, never "Sorry, no results found."

Quality floor, unannounced: keyboard navigable throughout, visible focus rings, colour contrast at AA against the paper ground, and the map choropleth must not rely on colour alone to distinguish covered from uncovered — use a pattern fill or outline weight as well.

---

## 8. Build order

**Phase 0 — data.** Overpass query, cleaning script, cuisine mapping table, `restaurants.json` + `coverage.json` committed. Print the coverage count when the script finishes. Do not start the UI until this produces a file you'd be comfortable shipping. This is the majority of the real work.

**Phase 1 — core loop.** World map, country selection, Toronto map, marker rendering, restaurant list, URL state, empty states. Deploy this.

**Phase 2 — the fun.** Counter, The Missing, passport, surprise me.

**Phase 3 — polish.** Nearest station, reverse view, share card, whatever else survives.

---

## 9. Decisions for Isaac

Flag these rather than guessing:

1. **Geographic boundary** — does "Toronto" mean the amalgamated city, or the GTA? The spec assumes GTA. This materially changes the coverage number.
2. **What counts as a country** — 195 UN member states is the spec's assumption. Taiwan, Palestine, Kosovo, Hong Kong and Tibet all have Toronto restaurants and none are UN member states. This is a genuinely political question on a site about diaspora food and it deserves a deliberate answer plus a short, honest note on the About page explaining whatever gets chosen. Don't let the default fall out of whichever dataset gets used.
3. **Editorial layer** — does Isaac want to hand-verify and annotate entries, or is OSM data as-is acceptable for v1? The `verified` and `note` fields exist either way.
4. **Regional cuisines** — how prominently should "Caribbean" or "West African" places surface when they can't be pinned to one country?

---

## 10. Things not to do

- Don't call Google Places, Yelp, or Foursquare at runtime.
- Don't add a database, an ORM, or serverless functions. If a feature seems to need one, it's a Tier 2 feature that should be precomputed at build time instead.
- Don't scrape a restaurant aggregator. It breaks, it's against their terms, and the data can't be redistributed.
- Don't fan regional cuisines out across countries to inflate the coverage number. The number's credibility is the site's credibility.
- Don't use Web Mercator.
- Don't put photos of food on it.
