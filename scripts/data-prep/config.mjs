// LOCATION_CONFIG is shared by prep scripts and the location index output.

// Location ids become public/data directories and ?loc= values.
export const LOCATIONS = {
  streif: {
    id: 'streif',
    dir: 'streif',
    display: 'Streif — Kitzbühel, Austria',
    featuredName: 'Streif',
    featuredSubtitle: 'Hahnenkamm downhill',
    featuredDifficulty: 'expert',
    rawPrefix: 'osm-kitzbuehel',
    routeRelationId: 12870777,
    featuredMode: 'relation',
    landmarkNodeIds: [
      3308152316, 3686575490, 3308156554, 3308156555, 3308181028, 3308181029, 3308181030,
      3308192322, 3308192323, 3308210431, 3308210432, 3308210433, 3308210434, 3308210435,
    ],
    aoi: { latSouth: 47.4185, latNorth: 47.452, lonWest: 12.3595, lonEast: 12.3995 },
    officialFacts: {
      courseLengthMeters: 3312,
      verticalDropMeters: 860,
      startElevationMeters: 1665,
      finishElevationMeters: 805,
      attribution: 'Facts quoted from the official Hahnenkamm course documentation; see research_brief_brd.md sources.',
    },
  },
  kopaonik: {
    id: 'kopaonik',
    dir: 'kopaonik',
    display: 'Duboka 1 — Kopaonik, Serbia',
    featuredName: 'Дубока 1',
    featuredNameLatin: 'Duboka 1',
    featuredSubtitle: 'Kopaonik piste (as mapped)',
    featuredDifficulty: 'intermediate',
    featuredDifficultyNote:
      'Difficulty follows the OSM mapping (intermediate-class run descending from the Pančić plateau); local trail-color conventions may differ in wording.',
    rawPrefix: 'osm-kopaonik',
    routeRelationId: null,
    featuredMode: 'namedWays',
    landmarks: false,
    aoi: { latSouth: 43.262, latNorth: 43.331, lonWest: 20.788, lonEast: 20.891 },
    officialFacts: null,
  },
};

export const LOCATION_ORDER = ['streif', 'kopaonik'];
