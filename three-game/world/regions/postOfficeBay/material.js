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
import {
  bindWhiteSandBeachUniforms,
  loadWhiteSandBeachLayer,
  WHITE_SAND_BEACH_GLSL,
} from '../materials/whiteSandBeachLayer';
import { POST_OFFICE_BAY_PATH_POINTS } from './terrain';

// The path network continues through the carry strips at the south/east map
// edges. At 512px this is still roughly 30cm/texel, enough for a two-metre
// footpath while requiring one quarter of the old 1024px runtime splat work.
const POST_OFFICE_PATH_SPLAT_BOUNDS = {
  originX: -84,
  originZ: -66,
  width: 168,
  depth: 154,
  size: 512,
};

const POST_OFFICE_LAYERS = {
  ground: FLOREANA_PBR_TEXTURES.sandyTuff,
  sand: FLOREANA_PBR_TEXTURES.galapagosSand,
  basalt: FLOREANA_PBR_TEXTURES.darkBasaltGravel,
  cinder: FLOREANA_PBR_TEXTURES.redCinderDirt,
};

function f(value) {
  return Number(value).toFixed(3);
}

function postOfficeFragmentCommon() {
  return /* glsl */`
        uniform vec3 uPobRimColor;
        uniform float uPobRimIntensity;
        uniform sampler2D uPobGroundAlbedo;
        uniform sampler2D uPobGroundNrh;
        uniform sampler2D uPobSandAlbedo;
        uniform sampler2D uPobSandNrh;
        uniform sampler2D uPobBasaltAlbedo;
        uniform sampler2D uPobBasaltNrh;
        uniform sampler2D uPobCinderAlbedo;
        uniform sampler2D uPobCinderNrh;
        varying vec3 vPostOfficeWorld;
        varying float vPostOfficeSlope;
        ${standardFootPathSplatGLSL({
          functionName: 'pobPathSplat',
          textureUniform: 'uPobPathSplat',
          boundsUniform: 'uPobPathSplatBounds',
        })}
        ${WHITE_SAND_BEACH_GLSL}

        float pobHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float pobNoise(vec2 p) {
          vec2 cell = floor(p);
          vec2 local = fract(p);
          vec2 blend = local * local * (3.0 - 2.0 * local);
          return mix(
            mix(pobHash(cell), pobHash(cell + vec2(1.0, 0.0)), blend.x),
            mix(pobHash(cell + vec2(0.0, 1.0)), pobHash(cell + vec2(1.0, 1.0)), blend.x),
            blend.y
          );
        }
        float pobMacroNoise(vec2 p) {
          // Two octaves are enough to suppress obvious tiling. The previous
          // material evaluated several five-octave FBMs in every PBR stage.
          return pobNoise(p) * 0.68 + pobNoise(p * 2.03 + vec2(4.7, -3.1)) * 0.32;
        }
        float pobLandingCoastZ(float x) {
          // Matches the authored landing shoreline closely enough for the
          // material bands to follow the water instead of forming an ellipse.
          if (x <= 2.5) return mix(1.7, 2.7, clamp((x + 9.0) / 11.5, 0.0, 1.0));
          if (x <= 12.5) return mix(2.7, 1.6, clamp((x - 2.5) / 10.0, 0.0, 1.0));
          if (x <= 21.5) return mix(1.6, -1.4, clamp((x - 12.5) / 9.0, 0.0, 1.0));
          return mix(-1.4, -5.6, clamp((x - 21.5) / 9.0, 0.0, 1.0));
        }
        float pobLandingMask(vec2 p) {
          float alongshore = 1.0 - smoothstep(12.0, 20.0, abs(p.x - 11.0));
          float shoreDistance = p.y - pobLandingCoastZ(p.x);
          float seaward = smoothstep(-10.0, -5.5, shoreDistance);
          float inland = 1.0 - smoothstep(11.0, 18.0, shoreDistance);
          return clamp(alongshore * seaward * inland, 0.0, 1.0);
        }
        float pobSandbarWhiteRimMask(vec2 p, float height) {
          // Isolate the low sandbar inside the cove, then select its exposed
          // shoreline elevations so the warm tan centre remains visible.
          vec2 sandbar = (p - vec2(-2.0, -19.0)) / vec2(19.0, 7.6);
          float region = 1.0 - smoothstep(0.78, 1.16, length(sandbar));
          float aboveWater = smoothstep(-0.82, -0.34, height);
          float upperFade = 1.0 - smoothstep(0.42, 1.18, height);
          return clamp(region * aboveWater * upperFade, 0.0, 1.0);
        }
        float pobWhiteSandMask(vec2 p, float height) {
          float landing = pobLandingMask(p);
          float sandbarRim = pobSandbarWhiteRimMask(p, height);
          return clamp(max(landing, sandbarRim), 0.0, 1.0);
        }
        float pobBeachMask(vec2 p) {
          float centralLanding = pobLandingMask(p);
          // Pale coastal material continues through the west/east carry bands
          // toward Northwest Reef and Northern Shore instead of ending in the
          // generic inland ground at the map boundary.
          float westContinuation = 1.0 - smoothstep(-48.0, -31.0, p.x);
          float eastContinuation = smoothstep(31.0, 48.0, p.x);
          float edgeBeach = max(westContinuation, eastContinuation) * 0.94;
          return clamp(max(centralLanding, edgeBeach), 0.0, 1.0);
        }
        float pobClearingMask(vec2 p) {
          return 1.0 - smoothstep(2.45, 4.8, length(p - vec2(0.0, 8.5)));
        }
        float pobWetMask(float height) {
          float exposedWet = (1.0 - smoothstep(-0.86, -0.24, height)) * step(-0.9, height);
          float submergedWet = (1.0 - smoothstep(-1.42, -0.86, height)) * step(height, -0.9);
          return clamp(max(exposedWet, submergedWet), 0.0, 1.0);
        }
        float pobSubmergedMask(float height) {
          return 1.0 - smoothstep(-1.42, -0.84, height);
        }
        vec2 pobNormalSlope(vec4 nrh, float strength) {
          vec2 xy = nrh.rg * 2.0 - 1.0;
          float z = sqrt(max(1.0 - min(dot(xy, xy), 0.98), 0.02));
          return (xy / max(z, 0.18)) * strength;
        }
        void pobUvs(
          vec2 p,
          out vec2 groundUv,
          out vec2 sandUv,
          out vec2 basaltUv,
          out vec2 cinderUv
        ) {
          groundUv = p * ${f(POST_OFFICE_LAYERS.ground.scale)} + vec2(-0.23, 0.29);
          sandUv = p * ${f(POST_OFFICE_LAYERS.sand.scale)} + vec2(0.13, -0.19);
          basaltUv = p * ${f(POST_OFFICE_LAYERS.basalt.scale)} + vec2(-0.27, 0.31);
          // Cinder is granular and does not need the old per-fragment path
          // frame calculation; world-space UVs remove all route-segment math.
          cinderUv = p * ${f(POST_OFFICE_LAYERS.cinder.scale)} + vec2(-0.11, -0.37);
        }
        vec4 pobLayerWeights(vec2 p, float height, float slope) {
          vec4 path = pobPathSplat(p);
          float dry = smoothstep(-1.02, -0.54, height);
          float clearing = pobClearingMask(p);
          float beach = pobBeachMask(p);

          // The red-cinder PBR family is already resident for the paths. Reuse
          // it for intermittent oxidized soil on rises, driven by the cheap
          // interpolated geometric slope rather than another texture lookup.
          float rise = smoothstep(0.075, 0.265, slope);
          float exposureNoise = pobMacroNoise(p * 0.055 + vec2(9.3, -4.1));
          float exposedEarth = rise
            * mix(0.48, 1.0, smoothstep(0.24, 0.78, exposureNoise))
            * (1.0 - beach * 0.94)
            * dry
            * 0.48;
          float authoredCinder = max(path.r * 0.74, clearing * 0.6) * dry;
          float cinder = clamp(max(authoredCinder, exposedEarth), 0.0, 0.72);

          float shoreBasalt = (1.0 - smoothstep(-0.72, 1.35, height)) * (1.0 - beach * 0.9);
          float westFront = -13.0 + sin(p.y * 0.105 - 0.4) * 4.2;
          float westernLava = 1.0 - smoothstep(westFront - 10.0, westFront + 8.0, p.x);
          float fractured = smoothstep(0.58, 0.78, pobNoise(p * 0.13 + vec2(5.2, -8.1)));
          float basalt = clamp(
            shoreBasalt * 0.64 + westernLava * 0.58 + fractured * 0.13 + path.b * 0.08,
            0.0,
            0.86
          ) * (1.0 - cinder * 0.88) * (1.0 - beach * 0.82);

          float sand = beach * (1.0 - basalt * 0.84) * (1.0 - cinder * 0.92);
          float ground = max(0.0, 1.0 - sand - basalt - cinder);
          vec4 weights = vec4(ground, sand, basalt, cinder);
          return weights / max(dot(weights, vec4(1.0)), 0.0001);
        }`;
}

