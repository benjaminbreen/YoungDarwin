// Live-tunable grade applied to every authored terrain material.
//
// Each region owns its own layer blend, masks and PBR set — that is where the
// character lives and it should stay there. What was missing was a way to
// judge and adjust the *result* across the map without editing a shader,
// reloading, and losing your place. These knobs sit at the end of the shared
// terrain chain (see injectTerrainRenderingExtensions in Terrain.jsx), after
// each region has finished composing its albedo and roughness, so one setting
// reads the same way in every region.
//
// Values persist to localStorage: tuning a look is an iterative job across
// many reloads, and losing the dial positions on every refresh makes it
// impossible. `copyTerrainLookJson` hands the current set back as JSON so a
// tuned result can be pasted into a commit and baked into these defaults.
//
// Everything here is a multiply or a lerp on values the shader already has.
// No knob adds a texture sampler — the renderer is fill/bandwidth-bound and
// samplers are the expensive direction (see docs/perf-lab.md).

const STORAGE_KEY = 'darwin.terrainLook.v1';

// Baked from Ben's tuning pass at Post Office Bay, 2026-08-03: slightly deeper
// and cooler ground, a little more colour and contrast, much stronger macro
// breakup, more matte, and noticeably more grain from the normal maps.
export const TERRAIN_LOOK_DEFAULTS = Object.freeze({
  // Overall albedo gain. Below 1 deepens the ground, above 1 lifts it.
  brightness: 0.91,
  // 0 is greyscale, 1 is authored, above 1 pushes the mineral colour.
  saturation: 1.06,
  // Pivots albedo around mid grey. Sand at this key flattens easily; a little
  // contrast is usually what makes ground read as surface rather than paper.
  contrast: 1.06,
  // Negative cools toward the sea light, positive warms toward iron sand.
  warmth: -0.2,
  // Scales the large-wavelength tonal/hue breakup that regions apply on top
  // of their tiled detail. This is the knob that stops open ground reading as
  // one flat sheet at a distance.
  macroVariation: 2.1,
  // Offsets the final roughness. Negative is glossier (wetter, more sheen),
  // positive is more matte. Grass and sand want to stay matte — see the
  // material notes about a 0.55 roughness floor.
  roughness: 0.23,
  // Scales the tangent-space normal strength each region derives from its NRH
  // maps. Low values flatten the surface; high values exaggerate grain.
  normalStrength: 1.75,

  // --- shaping knobs, neutral by default ------------------------------------
  // These change how the grade varies across a region rather than shifting it
  // uniformly, so they ship at 0 (or 1) and only do something once dialled.

  // Pushes steep faces toward exposed rock: desaturated and a little darker.
  // Sells cut banks and dune shoulders without authoring a separate layer.
  slopeTint: 0,
  // Tints with elevation over roughly the first 25m — negative cools the high
  // ground, positive warms it. A cheap way to separate shore from upland.
  heightTint: 0,
  // Aerial perspective for the ground plane itself: distant ground
  // desaturates and lifts slightly, so a long beach stops reading as one
  // continuous sheet of the same tan.
  distanceFade: 0,
  // Scales the tiled detail UVs. Below 1 makes the grain larger and calmer,
  // above 1 finer and busier. Currently read by Post Office Bay; other regions
  // opt in by multiplying their layer scales by uTerrainGradeShape.w.
  detailTiling: 1,
});

export const terrainLookTuning = { ...TERRAIN_LOOK_DEFAULTS, ...readStored() };

function readStored() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    return Object.fromEntries(
      Object.keys(TERRAIN_LOOK_DEFAULTS)
        .filter(key => Number.isFinite(parsed[key]))
        .map(key => [key, parsed[key]]),
    );
  } catch {
    // Private browsing or blocked storage must not break the runtime.
    return null;
  }
}

function persist() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(terrainLookTuning));
  } catch {
    // Non-fatal: the session keeps the values, they just do not survive reload.
  }
}

let revision = 0;
const listeners = new Set();

export function setTerrainLookTuning(patch) {
  let changed = false;
  for (const key of Object.keys(TERRAIN_LOOK_DEFAULTS)) {
    const value = patch[key];
    if (!Number.isFinite(value) || terrainLookTuning[key] === value) continue;
    terrainLookTuning[key] = value;
    changed = true;
  }
  if (!changed) return;
  revision += 1;
  persist();
  listeners.forEach(listener => listener());
}

export function resetTerrainLookTuning() {
  Object.assign(terrainLookTuning, TERRAIN_LOOK_DEFAULTS);
  revision += 1;
  persist();
  listeners.forEach(listener => listener());
}

export function subscribeTerrainLook(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTerrainLookRevision() {
  return revision;
}

// The tuned set, shaped for pasting straight into TERRAIN_LOOK_DEFAULTS.
export function terrainLookJson() {
  return JSON.stringify(terrainLookTuning, null, 2);
}

export function isTerrainLookDefault() {
  return Object.keys(TERRAIN_LOOK_DEFAULTS)
    .every(key => terrainLookTuning[key] === TERRAIN_LOOK_DEFAULTS[key]);
}
