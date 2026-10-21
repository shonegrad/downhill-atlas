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
    featuredId: 'streif',
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
    featuredId: 'duboka-1',
    featuredName: 'Дубока 1',
    featuredNameLatin: 'Duboka 1',
    featuredSubtitle: 'Kopaonik piste (curated way order)',
    featuredDifficulty: 'intermediate',
    featuredDifficultyNote:
      'Difficulty follows the OSM mapping (intermediate-class run descending from the Pančić plateau); local trail-color conventions may differ in wording.',
    rawPrefix: 'osm-kopaonik',
    routeRelationId: null,
    // The featured course uses a curated chain (see curated/kopaonik/duboka-1.json):
    // the mapped red branch joins the shared lower corridor at the exact merge node.
    featuredMode: 'curatedFile',
    featuredCurated: 'curated/kopaonik/duboka-1.json',
    featuredLandmarkNodeNames: ['Дубока 1', 'Дубока 1 међустаница'],
    landmarkSelectors: [
      'node["name"]["natural"="peak"]',
      'node["name"]["place"]',
      'node["name"]["tourism"]',
      'node["name"]["aerialway"]',
    ],
    // Tight AOI: all three courses live in ~2.9×2.2 km (Duboka valley + the
    // Pančić plateau edge above it); an oversized box pushed the overview
    // camera past ~8 km where the ribbon sank below depth precision.
    aoi: { latSouth: 43.2695, latNorth: 43.2895, lonWest: 20.8075, lonEast: 20.8445 },
    // Official facts for the DEFAULT featured course (duboka-1), quoted from
    // the operator (Skijališta Srbije) and the kopaonik.rs trail table.
    officialFacts: {
      courseLengthMeters: 1440,
      verticalDropMeters: 373,
      startElevationMeters: 1975,
      finishElevationMeters: 1602,
      attribution:
        'Facts quoted from the Skijališta Srbije ski-centre fact sheet (skijalistasrbije.rs) and the kopaonik.rs trail table (Duboka I (FIS) 1440 m / 373 m); start = Suvo Rudište top station per operator; finish derived from the official drop.',
    },
    resortFacts: {
      headline: 'Kopaonik ski centre — operator fact sheet (Skijališta Srbije)',
      rows: [
        ['Centre altitude', '1,770 m'],
        ['Highest point', 'Pančićev vrh, 2,017 m'],
        ['Total slopes and ski paths', '62 km'],
        ['Lift capacity', '≈32,000 skiers/hour'],
        ['Installations', 'gondola, 3 six-seaters, 7 quads, surface lifts (operator list, ~24)'],
        ['Slope classes', '21 easy / 9 intermediate / 6 hard'],
        ['Longest run', '3,500 m'],
        ['Maximum vertical', '512 m'],
        ['Snowmaking coverage', '97%'],
        ['Nordic trails', '12 km'],
        ['Night skiing', 'Malo jezero, Karaman greben, Pančićev vrh'],
        ['Competition runs', '3 runs to FIS standard (slalom, GS, super-G, downhill)'],
      ],
      attribution:
        'Facts quoted from skijalistasrbije.rs (Karakteristike ski centra Kopaonik / About the Resort). Third-party sources state 55 km alpine + 12 km nordic (Wikipedia); numbers differ by counting method.',
    },
    // Additional courses emitted as public/data/<dir>/routes/<id>.json.
    // Geometry stays loaded from the same OSM extract; a curated input file
    // (downhill-atlas-curated-route/1) pins the way order and documents why.
    extraCourses: [
      {
        id: 'pancic-vrh',
        name: 'Pančićev vrh',
        nameSource: 'Панчићев врх',
        subtitle: 'Kopaonik piste (curated way order)',
        difficulty: 'intermediate',
        curated: 'curated/kopaonik/pancic-vrh.json',
        landmarkNodeNames: ['Панчић експрес'],
        officialFacts: {
          courseLengthMeters: 1393,
          verticalDropMeters: 248,
          startElevationMeters: 1975,
          finishElevationMeters: 1727,
          attribution:
            'Facts quoted from the kopaonik.rs official trail table (Pančićev vrh: 1393 m / 248 m); start = Suvo Rudište top station per operator (infokop.net); finish derived from the official drop.',
        },
      },
      {
        id: 'duboka-2',
        name: 'Duboka 2',
        nameSource: 'Дубока 2',
        subtitle: 'Kopaonik piste (curated way order)',
        difficulty: 'intermediate',
        curated: 'curated/kopaonik/duboka-2.json',
        landmarkNodeNames: ['Дубока 2'],
        officialFacts: {
          courseLengthMeters: 1114,
          verticalDropMeters: 394,
          startElevationMeters: null,
          finishElevationMeters: null,
          attribution:
            'Facts quoted from the kopaonik.rs official trail table (Дубока 2: 1114 m / 394 m); the table lists no station elevations.',
        },
      },
    ],
  },
};

export const LOCATION_ORDER = ['streif', 'kopaonik'];