function postOfficeColorFragment() {
  return /* glsl */`
        vec2 pobPosition = vPostOfficeWorld.xz;
        float pobHeight = vPostOfficeWorld.y;
        vec2 pobGroundUv;
        vec2 pobSandUv;
        vec2 pobBasaltUv;
        vec2 pobCinderUv;
        pobUvs(pobPosition, pobGroundUv, pobSandUv, pobBasaltUv, pobCinderUv);
        vec4 pobWeights = pobLayerWeights(pobPosition, pobHeight, vPostOfficeSlope);

        // Albedos upload as sRGB textures and sample in linear space. Applying
        // a second pow/decode here was one reason the former shader looked dull.
        vec3 pobGround = texture2D(uPobGroundAlbedo, pobGroundUv).rgb * vec3(0.96, 0.91, 0.82);
        float pobSandVariation = pobMacroNoise(pobPosition * 0.075 + vec2(-2.0, 8.0));
        vec3 pobSand = texture2D(uPobSandAlbedo, pobSandUv).rgb
          * vec3(1.08, 1.02, 0.9)
          * mix(0.955, 1.045, pobSandVariation);
        vec3 pobBasalt = texture2D(uPobBasaltAlbedo, pobBasaltUv).rgb * vec3(0.84, 0.82, 0.76);
        vec3 pobCinderSource = texture2D(uPobCinderAlbedo, pobCinderUv).rgb;
        float pobCinderLuma = dot(pobCinderSource, vec3(0.2126, 0.7152, 0.0722));
        vec3 pobCinder = mix(pobCinderSource, vec3(pobCinderLuma), 0.26) * vec3(0.84, 0.72, 0.58);

        vec3 pobSurface = pobGround * pobWeights.x
          + pobSand * pobWeights.y
          + pobBasalt * pobWeights.z
          + pobCinder * pobWeights.w;
        float pobMacro = pobMacroNoise(pobPosition * 0.042 + vec2(7.0, -5.0));
        pobSurface *= mix(0.91, 1.08, pobMacro);
        float pobInlandLitter = smoothstep(5.0, 30.0, pobPosition.y)
          * smoothstep(0.34, 0.74, pobNoise(pobPosition * 0.07 + vec2(-3.0, 6.0)));
        pobSurface *= mix(vec3(1.0), vec3(0.88, 0.91, 0.74), pobInlandLitter * 0.15);

        // Northwest Reef's baked shell sand covers the enlarged landing beach
        // and the sandbar's low perimeter. Both masks feather into the tan PBR
        // sand underneath rather than replacing the full landform.
        float pobWhiteSand = pobWhiteSandMask(pobPosition, pobHeight);
        vec3 pobWhiteSandColor = whiteSandBeachColor(pobPosition)
          * vec3(1.035, 1.0, 0.93)
          * mix(0.975, 1.025, pobSandVariation);
        // Retain a little of the warm Galapagos sand below even at the mask's
        // centre; its contribution increases naturally through feathered edges.
        pobSurface = mix(pobSurface, pobWhiteSandColor, pobWhiteSand * 0.9);

        float pobWet = pobWetMask(pobHeight);
        pobSurface = mix(pobSurface, pobSurface * vec3(0.48, 0.57, 0.55), pobWet * 0.7);
        float pobSubmerged = pobSubmergedMask(pobHeight);
        float pobDepth = clamp((-0.9 - pobHeight) / 2.7, 0.0, 1.0);
        vec3 pobSeabed = mix(vec3(0.055, 0.10, 0.10), vec3(0.18, 0.34, 0.31), pobDepth);
        pobSurface = mix(pobSurface, pobSeabed, pobSubmerged * 0.64);

        // Preserve a restrained amount of the authored biome tint while the
        // packed materials provide the actual grain and mineral response.
        vec3 pobAuthoredTint = clamp(diffuseColor.rgb * 1.2, vec3(0.72), vec3(1.16));
        pobSurface *= mix(vec3(1.0), pobAuthoredTint, 0.1);
        diffuseColor.rgb = clamp(pobSurface, 0.0, 1.0);`;
}

