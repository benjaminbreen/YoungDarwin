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
import { N_SHORE_PATH_POINTS } from './terrain';

const N_SHORE_PATH_SPLAT_BOUNDS = {
  originX: -54,
  originZ: -46,
  width: 108,
  depth: 92,
  size: 1024,
};

const NORTH_SHORE_LAYERS = {
  sand: FLOREANA_PBR_TEXTURES.galapagosSand,
  basalt: FLOREANA_PBR_TEXTURES.darkBasaltGravel,
  scrub: FLOREANA_PBR_TEXTURES.coastalScrub,
  cinder: FLOREANA_PBR_TEXTURES.redCinderDirt,
};

function f(value) {
  return Number(value).toFixed(3);
}

function northShoreFragmentCommon() {
  return /* glsl */`
        uniform vec3 rimColor;
        uniform float rimIntensity;
        uniform float uSwashTime;
        uniform sampler2D uNsSandAlbedo;
        uniform sampler2D uNsSandNrh;
        uniform sampler2D uNsBasaltAlbedo;
        uniform sampler2D uNsBasaltNrh;
        uniform sampler2D uNsScrubAlbedo;
        uniform sampler2D uNsScrubNrh;
        uniform sampler2D uNsCinderAlbedo;
        uniform sampler2D uNsCinderNrh;
        varying vec3 vNorthShoreWorld;
        ${standardFootPathSplatGLSL({
          functionName: 'nsPathSplat',
          textureUniform: 'uNsPathSplat',
          boundsUniform: 'uNsPathSplatBounds',
        })}

        float nsHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float nsNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 q = fract(p);
          vec2 blend = q * q * (3.0 - 2.0 * q);
          return mix(
            mix(nsHash(i), nsHash(i + vec2(1.0, 0.0)), blend.x),
            mix(nsHash(i + vec2(0.0, 1.0)), nsHash(i + vec2(1.0, 1.0)), blend.x),
            blend.y
          );
        }
        float nsFbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int octave = 0; octave < 4; octave++) {
            value += nsNoise(p) * amplitude;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p + vec2(3.7, -2.6);
            amplitude *= 0.52;
          }
          return value;
        }
        float nsCoastZ(float x) {
          return -16.0 + sin(x * 0.072 + 1.3) * 3.6 + sin(x * 0.031 + 0.7) * 2.2;
        }
        float nsPromontory(vec2 p) {
          float spine = exp(-pow((p.x + 36.0) / 9.5, 2.0));
          float reach = smoothstep(-34.0, -6.0, p.y);
          return spine * reach;
        }
        vec2 nsNormalSlope(vec4 nrh, float strength) {
          vec2 xy = nrh.rg * 2.0 - 1.0;
          float z = sqrt(max(1.0 - min(dot(xy, xy), 0.98), 0.02));
          return (xy / max(z, 0.18)) * strength;
        }
        void nsUvs(
          vec2 p,
          out vec2 sandUv,
          out vec2 basaltUv,
          out vec2 scrubUv,
          out vec2 cinderUv
        ) {
          sandUv = p * ${f(NORTH_SHORE_LAYERS.sand.scale)} + vec2(0.13, -0.19);
          basaltUv = p * ${f(NORTH_SHORE_LAYERS.basalt.scale)} + vec2(-0.27, 0.31);
          scrubUv = p * ${f(NORTH_SHORE_LAYERS.scrub.scale)} + vec2(0.41, 0.07);
          cinderUv = p * ${f(NORTH_SHORE_LAYERS.cinder.scale)} + vec2(-0.11, -0.37);
        }
        vec4 nsLayerWeights(vec2 p, float coastDistance) {
          vec4 path = nsPathSplat(p);
          float aboveWater = smoothstep(-1.4, 0.2, coastDistance);
          float pathCover = clamp(max(path.r, path.g * 0.62), 0.0, 1.0) * aboveWater;
          float cinder = clamp(pathCover * 0.92, 0.0, 0.92);
          float fractured = smoothstep(0.72, 0.9, nsFbm(p * 0.17 + vec2(8.0, -11.0)));
          float basalt = clamp(
            nsPromontory(p) * 0.76
            + path.b * 0.18
            + fractured * smoothstep(-3.0, 9.0, coastDistance) * 0.13,
            0.0,
            0.88
          ) * (1.0 - cinder * 0.84);
          float scrub = smoothstep(8.0, 23.0, coastDistance)
            * (1.0 - basalt * 0.86)
            * (1.0 - cinder * 0.94);
          float sand = max(0.0, 1.0 - basalt - scrub - cinder);
          vec4 weights = vec4(sand, basalt, scrub, cinder);
          return weights / max(dot(weights, vec4(1.0)), 0.0001);
        }
        float nsSwashDistance(vec2 p) {
          float cycle = sin(uSwashTime * 0.5984) * 0.5 + 0.5;
          return 0.18 + cycle * 1.55 + sin(p.x * 0.18 + uSwashTime * 0.28) * 0.22;
        }
        float nsWetMask(vec2 p, float coastDistance) {
          float swashDistance = nsSwashDistance(p);
          float beachWet = smoothstep(swashDistance + 1.45, swashDistance * 0.36, coastDistance)
            * step(0.0, coastDistance);
          float waterlineWet = (1.0 - smoothstep(-0.18, 0.15, coastDistance))
            * step(0.0, coastDistance);
          return clamp(max(beachWet, waterlineWet), 0.0, 1.0);
        }`;
}

