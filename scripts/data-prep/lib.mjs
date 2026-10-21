// Shared helpers for Downhill Atlas data preparation.
// Conventions (mirrored by the runtime loader in src/data/):
// - Local metric frame: east/north in meters from a fixed origin, on a sphere of radius R.
// - north is positive north. The 3D scene maps north -> -z (scene z axis points south).
// - Scene height: (elevationDem - minHeightDem) * verticalScale meters.
// Everything is parameterized by a location config from config.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

export const R_EARTH = 6371000;
export const RAW_DIR = 'scripts/data-prep/raw';
export const OUT_BASE = 'public/data';

export function outDirOf(loc) {
  return path.join(OUT_BASE, loc.dir);
}

export function rawFeaturesFile(loc) {
  return `${loc.rawPrefix}.json`;
}

export function rawLandmarksFile(loc) {
  return `${loc.rawPrefix}-landmarks.json`;
}

export function aoiCenter(aoi) {
  return {
    lat: (aoi.latSouth + aoi.latNorth) / 2,
    lon: (aoi.lonWest + aoi.lonEast) / 2,
  };
}

export function metersPerDegree(lat) {
  const rad = (lat * Math.PI) / 180;
  return {
    north: (R_EARTH * Math.PI) / 180,
    east: ((R_EARTH * Math.PI) / 180) * Math.cos(rad),
  };
}

export function localOrigin(aoi) {
  return aoiCenter(aoi);
}

export function toLocalMeters(aoi, lat, lon) {
  const origin = localOrigin(aoi);
  const m = metersPerDegree(origin.lat);
  const east = (lon - origin.lon) * m.east;
  const north = (lat - origin.lat) * m.north;
  return { east, north };
}

export function inAoi(aoi, lat, lon) {
  return lon >= aoi.lonWest && lon <= aoi.lonEast && lat >= aoi.latSouth && lat <= aoi.latNorth;
}

// --- Overpass --------------------------------------------------------------

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_USER_AGENT = 'DownhillAtlasPrototype/0.1 (local prototype data prep)';

export async function overpass(query, cacheFile, { force = false } = {}) {
  const abs = path.resolve(RAW_DIR, cacheFile);
  if (!force && fs.existsSync(abs)) {
    console.log(`[overpass] cached: ${cacheFile}`);
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  }
  console.log(`[overpass] fetching: ${cacheFile}`);
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'User-Agent': OVERPASS_USER_AGENT,
    },
    body: query,
  });
  if (!res.ok) throw new Error(`Overpass error ${res.status} for ${cacheFile}`);
  const json = await res.json();
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(json));
  console.log(`[overpass] saved ${cacheFile} (${(json.elements?.length ?? 0).toLocaleString()} elements)`);
  return json;
}

// --- Orient + join a polyline chain ------------------------------------------

const JOINT_TOLERANCE_M = 30;

function dist(a, b, latRef) {
  const m = metersPerDegree(latRef);
  return Math.hypot((a.lon - b.lon) * m.east, (a.lat - b.lat) * m.north);
}

// Greedy tolerant chain: append the segment whose endpoint lies within
// tolerance of the current head; allow slight orientation flipping.
export function orientAndJoin(segments, latRef) {
  const n = segments.length;
  if (n === 0) return { chain: [], gaps: [] };

  function buildFrom(startIdx, unused) {
    unused.delete(startIdx);
    const first = segments.map((s) => s.pts);
    const g = first[startIdx].slice();
    let head = g[g.length - 1];
    const gaps = [];
    while (true) {
      let best = -1;
      let bestDir = 'f';
      let bestD = Infinity;
      for (const k of unused) {
        const f = first[k][0];
        const l = first[k][first[k].length - 1];
        const dF = dist(head, f, latRef);
        const dL = dist(head, l, latRef);
        if (Math.min(dF, dL) < bestD) {
          bestD = Math.min(dF, dL);
          best = k;
          bestDir = dF <= dL ? 'f' : 'l';
        }
      }
      if (best < 0 || bestD > JOINT_TOLERANCE_M) break;
      unused.delete(best);
      // 'f': segment start touches head (keep orientation); 'l' means reverse.
      const pts = segments[best].pts.slice();
      if (bestDir === 'l') pts.reverse();
      gaps.push(Math.round(dist(head, pts[0], latRef)));
      for (const p of pts) {
        const prev = g[g.length - 1];
        if (p.lat !== prev.lat || p.lon !== prev.lon) g.push(p);
      }
      head = pts[pts.length - 1];
    }
    return { g, gaps };
  }

  let best = null;
  for (let s = 0; s < n; s++) {
    const res = buildFrom(s, new Set(segments.map((_, i) => i)));
    if (!best || variantScore(res) > variantScore(best)) best = res;
  }
  return { chain: best ? best.g : [], gaps: best ? best.gaps : [] };
}