function postOfficeRoughnessFragment() {
  return /* glsl */`
        vec2 pobRoughPosition = vPostOfficeWorld.xz;
        float pobRoughHeight = vPostOfficeWorld.y;
        vec2 pobRoughGroundUv;
        vec2 pobRoughSandUv;
        vec2 pobRoughBasaltUv;
        vec2 pobRoughCinderUv;
        pobUvs(
          pobRoughPosition,
          pobRoughGroundUv,
          pobRoughSandUv,
          pobRoughBasaltUv,
          pobRoughCinderUv
        );
        vec4 pobRoughWeights = pobLayerWeights(
          pobRoughPosition,
          pobRoughHeight,
          vPostOfficeSlope
        );
        float pobGroundRoughness = mix(0.84, 0.97, texture2D(uPobGroundNrh, pobRoughGroundUv).b);
        float pobSandRoughness = mix(0.82, 0.98, texture2D(uPobSandNrh, pobRoughSandUv).b);
        float pobBasaltRoughness = mix(0.7, 0.93, texture2D(uPobBasaltNrh, pobRoughBasaltUv).b);
        float pobCinderRoughness = mix(0.82, 0.96, texture2D(uPobCinderNrh, pobRoughCinderUv).b);
        float pobMappedRoughness = dot(
          pobRoughWeights,
          vec4(pobGroundRoughness, pobSandRoughness, pobBasaltRoughness, pobCinderRoughness)
        );
        float pobRoughWhiteSand = pobWhiteSandMask(pobRoughPosition, pobRoughHeight);
        pobMappedRoughness = mix(
          pobMappedRoughness,
          whiteSandBeachRoughness(pobRoughPosition),
          pobRoughWhiteSand
        );
        float pobRoughWet = pobWetMask(pobRoughHeight);
        pobMappedRoughness = mix(pobMappedRoughness, max(0.5, pobMappedRoughness - 0.3), pobRoughWet);
        pobMappedRoughness = mix(pobMappedRoughness, 0.68, pobSubmergedMask(pobRoughHeight) * 0.72);
        roughnessFactor = mix(roughnessFactor, pobMappedRoughness, 0.95);`;
}

