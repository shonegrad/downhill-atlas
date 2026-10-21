# Downhill Atlas
## 3D Mountain & Ski Resort Explorer
## Research brief and draft BRD

**Date:** 20 October 2026  
**Status:** Discovery draft; intended to guide an MVP prototype, not a navigation or safety product.

## 1. Product idea

A browser-based 3D experience that lets someone explore a mountain or ski area, understand its shape, inspect ski runs and lifts, and orient themselves spatially. The long-term idea is a directory of famous ski centers with progressively richer detail. The first release should prove that one well-chosen place can be presented clearly and attractively.

**Recommended MVP framing:** “Ride the 3D view of the Streif.” Start with Kitzbühel’s famous Streif downhill course, with enough Hahnenkamm terrain around it to make the route legible. Let the visitor orbit the mountain, inspect the course, and follow a guided camera descent. This is a visualization prototype, not a ski simulator in the MVP. The scene should be built so a future first-person ride mode can reuse the route centerline and terrain.

## 2. Research findings

### Terrain

- A digital elevation model (DEM) can be sampled into a regular grid and turned into a Three.js mesh. `BufferGeometry` is the relevant low-level primitive for vertices, normals, faces, and texture coordinates ([Three.js BufferGeometry docs](https://threejs.org/docs/pages/BufferGeometry)).
- Copernicus DEM GLO-30 provides global 30 m data; current access is through Copernicus Data Space and access terms/user categories should be confirmed for the intended use ([Copernicus DEM collection](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)). OpenTopography aggregates global DEMs including Copernicus and SRTM; its API requires a key, has rate limits, and expressly restricts embedding personal API keys in third-party services ([OpenTopography developer access](https://www.opentopography.org/developers)). NASA SRTM 1 arc-second is approximately 30 m and covers most land between 60°N and 56°S ([NASA data portal](https://data.nasa.gov/dataset/shuttle-radar-topography-mission-1-arc-second-global)).
- For a one-resort demo, pre-processing a small AOI into a static height grid is simpler and more predictable than calling a DEM API from every browser session. More detail than 30 m may be available in selected regions, but should be treated as a later data acquisition task.
- RGB terrain tiles are another route: elevation is encoded in PNG color channels and decoded to heights. This is convenient for streaming, but depends on provider terms, API keys, attribution, usage limits, and tile availability. Avoid choosing a provider until the commercial/hosting assumptions are known.
- At 30 m, the terrain should read convincingly at resort scale, but narrow trail cuts, snow grooming, trees, and precise local relief are not represented reliably. Use the DEM for the mountain silhouette and drape route lines on the surface. Do not imply survey-grade precision.
- For a named downhill course like the Streif, a curated high-detail path is especially valuable: official course references provide reliable headline facts, while public geodata can provide the route shape. Verify centerline coverage, elevation alignment, and the intended route before presenting it as exact.

### Ski runs and resort features

- OpenStreetMap uses `piste:type=downhill` and `piste:difficulty=*` for mapped downhill ski routes. Difficulty values are broadly `novice`, `easy`, `intermediate`, `advanced`, `expert`, `freeride`, and `extreme`; local trail-color conventions differ, so show the source classification and avoid assuming every locale maps colors identically ([OSM difficulty key](https://wiki.openstreetmap.org/wiki/Key:piste:difficulty), [piste tagging overview](https://wiki.openstreetmap.org/wiki/Pistes)).
- Lifts can be represented as ways tagged `aerialway=*`; piste paths and lift geometry can be overlaid on the terrain ([OSM piste guide](https://wiki.openstreetmap.org/wiki/Pistes)). Data completeness and route segmentation vary by resort. Treat OSM as candidate source data, inspect the selected location manually, and allow a curated correction layer for the MVP.
- OSM data is under ODbL. Display appropriate attribution and assess obligations before distributing a derived/combined database ([OSM Foundation attribution guidance](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines), [ODbL overview](https://wiki.openstreetmap.org/wiki/Open_Database_Licence)).
- Public Overpass instances are community infrastructure with usage expectations; they are suitable for limited research/prototyping, not an assumed production backend. For repeatable use, pre-extract and host only the necessary data or use a suitable provider ([Overpass commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)).

### Rendering approach

**Option A — Three.js-first scene (recommended for this project):** create a fixed, local mountain mesh from a prepared DEM; add route lines, lift cables/towers, labels, and custom lighting/materials as Three.js objects. Most control over camera, style, and future descent animation, with a focused single-course data pipeline. More geospatial projection, picking, labels, and coordinate handling must be built.

**Option B — MapLibre GL JS terrain with Three.js overlays (recommended if map navigation and geographic context matter most):** MapLibre handles camera/map interaction and terrain; Three.js is used as a custom layer for models or special visuals. Official examples demonstrate terrain with Three.js models ([MapLibre 3D terrain](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/), [Three.js model on terrain](https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/)). Less custom terrain control, but map features and geographic navigation are easier.

**Option C — MapLibre alone:** fastest if the value is an interactive 3D map, with limited custom scene effects. Since the request specifically calls for Three.js, this is best as a later product check rather than the default recommendation.

### Suggested technical shape

- Front end: TypeScript + Vite (or the user’s existing preferred stack) + Three.js; React is optional, useful for menus/panels but not required by Three.js.
- Data prep: a small offline script/workflow to clip and resample DEM, convert OSM piste/lift features to GeoJSON, and reconcile coordinates. Deliver static, versioned assets with attribution metadata.
- Coordinate model: project the local resort to a metric coordinate system for scene distances; place the local origin near the resort to avoid large-coordinate precision problems. Convert elevations to scene height with a clearly documented scale/exaggeration.
- Geometry: grid mesh or subdivided tiles; compute normals; drape line geometries by sampling the DEM. Add small vertical offset to prevent z-fighting. Use simplified geometry at distance if needed.
- Interaction: orbit/zoom/pan camera; click a piste/lift to select; hover highlight; feature detail panel; layer toggles; reset camera; optional camera presets.
- Performance: keep the MVP to a clipped area and modest mesh density; dispose of GPU resources on replacement; build responsive layouts and touch-friendly controls from the start, then tune mobile performance after the desktop visual spike.
- Data: static assets in the MVP; server/API only when multi-resort search, frequent updates, user submissions, or live status is in scope.

## 3. Product opportunities

1. **Spatial understanding:** see how runs connect, where lifts sit, and how steep/long routes relate to the mountain.
2. **Resort discovery:** compare a mountain’s shape and trail network before visiting.
3. **Progressive detail:** begin with terrain + runs; later add lift stations, contours, viewpoints, buildings, snow conditions, open/closed status, webcams, and high-resolution terrain.
4. **Presentation mode:** polished camera angles and labels could make the scene useful for resort pages, travel research, or a personal ski-planning tool.
5. **Analytical views (later):** slope-angle shading, aspect/orientation, elevation profile, route comparison, and estimated vertical drop. These require careful data validation and should not be framed as safety guidance.

## 4. Draft BRD

### 4.1 Goal

Deliver a working, attractive browser prototype of Kitzbühel’s Streif downhill on stylized Hahnenkamm terrain, with a guided camera descent. Validate the route/data pipeline and scene design for future user-steered ride mode and resort expansion.

### 4.2 Users and primary job

**Primary user:** a skier, ski-racing fan, or traveler curious about a famous downhill.  
**Primary job:** “Let me see how the Streif sits on the mountain, understand its descent, and explore the course in 3D.”

### 4.3 MVP scope

**Must have**
- Kitzbühel/Hahnenkamm with the Streif downhill as the hero feature; crop surrounding terrain to the area needed to understand the route.
- 3D terrain generated from a DEM, with restrained, readable terrain styling and lighting.
- A clearly highlighted Streif route ribbon overlaid on terrain. Other nearby pistes/lifts may be shown as subdued context if data is available and useful.
- Orbit, zoom, and pan; reset view.
- Selectable run/lift; show its name and available metadata.
- A guided camera descent along a prepared course centerline, with pause/replay and return-to-overview controls. MVP is a camera animation only, without avatar, ski physics, collision, or user steering.
- Layer toggles for pistes and lifts; simple legend.
- Source/attribution panel and concise note that route coverage/classification comes from source data and may be incomplete.
- Responsive layout sufficient for desktop browser use; no mobile performance commitment in MVP.

**Should have if low effort**
- Camera presets (overview / top-down / selected feature).
- Course landmarks/segments where locations can be verified; official course facts may be displayed separately from DEM-derived estimates.
- Basic length and vertical-drop estimates with explicit source/estimate labeling.
- Search/filter by difficulty, if the chosen resort has enough tagged runs.

**Out of scope for first MVP**
- Live lift operations, snow/weather conditions, avalanche information, route guidance, navigation, user accounts, social features, turn-by-turn directions, full global resort catalogue, photorealistic satellite texture, controllable skier/avatar, ski physics, collisions, multiplayer, native mobile app, resort data administration CMS.

### 4.4 Functional requirements

1. The scene loads a curated resort dataset and presents a usable overview without requiring the user to configure GIS data.
2. Terrain mesh follows elevation samples and preserves approximate relative terrain shape.
3. Piste and lift features align spatially with the terrain within the accuracy of source data.
4. Pistes are styled by the available difficulty class; unknown values receive a neutral style and “Unclassified” legend entry.
5. Selecting a feature visibly highlights it and updates the information panel; deselection returns to overview state.
6. Layer visibility can be changed independently for piste and lift overlays.
7. Attribution and data-source caveats remain accessible in the experience.
8. The app handles missing names/difficulty gracefully and does not invent attributes.

### 4.5 Non-functional requirements

- Modern desktop browser with WebGL 2 support; graceful message if WebGL is unavailable.
- Initial dataset should be small enough for a quick first load on ordinary broadband (set a measurable size target after choosing the resort and source assets).
- Camera interactions should remain responsive on a typical recent laptop.
- Coordinate transforms, vertical exaggeration, source, date, license, and processing steps are documented with the static dataset.
- No API secret is shipped to the browser. Any provider key stays server-side or data is prepared and hosted as static assets.
- Accuracy claims must stay proportional to source resolution and map completeness.

### 4.6 Success measures

- A first-time user can identify the mountain’s overall shape, see run/lift layout, and inspect a selected run without instruction.
- Every visible feature is selectable where data supports it, with unknown metadata handled cleanly.
- On the target laptop/browser, initial scene appears within an agreed loading threshold and navigation remains smooth enough to explore.
- A second resort can be prepared by replacing data/configuration rather than rewriting rendering logic (a post-MVP architecture validation).

### 4.7 Risks and mitigations

| Risk | Effect | Mitigation |
|---|---|---|
| Incomplete or inconsistent mapped runs/lifts | The scene looks sparse or misleading | Choose resort after inspecting OSM coverage; curate a bounded correction dataset; expose data date/source |
| DEM too coarse for piste-level detail | Runs float, cut corners, or seem imprecise | Drape paths to surface, simplify claims, use stronger visuals than false precision; consider regional high-res data later |
| Data licensing/provider terms | Redistribution or API use may be constrained | Confirm license and attribution for each source before public launch; pre-process only permitted assets |
| Browser performance | Large grids/labels degrade interaction | Clip area, tune mesh resolution, limit labels, test on an agreed baseline device |
| Ski difficulty labels are not universal | Color coding misleads across regions | Preserve source difficulty and use a legend with locale/context; don’t claim standardized ratings |
| Users read the scene as operational guidance | Safety expectations exceed data reliability | Label as visualization/discovery, show source date, exclude live status/navigation in MVP |

## 5. Suggested phases

**Phase 0 — Streif data feasibility:** inspect the Streif/Hahnenkamm DEM and route data, confirm source/attribution, and check whether public geometry matches the intended racecourse. Use Kitzbühel as the working first choice because the famous course supports a focused narrative 3D experience. Fall back to a more completely mapped resort area if route geometry is too incomplete to curate.

**Phase 1 — Visual spike:** render a cropped Hahnenkamm DEM as a stylized shaded mountain; drape the Streif route; validate mountain silhouette, vertical scale, course ribbon, camera approach, and a non-interactive camera descent.

**Phase 2 — MVP prototype:** add route landmarks, selection, labels, course facts, attribution, responsive information panel and controls, and the guided descent interaction.

**Phase 3 — Expansion readiness:** separate resort configuration/data from renderer; document repeatable data-prep process; prepare a second area to expose assumptions in the format.

## 6. Decisions to make before implementation

1. **Initial location:** Kitzbühel’s Streif is the working default. Val d’Isère remains a strong later full-center expansion; its official site describes a 300 km area with 71 lifts ([official ski-area page](https://www.valdisere.ski/en/ski-area?lang=en)).
2. **Style:** stylized 3D terrain and course, designed so a guided descent can later become a ride mode.
3. **Delivery:** local prototype first; keep deployment to GitHub Pages feasible using a static client-side build and public/static assets. Confirm licensing and hosting constraints before publishing.
4. **Route:** use actual route geometry where available, with transparent manual curation to fill gaps; preserve attribution.
5. **Devices:** desktop-first interaction design, with responsive layout and touch-friendly control sizing from the start. Mobile performance tuning can follow the desktop visual spike.

## 7. Recommendation

Start with a **stylized Streif scene** built from a clipped Hahnenkamm DEM and verified/curated course centerline, rendered as a locally projected Three.js terrain mesh with a strongly legible course ribbon. Put official downhill stats alongside separately labeled DEM-derived values, add a guided camera descent, and build responsive controls. Keep the prototype local first and static so GitHub Pages is a plausible follow-up. Val d’Isère can be the first broader resort-scale expansion after validating the data pipeline.

## 8. Resort choice: initial comparison

| Candidate | Best first-use case | Strengths | Tradeoff | Recommendation |
|---|---|---|---|---|
| Kitzbühel — Streif | One iconic slope/course | Focused scope; official course facts include 3,312 m length and 860 m vertical drop; natural guided-descent story ([official course page](https://web1.hahnenkamm.com/en/racetracks/the-streif-downhill/), [2026 course facts](https://cdn.hahnenkamm.com/site/assets/files/29082/kenndaten-hkr-2026_en.pdf)) | Public DEM and route geometry still need inspection; racecourse path may need careful curation | **Recommended MVP** |
| Val d’Isère / Tignes–Val d’Isère | Whole resort-center explorer | Large varied terrain; official resort describes 300 km of slopes and 71 lifts; official interactive piste map and live info exist ([official resort page](https://www.valdisere.ski/en/ski-area?lang=en)) | Much larger content and data-validation scope; harder to establish one central visual narrative | Good Phase 2 resort |

This choice reflects product scope and official course documentation, not yet a feature-by-feature audit of current OpenStreetMap geometry. That audit is an explicit Phase 0 implementation task.

## Sources

- [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry)
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer)
- [Copernicus DEM collection and access](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)
- [OpenTopography developer/API information](https://www.opentopography.org/developers)
- [NASA SRTM 1 arc-second dataset](https://data.nasa.gov/dataset/shuttle-radar-topography-mission-1-arc-second-global)
- [OpenStreetMap piste tagging overview](https://wiki.openstreetmap.org/wiki/Pistes)
- [OpenStreetMap piste difficulty](https://wiki.openstreetmap.org/wiki/Key:piste:difficulty)
- [OSM Foundation attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
- [Overpass API usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [MapLibre 3D terrain example](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/)
- [MapLibre Three.js terrain model example](https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/)
- [MapLibre GL JS overview](https://maplibre.org/maplibre-gl-js/docs/)
- [Official Streif downhill profile and stats](https://web1.hahnenkamm.com/en/racetracks/the-streif-downhill/)
- [Hahnenkamm Races 2026 course facts PDF](https://cdn.hahnenkamm.com/site/assets/files/29082/kenndaten-hkr-2026_en.pdf)
- [Official Val d’Isère ski-area overview](https://www.valdisere.ski/en/ski-area?lang=en)
- [OpenSkiData project](https://www.openskidata.org/)
