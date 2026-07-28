// Live-tunable multipliers for the solar/golden-hour look. This tiny external
// store keeps both the WebGL lighting loop and the DOM glare overlay subscribed
// to the same values, so a dev-panel drag visibly updates both render paths.
export const SOLAR_LOOK_DEFAULTS = Object.freeze({
  // Scales the celestial golden-hour factor before it feeds the light rig,
  // sky shader, sun sprites, fog color, and exposure (clamped to 1 after
  // scaling, so >1 widens/strengthens the golden shoulders rather than
  // overdriving color lerps).
  goldenBoost: 0.75,
  // Scales the sun's sprite optics: aureole, corona glow, weather halo, veil
  // shimmer, lens flares, ring, streak, starburst. High because the ghost
  // flares are off by default (perf presets) — the halo family carries it.
  opticsIntensity: 0.65,
  // Scales the DOM screen-glare wash strength (the camera-facing bloom).
  glareIntensity: 1.1,
  // Multiplies outdoor tone-mapping exposure.
  exposureScale: 0.87,
});

export const solarLookTuning = { ...SOLAR_LOOK_DEFAULTS };

let revision = 0;
const listeners = new Set();

export function setSolarLookTuning(patch) {
  let changed = false;
  for (const key of Object.keys(SOLAR_LOOK_DEFAULTS)) {
    const value = patch[key];
    if (!Number.isFinite(value) || solarLookTuning[key] === value) continue;
    solarLookTuning[key] = value;
    changed = true;
  }
  if (!changed) return;
  revision += 1;
  listeners.forEach(listener => listener());
}

export function subscribeSolarLook(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSolarLookRevision() {
  return revision;
}