function northShoreColorFragment() {
  return /* glsl */`
        vec2 nsPosition = vNorthShoreWorld.xz;
        float nsCoastDistance = nsPosition.y - nsCoastZ(nsPosition.x);
        vec2 nsSandUv;
        vec2 nsBasaltUv;
        vec2 nsScrubUv;
        vec2 nsCinderUv;
        nsUvs(nsPosition, nsSandUv, nsBasaltUv, nsScrubUv, nsCinderUv);
        vec4 nsWeights = nsLayerWeights(nsPosition, nsCoastDistance);

        // These albedos upload as sRGB textures and therefore sample in
        // linear space. Do not decode them manually a second time.
        vec3 nsSandSource = texture2D(uNsSandAlbedo, nsSandUv).rgb;
        float nsSandLuminance = dot(nsSandSource, vec3(0.2126, 0.7152, 0.0722));
        float nsSandTone = smoothstep(0.19, 0.72, nsSandLuminance);
        vec3 nsBlackSand = mix(vec3(0.034, 0.032, 0.029), vec3(0.175, 0.155, 0.128), nsSandTone);
        vec3 nsAshSand = mix(vec3(0.19, 0.18, 0.155), vec3(0.43, 0.385, 0.315), nsSandTone);
        float nsUpperBeach = smoothstep(2.3, 8.5, nsCoastDistance)
          * (1.0 - smoothstep(13.0, 22.0, nsCoastDistance));
        vec3 nsSand = mix(nsBlackSand, nsAshSand, nsUpperBeach * 0.82);

        vec3 nsBasalt = texture2D(uNsBasaltAlbedo, nsBasaltUv).rgb * vec3(0.9, 0.86, 0.78);
        vec3 nsScrub = texture2D(uNsScrubAlbedo, nsScrubUv).rgb * vec3(0.94, 0.92, 0.76);
        vec3 nsCinder = texture2D(uNsCinderAlbedo, nsCinderUv).rgb * vec3(0.9, 0.75, 0.58);
        vec3 nsSurfaceColor = nsSand * nsWeights.x
          + nsBasalt * nsWeights.y
          + nsScrub * nsWeights.z
          + nsCinder * nsWeights.w;

        float nsSubmerged = 1.0 - smoothstep(-1.0, 0.12, nsCoastDistance);
        float nsDepth = clamp((-0.12 - nsCoastDistance) / 2.3, 0.0, 1.0);
        float nsDapple = nsFbm(nsPosition * 0.72 + vec2(2.0, 5.0));
        vec3 nsWetStone = mix(vec3(0.07, 0.13, 0.14), vec3(0.14, 0.23, 0.22), nsDapple);
        vec3 nsShallowTeal = mix(vec3(0.22, 0.49, 0.51), vec3(0.38, 0.64, 0.59), nsDapple);
        vec3 nsSeabed = mix(nsWetStone, nsShallowTeal, smoothstep(0.08, 0.75, nsDepth));
        nsSurfaceColor = mix(nsSurfaceColor, nsSeabed, nsSubmerged);

        float nsWet = nsWetMask(nsPosition, nsCoastDistance);
        nsSurfaceColor = mix(nsSurfaceColor, nsSurfaceColor * vec3(0.48, 0.57, 0.56), nsWet * 0.68);
        float nsSwash = nsSwashDistance(nsPosition);
        float nsFoamEdge = smoothstep(0.48, 0.04, abs(nsCoastDistance - nsSwash))
          * step(0.0, nsCoastDistance);
        float nsFoamSpeckle = smoothstep(
          0.36,
          0.78,
          nsNoise(nsPosition * 5.1 + vec2(uSwashTime * 0.4, 0.0))
        );
        nsSurfaceColor = mix(
          nsSurfaceColor,
          vec3(0.9, 0.94, 0.89),
          nsFoamEdge * (0.28 + nsFoamSpeckle * 0.42)
        );
        float nsMacro = nsFbm(nsPosition * 0.05 + vec2(-4.0, 9.0));
        nsSurfaceColor *= mix(0.91, 1.08, nsMacro);
        diffuseColor.rgb = clamp(nsSurfaceColor, 0.0, 1.0);`;
}

