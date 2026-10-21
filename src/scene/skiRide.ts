import * as THREE from 'three';
import type { RouteAsset, TerrainAsset } from '../data/loader';
import { sampleSurface, sampleTerrain } from './coordinates';

// --- ski physics (SI units: metres, seconds, m/s) ----------------------------
// The model is the classic "skate" formulation: the skier can only travel
// along their heading (edges grip the snow), gravity always pulls down the
// fall line, and whatever sideways velocity the terrain hands you is scrubbed
// by the edges. That single rule produces the real feel: traverse across the
// slope and you slow down, point down the fall line and you accelerate, and
// a hard turn bleeds speed because the lateral component is thrown away.
const G = 9.81;
// Air drag: rho * Cd * A / (2 m). Upright in a jacket vs tucked in a race suit.
const DRAG_UPRIGHT = 0.0032;
const DRAG_TUCKED = 0.0022;
// Ski-on-snow friction for a carved track on piste.
const MU = 0.055;
// Checking speed (a hard edge check) sheds a lot of energy.
const BRAKE_DECEL = 6.0;
// Lateral velocity damping (1/s): high = grippy, low = skidding.
const GRIP = 4.2;
const GRIP_SKID = 1.3;
// Max edge angle, which sets the turn radius: R = v^2 / (g * tan(edge)).
const EDGE_ANGLE = 0.8;
const MAX_YAW_RATE = 1.3;
// How fast an unsteered skier straightens out onto the fall line (rad/s).
const FALL_LINE_ASSIST = 0.45;
// Terminal speed cap (~144 km/h) so a fall line never runs away with the rig.
const MAX_SPEED = 40;

// --- camera -------------------------------------------------------------------
const CHASE_DIST = 12;
const CHASE_HEIGHT = 3.6;
const LOOK_AHEAD = 18;
const CAM_DAMP = 6.0;
const LOOK_DAMP = 7.5;
const BLEND_SECONDS = 1.2;
const FOV_BASE = 55;
const FOV_FAST = 70;

// --- avatar + track -----------------------------------------------------------
const TRACK_WIDTH = 2.4;
const TRACK_MAX_POINTS = 900;
const TRACK_MIN_STEP = 1.6;

export interface SkiInput {
  left: boolean;
  right: boolean;
  tuck: boolean;
  brake: boolean;
}

