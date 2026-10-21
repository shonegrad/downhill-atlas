import * as THREE from 'three';
import type { RouteAsset, TerrainAsset } from '../data/loader';
import { sampleTerrain } from './coordinates';

export class DescentController {
  private curve: THREE.CatmullRomCurve3;
  private t = 0;
  private playing = false;
  private duration: number;
  private onDone: () => void;

  constructor(
    private terrain: TerrainAsset,
    route: RouteAsset,
    opts: { durationSeconds: number; onDone?: () => void } = { durationSeconds: 75 },
  ) {
    const pts = route.points;
    const v3 = pts.map(([e, n]) => {
      const h = sampleTerrain(terrain, e, n) - terrain.elevationMin;
      return new THREE.Vector3(e, h, -n);
    });
    this.curve = new THREE.CatmullRomCurve3(v3, false, 'catmullrom', 0.2);
    this.duration = opts.durationSeconds;
    this.onDone = opts.onDone ?? (() => {});
  }

  start(fromBeginning = true) {
    if (fromBeginning) this.t = 0;
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  resume() {
    this.playing = true;
  }

  isPlaying() {
    return this.playing;
  }

  progress() {
    return this.t;
  }

  stop() {
    this.playing = false;
    this.t = 0;
  }

  setDuration(seconds: number) {
    this.duration = seconds;
  }

  private ease(f: number) {
    return f * f * (3 - 2 * f);
  }

  update(dt: number, camera: THREE.PerspectiveCamera, scale = 1) {
    if (this.playing) {
      this.t = Math.min(this.t + dt / this.duration, 1);
      if (this.t >= 1) {
        this.playing = false;
        this.onDone();
      }
    }
    const f = this.ease(this.t);
    const pos = this.curve.getPointAt(f);
    const lookAt = this.curve.getPointAt(Math.min(f + 0.028, 1));
    const posHeight = sampleTerrain(this.terrain, pos.x, -pos.z) - this.terrain.elevationMin;
    camera.position.set(pos.x, (Math.max(pos.y, posHeight) + 32) * scale, pos.z);
    camera.lookAt(lookAt.x, lookAt.y * scale, lookAt.z);
  }
}
