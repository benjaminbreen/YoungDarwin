// Live-tunable bloom/vignette grade knobs, mirroring the solarLook store: the
// dev Performance panel drags these, and the PostFX composer subscribes so
// slider changes reach both the React-level Bloom props and the per-frame
// vignette drive without prop-drilling through the canvas tree.
// 2026-07-30 screenshot bake: much less bloom intensity with a lowered
// threshold (a faint wide glow instead of hot blobs) and a stronger,
// deeper-reaching vignette. 2026-11-02: bloom strength doubled back to 0.4.
export const POST_GRADE_DEFAULTS = Object.freeze({
  // Multiplies the computed bloom intensity (interior curves included).
  bloomIntensityScale: 0.4,
  // Added to the computed luminance threshold. Negative blooms more of the
  // scene; positive reserves bloom for only the hottest highlights.
  bloomThresholdShift: -0.13,
  // Multiplies the live time-of-day vignette darkness from colorGrade.js.
  // 0 disables the vignette entirely.
  vignetteStrength: 1.2,
  // VignetteEffect offset: how far from the edges the darkening reaches.
  vignetteOffset: 0.46,
  // Multiplies the time-of-day split tone from colorGrade.js (warm lit
  // faces and cool shade at dawn, amber and violet at dusk). 0 disables it.
  splitToneStrength: 1,
});

export const postGradeTuning = { ...POST_GRADE_DEFAULTS };

let revision = 0;
const listeners = new Set();

export function setPostGradeTuning(patch) {
  let changed = false;
  for (const key of Object.keys(POST_GRADE_DEFAULTS)) {
    const value = patch[key];
    if (!Number.isFinite(value) || postGradeTuning[key] === value) continue;
    postGradeTuning[key] = value;
    changed = true;
  }
  if (!changed) return;
  revision += 1;
  listeners.forEach(listener => listener());
}

export function subscribePostGrade(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPostGradeRevision() {
  return revision;
}
