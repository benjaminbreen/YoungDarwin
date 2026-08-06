'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore, getRuntimePlayerPose } from '../../store';
import { getRegionMap } from '../../../game-core/regionMaps';
import { terrainHeight } from '../../world/terrain';
import {
  getStandingWaterRenderingConfig,
  standingWaterMaskAt,
} from '../../world/standingWaterRendering';
import {
  prepareWaterTextureResource,
  readWaterTextureResource,
  waterTextureResourceIsReady,
} from '../../world/waterTextureResource';
import { regionTypeRendersDetailedWater } from '../../world/waterTextureManifest';
import {
  REFLECTION_LAYER,
  markReflectionSceneDirty,
  syncReflectionLayers,
} from '../../world/waterReflectionRuntime';
import { sunDirection, skyState } from '../../world/celestial';
import { WATER_LEVEL } from '../../world/water';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { applyWaterZoneLook, waterDev } from '../../world/waterDevRuntime';
import { onPropEvent } from '../../physics/props/propEvents';
import { getZonePropWaterInfluences } from '../../physics/props/propRuntime';
import {
  cliffCalmEllipseForZone,
  cliffSwellForZone,
} from '../../world/cliffSurfProfiles';
import { seaStateForZone } from '../../world/seaState';

// ---------------------------------------------------------------------------
// Stylized tropical water.
//
// The clear-shallows look is built on three pillars:
//   1. A baked seafloor depth texture (cheaper than a GPU depth pre-pass and
//      readable in the vertex stage) drives colour, fade, foam and swash.
//   2. Screen-space refraction: right before the water mesh draws (after all
//      opaque geometry), the framebuffer is grabbed with one
//      copyFramebufferToTexture, then sampled with normal-distorted UVs and
//      Beer-Lambert tinting. The bottom visibly wobbles through the surface
//      instead of being hidden by alpha — and no second scene render is paid.
//   3. Per-pixel normals: vertices carry only the (3-wave) Gerstner
//      displacement for silhouette; the shading normal is re-evaluated
//      analytically per fragment plus scrolling detail ripples, so the
//      surface is glassy at any tessellation (no faceted diamonds).
// Caustics live in the terrain shader (light belongs on the sand, not on the
// surface) — see injectTerrainRenderingExtensions in Terrain.jsx.
// ---------------------------------------------------------------------------

// Tunables
const WATER_SIZE = 150;       // side length of the detailed water plane
const WATER_SEGMENTS = 128;   // vertex displacement only -> modest mesh is enough
const BAKE_RES = 512;         // seafloor depth-texture resolution
const REFLECTION_RES = 512;   // rigging needs enough coverage to stay stable in motion
const REFLECTION_MIN_INTERVAL = 2; // moving camera: refresh often enough to feel attached
const REFLECTION_STATIC_INTERVAL = 8; // static camera: keep animated silhouettes current
// The mirror texture and its projection matrix must follow every meaningful
// camera transform. The old 8cm / ~2.6deg gates made a walking camera reuse a
// stale projection for several rendered frames, then visibly snap forward —
// but the replacement 2mm / 1e-8 gates sat below camera float noise, so an
// "idle" camera still counted as moving and refreshed the mirror every frame.
// 2cm / ~0.3deg (1-|q.q'| ~ theta^2/8) is 4x/9x finer than the thresholds
// that snapped, while letting a genuinely settled camera coast on the
// static-interval cadence.
const REFLECTION_CAMERA_MOVE_SQ = 0.02 * 0.02;
const REFLECTION_CAMERA_ROT_DELTA = 3e-6;
const REFLECTION_TIME_DELTA = 0.035; // in-game hours
// Toggle this off to remove all event-driven player ripple disturbance from
// the open-ocean shader without touching standing-water/lagoon rendering.
const ENABLE_OCEAN_PLAYER_RIPPLES = true;
// Crisp expanding-ring meshes on the ocean (the standing-water ripple look).
// Spawns are pushed here by the same gated handler that feeds the in-shader
// ripples; OceanContactRipples drains it each frame. The rings ride the
// Gerstner swell via uWaveTime, which Water's frame loop keeps in sync with
// the surface plane's clock.
const OCEAN_RING_COUNT = 28;
const oceanRingQueue = [];
const oceanRingWaveTime = { value: 0 };
// The rings ride the same wave bank as the surface plane, so they need the
// live sea-state values. WaterSurface owns them; this is the hand-off, since
// OceanContactRipples is a sibling with no access to the zone config.
const oceanRingBank = {
  cliffSwell: 0,
  cliffCalmEllipse: new THREE.Vector4(),
  swell: 1,
  swellLen: 1,
  chopSea: 1,
  breakers: 1,
  crestNorm: 1,
  chopWind: 0.2,
};
const dummy = new THREE.Object3D();
const OCEAN_PLAYER_RIPPLE_COUNT = 14;
const WATER_BODY_INFLUENCE_COUNT = 8;
const WATER_CONTACT_DISTANCE_RANGE = 3.2;
const WATER_CONTACT_RES = 256;
// Height range packed into the depth texture's red byte: [HMIN, HMIN + HSPAN].
// One byte over the range, so the step is HSPAN/255 — 27mm here. That matters
// because the horizontal width of a step is the step divided by the seabed
// slope: on a 1-in-29 shelf a 35mm step (the old 9m span) terraced every metre,
// wider than a bake texel, and every depth-keyed term drew a contour on each
// tread. The span only has to cover seabed and the shoreline, not dry land.
// Must stay identical to waterBakeData.js or every shipped bake decodes wrong.
const HMIN = -6.0;
const HSPAN = 7.0;

const WATER_QUALITY = {
  // Polished/cinematic refresh the mirror every frame while it is dynamic and
  // every 4th when idle. The "near-free" measurement behind that cadence
  // predates the layer-mask mirror pass; it is affordable now because each
  // refresh no longer sweeps the scene graph, not because a full-rate mirror
  // was ever free. Performance (mobile) halves the moving cadence — under
  // ripple distortion a 2-frame-old mirror is not readable as lag.
  performance: {
    bakeRes: 256,
    segments: 64,
    // 512 matches polished: the mirror mostly holds Darwin and the ship, and
    // 384 visibly softened their silhouettes for a texel saving the clear/
    // draw of this tiny pass never needed.
    reflectionRes: 512,
    reflectionSamples: 2,
    reflectionMinInterval: 2,
    reflectionStaticInterval: 4,
    detailTier: 0,
    contactRes: 1,
  },
  polished: {
    // Polished keeps the cinematic surf choreography and optical shaping, but
    // trims the costliest fine-normal, foam, refraction, and glitter samples.
    bakeRes: 384,
    segments: WATER_SEGMENTS,
    // Do NOT raise reflectionMinInterval here. The mirror is a full second
    // render of the world and halving its cadence is the obvious saving, but
    // a mirror that updates on alternate frames reads as a glitchy stutter on
    // the water surface however much the ripple distorts it. Resolution is
    // the safe axis; frequency is not.
    reflectionRes: 384,
    reflectionSamples: 2,
    reflectionMinInterval: 1,
    reflectionStaticInterval: 4,
    detailTier: 1,
    contactRes: 1,
  },
  cinematic: {
    bakeRes: BAKE_RES,
    segments: 160,
    reflectionRes: 640,
    // Keep the known-good 2x resolve used by polished water. ANGLE on macOS
    // can reject Three's 4x color resolve when the private MSAA framebuffer's
    // depth attachment differs from the texture-backed target, even with
    // resolveDepthBuffer disabled. At 640px the water distortion and linear
    // sampling hide the small edge-quality difference; the cinematic shader,
    // contact field, and higher reflection resolution remain unchanged.
    reflectionSamples: 2,
    reflectionMinInterval: 1,
    reflectionStaticInterval: 4,
    // Each tier compiles its own feature budget: cinematic is the full path,
    // polished keeps a curated subset, and performance pays for neither.
    detailTier: 2,
    contactRes: WATER_CONTACT_RES,
  },
};

function waterQualityConfig(quality) {
  return WATER_QUALITY[quality] || WATER_QUALITY.polished;
}

function waterShaderDefines(qualityConfig) {
  const defines = {};
  if (qualityConfig.detailTier >= 1) defines.ENHANCED_WATER = 1;
  if (qualityConfig.detailTier >= 2) defines.CINEMATIC_WATER = 1;
  return defines;
}

const WATER_DAY = {
  sand: new THREE.Color('#aed6e2'),
  // Rich tropical palette: lagoon teal handing off to deep blue. Kept a notch
  // below full-saturation cyan — the electric pool-blue read comes from the
  // scatter colour, not the ramps.
  scatter: new THREE.Color('#3cb0c4'),
  deep: new THREE.Color('#2476a8'),
  openDeep: new THREE.Color('#125c92'),
  // Slightly blue-grey: pure white foam over a bright sea is what blows out.
  foam: new THREE.Color('#e9f4f0'),
};

const WATER_CLEAR_MORNING = {
  // Dawn light hits the water before the sky has reached the clean noon blue.
  // Pull that window toward a calmer Galapagos blue-green so low-sun glints
  // do not turn the lagoon into electric cyan/violet.
  scatter: new THREE.Color('#58aebd'),
  deep: new THREE.Color('#2d7198'),
  openDeep: new THREE.Color('#16547f'),
};

const WATER_NIGHT = {
  sand: new THREE.Color('#172b37'),
  scatter: new THREE.Color('#123f55'),
  deep: new THREE.Color('#081b2d'),
  openDeep: new THREE.Color('#05111f'),
  // Foam reflects the night sky; it should read as cool moving water rather
  // than a self-lit white ribbon. Moon-facing crest cores get a separate lift
  // in the shader, so the base can remain a restrained slate blue.
  foam: new THREE.Color('#71899d'),
};

const WATER_STORM = {
  sand: new THREE.Color('#6f9aa4'),
  scatter: new THREE.Color('#287f92'),
  deep: new THREE.Color('#255a75'),
  openDeep: new THREE.Color('#173d58'),
  foam: new THREE.Color('#c1d3d1'),
};

// Metres of shoreline distance packed into the depth texture's green byte.
// Surf lives well inside this range; clamping beyond it is harmless.
const SHORE_DIST_RANGE = 60;

// Shared wave bank: three crossing swells for a calm tropical bay. The vertex
// stage uses the displacement; the fragment stage re-evaluates the analytic
// normal per pixel. Written for GLSL ES 1.00 (no array constructors).
const WAVE_GLSL = /* glsl */`
  uniform float uCliffSwell;
  uniform vec4 uCliffCalmEllipse;
  uniform float uChopWind;
  // Sea state (three-game/world/seaState.js): per-zone ocean energy. Before
  // this the ocean had two settings — one hard-coded bank shared by every
  // zone, plus an additive long swell on the ten zones in cliffSurfProfiles.
  // Nothing could be calmer than the shared bank, and "bigger waves" was only
  // reachable by opting into cliff-shaped breakers. All default to 1, which
  // reproduces the historical bank exactly.
  uniform float uSwell;
  uniform float uSwellLen;
  uniform float uChopSea;
  uniform float uBreakers;
  // Trochoid pinch, 0 = plain sine, 1 = cusped Gerstner crest.
  uniform float uSteepness;
  // 1 / (peak amplitude of the whole bank, including the cliff swell), raised
  // to a partial exponent on the CPU. Without it every crest-gated effect
  // saturates solid on a heavy sea and never fires on a calm one; with it at
  // full strength the shading response to sea state would be exactly zero.
  uniform float uCrestNorm;
  // Live wave-shape tuning (?waterdev). These multiply the authored bank
  // rather than replacing it, so 1 everywhere is the shipped sea.
  // (amplitude, wavelength, phase speed, chop amplitude)
  uniform vec4 uWaveShape;
  // (chop wavelength, swash height, shallow-swell floor, unused)
  uniform vec4 uWaveShape2;

  float cliffSwellAt(vec2 pos) {
    if (uCliffCalmEllipse.z < 0.001) return uCliffSwell;
    vec2 ellipsePoint = (pos - uCliffCalmEllipse.xy) / uCliffCalmEllipse.zw;
    float calm = 1.0 - smoothstep(0.76, 1.08, length(ellipsePoint));
    return uCliffSwell * (1.0 - calm);
  }

  void addWave(vec2 pos, float t, vec2 d, float amp, float wl, inout vec3 disp, inout vec3 n) {
    vec2 dir = normalize(d);
    float w = 6.28318530718 / wl;
    float phase = w * dot(dir, pos) + t * sqrt(9.8 * w) * uWaveShape.z;
    float c = cos(phase);
    float s = sin(phase);
    // A deep-water Gerstner orbit is circular: the horizontal radius IS the
    // amplitude, scaled by a steepness factor in [0,1]. The previous q
    // normalised STEEPNESS by (w * amp * WAVE_COUNT), which cancelled the
    // amplitude out of the horizontal term entirely — the 7cm/13m wave slid
    // 36cm sideways while rising 7cm, and the ratio changed with every wave in
    // the bank. Decoupled that way, crest shape could not follow sea state at
    // all. Summed steepness stays far below the 1.0 self-intersection limit
    // across the authored 0.4..1.8 swell range (max ~0.40 at Punta Sur).
    float q = uSteepness;
    disp.x += q * amp * dir.x * c;
    disp.z += q * amp * dir.y * c;
    disp.y += amp * s;
    float wa = w * amp;
    n.x += dir.x * wa * c;
    n.z += dir.y * wa * c;
    n.y += q * wa * s;
  }

  // Returns displacement; writes the analytic surface normal. atten scales
  // amplitude so the swell calms (but never dies) over the shallows.
  vec3 gerstner(vec2 pos, float t, float atten, out vec3 normal) {
    vec3 disp = vec3(0.0);
    vec3 n = vec3(0.0, 0.0, 0.0);
    // Sea state scales amplitude and stretches wavelength together, so a
    // heavier sea reads as longer and slower rather than as the same chop
    // turned up (the phase term carries sqrt(9.8 * w), so a longer wave
    // automatically travels faster and takes longer to pass).
    float aS = uSwell * uWaveShape.x;
    float lS = uSwellLen * uWaveShape.y;
    addWave(pos, t, vec2( 0.86,  0.51), 0.07 * aS, 13.0 * lS, disp, n);
    addWave(pos, t, vec2(-0.62,  0.78), 0.045 * aS, 8.5 * lS, disp, n);
    addWave(pos, t, vec2( 0.34, -0.94), 0.028 * aS, 5.0 * lS, disp, n);
    #ifdef CINEMATIC_WATER
      // Wind sea: three short chop waves spread around the swell heading.
      // Amplitude rides the shared weather wind (uChopWind, from weatherEnv)
      // so calm mornings stay glassy and trade-wind afternoons gain genuine
      // choppy texture. Total extra crest height stays under ~4.5cm so the
      // deep-disc seam crossfade and the surf/ring overlay meshes (which ride
      // this same bank at fixed attenuation) remain inside their existing
      // height tolerance.
      // Wind sea scaled by the zone's own exposure, so a calm morning stays
      // glassy everywhere while a trade-wind afternoon is much rougher off a
      // windward headland than inside a cove. Chop keeps its own short
      // wavelengths — wind sea does not lengthen with swell.
      float chop = (0.5 + 0.5 * clamp(uChopWind, 0.0, 1.0)) * uChopSea * uWaveShape.w;
      float chopLen = uWaveShape2.x;
      addWave(pos, t, vec2( 0.97,  0.26), 0.022 * chop, 6.3 * chopLen, disp, n);
      addWave(pos, t, vec2( 0.60,  0.80), 0.013 * chop, 4.1 * chopLen, disp, n);
      addWave(pos, t, vec2( 0.92, -0.40), 0.008 * chop, 2.7 * chopLen, disp, n);
    #endif
    // Windward cliff maps add a long Pacific swell beneath the shared calm
    // surface. Zero everywhere else, so beaches and coves retain their
    // existing silhouette and timing.
    float localCliffSwell = cliffSwellAt(pos);
    addWave(pos, t, vec2( 0.96,  0.28), 0.48 * localCliffSwell, 38.0, disp, n);
    addWave(pos, t, vec2( 0.78,  0.63), 0.24 * localCliffSwell, 19.0, disp, n);
    addWave(pos, t, vec2( 0.99, -0.12), 0.12 * localCliffSwell, 9.5, disp, n);
    disp *= atten;
    normal = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(-n.x, 1.0 - n.y, -n.z), atten));
    return disp;
  }

  // Swell attenuation over the shallows: gentle ramp (a steep one shows the
  // vertex grid), with a floor so the surface keeps rolling at the shore.
  float swellAtten(float depth) {
    float floorAmt = uWaveShape2.z;
    return smoothstep(0.0, 0.3, depth) * (floorAmt + (1.0 - floorAmt) * smoothstep(0.35, 1.6, depth));
  }

  // Rhythmic swash: the waterline rides up and down the beach face in sync
  // with the terrain shader's foam band (same clock, same 0.5984 rad/s cycle).
  float swashLift(vec2 wxz, float t, float depthRaw) {
    float cyc = sin(t * 0.5984) * 0.5 + 0.5;
    // The 0.5984 rad/s clock is shared with every region's terrain foam band
    // and with the ecology splash periods, so only the height is tunable here;
    // changing the rate would desync the waterline from the sand.
    float lift = ((cyc - 0.5) * 1.7 + sin(wxz.x * 0.17 + t * 0.30) * 0.3) * uWaveShape2.y;
    return lift * smoothstep(1.3, 0.05, max(depthRaw, 0.0));
  }

  // --- surf fronts ----------------------------------------------------------
  // Wave fronts are lines of constant shore distance marching toward the
  // beach: constant world-space spacing on every coastline. bn* helpers are
  // namespaced to avoid clashing with the fragment stage's noise.
  float bnHash(vec2 p) { return fract(sin(dot(p, vec2(157.31, 113.97))) * 43137.71); }
  float bnNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(bnHash(i), bnHash(i + vec2(1.0, 0.0)), u.x),
               mix(bnHash(i + vec2(0.0, 1.0)), bnHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  const float BREAKER_WAVELENGTH = 10.0; // metres between fronts
  const float BREAKER_SPEED = 0.85;      // shoreward metres per second

  // The dominant swell direction (the primary Gerstner wave). Surf breaks on
  // shores that face into this; lee shores get only a faint wrap-around wash.
  const vec2 SWELL_DIR = vec2(0.86024, 0.50979);

  // How squarely the local shore faces the incoming swell, in [-1, 1].
  // The baked shore-distance field's gradient points seaward, so the wave
  // travel direction at this point is -gradient; exposure is its alignment
  // with SWELL_DIR. Without this gate the fronts (lines of constant shore
  // distance) collapse concentrically onto islets from every side.
  float shoreExposure(sampler2D seafloor, float size, vec2 wxz, float sd) {
    // This is evaluated per vertex and interpolated, and it multiplies the
    // breaker envelope directly. At 1.75m on a 0.39m cliff-map quad the
    // gradient swung noticeably between neighbouring vertices, so the
    // interpolation faceted the foam envelope along triangle edges. Exposure
    // is a broad "which way does this shore face" term — sampling it over a
    // wider baseline costs the same two fetches and varies smoothly enough
    // that linear interpolation is no longer visible.
    float e = 5.0;
    float gx = texture2D(seafloor, (wxz + vec2(e, 0.0)) / size + 0.5).g * ${SHORE_DIST_RANGE.toFixed(1)} - sd;
    float gz = texture2D(seafloor, (wxz + vec2(0.0, e)) / size + 0.5).g * ${SHORE_DIST_RANGE.toFixed(1)} - sd;
    vec2 grad = vec2(gx, gz);
    float len = length(grad);
    if (len < 1e-3) return 1.0; // flat/clamped field: stay neutral
    return dot(-grad / len, SWELL_DIR);
  }

  // Phase of the marching fronts. f runs 0 -> 1 between fronts, with the lip
  // at f = 0; strength varies per front and along the shore so sets of waves
  // feel uneven; the envelope confines surf to the breaker band.
  float breakerField(vec2 wxz, float t, float sd, float depth, float exposure, out float f, out float strength) {
    float localCliffSwell = cliffSwellAt(wxz);
    // Distance along the crest line. Needed by the peel mask below as well as
    // the enhanced folding, so it is hoisted out of the ifdef — one dot
    // product, and it replaces a fixed diagonal that was not the crest axis.
    float alongCrest = dot(wxz, vec2(-SWELL_DIR.y, SWELL_DIR.x));
    float u = sd / BREAKER_WAVELENGTH + t * (BREAKER_SPEED / BREAKER_WAVELENGTH)
      + bnNoise(wxz * 0.05) * 0.45; // wobble the lines so they aren't ruler-straight
    #ifdef ENHANCED_WATER
      // Sections of one crest advance and stall independently. The motion is
      // slow enough to read as a wave folding, not noise sliding over water.
      u += sin(alongCrest * 0.28 + t * 0.21) * 0.045;
      u += (bnNoise(vec2(alongCrest * 0.12 - t * 0.035, sd * 0.08)) - 0.5) * 0.16;
    #endif
    f = fract(u);
    // A crest does not break evenly along its length: it peels, and long
    // sections never break at all. The old mapping was 0.5 + 0.5 * noise,
    // which never reaches zero — so every front drew one unbroken band from
    // one end of the bay to the other. That is the single biggest reason the
    // surf read as a painted ribbon rather than as water. Same single noise
    // fetch, remapped to open real gaps, and sampled along the true crest
    // axis (~22m segments) instead of a 40m diagonal.
    // Sampled on u, not floor(u). Keying this to the front index made it
    // piecewise constant, so it snapped at every wrap — and the wrap lands at
    // f ~ 0, which is exactly where the foam is brightest. With the peel mask
    // spanning the full 0..1 range that snap became a visible pop once per
    // wavelength. Sampling the same single noise on the continuous coordinate
    // removes the discontinuity outright and reads better besides: a front now
    // builds and fades as it shoals instead of holding one flat value.
    strength = smoothstep(0.26, 0.74, bnNoise(vec2(u * 0.7, alongCrest * 0.045)));
    #ifdef ENHANCED_WATER
      // Same reason: id made this jump at the wrap too.
      float setPulse = 0.82 + 0.18 * sin(t * 0.43 + u * 2.17 + alongCrest * 0.035);
      strength *= setPulse;
    #endif
    // Beaches keep their tight shallow band. Windward cliff maps use the
    // same authored shore-distance field but allow breakers over deep water:
    // a vertical rock face has no shallow shoal on which the old gate could
    // trigger, which was why foam appeared without a moving water mass.
    float beachBand = smoothstep(20.0, 14.5, sd) * smoothstep(2.6, 4.2, sd);
    // Keep meaningful energy almost to the rock. The previous 1.5 m inner
    // fade made the crest visibly dissolve before it reached a sheer wall.
    float cliffBand = smoothstep(19.0, 13.5, sd) * smoothstep(0.04, 0.62, sd);
    float band = mix(beachBand, cliffBand, localCliffSwell);
    float beachDepthGate = smoothstep(0.08, 0.3, depth) * smoothstep(3.2, 1.9, depth);
    float cliffDepthGate = smoothstep(0.08, 0.42, depth) * smoothstep(8.0, 5.4, depth);
    float depthGate = mix(beachDepthGate, cliffDepthGate, localCliffSwell);
    float exposureGate = mix(0.18, 1.0, smoothstep(-0.15, 0.6, exposure));
    exposureGate = mix(exposureGate, max(0.62, exposureGate), localCliffSwell);
    return band * depthGate * exposureGate;
  }

  // Vertex-stage swell at the breaking lip so the front has a silhouette.
  float breakerLift(vec2 wxz, float t, float sd, float depth, float exposure) {
    float localCliffSwell = cliffSwellAt(wxz);
    float f, s;
    float env = breakerField(wxz, t, sd, depth, exposure, f, s);
    float lip = smoothstep(0.09, 0.02, f);
    float lift = lip * env * s * 0.13 * mix(1.0, 2.65, localCliffSwell);
    #ifdef ENHANCED_WATER
      // Give the breaking lip a visible shoulder before it collapses into the
      // foam wake. Standard water keeps the original, gentler silhouette.
      float shoulder = smoothstep(0.18, 0.035, f) * (1.0 - lip);
      #ifdef CINEMATIC_WATER
        lift = lift * 1.42 + shoulder * env * s * 0.035;
      #else
        lift = lift * 1.24 + shoulder * env * s * 0.024;
      #endif
    #endif
    // A broad resolved crest on cliff maps. This displaces the actual ocean
    // mesh, rather than drawing a translucent sheet above it.
    // Signed periodic distance from the crest. With raw fract(f), f jumped
    // from 0.999 to 0.0 while the height jumped from zero to full lift,
    // producing a vertical wall made of visible triangle teeth. This profile
    // is continuous across the wrap and intentionally asymmetric: a compact
    // face before impact and a longer shoulder after it.
    float crestPhase = mod(f + 0.5, 1.0) - 0.5;
    float crestDistance = abs(crestPhase);
    float lipWidth = crestPhase < 0.0 ? 0.16 : 0.3;
    float shoulderWidth = crestPhase < 0.0 ? 0.3 : 0.5;
    float cliffLip = 1.0 - smoothstep(0.018, lipWidth, crestDistance);
    float cliffShoulder = (1.0 - smoothstep(lipWidth * 0.62, shoulderWidth, crestDistance))
      * (1.0 - cliffLip);
    float alongCrest = dot(wxz, vec2(-SWELL_DIR.y, SWELL_DIR.x));
    float scallop = 0.88
      + 0.08 * sin(alongCrest * 0.34 + t * 0.18)
      + 0.04 * sin(alongCrest * 0.79 - t * 0.11);
    float cliffLift = env * s * scallop * (cliffLip * 1.38 + cliffShoulder * 0.38);
    return mix(lift, cliffLift, localCliffSwell) * uBreakers;
  }

  // Push the crest shoreward as it rises. The horizontal displacement makes
  // the wave lean into the rock instead of pulsing straight up like a sine
  // wave. It is only active in the two heavy-surf maps.
  vec2 breakerPush(
    sampler2D seafloor,
    float size,
    vec2 wxz,
    float t,
    float sd,
    float depth,
    float exposure
  ) {
    float localCliffSwell = cliffSwellAt(wxz);
    if (localCliffSwell < 0.001) return vec2(0.0);
    float f, s;
    float env = breakerField(wxz, t, sd, depth, exposure, f, s);
    float crestPhase = mod(f + 0.5, 1.0) - 0.5;
    float crestDistance = abs(crestPhase);
    float lipWidth = crestPhase < 0.0 ? 0.16 : 0.3;
    float shoulderWidth = crestPhase < 0.0 ? 0.3 : 0.5;
    float cliffLip = 1.0 - smoothstep(0.018, lipWidth, crestDistance);
    float cliffShoulder = (1.0 - smoothstep(lipWidth * 0.62, shoulderWidth, crestDistance))
      * (1.0 - cliffLip);
    float e = 1.25;
    float gx = texture2D(seafloor, (wxz + vec2(e, 0.0)) / size + 0.5).g * ${SHORE_DIST_RANGE.toFixed(1)} - sd;
    float gz = texture2D(seafloor, (wxz + vec2(0.0, e)) / size + 0.5).g * ${SHORE_DIST_RANGE.toFixed(1)} - sd;
    vec2 seaward = vec2(gx, gz);
    float gradientLength = length(seaward);
    if (gradientLength < 1e-3) return vec2(0.0);
    seaward /= gradientLength;
    float fold = env * s * (cliffLip * 0.72 + cliffShoulder * 0.18) * localCliffSwell;
    return -seaward * fold;
  }
`;

