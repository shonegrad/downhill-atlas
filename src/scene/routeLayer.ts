import * as THREE from 'three';
import type { RouteAsset, FeatureAsset, TerrainAsset } from '../data/loader';
import { sampleTerrain } from './coordinates';

const ROUTE_OFFSET_M = 1;

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

const FEATURED_COLOR = 0xe63b2f;
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

export function buildFeaturedCourse(t: TerrainAsset, route: RouteAsset): { group: THREE.Group; entry: FeatureRecord; pickables: THREE.Object3D[] } {
  const group = new THREE.Group();
  const pts = route.points;
  // Thinner profile so the ribbon reads as a course line rather than a road
  // at descent-camera range (was 2.5).
  const halfWidth = 1.9;

  const center: THREE.Vector3[] = [];
  const side: THREE.Vector3[] = [];
  for (let k = 0; k < pts.length; k++) {
    const [e, n] = pts[k];
    const prev = pts[Math.max(k - 1, 0)];
    const next = pts[Math.min(k + 1, pts.length - 1)];
    const dx = next[0] - prev[0];
    const dn = next[1] - prev[1];
    const len = Math.hypot(dx, dn) || 1;
    const sx = (-dn / len) * halfWidth;
    const sy = (dx / len) * halfWidth;
    center.push(new THREE.Vector3(e, sampleTerrain(t, e, n) - t.elevationMin + ROUTE_OFFSET_M, -n));
    side.push(new THREE.Vector3(sx, 0, -sy));
  }

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
  ) => {
    const positions = new Float32Array(pts.length * 6);
    for (let k = 0; k < pts.length; k++) {
      const c = center[k];
      const s = side[k].clone().multiplyScalar(widthScale);
      positions[k * 6] = c.x - s.x;
      positions[k * 6 + 1] = c.y + lift;
      positions[k * 6 + 2] = c.z - s.z;
      positions[k * 6 + 3] = c.x + s.x;
      positions[k * 6 + 4] = c.y + lift;
      positions[k * 6 + 5] = c.z + s.z;
    }
    const indices: number[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = k * 2;
      const b = k * 2 + 1;
      const c2 = k * 2 + 2;
      const d = k * 2 + 3;
      indices.push(a, c2, b, b, c2, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    mat.depthWrite = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = renderOrder;
    mesh.userData.featureId = record.id;
    pickables.push(mesh);
    record.materials.push(mat);
    record.objects.push(mesh);
    return mesh;
  };

  group.add(ribbonMesh(1.25, FEATURED_EDGE_COLOR, -0.35, 3));
  group.add(ribbonMesh(1.0, FEATURED_COLOR, 0.68, 4));
  group.visible = true;

  return { group, entry: record, pickables };
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
    const line = lineFor(t, f.points, baseColor, 0.7, 0.55);
    line.userData.featureId = f.id;
    const stats = polylineStats(t, f.points);
    const record: FeatureRecord = {
      id: f.id,
      kind: 'piste',
      name: f.name,
      difficulty: f.difficulty ?? null,
      layer,
      ...stats,
      osmWayId: Number(f.id.replace(/^way-/, '')),
      materials: [line.material as THREE.Material],
      objects: [line],
    };
    line.userData.record = record;
    entries.push(record);
    layers.add(layer);
    pickables.push(line);
    group.add(line);
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
      const lm = mat as THREE.LineBasicMaterial;
      if (isSel || isHover) lm.color.setHex(isSel ? 0xffd23f : 0xffe28a);
      else if (entry.kind === 'lift') lm.color.setHex(LIFT_COLOR);
      else lm.color.setHex((entry.difficulty && PISTE_COLORS[entry.difficulty]) || PISTE_UNCLASSIFIED);
      lm.opacity = dim && !isHover && !isSel ? (entry.kind === 'lift' ? 0.18 : 0.12) : entry.kind === 'lift' ? 0.75 : 0.55;
      if (isSel || isHover) lm.opacity = 1;
    }
  }
}
