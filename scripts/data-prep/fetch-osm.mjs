// Reproducible fetch of the OSM extracts used by the prototype (Overpass).
// Provided raw responses are cached in scripts/data-prep/raw/ and reused.

import { overpass, RAW_DIR, rawFeaturesFile, rawLandmarksFile } from './lib.mjs';
import { LOCATIONS } from './config.mjs';
import fs from 'node:fs';

const bbox = (a) => `(${a.latSouth},${a.lonWest},${a.latNorth},${a.lonEast})`;

const locationIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(LOCATIONS);

if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

for (const id of locationIds) {
  const loc = LOCATIONS[id];
  if (!loc) throw new Error(`unknown location ${id}`);

  const featuresQuery = `[out:json][timeout:90];way["piste:type"="downhill"]${bbox(loc.aoi)};relation["route"="piste"]${bbox(loc.aoi)};way["aerialway"]${bbox(loc.aoi)};out body geom;`;
  await overpass(featuresQuery, rawFeaturesFile(loc));

  if (loc.landmarkNodeIds?.length) {
    const landmarkIds = loc.landmarkNodeIds.join(',');
    const landmarkQuery = `[out:json][timeout:60];node(id:${landmarkIds});out body;`;
    await overpass(landmarkQuery, rawLandmarksFile(loc));
  }
}
console.log('done');