// Trochoid pinch for the shared bank. 1.0 is a fully cusped Gerstner crest;
// pulled back a little because the island's swell should read as rolling
// rather than about to break everywhere.
const DEFAULT_STEEPNESS = 0.85;
// Peak amplitude of the historical (sea state 1.0) base bank, and of the
// cliff-profile bank at full swell. Used to derive uCrestNorm on the CPU so
// the shader does not re-sum the bank per pixel.
const BASE_BANK_AMPLITUDE = 0.07 + 0.045 + 0.028;
const CLIFF_BANK_AMPLITUDE = 0.48 + 0.24 + 0.12;

// Every material that compiles WAVE_GLSL must declare the whole sea-state
// uniform set, so they are minted and written in one place. These are plain
// uniform multiplies inside shader code that already runs — they add no
// texture fetches and no per-pixel branching.
function waveBankUniforms() {
  return {
    uCliffSwell: { value: 0 },
    uCliffCalmEllipse: { value: new THREE.Vector4() },
    uChopWind: { value: 0.2 },
    uSwell: { value: 1 },
    uSwellLen: { value: 1 },
    uChopSea: { value: 1 },
    uBreakers: { value: 1 },
    uSteepness: { value: DEFAULT_STEEPNESS },
    uCrestNorm: { value: 1 },
    uWaveShape: { value: new THREE.Vector4(1, 1, 1, 1) },
    uWaveShape2: { value: new THREE.Vector4(1, 0.115, 0.35, 0) },
  };
}

// Live half of the bank: the ?waterdev shape knobs, which every material
// compiling WAVE_GLSL has to receive or its surface drifts out of step with
// the others (the surf ribbon and the ocean rings ride this same bank).
function applyWaveBankTuning(uniforms) {
  if (!uniforms?.uWaveShape) return;
  uniforms.uSteepness.value = waterDev.waveSteepness;
  uniforms.uWaveShape.value.set(
    waterDev.waveAmp,
    waterDev.waveLength,
    waterDev.waveSpeed,
    waterDev.chopAmp,
  );
  uniforms.uWaveShape2.value.set(
    waterDev.chopLength,
    waterDev.swashHeight,
    waterDev.swellShoreFloor,
    0,
  );
}

// Static (per-zone) half of the bank: everything that only changes on travel.
function applyWaveBankZone(uniforms, { seaState, cliffSwell, cliffCalmEllipse }) {
  if (!uniforms?.uSwell) return;
  uniforms.uCliffSwell.value = cliffSwell;
  uniforms.uCliffCalmEllipse.value.set(...(cliffCalmEllipse || [0, 0, 0, 0]));
  uniforms.uSwell.value = seaState.swell;
  uniforms.uSwellLen.value = seaState.lengthScale;
  uniforms.uChopSea.value = seaState.chop;
  uniforms.uBreakers.value = seaState.breakers;
  // Partial, not full, normalisation. Normalising all the way keeps every
  // authored threshold exactly valid but makes the shading response to sea
  // state precisely zero by construction — a heavier sea then displaces more
  // without looking any rougher. The 0.7 exponent keeps thresholds near where
  // they were tuned while letting crest bands, whitecap ignition and the
  // subsurface glow open up on an exposed coast and close down inside a cove.
  const bankAmplitude = BASE_BANK_AMPLITUDE * seaState.swell
    + CLIFF_BANK_AMPLITUDE * cliffSwell;
  uniforms.uCrestNorm.value = Math.pow(
    BASE_BANK_AMPLITUDE / Math.max(1e-3, bankAmplitude),
    0.7,
  );
}

