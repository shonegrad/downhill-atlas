// Assemble course centerlines for a location (descent order, top first), snap
// landmarks, and record DEM-derived estimates.
//
// The default featured course is written to route.json (unchanged format).
// Extra curated courses (config extraCourses) are written to routes/<id>.json
// plus a routes/index.json summary; each carries its own provenance block.

import {
  rawFeaturesFile,
  rawLandmarksFile,
  outDirOf,
  assembleFeatured,
  aoiCenter,
  metersPerDegree,
  stitchOrderedWays,
  toLocalMeters,
  localOrigin,
  sampleTerrainGrid,
  readJson,
  writeJson,
} from './lib.mjs';
import { LOCATIONS } from './config.mjs';

const RESAMPLE_SPACING_M = 10;

const locationIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(LOCATIONS);

// Resample a lat/lon chain to fixed spacing in the local metric frame, then
// orient descent-order (start must be the high end) via DEM sampling.
function resampleAndOrient(loc, chain, terrain) {
  const origin = localOrigin(loc.aoi);
  const ptsLocal = chain.map((p) => toLocalMeters(loc.aoi, p.lat, p.lon));
  const cum = [0];
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
  if (sampleTerrainGrid(terrain, resampled[resampled.length - 1][0], resampled[resampled.length - 1][1]) >
      sampleTerrainGrid(terrain, resampled[0][0], resampled[0][1])) {
    resampled.reverse();
    console.log(
      `[${loc.id}] reversed chain so descent starts high (${sampleTerrainGrid(
        terrain,
        resampled[0][0],
        resampled[0][1],
      )})`,
    );
  }
  return { resampled, spacing, totalLength };
}

// Monotonicity sanity check: how much does the chain climb against descent?
function descentCheck(loc, resampled, terrain) {
  let climb = 0;
  let net = 0;
  for (let i = 1; i < resampled.length; i++) {
    const dz =
      sampleTerrainGrid(terrain, resampled[i][0], resampled[i][1]) -
      sampleTerrainGrid(terrain, resampled[i - 1][0], resampled[i - 1][1]);
    if (dz > 0) climb += dz;
    net += dz;
  }
  return { netDropM: Math.round(-net), climbM: Math.round(climb) };
}

// Build the route asset for one assembled chain. `meta` describes the course
// (names, difficulty, source block, chain strategy); `assembly` carries the
// stitched lat/lon chain, segment count and continuity gaps.
function buildRoute(loc, terrain, assembly, meta) {
  if (assembly.chain.length < 2) {
    throw new Error(`chain too short for ${loc.id}/${meta.courseId}`);
  }
  const { resampled, spacing, totalLength } = resampleAndOrient(loc, assembly.chain, terrain);
  const spacingM = totalLength / (resampled.length - 1);

  // --- landmarks snap after final orientation ---------------------------------
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
  const demStart = sampleTerrainGrid(terrain, resampled[0][0], resampled[0][1]);
  const demFinish = sampleTerrainGrid(
    terrain,
    resampled[resampled.length - 1][0],
    resampled[resampled.length - 1][1],
  );
  const check = descentCheck(loc, resampled, terrain);

  const out = {
    format: 'downhill-atlas-route/1',
    courseId: meta.courseId,
    subtitle: meta.subtitle,
    name: meta.name,
    nameSource: meta.nameSource,
    nameSourceLatin: meta.nameSourceLatin,
    difficulty: meta.difficulty,
    source: meta.source,
    origin: localOrigin(loc.aoi),
    spacing: Number(spacingM.toFixed(2)),
    points: resampled,
    landmarks,
    officialFacts: meta.officialFacts ?? null,
    estimates: {
      demStartElevation: Math.round(demStart),
      demFinishElevation: Math.round(demFinish),
      demVerticalDrop: Math.round(demStart - demFinish),
    },
    descentDurationSeconds: Math.max(30, Math.round(totalLength / 45)),
    curation: {
      chainStrategy: meta.chainStrategy,
      assemblySegments: assembly.segCount,
      continuityGapsOver: 30,
      continuityGaps: assembly.gaps,
      descentCheck: check,
    },
  };

  console.log(
    `${loc.id}/${meta.courseId}: route ${resampled.length} pts @ ${spacingM.toFixed(1)} m; length ${Math.round(
      totalLength,
    )} m; landmarks ${landmarks.length}; DEM drop ${out.estimates.demVerticalDrop} m (${check.netDropM} net, ${check.climbM} climb); ` +
      `max joint gap ${Math.max(0, ...assembly.gaps)} m`,
  );
  return out;
}

