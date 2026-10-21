# Downhill Atlas — Project Handover

**Date:** 21 October 2026
**State:** All four plan milestones implemented, QA-verified, and deployed.
**Live:** https://shonegrad.github.io/downhill-atlas/
**Repo:** `github.com/shonegrad/downhill-atlas` (branch `main`, deploys automatic on push)

## What this is

A static, browser-based 3D explorer for named ski courses. Mountains render as a stylized
grayscale relief; all scene color is data-driven (featured course ribbon, difficulty-colored
pistes, lifts). Two locations ship today:

| Location | Featured course | Source of route line | Landmarks |
| --- | --- | --- | --- |
| Kitzbühel, Austria | Streif (relation `12870777`, ordered member ways) | OSM relation, validated ±2% vs official 3,312 m | 14 course sections |
| Kopaonik, Serbia | Duboka 1 (`Дубока 1`, ways matched by exact name, joined and DEM-oriented) | OSM ways, monotone descent 1954→1655 m | none |

Adding another resort is a data task: add an entry to `LOCATIONS` in
`scripts/data-prep/config.mjs`, run `npm run prep:data -- <id>`, and regenerate the
locations index. The UI selector reads `public/data/locations.json`; no code changes needed.

## How to run

```bash
npm install        # if npm errors (arborist bug), retry with: npm install --legacy-peer-deps
npm run dev        # local dev server (use a free port, e.g. npx vite --port 5300 --strictPort)
npm run build      # tsc --noEmit + vite build -> dist/
npm run preview    # serve the built output
npm run qa         # headless-browser smoke test; needs dev server on :5300
npm run prep:data  # re-run the full data pipeline (per-location, cached pulls)
```

## Architecture (what is where)

```text
src/data/loader.ts        # typed loaders for terrain/route/pistes/lifts/manifest/locations
src/scene/coordinates.ts  # local ENU frame: east=x, north=-z, h - elevationMin scaled by verticalScale
src/scene/terrainMesh.ts  # grayscale vertex-color terrain + slope/snow repaint
src/scene/routeLayer.ts   # featured ribbon, per-feature line records, highlight state
src/scene/labels.ts       # projected landmark labels (no CSS2DRenderer)
src/scene/descent.ts      # CatmullRom camera descent, smoothstep ease, reduced-motion aware
src/scene/createScene.ts  # scene assembly, picking, camera presets, layer visibility
src/app/app.ts            # UI wiring: panels, legend toggles, selection card, location switch
scripts/data-prep/        # location-parametrized pipeline (config.mjs is the switchboard)
scripts/qa-smoke.mjs      # puppeteer-core + system Chrome; screenshots to /tmp/opencode/qa-shots
public/data/<id>/         # generated assets; commit these (they are the product's data)
github-workflow           # .github/workflows/deploy.yml builds and publishes dist/ on push to main
```

Design invariants worth preserving:

- Terrain render is grayscale; color belongs to data layers only.
- Official facts and DEM-derived estimates are always labeled separately; estimates never
  appear unlabeled.
- Data formats are replaceable and renderer-agnostic (`terrain.json`, `route.json`,
  `pistes.json`, `lifts.json`, `manifest.json` per location; the manifest carries licenses).
- No runtime API keys; everything is static and subpath-hostable (`vite base: './'`).

## Status vs milestones

- **M0 data feasibility** — done. Tilezen terrarium z12 tiles (Austria pixels: DGM
  Österreich, CC BY 3.0 AT) + Overpass extracts; manifest-per-location with licenses and
  known gaps.
- **M1 visual spike** — done. Terrain, ribbon, descent; AOI-derived camera framing.
- **M2 interaction** — done. Orbit/zoom/pan, guided descent with pause/resume/exit,
  camera presets (Overview / Top-down / Course start), legend-as-layer-toggles
  (featured + per-difficulty pistes + lifts), click/hover select with detail card
  (est. length/elevations, difficulty/lift-type as mapped, OSM way id), landmarks on Streif,
  relief toggle, loading/error/WebGL2 states, responsive + touch targets.
- **M3 handoff/publishing** — done. Docs (this file, README), relativity of all paths
  verified on a nested subpath, GitHub Pages workflow live, attribution visible in-app.

QA (`npm run qa`) passes for both locations with zero console errors, including against the
deployed Pages URL.

## Known gaps / next candidates

1. **Karaman greben mis-mapping in OSM:** its ways form a contour circuit (2.9 km winding,
   ~170 m net drop, climbs back), so it can never be featured as-is. This is the concrete
   seed for a "curated correction layer": allow a curated route file per location
   (documented provenance; plan M0 item 5 covers the rationale).
2. **Kopaonik official facts:** none verified; facts panel says so explicitly. A resolution
   (official resort doc or measured reference) would upgrade Duboka 1's card honesty.
3. **Landmark label decluttering** near the Streif start where several sections crowd.
4. **Featured ribbon width** reads road-like at descent-camera range; consider distance-based
   width or thinner profile.
5. **Hover pick radius** is AOI-relative; feel fine at current AOIs, recheck if an AOI is
   added at a very different scale.
6. Dev-server port conflicts in this workspace; `port 5300` convention was used (5173 was
   occupied during development).

## Maintenance quicknotes

- To change visual palette: `src/scene/terrainMesh.ts` (grayscale ramp), `routeLayer.ts`
  (`PISTE_COLORS`), `style.css` swatches — keep swatches and scene colors in sync.
- To change the descent timing: `route.descentDurationSeconds` is stamped by
  `assemble-route.mjs` from route length; reduced-motion doubles it at runtime.
- The data pipeline caches Overpass JSON and terrain tiles under `scripts/data-prep/raw/`
  (git-ignored, ~170 MB); delete it to force re-fetch.
- Deployment is zero-touch: push to `main` → Pages. First-time setup steps used: `gh repo
  create … --source . --push`, then Pages enabled with `build_type=workflow`.
