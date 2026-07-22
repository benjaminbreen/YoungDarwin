import * as THREE from 'three';
import {
  disposePackedPbrTerrainSet,
  FLOREANA_PBR_TEXTURES,
  loadPackedPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

const LAYERS = {
  sand: FLOREANA_PBR_TEXTURES.whiteSandBeach,
  basalt: FLOREANA_PBR_TEXTURES.darkBasaltGravel,
  mud: FLOREANA_PBR_TEXTURES.brackishMud,
  scrub: FLOREANA_PBR_TEXTURES.coastalScrub,
};

function n(value) {
  return Number(value).toFixed(3);
}

function sharedFragment() {
  return /* glsl */`
        uniform float uSwashTime;
        uniform sampler2D uItSandAlbedo;
        uniform sampler2D uItSandNrh;
        uniform sampler2D uItBasaltAlbedo;
        uniform sampler2D uItBasaltNrh;
        uniform sampler2D uItMudAlbedo;
        uniform sampler2D uItMudNrh;
        uniform sampler2D uItScrubAlbedo;
        uniform sampler2D uItScrubNrh;
        varying vec3 vIntertidalWorld;

        vec4 itWeights;
        vec4 itSandData;
        vec4 itBasaltData;
        vec4 itMudData;
        vec4 itScrubData;
        float itSurfaceWetness;

        float itHash(vec2 pointValue) {
          return fract(sin(dot(pointValue, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float itNoise(vec2 pointValue) {
          vec2 cell = floor(pointValue);
          vec2 localValue = fract(pointValue);
          vec2 curve = localValue * localValue * (3.0 - 2.0 * localValue);
          return mix(
            mix(itHash(cell), itHash(cell + vec2(1.0, 0.0)), curve.x),
            mix(itHash(cell + vec2(0.0, 1.0)), itHash(cell + vec2(1.0, 1.0)), curve.x),
            curve.y
          );
        }
        float itSegmentDistance(vec2 pointValue, vec2 startPoint, vec2 endPoint) {
          vec2 segmentValue = endPoint - startPoint;
          float amount = clamp(dot(pointValue - startPoint, segmentValue) / max(dot(segmentValue, segmentValue), 0.0001), 0.0, 1.0);
          return length(pointValue - (startPoint + segmentValue * amount));
        }
        float itRibbon(vec2 pointValue, vec2 startPoint, vec2 endPoint, float widthValue, float innerValue) {
          return 1.0 - smoothstep(widthValue * innerValue, widthValue, itSegmentDistance(pointValue, startPoint, endPoint));
        }
        float itBackshore(vec2 pointValue) {
          return (1.0 - smoothstep(-34.0, -19.0, pointValue.y))
            * mix(0.84, 1.0, itNoise(pointValue * vec2(0.09, 0.11) + vec2(-5.0, 8.0)));
        }
        float itBasalt(vec2 pointValue) {
          float value = 0.0;
          value = max(value, itRibbon(pointValue, vec2(-43.0, -13.0), vec2(-34.0, 1.0), 8.4, 0.48));
          value = max(value, itRibbon(pointValue, vec2(-34.0, 1.0), vec2(-22.0, 27.0), 7.4, 0.48));
          value = max(value, itRibbon(pointValue, vec2(-8.0, -11.0), vec2(2.0, 10.0), 6.4, 0.48));
          value = max(value, itRibbon(pointValue, vec2(2.0, 10.0), vec2(-2.0, 31.0), 6.1, 0.48));
          value = max(value, itRibbon(pointValue, vec2(24.0, -8.0), vec2(34.0, 12.0), 7.3, 0.48));
          value = max(value, itRibbon(pointValue, vec2(34.0, 12.0), vec2(24.0, 31.0), 6.7, 0.48));
          return clamp(value * mix(0.86, 1.0, itNoise(pointValue * 0.31 + vec2(-8.0, 4.0))), 0.0, 1.0);
        }
        float itChannels(vec2 pointValue) {
          float value = 0.0;
          value = max(value, itRibbon(pointValue, vec2(-31.0, 51.0), vec2(-28.0, 28.0), 9.2, 0.42));
          value = max(value, itRibbon(pointValue, vec2(-28.0, 28.0), vec2(-17.0, 15.0), 6.4, 0.42));
          value = max(value, itRibbon(pointValue, vec2(-17.0, 15.0), vec2(-8.0, 7.0), 4.8, 0.42));
          value = max(value, itRibbon(pointValue, vec2(12.0, 51.0), vec2(8.0, 31.0), 10.4, 0.42));
          value = max(value, itRibbon(pointValue, vec2(8.0, 31.0), vec2(16.0, 17.0), 7.2, 0.42));
          value = max(value, itRibbon(pointValue, vec2(16.0, 17.0), vec2(13.0, 3.0), 4.9, 0.42));
          value = max(value, itRibbon(pointValue, vec2(44.0, 51.0), vec2(38.0, 29.0), 9.0, 0.42));
          value = max(value, itRibbon(pointValue, vec2(38.0, 29.0), vec2(28.0, 16.0), 6.2, 0.42));
          return clamp(value, 0.0, 1.0);
        }
        float itPools(vec2 pointValue) {
          vec2 firstOffset = (pointValue - vec2(-25.0, -1.0)) / vec2(9.2, 6.1);
          vec2 secondOffset = (pointValue - vec2(1.0, 14.0)) / vec2(7.8, 5.4);
          vec2 thirdOffset = (pointValue - vec2(29.0, 10.0)) / vec2(8.5, 5.6);
          float firstValue = exp(-dot(firstOffset, firstOffset) * 1.3);
          float secondValue = exp(-dot(secondOffset, secondOffset) * 1.3) * 0.92;
          float thirdValue = exp(-dot(thirdOffset, thirdOffset) * 1.3) * 0.96;
          return clamp(max(firstValue, max(secondValue, thirdValue)) * (1.0 - itChannels(pointValue) * 0.72), 0.0, 1.0);
        }
        float itShellSand(vec2 pointValue) {
          vec2 centerOffset = (pointValue - vec2(10.0, 5.0)) / vec2(35.0, 26.0);
          vec2 eastOffset = (pointValue - vec2(30.0, 20.0)) / vec2(23.0, 21.0);
          float sandValue = max(exp(-dot(centerOffset, centerOffset)), exp(-dot(eastOffset, eastOffset)) * 0.82);
          return clamp(sandValue * (1.0 - itBasalt(pointValue) * 0.82), 0.0, 1.0);
        }
        float itRequiredPath(vec2 pointValue) {
          float value = 0.0;
          value = max(value, itRibbon(pointValue, vec2(2.0, -49.0), vec2(1.0, -38.0), 2.0, 0.48));
          value = max(value, itRibbon(pointValue, vec2(1.0, -38.0), vec2(-5.0, -29.0), 2.1, 0.48));
          value = max(value, itRibbon(pointValue, vec2(-5.0, -29.0), vec2(-4.0, -20.0), 2.2, 0.48));
          value = max(value, itRibbon(pointValue, vec2(-4.0, -20.0), vec2(21.0, -12.0), 2.3, 0.48));
          value = max(value, itRibbon(pointValue, vec2(21.0, -12.0), vec2(56.0, -8.0), 2.2, 0.48));
          value = max(value, itRibbon(pointValue, vec2(-4.0, -20.0), vec2(-30.0, -4.0), 2.25, 0.48));
          value = max(value, itRibbon(pointValue, vec2(-30.0, -4.0), vec2(-56.0, 8.5), 2.15, 0.48));
          return clamp(value, 0.0, 1.0);
        }
        vec4 itLayerWeights(vec2 pointValue) {
          float backshoreValue = itBackshore(pointValue);
          float basaltValue = itBasalt(pointValue);
          float channelValue = itChannels(pointValue);
          float poolValue = itPools(pointValue);
          float sandValue = itShellSand(pointValue);
          float pathValue = itRequiredPath(pointValue);
          float mudValue = clamp(max(channelValue * 0.62, poolValue * 0.78) + (1.0 - sandValue) * (1.0 - basaltValue) * 0.09, 0.0, 1.0);
          float scrubValue = clamp(backshoreValue * (1.0 - pathValue * 0.74), 0.0, 1.0);
          sandValue = clamp(max(sandValue, pathValue * 0.72) * (1.0 - basaltValue * 0.74), 0.0, 1.0);
          vec4 weightValue = vec4(sandValue, basaltValue, mudValue, scrubValue);
          return weightValue / max(dot(weightValue, vec4(1.0)), 0.0001);
        }
        vec2 itNormalSlope(vec4 packedValue, float strengthValue) {
          vec2 xyValue = packedValue.rg * 2.0 - 1.0;
          float zValue = sqrt(max(1.0 - min(dot(xyValue, xyValue), 0.98), 0.02));
          return (xyValue / max(zValue, 0.18)) * strengthValue;
        }`;
}

export function createSouthernIntertidalTerrainMaterial() {
  const packedLayers = Object.fromEntries(
    Object.entries(LAYERS).map(([name, config]) => [name, loadPackedPbrTerrainSet(config)]),
  );
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    Object.values(packedLayers).forEach(disposePackedPbrTerrainSet);
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.uSwashTime = { value: 0 };
    for (const [name, layer] of Object.entries(packedLayers)) {
      const title = name[0].toUpperCase() + name.slice(1);
      shader.uniforms[`uIt${title}Albedo`] = { value: layer.albedo };
      shader.uniforms[`uIt${title}Nrh`] = { value: layer.nrh };
    }
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vIntertidalWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vIntertidalWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${sharedFragment()}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 itPoint = vIntertidalWorld.xz;
        float itHeight = vIntertidalWorld.y;
        vec2 itSandUv = itPoint * ${n(LAYERS.sand.scale)} + vec2(0.17, -0.09);
        vec2 itBasaltUv = itPoint * ${n(LAYERS.basalt.scale)} + vec2(-0.21, 0.13);
        vec2 itMudUv = itPoint * ${n(LAYERS.mud.scale)} + vec2(0.07, 0.23);
        vec2 itScrubUv = itPoint * ${n(LAYERS.scrub.scale)} + vec2(-0.15, -0.19);
        itSandData = texture2D(uItSandNrh, itSandUv);
        itBasaltData = texture2D(uItBasaltNrh, itBasaltUv);
        itMudData = texture2D(uItMudNrh, itMudUv);
        itScrubData = texture2D(uItScrubNrh, itScrubUv);
        itWeights = itLayerWeights(itPoint);
        vec4 itHeightBias = mix(vec4(0.94), vec4(1.06), vec4(itSandData.a, itBasaltData.a, itMudData.a, itScrubData.a));
        itWeights *= itHeightBias;
        itWeights /= max(dot(itWeights, vec4(1.0)), 0.0001);

        vec3 itSandColor = texture2D(uItSandAlbedo, itSandUv).rgb * vec3(1.11, 1.07, 0.96);
        vec3 itBasaltColor = texture2D(uItBasaltAlbedo, itBasaltUv).rgb * vec3(0.55, 0.62, 0.57);
        vec3 itMudColor = texture2D(uItMudAlbedo, itMudUv).rgb * vec3(0.82, 0.84, 0.72);
        vec3 itScrubColor = texture2D(uItScrubAlbedo, itScrubUv).rgb * vec3(0.78, 0.95, 0.68);
        vec3 itColor = itSandColor * itWeights.x
          + itBasaltColor * itWeights.y
          + itMudColor * itWeights.z
          + itScrubColor * itWeights.w;

        float itChannelValue = itChannels(itPoint);
        float itPoolValue = itPools(itPoint);
        float itBasaltValue = itBasalt(itPoint);
        float itLowSurface = 1.0 - smoothstep(-0.42, 0.28, itHeight);
        itSurfaceWetness = clamp(max(itChannelValue, itPoolValue) * 0.82 + itLowSurface * 0.54, 0.0, 1.0);
        itColor = mix(itColor, itColor * vec3(0.56, 0.65, 0.62), itSurfaceWetness * 0.48);

        float itAlgaeNoise = itNoise(itPoint * 0.48 + vec2(-7.0, 11.0));
        float itAlgae = itBasaltValue * itSurfaceWetness * smoothstep(0.54, 0.8, itAlgaeNoise);
        itColor = mix(itColor, vec3(0.075, 0.19, 0.105), itAlgae * 0.62);

        float itSubmerged = 1.0 - smoothstep(-1.02, -0.78, itHeight);
        float itDepth = clamp((-0.9 - itHeight) / 1.25, 0.0, 1.0);
        float itWaterMottle = itNoise(itPoint * 0.17 + vec2(13.0, -5.0));
        vec3 itShallowAqua = mix(vec3(0.18, 0.72, 0.69), vec3(0.42, 0.86, 0.72), itWaterMottle);
        vec3 itChannelTeal = mix(vec3(0.08, 0.45, 0.5), vec3(0.18, 0.67, 0.62), itWaterMottle);
        vec3 itSeabedColor = mix(itShallowAqua, itChannelTeal, smoothstep(0.24, 0.9, itDepth));
        itSeabedColor = mix(itSeabedColor, itColor, itBasaltValue * 0.34);
        itColor = mix(itColor, itSeabedColor, itSubmerged * 0.88);

        float itSwashCycle = sin(uSwashTime * 0.5984) * 0.5 + 0.5;
        float itFoamBand = (1.0 - smoothstep(0.04, 0.22, abs(itHeight + 0.88 + itSwashCycle * 0.035)))
          * itChannelValue;
        itColor = mix(itColor, vec3(0.9, 0.93, 0.84), itFoamBand * 0.2);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(itColor, 0.0, 1.0), 0.96);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float itSandRoughness = mix(0.88, 0.98, itSandData.b);
        float itBasaltRoughness = mix(0.74, 0.93, itBasaltData.b);
        float itMudRoughness = mix(0.48, 0.82, itMudData.b);
        float itScrubRoughness = mix(0.86, 0.98, itScrubData.b);
        float itMappedRoughness = dot(itWeights, vec4(itSandRoughness, itBasaltRoughness, itMudRoughness, itScrubRoughness));
        itMappedRoughness = mix(itMappedRoughness, max(0.34, itMappedRoughness - 0.34), itSurfaceWetness);
        roughnessFactor = mix(roughnessFactor, itMappedRoughness, 0.96);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec2 itSandSlope = itNormalSlope(itSandData, ${n(LAYERS.sand.normalStrength)});
        vec2 itBasaltSlope = itNormalSlope(itBasaltData, ${n(LAYERS.basalt.normalStrength)});
        vec2 itMudSlope = itNormalSlope(itMudData, ${n(LAYERS.mud.normalStrength)});
        vec2 itScrubSlope = itNormalSlope(itScrubData, ${n(LAYERS.scrub.normalStrength)});
        vec2 itMappedSlope = itSandSlope * itWeights.x
          + itBasaltSlope * itWeights.y
          + itMudSlope * itWeights.z
          + itScrubSlope * itWeights.w;
        itMappedSlope *= mix(1.0, 0.7, itSurfaceWetness);
        vec3 itWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 itWorldX = normalize(vec3(1.0, 0.0, 0.0) - itWorldNormal * itWorldNormal.x);
        vec3 itWorldZ = normalize(cross(itWorldX, itWorldNormal));
        vec3 itMappedWorldNormal = normalize(itWorldNormal + itWorldX * itMappedSlope.x + itWorldZ * itMappedSlope.y);
        normal = normalize(mat3(viewMatrix) * itMappedWorldNormal);`,
      );
  };

  material.customProgramCacheKey = () => 'southern-intertidal-packed-low-tide-v1';
  material.needsUpdate = true;
  return material;
}
