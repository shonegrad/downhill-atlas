# Downhill Atlas — Development Plan

**Version:** 0.2  
**Date:** 21 October 2026  
**Purpose:** A development-ready starting plan for a local-first prototype of the Kitzbühel Streif in a stylized 3D mountain scene.

> **Status (21 Oct 2026):** the original four milestones (M0–M3) are fully implemented and deployed to GitHub Pages. Plan v0.2 adds the curated-course layer, switchable second courses, and descent/polish work — see "Plan v0.2 addendum" below. Current state and running instructions: [HANDOVER.md](HANDOVER.md); feature/usage documentation in [README.md](README.md).

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

- ~~User-steered skiing, skier avatar, physics, collisions, multiplayer.~~
  **Extended in v0.5** (see the v0.5 addendum): user-steered skiing, a skier
  avatar and a simple physics model are now in. Collisions, multiplayer and
  course validation stay out of scope.
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

*(Completed — this was the original kickoff brief.)*

## Plan v0.2 addendum — curated courses & smoothness (21 Oct 2026)

Implemented in this phase:

### A. Curated route layer + switchable second courses (done)
1. **Curated input convention** — `scripts/data-prep/curated/<loc>/<course>.json`
   (`downhill-atlas-curated-route/1`): ordered OSM way list, join-gap measurements,
   exclusion notes and provenance, reviewed against the DEM. Realizes plan M0 item 5.
2. **Pipeline** — `assemble-route.mjs` emits the unchanged default `route.json` plus
   per-course `routes/<id>.json` files and a `routes/index.json` summary; each course
   carries its own `source` (way ids, curated date) and DEM `estimates`. A descent
   sanity check (net drop vs. climb) is recorded in the `curation` block.
3. **Index** — `locations.json` entries gain `courses[]`; `write-manifest.mjs` indexes
   curated courses as their own sources; `export-context.mjs` keeps curated ways out
   of the context layer.
4. **First curated course: Pančićev vrh (Kopaonik).** Data finding: the modern OSM
   mapping of Панчићев врх is four closed zero-net contour circuits (like Karaman
   greben), so the curated chain uses the older fragmented ways
   (808543059 → 958974764 → 44225656 → 958974765; 1,380 m, 1960→1732 m, joins 0 m,
   strictly monotone). Excluded alternates are documented in the curated file.
5. **UI** — course selector in the bottom controls (only shown for multi-course
   locations), `?course=` deep links, facts panel always labels the course source
   ("OSM piste relation" / "OSM named ways" / "OSM ways, curated order") and shows
   the active course's own estimates; selection card labels the featured course's
   provenance.

### B. Visual polish (done)
1. **Descent smoothness** — camera rides a lightly smoothed elevation profile
   (ribbon stays on the raw DEM line); the full camera pose is exponentially
   damped (position + look target at a fixed 120 m lookahead), flattening both
   elevation steps over DEM ridges and lateral kinks in the sampled line; a ~1 s
   ease-in flies the camera from the orbit pose into the ride; cruise speed is
   constant with smooth windows at the ends; the finish triggers the existing
   auto-return to overview.
2. **Featured course as a piste-scale band** — the ribbon was rebuilt as a
   ~24 m wide groomed-slope band (AOI-relative cap), draped per-vertex onto the
   terrain at four stations across its width (no floating/clipping on side
   slopes), with a dark underneath pass as the non-color edge cue.
3. **Featured color** — amber/gold (`#ffb100`, scene + legend swatch + facts
   labels); red-family hues stay exclusive to piste difficulty classes.
4. **Terrain edge feathering** — the mesh alpha-fades into the sky over the
   outer ~16% of the AOI on every side, so terrain borders dissolve into fog
   instead of ending on a hard cut.
5. **Label decluttering** — screen-space culling in route order (crowded Streif
   start sections no longer overlap).

### C. Backlog (prioritized; next up = 1)
1. **Course narrative** — gradient-colored ribbon with labeled section steepness,
   elevation-profile chart synced to the descent (scrubbable), race-story mode,
   Karaman greben as the second curated course.
2. **Scene depth** — slope-angle shading toggle, contour lines, real lift
   towers/cables, summit labels, static time-of-day lighting presets.
3. **Interaction** — descent speed control/scrub, alternate descent cameras,
   two-course compare overlay, more deep links (?course= shipped), mobile perf pass.
4. **Scale-out** — Val d'Isère (the brief's named Phase-2 candidate), landing/index
   page from `locations.json`, OpenSkiData bulk ingestion.

