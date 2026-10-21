import * as THREE from 'three';
import type { RouteAsset, FeatureAsset, TerrainAsset } from '../data/loader';
import { sampleSurface, sampleTerrain } from './coordinates';
import { borderFadeAt } from './terrainMesh';

export interface FeatureRecord {
  id: string;
  kind: 'featured' | 'piste' | 'lift';
  name: string | null;
  difficulty: string | null;
  liftType?: string;
  layer: string;
  lengthM: number;
  topElevation: number;
  bottomElevation: number;
  osmWayId: number;
  materials: THREE.Material[];
  objects: THREE.Object3D[];
}

export interface FeatureContext {
  group: THREE.Group;
  entries: FeatureRecord[];
  layers: Set<string>;
}

// Amber/gold is reserved for the featured course; red-family hues stay
// exclusive to piste difficulty classes so they never read as "hardness".
const FEATURED_COLOR = 0xffb100;
const FEATURED_EDGE_COLOR = 0x22252a;
const LIFT_COLOR = 0x56606a;

const PISTE_COLORS: Record<string, number> = {
  novice: 0x35a02f,
  easy: 0x2e6fd4,
  intermediate: 0xc75648,
  advanced: 0x1a1c20,
  expert: 0x151619,
  freeride: 0x8a5cc2,
  extreme: 0x6a1520,
};
const PISTE_UNCLASSIFIED = 0x93a5b1;

// Context pistes are draped surfaces, not hairlines: a 1 px line vanishes
// against the snow at overview zoom, while a ~14 m band reads like a real
// piste corridor on a printed trail map.
const PISTE_BAND_HALF_WIDTH = 7;
const PISTE_BAND_LIFT = 0.5;
const PISTE_BAND_OPACITY = 0.72;
// Cross-shading gives the band a groomed cross-section instead of a flat fill.
const PISTE_BAND_SHADE = [0.82, 1.0, 1.0, 0.82];

function polylineStats(t: TerrainAsset, points: number[][]) {
  let length = 0;
  for (let k = 1; k < points.length; k++) {
    length += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
  }
  const first = points[0];
  const last = points[points.length - 1];
  const z0 = sampleTerrain(t, first[0], first[1]);
  const z1 = sampleTerrain(t, last[0], last[1]);
  return {
    lengthM: Math.round(length),
    topElevation: Math.round(Math.max(z0, z1)),
    bottomElevation: Math.round(Math.min(z0, z1)),
  };
}

// Plate direction (perpendicular in plan) per station.
function perpendiculars(points: number[][]): { sx: number; sy: number }[] {
  const dirs: { sx: number; sy: number }[] = [];
  for (let k = 0; k < points.length; k++) {
    const prev = points[Math.max(k - 1, 0)];
    const next = points[Math.min(k + 1, points.length - 1)];
    const dx = next[0] - prev[0];
    const dn = next[1] - prev[1];
    const len = Math.hypot(dx, dn) || 1;
    dirs.push({ sx: -dn / len, sy: dx / len });
  }
  return dirs;
}

interface BandOptions {
  color: number;
  halfWidth: number;
  lift: number;
  cols?: number;
  shade?: number[] | null;
  renderOrder?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  borderFade?: boolean;
}

