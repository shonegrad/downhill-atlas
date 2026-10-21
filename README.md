# Downhill Atlas

A browser-based 3D explorer for famous ski courses. Mountains render as a stylized grayscale relief (plan-style); the colors in the scene come from the data: the featured course ribbon, difficulty-colored pistes, and lifts. Current MVP prototypes:
- **Streif, Kitzbühel** (Austria) — Hahnenkamm terrain, featured course ribbon + section landmarks, guided camera descent.
- **Duboka 1, Kopaonik** (Serbia) — resort-wide terrain with difficulty-colored pistes and lifts; featured run assembled from OSM ways.

Use the location selector in the bottom controls (also via `?loc=kopaonik`). Interaction rundown: orbit/zoom the terrain; toggle legend rows to show or hide layers by difficulty; click any course, piste or lift for a detail card with estimated length/elevations and its OSM source; camera presets (Overview, Top-down, Course start); a guided descent animation with pause/resume; landmark labels on the Streif; and one-click "Data & attribution". This is a visualization/discovery prototype, not a navigation or safety product. Official facts and DEM-derived estimates are labeled separately in the app.

## Run locally

```bash
npm install          # if npm errors (arborist bug), retry with: npm install --legacy-peer-deps
npm run dev          # dev server, opens http://localhost:5173
```

Production build:

```bash
npm run build        # typecheck + build static output to dist/
npm run preview      # serve dist/ locally
npm run qa           # headless browser smoke test (needs dev server on :5300)
```

The build is fully static (relative asset paths; verified working when served from a nested subpath such as `/sub/app/`), so it can also be hosted from a repository subpath (e.g., GitHub Pages) — no API keys are used at runtime.

## Regenerate the prepared dataset

All data under `public/data/streif/` is prepared offline. To rebuild it:

```bash
npm run prep:data
```

Steps (in `scripts/data-prep/`), per location config in `config.mjs`: OSM extract via Overpass (cached in `scripts/data-prep/raw/`), terrain tiles from the AWS Open Data terrain bucket (cached), featured-route assembly (OSM piste relations for Streif; tolerant endpoint-chaining by exact way name for Duboka 1, oriented by DEM elevation), context piste/lift export, and the per-location manifest plus the locations index.

Per-location outputs land in `public/data/<id>/`:

- `terrain.json` — 25 m height grid clipped to the location AOI, local metric frame
- `route.json` — featured course centerline (10 m spacing), landmarks (Streif), DEM estimates, descent duration
- `pistes.json`, `lifts.json` — context features (difficulty-colored in-app, no difficulty implied)
- `manifest.json` — sources, licenses, attribution, projection, processing, known gaps

Adding a new resort is a data task: add a `LOCATIONS` entry (`config.mjs`), run `npm run prep:data -- <id>`. The UI selector is driven by `public/data/locations.json`.

## Sources and licensing (summary; full text in `public/data/streif/manifest.json`)

- Terrain: Tilezen Terrain Tiles ("terrarium") from the AWS Open Data bucket. Austria pixels derive from `DGM Österreich` (© offene Daten Österreichs, CC BY 3.0 AT); Tilezen-required attribution lines are reproduced in the manifest and shown in the app's Data & attribution dialog.
- Featured routes, pistes, lifts, landmarks: © OpenStreetMap contributors (ODbL).
  - Streif: ordered member ways of OSM relation 12870777 "Streif-Rennstrecke"; race-only sections are mapped as "nur während Rennen präpariert"; some members shared with the family route.
  - Kopaonik: featured "Duboka 1" = ways matched by exact name, joined at endpoints and oriented by elevation. OSM classifies it intermediate (red). Notably, the famous "Karaman greben" ways form a contour circuit in OSM rather than a fall line, so it is not usable as a hero course — a data-quality finding worth carrying into any curated-correction work.
- Official facts (Streif: 3,312 m length, 860 m vertical drop, 1,665/805 m elevations): Hahnenkamm official course documentation, kept separate from computed estimates. Kopaonik has no verified official numbers yet; only estimates are shown.

Validation at prep time: Streif assembled length within ~2% of the official 3,312 m and DEM-sampled start/finish elevations 1,658/777 m vs official 1,665/805 m. Kopaonik Duboka 1: 1,954→1,655 m with a strictly monotone descent.

## Stack

TypeScript + Vite + Three.js (requires WebGL 2), plain HTML controls; prepared static assets; no runtime API keys. For a full status handoff (milestone status, known gaps, maintenance notes) see [HANDOVER.md](HANDOVER.md).
