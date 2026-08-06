import * as THREE from 'three';
import {
  resolveStandardFootPathSplatTexture,
  standardFootPathSplatGLSL,
  standardFootPathSplatUniforms,
} from '../../paths/standardPath';
import {
  disposePackedPbrTerrainSet,
  loadPackedPbrTerrainSet,
} from './pbrTerrainTextures';

function f(value) {
  return Number(value).toFixed(3);
}

function fragmentCommon({
  layerConfig,
  surfaceMaskGLSL = '',
  layerWeightsOverlayGLSL = '',
  slopeExposure = 1,
}) {
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
        varying float vPostScrubSlope;

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
        float psrMacroNoise(vec2 p) {
          // Two octaves are enough for macro breakup; the 4-octave psrFbm is
          // reserved for the masks that need it.
          return psrNoise(p) * 0.68 + psrNoise(p * 2.03 + vec2(4.7, -3.1)) * 0.32;
        }
        ${surfaceMaskGLSL}
        ${standardFootPathSplatGLSL({
          functionName: 'psrPathSplat',
          textureUniform: 'uPostScrubPathSplat',
          boundsUniform: 'uPostScrubPathSplatBounds',
        })}
        vec4 psrLayerWeights(vec2 p) {
          vec4 path = psrPathSplat(p);
          float macroLitter = smoothstep(0.5, 0.74, psrFbm(p * 0.075 + vec2(-5.2, 8.4)));
          float fractured = smoothstep(0.7, 0.88, psrFbm(p * 0.19 + vec2(11.0, -7.0)));
          float cinder = clamp(path.r * 0.96, 0.0, 1.0);
          float basalt = clamp(path.b * 0.42 + path.a * 0.08 + fractured * 0.16, 0.0, 0.42)
            * (1.0 - cinder * 0.72);
          // max(), not sum: the baked verge (path.a) and the natural litter
          // patches should read as one population, not a ribbon plus specks.
          float litter = clamp(max(path.a * 0.5, macroLitter * 0.38), 0.0, 0.58)
            * (1.0 - cinder * 0.86)
            * (1.0 - basalt * 0.52);
          float coastal = max(0.0, 1.0 - cinder - basalt - litter);
          vec4 weights = vec4(coastal, litter, basalt, cinder);
          ${layerWeightsOverlayGLSL}
          // Applied after the region overlay so it also reaches regions that
          // replace the base weights outright: steep dry faces shed the
          // organic layers for exposed soil (rises) and rock (steeper still).
          float psrSlopeAmount = clamp(vPostScrubSlope, 0.0, 1.0);
          float psrSlopeDry = smoothstep(-1.02, -0.5, vPostScrubWorld.y);
          float psrRise = smoothstep(0.085, 0.27, psrSlopeAmount);
          float psrSteep = smoothstep(0.34, 0.6, psrSlopeAmount);
          float psrExposureNoise = psrMacroNoise(p * 0.055 + vec2(9.3, -4.1));
          float psrExposed = psrRise
            * mix(0.42, 1.0, smoothstep(0.26, 0.74, psrExposureNoise))
            * psrSlopeDry * ${f(slopeExposure)};
          weights.w = max(weights.w, psrExposed * 0.34);
          weights.z = max(weights.z, psrSteep * psrSlopeDry * ${f(slopeExposure * 0.42)});
          return weights / max(dot(weights, vec4(1.0)), 0.0001);
        }
        void psrLayerUvs(
          vec2 p,
          out vec2 coastalUv,
          out vec2 litterUv,
          out vec2 basaltUv,
          out vec2 cinderUv
        ) {
          coastalUv = p * ${f(layerConfig.coastal.texture.scale)} + vec2(0.17, -0.31);
          litterUv = p * ${f(layerConfig.litter.texture.scale)} + vec2(-0.29, 0.23);
          basaltUv = p * ${f(layerConfig.basalt.texture.scale)} + vec2(0.37, 0.11);
          // World-space like the other layers: cinder is granular, and a
          // path-frame projection shows orientation seams once slope exposure
          // paints it far from any path.
          cinderUv = p * ${f(layerConfig.cinder.texture.scale)} + vec2(-0.11, -0.37);
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
        psrLayerUvs(psrPosition, psrCoastalUv, psrLitterUv, psrBasaltUv, psrCinderUv);
        vec4 psrWeights = psrLayerWeights(psrPosition);
        // Three uploads these albedos as SRGB8_ALPHA8, so texture2D already
        // returns linear values. Do not manually decode them a second time.
        //
        // The two organic layers cover the largest unbroken areas, so only
        // they get the rotated second sample that breaks tiling; basalt and
        // cinder are granular and hide repeats on their own.
        float psrTileBreak = smoothstep(0.32, 0.68, psrNoise(psrPosition * 0.023 + vec2(3.1, 9.4)));
        mat2 psrTileRotation = mat2(0.588, -0.809, 0.809, 0.588);
        vec3 psrCoastal = mix(
          texture2D(uPostScrubCoastalAlbedo, psrCoastalUv).rgb,
          texture2D(uPostScrubCoastalAlbedo, psrTileRotation * psrCoastalUv * 0.62 + vec2(0.31, -0.17)).rgb,
          psrTileBreak * 0.85
        ) * vec3(1.05, 1.02, 0.94);
        vec3 psrLitter = mix(
          texture2D(uPostScrubLitterAlbedo, psrLitterUv).rgb,
          texture2D(uPostScrubLitterAlbedo, psrTileRotation * psrLitterUv * 0.62 + vec2(-0.23, 0.37)).rgb,
          psrTileBreak * 0.85
        ) * vec3(1.04, 1.01, 0.9);
        vec3 psrBasalt = texture2D(uPostScrubBasaltAlbedo, psrBasaltUv).rgb * vec3(1.06, 1.03, 0.98);
        vec3 psrCinder = texture2D(uPostScrubCinderAlbedo, psrCinderUv).rgb * vec3(1.08, 1.0, 0.9);
        vec4 psrPath = psrPathSplat(psrPosition);
        psrCinder *= mix(1.0, 0.78, psrPath.g * 0.72);
        vec3 psrColor = psrCoastal * psrWeights.x
          + psrLitter * psrWeights.y
          + psrBasalt * psrWeights.z
          + psrCinder * psrWeights.w;
        // Macro breakup at two wavelengths, riding the terrain-look panel's
        // macroVariation knob like Post Office Bay: the broad octave gives
        // structure wider than one tile, and the hue tilt survives bright
        // light where a small value multiply disappears into tone mapping.
        float psrMacroAmount = clamp(uTerrainGradeExtra.x, 0.0, 3.0);
        float psrMacro = psrMacroNoise(psrPosition * 0.042 + vec2(7.0, -4.0));
        float psrMacroBroad = psrNoise(psrPosition * 0.013 + vec2(-11.0, 4.0));
        float psrMacroMix = psrMacro * 0.55 + psrMacroBroad * 0.45;
        psrColor *= mix(1.0, mix(0.9, 1.1, psrMacroMix), psrMacroAmount);
        psrColor *= mix(
          vec3(1.0),
          mix(
            vec3(0.982, 0.992, 1.022),
            vec3(1.032, 1.002, 0.952),
            smoothstep(0.25, 0.75, psrMacroBroad)
          ),
          psrMacroAmount
        );
        vec3 psrAuthoredTint = clamp(diffuseColor.rgb * 1.25, vec3(0.72), vec3(1.16));
        psrColor *= mix(vec3(1.0), psrAuthoredTint, 0.12);
        diffuseColor.rgb = clamp(psrColor, 0.0, 1.0);`;
}

function roughnessFragment(layerConfig, roughnessOverlayGLSL = '') {
  return /* glsl */`
        vec2 psrRoughPosition = vPostScrubWorld.xz;
        vec2 psrRoughCoastalUv;
        vec2 psrRoughLitterUv;
        vec2 psrRoughBasaltUv;
        vec2 psrRoughCinderUv;
        psrLayerUvs(
          psrRoughPosition,
          psrRoughCoastalUv,
          psrRoughLitterUv,
          psrRoughBasaltUv,
          psrRoughCinderUv
        );
        vec4 psrRoughWeights = psrLayerWeights(psrRoughPosition);
        float psrCoastalRoughness = mix(
          ${f(layerConfig.coastal.roughnessMin)},
          ${f(layerConfig.coastal.roughnessMax)},
          texture2D(uPostScrubCoastalNrh, psrRoughCoastalUv).b
        );
        float psrLitterRoughness = mix(
          ${f(layerConfig.litter.roughnessMin)},
          ${f(layerConfig.litter.roughnessMax)},
          texture2D(uPostScrubLitterNrh, psrRoughLitterUv).b
        );
        float psrBasaltRoughness = mix(
          ${f(layerConfig.basalt.roughnessMin)},
          ${f(layerConfig.basalt.roughnessMax)},
          texture2D(uPostScrubBasaltNrh, psrRoughBasaltUv).b
        );
        float psrCinderRoughness = mix(
          ${f(layerConfig.cinder.roughnessMin)},
          ${f(layerConfig.cinder.roughnessMax)},
          texture2D(uPostScrubCinderNrh, psrRoughCinderUv).b
        );
        vec4 psrRoughPath = psrPathSplat(psrRoughPosition);
        psrCinderRoughness = mix(psrCinderRoughness, max(0.68, psrCinderRoughness - 0.15), psrRoughPath.g);
        float psrMappedRoughness = dot(
          psrRoughWeights,
          vec4(psrCoastalRoughness, psrLitterRoughness, psrBasaltRoughness, psrCinderRoughness)
        );
        roughnessFactor = mix(roughnessFactor, psrMappedRoughness, 0.94);
        ${roughnessOverlayGLSL}`;
}

function normalFragment(layerConfig) {
  return /* glsl */`
        vec2 psrNormalPosition = vPostScrubWorld.xz;
        vec2 psrNormalCoastalUv;
        vec2 psrNormalLitterUv;
        vec2 psrNormalBasaltUv;
        vec2 psrNormalCinderUv;
        psrLayerUvs(
          psrNormalPosition,
          psrNormalCoastalUv,
          psrNormalLitterUv,
          psrNormalBasaltUv,
          psrNormalCinderUv
        );
        vec4 psrNormalWeights = psrLayerWeights(psrNormalPosition);
        vec2 psrCoastalSlope = psrNormalSlope(
          texture2D(uPostScrubCoastalNrh, psrNormalCoastalUv),
          ${f(layerConfig.coastal.texture.normalStrength)}
        );
        vec2 psrLitterSlope = psrNormalSlope(
          texture2D(uPostScrubLitterNrh, psrNormalLitterUv),
          ${f(layerConfig.litter.texture.normalStrength)}
        );
        vec2 psrBasaltSlope = psrNormalSlope(
          texture2D(uPostScrubBasaltNrh, psrNormalBasaltUv),
          ${f(layerConfig.basalt.texture.normalStrength)}
        );
        vec2 psrCinderSlope = psrNormalSlope(
          texture2D(uPostScrubCinderNrh, psrNormalCinderUv),
          ${f(layerConfig.cinder.texture.normalStrength)}
        );
        vec4 psrNormalPath = psrPathSplat(psrNormalPosition);
        psrCinderSlope *= mix(1.0, 0.7, psrNormalPath.g);

        vec3 psrWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 psrWorldX = normalize(vec3(1.0, 0.0, 0.0) - psrWorldNormal * psrWorldNormal.x);
        vec3 psrWorldZ = normalize(cross(psrWorldX, psrWorldNormal));
        vec2 psrWorldSlope = psrCoastalSlope * psrNormalWeights.x
          + psrLitterSlope * psrNormalWeights.y
          + psrBasaltSlope * psrNormalWeights.z
          + psrCinderSlope * psrNormalWeights.w;
        vec3 psrPerturbation = psrWorldX * psrWorldSlope.x + psrWorldZ * psrWorldSlope.y;
        vec3 psrMappedWorldNormal = normalize(psrWorldNormal + psrPerturbation);
        normal = normalize(mat3(viewMatrix) * psrMappedWorldNormal);`;
}

export function createLayeredDryPbrTerrainMaterial({
  pathPoints,
  pathSplatBounds,
  pathSplatBake = null,
  pathMinimumWidth = 1.62,
  layerConfig,
  surfaceMaskGLSL = '',
  layerWeightsOverlayGLSL = '',
  colorOverlayGLSL = '',
  roughnessOverlayGLSL = '',
  // 0..1 scale on the shared slope-driven exposed soil/rock; regions where
  // bare slopes are wrong (wetland floors) can dial it down without a shader.
  slopeExposure = 1,
  cacheKey = 'layered-dry-pbr-terrain-v1',
} = {}) {
  if (!pathPoints || pathPoints.length < 2) {
    throw new Error('createLayeredDryPbrTerrainMaterial requires pathPoints.');
  }
  const requiredLayers = ['coastal', 'litter', 'basalt', 'cinder'];
  if (!layerConfig || requiredLayers.some(name => !layerConfig[name]?.texture)) {
    throw new Error(`createLayeredDryPbrTerrainMaterial requires ${requiredLayers.join(', ')} layers.`);
  }

  const pathSplat = resolveStandardFootPathSplatTexture({
    bake: pathSplatBake,
    pathPoints,
    bounds: pathSplatBounds,
    size: pathSplatBounds?.size,
    minimumWidth: pathMinimumWidth,
  });
  const layers = Object.fromEntries(
    Object.entries(layerConfig).map(([name, layer]) => [name, loadPackedPbrTerrainSet(layer.texture)]),
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
        varying vec3 vPostScrubWorld;
        varying float vPostScrubSlope;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vPostScrubSlope = 1.0 - clamp(abs(objectNormal.y), 0.0, 1.0);`,
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
${fragmentCommon({ layerConfig, surfaceMaskGLSL, layerWeightsOverlayGLSL, slopeExposure })}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${colorFragment()}
${colorOverlayGLSL}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
${roughnessFragment(layerConfig, roughnessOverlayGLSL)}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
${normalFragment(layerConfig)}`,
      );
  };
  // The factory suffix versions the shared GLSL independently of each
  // region's own key.
  material.customProgramCacheKey = () => `${cacheKey}|ldpt-v3-verge`;
  material.needsUpdate = true;
  return material;
}
