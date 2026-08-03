'use client';

import React, {
  Suspense,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRegionTerrainConfig, terrainColor, terrainHeight } from '../../world/terrain';
import {
  TERRAIN_WATER_SURFACE_Y,
} from '../../world/terrainGeometry';
import { readTerrainResource } from '../../world/terrainResource';
import { getRegionDefinition } from '../../world/regions';
import { createPlaceholderPbrTerrainMaterial } from '../../world/regions/materials/placeholderPbrTerrain';
import { readBorderVistaResource } from '../../world/vistas/borderVistaResource';
import {
  centralPeakDev,
  getCentralPeakDevRevision,
  subscribeCentralPeakDev,
} from '../../world/vistas/centralPeakDevRuntime';
import {
  distanceSceneryRuntime,
  getDistanceSceneryRevision,
  subscribeDistanceScenery,
} from '../../world/vistas/distanceSceneryRuntime';
import {
  TERRAIN_TEXTURE_CARRY_GLSL,
  terrainSeamUniforms,
} from '../../world/vistas/terrainSeamDevRuntime';
import { getRegionEdgeHints } from '../../../game-core/regionMaps';
import { useThreeGameStore } from '../../store';
import { skyState } from '../../world/celestial';
import { computeOutdoorLightRig } from '../../world/outdoorLighting';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { terrainLookTuning } from '../../world/terrainLook';

// Matches the water surface in Water.jsx; used for the damp-shore band.
const WATER_SURFACE_Y = TERRAIN_WATER_SURFACE_Y;

// ---------------------------------------------------------------------------
// Seabed caustics — the dancing light net on submerged sand. Lives in the
// terrain shader (light belongs on the bottom, where the eye expects it),
// works for every zone's material, and costs a few noise lookups only on
// pixels that are actually underwater. Two counter-scrolling Worley layers
// min()-ed together so the filaments never look static (GPU Gems 2.4 trick).
const CAUSTICS_GLSL = /* glsl */`
  uniform float uCausticsTime;
  uniform float uCausticsStrength;
  uniform float uUnderwaterAmount;
  uniform float uRainWetness;
  uniform vec3 uTerrainSunDirection;
  uniform float uTerrainDaylight;
  uniform float uTerrainGolden;
  uniform float uTerrainHardSun;
  uniform float uTerrainWeatherSoftness;
  uniform float uTerrainSunWarmth;
  uniform float uTerrainCoolShade;
  uniform float uTerrainWetShine;
  varying vec3 vCausticsW;
  vec2 cstHash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }
  float cstWorley(vec2 p, float t) {
    vec2 cell = floor(p);
    vec2 frac = fract(p);
    float d = 1.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = cstHash2(cell + g);
        o = 0.5 + 0.45 * sin(t + 6.2831 * o);
        vec2 r = g + o - frac;
        d = min(d, dot(r, r));
      }
    }
    return d;
  }
  float cstLight(vec2 p, float t) {
    float a = 1.0 - sqrt(cstWorley(p, t));
    float b = 1.0 - sqrt(cstWorley(p * 1.31 + vec2(4.7, 9.1), -t * 0.83 + 2.0));
    return pow(max(min(a, b), 0.0), 4.0);
  }
  float cstWaveLens(vec2 p, float t) {
    float a = sin(dot(normalize(vec2( 0.86,  0.51)), p) * 0.4833219 + t * 2.1759);
    float b = sin(dot(normalize(vec2(-0.62,  0.78)), p) * 0.7391983 + t * 2.6911);
    float c = sin(dot(normalize(vec2( 0.34, -0.94)), p) * 1.2566371 + t * 3.5091);
    float ridge = a * 0.44 + b * 0.33 + c * 0.23;
    return 0.78 + 0.30 * pow(clamp(ridge * 0.5 + 0.5, 0.0, 1.0), 1.85);
  }
`;

