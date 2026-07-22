import * as THREE from 'three';
import {
  createStandardFootPathSplatTexture,
  standardFootPathSplatGLSL,
  standardFootPathSplatUniforms,
} from '../../paths/standardPath';
import {
  FLOREANA_PBR_TEXTURES,
  disposePackedPbrTerrainSet,
  loadPackedPbrTerrainSet,
} from '../materials/pbrTerrainTextures';
import { LAVA_FLATS_PATH_POINTS } from './path';

const LAVA_FLATS_SPLAT_BOUNDS = {
  originX: -56,
  originZ: -52,
  width: 112,
  depth: 104,
  size: 512,
};

const LF_COMMON = /* glsl */`
        uniform sampler2D uLfDarkAlbedo;
        uniform sampler2D uLfDarkNrh;
        uniform sampler2D uLfWeatheredAlbedo;
        uniform sampler2D uLfWeatheredNrh;
        uniform sampler2D uLfScoriaAlbedo;
        uniform sampler2D uLfScoriaNrh;
        varying vec3 vLfWorld;

        ${standardFootPathSplatGLSL({
          functionName: 'lfPathSplat',
          textureUniform: 'uLfPathSplat',
          boundsUniform: 'uLfPathSplatBounds',
        })}

        float lfHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float lfNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 q = fract(p);
          vec2 u = q * q * (3.0 - 2.0 * q);
          return mix(
            mix(lfHash(i), lfHash(i + vec2(1.0, 0.0)), u.x),
            mix(lfHash(i + vec2(0.0, 1.0)), lfHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float lfFbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int octave = 0; octave < 4; octave++) {
            value += lfNoise(p) * amplitude;
            p = mat2(1.72, -0.91, 0.91, 1.72) * p + vec2(4.2, -3.1);
            amplitude *= 0.52;
          }
          return value;
        }
        vec2 lfRotate(vec2 p, float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return mat2(c, -s, s, c) * p;
        }
        float lfSegmentDistance(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
          return length(p - (a + ab * t));
        }
        float lfScoriaMask(vec2 p) {
          float d = 999.0;
          d = min(d, lfSegmentDistance(p, vec2(-52.0, 24.0), vec2(-31.0, 18.0)) / 4.8);
          d = min(d, lfSegmentDistance(p, vec2(-31.0, 18.0), vec2(-10.0, 10.0)) / 5.5);
          d = min(d, lfSegmentDistance(p, vec2(-10.0, 10.0), vec2(12.0, 1.0)) / 5.9);
          d = min(d, lfSegmentDistance(p, vec2(12.0, 1.0), vec2(35.0, -12.0)) / 5.4);
          d = min(d, lfSegmentDistance(p, vec2(35.0, -12.0), vec2(53.0, -20.0)) / 4.4);
          float band = 1.0 - smoothstep(0.68, 1.12, d);
          float southeast = exp(-(pow((p.x - 29.0) / 11.0, 2.0) + pow((p.y - 24.0) / 8.0, 2.0)));
          float northwest = exp(-(pow((p.x + 38.0) / 10.0, 2.0) + pow((p.y + 28.0) / 7.0, 2.0))) * 0.7;
          float breakup = mix(0.78, 1.08, lfFbm(p * 0.28 + vec2(7.0, -11.0)));
          return clamp(max(band, max(southeast, northwest)) * breakup, 0.0, 1.0);
        }
        float lfFlowAge(vec2 p) {
          float west = exp(-(pow((p.x + 26.0) / 22.0, 2.0) + pow((p.y - 2.0) / 48.0, 2.0)));
          float east = exp(-(pow((p.x - 25.0) / 18.0, 2.0) + pow((p.y + 1.0) / 47.0, 2.0)));
          float broad = lfFbm(p * 0.075 + vec2(-4.0, 9.0));
          float oldFlow = smoothstep(0.42, 0.76, lfFbm(lfRotate(p, 0.31) * 0.052 + vec2(8.0, -6.0)));
          return clamp(0.08 + max(west, east) * 0.34 + broad * 0.14 + oldFlow * 0.12 + smoothstep(6.0, 48.0, p.y) * 0.07, 0.0, 0.68);
        }
        float lfTubeBowl(vec2 p) {
          float d = length((p - vec2(14.5, 6.5)) / vec2(10.6, 6.2));
          return 1.0 - smoothstep(0.16, 0.96, d);
        }
        float lfCrackMask(vec2 p) {
          float contourA = abs(lfFbm(p * 0.24 + vec2(2.0, -7.0)) - 0.5);
          float contourB = abs(lfFbm(lfRotate(p, 0.68) * 0.19 + vec2(-5.0, 3.0)) - 0.48);
          float seams = max(1.0 - smoothstep(0.025, 0.082, contourA), 1.0 - smoothstep(0.018, 0.065, contourB) * 0.62);
          return seams;
        }
        vec3 lfLayerWeights(vec2 p) {
          vec4 path = lfPathSplat(p);
          float scoria = lfScoriaMask(p) * 0.42;
          float weathered = lfFlowAge(p) * (1.0 - scoria * 0.44);
          weathered = clamp(weathered + path.r * 0.08 + path.a * 0.05, 0.0, 0.68);
          scoria = clamp(scoria + path.g * 0.06, 0.0, 0.48);
          float dark = max(0.0, 1.0 - weathered - scoria);
          vec3 weights = vec3(dark, weathered, scoria);
          return weights / max(dot(weights, vec3(1.0)), 0.0001);
        }
        vec3 lfAlbedoPair(sampler2D textureMap, vec2 uv, float angle, float secondaryScale) {
          vec2 warp = vec2(
            lfNoise(uv * 0.12 + vec2(6.0, -4.0)),
            lfNoise(uv * 0.12 + vec2(-3.0, 8.0))
          ) - 0.5;
          vec2 primaryUv = uv + warp * 0.28;
          vec2 secondaryUv = lfRotate(uv + warp * 0.17, angle) * secondaryScale + vec2(0.31, -0.19);
          float broadMix = lfNoise(uv * 0.34 + vec2(angle * 1.7, secondaryScale * 2.3));
          vec3 a = texture2D(textureMap, primaryUv).rgb;
          vec3 b = texture2D(textureMap, secondaryUv).rgb;
          return mix(a, b, 0.16 + broadMix * 0.28);
        }
        vec2 lfPackedNormalSlope(vec4 nrh, float strength) {
          vec2 xy = nrh.rg * 2.0 - 1.0;
          float z = sqrt(max(1.0 - min(dot(xy, xy), 0.98), 0.02));
          return (xy / max(z, 0.18)) * strength;
        }
`;