function createStylizedWaterMaterial(
  seafloorTexture,
  standingWaterMaskTexture,
  waterContactTexture,
  rippleNormalTexture,
  standingWaterRendering,
  qualityConfig,
) {
  const suppression = standingWaterRendering.globalWaterSuppression;
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    extensions: { derivatives: true },
    defines: waterShaderDefines(qualityConfig),
    uniforms: {
      ...waveBankUniforms(),
      uTime: { value: 0 },
      uWaterOnlyShelf: { value: 0 },
      uSeafloor: { value: seafloorTexture },
      uStandingWaterMask: { value: standingWaterMaskTexture },
      uWaterContact: { value: waterContactTexture },
      uStandingWaterFadeStart: { value: suppression.fadeStart },
      uStandingWaterFadeEnd: { value: suppression.fadeEnd },
      uRippleNormal: { value: rippleNormalTexture },
      uWaterLevel: { value: WATER_LEVEL },
      uSize: { value: WATER_SIZE },
      // Fallback painted colour (used until the first refraction grab lands).
      uSand: { value: WATER_DAY.sand.clone() },
      // Water body: luminous tropical scatter + absorption per channel
      // (red dies first), eased into open-ocean blue with depth.
      uScatter: { value: WATER_DAY.scatter.clone() },
      uAbsorb: { value: new THREE.Vector3(0.42, 0.20, 0.10) },
      uDeep: { value: WATER_DAY.deep.clone() },
      uFoam: { value: WATER_DAY.foam.clone() },
      uSky: { value: new THREE.Color('#bfe6ff') },
      uSkyHorizon: { value: new THREE.Color('#eaf6ff') },
      uHaze: { value: new THREE.Color('#cfe6f4') },
      uHazeNear: { value: 38 },
      uHazeFar: { value: 120 },
      uSun: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
      uSunColor: { value: new THREE.Color('#fff3da') },
      uMoon: { value: new THREE.Vector3(0, -1, 0) },
      uMoonColor: { value: new THREE.Color('#c9dcf2') },
      uMoonGlitter: { value: 0 },
      uDaylight: { value: 1 },
      uSunPathStrength: { value: 0 },
      uRain: { value: 0 },
      uUnderwaterAmount: { value: 0 },
      // Player wading ripples: world position + strength (0 when on land).
      uPlayer: { value: new THREE.Vector3() },
      uPlayerRipple: { value: 0 },
      uOceanPlayerRippleEnabled: { value: ENABLE_OCEAN_PLAYER_RIPPLES ? 1 : 0 },
      uOceanRippleTime: { value: 0 },
      uOceanRipples: {
        value: Array.from({ length: OCEAN_PLAYER_RIPPLE_COUNT }, () => new THREE.Vector4(9999, 9999, -1000, 0)),
      },
      uWaterBodyCount: { value: 0 },
      uWaterBodies: {
        value: Array.from({ length: WATER_BODY_INFLUENCE_COUNT }, () => new THREE.Vector4(9999, 9999, 0.1, 0)),
      },
      uWaterBodyMotion: {
        value: Array.from({ length: WATER_BODY_INFLUENCE_COUNT }, () => new THREE.Vector4(0, 0, 0, 0)),
      },
      // Screen-space refraction source (framebuffer grab taken just before
      // the water mesh draws — one copy, no scene re-render).
      uRefraction: { value: null },
      uHasRefraction: { value: 0 },
      // 1 when the grab holds output-encoded sRGB (the raw framebuffer), 0 when
      // it is the composer's working buffer, which is already linear. Decoding
      // a linear grab would drag the whole seabed dark.
      uRefractionEncoded: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      // Planar reflection (filled when reflections are enabled).
      uReflection: { value: null },
      uReflMatrix: { value: new THREE.Matrix4() },
      uHasReflection: { value: 0 },
      // Live-tunable knobs mirrored from waterDevRuntime every frame; the
      // values here are just safe fallbacks before the first update.
      uPlanarShare: { value: 1 },
      uObjectMirror: { value: 0.65 },
      uReflDistort: { value: 0.015 },
      uReflNeutralGrade: { value: 0.68 },
      uSkyReflCurve: { value: 2.2 },
      uRippleOctaves: { value: new THREE.Vector3(1.12, 0.54, 0.08) },
      uWindToneWeight: { value: 0.04 },
      uCapDensity: { value: 2.1 },
      uCapCrest: { value: 0.08 },
      uCapWindGate: { value: 0.2 },
      uGlintElongation: { value: 4 },
      uGlintWidth: { value: 1 },
      // x strength, y reach, z sun-disc gain
      uGlintTune: { value: new THREE.Vector3(1, 1, 1) },
      // x crossfade width (m), y seam noise amplitude (m)
      uSeamTune: { value: new THREE.Vector2(22, 0) },
      // Travel to the disc's deep colour: x how far back from the rim it
      // starts (m), y how far toward uDeep it goes, z how much its onset
      // wanders (m).
      uRimTravel: { value: new THREE.Vector3(39, 0.85, 0) },
      // Depth ramp, mirrored from waterDevRuntime. Packed so the whole ramp
      // costs four uniform slots.
      uRampMix: { value: new THREE.Vector4(0.12, 0.5, 0.42, 0.14) },
      uRampDepths: { value: new THREE.Vector4(0.16, 0.85, 2.4, 7.2) },
      uRampOpacity: { value: new THREE.Vector4(0.4, 1, 6, 0) },
      uRampBias: { value: new THREE.Vector4(3.5, 2.6, 1, 1) },
      // Clarity, mirrored from waterDevRuntime: how much of the pixel is the
      // real seabed rather than painted water body.
      // (glazeAngle, pathBlend, captureShallow, captureDeep)
      uClarity: { value: new THREE.Vector4(0.7, 1, 0.94, 0.4) },
      // (captureDepth, reflShallow, reflDeep, unused)
      uClarity2: { value: new THREE.Vector4(5.2, 0.62, 0.88, 0) },
      // Snell's window: (criticalCos, softness, windowAlpha, mirrorAlpha)
      uSnell: { value: new THREE.Vector4(0.661, 0.085, 0.3, 0.95) },
      // (mirrorGrab, mirrorOffset, wobble, unused)
      uSnell2: { value: new THREE.Vector4(0.6, 0.13, 0.05, 0) },
      // Body model: (physicalBlend, scatterAdd, scatterSat, scatterSun)
      uBody: { value: new THREE.Vector4(0, 1, 1, 0) },
      // (darkLift, unused, unused, unused)
      uBody2: { value: new THREE.Vector4(0.4, 0, 0, 0) },
      uRippleShape: { value: new THREE.Vector4(1, 1, 0.85, 0.085) },
      uFoamShape: { value: new THREE.Vector4(0.8, 1, 0.38, 0.52) },
      uFoamMix: { value: new THREE.Vector4(0.55, 0.55, 0.85, 0.26) },
      uFoamWidth: { value: new THREE.Vector4(1, 1, 1, 1) },
      uFoamShoreGain: { value: 1 },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      ${WAVE_GLSL}
      uniform float uTime;
      uniform sampler2D uSeafloor;
      uniform float uWaterLevel;
      uniform float uSize;
      uniform mat4 uReflMatrix;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vExposure;
      varying vec2 vFlatXZ;
      varying vec4 vReflCoord;

      float seafloorAt(vec2 wxz) {
        vec2 uv = wxz / uSize + 0.5;
        float packed = texture2D(uSeafloor, uv).r;
        return packed * ${HSPAN.toFixed(1)} + (${HMIN.toFixed(1)});
      }

      float shoreDistAt(vec2 wxz) {
        vec2 uv = wxz / uSize + 0.5;
        return texture2D(uSeafloor, uv).g * ${SHORE_DIST_RANGE.toFixed(1)};
      }

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        // The seabed does not move. Every lookup into the static shore field
        // — depth, shore distance, exposure, breaker phase — is taken at the
        // undisplaced position and handed to the fragment stage as vFlatXZ.
        //
        // Previously they were taken at the displaced position, and the
        // fragment then re-sampled the seafloor at vWorld.xz. Since vWorld is
        // interpolated linearly across a triangle while the displacement is
        // not, the shore-distance field that defines where the fronts sit came
        // out piecewise-linear per triangle. On a cliff map breakerPush moves
        // vertices up to 0.72m on a 0.39m quad and drops to zero across the
        // lip in about 2m, so the sampling domain is compressed ~45% within a
        // single quad exactly where the crest breaks — which is what made the
        // foam edge read as a row of triangles.
        vec2 flatXZ = world.xz;
        vFlatXZ = flatXZ;
        float floorH = seafloorAt(flatXZ);
        float depth = uWaterLevel - floorH;
        vDepth = depth;
        vec3 normal; // unused: shading normal is per-pixel in the fragment
        vec3 disp = gerstner(flatXZ, uTime, swellAtten(depth), normal);
        float sd = shoreDistAt(flatXZ);
        vExposure = shoreExposure(uSeafloor, uSize, flatXZ, sd);
        float breakerY = breakerLift(flatXZ, uTime, sd, depth, vExposure);
        vec2 push = breakerPush(uSeafloor, uSize, flatXZ, uTime, sd, depth, vExposure);
        world.xyz += disp;
        world.y += swashLift(flatXZ, uTime, depth);
        world.xz += push;
        world.y += breakerY;
        vWorld = world.xyz;
        vReflCoord = uReflMatrix * vec4(world.xyz, 1.0);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      ${WAVE_GLSL}
      uniform float uTime;
      uniform float uWaterOnlyShelf;
      uniform vec3 uSand;
      uniform vec3 uScatter;
      uniform vec3 uAbsorb;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      uniform vec3 uSky;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSun;
      uniform vec3 uSunColor;
      uniform vec3 uMoon;
      uniform vec3 uMoonColor;
      uniform float uMoonGlitter;
      uniform float uDaylight;
      uniform float uSunPathStrength;
      uniform float uRain;
      uniform float uUnderwaterAmount;
      uniform vec3 uPlayer;
      uniform float uPlayerRipple;
      uniform float uOceanPlayerRippleEnabled;
      uniform float uOceanRippleTime;
      uniform vec4 uOceanRipples[${OCEAN_PLAYER_RIPPLE_COUNT}];
      uniform float uWaterBodyCount;
      uniform vec4 uWaterBodies[${WATER_BODY_INFLUENCE_COUNT}];
      uniform vec4 uWaterBodyMotion[${WATER_BODY_INFLUENCE_COUNT}];
      uniform float uSize;
      uniform sampler2D uSeafloor;
      uniform sampler2D uStandingWaterMask;
      uniform sampler2D uWaterContact;
      uniform float uStandingWaterFadeStart;
      uniform float uStandingWaterFadeEnd;
      uniform sampler2D uRippleNormal;
      uniform float uWaterLevel;
      uniform sampler2D uRefraction;
      uniform float uHasRefraction;
      uniform float uRefractionEncoded;
      uniform vec2 uResolution;
      uniform sampler2D uReflection;
      uniform float uHasReflection;
      uniform vec3 uHaze;
      uniform float uHazeNear;
      uniform float uHazeFar;
      uniform float uPlanarShare;
      uniform float uObjectMirror;
      uniform float uReflDistort;
      uniform float uReflNeutralGrade;
      uniform float uSkyReflCurve;
      uniform vec3 uRippleOctaves;
      uniform float uWindToneWeight;
      uniform float uCapDensity;
      uniform float uCapCrest;
      uniform float uCapWindGate;
      uniform float uGlintElongation;
      uniform float uGlintWidth;
      uniform vec3 uGlintTune;
      uniform vec2 uSeamTune;
      uniform vec3 uRimTravel;
      uniform vec4 uRampMix;
      uniform vec4 uRampDepths;
      uniform vec4 uRampOpacity;
      uniform vec4 uRampBias;
      uniform vec4 uClarity;
      uniform vec4 uClarity2;
      uniform vec4 uSnell;
      uniform vec4 uSnell2;
      uniform vec4 uBody;
      uniform vec4 uBody2;
      // Ripple detail: (uv scale, drift speed, domain warp, short-octave gain)
      uniform vec4 uRippleShape;
      // Foam noise: (feature scale, drift speed, contrast window, detail mix)
      uniform vec4 uFoamShape;
      // Surf profile weights: (core, lip, trail, spray haze)
      uniform vec4 uFoamMix;
      // Surf profile widths: (core, lip, trail, shore-foam gain)
      uniform vec4 uFoamWidth;
      uniform float uFoamShoreGain;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vExposure;
      varying vec2 vFlatXZ;
      varying vec4 vReflCoord;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.3))) * 19341.13); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      // Cellular noise for foam structure: real foam is a lattice of bubbles
      // and gaps, which Worley captures and smoothstepped value noise cannot.
      float worley(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        float d = 1.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = vec2(bnHash(cell + g), bnHash(cell + g + 19.7));
            d = min(d, length(g + o - f));
          }
        }
        return d;
      }

      // Two octaves of advected Worley lace, shared by every foam source.
      // Features are ~1.5m (mockup foam texture reads as streaks, not speckle).
      float foamLace(vec2 wxz, float t) {
        float drift = t * uFoamShape.y;
        vec2 p = wxz * uFoamShape.x + vec2(drift * 0.13, -drift * 0.09);
        float a = 1.0 - worley(p);
        float b = 1.0 - worley(p * 2.4 + 7.3);
        // High contrast: real holes and filaments, not grey mist. A narrow
        // window is lattice; a wide one is mist.
        float laceMid = 0.69;
        float laceHalf = max(uFoamShape.z, 0.01) * 0.5;
        float lace = smoothstep(laceMid - laceHalf, laceMid + laceHalf, a * 0.62 + b * 0.38);
        #ifdef ENHANCED_WATER
          // Polished gets animated torn cells from the two existing Worley
          // reads. Cinematic alone pays for a third, finer bubble scale.
          float torn = smoothstep(0.28, 0.78, noise(p * 0.43 + vec2(-drift * 0.025, drift * 0.019)));
          float bubbleWeb = 1.0 - smoothstep(0.05, 0.16, abs(b - 0.43));
          bubbleWeb *= smoothstep(0.24, 0.74, noise(p * 1.17 + vec2(drift * 0.028, -drift * 0.019)));
          float detailedLace = max(lace * (0.68 + 0.32 * torn), bubbleWeb * 0.52);
          #ifdef CINEMATIC_WATER
            float c = 1.0 - worley(p * 5.6 + vec2(-11.3, 8.7));
            float filaments = smoothstep(0.46, 0.86, a * 0.46 + b * 0.34 + c * 0.2);
            float fineWeb = 1.0 - smoothstep(0.045, 0.15, abs(c - 0.43));
            fineWeb *= smoothstep(0.22, 0.74, noise(p * 1.17 + vec2(drift * 0.028, -drift * 0.019)));
            detailedLace = max(filaments * (0.62 + 0.38 * torn), fineWeb * 0.72);
            lace = mix(lace, detailedLace, uFoamShape.w * 1.31);
          #else
            lace = mix(lace, detailedLace, uFoamShape.w);
          #endif
        #endif
        return lace;
      }

      // Surf: a crisp mostly-solid lip at the marching front, with the lace
      // eroding only the dissolving trail behind it (mockup: continuous lines
      // with frayed edges, not marble).
      float breakerFoam(vec2 wxz, float t, float sd, float depth, float lace, float exposure) {
        float localCliffSwell = cliffSwellAt(wxz);
        float f, s;
        float env = breakerField(wxz, t, sd, depth, exposure, f, s);
        // Narrow lip with a bright solid core at the leading edge; the trail
        // dissolves through the lace instead of smearing grey.
        float coreWidth = mix(0.035, 0.095, localCliffSwell) * uFoamWidth.x;
        float lipWidth = mix(0.075, 0.19, localCliffSwell) * uFoamWidth.y;
        float trailWidth = mix(0.34, 0.62, localCliffSwell) * uFoamWidth.z;
        float foamPhase = mod(f + 0.5, 1.0) - 0.5;
        float foamDistance = localCliffSwell > 0.001 ? abs(foamPhase) : f;
        float preFoamScale = foamPhase < 0.0 ? 0.72 : 1.0;
        float core = 1.0 - smoothstep(0.008, coreWidth * preFoamScale, foamDistance);
        float lip = 1.0 - smoothstep(0.015, lipWidth * preFoamScale, foamDistance);
        float trail = step(0.0, foamPhase)
          * (1.0 - smoothstep(lipWidth * 0.72, trailWidth, foamDistance))
          * (1.0 - lip);
        // Weighting, not width, is what made these read as painted ribbons.
        // The lip is the widest bright part of a front, and it was 70%
        // constant (0.7 + 0.3 * lace) — a flat band with a slight texture
        // wash over it. Real surf is the opposite: a narrow genuinely solid
        // breaking edge, then everything behind it torn into structure.
        // So the core goes brighter and stays solid, the lip becomes mostly
        // lace-driven, and the trail is squared for contrast so it reads as
        // dense patches with holes instead of an even grey smear.
        // Spray haze. Whitewater throws mist with no hard edge, and without a
        // term for it the foam is a cut-out however well the lace tears its
        // interior — which is what made the first pass read as torn paper.
        // Broad, soft, low amplitude, and only weakly lace-modulated so it
        // stays a halo rather than more structure.
        float haze = (1.0 - smoothstep(0.0, trailWidth * 1.9, foamDistance))
          * (0.55 + 0.45 * lace);
        float foam = core * uFoamMix.x
          + lip * (1.0 - uFoamMix.y + uFoamMix.y * lace)
          + trail * lace * lace * uFoamMix.z
          + haze * uFoamMix.w;
        #ifdef ENHANCED_WATER
          // Let a crest progress through a compact white curl, boiling
          // whitewater, torn streaks, and finally detached bubble islands.
          float collapse = smoothstep(0.045, 0.1, f) * (1.0 - smoothstep(0.22, 0.38, f));
          float wake = smoothstep(0.12, 0.24, f) * (1.0 - smoothstep(0.48, 0.72, f));
          float streaks = smoothstep(0.48, 0.86, noise(
            vec2(dot(wxz, SWELL_DIR) * 0.22 - t * 0.18,
                 dot(wxz, vec2(-SWELL_DIR.y, SWELL_DIR.x)) * 0.66)
          ));
          float boiling = collapse * (0.34 + lace * 0.66);
          float tornWake = wake * lace * (0.18 + streaks * 0.3);
          // Same correction as the base profile: these branches ran the lip at
          // 82% and 77% constant, which overrode the tearing above and put the
          // flat band back on the tiers that pay most for detail.
          #ifdef CINEMATIC_WATER
            foam = max(foam * 1.12,
              core * uFoamMix.x * 1.31 + lip * (1.0 - uFoamMix.y + uFoamMix.y * lace)
                + (boiling + tornWake) * uFoamWidth.w + haze * uFoamMix.w * 0.92);
          #else
            foam = max(
              foam * 1.06,
              core * uFoamMix.x * 1.13 + lip * (1.0 - uFoamMix.y + uFoamMix.y * lace)
                + (boiling * 0.78 + tornWake * 0.62) * uFoamWidth.w + haze * uFoamMix.w * 0.77
            );
          #endif
        #endif
        // Softened rather than linear: a small wave still breaks white, it
        // just breaks over less water. Scaling foam brightness straight off
        // uBreakers left sheltered coves with no readable waterline at all.
        return min(foam, 1.0) * env * s * mix(1.0, uBreakers, 0.7);
      }

      vec2 rippleNormalSlope(vec2 wxz, float t, float coarseLod, float fineLod) {
        // Domain-warp the coarse octave: all three reads share one 256px tile,
        // and unwarped the ~21m repeat shows up as identical sheen blobs
        // marching across the bay. The warp de-correlates repeats for free;
        // weight shifts toward the finer octaves so no single patch scale
        // dominates the highlight.
        float rScale = uRippleShape.x;
        float rt = t * uRippleShape.y;
        vec2 warp = (vec2(
          noise(wxz * 0.021 + vec2(rt * 0.004, 0.0)),
          noise(wxz * 0.017 + vec2(0.0, -rt * 0.003))
        ) - 0.5) * uRippleShape.z;
        vec2 uvA = wxz * 0.048 * rScale + warp * 0.5 + vec2(rt * 0.008, -rt * 0.006);
        vec2 uvB = vec2(wxz.x * 0.78 - wxz.y * 0.62, wxz.x * 0.62 + wxz.y * 0.78) * 0.135 * rScale
          + warp * 0.22 + vec2(-rt * 0.014, rt * 0.01);
        vec2 uvC = vec2(wxz.x * 0.36 + wxz.y * 0.93, -wxz.x * 0.93 + wxz.y * 0.36) * 0.27 * rScale
          + vec2(rt * 0.022, rt * 0.017);
        vec3 a = texture2D(uRippleNormal, uvA).rgb * 2.0 - 1.0;
        vec3 b = texture2D(uRippleNormal, uvB).rgb * 2.0 - 1.0;
        vec3 c = texture2D(uRippleNormal, uvC).rgb * 2.0 - 1.0;
        // Wind response. Only cinematic's vertex chop rode the shared wind
        // before this, so on every other tier a dead-calm dawn and a
        // trade-wind afternoon had an identical surface — and even on
        // cinematic the per-pixel ripple that shapes every highlight,
        // reflection distortion and glint was a constant. Wind raises the
        // short waves first, so the fine octaves swing much further than the
        // long sheen bands; uChopWind runs ~0.22 (sunny calm) to ~0.78
        // (storm), and the gains are centred so trade-wind conditions
        // reproduce the authored look.
        float windChop01 = clamp((uChopWind - 0.22) / 0.56, 0.0, 1.0);
        float coarseWind = coarseLod * (0.94 + 0.17 * windChop01);
        float fineWind = fineLod * (0.78 + 0.62 * windChop01);
        vec2 slope = a.xy * uRippleOctaves.x * coarseWind
          + b.xy * uRippleOctaves.y * coarseWind
          + c.xy * uRippleOctaves.z * fineWind;
        #ifdef ENHANCED_WATER
          // Polished adds one short-wave octave; cinematic adds a second.
          vec2 uvD = vec2(wxz.x * 0.91 + wxz.y * 0.41, -wxz.x * 0.41 + wxz.y * 0.91) * 0.46 * rScale
            + warp * 0.08 + vec2(-rt * 0.034, rt * 0.026);
          vec3 d = texture2D(uRippleNormal, uvD).rgb * 2.0 - 1.0;
          slope += d.xy * uRippleShape.w * fineWind;
          #ifdef CINEMATIC_WATER
            vec2 uvE = vec2(wxz.x * 0.18 - wxz.y * 0.98, wxz.x * 0.98 + wxz.y * 0.18) * 0.82 * rScale
              + vec2(rt * 0.061, rt * 0.047);
            vec3 e = texture2D(uRippleNormal, uvE).rgb * 2.0 - 1.0;
            slope += d.xy * uRippleShape.w * 0.41 * fineWind + e.xy * uRippleShape.w * 0.65 * fineWind;
          #endif
        #endif
        return slope;
      }

      float rippleSparkleMask(vec2 wxz, float t) {
        vec2 uvA = vec2(wxz.x * 0.86 - wxz.y * 0.5, wxz.x * 0.5 + wxz.y * 0.86) * 0.18
          + vec2(t * 0.018, -t * 0.015);
        vec2 uvB = vec2(wxz.x * 0.34 + wxz.y * 0.94, -wxz.x * 0.94 + wxz.y * 0.34) * 0.34
          + vec2(-t * 0.026, t * 0.018);
        vec3 a = texture2D(uRippleNormal, uvA).rgb * 2.0 - 1.0;
        vec3 b = texture2D(uRippleNormal, uvB).rgb * 2.0 - 1.0;
        float ridge = max(abs(a.x), abs(a.y)) * 0.64 + max(abs(b.x), abs(b.y)) * 0.36;
        return smoothstep(0.23, 0.54, ridge);
      }

      float microSparkleMask(vec2 wxz, float t) {
        vec2 uvA = vec2(wxz.x * 0.71 - wxz.y * 0.7, wxz.x * 0.7 + wxz.y * 0.71) * 0.82
          + vec2(t * 0.075, -t * 0.058);
        vec2 uvB = vec2(wxz.x * 0.2 + wxz.y * 0.98, -wxz.x * 0.98 + wxz.y * 0.2) * 1.18
          + vec2(-t * 0.095, t * 0.071);
        vec3 a = texture2D(uRippleNormal, uvA).rgb * 2.0 - 1.0;
        vec3 b = texture2D(uRippleNormal, uvB).rgb * 2.0 - 1.0;
        float ridge = max(abs(a.x), abs(a.y)) * 0.55 + max(abs(b.x), abs(b.y)) * 0.45;
        float fleck = smoothstep(0.46, 0.82, ridge);
        return fleck * fleck;
      }

      // Slow world-space wobble on the seam radius. Two octaves of the
      // value noise already compiled into this shader — no extra texture
      // fetches — at wavelengths long enough to read as a soft irregular
      // boundary rather than as fringing.
      float seamRadialNoise(vec2 wxz, float amp) {
        if (amp < 0.01) return 0.0;
        float n = noise(wxz * 0.021) * 0.68 + noise(wxz * 0.052) * 0.32;
        return (n - 0.5) * 2.0 * amp;
      }

      void main() {
        // --- per-pixel surface normal: analytic swell + scrolling ripples ----
        vec4 floorSample = texture2D(uSeafloor, vFlatXZ / uSize + 0.5);
        float standingWater = texture2D(uStandingWaterMask, vFlatXZ / uSize + 0.5).r;
        float dRaw = uWaterLevel - (floorSample.r * ${HSPAN.toFixed(1)} + (${HMIN.toFixed(1)})); // signed: <0 just inland of the line
        // Break up the byte quantisation of the packed height. One step is
        // HSPAN/255; on a gentle shelf that is metres wide horizontally, so
        // every depth-keyed term draws a hard contour along each tread. A
        // half-step of world-space noise turns the staircase into a grain the
        // eye reads as seabed texture instead of as a seam. The offset is far
        // too small to disturb the shoreline or the foam gates.
        dRaw += (noise(vFlatXZ * 3.7) + noise(vFlatXZ * 11.3) - 1.0) * ${(7.0 / 255 * 0.6).toFixed(4)};
        float shoreDist = floorSample.g * ${SHORE_DIST_RANGE.toFixed(1)};
        float shoreSoftness = floorSample.b;
        float playableFade = floorSample.a;
        // Spread across the whole playableFade ramp rather than a narrow slice
        // of it. The old 0.08..0.5 window compressed a 70% shift toward uDeep
        // into roughly an 11m band, which read as an edge; over the full ramp
        // the same handoff is a gradient. Belt and braces with the rounded
        // corner in the bake: this one also softens the straight sections.
        float edgeOcean = 1.0 - smoothstep(0.02, 0.88, playableFade);
        float dEff = dRaw + swashLift(vFlatXZ, uTime, dRaw);
        float depth = max(0.0, dEff);

        vec3 normal;
        vec3 waveDisp = gerstner(vFlatXZ, uTime, swellAtten(max(dRaw, 0.0)), normal);
        // Gerstner's analytic normal does not know about the cliff breaker
        // displacement. Blend in the resolved surface derivative only where
        // that breaker is active, so its face catches light as a moving mass
        // instead of retaining the lighting of a flat plane.
        float breakerNormalPhase;
        float breakerNormalStrength;
        float breakerNormalMask = breakerField(
          vFlatXZ,
          uTime,
          shoreDist,
          depth,
          vExposure,
          breakerNormalPhase,
          breakerNormalStrength
        );
        vec3 resolvedNormal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (resolvedNormal.y < 0.0) resolvedNormal *= -1.0;
        float localCliffSwell = cliffSwellAt(vFlatXZ);
        float resolvedNormalShare = clamp(
          breakerNormalMask * breakerNormalStrength * localCliffSwell * 0.88,
          0.0,
          0.88
        );
        normal = normalize(mix(normal, resolvedNormal, resolvedNormalShare));
        // Partially normalised so the crest-gated thresholds below stay near
        // where they were authored while still responding to sea state.
        float crestHeight = waveDisp.y * uCrestNorm;
        vec3 waveNormal = normal;
        float waveSlope = length(waveNormal.xz);
        float footprint = max(fwidth(vWorld.x), fwidth(vWorld.z));
        float rippleLod = 1.0 - smoothstep(0.18, 1.05, footprint);
        float microLod = 1.0 - smoothstep(0.08, 0.54, footprint);
        float e = 0.12;
        // Glassy lagoon: detail ripples relax with distance so mid/far water
        // reads as a smooth gradient with sky sheen instead of noise — but
        // only inside the shelf. Open sea keeps its chop (the mockup's deep
        // water is textured swell, not glass).
        float deepChop = smoothstep(26.0, 48.0, shoreDist);
        float glassBy = 1.0 - 0.55 * smoothstep(18.0, 65.0, length(vWorld.xz - cameraPosition.xz))
          * (1.0 - deepChop * 0.72);
        #ifdef CINEMATIC_WATER
          // The distance flattening above is why mid/far cinematic water read
          // identical to polished: it relaxed the very detail the tier pays
          // for. Keep more ripple texture alive offshore and in wind — the
          // footprint-based LODs below still stop it from aliasing.
          glassBy = mix(glassBy, 1.0, 0.34 * deepChop + 0.22 * clamp(uChopWind, 0.0, 1.0));
        #endif
        vec2 rippleSlope = rippleNormalSlope(vWorld.xz, uTime, rippleLod, microLod);
        normal = normalize(normal + vec3(-rippleSlope.x, 0.0, -rippleSlope.y) * 2.15 * glassBy);
        if (uRain > 0.001) {
          vec2 rainP = vWorld.xz * 3.7 + vec2(uTime * 0.72, -uTime * 0.58);
          float rainN = noise(rainP);
          vec2 rainGrad = vec2(
            noise(rainP + vec2(e, 0.0)) - rainN,
            noise(rainP + vec2(0.0, e)) - rainN
          );
          normal = normalize(normal + vec3(-rainGrad.x, 0.0, -rainGrad.y) * uRain * 0.85 * mix(0.38, 1.0, microLod));
        }
        // Wading ripples: concentric rings spreading from the player, felt as
        // a gentle normal perturbation (they catch the sky sheen and glitter).
        // No deep-water cutoff: swimming and treading water must disturb the
        // surface anywhere in the ocean, not just where Darwin can stand.
        float oceanRippleMask = uOceanPlayerRippleEnabled
          * (1.0 - smoothstep(0.12, 0.56, standingWater))
          * smoothstep(0.015, 0.07, depth)
          * playableFade;
        float playerRippleGlint = 0.0;
        if (uPlayerRipple * oceanRippleMask > 0.001) {
          vec2 toPlayer = vWorld.xz - uPlayer.xz;
          float pd = length(toPlayer);
          float rippleEnv = uPlayerRipple
            * oceanRippleMask
            * (1.0 - smoothstep(0.85, 3.1, pd)) // local body disturbance
            * smoothstep(0.04, 0.18, pd); // quiet right at the body
          if (rippleEnv > 0.003) {
            float ring = sin(pd * 15.5 - uTime * 7.0) * 0.58
              + sin(pd * 24.0 - uTime * 9.4) * 0.42;
            vec2 rippleDir = toPlayer / max(pd, 1e-3);
            normal = normalize(normal + vec3(rippleDir.x, 0.0, rippleDir.y) * ring * 0.4 * rippleEnv);
            playerRippleGlint += pow(max(ring * 0.5 + 0.5, 0.0), 3.0) * rippleEnv * 0.11;
          }
        }
        float eventRippleGlint = 0.0;
        vec2 eventRippleSlope = vec2(0.0);
        for (int i = 0; i < ${OCEAN_PLAYER_RIPPLE_COUNT}; i++) {
          vec4 ripple = uOceanRipples[i];
          float age = uOceanRippleTime - ripple.z;
          float impact = clamp(ripple.w, 0.0, 1.75);
          float impact01 = impact / 1.75;
          float lifetime = mix(0.72, 1.45, impact01);
          float alive = step(0.0, age) * (1.0 - smoothstep(lifetime * 0.48, lifetime, age));
          vec2 deltaRipple = vWorld.xz - ripple.xy;
          float distRipple = length(deltaRipple);
          vec2 dirRipple = deltaRipple / max(distRipple, 0.001);
          float radius = 0.1 + age * mix(1.08, 1.72, impact01);
          float band = exp(-pow((distRipple - radius) * mix(8.8, 5.4, impact01), 2.0));
          float localChurn = 1.0 - smoothstep(0.05, mix(0.58, 1.05, impact01), distRipple);
          float rangeFade = 1.0 - smoothstep(mix(0.95, 1.7, impact01), mix(1.9, 3.4, impact01), distRipple);
          float eventEnv = alive * impact * oceanRippleMask * rangeFade;
          float phase = (distRipple - radius) * mix(24.0, 15.5, impact01);
          float wave = sin(phase);
          float churn = sin(distRipple * 31.0 - age * 25.0) * localChurn;
          eventRippleSlope += dirRipple * (cos(phase) * band * 1.15 + churn * 0.3) * eventEnv;
          eventRippleGlint += pow(max(wave * 0.5 + 0.5, 0.0), 2.35) * band * eventEnv * 0.28;
        }
        if (length(eventRippleSlope) > 0.0001) {
          normal = normalize(normal + vec3(eventRippleSlope.x, 0.0, eventRippleSlope.y) * 0.5);
        }
        if (eventRippleGlint + playerRippleGlint > 0.001) {
          normal = normalize(normal + vec3(eventRippleSlope.x, 0.0, eventRippleSlope.y) * 0.04);
          }
        float interactionFoam = 0.0;
        float interactionGlint = 0.0;
        #ifdef CINEMATIC_WATER
          // Obstacles that pierce the surface bend the incoming swell around
          // their footprint. The signed-distance field is sourced from the
          // collision registry, so these rings remain attached to real rocks.
          vec4 contactField = texture2D(uWaterContact, vWorld.xz / uSize + 0.5);
          float contactSigned = (contactField.r - 0.5) * ${(WATER_CONTACT_DISTANCE_RANGE * 2).toFixed(1)};
          vec2 contactDir = normalize(contactField.gb * 2.0 - 1.0 + vec2(0.0001));
          float contactJitter = (noise(vWorld.xz * 0.63) - 0.5) * 0.16;
          float roughContact = contactSigned + contactJitter;
          float contactWaterSide = smoothstep(-0.1, 0.16, roughContact);
          float interactionSurfaceMask = (1.0 - smoothstep(0.12, 0.56, standingWater))
            * smoothstep(0.025, 0.11, depth) * playableFade;
          float contactReach = (1.0 - smoothstep(0.1, ${WATER_CONTACT_DISTANCE_RANGE.toFixed(1)}, max(roughContact, 0.0)))
            * contactWaterSide * contactField.a * interactionSurfaceMask;
          if (contactReach > 0.002) {
            // Water laps against rock; it does not radiate a persistent
            // concentric sine field. Three restraints keep the read physical:
            // the slope is less than half its first-pass strength, the arc is
            // torn by slow noise so no ring survives as a complete circle,
            // and the whole disturbance surges with the actual passing swell
            // (crestHeight) instead of ringing at constant amplitude.
            float wrappedWave = sin(max(roughContact, 0.0) * 5.4 - uTime * 1.7
              + noise(vWorld.xz * 0.21) * 1.4);
            float arcBreakup = 0.42 + 0.58 * smoothstep(0.28, 0.72,
              noise(vWorld.xz * 0.66 + vec2(uTime * 0.045, -uTime * 0.035)));
            float swellSurge = 0.45 + 0.55 * smoothstep(-0.035, 0.055, crestHeight);
            float contactEnv = contactReach * arcBreakup * swellSurge;
            normal = normalize(normal + vec3(contactDir.x, 0.0, contactDir.y)
              * wrappedWave * contactEnv * 0.085);
            float contactCore = exp(-pow(roughContact * 4.6, 2.0)) * contactWaterSide;
            float contactTear = 0.48 + 0.52 * smoothstep(0.34, 0.78,
              noise(vWorld.xz * 1.8 + vec2(uTime * 0.055, -uTime * 0.04)));
            interactionFoam = max(interactionFoam,
              contactCore * contactTear * contactField.a * interactionSurfaceMask
                * (0.24 + swellSurge * 0.12));
            interactionGlint += pow(max(wrappedWave * 0.5 + 0.5, 0.0), 3.0)
              * contactEnv * 0.07;
          }

          // Live rigid bodies produce a bow ring and, once moving, a widening
          // Kelvin-like V wake. Direction and length come from Rapier velocity;
          // stationary floaters retain only a small bobbing contact ripple.
          for (int i = 0; i < ${WATER_BODY_INFLUENCE_COUNT}; i++) {
            float activeBody = 1.0 - step(uWaterBodyCount, float(i) + 0.5);
            vec4 bodyInfo = uWaterBodies[i];
            vec4 motionInfo = uWaterBodyMotion[i];
            vec2 bodyDelta = vWorld.xz - bodyInfo.xy;
            float bodyDistance = length(bodyDelta);
            vec2 bodyRadial = bodyDelta / max(bodyDistance, 0.001);
            float bodyRadius = max(bodyInfo.z, 0.12);
            float bodyStrength = bodyInfo.w * activeBody * interactionSurfaceMask;
            float boundaryDistance = bodyDistance - bodyRadius;
            float waterSide = smoothstep(-0.08, 0.12, boundaryDistance);
            float bodyReach = (1.0 - smoothstep(0.0, bodyRadius * 1.8 + 1.15, max(boundaryDistance, 0.0)))
              * waterSide * bodyStrength;
            // Same restraint as the rock contact rings: lower slope, slower
            // phase, and a torn arc so a bobbing floater reads as lapping
            // water rather than a target reticle.
            float bodyArcBreakup = 0.45 + 0.55 * smoothstep(0.3, 0.72,
              noise(vWorld.xz * 0.72 + vec2(motionInfo.w * 0.4, uTime * 0.04)));
            float bodyRing = sin(boundaryDistance * 8.5 - uTime * 2.3 + motionInfo.w);
            normal = normalize(normal + vec3(bodyRadial.x, 0.0, bodyRadial.y)
              * bodyRing * bodyReach * bodyArcBreakup * 0.09);

            float contactRing = exp(-pow(boundaryDistance * 5.2, 2.0)) * waterSide;
            float bodyTear = 0.42 + 0.58 * smoothstep(0.36, 0.76,
              noise(vWorld.xz * 2.15 + vec2(motionInfo.w, -uTime * 0.06)));
            interactionFoam = max(interactionFoam,
              contactRing * bodyTear * bodyStrength * (0.13 + min(motionInfo.z, 1.2) * 0.22));
            interactionGlint += pow(max(bodyRing * 0.5 + 0.5, 0.0), 3.0)
              * bodyReach * bodyArcBreakup * 0.05;

            float moving = smoothstep(0.045, 0.28, motionInfo.z) * bodyStrength;
            vec2 moveDir = motionInfo.xy / max(motionInfo.z, 0.001);
            vec2 moveSide = vec2(-moveDir.y, moveDir.x);
            float alongMotion = dot(bodyDelta, moveDir);
            float behind = max(-alongMotion, 0.0);
            float sideMotion = dot(bodyDelta, moveSide);
            float wakeLength = bodyRadius * 2.8 + min(motionInfo.z, 1.4) * 6.4;
            float wakeWindow = smoothstep(bodyRadius * 0.18, bodyRadius * 0.82, behind)
              * (1.0 - smoothstep(wakeLength * 0.62, wakeLength, behind));
            float wakeArmCentre = bodyRadius * 0.54 + behind * 0.28;
            float wakeArmWidth = 0.11 + bodyRadius * 0.14 + behind * 0.035;
            float wakeArm = exp(-pow((abs(sideMotion) - wakeArmCentre) / wakeArmWidth, 2.0));
            float wakePulse = sin(behind * 6.0 - uTime * (3.4 + motionInfo.z * 1.8) + motionInfo.w);
            float sideSign = sideMotion < 0.0 ? -1.0 : 1.0;
            // Stationary floating props have a zero velocity vector. GLSL's
            // normalize(vec2(0)) is undefined and produced NaNs on ANGLE;
            // NaN * zero still poisoned the HDR water output, which bloom
            // expanded into a completely white frame in cinematic mode.
            vec2 wakeSlopeVector = moveSide * sideSign + moveDir * 0.28;
            vec2 wakeSlopeDir = wakeSlopeVector / max(length(wakeSlopeVector), 0.001);
            float wakeEnvelope = wakeArm * wakeWindow * moving;
            normal = normalize(normal + vec3(wakeSlopeDir.x, 0.0, wakeSlopeDir.y)
              * wakePulse * wakeEnvelope * 0.2);
            float bowGate = smoothstep(bodyRadius * 0.05, bodyRadius * 0.82, alongMotion);
            float bowWave = exp(-pow(boundaryDistance * 3.8, 2.0)) * bowGate * moving;
            normal = normalize(normal + vec3(bodyRadial.x, 0.0, bodyRadial.y)
              * bowWave * 0.18);
            float wakeBreakup = 0.5 + 0.5 * smoothstep(0.4, 0.78,
              noise(vec2(behind * 0.7 + motionInfo.w, sideMotion * 1.6 - uTime * 0.08)));
            interactionFoam = max(interactionFoam,
              (wakeArm * wakeWindow * wakeBreakup * 0.22 + bowWave * 0.42) * moving);
            interactionGlint += (wakeArm * wakeWindow * 0.13 + bowWave * 0.18) * moving;
          }
        #endif
        if (!gl_FrontFacing) normal = -normal;

        vec3 viewDir = normalize(cameraPosition - vWorld);
        float underwaterView = clamp(uUnderwaterAmount, 0.0, 1.0);
        // How much water the eye ray actually crosses, as a multiple of the
        // vertical drop. Snell bends the ray toward the vertical once it is
        // below the surface, so the stretch tops out at ~1.51x even at grazing
        // incidence. That bound is the reason real shallows stay legible from
        // every angle: what hides the bed from a beach-level camera is the
        // reflection term, not absorption.
        float cosAir = clamp(abs(viewDir.y), 0.0, 1.0);
        float cosWater = sqrt(max(0.06, 1.0 - (1.0 - cosAir * cosAir) / 1.777));
        float pathScale = mix(1.0, 1.0 / cosWater, uClarity.y);
        // Steep look-down should see the sand. The painted ramp is a stylising
        // glaze, so it fades out exactly where honest transparency is expected.
        float glazeByAngle = mix(1.0, 1.0 - uClarity.x, smoothstep(0.28, 0.78, cosAir));

        // --- the water body: art-directed turquoise first, refraction second -
        float shallowFactor = exp(-depth * 0.30); // ~1 at the shore, 0 deep
        // What gets added back as in-scatter. Desaturating it and tying it to
        // the sun are the two knobs that stop a flat add from reading as milk.
        float scatterLuma = dot(uScatter, vec3(0.2126, 0.7152, 0.0722));
        vec3 scatterTint = mix(vec3(scatterLuma), uScatter, uBody.z)
          * uBody.y * mix(1.0, uDaylight, uBody.w);
        vec3 baseAbsorb = exp(-uAbsorb * depth);
        vec3 baseWater = uSand * baseAbsorb + scatterTint * (1.0 - baseAbsorb);
        vec3 color = baseWater;
        // Kept for the single-blend body below: the seabed as sampled, and how
        // much of it survives the water column.
        vec3 bedSample = uSand;
        vec3 bedTrans = vec3(1.0);
        if (uHasRefraction > 0.5) {
          // Distort harder where the water is deeper; nearly straight at the
          // swash line so the beach doesn't smear.
          vec2 screenUV = gl_FragCoord.xy / uResolution;
          float shallowClarity = 1.0 - smoothstep(0.35, 1.65, depth);
          float distort = mix(0.004 + min(depth, 2.5) * 0.010, 0.0025, shallowClarity);
          #ifdef ENHANCED_WATER
            #ifdef CINEMATIC_WATER
              distort *= 1.28;
            #else
              distort *= 1.12;
            #endif
          #endif
          vec2 ruv = clamp(screenUV + normal.xz * distort, vec2(0.001), vec2(0.999));
          vec3 grab = texture2D(uRefraction, ruv).rgb;
          #ifdef CINEMATIC_WATER
            // Slight wavelength separation and a second crossed wavelet read
            // make the seabed visibly refract without turning edges rainbow.
            vec2 dispersion = normal.xz * distort * 0.16;
            grab.r = texture2D(uRefraction, clamp(ruv + dispersion, vec2(0.001), vec2(0.999))).r;
            grab.b = texture2D(uRefraction, clamp(ruv - dispersion, vec2(0.001), vec2(0.999))).b;
            vec2 crossed = vec2(-normal.z, normal.x) * distort * 0.42;
            vec3 crossedGrab = texture2D(uRefraction, clamp(ruv + crossed, vec2(0.001), vec2(0.999))).rgb;
            grab = mix(grab, crossedGrab, 0.1);
          #endif
          // Decode only when the grab is output-encoded (see uRefractionEncoded)
          // so the Beer-Lambert tint operates on plausible linear values.
          grab = mix(grab, pow(grab, vec3(2.2)), uRefractionEncoded);

          // Keep the captured scene honest. Only dark basalt in very shallow
          // water gets a mild lift toward submerged turquoise so it doesn't
          // read as a hole in the sea.
          float grabLum = dot(grab, vec3(0.299, 0.587, 0.114));
          vec3 liftColor = mix(uScatter, uSand, 0.62);
          float darkLift = shallowClarity * smoothstep(0.3, 0.06, grabLum);
          vec3 gradedGrab = mix(grab, max(grab, liftColor * 0.8), darkLift * uBody2.x);

          float opticalDepth = depth * pathScale + 0.018;
          #ifdef ENHANCED_WATER
            #ifdef CINEMATIC_WATER
              opticalDepth *= 1.12;
            #else
              opticalDepth *= 1.06;
            #endif
          #endif
          bedTrans = exp(-uAbsorb * opticalDepth);
          bedSample = gradedGrab;
          vec3 bed = gradedGrab * bedTrans;
          float scatterStrength = mix(0.08, 0.5, smoothstep(0.5, 2.8, depth));
          vec3 refractedDetail = bed + scatterTint * (1.0 - exp(-depth * 0.30)) * scatterStrength;
          // Shallow water IS the refracted scene; the painted body takes over
          // only as real depth accumulates. The handover used to be most of the
          // way done by chest depth, which is what made a knee-deep shelf read
          // as paint from above.
          float captureFar = max(uClarity2.x, 0.4);
          float captureMix = mix(uClarity.z, uClarity.w, smoothstep(captureFar * 0.23, captureFar, depth))
            * (1.0 - smoothstep(captureFar * 1.06, captureFar * 1.83, depth));
          #ifdef ENHANCED_WATER
            #ifdef CINEMATIC_WATER
              captureMix = min(0.98, captureMix * 1.09);
            #else
              captureMix = min(0.96, captureMix * 1.045);
            #endif
          #endif
          color = mix(baseWater, refractedDetail, captureMix);
        }

        // Global depth colour ramp. This is intentionally simple: shallow
        // water should read pale/seafoam, mid-depth turquoise, then blue at
        // the drop-off. The baked depth texture already gives every region
        // the needed signal, so this improves the whole water system without
        // adding regional profiles or passes.
        float nearShelf = 1.0 - smoothstep(18.0, 52.0, shoreDist);
        // Trimmed vs the first pass: the ramp is a thin glaze over the
        // refracted scene now, not a paint layer (the mockup body is glassy).
        // The panel's "shallow glaze" knob used to be written into a uniform
        // nothing read: the floor here was a hardcoded 0.40 and no amount of
        // dragging the slider changed the water.
        float rampVisibility = playableFade * (uRampOpacity.x + nearShelf * 0.16)
          * (1.0 - edgeOcean * 0.35) * glazeByAngle;
        vec3 paleAqua = mix(uSand, uFoam, uRampMix.x);
        vec3 seafoamShelf = mix(uSand, uScatter, uRampMix.y);
        seafoamShelf = mix(
          seafoamShelf,
          vec3(seafoamShelf.r * 0.86, max(seafoamShelf.g, seafoamShelf.b * 1.04), seafoamShelf.b * 0.94),
          uRampMix.z
        );
        vec3 midTurquoise = mix(uScatter, uDeep, uRampMix.w);

        // Distance deepening biases the ramp's *input depth* instead of adding
        // another mix toward blue. A wide shallow bay still travels turquoise
        // to deep with distance from the beach — it just travels along the one
        // authored ramp rather than past it.
        float offshoreTravel = smoothstep(18.0, 50.0, shoreDist) * playableFade;
        float rampDepth = depth
          + edgeOcean * uRampBias.x
          + offshoreTravel * uRampBias.y;

        vec3 depthRamp = paleAqua;
        depthRamp = mix(depthRamp, seafoamShelf, smoothstep(uRampDepths.x, uRampDepths.y, rampDepth));
        depthRamp = mix(depthRamp, midTurquoise, smoothstep(uRampDepths.y, uRampDepths.z, rampDepth));
        depthRamp = mix(depthRamp, uDeep, smoothstep(uRampDepths.z, uRampDepths.w, rampDepth));
        // Whole-body grade, applied to the ramp rather than to the composited
        // colour so it cannot fight the reflection, foam or glitter terms.
        float rampLuma = dot(depthRamp, vec3(0.2126, 0.7152, 0.0722));
        depthRamp = mix(vec3(rampLuma), depthRamp, uRampBias.z) * uRampBias.w;

        // Opacity follows optical depth: a hand's breadth of water over sand is
        // a glaze you see straight through, and eight metres is not. The old
        // shader held this constant and faked the drop-off with extra colour
        // mixes, which is precisely what made deep water read as paint.
        float rampOpacity = mix(
          rampVisibility,
          uRampOpacity.y,
          smoothstep(uRampDepths.z, max(uRampOpacity.z, uRampDepths.z + 0.1), rampDepth)
        );
        // Keep the waterline fade: the ramp must arrive, not start, at the sand.
        // It used to be fully on by 16cm, so the first stride into the sea hit
        // half a screen of flat colour. Give it most of a metre to arrive.
        float shoreFade = smoothstep(0.03, max(uRampDepths.y, 0.85), depth);
        color = mix(color, depthRamp, clamp(shoreFade * rampOpacity, 0.0, 1.0));
        // One-blend body. Everything above stacks five washes on the same
        // pixel — bed, in-scatter, ramp, and later the mirror and the haze —
        // and five washes average out to flat bright colour whatever each one
        // is worth on its own. This is the same water expressed as a single
        // Beer-Lambert mix: the seabed, dimmed by the column, over the
        // authored ramp colour. Drag uBody.x to compare them directly.
        if (uBody.x > 0.001 && uHasRefraction > 0.5) {
          vec3 oneBlend = bedSample * bedTrans + depthRamp * (1.0 - bedTrans);
          color = mix(color, oneBlend, uBody.x);
        }
        #ifdef ENHANCED_WATER
          // A restrained blue-green extinction pass makes the shallow shelf
          // feel transparent while the drop-off gains actual optical depth.
          float cinematicDepth = smoothstep(0.55, 4.8, depth) * (1.0 - edgeOcean * 0.25);
          #ifdef CINEMATIC_WATER
            color = mix(color, color * vec3(0.78, 0.91, 0.98), cinematicDepth * 0.13);
          #else
            color = mix(color, color * vec3(0.82, 0.93, 0.985), cinematicDepth * 0.085);
          #endif
        #endif

        // The three separate mixes toward uDeep that used to live here — an
        // open-ocean ease, an edge-of-map deepening and an offshore-travel
        // gradient — are gone. Each was a colour mix on its own mask, layered
        // over a ramp that had already been windowed out, so the deep half of
        // the bay was the sum of overlapping washes rather than an authored
        // colour. Their intent now feeds the ramp as depth bias above.

        // Seam continuity with the open-ocean disc: by the time the plane's
        // alpha feather hands off (last ~14m before the rim), the body colour
        // must have arrived at uDeep — the disc's inner colour — or the
        // crossfade reads as a hard cyan/navy arc around the bay.
        //
        // This used to be a fixed 36..66m ramp on the raw radius: a perfect
        // circle centred on the world origin, with no noise on it and no panel
        // knob. That circle — not the alpha seam, not the depth ramp — is what
        // read as a drawn line between the bay and the open sea, because it
        // takes the body 85% of the way to deep blue over 30m of a shape
        // nothing else in the scene shares. It now starts where uRimTravel.x
        // says, and its onset wanders on two noise fields so the bay hands off
        // along a broken, patchy front instead of an arc.
        float rimRadius = uSize * 0.5;
        float rimDist = length(vWorld.xz);
        // The wander has to die out before the crossfade begins, or a patch of
        // bay colour survives into the handoff and puts the arc straight back.
        float rimNoiseFade = 1.0 - smoothstep(rimRadius - 26.0, rimRadius - 11.0, rimDist);
        // Same field the alpha seam rides, plus a slower one at a larger
        // amplitude. A colour boundary tolerates far more wander than an alpha
        // crossfade does, which is why this gets its own knob rather than
        // reusing seamNoise.
        float rimWander = (seamRadialNoise(vWorld.xz, uRimTravel.z)
          + (noise(vWorld.xz * 0.011 + vec2(11.3, -4.7)) - 0.5) * 2.6 * uRimTravel.z)
          * rimNoiseFade;
        float rimTravel = smoothstep(
          rimRadius - max(uRimTravel.x, 12.0),
          rimRadius - 9.0,
          rimDist + rimWander
        );
        color = mix(color, uDeep, rimTravel * uRimTravel.y);

        // Detail handoff to the open-ocean disc.
        //
        // The disc has no vertex displacement at all — its surface is a normal
        // map and nothing else. The plane has Gerstner crests, whitecaps and
        // crest banding. Crossfading one into the other over the old 12m alpha
        // ramp meant wave structure simply stopped along a line, which is what
        // reads as a seam out in the bay. Damping the plane's *detail* over a
        // much longer approach lets the two surfaces agree before the alpha
        // crossfade begins, so there is nothing left to notice at the join.
        float seamWidth = max(uRampOpacity.w, 8.0);
        float seamDetail = 1.0 - smoothstep(rimRadius - seamWidth, rimRadius - 4.0, length(vWorld.xz));

        // Wind texture: let the wave normals we already compute tint the body
        // slightly, so the surface reads as rippled water (not a smooth
        // gradient) even at steep look-down angles where fresnel correctly
        // kills the sky reflection. Signed slope keeps it streaky rather than
        // uniformly noisy; fades out before it could shimmer at distance.
        float windToneDist = length(vWorld.xz - cameraPosition.xz);
        float windToneGate = smoothstep(0.05, 0.3, depth)
          * (1.0 - smoothstep(48.0, 100.0, windToneDist));
        float windTone = dot(normal.xz, vec2(0.707, 0.707));
        color *= 1.0 + windTone * uWindToneWeight * windToneGate;

        // Sparse whitecaps past the shelf (mockup: the open sea has flecks of
        // white that give it scale; the lagoon stays clean). Clumped seeds on
        // steeper wave faces only, so they ride the swell instead of floating.
        // Whitecaps are wave events, not sprinkles: they ignite at the crest
        // top of the Gerstner swell, stretch along the crest line
        // (perpendicular to the swell direction), and a fainter lace trail
        // decays below the lip. Wind gates the population — calm mornings
        // stay nearly clean; breezy weather flecks the open sea.
        float capGate = smoothstep(26.0, 48.0, shoreDist) * playableFade
          * uCapWindGate * uCapDensity * uDaylight;
        if (capGate > 0.004) {
          vec2 swellPerp = vec2(-SWELL_DIR.y, SWELL_DIR.x);
          vec2 capUV = vec2(dot(vWorld.xz, SWELL_DIR) * 0.6, dot(vWorld.xz, swellPerp) * 0.13);
          float capSeed = noise(capUV + vec2(uTime * 0.06, uTime * 0.013));
          float capLip = smoothstep(uCapCrest * 0.85, uCapCrest * 1.45, crestHeight);
          float capTrail = smoothstep(uCapCrest * 0.35, uCapCrest * 0.85, crestHeight) * (1.0 - capLip);
          // The seed threshold width follows the pixel footprint, around the
          // same 0.74 centre the fixed 0.62..0.86 window had — so the mean
          // population is unchanged, but up close a narrow window cuts crisp
          // torn caps out of the noise, and far away it opens until the field
          // is a smooth density. A fixed window does one or the other: at this
          // plane's grazing distances the old one crawled.
          float capLod = clamp(length(fwidth(capUV)) * 1.6, 0.0, 1.0);
          float capSoft = mix(0.045, 0.30, capLod);
          float caps = (capLip + capTrail * 0.4)
            * smoothstep(0.74 - capSoft, 0.74 + capSoft, capSeed) * capGate;
          #ifdef ENHANCED_WATER
            // The tearing noise is 2.9x finer than the seed, so it goes
            // sub-pixel first. Fade it toward its own mean rather than letting
            // it keep adding contrast a pixel can no longer resolve.
            float capFine = noise(capUV * 2.9 + vec2(-uTime * 0.11, uTime * 0.037));
            float capDetail = 1.0 - capLod;
            #ifdef CINEMATIC_WATER
              float tornCap = mix(0.975, 0.7 + 0.55 * smoothstep(0.38, 0.8, capFine), capDetail);
              caps = caps * tornCap
                + capTrail * smoothstep(0.72, 0.9, capSeed) * smoothstep(0.48, 0.76, capFine)
                  * capGate * 0.24 * capDetail;
            #else
              float tornCap = mix(0.95, 0.78 + 0.34 * smoothstep(0.4, 0.8, capFine), capDetail);
              caps = caps * tornCap
                + capTrail * smoothstep(0.75, 0.9, capSeed) * smoothstep(0.52, 0.78, capFine)
                  * capGate * 0.12 * capDetail;
            #endif
          #endif
          color = mix(color, uFoam, min(caps, 1.0) * 0.55 * seamDetail);
        }

        // Mostly-opaque body (it *shows* the refracted scene), but genuinely
        // clear in the shallows — wading legs and the bed stay visible —
        // feathered to nothing exactly at the moving waterline.
        float shallowOpacity = mix(0.62, 0.985, smoothstep(0.25, 2.1, depth));
        float alpha = smoothstep(0.0, 0.075, dEff) * shallowOpacity;

        // --- reflection: a garnish on top of the clear body -------------------
        vec3 refl = reflect(-viewDir, normal);
        // Steeper tilt->color mapping (uSkyReflCurve) spreads the sky gradient
        // across ripple facets, so neighbouring highlights vary in hue/value
        // instead of all landing on the same horizon swatch.
        vec3 skyRefl = mix(uSkyHorizon, uSky, clamp(refl.y * uSkyReflCurve, 0.0, 1.0));
        vec3 waterSheen = mix(uScatter, uSkyHorizon, 0.36);
        skyRefl = mix(skyRefl, waterSheen, 0.12);
        skyRefl = mix(skyRefl, skyRefl * vec3(0.96, 1.035, 0.90), 0.22);
        // The reflected sky is a gradient, not a fill: it brightens and picks
        // up the sun's tint toward the sun's azimuth at the horizon band, and
        // a slow drifting luminance field keeps broad sheen patches reading
        // as moving water instead of flat paint.
        vec2 reflAz = normalize(refl.xz + vec2(1e-4, 0.0));
        float sheenSunward = smoothstep(-0.25, 1.0, dot(reflAz, normalize(uSun.xz + vec2(1e-4, 0.0))));
        float sheenHorizon = 1.0 - clamp(refl.y * 2.4, 0.0, 1.0);
        skyRefl += uSunColor * sheenSunward * sheenHorizon * uDaylight
          * (0.035 + uSunPathStrength * 0.045) * (1.0 - uRain * 0.8);
        float skyReflLuma = dot(skyRefl, vec3(0.299, 0.587, 0.114));
        skyRefl = mix(skyRefl, vec3(skyReflLuma), uSunPathStrength * 0.10);
        skyRefl *= 0.95 + 0.10 * noise(vWorld.xz * 0.05 + vec2(uTime * 0.013, -uTime * 0.009));
        vec3 reflColor = skyRefl;
        vec3 planarScene = vec3(0.0);
        float planarCover = 0.0;
        if (uHasReflection > 0.5 && vReflCoord.w > 0.0) {
          vec2 mruv = vReflCoord.xy / vReflCoord.w + normal.xz * uReflDistort;
          vec2 edge = smoothstep(0.0, 0.08, mruv) * smoothstep(1.0, 0.92, mruv);
          float valid = edge.x * edge.y;
          // The mirror pass clears to black at alpha 0, so alpha is scene-
          // object coverage: composite the mirrored scene over the analytic
          // sky only where something was actually drawn. Un-premultiply so
          // bilinear edge texels don't fringe toward the black clear color.
          vec4 planarSample = texture2D(uReflection, clamp(mruv, 0.0, 1.0));
          #ifdef CINEMATIC_WATER
            // A razor-sharp mirror reads as glass; real sea softens reflected
            // silhouettes vertically as ripple facets scatter them. Two extra
            // taps stretched along the mirror's v axis approximate that
            // roughness for the cost of two texture reads.
            vec4 planarSoftA = texture2D(uReflection, clamp(mruv + vec2(0.0, 0.0034), 0.0, 1.0));
            vec4 planarSoftB = texture2D(uReflection, clamp(mruv - vec2(0.0012, 0.0028), 0.0, 1.0));
            planarSample = planarSample * 0.5 + planarSoftA * 0.27 + planarSoftB * 0.23;
          #endif
          float planarA = clamp(planarSample.a, 0.0, 1.0);
          planarCover = planarA * valid;
          planarScene = min(planarSample.rgb / max(planarA, 0.05), vec3(0.92));
          reflColor = mix(skyRefl, planarScene, planarCover * uPlanarShare);
        }
        // Water-only reflection grade: keep sky sheen, but reduce the violet
        // bias that ACES/sky saturation can push into glancing highlights.
        reflColor = mix(reflColor, reflColor * vec3(0.97, 1.025, 0.90), uReflNeutralGrade);
        // Analytic sun disc in the mirror direction — anisotropic: real
        // glitter columns stretch along the sun->viewer azimuth because
        // facets rock mostly about the horizontal axis, so the lobe is kept
        // tight across the path and relaxed along it, stretching further as
        // the sun drops. (For unit vectors dot(refl,sun) == 1 - |dev|^2/2, so
        // the elongated form reduces exactly to the old pow(dot, exp) at
        // elongation 1.)
        vec3 sunDirN = normalize(uSun);
        vec3 sunPathSide = normalize(cross(vec3(0.0, 1.0, 0.0), sunDirN + vec3(1e-4, 0.0, 0.0)));
        vec3 sunDev = refl - sunDirN;
        float sunDevCross = dot(sunDev, sunPathSide);
        vec3 sunDevAlong = sunDev - sunPathSide * sunDevCross;
        float glintElong = mix(1.3, uGlintElongation, uSunPathStrength);
        float sunAngleSq = dot(sunDevAlong, sunDevAlong) / max(glintElong, 1.0)
          + sunDevCross * sunDevCross * glintElong;
        float sunDiscExp = mix(700.0, 55.0, uSunPathStrength);
        float sunDisc = pow(max(1.0 - 0.5 * sunAngleSq, 0.0), sunDiscExp);
        reflColor += uSunColor * sunDisc * (0.6 + uSunPathStrength * 1.6) * uGlintTune.z * uDaylight
          * (1.0 - underwaterView * 0.8) * (1.0 - uRain * 0.8);
        // Schlick fresnel with water's real F0: looking down, the surface is
        // ~2% mirror (the bed shows through); at grazing angles it goes
        // glassy. Shallows are kept a touch clearer than physics for the
        // stylized lagoon read.
        float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
        // Water's true F0 is ~0.02, and from a cliff-top camera looking almost
        // straight down that is what you get: a 2% mirror, which is correct
        // and reads as flat paint. Lifting the floor is a deliberate stylised
        // departure so the sea keeps some sky in it at steep angles; grazing
        // angles are unchanged because fres dominates there.
        float reflectance = 0.055 + 0.945 * fres;
        // Shallows used to be held down to a third of the deep-water mirror,
        // which removed the one term that legitimately hides a sandbar from a
        // beach-level camera. fres is ~0.055 looking down, so raising this
        // costs nothing overhead and buys back the grazing silver.
        float reflStrength = mix(uClarity2.z, uClarity2.y, shallowFactor) * (1.0 - underwaterView * 0.72);
        float mirrorMix = clamp(reflectance * reflStrength, 0.0, 0.8);
        color = mix(color, reflColor, mirrorMix);
        // Reflected scene objects (Darwin, ship, shore) stay visible past the
        // physical ~2% down-look fresnel: a swimmer's real reflection reads
        // clearly because the body occludes the bright sky, so covered texels
        // get a stylized visibility floor on top of the fresnel mix.
        float objectMirror = clamp(
          planarCover * uObjectMirror * (1.0 - underwaterView * 0.72) - mirrorMix,
          0.0, 1.0);
        color = mix(color, planarScene, objectMirror);

        #ifdef CINEMATIC_WATER
          // Subsurface crest glow: sunlight transmitted through the thin top
          // of a wave, so crests between the viewer and the sun light up
          // turquoise from within. This is the single strongest "real
          // tropical water" cue a raster shader can buy. Deliberately subtle
          // at high noon; it opens up as the sun drops (uSunPathStrength)
          // and as wind builds actual crests to shine through.
          float sssTowardSun = pow(max(dot(-viewDir, sunDirN), 0.0) * 0.75 + 0.25, 3.0);
          float sssCrest = smoothstep(0.018, 0.085, crestHeight);
          float sssGate = smoothstep(0.35, 1.3, depth) * uDaylight
            * (1.0 - uRain * 0.7) * (1.0 - underwaterView);
          color += uScatter * 1.3 * sssTowardSun * sssCrest * sssGate
            * (0.08 + uSunPathStrength * 0.15 + clamp(uChopWind, 0.0, 1.0) * 0.05);
        #endif

        // --- sun glitter: tight sparkle, clamped below blowout ----------------
        vec3 hv = normalize(uSun + viewDir);
        vec3 glintWhite = mix(vec3(1.06, 1.035, 0.965), uFoam, 0.24);
        // Keep specular mostly white-gold. The sky can be rose; the sun flecks
        // should bloom as small hot points instead of broad pink patches.
        glintWhite = mix(glintWhite, vec3(1.12, 1.035, 0.82), uSunPathStrength * 0.38);
        // uSunPathStrength is zero whenever the sun is above ~46 degrees,
        // which on Floreana is most of the day. It should gate only the long
        // low-sun glitter *column* — but it was also scaling visibility down
        // to 36% and tightening the specular lobe to an exponent of 260, so
        // the sea had almost no sparkle at exactly the hours the sun is
        // brightest. High sun does still glitter; the patch is compact and
        // sits near the sun's own reflection rather than stretching into a
        // path, so the lobe wants to be broader at noon, not tighter.
        float glintVisibility = (0.72 + 0.28 * uSunPathStrength) * (1.0 - uRain * 0.78) * (1.0 - underwaterView * 0.88);
        float spec = pow(max(dot(normal, hv), 0.0), mix(150.0, 175.0, uSunPathStrength)) * uDaylight * glintVisibility;
        #ifdef ENHANCED_WATER
          #ifdef CINEMATIC_WATER
            spec *= 1.22;
          #else
            spec *= 1.1;
          #endif
        #endif
        float glint = 0.28 + 0.72 * rippleSparkleMask(vWorld.xz, uTime);
        vec2 sunPathDir = normalize(uSun.xz + vec2(0.0001, 0.0001));
        vec2 toWater = normalize(vWorld.xz - cameraPosition.xz + vec2(0.0001, 0.0001));
        float alongSun = smoothstep(0.02, 0.42, dot(toWater, sunPathDir));
        float crossSun = abs(toWater.x * sunPathDir.y - toWater.y * sunPathDir.x);
        float path = smoothstep(0.34 * uGlintWidth, 0.035, crossSun) * alongSun;
        float pathCore = smoothstep(0.24 * uGlintWidth, 0.018, crossSun) * alongSun;
        float pathCamDist = length(vWorld.xz - cameraPosition.xz);
        // uGlintTune.y stretches the far end of the column toward the
        // horizon; a real low sun lays a bright sheet most of the way out,
        // not a patch that stops at 180m.
        float pathFar = 138.0 * uGlintTune.y;
        float pathDistance = smoothstep(8.0, 30.0, pathCamDist)
          * (1.0 - smoothstep(pathFar, pathFar * 1.3, pathCamDist));
        float pathGrain = 0.5 + 0.58 * smoothstep(0.38, 0.86, noise(vWorld.xz * 2.0 + vec2(uTime * 0.12, -uTime * 0.075)));
        float pathGlitter = path * pathDistance * pathGrain * uSunPathStrength;
        // Peaks are allowed past 1.0 so ACES rolls them off and the brightest
        // glints cross the bloom threshold (the sparkle is a bloom customer).
        // Glint strength is authored for the sheet a low sun lays across the
        // water. Near the zenith that headroom has nowhere to go but through
        // the bloom threshold, and ACES turns clipped warm highlights yellow
        // then white — which is the blown-out surf at noon. Ease the peak back
        // to the authored ceiling as the sun climbs; golden hour is untouched.
        float noonEase = mix(1.0, 0.62, smoothstep(0.45, 0.88, uSun.y));
        float glintGain = uGlintTune.x * noonEase;
        color += glintWhite * min(spec * glint * 1.55 * glintGain, 1.45 * max(glintGain, 1.0))
          * (0.72 + uSunPathStrength * 0.42);
        color += glintWhite * pathGlitter * 0.16 * uGlintTune.x * (1.0 - uRain * 0.86) * (1.0 - underwaterView * 0.86);
        // The fleck fields below are the only microSparkleMask callers, and
        // every term they feed is multiplied by uSunPathStrength. That is
        // exactly zero whenever the sun is above ~46 degrees, which on
        // Floreana is roughly 09:30-14:30 — so the stock path spent two
        // texture fetches per ocean pixel (four on cinematic) computing zero
        // through the brightest hours of the day. uSunPathStrength is a
        // uniform, so this branch is fully coherent: no divergence, and the
        // low-sun look is untouched.
        if (uSunPathStrength > 0.002) {
          float microGlitter = microSparkleMask(vWorld.xz, uTime) * pathCore * pathDistance * uSunPathStrength;
          color += glintWhite * microGlitter * 1.6 * uGlintTune.x * (1.0 - uRain * 0.86) * (1.0 - underwaterView * 0.86);
          #ifdef CINEMATIC_WATER
            // A second, faster fleck field creates the many tiny independently
            // blinking sun points that sell scale in cinematic water.
            float cinematicFlecks = microSparkleMask(vWorld.xz * 1.43 + vec2(5.7, -9.1), uTime * 1.37)
              * path * pathDistance * uSunPathStrength;
            color += glintWhite * cinematicFlecks * 0.92 * uGlintTune.x
              * (1.0 - uRain * 0.9) * (1.0 - underwaterView * 0.9);
          #endif
        }
        color += glintWhite
          * (eventRippleGlint + playerRippleGlint + interactionGlint)
          * uDaylight
          * (1.0 - uRain * 0.7)
          * (1.0 - underwaterView * 0.86);
        // Sparse mid-water twinkle that survives high sun: a handful of tight
        // glints in the 10-90 m band. This is the "alive" signal the sun-path
        // glitter can't give outside its low-sun window.
        // The only glitter that survives high sun, so its reach matters: the
        // old 10-90m band left most of the visible sea outside it entirely,
        // including everything below a cliff-top camera.
        float sparkleGate = uDaylight * (1.0 - uRain * 0.8) * (1.0 - underwaterView)
          * smoothstep(5.0, 16.0, pathCamDist) * (1.0 - smoothstep(120.0, 175.0, pathCamDist));
        if (sparkleGate > 0.01) {
          float sparkle = rippleSparkleMask(vWorld.xz, uTime);
          float sparkleFacing = pow(max(dot(normal, hv), 0.0), 38.0);
          color += glintWhite * sparkle * sparkleFacing * sparkleGate * 1.9 * uGlintTune.x;
        }
        // --- moon glitter: the sun's math on the night sea, silver, quieter.
        // uMoonGlitter carries phase, altitude and weather gating from JS.
        if (uMoonGlitter > 0.005) {
          vec3 moonDir = normalize(uMoon);
          float moonFade = 1.0 - underwaterView * 0.85;
          float moonDisc = pow(max(dot(refl, moonDir), 0.0), mix(700.0, 90.0, uMoonGlitter));
          vec3 moonHv = normalize(moonDir + viewDir);
          float moonSpec = pow(max(dot(normal, moonHv), 0.0), mix(240.0, 130.0, uMoonGlitter));
          vec2 moonPathDir = normalize(uMoon.xz + vec2(0.0001, 0.0001));
          float moonAlong = smoothstep(0.02, 0.42, dot(toWater, moonPathDir));
          float moonCross = abs(toWater.x * moonPathDir.y - toWater.y * moonPathDir.x);
          float moonPath = smoothstep(0.30, 0.03, moonCross) * moonAlong;
          color += uMoonColor * moonDisc * (0.5 + uMoonGlitter * 0.9) * uMoonGlitter * moonFade;
          color += uMoonColor * moonSpec * glint * uMoonGlitter * 0.85 * moonFade;
          color += uMoonColor * moonPath * pathDistance * pathGrain * uMoonGlitter * 0.30 * moonFade;
        }
        color = mix(color, color * vec3(0.62, 0.76, 0.82), uRain * 0.24);

        // Wave-phase surface bands: a lightweight visual read of the same
        // Gerstner field that drives displacement/normals. This makes the
        // bay surface visibly roll even when planar reflections are disabled.
        float waterSurfaceMask = smoothstep(0.05, 0.28, depth) * playableFade * (1.0 - underwaterView * 0.55);
        // Shore-parallel lagoon rollers: in the 15-40 m window the visible
        // swell follows the coastline (lines of constant shore distance,
        // same marching convention as the breakers but slower and wider),
        // so the raw diagonal Gerstner streaks yield to them there.
        float rollerZone = smoothstep(13.0, 19.0, shoreDist) * (1.0 - smoothstep(33.0, 44.0, shoreDist));
        float rollerU = shoreDist / 16.0 + uTime * (0.6 / 16.0) + bnNoise(vWorld.xz * 0.03) * 0.35;
        float rollerWave = 0.5 + 0.5 * sin(6.28318530718 * rollerU);
        float rollerHi = smoothstep(0.6, 0.96, rollerWave);
        float rollerLo = smoothstep(0.46, 0.1, rollerWave);
        float rollerMask = rollerZone * waterSurfaceMask
          * mix(0.25, 1.0, smoothstep(-0.15, 0.6, vExposure));
        float crestBand = smoothstep(0.018, 0.118, crestHeight) * smoothstep(0.018, 0.12, waveSlope);
        float troughBand = smoothstep(0.018, 0.11, -crestHeight) * smoothstep(0.014, 0.09, waveSlope);
        crestBand *= 1.0 - rollerZone * 0.72;
        troughBand *= 1.0 - rollerZone * 0.72;
        float bandBreakup = 0.68 + 0.32 * noise(vWorld.xz * 0.18 + vec2(uTime * 0.018, -uTime * 0.012));
        vec3 crestTint = mix(uScatter, uFoam, 0.14);
        // Crest/trough banding rides this mask; folding the seam ramp in here
        // damps every band term at once as the plane approaches the disc.
        waterSurfaceMask *= seamDetail;
        color += crestTint * crestBand * bandBreakup * waterSurfaceMask * (0.08 + uDaylight * 0.07);
        color = mix(color, color * vec3(0.76, 0.90, 0.96), troughBand * waterSurfaceMask * 0.18);
        color = mix(color, uFoam, crestBand * bandBreakup * waterSurfaceMask * 0.075);
        #ifdef ENHANCED_WATER
          float crossWave = 0.5 + 0.5 * sin(
            dot(vWorld.xz, vec2(-0.51, 0.86)) * 1.28 - uTime * 1.34
            + noise(vWorld.xz * 0.11) * 1.6
          );
          float crossCrest = smoothstep(0.7, 0.97, crossWave) * rippleLod;
          #ifdef CINEMATIC_WATER
            color += crestTint * crossCrest * waveSlope * waterSurfaceMask * (0.06 + 0.08 * uDaylight);
            color = mix(color, color * vec3(0.9, 0.95, 0.98), troughBand * waterSurfaceMask * 0.08);
          #else
            color += crestTint * crossCrest * waveSlope * waterSurfaceMask * (0.035 + 0.05 * uDaylight);
            color = mix(color, color * vec3(0.92, 0.965, 0.985), troughBand * waterSurfaceMask * 0.045);
          #endif
        #endif
        // Glassy roller read: a soft sky-sheen crest and a slightly deeper
        // back slope — colour only, no foam (the mockup lagoon is clean).
        color += crestTint * rollerHi * bandBreakup * rollerMask * (0.045 + uDaylight * 0.04);
        color = mix(color, color * vec3(0.90, 0.96, 0.98), rollerLo * rollerMask * 0.12);

        // --- foam: punctuation, not texture -----------------------------------
        // Exactly three generators (mockup anatomy): a crisp line at the sand
        // contact, the rhythmic swash lip riding the beach face, and the
        // marching breaker fronts. Lines keep a solid core; lace only fringes
        // their edges. No broad wash, no mid-water crest suds.
        float realCoastGate = smoothstep(0.02, 0.24, playableFade);
        float beachGate = mix(0.68, 1.0, smoothstep(0.12, 0.74, shoreSoftness)) * realCoastGate;
        float coastWater = smoothstep(0.01, 0.12, dEff) * smoothstep(11.0, 0.25, shoreDist) * realCoastGate;
        float foamCandidate = max(
          coastWater,
          smoothstep(21.0, 2.0, shoreDist) * smoothstep(0.03, 0.3, depth)
        );
        float lace = 0.0;
        if (foamCandidate > 0.001) {
          lace = foamLace(vWorld.xz, uTime);
        }
        float swashCycle = sin(uTime * 0.5984) * 0.5 + 0.5;
        float swashFront = 0.38 + swashCycle * 2.35 + sin(vWorld.x * 0.17 + uTime * 0.30) * 0.26;
        float foamLip = smoothstep(0.6, 0.03, abs(shoreDist - swashFront));
        float waterlineTrace = smoothstep(0.12, 0.012, dEff) * smoothstep(1.7, 0.0, shoreDist);
        float contactRim = smoothstep(0.18, 0.018, abs(dEff)) * smoothstep(2.4, 0.0, shoreDist) * realCoastGate;
        float shoreFoam = coastWater * beachGate * (
          foamLip * (0.5 + 0.5 * lace)
          + waterlineTrace * (0.5 + 0.34 * lace)
        );
        shoreFoam = max(shoreFoam, contactRim * (0.74 + 0.26 * lace));
        shoreFoam *= uFoamShoreGain;
        shoreFoam *= mix(1.0, 0.08, localCliffSwell);
        float surf = breakerFoam(vFlatXZ, uTime, shoreDist, depth, lace, vExposure)
          * smoothstep(0.05, 0.24, depth)
          * mix(0.68, 1.0, beachGate)
          * mix(1.0, 1.32, localCliffSwell);
        shoreFoam *= 1.0 + uRain * 0.16;
        surf *= 1.2 + uRain * 0.22;
        float foam = clamp(max(shoreFoam * 1.05, surf), 0.0, 1.0);
        #ifdef CINEMATIC_WATER
          // Foam carried by a rock contact or moving-body wake is already
          // spatially torn above; merge it after shoreline surf so either
          // physical interaction can remain legible on calm water.
          foam = clamp(max(foam, interactionFoam), 0.0, 1.0);
        #endif
        #ifdef ENHANCED_WATER
          // Thin torn remnants linger behind the swash. They add believable
          // foam detail without filling the clean lagoon with uniform white.
          float retreat = 0.5 + 0.5 * sin(uTime * 0.5984 + 2.25);
          float washWindow = smoothstep(10.5, 1.1, shoreDist)
            * smoothstep(0.035, 0.22, depth)
            * (1.0 - smoothstep(0.82, 1.7, depth));
          float washLace = lace;
          #ifdef CINEMATIC_WATER
            washLace = foamLace(vWorld.xz * 1.24 + vec2(4.1, -2.7), uTime * 0.82);
          #endif
          float rivulets = smoothstep(0.46, 0.92, 0.5 + 0.5 * sin(
            shoreDist * 2.25 - uTime * 0.78
            + noise(vWorld.xz * 0.28 + vec2(-uTime * 0.04, uTime * 0.025)) * 3.2
          ));
          #ifdef CINEMATIC_WATER
            float backwash = washWindow * washLace
              * (0.1 + retreat * 0.18 + rivulets * 0.12) * beachGate;
            foam = clamp(max(foam * 1.08, backwash), 0.0, 1.0);
          #else
            float backwash = washWindow * washLace
              * (0.075 + retreat * 0.12 + rivulets * 0.07) * beachGate;
            foam = clamp(max(foam * 1.04, backwash), 0.0, 1.0);
          #endif
        #endif
        // Foam is reflected light, not emission. Dim the broad body at night,
        // while retaining a narrow silver response on the strongest crests
        // when moon glitter is actually reaching the surface.
        float foamCore = smoothstep(0.7, 0.98, foam);
        float foamLight = clamp(mix(0.46, 1.0, uDaylight) + uMoonGlitter * 0.28, 0.0, 1.0);
        float foamVisibility = mix(foamLight, min(1.0, foamLight + 0.18), foamCore);
        color = mix(color, uFoam, foam * 0.96 * foamVisibility);
        alpha = max(alpha, foam * 0.86 * foamVisibility);

        if (underwaterView > 0.001) {
          // Snell's window. Everything above the surface reaches a submerged
          // eye inside a 96-degree cone about the vertical; past the
          // 48.6-degree critical angle the surface is a total-internal mirror
          // of the seabed. The old model ran the other way round — most opaque
          // straight up, near-clear toward the horizon — so the shore read
          // through the waterline like aquarium glass.
          float underwaterBlend = smoothstep(0.08, 0.48, underwaterView);
          float cosTheta = clamp(dot(normal, viewDir), 0.0, 1.0);
          // Soft band around cos(48.6deg) = 0.661. Wave normals scramble the
          // rim on their own, so this only has to avoid an aliased edge.
          float snellSoft = max(uSnell.y, 0.005);
          float snellWindow = smoothstep(uSnell.x - snellSoft, uSnell.x + snellSoft, cosTheta);
          float ceilingNoise = 0.5 + 0.5 * noise(vWorld.xz * 1.75 + vec2(uTime * 0.12, -uTime * 0.09));
          vec3 ceilingTint = mix(uDeep, uScatter, 0.62 + ceilingNoise * 0.16);
          vec3 mirrorBed = ceilingTint;
          vec3 windowLight = mix(ceilingTint, uSkyHorizon, 0.5);
          if (uHasRefraction > 0.5) {
            vec2 uwUV = gl_FragCoord.xy / uResolution;
            vec2 wobble = normal.xz * uSnell2.z;
            // The mirror shows the bed, which is down-screen from here; the
            // wave normal breaks the copy up so it does not read as a smear.
            vec2 mirrorUV = clamp(uwUV + wobble * 1.7 - vec2(0.0, uSnell2.y), vec2(0.002), vec2(0.998));
            mirrorBed = mix(ceilingTint, pow(texture2D(uRefraction, mirrorUV).rgb, vec3(2.2)), uSnell2.x);
            // Inside the window the sky is still drawn behind this surface, so
            // the paint only has to ripple it. The true compression of the
            // whole hemisphere into the cone is not modelled.
            vec2 windowUV = clamp(uwUV + wobble * 0.9, vec2(0.002), vec2(0.998));
            windowLight = pow(texture2D(uRefraction, windowUV).rgb, vec3(2.2));
          }
          vec3 underwaterColor = mix(mirrorBed, windowLight, snellWindow) + uFoam * foam * 0.18;
          color = mix(color, underwaterColor, underwaterBlend);
          float underwaterAlpha = mix(uSnell.w, uSnell.z, snellWindow);
          underwaterAlpha = max(underwaterAlpha, foam * 0.82);
          alpha = mix(alpha, clamp(underwaterAlpha, 0.0, 1.0), underwaterBlend);
        }

        // A fully submerged playable map can remain shallow right through its
        // terrain bounds. Ease that shelf toward the deep-disc seam before the
        // detailed plane fades; otherwise overhead cameras expose two sharply
        // different water bodies. Land maps keep their existing colour ramp.
        float rim = uSize * 0.5;
        float shelfEdgeBlend = smoothstep(rim - 26.0, rim - 5.0, length(vWorld.xz));
        color = mix(color, uDeep, shelfEdgeBlend * uWaterOnlyShelf);

        // --- atmospheric haze --------------------------------------------------
        float camDist = length(vWorld.xz - cameraPosition.xz);
        float haze = smoothstep(uHazeNear, uHazeFar, camDist);
        // Deep water resists the haze (mockup: the horizon stays saturated
        // blue; grey-out is reserved for genuine garua via uHazeNear/Far).
        float hazeByDepth = mix(0.22, 0.78, smoothstep(0.85, 2.8, depth));
        color = mix(color, uHaze, haze * hazeByDepth);

        // --- fade the plane edge into the open-ocean disc beyond ----------------
        // Same width as the detail ramp above; a short alpha fade under a long
        // detail fade just moves the visible edge rather than removing it.
        // Seam handoff. Both this and the open-ocean disc read the same
        // noisy radius, so they dissolve into each other along one wobbly
        // boundary instead of two concentric circles that never quite
        // agreed — the disc's side of this used to be hardcoded.
        float seamR = length(vWorld.xz) + seamRadialNoise(vWorld.xz, uSeamTune.y);
        float seamBlend = max(uSeamTune.x, 4.0);
        float edgeFade = 1.0 - smoothstep(rim - seamBlend, rim - 2.0, seamR);
        alpha *= edgeFade;
        alpha *= 1.0 - smoothstep(uStandingWaterFadeStart, uStandingWaterFadeEnd, standingWater);

        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createSurfRibbonMaterial(
  seafloorTexture,
  standingWaterMaskTexture,
  standingWaterRendering,
  qualityConfig,
) {
  const suppression = standingWaterRendering.globalWaterSuppression;
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    extensions: { derivatives: true },
    defines: waterShaderDefines(qualityConfig),
    depthTest: true,
    uniforms: {
      // The ribbons ride the same Gerstner bank as the main plane, so they
      // must be handed the identical sea-state set every frame or the two
      // layers separate vertically.
      ...waveBankUniforms(),
      uTime: { value: 0 },
      uSeafloor: { value: seafloorTexture },
      uStandingWaterMask: { value: standingWaterMaskTexture },
      uStandingWaterFadeStart: { value: suppression.fadeStart },
      uStandingWaterFadeEnd: { value: suppression.fadeEnd },
      uWaterLevel: { value: WATER_LEVEL },
      uSize: { value: WATER_SIZE },
      uFoam: { value: WATER_DAY.foam.clone() },
      uScatter: { value: WATER_DAY.scatter.clone() },
      uDaylight: { value: 1 },
      uMoonGlitter: { value: 0 },
      uRain: { value: 0 },
      uUnderwaterAmount: { value: 0 },
      // (swash gain, swash width, wash-sheet gain, wash-sheet reach)
      uRibbon: { value: new THREE.Vector4(1, 1, 1, 9.5) },
      // (contact gain, overall alpha, unused, unused)
      uRibbon2: { value: new THREE.Vector4(1, 1, 0, 0) },
    },
    vertexShader: /* glsl */`
      ${WAVE_GLSL}
      uniform float uTime;
      uniform sampler2D uSeafloor;
      uniform float uWaterLevel;
      uniform float uSize;
      varying vec3 vWorld;
      varying float vExposure;
      varying vec2 vFlatXZ;

      vec4 seafloorSample(vec2 wxz) {
        return texture2D(uSeafloor, wxz / uSize + 0.5);
      }

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        // Same static-domain rule as the main plane, and it must match it
        // exactly or the two foam layers stop tracing the same front.
        vec2 flatXZ = world.xz;
        vFlatXZ = flatXZ;
        vec4 floorSample = seafloorSample(flatXZ);
        float floorH = floorSample.r * ${HSPAN.toFixed(1)} + (${HMIN.toFixed(1)});
        float depth = uWaterLevel - floorH;
        vec3 waveNormal;
        vec3 disp = gerstner(flatXZ, uTime, swellAtten(max(depth, 0.0)), waveNormal);
        float shoreDist = floorSample.g * ${SHORE_DIST_RANGE.toFixed(1)};
        vExposure = shoreExposure(uSeafloor, uSize, flatXZ, shoreDist);
        float breakerY = breakerLift(flatXZ, uTime, shoreDist, depth, vExposure);
        vec2 push = breakerPush(uSeafloor, uSize, flatXZ, uTime, shoreDist, depth, vExposure);
        world.xyz += disp;
        world.y += swashLift(flatXZ, uTime, depth);
        world.xz += push;
        world.y += breakerY;
        world.y += 0.035;
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      ${WAVE_GLSL}
      uniform float uTime;
      uniform vec3 uFoam;
      uniform vec3 uScatter;
      uniform float uDaylight;
      uniform float uMoonGlitter;
      uniform float uRain;
      uniform float uUnderwaterAmount;
      uniform sampler2D uSeafloor;
      uniform sampler2D uStandingWaterMask;
      uniform float uWaterLevel;
      uniform float uSize;
      uniform float uStandingWaterFadeStart;
      uniform float uStandingWaterFadeEnd;
      uniform vec4 uRibbon;
      uniform vec4 uRibbon2;
      varying vec3 vWorld;
      varying float vExposure;
      varying vec2 vFlatXZ;

      float srHash(vec2 p) { return fract(sin(dot(p, vec2(127.4, 311.7))) * 43758.5453); }
      float srNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(srHash(i), srHash(i + vec2(1.0, 0.0)), u.x),
                   mix(srHash(i + vec2(0.0, 1.0)), srHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float srWorley(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        float d = 1.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = vec2(srHash(cell + g), srHash(cell + g + 17.31));
            d = min(d, length(g + o - f));
          }
        }
        return d;
      }
      float srLace(vec2 wxz, float t) {
        vec2 p = wxz * 0.65 + vec2(t * 0.11, -t * 0.073);
        float a = 1.0 - srWorley(p);
        float b = 1.0 - srWorley(p * 2.1 + 6.8);
        float cells = smoothstep(0.46, 0.86, a * 0.66 + b * 0.34);
        float torn = smoothstep(0.24, 0.82, srNoise(wxz * 0.32 + vec2(t * 0.03, -t * 0.021)));
        #ifdef ENHANCED_WATER
          float bubbleWeb = 1.0 - smoothstep(0.05, 0.16, abs(b - 0.43));
          bubbleWeb *= smoothstep(0.26, 0.76, srNoise(p * 1.13 + vec2(t * 0.024, -t * 0.016)));
          cells = max(cells, bubbleWeb * 0.48);
          torn *= 0.72 + 0.28 * smoothstep(0.3, 0.76, srNoise(p * 0.71 - vec2(t * 0.017)));
          #ifdef CINEMATIC_WATER
            float c = 1.0 - srWorley(p * 5.2 + vec2(-8.4, 12.7));
            float microCells = smoothstep(0.44, 0.84, a * 0.42 + b * 0.34 + c * 0.24);
            cells = mix(cells, microCells, 0.58);
            float fineWeb = 1.0 - smoothstep(0.045, 0.15, abs(c - 0.43));
            fineWeb *= smoothstep(0.24, 0.76, srNoise(p * 1.13 + vec2(t * 0.024, -t * 0.016)));
            cells = max(cells, fineWeb * 0.68);
          #endif
        #endif
        return cells * (0.55 + 0.45 * torn);
      }
      float srLine(float sd, float centre, float width) {
        // Keep narrow foam ribbons stable at grazing angles. The shoreline
        // field is now sampled per fragment, and this derivative-sized edge
        // removes the last stair-step aliasing without widening the line in
        // world space when the camera moves closer.
        float edge = max(fwidth(sd), 0.012);
        return 1.0 - smoothstep(width - edge, width + edge, abs(sd - centre));
      }

      void main() {
        // The ribbon used to interpolate these fields from the ~1 m water
        // mesh vertices. Bright contours made that triangulation visible as
        // blocky shoreline segments even though the bake itself was smooth.
        vec2 shoreUv = vFlatXZ / uSize + 0.5;
        vec4 floorSample = texture2D(uSeafloor, shoreUv);
        float depth = max(0.0, uWaterLevel - (floorSample.r * ${HSPAN.toFixed(1)} + (${HMIN.toFixed(1)})));
        float shoreDist = floorSample.g * ${SHORE_DIST_RANGE.toFixed(1)};
        float shoreSoftness = floorSample.b;
        float playableFade = floorSample.a;
        float realCoast = smoothstep(0.02, 0.24, playableFade);

        // Early out. This layer draws the SAME 150x150m geometry as the water
        // plane, but everything it can produce is bounded near the shore: the
        // swash lines die at shoreDist 15.5 (shoreWindow), the breaker envelope
        // at 20 (breakerField's beach and cliff bands both close by then), the
        // wash remnant at 9.5, and every term is multiplied by realCoast and by
        // a depth gate that is shut by 8m (cliffShallow; beaches by 3.9).
        //
        // The two discards below are correct but late — they threw the result
        // away only after running two lace fields, the breaker field and
        // several noise octaves across the whole bay. On a fill-bound renderer
        // that was most of a second full pass spent on pixels that cannot draw
        // anything. Both texture reads that matter have already happened above,
        // so no mip derivative depends on the fragments killed here.
        if (shoreDist > 21.0 || depth > 8.5 || realCoast < 0.001) discard;

        float standingWater = texture2D(uStandingWaterMask, shoreUv).r;
        float beachShallow = smoothstep(0.035, 0.19, depth) * (1.0 - smoothstep(2.25, 3.9, depth));
        float cliffShallow = smoothstep(0.08, 0.42, depth) * (1.0 - smoothstep(5.4, 8.0, depth));
        float localCliffSwell = cliffSwellAt(vFlatXZ);
        float shallow = mix(beachShallow, cliffShallow, localCliffSwell);
        float shoreWindow = smoothstep(15.5, 0.45, shoreDist);
        float beach = mix(0.78, 1.18, smoothstep(0.08, 0.78, shoreSoftness));
        float lace = srLace(vWorld.xz, uTime);

        float cycle = sin(uTime * 0.5984) * 0.5 + 0.5;
        float wobble = sin(vWorld.x * 0.17 + uTime * 0.30) * 0.34
          + (srNoise(vWorld.xz * 0.075) - 0.5) * 0.78;
        float front = 0.65 + cycle * 2.65 + wobble;
        // Swash lip with a solid core, plus one weak fully-laced outer set
        // line: the only foam between the swash and the breaker fronts.
        float inner = srLine(shoreDist, front, 0.6 * uRibbon.y) * 0.72 * (0.6 + 0.4 * lace);
        // The outer set line marches like the breakers, so it obeys the same
        // swell-exposure gate (the immediate swash lip stays omnidirectional —
        // water laps every shore, but sets arrive from the swell).
        float outerSet = srLine(shoreDist, front + 5.1, 1.35 * uRibbon.y) * 0.3 * lace
          * mix(0.22, 1.0, smoothstep(-0.15, 0.6, vExposure));
        float bands = (inner + outerSet) * uRibbon.x;
        #ifdef ENHANCED_WATER
          // A faint broken echo behind each swash line gives the foam a
          // receding, layered edge instead of one mathematically clean band.
          float receding = srLine(shoreDist, front - 1.15, 0.92 * uRibbon.y)
            * lace * (0.09 + 0.12 * (1.0 - cycle));
          bands += receding;
        #endif

        float f;
        float s;
        float breakerEnv = breakerField(vFlatXZ, uTime, shoreDist, depth, vExposure, f, s);
        // Lip/trail widths match the main plane's breakerFoam exactly, so the
        // two layers reinforce one line instead of splitting into a pair.
        float lipWidth = mix(0.075, 0.19, localCliffSwell);
        float trailWidth = mix(0.34, 0.62, localCliffSwell);
        float foamPhase = mod(f + 0.5, 1.0) - 0.5;
        float foamDistance = localCliffSwell > 0.001 ? abs(foamPhase) : f;
        float preFoamScale = foamPhase < 0.0 ? 0.72 : 1.0;
        float breakerLip = 1.0 - smoothstep(0.015, lipWidth * preFoamScale, foamDistance);
        float breakerTrail = step(0.0, foamPhase)
          * (1.0 - smoothstep(lipWidth * 0.72, trailWidth, foamDistance))
          * (1.0 - breakerLip);
        // This layer draws the same fronts directly over the plane's, so a
        // near-constant lip here (it was 85%) doubled the flat band rather
        // than reinforcing a line. Matching the plane's lace weighting keeps
        // the two layers building one torn front.
        float breaker = breakerEnv * s
          * (breakerLip * (0.40 + 0.60 * lace) + breakerTrail * lace * lace * 0.7);
        #ifdef ENHANCED_WATER
          float breakerCollapse = smoothstep(0.045, 0.1, f) * (1.0 - smoothstep(0.24, 0.4, f));
          float breakerWake = smoothstep(0.12, 0.25, f) * (1.0 - smoothstep(0.5, 0.74, f));
          float wakeStreaks = smoothstep(0.48, 0.86, srNoise(vec2(
            dot(vWorld.xz, SWELL_DIR) * 0.22 - uTime * 0.18,
            dot(vWorld.xz, vec2(-SWELL_DIR.y, SWELL_DIR.x)) * 0.66
          )));
          // These branches max() over everything above, so their fully
          // constant lip terms (0.94 and 0.88) were overriding the tearing
          // outright — whatever the base profile did, the enhanced tiers put
          // a solid band straight back on top of it.
          #ifdef CINEMATIC_WATER
            breaker = max(
              breaker * 1.14,
              breakerEnv * s * (
                breakerLip * (0.42 + lace * 0.58)
                + breakerCollapse * (0.32 + lace * 0.68)
                + breakerWake * lace * (0.2 + wakeStreaks * 0.32)
              )
            );
          #else
            breaker = max(
              breaker * 1.07,
              breakerEnv * s * (
                breakerLip * (0.40 + lace * 0.52)
                + breakerCollapse * (0.25 + lace * 0.54)
                + breakerWake * lace * (0.12 + wakeStreaks * 0.2)
              )
            );
          #endif
        #endif

        float contact = smoothstep(0.2, 0.018, abs(depth)) * smoothstep(2.65, 0.0, shoreDist)
          * (0.5 + lace * 0.5) * uRibbon2.x;

        // shoreWindow gates only the swash-anchored lines; the breaker fronts
        // carry their own envelope out past it.
        // Beach swash is correct on a shelving shore but looks like a decal
        // when wrapped around a vertical cliff. Heavy-surf maps retain only
        // a faint contact wash; their visible foam rides the displaced crest
        // and the turbulent wake behind it.
        float contactWash = (bands + contact) * shoreWindow * mix(1.0, 0.1, localCliffSwell);
        float foam = (contactWash + breaker * mix(1.1, 1.48, localCliffSwell))
          * realCoast * shallow * beach;
        #ifdef ENHANCED_WATER
          float foamIslands = lace;
          #ifdef CINEMATIC_WATER
            foamIslands = srLace(vWorld.xz * 1.31 + vec2(3.6, -5.2), uTime * 0.79);
          #endif
          float washRemnant = smoothstep(max(uRibbon.w, 1.4), 1.2, shoreDist)
            * smoothstep(0.04, 0.24, depth)
            * (1.0 - smoothstep(0.9, 1.75, depth))
            * foamIslands * (0.06 + 0.14 * (1.0 - cycle)) * uRibbon.z;
          float rivulets = smoothstep(0.46, 0.92, 0.5 + 0.5 * sin(
            shoreDist * 2.25 - uTime * 0.78
            + srNoise(vWorld.xz * 0.28 + vec2(-uTime * 0.04, uTime * 0.025)) * 3.2
          ));
          #ifdef CINEMATIC_WATER
            washRemnant *= 1.25 + rivulets * 0.65;
            foam = max(foam * 1.1, washRemnant * realCoast * beach);
          #else
            washRemnant *= 0.82 + rivulets * 0.38;
            foam = max(foam * 1.05, washRemnant * realCoast * beach);
          #endif
        #endif
        foam *= 1.0 - smoothstep(uStandingWaterFadeStart, uStandingWaterFadeEnd, standingWater);
        foam *= 1.0 + uRain * 0.24;
        foam *= 1.0 - clamp(uUnderwaterAmount, 0.0, 1.0) * 0.72;
        foam = clamp(foam, 0.0, 1.0);
        if (foam < 0.01) discard;

        float foamCore = smoothstep(0.7, 0.98, foam);
        float foamLight = clamp(mix(0.28, 1.0, uDaylight) + uMoonGlitter * 0.22, 0.0, 1.0);
        float foamVisibility = mix(foamLight, min(1.0, foamLight + 0.16), foamCore);
        vec3 color = mix(uScatter, uFoam, 0.84 + lace * 0.16);
        color = mix(color * vec3(0.78, 0.92, 0.96), color, uDaylight);
        float alpha = foam * (0.34 + 0.52 * smoothstep(0.12, 0.82, foam)) * foamVisibility;
        #ifdef ENHANCED_WATER
          #ifdef CINEMATIC_WATER
            alpha = min(0.94, alpha * 1.12);
          #else
            alpha = min(0.91, alpha * 1.06);
          #endif
        #endif
        // Match the detailed water plane's radial feather. This layer used to
        // reveal its full square mesh on all-water maps because faint breaker
        // foam survived everywhere in the shallow depth field.
        float rim = uSize * 0.5;
        float edgeFade = 1.0 - smoothstep(rim - 14.0, rim - 2.0, length(vWorld.xz));
        alpha *= edgeFade * uRibbon2.y;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// Large camera-following disc beneath the detailed water: the apparently
// infinite open ocean, faded into the sky at the horizon.
function createDeepOceanMaterial(rippleNormalTexture, qualityConfig) {
  return new THREE.ShaderMaterial({
    fog: false,
    transparent: true,
    depthWrite: false,
    defines: waterShaderDefines(qualityConfig),
    uniforms: {
      time: { value: 0 },
      // Matches the detailed plane's uDeep at the seam, then travels to a
      // genuinely deep saturated blue: the long tonal ramp reads as distance.
      shallow: { value: WATER_DAY.deep.clone() },
      deep: { value: WATER_DAY.openDeep.clone() },
      fogColor: { value: new THREE.Color('#cfe6f4') },
      // Sky reflection. Mirrored from the plane's uSky/uSkyHorizon/uScatter and
      // its two reflection knobs, because the disc's sky term has to be built
      // the same way the plane's is or the crossfade between them shows a step.
      sky: { value: new THREE.Color('#bfe6ff') },
      skyHorizon: { value: new THREE.Color('#eaf6ff') },
      scatter: { value: WATER_DAY.scatter.clone() },
      skyReflCurve: { value: 6.6 },
      reflNeutralGrade: { value: 0.24 },
      discSky: { value: 1 },
      rain: { value: 0 },
      // Haze onset sits past most of the visible disc so the open sea keeps
      // its saturated blue (mockup horizon); the rimSeal still lands the last
      // metres exactly on the haze color for a clean sea/sky seam.
      fogNear: { value: 92 },
      fogFar: { value: 235 },
      // Two-stage horizon haze + whitecap knobs, mirrored from waterDev.
      hazeStage1: { value: 0.8 },
      hazeStage2: { value: 1 },
      hazeBandStart: { value: 95 },
      capDensity: { value: 2.1 },
      capWindGate: { value: 0.2 },
      glintWidth: { value: 1 },
      glintTune: { value: new THREE.Vector3(1, 1, 1) },
      seamTune: { value: new THREE.Vector2(22, 0) },
      camPos: { value: new THREE.Vector3() },
      sun: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
      sunColor: { value: new THREE.Color('#fff3da') },
      moon: { value: new THREE.Vector3(0, -1, 0) },
      moonColor: { value: new THREE.Color('#c9dcf2') },
      moonGlitter: { value: 0 },
      daylight: { value: 1 },
      sunPathStrength: { value: 0 },
      rippleNormal: { value: rippleNormalTexture },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying float vDiscRadius;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vDiscRadius = length(position.xy);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 shallow;
      uniform vec3 deep;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      uniform vec3 sky;
      uniform vec3 skyHorizon;
      uniform vec3 scatter;
      uniform float skyReflCurve;
      uniform float reflNeutralGrade;
      uniform float discSky;
      uniform float rain;
      uniform vec3 camPos;
      uniform vec3 sun;
      uniform vec3 sunColor;
      uniform vec3 moon;
      uniform vec3 moonColor;
      uniform float moonGlitter;
      uniform float daylight;
      uniform float sunPathStrength;
      uniform sampler2D rippleNormal;
      uniform float hazeStage1;
      uniform float hazeStage2;
      uniform float hazeBandStart;
      uniform float capDensity;
      uniform float capWindGate;
      uniform float glintWidth;
      uniform vec3 glintTune;
      uniform vec2 seamTune;
      varying vec3 vWorld;
      varying float vDiscRadius;

      // Must reproduce the plane's seamRadialNoise exactly, or the two
      // sides of the crossfade wobble differently and the seam reappears.
      float dHash(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.3))) * 19341.13); }
      float dNoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x),
                   mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float seamRadialNoise(vec2 wxz, float amp) {
        if (amp < 0.01) return 0.0;
        float n = dNoise(wxz * 0.021) * 0.68 + dNoise(wxz * 0.052) * 0.32;
        return (n - 0.5) * 2.0 * amp;
      }

      vec3 rippleNormalAt(vec2 wxz, float t) {
        vec2 uvA = wxz * 0.042 + vec2(t * 0.006, -t * 0.004);
        vec2 uvB = vec2(wxz.x * 0.72 - wxz.y * 0.69, wxz.x * 0.69 + wxz.y * 0.72) * 0.12
          + vec2(-t * 0.011, t * 0.008);
        vec3 a = texture2D(rippleNormal, uvA).rgb * 2.0 - 1.0;
        vec3 b = texture2D(rippleNormal, uvB).rgb * 2.0 - 1.0;
        // Open water was reading as a smooth sheet: the disc has no vertex
        // displacement at all, so this slope is the only thing giving it
        // surface. Raising the gain (same taps, no new fetches) puts enough
        // tilt variation into the normal for the specular to break up into
        // actual glitter instead of a broad even sheen.
        vec2 slope = (a.xy * 0.82 + b.xy * 0.44) * 2.35;
        #ifdef CINEMATIC_WATER
          vec2 uvC = vec2(wxz.x * 0.26 + wxz.y * 0.97, -wxz.x * 0.97 + wxz.y * 0.26) * 0.31
            + vec2(t * 0.026, t * 0.021);
          vec3 c = texture2D(rippleNormal, uvC).rgb * 2.0 - 1.0;
          slope += c.xy * 0.42;
        #endif
        return normalize(vec3(slope.x, 1.0, slope.y));
      }

      float rippleSparkle(vec2 wxz, float t) {
        vec2 uvA = wxz * 0.075 + vec2(t * 0.01, -t * 0.007);
        vec2 uvB = vec2(wxz.x * 0.44 + wxz.y * 0.9, -wxz.x * 0.9 + wxz.y * 0.44) * 0.18
          + vec2(-t * 0.017, t * 0.012);
        vec3 a = texture2D(rippleNormal, uvA).rgb * 2.0 - 1.0;
        vec3 b = texture2D(rippleNormal, uvB).rgb * 2.0 - 1.0;
        float ridge = max(abs(a.x), abs(a.y)) * 0.58 + max(abs(b.x), abs(b.y)) * 0.42;
        return smoothstep(0.22, 0.55, ridge);
      }

      float microSparkle(vec2 wxz, float t) {
        vec2 uvA = vec2(wxz.x * 0.72 - wxz.y * 0.69, wxz.x * 0.69 + wxz.y * 0.72) * 0.48
          + vec2(t * 0.043, -t * 0.031);
        vec2 uvB = vec2(wxz.x * 0.23 + wxz.y * 0.97, -wxz.x * 0.97 + wxz.y * 0.23) * 0.78
          + vec2(-t * 0.058, t * 0.046);
        vec3 a = texture2D(rippleNormal, uvA).rgb * 2.0 - 1.0;
        vec3 b = texture2D(rippleNormal, uvB).rgb * 2.0 - 1.0;
        float ridge = max(abs(a.x), abs(a.y)) * 0.54 + max(abs(b.x), abs(b.y)) * 0.46;
        float fleck = smoothstep(0.44, 0.78, ridge);
        return fleck * fleck;
      }

      void main() {
        // The detailed plane is fixed around the zone origin, while this disc
        // follows the camera. Keep the shoreline handoff in zone space, but
        // measure horizon fading from the disc's own centre so every edge lands
        // on the haze color even after the camera moves away from world origin.
        // Same noisy radius the plane uses, so the two dissolve along one
        // shared boundary. The plane's rim is uSize * 0.5 = 75m.
        float fromDetailedCentre = length(vWorld.xz) + seamRadialNoise(vWorld.xz, seamTune.y);
        float seamBlend = max(seamTune.x, 4.0);
        // Keep the horizon disc out of the detailed-water area entirely: the
        // refraction grab must see the real seabed there, not helper blue.
        if (fromDetailedCentre < 75.0 - seamBlend - 6.0) discard;
        // The detailed plane fades itself out radially over ~61..73m
        // (edgeFade). The disc must fade IN across that same ring — at full
        // opacity it pops beneath the still-visible plane as a hard
        // camera-crossing navy arc. The continued seabed renders under the
        // feather, so the crossfade reads as the shelf dropping away.
        // Mirrors the plane's edgeFade (1 - smoothstep(rim - blend, rim - 2))
        // so the pair sums to full coverage across the whole handoff.
        float edgeFeather = smoothstep(75.0 - seamBlend, 73.0, fromDetailedCentre);
        float depthMix = smoothstep(60.0, 150.0, fromDetailedCentre);
        vec3 color = mix(shallow, deep, depthMix);
        float shimmer = sin(vWorld.x * 0.06 + time * 0.4) * cos(vWorld.z * 0.05 - time * 0.32);
        color += shimmer * 0.015;
        #ifdef ENHANCED_WATER
          float crossedSwell = sin(dot(vWorld.xz, vec2(-0.51, 0.86)) * 0.22 - time * 0.72);
          #ifdef CINEMATIC_WATER
            color += crossedSwell * 0.012;
          #else
            color += crossedSwell * 0.007;
          #endif
        #endif

        // Sparse whitecap streaks so the open sea reads as textured swell
        // instead of a flat navy strip. Procedural (not texture-ridge) so
        // they survive mip averaging at horizon distances; cells are mapped
        // anisotropically so each cap stretches along the crest line
        // (perpendicular to the swell), and wind gates the population.
        //
        // The field used to be a grid of round dots sliding rigidly across the
        // sea: every cap the same brightness, none ever born or dying, and at
        // horizon distances the cells went sub-pixel and crawled. Three
        // changes, all ALU — this shader is fill-bound, so new texture taps are
        // the one currency not worth spending here:
        //
        //  - each cap runs its own life cycle, phase-offset by its cell hash,
        //    so the population breathes instead of translating;
        //  - the head is dense and the tail is torn and dragged downwind, so a
        //    cap reads as a breaking lip with lace behind it;
        //  - once a cell is smaller than a pixel the resolved dots dissolve
        //    into the average coverage they integrate to, so the horizon
        //    carries a soft density instead of a shimmering dot screen.
        vec2 discSwell = vec2(0.86024, 0.50979);
        vec2 discPerp = vec2(-discSwell.y, discSwell.x);
        vec2 capP = vec2(dot(vWorld.xz, discSwell) * 0.3, dot(vWorld.xz, discPerp) * 0.08)
          + vec2(time * 0.045, -time * 0.018);
        // One screen pixel measured in cap cells. Past ~1 a cell is not a shape
        // any more, only a probability.
        float capLod = clamp(length(fwidth(capP)), 0.0, 2.0);
        vec2 capCell = floor(capP);
        float capHash = fract(sin(dot(capCell, vec2(127.1, 311.7))) * 43758.5453);
        // ~7.5s from ignition to nothing, then the cell rests until its turn
        // comes round again. The hash sets the phase, so neighbours are never
        // in step and the sea never pulses as a whole.
        float capAge = fract(time * 0.132 + capHash * 7.31);
        float capLife = smoothstep(0.0, 0.12, capAge) * (1.0 - smoothstep(0.55, 1.0, capAge));
        vec2 capLocal = fract(capP) - 0.5;
        // Foam is dragged downwind as it ages. The dot is clipped at the cell
        // border, so drift plus radius plus edge has to stay under 0.5 or caps
        // grow square shoulders.
        capLocal.x += (capAge - 0.3) * 0.17;
        float capRadius = (0.155 + capHash * 0.115) * (0.55 + capLife * 0.65);
        float capDot = 1.0 - smoothstep(capRadius * 0.3, capRadius + 0.05, length(capLocal));
        // Eat the trailing half with a noise field so the tail is lace rather
        // than the back of an ellipse.
        float capTear = 0.5 + 0.5 * dNoise(vWorld.xz * 0.85 + vec2(time * 0.31, -time * 0.19));
        capDot *= mix(1.0, capTear, smoothstep(-0.04, 0.3, capLocal.x));
        float capClump = 0.5 + 0.5 * sin(vWorld.x * 0.041 + time * 0.07)
          * sin(vWorld.z * 0.053 - time * 0.05);
        float capField = daylight * capWindGate * capDensity;
        // 0.58 rather than the old 0.68: the life cycle costs about a third of
        // the standing population, and this puts it back, so capDensity still
        // means on the panel what it meant before.
        float caps = capDot * step(0.58, capHash) * capLife
          * smoothstep(0.45, 0.85, capClump) * capField;
        #ifdef ENHANCED_WATER
          vec2 fineCapP = capP * vec2(2.4, 2.8) + vec2(-time * 0.08, time * 0.029);
          vec2 fineCell = floor(fineCapP);
          float fineHash = fract(sin(dot(fineCell, vec2(269.5, 183.3))) * 43758.5453);
          float fineAge = fract(time * 0.21 + fineHash * 3.77);
          float fineLife = smoothstep(0.0, 0.14, fineAge) * (1.0 - smoothstep(0.4, 0.95, fineAge));
          float fineDot = 1.0 - smoothstep(0.035, 0.2, length(fract(fineCapP) - 0.5));
          #ifdef CINEMATIC_WATER
            caps += fineDot * step(0.7, fineHash) * fineLife * smoothstep(0.52, 0.9, capClump)
              * capField * 0.34;
          #else
            caps += fineDot * step(0.78, fineHash) * fineLife * smoothstep(0.56, 0.9, capClump)
              * capField * 0.18;
          #endif
        #endif
        // Analytic average of the dot field above (dot area x population x duty
        // cycle, eyeballed against the resolved field at the crossover). It
        // keeps the large-scale clump, so the horizon still has patches of
        // rough and smooth sea after the individual caps stop resolving.
        float capWash = 0.06 * smoothstep(0.45, 0.85, capClump) * capField;
        caps = mix(caps, capWash, smoothstep(0.4, 1.2, capLod));
        // Caps are lit foam, not paint: let them take a little of the sun.
        vec3 capColor = mix(vec3(0.9, 0.96, 0.99), sunColor, 0.16 * daylight);
        color = mix(color, capColor, min(caps, 1.0) * 0.4);

        // Sun glitter shares the detailed water's tiled normal source so the
        // horizon does not fall back to blocky procedural cells.
        vec3 normal = rippleNormalAt(vWorld.xz, time);
        vec3 viewDir = normalize(camPos - vWorld);
        vec2 sunPathDir = normalize(sun.xz + vec2(0.0001, 0.0001));

        // --- sky reflection ----------------------------------------------------
        // The disc used to carry no view-dependent body term at all: its colour
        // was a radial shallow->deep ramp, so the only way the far sea could
        // brighten toward the horizon was to be melted into fog. Real sea
        // brightens because grazing angles turn it into a mirror — and that is
        // exactly what the detailed plane does inside 75m, so without this the
        // seam handed a reflective surface off to a matte one.
        //
        // Deliberately the same construction as the plane's, so the crossfade
        // stays continuous: sky gradient across reflection tilt, pulled toward
        // a water sheen, de-violeted, with a sunward lift in the horizon band.
        //
        // Same zero-work skip the glitter path below uses, for the same
        // reason: this disc is the largest surface on screen, so anything it
        // can be told not to do is worth a branch.
        if (discSky > 0.002) {
        // Fresnel reads a heavily flattened normal, not the glitter normal
        // above. rippleNormalAt runs at 2.35x gain because the specular needs
        // facets to break up; reflectance is a broad term, so handing it that
        // gain paints the ripple tile's own cell structure straight into the
        // body colour — the open sea comes out looking like cobbles. Keep only
        // the large tilt, and take even that away as the pixel footprint grows
        // past one ripple. Footprints out here run ~0.1m at the seam to ~1m
        // near the horizon, because the sea is seen at a few degrees of
        // incidence.
        float slopeLod = 1.0 - smoothstep(0.1, 0.9, length(fwidth(vWorld.xz)));
        float bodySlope = 0.16 * (0.2 + 0.8 * slopeLod);
        vec3 bodyNormal = normalize(vec3(normal.x * bodySlope, normal.y, normal.z * bodySlope));
        vec3 refl = reflect(-viewDir, bodyNormal);
        vec3 skyRefl = mix(skyHorizon, sky, clamp(refl.y * skyReflCurve, 0.0, 1.0));
        skyRefl = mix(skyRefl, mix(scatter, skyHorizon, 0.36), 0.12);
        skyRefl = mix(skyRefl, skyRefl * vec3(0.96, 1.035, 0.90), 0.22);
        vec2 reflAz = normalize(refl.xz + vec2(1e-4, 0.0));
        float sheenSunward = smoothstep(-0.25, 1.0, dot(reflAz, sunPathDir));
        float sheenHorizon = 1.0 - clamp(refl.y * 2.4, 0.0, 1.0);
        skyRefl += sunColor * sheenSunward * sheenHorizon * daylight
          * (0.035 + sunPathStrength * 0.045) * (1.0 - rain * 0.8);
        float skyReflLuma = dot(skyRefl, vec3(0.299, 0.587, 0.114));
        skyRefl = mix(skyRefl, vec3(skyReflLuma), sunPathStrength * 0.10);
        // Broad drifting luminance patches. The disc has no vertex displacement
        // at all, so this is the only thing keeping large areas of it from
        // reading as one flat swatch.
        skyRefl *= 0.95 + 0.10 * dNoise(vWorld.xz * 0.05 + vec2(time * 0.013, -time * 0.009));
        skyRefl = mix(skyRefl, skyRefl * vec3(0.97, 1.025, 0.90), reflNeutralGrade);
        // Schlick, with the plane's stylised F0 floor (0.055 rather than
        // water's true 0.02, so a steep look-down keeps some sky in the sea)
        // and the plane's deep-water reflStrength — the disc is always deep.
        float fres = pow(1.0 - max(dot(bodyNormal, viewDir), 0.0), 5.0);
        float mirrorMix = clamp((0.055 + 0.945 * fres) * 0.85 * discSky, 0.0, 0.8);
        color = mix(color, skyRefl, mirrorMix);
        }

        vec3 hv = normalize(normalize(sun) + viewDir);
        float glintVisibility = 0.22 + 0.78 * sunPathStrength;
        float spec = pow(max(dot(normal, hv), 0.0), mix(260.0, 150.0, sunPathStrength)) * daylight * glintVisibility;
        #ifdef ENHANCED_WATER
          #ifdef CINEMATIC_WATER
            spec *= 1.2;
          #else
            spec *= 1.08;
          #endif
        #endif
        vec3 sunGlintColor = mix(vec3(1.05, 1.02, 0.94), vec3(1.12, 1.04, 0.82), sunPathStrength * 0.5);
        vec2 toWater = normalize(vWorld.xz - camPos.xz + vec2(0.0001, 0.0001));
        float alongSun = smoothstep(0.03, 0.42, dot(toWater, sunPathDir));
        float crossSun = abs(toWater.x * sunPathDir.y - toWater.y * sunPathDir.x);
        float path = smoothstep(0.28 * glintWidth, 0.025, crossSun) * alongSun;
        float pathCore = smoothstep(0.19 * glintWidth, 0.018, crossSun) * alongSun;
        // pathSparkle is shared with the moon path below, so it stays out of
        // the sun gate; the fleck fields are sun-only.
        float pathSparkle = 0.48 + 0.52 * rippleSparkle(vWorld.xz, time);
        // Sparkle survives partway into the haze, then hands off to fog.
        float fromCam = length(vWorld.xz - camPos.xz);
        float fog = smoothstep(fogNear, fogFar, fromCam);
        color += sunGlintColor * min(spec * 1.36 * glintTune.x, 1.05 * max(glintTune.x, 1.0))
          * (0.66 + sunPathStrength * 0.48) * (1.0 - fog * 0.85);
        color += sunGlintColor * path * pathSparkle * sunPathStrength * 0.09 * glintTune.x * (1.0 - fog * 0.92);
        // Same zero-work skip as the detailed plane, and it matters more here:
        // the horizon disc is the largest surface on screen, and sunPathStrength
        // is exactly 0 whenever the sun is high.
        if (sunPathStrength > 0.002) {
          float pathFlecks = microSparkle(vWorld.xz, time);
          color += sunGlintColor * pathCore * pathFlecks * sunPathStrength * 0.52 * (1.0 - fog * 0.9);
          #ifdef CINEMATIC_WATER
            float finePathFlecks = microSparkle(vWorld.xz * 1.51 + vec2(-7.3, 4.8), time * 1.43);
            color += sunGlintColor * path * finePathFlecks * sunPathStrength * 0.34 * (1.0 - fog * 0.92);
          #endif
        }
        // Moon glitter continues the silver path out to the horizon disc.
        if (moonGlitter > 0.005) {
          vec3 moonHv = normalize(normalize(moon) + viewDir);
          float moonSpec = pow(max(dot(normal, moonHv), 0.0), mix(260.0, 120.0, moonGlitter));
          vec2 moonPathDir = normalize(moon.xz + vec2(0.0001, 0.0001));
          float moonAlong = smoothstep(0.03, 0.42, dot(toWater, moonPathDir));
          float moonCross = abs(toWater.x * moonPathDir.y - toWater.y * moonPathDir.x);
          float moonPath = smoothstep(0.26, 0.025, moonCross) * moonAlong;
          color += moonColor * moonSpec * (0.5 + moonGlitter * 0.6) * moonGlitter * (1.0 - fog * 0.85);
          color += moonColor * moonPath * pathSparkle * moonGlitter * 0.14 * (1.0 - fog * 0.92);
        }

        // Keep a memory of blue at the horizon line rather than fully greying
        // out (mockup: saturated deep water meets the sky) — but the last few
        // metres before the disc rim (radius 160) must land exactly on the
        // haze color, or the surviving 10% of deep navy draws a hard sea/sky
        // band against the sky dome behind it.
        // Two-stage aerial perspective: a gentle wash through the mid band
        // keeps the sea saturated, then a steep bright melt confined to the
        // final approach to the sea/sky line — the old single ramp either
        // greyed everything (near onset) or left a hard navy edge (far).
        float hazeMid = fog * hazeStage1;
        float horizonMelt = smoothstep(hazeBandStart, 152.0, vDiscRadius) * hazeStage2;
        float rimSeal = smoothstep(142.0, 157.0, vDiscRadius);
        color = mix(color, fogColor, max(clamp(hazeMid + horizonMelt, 0.0, 1.0), rimSeal));
        gl_FragColor = vec4(color, edgeFeather);
      }
    `,
  });
}