const CAUSTICS_APPLY = /* glsl */`
  vec3 terrainWorldNormal = normalize(cross(dFdx(vCausticsW), dFdy(vCausticsW)));
  if (terrainWorldNormal.y < 0.0) terrainWorldNormal *= -1.0;
  vec3 terrainSunDir = normalize(uTerrainSunDirection);
  float terrainSunFace = clamp(dot(terrainWorldNormal, terrainSunDir), 0.0, 1.0);
  float terrainAwayFromSun = 1.0 - terrainSunFace;
  float terrainSlope = clamp(1.0 - abs(terrainWorldNormal.y), 0.0, 1.0);
  float terrainRelief = smoothstep(0.18, 0.78, terrainSlope);
  float terrainWarmFace = pow(terrainSunFace, 1.45)
    * uTerrainSunWarmth
    * (0.38 + terrainRelief * 0.42 + uTerrainGolden * 0.24)
    * (1.0 - uTerrainWeatherSoftness * 0.62);
  outgoingLight *= mix(vec3(1.0), vec3(1.075, 1.032, 0.915), clamp(terrainWarmFace, 0.0, 0.24));

  float terrainCoolGully = pow(terrainAwayFromSun, 1.35)
    * terrainRelief
    * uTerrainCoolShade
    * (1.0 - uTerrainWeatherSoftness * 0.42);
  outgoingLight *= mix(vec3(1.0), vec3(0.76, 0.84, 0.93), clamp(terrainCoolGully, 0.0, 0.2));

  float terrainLowCrease = smoothstep(0.5, 0.92, terrainRelief)
    * (1.0 - smoothstep(13.0, 31.0, vCausticsW.y))
    * (0.42 + terrainAwayFromSun * 0.58)
    * uTerrainDaylight
    * (1.0 - uTerrainWeatherSoftness * 0.5);
  outgoingLight *= 1.0 - clamp(terrainLowCrease * 0.055, 0.0, 0.055);

  if (uRainWetness > 0.001) {
    float wetAboveWater = smoothstep(${(WATER_SURFACE_Y + 0.04).toFixed(2)}, ${(WATER_SURFACE_Y + 0.55).toFixed(2)}, vCausticsW.y);
    float wetHeightFade = 1.0 - smoothstep(26.0, 42.0, vCausticsW.y);
    float rainWet = uRainWetness * wetAboveWater * (0.55 + wetHeightFade * 0.45);
    outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.66, 0.74, 0.72), clamp(rainWet * 0.34, 0.0, 0.34));
  }
  float cstDepth = ${WATER_SURFACE_Y.toFixed(2)} - vCausticsW.y;
  if (cstDepth > 0.02 && uCausticsStrength > 0.001) {
    float cstFade = smoothstep(0.02, 0.22, cstDepth) * (1.0 - smoothstep(2.2, 4.5, cstDepth));
    vec2 cstP = vCausticsW.xz * 0.8 + vec2(uCausticsTime * 0.03, -uCausticsTime * 0.022);
    float cst = cstLight(cstP, uCausticsTime * 0.7);
    float waveLens = cstWaveLens(vCausticsW.xz, uCausticsTime);
    float underwaterBoost = mix(1.0, 1.32, clamp(uUnderwaterAmount, 0.0, 1.0));
    outgoingLight += vec3(1.0, 0.97, 0.85) * cst * cstFade * uCausticsStrength * waveLens * underwaterBoost;
  }
  float shoreWet = (1.0 - smoothstep(${(WATER_SURFACE_Y + 0.02).toFixed(2)}, ${(WATER_SURFACE_Y + 0.68).toFixed(2)}, vCausticsW.y))
    * smoothstep(${(WATER_SURFACE_Y - 1.9).toFixed(2)}, ${(WATER_SURFACE_Y + 0.03).toFixed(2)}, vCausticsW.y);
  float terrainRainWet = uRainWetness * (1.0 - smoothstep(18.0, 38.0, vCausticsW.y));
  float terrainWet = clamp(max(shoreWet, terrainRainWet * 0.42), 0.0, 1.0);
  if (terrainWet > 0.001) {
    vec3 terrainViewDir = normalize(cameraPosition - vCausticsW);
    float grazing = pow(1.0 - clamp(dot(terrainWorldNormal, terrainViewDir), 0.0, 1.0), 2.2);
    float wetSunGlint = pow(terrainSunFace, 2.8) * (0.35 + grazing * 0.65);
    float wetSpec = terrainWet * uTerrainWetShine * wetSunGlint * (1.0 - uTerrainWeatherSoftness * 0.42);
    outgoingLight += vec3(1.0, 0.93, 0.72) * clamp(wetSpec, 0.0, 0.16);
    outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.86, 0.94, 0.92), terrainWet * (0.045 + uRainWetness * 0.04));
  }
`;