function postOfficeNormalFragment() {
  return /* glsl */`
        vec2 pobNormalPosition = vPostOfficeWorld.xz;
        float pobNormalHeight = vPostOfficeWorld.y;
        vec2 pobNormalGroundUv;
        vec2 pobNormalSandUv;
        vec2 pobNormalBasaltUv;
        vec2 pobNormalCinderUv;
        pobUvs(
          pobNormalPosition,
          pobNormalGroundUv,
          pobNormalSandUv,
          pobNormalBasaltUv,
          pobNormalCinderUv
        );
        vec4 pobNormalWeights = pobLayerWeights(
          pobNormalPosition,
          pobNormalHeight,
          vPostOfficeSlope
        );
        vec2 pobGroundSlope = pobNormalSlope(
          texture2D(uPobGroundNrh, pobNormalGroundUv),
          ${f(POST_OFFICE_LAYERS.ground.normalStrength)}
        );
        vec2 pobSandSlope = pobNormalSlope(
          texture2D(uPobSandNrh, pobNormalSandUv),
          ${f(POST_OFFICE_LAYERS.sand.normalStrength)}
        );
        vec2 pobBasaltSlope = pobNormalSlope(
          texture2D(uPobBasaltNrh, pobNormalBasaltUv),
          ${f(POST_OFFICE_LAYERS.basalt.normalStrength)}
        );
        vec2 pobCinderSlope = pobNormalSlope(
          texture2D(uPobCinderNrh, pobNormalCinderUv),
          ${f(POST_OFFICE_LAYERS.cinder.normalStrength)}
        );
        vec2 pobMappedSlope = pobGroundSlope * pobNormalWeights.x
          + pobSandSlope * pobNormalWeights.y
          + pobBasaltSlope * pobNormalWeights.z
          + pobCinderSlope * pobNormalWeights.w;
        float pobNormalWhiteSand = pobWhiteSandMask(pobNormalPosition, pobNormalHeight);
        pobMappedSlope = mix(
          pobMappedSlope,
          whiteSandBeachNormalSlope(pobNormalPosition),
          pobNormalWhiteSand
        );
        pobMappedSlope *= mix(1.0, 0.72, pobWetMask(pobNormalHeight));

        vec3 pobWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 pobWorldX = normalize(vec3(1.0, 0.0, 0.0) - pobWorldNormal * pobWorldNormal.x);
        vec3 pobWorldZ = normalize(cross(pobWorldX, pobWorldNormal));
        vec3 pobMappedWorldNormal = normalize(
          pobWorldNormal + pobWorldX * pobMappedSlope.x + pobWorldZ * pobMappedSlope.y
        );
        normal = normalize(mat3(viewMatrix) * pobMappedWorldNormal);`;
}

