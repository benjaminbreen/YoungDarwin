'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore, getRuntimePlayerPose } from '../../store';
import { getRegionMap } from '../../../game-core/regionMaps';
import { terrainHeight } from '../../world/terrain';
import {
  getStandingWaterRenderingConfig,
  standingWaterMaskAt,
  standingWaterSuppressionMaskAt,
} from '../../world/standingWaterRendering';
import { sunDirection, skyState } from '../../world/celestial';
import { WATER_LEVEL } from '../../world/water';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { waterDev } from '../../world/waterDevRuntime';
import { onPropEvent } from '../../physics/props/propEvents';

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
// surface) — see injectSeabedCaustics in Terrain.jsx.
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
// stale projection for several rendered frames, then visibly snap forward.
const REFLECTION_CAMERA_MOVE_SQ = 0.002 * 0.002;
const REFLECTION_CAMERA_ROT_DELTA = 0.00000001;
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
const dummy = new THREE.Object3D();
const OCEAN_PLAYER_RIPPLE_COUNT = 14;
// Height range packed into the depth texture's red byte: [HMIN, HMIN + HSPAN].
const HMIN = -6.0;
const HSPAN = 9.0;

const WATER_QUALITY = {
  // All tiers run the cinematic reflection cadence (refresh every frame while
  // the mirror is dynamic, every 4th when idle) — measured as near-free on the
  // fps budget and the smooth mirror reads far better. Tiers still differ on
  // resolution and mesh density.
  performance: {
    bakeRes: 256,
    segments: 64,
    reflectionRes: 384,
    reflectionSamples: 2,
    reflectionMinInterval: 1,
    reflectionStaticInterval: 4,
  },
  polished: {
    bakeRes: BAKE_RES,
    segments: WATER_SEGMENTS,
    reflectionRes: REFLECTION_RES,
    reflectionSamples: 2,
    reflectionMinInterval: 1,
    reflectionStaticInterval: 4,
  },
  cinematic: {
    bakeRes: BAKE_RES,
    segments: 160,
    reflectionRes: 640,
    reflectionSamples: 4,
    reflectionMinInterval: 1,
    reflectionStaticInterval: 4,
  },
};

function waterQualityConfig(quality) {
  return WATER_QUALITY[quality] || WATER_QUALITY.performance;
}

