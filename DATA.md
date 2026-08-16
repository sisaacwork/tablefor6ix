# Data

## Provenance and licence

The restaurant dataset ([public/data/restaurants.json](public/data/restaurants.json)) is a
**derived database of OpenStreetMap data**, © OpenStreetMap contributors, licensed under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/). Under the
ODbL's share-alike terms, this derived database is itself available under the ODbL — that's
this public repository, including the raw pulls in `data/raw/` and the full pipeline that
produces the shipped files.

Other data:

- **Country shapes:** [Natural Earth](https://www.naturalearthdata.com/) (public domain), via
  the [`world-atlas`](https://github.com/topojson/world-atlas) package (110m resolution).
- **Country reference (names, codes, demonyms):** derived from the
  [`world-countries`](https://github.com/mledoze/countries) package (ODbL).
- **Basemap tiles (runtime):** [CARTO Positron](https://carto.com/attributions), rendered from
  OpenStreetMap data. Not stored in this repo.

## How the dataset is built

```
npm run data:pull        # Overpass → data/raw/<municipality>.json  (cached; network)
npm run data:build       # raw + cuisine-map + overrides → public/data/  (local only)
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
