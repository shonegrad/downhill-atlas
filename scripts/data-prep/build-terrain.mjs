// Build the prepared static terrain asset for a location AOI.
// Source: Tilezen terrarium tiles (AWS Open Data); Austria/EU constituent DGM per joerd docs.

import {
  TERRARIUM_ZOOM,
  fetchTerrariumSlab,
  buildTerrainGrid,
  terrainStats,
  writeJson,
  outDirOf,
} from './lib.mjs';
import { LOCATIONS } from './config.mjs';

const SPACING_M = 25;

const locationIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(LOCATIONS);

for (const id of locationIds) {
  const loc = LOCATIONS[id];
  if (!loc) throw new Error(`unknown location ${id}`);

  const slab = await fetchTerrariumSlab(TERRARIUM_ZOOM, loc.aoi);
  const grid = buildTerrainGrid(loc.aoi, SPACING_M, slab);
  const stats = terrainStats(grid);

  const out = {
    format: 'downhill-atlas-terrain/1',
    origin: grid.origin,
    nx: grid.nx,
    ny: grid.ny,
    spacing: grid.spacing,
    eastMeters: grid.eastMeters,
    northMeters: grid.northMeters,
    convention:
      'heights is row-major; row 0 is the southernmost row (north increases with row index); column 0 is west. Scene x = east meters from origin; scene z = -north meters.',
    elevationMin: Math.round(stats.min * 10) / 10,
    elevationMax: Math.round(stats.max * 10) / 10,
    verticalScale: 1.0,
    source: {
      name: 'Tilezen Terrain Tiles (terrarium png) on AWS Open Data; constituent DGM per docs',
      retrievedAt: new Date().toISOString().slice(0, 10),
      licenseNote: 'See data manifest for full source, license and attribution.',
    },
    heights: Array.from(grid.heights, (v) => Math.round(v)),
  };

  writeJson(`${outDirOf(loc)}/terrain.json`, out);
  console.log(
    `${loc.id}: grid ${grid.nx} x ${grid.ny} @ ${grid.spacing} m; span ` +
      `${(grid.eastMeters / 1000).toFixed(1)} x ${(grid.northMeters / 1000).toFixed(1)} km; ` +
      `elevation ${out.elevationMin} -> ${out.elevationMax} m`,
  );
}
