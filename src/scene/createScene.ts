import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Dataset, RouteAsset } from '../data/loader';
import { buildTerrain, repaintByNormals } from './terrainMesh';
import { applyHighlight, buildContextFeatures, buildFeaturedCourse, setFeaturedDescentFade, type FeatureRecord } from './routeLayer';
import { buildLandmarks, type LandmarkLayer } from './labels';
import { DescentController } from './descent';
import { SKY_COLOR, sampleTerrain } from './coordinates';

export interface FeatureInfo {
  id: string;
  kind: 'featured' | 'piste' | 'lift';
  name: string | null;
  difficulty: string | null;
  liftType?: string;
  lengthM: number;
  topElevation: number;
  bottomElevation: number;
  osmWayId: number;
}

export interface SceneCallbacks {
  onDescentEnd: () => void;
  onFeatureHover: (featureId: string | null) => void;
  onFeatureSelect: (featureId: string | null) => void;
}

export interface SceneHandle {
  // debug hook (QA harness introspection); harmless to keep public
  __sceneDebug: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    course: () => { group: THREE.Group };
  };
  startDescent: (fromBeginning: boolean) => void;
  pauseDescent: () => void;
  resumeDescent: () => void;
  exitDescent: () => void;
  descentActive: () => boolean;
  verticalScale: () => number;
  setVerticalScale: (scale: number) => void;
  resetView: () => void;
  presetTopDown: () => void;
  presetCourseStart: () => void;
  setLayerVisible: (layer: string, visible: boolean) => void;
  readonly hasLandmarks: boolean;
  setLandmarksVisible: (visible: boolean) => void;
  swapRoute: (route: RouteAsset) => void;
  getFeatureInfo: (featureId: string) => FeatureInfo | null;
  setSelected: (featureId: string | null) => void;
  dispose: () => void;
}

