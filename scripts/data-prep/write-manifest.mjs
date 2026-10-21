// Write the provenance manifest per location (Milestone-0 style documentation).

import fs from 'node:fs';
import {
  TERRARIUM_ZOOM,
  localOrigin,
  outDirOf,
  writeJson,
  readJson,
} from './lib.mjs';
import { LOCATIONS } from './config.mjs';

const TERRAIN_SOURCE = {
  id: 'terrain',
  name: 'Tilezen Terrain Tiles ("terrarium") hosted on AWS Open Data',
  access: `AWS bucket elevation-tiles-prod (anonymous read; no key required), terrarium/zoom-${TERRARIUM_ZOOM} PNG tiles`,
  license:
    'Constituent mosaic. Austria pixels derive from DGM Österreich (CC BY 3.0 Österreich); Serbia pixels derive from satellite-radar DEM sources per joerd data-sources (SRTM-class). License page: registry.opendata.aws/terrain-tiles -> github.com/tilezen/joerd attribution.md.',
  attribution:
    'Terrain: © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich; SRTM data courtesy of the U.S. Geological Survey; full Tilezen attribution list as required by joerd docs.',
  tilezenRequiredAttribution: [
    'ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736;',
    'Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017;',
    'Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich;',
    'Canada terrain data contains information licensed under the Open Government Licence – Canada;',
    'Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers;',
    'Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration',
    'Mexico terrain data source: INEGI, Continental relief, 2016;',
    'New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved);',
    'Norway terrain data © Kartverket;',
    'United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved;',
    'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey.',
  ],
};

function step(loc) {
  const route = readRouteJson(loc);
  const session = new Date().toISOString();

  const routeSource = {
    id: 'route',
    name:
      route.source.type === 'osm-relation'
        ? 'OpenStreetMap — featured course piste relation'
        : 'OpenStreetMap — featured course by exact way-name matching',
    access:
      route.source.type === 'osm-relation'
        ? `Overpass API extract; relation id ${route.source.relation}`
        : `Overpass API extract; ways with name = ${route.source.wayNameMatch}`,
    license: 'ODbL 1.0 (© OpenStreetMap contributors)',
    attribution: 'Route: © OpenStreetMap contributors',
    processing:
      'Ways joined at endpoints (member order for relations; tolerant linking otherwise), oriented by elevation, resampled at 10 m spacing.',
    limitation:
      'Public mapping approximates the true course line; treat geometry as candidate, not survey.',
  };

  const sources = [
    TERRAIN_SOURCE,
    routeSource,
    {
      id: 'context',
      name: 'OpenStreetMap — other pistes and lifts in AOI',
      license: 'ODbL 1.0',
      attribution: 'Context features: © OpenStreetMap contributors',
      limitation: 'Mapping completeness varies; context layers are scenery, not information sources.',
    },
    {
      id: 'official-facts',
      name: loc.officialFacts
        ? 'Official course documentation'
        : 'Official course documentation — none verified for this location yet; only DEM-derived estimates are shown',
      license: 'Short factual quotation of headline numbers only.',
    },
  ];

  // additional (curated) courses: provenance recorded per course in their
  // routes/<id>.json files; the manifest indexes them here.
  const courses = readCourses(loc);
  for (const course of (courses ?? []).filter((course) => course.id !== route.courseId)) {
    const built = readJson(`${outDirOf(loc)}/${course.file}`);
    const curatedSource = built.source;
    sources.push({
      id: `course-${course.id}`,
      name: `OpenStreetMap — ${course.name} (curated way order in ${course.file})`,
      access: `Overpass API extract; ordered way ids ${curatedSource.wayIdsInOrder.join(', ')}; curated ${curatedSource.curatedAt}; join gaps ${curatedSource.joinGapsMeters.join(', ')} m`,
      license: 'ODbL 1.0 (© OpenStreetMap contributors)',
      attribution: 'Route: © OpenStreetMap contributors, curated ordering by this project',
      processing:
        'Ways pinned in a curated order whose endpoint joins measure within tolerance; oriented by elevation; resampled at 10 m spacing.',
      limitation: 'Curated single-branch selection; alternates excluded rather than merged; not a survey line.',
    });
  }

  const manifest = {
    format: 'downhill-atlas-manifest/1',
    locationId: loc.id,
    generatedAt: session.slice(0, 10),
    area: {
      workingTitle: loc.display,
      aoi: loc.aoi,
      origin: localOrigin(loc.aoi),
      projection:
        'Local metric ENU approximation on sphere R=6371000: east = (lon-lon0)*R*cos(lat0)*pi/180, north = (lat-lat0)*R*pi/180. Scene maps north to -z. Vertical: scene y = (elevation - DEM min) * verticalScale.',
    },
    officialCourseFacts: loc.officialFacts ?? null,
    featuredDifficultyNote: loc.featuredDifficultyNote ?? null,
    courses: readCourses(loc),
    demEstimates: {
      note: 'Derived from prepared route geometry + 25 m DEM sampling; NOT survey values.',
      demRouteLengthMeters: Math.round((route.points.length - 1) * route.spacing),
      demStartElevationMeters: route.estimates.demStartElevation,
      demFinishElevationMeters: route.estimates.demFinishElevation,
      demVerticalDropMeters: route.estimates.demVerticalDrop,
    },
    courseValidation: {
      assemblySegments: route.curation.assemblySegments,
      continuityGapsMeters: route.curation.continuityGaps,
      note:
        'Elevation-based orientation check passed; see route.json curation block for the matching strategy.',
    },
    sources,
    attributionLine:
      'Route, pistes, lifts and landmarks from © OpenStreetMap contributors (ODbL). Terrain: © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich (CC BY 3.0 AT, via Tilezen Terrain Tiles on AWS Open Data); SRTM data courtesy of the U.S. Geological Survey.',
    knownGaps: [
      'Featured course follows the best public mapped geometry; race/precision deviations are not surveyed.',
      'Vertical exaggeration currently 1.0; visual-spike alternatives still to be settled.',
      'DEM-class terrain implies smoothed micro-relief (falls, banks, gully edges).',
      'No trees/buildings/snow surface; stylized materials only.',
      'Piste difficulty colors follow OSM tags; local trail-color conventions differ.',
    ],
  };

  writeJson(`${outDirOf(loc)}/manifest.json`, manifest);
}


function readRouteJson(loc) {
  return readJson(`${outDirOf(loc)}/route.json`);
}

function readCourses(loc) {
  try {
    return JSON.parse(fs.readFileSync(`${outDirOf(loc)}/routes/index.json`, 'utf8')).courses;
  } catch {
    return null;
  }
}

const locationIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(LOCATIONS);

for (const id of locationIds) {
  const loc = LOCATIONS[id];
  if (!loc) throw new Error(`unknown location ${id}`);
  step(loc);
  console.log(`${loc.id}: manifest written`);
}