const TERRAIN_TEXTURE_CARRY_APPLY = /* glsl */`
  if (vTerrainCarryDepth >= 0.0) {
    float terrainTextureCarryProgress = tsCarryProgress(
      vTerrainCarryDepth,
      vCausticsW.xz
    );
    float terrainTextureCarryNoise = tsCarryNoise(vCausticsW.xz);
    if (terrainTextureCarryNoise < terrainTextureCarryProgress) discard;
  }
`;

// Global terrain grade. uTerrainGrade is (brightness, saturation, contrast,
// warmth); uTerrainGradeExtra is (macroVariation, roughnessOffset,
// normalStrength). Pure arithmetic on values the shader already holds — no
// added samplers, which matters because this runs on every terrain fragment
// and the renderer is fill-bound.
const TERRAIN_GRADE_APPLY = /* glsl */`
  {
    vec3 graded = diffuseColor.rgb * uTerrainGrade.x;
    float gradeLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
    graded = mix(vec3(gradeLuma), graded, uTerrainGrade.y);
    // Contrast pivots on mid grey so brightness and contrast stay independent.
    graded = (graded - 0.5) * uTerrainGrade.z + 0.5;
    // Warmth trades blue against red at constant luminance, so the ground
    // shifts in hue without also changing how bright it reads.
    graded *= vec3(1.0 + uTerrainGrade.w * 0.16, 1.0, 1.0 - uTerrainGrade.w * 0.16);

    // Steep faces toward exposed rock. The geometric normal is rebuilt from
    // world-position derivatives rather than read from vNormal, matching what
    // the shared lighting block already does and avoiding any assumption
    // about which normal varyings a region's material left in scope.
    if (uTerrainGradeShape.x > 0.001) {
      vec3 gradeFaceNormal = normalize(cross(dFdx(vCausticsW), dFdy(vCausticsW)));
      float gradeSlope = 1.0 - clamp(abs(gradeFaceNormal.y), 0.0, 1.0);
      float slopeAmount = smoothstep(0.12, 0.62, gradeSlope) * uTerrainGradeShape.x;
      float slopeLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      graded = mix(graded, mix(vec3(slopeLuma), graded, 0.5) * 0.88, slopeAmount);
    }

    // Elevation tint over roughly the first 25 metres.
    if (abs(uTerrainGradeShape.y) > 0.001) {
      float gradeHeight = clamp(vCausticsW.y / 25.0, -1.0, 1.0);
      float heightAmount = gradeHeight * uTerrainGradeShape.y * 0.12;
      graded *= vec3(1.0 + heightAmount, 1.0, 1.0 - heightAmount);
    }

    // Aerial perspective for the ground plane. Distance comes from the world
    // position against cameraPosition, which is a built-in uniform, so this
    // does not depend on vViewPosition being declared.
    if (uTerrainGradeShape.z > 0.001) {
      float gradeDistance = length(vCausticsW - cameraPosition);
      float farAmount = smoothstep(22.0, 150.0, gradeDistance) * uTerrainGradeShape.z;
      float farLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      graded = mix(graded, mix(vec3(farLuma), graded, 0.45) * 1.05, farAmount);
    }

    diffuseColor.rgb = clamp(graded, 0.0, 1.0);
    roughnessFactor = clamp(roughnessFactor + uTerrainGradeExtra.y, 0.04, 1.0);
  }
`;

