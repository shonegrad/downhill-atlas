// Export subdued context features (other pistes, lifts) inside a location's AOI.
// Featured- and curated-course ways are excluded so every hero route stays unambiguous.

import {
  rawFeaturesFile,
  outDirOf,
  toLocalMeters,
  inAoi,
  readJson,
  writeJson,
} from './lib.mjs';
import { LOCATIONS } from './config.mjs';

const EXCLUDED_AERIALWAY = new Set(['station', 'goods', 'explosive', 'cableway']);

const locationIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(LOCATIONS);

for (const id of locationIds) {
  const loc = LOCATIONS[id];
  if (!loc) throw new Error(`unknown location ${id}`);

  const raw = readJson(`scripts/data-prep/raw/${rawFeaturesFile(loc)}`);
  const ways = raw.elements.filter((e) => e.type === 'way');

  let featuredWayIds = new Set();
  if (loc.featuredMode === 'relation') {
    const relation = raw.elements.find((e) => e.type === 'relation' && e.id === loc.routeRelationId);
    featuredWayIds = new Set(relation.members.filter((m) => m.type === 'way').map((m) => m.ref));
  } else {
    featuredWayIds = new Set(
      ways.filter((w) => w.tags?.name === loc.featuredName).map((w) => w.id),
    );
  }
  // A curated featured chain can splice ways from differently-named branches
  // (e.g. the shared lower corridor mapped under the black-branch way); those
  // way ids are excluded as well so the hero band stays unambiguous.
  if (loc.featuredCurated) {
    try {
      const cur = readJson(`scripts/data-prep/${loc.featuredCurated}`);
      for (const id of cur.selection.wayIdsInOrder ?? []) featuredWayIds.add(id);
    } catch {
      console.warn(`[export-context] featured curated file missing: ${loc.featuredCurated}`);
    }
  }
  // Curated extra courses keep their ways out of the context export too; the
  // assembled route files (build order: assemble-route runs before this) record
  // the ordered way lists.
  let curatedWayIds = new Set();
  for (const course of loc.extraCourses ?? []) {
    const routesFile = `${outDirOf(loc)}/routes/${course.id}.json`;
    try {
      const built = readJson(routesFile);
      for (const wayId of built.source.wayIdsInOrder ?? []) curatedWayIds.add(wayId);
    } catch {
      console.warn(`[export-context] curated route missing: ${routesFile}`);
    }
  }
  const excludedWayIds = new Set([...featuredWayIds, ...curatedWayIds]);

  function localLine(geometry) {
    return geometry.map((p) => {
      const l = toLocalMeters(loc.aoi, p.lat, p.lon);
      return [Math.round(l.east), Math.round(l.north)];
    });
  }

  const pistes = [];
  const lifts = [];

  for (const el of ways) {
    if (!el.geometry) continue;
    const tags = el.tags ?? {};
    const intersects = el.geometry.some((p) => inAoi(loc.aoi, p.lat, p.lon));
    if (!intersects) continue;

    if (tags['piste:type'] === 'downhill' && !excludedWayIds.has(el.id)) {
      pistes.push({
        id: `way-${el.id}`,
        name: tags.name ?? null,
        difficulty: tags['piste:difficulty'] ?? null,
        grooming: tags['piste:grooming'] ?? null,
        points: localLine(el.geometry),
      });
    } else if (tags.aerialway && !EXCLUDED_AERIALWAY.has(tags.aerialway)) {
      lifts.push({
        id: `way-${el.id}`,
        name: tags.name ?? null,
        type: tags.aerialway,
        points: localLine(el.geometry),
      });
    }
  }

  writeJson(`${outDirOf(loc)}/pistes.json`, {
    format: 'downhill-atlas-features/1',
    kind: 'pistes',
    filter: 'piste:type=downhill ways intersecting the AOI; featured and curated course ways excluded',
    attribution: '© OpenStreetMap contributors (ODbL)',
    features: pistes,
  });
  writeJson(`${outDirOf(loc)}/lifts.json`, {
    format: 'downhill-atlas-features/1',
    kind: 'aerialways',
    filter: 'aerialway=* ways intersecting the AOI (stations/goods excluded)',
    attribution: '© OpenStreetMap contributors (ODbL)',
    features: lifts,
  });
  console.log(`${loc.id}: pistes ${pistes.length}, lifts ${lifts.length}`);
}
