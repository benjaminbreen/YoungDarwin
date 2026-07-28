import * as THREE from 'three';
import {
  disposePackedPbrTerrainSet,
  FLOREANA_PBR_TEXTURES,
  loadPackedPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

// Wetlands Forest layered terrain material.
//
// Layer roles: verdant grass carries the open meadow, loam takes over under
// the forest canopy and fern benches, brackish mud owns the lagoon apron and
// the shader-only wet pools, and red cinder dirt marks the trail spine and
// the abandoned farm terrace.
//
// The mask functions below mirror three-game/world/regions/southernWetlands/
// terrain.js. Geometry-driven masks (trail, pools, lagoon, farm plot, fall
// line) must stay numerically identical to the JS; noise modulation may use
// this shader's own value noise, matching how other regions handle it.

const LAYERS = {
  grass: FLOREANA_PBR_TEXTURES.grass,
  loam: FLOREANA_PBR_TEXTURES.loam,
  mud: FLOREANA_PBR_TEXTURES.brackishMud,
  cinder: FLOREANA_PBR_TEXTURES.redCinderDirt,
};

// grass/loam/cinder have no authored roughnessMin/Max in the registry; these
// intervals keep the matte-vegetation floor (>= 0.55 rule) while letting the
// mud layer keep its authored, deliberately glossier range.
const ROUGHNESS = {
  grass: [0.84, 0.97],
  loam: [0.7, 0.94],
  mud: [LAYERS.mud.roughnessMin, LAYERS.mud.roughnessMax],
  cinder: [0.72, 0.94],
};

function f(value) {
  return Number(value).toFixed(3);
}

function fragmentCommon() {
  return /* glsl */`
        uniform sampler2D uSwGrassAlbedo;
        uniform sampler2D uSwGrassNrh;
        uniform sampler2D uSwLoamAlbedo;
        uniform sampler2D uSwLoamNrh;
        uniform sampler2D uSwMudAlbedo;
        uniform sampler2D uSwMudNrh;
        uniform sampler2D uSwCinderAlbedo;
        uniform sampler2D uSwCinderNrh;
        varying vec3 vWetlandsWorld;

        vec2 swGrassUv;
        vec2 swLoamUv;
        vec2 swMudUv;
        vec2 swCinderUv;
        vec4 swPbrWeights;
        vec4 swGrassNrhValue;
        vec4 swLoamNrhValue;
        vec4 swMudNrhValue;
        vec4 swCinderNrhValue;
        float swSurfaceWetness;

        float swHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float swNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 q = fract(p);
          vec2 u = q * q * (3.0 - 2.0 * q);
          return mix(
            mix(swHash(i), swHash(i + vec2(1.0, 0.0)), u.x),
            mix(swHash(i + vec2(0.0, 1.0)), swHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float swSegmentDistance(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
          return length(p - (a + ab * t));
        }
        float swTrailDistance(vec2 p) {
          float d = swSegmentDistance(p, vec2(18.0, -49.0), vec2(13.0, -37.0));
          d = min(d, swSegmentDistance(p, vec2(13.0, -37.0), vec2(6.0, -26.0)));
          d = min(d, swSegmentDistance(p, vec2(6.0, -26.0), vec2(10.0, -14.0)));
          d = min(d, swSegmentDistance(p, vec2(10.0, -14.0), vec2(2.0, -3.0)));
          d = min(d, swSegmentDistance(p, vec2(2.0, -3.0), vec2(-7.0, 8.0)));
          d = min(d, swSegmentDistance(p, vec2(-7.0, 8.0), vec2(0.0, 18.0)));
          d = min(d, swSegmentDistance(p, vec2(0.0, 18.0), vec2(12.0, 24.0)));
          d = min(d, swSegmentDistance(p, vec2(12.0, 24.0), vec2(28.0, 21.0)));
          d = min(d, swSegmentDistance(p, vec2(28.0, 21.0), vec2(42.0, 16.0)));
          d = min(d, swSegmentDistance(p, vec2(42.0, 16.0), vec2(56.0, 12.0)));
          d = min(d, swSegmentDistance(p, vec2(-7.0, 8.0), vec2(-22.0, 5.0)));
          d = min(d, swSegmentDistance(p, vec2(-22.0, 5.0), vec2(-38.0, 2.0)));
          d = min(d, swSegmentDistance(p, vec2(-38.0, 2.0), vec2(-56.0, 0.0)));
          return d;
        }
        float swBlob(vec2 p, vec2 center, vec2 radii, float strength) {
          vec2 q = (p - center) / radii;
          return exp(-dot(q, q) * 2.25) * strength;
        }
        float swPoolMask(vec2 p) {
          float v = swBlob(p, vec2(30.0, 34.0), vec2(8.0, 5.5), 0.85);
          v = max(v, swBlob(p, vec2(40.0, 4.0), vec2(7.0, 5.0), 0.7));
          v = max(v, swBlob(p, vec2(14.0, 40.0), vec2(7.0, 5.0), 0.75));
          v = max(v, swBlob(p, vec2(-34.0, 26.0), vec2(8.0, 6.0), 0.8));
          v = max(v, swBlob(p, vec2(16.0, -30.0), vec2(6.0, 4.5), 0.55));
          return clamp(v, 0.0, 1.0);
        }
        float swLagoonField(vec2 p) {
          float v = swBlob(p, vec2(-12.0, 30.0), vec2(13.0, 8.0), 1.0);
          v = max(v, swBlob(p, vec2(0.0, 39.0), vec2(9.0, 6.0), 0.88));
          v = max(v, swBlob(p, vec2(-26.0, 36.0), vec2(8.0, 5.5), 0.7));
          return clamp(v, 0.0, 1.0);
        }
        float swFarmMask(vec2 p) {
          vec2 uv = abs(p - vec2(-18.0, -2.0)) / vec2(7.5, 6.5);
          return 1.0 - smoothstep(0.82, 1.12, max(uv.x, uv.y));
        }
        float swFallLine(vec2 p) {
          return clamp((p.x / 56.0) * 0.55 + (p.y / 49.0), -1.55, 1.55);
        }
        float swForestWall(vec2 p, float trail) {
          float edge = max(abs(p.x) / 56.0, abs(p.y) / 49.0);
          float edgeWall = smoothstep(0.78, 0.96, edge);
          float upWall = 1.0 - smoothstep(-1.2, -0.1, swFallLine(p));
          float wallNoise = 0.78 + (swNoise(p * 0.31 + vec2(11.0, -7.0)) - 0.5) * 0.52;
          float open = (1.0 - trail * 0.86)
            * (1.0 - swPoolMask(p) * 0.8)
            * (1.0 - smoothstep(0.1, 0.4, swLagoonField(p)))
            * (1.0 - swFarmMask(p));
          return clamp(max(edgeWall, upWall * 0.82) * wallNoise * open, 0.0, 1.0);
        }
        vec4 swLayerWeights(vec2 p) {
          float trailDistance = swTrailDistance(p)
            + (swNoise(p * 0.6 + vec2(-3.0, 8.0)) - 0.5) * 0.8;
          float trailCore = 1.0 - smoothstep(1.3, 5.2, trailDistance);
          float trailBlend = 1.0 - smoothstep(1.4, 7.4, trailDistance);

          float pool = swPoolMask(p);
          float poolCore = smoothstep(0.3, 0.75, pool);
          float lagoon = swLagoonField(p);
          float apron = smoothstep(0.12, 0.3, lagoon) * (1.0 - smoothstep(0.34, 0.62, lagoon));
          float bed = smoothstep(0.3, 0.6, lagoon);
          float mudWeight = clamp(apron * 1.1 + max(poolCore, bed), 0.0, 1.0);

          float farm = swFarmMask(p);
          float cinderWeight = clamp(trailCore + farm * 0.5, 0.0, 1.0) * (1.0 - mudWeight * 0.92);

          float wall = swForestWall(p, trailBlend);
          float fern = max(trailBlend * 0.5, apron * 0.7);
          float canopyTone = swNoise(p * 0.09 + vec2(5.0, -13.0));
          float loamWeight = clamp(wall * 0.68 + fern * 0.3 + canopyTone * 0.14, 0.0, 1.0)
            * (1.0 - mudWeight * 0.9)
            * (1.0 - cinderWeight * 0.85);

          float grassWeight = max(0.0, 1.0 - mudWeight - cinderWeight - loamWeight);
          vec4 weights = vec4(grassWeight, loamWeight, mudWeight, cinderWeight);
          return weights / max(dot(weights, vec4(1.0)), 0.0001);
        }
        vec2 swNormalSlope(vec4 nrhValue, float strength) {
          vec2 xy = nrhValue.rg * 2.0 - 1.0;
          float z = sqrt(max(1.0 - min(dot(xy, xy), 0.98), 0.02));
          return (xy / max(z, 0.18)) * strength;
        }`;
}

function colorFragment() {
  return /* glsl */`
        vec2 swPosition = vWetlandsWorld.xz;
        swGrassUv = swPosition * ${f(LAYERS.grass.scale)} + vec2(0.17, -0.11);
        swLoamUv = swPosition * ${f(LAYERS.loam.scale)} + vec2(-0.27, 0.21);
        swMudUv = swPosition * ${f(LAYERS.mud.scale)} + vec2(0.09, 0.33);
        swCinderUv = swPosition * ${f(LAYERS.cinder.scale)} + vec2(-0.13, -0.23);

        swGrassNrhValue = texture2D(uSwGrassNrh, swGrassUv);
        swLoamNrhValue = texture2D(uSwLoamNrh, swLoamUv);
        swMudNrhValue = texture2D(uSwMudNrh, swMudUv);
        swCinderNrhValue = texture2D(uSwCinderNrh, swCinderUv);
        swPbrWeights = swLayerWeights(swPosition);
        vec4 swHeightBias = mix(
          vec4(0.94),
          vec4(1.06),
          vec4(swGrassNrhValue.a, swLoamNrhValue.a, swMudNrhValue.a, swCinderNrhValue.a)
        );
        swPbrWeights *= swHeightBias;
        swPbrWeights /= max(dot(swPbrWeights, vec4(1.0)), 0.0001);

        // Albedos are sRGB textures; three already returns linear values here.
        vec3 swGrassColor = texture2D(uSwGrassAlbedo, swGrassUv).rgb * vec3(1.0, 1.12, 0.88);
        vec3 swLoamColor = texture2D(uSwLoamAlbedo, swLoamUv).rgb * vec3(0.92, 0.94, 0.84);
        vec3 swMudColor = texture2D(uSwMudAlbedo, swMudUv).rgb * vec3(0.86, 0.88, 0.78);
        vec3 swCinderColor = texture2D(uSwCinderAlbedo, swCinderUv).rgb * vec3(0.96, 0.9, 0.84);
        vec3 swColor = swGrassColor * swPbrWeights.x
          + swLoamColor * swPbrWeights.y
          + swMudColor * swPbrWeights.z
          + swCinderColor * swPbrWeights.w;

        // Verdant grading: broad meadow tone variation, deeper green under
        // the canopy, all kept subtle.
        float swMacro = swNoise(swPosition * 0.045 + vec2(9.0, -3.0));
        float swMeadowTone = swNoise(swPosition * 0.1 + vec2(-8.0, 6.0));
        vec3 swLushGreen = mix(vec3(0.86, 1.02, 0.72), vec3(0.7, 0.94, 0.62), swMeadowTone);
        swColor *= mix(vec3(1.0), swLushGreen, swPbrWeights.x * 0.22);
        float swCanopyShade = swForestWall(swPosition, 1.0 - smoothstep(1.4, 7.4, swTrailDistance(swPosition)));
        swColor *= mix(1.0, 0.86, swCanopyShade * 0.55);
        swColor *= mix(0.94, 1.06, swMacro);

        // Wetness: lagoon apron + bed, wet pools, and a damp trail margin
        // where the path crosses the lowland.
        float swLagoon = swLagoonField(swPosition);
        float swPool = swPoolMask(swPosition);
        float swWetBand = smoothstep(0.25, 0.55, swLagoon);
        float swApronWet = smoothstep(0.12, 0.3, swLagoon) * (1.0 - smoothstep(0.34, 0.62, swLagoon));
        swSurfaceWetness = clamp(
          swWetBand + swApronWet * 0.9 + smoothstep(0.3, 0.75, swPool) * 0.85,
          0.0,
          1.0
        );
        swColor = mix(swColor, swColor * vec3(0.62, 0.68, 0.6), swSurfaceWetness * 0.48);

        // Submerged lagoon bed tint keeps the floor reading through the
        // low-alpha water surface.
        float swBed = smoothstep(0.34, 0.66, swLagoon);
        vec3 swBedTint = mix(vec3(0.24, 0.33, 0.27), vec3(0.18, 0.27, 0.23), swBed);
        swColor = mix(swColor, swBedTint, swBed * 0.42);
        diffuseColor.rgb = clamp(swColor, 0.0, 1.0);`;
}

function roughnessFragment() {
  return /* glsl */`
        float swGrassRoughness = mix(${f(ROUGHNESS.grass[0])}, ${f(ROUGHNESS.grass[1])}, swGrassNrhValue.b);
        float swLoamRoughness = mix(${f(ROUGHNESS.loam[0])}, ${f(ROUGHNESS.loam[1])}, swLoamNrhValue.b);
        float swMudRoughness = mix(${f(ROUGHNESS.mud[0])}, ${f(ROUGHNESS.mud[1])}, swMudNrhValue.b);
        float swCinderRoughness = mix(${f(ROUGHNESS.cinder[0])}, ${f(ROUGHNESS.cinder[1])}, swCinderNrhValue.b);
        float swMappedRoughness = dot(
          swPbrWeights,
          vec4(swGrassRoughness, swLoamRoughness, swMudRoughness, swCinderRoughness)
        );
        // Wet ground drops toward a sheen but keeps a swampy matte floor:
        // this is standing bog, not a mirror.
        swMappedRoughness = mix(swMappedRoughness, max(0.45, swMappedRoughness - 0.22), swSurfaceWetness);
        roughnessFactor = mix(roughnessFactor, swMappedRoughness, 0.95);`;
}

function normalFragment() {
  return /* glsl */`
        vec2 swGrassSlope = swNormalSlope(swGrassNrhValue, ${f(LAYERS.grass.normalStrength)});
        vec2 swLoamSlope = swNormalSlope(swLoamNrhValue, ${f(LAYERS.loam.normalStrength)});
        vec2 swMudSlope = swNormalSlope(swMudNrhValue, ${f(LAYERS.mud.normalStrength)});
        vec2 swCinderSlope = swNormalSlope(swCinderNrhValue, ${f(LAYERS.cinder.normalStrength)});
        vec2 swMappedSlope = swGrassSlope * swPbrWeights.x
          + swLoamSlope * swPbrWeights.y
          + swMudSlope * swPbrWeights.z
          + swCinderSlope * swPbrWeights.w;
        swMappedSlope *= mix(1.0, 0.74, swSurfaceWetness);

        vec3 swWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 swWorldX = normalize(vec3(1.0, 0.0, 0.0) - swWorldNormal * swWorldNormal.x);
        vec3 swWorldZ = normalize(cross(swWorldX, swWorldNormal));
        vec3 swMappedWorldNormal = normalize(
          swWorldNormal + swWorldX * swMappedSlope.x + swWorldZ * swMappedSlope.y
        );
        normal = normalize(mat3(viewMatrix) * swMappedWorldNormal);`;
}

export function createSouthernWetlandsTerrainMaterial() {
  const packedLayers = Object.fromEntries(
    Object.entries(LAYERS).map(([name, layer]) => [name, loadPackedPbrTerrainSet(layer)]),
  );
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    Object.values(packedLayers).forEach(disposePackedPbrTerrainSet);
  });

  material.onBeforeCompile = shader => {
    for (const [name, layer] of Object.entries(packedLayers)) {
      const title = name[0].toUpperCase() + name.slice(1);
      shader.uniforms[`uSw${title}Albedo`] = { value: layer.albedo };
      shader.uniforms[`uSw${title}Nrh`] = { value: layer.nrh };
    }
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWetlandsWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWetlandsWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${fragmentCommon()}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${colorFragment()}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
${roughnessFragment()}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
${normalFragment()}`,
      );
  };

  material.customProgramCacheKey = () => 'southern-wetlands-layered-pbr-v1';
  material.needsUpdate = true;
  return material;
}
