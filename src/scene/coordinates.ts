import type { TerrainAsset } from '../data/loader';

export const SKY_COLOR = 0xdce8f2;

export interface Frame {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  baseY: number;
  scale: number;
}

export interface ScenePoint {
  x: number;
  y: number;
  z: number;
}

export function toSceneXZ(t: TerrainAsset, east: number, north: number, frame: Frame): ScenePoint {
  const h = sampleTerrain(t, east, north);
  return {
    x: east,
    y: (h - frame.baseY) * frame.scale,
    z: -north,
  };
}

export function makeFrame(t: TerrainAsset): Frame {
  return {
    minX: -t.eastMeters / 2,
    maxX: t.eastMeters / 2,
    minZ: -t.northMeters / 2,
    maxZ: t.northMeters / 2,
    baseY: t.elevationMin,
    scale: t.verticalScale,
  };
}

export function sampleTerrain(t: TerrainAsset, east: number, north: number): number {
  const col = (east + t.eastMeters / 2) / t.spacing;
  const row = (north + t.northMeters / 2) / t.spacing;
  const cx = Math.min(Math.max(col, 0), t.nx - 1);
  const cy = Math.min(Math.max(row, 0), t.ny - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, t.nx - 1);
  const y1 = Math.min(y0 + 1, t.ny - 1);
  const tx = cx - x0;
  const ty = cy - y0;
  const at = (r: number, c: number) => t.heights[r * t.nx + c] ?? 0;
  return (
    (at(y0, x0) * (1 - tx) + at(y0, x1) * tx) * (1 - ty) +
    (at(y1, x0) * (1 - tx) + at(y1, x1) * tx) * ty
  );
}
