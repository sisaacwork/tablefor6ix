# Table for 6ix

**[tablefor6ix.ca](https://tablefor6ix.ca)** — a map of Toronto's food from every country in
the world. Click a country, see where to eat it here.

- **World map** (D3, Equal Earth): countries coloured by how many Toronto restaurants serve
  their food. The counter — *N of 195 seats filled* — is the whole site in one line, and
  **The Missing** lists every country still at zero.
- **Toronto map** (Leaflet + CARTO): pick a country and see its restaurants across the GTA,
  with a Toronto-only filter.
- **Passport**: stamp the countries you've eaten. Lives in your browser's localStorage —
  no accounts, no tracking, no backend anywhere.

Everything is static: the restaurant data ships with the site as JSON, built from
OpenStreetMap at development time. See [DATA.md](DATA.md) for provenance, licensing (ODbL),
and how the pipeline works.

## Develop

```
npm install
npm run dev          # vite dev server
npm run build        # data build (strict) + vite build → dist/
npm run data:pull    # re-pull from Overpass (network; raw dumps are committed)
npm run data:build   # rebuild public/data/ from raw dumps
```

## Add a restaurant

[Open a submission](https://github.com/sisaacwork/tablefor6ix/issues/new?template=add-restaurant.yml)
— especially for a country in The Missing. Reviewed by hand into
[data/overrides.json](data/overrides.json).