for (const id of locationIds) {
  const loc = LOCATIONS[id];
  if (!loc) throw new Error(`unknown location ${id}`);

  const raw = readJson(`scripts/data-prep/raw/${rawFeaturesFile(loc)}`);
  const hasLandmarksRaw =
    loc.landmarkNodeIds?.length || loc.landmarkSelectors?.length || loc.featuredLandmarkNodeNames;
  const landmarksRaw = hasLandmarksRaw
    ? readJson(`scripts/data-prep/raw/${rawLandmarksFile(loc)}`)
    : null;
  const terrain = readJson(`${outDirOf(loc)}/terrain.json`);
  const iso = new Date().toISOString().slice(0, 10);
  const courses = [];

  // --- named landmark nodes (OSM nodes with names, e.g. lift stations) ---------
  // When a location fetches a generic named-node extract, courses pick the
  // nodes whose names match their allowlist and whose position falls near the
  // assembled chain; exact snapping happens later in buildRoute.
  function nodeLandmarksFor(allowNames, chainLatLon) {
    if (!landmarksRaw || !allowNames?.length) return [];
    const allow = new Set(allowNames);
    const nodes = landmarksRaw.elements.filter(
      (e) => e.type === 'node' && e.tags?.name && allow.has(e.tags.name),
    );
    const out = [];
    const m = metersPerDegree(aoiCenter(loc.aoi).lat);
    for (const n of nodes) {
      let bestD = Infinity;
      for (const p of chainLatLon) {
        bestD = Math.min(
          bestD,
          Math.hypot((p.lon - n.lon) * m.east, (p.lat - n.lat) * m.north),
        );
      }
      if (bestD > 600) continue;
      const kind = n.tags.natural === 'peak' ? 'peak' : n.tags.aerialway ? 'lift station' : 'named node';
      out.push({
        id: `osm-node-${n.id}`,
        name: n.tags.name,
        lat: n.lat,
        lon: n.lon,
        source: `OSM ${kind} node (© OpenStreetMap contributors)`,
      });
    }
    return out;
  }

  // --- default featured course (format unchanged, now also in routes index) ---
  let curatedFeatured = null;
  if (loc.featuredMode === 'curatedFile') {
    curatedFeatured = readJson(`scripts/data-prep/${loc.featuredCurated}`);
  }
  const featured = curatedFeatured
    ? stitchOrderedWays(loc, raw, curatedFeatured.selection.segments ?? curatedFeatured.selection.wayIdsInOrder)
    : assembleFeatured(loc, raw, landmarksRaw);
  featured.nodeLandmarks = nodeLandmarksFor(loc.featuredLandmarkNodeNames, featured.chain);
  const featuredRoute = buildRoute(loc, terrain, featured, {
    courseId: curatedFeatured?.courseId ?? loc.featuredId ?? 'featured',
    subtitle: curatedFeatured?.subtitle ?? loc.featuredSubtitle,
    name: loc.featuredNameLatin ?? loc.featuredName,
    nameSource: curatedFeatured?.nameSource ?? loc.featuredName,
    nameSourceLatin: loc.featuredNameLatin,
    difficulty: loc.featuredDifficulty,
    officialFacts: loc.officialFacts,
    source: {
      type: curatedFeatured ? 'curated-way-list' : loc.featuredMode === 'relation' ? 'osm-relation' : 'osm-named-ways',
      relation: loc.routeRelationId ?? undefined,
      wayNameMatch: loc.featuredMode === 'relation' ? undefined : loc.featuredName,
      wayIdsInOrder: curatedFeatured?.selection.wayIdsInOrder,
      curatedAt: curatedFeatured?.provenance.curatedAt,
      curatedChainStrategy: curatedFeatured?.chainStrategy,
      attribution: '© OpenStreetMap contributors (ODbL)',
      extractedAt: iso,
    },
    chainStrategy: curatedFeatured
      ? curatedFeatured.chainStrategy
      : loc.featuredMode === 'relation'
        ? 'ordered member ways of the OSM piste relation (start -> finish), validated by endpoint chaining'
        : 'ways matched by exact name, joined by tolerant endpoint linking, oriented by elevation',
  });
  if (curatedFeatured && featured.gaps.length) {
    console.warn(`[curated] ${loc.id}/${featuredRoute.courseId}: join gaps ${featured.gaps.join(', ')} m`);
  }
  writeJson(`${outDirOf(loc)}/route.json`, featuredRoute);
  courses.push({
    id: featuredRoute.courseId,
    name: featuredRoute.name,
    file: 'route.json',
    isDefault: true,
    curated: loc.featuredMode === 'curatedFile',
  });

  // --- curated extra courses ----------------------------------------------------
  for (const course of loc.extraCourses ?? []) {
    const cur = readJson(`scripts/data-prep/${course.curated}`);
    const assembly = stitchOrderedWays(loc, raw, cur.selection.segments ?? cur.selection.wayIdsInOrder);
    if (assembly.missing.length) {
      throw new Error(`curated ${course.curated}: ways missing from extract: ${assembly.missing.join(', ')}`);
    }
    assembly.nodeLandmarks = nodeLandmarksFor(course.landmarkNodeNames, assembly.chain);
    const courseRoute = buildRoute(loc, terrain, assembly, {
      courseId: cur.courseId,
      subtitle: cur.subtitle,
      name: course.name,
      nameSource: cur.nameSource,
      nameSourceLatin: course.name,
      difficulty: cur.difficulty,
      officialFacts: course.officialFacts ?? null,
      source: {
        type: 'curated-way-list',
        wayIdsInOrder: cur.selection.wayIdsInOrder,
        joinGapsMeters: assembly.joinGapsMeters,
        curatedAt: cur.provenance.curatedAt,
        attribution: '© OpenStreetMap contributors (ODbL), curated order',
        extractedAt: iso,
      },
      chainStrategy: cur.chainStrategy,
    });
    writeJson(`${outDirOf(loc)}/routes/${course.id}.json`, courseRoute);
    courses.push({
      id: courseRoute.courseId,
      name: courseRoute.name,
      file: `routes/${courseRoute.courseId}.json`,
      isDefault: false,
      curated: true,
    });
  }

  if (courses.length > 1) {
    writeJson(`${outDirOf(loc)}/routes/index.json`, {
      format: 'downhill-atlas-courses/1',
      locationId: loc.id,
      default: courses[0].id,
      courses,
    });
  }
  console.log(`${loc.id}: ${courses.length} course(s) assembled`);
}