// --- planar reflection (mirror camera + render target) ---------------------
// Adapted from THREE.Reflector: reflect the camera across the water plane,
// render the scene into a texture, and hand back a world->uv matrix. Kept as
// module scratch so the per-frame render allocates nothing.
// Oblique near-plane bias, in the same units THREE.Reflector uses (its default
// is 0.003). The bias offsets the clip plane by roughly bias * distance from
// the mirror camera, so it is not a small constant nudge: at 0.06 a swimmer
// ten metres out kept about a metre of *below-water* geometry in the mirror.
// That leak is what painted Darwin's dangling legs into the water below him,
// boots deepest — a real reflection of an upright swimmer is head-down.
const REFLECT_CLIP_BIAS = 0.006;
const _reflNormal = new THREE.Vector3(0, 1, 0);
const _reflWorldPos = new THREE.Vector3(0, WATER_LEVEL, 0);
const _camWorldPos = new THREE.Vector3();
const _rotMat = new THREE.Matrix4();
const _lookAt = new THREE.Vector3();
const _target = new THREE.Vector3();
const _viewVec = new THREE.Vector3();
const _reflPlane = new THREE.Plane();
const _clipPlane = new THREE.Vector4();
const _qv = new THREE.Vector4();
const _virtualCam = new THREE.PerspectiveCamera();
// The mirror camera renders only the reflection whitelist (plus lights) —
// membership is maintained on this layer by waterReflectionRuntime.js.
_virtualCam.layers.set(REFLECTION_LAYER);