function northShoreRoughnessFragment() {
  return /* glsl */`
        vec2 nsRoughPosition = vNorthShoreWorld.xz;
        float nsRoughCoastDistance = nsRoughPosition.y - nsCoastZ(nsRoughPosition.x);
        vec2 nsRoughSandUv;
        vec2 nsRoughBasaltUv;
        vec2 nsRoughScrubUv;
        vec2 nsRoughCinderUv;
        nsUvs(nsRoughPosition, nsRoughSandUv, nsRoughBasaltUv, nsRoughScrubUv, nsRoughCinderUv);
        vec4 nsRoughWeights = nsLayerWeights(nsRoughPosition, nsRoughCoastDistance);
        float nsSandRoughness = mix(0.84, 0.98, texture2D(uNsSandNrh, nsRoughSandUv).b);
        float nsBasaltRoughness = mix(0.72, 0.94, texture2D(uNsBasaltNrh, nsRoughBasaltUv).b);
        float nsScrubRoughness = mix(0.9, 1.0, texture2D(uNsScrubNrh, nsRoughScrubUv).b);
        float nsCinderRoughness = mix(0.82, 0.96, texture2D(uNsCinderNrh, nsRoughCinderUv).b);
        float nsMappedRoughness = dot(
          nsRoughWeights,
          vec4(nsSandRoughness, nsBasaltRoughness, nsScrubRoughness, nsCinderRoughness)
        );
        float nsRoughWet = nsWetMask(nsRoughPosition, nsRoughCoastDistance);
        float nsSubmergedRough = 1.0 - smoothstep(-1.0, 0.12, nsRoughCoastDistance);
        nsMappedRoughness = mix(nsMappedRoughness, max(0.52, nsMappedRoughness - 0.28), nsRoughWet);
        nsMappedRoughness = mix(nsMappedRoughness, 0.7, nsSubmergedRough * 0.7);
        roughnessFactor = mix(roughnessFactor, nsMappedRoughness, 0.95);`;
}

