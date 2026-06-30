'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { getRegionMap } from '../../../game-core/regionMaps';
import { terrainHeight } from '../../world/terrain';
import { sunDirection, skyState } from '../../world/celestial';
import { WATER_LEVEL } from '../../world/water';
import { weatherEnv } from '../../world/weatherEnvRuntime';

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
const WATER_SEGMENTS = 96;    // vertex displacement only -> modest mesh is enough
const BAKE_RES = 512;         // seafloor depth-texture resolution
const REFLECTION_RES = 320;   // planar mirror is a garnish now, not the core look
const REFLECTION_MIN_INTERVAL = 5; // moving camera: keep the current cadence
const REFLECTION_STATIC_INTERVAL = 30; // static camera: let the reflection rest
const REFLECTION_CAMERA_MOVE_SQ = 0.08 * 0.08;
const REFLECTION_CAMERA_ROT_DELTA = 0.00025;
const REFLECTION_TIME_DELTA = 0.035; // in-game hours
// Height range packed into the depth texture's red byte: [HMIN, HMIN + HSPAN].
const HMIN = -6.0;
const HSPAN = 9.0;

const WATER_QUALITY = {
  performance: {
    bakeRes: 256,
    segments: 64,
    reflectionRes: 256,
  },
  cinematic: {
    bakeRes: BAKE_RES,
    segments: WATER_SEGMENTS,
    reflectionRes: REFLECTION_RES,
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
  scatter: new THREE.Color('#41c0d8'),
  deep: new THREE.Color('#357fb0'),
  openDeep: new THREE.Color('#23689a'),
  // Slightly blue-grey: pure white foam over a bright sea is what blows out.
  foam: new THREE.Color('#e9f4f0'),
};

const WATER_NIGHT = {
  sand: new THREE.Color('#172b37'),
  scatter: new THREE.Color('#123f55'),
  deep: new THREE.Color('#081b2d'),
  openDeep: new THREE.Color('#05111f'),
  foam: new THREE.Color('#9db6c8'),
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
  // with the terrain shader's foam band (same clock, same 0.8976 rad/s cycle).
  float swashLift(vec2 wxz, float t, float depthRaw) {
    float cyc = sin(t * 0.8976) * 0.5 + 0.5;
    float lift = ((cyc - 0.5) * 1.7 + sin(wxz.x * 0.17 + t * 0.45) * 0.3) * 0.115;
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

  const float BREAKER_WAVELENGTH = 12.0; // metres between fronts
  const float BREAKER_SPEED = 1.25;      // shoreward metres per second

  // Phase of the marching fronts. f runs 0 -> 1 between fronts, with the lip
  // at f = 0; strength varies per front and along the shore so sets of waves
  // feel uneven; the envelope confines surf to the breaker band.
  float breakerField(vec2 wxz, float t, float sd, float depth, out float f, out float strength) {
    float u = sd / BREAKER_WAVELENGTH + t * (BREAKER_SPEED / BREAKER_WAVELENGTH)
      + bnNoise(wxz * 0.05) * 0.45; // wobble the lines so they aren't ruler-straight
    f = fract(u);
    float id = floor(u);
    strength = 0.5 + 0.5 * bnNoise(vec2(id * 3.7, (wxz.x + wxz.y) * 0.025 + id));
    float band = smoothstep(30.0, 21.0, sd) * smoothstep(2.4, 4.5, sd);
    float depthGate = smoothstep(0.08, 0.3, depth) * smoothstep(3.2, 1.9, depth);
    return band * depthGate;
  }

  // Vertex-stage swell at the breaking lip so the front has a silhouette.
  float breakerLift(vec2 wxz, float t, float sd, float depth) {
    float f, s;
    float env = breakerField(wxz, t, sd, depth, f, s);
    float lip = smoothstep(0.14, 0.03, f);
    return lip * env * s * 0.13;
  }
`;

function createStylizedWaterMaterial(seafloorTexture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSeafloor: { value: seafloorTexture },
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
      uDaylight: { value: 1 },
      uSunPathStrength: { value: 0 },
      uRain: { value: 0 },
      uUnderwaterAmount: { value: 0 },
      // Screen-space refraction source (framebuffer grab taken just before
      // the water mesh draws — one copy, no scene re-render).
      uRefraction: { value: null },
      uHasRefraction: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      // Planar reflection (filled when reflections are enabled).
      uReflection: { value: null },
      uReflMatrix: { value: new THREE.Matrix4() },
      uHasReflection: { value: 0 },
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
      varying float vCrest;
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
        world.y += breakerLift(world.xz, uTime, shoreDistAt(world.xz), depth);
        vCrest = disp.y;
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
      uniform float uDaylight;
      uniform float uSunPathStrength;
      uniform float uRain;
      uniform float uUnderwaterAmount;
      uniform float uSize;
      uniform sampler2D uSeafloor;
      uniform float uWaterLevel;
      uniform sampler2D uRefraction;
      uniform float uHasRefraction;
      uniform vec2 uResolution;
      uniform sampler2D uReflection;
      uniform float uHasReflection;
      uniform vec3 uHaze;
      uniform float uHazeNear;
      uniform float uHazeFar;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vCrest;
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
      float foamLace(vec2 wxz, float t) {
        vec2 p = wxz * 1.55 + vec2(t * 0.2, -t * 0.14);
        float a = 1.0 - worley(p);
        float b = 1.0 - worley(p * 2.4 + 7.3);
        return smoothstep(0.42, 0.92, a * 0.62 + b * 0.38);
      }

      // Surf: a thin crisp lip at the marching front, dissolving white water
      // trailing behind it, all torn by the lace so no region is solid white.
      float breakerFoam(vec2 wxz, float t, float sd, float depth, float lace) {
        float f, s;
        float env = breakerField(wxz, t, sd, depth, f, s);
        float lip = smoothstep(0.10, 0.015, f);
        float trail = smoothstep(0.55, 0.08, f) * (1.0 - lip);
        float foam = lip * (0.45 + 0.55 * lace) + trail * lace * 0.62;
        return foam * env * s;
      }

      void main() {
        // --- per-pixel surface normal: analytic swell + scrolling ripples ----
        vec4 floorSample = texture2D(uSeafloor, vWorld.xz / uSize + 0.5);
        float dRaw = uWaterLevel - (floorSample.r * ${HSPAN.toFixed(1)} + (${HMIN.toFixed(1)})); // signed: <0 just inland of the line
        float shoreDist = floorSample.g * ${SHORE_DIST_RANGE.toFixed(1)};
        float shoreSoftness = floorSample.b;
        float playableFade = floorSample.a;
        float edgeOcean = 1.0 - smoothstep(0.08, 0.5, playableFade);
        float dEff = dRaw + swashLift(vWorld.xz, uTime, dRaw);
        float depth = max(0.0, dEff);

        vec3 normal;
        gerstner(vWorld.xz, uTime, swellAtten(max(dRaw, 0.0)), normal);
        vec2 rp = vWorld.xz * 0.7 + vec2(uTime * 0.06, -uTime * 0.05);
        float e = 0.12;
        float r0 = noise(rp);
        float rx = noise(rp + vec2(e, 0.0)) - r0;
        float rz = noise(rp + vec2(0.0, e)) - r0;
        vec2 rp2 = vWorld.xz * 2.3 - vec2(uTime * 0.045, uTime * 0.07);
        float s0 = noise(rp2);
        float sx = noise(rp2 + vec2(e, 0.0)) - s0;
        float sz = noise(rp2 + vec2(0.0, e)) - s0;
        normal = normalize(normal + vec3(-(rx + sx * 0.45), 0.0, -(rz + sz * 0.45)) * 1.25);
        if (uRain > 0.001) {
          vec2 rainP = vWorld.xz * 3.7 + vec2(uTime * 0.72, -uTime * 0.58);
          float rainN = noise(rainP);
          vec2 rainGrad = vec2(
            noise(rainP + vec2(e, 0.0)) - rainN,
            noise(rainP + vec2(0.0, e)) - rainN
          );
          normal = normalize(normal + vec3(-rainGrad.x, 0.0, -rainGrad.y) * uRain * 0.85);
        }
        if (!gl_FrontFacing) normal = -normal;

        vec3 viewDir = normalize(cameraPosition - vWorld);
        float underwaterView = clamp(uUnderwaterAmount, 0.0, 1.0);
        float underside = gl_FrontFacing ? 0.0 : 1.0;

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
        // Ease into open-ocean blue past the drop-off.
        color = mix(color, uDeep, smoothstep(3.6, 14.0, depth));
        color = mix(color, uDeep, edgeOcean * (0.42 + 0.28 * smoothstep(0.6, 4.0, depth)));

        // Mostly-opaque body (it *shows* the refracted scene), but genuinely
        // clear in the shallows — wading legs and the bed stay visible —
        // feathered to nothing exactly at the moving waterline.
        float shallowOpacity = mix(0.62, 0.985, smoothstep(0.25, 2.1, depth));
        float alpha = smoothstep(0.0, 0.075, dEff) * shallowOpacity;

        // --- reflection: a garnish on top of the clear body -------------------
        vec3 refl = reflect(-viewDir, normal);
        vec3 skyRefl = mix(uSkyHorizon, uSky, clamp(refl.y * 1.4, 0.0, 1.0));
        vec3 reflColor = skyRefl;
        if (uHasReflection > 0.5 && vReflCoord.w > 0.0) {
          vec2 mruv = vReflCoord.xy / vReflCoord.w + normal.xz * 0.03;
          vec2 edge = smoothstep(0.0, 0.08, mruv) * smoothstep(1.0, 0.92, mruv);
          float valid = edge.x * edge.y;
          vec3 planar = min(texture2D(uReflection, clamp(mruv, 0.0, 1.0)).rgb, vec3(0.92));
          reflColor = mix(skyRefl, mix(planar, skyRefl, 0.14), valid);
        }
        // Schlick fresnel with water's real F0: looking down, the surface is
        // ~2% mirror (the bed shows through); at grazing angles it goes
        // glassy. Shallows are kept a touch clearer than physics for the
        // stylized lagoon read.
        float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
        float reflectance = 0.02 + 0.98 * fres;
        float reflStrength = mix(0.85, 0.22, shallowFactor) * (1.0 - underwaterView * 0.72);
        color = mix(color, reflColor, clamp(reflectance * reflStrength, 0.0, 0.8));

        // --- sun glitter: tight sparkle, clamped below blowout ----------------
        vec3 hv = normalize(uSun + viewDir);
        float glintVisibility = (0.24 + 0.76 * uSunPathStrength) * (1.0 - uRain * 0.78) * (1.0 - underwaterView * 0.88);
        float spec = pow(max(dot(normal, hv), 0.0), mix(280.0, 170.0, uSunPathStrength)) * uDaylight * glintVisibility;
        float glint = 0.45 + 0.55 * smoothstep(0.5, 0.88, noise(vWorld.xz * 4.4 + uTime * 0.48));
        vec2 sunPathDir = normalize(uSun.xz + vec2(0.0001, 0.0001));
        vec2 toWater = normalize(vWorld.xz - cameraPosition.xz + vec2(0.0001, 0.0001));
        float alongSun = smoothstep(0.02, 0.42, dot(toWater, sunPathDir));
        float crossSun = abs(toWater.x * sunPathDir.y - toWater.y * sunPathDir.x);
        float path = smoothstep(0.34, 0.035, crossSun) * alongSun;
        float pathCamDist = length(vWorld.xz - cameraPosition.xz);
        float pathDistance = smoothstep(8.0, 30.0, pathCamDist) * (1.0 - smoothstep(138.0, 180.0, pathCamDist));
        float pathGrain = 0.5 + 0.58 * smoothstep(0.38, 0.86, noise(vWorld.xz * 2.0 + vec2(uTime * 0.12, -uTime * 0.075)));
        float pathGlitter = path * pathDistance * pathGrain * uSunPathStrength;
        color += uSunColor * min(spec * glint, 1.0) * (0.58 + uSunPathStrength * 0.4);
        color += uSunColor * pathGlitter * 0.28 * (1.0 - uRain * 0.86) * (1.0 - underwaterView * 0.86);
        color = mix(color, color * vec3(0.62, 0.76, 0.82), uRain * 0.24);

        // --- foam: crisp lip at the moving waterline + breaking crests --------
        float realCoastGate = smoothstep(0.02, 0.24, playableFade);
        float beachGate = mix(0.68, 1.0, smoothstep(0.12, 0.74, shoreSoftness)) * realCoastGate;
        float coastWater = smoothstep(0.01, 0.12, dEff) * smoothstep(8.5, 0.35, shoreDist) * realCoastGate;
        float foamCandidate = max(
          coastWater,
          max(
            smoothstep(10.0, 1.8, shoreDist) * smoothstep(0.03, 0.3, depth),
            smoothstep(0.07, 0.16, vCrest) * smoothstep(1.6, 0.5, depth)
          )
        );
        float lace = 0.0;
        if (foamCandidate > 0.001) {
          lace = foamLace(vWorld.xz, uTime);
        }
        float swashCycle = sin(uTime * 0.8976) * 0.5 + 0.5;
        float swashFront = 0.38 + swashCycle * 2.35 + sin(vWorld.x * 0.17 + uTime * 0.45) * 0.26;
        float foamLip = smoothstep(0.58, 0.035, abs(shoreDist - swashFront));
        float waterlineTrace = smoothstep(0.12, 0.012, dEff) * smoothstep(1.7, 0.0, shoreDist);
        float contactRim = smoothstep(0.18, 0.018, abs(dEff)) * smoothstep(2.4, 0.0, shoreDist) * realCoastGate;
        float shoreWash = smoothstep(5.6, 0.35, shoreDist) * smoothstep(0.02, 0.38, depth) * (0.42 + 0.58 * lace);
        float shoreFoam = coastWater * beachGate * (
          foamLip * (0.34 + 0.56 * lace)
          + waterlineTrace * (0.26 + 0.42 * lace)
          + shoreWash * 0.12
        );
        shoreFoam = max(shoreFoam, contactRim * (0.4 + 0.4 * lace));
        float breakZone = smoothstep(1.6, 0.5, depth);
        float crestFoam = smoothstep(0.07, 0.16, vCrest) * breakZone * lace * 0.55;
        float surf = breakerFoam(vWorld.xz, uTime, shoreDist, depth, lace)
          * smoothstep(0.05, 0.24, depth)
          * mix(0.68, 1.0, beachGate);
        shoreFoam *= 1.0 + uRain * 0.16;
        surf *= 0.9 + uRain * 0.22;
        float foam = clamp(max(max(shoreFoam, crestFoam), surf), 0.0, 1.0);
        color = mix(color, uFoam, foam * 0.88);
        alpha = max(alpha, foam * 0.8);

        if (underwaterView > 0.001) {
          float ceilingNoise = 0.5 + 0.5 * noise(vWorld.xz * 1.75 + vec2(uTime * 0.12, -uTime * 0.09));
          float faceWeight = mix(0.42, 0.78, underside);
          float ceiling = underwaterView * faceWeight;
          vec3 ceilingTint = mix(uDeep, uScatter, 0.62 + ceilingNoise * 0.16);
          ceilingTint = mix(ceilingTint, uSkyHorizon, smoothstep(0.18, 0.82, reflectance) * 0.24);
          color = mix(color, ceilingTint + uFoam * foam * 0.16, ceiling);
          alpha = max(alpha, underwaterView * (0.28 + underside * 0.24 + reflectance * 0.18));
        }

        // --- atmospheric haze --------------------------------------------------
        float camDist = length(vWorld.xz - cameraPosition.xz);
        float haze = smoothstep(uHazeNear, uHazeFar, camDist);
        float hazeByDepth = mix(0.22, 0.95, smoothstep(0.85, 2.8, depth));
        color = mix(color, uHaze, haze * hazeByDepth);

        // --- fade the plane edge into the open-ocean disc beyond ----------------
        float rim = uSize * 0.5;
        float edgeFade = 1.0 - smoothstep(rim - 14.0, rim - 2.0, length(vWorld.xz));
        alpha *= edgeFade;

        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// Large camera-following disc beneath the detailed water: the apparently
// infinite open ocean, faded into the sky at the horizon.
function createDeepOceanMaterial() {
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
      fogNear: { value: 64 },
      fogFar: { value: 150 },
      camPos: { value: new THREE.Vector3() },
      sun: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
      sunColor: { value: new THREE.Color('#fff3da') },
      daylight: { value: 1 },
      sunPathStrength: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
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
      uniform float daylight;
      uniform float sunPathStrength;
      varying vec3 vWorld;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.3))) * 19341.13); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float fromCentre = length(vWorld.xz);
        // Keep the horizon disc out of the detailed-water area entirely: the
        // refraction grab must see the real seabed there, not helper blue.
        if (fromCentre < 58.0) discard;
        float depthMix = smoothstep(60.0, 150.0, fromCentre);
        vec3 color = mix(shallow, deep, depthMix);
        float shimmer = sin(vWorld.x * 0.06 + time * 0.4) * cos(vWorld.z * 0.05 - time * 0.32);
        color += shimmer * 0.015;

        // Sun glitter: a cheap two-octave noise normal so the open ocean
        // sparkles along the sun path instead of reading as flat paint.
        vec2 gp = vWorld.xz * 0.55 + vec2(time * 0.07, -time * 0.05);
        float e = 0.14;
        float g0 = noise(gp);
        vec2 grad = vec2(noise(gp + vec2(e, 0.0)) - g0, noise(gp + vec2(0.0, e)) - g0);
        vec2 gp2 = vWorld.xz * 1.7 - vec2(time * 0.05, time * 0.08);
        float h0 = noise(gp2);
        grad += vec2(noise(gp2 + vec2(e, 0.0)) - h0, noise(gp2 + vec2(0.0, e)) - h0) * 0.5;
        vec3 normal = normalize(vec3(-grad.x, 1.0, -grad.y) * vec3(1.6, 1.0, 1.6));
        vec3 viewDir = normalize(camPos - vWorld);
        vec3 hv = normalize(normalize(sun) + viewDir);
        float glintVisibility = 0.22 + 0.78 * sunPathStrength;
        float spec = pow(max(dot(normal, hv), 0.0), mix(340.0, 210.0, sunPathStrength)) * daylight * glintVisibility;
        vec2 sunPathDir = normalize(sun.xz + vec2(0.0001, 0.0001));
        vec2 toWater = normalize(vWorld.xz - camPos.xz + vec2(0.0001, 0.0001));
        float alongSun = smoothstep(0.03, 0.42, dot(toWater, sunPathDir));
        float crossSun = abs(toWater.x * sunPathDir.y - toWater.y * sunPathDir.x);
        float path = smoothstep(0.28, 0.025, crossSun) * alongSun;
        float pathSparkle = 0.48 + 0.52 * smoothstep(0.38, 0.82, noise(vWorld.xz * 1.05 + vec2(time * 0.07, -time * 0.045)));
        // Sparkle survives partway into the haze, then hands off to fog.
        float fromCam = length(vWorld.xz - camPos.xz);
        float fog = smoothstep(fogNear, fogFar, fromCam);
        color += sunColor * min(spec, 0.5) * (0.52 + sunPathStrength * 0.28) * (1.0 - fog * 0.85);
        color += sunColor * path * pathSparkle * sunPathStrength * 0.12 * (1.0 - fog * 0.92);

        color = mix(color, fogColor, fog);
        gl_FragColor = vec4(color, 1.0);
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

  const visibilityState = [];
  scene.traverse(object => {
    visibilityState.push({ object, visible: object.visible });
  });
  if (typeof globalThis !== 'undefined') {
    globalThis.__threeReflectionDebug = {
      before: scene.children.slice(0, 12).map(child => ({
        name: child.name || child.type || 'Object3D',
        type: child.type,
        visible: child.visible !== false,
      })),
    };
  }
  for (let i = 0; i < hidden.length; i += 1) {
    if (hidden[i]) hidden[i].visible = false;
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
    _noReflect.push({ object });
    object.visible = false;
  }
  if (typeof globalThis !== 'undefined' && globalThis.__threeReflectionDebug) {
    globalThis.__threeReflectionDebug.afterHide = scene.children.slice(0, 12).map(child => ({
      name: child.name || child.type || 'Object3D',
      type: child.type,
      visible: child.visible !== false,
    }));
  }
  const prevRT = gl.getRenderTarget();
  const prevShadowAuto = gl.shadowMap.autoUpdate;
  try {
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(rt);
    gl.clear();
    gl.render(scene, _virtualCam);
    return true;
  } finally {
    gl.setRenderTarget(prevRT);
    gl.shadowMap.autoUpdate = prevShadowAuto;
    for (let i = 0; i < visibilityState.length; i += 1) {
      visibilityState[i].object.visible = visibilityState[i].visible;
    }
    if (typeof globalThis !== 'undefined' && globalThis.__threeReflectionDebug) {
      globalThis.__threeReflectionDebug.afterRestore = scene.children.slice(0, 12).map(child => ({
        name: child.name || child.type || 'Object3D',
        type: child.type,
        visible: child.visible !== false,
      }));
    }
  }
}

const _noReflect = [];
const _drawSize = new THREE.Vector2();

export function Water({ quality = 'performance', reflections = true }) {
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
  const waterMaterial = useMemo(() => createStylizedWaterMaterial(seafloor), [seafloor]);
  const deepMaterial = useMemo(() => createDeepOceanMaterial(), []);

  const waterGeometry = useMemo(
    () => new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, qualityConfig.segments, qualityConfig.segments),
    [qualityConfig.segments],
  );

  const reflectionRT = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(qualityConfig.reflectionRes, qualityConfig.reflectionRes, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }, [qualityConfig.reflectionRes]);

  const deepRef = useRef(null);
  const waterRef = useRef(null);
  const grabRef = useRef(null); // FramebufferTexture for the refraction grab
  const reflectionFrame = useRef(0);
  const reflectionState = useRef({
    initialized: false,
    framesSinceUpdate: REFLECTION_STATIC_INTERVAL,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    timeOfDay: null,
  });
  const _sun = useMemo(() => new THREE.Vector3(), []);
  const _white = useMemo(() => new THREE.Color('#ffffff'), []);

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

  useFrame(({ clock, camera }) => {
    const waterMesh = waterRef.current;
    if (!waterMesh) return; // no water in this zone -> skip everything

    const store = useThreeGameStore.getState();
    const t = clock.elapsedTime;
    const time = ((store.timeOfDay % 24) + 24) % 24;
    const sun = sunDirection(time);
    _sun.set(sun[0], sun[1], sun[2]);

    const wu = waterMaterial.uniforms;
    wu.uTime.value = t;
    wu.uSun.value.copy(_sun);
    wu.uRain.value = weatherEnv.rainIntensity;
    wu.uUnderwaterAmount.value = store.underwaterCamera?.amount || 0;
    const sky = skyState(time, store.day || 1);
    const daylight = sky.daylight;
    const lowSun = THREE.MathUtils.smoothstep(sky.elevation, 0.0, 0.18)
      * (1 - THREE.MathUtils.smoothstep(sky.elevation, 0.34, 0.72));
    const sunPathStrength = daylight * lowSun * (1 - weatherEnv.rainIntensity * 0.72) * (1 - weatherEnv.overcast * 0.55);
    const weatherMood = THREE.MathUtils.clamp(weatherEnv.overcast * 0.58 + weatherEnv.rainIntensity * 0.42, 0, 1);
    const stormBlend = weatherMood * THREE.MathUtils.lerp(0.25, 0.85, daylight);
    wu.uDaylight.value = daylight;
    wu.uSunPathStrength.value = sunPathStrength;
    wu.uAbsorb.value.set(
      THREE.MathUtils.lerp(0.42, 0.56, weatherMood),
      THREE.MathUtils.lerp(0.20, 0.28, weatherMood),
      THREE.MathUtils.lerp(0.10, 0.16, weatherMood),
    );
    wu.uSand.value.copy(WATER_NIGHT.sand).lerp(WATER_DAY.sand, daylight).lerp(WATER_STORM.sand, stormBlend);
    wu.uScatter.value.copy(WATER_NIGHT.scatter).lerp(WATER_DAY.scatter, daylight).lerp(WATER_STORM.scatter, stormBlend);
    wu.uDeep.value.copy(WATER_NIGHT.deep).lerp(WATER_DAY.deep, daylight).lerp(WATER_STORM.deep, stormBlend);
    wu.uFoam.value.copy(WATER_NIGHT.foam).lerp(WATER_DAY.foam, daylight).lerp(WATER_STORM.foam, stormBlend);
    if (scene.fog) {
      const horizonLift = THREE.MathUtils.lerp(0.04, 0.18, daylight);
      const hazeLift = THREE.MathUtils.lerp(0.08, 0.42, daylight);
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
      du.daylight.value = wu.uDaylight.value;
      du.sunPathStrength.value = sunPathStrength;
      du.shallow.value.copy(WATER_NIGHT.deep).lerp(WATER_DAY.deep, daylight).lerp(WATER_STORM.deep, stormBlend);
      du.deep.value.copy(WATER_NIGHT.openDeep).lerp(WATER_DAY.openDeep, daylight).lerp(WATER_STORM.openDeep, stormBlend);
      if (scene.fog) du.fogColor.value.copy(wu.uHaze.value);
    }

    // Planar reflection pass (hide our own water so it isn't captured). The
    // mirror is a garnish on top of the refracted body now. Refresh it at the
    // current moving-camera cadence, but do not keep re-rendering it while the
    // camera and lighting are effectively unchanged.
    if (reflections) {
      reflectionFrame.current += 1;
      const rs = reflectionState.current;
      rs.framesSinceUpdate += 1;
      const cameraMoved = !rs.initialized || camera.position.distanceToSquared(rs.position) > REFLECTION_CAMERA_MOVE_SQ;
      const cameraRotated = !rs.initialized || 1 - Math.abs(camera.quaternion.dot(rs.quaternion)) > REFLECTION_CAMERA_ROT_DELTA;
      const lightingChanged = rs.timeOfDay == null || Math.abs(time - rs.timeOfDay) > REFLECTION_TIME_DELTA;
      const cadenceReady = reflectionFrame.current >= REFLECTION_MIN_INTERVAL;
      const stale = rs.framesSinceUpdate >= REFLECTION_STATIC_INTERVAL;
      if (!wu.uReflection.value || stale || (cadenceReady && (cameraMoved || cameraRotated || lightingChanged))) {
        reflectionFrame.current = 0;
        rs.framesSinceUpdate = 0;
        rs.initialized = true;
        rs.position.copy(camera.position);
        rs.quaternion.copy(camera.quaternion);
        rs.timeOfDay = time;
        const ok = renderReflection(gl, scene, camera, reflectionRT, [waterMesh, disc], wu.uReflMatrix.value);
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
      seafloor.dispose();
      deepMaterial.dispose();
      grabRef.current?.dispose();
      grabRef.current = null;
      reflectionRT.dispose();
    };
  }, [waterGeometry, waterMaterial, seafloor, deepMaterial, reflectionRT]);

  const regionType = getRegionMap(currentZoneId).type;
  if (['beagle', 'interior', 'office', 'governorslibrary', 'governorshouse', 'cave'].includes(regionType)) return null;

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
        <circleGeometry args={[160, 64]} />
      </mesh>
      <mesh ref={bindWaterMesh} geometry={waterGeometry} material={waterMaterial} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL, 0]} renderOrder={-2} frustumCulled={false} userData={{
        renderSource: `water:${currentZoneId}:surface`,
        renderLabel: `${currentZoneId} water surface`,
        renderKind: 'water',
        renderPath: null,
      }} />
    </group>
  );
}
