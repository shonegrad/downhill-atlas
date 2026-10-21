export interface TerrainAsset {
  format: string;
  origin: { lat: number; lon: number };
  nx: number;
  ny: number;
  spacing: number;
  eastMeters: number;
  northMeters: number;
  elevationMin: number;
  elevationMax: number;
  verticalScale: number;
  heights: number[];
}

export interface OfficialFacts {
  courseLengthMeters: number | null;
  verticalDropMeters: number | null;
  startElevationMeters: number | null;
  finishElevationMeters: number | null;
  attribution: string;
}

export interface RouteAsset {
  format: string;
  courseId?: string;
  subtitle?: string;
  name: string;
  nameSource?: string;
  nameSourceLatin?: string;
  difficulty?: string | null;
  officialFacts?: OfficialFacts | null;
  source?: {
    type: string;
    relation?: number;
    wayNameMatch?: string;
    wayIdsInOrder?: number[];
    curatedAt?: string;
    attribution: string;
    extractedAt?: string;
  };
  origin: { lat: number; lon: number };
  spacing: number;
  points: number[][];
  descentDurationSeconds?: number;
  estimates?: {
    demStartElevation: number;
    demFinishElevation: number;
    demVerticalDrop: number;
  };
  landmarks: {
    id: string;
    name: string;
    east: number;
    north: number;
    routeDistance: number;
    source: string;
  }[];
}

export interface CourseSummary {
  id: string;
  name: string;
  file: string;
  isDefault: boolean;
  curated: boolean;
}

export interface FeatureAsset {
  format: string;
  kind: string;
  attribution: string;
  features: {
    id: string;
    name: string | null;
    difficulty?: string | null;
    type?: string;
    points: number[][];
  }[];
}

export interface ManifestAsset {
  format: string;
  generatedAt: string;
  officialCourseFacts: OfficialFacts | null;
  resortFacts?: {
    headline: string;
    rows: [string, string][];
    attribution: string;
  } | null;
  demEstimates: {
    demRouteLengthMeters: number;
    demVerticalDropMeters: number;
    demStartElevationMeters: number;
    demFinishElevationMeters: number;
  } | null;
  sources: {
    id: string;
    name: string;
    license: string;
    attribution: string;
    limitation?: string;
  }[];
  featuredDifficultyNote?: string | null;
  attributionLine: string;
  knownGaps: string[];
}

export interface LocationEntry {
  id: string;
  dir: string;
  display: string;
  featuredName: string;
  featuredNameSource?: string;
  featuredSubtitle: string;
  featuredDifficulty?: string | null;
  hasOfficialFacts: boolean;
  courses?: CourseSummary[] | null;
}

export interface LocationsAsset {
  format: string;
  default: string;
  locations: LocationEntry[];
}

export interface Dataset {
  terrain: TerrainAsset;
  route: RouteAsset;
  pistes: FeatureAsset;
  lifts: FeatureAsset;
  manifest: ManifestAsset;
}

export async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadDataset(base = './data/streif'): Promise<Dataset> {
  const [terrain, route, pistes, lifts, manifest] = await Promise.all([
    loadJson<TerrainAsset>(`${base}/terrain.json`),
    loadJson<RouteAsset>(`${base}/route.json`),
    loadJson<FeatureAsset>(`${base}/pistes.json`),
    loadJson<FeatureAsset>(`${base}/lifts.json`),
    loadJson<ManifestAsset>(`${base}/manifest.json`),
  ]);
  return { terrain, route, pistes, lifts, manifest };
}

export async function loadLocations(): Promise<LocationsAsset> {
  return loadJson<LocationsAsset>('./data/locations.json');
}

export async function loadRoute(base: string, file: string): Promise<RouteAsset> {
  return loadJson<RouteAsset>(file.startsWith('routes/') ? `${base}/${file}` : `${base}/route.json`);
}

export function routeSourceLabel(route: RouteAsset): string {
  const type = route.source?.type ?? 'osm-named-ways';
  if (type === 'curated-way-list') return 'OSM ways, curated order';
  if (type === 'osm-relation') return 'OSM piste relation';
  return 'OSM named ways';
}
