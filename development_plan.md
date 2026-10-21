# Downhill Atlas — Development Plan

**Version:** 0.1  
**Date:** 20 October 2026  
**Purpose:** A development-ready starting plan for a local-first prototype of the Kitzbühel Streif in a stylized 3D mountain scene.

## Product outcome

A desktop-first browser prototype that lets a user explore a stylized Hahnenkamm mountain, see the Streif downhill course clearly, and play a guided camera descent. Responsive layout and touch-friendly controls are included from the start. This first version is a visual experience, not a ski simulator or navigation product.

See [research_brief_brd.md](research_brief_brd.md) for research, product rationale, data constraints, and citations.

## MVP user story

“As a ski fan, I want to orbit a 3D view of Hahnenkamm and follow the Streif downhill so I can understand how the course travels across the mountain.”

## Scope

### In scope

- One local/static scene: Kitzbühel’s Hahnenkamm, with the Streif as the featured route.
- A clipped DEM converted to a stylized Three.js terrain mesh.
- A verified or curated route centerline draped over the terrain and rendered as a legible course ribbon.
- A guided camera descent following the route; pause, replay, and return to overview.
- Orbit/zoom/pan overview controls, reset camera, route landmark labels where verified.
- Compact route facts panel with clearly distinguished official facts and DEM-derived estimates.
- Attribution/source information and a short data-accuracy note.
- Responsive layout and touch-sized controls; desktop is the initial performance target.
- Static client-side build, so a GitHub Pages deployment remains feasible.

### Out of scope

- User-steered skiing, skier avatar, physics, collisions, multiplayer.
- Live resort operations, snow/weather, avalanche conditions, navigation, or safety recommendations.
- Full Kitzbühel resort coverage or multi-resort search.
- CMS, accounts, server API, user submissions, or live data refresh.
- Photorealistic satellite imagery or high-resolution snow surface reconstruction.

## Technical defaults

These defaults can be adjusted if the existing repository already establishes conventions.

- TypeScript + Vite + Three.js; use React only if it materially simplifies UI state or the project already uses it.
- Three.js owns the 3D scene, renderer, camera, terrain, route, and scene interactions.
- UI controls/panels remain ordinary accessible HTML layered over the canvas.
- Keep the resort data separate from rendering code: versioned elevation grid, route GeoJSON/JSON, metadata/config, and attribution.
- Use a local metric coordinate frame centered near the terrain area. Document projection, vertical scaling/exaggeration, DEM source/resolution, route source, processing date, and licenses.
- No provider secrets in browser assets. Prefer prepared static files for this prototype.
- Choose a coordinate/data source only after checking acquisition and redistribution terms. Use official course stats as reference facts; label any derived measurements.
- Initial desktop target: modern browser with WebGL 2 and a recent laptop. Build responsive layout and pointer/touch controls now; optimize mobile frame rate in a later pass.

## Milestones

### 0. Repository and data feasibility

1. Inspect the repository and follow its existing conventions; if empty, scaffold the minimal app.
2. Confirm the Streif route geometry and surrounding Hahnenkamm elevation data are usable together.
3. Review current source license, attribution, and any redistribution requirements before committing data.
4. Record a compact data manifest: source URL/name, date retrieved, coordinate reference system, resolution, processing, attribution/license, route provenance, known gaps.
5. If the public route is incomplete, create a clearly documented curated route line from permissible source references; do not infer missing details without recording that choice.

**Exit criteria:** a reproducible, legally reviewed candidate terrain/route asset set exists, or a specific blocker and fallback source are documented.

### 1. Visual spike

1. Create a scene with a cropped terrain mesh and no surrounding product UI.
2. Add basic lighting, color treatment, background, camera, orbit/zoom controls, and route ribbon.
3. Check route alignment at start, middle, and finish; adjust coordinate conversion and terrain sampling.
4. Try at least two vertical scales and choose the most legible natural-looking result.
5. Add a basic animated camera path following the course, with a camera orientation that keeps the terrain readable.

**Exit criteria:** scene communicates mountain shape and downhill direction; route stays attached to terrain; camera descent can play and return to overview.

### 2. MVP interaction and visual design

1. Add overview, guided descent, pause/replay, reset, and route-visibility controls.
2. Add route segment/landmark labels only where locations have been verified.
3. Add a compact facts panel. Separate official course facts from computed estimates and give each an appropriate source label.
4. Add attribution/data caveat UI.
5. Add responsive panel behavior and touch-friendly controls; confirm viewport resize and orientation changes do not break the scene.
6. Add loading, unavailable-data, and WebGL-not-supported states.

**Exit criteria:** a new user can open the scene, recognize the Streif route, play/pause/replay the descent, and find provenance/accuracy notes.

