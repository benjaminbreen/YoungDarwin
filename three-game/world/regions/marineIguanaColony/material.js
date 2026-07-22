import * as THREE from 'three';
import {
  disposePackedPbrTerrainSet,
  FLOREANA_PBR_TEXTURES,
  loadPackedPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

const LAYERS = {
  sand: FLOREANA_PBR_TEXTURES.whiteSandBeach,
  basalt: FLOREANA_PBR_TEXTURES.darkBasaltGravel,
  weathered: FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt,
  cinder: FLOREANA_PBR_TEXTURES.redCinderDirt,
};

function n(value) {
  return Number(value).toFixed(3);
}

function sharedFragment() {
  return /* glsl */`
        uniform sampler2D uMiSandAlbedo;
        uniform sampler2D uMiSandNrh;
        uniform sampler2D uMiBasaltAlbedo;
        uniform sampler2D uMiBasaltNrh;
        uniform sampler2D uMiWeatheredAlbedo;
        uniform sampler2D uMiWeatheredNrh;
        uniform sampler2D uMiCinderAlbedo;
        uniform sampler2D uMiCinderNrh;
        varying vec3 vMarineColonyWorld;

        vec4 miWeights;
        vec4 miSandData;
        vec4 miBasaltData;
        vec4 miWeatheredData;
        vec4 miCinderData;
        float miWetness;

        float miHash(vec2 pointValue) {
          return fract(sin(dot(pointValue, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float miNoise(vec2 pointValue) {
          vec2 cellValue = floor(pointValue);
          vec2 localValue = fract(pointValue);
          vec2 curveValue = localValue * localValue * (3.0 - 2.0 * localValue);
          return mix(
            mix(miHash(cellValue), miHash(cellValue + vec2(1.0, 0.0)), curveValue.x),
            mix(miHash(cellValue + vec2(0.0, 1.0)), miHash(cellValue + vec2(1.0, 1.0)), curveValue.x),
            curveValue.y
          );
        }
        float miGauss(vec2 pointValue, vec2 centerValue, vec2 radiusValue) {
          vec2 deltaValue = (pointValue - centerValue) / radiusValue;
          return exp(-dot(deltaValue, deltaValue));
        }
        float miCoastX(float zValue) {
          return -29.5
            + sin(zValue * 0.095 + 0.65) * 2.2
            + sin(zValue * 0.245 - 1.1) * 1.15
            + sin(zValue * 0.52 + 0.2) * 0.42
            - miGauss(vec2(0.0, zValue), vec2(0.0, -13.0), vec2(1.0, 9.0)) * 4.8
            - miGauss(vec2(0.0, zValue), vec2(0.0, 21.0), vec2(1.0, 8.0)) * 3.6
            + miGauss(vec2(0.0, zValue), vec2(0.0, 5.0), vec2(1.0, 5.4)) * 3.2
            + miGauss(vec2(0.0, zValue), vec2(0.0, 37.0), vec2(1.0, 5.6)) * 2.2;
        }
        float miBeach(vec2 pointValue) {
          float coastDistance = pointValue.x - miCoastX(pointValue.y);
          float shoreBand = smoothstep(-0.7, 1.4, coastDistance) * (1.0 - smoothstep(18.0, 29.0, coastDistance));
          float northCove = miGauss(pointValue, vec2(-18.0, -14.0), vec2(19.0, 13.0));
          float southCove = miGauss(pointValue, vec2(-18.0, 22.0), vec2(18.0, 11.0)) * 0.9;
          float centerCove = miGauss(pointValue, vec2(-15.0, 3.0), vec2(16.0, 9.0)) * 0.74;
          return clamp(shoreBand * max(northCove, max(southCove, centerCove)), 0.0, 1.0);
        }
        float miBasalt(vec2 pointValue) {
          float coastDistance = pointValue.x - miCoastX(pointValue.y);
          float coastBand = smoothstep(-0.6, 1.4, coastDistance) * (1.0 - smoothstep(18.0, 29.0, coastDistance));
          float terraceValue = miGauss(pointValue, vec2(-15.0, 5.0), vec2(24.0, 15.0));
          float northValue = miGauss(pointValue, vec2(-19.0, -32.0), vec2(18.0, 11.0)) * 0.86;
          float southValue = miGauss(pointValue, vec2(-18.0, 38.0), vec2(20.0, 10.0)) * 0.92;
          float fingerValue = max(
            miGauss(pointValue, vec2(-12.0, -3.0), vec2(5.6, 15.0)),
            max(miGauss(pointValue, vec2(-15.0, 10.0), vec2(6.2, 13.0)), miGauss(pointValue, vec2(-12.0, 32.0), vec2(5.4, 12.0)))
          );
          return clamp(max(max(terraceValue, northValue), max(southValue, fingerValue * 0.8)) * coastBand, 0.0, 1.0);
        }
        float miGuano(vec2 pointValue) {
          float apronValue = max(
            miGauss(pointValue, vec2(-18.0, 1.0), vec2(9.0, 6.2)),
            max(miGauss(pointValue, vec2(-12.0, 9.0), vec2(7.5, 5.5)), miGauss(pointValue, vec2(-20.0, -24.0), vec2(7.0, 5.5)) * 0.58)
          );
          float veinValue = smoothstep(0.42, 0.78, miNoise(vec2(pointValue.x * 0.18 + 7.0, pointValue.y * 0.72 - 3.0)));
          float breakValue = 0.62 + miNoise(pointValue * vec2(0.62, 0.58) + vec2(-11.0, 9.0)) * 0.44;
          return clamp(apronValue * (0.24 + veinValue * 0.88) * breakValue * miBasalt(pointValue), 0.0, 1.0);
        }
        float miRubble(vec2 pointValue) {
          float inlandValue = smoothstep(-2.0, 37.0, pointValue.x);
          float ribValue = max(
            miGauss(pointValue, vec2(9.0, -30.0), vec2(9.0, 17.0)),
            max(miGauss(pointValue, vec2(24.0, 14.0), vec2(12.0, 20.0)), miGauss(pointValue, vec2(40.0, -20.0), vec2(8.0, 18.0)))
          );
          return clamp(inlandValue * (ribValue * 0.78 + smoothstep(0.63, 0.84, miNoise(pointValue * vec2(0.17, 0.19) + vec2(-5.0, 12.0))) * 0.34), 0.0, 1.0);
        }
        vec4 miLayerWeights(vec2 pointValue, float heightValue) {
          float beachValue = miBeach(pointValue);
          float basaltValue = miBasalt(pointValue);
          float rubbleValue = miRubble(pointValue);
          float submergedValue = 1.0 - smoothstep(-1.02, -0.74, heightValue);
          beachValue = max(beachValue, submergedValue * (1.0 - basaltValue));
          basaltValue = max(basaltValue, submergedValue * 0.82);
          beachValue = clamp(beachValue * 1.72, 0.0, 1.0);
          basaltValue = clamp(basaltValue * 1.34, 0.0, 1.0);
          float inlandValue = smoothstep(-1.0, 33.0, pointValue.x);
          float bareValue = 1.0 - max(beachValue, basaltValue);
          float weatheredValue = clamp(rubbleValue + basaltValue * (1.0 - beachValue) * 0.34 + bareValue * (1.0 - inlandValue) * 0.74, 0.0, 1.0);
          float cinderValue = clamp(bareValue * (0.18 + inlandValue * 0.82), 0.0, 1.0);
          vec4 weightValue = vec4(beachValue, basaltValue, weatheredValue, cinderValue);
          return weightValue / max(dot(weightValue, vec4(1.0)), 0.0001);
        }
        vec2 miNormalSlope(vec4 packedValue, float strengthValue) {
          vec2 slopeValue = packedValue.rg * 2.0 - 1.0;
          float upValue = sqrt(max(1.0 - min(dot(slopeValue, slopeValue), 0.98), 0.02));
          return (slopeValue / max(upValue, 0.18)) * strengthValue;
        }`;
}

export function createMarineIguanaColonyTerrainMaterial() {
  const packedLayers = Object.fromEntries(
    Object.entries(LAYERS).map(([name, config]) => [name, loadPackedPbrTerrainSet(config)]),
  );
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    Object.values(packedLayers).forEach(disposePackedPbrTerrainSet);
  });

  material.onBeforeCompile = shader => {
    for (const [name, layer] of Object.entries(packedLayers)) {
      const title = name[0].toUpperCase() + name.slice(1);
      shader.uniforms[`uMi${title}Albedo`] = { value: layer.albedo };
      shader.uniforms[`uMi${title}Nrh`] = { value: layer.nrh };
    }
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n        varying vec3 vMarineColonyWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n        vMarineColonyWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${sharedFragment()}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 miPoint = vMarineColonyWorld.xz;
        vec2 miSandUv = miPoint * ${n(LAYERS.sand.scale)} + vec2(0.17, -0.09);
        vec2 miBasaltUv = miPoint * ${n(LAYERS.basalt.scale)} + vec2(-0.21, 0.13);
        vec2 miWeatheredUv = miPoint * ${n(LAYERS.weathered.scale)} + vec2(0.07, 0.23);
        vec2 miCinderUv = miPoint * ${n(LAYERS.cinder.scale)} + vec2(-0.15, -0.19);
        miSandData = texture2D(uMiSandNrh, miSandUv);
        miBasaltData = texture2D(uMiBasaltNrh, miBasaltUv);
        miWeatheredData = texture2D(uMiWeatheredNrh, miWeatheredUv);
        miCinderData = texture2D(uMiCinderNrh, miCinderUv);
        miWeights = miLayerWeights(miPoint, vMarineColonyWorld.y);
        vec4 miHeightBias = mix(vec4(0.94), vec4(1.06), vec4(miSandData.a, miBasaltData.a, miWeatheredData.a, miCinderData.a));
        miWeights *= miHeightBias;
        miWeights /= max(dot(miWeights, vec4(1.0)), 0.0001);

        vec3 miSandColor = texture2D(uMiSandAlbedo, miSandUv).rgb * vec3(1.38, 1.32, 1.2);
        vec3 miBasaltColor = texture2D(uMiBasaltAlbedo, miBasaltUv).rgb * vec3(0.43, 0.46, 0.43);
        vec3 miWeatheredColor = texture2D(uMiWeatheredAlbedo, miWeatheredUv).rgb * vec3(0.49, 0.47, 0.43);
        vec3 miCinderColor = texture2D(uMiCinderAlbedo, miCinderUv).rgb * vec3(0.5, 0.45, 0.42);
        vec3 miColor = miSandColor * miWeights.x + miBasaltColor * miWeights.y + miWeatheredColor * miWeights.z + miCinderColor * miWeights.w;

        float miCoastDistance = miPoint.x - miCoastX(miPoint.y);
        float miLowSurface = 1.0 - smoothstep(-0.28, 0.3, vMarineColonyWorld.y);
        miWetness = clamp((1.0 - smoothstep(0.5, 5.2, miCoastDistance)) * 0.58 + miLowSurface * miBasalt(miPoint) * 0.74, 0.0, 1.0);
        miColor = mix(miColor, miColor * vec3(0.46, 0.56, 0.54), miWetness * 0.58);

        float miGuanoValue = miGuano(miPoint);
        vec3 miGuanoColor = mix(vec3(0.68, 0.66, 0.56), vec3(0.86, 0.84, 0.7), miNoise(miPoint * 0.8 + vec2(4.0, -9.0)));
        miColor = mix(miColor, miGuanoColor, miGuanoValue * 0.84);

        float miSubmerged = 1.0 - smoothstep(-1.02, -0.76, vMarineColonyWorld.y);
        float miDepth = clamp((-0.9 - vMarineColonyWorld.y) / 1.25, 0.0, 1.0);
        vec3 miWaterTint = mix(vec3(0.36, 0.78, 0.7), vec3(0.07, 0.32, 0.4), miDepth);
        miColor = mix(miColor, miWaterTint, miSubmerged * 0.82);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(miColor, 0.0, 1.0), 0.97);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float miMappedRoughness = dot(miWeights, vec4(
          mix(0.88, 0.98, miSandData.b),
          mix(0.72, 0.93, miBasaltData.b),
          mix(0.8, 0.96, miWeatheredData.b),
          mix(0.86, 0.98, miCinderData.b)
        ));
        miMappedRoughness = mix(miMappedRoughness, max(0.38, miMappedRoughness - 0.3), miWetness);
        roughnessFactor = mix(roughnessFactor, miMappedRoughness, 0.96);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec2 miMappedSlope = miNormalSlope(miSandData, ${n(LAYERS.sand.normalStrength)}) * miWeights.x
          + miNormalSlope(miBasaltData, ${n(LAYERS.basalt.normalStrength)}) * miWeights.y
          + miNormalSlope(miWeatheredData, ${n(LAYERS.weathered.normalStrength)}) * miWeights.z
          + miNormalSlope(miCinderData, ${n(LAYERS.cinder.normalStrength)}) * miWeights.w;
        miMappedSlope *= mix(1.0, 0.72, miWetness);
        vec3 miWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 miWorldX = normalize(vec3(1.0, 0.0, 0.0) - miWorldNormal * miWorldNormal.x);
        vec3 miWorldZ = normalize(cross(miWorldX, miWorldNormal));
        vec3 miMappedWorldNormal = normalize(miWorldNormal + miWorldX * miMappedSlope.x + miWorldZ * miMappedSlope.y);
        normal = normalize(mat3(viewMatrix) * miMappedWorldNormal);`);
  };
  material.customProgramCacheKey = () => 'marine-iguana-colony-severe-coast-v3';
  material.needsUpdate = true;
  return material;
}
