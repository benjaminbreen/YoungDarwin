// Live-tunable shape of the scene-wide sky lighting (SceneEnvironment in
// ModelAsset.jsx). The base environment is a three-colour gradient — sky,
// horizon, ground — which lights a shaded face the same whichever way it turns
// around the vertical. These knobs add the two directional terms a real beach
// has: the bright circumsolar sky toward the sun, and sunlit sand bouncing
// light up from below. Both are baked into the environment map, which is
// regenerated only when the sky changes, so neither costs anything per frame.
//
// Only PBR materials (terrain, rocks, props, characters) read the environment;
// the cheap Phong vegetation does not, so nothing here removes existing fill.

export const ENVIRONMENT_LOOK_DEFAULTS = Object.freeze({
  // Peak radiance of the glow around the sun, before the time-of-day and
  // weather scaling. 0 disables it. Kept low on purpose: measured at Post
  // Office Bay (9 AM), 1.0 lifted open ground ~5% — up-facing terrain sees
  // the sun side of the sky too — on top of a look already tuned by eye.
  sunLobe: 0.4,
  // Falloff exponent of that glow. Low is a broad half-sky wash that mostly
  // separates sun-side from shade-side; high is a tight halo.
  sunLobeWidth: 3,
  // Strength of the warm light bounced up off sunlit sand. Lifts undersides
  // and the lower half of shaded faces, and leaves up-facing ground alone, so
  // it is the term that does the work: at 2 a shaded coat read ~18% brighter
  // while open ground moved ~1%.
  groundBounce: 2,
  // Overall weight of the sky light (the whole environment map) on PBR
  // surfaces, as a multiple of the shipped 0.1 (night) to 0.25 (day) range.
  // This is what fills cast shadows on open ground, which see the sky rather
  // than the sand. 1.5 measured at Post Office Bay (cloud shadows held off):
  // shaded rock ~+5%, open ground ~+3%, highlights unchanged, 9 AM and noon.
  skyFill: 1.5,
});

export const environmentLookTuning = { ...ENVIRONMENT_LOOK_DEFAULTS, ...readUrlOverrides() };

// `?noSkyShape` turns both directional terms off for one session, so look and
// perf:sweep can A/B them against the plain gradient.
function readUrlOverrides() {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).has('noSkyShape')
      ? { sunLobe: 0, groundBounce: 0 }
      : null;
  } catch {
    return null;
  }
}

let revision = 0;
const listeners = new Set();

export function setEnvironmentLookTuning(patch) {
  let changed = false;
  for (const key of Object.keys(ENVIRONMENT_LOOK_DEFAULTS)) {
    const value = patch[key];
    if (!Number.isFinite(value) || environmentLookTuning[key] === value) continue;
    environmentLookTuning[key] = value;
    changed = true;
  }
  if (!changed) return;
  revision += 1;
  listeners.forEach(listener => listener());
}

export function resetEnvironmentLookTuning() {
  Object.assign(environmentLookTuning, ENVIRONMENT_LOOK_DEFAULTS);
  revision += 1;
  listeners.forEach(listener => listener());
}

export function subscribeEnvironmentLook(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEnvironmentLookRevision() {
  return revision;
}