// Prefer longer open lines over shorter closed loops: score by planar length,
// breaking ties toward variants that do not end near their own start.
function variantScore(res) {
  const m0 = metersPerDegree((res.g[0].lat + res.g[res.g.length - 1].lat) / 2);
  let length = 0;
  for (let i = 1; i < res.g.length; i++) {
    length += Math.hypot(
      (res.g[i].lat - res.g[i - 1].lat) * m0.north,
      (res.g[i].lon - res.g[i - 1].lon) * m0.east,
    );
  }
  const closure = Math.hypot(
    (res.g[0].lat - res.g[res.g.length - 1].lat) * m0.north,
    (res.g[0].lon - res.g[res.g.length - 1].lon) * m0.east,
  );
  // +1 m score per 250 m of closure keeps open lines preferred at near-equal length
  return length + Math.min(closure, 5000) / 250;
}

// --- Featured route assembly --------------------------------------------------

export function assembleFeatured(loc, raw, landmarksRaw) {
  const ways = new Map(raw.elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));
  const latRef = aoiCenter(loc.aoi).lat;
  let segments = [];
  let memberMeta = [];
  let nodeLandmarks = [];

  if (loc.featuredMode === 'relation') {
    const relation = raw.elements.find(
      (e) => e.type === 'relation' && e.id === loc.routeRelationId,
    );
    if (!relation) throw new Error(`relation ${loc.routeRelationId} not in extract for ${loc.id}`);
    for (const member of relation.members) {
      const way = ways.get(member.ref);
      if (!way) continue;
      segments.push({ pts: way.geometry.map((p) => ({ lat: p.lat, lon: p.lon })), osmWayId: way.id });
    }
    if (landmarksRaw) {
      const nodes = new Map(landmarksRaw.elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
      for (const member of relation.members) {
        if (member.type !== 'node') continue;
        const node = nodes.get(member.ref);
        if (!node || !node.tags?.name) continue;
        nodeLandmarks.push({
          id: `osm-node-${node.id}`,
          name: node.tags.name,
          lat: node.lat,
          lon: node.lon,
          source: 'osm place=locality node (course section name)',
        });
      }
    }
    memberMeta = relation.members.map((m) => m.ref);
  } else {
    // namedWays mode
    for (const w of ways.values()) {
      if (w.tags && w.tags.name === loc.featuredName)
        segments.push({ pts: w.geometry.map((p) => ({ lat: p.lat, lon: p.lon })), osmWayId: w.id });
    }
  }

  const segCount = segments.length;
  const joined = orientAndJoin(segments, latRef);
  return { chain: joined.chain, gaps: joined.gaps, segCount, nodeLandmarks, memberMeta };
}

// --- Terrain tiles (terrarium PNG, slippy) ----------------------------------

export const TERRARIUM_ZOOM = 12;

export function tileIndicesForBbox(zoom, { latSouth, latNorth, lonWest, lonEast }) {
  const n = 2 ** zoom;
  const lon2tile = (lon) => Math.floor(((lon + 180) / 360) * n);
  const lat2tile = (lat) => {
    const rad = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n);
  };
  const xs = [];
  for (let x = lon2tile(lonWest); x <= lon2tile(lonEast); x++) xs.push(x);
  const ys = [];
  for (let y = lat2tile(latNorth); y <= lat2tile(latSouth); y++) ys.push(y);
  return { xs, ys };
}

const PNG_TILE_SIZE = 256;

function decodeTerrarium(png) {
  const out = new Float32Array(PNG_TILE_SIZE * PNG_TILE_SIZE);
  for (let i = 0; i < out.length; i++) {
    const r = png.data[i * 4];
    const g = png.data[i * 4 + 1];
    const b = png.data[i * 4 + 2];
    out[i] = r * 256 + g + b / 256 - 32768;
  }
  return out;
}