export interface SkiStats {
  speedKmh: number;
  topSpeedKmh: number;
  distanceM: number;
  dropM: number;
  elapsed: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export class SkiRideController {
  private terrain: TerrainAsset;
  // Plan position in the local metric frame (east, north).
  private e = 0;
  private n = 0;
  // Heading as a plan-space angle: direction = (sin(yaw), cos(yaw)) in (east, north).
  private yaw = 0;
  // Plan velocity (m/s) in (east, north).
  private velE = 0;
  private velN = 0;
  private running = false;
  private blendT = 0;
  private blendFrom = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private camPos = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private startElevation = 0;
  private startE = 0;
  private startN = 0;
  private startYaw = 0;
  private lastTrackE = 0;
  private lastTrackN = 0;
  private trackCount = 0;
  private steerSmooth = 0;

  readonly skier: THREE.Group;
  readonly track: THREE.Mesh;
  private trackGeo: THREE.BufferGeometry;
  private trackPos: THREE.BufferAttribute;

  private stats: SkiStats = {
    speedKmh: 0,
    topSpeedKmh: 0,
    distanceM: 0,
    dropM: 0,
    elapsed: 0,
  };

  constructor(terrain: TerrainAsset, route: RouteAsset) {
    this.terrain = terrain;
    this.skier = buildSkier();
    this.trackGeo = new THREE.BufferGeometry();
    this.trackPos = new THREE.BufferAttribute(new Float32Array(TRACK_MAX_POINTS * 2 * 3), 3);
    this.trackPos.setUsage(THREE.DynamicDrawUsage);
    this.trackGeo.setAttribute('position', this.trackPos);
    const trackColors = new Float32Array(TRACK_MAX_POINTS * 2 * 4);
    for (let i = 0; i < TRACK_MAX_POINTS * 2; i++) {
      // A cool shadow tone: a carved track reads darker than fresh snow.
      trackColors[i * 4] = 0.42;
      trackColors[i * 4 + 1] = 0.53;
      trackColors[i * 4 + 2] = 0.66;
      trackColors[i * 4 + 3] = 0.6;
    }
    this.trackGeo.setAttribute('color', new THREE.BufferAttribute(trackColors, 4));
    const trackMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.track = new THREE.Mesh(this.trackGeo, trackMat);
    this.track.frustumCulled = false;
    this.track.renderOrder = 2;
    this.trackGeo.setDrawRange(0, 0);

    // Start on the race start of the featured course, facing down it.
    const p0 = route.points[0];
    const p1 = route.points[Math.min(1, route.points.length - 1)];
    this.startE = p0[0];
    this.startN = p0[1];
    this.startYaw = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
    this.e = this.startE;
    this.n = this.startN;
    this.yaw = this.startYaw;
    this.velE = Math.sin(this.yaw) * 6;
    this.velN = Math.cos(this.yaw) * 6;
    this.startElevation = this.heightAt(this.e, this.n);
  }

  isRunning(): boolean {
    return this.running;
  }

  getStats(): SkiStats {
    return { ...this.stats };
  }

  // Place the skier on the race start and fly the camera from wherever it is
  // now.
  start(camera: THREE.PerspectiveCamera) {
    this.running = true;
    this.blendT = 0;
    this.blendFrom.pos.copy(camera.position);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this.blendFrom.target.copy(camera.position).addScaledVector(dir, 800);
    this.camPos.copy(camera.position);
    this.lookTarget.copy(this.blendFrom.target);
    // Every run starts at the top of the course, rolling.
    this.e = this.startE;
    this.n = this.startN;
    this.yaw = this.startYaw;
    this.velE = Math.sin(this.yaw) * 6;
    this.velN = Math.cos(this.yaw) * 6;
    this.steerSmooth = 0;
    this.startElevation = this.heightAt(this.e, this.n);
    this.stats = { speedKmh: 0, topSpeedKmh: 0, distanceM: 0, dropM: 0, elapsed: 0 };
    this.trackCount = 0;
    this.trackGeo.setDrawRange(0, 0);
    this.lastTrackE = this.e;
    this.lastTrackN = this.n;
  }

  stop() {
    this.running = false;
  }

  // --- terrain helpers ---------------------------------------------------------
  private heightAt(e: number, n: number): number {
    return sampleTerrain(this.terrain, e, n) - this.terrain.elevationMin;
  }

  // Surface height of the rendered terrain mesh (so the skier sits on the
  // visible snow, not on the interpolated DEM).
  private meshHeightAt(e: number, n: number): number {
    return sampleSurface(this.terrain, e, n) - this.terrain.elevationMin;
  }

  // Gradient of the DEM (m of rise per m of plan distance).
  private gradientAt(e: number, n: number): { ge: number; gn: number } {
    const eps = 12;
    const hx1 = this.heightAt(e + eps, n);
    const hx0 = this.heightAt(e - eps, n);
    const hn1 = this.heightAt(e, n + eps);
    const hn0 = this.heightAt(e, n - eps);
    return { ge: (hx1 - hx0) / (2 * eps), gn: (hn1 - hn0) / (2 * eps) };
  }

  // --- simulation --------------------------------------------------------------
  update(dt: number, camera: THREE.PerspectiveCamera, input: SkiInput, scale: number) {
    if (!this.running) return;
    const step = Math.min(dt, 0.05);

    const speed = Math.hypot(this.velE, this.velN);
    // Steering is smoothed so tapping an arrow does not snap the edge angle.
    const steerTarget = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.steerSmooth += (steerTarget - this.steerSmooth) * (1 - Math.exp(-7 * step));

    // Terrain gradient: the fall line is where gravity pulls.
    const { ge, gn } = this.gradientAt(this.e, this.n);
    const slope = Math.atan(Math.hypot(ge, gn));
    let downE = -ge;
    let downN = -gn;
    const downLen = Math.hypot(downE, downN);
    if (downLen > 1e-6) {
      downE /= downLen;
      downN /= downLen;
    }

    // Turn rate from the real carving relation R = v^2 / (g * tan(edge)):
    // faster means a wider arc, so speed and steering are coupled.
    const yawRate = clamp(
      (this.steerSmooth * G * Math.tan(EDGE_ANGLE)) / Math.max(speed, 3.5),
      -MAX_YAW_RATE,
      MAX_YAW_RATE,
    );
    this.yaw += yawRate * step;

    // With no steering input the skier drifts back toward the fall line, the
    // way a real skier naturally straightens out and picks up speed again.
    if (steerTarget === 0 && downLen > 1e-6) {
      const downYaw = Math.atan2(downE, downN);
      let diff = downYaw - this.yaw;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.yaw += clamp(diff, -FALL_LINE_ASSIST * step, FALL_LINE_ASSIST * step);
    }

    // Gravity along the fall line.
    const gAcc = G * Math.sin(slope);
    this.velE += downE * gAcc * step;
    this.velN += downN * gAcc * step;

    // Local frame: forward along the heading, lateral across it.
    const hx = Math.sin(this.yaw);
    const hn = Math.cos(this.yaw);
    const px = -hn;
    const pn = hx;
    let vf = this.velE * hx + this.velN * hn;
    let vl = this.velE * px + this.velN * pn;

    // Edges hold the ski: the lateral component is scrubbed away. Braking
    // releases the edges, so the ski slides (and scrubs even more speed).
    const grip = input.brake ? GRIP_SKID : GRIP;
    vl *= Math.exp(-grip * step);
    // The edge can only hold so much sideways load. Past that it lets go and
    // the ski slides, which caps how hard a turn can scrub the speed.
    const maxLat = (G * Math.tan(EDGE_ANGLE)) / grip;
    if (Math.abs(vl) > maxLat) vl = Math.sign(vl) * maxLat;

    // Friction + air drag along the direction of travel.
    const vNow = Math.hypot(vf, vl);
    const drag = (input.tuck ? DRAG_TUCKED : DRAG_UPRIGHT) * vNow * vNow;
    let aResist = MU * G * Math.cos(slope) + drag;
    if (vNow > 0.01) vf -= Math.sign(vf) * aResist * step;
    // A check scrubs speed in every direction, not just along the heading.
    if (input.brake && vNow > 0.01) {
      const factor = Math.max(0, 1 - (BRAKE_DECEL * step) / vNow);
      vf *= factor;
      vl *= factor;
    }

    this.velE = vf * hx + vl * px;
    this.velN = vf * hn + vl * pn;

    // Cap the terminal speed.
    const cap = Math.hypot(this.velE, this.velN);
    if (cap > MAX_SPEED) {
      this.velE = (this.velE / cap) * MAX_SPEED;
      this.velN = (this.velN / cap) * MAX_SPEED;
    }

    // Integrate and keep the skier on the mapped terrain.
    this.e += this.velE * step;
    this.n += this.velN * step;
    this.clampToMap();

    // --- stats ---------------------------------------------------------------
    const spd = Math.hypot(this.velE, this.velN);
    this.stats.speedKmh = spd * 3.6;
    this.stats.topSpeedKmh = Math.max(this.stats.topSpeedKmh, this.stats.speedKmh);
    this.stats.distanceM += spd * step;
    this.stats.elapsed += step;
    const elev = this.heightAt(this.e, this.n);
    this.stats.dropM = Math.max(0, this.startElevation - elev);

    // --- avatar + track ------------------------------------------------------
    this.updateSkier(scale, yawRate);
    this.updateTrack(scale);

    // --- camera --------------------------------------------------------------
    this.updateCamera(dt, camera, scale, spd);
  }

  // Keep the skier inside the mapped area: the DEM is clamped at the border,
  // so without this the skier would ride on a flat invisible shelf.
  private clampToMap() {
    const halfE = this.terrain.eastMeters / 2;
    const halfN = this.terrain.northMeters / 2;
    const margin = 30;
    if (this.e > halfE - margin) {
      this.e = halfE - margin;
      if (this.velE > 0) this.velE = 0;
    } else if (this.e < -halfE + margin) {
      this.e = -halfE + margin;
      if (this.velE < 0) this.velE = 0;
    }
    if (this.n > halfN - margin) {
      this.n = halfN - margin;
      if (this.velN > 0) this.velN = 0;
    } else if (this.n < -halfN + margin) {
      this.n = -halfN + margin;
      if (this.velN < 0) this.velN = 0;
    }
  }

  private updateSkier(scale: number, yawRate: number) {
    const h = this.meshHeightAt(this.e, this.n) * scale;
    this.skier.position.set(this.e, h, -this.n);
    // The model faces -Z, so the plan heading maps to -yaw on the Y axis.
    this.skier.rotation.set(0, -this.yaw, 0);
    // Lean into the turn and tuck a little when accelerating.
    this.skier.rotateZ(clamp(yawRate * 0.35, -0.5, 0.5));
    this.skier.visible = true;
  }

  private updateTrack(scale: number) {
    const stepE = this.e - this.lastTrackE;
    const stepN = this.n - this.lastTrackN;
    if (Math.hypot(stepE, stepN) < TRACK_MIN_STEP) return;
    this.lastTrackE = this.e;
    this.lastTrackN = this.n;

    const hx = Math.sin(this.yaw);
    const hn = Math.cos(this.yaw);
    const px = -hn * (TRACK_WIDTH / 2);
    const pn = hx * (TRACK_WIDTH / 2);
    const left = this.meshHeightAt(this.e + px, this.n + pn) * scale + 0.25;
    const right = this.meshHeightAt(this.e - px, this.n - pn) * scale + 0.25;

    const arr = this.trackPos.array as Float32Array;
    if (this.trackCount >= TRACK_MAX_POINTS) {
      // Drop the oldest row and keep the buffer rolling.
      arr.copyWithin(0, 6);
      this.trackCount = TRACK_MAX_POINTS - 1;
    }
    const i = this.trackCount * 6;
    arr[i] = this.e + px;
    arr[i + 1] = left;
    arr[i + 2] = -(this.n + pn);
    arr[i + 3] = this.e - px;
    arr[i + 4] = right;
    arr[i + 5] = -(this.n - pn);
    this.trackCount++;
    this.trackPos.needsUpdate = true;
    this.trackGeo.setDrawRange(0, Math.max(0, (this.trackCount - 1) * 6));
  }

  private updateCamera(dt: number, camera: THREE.PerspectiveCamera, scale: number, speed: number) {
    const hx = Math.sin(this.yaw);
    const hn = Math.cos(this.yaw);
    const skierH = this.meshHeightAt(this.e, this.n) * scale;
    // Chase target: behind and above the skier, on the terrain behind it.
    const camX = this.e - hx * CHASE_DIST;
    const camN = this.n - hn * CHASE_DIST;
    const camZ = -camN;
    // Clear the whole line back to the skier: a roll just behind the skier
    // would otherwise swallow the camera (and the near plane shows sky).
    let camY = skierH + CHASE_HEIGHT;
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      const px = this.e + (camX - this.e) * t;
      const pn = this.n + (camN - this.n) * t;
      camY = Math.max(camY, this.meshHeightAt(px, pn) * scale + 2.4);
    }
    const target = new THREE.Vector3(camX, camY, camZ);
    // Look down the fall line ahead, but only partly follow the ground down:
    // fully chasing the terrain pitches the camera into the snow on steeps.
    const aheadE = this.e + hx * LOOK_AHEAD;
    const aheadN = this.n + hn * LOOK_AHEAD;
    const groundAhead = this.meshHeightAt(aheadE, aheadN) * scale;
    const look = new THREE.Vector3(aheadE, skierH + (groundAhead - skierH) * 0.7 + 1.2, -aheadN);

    if (this.blendT < 1) {
      this.blendT = Math.min(this.blendT + dt / BLEND_SECONDS, 1);
      const s = THREE.MathUtils.smoothstep(this.blendT, 0, 1);
      this.camPos.lerpVectors(this.blendFrom.pos, target, s);
      this.lookTarget.lerpVectors(this.blendFrom.target, look, s);
    } else {
      this.camPos.lerp(target, 1 - Math.exp(-CAM_DAMP * dt));
      this.lookTarget.lerp(look, 1 - Math.exp(-LOOK_DAMP * dt));
    }
    camera.position.copy(this.camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.lookTarget);
    // Bank into the turn; a little roll sells the carve.
    camera.rotateZ(clamp(this.steerSmooth * 0.12, -0.16, 0.16));
    // Speed widens the lens.
    const fov = FOV_BASE + (FOV_FAST - FOV_BASE) * clamp(speed / 34, 0, 1);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, 1 - Math.exp(-2.5 * dt));
      camera.updateProjectionMatrix();
    }
  }
}

// A compact racer: skis, boots, body, helmet. Built facing -Z (three.js
// convention for "forward").
function buildSkier(): THREE.Group {
  const group = new THREE.Group();
  const skiMat = new THREE.MeshStandardMaterial({ color: 0xe9eef4, roughness: 0.35 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.7 });
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x24354a, roughness: 0.6 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xe0462f, roughness: 0.4 });

  for (const side of [-1, 1]) {
    const ski = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 1.75), skiMat);
    ski.position.set(side * 0.24, 0.03, 0);
    group.add(ski);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.34), bootMat);
    boot.position.set(side * 0.24, 0.16, 0.02);
    group.add(boot);
  }

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.52, 4, 10), suitMat);
  body.position.set(0, 0.82, 0.1);
  body.rotation.x = 0.45;
  group.add(body);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), helmetMat);
  helmet.position.set(0, 1.42, -0.12);
  group.add(helmet);

  group.scale.setScalar(1);
  group.name = 'skier';
  return group;
}