### 3. Local handoff and optional publishing

1. Document how to install dependencies and run the local app.
2. Confirm all assets are static and paths support a configurable base URL for GitHub Pages.
3. Review asset licensing/attribution and ensure attribution remains visible in the deployed build.
4. If publishing is requested, configure a GitHub Pages build workflow and verify the deployed path/base URL.

**Exit criteria:** local launch is repeatable; optional hosted version works from a repository subpath and includes required source credits.

## Suggested project structure

Adapt to repository conventions rather than forcing this layout:

```text
src/
  app/                 # app shell and UI state
  scene/               # renderer, camera, lights, terrain, route, animation
  components/          # controls and information panel
  data/                # loaders, schemas, coordinate transforms
public/data/streif/    # prepared static terrain, route, manifest, attribution
scripts/data-prep/     # repeatable clip/reproject/export workflow, if needed
```

Keep raw/source downloads out of the browser bundle unless their license and size are appropriate. Store a small manifest alongside distributed derived data.

## Data model (initial)

- `terrain`: grid width/height, geographic/local extent, elevation samples, source CRS, sample spacing, elevation units, vertical scale.
- `route`: ordered centerline points in local metric coordinates, optional source elevation, route distance, optional section/landmark IDs, provenance per segment if curated.
- `landmarks`: stable ID, display name, route distance or point index, source and confidence.
- `metadata`: product area name, source dates, licenses, attribution text/links, processing notes, official facts and their citations.

Do not couple route features to Three.js objects in source data. Convert to mesh/line geometry at runtime so data can be reviewed and revised independently.

## Interaction requirements

- Overview camera is the initial state.
- User can orbit, zoom, and pan on desktop; touch gestures use common orbit/pinch expectations on mobile.
- Guided descent has explicit Play/Pause, Replay, and Back to overview actions.
- During the descent, camera movement follows ordered route positions and eases orientation; animation speed is adjustable internally and can be exposed as a simple control if useful.
- Controls remain usable without relying on hover. Keyboard focus and visible focus indicators are required for HTML controls.
- Route ribbon and labels have sufficient contrast against snow/terrain; provide a non-color cue (outline/shape/label) for the featured course.

## Acceptance criteria

1. The first local view loads a coherent, stylized Hahnenkamm terrain scene with a visible Streif route.
2. The route’s start, finish, and major verified turns/segments align with terrain and with the route provenance documented in the manifest.
3. The user can orbit, zoom, pan, reset, play, pause, replay, and exit the descent.
4. No live or unverified operational status is shown; uncertain or missing route metadata is omitted or labeled.
5. Official facts and calculated values are distinguishable, and data source/attribution is accessible in the app.
6. Main controls remain usable at desktop and narrow mobile viewport widths, including touch-sized hit areas.
7. Resizing the browser does not distort the scene or make core controls inaccessible.
8. The app does not require a secret API key at runtime.
9. The app can be built as static files with a configurable deployment base path suitable for GitHub Pages.

## Risks and fallback choices

- **Route not sufficiently mapped:** use the best permissible reference geometry and a transparent curated centerline; reduce supporting context rather than pretending the route is complete.
- **DEM looks too smooth:** use restrained vertical exaggeration and stylized shading; investigate higher-resolution regional elevation only after the first visual spike.
- **Scene feels flat or toy-like:** adjust camera angle, terrain lighting/materials, snow color, contour/rock accents, and scale before adding decorative assets.
- **Long descent camera is uncomfortable:** provide a slower default, pause, reduced-motion respect, and clear return control.
- **GitHub Pages path issues:** set Vite base path from deployment configuration and test the built static output under a subpath.
- **Data license is uncertain:** do not bundle or publish that source data until terms are resolved; use another permitted dataset or a documented placeholder during the scene spike.

## First development task for an agent

Inspect the repository. Then implement Milestone 0 and a thin Milestone 1 vertical slice: use a permissible small terrain sample and a clearly labeled placeholder route if final Streif assets are not ready; render an orbitable stylized terrain with a visible route ribbon and a simple guided camera movement. Keep the data format replaceable. Report the asset sources/terms checked, how to run locally, what remains approximate, and any implementation decisions that need review.

## Reference facts and sources

- Official Streif downhill profile: 3,312 m course length and 860 m vertical drop ([Hahnenkamm official page](https://web1.hahnenkamm.com/en/racetracks/the-streif-downhill/)).
- Official 2026 course facts PDF ([Hahnenkamm Races](https://cdn.hahnenkamm.com/site/assets/files/29082/kenndaten-hkr-2026_en.pdf)).
- Terrain, piste data, sources, licensing, and rendering comparisons: see [research_brief_brd.md](research_brief_brd.md).