// Crisp expanding wading rings on the ocean surface — the standing-water
// ripple look, ported. Flat rings at WATER_LEVEL get swallowed by the ±15cm
// Gerstner swell, so the vertex stage displaces each ring by the same shared
// wave bank the surface plane uses (slightly over-attenuated: overshooting
// the surface by a centimetre is invisible, sinking under it is not).
function OceanContactRipples() {
  const meshRef = useRef(null);
  const cursor = useRef(0);
  const expiries = useRef(new Float32Array(OCEAN_RING_COUNT).fill(-1));

  const { geometry, material, births, intensities } = useMemo(() => {
    const geo = new THREE.RingGeometry(0.42, 0.58, 40);
    geo.rotateX(-Math.PI / 2);
    const birthArray = new Float32Array(OCEAN_RING_COUNT).fill(-1000);
    const intensityArray = new Float32Array(OCEAN_RING_COUNT).fill(0);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birthArray, 1));
    geo.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(intensityArray, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...waveBankUniforms(),
        uTime: { value: 0 },
        uWaveTime: { value: 0 },
        uColor: { value: new THREE.Color('#eefaf8') },
      },
      vertexShader: /* glsl */`
        ${WAVE_GLSL}
        attribute float aBirth;
        attribute float aIntensity;
        uniform float uTime;
        uniform float uWaveTime;
        varying float vFade;
        varying float vIntensity;
        void main() {
          float age = max(0.0, uTime - aBirth);
          vFade = clamp(1.0 - age / 1.55, 0.0, 1.0);
          vIntensity = aIntensity;
          float grow = 1.0 + age * (2.1 + aIntensity * 1.25);
          vec3 transformed = position * vec3(grow, 1.0, grow);
          vec4 wp = instanceMatrix * vec4(transformed, 1.0);
          vec3 waveNormal;
          // 0.86 (was 0.8): cinematic's chop waves raise the plane's crests
          // by up to ~4cm, so the rings need a little more overshoot headroom
          // to stay above the surface (this material compiles without the
          // chop, so it cannot follow those crests exactly).
          wp.y += gerstner(wp.xz, uWaveTime, 0.86, waveNormal).y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying float vFade;
        varying float vIntensity;
        void main() {
          float a = pow(vFade, 1.7) * (0.11 + vIntensity * 0.26);
          if (a < 0.006) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    return { geometry: geo, material: mat, births: birthArray, intensities: intensityArray };
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(() => {
    const now = performance.now() / 1000;
    material.uniforms.uTime.value = now;
    material.uniforms.uWaveTime.value = oceanRingWaveTime.value;
    const ru = material.uniforms;
    ru.uCliffSwell.value = oceanRingBank.cliffSwell;
    ru.uCliffCalmEllipse.value.copy(oceanRingBank.cliffCalmEllipse);
    ru.uSwell.value = oceanRingBank.swell;
    ru.uSwellLen.value = oceanRingBank.swellLen;
    ru.uChopSea.value = oceanRingBank.chopSea;
    ru.uBreakers.value = oceanRingBank.breakers;
    ru.uCrestNorm.value = oceanRingBank.crestNorm;
    ru.uChopWind.value = oceanRingBank.chopWind;
    applyWaveBankTuning(ru);
    const mesh = meshRef.current;
    if (!mesh) {
      oceanRingQueue.length = 0;
      return;
    }
    let changed = false;
    while (oceanRingQueue.length) {
      const spawn = oceanRingQueue.shift();
      const index = cursor.current;
      cursor.current = (cursor.current + 1) % OCEAN_RING_COUNT;
      dummy.position.set(spawn.x, WATER_LEVEL + 0.035, spawn.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.4 + spawn.intensity * 0.3 + (spawn.radius || 0) * 0.18);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      births[index] = now;
      intensities[index] = spawn.intensity;
      expiries.current[index] = now + 1.55;
      changed = true;
    }
    let active = false;
    for (let index = 0; index < OCEAN_RING_COUNT; index += 1) {
      const expiry = expiries.current[index];
      if (expiry < 0) continue;
      if (expiry > now) {
        active = true;
        continue;
      }
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      expiries.current[index] = -1;
      births[index] = -1000;
      changed = true;
    }
    if (changed) {
      geometry.attributes.aBirth.needsUpdate = true;
      geometry.attributes.aIntensity.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    }
    mesh.visible = active;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, OCEAN_RING_COUNT]}
      frustumCulled={false}
      visible={false}
      renderOrder={3}
      userData={{ noReflect: true, renderSource: 'ocean-contact-rings', renderLabel: 'Ocean contact rings', renderKind: 'water-contact-fx' }}
    />
  );
}

function renderReflection(gl, scene, camera, rt, outMatrix) {
  _camWorldPos.setFromMatrixPosition(camera.matrixWorld);
  _viewVec.subVectors(_reflWorldPos, _camWorldPos);
  if (_viewVec.dot(_reflNormal) > 0) return false; // camera below the surface

  _viewVec.reflect(_reflNormal).negate().add(_reflWorldPos);

  _rotMat.extractRotation(camera.matrixWorld);
  _lookAt.set(0, 0, -1).applyMatrix4(_rotMat).add(_camWorldPos);
  _target.subVectors(_reflWorldPos, _lookAt).reflect(_reflNormal).negate().add(_reflWorldPos);

  _virtualCam.position.copy(_viewVec);
  _virtualCam.up.set(0, 1, 0).applyMatrix4(_rotMat).reflect(_reflNormal);
  _virtualCam.lookAt(_target);
  _virtualCam.near = camera.near;
  _virtualCam.far = camera.far;
  _virtualCam.fov = camera.fov;
  _virtualCam.aspect = camera.aspect;
  _virtualCam.updateMatrixWorld();
  _virtualCam.projectionMatrix.copy(camera.projectionMatrix);

  // World -> reflection-texture UV matrix (uses the clean projection).
  outMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  outMatrix.multiply(_virtualCam.projectionMatrix);
  outMatrix.multiply(_virtualCam.matrixWorldInverse);

  // Oblique near-plane clip so geometry below the water isn't reflected.
  _reflPlane.setFromNormalAndCoplanarPoint(_reflNormal, _reflWorldPos);
  _reflPlane.applyMatrix4(_virtualCam.matrixWorldInverse);
  _clipPlane.set(_reflPlane.normal.x, _reflPlane.normal.y, _reflPlane.normal.z, _reflPlane.constant);
  const p = _virtualCam.projectionMatrix;
  _qv.x = (Math.sign(_clipPlane.x) + p.elements[8]) / p.elements[0];
  _qv.y = (Math.sign(_clipPlane.y) + p.elements[9]) / p.elements[5];
  _qv.z = -1.0;
  _qv.w = (1.0 + p.elements[10]) / p.elements[14];
  _clipPlane.multiplyScalar(2.0 / _clipPlane.dot(_qv));
  p.elements[2] = _clipPlane.x;
  p.elements[6] = _clipPlane.y;
  p.elements[10] = _clipPlane.z + 1.0 - REFLECT_CLIP_BIAS;
  p.elements[14] = _clipPlane.w;

  // Reflection is an explicit whitelist: the rippled water needs the ship and
  // nearby characters/large silhouettes, not every shrub, fish, and
  // inspectable prop. Membership lives on REFLECTION_LAYER (see
  // waterReflectionRuntime.js) and the virtual camera renders only that
  // layer, so nothing in the scene graph is mutated for the mirror pass —
  // the old per-refresh hide/restore sweeps over every renderable are gone.
  // The water meshes themselves carry no reflect flag, so the layer excludes
  // them without the explicit hidden-mesh list the sweeps needed.
  syncReflectionLayers(scene);
  const prevRT = gl.getRenderTarget();
  const prevXrEnabled = gl.xr.enabled;
  const prevShadowAuto = gl.shadowMap.autoUpdate;
  const prevShadowNeedsUpdate = gl.shadowMap.needsUpdate;
  // Clear to alpha 0 with no background fill: the mirror texture's alpha
  // channel becomes object coverage, which the water shader uses to keep
  // reflected silhouettes (Darwin, ship, shore) visible above the physical
  // fresnel floor. Empty texels fall back to the analytic sky sheen.
  const prevBackground = scene.background;
  gl.getClearColor(_prevClearColor);
  const prevClearAlpha = gl.getClearAlpha();
  try {
    // Match THREE.Reflector's offscreen-pass safeguards. In particular, a
    // prior transparent draw can leave depth writes masked; clearing in that
    // state preserves stale mirror depth and produces torn silhouettes on a
    // later reflection refresh.
    gl.xr.enabled = false;
    gl.shadowMap.autoUpdate = false;
    // Reflections are a secondary render. If SkyController has queued a main
    // shadow-map refresh for Darwin, do not let this offscreen pass consume it
    // while reflection-only visibility masks are active.
    gl.shadowMap.needsUpdate = false;
    scene.background = null;
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(rt);
    gl.state.buffers.depth.setMask(true);
    gl.clear();
    gl.render(scene, _virtualCam);
    return true;
  } finally {
    gl.setRenderTarget(prevRT);
    scene.background = prevBackground;
    gl.setClearColor(_prevClearColor, prevClearAlpha);
    gl.xr.enabled = prevXrEnabled;
    gl.shadowMap.autoUpdate = prevShadowAuto;
    gl.shadowMap.needsUpdate = prevShadowNeedsUpdate || gl.shadowMap.needsUpdate;
  }
}

const _prevClearColor = new THREE.Color();
const _drawSize = new THREE.Vector2();

// Draw framebuffer for the MSAA resolve, and a latch so a driver that rejects
// the blit degrades to painted water instead of erroring once per frame.
let _blitFbo = null;
let _blitUnavailable = false;

// Copy whatever is currently in the colour buffer into `texture`.
//
// copyFramebufferToTexture cannot read a multisampled framebuffer, and the
// composer renders the scene into one whenever MSAA is on. blitFramebuffer is
// the resolve path: same rectangle, NEAREST, colour only.
function copyFramebufferIntoTexture(renderer, texture, width, height) {
  const target = renderer.getRenderTarget();
  if (!(target?.samples > 0)) {
    renderer.copyFramebufferToTexture(texture);
    return true;
  }
  if (_blitUnavailable) return false;
  const gl = renderer.getContext();
  if (typeof gl.blitFramebuffer !== 'function') {
    _blitUnavailable = true;
    return false;
  }
  try {
    renderer.initTexture(texture);
    const glTexture = renderer.properties.get(texture)?.__webglTexture;
    const state = renderer.state;
    if (!glTexture || !state?.bindFramebuffer) {
      _blitUnavailable = true;
      return false;
    }
    if (!_blitFbo) _blitFbo = gl.createFramebuffer();
    // Whatever three has bound is the read side; put it back on both targets
    // afterwards so three's binding cache stays true.
    const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, _blitFbo);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTexture, 0);
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, bound);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, bound);
    state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, bound);
    return true;
  } catch {
    _blitUnavailable = true;
    return false;
  }
}

export function Water(props) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const regionType = getRegionMap(currentZoneId).type;
  if (
    !props.allowInterior
    && !regionTypeRendersDetailedWater(regionType)
  ) return null;
  return (
    <WaterResourceSwitch
      {...props}
      currentZoneId={currentZoneId}
    />
  );
}

function WaterResourceSwitch({
  currentZoneId,
  quality = 'polished',
  openOceanOnly = false,
  ...props
}) {
  const request = useMemo(() => {
    const qualityConfig = waterQualityConfig(quality);
    const options = { openOceanOnly, contactRes: qualityConfig.contactRes };
    return {
      key: `${currentZoneId}:${qualityConfig.bakeRes}:${qualityConfig.contactRes}:${openOceanOnly ? 1 : 0}`,
      quality,
      bakeRes: qualityConfig.bakeRes,
      options,
    };
  }, [currentZoneId, openOceanOnly, quality]);
  const requestReady = waterTextureResourceIsReady(
    currentZoneId,
    request.bakeRes,
    request.options,
  );
  const [active, setActive] = useState(() => (
    requestReady
      ? {
        ...request,
        textures: readWaterTextureResource(currentZoneId, request.bakeRes, request.options),
      }
      : null
  ));

  useEffect(() => {
    let cancelled = false;
    prepareWaterTextureResource(currentZoneId, request.bakeRes, request.options)
      .then(textures => {
        if (!cancelled) setActive({ ...request, textures });
      })
      .catch(error => {
        if (!cancelled) console.error('[water] Failed to prepare quality textures.', error);
      });
    return () => {
      cancelled = true;
    };
  }, [currentZoneId, request]);

  // First mount may suspend at the Canvas boundary. Once a water tier has
  // committed, however, keep rendering it while the next tier loads so a
  // settings click cannot hide and remount the entire ThreeScene.
  let displayed = active;
  if (requestReady && active?.key !== request.key) {
    displayed = {
      ...request,
      textures: readWaterTextureResource(currentZoneId, request.bakeRes, request.options),
    };
  }
  if (!displayed) {
    displayed = {
      ...request,
      textures: readWaterTextureResource(currentZoneId, request.bakeRes, request.options),
    };
  }

  return (
    <WaterSurface
      {...props}
      currentZoneId={currentZoneId}
      openOceanOnly={openOceanOnly}
      quality={displayed.quality}
      textures={displayed.textures}
    />
  );
}

function WaterSurface({
  currentZoneId,
  quality = 'polished',
  reflections = true,
  reflectionUpdatesPaused = false,
  openOceanOnly = false,
  textures,
}) {
  const { scene, gl } = useThree();
  // This is a static table lookup, so memoizing it only risks retaining the
  // previous target settings across React Fast Refresh while tuning water.
  const qualityConfig = waterQualityConfig(quality);
  const cliffSwell = cliffSwellForZone(currentZoneId);
  const cliffCalmEllipse = cliffCalmEllipseForZone(currentZoneId);
  const seaState = seaStateForZone(currentZoneId);

  // Zone change replaces most of the scene graph: re-sync reflection layer
  // membership immediately rather than waiting out the refresh counter.
  useEffect(() => {
    markReflectionSceneDirty();
  }, [currentZoneId]);

  // Layout, not effect: the uniform drive reads waterDev on the next frame, and
  // a zone with an authored look must not render one frame of the baseline.
  useLayoutEffect(() => {
    applyWaterZoneLook(currentZoneId);
  }, [currentZoneId]);

  // In zones whose terrain sits entirely above sea level across the detailed
  // plane's footprint, the ocean plane is fully buried under the terrain mesh
  // and its mirror texture can never reach a visible pixel — skip the whole
  // reflection pass there. Sampled against the continuous height function
  // once per zone; the 2m margin keeps Gerstner swell and swash-covered
  // shorelines safely on the reflective side.
  const oceanPlaneCanBeVisible = useMemo(() => {
    const half = WATER_SIZE / 2 + 20;
    const step = 10;
    for (let x = -half; x <= half; x += step) {
      for (let z = -half; z <= half; z += step) {
        if (terrainHeight(x, z, currentZoneId) < WATER_LEVEL + 2) return true;
      }
    }
    return false;
  }, [currentZoneId]);

  const { seafloor, standingWaterMask, waterContact, rippleNormal } = textures;
  const standingWaterRendering = useMemo(
    () => getStandingWaterRenderingConfig(currentZoneId),
    [currentZoneId],
  );
  const initialTexturesRef = useRef(textures);
  const initialStandingWaterRenderingRef = useRef(standingWaterRendering);
  const waterMaterial = useMemo(
    () => {
      const initialTextures = initialTexturesRef.current;
      return createStylizedWaterMaterial(
        initialTextures.seafloor,
        initialTextures.standingWaterMask,
        initialTextures.waterContact,
        initialTextures.rippleNormal,
        initialStandingWaterRenderingRef.current,
        qualityConfig,
      );
    },
    [qualityConfig],
  );
  const surfMaterial = useMemo(
    () => {
      const initialTextures = initialTexturesRef.current;
      return createSurfRibbonMaterial(
        initialTextures.seafloor,
        initialTextures.standingWaterMask,
        initialStandingWaterRenderingRef.current,
        qualityConfig,
      );
    },
    [qualityConfig],
  );
  const deepMaterial = useMemo(
    () => createDeepOceanMaterial(initialTexturesRef.current.rippleNormal, qualityConfig),
    [qualityConfig],
  );

  // Region changes only alter texture and scalar uniforms. Keep these three
  // very large shader programs alive across travel: disposing and recreating
  // them released Three's final program reference, forcing ANGLE/Metal to
  // relink all three while the island chart was animating. Layout timing makes
  // the destination textures current before the first revealed frame.
  useLayoutEffect(() => {
    const suppression = standingWaterRendering.globalWaterSuppression;
    // The plane, the surf ribbons and the contact rings all compile the same
    // wave bank. If any one of them misses a sea-state value it renders a
    // different ocean and the layers separate vertically.
    const zoneBank = { seaState, cliffSwell, cliffCalmEllipse };
    const waterUniforms = waterMaterial.uniforms;
    applyWaveBankZone(waterUniforms, zoneBank);
    waterUniforms.uSeafloor.value = seafloor;
    waterUniforms.uWaterOnlyShelf.value = currentZoneId === 'BLACK_BEACH_SURF' ? 1 : 0;
    waterUniforms.uStandingWaterMask.value = standingWaterMask;
    waterUniforms.uWaterContact.value = waterContact;
    waterUniforms.uRippleNormal.value = rippleNormal;
    waterUniforms.uStandingWaterFadeStart.value = suppression.fadeStart;
    waterUniforms.uStandingWaterFadeEnd.value = suppression.fadeEnd;

    const surfUniforms = surfMaterial.uniforms;
    applyWaveBankZone(surfUniforms, zoneBank);
    surfUniforms.uSeafloor.value = seafloor;
    surfUniforms.uStandingWaterMask.value = standingWaterMask;
    surfUniforms.uStandingWaterFadeStart.value = suppression.fadeStart;
    surfUniforms.uStandingWaterFadeEnd.value = suppression.fadeEnd;
    deepMaterial.uniforms.rippleNormal.value = rippleNormal;

    oceanRingBank.cliffSwell = cliffSwell;
    oceanRingBank.cliffCalmEllipse.set(...(cliffCalmEllipse || [0, 0, 0, 0]));
    oceanRingBank.swell = seaState.swell;
    oceanRingBank.swellLen = seaState.lengthScale;
    oceanRingBank.chopSea = seaState.chop;
    oceanRingBank.breakers = seaState.breakers;
    oceanRingBank.crestNorm = waterUniforms.uCrestNorm.value;
  }, [
    deepMaterial,
    cliffSwell,
    cliffCalmEllipse,
    seaState,
    currentZoneId,
    rippleNormal,
    seafloor,
    standingWaterMask,
    standingWaterRendering,
    surfMaterial,
    waterContact,
    waterMaterial,
  ]);

  const cliffSegments = qualityConfig.detailTier <= 0
    ? 192
    : qualityConfig.detailTier === 1
      ? 320
      : 384;
  const waterSegments = cliffSwell > 0
    ? Math.max(cliffSegments, qualityConfig.segments)
    : qualityConfig.segments;
  const waterGeometry = useMemo(
    () => new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, waterSegments, waterSegments),
    [waterSegments],
  );

  const reflectionRT = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(qualityConfig.reflectionRes, qualityConfig.reflectionRes, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      samples: qualityConfig.reflectionSamples || 0,
      // The mirror pass needs a multisampled depth attachment for correct
      // occlusion while rendering, but its sampled output is color-only.
      // Resolving depth into the texture-backed framebuffer is both wasted
      // work and invalid on WebGL drivers that choose incompatible depth/
      // stencil formats for the MSAA and resolve targets.
      resolveDepthBuffer: false,
    });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }, [qualityConfig.reflectionRes, qualityConfig.reflectionSamples]);

  const deepRef = useRef(null);
  const waterRef = useRef(null);
  const surfRef = useRef(null);
  const grabRef = useRef(null); // FramebufferTexture for the refraction grab
  const oceanRippleCursor = useRef(0);
  const waterInfluenceScratch = useRef([]);
  const reflectionFrame = useRef(0);
  const reflectionState = useRef({
    initialized: false,
    framesSinceUpdate: REFLECTION_STATIC_INTERVAL,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    timeOfDay: null,
  });
  const _sun = useMemo(() => new THREE.Vector3(), []);
  const _moon = useMemo(() => new THREE.Vector3(), []);
  const _white = useMemo(() => new THREE.Color('#ffffff'), []);
  const _sunColorDay = useMemo(() => new THREE.Color('#fff3da'), []);
  const _sunColorGolden = useMemo(() => new THREE.Color('#ff9d4d'), []);

  // Refraction grab: runs in the middle of the render, right before the water
  // mesh draws (transparent pass, after all opaque geometry). One framebuffer
  // copy — no scene re-render.
  //
  // This used to bail on every offscreen target, which was meant to skip the
  // planar mirror pass. But the EffectComposer renders the whole scene into a
  // target too, so with post-processing on — the default — the grab never ran
  // once and every refraction term in the shader was dead: no seabed, no
  // swimmer, no fish. The water was pure painted body colour.
  const handleBeforeRender = useCallback(renderer => {
    const target = renderer.getRenderTarget();
    // The mirror pass renders the world reflected; grabbing that as the
    // refraction source would put the sky under the water.
    if (target === reflectionRT) return;
    renderer.getDrawingBufferSize(_drawSize);
    const width = target ? target.width : Math.floor(_drawSize.x);
    const height = target ? target.height : Math.floor(_drawSize.y);
    if (width < 1 || height < 1) {
      waterMaterial.uniforms.uHasRefraction.value = 0;
      return;
    }
    // Match the source buffer's format: the cinematic tier composites in
    // RGBA16F, and WebGL2 refuses a resolve blit between float and fixed point.
    const sourceType = target?.texture?.type ?? THREE.UnsignedByteType;
    let grab = grabRef.current;
    if (!grab || grab.image.width !== width || grab.image.height !== height || grab.type !== sourceType) {
      grab?.dispose();
      grab = new THREE.FramebufferTexture(width, height);
      grab.type = sourceType;
      grab.colorSpace = target?.texture?.colorSpace ?? THREE.NoColorSpace;
      grab.minFilter = THREE.LinearFilter;
      grab.magFilter = THREE.LinearFilter;
      grab.generateMipmaps = false;
      grabRef.current = grab;
    }
    if (!copyFramebufferIntoTexture(renderer, grab, width, height)) {
      waterMaterial.uniforms.uHasRefraction.value = 0;
      return;
    }
    const wu = waterMaterial.uniforms;
    wu.uRefraction.value = grab;
    wu.uHasRefraction.value = 1;
    wu.uRefractionEncoded.value = !target || target.texture?.colorSpace === THREE.SRGBColorSpace ? 1 : 0;
    wu.uResolution.value.set(width, height);
  }, [reflectionRT, waterMaterial]);

  const bindWaterMesh = useCallback(mesh => {
    waterRef.current = mesh;
    if (mesh) mesh.onBeforeRender = handleBeforeRender;
  }, [handleBeforeRender]);

  useEffect(() => {
    if (!ENABLE_OCEAN_PLAYER_RIPPLES) return undefined;
    const rippleEvent = (event, eventScale = 1) => {
      if (!event?.position) return null;
      const x = Number(event.position.x);
      const z = Number(event.position.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      const zoneId = useThreeGameStore.getState().currentZoneId;
      const standingMask = standingWaterMaskAt(x, z, zoneId);
      if (standingMask > getStandingWaterRenderingConfig(zoneId).oceanRippleMaskCutoff) return null;
      const depth = WATER_LEVEL - terrainHeight(x, z, zoneId);
      if (depth < 0.012) return null;
      const depthScale = THREE.MathUtils.smoothstep(depth, 0.018, 0.1);
      if (depthScale <= 0.01) return null;
      return {
        x,
        z,
        radius: THREE.MathUtils.clamp(Number(event.radius) || 0, 0, 1.8),
        intensity: THREE.MathUtils.clamp((event.intensity ?? 0.38) * eventScale * depthScale, 0.1, 1.75),
      };
    };
    const queueOceanRing = ripple => {
      if (ripple && oceanRingQueue.length < OCEAN_RING_COUNT) oceanRingQueue.push(ripple);
    };
    const addOceanRipple = (event, eventScale = 1) => {
      const ripples = waterMaterial.uniforms.uOceanRipples?.value;
      if (!ripples) return;
      const ripple = rippleEvent(event, eventScale);
      if (!ripple) return;
      const index = oceanRippleCursor.current;
      oceanRippleCursor.current = (oceanRippleCursor.current + 1) % OCEAN_PLAYER_RIPPLE_COUNT;
      ripples[index].set(ripple.x, ripple.z, performance.now() / 1000, ripple.intensity);
      queueOceanRing({ ...ripple, intensity: Math.min(ripple.intensity, 1) });
    };
    const addSplashRipple = event => {
      addOceanRipple(event, 1.9);
      if (!event?.position) return;
      const x = Number(event.position.x);
      const z = Number(event.position.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const yaw = Number.isFinite(event.yaw)
        ? event.yaw
        : Math.atan2(event.direction?.x || 0, event.direction?.z || 1);
      const side = yaw + Math.PI * 0.5;
      const spread = 0.24 + THREE.MathUtils.clamp(event.intensity ?? 0.45, 0, 1) * 0.24;
      addOceanRipple({
        ...event,
        position: { ...event.position, x: x + Math.cos(side) * spread, z: z + Math.sin(side) * spread },
        intensity: (event.intensity ?? 0.45) * 0.64,
      }, 1.55);
      addOceanRipple({
        ...event,
        position: { ...event.position, x: x - Math.cos(side) * spread, z: z - Math.sin(side) * spread },
        intensity: (event.intensity ?? 0.45) * 0.52,
      }, 1.55);
    };
    const offStep = onPropEvent('water-step', event => addOceanRipple(event, 1.05));
    const offRipple = onPropEvent('water-ripple', event => addOceanRipple(event, 1.2));
    const offSplash = onPropEvent('water-splash', addSplashRipple);
    // Polished gets occasional geometry-only prop rings. Cinematic owns its
    // continuous contact/wake shader; performance avoids object ripples.
    const offObjectRipple = qualityConfig.detailTier === 1
      ? onPropEvent('water-object-ripple', event => queueOceanRing(rippleEvent(event, 0.82)))
      : () => {};
    return () => {
      offStep();
      offRipple();
      offSplash();
      offObjectRipple();
    };
  }, [qualityConfig.detailTier, waterMaterial]);

  useFrame(({ clock, camera }) => {
    const waterMesh = waterRef.current;
    if (!waterMesh && !openOceanOnly) return; // no water in this zone -> skip everything

    const store = useThreeGameStore.getState();
    const t = clock.elapsedTime;
    const time = ((store.timeOfDay % 24) + 24) % 24;
    const sun = sunDirection(time, store.day || 1);
    _sun.set(sun[0], sun[1], sun[2]);

    const wu = waterMaterial.uniforms;
    wu.uTime.value = t;
    oceanRingWaveTime.value = t;
    wu.uOceanRippleTime.value = performance.now() / 1000;
    wu.uOceanPlayerRippleEnabled.value = ENABLE_OCEAN_PLAYER_RIPPLES ? 1 : 0;
    if (qualityConfig.detailTier >= 2) {
      const visibleInfluences = waterInfluenceScratch.current;
      visibleInfluences.length = 0;
      for (const influence of getZonePropWaterInfluences(store.currentZoneId)) {
        const dx = influence.x - camera.position.x;
        const dz = influence.z - camera.position.z;
        visibleInfluences.push({ influence, distanceSq: dx * dx + dz * dz });
      }
      visibleInfluences.sort((a, b) => a.distanceSq - b.distanceSq);
      const bodyCount = Math.min(visibleInfluences.length, WATER_BODY_INFLUENCE_COUNT);
      wu.uWaterBodyCount.value = bodyCount;
      for (let index = 0; index < WATER_BODY_INFLUENCE_COUNT; index += 1) {
        const bodyUniform = wu.uWaterBodies.value[index];
        const motionUniform = wu.uWaterBodyMotion.value[index];
        if (index >= bodyCount) {
          bodyUniform.set(9999, 9999, 0.1, 0);
          motionUniform.set(0, 0, 0, 0);
          continue;
        }
        const influence = visibleInfluences[index].influence;
        const speed = Math.hypot(influence.vx, influence.vz);
        bodyUniform.set(influence.x, influence.z, influence.radius, influence.strength);
        motionUniform.set(influence.vx, influence.vz, speed, influence.phase || 0);
      }
    } else {
      wu.uWaterBodyCount.value = 0;
    }
    wu.uSun.value.copy(_sun);
    wu.uRain.value = weatherEnv.rainIntensity;
    wu.uUnderwaterAmount.value = store.underwaterCamera?.amount || 0;
    // Wading ripples while standing in water, handing off to a continuous
    // treading/swimming disturbance that persists at any ocean depth as long
    // as the player's body is actually at the surface (not on a deck or
    // airborne above deep water, and faded once the camera submerges).
    const pp = getRuntimePlayerPose().position;
    const wadeDepth = WATER_LEVEL - terrainHeight(pp.x, pp.z, store.currentZoneId);
    const wade = THREE.MathUtils.smoothstep(wadeDepth, 0.04, 0.22)
      * (1 - THREE.MathUtils.smoothstep(wadeDepth, 1.45, 2.3));
    const standingMask = standingWaterMaskAt(pp.x, pp.z, store.currentZoneId);
    const { oceanRippleMaskCutoff } = standingWaterRendering;
    const surfaceProximity = 1 - THREE.MathUtils.smoothstep(Math.abs(pp.y - WATER_LEVEL), 1.3, 2.4);
    const oceanWade = ENABLE_OCEAN_PLAYER_RIPPLES && standingMask < oceanRippleMaskCutoff ? wade : 0;
    const oceanSwimSurface = ENABLE_OCEAN_PLAYER_RIPPLES && standingMask < oceanRippleMaskCutoff
      ? THREE.MathUtils.smoothstep(wadeDepth, 0.55, 1.15) * surfaceProximity * 0.9
      : 0;
    // Swimming/wading Darwin animates in the mirror even when the camera is
    // still, so a static camera no longer implies a static reflection: refresh
    // at the moving-camera cadence whenever his body is at the surface.
    const reflectorNearWater = surfaceProximity > 0.01 && wadeDepth > -0.7;
    wu.uPlayer.value.set(pp.x, pp.y, pp.z);
    wu.uPlayerRipple.value = Math.max(oceanWade, oceanSwimSurface) * (1 - wu.uUnderwaterAmount.value);
    const sky = skyState(time, store.day || 1);
    const daylight = sky.daylight;
    // Floored below the horizon crossing so glitter doesn't vanish exactly
    // when the sun is lowest (that's when a real sea shows the most sparkle).
    const lowSun = THREE.MathUtils.smoothstep(sky.elevation, -0.03, 0.18)
      * (1 - THREE.MathUtils.smoothstep(sky.elevation, 0.34, 0.72));
    const sunPathStrength = Math.sqrt(daylight) * lowSun * (1 - weatherEnv.rainIntensity * 0.72) * (1 - weatherEnv.overcast * 0.55);
    const weatherMood = THREE.MathUtils.clamp(weatherEnv.overcast * 0.58 + weatherEnv.rainIntensity * 0.42, 0, 1);
    const stormBlend = weatherMood * THREE.MathUtils.lerp(0.25, 0.85, daylight);
    const clearNoonBlue = (sky.noonBlue || 0)
      * (1 - weatherEnv.overcast * 0.92)
      * (1 - weatherEnv.mistAmount * 0.75)
      * (1 - weatherEnv.rainIntensity * 0.72);
    const clearMorningWindow = 1 - THREE.MathUtils.smoothstep(time, 8.7, 11.2);
    const clearMorningWaterCalm = THREE.MathUtils.clamp(
      clearMorningWindow
        * lowSun
        * daylight
        * (1 - clearNoonBlue * 0.85)
        * (1 - weatherEnv.overcast * 0.45)
        * (1 - weatherEnv.rainIntensity * 0.58),
      0,
      1
    );
    wu.uDaylight.value = daylight;
    wu.uSunPathStrength.value = sunPathStrength;
    wu.uSunColor.value.copy(_sunColorDay).lerp(_sunColorGolden, sky.golden);
    // Moon glitter: night sea sparkle scaled by phase, altitude, and sky
    // clarity — widest silver streak when the moon rides low (the same
    // low-light mapping the sun path uses).
    _moon.set(sky.moon[0], sky.moon[1], sky.moon[2]);
    wu.uMoon.value.copy(_moon);
    const moonUp = THREE.MathUtils.smoothstep(_moon.y, -0.02, 0.12);
    const moonLow = 1 - THREE.MathUtils.smoothstep(_moon.y, 0.5, 0.85);
    const moonGlitter = sky.night * moonUp * (0.35 + 0.65 * moonLow)
      * (sky.moon_phase?.fraction ?? 0)
      * (1 - weatherEnv.overcast * 0.9)
      * (1 - weatherEnv.rainIntensity * 0.85)
      * (1 - weatherEnv.mistAmount * 0.6);
    wu.uMoonGlitter.value = moonGlitter;
    // Per-metre extinction, from the panel. The shader now walks the true
    // refracted path instead of a fraction of the vertical drop, so green and
    // blue sit near their real seawater coefficients — otherwise a two-metre
    // shelf goes muddy. Weather stirs all three up by the same third.
    wu.uAbsorb.value.set(
      waterDev.absorbRed * (1 + weatherMood * 0.33),
      waterDev.absorbGreen * (1 + weatherMood * 0.7),
      waterDev.absorbBlue * (1 + weatherMood * 1.2),
    );
    wu.uSand.value.copy(WATER_NIGHT.sand).lerp(WATER_DAY.sand, daylight).lerp(WATER_STORM.sand, stormBlend);
    wu.uScatter.value.copy(WATER_NIGHT.scatter).lerp(WATER_DAY.scatter, daylight).lerp(WATER_STORM.scatter, stormBlend);
    wu.uDeep.value.copy(WATER_NIGHT.deep).lerp(WATER_DAY.deep, daylight).lerp(WATER_STORM.deep, stormBlend);
    wu.uFoam.value.copy(WATER_NIGHT.foam).lerp(WATER_DAY.foam, daylight).lerp(WATER_STORM.foam, stormBlend);
    wu.uScatter.value.lerp(WATER_CLEAR_MORNING.scatter, clearMorningWaterCalm * 0.56);
    wu.uDeep.value.lerp(WATER_CLEAR_MORNING.deep, clearMorningWaterCalm * 0.42);

    // Live dev knobs (waterDevRuntime) + the weather-wind whitecap gate.
    // windSpeed idles around 1; caps stay sparse in calm air and populate as
    // weather picks up. capWindMult lets the dev panel force either extreme.
    // Sea state scales the whitecap population, not the ignition threshold:
    // uCapCrest stays authored against the normalised crest height, so an
    // exposed coast gets more of its crests breaking rather than a different
    // definition of what counts as a crest.
    const capWindGate = THREE.MathUtils.clamp(
      (0.12 + Math.max(0, weatherEnv.windSpeed - 0.95) * 0.75)
        * waterDev.capWindMult
        * seaState.chop,
      0,
      1,
    );
    wu.uPlanarShare.value = waterDev.planarShare;
    wu.uObjectMirror.value = waterDev.objectMirror;
    wu.uReflDistort.value = waterDev.reflDistort;
    wu.uReflNeutralGrade.value = waterDev.reflNeutralGrade;
    wu.uSkyReflCurve.value = waterDev.skyReflCurve;
    wu.uRippleOctaves.value.set(waterDev.octaveCoarse, waterDev.octaveMid, waterDev.octaveFine);
    wu.uWindToneWeight.value = waterDev.windTone;
    applyWaveBankTuning(wu);
    wu.uCapDensity.value = waterDev.capDensity;
    wu.uCapCrest.value = waterDev.capCrest;
    wu.uCapWindGate.value = capWindGate;
    // Cinematic chop rides the same shared wind signal as the whitecap gate,
    // on a gentler curve: some texture survives a calm, and it saturates
    // before the whitecap population does.
    wu.uChopWind.value = THREE.MathUtils.clamp(
      0.22 + Math.max(0, weatherEnv.windSpeed - 0.8) * 0.6,
      0,
      1,
    );
    oceanRingBank.chopWind = wu.uChopWind.value;
    wu.uGlintElongation.value = waterDev.glintElongation;
    wu.uGlintWidth.value = waterDev.glintWidth;
    wu.uGlintTune.value.set(waterDev.glintStrength, waterDev.glintReach, waterDev.sunDiscGain);
    wu.uSeamTune.value.set(waterDev.seamBlend, waterDev.seamNoise);
    wu.uRimTravel.value.set(
      waterDev.deepTravelWidth,
      waterDev.deepTravelAmount,
      waterDev.deepTravelNoise,
    );
    wu.uRampMix.value.set(
      waterDev.rampPaleMix,
      waterDev.rampShelfMix,
      waterDev.rampShelfGreen,
      waterDev.rampMidMix,
    );
    // Stops must ascend or the smoothsteps invert and the ramp reads backwards;
    // the panel can put them in any order.
    const rampShelfDepth = Math.max(waterDev.rampDepthShelf, waterDev.rampDepthPale + 0.05);
    const rampMidDepth = Math.max(waterDev.rampDepthMid, rampShelfDepth + 0.05);
    wu.uRampDepths.value.set(
      waterDev.rampDepthPale,
      rampShelfDepth,
      rampMidDepth,
      Math.max(waterDev.rampDepthDeep, rampMidDepth + 0.05),
    );
    wu.uRampOpacity.value.set(
      waterDev.rampGlaze,
      waterDev.rampOpaque,
      waterDev.rampOpaqueDepth,
      waterDev.seamFadeWidth,
    );
    wu.uRampBias.value.set(
      waterDev.rampEdgeBias,
      waterDev.rampOffshoreBias,
      waterDev.rampSaturation,
      waterDev.rampBrightness,
    );
    wu.uClarity.value.set(
      waterDev.clarityGlazeAngle,
      waterDev.clarityPath,
      waterDev.captureShallow,
      waterDev.captureDeep,
    );
    wu.uClarity2.value.set(waterDev.captureDepth, waterDev.reflShallow, waterDev.reflDeep, 0);
    wu.uSnell.value.set(
      waterDev.uwCritical,
      waterDev.uwSoft,
      waterDev.uwWindowAlpha,
      waterDev.uwMirrorAlpha,
    );
    wu.uSnell2.value.set(waterDev.uwMirrorGrab, waterDev.uwMirrorOffset, waterDev.uwWobble, 0);
    wu.uBody.value.set(
      waterDev.bodyPhysical,
      waterDev.scatterAdd,
      waterDev.scatterSat,
      waterDev.scatterSun,
    );
    wu.uBody2.value.set(waterDev.darkLift, 0, 0, 0);
    wu.uRippleShape.value.set(
      waterDev.rippleScale,
      waterDev.rippleSpeed,
      waterDev.rippleWarp,
      waterDev.rippleShort,
    );
    wu.uFoamShape.value.set(
      waterDev.foamScale,
      waterDev.foamDrift,
      waterDev.foamContrast,
      waterDev.foamDetail,
    );
    wu.uFoamMix.value.set(
      waterDev.foamCore,
      waterDev.foamLipLace,
      waterDev.foamTrail,
      waterDev.foamHaze,
    );
    wu.uFoamWidth.value.set(
      waterDev.foamCoreWidth,
      waterDev.foamLipWidth,
      waterDev.foamTrailWidth,
      waterDev.foamBoil,
    );
    wu.uFoamShoreGain.value = waterDev.foamShore;
    const su = surfMaterial.uniforms;
    su.uTime.value = t;
    su.uRain.value = weatherEnv.rainIntensity;
    su.uUnderwaterAmount.value = store.underwaterCamera?.amount || 0;
    su.uDaylight.value = daylight;
    su.uMoonGlitter.value = moonGlitter;
    su.uFoam.value.copy(wu.uFoam.value);
    su.uScatter.value.copy(wu.uScatter.value);
    su.uChopWind.value = wu.uChopWind.value;
    applyWaveBankTuning(su);
    su.uRibbon.value.set(
      waterDev.ribbonSwash,
      waterDev.ribbonSwashWidth,
      waterDev.ribbonWash,
      waterDev.ribbonWashReach,
    );
    su.uRibbon2.value.set(waterDev.ribbonContact, waterDev.ribbonAlpha, 0, 0);
    if (scene.fog) {
      // The toward-white lift is sunlit haze; under a closed sky the sea
      // horizon must stay no brighter than the cloud deck feeding it.
      const litAir = 1 - weatherEnv.overcast * 0.55;
      const morningHazeRestraint = 1 - clearMorningWaterCalm * 0.3;
      const horizonLift = THREE.MathUtils.lerp(0.03, 0.18, daylight) * (1 - clearNoonBlue * 0.52) * litAir * morningHazeRestraint;
      const hazeLift = THREE.MathUtils.lerp(0.05, 0.42, daylight) * (1 - clearNoonBlue * 0.36) * litAir * (1 - clearMorningWaterCalm * 0.22);
      wu.uSky.value.copy(scene.fog.color);
      wu.uSkyHorizon.value.copy(scene.fog.color).lerp(_white, horizonLift);
      wu.uHaze.value.copy(scene.fog.color).lerp(_white, hazeLift);
      // Match the water's private haze range to the live FogExp2 density so
      // garua swallows the sea at the same distance it swallows the land.
      const visibility = 0.83 / Math.max(0.004, weatherEnv.fogDensity);
      wu.uHazeNear.value = Math.min(64, visibility * 0.5);
      wu.uHazeFar.value = Math.min(150, visibility * 1.7);
    }

    const disc = deepRef.current;
    if (disc) {
      disc.position.x = camera.position.x;
      disc.position.z = camera.position.z;
      const du = deepMaterial.uniforms;
      du.time.value = t;
      du.camPos.value.copy(camera.position);
      du.sun.value.copy(_sun);
      du.sunColor.value.copy(wu.uSunColor.value);
      du.moon.value.copy(_moon);
      du.moonGlitter.value = wu.uMoonGlitter.value;
      du.daylight.value = wu.uDaylight.value;
      du.sunPathStrength.value = sunPathStrength;
      du.shallow.value.copy(WATER_NIGHT.deep).lerp(WATER_DAY.deep, daylight).lerp(WATER_STORM.deep, stormBlend);
      du.deep.value.copy(WATER_NIGHT.openDeep).lerp(WATER_DAY.openDeep, daylight).lerp(WATER_STORM.openDeep, stormBlend);
      du.shallow.value.lerp(WATER_CLEAR_MORNING.deep, clearMorningWaterCalm * 0.34);
      du.deep.value.lerp(WATER_CLEAR_MORNING.openDeep, clearMorningWaterCalm * 0.46);
      if (scene.fog) du.fogColor.value.copy(wu.uHaze.value);
      // Sky reflection reads the plane's own sky/sheen colours and reflection
      // knobs, so the two surfaces cannot drift apart across the seam.
      du.sky.value.copy(wu.uSky.value);
      du.skyHorizon.value.copy(wu.uSkyHorizon.value);
      du.scatter.value.copy(wu.uScatter.value);
      du.skyReflCurve.value = waterDev.skyReflCurve;
      du.reflNeutralGrade.value = waterDev.reflNeutralGrade;
      du.discSky.value = waterDev.discSky;
      du.rain.value = wu.uRain.value;
      du.hazeStage1.value = waterDev.hazeStage1;
      du.hazeStage2.value = waterDev.hazeStage2;
      du.hazeBandStart.value = waterDev.hazeBandStart;
      du.capDensity.value = waterDev.capDensity;
      du.capWindGate.value = capWindGate;
      du.glintWidth.value = waterDev.glintWidth;
      du.glintTune.value.set(waterDev.glintStrength, waterDev.glintReach, waterDev.sunDiscGain);
      du.seamTune.value.set(waterDev.seamBlend, waterDev.seamNoise);
    }

    // Planar reflection pass (hide our own water so it isn't captured). The
    // mirror is a garnish on top of the refracted body now. Refresh it at the
    // current moving-camera cadence, but do not keep re-rendering it while the
    // camera and lighting are effectively unchanged.
    if (reflections && !reflectionUpdatesPaused && waterMesh && oceanPlaneCanBeVisible) {
      reflectionFrame.current += 1;
      const rs = reflectionState.current;
      rs.framesSinceUpdate += 1;
      const cameraMoved = !rs.initialized || camera.position.distanceToSquared(rs.position) > REFLECTION_CAMERA_MOVE_SQ;
      const cameraRotated = !rs.initialized || 1 - Math.abs(camera.quaternion.dot(rs.quaternion)) > REFLECTION_CAMERA_ROT_DELTA;
      const timeDelta = rs.timeOfDay == null ? Infinity : Math.abs(time - rs.timeOfDay);
      const lightingChanged = rs.timeOfDay == null
        || Math.min(timeDelta, 24 - timeDelta) > REFLECTION_TIME_DELTA;
      const cadenceReady = reflectionFrame.current >= (qualityConfig.reflectionMinInterval || REFLECTION_MIN_INTERVAL);
      const stale = rs.framesSinceUpdate >= (qualityConfig.reflectionStaticInterval || REFLECTION_STATIC_INTERVAL);
      if (!wu.uReflection.value || stale || (cadenceReady && (cameraMoved || cameraRotated || lightingChanged || reflectorNearWater))) {
        reflectionFrame.current = 0;
        rs.framesSinceUpdate = 0;
        rs.initialized = true;
        rs.position.copy(camera.position);
        rs.quaternion.copy(camera.quaternion);
        rs.timeOfDay = time;
        const ok = renderReflection(gl, scene, camera, reflectionRT, wu.uReflMatrix.value);
        wu.uReflection.value = ok ? reflectionRT.texture : null;
        wu.uHasReflection.value = ok ? 1 : 0;
      }
    } else {
      wu.uHasReflection.value = 0;
    }
  });

  // These were one effect keyed on all five resources at once, which meant a
  // change to any of them tore down the rest. waterGeometry is rebuilt per
  // zone (waterSegments follows cliffSwell: 384 on a cliff map, 160 on a
  // cove), so travelling between a cliff zone and anything else disposed all
  // three materials — while their useMemo, keyed only on qualityConfig, kept
  // handing back the same now-disposed instances.
  //
  // That defeated the deliberate "keep these three very large programs alive
  // across travel" behaviour documented above, forcing a full relink of the
  // biggest shaders in the game on those transitions. It also crashed:
  // dispose() drops the material from three's `properties` WeakMap, so an
  // in-flight compileAsync from the same transition then read
  // `properties.get(material).currentProgram` as undefined and threw inside
  // checkMaterialsReady. Each resource now owns its own lifetime.
  useEffect(() => () => waterGeometry.dispose(), [waterGeometry]);

  useEffect(() => () => {
    waterMaterial.dispose();
    surfMaterial.dispose();
    deepMaterial.dispose();
  }, [waterMaterial, surfMaterial, deepMaterial]);

  useEffect(() => () => {
    grabRef.current?.dispose();
    grabRef.current = null;
    reflectionRT.dispose();
  }, [reflectionRT]);

  return (
    <group userData={{
      renderSource: `water:${currentZoneId}`,
      renderLabel: `${currentZoneId} water`,
      renderKind: 'water',
      renderPath: null,
    }}>
      <mesh ref={deepRef} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL - 0.08, 0]} material={deepMaterial} renderOrder={-4} frustumCulled={false} userData={{
        renderSource: `water:${currentZoneId}:deep-disc`,
        renderLabel: `${currentZoneId} deep water disc`,
        renderKind: 'water',
        renderPath: null,
      }}>
        <circleGeometry args={[160, 128]} />
      </mesh>
      {!openOceanOnly && (
        <>
          <mesh ref={bindWaterMesh} geometry={waterGeometry} material={waterMaterial} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL, 0]} renderOrder={-2} frustumCulled={false} userData={{
            renderSource: `water:${currentZoneId}:surface`,
            renderLabel: `${currentZoneId} water surface`,
            renderKind: 'water',
            renderPath: null,
          }} />
          <mesh ref={surfRef} geometry={waterGeometry} material={surfMaterial} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL, 0]} renderOrder={-1} frustumCulled={false} userData={{
            noReflect: true,
            renderSource: `water:${currentZoneId}:surf-ribbons`,
            renderLabel: `${currentZoneId} surf ribbons`,
            renderKind: 'water',
            renderPath: null,
          }} />
          {ENABLE_OCEAN_PLAYER_RIPPLES && <OceanContactRipples />}
        </>
      )}
    </group>
  );
}
