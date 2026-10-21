import * as THREE from 'three';
import type { TerrainAsset } from '../data/loader';

// Terrain renders in grayscale (plan/relief style); data colors (pistes, lifts,
// featured course) stay saturated on top so difficulty classes read clearly.
// Luminance conversion keeps tonal structure for slope shading.
const PALETTE = [
  { stop: 0.0, color: new THREE.Color('#4f4f4f') },
  { stop: 0.3, color: new THREE.Color('#6b6b6b') },
  { stop: 0.5, color: new THREE.Color('#8c8c8c') },
  { stop: 0.68, color: new THREE.Color('#a6a6a6') },
  { stop: 0.82, color: new THREE.Color('#d2d2d2') },
  { stop: 1.0, color: new THREE.Color('#f3f3f3') },
];

const ROCK = new THREE.Color('#767676');
const SNOW = new THREE.Color('#f3f3f3');

// Border feather: fraction of the smaller grid dimension over which the mesh
// alpha-fades to nothing, so the terrain dissolves into sky haze instead of
// ending on a hard edge.
const FADE_FRACTION = 0.16;

function borderFadeRamp(t: TerrainAsset): Float32Array {
  const nx = t.nx;
  const ny = t.ny;
  const ramp = new Float32Array(nx * ny);
  const fade = Math.max(2, Math.round(Math.min(nx, ny) * FADE_FRACTION));
  for (let j = 0; j < ny; j++) {
    const edgeDist = Math.min(j, ny - 1 - j);
    for (let i = 0; i < nx; i++) {
      const dist = Math.min(edgeDist, i, nx - 1 - i);
      ramp[j * nx + i] = smoothstep(0, fade, dist);
    }
  }
  return ramp;
}

export function buildTerrain(t: TerrainAsset): THREE.Mesh {
  const nx = t.nx;
  const ny = t.ny;
  const spacing = t.spacing;
  const count = nx * ny;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const fade = borderFadeRamp(t);
  const c = new THREE.Color();

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = i * spacing - t.eastMeters / 2;
      const north = j * spacing - t.northMeters / 2;
      const z = -north;
      const h = t.heights[k] ?? 0;
      const y = h - t.elevationMin;
      positions[k * 3] = x;
      positions[k * 3 + 1] = y;
      positions[k * 3 + 2] = z;

      const f = (h - t.elevationMin) / (t.elevationMax - t.elevationMin || 1);
      paletteLerp(c, f);
      const k4 = k * 4;
      colors[k4] = c.r;
      colors[k4 + 1] = c.g;
      colors[k4 + 2] = c.b;
      colors[k4 + 3] = fade[k];
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = j * nx + i + 1;
      const cN = (j + 1) * nx + i;
      const d = (j + 1) * nx + i + 1;
      indices.push(a, b, d, a, d, cN);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    transparent: true,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function paletteLerp(out: THREE.Color, f: number) {
  for (let s = 0; s < PALETTE.length - 1; s++) {
    const a = PALETTE[s];
    const b = PALETTE[s + 1];
    if (f <= b.stop) {
      const t = (f - a.stop) / (b.stop - a.stop || 1);
      out.copy(a.color).lerp(b.color, t);
      return;
    }
  }
  out.copy(PALETTE[PALETTE.length - 1].color);
}

export function repaintByNormals(t: TerrainAsset, mesh: THREE.Mesh): void {
  const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const normAttr = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
  const colAttr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
  const tmp = new THREE.Color();
  for (let k = 0; k < posAttr.count; k++) {
    const ny = normAttr.getY(k);
    const slope = 1 - ny;
    const savedR = colAttr.getX(k);
    const savedG = colAttr.getY(k);
    const savedB = colAttr.getZ(k);
    tmp.setRGB(savedR, savedG, savedB);
    const rockMix = smoothstep(0.18, 0.5, slope);
    if (rockMix > 0) tmp.lerp(ROCK, rockMix * 0.85);
    const h = posAttr.getY(k) + t.elevationMin;
    const snowMix = smoothstep(1520, 1620, h);
    if (snowMix > 0) tmp.lerp(SNOW, snowMix * 0.9);
    colAttr.setXYZW(k, tmp.r, tmp.g, tmp.b, colAttr.getW(k));
  }
  colAttr.needsUpdate = true;
}

function smoothstep(a: number, b: number, v: number) {
  const t = Math.min(Math.max((v - a) / (b - a || 1), 0), 1);
  return t * t * (3 - 2 * t);
}