// Draped band: a strip of ground that follows the terrain across the slope.
// Columns across the band are each clamped to the rendered terrain surface at
// their own plan position, so the surface follows roll across the slope
// instead of floating above it or clipping into it.
function drapedBand(t: TerrainAsset, points: number[][], opts: BandOptions): THREE.Mesh {
  const cols = opts.cols ?? 4;
  const useAlpha = opts.borderFade === true;
  const colorSize = useAlpha ? 4 : 3;
  const positions = new Float32Array(points.length * cols * 3);
  const colors = new Float32Array(points.length * cols * colorSize);
  const dirs = perpendiculars(points);
  for (let k = 0; k < points.length; k++) {
    const [e, n] = points[k];
    const { sx, sy } = dirs[k];
    for (let c = 0; c < cols; c++) {
      const f = (c / (cols - 1)) * 2 - 1;
      const off = f * opts.halfWidth;
      const px = e + sx * off;
      const py = n + sy * off;
      const i3 = (k * cols + c) * 3;
      positions[i3] = px;
      positions[i3 + 1] = sampleSurface(t, px, py) - t.elevationMin + opts.lift;
      positions[i3 + 2] = -py;
      const i4 = (k * cols + c) * colorSize;
      // Vertex colors carry the cross-shade as a brightness multiplier only;
      // the tint itself lives in the material color (so highlight recoloring
      // stays a single material write).
      const s = opts.shade ? opts.shade[c] : 1;
      colors[i4] = s;
      colors[i4 + 1] = s;
      colors[i4 + 2] = s;
      // Fade the band out with the terrain border so it never floats past
      // the edge of the world.
      if (useAlpha) colors[i4 + 3] = borderFadeAt(t, px, py);
    }
  }
  const indices: number[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = k * cols + c;
      const b = a + 1;
      const c2 = (k + 1) * cols + c;
      const d = c2 + 1;
      indices.push(a, c2, b, b, c2, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (opts.shade || useAlpha) geo.setAttribute('color', new THREE.BufferAttribute(colors, colorSize));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const transparent = opts.transparent ?? false;
  const mat = new THREE.MeshBasicMaterial({
    color: opts.color,
    vertexColors: Boolean(opts.shade) || useAlpha,
    side: THREE.DoubleSide,
    transparent,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite ?? !transparent,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = opts.renderOrder ?? 0;
  if (opts.shade && !useAlpha) mesh.userData.bandVertexBase = colors.slice();
  return mesh;
}

export function buildFeaturedCourse(t: TerrainAsset, route: RouteAsset): { group: THREE.Group; entry: FeatureRecord; pickables: THREE.Object3D[] } {
  const group = new THREE.Group();
  const pts = route.points;
  // Real-piste scale: groomed runs are ~24-30 m across. AOI-relative cap keeps
  // the band sane on any future AOI size.
  const diag = Math.hypot(t.eastMeters, t.northMeters);
  const halfWidth = Math.min(9.5, Math.max(6, diag * 0.003));

  const record: FeatureRecord = {
    id: 'featured',
    kind: 'featured',
    name: route.name,
    difficulty: route.difficulty ?? null,
    layer: 'featured',
    ...polylineStats(t, pts),
    osmWayId: 0,
    materials: [],
    objects: [],
  };

  const pickables: THREE.Object3D[] = [];

  const ribbonMesh = (
    widthScale: number,
    color: number,
    lift: number,
    renderOrder: number,
    shade: number[] | null = null,
    role: 'main' | 'edge' = 'main',
  ) => {
    const mesh = drapedBand(t, pts, {
      color,
      halfWidth: halfWidth * widthScale,
      lift,
      cols: 4,
      shade,
      renderOrder,
    });
    mesh.userData.featureId = record.id;
    mesh.userData.ribbonRole = role;
    if (role === 'main') mesh.userData.ribbonVertexBase = mesh.userData.bandVertexBase;
    pickables.push(mesh);
    record.materials.push(mesh.material as THREE.Material);
    record.objects.push(mesh);
    return mesh;
  };

  group.add(ribbonMesh(1.035, FEATURED_EDGE_COLOR, 0.4, 3, null, 'edge'));
  group.add(ribbonMesh(1.0, FEATURED_COLOR, 2, 4, [0.86, 1.0, 1.0, 0.86], 'main'));
  // Saturated hairline along the centerline: keeps the course unambiguous at
  // overview zoom, where the wide but low-contrast band nearly vanishes.
  const lineGeo = new THREE.BufferGeometry().setFromPoints(
    pts.map(([e, n]) => new THREE.Vector3(e, sampleSurface(t, e, n) - t.elevationMin + 2.6, -n)),
  );
  const lineMat = new THREE.LineBasicMaterial({
    color: FEATURED_COLOR,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const centerline = new THREE.Line(lineGeo, lineMat);
  centerline.renderOrder = 5;
  centerline.userData.featureId = record.id;
  centerline.userData.ribbonRole = 'line';
  record.materials.push(lineMat);
  record.objects.push(centerline);
  group.add(centerline);
  group.visible = true;

  return { group, entry: record, pickables };
}

// During the descent ride the featured ribbon melts into the slope: the amber
// veil fades to translucent (opacity does the blending, so the result reads as
// a sun-warmed groomed track over the snow) and the near-black course rim
// lightens, so snow and terrain shading carry the "skiing" look.
// fade 0 = data-overlay look, 1 = full descent look. Cheap: two meshes.
const DESCENT_MAIN_TINT: [number, number, number] = [1, 1, 1];
const DESCENT_EDGE_TINT = new THREE.Color(0x9aa4ae);

export function setFeaturedDescentFade(group: THREE.Group, fade: number): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const role = mesh.userData?.ribbonRole as 'main' | 'edge' | 'line' | undefined;
    const mat = mesh.material as THREE.MeshBasicMaterial | undefined;
    if (!role || !mat || !(mat instanceof THREE.MeshBasicMaterial)) return;
    if (role === 'edge') {
      mat.color.copy(new THREE.Color(FEATURED_EDGE_COLOR)).lerp(DESCENT_EDGE_TINT, fade);
      return;
    }
    if (role === 'line') {
      const transparent = fade > 0.001;
      if (mat.transparent !== transparent) {
        mat.transparent = transparent;
        mat.needsUpdate = true;
      }
      mat.opacity = 1 - 0.55 * fade;
      return;
    }
    const base = mesh.userData?.ribbonVertexBase as Float32Array | undefined;
    const attr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!base || !attr || !(attr instanceof THREE.BufferAttribute)) return;
    const values = attr.array as Float32Array;    for (let i = 0; i < values.length; i++) {
      values[i] = base[i] + (DESCENT_MAIN_TINT[i % 3] - base[i]) * fade;
    }
    attr.needsUpdate = true;
    const transparent = fade > 0.001;
    if (mat.transparent !== transparent) {
      mat.transparent = transparent;
      mat.needsUpdate = true;
    }
    mat.opacity = 1 - 0.62 * fade;
  });
}

function lineFor(
  t: TerrainAsset,
  points: number[][],
  color: number,
  offset: number,
  opacity: number,
): THREE.Line {
  const positions = new Float32Array(points.length * 3);
  for (let k = 0; k < points.length; k++) {
    const [e, n] = points[k];
    positions[k * 3] = e;
    positions[k * 3 + 1] = sampleTerrain(t, e, n) - t.elevationMin + offset;
    positions[k * 3 + 2] = -n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geo, mat);
}

export function buildContextFeatures(
  t: TerrainAsset,
  pistes: FeatureAsset,
  lifts: FeatureAsset,
): { group: THREE.Group; entries: FeatureRecord[]; layers: Set<string>; pickables: THREE.Object3D[] } {
  const group = new THREE.Group();
  const entries: FeatureRecord[] = [];
  const layers = new Set<string>();
  const pickables: THREE.Object3D[] = [];

  for (const f of pistes.features) {
    const layer = f.difficulty || 'unclassified';
    const baseColor = (f.difficulty && PISTE_COLORS[f.difficulty]) || PISTE_UNCLASSIFIED;
    // Piste = draped surface (band), not a hairline: it stays legible at
    // overview zoom and reads as a real piste corridor on the snow.
    const band = f.points.length > 1
      ? drapedBand(t, f.points, {
          color: baseColor,
          halfWidth: PISTE_BAND_HALF_WIDTH,
          lift: PISTE_BAND_LIFT,
          cols: 4,
          shade: PISTE_BAND_SHADE,
          renderOrder: 1,
          transparent: true,
          opacity: PISTE_BAND_OPACITY,
          depthWrite: false,
          borderFade: true,
        })
      : null;
    if (band) band.userData.featureId = f.id;
    const stats = polylineStats(t, f.points);
    const record: FeatureRecord = {
      id: f.id,
      kind: 'piste',
      name: f.name,
      difficulty: f.difficulty ?? null,
      layer,
      ...stats,
      osmWayId: Number(f.id.replace(/^way-/, '')),
      materials: band ? [band.material as THREE.Material] : [],
      objects: band ? [band] : [],
    };
    if (band) {
      band.userData.record = record;
      pickables.push(band);
      group.add(band);
    }
    entries.push(record);
    layers.add(layer);
  }

  for (const f of lifts.features) {
    const line = lineFor(t, f.points, LIFT_COLOR, 6, 0.75);
    line.userData.featureId = f.id;
    const stats = polylineStats(t, f.points);
    const record: FeatureRecord = {
      id: f.id,
      kind: 'lift',
      name: f.name,
      difficulty: null,
      liftType: f.type,
      layer: 'lift',
      ...stats,
      osmWayId: Number(f.id.replace(/^way-/, '')),
      materials: [line.material as THREE.Material],
      objects: [line],
    };
    line.userData.record = record;
    entries.push(record);
    layers.add('lift');
    pickables.push(line);
    group.add(line);
  }

  group.visible = true;
  return { group, entries, layers, pickables };
}

export function applyHighlight(entries: FeatureRecord[], selectedId: string | null, hoveredId: string | null) {
  for (const entry of entries) {
    if (entry.kind === 'featured') continue;
    const isSel = selectedId === entry.id;
    const isHover = hoveredId === entry.id;
    const dim = selectedId !== null && !isSel;
    for (const mat of entry.materials) {
      // Piste bands are meshes, lift lines are THREE.Line; both carry a
      // color + opacity pair, so the tint logic is shared.
      const tinted = mat as THREE.LineBasicMaterial | THREE.MeshBasicMaterial;
      if (isSel || isHover) tinted.color.setHex(isSel ? 0xffd23f : 0xffe28a);
      else if (entry.kind === 'lift') tinted.color.setHex(LIFT_COLOR);
      else tinted.color.setHex((entry.difficulty && PISTE_COLORS[entry.difficulty]) || PISTE_UNCLASSIFIED);
      tinted.opacity = dim && !isHover && !isSel
        ? (entry.kind === 'lift' ? 0.18 : 0.12)
        : entry.kind === 'lift'
          ? 0.75
          : PISTE_BAND_OPACITY;
      if (isSel || isHover) tinted.opacity = 1;
    }
  }
}
