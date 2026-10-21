import {
  loadDataset,
  loadLocations,
  loadRoute,
  routeSourceLabel,
  type CourseSummary,
  type Dataset,
  type LocationsAsset,
  type LocationEntry,
  type ManifestAsset,
  type OfficialFacts,
  type RouteAsset,
} from '../data/loader';
import { createScene, type FeatureInfo, type SceneHandle } from '../scene/createScene';

enum Mode {
  Overview = 'overview',
  Descent = 'descent',
  Ski = 'ski',
}

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
};

export async function bootApp(canvas: HTMLCanvasElement): Promise<void> {
  const loading = el('loading');
  const errorBox = el('error');
  const factsPanel = el('facts');
  const legendPanel = el('legend');
  const manifestPanel = el('manifest-content');
  const appRoot = el('app');
  const hudTitle = document.querySelector('.hud h1') as HTMLElement | null;
  const hudSubtitle = document.querySelector('.subtitle') as HTMLElement | null;

  const btnPlay = el<HTMLButtonElement>('btn-play');
  const btnSki = el<HTMLButtonElement>('btn-ski');
  const btnPause = el<HTMLButtonElement>('btn-pause');
  const btnExit = el<HTMLButtonElement>('btn-exit');
  const btnExitSki = el<HTMLButtonElement>('btn-exit-ski');
  const btnReset = el<HTMLButtonElement>('btn-reset');
  const btnTopDown = el<HTMLButtonElement>('btn-top-down');
  const btnCourseStart = el<HTMLButtonElement>('btn-course-start');
  const btnLandmarks = el<HTMLButtonElement>('btn-landmarks');
  const btnInfo = el<HTMLButtonElement>('btn-info');
  const btnRelief = el<HTMLButtonElement>('btn-relief');
  const btnSelClose = el<HTMLButtonElement>('sel-close');
  const locationSelect = el<HTMLSelectElement>('location-select');
  const courseSelect = el<HTMLSelectElement>('course-select');
  const selectionPanel = el<HTMLDivElement>('selection-panel');
  const skiHud = el<HTMLDivElement>('ski-hud');
  const skiSpeedValue = el<HTMLSpanElement>('ski-speed-value');
  const skiDistance = el<HTMLElement>('ski-distance');
  const skiDrop = el<HTMLElement>('ski-drop');
  const skiTop = el<HTMLElement>('ski-top');
  const skiTouch = el<HTMLDivElement>('ski-touch');

  let mode = Mode.Overview;
  let scene: SceneHandle | null = null;
  let activeEntry: LocationEntry | null = null;
  let activeDir = '';
  let activeCourses: CourseSummary[] = [];
  let currentRoute: RouteAsset | null = null;
  let routeName = '';
  let routeDifficulty: string | null = null;
  let pisteClasses: string[] = [];
  let hasLifts = false;
  let visibleLayers = new Set<string>();

  btnInfo.addEventListener('click', () => openDialog());
  btnSelClose.addEventListener('click', () => closeSelection());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!selectionPanel.hidden) closeSelection();
    else if (mode === Mode.Descent || mode === Mode.Ski) setMode(Mode.Overview);
  });

  function closeSelection() {
    selectionPanel.hidden = true;
    scene?.setSelected(null);
  }

  function openSelection(id: string) {
    if (!scene) return;
    const info = scene.getFeatureInfo(id);
    if (!info) return;
    scene.setSelected(id);
    fillSelection(info);
    selectionPanel.hidden = false;
  }

  function fillSelection(info: FeatureInfo) {
    const kindLabel =
      info.kind === 'featured' ? 'Featured course' : info.kind === 'piste' ? 'Piste (context)' : 'Lift';
    const h2 = document.createElement('h2');
    h2.textContent = kindLabel;
    const name = document.createElement('h3');
    name.textContent = info.name || (info.kind === 'lift' ? 'Unnamed lift' : 'Unnamed piste');
    const dl = document.createElement('dl');
    const rows: [string, string][] = [
      ['Length (estimate)', `${info.lengthM.toLocaleString()} m`],
      ['Elevation (estimate)', `${info.bottomElevation.toLocaleString()} – ${info.topElevation.toLocaleString()} m`],
    ];
    if (info.kind === 'lift') {
      rows.push(['Lift type', info.liftType || 'unspecified']);
      rows.push(['Source', `OSM way ${info.osmWayId} (ODbL)`]);
    } else if (info.kind === 'piste') {
      rows.push(['Difficulty', info.difficulty ? `${info.difficulty} (as mapped)` : 'unclassified']);
      rows.push(['Source', `OSM way ${info.osmWayId} (ODbL)`]);
    } else {
      rows.push(['Difficulty', info.difficulty ? `${info.difficulty} (as mapped)` : 'unclassified']);
      rows.push([
        'Source',
        currentRoute ? `${routeSourceLabel(currentRoute)} (ODbL)` : 'prepared course (ODbL)',
      ]);
    }
    for (const [term, defn] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = defn;
      dl.append(dt, dd);
    }
    const note = document.createElement('p');
    note.className = 'legend-note';
    note.textContent =
      'Length and elevations are estimates from prepared geometry and the DEM; official numbers are listed in Facts where verified.';
    selectionPanel.replaceChildren(h2, name, dl, note);
  }

  function setMode(next: Mode) {
    mode = next;
    appRoot.classList.toggle('skiing', next === Mode.Ski);
    skiTouch.hidden = next !== Mode.Ski;
    if (!scene) return;
    if (next === Mode.Descent) {
      closeSelection();
      scene.startDescent(true);
      btnPlay.hidden = true;
      btnSki.hidden = true;
      btnPause.hidden = false;
      btnExit.hidden = false;
      btnExitSki.hidden = true;
      btnReset.hidden = true;
      btnTopDown.hidden = true;
      btnCourseStart.hidden = true;
      btnPause.setAttribute('aria-pressed', 'false');
      skiHud.hidden = true;
    } else if (next === Mode.Ski) {
      closeSelection();
      scene.startSki();
      btnPlay.hidden = true;
      btnSki.hidden = true;
      btnPause.hidden = true;
      btnExit.hidden = true;
      btnExitSki.hidden = false;
      btnReset.hidden = true;
      btnTopDown.hidden = true;
      btnCourseStart.hidden = true;
      skiHud.hidden = false;
    } else {
      scene.exitDescent();
      scene.stopSki();
      btnPlay.hidden = false;
      btnSki.hidden = false;
      btnPause.hidden = true;
      btnExit.hidden = true;
      btnExitSki.hidden = true;
      btnReset.hidden = false;
      btnTopDown.hidden = false;
      btnCourseStart.hidden = false;
      btnPlay.textContent = 'Play descent';
      skiHud.hidden = true;
    }
  }

  btnPlay.addEventListener('click', () => setMode(Mode.Descent));
  btnSki.addEventListener('click', () => setMode(Mode.Ski));
  btnExitSki.addEventListener('click', () => setMode(Mode.Overview));

  // Touch controls (phones/tablets): the same four inputs as the arrow keys.
  for (const btn of Array.from(skiTouch.querySelectorAll('button[data-ski]'))) {
    const control = btn.getAttribute('data-ski') as 'left' | 'right' | 'tuck' | 'brake';
    const press = (e: Event) => {
      e.preventDefault();
      scene?.setSkiInput(control, true);
      btn.classList.add('pressed');
    };
    const release = (e: Event) => {
      e.preventDefault();
      scene?.setSkiInput(control, false);
      btn.classList.remove('pressed');
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  }
  btnExit.addEventListener('click', () => setMode(Mode.Overview));
  btnReset.addEventListener('click', () => scene?.resetView());
  btnTopDown.addEventListener('click', () => scene?.presetTopDown());
  btnCourseStart.addEventListener('click', () => scene?.presetCourseStart());
  btnLandmarks.addEventListener('click', () => {
    if (!scene) return;
    const turnOn = btnLandmarks.getAttribute('aria-pressed') !== 'true';
    scene.setLandmarksVisible(turnOn);
    btnLandmarks.setAttribute('aria-pressed', String(turnOn));
    btnLandmarks.textContent = turnOn ? 'Landmarks: on' : 'Landmarks: off';
  });
  btnPause.addEventListener('click', () => {
    if (!scene) return;
    if (scene.descentActive()) {
      scene.pauseDescent();
      btnPause.textContent = 'Resume';
      btnPause.setAttribute('aria-pressed', 'true');
    } else {
      scene.resumeDescent();
      btnPause.textContent = 'Pause';
      btnPause.setAttribute('aria-pressed', 'false');
    }
  });

  btnRelief.addEventListener('click', () => {
    if (!scene) return;
    const next = scene.verticalScale() === 1 ? 1.5 : 1;
    scene.setVerticalScale(next);
    btnRelief.textContent = next === 1 ? 'Relief: natural' : 'Relief: amplified';
    btnRelief.setAttribute('aria-pressed', String(next !== 1));
  });

  function officialRows(f: OfficialFacts | null | undefined, rows: (string | null)[][]) {
    if (!f) {
      rows.push(['Official facts', 'not verified for this location yet']);
      return;
    }
    rows.push(
      ['Official length', f.courseLengthMeters != null ? `${f.courseLengthMeters.toLocaleString()} m` : '—'],
      ['Official vertical drop', f.verticalDropMeters != null ? `${f.verticalDropMeters.toLocaleString()} m` : '—'],
      [
        'Official start / finish',
        f.startElevationMeters != null || f.finishElevationMeters != null
          ? `${(f.startElevationMeters ?? '—').toLocaleString()} / ${(f.finishElevationMeters ?? '—').toLocaleString()} m`
          : '—',
      ],
    );
  }

  function fillPanels(manifest: ManifestAsset, route: RouteAsset) {
    const f = route.officialFacts ?? manifest.officialCourseFacts;
    const d = route.estimates
      ? {
          demRouteLengthMeters: Math.round((route.points.length - 1) * route.spacing),
          demVerticalDropMeters: route.estimates.demVerticalDrop,
          demStartElevationMeters: route.estimates.demStartElevation,
          demFinishElevationMeters: route.estimates.demFinishElevation,
        }
      : manifest.demEstimates;
    const rows: (string | null)[][] = [];
    if (f) {
      officialRows(f, rows);
    }
    if (d) {
      rows.push(
        ['Prepared route length', `≈ ${d.demRouteLengthMeters.toLocaleString()} m (estimate)`],
        ['DEM vertical drop', `≈ ${d.demVerticalDropMeters.toLocaleString()} m (estimate)`],
      );
    }
    rows.push(['Difficulty', routeName ? (routeDifficulty ? `${routeDifficulty} (as mapped)` : 'unclassified') : '—']);
    rows.push(['Course source', routeSourceLabel(route)]);
    const h2 = document.createElement('h2');
    h2.textContent = 'Facts';
    const dl = document.createElement('dl');
    for (const row of rows) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = row[0];
      dd.textContent = row[1] ?? '';
      dl.append(dt, dd);
    }
    const frag = document.createDocumentFragment();
    frag.append(h2, dl);
    if (manifest.featuredDifficultyNote) {
      const note = document.createElement('p');
      note.className = 'facts-note';
      note.textContent = manifest.featuredDifficultyNote;
      frag.append(note);
    }
    factsPanel.replaceChildren(frag);
  }

  function fillLegend() {
    const frag = document.createDocumentFragment();
    const h2 = document.createElement('h2');
    h2.textContent = 'Legend';
    frag.append(h2);

    const hint = document.createElement('p');
    hint.className = 'legend-note';
    hint.textContent = 'Legend rows are toggles; click the scene to inspect a course, piste or lift.';
    frag.append(hint);

    frag.append(legendRow('featured', `${routeName} — featured course`));
    for (const cls of pisteClasses) {
      frag.append(legendRow(cls, PISTE_LEGEND[cls] ?? `${cls} (as mapped)`));
    }
    if (pisteClasses.length === 0 || pisteClasses.includes('none')) {
      frag.append(legendRow('piste-unclassified', 'Unclassified pistes (no mapped difficulty)'));
    }
    if (hasLifts) frag.append(legendRow('lift', 'Lifts (context)'));
    const note = document.createElement('p');
    note.className = 'legend-note';
    note.textContent =
      'Difficulty classes and colors follow the OSM mapping; local trail-color conventions differ. Non-color cue: the featured course is the wide amber band; other pistes are coloured bands; lifts are thin lines.';
    frag.append(note);
    legendPanel.replaceChildren(frag);
  }

  const PISTE_LEGEND: Record<string, string> = {
    novice: 'Novice (green, as mapped)',
    easy: 'Easy (blue, as mapped)',
    intermediate: 'Intermediate (red, as mapped)',
    advanced: 'Advanced (black, as mapped)',
    expert: 'Expert (black, as mapped)',
    freeride: 'Freeride (as mapped)',
    extreme: 'Extreme (as mapped)',
  };

  function fillManifest(manifest: ManifestAsset) {
    manifestPanel.replaceChildren(manifestContent(manifest));
  }

  function manifestContent(manifest: ManifestAsset) {
    const frag = document.createDocumentFragment();
    const attrib = document.createElement('p');
    attrib.className = 'attribution';
    attrib.textContent = manifest.attributionLine;
    frag.append(attrib);
    addDifficultyNoteParagraph(frag, manifest.featuredDifficultyNote);

    if (manifest.resortFacts) {
      const h = document.createElement('h3');
      h.textContent = manifest.resortFacts.headline;
      frag.append(h);
      const dl = document.createElement('dl');
      dl.className = 'resort-facts';
      for (const [label, value] of manifest.resortFacts.rows) {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dl.append(dt, dd);
      }
      frag.append(dl);
      const note = document.createElement('p');
      note.className = 'limitation';
      note.textContent = manifest.resortFacts.attribution;
      frag.append(note);
    }

    const h = document.createElement('h3');
    h.textContent = 'Data sources';
    frag.append(h);
    for (const s of manifest.sources) {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = s.name;
      p.appendChild(document.createTextNode(s.name + ' — ' + s.license));
      p.prepend(strong);
      p.append(document.createTextNode(s.license));
      frag.append(p);
      if (s.limitation) {
        const l = document.createElement('p');
        l.className = 'limitation';
        l.textContent = s.limitation;
        frag.append(l);
      }
    }

    const h2 = document.createElement('h3');
    h2.textContent = 'Known gaps';
    frag.append(h2);
    const ul = document.createElement('ul');
    for (const gap of manifest.knownGaps) {
      const li = document.createElement('li');
      li.textContent = gap;
      ul.append(li);
    }
    frag.append(ul);
    return frag;
  }

  function legendRow(kind: string, label: string) {
    const btn = document.createElement('button');
    btn.className = 'legend-item';
    btn.type = 'button';
    const layer = kind === 'piste-unclassified' ? 'unclassified' : kind;
    btn.setAttribute('aria-pressed', String(visibleLayers.has(layer)));
    const swatch = document.createElement('span');
    swatch.className = 'swatch swatch-' + kind;
    const text = document.createElement('span');
    text.textContent = label;
    btn.append(swatch, text);
    btn.addEventListener('click', () => {
      if (!scene) return;
      const turnOn = !visibleLayers.has(layer);
      if (turnOn) visibleLayers.add(layer);
      else visibleLayers.delete(layer);
      scene.setLayerVisible(layer, turnOn);
      btn.setAttribute('aria-pressed', String(turnOn));
    });
    return btn;
  }

  function addDifficultyNoteParagraph(frag: DocumentFragment, note: string | null | undefined) {
    if (!note) return;
    const p = document.createElement('p');
    p.className = 'limitation';
    p.textContent = note;
    frag.append(p);
  }

  function openDialog() {
    el<HTMLDialogElement>('info-dialog').showModal();
  }

  function populateLocationSelect(locations: LocationsAsset) {
    const param = new URLSearchParams(location.search).get('loc') ?? locations.default;
    const found = locations.locations.find((l) => l.id === param) ?? locations.locations[0];
    locationSelect.replaceChildren(
      ...locations.locations.map((entry) => {
        const opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = entry.display;
        return opt;
      }),
    );
    locationSelect.value = found?.id ?? '';
    locationSelect.setAttribute('aria-label', 'Choose location');
    locationSelect.addEventListener('change', () => {
      const next = locationSelect.value;
      if (next && next !== (activeEntry?.id ?? '')) {
        window.location.href = `./?loc=${encodeURIComponent(next)}`;
      }
    });
    return found;
  }

  function populateCourseSelect(courses: CourseSummary[], selectedId: string) {
    courseSelect.replaceChildren(
      ...courses.map((course) => {
        const opt = document.createElement('option');
        opt.value = course.id;
        opt.textContent = course.name + (course.curated ? ' (curated)' : '');
        return opt;
      }),
    );
    courseSelect.value = selectedId;
    courseSelect.hidden = courses.length < 2;
    courseSelect.setAttribute('aria-label', 'Choose course');
  }

  async function switchCourse(course: CourseSummary, manifest: ManifestAsset) {
    if (mode === Mode.Descent || mode === Mode.Ski) setMode(Mode.Overview);
    closeSelection();
    // reflect selection immediately; data fetch follows
    const url = new URL(location.href);
    if (course.isDefault) {
      url.searchParams.delete('course');
    } else {
      url.searchParams.set('course', course.id);
    }
    history.replaceState(null, '', url.toString());
    courseSelect.value = course.id;
    const route = await loadRoute(`./data/${activeDir}`, course.file);
    currentRoute = route;
    routeName = route.name;
    routeDifficulty = route.difficulty ?? null;
    scene?.swapRoute(route);
    visibleLayers.add('featured');
    fillPanels(manifest, route);
    fillLegend();
  }

  try {
    loading.hidden = false;
    const locations = await loadLocations();
    activeEntry = populateLocationSelect(locations);
    if (!activeEntry) throw new Error('No locations available.');
    activeDir = activeEntry.dir;
    if (hudTitle && hudSubtitle) {
      const [place, region] = activeEntry.display.split(' — ');
      hudTitle.textContent = 'Downhill Atlas';
      hudSubtitle.textContent = `${place ?? activeEntry.display} (${region ?? ''}) — 3D visualization prototype`;
    }

    const data: Dataset = await loadDataset(`./data/${activeDir}`);
    currentRoute = data.route;
    routeName = data.route.name;
    routeDifficulty = data.route.difficulty ?? null;
    pisteClasses = Array.from(
      new Set(data.pistes.features.map((f) => f.difficulty).filter((x): x is string => Boolean(x))),
    ).sort();
    hasLifts = data.lifts.features.length > 0;

    scene = createScene(canvas, data, {
      onDescentEnd: () => setMode(Mode.Overview),
      onFeatureHover: (id) => {
        canvas.style.cursor = id ? 'pointer' : '';
      },
      onFeatureSelect: (id) => {
        if (id) openSelection(id);
        else closeSelection();
      },
      onSkiStats: (stats) => {
        skiSpeedValue.textContent = String(Math.round(stats.speedKmh));
        skiDistance.textContent = `${Math.round(stats.distanceM).toLocaleString()} m`;
        skiDrop.textContent = `${Math.round(stats.dropM).toLocaleString()} m`;
        skiTop.textContent = `${Math.round(stats.topSpeedKmh)} km/h`;
      },
    });
    (window as unknown as Record<string, unknown>).__downhillScene = scene;
    loading.hidden = true;
    visibleLayers = new Set(['featured', ...pisteClasses.filter((c) => c !== 'none')]);
    if (hasLifts) visibleLayers.add('lift');
    fillPanels(data.manifest, data.route);
    fillManifest(data.manifest);
    fillLegend();
    appRoot.classList.add('ready');

    // courses (curated extra routes) — honor ?course= deep links
    activeCourses = activeEntry.courses ?? [];
    const wanted = new URLSearchParams(location.search).get('course');
    const defaultCourse = activeCourses.find((c) => c.isDefault) ?? activeCourses[0];
    const initialCourse = wanted ? activeCourses.find((c) => c.id === wanted) ?? defaultCourse : defaultCourse;
    if (initialCourse) {
      populateCourseSelect(activeCourses, initialCourse.id);
      if (initialCourse.file !== 'route.json') {
        await switchCourse(initialCourse, data.manifest);
      }
      courseSelect.addEventListener('change', () => {
        const next = activeCourses.find((c) => c.id === courseSelect.value);
        if (next && next.id !== currentRoute?.courseId) {
          void switchCourse(next, data.manifest).catch((err) => {
            console.error('course switch failed', err);
          });
        }
      });
    }

    scene.setVerticalScale(data.terrain.verticalScale);
    btnReset.hidden = false;
    btnTopDown.hidden = false;
    btnCourseStart.hidden = false;
    if (scene.hasLandmarks) {
      btnLandmarks.hidden = false;
      btnLandmarks.setAttribute('aria-pressed', 'true');
      btnLandmarks.textContent = 'Landmarks: on';
    } else {
      btnLandmarks.hidden = true;
    }
  } catch (err) {
    loading.hidden = true;
    errorBox.hidden = false;
    errorBox.textContent =
      'The scene could not load.' + (err instanceof Error ? ' ' + err.message : '');
    console.error(err);
  }
}