export function createScene(canvas: HTMLCanvasElement, data: Dataset, callbacks: SceneCallbacks): SceneHandle {
  const { terrain, pistes, lifts } = data;
  let route = data.route;

  const width = Math.max(canvas.clientWidth || window.innerWidth, 1);
  const height = Math.max(canvas.clientHeight || window.innerHeight, 1);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  const diag = Math.hypot(terrain.eastMeters, terrain.northMeters);
  scene.fog = new THREE.FogExp2(SKY_COLOR, (0.00016 * 3700) / diag);

  const camera = new THREE.PerspectiveCamera(55, width / height, 10, 40000);
  const heightRange = terrain.elevationMax - terrain.elevationMin;
  const overviewDistance = diag * 0.76;
  const HOME_POSITION = new THREE.Vector3(0.63 * overviewDistance, 0.42 * overviewDistance, 0.66 * overviewDistance);
  const HOME_TARGET = new THREE.Vector3(0, heightRange * 0.24, 0);
  camera.position.copy(HOME_POSITION);
  camera.lookAt(HOME_TARGET);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 150;
  controls.maxDistance = Math.max(diag * 1.6, 4000);
  controls.update();

  scene.add(new THREE.HemisphereLight(0xf2f2f4, 0x5c5c5a, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-diag * 0.42, diag * 0.52, diag * 0.34);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  const terrainGroup = new THREE.Group();
  const terrainMesh = buildTerrain(terrain);
  repaintByNormals(terrain, terrainMesh);
  terrainGroup.add(terrainMesh);

  let course = buildFeaturedCourse(terrain, route);
  const context = buildContextFeatures(terrain, pistes, lifts);
  terrainGroup.add(course.group);
  terrainGroup.add(context.group);
  scene.add(terrainGroup);

  const scale = { value: terrain.verticalScale };
  // The user's relief toggle; during a descent the scale eases up to at least
  // DESCENT_SCALE_BOOST so the run reads steeper, then settles back.
  let reliefUser = terrain.verticalScale;
  const DESCENT_SCALE_BOOST = 1.5;
  const DESCENT_SCALE_RAMP = 2.2;
  const BASE_FOV = 55;
  const DESCENT_FOV = 66;
  function applyScale() {
    terrainGroup.scale.y = scale.value;
  }
  applyScale();

  let landmarks: LandmarkLayer | null = buildLandmarks(terrain, route);
  let landmarksOn = !!landmarks;

  let entries: FeatureRecord[] = [];
  const byId = new Map<string, FeatureRecord>();
  const byUuid = new Map<string, FeatureRecord>();
  let pickables: THREE.Object3D[] = [];

  function rebuildFeatureIndex() {
    entries = [course.entry, ...context.entries];
    byId.clear();
    byUuid.clear();
    for (const entry of entries) {
      byId.set(entry.id, entry);
      for (const obj of entry.objects) byUuid.set(obj.uuid, entry);
    }
    pickables = [];
    for (const entry of entries) pickables.push(...entry.objects);
  }
  rebuildFeatureIndex();

  const visibleLayers = new Set<string>([course.entry.layer, ...context.layers]);

  let selectedId: string | null = null;
  let hoveredId: string | null = null;

  function refreshHighlight() {
    applyHighlight(entries, selectedId, hoveredId);
  }

  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: diag * 0.004 };
  const ndc = new THREE.Vector2();

  function isRecordVisible(record: FeatureRecord): boolean {
    return visibleLayers.has(record.layer);
  }

  function pickFeature(clientX: number, clientY: number): string | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    for (const hit of hits) {
      const record = byUuid.get(hit.object.uuid);
      if (record && isRecordVisible(record)) return record.id;
    }
    return null;
  }

  // --- camera presets -----------------------------------------------------------
  function presetOverview() {
    camera.position.copy(HOME_POSITION);
    controls.target.copy(HOME_TARGET);
    controls.update();
  }

  function presetTopDown() {
    camera.position.set(0, diag * 1.05, diag * 0.06);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function presetCourseStart() {
    const pts = route.points;
    const take = Math.min(6, pts.length - 1);
    let dx = 0;
    let dn = 0;
    for (let k = 1; k <= take; k++) {
      dx += pts[k][0] - pts[k - 1][0];
      dn += pts[k][1] - pts[k - 1][1];
    }
    const dl = Math.hypot(dx, dn) || 1;
    dx = (dx / dl) * 420;
    dn = (dn / dl) * 420;
    const [e0, n0] = pts[0];
    const ground0 = groundY(e0, n0);
    camera.position.set(e0 - dx, ground0 + diag * 0.16, -(n0 - dn));
    controls.target.set(e0 + dx * 0.5, ground0 + 30, -(n0 + dn * 0.5));
    controls.update();
  }

  function groundY(east: number, north: number): number {
    return (sampleTerrain(terrain, east, north) - terrain.elevationMin) * scale.value;
  }

  // --- descent -------------------------------------------------------------------
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let descent = makeDescent(route);

  function makeDescent(routeFor: RouteAsset): DescentController {
    const baseDuration = routeFor.descentDurationSeconds ?? 75;
    return new DescentController(terrain, routeFor, {
      durationSeconds: prefersReducedMotion ? baseDuration * 2 : baseDuration,
      onDone: () => callbacks.onDescentEnd(),
    });
  }

  function disposeObject(obj: THREE.Object3D) {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
  }

  function swapRoute(next: RouteAsset) {
    if (descent.isPlaying()) descent.stop();
    terrainGroup.remove(course.group);
    disposeObject(course.group);
    landmarks?.host.remove();

    route = next;
    course = buildFeaturedCourse(terrain, route);
    terrainGroup.add(course.group);
    landmarks = buildLandmarks(terrain, route);
    landmarksOn = !!landmarks;
    descent = makeDescent(route);
    rebuildFeatureIndex();
    if (selectedId) selectedId = null;
    hoveredId = null;
  }

  // --- pointer interaction ---------------------------------------------------------
  let downPos: { x: number; y: number; time: number } | null = null;
  let dragging = false;

  canvas.addEventListener('pointerdown', (e) => {
    downPos = { x: e.clientX, y: e.clientY, time: performance.now() };
    dragging = false;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (descent.isPlaying()) return;
    if (downPos && (Math.abs(e.clientX - downPos.x) > 6 || Math.abs(e.clientY - downPos.y) > 6)) {
      dragging = true;
    }
    if (!dragging && e.buttons === 0) {
      const id = pickFeature(e.clientX, e.clientY);
      if (id !== hoveredId) {
        hoveredId = id;
        refreshHighlight();
        callbacks.onFeatureHover(id);
      }
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (descent.isPlaying() || dragging || !downPos) {
      downPos = null;
      return;
    }
    const quick = performance.now() - downPos.time < 600;
    downPos = null;
    if (!quick) return;
    callbacks.onFeatureSelect(pickFeature(e.clientX, e.clientY));
  });

  // --- render loop -------------------------------------------------------------------
  let raf = 0;
  let last = performance.now();
  let sceneryFade = 0;
  let sceneryApplied = -1;

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const descending = descent.isPlaying();

    // vertical scale + fov glide between overview and the ski-cam profile
    const scaleTarget = descending ? Math.max(reliefUser, DESCENT_SCALE_BOOST) : reliefUser;
    if (Math.abs(scaleTarget - scale.value) > 1e-4) {
      scale.value +=
        (scaleTarget - scale.value) * Math.min(1, 1 - Math.exp(-DESCENT_SCALE_RAMP * dt));
      applyScale();
    }
    const fovTarget = descending ? DESCENT_FOV : BASE_FOV;
    if (Math.abs(fovTarget - camera.fov) > 1e-3) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, 1 - Math.exp(-DESCENT_SCALE_RAMP * dt));
      camera.updateProjectionMatrix();
    }

    if (descending) {
      controls.enabled = false;
      descent.update(dt, camera, scale.value);
    } else {
      controls.enabled = true;
      controls.update();
    }
    if (landmarks) {
      landmarks.setVisible(landmarksOn && !descending);
      landmarks.update(camera);
    }
    // scenery fade eases with the same ramp as the scale/fov glide
    sceneryFade += ((descending ? 1 : 0) - sceneryFade) * Math.min(1, 1 - Math.exp(-2.5 * dt));
    if (Math.abs(sceneryFade - sceneryApplied) > 0.015 || (sceneryFade < 0.001) !== (sceneryApplied < 0.001)) {
      sceneryApplied = sceneryFade;
      setFeaturedDescentFade(course.group, sceneryFade);
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame((t) => {
    last = t;
    loop(t);
  });

  function resize() {
    const w = Math.max(canvas.clientWidth || window.innerWidth, 1);
    const h = Math.max(canvas.clientHeight || window.innerHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);

  return {
    // debug hook (QA harness introspection); harmless to keep public
    __sceneDebug: {
      scene,
      camera,
      course: () => course,
    },
    startDescent: (fromBeginning: boolean) => {
      descent.captureBlend(camera);
      descent.start(fromBeginning);
      canvas.style.cursor = '';
      callbacks.onFeatureHover(null);
      hoveredId = null;
    },
    pauseDescent: () => descent.pause(),
    resumeDescent: () => descent.resume(),
    exitDescent: () => {
      descent.stop();
      controls.enabled = true;
      presetOverview();
    },
    descentActive: () => descent.isPlaying(),
    verticalScale: () => reliefUser,
    setVerticalScale: (next: number) => {
      reliefUser = next;
    },
    resetView: presetOverview,
    presetTopDown,
    presetCourseStart,
    setLayerVisible: (layer: string, visible: boolean) => {
      if (visible) visibleLayers.add(layer);
      else visibleLayers.delete(layer);
      if (layer === course.entry.layer) course.group.visible = visible;
      for (const entry of context.entries) {
        if (entry.layer !== layer) continue;
        for (const obj of entry.objects) obj.visible = visible;
      }
    },
    get hasLandmarks() {
      return Boolean(landmarks);
    },
    setLandmarksVisible: (visible: boolean) => {
      landmarksOn = visible && Boolean(landmarks);
    },
    swapRoute,
    getFeatureInfo: (featureId: string): FeatureInfo | null => {
      const record = byId.get(featureId);
      if (!record) return null;
      return {
        id: record.id,
        kind: record.kind,
        name: record.name,
        difficulty: record.difficulty,
        liftType: record.liftType,
        lengthM: record.lengthM,
        topElevation: record.topElevation,
        bottomElevation: record.bottomElevation,
        osmWayId: record.osmWayId,
      };
    },
    setSelected: (featureId: string | null) => {
      selectedId = featureId;
      refreshHighlight();
    },
    dispose: () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      landmarks?.host.remove();
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
    },
  };
}
