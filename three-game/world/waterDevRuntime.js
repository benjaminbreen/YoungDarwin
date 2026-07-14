// Live-tunable water knobs, shared between the WaterDevPanel overlay (writes)
// and Water.jsx (reads every frame into shader uniforms). Enabled via
// /three?waterdev — the panel exists so water tuning happens with eyes on the
// live scene instead of screenshot round-trips. Once values are settled they
// get baked into these defaults and the shader constants.

// Baked from the user's live tuning session on 2026-07-13 (?waterdev panel).
export const WATER_DEV_DEFAULTS = {
  // -- reflection / highlight --------------------------------------------
  // Share of the planar (real mirrored scene) reflection vs the analytic sky
  // sheen where the mirror buffer is valid.
  planarShare: 1,
  // Normal-driven UV distortion of the planar reflection: higher = ripple
  // structure visibly breaks up the mirrored sky/clouds.
  reflDistort: 0.015,
  // Pull glancing highlights toward neutral blue-green (kills the violet
  // cast ACES/sky saturation pushes into the sheen).
  reflNeutralGrade: 0.68,
  // Steepness of the analytic sky gradient across reflection tilt: higher =
  // more hue/value variation between ripple facets.
  skyReflCurve: 2.2,
  // -- ripple structure ----------------------------------------------------
  octaveCoarse: 1.12,
  octaveMid: 0.54,
  octaveFine: 0.08,
  // Signed slope tint that makes the surface read rippled from high cameras.
  windTone: 0.04,
  // -- whitecaps ------------------------------------------------------------
  capDensity: 2.1,
  // Gerstner crest height where a cap ignites (metres of displacement).
  capCrest: 0.08,
  // Multiplier on the weather-wind gate (0 = never, ~2 = storm-dense).
  capWindMult: 1.65,
  // -- sun glint -------------------------------------------------------------
  // How far the reflected-sun lobe stretches along the glitter path at low
  // sun (1 = round blob, ~8 = long column).
  glintElongation: 4,
  // Width multiplier on the glitter-path corridor (plane + horizon disc).
  glintWidth: 1,
  // -- horizon haze (open-ocean disc) --------------------------------------
  // Stage 1: gentle mid-distance wash (keeps saturation).
  hazeStage1: 0.8,
  // Stage 2: steep bright melt confined to the last stretch before the
  // sea/sky line.
  hazeStage2: 1,
  // World-radius where the stage-2 melt begins (disc rim is ~157).
  hazeBandStart: 95,
};

export const waterDev = { ...WATER_DEV_DEFAULTS };

export function resetWaterDev() {
  Object.assign(waterDev, WATER_DEV_DEFAULTS);
}