function regionWaterPlayableSize(zoneId) {
  const region = getRegionMap(zoneId);
  const terrain = region?.terrain || {};
  return {
    width: Math.min(WATER_SIZE, terrain.width || WATER_SIZE),
    depth: Math.min(WATER_SIZE, terrain.depth || WATER_SIZE),
  };
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

const RIPPLE_NORMAL_SIZE = 256;

function rippleNormalHeight(u, v) {
  const waves = [
    [1, 2, 0.42, 0.0],
    [2, -1, 0.32, 1.7],
    [3, 4, 0.18, 3.1],
    [-4, 3, 0.16, 4.4],
    [6, 1, 0.1, 2.2],
    [5, -6, 0.08, 5.3],
    [9, 4, 0.045, 0.9],
    [-7, 10, 0.036, 3.8],
  ];
  let h = 0;
  for (let i = 0; i < waves.length; i += 1) {
    const [kx, ky, amp, phase] = waves[i];
    h += Math.sin(Math.PI * 2 * (kx * u + ky * v) + phase) * amp;
  }
  return h;
}

function createRippleNormalTexture(size = RIPPLE_NORMAL_SIZE) {
  const data = new Uint8Array(size * size * 4);
  const sample = (x, y) => rippleNormalHeight(
    ((x % size) + size) % size / size,
    ((y % size) + size) % size / size,
  );
  const normalStrength = 3.35;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * normalStrength;
      const dz = (sample(x, y + 1) - sample(x, y - 1)) * normalStrength;
      const invLen = 1 / Math.hypot(dx, dz, 1);
      const nx = -dx * invLen;
      const nz = -dz * invLen;
      const ny = invLen;
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

// Bake the seafloor height under the water plane into a texture so the shader
// can read water depth per-pixel without a runtime depth prepass. The green
// channel carries the distance to the waterline (a chamfer distance
// transform), which drives the surf: wave fronts are lines of constant
// *shore distance*, so their world-space spacing is identical on a steep
// beach face and a nearly flat reef shelf. Depth-driven fronts (the previous
// approach) degenerate into huge sheets wherever the bed is flat.
function bakeSeafloorTexture(zoneId, bakeRes = BAKE_RES) {
  const playable = regionWaterPlayableSize(zoneId);
  const heights = new Float32Array(bakeRes * bakeRes);
  for (let j = 0; j < bakeRes; j += 1) {
    for (let i = 0; i < bakeRes; i += 1) {
      const x = (i / (bakeRes - 1) - 0.5) * WATER_SIZE;
      const z = (j / (bakeRes - 1) - 0.5) * WATER_SIZE;
      heights[j * bakeRes + i] = terrainHeight(x, z, zoneId);
    }
  }

  // Two-pass chamfer distance to the waterline, in grid cells.
  const FAR = 1e9;
  const dist = new Float32Array(bakeRes * bakeRes).fill(FAR);
  const wet = idx => heights[idx] < WATER_LEVEL;
  for (let j = 0; j < bakeRes; j += 1) {
    for (let i = 0; i < bakeRes; i += 1) {
      const idx = j * bakeRes + i;
      if (!wet(idx)) {
        dist[idx] = 0; // land: zero, so the gradient starts at the waterline
        continue;
      }
      const leftDry = i > 0 && !wet(idx - 1);
      const rightDry = i < bakeRes - 1 && !wet(idx + 1);
      const upDry = j > 0 && !wet(idx - bakeRes);
      const downDry = j < bakeRes - 1 && !wet(idx + bakeRes);
      if (leftDry || rightDry || upDry || downDry) dist[idx] = 0.5;
    }
  }
  const D1 = 1;
  const D2 = Math.SQRT2;
  for (let j = 0; j < bakeRes; j += 1) {
    for (let i = 0; i < bakeRes; i += 1) {
      const idx = j * bakeRes + i;
      if (i > 0) dist[idx] = Math.min(dist[idx], dist[idx - 1] + D1);
      if (j > 0) {
        dist[idx] = Math.min(dist[idx], dist[idx - bakeRes] + D1);
        if (i > 0) dist[idx] = Math.min(dist[idx], dist[idx - bakeRes - 1] + D2);
        if (i < bakeRes - 1) dist[idx] = Math.min(dist[idx], dist[idx - bakeRes + 1] + D2);
      }
    }
  }
  for (let j = bakeRes - 1; j >= 0; j -= 1) {
    for (let i = bakeRes - 1; i >= 0; i -= 1) {
      const idx = j * bakeRes + i;
      if (i < bakeRes - 1) dist[idx] = Math.min(dist[idx], dist[idx + 1] + D1);
      if (j < bakeRes - 1) {
        dist[idx] = Math.min(dist[idx], dist[idx + bakeRes] + D1);
        if (i < bakeRes - 1) dist[idx] = Math.min(dist[idx], dist[idx + bakeRes + 1] + D2);
        if (i > 0) dist[idx] = Math.min(dist[idx], dist[idx + bakeRes - 1] + D2);
      }
    }
  }

  const cellSize = WATER_SIZE / (bakeRes - 1);
  const data = new Uint8Array(bakeRes * bakeRes * 4);
  const heightAt = (i, j) => heights[
    THREE.MathUtils.clamp(j, 0, bakeRes - 1) * bakeRes
    + THREE.MathUtils.clamp(i, 0, bakeRes - 1)
  ];
  for (let idx = 0; idx < bakeRes * bakeRes; idx += 1) {
    const i = idx % bakeRes;
    const j = Math.floor(idx / bakeRes);
    const sx = (heightAt(i + 1, j) - heightAt(i - 1, j)) / (cellSize * 2);
    const sz = (heightAt(i, j + 1) - heightAt(i, j - 1)) / (cellSize * 2);
    const slope = Math.sqrt(sx * sx + sz * sz);
    const softShore = 1 - THREE.MathUtils.smoothstep(slope, 0.035, 0.22);
    const x = (i / (bakeRes - 1) - 0.5) * WATER_SIZE;
    const z = (j / (bakeRes - 1) - 0.5) * WATER_SIZE;
    const edgeInside = Math.min(
      playable.width * 0.5 - Math.abs(x),
      playable.depth * 0.5 - Math.abs(z),
    );
    const playableFade = THREE.MathUtils.smoothstep(edgeInside, -7, 22);
    const packedH = Math.round(THREE.MathUtils.clamp((heights[idx] - HMIN) / HSPAN, 0, 1) * 255);
    const metres = Math.min(dist[idx] * cellSize, SHORE_DIST_RANGE);
    data[idx * 4] = packedH;
    data[idx * 4 + 1] = Math.round((metres / SHORE_DIST_RANGE) * 255);
    data[idx * 4 + 2] = Math.round(THREE.MathUtils.clamp(softShore, 0, 1) * 255);
    data[idx * 4 + 3] = Math.round(THREE.MathUtils.clamp(playableFade, 0, 1) * 255);
  }
  const texture = new THREE.DataTexture(data, bakeRes, bakeRes, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function bakeStandingWaterMaskTexture(zoneId, bakeRes = BAKE_RES) {
  const data = new Uint8Array(bakeRes * bakeRes * 4);
  for (let j = 0; j < bakeRes; j += 1) {
    for (let i = 0; i < bakeRes; i += 1) {
      const x = (i / (bakeRes - 1) - 0.5) * WATER_SIZE;
      const z = (j / (bakeRes - 1) - 0.5) * WATER_SIZE;
      const mask = standingWaterSuppressionMaskAt(x, z, zoneId);
      const idx = (j * bakeRes + i) * 4;
      data[idx] = Math.round(mask * 255);
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, bakeRes, bakeRes, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

// Shared wave bank: three crossing swells for a calm tropical bay. The vertex
// stage uses the displacement; the fragment stage re-evaluates the analytic
// normal per pixel. Written for GLSL ES 1.00 (no array constructors).
const WAVE_GLSL = /* glsl */`
  const float STEEPNESS = 0.52;
  const float WAVE_COUNT = 3.0;

  void addWave(vec2 pos, float t, vec2 d, float amp, float wl, inout vec3 disp, inout vec3 n) {
    vec2 dir = normalize(d);
    float w = 6.28318530718 / wl;
    float phase = w * dot(dir, pos) + t * sqrt(9.8 * w);
    float c = cos(phase);
    float s = sin(phase);
    float q = STEEPNESS / (w * amp * WAVE_COUNT + 1e-4);
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
    addWave(pos, t, vec2( 0.86,  0.51), 0.07, 13.0, disp, n);
    addWave(pos, t, vec2(-0.62,  0.78), 0.045, 8.5, disp, n);
    addWave(pos, t, vec2( 0.34, -0.94), 0.028, 5.0, disp, n);
    disp *= atten;
    normal = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(-n.x, 1.0 - n.y, -n.z), atten));
    return disp;
  }

  // Swell attenuation over the shallows: gentle ramp (a steep one shows the
  // vertex grid), with a floor so the surface keeps rolling at the shore.
  float swellAtten(float depth) {
    return smoothstep(0.0, 0.3, depth) * (0.35 + 0.65 * smoothstep(0.35, 1.6, depth));
  }

  // Rhythmic swash: the waterline rides up and down the beach face in sync
  // with the terrain shader's foam band (same clock, same 0.5984 rad/s cycle).
  float swashLift(vec2 wxz, float t, float depthRaw) {
    float cyc = sin(t * 0.5984) * 0.5 + 0.5;
    float lift = ((cyc - 0.5) * 1.7 + sin(wxz.x * 0.17 + t * 0.30) * 0.3) * 0.115;
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
    float e = 1.75;
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
    float u = sd / BREAKER_WAVELENGTH + t * (BREAKER_SPEED / BREAKER_WAVELENGTH)
      + bnNoise(wxz * 0.05) * 0.45; // wobble the lines so they aren't ruler-straight
    f = fract(u);
    float id = floor(u);
    strength = 0.5 + 0.5 * bnNoise(vec2(id * 3.7, (wxz.x + wxz.y) * 0.025 + id));
    // Tight inner band (mockup anatomy: surf is punctuation near the shore,
    // then clean water) — roughly two fronts visible at a time.
    float band = smoothstep(20.0, 14.5, sd) * smoothstep(2.6, 4.2, sd);
    float depthGate = smoothstep(0.08, 0.3, depth) * smoothstep(3.2, 1.9, depth);
    float exposureGate = mix(0.18, 1.0, smoothstep(-0.15, 0.6, exposure));
    return band * depthGate * exposureGate;
  }

  // Vertex-stage swell at the breaking lip so the front has a silhouette.
  float breakerLift(vec2 wxz, float t, float sd, float depth, float exposure) {
    float f, s;
    float env = breakerField(wxz, t, sd, depth, exposure, f, s);
    float lip = smoothstep(0.09, 0.02, f);
    return lip * env * s * 0.13;
  }
`;

function createStylizedWaterMaterial(
  seafloorTexture,
  standingWaterMaskTexture,
  rippleNormalTexture,
  standingWaterRendering,
) {
  const suppression = standingWaterRendering.globalWaterSuppression;
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    extensions: { derivatives: true },
    uniforms: {
      uTime: { value: 0 },
      uSeafloor: { value: seafloorTexture },
      uStandingWaterMask: { value: standingWaterMaskTexture },
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
      // Screen-space refraction source (framebuffer grab taken just before
      // the water mesh draws — one copy, no scene re-render).
      uRefraction: { value: null },
      uHasRefraction: { value: 0 },
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
        float floorH = seafloorAt(world.xz);
        float depth = uWaterLevel - floorH;
        vDepth = depth;
        vec3 normal; // unused: shading normal is per-pixel in the fragment
        vec3 disp = gerstner(world.xz, uTime, swellAtten(depth), normal);
        world.xyz += disp;
        world.y += swashLift(world.xz, uTime, depth);
        float sd = shoreDistAt(world.xz);
        vExposure = shoreExposure(uSeafloor, uSize, world.xz, sd);
        world.y += breakerLift(world.xz, uTime, sd, depth, vExposure);
        vWorld = world.xyz;
        vReflCoord = uReflMatrix * vec4(world.xyz, 1.0);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      ${WAVE_GLSL}
      uniform float uTime;
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
      uniform float uSize;
      uniform sampler2D uSeafloor;
      uniform sampler2D uStandingWaterMask;
      uniform float uStandingWaterFadeStart;
      uniform float uStandingWaterFadeEnd;
      uniform sampler2D uRippleNormal;
      uniform float uWaterLevel;
      uniform sampler2D uRefraction;
      uniform float uHasRefraction;
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
      varying vec3 vWorld;
      varying float vDepth;
      varying float vExposure;
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
        vec2 p = wxz * 0.8 + vec2(t * 0.13, -t * 0.09);
        float a = 1.0 - worley(p);
        float b = 1.0 - worley(p * 2.4 + 7.3);
        // High contrast: real holes and filaments, not grey mist.
        return smoothstep(0.5, 0.88, a * 0.62 + b * 0.38);
      }

      // Surf: a crisp mostly-solid lip at the marching front, with the lace
      // eroding only the dissolving trail behind it (mockup: continuous lines
      // with frayed edges, not marble).
      float breakerFoam(vec2 wxz, float t, float sd, float depth, float lace, float exposure) {
        float f, s;
        float env = breakerField(wxz, t, sd, depth, exposure, f, s);
        // Narrow lip with a bright solid core at the leading edge; the trail
        // dissolves through the lace instead of smearing grey.
        float core = smoothstep(0.035, 0.008, f);
        float lip = smoothstep(0.075, 0.015, f);
        float trail = smoothstep(0.34, 0.07, f) * (1.0 - lip);
        float foam = core * 0.35 + lip * (0.7 + 0.3 * lace) + trail * lace * 0.45;
        return min(foam, 1.0) * env * s;
      }

      vec2 rippleNormalSlope(vec2 wxz, float t, float coarseLod, float fineLod) {
        // Domain-warp the coarse octave: all three reads share one 256px tile,
        // and unwarped the ~21m repeat shows up as identical sheen blobs
        // marching across the bay. The warp de-correlates repeats for free;
        // weight shifts toward the finer octaves so no single patch scale
        // dominates the highlight.
        vec2 warp = (vec2(
          noise(wxz * 0.021 + vec2(t * 0.004, 0.0)),
          noise(wxz * 0.017 + vec2(0.0, -t * 0.003))
        ) - 0.5) * 0.85;
        vec2 uvA = wxz * 0.048 + warp * 0.5 + vec2(t * 0.008, -t * 0.006);
        vec2 uvB = vec2(wxz.x * 0.78 - wxz.y * 0.62, wxz.x * 0.62 + wxz.y * 0.78) * 0.135
          + warp * 0.22 + vec2(-t * 0.014, t * 0.01);
        vec2 uvC = vec2(wxz.x * 0.36 + wxz.y * 0.93, -wxz.x * 0.93 + wxz.y * 0.36) * 0.27
          + vec2(t * 0.022, t * 0.017);
        vec3 a = texture2D(uRippleNormal, uvA).rgb * 2.0 - 1.0;
        vec3 b = texture2D(uRippleNormal, uvB).rgb * 2.0 - 1.0;
        vec3 c = texture2D(uRippleNormal, uvC).rgb * 2.0 - 1.0;
        return a.xy * uRippleOctaves.x * coarseLod + b.xy * uRippleOctaves.y * coarseLod + c.xy * uRippleOctaves.z * fineLod;
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

      void main() {
        // --- per-pixel surface normal: analytic swell + scrolling ripples ----
        vec4 floorSample = texture2D(uSeafloor, vWorld.xz / uSize + 0.5);
        float standingWater = texture2D(uStandingWaterMask, vWorld.xz / uSize + 0.5).r;
        float dRaw = uWaterLevel - (floorSample.r * ${HSPAN.toFixed(1)} + (${HMIN.toFixed(1)})); // signed: <0 just inland of the line
        float shoreDist = floorSample.g * ${SHORE_DIST_RANGE.toFixed(1)};
        float shoreSoftness = floorSample.b;
        float playableFade = floorSample.a;
        float edgeOcean = 1.0 - smoothstep(0.08, 0.5, playableFade);
        float dEff = dRaw + swashLift(vWorld.xz, uTime, dRaw);
        float depth = max(0.0, dEff);

        vec3 normal;
        vec3 waveDisp = gerstner(vWorld.xz, uTime, swellAtten(max(dRaw, 0.0)), normal);
        float crestHeight = waveDisp.y;
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
        if (!gl_FrontFacing) normal = -normal;

        vec3 viewDir = normalize(cameraPosition - vWorld);
        float underwaterView = clamp(uUnderwaterAmount, 0.0, 1.0);
        float underside = gl_FrontFacing ? 0.0 : 1.0;
        float surfaceLook = smoothstep(0.02, 0.58, -viewDir.y);

        // --- the water body: art-directed turquoise first, refraction second -
        float shallowFactor = exp(-depth * 0.30); // ~1 at the shore, 0 deep
        vec3 baseAbsorb = exp(-uAbsorb * depth);
        vec3 baseWater = uSand * baseAbsorb + uScatter * (1.0 - baseAbsorb);
        vec3 color = baseWater;
        if (uHasRefraction > 0.5) {
          // Distort harder where the water is deeper; nearly straight at the
          // swash line so the beach doesn't smear.
          vec2 screenUV = gl_FragCoord.xy / uResolution;
          float shallowClarity = 1.0 - smoothstep(0.35, 1.65, depth);
          float distort = mix(0.004 + min(depth, 2.5) * 0.010, 0.0025, shallowClarity);
          vec2 ruv = clamp(screenUV + normal.xz * distort, vec2(0.001), vec2(0.999));
          vec3 grab = texture2D(uRefraction, ruv).rgb;
          // The grab is tone-mapped sRGB; decode so the Beer-Lambert tint and
          // the final tone-mapping pass operate on plausible linear values.
          grab = pow(grab, vec3(2.2));

          // Keep the captured scene honest. Only dark basalt in very shallow
          // water gets a mild lift toward submerged turquoise so it doesn't
          // read as a hole in the sea.
          float grabLum = dot(grab, vec3(0.299, 0.587, 0.114));
          vec3 liftColor = mix(uScatter, uSand, 0.62);
          float darkLift = shallowClarity * smoothstep(0.3, 0.06, grabLum);
          vec3 gradedGrab = mix(grab, max(grab, liftColor * 0.8), darkLift * 0.4);

          float opticalDepth = depth * mix(0.3, 0.9, smoothstep(0.55, 2.8, depth)) + 0.018;
          vec3 bed = gradedGrab * exp(-uAbsorb * opticalDepth);
          float scatterStrength = mix(0.08, 0.5, smoothstep(0.5, 2.8, depth));
          vec3 refractedDetail = bed + uScatter * (1.0 - exp(-depth * 0.30)) * scatterStrength;
          // Shallow water IS the refracted scene; the painted body takes over
          // only as real depth accumulates.
          float captureMix = mix(0.92, 0.36, smoothstep(0.45, 2.8, depth)) * (1.0 - smoothstep(3.5, 7.5, depth));
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
        float rampVisibility = playableFade * (0.40 + nearShelf * 0.16) * (1.0 - edgeOcean * 0.35);
        vec3 paleAqua = mix(uSand, uFoam, 0.12);
        vec3 seafoamShelf = mix(uSand, uScatter, 0.5);
        seafoamShelf = mix(
          seafoamShelf,
          vec3(seafoamShelf.r * 0.86, max(seafoamShelf.g, seafoamShelf.b * 1.04), seafoamShelf.b * 0.94),
          0.42
        );
        vec3 midTurquoise = mix(uScatter, uDeep, 0.14);
        vec3 depthRamp = paleAqua;
        depthRamp = mix(depthRamp, seafoamShelf, smoothstep(0.16, 0.85, depth));
        depthRamp = mix(depthRamp, midTurquoise, smoothstep(0.9, 2.4, depth));
        depthRamp = mix(depthRamp, uDeep, smoothstep(2.8, 7.2, depth));
        float shelfMask = smoothstep(0.025, 0.16, depth) * (1.0 - smoothstep(2.7, 6.5, depth));
        color = mix(color, depthRamp, shelfMask * rampVisibility);

        // Ease into open-ocean blue past the drop-off.
        color = mix(color, uDeep, smoothstep(2.8, 9.5, depth) * 0.62);
        color = mix(color, uDeep, edgeOcean * (0.42 + 0.28 * smoothstep(0.6, 4.0, depth)));

        // Postcard gradient: colour keeps travelling turquoise -> deep with
        // distance from the beach even where the bed stays shallow for tens
        // of metres (wide shelf bays give depth no signal to work with).
        // Gated off where real depth already runs the deep ramps above.
        float offshoreTravel = smoothstep(18.0, 50.0, shoreDist) * playableFade
          * (1.0 - smoothstep(2.8, 7.0, depth));
        color = mix(color, mix(uScatter, uDeep, 0.78), offshoreTravel * 0.52);

        // Seam continuity with the open-ocean disc: by the time the plane's
        // alpha feather hands off (last ~14m before the rim), the body colour
        // must have arrived at uDeep — the disc's inner colour — or the
        // crossfade reads as a hard cyan/navy arc around the bay.
        float rimRadius = uSize * 0.5;
        float rimTravel = smoothstep(rimRadius - 39.0, rimRadius - 9.0, length(vWorld.xz));
        color = mix(color, uDeep, rimTravel * 0.85);

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
          float caps = (capLip + capTrail * 0.4) * smoothstep(0.62, 0.86, capSeed) * capGate;
          color = mix(color, uFoam, min(caps, 1.0) * 0.55);
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
        reflColor += uSunColor * sunDisc * (0.6 + uSunPathStrength * 1.6) * uDaylight
          * (1.0 - underwaterView * 0.8) * (1.0 - uRain * 0.8);
        // Schlick fresnel with water's real F0: looking down, the surface is
        // ~2% mirror (the bed shows through); at grazing angles it goes
        // glassy. Shallows are kept a touch clearer than physics for the
        // stylized lagoon read.
        float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
        float reflectance = 0.02 + 0.98 * fres;
        float reflStrength = mix(0.85, 0.22, shallowFactor) * (1.0 - underwaterView * 0.72);
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

        // --- sun glitter: tight sparkle, clamped below blowout ----------------
        vec3 hv = normalize(uSun + viewDir);
        vec3 glintWhite = mix(vec3(1.06, 1.035, 0.965), uFoam, 0.24);
        // Keep specular mostly white-gold. The sky can be rose; the sun flecks
        // should bloom as small hot points instead of broad pink patches.
        glintWhite = mix(glintWhite, vec3(1.12, 1.035, 0.82), uSunPathStrength * 0.38);
        float glintVisibility = (0.36 + 0.64 * uSunPathStrength) * (1.0 - uRain * 0.78) * (1.0 - underwaterView * 0.88);
        float spec = pow(max(dot(normal, hv), 0.0), mix(260.0, 175.0, uSunPathStrength)) * uDaylight * glintVisibility;
        float glint = 0.28 + 0.72 * rippleSparkleMask(vWorld.xz, uTime);
        vec2 sunPathDir = normalize(uSun.xz + vec2(0.0001, 0.0001));
        vec2 toWater = normalize(vWorld.xz - cameraPosition.xz + vec2(0.0001, 0.0001));
        float alongSun = smoothstep(0.02, 0.42, dot(toWater, sunPathDir));
        float crossSun = abs(toWater.x * sunPathDir.y - toWater.y * sunPathDir.x);
        float path = smoothstep(0.34 * uGlintWidth, 0.035, crossSun) * alongSun;
        float pathCore = smoothstep(0.24 * uGlintWidth, 0.018, crossSun) * alongSun;
        float pathCamDist = length(vWorld.xz - cameraPosition.xz);
        float pathDistance = smoothstep(8.0, 30.0, pathCamDist) * (1.0 - smoothstep(138.0, 180.0, pathCamDist));
        float pathGrain = 0.5 + 0.58 * smoothstep(0.38, 0.86, noise(vWorld.xz * 2.0 + vec2(uTime * 0.12, -uTime * 0.075)));
        float pathGlitter = path * pathDistance * pathGrain * uSunPathStrength;
        float microGlitter = microSparkleMask(vWorld.xz, uTime) * pathCore * pathDistance * uSunPathStrength;
        // Peaks are allowed past 1.0 so ACES rolls them off and the brightest
        // glints cross the bloom threshold (the sparkle is a bloom customer).
        color += glintWhite * min(spec * glint * 1.55, 1.45) * (0.72 + uSunPathStrength * 0.42);
        color += glintWhite * pathGlitter * 0.16 * (1.0 - uRain * 0.86) * (1.0 - underwaterView * 0.86);
        color += glintWhite * microGlitter * 1.6 * (1.0 - uRain * 0.86) * (1.0 - underwaterView * 0.86);
        color += glintWhite
          * (eventRippleGlint + playerRippleGlint)
          * uDaylight
          * (1.0 - uRain * 0.7)
          * (1.0 - underwaterView * 0.86);
        // Sparse mid-water twinkle that survives high sun: a handful of tight
        // glints in the 10-90 m band. This is the "alive" signal the sun-path
        // glitter can't give outside its low-sun window.
        float sparkleGate = uDaylight * (1.0 - uRain * 0.8) * (1.0 - underwaterView)
          * smoothstep(10.0, 22.0, pathCamDist) * (1.0 - smoothstep(60.0, 90.0, pathCamDist));
        if (sparkleGate > 0.01) {
          float sparkle = rippleSparkleMask(vWorld.xz, uTime);
          float sparkleFacing = pow(max(dot(normal, hv), 0.0), 38.0);
          color += glintWhite * sparkle * sparkleFacing * sparkleGate * 1.38;
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
        color += crestTint * crestBand * bandBreakup * waterSurfaceMask * (0.08 + uDaylight * 0.07);
        color = mix(color, color * vec3(0.76, 0.90, 0.96), troughBand * waterSurfaceMask * 0.18);
        color = mix(color, uFoam, crestBand * bandBreakup * waterSurfaceMask * 0.075);
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
        float surf = breakerFoam(vWorld.xz, uTime, shoreDist, depth, lace, vExposure)
          * smoothstep(0.05, 0.24, depth)
          * mix(0.68, 1.0, beachGate);
        shoreFoam *= 1.0 + uRain * 0.16;
        surf *= 1.2 + uRain * 0.22;
        float foam = clamp(max(shoreFoam * 1.05, surf), 0.0, 1.0);
        // Foam is reflected light, not emission. Dim the broad body at night,
        // while retaining a narrow silver response on the strongest crests
        // when moon glitter is actually reaching the surface.
        float foamCore = smoothstep(0.7, 0.98, foam);
        float foamLight = clamp(mix(0.46, 1.0, uDaylight) + uMoonGlitter * 0.28, 0.0, 1.0);
        float foamVisibility = mix(foamLight, min(1.0, foamLight + 0.18), foamCore);
        color = mix(color, uFoam, foam * 0.96 * foamVisibility);
        alpha = max(alpha, foam * 0.86 * foamVisibility);

        if (underwaterView > 0.001) {
          float underwaterBlend = smoothstep(0.08, 0.48, underwaterView);
          float ceilingNoise = 0.5 + 0.5 * noise(vWorld.xz * 1.75 + vec2(uTime * 0.12, -uTime * 0.09));
          float faceWeight = mix(0.82, 1.08, underside);
          float ceiling = underwaterBlend * faceWeight * mix(0.08, 0.46, surfaceLook);
          vec3 ceilingTint = mix(uDeep, uScatter, 0.62 + ceilingNoise * 0.16);
          ceilingTint = mix(ceilingTint, uSkyHorizon, smoothstep(0.18, 0.82, reflectance) * 0.24);
          color = mix(color, ceilingTint + uFoam * foam * 0.16, ceiling);
          float underwaterAlpha = 0.095 + surfaceLook * 0.27 + underside * 0.045 + reflectance * 0.06;
          underwaterAlpha += foam * (0.2 + surfaceLook * 0.22);
          alpha = mix(alpha, clamp(underwaterAlpha, 0.08, 0.58), underwaterBlend);
        }

        // --- atmospheric haze --------------------------------------------------
        float camDist = length(vWorld.xz - cameraPosition.xz);
        float haze = smoothstep(uHazeNear, uHazeFar, camDist);
        // Deep water resists the haze (mockup: the horizon stays saturated
        // blue; grey-out is reserved for genuine garua via uHazeNear/Far).
        float hazeByDepth = mix(0.22, 0.78, smoothstep(0.85, 2.8, depth));
        color = mix(color, uHaze, haze * hazeByDepth);

        // --- fade the plane edge into the open-ocean disc beyond ----------------
        float rim = uSize * 0.5;
        float edgeFade = 1.0 - smoothstep(rim - 14.0, rim - 2.0, length(vWorld.xz));
        alpha *= edgeFade;
        alpha *= 1.0 - smoothstep(uStandingWaterFadeStart, uStandingWaterFadeEnd, standingWater);

        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createSurfRibbonMaterial(seafloorTexture, standingWaterMaskTexture, standingWaterRendering) {
  const suppression = standingWaterRendering.globalWaterSuppression;
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
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
    },
    vertexShader: /* glsl */`
      ${WAVE_GLSL}
      uniform float uTime;
      uniform sampler2D uSeafloor;
      uniform sampler2D uStandingWaterMask;
      uniform float uStandingWaterFadeStart;
      uniform float uStandingWaterFadeEnd;
      uniform float uWaterLevel;
      uniform float uSize;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vShoreDist;
      varying float vShoreSoftness;
      varying float vPlayableFade;
      varying float vExposure;
      varying float vStandingWater;

      vec4 seafloorSample(vec2 wxz) {
        return texture2D(uSeafloor, wxz / uSize + 0.5);
      }

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec4 floorSample = seafloorSample(world.xz);
        float floorH = floorSample.r * ${HSPAN.toFixed(1)} + (${HMIN.toFixed(1)});
        float depth = uWaterLevel - floorH;
        vec3 waveNormal;
        vec3 disp = gerstner(world.xz, uTime, swellAtten(max(depth, 0.0)), waveNormal);
        float shoreDist = floorSample.g * ${SHORE_DIST_RANGE.toFixed(1)};
        world.xyz += disp;
        world.y += swashLift(world.xz, uTime, depth);
        vExposure = shoreExposure(uSeafloor, uSize, world.xz, shoreDist);
        world.y += breakerLift(world.xz, uTime, shoreDist, depth, vExposure);
        world.y += 0.035;
        vWorld = world.xyz;
        vDepth = max(0.0, depth);
        vShoreDist = shoreDist;
        vShoreSoftness = floorSample.b;
        vPlayableFade = floorSample.a;
        vStandingWater = texture2D(uStandingWaterMask, world.xz / uSize + 0.5).r;
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
      uniform float uStandingWaterFadeStart;
      uniform float uStandingWaterFadeEnd;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vShoreDist;
      varying float vShoreSoftness;
      varying float vPlayableFade;
      varying float vExposure;
      varying float vStandingWater;

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
        return cells * (0.55 + 0.45 * torn);
      }
      float srLine(float sd, float centre, float width) {
        return smoothstep(width, 0.0, abs(sd - centre));
      }

      void main() {
        float realCoast = smoothstep(0.02, 0.24, vPlayableFade);
        float shallow = smoothstep(0.035, 0.19, vDepth) * (1.0 - smoothstep(2.25, 3.9, vDepth));
        float shoreWindow = smoothstep(15.5, 0.45, vShoreDist);
        float beach = mix(0.78, 1.18, smoothstep(0.08, 0.78, vShoreSoftness));
        float lace = srLace(vWorld.xz, uTime);

        float cycle = sin(uTime * 0.5984) * 0.5 + 0.5;
        float wobble = sin(vWorld.x * 0.17 + uTime * 0.30) * 0.34
          + (srNoise(vWorld.xz * 0.075) - 0.5) * 0.78;
        float front = 0.65 + cycle * 2.65 + wobble;
        // Swash lip with a solid core, plus one weak fully-laced outer set
        // line: the only foam between the swash and the breaker fronts.
        float inner = srLine(vShoreDist, front, 0.6) * 0.72 * (0.6 + 0.4 * lace);
        // The outer set line marches like the breakers, so it obeys the same
        // swell-exposure gate (the immediate swash lip stays omnidirectional —
        // water laps every shore, but sets arrive from the swell).
        float outerSet = srLine(vShoreDist, front + 5.1, 1.35) * 0.3 * lace
          * mix(0.22, 1.0, smoothstep(-0.15, 0.6, vExposure));
        float bands = inner + outerSet;

        float f;
        float s;
        float breakerEnv = breakerField(vWorld.xz, uTime, vShoreDist, vDepth, vExposure, f, s);
        // Lip/trail widths match the main plane's breakerFoam exactly, so the
        // two layers reinforce one line instead of splitting into a pair.
        float breakerLip = smoothstep(0.075, 0.015, f);
        float breakerTrail = smoothstep(0.34, 0.07, f) * (1.0 - breakerLip);
        float breaker = breakerEnv * s * (breakerLip * (0.85 + 0.15 * lace) + breakerTrail * lace * 0.45);

        float contact = smoothstep(0.2, 0.018, abs(vDepth)) * smoothstep(2.65, 0.0, vShoreDist) * (0.5 + lace * 0.5);

        // shoreWindow gates only the swash-anchored lines; the breaker fronts
        // carry their own envelope out past it.
        float foam = ((bands + contact) * shoreWindow + breaker * 1.1)
          * realCoast * shallow * beach;
        foam *= 1.0 - smoothstep(uStandingWaterFadeStart, uStandingWaterFadeEnd, vStandingWater);
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
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// Large camera-following disc beneath the detailed water: the apparently
// infinite open ocean, faded into the sky at the horizon.
function createDeepOceanMaterial(rippleNormalTexture) {
  return new THREE.ShaderMaterial({
    fog: false,
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      // Matches the detailed plane's uDeep at the seam, then travels to a
      // genuinely deep saturated blue: the long tonal ramp reads as distance.
      shallow: { value: WATER_DAY.deep.clone() },
      deep: { value: WATER_DAY.openDeep.clone() },
      fogColor: { value: new THREE.Color('#cfe6f4') },
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
      varying vec3 vWorld;
      varying float vDiscRadius;

      vec3 rippleNormalAt(vec2 wxz, float t) {
        vec2 uvA = wxz * 0.042 + vec2(t * 0.006, -t * 0.004);
        vec2 uvB = vec2(wxz.x * 0.72 - wxz.y * 0.69, wxz.x * 0.69 + wxz.y * 0.72) * 0.12
          + vec2(-t * 0.011, t * 0.008);
        vec3 a = texture2D(rippleNormal, uvA).rgb * 2.0 - 1.0;
        vec3 b = texture2D(rippleNormal, uvB).rgb * 2.0 - 1.0;
        vec2 slope = (a.xy * 0.82 + b.xy * 0.44) * 1.65;
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
        float fromDetailedCentre = length(vWorld.xz);
        // Keep the horizon disc out of the detailed-water area entirely: the
        // refraction grab must see the real seabed there, not helper blue.
        if (fromDetailedCentre < 56.0) discard;
        // The detailed plane fades itself out radially over ~61..73m
        // (edgeFade). The disc must fade IN across that same ring — at full
        // opacity it pops beneath the still-visible plane as a hard
        // camera-crossing navy arc. The continued seabed renders under the
        // feather, so the crossfade reads as the shelf dropping away.
        float edgeFeather = smoothstep(58.0, 74.0, fromDetailedCentre);
        float depthMix = smoothstep(60.0, 150.0, fromDetailedCentre);
        vec3 color = mix(shallow, deep, depthMix);
        float shimmer = sin(vWorld.x * 0.06 + time * 0.4) * cos(vWorld.z * 0.05 - time * 0.32);
        color += shimmer * 0.015;

        // Sparse whitecap streaks so the open sea reads as textured swell
        // instead of a flat navy strip. Procedural (not texture-ridge) so
        // they survive mip averaging at horizon distances; cells are mapped
        // anisotropically so each cap stretches along the crest line
        // (perpendicular to the swell), and wind gates the population.
        vec2 discSwell = vec2(0.86024, 0.50979);
        vec2 discPerp = vec2(-discSwell.y, discSwell.x);
        vec2 capP = vec2(dot(vWorld.xz, discSwell) * 0.3, dot(vWorld.xz, discPerp) * 0.08)
          + vec2(time * 0.045, -time * 0.018);
        vec2 capCell = floor(capP);
        float capHash = fract(sin(dot(capCell, vec2(127.1, 311.7))) * 43758.5453);
        vec2 capLocal = fract(capP) - 0.5;
        float capDot = 1.0 - smoothstep(0.04, 0.24 + capHash * 0.16, length(capLocal));
        float capClump = 0.5 + 0.5 * sin(vWorld.x * 0.041 + time * 0.07)
          * sin(vWorld.z * 0.053 - time * 0.05);
        float caps = capDot * step(0.68, capHash) * smoothstep(0.45, 0.85, capClump)
          * daylight * capWindGate * capDensity;
        color = mix(color, vec3(0.9, 0.96, 0.99), min(caps, 1.0) * 0.4);

        // Sun glitter shares the detailed water's tiled normal source so the
        // horizon does not fall back to blocky procedural cells.
        vec3 normal = rippleNormalAt(vWorld.xz, time);
        vec3 viewDir = normalize(camPos - vWorld);
        vec3 hv = normalize(normalize(sun) + viewDir);
        float glintVisibility = 0.22 + 0.78 * sunPathStrength;
        float spec = pow(max(dot(normal, hv), 0.0), mix(260.0, 150.0, sunPathStrength)) * daylight * glintVisibility;
        vec3 sunGlintColor = mix(vec3(1.05, 1.02, 0.94), vec3(1.12, 1.04, 0.82), sunPathStrength * 0.5);
        vec2 sunPathDir = normalize(sun.xz + vec2(0.0001, 0.0001));
        vec2 toWater = normalize(vWorld.xz - camPos.xz + vec2(0.0001, 0.0001));
        float alongSun = smoothstep(0.03, 0.42, dot(toWater, sunPathDir));
        float crossSun = abs(toWater.x * sunPathDir.y - toWater.y * sunPathDir.x);
        float path = smoothstep(0.28 * glintWidth, 0.025, crossSun) * alongSun;
        float pathCore = smoothstep(0.19 * glintWidth, 0.018, crossSun) * alongSun;
        float pathSparkle = 0.48 + 0.52 * rippleSparkle(vWorld.xz, time);
        float pathFlecks = microSparkle(vWorld.xz, time);
        // Sparkle survives partway into the haze, then hands off to fog.
        float fromCam = length(vWorld.xz - camPos.xz);
        float fog = smoothstep(fogNear, fogFar, fromCam);
        color += sunGlintColor * min(spec * 1.36, 1.05) * (0.66 + sunPathStrength * 0.48) * (1.0 - fog * 0.85);
        color += sunGlintColor * path * pathSparkle * sunPathStrength * 0.09 * (1.0 - fog * 0.92);
        color += sunGlintColor * pathCore * pathFlecks * sunPathStrength * 0.52 * (1.0 - fog * 0.9);
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
const REFLECT_CLIP_BIAS = 0.06;
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
          wp.y += gerstner(wp.xz, uWaveTime, 0.8, waveNormal).y;
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
      dummy.scale.setScalar(0.4 + spawn.intensity * 0.3);
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

function hasReflectionFlag(object, flag) {
  let current = object;
  while (current) {
    if (current.userData?.[flag]) return true;
    current = current.parent;
  }
  return false;
}

// Flags only — visibility is handled at apply time so the cached list stays
// valid when objects toggle on and off.
function shouldRenderInReflection(object) {
  if (hasReflectionFlag(object, 'noReflect')) return false;
  return hasReflectionFlag(object, 'reflect');
}

// The reflect/noReflect flags are static per object, so the full scene-graph
// walk only needs to rerun occasionally (newly spawned objects) or on zone
// change — not on every reflection refresh.
const _noReflectCache = { objects: [], refreshIn: 0 };
const NO_REFLECT_REFRESH = 30; // reflection updates between rebuilds

function renderReflection(gl, scene, camera, rt, hidden, outMatrix) {
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

  // Only two sets of objects are hidden for the mirror pass (the water meshes
  // in `hidden`, and the no-reflect list below); track and restore exactly
  // those instead of snapshotting the whole scene graph every refresh.
  _hiddenPrev.length = 0;
  for (let i = 0; i < hidden.length; i += 1) {
    if (!hidden[i]) continue;
    _hiddenPrev.push(hidden[i], hidden[i].visible);
    hidden[i].visible = false;
  }
  // Reflection is an explicit whitelist: the rippled water needs the terrain,
  // ship, and nearby characters/large silhouettes, not every shrub, fish, and
  // inspectable prop. This keeps reflections on without rendering the full
  // scene a second time.
  if (_noReflectCache.refreshIn <= 0) {
    _noReflectCache.objects.length = 0;
    scene.traverse(object => {
      const renderable = object.isMesh || object.isSkinnedMesh || object.isSprite || object.isLine || object.isPoints;
      if (renderable && !shouldRenderInReflection(object)) _noReflectCache.objects.push(object);
    });
    _noReflectCache.refreshIn = NO_REFLECT_REFRESH;
  }
  _noReflectCache.refreshIn -= 1;
  _noReflect.length = 0;
  for (let i = 0; i < _noReflectCache.objects.length; i += 1) {
    const object = _noReflectCache.objects[i];
    if (!object.parent || !object.visible) continue; // unmounted or already hidden
    _noReflect.push(object);
    object.visible = false;
  }
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
    // The no-reflect list only ever contains objects that were visible when
    // hidden (invisible ones are skipped above), so restoring to true is safe.
    for (let i = 0; i < _noReflect.length; i += 1) {
      _noReflect[i].visible = true;
    }
    for (let i = 0; i < _hiddenPrev.length; i += 2) {
      _hiddenPrev[i].visible = _hiddenPrev[i + 1];
    }
  }
}

const _noReflect = [];
// Flat [object, wasVisible, object, wasVisible, ...] scratch for the meshes
// explicitly hidden during the mirror pass.
const _hiddenPrev = [];
const _prevClearColor = new THREE.Color();
const _drawSize = new THREE.Vector2();

export function Water({ quality = 'performance', reflections = true, allowInterior = false, openOceanOnly = false }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const { scene, gl } = useThree();
  const qualityConfig = useMemo(() => waterQualityConfig(quality), [quality]);

  // Zone change replaces most of the scene graph: rebuild the reflection
  // hide-list immediately rather than waiting out the refresh counter.
  useEffect(() => {
    _noReflectCache.refreshIn = 0;
  }, [currentZoneId]);

  const seafloor = useMemo(
    () => bakeSeafloorTexture(currentZoneId, qualityConfig.bakeRes),
    [currentZoneId, qualityConfig.bakeRes],
  );
  const standingWaterMask = useMemo(
    () => bakeStandingWaterMaskTexture(currentZoneId, qualityConfig.bakeRes),
    [currentZoneId, qualityConfig.bakeRes],
  );
  const standingWaterRendering = useMemo(
    () => getStandingWaterRenderingConfig(currentZoneId),
    [currentZoneId],
  );
  const rippleNormal = useMemo(() => createRippleNormalTexture(), []);
  const waterMaterial = useMemo(
    () => createStylizedWaterMaterial(seafloor, standingWaterMask, rippleNormal, standingWaterRendering),
    [seafloor, standingWaterMask, rippleNormal, standingWaterRendering],
  );
  const surfMaterial = useMemo(
    () => createSurfRibbonMaterial(seafloor, standingWaterMask, standingWaterRendering),
    [seafloor, standingWaterMask, standingWaterRendering],
  );
  const deepMaterial = useMemo(() => createDeepOceanMaterial(rippleNormal), [rippleNormal]);

  const waterGeometry = useMemo(
    () => new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, qualityConfig.segments, qualityConfig.segments),
    [qualityConfig.segments],
  );

  const reflectionRT = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(qualityConfig.reflectionRes, qualityConfig.reflectionRes, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      samples: qualityConfig.reflectionSamples || 0,
    });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }, [qualityConfig.reflectionRes, qualityConfig.reflectionSamples]);

  const deepRef = useRef(null);
  const waterRef = useRef(null);
  const surfRef = useRef(null);
  const grabRef = useRef(null); // FramebufferTexture for the refraction grab
  const oceanRippleCursor = useRef(0);
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
  const handleBeforeRender = useCallback(renderer => {
    // Skip when rendering into an offscreen target (the planar mirror pass):
    // the grab must come from the main framebuffer only.
    if (renderer.getRenderTarget() !== null) return;
    renderer.getDrawingBufferSize(_drawSize);
    let grab = grabRef.current;
    if (!grab || grab.image.width !== _drawSize.x || grab.image.height !== _drawSize.y) {
      grab?.dispose();
      grab = new THREE.FramebufferTexture(_drawSize.x, _drawSize.y);
      grab.minFilter = THREE.LinearFilter;
      grab.magFilter = THREE.LinearFilter;
      grabRef.current = grab;
    }
    renderer.copyFramebufferToTexture(grab);
    const wu = waterMaterial.uniforms;
    wu.uRefraction.value = grab;
    wu.uHasRefraction.value = 1;
    wu.uResolution.value.copy(_drawSize);
  }, [waterMaterial]);

  const bindWaterMesh = useCallback(mesh => {
    waterRef.current = mesh;
    if (mesh) mesh.onBeforeRender = handleBeforeRender;
  }, [handleBeforeRender]);

  useEffect(() => {
    if (!ENABLE_OCEAN_PLAYER_RIPPLES) return undefined;
    const addOceanRipple = (event, eventScale = 1) => {
      const ripples = waterMaterial.uniforms.uOceanRipples?.value;
      if (!event?.position || !ripples) return;
      const x = Number(event.position.x);
      const z = Number(event.position.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const zoneId = useThreeGameStore.getState().currentZoneId;
      const standingMask = standingWaterMaskAt(x, z, zoneId);
      if (standingMask > getStandingWaterRenderingConfig(zoneId).oceanRippleMaskCutoff) return;
      const depth = WATER_LEVEL - terrainHeight(x, z, zoneId);
      if (depth < 0.012) return;
      const depthScale = THREE.MathUtils.smoothstep(depth, 0.018, 0.1);
      if (depthScale <= 0.01) return;
      const intensity = THREE.MathUtils.clamp((event.intensity ?? 0.38) * eventScale * depthScale, 0.14, 1.75);
      const index = oceanRippleCursor.current;
      oceanRippleCursor.current = (oceanRippleCursor.current + 1) % OCEAN_PLAYER_RIPPLE_COUNT;
      ripples[index].set(x, z, performance.now() / 1000, intensity);
      if (oceanRingQueue.length < OCEAN_RING_COUNT) {
        oceanRingQueue.push({ x, z, intensity: Math.min(intensity, 1) });
      }
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
    return () => {
      offStep();
      offRipple();
      offSplash();
    };
  }, [waterMaterial]);

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
    wu.uAbsorb.value.set(
      THREE.MathUtils.lerp(0.42, 0.56, weatherMood),
      THREE.MathUtils.lerp(0.20, 0.28, weatherMood),
      THREE.MathUtils.lerp(0.10, 0.16, weatherMood),
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
    const capWindGate = THREE.MathUtils.clamp(
      (0.12 + Math.max(0, weatherEnv.windSpeed - 0.95) * 0.75) * waterDev.capWindMult,
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
    wu.uCapDensity.value = waterDev.capDensity;
    wu.uCapCrest.value = waterDev.capCrest;
    wu.uCapWindGate.value = capWindGate;
    wu.uGlintElongation.value = waterDev.glintElongation;
    wu.uGlintWidth.value = waterDev.glintWidth;
    const su = surfMaterial.uniforms;
    su.uTime.value = t;
    su.uRain.value = weatherEnv.rainIntensity;
    su.uUnderwaterAmount.value = store.underwaterCamera?.amount || 0;
    su.uDaylight.value = daylight;
    su.uMoonGlitter.value = moonGlitter;
    su.uFoam.value.copy(wu.uFoam.value);
    su.uScatter.value.copy(wu.uScatter.value);
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
      du.hazeStage1.value = waterDev.hazeStage1;
      du.hazeStage2.value = waterDev.hazeStage2;
      du.hazeBandStart.value = waterDev.hazeBandStart;
      du.capDensity.value = waterDev.capDensity;
      du.capWindGate.value = capWindGate;
      du.glintWidth.value = waterDev.glintWidth;
    }

    // Planar reflection pass (hide our own water so it isn't captured). The
    // mirror is a garnish on top of the refracted body now. Refresh it at the
    // current moving-camera cadence, but do not keep re-rendering it while the
    // camera and lighting are effectively unchanged.
    if (reflections && waterMesh) {
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
        const ok = renderReflection(gl, scene, camera, reflectionRT, [waterMesh, surfRef.current, disc], wu.uReflMatrix.value);
        wu.uReflection.value = ok ? reflectionRT.texture : null;
        wu.uHasReflection.value = ok ? 1 : 0;
      }
    } else {
      wu.uHasReflection.value = 0;
    }
  });

  useEffect(() => {
    return () => {
      waterGeometry.dispose();
      waterMaterial.dispose();
      surfMaterial.dispose();
      seafloor.dispose();
      standingWaterMask.dispose();
      rippleNormal.dispose();
      deepMaterial.dispose();
      grabRef.current?.dispose();
      grabRef.current = null;
      reflectionRT.dispose();
    };
  }, [waterGeometry, waterMaterial, surfMaterial, seafloor, standingWaterMask, rippleNormal, deepMaterial, reflectionRT]);

  const regionType = getRegionMap(currentZoneId).type;
  if (!allowInterior && ['interior', 'office', 'governorslibrary', 'governorshouse', 'cave'].includes(regionType)) return null;

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
