// v2 intentionally retires stored A/B choices from the development pass:
// Combined is now the shipped default, while the other modes remain available
// in the dev panel and by explicit query string for diagnosis.
const MODE_STORAGE_KEY = 'darwin.distanceScenery.mode.v2';
const SHELL_STORAGE_KEY = 'darwin.distanceScenery.shellTuning.v1';

export const DISTANCE_SCENERY_MODES = Object.freeze({
  layered: 'layered',
  shell: 'shell',
  hybrid: 'hybrid',
});

export const DISTANCE_SCENERY_SHELL_DEFAULTS = Object.freeze({
  shellVisible: true,
  shellRelief: 0.86,
  shellVertical: 0,
  shellRadiusScale: 1,
  shellHazeStart: 80,
  shellHazeEnd: 290,
  shellHazeStrength: 0.96,
  shellSaturation: 0.76,
  shellContrast: 0.9,
  shellWireframe: false,
});

function validMode(value) {
  if (value === DISTANCE_SCENERY_MODES.layered) return DISTANCE_SCENERY_MODES.layered;
  if (value === DISTANCE_SCENERY_MODES.shell) return DISTANCE_SCENERY_MODES.shell;
  if (value === DISTANCE_SCENERY_MODES.hybrid) return DISTANCE_SCENERY_MODES.hybrid;
  return DISTANCE_SCENERY_MODES.hybrid;
}

function storedMode() {
  if (typeof window === 'undefined') return DISTANCE_SCENERY_MODES.hybrid;
  const queryMode = new URLSearchParams(window.location.search).get('distanceScenery');
  if (
    queryMode === DISTANCE_SCENERY_MODES.layered
    || queryMode === DISTANCE_SCENERY_MODES.shell
    || queryMode === DISTANCE_SCENERY_MODES.hybrid
  ) {
    return queryMode;
  }
  try {
    return validMode(window.localStorage.getItem(MODE_STORAGE_KEY));
  } catch {
    return DISTANCE_SCENERY_MODES.hybrid;
  }
}

function storedShellTuning() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SHELL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    return Object.fromEntries(Object.keys(DISTANCE_SCENERY_SHELL_DEFAULTS)
      .filter(key => (
        parsed[key] !== undefined
        && typeof parsed[key] === typeof DISTANCE_SCENERY_SHELL_DEFAULTS[key]
      ))
      .map(key => [key, parsed[key]]));
  } catch {
    return null;
  }
}

export const distanceSceneryRuntime = {
  mode: storedMode(),
  ...DISTANCE_SCENERY_SHELL_DEFAULTS,
  ...(storedShellTuning() || {}),
};

let revision = 0;
const listeners = new Set();

function persist() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, distanceSceneryRuntime.mode);
    const changed = {};
    for (const key of Object.keys(DISTANCE_SCENERY_SHELL_DEFAULTS)) {
      if (distanceSceneryRuntime[key] !== DISTANCE_SCENERY_SHELL_DEFAULTS[key]) {
        changed[key] = distanceSceneryRuntime[key];
      }
    }
    if (Object.keys(changed).length) {
      window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify(changed));
    } else {
      window.localStorage.removeItem(SHELL_STORAGE_KEY);
    }
  } catch {
    // Storage is a convenience for visual tuning, never a runtime dependency.
  }
}

function publish() {
  revision += 1;
  persist();
  listeners.forEach(listener => listener());
}

export function setDistanceSceneryMode(mode, { updateQuery = true } = {}) {
  const nextMode = validMode(mode);
  if (distanceSceneryRuntime.mode === nextMode) return;
  distanceSceneryRuntime.mode = nextMode;
  if (updateQuery && typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.searchParams.set('distanceScenery', nextMode);
    window.history.replaceState(window.history.state, '', url);
  }
  publish();
}

export function setDistanceSceneryShellTuning(patch) {
  for (const key of Object.keys(DISTANCE_SCENERY_SHELL_DEFAULTS)) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== typeof DISTANCE_SCENERY_SHELL_DEFAULTS[key]) continue;
    distanceSceneryRuntime[key] = patch[key];
  }
  publish();
}

export function resetDistanceSceneryShellTuning() {
  Object.assign(distanceSceneryRuntime, DISTANCE_SCENERY_SHELL_DEFAULTS);
  publish();
}

export function subscribeDistanceScenery(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDistanceSceneryRevision() {
  return revision;
}
