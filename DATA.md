# Data

## Provenance and licence

The restaurant dataset ([public/data/restaurants.json](public/data/restaurants.json)) is a
**derived database of OpenStreetMap data**, © OpenStreetMap contributors, licensed under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/). Under the
ODbL's share-alike terms, this derived database is itself available under the ODbL — that's
this public repository, including the raw pulls in `data/raw/` and the full pipeline that
produces the shipped files.

Other data:

- **Overture Maps** (supplemental source): the [Overture](https://overturemaps.org/) places
  theme ([CDLA-Permissive 2.0](https://cdla.dev/permissive-2-0/)), sourced largely from Meta
  business listings and considerably fresher than OSM. Pulled for the GTA with DuckDB
  (`data/raw/overture.json`, release pinned in [scripts/pull-overture.ts](scripts/pull-overture.ts),
  confidence ≥ 0.75). Places are mapped by Overture category (`ethiopian_restaurant` → the same
  cuisine table), run through the chain filter, deduped against OSM by name + proximity, assigned
  a municipality by point-in-polygon, and — in Toronto — subjected to the same DineSafe liveness
  check. Merged entries carry `source: "overture"`.
- **DineSafe** (liveness cross-check): City of Toronto food-premise inspection data,
  [Open Government Licence – Toronto](https://open.toronto.ca/open-data-license/). Condensed to
  unique establishments in `data/raw/dinesafe.json`.
- **TTC GTFS** (nearest stop): [TTC Routes and Schedules](https://open.toronto.ca/dataset/ttc-routes-and-schedules/)
  (OGL – Toronto), condensed to subway stations + streetcar stops in `data/raw/ttc-stops.json`.
  Each restaurant gets its nearest subway station (≤1.2km) or streetcar stop (≤600m) at build time.
- **Neighbourhoods** (reverse view): the City's [158 official neighbourhoods](https://open.toronto.ca/dataset/neighbourhoods/)
  (OGL – Toronto) in `data/raw/neighbourhoods.json`; Toronto restaurants are assigned by
  point-in-polygon at build time.
- **Country shapes:** [Natural Earth](https://www.naturalearthdata.com/) (public domain), via
  the [`world-atlas`](https://github.com/topojson/world-atlas) package (110m resolution).
- **Country reference (names, codes, demonyms):** derived from the
  [`world-countries`](https://github.com/mledoze/countries) package (ODbL).
- **Basemap tiles (runtime):** [CARTO Positron](https://carto.com/attributions), rendered from
  OpenStreetMap data. Not stored in this repo.

## How the dataset is built

```
npm run data:pull        # Overpass → data/raw/<municipality>.json  (cached; network)
npm run data:overture    # Overture places → data/raw/overture.json  (network; DuckDB)
npm run data:boundaries  # Municipality polygons → data/raw/boundaries.json  (network)
npm run data:dinesafe    # DineSafe → data/raw/dinesafe.json  (network)
npm run data:gtfs        # TTC GTFS → data/raw/ttc-stops.json  (network)
npm run data:areas       # Neighbourhood polygons → data/raw/neighbourhoods.json  (network)
npm run data:build       # raw + cuisine-map + chains + overrides → public/data/  (local only)
npm run data:countries   # regenerate data/countries.json (rarely needed)
```

1. **Pull** ([scripts/pull-osm.ts](scripts/pull-osm.ts)): one Overpass query per GTA
   municipality (pinned OSM relation ids in [scripts/config.ts](scripts/config.ts)) for
   `amenity=restaurant|fast_food|cafe` with a `cuisine` tag. Raw responses are committed to
   `data/raw/`, so site builds never touch the network; re-pull explicitly with `--force` or
   `--only=<slug>`.
2. **Clean & map** ([scripts/build-data.ts](scripts/build-data.ts)): merge, dedupe, tokenize
   cuisine tags, and map each token through [data/cuisine-map.json](data/cuisine-map.json) to
   ISO 3166-1 alpha-3 codes. A token maps to **countries** (possibly several — Nepali/Tibetan
   and Trinidadian/Guyanese places are real), a **region** (Caribbean, West African… — never
   fanned out across member countries), an **entity** (Taiwan, Hong Kong, Kosovo, Tibet —
   selectable but outside the 195 count), or the drop list (pizza, burger, coffee…).
   The build fails (`--strict`) if any cuisine value is unhandled.
   Two further filters:
   - **Chains** ([data/chains.json](data/chains.json)): franchise systems are excluded — a
     burrito franchise's "mexican" tag is a product, not a diaspora kitchen. Chains beloved by
     the diaspora they serve (Kinton Ramen, Congee Queen, Jollibee…) deliberately stay.
   - **DineSafe liveness** (City of Toronto only): an OSM restaurant with no licensed
     establishment of a matching name within 150m is treated as closed and dropped. Matching
     tolerates renames via shared distinctive name tokens; false positives can be exempted in
     `overrides.json → keepIds`.
3. **Overrides** ([data/overrides.json](data/overrides.json)): manual removals, patches, and
   additions applied last, so a re-pull never wipes editorial work. This is where
   [restaurant submissions](https://github.com/sisaacwork/tablefor6ix/issues/new?template=add-restaurant.yml)
   land after review.

## Known limitations

- Coverage is only as good as OSM's tagging. Restaurants without a `cuisine` tag don't appear;
  wrongly tagged ones appear wrongly. Corrections welcome — ideally in OSM itself, which fixes
  it for everyone at the next pull.
- `verified: false` means exactly that: seeded from OSM, not yet checked by a person.
- Closed restaurants linger until a re-pull or an override removes them.
