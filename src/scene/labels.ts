import * as THREE from 'three';
import type { RouteAsset, TerrainAsset } from '../data/loader';
import { sampleTerrain } from './coordinates';

export interface LandmarkLayer {
  host: HTMLElement;
  update: (camera: THREE.Camera) => void;
  setVisible: (visible: boolean) => void;
  resize: () => void;
}

const LABELS = 'landmark-layer';

export function buildLandmarks(terrain: TerrainAsset, route: RouteAsset): LandmarkLayer | null {
  const app = document.getElementById('app');
  if (!app) return null;
  if (route.landmarks.length === 0) return null;

  const host = document.createElement('div');
  host.className = LABELS;
  host.classList.add('hidden');
  app.appendChild(host);

  interface Item {
    el: HTMLDivElement;
    dot: HTMLDivElement;
    pose: THREE.Vector3;
  }
  const items: Item[] = [];

  for (const lm of route.landmarks) {
    const localHeight = sampleTerrain(terrain, lm.east, lm.north) - terrain.elevationMin;
    const idx = Math.min(
      route.points.length - 1,
      Math.round(lm.routeDistance / (route.spacing || 10)),
    );
    const [e, n] = route.points[idx] ?? [lm.east, lm.north];
    const routeHeight = sampleTerrain(terrain, e, n) - terrain.elevationMin;
    const pose = new THREE.Vector3(e, Math.max(localHeight, routeHeight) + 24, -n);

    const el = document.createElement('div');
    el.className = 'landmark-label';
    const dot = document.createElement('div');
    dot.className = 'landmark-dot';
    const text = document.createElement('span');
    text.className = 'landmark-text';
    text.textContent = lm.name;
    el.append(dot, text);
    host.appendChild(el);
    items.unshift({ el, dot, pose });
  }
  items.reverse();

  const v = new THREE.Vector3();

  // Minimum screen-space distance between shown labels; nearer labels win.
  // Iteration order is route order, so the sticker at each crowding pair is
  // the later landmark — suppress that instead of the earlier one.
  const MIN_X_DIST = 150;
  const MIN_Y_DIST = 40;
  const placed: { x: number; y: number }[] = [];

  return {
    host,
    resize() {},
    update(camera: THREE.Camera) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      placed.length = 0;
      for (const it of items) {
        v.copy(it.pose).project(camera);
        const behind = v.z > 1 || v.z < -1;
        if (behind) {
          it.el.style.display = 'none';
          continue;
        }
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        const offscreen = x < -60 || x > w + 60 || y < -30 || y > h + 30;
        const crowds = placed.some(
          (p) =>
            Math.abs(p.x - x) < MIN_X_DIST &&
            (Math.abs(p.y - y) < MIN_Y_DIST ||
              Math.hypot((p.x - x) / MIN_X_DIST, (p.y - y) / MIN_Y_DIST) < 1.4),
        );
        if (offscreen || crowds) {
          it.el.style.display = 'none';
          continue;
        }
        placed.push({ x, y });
        it.el.style.display = 'flex';
        it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      }
    },
    setVisible(visible: boolean) {
      host.classList.toggle('hidden', !visible);
    },
  };
}
