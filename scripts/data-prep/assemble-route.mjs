// Assemble the featured course centerline for a location (descent order, top
// first), snap landmarks, and record DEM-derived estimates.

import {
  rawFeaturesFile,
  rawLandmarksFile,
  outDirOf,
  assembleFeatured,
  toLocalMeters,
  localOrigin,
  readJson,
  writeJson,
} from './lib.mjs';
import { LOCATIONS } from './config.mjs';

const RESAMPLE_SPACING_M = 10;

const locationIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(LOCATIONS);

for (const id of locationIds) {
  const loc = LOCATIONS[id];
  if (!loc) throw new Error(`unknown location ${id}`);

  const raw = readJson(`scripts/data-prep/raw/${rawFeaturesFile(loc)}`);
  const landmarksRaw = loc.landmarkNodeIds?.length
    ? readJson(`scripts/data-prep/raw/${rawLandmarksFile(loc)}`)
    : null;

  const assembly = assembleFeatured(loc, raw, landmarksRaw);
  if (assembly.chain.length < 2) throw new Error(`featured chain too short for ${loc.id}`);

  // --- standardize coordinates ------------------------------------------------
  // Descent order is established after elevation sampling: start must be the high
  // end. For relation mode this validates the OSM member order; in namedWays mode
  // orientation is entirely DEM-derived.
  const origin = localOrigin(loc.aoi);
  const ptsLocal = assembly.chain.map((p) => toLocalMeters(loc.aoi, p.lat, p.lon));
  let cum = [0];
  for (let i = 1; i < ptsLocal.length; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(ptsLocal[i].east - ptsLocal[i - 1].east, ptsLocal[i].north - ptsLocal[i - 1].north),
    );
  }
  const totalLength = cum[cum.length - 1];
  const resampledCount = Math.floor(totalLength / RESAMPLE_SPACING_M) + 1;
  const resampled = [];
  let cursor = 0;
  for (let k = 0; k < resampledCount; k++) {
    const target = k * RESAMPLE_SPACING_M;
    while (cursor < cum.length - 2 && cum[cursor + 1] < target) cursor++;
    const t = (target - cum[cursor]) / (cum[cursor + 1] - cum[cursor] || 1);
    const a = ptsLocal[cursor];
    const b = ptsLocal[cursor + 1];
    resampled.push([
      Math.round(a.east + (b.east - a.east) * t),
      Math.round(a.north + (b.north - a.north) * t),
    ]);
  }
  const spacing = totalLength / (resampled.length - 1);

  // --- terrain (for elevation-based orientation and estimates) -----------------
  const terrainPath = `${outDirOf(loc)}/terrain.json`;
  const terrain = readJson(terrainPath);
  const zAt = ([e, n]) => sampleTerrainObj(terrain, e, n);
  function sampleTerrainObj(grid, east, north) {
    const col = (east + grid.eastMeters / 2) / grid.spacing;
    const row = (north + grid.northMeters / 2) / grid.spacing;
    const clamp = (v, hi) => Math.min(Math.max(v, 0), hi);
    const x0 = Math.floor(clamp(col, grid.nx - 1));
    const y0 = Math.floor(clamp(row, grid.ny - 1));
    const x1 = Math.min(x0 + 1, grid.nx - 1);
    const y1 = Math.min(y0 + 1, grid.ny - 1);
    const tx = clamp(col, grid.nx - 1) - x0;
    const ty = clamp(row, grid.ny - 1) - y0;
    const at = (r, c) => grid.heights[r * grid.nx + c];
    return (
      (at(y0, x0) * (1 - tx) + at(y0, x1) * tx) * (1 - ty) +
      (at(y1, x0) * (1 - tx) + at(y1, x1) * tx) * ty
    );
  }
  const zChainStart = zAt(resampled[0]);
  const zChainEnd = zAt(resampled[resampled.length - 1]);
  if (zChainEnd > zChainStart) {
    resampled.reverse();
    console.log(`[${loc.id}] reversed chain so descent starts high (${zChainEnd} -> ${zChainStart})`);
  }

  // --- landmarks snap after final orientation ---------------------------------
  const spacingM = totalLength / (resampled.length - 1);
  const landmarks = (assembly.nodeLandmarks ?? []).map((lm) => {
    const local = toLocalMeters(loc.aoi, lm.lat, lm.lon);
    let bestK = 0;
    let bestD = Infinity;
    for (let k = 0; k < resampled.length; k++) {
      const [rx, ry] = resampled[k];
      const d = Math.hypot(rx - local.east, ry - local.north);
      if (d < bestD) {
        bestD = d;
        bestK = k;
      }
    }
    return {
      id: lm.id,
      name: lm.name,
      east: Math.round(local.east),
      north: Math.round(local.north),
      routeDistance: Math.round(bestK * spacingM),
      snapDistance: Math.round(bestD),
      source: lm.source,
    };
  });

  const demStart = zAt(resampled[0]);
  const demFinish = zAt(resampled[resampled.length - 1]);

  const out = {
    format: 'downhill-atlas-route/1',
    name: loc.featuredNameLatin ?? loc.featuredName,
    nameSource: loc.featuredName,
    nameSourceLatin: loc.featuredNameLatin,
    difficulty: loc.featuredDifficulty,
    source: {
      type: loc.featuredMode === 'relation' ? 'osm-relation' : 'osm-named-ways',
      relation: loc.routeRelationId ?? undefined,
      wayNameMatch: loc.featuredMode === 'relation' ? undefined : loc.featuredName,
      attribution: '© OpenStreetMap contributors (ODbL)',
      extractedAt: new Date().toISOString().slice(0, 10),
    },
    origin,
    spacing: Number(spacingM.toFixed(2)),
    points: resampled,
    landmarks,
    estimates: {
      demStartElevation: Math.round(demStart),
      demFinishElevation: Math.round(demFinish),
      demVerticalDrop: Math.round(demStart - demFinish),
    },
    descentDurationSeconds: Math.max(30, Math.round(totalLength / 45)),
    curation: {
      chainStrategy:
        loc.featuredMode === 'relation'
          ? 'ordered member ways of the OSM piste relation (start -> finish), validated by endpoint chaining'
          : 'ways matched by exact name, joined by tolerant endpoint linking, oriented by elevation',
      assemblySegments: assembly.segCount,
      continuityGapsOver: 30,
      continuityGaps: assembly.gaps,
    },
  };

  writeJson(`${outDirOf(loc)}/route.json`, out);
  console.log(
    `${loc.id}: route ${resampled.length} pts @ ${spacingM.toFixed(1)} m; length ${Math.round(
      totalLength,
    )} m; landmarks ${landmarks.length}; DEM drop ${out.estimates.demVerticalDrop} m; ` +
      `max joint gap ${Math.max(0, ...assembly.gaps)} m`,
  );
}
