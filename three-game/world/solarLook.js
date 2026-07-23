// Live-tunable multipliers for the solar/golden-hour look, read every frame
// by SkyController and dragged at runtime from the dev Performance panel.
// The values here ARE the shipped look (1 = the pre-tuning baseline);
// current defaults come from the 2026-07 screenshot pass.
export const solarLookTuning = {
  // Scales the celestial golden-hour factor before it feeds the light rig,
  // sky shader, sun sprites, fog color, and exposure (clamped to 1 after
  // scaling, so >1 widens/strengthens the golden shoulders rather than
  // overdriving color lerps).
  goldenBoost: 1.25,
  // Scales the sun's sprite optics: aureole, corona glow, weather halo, veil
  // shimmer, lens flares, ring, streak, starburst. High because the ghost
  // flares are off by default (perf presets) — the halo family carries it.
  opticsIntensity: 2.4,
  // Scales the DOM screen-glare wash strength (the camera-facing bloom).
  glareIntensity: 1.1,
  // Multiplies outdoor tone-mapping exposure.
  exposureScale: 1,
};