export function createPostOfficeBayTerrainMaterial() {
  const pathSplatTexture = createStandardFootPathSplatTexture({
    pathPoints: POST_OFFICE_BAY_PATH_POINTS,
    bounds: POST_OFFICE_PATH_SPLAT_BOUNDS,
    size: POST_OFFICE_PATH_SPLAT_BOUNDS.size,
    minimumWidth: 1.68,
  });
  const layers = Object.fromEntries(
    Object.entries(POST_OFFICE_LAYERS).map(([name, config]) => [name, loadPackedPbrTerrainSet(config)]),
  );
  const whiteSand = loadWhiteSandBeachLayer();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    pathSplatTexture.dispose();
    Object.values(layers).forEach(disposePackedPbrTerrainSet);
    whiteSand.dispose();
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplatTexture, {
      bounds: POST_OFFICE_PATH_SPLAT_BOUNDS,
      textureUniform: 'uPobPathSplat',
      boundsUniform: 'uPobPathSplatBounds',
    }));
    shader.uniforms.uPobRimColor = { value: new THREE.Color('#b9aa81') };
    shader.uniforms.uPobRimIntensity = { value: 0.025 };
    for (const [name, layer] of Object.entries(layers)) {
      const title = name[0].toUpperCase() + name.slice(1);
      shader.uniforms[`uPob${title}Albedo`] = { value: layer.albedo };
      shader.uniforms[`uPob${title}Nrh`] = { value: layer.nrh };
    }
    bindWhiteSandBeachUniforms(shader, whiteSand);
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPostOfficeWorld;
        varying float vPostOfficeSlope;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vPostOfficeSlope = 1.0 - clamp(abs(objectNormal.y), 0.0, 1.0);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPostOfficeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${postOfficeFragmentCommon()}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${postOfficeColorFragment()}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
${postOfficeRoughnessFragment()}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
${postOfficeNormalFragment()}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float pobSlopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += uPobRimColor * pobSlopeRim * uPobRimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'post-office-bay-white-sand-landing-v4';
  material.needsUpdate = true;
  return material;
}
