import * as THREE from 'three';
import type { RouteAsset, FeatureAsset, TerrainAsset } from '../data/loader';
import { sampleTerrain } from './coordinates';

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
  // Real-piste scale: groomed runs are ~24-30 m across. AOI-relative cap keeps
  // the band sane on any future AOI size.
  const diag = Math.hypot(t.eastMeters, t.northMeters);
  const halfWidth = Math.min(9.5, Math.max(6, diag * 0.003));

  // Plate direction (perpendicular in plan) per station.
  const dirSide: { sx: number; sy: number }[] = [];
  for (let k = 0; k < pts.length; k++) {
    const prev = pts[Math.max(k - 1, 0)];
    const next = pts[Math.min(k + 1, pts.length - 1)];
    const dx = next[0] - prev[0];
    const dn = next[1] - prev[1];
    const len = Math.hypot(dx, dn) || 1;
    dirSide.push({ sx: -dn / len, sy: dx / len });
  }

  // Columns across the band; each vertex is clamped to the terrain at its own
  // plan position so the surface follows roll across the slope instead of
  // floating above it or clipping into it.
  function surfaceY(east: number, north: number, lift: number): number {
    return sampleTerrain(t, east, north) - t.elevationMin + lift;
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
    shade: number[] | null = null,
    role: 'main' | 'edge' = 'main',
  ) => {
    const cols = 4;
    const positions = new Float32Array(pts.length * cols * 3);
    const colors = new Float32Array(pts.length * cols * 3);
    const baseColor = new THREE.Color(color);
    for (let k = 0; k < pts.length; k++) {
      const [e, n] = pts[k];
      const { sx, sy } = dirSide[k];
      const hw = halfWidth * widthScale;
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const f = (cIdx / (cols - 1)) * 2 - 1;
        const off = f * hw;
        const px = e + sx * off;
        const py = n + sy * off;
        const i3 = (k * cols + cIdx) * 3;
        positions[i3] = px;
        positions[i3 + 1] = surfaceY(px, py, lift);
        positions[i3 + 2] = -py;
        const s = shade ? shade[cIdx] : 1;
        colors[i3] = baseColor.r * s;
        colors[i3 + 1] = baseColor.g * s;
        colors[i3 + 2] = baseColor.b * s;
      }
    }
    const indices: number[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      for (let cIdx = 0; cIdx < cols - 1; cIdx++) {
        const a = k * cols + cIdx;
        const b = a + 1;
        const c2 = (k + 1) * cols + cIdx;
        const d = c2 + 1;
        indices.push(a, c2, b, b, c2, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (shade) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color,
      vertexColors: Boolean(shade),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    mat.depthWrite = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = renderOrder;
    mesh.userData.featureId = record.id;
    mesh.userData.ribbonRole = role;
    if (role === 'main') mesh.userData.ribbonVertexBase = colors.slice();
    pickables.push(mesh);
    record.materials.push(mat);
    record.objects.push(mesh);
    return mesh;
  };

  group.add(ribbonMesh(1.035, FEATURED_EDGE_COLOR, 0.4, 3, null, 'edge'));
  group.add(ribbonMesh(1.0, FEATURED_COLOR, 2, 4, [0.86, 1.0, 1.0, 0.86], 'main'));
  // Saturated hairline along the centerline: keeps the course unambiguous at
  // overview zoom, where the wide but low-contrast band nearly vanishes.
  const lineGeo = new THREE.BufferGeometry().setFromPoints(
    pts.map(([e, n]) => new THREE.Vector3(e, surfaceY(e, n, 2.6), -n)),
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
  group.add(speedGates(t, pts, dirSide, halfWidth, record));
  group.visible = true;

  return { group, entry: record, pickables };
}

// During the descent ride the featured ribbon melts into the slope: the amber
// veil fades to translucent (opacity does the blending, so the result reads as
// a sun-warmed groomed track over the snow) and the near-black course rim
// lightens, so snow, gates and terrain shading carry the "skiing" look.
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

// Slalom-style pole+panel pairs alternating down the course. They are scenery
// (not pickable data), giving speed cues and a race-course feel during the
// descent ride. Panels alternate blue/red like real slalom gates; the pole is
// dark so the color signal lives in the small panel only.
const GATE_SPACING_M = 90;
const GATE_POLE_M = 3.8;
// Gates are planted on the ribbon surface (same +2 m lift as the main band),
// otherwise pole/panel bases sink under the groomed veil during the descent.
const GATE_BAND_LIFT = 2;

function speedGates(
  t: TerrainAsset,
  pts: number[][],
  dirSide: { sx: number; sy: number }[],
  halfWidth: number,
  record: FeatureRecord,
): THREE.Group {
  const gates = new THREE.Group();
  gates.name = 'speed-gates';
  const spacing = t.spacing || 10;
  let cumulative = 0;
  const stations: { e: number; n: number; k: number }[] = [];
  let nextGateAt = GATE_SPACING_M;
  for (let k = 1; k < pts.length; k++) {
    const intoSeg = pts[k][0] - pts[k - 1][0];
    const intoSegN = pts[k][1] - pts[k - 1][1];
    const seg = Math.hypot(intoSeg, intoSegN) * spacing;
    while (cumulative + seg >= nextGateAt) {
      const f = (nextGateAt - cumulative) / (seg || 1);
      stations.push({
        e: pts[k - 1][0] + intoSeg * f,
        n: pts[k - 1][1] + intoSegN * f,
        k,
      });
      nextGateAt += GATE_SPACING_M;
    }
    cumulative += seg;
  }
  if (stations.length === 0) return gates;

  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, GATE_POLE_M, 6);
  poleGeo.translate(0, GATE_POLE_M / 2, 0);
  const flagGeo = new THREE.PlaneGeometry(2.2, 1.5, 1, 1);
  flagGeo.translate(0, 0, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.6 });
  const flagMat = new THREE.MeshStandardMaterial({
    vertexColors: false,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  record.materials.push(poleMat, flagMat);

  const offset = halfWidth * 0.92;
  const mats: THREE.Matrix4[] = [];
  const posV = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  stations.forEach((st, gi) => {
    const dir = dirSide[st.k] ?? dirSide[dirSide.length - 1];
    const side = gi % 2 === 0 ? 1 : -1;
    const px = st.e + dir.sx * offset * side;
    const py = st.n + dir.sy * offset * side;
    const ground = sampleTerrain(t, px, py) - t.elevationMin - 0.2 + GATE_BAND_LIFT;
    posV.set(px, ground, -py);
    // panel faces oncoming racers: plane normal along the course direction
    const de = pts[Math.min(st.k + 1, pts.length - 1)][0] - pts[Math.max(st.k - 1, 0)][0];
    const dn = pts[Math.min(st.k + 1, pts.length - 1)][1] - pts[Math.max(st.k - 1, 0)][1];
    euler.set(0, Math.atan2(de, -dn), 0);
    quat.setFromEuler(euler);
    const poleM = new THREE.Matrix4().compose(posV.clone(), quat.clone(), one);
    const flagPos = posV.clone().add(new THREE.Vector3(0, GATE_POLE_M - 1.15, 0));
    const flagM = new THREE.Matrix4().compose(flagPos, quat.clone(), one);
    mats.push(poleM, flagM);
  });

  const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, stations.length);
  const flagMesh = new THREE.InstancedMesh(flagGeo, flagMat, stations.length);
  flagMesh.frustumCulled = false;
  poleMesh.frustumCulled = false;
  const gColor = new THREE.Color();
  stations.forEach((_, gi) => {
    // first panel pair: blue (right turn), then red — real slalom convention
    gColor.setHex(gi % 2 === 0 ? 0x1560c9 : 0xb3392e);
    flagMesh.setColorAt(gi, gColor);
  });
  for (let gi = 0; gi < stations.length; gi++) {
    poleMesh.setMatrixAt(gi, mats[gi * 2]);
    flagMesh.setMatrixAt(gi, mats[gi * 2 + 1]);
  }
  poleMesh.instanceMatrix.needsUpdate = true;
  flagMesh.instanceMatrix.needsUpdate = true;
  if (flagMesh.instanceColor) flagMesh.instanceColor.needsUpdate = true;
  gates.add(poleMesh);
  gates.add(flagMesh);
  return gates;
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
