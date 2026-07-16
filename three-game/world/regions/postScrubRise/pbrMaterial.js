import * as THREE from 'three';
import {
  createStandardFootPathSplatTexture,
  standardFootPathFrameGLSL,
  standardFootPathSplatGLSL,
  standardFootPathSplatUniforms,
} from '../../paths/standardPath';
import {
  disposePackedPbrTerrainSet,
  FLOREANA_PBR_TEXTURES,
  loadPackedPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

const LAYER_CONFIG = {
  coastal: {
    texture: FLOREANA_PBR_TEXTURES.coastalScrub,
    roughnessMin: 0.88,
    roughnessMax: 0.98,
  },
  litter: {
    texture: FLOREANA_PBR_TEXTURES.dryGrassLitter,
    roughnessMin: 0.9,
    roughnessMax: 1,
  },
  basalt: {
    texture: FLOREANA_PBR_TEXTURES.darkBasaltGravel,
    roughnessMin: 0.76,
    roughnessMax: 0.94,
  },
  cinder: {
    texture: FLOREANA_PBR_TEXTURES.redCinderDirt,
    roughnessMin: 0.84,
    roughnessMax: 0.96,
  },
};

function f(value) {
  return Number(value).toFixed(3);
}

function fragmentCommon({ pathPoints }) {
  return /* glsl */`
        uniform sampler2D uPostScrubCoastalAlbedo;
        uniform sampler2D uPostScrubCoastalNrh;
        uniform sampler2D uPostScrubLitterAlbedo;
        uniform sampler2D uPostScrubLitterNrh;
        uniform sampler2D uPostScrubBasaltAlbedo;
        uniform sampler2D uPostScrubBasaltNrh;
        uniform sampler2D uPostScrubCinderAlbedo;
        uniform sampler2D uPostScrubCinderNrh;
        varying vec3 vPostScrubWorld;

        float psrHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float psrNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 q = fract(p);
          vec2 u = q * q * (3.0 - 2.0 * q);
          return mix(
            mix(psrHash(i), psrHash(i + vec2(1.0, 0.0)), u.x),
            mix(psrHash(i + vec2(0.0, 1.0)), psrHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float psrFbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int octave = 0; octave < 4; octave++) {
            value += psrNoise(p) * amplitude;
            p = mat2(1.68, -0.98, 0.98, 1.68) * p + vec2(4.1, -2.8);
            amplitude *= 0.52;
          }
          return value;
        }
        ${standardFootPathSplatGLSL({
          functionName: 'psrPathSplat',
          textureUniform: 'uPostScrubPathSplat',
          boundsUniform: 'uPostScrubPathSplatBounds',
        })}
        ${standardFootPathFrameGLSL(pathPoints, {
          segmentFunctionName: 'psrPathSegmentFrame',
          frameFunctionName: 'psrPathFrame',
        })}
        vec4 psrLayerWeights(vec2 p) {
          vec4 path = psrPathSplat(p);
          float macroLitter = smoothstep(0.5, 0.74, psrFbm(p * 0.075 + vec2(-5.2, 8.4)));
          float fractured = smoothstep(0.7, 0.88, psrFbm(p * 0.19 + vec2(11.0, -7.0)));
          float cinder = clamp(path.r * 0.96, 0.0, 1.0);
          float basalt = clamp(path.b * 0.42 + path.a * 0.08 + fractured * 0.16, 0.0, 0.42)
            * (1.0 - cinder * 0.72);
          float litter = clamp(path.a * 0.34 + macroLitter * 0.38, 0.0, 0.58)
            * (1.0 - cinder * 0.86)
            * (1.0 - basalt * 0.52);
          float coastal = max(0.0, 1.0 - cinder - basalt - litter);
          vec4 weights = vec4(coastal, litter, basalt, cinder);
          return weights / max(dot(weights, vec4(1.0)), 0.0001);
        }
        vec4 psrFrameAndUvs(
          vec2 p,
          out vec2 coastalUv,
          out vec2 litterUv,
          out vec2 basaltUv,
          out vec2 cinderUv
        ) {
          vec4 frame = psrPathFrame(p);
          vec2 pathDirection = vec2(cos(frame.w), sin(frame.w));
          vec2 pathSide = vec2(-pathDirection.y, pathDirection.x);
          coastalUv = p * ${f(LAYER_CONFIG.coastal.texture.scale)} + vec2(0.17, -0.31);
          litterUv = p * ${f(LAYER_CONFIG.litter.texture.scale)} + vec2(-0.29, 0.23);
          basaltUv = p * ${f(LAYER_CONFIG.basalt.texture.scale)} + vec2(0.37, 0.11);
          cinderUv = vec2(dot(p, pathDirection), dot(p - frame.xy, pathSide))
            * ${f(LAYER_CONFIG.cinder.texture.scale)};
          return frame;
        }
        vec2 psrNormalSlope(vec4 nrh, float strength) {
          vec2 xy = nrh.rg * 2.0 - 1.0;
          float z = sqrt(max(1.0 - min(dot(xy, xy), 0.98), 0.02));
          return (xy / max(z, 0.18)) * strength;
        }`;
}

function colorFragment() {
  return /* glsl */`
        vec2 psrPosition = vPostScrubWorld.xz;
        vec2 psrCoastalUv;
        vec2 psrLitterUv;
        vec2 psrBasaltUv;
        vec2 psrCinderUv;
        psrFrameAndUvs(psrPosition, psrCoastalUv, psrLitterUv, psrBasaltUv, psrCinderUv);
        vec4 psrWeights = psrLayerWeights(psrPosition);
        // Three uploads these albedos as SRGB8_ALPHA8, so texture2D already
        // returns linear values. Do not manually decode them a second time.
        vec3 psrCoastal = texture2D(uPostScrubCoastalAlbedo, psrCoastalUv).rgb * vec3(1.05, 1.02, 0.94);
        vec3 psrLitter = texture2D(uPostScrubLitterAlbedo, psrLitterUv).rgb * vec3(1.04, 1.01, 0.9);
        vec3 psrBasalt = texture2D(uPostScrubBasaltAlbedo, psrBasaltUv).rgb * vec3(1.06, 1.03, 0.98);
        vec3 psrCinder = texture2D(uPostScrubCinderAlbedo, psrCinderUv).rgb * vec3(1.08, 1.0, 0.9);
        vec4 psrPath = psrPathSplat(psrPosition);
        psrCinder *= mix(1.0, 0.78, psrPath.g * 0.72);
        vec3 psrColor = psrCoastal * psrWeights.x
          + psrLitter * psrWeights.y
          + psrBasalt * psrWeights.z
          + psrCinder * psrWeights.w;
        float psrMacro = psrFbm(psrPosition * 0.045 + vec2(7.0, -4.0));
        psrColor *= mix(0.92, 1.08, psrMacro);
        vec3 psrAuthoredTint = clamp(diffuseColor.rgb * 1.25, vec3(0.72), vec3(1.16));
        psrColor *= mix(vec3(1.0), psrAuthoredTint, 0.12);
        diffuseColor.rgb = clamp(psrColor, 0.0, 1.0);`;
}

function roughnessFragment() {
  return /* glsl */`
        vec2 psrRoughPosition = vPostScrubWorld.xz;
        vec2 psrRoughCoastalUv;
        vec2 psrRoughLitterUv;
        vec2 psrRoughBasaltUv;
        vec2 psrRoughCinderUv;
        psrFrameAndUvs(
          psrRoughPosition,
          psrRoughCoastalUv,
          psrRoughLitterUv,
          psrRoughBasaltUv,
          psrRoughCinderUv
        );
        vec4 psrRoughWeights = psrLayerWeights(psrRoughPosition);
        float psrCoastalRoughness = mix(
          ${f(LAYER_CONFIG.coastal.roughnessMin)},
          ${f(LAYER_CONFIG.coastal.roughnessMax)},
          texture2D(uPostScrubCoastalNrh, psrRoughCoastalUv).b
        );
        float psrLitterRoughness = mix(
          ${f(LAYER_CONFIG.litter.roughnessMin)},
          ${f(LAYER_CONFIG.litter.roughnessMax)},
          texture2D(uPostScrubLitterNrh, psrRoughLitterUv).b
        );
        float psrBasaltRoughness = mix(
          ${f(LAYER_CONFIG.basalt.roughnessMin)},
          ${f(LAYER_CONFIG.basalt.roughnessMax)},
          texture2D(uPostScrubBasaltNrh, psrRoughBasaltUv).b
        );
        float psrCinderRoughness = mix(
          ${f(LAYER_CONFIG.cinder.roughnessMin)},
          ${f(LAYER_CONFIG.cinder.roughnessMax)},
          texture2D(uPostScrubCinderNrh, psrRoughCinderUv).b
        );
        vec4 psrRoughPath = psrPathSplat(psrRoughPosition);
        psrCinderRoughness = mix(psrCinderRoughness, max(0.68, psrCinderRoughness - 0.15), psrRoughPath.g);
        float psrMappedRoughness = dot(
          psrRoughWeights,
          vec4(psrCoastalRoughness, psrLitterRoughness, psrBasaltRoughness, psrCinderRoughness)
        );
        roughnessFactor = mix(roughnessFactor, psrMappedRoughness, 0.94);`;
}

function normalFragment() {
  return /* glsl */`
        vec2 psrNormalPosition = vPostScrubWorld.xz;
        vec2 psrNormalCoastalUv;
        vec2 psrNormalLitterUv;
        vec2 psrNormalBasaltUv;
        vec2 psrNormalCinderUv;
        vec4 psrNormalFrame = psrFrameAndUvs(
          psrNormalPosition,
          psrNormalCoastalUv,
          psrNormalLitterUv,
          psrNormalBasaltUv,
          psrNormalCinderUv
        );
        vec4 psrNormalWeights = psrLayerWeights(psrNormalPosition);
        vec2 psrCoastalSlope = psrNormalSlope(
          texture2D(uPostScrubCoastalNrh, psrNormalCoastalUv),
          ${f(LAYER_CONFIG.coastal.texture.normalStrength)}
        );
        vec2 psrLitterSlope = psrNormalSlope(
          texture2D(uPostScrubLitterNrh, psrNormalLitterUv),
          ${f(LAYER_CONFIG.litter.texture.normalStrength)}
        );
        vec2 psrBasaltSlope = psrNormalSlope(
          texture2D(uPostScrubBasaltNrh, psrNormalBasaltUv),
          ${f(LAYER_CONFIG.basalt.texture.normalStrength)}
        );
        vec2 psrCinderSlope = psrNormalSlope(
          texture2D(uPostScrubCinderNrh, psrNormalCinderUv),
          ${f(LAYER_CONFIG.cinder.texture.normalStrength)}
        );
        vec4 psrNormalPath = psrPathSplat(psrNormalPosition);
        psrCinderSlope *= mix(1.0, 0.7, psrNormalPath.g);

        vec3 psrWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 psrWorldX = normalize(vec3(1.0, 0.0, 0.0) - psrWorldNormal * psrWorldNormal.x);
        vec3 psrWorldZ = normalize(cross(psrWorldX, psrWorldNormal));
        vec2 psrPathDirection2 = vec2(cos(psrNormalFrame.w), sin(psrNormalFrame.w));
        vec2 psrPathSide2 = vec2(-psrPathDirection2.y, psrPathDirection2.x);
        vec3 psrPathDirection = normalize(
          vec3(psrPathDirection2.x, 0.0, psrPathDirection2.y)
          - psrWorldNormal * dot(vec3(psrPathDirection2.x, 0.0, psrPathDirection2.y), psrWorldNormal)
        );
        vec3 psrPathSide = normalize(
          vec3(psrPathSide2.x, 0.0, psrPathSide2.y)
          - psrWorldNormal * dot(vec3(psrPathSide2.x, 0.0, psrPathSide2.y), psrWorldNormal)
        );
        vec2 psrWorldSlope = psrCoastalSlope * psrNormalWeights.x
          + psrLitterSlope * psrNormalWeights.y
          + psrBasaltSlope * psrNormalWeights.z;
        vec3 psrPerturbation = psrWorldX * psrWorldSlope.x + psrWorldZ * psrWorldSlope.y;
        psrPerturbation += (
          psrPathDirection * psrCinderSlope.x + psrPathSide * psrCinderSlope.y
        ) * psrNormalWeights.w;
        vec3 psrMappedWorldNormal = normalize(psrWorldNormal + psrPerturbation);
        normal = normalize(mat3(viewMatrix) * psrMappedWorldNormal);`;
}

export function createPostScrubRisePbrMaterial({
  pathPoints,
  pathSplatBounds,
  pathMinimumWidth = 1.62,
} = {}) {
  if (!pathPoints || pathPoints.length < 2) {
    throw new Error('createPostScrubRisePbrMaterial requires pathPoints.');
  }

  const pathSplat = createStandardFootPathSplatTexture({
    pathPoints,
    bounds: pathSplatBounds,
    size: pathSplatBounds?.size,
    minimumWidth: pathMinimumWidth,
  });
  const layers = Object.fromEntries(
    Object.entries(LAYER_CONFIG).map(([name, layer]) => [name, loadPackedPbrTerrainSet(layer.texture)]),
  );
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    pathSplat.dispose();
    Object.values(layers).forEach(disposePackedPbrTerrainSet);
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplat, {
      bounds: pathSplatBounds,
      textureUniform: 'uPostScrubPathSplat',
      boundsUniform: 'uPostScrubPathSplatBounds',
    }));
    for (const [name, layer] of Object.entries(layers)) {
      const title = name[0].toUpperCase() + name.slice(1);
      shader.uniforms[`uPostScrub${title}Albedo`] = { value: layer.albedo };
      shader.uniforms[`uPostScrub${title}Nrh`] = { value: layer.nrh };
    }
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPostScrubWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPostScrubWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${fragmentCommon({ pathPoints })}`,
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
  material.customProgramCacheKey = () => 'post-scrub-rise-packed-pbr-phase-1-v1';
  material.needsUpdate = true;
  return material;
}
