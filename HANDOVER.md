# Downhill Atlas — Project Handover

**Date:** 21 October 2026
**State:** M0–M3 complete + plan-v0.2 round (curated course layer, switchable second
courses, descent smoothing, ribbon/label polish). QA-verified and deployed.
**Live:** https://shonegrad.github.io/downhill-atlas/
**Repo:** `github.com/shonegrad/downhill-atlas` (branch `main`, deploys automatic on push)

## What this is

A static, browser-based 3D explorer for named ski courses. Mountains render as a stylized
grayscale relief; all scene color is data-driven (featured course ribbon, difficulty-colored
piste bands, lifts). Locations and courses (switchable in the UI, deep-linkable via `?loc=` /
`?course=`):

| Location | Courses | Route source | Landmarks |
| --- | --- | --- | --- |
| Kitzbühel, Austria | Streif (default) | OSM relation `12870777`, ordered member ways, validated ±2% vs official 3,312 m | 14 course sections |
| Kopaonik, Serbia | Duboka 1 (default); **Pančićev vrh** (curated) | Duboka 1: OSM ways, monotone 1954→1655 m. Pančićev vrh: curated ordered way list 808543059 → 958974764 → 44225656 → 958974765 (1,380 m, 1960→1732 m) | none |

Adding another resort is a data task: add an entry to `LOCATIONS` in
`scripts/data-prep/config.mjs`, run `npm run prep:data -- <id>`, and regenerate the
locations index. The UI selector reads `public/data/locations.json`; no code changes needed.
Additional courses per location use the curated convention below.

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
src/data/loader.ts        # typed loaders for terrain/route/pistes/lifts/manifest/locations (+ per-course routes)
src/scene/coordinates.ts  # local ENU frame: east=x, north=-z, h - elevationMin scaled by verticalScale
src/scene/terrainMesh.ts  # grayscale vertex-color terrain + slope/snow repaint
src/scene/routeLayer.ts   # featured ribbon + draped piste bands, per-feature records, highlight state
src/scene/labels.ts       # projected landmark labels (screen-space decluttering, no CSS2DRenderer)
src/scene/descent.ts      # damped camera descent: blended ease-in, smoothed path, distance-normalized speed
src/scene/createScene.ts  # scene assembly, picking, camera presets, layer visibility, swapRoute
src/app/app.ts            # UI wiring: panels, legend toggles, selection card, location AND course switch
scripts/data-prep/        # location-parametrized pipeline (config.mjs is the switchboard)
scripts/data-prep/curated/<loc>/<course>.json   # curated route inputs (ordered way list + provenance)
scripts/qa-smoke.mjs      # puppeteer-core + system Chrome; screenshots to /tmp/opencode/qa-shots
public/data/<id>/         # generated assets; commit these (they are the product's data)
public/data/<id>/routes/  # per-course route files + index.json (locations with extra courses)
github-workflow           # .github/workflows/deploy.yml builds and publishes dist/ on push to main
```

Design invariants worth preserving:

- Terrain render is grayscale; color belongs to data layers only.
- Official facts and DEM-derived estimates are always labeled separately; estimates never
  appear unlabeled. Route provenance is always labeled
  (relation / named ways / curated order).
- Data formats are replaceable and renderer-agnostic (`terrain.json`, `route.json`,
  `pistes.json`, `lifts.json`, `manifest.json` per location; per-course files under
  `routes/`; the manifest carries licenses).
- No runtime API keys; everything is static and subpath-hostable (`vite base: './'`).

## Curated course layer (plan v0.2)

Why it exists: OSM sometimes maps famous pistes as **closed zero-net contour circuits**
(DEM-verified for Karaman greben and now also for the four modern Панчићев врх ways), which
can never represent a descent. The curated layer lets the project pin a defensible route
without silently re-drawing OSM:

- **Input**: `scripts/data-prep/curated/<loc>/<course>.json` — ordered way ids from the
  same Overpass extract, measured join gaps, excluded ways with reasons, provenance.
- **Output**: `public/data/<loc>/routes/<course>.json` (same route format + `source.type:
  "curated-way-list"` + own estimates) and `routes/index.json`; `locations.json` entries
  embed the `courses[]` summary so the UI needs one fetch.
- **UI**: course dropdown (multi-course locations only), `?course=` deep link, facts and
  legend update per course; provenance labels are per-course, not per-location.
- **Second curated case (queued)**: Karaman greben — the layer exists for it; picking the
  good ways first needs an OSM-mapping pass.

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
- **Plan v0.2 round** — done. Curated course layer + Pančićev vrh switchable course;
  descent smoothing (damped full pose, ease-in blend, smoothed camera path) with
  piste-scale draped featured band (amber, non-red), terrain edge feathering;
  landmark decluttering; `?course=` deep links.
- **Plan v0.4 round (21 Oct 2026)** — done. Race gates removed from the slope;
  context pistes redrawn as draped surfaces (~14 m bands clamped to the rendered
  terrain surface, edge cross-shading, 0.72 opacity, AOI-border alpha fade)
  instead of 1 px hairlines. Lifts stay hairlines.

QA (`npm run qa`) passes for both locations with zero console errors, including course
switching at Kopaonik and the `?loc=kopaonik&course=pancic-vrh` deep link.

## Known gaps / next candidates

1. **Course narrative features** (top of backlog, plan v0.2 list): gradient ribbon,
   synced elevation profile, race-story mode.
2. **Karaman greben curated curation** — the layer exists; needs a way-selection pass
   (its OSM mapping is a contour circuit; no monotone chain remains to reuse).
3. **Kopaonik official facts — RESOLVED (21 Oct 2026):** operator facts verified
   (Skijališta Srbije + kopaonik.rs trail tables) and wired into the facts panel
   (per-course `officialFacts` + resort `resortFacts`); the panel labels DEM
   numbers as estimates next to the official values. Remaining honesty gap:
   race-line fidelity (curated chains follow the mapped pistes, not the race line).
4. **Pančićev vrh alternates excluded, not merged:** the fork at ~1840 m offers two lines;
   the curated file documents the single-branch choice. A compare-the-branches feature
   could revisit this.
5. Dev-server port conflicts in this workspace; `port 5300` convention was used (5173 was
   occupied during development).

## Maintenance quicknotes

- To change visual palette: `src/scene/terrainMesh.ts` (grayscale ramp + border
  feather width `FADE_FRACTION`), `routeLayer.ts` (`PISTE_COLORS`;
  `FEATURED_COLOR` amber is reserved for the featured course — do not reuse
  difficulty hues), `src/style.css` (`--featured` swatch; keep in sync), and
  the favicon in `index.html`.
- Descent feel constants: `descent.ts` (`CAM_OFFSET_M` 16, `LOOK_AHEAD_M` 40 —
  a low, pitch-down ski cam; raising the lookahead reintroduces the "drone over
  an orange carpet" look, height alone does not), `POSITION_DAMPING`,
  `LOOK_DAMPING`, `BLEND_SECONDS`, `EASE_WINDOW`; descent scenery fade lives in
  `routeLayer.ts` (`setFeaturedDescentFade`, `DESCENT_*_TINT`), the scale boost
  + FOV glide in `createScene.ts` (`DESCENT_SCALE_BOOST`, `DESCENT_FOV`); context
  pistes are draped bands (not hairlines) in `routeLayer.ts`
  (`PISTE_BAND_HALF_WIDTH` 7 m, `PISTE_BAND_LIFT`, `PISTE_BAND_OPACITY` — they
  are clamped to the rendered terrain surface via `sampleSurface()` in
  `coordinates.ts`, so keep the lift small); featured band width caps live in
  `routeLayer.ts` (`halfWidth` = min 9.5 m) with the amber centerline hairline
  right below; base timing per course is `route.descentDurationSeconds`, stamped
  by `assemble-route.mjs` from route length; reduced-motion doubles it at runtime.
- Curated courses live in two places: the input (`scripts/data-prep/curated/...`, reviewed
  provenance) and the generated `public/data/<id>/routes/<course>.json`. Edit the input,
  re-run `npm run prep:data -- <id>`; never hand-edit the generated files.
- Location AOI sizing rule: cover the courses plus a few hundred metres of
  margin, not the whole resort. An oversized AOI pushes the overview/top-down
  cameras so far out that the ~19 m featured band falls below depth precision
  and disappears (this cost Kopaonik a full data re-bake in v0.3).
- The data pipeline caches Overpass JSON and terrain tiles under `scripts/data-prep/raw/`
  (git-ignored, ~170 MB); delete it to force re-fetch.
- Deployment is zero-touch: push to `main` → Pages. First-time setup steps used: `gh repo
  create … --source . --push`, then Pages enabled with `build_type=workflow`.
