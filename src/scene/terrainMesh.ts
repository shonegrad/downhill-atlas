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

// Fade of the terrain at a plan position, 1 inside the mesh, 0 at the border.
// Overlays (piste bands) reuse it so they dissolve with the snow instead of
// floating past the edge of the world.
export function borderFadeAt(t: TerrainAsset, east: number, north: number): number {
  const fade = fadeCells(t);
  const col = (east + t.eastMeters / 2) / t.spacing;
  const row = (north + t.northMeters / 2) / t.spacing;
  const edgeDist = Math.min(row, t.ny - 1 - row, col, t.nx - 1 - col);
  return smoothstep(0, fade, edgeDist);
}

function fadeCells(t: TerrainAsset): number {
  return Math.max(2, Math.round(Math.min(t.nx, t.ny) * FADE_FRACTION));
}

function borderFadeRamp(t: TerrainAsset): Float32Array {
  const nx = t.nx;
  const ny = t.ny;
  const ramp = new Float32Array(nx * ny);
  const fade = fadeCells(t);
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

  // UVs drive the procedural snow bump texture (deterministic value noise);
  // features land at ~10-40 m so the low ride camera sees speed near the snow.
  const uvs = new Float32Array(count * 2);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      uvs[k * 2] = i / (nx - 1);
      uvs[k * 2 + 1] = 1 - j / (ny - 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    transparent: true,
    bumpMap: makeSnowBumpTexture(t.eastMeters, t.northMeters),
    bumpScale: 2.2,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

// Deterministic tileable value-noise bump texture (4 octaves). Wrapping keeps
// the repeat seamless; the repeat count maps one texture tile to ~120 m of
// terrain so noise cells read at roughly 15 m / 7 m / 4 m / 2 m.
const SNOW_TILE_METERS = 120;
function makeSnowBumpTexture(eastMeters: number, northMeters: number): THREE.Texture {
  const size = 128;
  const heights4 = new Float32Array(size * size);
  const octaves = [
    { lattice: 4, amp: 0.42 },
    { lattice: 8, amp: 0.28 },
    { lattice: 16, amp: 0.2 },
    { lattice: 32, amp: 0.1 },
  ];
  let seed = 0x9e3779b9;
  const rng = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 1024) / 1024;
  };
  for (const { lattice, amp } of octaves) {
    const grid = new Float32Array(lattice * lattice);
    let idx = 0;
    for (let j = 0; j < lattice; j++) {
      for (let i = 0; i < lattice; i++) {
        grid[idx++] = rng();
      }
    }
    const cell = size / lattice;
    const wrap = (v: number, hi: number) => ((v % hi) + hi) % hi;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = x / cell;
        const gy = y / cell;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const tx = gx - x0;
        const ty = gy - y0;
        const s = tx * tx * (3 - 2 * tx);
        const u = ty * ty * (3 - 2 * ty);
        const v00 = grid[wrap(y0, lattice) * lattice + wrap(x0, lattice)];
        const v10 = grid[wrap(y0, lattice) * lattice + wrap(x0 + 1, lattice)];
        const v01 = grid[wrap(y0 + 1, lattice) * lattice + wrap(x0, lattice)];
        const v11 = grid[wrap(y0 + 1, lattice) * lattice + wrap(x0 + 1, lattice)];
        const val =
          (v00 * (1 - s) + v10 * s) * (1 - u) + (v01 * (1 - s) + v11 * s) * u;
        heights4[y * size + x] += (val - 0.5) * amp;
      }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, Math.round(128 + heights4[i] * 255)));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.round(eastMeters / SNOW_TILE_METERS), Math.round(northMeters / SNOW_TILE_METERS));
  return tex;
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