export async function fetchTerrariumSlab(zoom, aoi, cacheDir = `${RAW_DIR}/tiles`) {
  const { xs, ys } = tileIndicesForBbox(zoom, aoi);
  fs.mkdirSync(cacheDir, { recursive: true });

  const n = 2 ** zoom;
  const lonOf = (ti) => (ti / n) * 360 - 180;
  const tileYToNorth = (ty) => {
    const mercY = ty / n;
    const rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * mercY)));
    return (rad * 180) / Math.PI;
  };
  const mercRowPerLat = (lat) => {
    const rad = (lat * Math.PI) / 180;
    return ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n;
  };

  const tiles = new Map();
  for (const x of xs) {
    for (const y of ys) {
      const file = path.join(cacheDir, `terrarium-${zoom}-${x}-${y}.png`);
      let png;
      if (fs.existsSync(file)) {
        png = PNG.sync.read(fs.readFileSync(file));
      } else {
        const url = `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${zoom}/${x}/${y}.png`;
        console.log(`[terrain] fetch tile ${zoom}/${x}/${y}`);
        const res = await fetch(url, { headers: { 'User-Agent': OVERPASS_USER_AGENT } });
        if (!res.ok) throw new Error(`tile fetch failed ${res.status} for ${url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(file, buf);
        png = PNG.sync.read(buf);
      }
      tiles.set(`${x},${y}`, decodeTerrarium(png));
    }
  }

  const slabW = PNG_TILE_SIZE * xs.length;
  const slabH = PNG_TILE_SIZE * ys.length;
  const slab = new Float32Array(slabW * slabH);
  ys.forEach((y, iy) => {
    xs.forEach((x, ix) => {
      const src = tiles.get(`${x},${y}`);
      for (let r = 0; r < PNG_TILE_SIZE; r++) {
        for (let c = 0; c < PNG_TILE_SIZE; c++) {
          slab[(iy * PNG_TILE_SIZE + r) * slabW + ix * PNG_TILE_SIZE + c] =
            src[r * PNG_TILE_SIZE + c];
        }
      }
    });
  });

  return {
    slab,
    slabW,
    slabH,
    slabLonWest: lonOf(xs[0]),
    slabLonEast: lonOf(xs[xs.length - 1] + 1),
    slabLatSouth: tileYToNorth(ys[ys.length - 1] + 1),
    slabLatNorth: tileYToNorth(ys[0]),
    mercRowPerLat,
  };
}

export function slabSampleLonLat(slabInfo, lat, lon) {
  const { slab, slabW, slabH, slabLonWest, slabLonEast, slabLatSouth, slabLatNorth, mercRowPerLat } =
    slabInfo;
  const fx = ((lon - slabLonWest) / (slabLonEast - slabLonWest)) * slabW - 0.5;
  const fy = ((mercRowPerLat(lat) - mercRowPerLat(slabLatNorth)) /
    (mercRowPerLat(slabLatSouth) - mercRowPerLat(slabLatNorth))) * slabH - 0.5;
  const clamp = (v, hi) => Math.min(Math.max(v, 0), hi);
  const x0 = Math.floor(clamp(fx, slabW - 1));
  const y0 = Math.floor(clamp(fy, slabH - 1));
  const x1 = Math.min(x0 + 1, slabW - 1);
  const y1 = Math.min(y0 + 1, slabH - 1);
  const tx = clamp(fx, slabW - 1) - x0;
  const ty = clamp(fy, slabH - 1) - y0;
  const v00 = slab[y0 * slabW + x0];
  const v10 = slab[y0 * slabW + x1];
  const v01 = slab[y1 * slabW + x0];
  const v11 = slab[y1 * slabW + x1];
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

// --- Prepared terrain grid ----------------------------------------------------

export function latLonGridForAoi(aoi, spacing) {
  const m = metersPerDegree(aoiCenter(aoi).lat);
  const dLat = spacing / m.north;
  const dLon = spacing / m.east;
  const ny = Math.round((aoi.latNorth - aoi.latSouth) / dLat) + 1;
  const nx = Math.round((aoi.lonEast - aoi.lonWest) / dLon) + 1;
  const latitudes = [];
  const longitudes = [];
  for (let r = 0; r < ny; r++) latitudes.push(aoi.latSouth + r * dLat);
  for (let c = 0; c < nx; c++) longitudes.push(aoi.lonWest + c * dLon);
  return { latitudes, longitudes, nx, ny, spacing };
}

export function buildTerrainGrid(aoi, spacing, slabInfo) {
  const { latitudes, longitudes, nx, ny } = latLonGridForAoi(aoi, spacing);
  const heights = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      heights[r * nx + c] = slabSampleLonLat(slabInfo, latitudes[r], longitudes[c]);
    }
  }
  const origin = localOrigin(aoi);
  const m = metersPerDegree(origin.lat);
  return {
    origin,
    nx,
    ny,
    spacing,
    eastMeters: (nx - 1) * spacing,
    northMeters: (ny - 1) * spacing,
    heightUnit: 'meters',
    heights,
    latSouth: latitudes[ny - 1],
    lonWest: longitudes[0],
  };
}

export function sampleTerrainGrid(grid, east, north) {
  const col = (east + grid.eastMeters / 2) / grid.spacing;
  const row = (north + grid.northMeters / 2) / grid.spacing;
  const clamp = (v, hi) => Math.min(Math.max(v, 0), hi);
  const x0 = Math.floor(clamp(col, grid.nx - 1));
  const y0 = Math.floor(clamp(row, grid.ny - 1));
  const x1 = Math.min(x0 + 1, grid.nx - 1);
  const y1 = Math.min(y0 + 1, grid.ny - 1);
  const tx = clamp(col, grid.nx - 1) - x0;
  const ty = clamp(row, grid.ny - 1) - y0;
  const nx = grid.nx;
  const h = grid.heights;
  const v00 = h[y0 * nx + x0];
  const v10 = h[y0 * nx + x1];
  const v01 = h[y1 * nx + x0];
  const v11 = h[y1 * nx + x1];
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

export function terrainStats(grid) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of grid.heights) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(`[write] ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