export function createLavaFlatsTerrainMaterial() {
  const dark = loadPackedPbrTerrainSet(FLOREANA_PBR_TEXTURES.darkBasaltGravel);
  const weathered = loadPackedPbrTerrainSet(FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt);
  const scoria = loadPackedPbrTerrainSet(FLOREANA_PBR_TEXTURES.oxidizedScoriaceousBasalt);
  const pathSplat = createStandardFootPathSplatTexture({
    pathPoints: LAVA_FLATS_PATH_POINTS,
    bounds: LAVA_FLATS_SPLAT_BOUNDS,
    size: LAVA_FLATS_SPLAT_BOUNDS.size,
    minimumWidth: 1.28,
  });
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });
  material.envMapIntensity = 0.46;

  material.addEventListener('dispose', () => {
    pathSplat.dispose();
    disposePackedPbrTerrainSet(dark);
    disposePackedPbrTerrainSet(weathered);
    disposePackedPbrTerrainSet(scoria);
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplat, {
      bounds: LAVA_FLATS_SPLAT_BOUNDS,
      textureUniform: 'uLfPathSplat',
      boundsUniform: 'uLfPathSplatBounds',
    }));
    shader.uniforms.uLfDarkAlbedo = { value: dark.albedo };
    shader.uniforms.uLfDarkNrh = { value: dark.nrh };
    shader.uniforms.uLfWeatheredAlbedo = { value: weathered.albedo };
    shader.uniforms.uLfWeatheredNrh = { value: weathered.nrh };
    shader.uniforms.uLfScoriaAlbedo = { value: scoria.albedo };
    shader.uniforms.uLfScoriaNrh = { value: scoria.nrh };
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLfWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${LF_COMMON}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 lfP = vLfWorld.xz;
        vec2 lfDarkUv = lfP * ${FLOREANA_PBR_TEXTURES.darkBasaltGravel.scale.toFixed(3)} + vec2(0.17, -0.31);
        vec2 lfWeatheredUv = lfRotate(lfP, -0.19) * ${FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt.scale.toFixed(3)} + vec2(-0.23, 0.11);
        vec2 lfScoriaUv = lfRotate(lfP, 0.34) * ${FLOREANA_PBR_TEXTURES.oxidizedScoriaceousBasalt.scale.toFixed(3)} + vec2(0.29, 0.37);
        vec3 lfWeights = lfLayerWeights(lfP);
        vec4 lfDarkSurface = texture2D(uLfDarkNrh, lfDarkUv);
        vec4 lfWeatheredSurface = texture2D(uLfWeatheredNrh, lfWeatheredUv);
        vec4 lfScoriaSurface = texture2D(uLfScoriaNrh, lfScoriaUv);
        vec3 lfDark = lfAlbedoPair(uLfDarkAlbedo, lfDarkUv, 0.73, 0.55) * vec3(0.51, 0.52, 0.47);
        vec3 lfWeathered = lfAlbedoPair(uLfWeatheredAlbedo, lfWeatheredUv, -0.61, 0.57) * vec3(0.58, 0.54, 0.47);
        vec3 lfScoriaRaw = lfAlbedoPair(uLfScoriaAlbedo, lfScoriaUv, 0.52, 0.56) * vec3(0.5, 0.4, 0.33);
        vec3 lfScoria = mix(lfDark * 0.98, lfScoriaRaw, 0.62);
        vec3 lfColor = lfDark * lfWeights.x + lfWeathered * lfWeights.y + lfScoria * lfWeights.z;
        float lfRelief = dot(lfWeights, vec3(lfDarkSurface.a, lfWeatheredSurface.a, lfScoriaSurface.a));
        float lfCavity = 1.0 - smoothstep(0.12, 0.5, lfRelief);
        lfColor *= mix(0.93, 1.055, smoothstep(0.08, 0.9, lfRelief));
        lfColor *= 1.0 - lfCavity * 0.045;
        vec4 lfPath = lfPathSplat(lfP);
        vec3 lfTrailDust = mix(vec3(0.2, 0.15, 0.11), vec3(0.31, 0.23, 0.16), lfFbm(lfP * 0.46 + vec2(9.0, -4.0)));
        lfColor = mix(lfColor, lfTrailDust, clamp(lfPath.r * 0.25 + lfPath.g * 0.14, 0.0, 0.34));
        float lfMacro = lfFbm(lfP * 0.042 + vec2(7.0, -5.0));
        float lfFlowTone = lfFbm(lfRotate(lfP, 0.47) * 0.083 + vec2(-8.0, 3.0));
        float lfFine = lfFbm(lfP * 0.7 + vec2(-3.0, 11.0));
        float lfCracks = lfCrackMask(lfP);
        float lfBowl = lfTubeBowl(lfP);
        lfColor *= mix(0.72, 1.055, lfMacro);
        lfColor = mix(lfColor, lfColor * vec3(0.78, 0.68, 0.61), smoothstep(0.5, 0.78, lfFlowTone) * 0.22);
        lfColor *= mix(0.965, 1.025, lfFine);
        lfColor *= 1.0 - lfCracks * (0.1 + lfScoriaMask(lfP) * 0.045);
        lfColor = mix(lfColor, lfColor * vec3(0.58, 0.62, 0.59), lfBowl * 0.26);
        vec3 lfVertexGuide = clamp(diffuseColor.rgb * 1.2, vec3(0.74), vec3(1.12));
        lfColor *= mix(vec3(1.0), lfVertexGuide, 0.1);
        diffuseColor.rgb = clamp(lfColor, 0.0, 1.0);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec2 lfRoughP = vLfWorld.xz;
        vec2 lfRoughDarkUv = lfRoughP * ${FLOREANA_PBR_TEXTURES.darkBasaltGravel.scale.toFixed(3)} + vec2(0.17, -0.31);
        vec2 lfRoughWeatheredUv = lfRotate(lfRoughP, -0.19) * ${FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt.scale.toFixed(3)} + vec2(-0.23, 0.11);
        vec2 lfRoughScoriaUv = lfRotate(lfRoughP, 0.34) * ${FLOREANA_PBR_TEXTURES.oxidizedScoriaceousBasalt.scale.toFixed(3)} + vec2(0.29, 0.37);
        vec3 lfRoughWeights = lfLayerWeights(lfRoughP);
        float lfDarkRough = mix(0.79, 0.94, texture2D(uLfDarkNrh, lfRoughDarkUv).b);
        float lfWeatheredRough = mix(0.87, 0.985, texture2D(uLfWeatheredNrh, lfRoughWeatheredUv).b);
        float lfScoriaRough = mix(0.9, 0.995, texture2D(uLfScoriaNrh, lfRoughScoriaUv).b);
        float lfMappedRoughness = dot(lfRoughWeights, vec3(lfDarkRough, lfWeatheredRough, lfScoriaRough));
        vec4 lfRoughPath = lfPathSplat(lfRoughP);
        lfMappedRoughness = mix(lfMappedRoughness, 0.965, lfRoughPath.r * 0.35);
        roughnessFactor = mix(roughnessFactor, lfMappedRoughness, 0.96);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec2 lfNormalP = vLfWorld.xz;
        vec2 lfNormalDarkUv = lfNormalP * ${FLOREANA_PBR_TEXTURES.darkBasaltGravel.scale.toFixed(3)} + vec2(0.17, -0.31);
        vec2 lfNormalWeatheredUv = lfRotate(lfNormalP, -0.19) * ${FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt.scale.toFixed(3)} + vec2(-0.23, 0.11);
        vec2 lfNormalScoriaUv = lfRotate(lfNormalP, 0.34) * ${FLOREANA_PBR_TEXTURES.oxidizedScoriaceousBasalt.scale.toFixed(3)} + vec2(0.29, 0.37);
        vec3 lfNormalWeights = lfLayerWeights(lfNormalP);
        vec4 lfDarkNrh = texture2D(uLfDarkNrh, lfNormalDarkUv);
        vec2 lfDarkSlope = lfPackedNormalSlope(lfDarkNrh, 0.68);
        vec2 lfWeatheredSlope = lfPackedNormalSlope(texture2D(uLfWeatheredNrh, lfNormalWeatheredUv), 0.92);
        vec2 lfScoriaSlope = lfPackedNormalSlope(texture2D(uLfScoriaNrh, lfNormalScoriaUv), 0.78);
        vec2 lfSlope = lfDarkSlope * lfNormalWeights.x + lfWeatheredSlope * lfNormalWeights.y + lfScoriaSlope * lfNormalWeights.z;
        vec3 lfWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 lfWorldX = normalize(vec3(1.0, 0.0, 0.0) - lfWorldNormal * lfWorldNormal.x);
        vec3 lfWorldZ = normalize(cross(lfWorldX, lfWorldNormal));
        vec3 lfMappedWorldNormal = normalize(lfWorldNormal + lfWorldX * lfSlope.x + lfWorldZ * lfSlope.y);
        normal = normalize(mat3(viewMatrix) * lfMappedWorldNormal);`,
      );
  };

  material.customProgramCacheKey = () => 'lava-flats-authored-pbr-v3';
  material.needsUpdate = true;
  return material;
}