function northShoreNormalFragment() {
  return /* glsl */`
        vec2 nsNormalPosition = vNorthShoreWorld.xz;
        float nsNormalCoastDistance = nsNormalPosition.y - nsCoastZ(nsNormalPosition.x);
        vec2 nsNormalSandUv;
        vec2 nsNormalBasaltUv;
        vec2 nsNormalScrubUv;
        vec2 nsNormalCinderUv;
        nsUvs(nsNormalPosition, nsNormalSandUv, nsNormalBasaltUv, nsNormalScrubUv, nsNormalCinderUv);
        vec4 nsNormalWeights = nsLayerWeights(nsNormalPosition, nsNormalCoastDistance);
        vec2 nsSandSlope = nsNormalSlope(texture2D(uNsSandNrh, nsNormalSandUv), ${f(NORTH_SHORE_LAYERS.sand.normalStrength)});
        vec2 nsBasaltSlope = nsNormalSlope(texture2D(uNsBasaltNrh, nsNormalBasaltUv), ${f(NORTH_SHORE_LAYERS.basalt.normalStrength)});
        vec2 nsScrubSlope = nsNormalSlope(texture2D(uNsScrubNrh, nsNormalScrubUv), ${f(NORTH_SHORE_LAYERS.scrub.normalStrength)});
        vec2 nsCinderSlope = nsNormalSlope(texture2D(uNsCinderNrh, nsNormalCinderUv), ${f(NORTH_SHORE_LAYERS.cinder.normalStrength)});
        vec2 nsMappedSlope = nsSandSlope * nsNormalWeights.x
          + nsBasaltSlope * nsNormalWeights.y
          + nsScrubSlope * nsNormalWeights.z
          + nsCinderSlope * nsNormalWeights.w;
        nsMappedSlope *= mix(1.0, 0.74, nsWetMask(nsNormalPosition, nsNormalCoastDistance));
        vec3 nsWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 nsWorldX = normalize(vec3(1.0, 0.0, 0.0) - nsWorldNormal * nsWorldNormal.x);
        vec3 nsWorldZ = normalize(cross(nsWorldX, nsWorldNormal));
        vec3 nsMappedWorldNormal = normalize(
          nsWorldNormal + nsWorldX * nsMappedSlope.x + nsWorldZ * nsMappedSlope.y
        );
        normal = normalize(mat3(viewMatrix) * nsMappedWorldNormal);`;
}

export function createNorthShoreTerrainMaterial() {
  const pathSplatTexture = createStandardFootPathSplatTexture({
    pathPoints: N_SHORE_PATH_POINTS[0],
    bounds: N_SHORE_PATH_SPLAT_BOUNDS,
    minimumWidth: 1.76,
  });
  const layers = Object.fromEntries(
    Object.entries(NORTH_SHORE_LAYERS).map(([name, config]) => [name, loadPackedPbrTerrainSet(config)]),
  );
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    pathSplatTexture.dispose();
    Object.values(layers).forEach(disposePackedPbrTerrainSet);
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplatTexture, {
      bounds: N_SHORE_PATH_SPLAT_BOUNDS,
      textureUniform: 'uNsPathSplat',
      boundsUniform: 'uNsPathSplatBounds',
    }));
    shader.uniforms.rimColor = { value: new THREE.Color('#c8b178') };
    shader.uniforms.rimIntensity = { value: 0.035 };
    shader.uniforms.uSwashTime = { value: 0 };
    for (const [name, layer] of Object.entries(layers)) {
      const title = name[0].toUpperCase() + name.slice(1);
      shader.uniforms[`uNs${title}Albedo`] = { value: layer.albedo };
      shader.uniforms[`uNs${title}Nrh`] = { value: layer.nrh };
    }
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vNorthShoreWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vNorthShoreWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${northShoreFragmentCommon()}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${northShoreColorFragment()}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
${northShoreRoughnessFragment()}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
${northShoreNormalFragment()}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'north-shore-packed-coastal-pbr-v1';
  material.needsUpdate = true;
  return material;
}
