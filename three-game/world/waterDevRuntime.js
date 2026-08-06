// Live-tunable water knobs, shared between the WaterDevPanel overlay (writes)
// and Water.jsx (reads every frame into shader uniforms). Enabled via
// /three?waterdev — the panel exists so water tuning happens with eyes on the
// live scene instead of screenshot round-trips. Once values are settled they
// get baked into these defaults and the shader constants.

import { seaStateForZone } from './seaState';

// Baked from the user's live tuning sessions (?waterdev panel): 2026-07-13,
// re-tuned end to end on 2026-08-03, again on 2026-08-04, and again on
// 2026-08-05 — the first pass judged against working refraction, since the
// grab had been silently skipped under post-processing until then.
export const WATER_DEV_DEFAULTS = {
  // -- reflection / highlight --------------------------------------------
  // Share of the planar (real mirrored scene) reflection vs the analytic sky
  // sheen where the mirror buffer is valid.
  planarShare: 0.52,
  // Visibility floor for reflected scene objects (Darwin, ship, shore) where
  // the mirror buffer has coverage — lets silhouettes read past the physical
  // ~2% down-look fresnel. 0 = physical only.
  objectMirror: 0.3,
  // Normal-driven UV distortion of the planar reflection: higher = ripple
  // structure visibly breaks up the mirrored sky/clouds. At 0 the mirror is a
  // razor-sharp copy that sits on top of the surface instead of dissolving
  // into it, which is what made a swimmer's reflection read as a cut-out.
  reflDistort: 0.12,
  // Pull glancing highlights toward neutral blue-green (kills the violet
  // cast ACES/sky saturation pushes into the sheen).
  reflNeutralGrade: 0.22,
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
  octaveCoarse: 0.2,
  octaveMid: 0.08,
  octaveFine: 0.02,
  // Signed slope tint that makes the surface read rippled from high cameras.
  windTone: 0.2,
  // -- wave form -------------------------------------------------------------
  // Multipliers on the authored Gerstner bank, so 1 is the shipped sea and the
  // per-zone sea state (seaState.js) still scales underneath them.
  waveAmp: 1.2,
  waveLength: 2.34,
  // Phase speed. The bank is dispersive — sqrt(9.8 * wavenumber) — so long
  // waves already travel faster than short ones; this scales the whole clock.
  waveSpeed: 0.88,
  // Trochoid pinch: 0 is a plain sine, 1 a cusped Gerstner crest. Summed
  // steepness past ~1 makes the surface self-intersect.
  waveSteepness: 0.72,
  // Wind sea: the three short chop waves, which ride weather wind on top of
  // the swell. Chop keeps its own short wavelengths — it does not lengthen
  // with swell, so this is the knob for surface texture rather than size.
  chopAmp: 0.85,
  chopLength: 1.25,
  // Height of the rhythmic swash riding up the beach face. The 0.5984 rad/s
  // clock is shared with every region's terrain foam and the ecology splash
  // periods, so the rate is deliberately not tunable here.
  swashHeight: 0.12,
  // How much swell survives into the shallows. 0 flattens the water at the
  // waterline; 1 keeps full amplitude right up the beach.
  swellShoreFloor: 0.66,

  // -- ripple detail (the per-pixel normal, not the vertex bank) -------------
  // Feature size and drift of the three shared normal octaves. Scale above 1
  // shrinks the ripples; the tile is 256px and repeats, which is what the
  // domain warp exists to hide.
  rippleScale: 0.43,
  rippleSpeed: 0.82,
  rippleWarp: 2.56,
  // Gain on the short-wave octaves the polished and cinematic tiers add.
  rippleShort: 0.07,

  // -- whitecaps ------------------------------------------------------------
  capDensity: 1.6,
  // Gerstner crest height where a cap ignites (metres of displacement).
  capCrest: 0.245,
  // Multiplier on the weather-wind gate (0 = never, ~2 = storm-dense).
  capWindMult: 2.7,
  // -- foam ------------------------------------------------------------------
  // The Worley lace every foam source is textured with. Scale is feature size
  // (~1.5m at 0.8, so foam reads as streaks rather than speckle), drift is how
  // fast it advects, and contrast is the width of the smoothstep window that
  // turns it into structure: narrow is a lattice of holes and filaments, wide
  // is grey mist.
  foamScale: 2.64,
  foamDrift: 4,
  foamContrast: 0.98,
  // How far the tiered lace (torn cells, bubble webs, fine filaments) replaces
  // the two-octave base. Cinematic uses this x1.31.
  foamDetail: 0.36,
  // The surf front's profile, from its leading edge backwards: a solid core, a
  // lip that is mostly lace-driven, a torn dissolving trail, and a soft spray
  // halo with no hard edge. Weighting is what separates real surf from a
  // painted ribbon — a wide flat lip is what makes it read as a decal.
  foamCore: 0.14,
  foamLipLace: 0.54,
  foamTrail: 1.18,
  foamHaze: 0.44,
  // Widths of the same three bands, as multipliers on the authored profile.
  foamCoreWidth: 0.3,
  foamLipWidth: 1,
  foamTrailWidth: 2.75,
  // Boiling whitewater and torn wake behind a collapsing crest (polished and
  // cinematic only).
  foamBoil: 0.2,
  // Gain on the shore group — the swash lip, the waterline trace and the sand
  // contact rim — separately from the breaking surf offshore.
  foamShore: 1.05,

  // -- foam · shore ribbon ---------------------------------------------------
  // The shore foam is TWO layers. Everything above is the water plane; this is
  // the surf ribbon, a second pass over the same 150m mesh that draws the
  // swash lines, the sand contact rim and a broad wash sheet. None of it had a
  // knob, which is why the wide pale band over the shallows could not be
  // adjusted from the panel at all.
  //
  // The swash lines: a solid lip at the marching waterline plus a laced outer
  // set line, both riding the shared 0.5984 rad/s clock.
  ribbonSwash: 0.95,
  ribbonSwashWidth: 1,
  // The wash sheet — the broad, low-contrast pale film left behind between the
  // swash and the sand. This is the widest thing the ribbon draws, and the
  // usual suspect for a shelf that reads as a flat sheet rather than as foam.
  // Reach is how far out it runs, in metres of shore distance.
  ribbonWash: 2.5,
  ribbonWashReach: 9.15,
  // The crisp line where water meets sand.
  ribbonContact: 1.75,
  // Overall opacity of the whole ribbon layer. Drag to 0 to see what the water
  // plane alone is drawing.
  ribbonAlpha: 0.32,

  // -- sun glint -------------------------------------------------------------
  // How far the reflected-sun lobe stretches along the glitter path at low
  // sun (1 = round blob, ~8 = long column).
  glintElongation: 13.25,
  // Width multiplier on the glitter-path corridor (plane + horizon disc).
  glintWidth: 3.1,
  // Overall brightness of everything the sun writes on the water: the specular
  // sparkle, the glitter column and its flecks. The old path term was pinned
  // at 0.16 in the shader with no way to reach it, which is why a low sun
  // could never build the blazing sheet a real sunset lays across the sea.
  glintStrength: 2.25,
  // How far the glitter column runs before distance fades it out. 1 keeps the
  // historical 8-180m window; higher pushes the bright sheet toward the
  // horizon, which is what makes a sunset read as wide rather than as a spot.
  glintReach: 2.9,
  // Gain on the analytic reflected sun disc (the mirrored sun itself, distinct
  // from the facet sparkle around it).
  sunDiscGain: 0.2,
  // -- horizon haze (open-ocean disc) --------------------------------------
  // Stage 1: gentle mid-distance wash (keeps saturation).
  hazeStage1: 0.34,
  // Stage 2: steep bright melt confined to the last stretch before the
  // sea/sky line.
  hazeStage2: 0.5,
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
  rampPaleMix: 0.1,        // uSand -> uFoam, the waterline
  rampShelfMix: 0.44,      // uSand -> uScatter, the sunlit shelf
  rampShelfGreen: 0.06,  // how far the shelf pushes toward green
  rampMidMix: 0.94,      // uScatter -> uDeep, the turquoise body
  // Depths (metres) where each stop is fully reached. Must ascend.
  rampDepthPale: 0.95,
  rampDepthShelf: 2.05,
  rampDepthMid: 8.8,
  rampDepthDeep: 13,
  // Opacity of the ramp over the refracted scene. Shallow water is a thin
  // glaze — you should see the sand through it — and deep water is opaque.
  // The old shader used one fixed value for both and faked depth with extra
  // colour mixes, which is what made the drop-off read as paint.
  rampGlaze: 0.08,
  rampOpaque: 0.34,
  rampOpaqueDepth: 17,
  // Distance-driven deepening, applied as a bias on the ramp's input depth
  // rather than as another colour mix. A wide shallow bay still travels toward
  // blue with distance, but it travels along the authored ramp.
  rampEdgeBias: 8.2,
  rampOffshoreBias: 4.2,
  // Whole-body grade, after the ramp.
  rampSaturation: 1.34,
  rampBrightness: 1.32,

  // -- clarity: how far you can see INTO the water from above ----------------
  // Per-metre extinction of the water column (Beer-Lambert). Clear seawater is
  // roughly 0.35/0.05/0.02 for red/green/blue: the warm end dies first, which
  // is the whole colour cue. Weather stirs all three upward.
  absorbRed: 0.5,
  absorbGreen: 0.09,
  absorbBlue: 0.03,
  // 0 = absorption walks the vertical drop only (the old model, which
  // under-counts a slant look); 1 = it walks the true refracted path, which
  // Snell caps at ~1.51x the drop however low the camera gets.
  clarityPath: 0.56,
  // How hard a steep look-down suppresses the painted depth ramp. 0 = the
  // glaze sits over the water at every angle, which is what made a knee-deep
  // shelf read as flat colour from a standing camera.
  clarityGlazeAngle: 0.74,
  // How much of the pixel is the refracted seabed rather than painted body,
  // at the waterline and in deep water, and the depth where the deep value is
  // reached.
  captureShallow: 0.32,
  captureDeep: 0.3,
  captureDepth: 3.3,
  // Mirror strength in shallow and deep water. Grazing angles are what
  // legitimately hide a sandbar from a beach-level camera; holding the shallow
  // value down removes the only honest reason shallow water goes opaque.
  reflShallow: 0.65,
  reflDeep: 0.92,

  // -- body model: what the water colour is actually made of -----------------
  // Crossfade to a single Beer-Lambert blend: bed x transmittance + the
  // authored ramp colour x (1 - transmittance), and nothing else. The stacked
  // model (0) paints the ramp over an already-composited pixel, so the bed,
  // the ramp, the in-scatter and the sky reflection all add into the same
  // pixel and average out to flat bright colour — the "milk" read.
  bodyPhysical: 0.5,
  // Strength of the in-scatter add (the uScatter term). 1 is the historical
  // amount. This is a flat add proportional to depth, which is exactly how you
  // paint fog onto a surface, so it is the first thing to pull down.
  scatterAdd: 0.6,
  // 1 keeps the palette's full-saturation scatter colour; lower desaturates
  // what gets added, which is what stops the body reading as pool paint.
  scatterSat: 1,
  // How much daylight drives the in-scatter. 0 = constant (historical), 1 =
  // scales with the sun, so shade and dusk stop glowing.
  scatterSun: 0.56,
  // Lift applied to dark basalt in very shallow water so it does not read as a
  // hole in the sea. It also deletes the one high-contrast cue that proves the
  // water is clear, so it is worth seeing at 0.
  darkLift: 0.64,

  // -- underwater: the view from below --------------------------------------
  // Floor on the underwater treatment, and the panel's tuning override.
  //
  // A swimmer floats with the camera a few centimetres above the waterline, so
  // the whole underwater treatment — window, mirror, shafts, particulate,
  // visibility — is off in normal play and every knob below it reads as broken
  // until you drag this up.
  //
  // Ships at 0 and should stay there. Above 0.001 the underwater post effect
  // stops taking its early-out and runs a full-screen pass every frame, and
  // the Snell block in the water shader runs on every water pixel from above
  // as well, with its two grab reads. The trace of it that looked good on land
  // is `seaAir` below, which buys the same tint for nothing.
  uwForce: 0,
  // Sea air: how much of the submerged grade and fog colour survives above the
  // waterline. Fed only to the colour grade and the fog — both already computed
  // every frame — so unlike uwForce it adds no per-pixel work at all.
  seaAir: 0.05,
  // Horizontal visibility in metres. Set from the zone's authored sea state on
  // every travel (see seaState.js), so the slider always starts at what this
  // map ships with.
  uwClarity: 12,
  // Water path applied to the sky seen through Snell's window. The depth
  // buffer puts the sky at the far plane, so without a separate number the
  // window fogs flat and the brightest thing in an underwater frame is lost.
  uwSkyDepth: 10,
  // Snell's window: everything above the surface arrives inside a cone about
  // the vertical, and past the critical angle the surface is a mirror of the
  // seabed. cos(48.6deg) = 0.661 is the physical rim; lower widens the window.
  uwCritical: 0.661,
  uwSoft: 0.085,
  // Surface opacity inside the window and out in the mirror.
  uwWindowAlpha: 0.3,
  uwMirrorAlpha: 0.72,
  // How much of the mirror is a real sample of the seabed rather than flat
  // water colour, how far down-screen that sample is pulled, and how hard the
  // wave normal breaks both samples up.
  uwMirrorGrab: 0,
  uwMirrorOffset: 0.14,
  uwWobble: 0.16,
  // Light falls off with depth, not just with distance. The submerged fog is
  // distance-only, which is why every underwater frame is one flat tint: how
  // far down you are makes no difference to it at all.
  uwDepthDim: 0.84,
  uwDepthRange: 8.5,
  // Sun shafts, anchored to where the sun actually is on screen rather than to
  // the top of the frame — so they swing when you turn.
  uwShaft: 0.5,
  uwShaftLength: 0.62,
  // Suspended particulate. Density is cells per screen, drift is how fast each
  // mote wanders inside its cell.
  uwMotes: 2.7,
  uwMoteSize: 0.12,
  uwMoteDrift: 1.66,
  // Multiplier on the seabed caustics (Terrain.jsx owns the effect; light
  // belongs on the sand). 1 is the historical strength.
  uwCaustics: 0.95,

  // -- seam to the open ocean ------------------------------------------------
  // How far back from the plane's rim its surface detail — whitecaps and crest
  // banding — starts converging on the flat disc beyond. The alpha crossfade
  // rides the same number at roughly half the distance. The old ramp was 12m,
  // which is short enough that wave structure visibly stopped along a line out
  // in the bay; the plane and the disc now agree well before they cross over.
  seamFadeWidth: 18,
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
  deepTravelWidth: 54,
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

// Per-zone overrides on the defaults above, in the same spirit as seaState:
// a map that is absent from this table gets the shipped water byte for byte.
// Only the keys that actually differ are listed, so the intent of each zone's
// look stays readable next to the baseline.
//
// zoneId -> partial WATER_DEV_DEFAULTS.
//
// The reef entry below is the kind this table is for: the ramp stops are
// authored in metres of depth, and Northwest Reef's shelf spans about two
// metres where Post Office Bay spans fifteen. Against the shared stops the
// whole reef sat inside the ramp's first segment and rendered as one flat pale
// tone. This is bathymetry, not a workaround — unlike the override deleted on
// 2026-08-05, which was compensating for a broken refraction grab.
const WATER_ZONE_LOOKS = Object.freeze({
  NW_REEF: Object.freeze({
    // The same authored gradient, compressed onto the shelf's real range: pale
    // at the swash, turquoise by waist depth, blue arriving at the drop-off.
    rampDepthPale: 0.35,
    rampDepthShelf: 0.9,
    rampDepthMid: 1.8,
    rampDepthDeep: 12.9,
    // Distance biases are calibrated against a bay that keeps deepening. Here
    // they would drag a two-metre shelf to open-ocean blue within a few metres
    // of the beach.
    rampEdgeBias: 2.2,
    rampOffshoreBias: 1.2,
    rampSaturation: 0.9,
    // The shallows cover most of the map, so the foam apron that reads as
    // punctuation at the bay reads as a white sheet here.
    ribbonAlpha: 0.44,
    ribbonWashReach: 9.4,
    foamShore: 0.6,
  }),
});

export const waterDev = { ...WATER_DEV_DEFAULTS };

// Same object the ?waterdev panel writes, reachable from an automated browser
// session so a screenshot harness can A/B a knob without a rebuild.
if (typeof window !== 'undefined') window.__waterDev = waterDev;

let activeZoneId = null;

export function waterZoneLook(zoneId) {
  return WATER_ZONE_LOOKS[zoneId] || null;
}

// What the current zone ships with. The panel measures "dirty" against this,
// not against the baseline — in an overridden zone every one of its authored
// keys would otherwise read as an unsaved edit.
export function waterZoneBaseline() {
  return zoneDefaults(activeZoneId);
}

// Underwater visibility is authored next to swell in seaState, not here, but
// the panel has to be able to drag it — so the zone's value is copied in on
// travel and the slider starts at what this map ships with.
function zoneDefaults(zoneId) {
  return {
    ...WATER_DEV_DEFAULTS,
    uwClarity: seaStateForZone(zoneId).clarity,
    ...(WATER_ZONE_LOOKS[zoneId] || {}),
  };
}

// Called on every zone change. Panel edits are deliberately discarded on
// travel: the knobs describe one map's water, not a global session state.
export function applyWaterZoneLook(zoneId) {
  activeZoneId = zoneId;
  Object.assign(waterDev, zoneDefaults(zoneId));
}

// "Reset" in the panel means back to what this zone ships with, not back to
// the baseline — otherwise resetting in an overridden zone would silently
// change which water you are looking at.
export function resetWaterDev() {
  Object.assign(waterDev, zoneDefaults(activeZoneId));
}