// Composes shared lighting and apron-handoff behavior with each authored
// region material's existing onBeforeCompile hook.
function injectTerrainRenderingExtensions(material) {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = shader => {
    if (previousCompile) previousCompile(shader);
    shader.uniforms.uCausticsTime = { value: 0 };
    shader.uniforms.uCausticsStrength = { value: 0 };
    shader.uniforms.uUnderwaterAmount = { value: 0 };
    shader.uniforms.uRainWetness = { value: 0 };
    shader.uniforms.uTerrainSunDirection = { value: new THREE.Vector3(0, 1, 0) };
    shader.uniforms.uTerrainDaylight = { value: 0 };
    shader.uniforms.uTerrainGolden = { value: 0 };
    shader.uniforms.uTerrainHardSun = { value: 0 };
    shader.uniforms.uTerrainWeatherSoftness = { value: 0 };
    shader.uniforms.uTerrainSunWarmth = { value: 0 };
    shader.uniforms.uTerrainCoolShade = { value: 0 };
    shader.uniforms.uTerrainWetShine = { value: 0 };
    shader.uniforms.uLocalApronTexture = terrainSeamUniforms.uLocalApronTexture;
    shader.uniforms.uTextureCarrySeam = terrainSeamUniforms.uTextureCarrySeam;
    // Global terrain grade (world/terrainLook.js). Packed into two vectors so
    // the whole panel costs two uniform slots rather than seven.
    shader.uniforms.uTerrainGrade = { value: new THREE.Vector4(1, 1, 1, 0) };
    shader.uniforms.uTerrainGradeExtra = { value: new THREE.Vector3(1, 0, 1) };
    // (slopeTint, heightTint, distanceFade, detailTiling)
    shader.uniforms.uTerrainGradeShape = { value: new THREE.Vector4(0, 0, 0, 1) };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aApronDepth;
        varying float vTerrainCarryDepth;
        varying vec3 vCausticsW;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTerrainCarryDepth = aApronDepth;
        vCausticsW = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec4 uLocalApronTexture;
        uniform vec4 uTextureCarrySeam;
        uniform vec4 uTerrainGrade;
        uniform vec3 uTerrainGradeExtra;
        uniform vec4 uTerrainGradeShape;
        varying float vTerrainCarryDepth;
        ${TERRAIN_TEXTURE_CARRY_GLSL}
        ${CAUSTICS_GLSL}`,
      )
      // Applied at metalnessmap_fragment: every authored region writes its
      // albedo at color_fragment and its roughness at roughnessmap_fragment,
      // both of which run earlier, and physical lighting consumes them later.
      // So this is the one point where the grade sees each region's finished
      // surface and can still affect how it lights.
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        ${TERRAIN_GRADE_APPLY}`,
      )
      // Normal strength has to land after each region's own normal work, which
      // happens at normal_fragment_begin. Anchoring here — the last chunk
      // before physical lighting reads the normal — is the only place that is
      // reliably downstream of every region.
      // `nonPerturbedNormal` is three r182's name for the pre-normal-map
      // normal (older releases called it geometryNormal — using that name
      // fails to compile here, silently blanking every terrain material).
      .replace(
        '#include <lights_physical_fragment>',
        `normal = normalize(mix(nonPerturbedNormal, normal, uTerrainGradeExtra.z));
        #include <lights_physical_fragment>`,
      )
      .replace(
        '#include <opaque_fragment>',
        `${TERRAIN_TEXTURE_CARRY_APPLY}
        ${CAUSTICS_APPLY}
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () =>
    `${previousKey ? previousKey.call(material) : 'terrain-default'}|caustics-terrain-light-v3-texture-carry`;
  material.needsUpdate = true;
  return material;
}

const terrainMaterialCache = new Map();

function ensureTerrainApronDepthAttribute(geometry, value = -1) {
  if (!geometry || geometry.getAttribute('aApronDepth')) return geometry;
  geometry.setAttribute(
    'aApronDepth',
    new THREE.BufferAttribute(
      new Float32Array(geometry.getAttribute('position').count).fill(value),
      1,
    ),
  );
  return geometry;
}

// A destination shader is prepared before travel and then mounted here using
// this exact material object. Keeping one material per visited/prepared region
// lets Three reuse the linked GPU program instead of rebuilding the region's
// large authored shader while the island chart is on screen.
export function getTerrainRenderMaterial(regionId) {
  const cached = terrainMaterialCache.get(regionId);
  if (cached) return cached;
  const regionDefinition = getRegionDefinition(regionId);
  const config = getRegionTerrainConfig(regionId);
  const baseMaterial = regionDefinition?.createTerrainMaterial
    ? regionDefinition.createTerrainMaterial()
    : createPlaceholderPbrTerrainMaterial({ regionType: config.type });
  const material = injectTerrainRenderingExtensions(baseMaterial);
  terrainMaterialCache.set(regionId, material);
  return material;
}

export function Terrain({ segmentCap = null }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const { geometryEntry } = readTerrainResource(currentZoneId, segmentCap);
  const geometry = ensureTerrainApronDepthAttribute(geometryEntry.geometry);

  const material = useMemo(
    () => getTerrainRenderMaterial(currentZoneId),
    [currentZoneId],
  );

  // Drives the rhythmic swash line and the underwater caustics.
  useFrame(({ clock }) => {
    const shader = material.userData?.shader;
    if (!shader?.uniforms) return;
    if (shader.uniforms.uSwashTime) shader.uniforms.uSwashTime.value = clock.elapsedTime;
    if (shader.uniforms.uCausticsTime) {
      const store = useThreeGameStore.getState();
      const time = ((store.timeOfDay % 24) + 24) % 24;
      const rainWetness = weatherEnv.rainIntensity;
      const sky = skyState(time, store.day || 1);
      const lightRig = computeOutdoorLightRig({
        daylight: sky.daylight,
        golden: sky.golden,
        elevation: sky.elevation,
        overcast: weatherEnv.overcast,
        mist: weatherEnv.mistAmount,
        rain: rainWetness,
        lightDim: weatherEnv.lightDim,
        moonFraction: sky.moonlight,
        underwaterAmount: store.underwaterCamera?.amount || 0,
      });
      shader.uniforms.uCausticsTime.value = clock.elapsedTime;
      shader.uniforms.uCausticsStrength.value = sky.daylight * 0.5 * (1 - rainWetness * 0.85);
      if (shader.uniforms.uUnderwaterAmount) shader.uniforms.uUnderwaterAmount.value = store.underwaterCamera?.amount || 0;
      if (shader.uniforms.uRainWetness) shader.uniforms.uRainWetness.value = rainWetness;
      if (shader.uniforms.uTerrainSunDirection) shader.uniforms.uTerrainSunDirection.value.set(sky.sun[0], sky.sun[1], sky.sun[2]);
      if (shader.uniforms.uTerrainDaylight) shader.uniforms.uTerrainDaylight.value = sky.daylight;
      if (shader.uniforms.uTerrainGolden) shader.uniforms.uTerrainGolden.value = sky.golden;
      if (shader.uniforms.uTerrainHardSun) shader.uniforms.uTerrainHardSun.value = lightRig.hardSun;
      if (shader.uniforms.uTerrainWeatherSoftness) shader.uniforms.uTerrainWeatherSoftness.value = lightRig.weatherSoftness;
      if (shader.uniforms.uTerrainSunWarmth) shader.uniforms.uTerrainSunWarmth.value = lightRig.terrainSunWarmth;
      if (shader.uniforms.uTerrainCoolShade) shader.uniforms.uTerrainCoolShade.value = lightRig.terrainCoolShade;
      if (shader.uniforms.uTerrainGrade) {
        shader.uniforms.uTerrainGrade.value.set(
          terrainLookTuning.brightness,
          terrainLookTuning.saturation,
          terrainLookTuning.contrast,
          terrainLookTuning.warmth,
        );
      }
      if (shader.uniforms.uTerrainGradeExtra) {
        shader.uniforms.uTerrainGradeExtra.value.set(
          terrainLookTuning.macroVariation,
          terrainLookTuning.roughness,
          terrainLookTuning.normalStrength,
        );
      }
      if (shader.uniforms.uTerrainGradeShape) {
        shader.uniforms.uTerrainGradeShape.value.set(
          terrainLookTuning.slopeTint,
          terrainLookTuning.heightTint,
          terrainLookTuning.distanceFade,
          terrainLookTuning.detailTiling,
        );
      }
      if (shader.uniforms.uTerrainWetShine) {
        // The shore-wet glint band is tuned for surf beaches (~1-2 m of wet
        // sand). On gently-sloped inland banks the same vertical band spans
        // metres of ground and reads as glare, so damp it there.
        const inlandBank = store.currentZoneId === 'WATKINS' ? 0.3 : 1;
        shader.uniforms.uTerrainWetShine.value = lightRig.terrainWetShine * inlandBank;
      }
    }
  });

  return (
    <group userData={{
      renderSource: `terrain:${currentZoneId}`,
      renderLabel: `${currentZoneId} terrain`,
      renderKind: 'terrain',
      renderPath: null,
    }}>
      {/* The heightfield crosses the water plane and surrounds the camera. A
          planar mirror camera sees its clipped underside/outer edge as a huge
          dark silhouette, which ripple distortion turns into an animated
          black band. Keep planar reflections for ships and authored objects;
          the water's analytic sky/sun reflection supplies the broad terrain
          sheen without putting this plane-intersecting mesh in the mirror. */}
      <mesh geometry={geometry} material={material} receiveShadow userData={{
        noReflect: true,
        renderSource: `terrain:${currentZoneId}:heightfield`,
        renderLabel: `${currentZoneId} terrain heightfield`,
        renderKind: 'terrain',
        renderPath: null,
      }} />
      <Suspense fallback={<ContinuationTerrainSkirts regionId={currentZoneId} material={material} />}>
        <NeighborCarryStrips regionId={currentZoneId} material={material} />
      </Suspense>
    </group>
  );
}

// Renders the near band of each border apron (map edge out to the transition
// carry distance) with the region's own terrain material. The splat shaders
// color by world position, so the off-map strip shades pixel-identically to
// the walkable mesh and the map edge stops reading as a material seam. The
// far side of each strip is the vista mesh in BorderVistas, which shares the
// strip's seam-ring vertices.
function NeighborCarryStrips({ regionId, material }) {
  useSyncExternalStore(
    subscribeCentralPeakDev,
    getCentralPeakDevRevision,
    getCentralPeakDevRevision,
  );
  useSyncExternalStore(
    subscribeDistanceScenery,
    getDistanceSceneryRevision,
    getDistanceSceneryRevision,
  );
  const borderResource = readBorderVistaResource(regionId);
  const carryStrips = useMemo(() => borderResource.entries
    .filter(entry => entry.carry)
    .map(entry => ({ id: entry.vistaId, edge: entry.edge, geometry: entry.carry })), [borderResource]);
  const carryEdges = useMemo(() => carryStrips.map(strip => strip.edge), [carryStrips]);
  if (
    !centralPeakDev.neighborApronVisible
    || distanceSceneryRuntime.mode === 'shell'
  ) {
    return <ContinuationTerrainSkirts regionId={regionId} material={material} />;
  }
  return (
    <>
      {carryStrips.map(strip => (
        <mesh
          key={strip.id}
          geometry={strip.geometry}
          material={material}
          receiveShadow={false}
          userData={{
            renderSource: `terrain:${regionId}:carry-strip:${strip.edge}`,
            renderLabel: `${regionId} ${strip.edge} carry strip`,
            renderKind: 'terrain-carry-strip',
            renderPath: null,
          }}
        />
      ))}
      <ContinuationTerrainSkirts regionId={regionId} material={material} excludeEdges={carryEdges} />
    </>
  );
}

function buildSkirtGeometry(regionId, excludeEdges = []) {
  const config = getRegionTerrainConfig(regionId);
  const openHints = getRegionEdgeHints(regionId).filter(hint => hint.kind === 'open');
  const stripDepth = 12;
  const steps = 26;
  const rows = 4;
  const positions = [];
  const colors = [];
  const indices = [];
  const addVertex = (x, z, fade) => {
    const sampleX = THREE.MathUtils.clamp(x, -config.width / 2, config.width / 2);
    const sampleZ = THREE.MathUtils.clamp(z, -config.depth / 2, config.depth / 2);
    const edgeY = terrainHeight(sampleX, sampleZ, regionId);
    const y = edgeY - fade * fade * 1.15;
    const color = terrainColor(sampleX, sampleZ, edgeY, regionId).multiplyScalar(1 - fade * 0.16);
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  };
  const addStrip = edge => {
    const startIndex = positions.length / 3;
    const alongX = edge === 'north' || edge === 'south';
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const xBase = -config.width / 2 + t * config.width;
      const zBase = -config.depth / 2 + t * config.depth;
      for (let j = 0; j <= rows; j += 1) {
        const fade = j / rows;
        if (alongX) {
          const z = edge === 'north' ? -config.depth / 2 - stripDepth * fade : config.depth / 2 + stripDepth * fade;
          addVertex(xBase, z, fade);
        } else {
          const x = edge === 'west' ? -config.width / 2 - stripDepth * fade : config.width / 2 + stripDepth * fade;
          addVertex(x, zBase, fade);
        }
      }
    }
    for (let i = 0; i < steps; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const stride = rows + 1;
        const a = startIndex + i * stride + j;
        indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
  };
  const addCorner = edge => {
    const startIndex = positions.length / 3;
    const east = edge.includes('east');
    const south = edge.includes('south');
    const baseX = east ? config.width / 2 : -config.width / 2;
    const baseZ = south ? config.depth / 2 : -config.depth / 2;
    for (let iz = 0; iz <= rows; iz += 1) {
      for (let ix = 0; ix <= rows; ix += 1) {
        const fx = ix / rows;
        const fz = iz / rows;
        const x = baseX + (east ? 1 : -1) * stripDepth * fx;
        const z = baseZ + (south ? 1 : -1) * stripDepth * fz;
        addVertex(x, z, Math.max(fx, fz));
      }
    }
    const stride = rows + 1;
    for (let iz = 0; iz < rows; iz += 1) {
      for (let ix = 0; ix < rows; ix += 1) {
        const a = startIndex + iz * stride + ix;
        indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
  };
  openHints
    .filter(hint => ['north', 'south', 'east', 'west'].includes(hint.edge))
    .filter(hint => !excludeEdges.includes(hint.edge))
    .forEach(hint => addStrip(hint.edge));
  openHints
    .filter(hint => ['northeast', 'northwest', 'southeast', 'southwest'].includes(hint.edge))
    .forEach(hint => addCorner(hint.edge));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute(
    'aApronDepth',
    new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3).fill(-1), 1),
  );
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function ContinuationTerrainSkirts({ regionId, material, excludeEdges = [] }) {
  const geometry = useMemo(() => buildSkirtGeometry(regionId, excludeEdges), [regionId, excludeEdges]);
  if (!geometry.attributes.position?.count) return null;
  // Short edge fade only. Neighboring-map topography lives in BorderVistas as
  // opaque terrain aprons; do not use these skirts as distant scenery.
  return <mesh geometry={geometry} material={material} receiveShadow={false} userData={{
    renderSource: `terrain:${regionId}:skirts`,
    renderLabel: `${regionId} terrain skirts`,
    renderKind: 'terrain-skirt',
    renderPath: null,
  }} />;
}
