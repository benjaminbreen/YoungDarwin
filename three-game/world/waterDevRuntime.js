// Live-tunable water knobs, shared between the WaterDevPanel overlay (writes)
// and Water.jsx (reads every frame into shader uniforms). Enabled via
// /three?waterdev — the panel exists so water tuning happens with eyes on the
// live scene instead of screenshot round-trips. Once values are settled they
// get baked into these defaults and the shader constants.

// Baked from the user's live tuning sessions (?waterdev panel): 2026-07-13,
// re-tuned end to end on 2026-08-03, then again on 2026-08-04.
export const WATER_DEV_DEFAULTS = {
  // -- reflection / highlight --------------------------------------------
  // Share of the planar (real mirrored scene) reflection vs the analytic sky
  // sheen where the mirror buffer is valid.
  planarShare: 0.68,
  // Visibility floor for reflected scene objects (Darwin, ship, shore) where
  // the mirror buffer has coverage — lets silhouettes read past the physical
  // ~2% down-look fresnel. 0 = physical only.
  objectMirror: 0.3,
  // Normal-driven UV distortion of the planar reflection: higher = ripple
  // structure visibly breaks up the mirrored sky/clouds. At 0 the mirror is a
  // razor-sharp copy that sits on top of the surface instead of dissolving
  // into it, which is what made a swimmer's reflection read as a cut-out.
  reflDistort: 0.04,
  // Pull glancing highlights toward neutral blue-green (kills the violet
  // cast ACES/sky saturation pushes into the sheen).
  reflNeutralGrade: 0.24,
  // Steepness of the analytic sky gradient across reflection tilt: higher =
  // more hue/value variation between ripple facets.
  skyReflCurve: 9,
  // How much of the plane's sky-reflection strength the open-ocean disc gets.
  // The disc had no view-dependent term at all before, so the far sea could
  // only brighten by being melted into fog; 1 = the disc reflects exactly as
  // hard as the plane does in deep water, which is what keeps the seam
  // continuous. Lower it to hold the horizon down.
  discSky: 1,
  // -- ripple structure ----------------------------------------------------
  octaveCoarse: 0.26,
  octaveMid: 0.14,
  octaveFine: 0.06,
  // Signed slope tint that makes the surface read rippled from high cameras.
  windTone: 0.19,
  // -- whitecaps ------------------------------------------------------------
  capDensity: 1.4,
  // Gerstner crest height where a cap ignites (metres of displacement).
  capCrest: 0.135,
  // Multiplier on the weather-wind gate (0 = never, ~2 = storm-dense).
  capWindMult: 2.85,
  // -- sun glint -------------------------------------------------------------
  // How far the reflected-sun lobe stretches along the glitter path at low
  // sun (1 = round blob, ~8 = long column).
  glintElongation: 14,
  // Width multiplier on the glitter-path corridor (plane + horizon disc).
  glintWidth: 2.2,
  // Overall brightness of everything the sun writes on the water: the specular
  // sparkle, the glitter column and its flecks. The old path term was pinned
  // at 0.16 in the shader with no way to reach it, which is why a low sun
  // could never build the blazing sheet a real sunset lays across the sea.
  glintStrength: 0.8,
  // How far the glitter column runs before distance fades it out. 1 keeps the
  // historical 8-180m window; higher pushes the bright sheet toward the
  // horizon, which is what makes a sunset read as wide rather than as a spot.
  glintReach: 2.55,
  // Gain on the analytic reflected sun disc (the mirrored sun itself, distinct
  // from the facet sparkle around it).
  sunDiscGain: 0.35,
  // -- horizon haze (open-ocean disc) --------------------------------------
  // Stage 1: gentle mid-distance wash (keeps saturation).
  hazeStage1: 0.36,
  // Stage 2: steep bright melt confined to the last stretch before the
  // sea/sky line.
  hazeStage2: 0.54,
  // World-radius where the stage-2 melt begins (disc rim is ~157).
  hazeBandStart: 70,

  // -- depth colour ----------------------------------------------------------
  // One authored ramp owns the body colour at every depth.
  //
  // It used to own only the shelf: the four-stop ramp was windowed out past
  // ~2.7-6.5m, and everything deeper was the sum of three further mixes toward
  // uDeep on overlapping masks. Nothing authored the colour of deep water — it
  // was wherever those mixes happened to land — which is the main reason the
  // bay read as a painted gradient with a step in it.
  //
  // The stops are blends of the existing palette rather than absolute colours,
  // so the ramp still follows the day/night lerp instead of freezing the water
  // at one time of day.
  //
  // Blend positions for each stop:
  rampPaleMix: 0,        // uSand -> uFoam, the waterline
  rampShelfMix: 0.52,      // uSand -> uScatter, the sunlit shelf
  rampShelfGreen: 0.26,  // how far the shelf pushes toward green
  rampMidMix: 0.74,      // uScatter -> uDeep, the turquoise body
  // Depths (metres) where each stop is fully reached. Must ascend.
  rampDepthPale: 1.32,
  rampDepthShelf: 2.85,
  rampDepthMid: 3.6,
  rampDepthDeep: 10.4,
  // Opacity of the ramp over the refracted scene. Shallow water is a thin
  // glaze — you should see the sand through it — and deep water is opaque.
  // The old shader used one fixed value for both and faked depth with extra
  // colour mixes, which is what made the drop-off read as paint.
  rampGlaze: 0.46,
  rampOpaque: 0.42,
  rampOpaqueDepth: 17.5,
  // Distance-driven deepening, applied as a bias on the ramp's input depth
  // rather than as another colour mix. A wide shallow bay still travels toward
  // blue with distance, but it travels along the authored ramp.
  rampEdgeBias: 5.6,
  rampOffshoreBias: 3.5,
  // Whole-body grade, after the ramp.
  rampSaturation: 1.28,
  rampBrightness: 1.32,

  // -- seam to the open ocean ------------------------------------------------
  // How far back from the plane's rim its surface detail — whitecaps and crest
  // banding — starts converging on the flat disc beyond. The alpha crossfade
  // rides the same number at roughly half the distance. The old ramp was 12m,
  // which is short enough that wave structure visibly stopped along a line out
  // in the bay; the plane and the disc now agree well before they cross over.
  seamFadeWidth: 17,
  // Width (m) of the alpha crossfade itself, where the plane dissolves into
  // the disc. This used to be derived from seamFadeWidth and applied to the
  // plane only — the disc's matching fade-in was hardcoded at 58..74m, so the
  // two sides of the same crossfade could not be kept in step and one always
  // showed through the other. Both now ride this number.
  seamBlend: 11,
  // Radial jitter (m) on the seam boundary, from a slow world-space noise.
  // Both surfaces sample the same field, so they stay matched — it just stops
  // the handoff from being a geometrically perfect circle, which is the thing
  // the eye actually locks onto.
  seamNoise: 9,

  // Travel from the bay's own colour to the disc's deep blue. This is the
  // gradient that reads as a band of darker water offshore, and before it was
  // exposed here it was a hardcoded 30m ramp on the raw radius — a perfect
  // circle centred on the world origin, which is what made the bay/open-sea
  // boundary look like a drawn line rather than a change in the water.
  //
  // How far back from the plane's rim (75m) the travel begins. Wider = the bay
  // gives up its colour over a longer approach.
  deepTravelWidth: 50,
  // How far toward the disc's colour it goes. This has to stay high: the two
  // surfaces have to agree on colour before the alpha crossfade, or the arc
  // comes back as a hard cyan/navy edge.
  deepTravelAmount: 0.85,
  // How much the onset wanders (m), on two noise fields. This is the knob that
  // actually kills the "graphical line" read — a broken front is unreadable as
  // geometry in a way no amount of softening achieves. The wander is faded out
  // before the crossfade so it can never strand bay colour in the handoff.
  deepTravelNoise: 8,
};

export const waterDev = { ...WATER_DEV_DEFAULTS };

// Same object the ?waterdev panel writes, reachable from an automated browser
// session so a screenshot harness can A/B a knob without a rebuild.
if (typeof window !== 'undefined') window.__waterDev = waterDev;

export function resetWaterDev() {
  Object.assign(waterDev, WATER_DEV_DEFAULTS);
}
