import * as THREE from 'three';
import type { RouteAsset, TerrainAsset } from '../data/loader';
import { sampleTerrain } from './coordinates';
const CAM_OFFSET_M = 16;

const LOOK_AHEAD_M = 40;
const BLEND_SECONDS = 1;
const HEIGHT_DAMPING = 5.5;
const POSITION_DAMPING = 9;
const LOOK_DAMPING = 8;
const EASE_WINDOW = 0.08;

// Damped chase toward a target with framerate-independent factor.
function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

// Constant cruise speed with gentle ease-in/out at the ends (never fully
// stops, so the finish merges into the overview return).
function shapedSpeed(t: number): number {
  const easeIn = THREE.MathUtils.smoothstep(t, 0, EASE_WINDOW);
  const easeOut = 1 - THREE.MathUtils.smoothstep(t, 1 - EASE_WINDOW, 1);
  return Math.min(easeIn, easeOut) * 0.9 + 0.1;
}

export class DescentController {
  private terrain: TerrainAsset;
  private curve: THREE.CatmullRomCurve3;
  private totalLength: number;
  private t = 0;
  private playing = false;
  private duration: number;
  private onDone: () => void;
  private phase: 'idle' | 'blend' | 'run' = 'idle';
  private blendT = 0;
  private blendFrom = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private dampedHeight = 0;
  private dampedPos = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();

  constructor(
    terrain: TerrainAsset,
    route: RouteAsset,
    opts: { durationSeconds: number; onDone?: () => void } = { durationSeconds: 75 },
  ) {
    this.terrain = terrain;
    const pts = route.points;
    // The camera rides a lightly smoothed elevation profile; the ribbon itself
    // stays on the raw DEM line.
    const heights = pts.map(([e, n]) => sampleTerrain(terrain, e, n) - terrain.elevationMin);
    const smoothed = smoothWindow(heights, Math.max(3, Math.round(60 / terrain.spacing)));
    const v3 = pts.map(([e, n], i) => new THREE.Vector3(e, smoothed[i], -n));
    this.curve = new THREE.CatmullRomCurve3(v3, false, 'catmullrom', 0.2);
    this.totalLength = this.curve.getLength();
    this.duration = opts.durationSeconds;
    this.onDone = opts.onDone ?? (() => {});
  }

  start(fromBeginning = true) {
    if (fromBeginning) this.t = 0;
    this.playing = true;
    this.phase = 'run';
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
    this.phase = 'idle';
  }

  setDuration(seconds: number) {
    this.duration = seconds;
  }

  // Capture the orbit-camera pose so the blend can fly from it into the ride.
  captureBlend(camera: THREE.PerspectiveCamera) {
    this.blendFrom.pos.copy(camera.position);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this.blendFrom.target.copy(camera.position).addScaledVector(dir, 800);
  }

  private heightAt(v: THREE.Vector3): number {
    const h = sampleTerrain(this.terrain, v.x, -v.z) - this.terrain.elevationMin;
    return h * this.terrain.verticalScale;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, scale = 1) {
    if (!this.playing) return;

    const f = this.t;
    const pos = this.curve.getPointAt(f);
    const aheadPos = this.curve.getPointAt(Math.min(f + LOOK_AHEAD_M / this.totalLength, 1));
    const terrainHeight = this.heightAt(pos);
    // Both heights are geometry-space meters; `scale` is the live vertical
    // exaggeration (run boosts it to 1.5), while the offset stays in world
    // meters so the camera keeps a true ~18 m clearance over the snow.
    const heightTarget = Math.max(pos.y, terrainHeight) * scale + CAM_OFFSET_M;
    const lookGoal = aheadPos.clone().setY(aheadPos.y * scale);

    if (this.phase === 'blend') {
      this.blendT = Math.min(this.blendT + dt / BLEND_SECONDS, 1);
      const s = THREE.MathUtils.smoothstep(this.blendT, 0, 1);
      if (this.blendT === 0) {
        this.dampedHeight = this.blendFrom.pos.y;
        this.dampedPos.copy(camera.position);
        this.lookTarget.copy(this.blendFrom.target);
      }
      this.dampedHeight = damp(
        this.dampedHeight,
        heightTarget,
        HEIGHT_DAMPING,
        dt,
      );
      this.dampedPos.set(
        THREE.MathUtils.lerp(this.blendFrom.pos.x, pos.x, s),
        THREE.MathUtils.lerp(this.blendFrom.pos.y, this.dampedHeight, s),
        THREE.MathUtils.lerp(this.blendFrom.pos.z, pos.z, s),
      );
      camera.position.copy(this.dampedPos);
      this.lookTarget.copy(this.blendFrom.target).lerp(lookGoal, s);
      camera.lookAt(this.lookTarget);
      if (this.blendT >= 1) {
        this.phase = 'run';
        this.dampedHeight = camera.position.y;
        this.dampedPos.copy(camera.position);
      }
      this.advance(dt);
      return;
    }

    if (this.dampedPos.lengthSq() === 0) {
      // resume without blend: pick up exactly where the camera is hovering
      this.dampedPos.copy(camera.position);
      this.dampedHeight = camera.position.y;
    }

    // single critically-smooth chase of the whole pose — flattens both
    // elevation steps and lateral kinks from the DEM-sampled route line
    this.dampedPos.lerp(
      new THREE.Vector3(pos.x, heightTarget, pos.z),
      1 - Math.exp(-POSITION_DAMPING * dt),
    );
    this.dampedHeight = this.dampedPos.y;
    camera.position.copy(this.dampedPos);

    if (this.lookTarget.lengthSq() === 0) this.lookTarget.copy(lookGoal);
    this.lookTarget.lerp(lookGoal, 1 - Math.exp(-LOOK_DAMPING * dt));
    camera.lookAt(this.lookTarget);
    this.advance(dt);
  }

  private advance(dt: number) {
    this.t = Math.min(this.t + (dt / this.duration) * shapedSpeed(this.t), 1);
    if (this.t >= 1) {
      this.stop();
      this.onDone();
    }
  }
}

// simple centered moving average over the elevation profile
function smoothWindow(values: number[], window: number): number[] {
  if (window <= 1 || values.length < 3) return values;
  const half = Math.floor(window / 2);
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    for (let k = i - half; k <= i + half; k++) {
      const j = Math.min(Math.max(k, 0), values.length - 1);
      sum += values[j];
      n++;
    }
    out[i] = sum / n;
  }
  return out;
}