Constraints unchanged: static build, no runtime API keys, no live data, ODbL/manifest
honesty; scene is a visualization, not navigation or safety guidance.

## Plan v0.3 addendum — ski-feel descent + Kopaonik data round (21 Oct 2026)

Implemented in this phase:

### A. Ski-feel descent (done)
1. **Low chase camera** — `CAM_OFFSET_M 16`, `LOOK_AHEAD_M 40`, descent FOV 66:
   the camera pitches *into* the slope ahead instead of flying level over it.
   Earlier probes (20–26 m offset with 60–85 m lookahead) read as a drone over
   an orange carpet; the short lookahead was the decisive fix, not the height.
2. **Vertical boost** — during the ride the vertical scale eases to at least
   ×1.5 (independent of the user's relief toggle, which still wins when higher);
   scale-aware height math keeps the ~16 m clearance true in world meters.
3. **Race gates** — slalom pole+panel pairs every 90 m, alternating blue/red
   (real convention), planted on the ribbon surface (not raw terrain — the old
   ground-level poles sank under the groomed veil), 3.8 m poles, 2.2×1.5 m panels.
   **Later removed** (see the v0.4 addendum): the gates read as clutter on the
   slope and were dropped on request.
4. **Descent scenery fade** — the featured band melts into the slope during the
   ride: amber veil fades to translucent (reads as a sun-warmed groomed track),
   the near-black course rim lightens, the centerline hairline dims; everything
   eases back on exit. `setFeaturedDescentFade()` in routeLayer.
5. **Band cross-shading** — per-column vertex colors (edges ×0.86) give the
   groomed band a shaded cross-section instead of a flat fill; a saturated amber
   centerline hairline keeps the course unambiguous at overview zoom (plain
   1 px lines are invisible against white snow there).
6. **Snow surface detail** — tileable 4-octave value-noise bump texture
   (120 m tiles, deterministic), plus UVs on the terrain mesh.
7. **QA hardening** — the smoke test's `networkidle0` stalled every page load
   (vite HMR websocket); all waits now use a polling `waitFor()` helper and the
   descent wait is 180 s on the slow headless environment.

### B. Kopaonik data round (done)
1. **Verified operator facts** — Skijališta Srbije fact sheet + kopaonik.rs trail
   tables: centre 1,770 m; Pančićev vrh 2,017 m; 62 km slopes; ≈32,000 skiers/h;
   21/9/6 easy/intermediate/hard; longest 3,500 m; max vertical 512 m; 97%
   snowmaking; night skiing; 3 FIS-standard runs. Per-course: Duboka 1 (FIS)
   1,440 m / 373 m (start 1,975 / finish 1,602 derived); Pančićev vrh 1,393 m /
   248 m (finish 1,727 derived); Duboka 2 1,114 m / 394 m (no station elevations).
2. **Featured course switched to the verified chain** — curated file
   `curated/kopaonik/duboka-1.json`: red spine `727138468` (1957→1654 m) joined
   at the exact shared node `561950895` to the black branch `44225653`
   (1957→1610 m, cut at the node); the DEM base junction (~1610 m) matches the
   official finish (1,602 m). DEM: 1,584 m / 344 m drop vs official 1,440 / 373.
3. **Extra courses** — Pančićev vrh (1,380 m / 228 m DEM) and Duboka 2 (way
   `44225635`, 1,068 m / 368 m DEM, FIS alignment); each with its own official
   facts + provenance in the facts panel and manifest.
4. **Resort facts** — 12-row operator fact sheet in the manifest dialog
   (`resortFacts`), plus per-course official facts rows (start/finish elevations).
5. **Landmarks from lift stations** — OSM has no named route nodes, so
   `fetch-osm.mjs` gained a generic `landmarkSelectors` query; 44
   aerialway=station nodes fetched (`raw/osm-kopaonik-landmarks.json`); courses
   pull their landmarks from named lift stations via a 600 m proximity match.
6. **AOI fix (critical)** — the Kopaonik AOI was ~8×7.7 km; all three courses
   actually live in ~2.9×2.2 km. The oversized box pushed the overview camera
   past ~11 km, where the 19 m band fell below depth precision and vanished
   from overview/top-down (fine during descent at close range). Tight AOI:
   `43.2695–43.2895 N, 20.8075–20.8445 E`; band now clearly visible everywhere.
7. **Context hygiene** — a curated featured chain can splice differently-named
   ways (the shared corridor is mapped as Црна дубока); `export-context.mjs`
   now also excludes the featured curated file's way ids.

## Plan v0.4 addendum — surface pistes, no gates (21 Oct 2026)

Two visual changes requested after the v0.3 round shipped:

1. **Race gates removed** — the slalom pole/panel pairs (`speedGates()` in
   `routeLayer.ts`, `GATE_SPACING_M` / `GATE_POLE_M`) are gone. They were pure
   scenery and only added clutter to the slope; nothing else depended on them.
2. **Context pistes are surfaces, not hairlines** — the difficulty-colored
   pistes were `THREE.Line` 1 px strokes that all but disappeared against the
   snow at overview zoom (the same reason the featured course needed an amber
   centerline hairline). Every piste is now a **draped band**: a ~14 m wide
   strip (`PISTE_BAND_HALF_WIDTH` 7 m) whose vertices are clamped to the
   rendered terrain surface at their own plan position, cross-shaded at the
   edges, translucent (0.72) so overlapping corridors blend, and alpha-faded at
   the AOI border so they dissolve with the terrain instead of floating past
   it. Lifts stay hairlines (they are aerial cables, not ground surfaces).
   Consequences: pistes are now picked as meshes (no more generous line
   threshold for them), and the legend wording changed from "other pistes and
   lifts are thin lines" to "other pistes are coloured bands; lifts are thin
   lines".

## Plan v0.5 addendum — user-steered ski mode (21 Oct 2026)

The product owner asked for a ride you drive yourself, not just watch. The
guided descent stays; **ski mode** is a second entry point next to it.

### A. The ride
1. **"Ski down" button** (`btn-ski`) starts a run at the race start of the
   featured course. `Esc` or "Exit ski" returns to the overview. The guided
   descent is untouched.
2. **Controls** — `←`/`→` steer, `↑` tucks (less drag), `↓` checks speed
   (brake + skid). On touch devices the same four inputs are on-screen pads
   (`#ski-touch`, shown for coarse pointers).
3. **Physics** (`src/scene/skiRide.ts`) — the classic "skate" model: the ski
   can only travel along its heading, gravity always pulls down the fall
   line, and sideways velocity is scrubbed by the edges. Constants: g = 9.81,
   snow friction µ = 0.055, air drag 0.0032 (upright) / 0.0022 (tucked),
   edge angle 0.8 rad, edge grip 4.2 /s, brake 6 m/s², speed cap 40 m/s.
   Turn rate comes from the real carving relation R = v²/(g·tan(edge)), so
   speed and steering are coupled (faster = wider arc). The edge has a finite
   grip limit; past it the ski breaks away into a skid. With no steering input
   the skier drifts back onto the fall line (0.45 rad/s), the way a real skier
   straightens out.
4. **Feel** — chase camera 12 m behind / 3.6 m above, banked into the turn,
   FOV opening 55°→70° with speed, skier avatar (skis, boots, suit, helmet)
   leaning with the edge angle, and a ski track ribbon drawn on the snow
   behind. The camera samples the terrain along the sight line so a roll never
   swallows the camera.
5. **Telemetry HUD** — speed (km/h), distance, vertical drop, top speed. The
   run uses **natural relief** (vertical scale 1.0, not the 1.5 descent
   boost): the physics use the real DEM slope, so an exaggerated mountain
   would make the skier look slower than the hill.
6. **Numbers that came out of it** (deterministic harness, `dt = 1/60`):
   straight down the Streif the skier reaches 104 km/h in 9 s and peaks at
   ~128 km/h; tucking adds ~10 %; a full-lock carve at 100 km/h costs
   ~1 m/s² of speed; a full brake sheds ~6 m/s².

### B. Notes
- The skier and the track live in the scene root, not the terrain group, so
  the vertical exaggeration does not stretch the avatar; their heights are
  scaled by hand.
- The skier is clamped 30 m inside the AOI (the DEM is clamped at the border,
  so without this you would ride on an invisible flat shelf).
- Piste picking still works in overview mode; the scene ignores pointer
  picking while a run is live.

## Reference facts and sources
- Official Streif downhill profile: 3,312 m course length and 860 m vertical drop ([Hahnenkamm official page](https://web1.hahnenkamm.com/en/racetracks/the-streif-downhill/)).
- Official 2026 course facts PDF ([Hahnenkamm Races](https://cdn.hahnenkamm.com/site/assets/files/29082/kenndaten-hkr-2026_en.pdf)).
- Terrain, piste data, sources, licensing, and rendering comparisons: see [research_brief_brd.md](research_brief_brd.md).
