import * as THREE from 'three';
import {
  disposePackedPbrTerrainSet,
  FLOREANA_PBR_TEXTURES,
  loadPackedPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

const LAYERS = {
  sand: FLOREANA_PBR_TEXTURES.whiteSandBeach,
  olivine: FLOREANA_PBR_TEXTURES.olivineBeach,
  meadow: FLOREANA_PBR_TEXTURES.coastalGrassShoulder,
  mud: FLOREANA_PBR_TEXTURES.brackishMud,
};

function f(value) {
  return Number(value).toFixed(3);
}

function fragmentCommon() {
  return /* glsl */`
        uniform float uSwashTime;
        uniform sampler2D uCbSandAlbedo;
        uniform sampler2D uCbSandNrh;
        uniform sampler2D uCbOlivineAlbedo;
        uniform sampler2D uCbOlivineNrh;
        uniform sampler2D uCbMeadowAlbedo;
        uniform sampler2D uCbMeadowNrh;
        uniform sampler2D uCbMudAlbedo;
        uniform sampler2D uCbMudNrh;
        varying vec3 vCormorantWorld;

        vec2 cbSandUv;
        vec2 cbOlivineUv;
        vec2 cbMeadowUv;
        vec2 cbMudUv;
        vec4 cbPbrWeights;
        vec4 cbSandNrhValue;
        vec4 cbOlivineNrhValue;
        vec4 cbMeadowNrhValue;
        vec4 cbMudNrhValue;
        float cbSurfaceWetness;

        float cbHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float cbNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 q = fract(p);
          vec2 u = q * q * (3.0 - 2.0 * q);
          return mix(
            mix(cbHash(i), cbHash(i + vec2(1.0, 0.0)), u.x),
            mix(cbHash(i + vec2(0.0, 1.0)), cbHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float cbCoastZ(float x) {
          return -22.0 + sin(x * 0.052 + 0.6) * 3.6 + sin(x * 0.021 - 1.4) * 2.4;
        }
        float cbEllipseDistance(vec2 p, vec2 center, vec2 radii) {
          vec2 localPoint = (p - center) / radii;
          return length(localPoint);
        }
        float cbLagoonField(vec2 p) {
          float northLagoon = cbEllipseDistance(p, vec2(-8.0, -1.0), vec2(28.0, 14.0));
          float southLagoon = cbEllipseDistance(p, vec2(14.0, 7.0), vec2(20.0, 10.0));
          return min(northLagoon, southLagoon);
        }
        float cbSegmentDistance(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
          return length(p - (a + ab * t));
        }
        float cbTrailDistance(vec2 p) {
          float distanceToTrail = cbSegmentDistance(p, vec2(-38.0, 25.0), vec2(-24.0, 14.0));
          distanceToTrail = min(distanceToTrail, cbSegmentDistance(p, vec2(-24.0, 14.0), vec2(-8.0, 10.0)));
          distanceToTrail = min(distanceToTrail, cbSegmentDistance(p, vec2(-8.0, 10.0), vec2(10.0, 15.0)));
          distanceToTrail = min(distanceToTrail, cbSegmentDistance(p, vec2(10.0, 15.0), vec2(31.0, 27.0)));
          return distanceToTrail + (cbNoise(p * 0.55 + vec2(4.0, -7.0)) - 0.5) * 0.64;
        }
        float cbRimMask(vec2 p, float shoreDistance) {
          float northRim = smoothstep(17.0, 41.0, -p.y);
          float eastRim = smoothstep(31.0, 51.0, p.x) * 0.75;
          float westRim = smoothstep(42.0, 55.0, -p.x) * 0.62;
          float brokenRim = 0.78 + (cbNoise(p * vec2(0.22, 0.24) + vec2(-9.0, 3.0)) - 0.5) * 0.44;
          return clamp(max(northRim, max(eastRim, westRim)) * brokenRim, 0.0, 1.0)
            * smoothstep(19.0, 34.0, shoreDistance);
        }
        vec4 cbLayerWeights(vec2 p) {
          float shoreDistance = p.y - cbCoastZ(p.x);
          float boundaryNoise = (cbNoise(p * 0.085 + vec2(8.0, -3.0)) - 0.5) * 5.0;
          float lagoonDistance = cbLagoonField(p);
          float lagoonInland = smoothstep(9.0, 18.0, shoreDistance);
          float mudCore = lagoonInland * (1.0 - smoothstep(1.18, 1.5, lagoonDistance));
          float mudApron = lagoonInland * (1.0 - smoothstep(1.42, 1.78, lagoonDistance)) * 0.32;
          float mudWeight = clamp(max(mudCore, mudApron), 0.0, 1.0);

          float trailDistance = cbTrailDistance(p);
          float trailCore = 1.0 - smoothstep(1.35, 4.6, trailDistance);
          float trailShoulder = (1.0 - smoothstep(3.6, 7.6, trailDistance)) * 0.34;
          float mineralBand = smoothstep(2.5, 8.5, shoreDistance + boundaryNoise)
            * (1.0 - smoothstep(19.0, 29.0, shoreDistance + boundaryNoise)) * 0.36;
          float olivineWeight = max(trailCore, max(trailShoulder, mineralBand)) * (1.0 - mudWeight * 0.9);

          float inland = smoothstep(15.0, 29.0, shoreDistance + boundaryNoise);
          float meadowVariation = cbNoise(p * 0.11 + vec2(-6.0, 12.0));
          float meadowWeight = inland * mix(0.74, 0.98, meadowVariation)
            * (1.0 - mudWeight * 0.92)
            * (1.0 - trailCore * 0.88);
          float sandWeight = max(0.0, 1.0 - mudWeight - olivineWeight - meadowWeight);
          vec4 weights = vec4(sandWeight, olivineWeight, meadowWeight, mudWeight);
          return weights / max(dot(weights, vec4(1.0)), 0.0001);
        }
        vec2 cbNormalSlope(vec4 nrhValue, float strength) {
          vec2 xy = nrhValue.rg * 2.0 - 1.0;
          float z = sqrt(max(1.0 - min(dot(xy, xy), 0.98), 0.02));
          return (xy / max(z, 0.18)) * strength;
        }`;
}

function colorFragment() {
  return /* glsl */`
        vec2 cbPosition = vCormorantWorld.xz;
        float cbShoreDistance = cbPosition.y - cbCoastZ(cbPosition.x);
        float cbLagoonDistance = cbLagoonField(cbPosition);
        float cbLagoonInland = smoothstep(9.0, 18.0, cbShoreDistance);
        float cbRim = cbRimMask(cbPosition, cbShoreDistance);
        cbSandUv = cbPosition * ${f(LAYERS.sand.scale)} + vec2(0.13, -0.21);
        cbOlivineUv = cbPosition * ${f(LAYERS.olivine.scale)} + vec2(-0.31, 0.17);
        cbMeadowUv = cbPosition * ${f(LAYERS.meadow.scale)} + vec2(0.23, 0.37);
        cbMudUv = cbPosition * ${f(LAYERS.mud.scale)} + vec2(-0.19, -0.29);

        cbSandNrhValue = texture2D(uCbSandNrh, cbSandUv);
        cbOlivineNrhValue = texture2D(uCbOlivineNrh, cbOlivineUv);
        cbMeadowNrhValue = texture2D(uCbMeadowNrh, cbMeadowUv);
        cbMudNrhValue = texture2D(uCbMudNrh, cbMudUv);
        cbPbrWeights = cbLayerWeights(cbPosition);
        vec4 cbHeightBias = mix(
          vec4(0.94),
          vec4(1.06),
          vec4(cbSandNrhValue.a, cbOlivineNrhValue.a, cbMeadowNrhValue.a, cbMudNrhValue.a)
        );
        cbPbrWeights *= cbHeightBias;
        cbPbrWeights /= max(dot(cbPbrWeights, vec4(1.0)), 0.0001);

        // Albedos are uploaded as sRGB textures. Three returns linear values,
        // so these lookups must not be manually decoded again.
        vec3 cbSandColor = texture2D(uCbSandAlbedo, cbSandUv).rgb * vec3(0.98, 0.98, 0.91);
        vec3 cbOlivineColor = texture2D(uCbOlivineAlbedo, cbOlivineUv).rgb * vec3(0.92, 0.98, 0.78);
        vec3 cbMeadowSource = texture2D(uCbMeadowAlbedo, cbMeadowUv).rgb;
        float cbMeadowLuminance = dot(cbMeadowSource, vec3(0.2126, 0.7152, 0.0722));
        vec3 cbMeadowColor = mix(vec3(cbMeadowLuminance), cbMeadowSource, 0.5)
          * vec3(1.12, 1.24, 0.94);
        cbMeadowColor = mix(cbMeadowColor, vec3(0.2, 0.29, 0.13), 0.16);
        vec3 cbMudColor = texture2D(uCbMudAlbedo, cbMudUv).rgb * vec3(0.82, 0.85, 0.74);
        vec3 cbColor = cbSandColor * cbPbrWeights.x
          + cbOlivineColor * cbPbrWeights.y
          + cbMeadowColor * cbPbrWeights.z
          + cbMudColor * cbPbrWeights.w;

        float cbMacro = cbNoise(cbPosition * 0.047 + vec2(13.0, -5.0));
        float cbMeadowTone = cbNoise(cbPosition * 0.105 + vec2(-4.0, 11.0));
        vec3 cbGreyGreen = mix(vec3(0.98, 0.96, 0.84), vec3(0.84, 0.97, 0.76), cbMeadowTone);
        cbColor *= mix(vec3(1.0), cbGreyGreen, cbPbrWeights.z * 0.18);
        cbColor *= mix(0.93, 1.07, cbMacro);
        cbColor *= mix(vec3(1.0), vec3(0.88, 0.75, 0.63), cbRim * 0.38);

        float cbSwashCycle = sin(uSwashTime * 0.5984) * 0.5 + 0.5;
        float cbSwashDistance = 0.18 + cbSwashCycle * 1.4
          + sin(cbPosition.x * 0.16 + uSwashTime * 0.25) * 0.18;
        float cbFoam = (1.0 - smoothstep(0.04, 0.46, abs(cbShoreDistance - cbSwashDistance)))
          * step(0.0, cbShoreDistance);
        float cbWetSand = (1.0 - smoothstep(cbSwashDistance * 0.36, cbSwashDistance + 1.5, cbShoreDistance))
          * step(0.0, cbShoreDistance);
        float cbLagoonWet = cbLagoonInland * (1.0 - smoothstep(1.02, 1.52, cbLagoonDistance));
        cbSurfaceWetness = max(cbWetSand * cbPbrWeights.x, cbLagoonWet * cbPbrWeights.w);
        cbColor = mix(cbColor, cbColor * vec3(0.66, 0.72, 0.68), cbSurfaceWetness * 0.5);
        cbColor = mix(cbColor, vec3(0.86, 0.89, 0.81), cbFoam * 0.3);

        float cbSubmerged = 1.0 - smoothstep(-1.0, 0.12, cbShoreDistance);
        float cbDepth = clamp((-0.1 - cbShoreDistance) / 2.4, 0.0, 1.0);
        vec3 cbShallowTint = mix(vec3(0.25, 0.36, 0.31), vec3(0.35, 0.55, 0.48), cbDepth);
        cbColor = mix(cbColor, cbShallowTint, cbSubmerged * 0.34);
        diffuseColor.rgb = clamp(cbColor, 0.0, 1.0);`;
}

function roughnessFragment() {
  return /* glsl */`
        float cbSandRoughness = mix(${f(LAYERS.sand.roughnessMin)}, ${f(LAYERS.sand.roughnessMax)}, cbSandNrhValue.b);
        float cbOlivineRoughness = mix(${f(LAYERS.olivine.roughnessMin)}, ${f(LAYERS.olivine.roughnessMax)}, cbOlivineNrhValue.b);
        float cbMeadowRoughness = mix(0.82, 0.96, cbMeadowNrhValue.b);
        float cbMudRoughness = mix(${f(LAYERS.mud.roughnessMin)}, ${f(LAYERS.mud.roughnessMax)}, cbMudNrhValue.b);
        float cbMappedRoughness = dot(
          cbPbrWeights,
          vec4(cbSandRoughness, cbOlivineRoughness, cbMeadowRoughness, cbMudRoughness)
        );
        cbMappedRoughness = mix(cbMappedRoughness, max(0.42, cbMappedRoughness - 0.24), cbSurfaceWetness);
        roughnessFactor = mix(roughnessFactor, cbMappedRoughness, 0.95);`;
}

function normalFragment() {
  return /* glsl */`
        vec2 cbSandSlope = cbNormalSlope(cbSandNrhValue, ${f(LAYERS.sand.normalStrength)});
        vec2 cbOlivineSlope = cbNormalSlope(cbOlivineNrhValue, ${f(LAYERS.olivine.normalStrength)});
        vec2 cbMeadowSlope = cbNormalSlope(cbMeadowNrhValue, ${f(LAYERS.meadow.normalStrength)});
        vec2 cbMudSlope = cbNormalSlope(cbMudNrhValue, ${f(LAYERS.mud.normalStrength)});
        vec2 cbMappedSlope = cbSandSlope * cbPbrWeights.x
          + cbOlivineSlope * cbPbrWeights.y
          + cbMeadowSlope * cbPbrWeights.z
          + cbMudSlope * cbPbrWeights.w;
        cbMappedSlope *= mix(1.0, 0.72, cbSurfaceWetness);

        vec3 cbWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 cbWorldX = normalize(vec3(1.0, 0.0, 0.0) - cbWorldNormal * cbWorldNormal.x);
        vec3 cbWorldZ = normalize(cross(cbWorldX, cbWorldNormal));
        vec3 cbMappedWorldNormal = normalize(
          cbWorldNormal + cbWorldX * cbMappedSlope.x + cbWorldZ * cbMappedSlope.y
        );
        normal = normalize(mat3(viewMatrix) * cbMappedWorldNormal);`;
}

export function createCormorantBayTerrainMaterial() {
  const packedLayers = Object.fromEntries(
    Object.entries(LAYERS).map(([name, layer]) => [name, loadPackedPbrTerrainSet(layer)]),
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
    shader.uniforms.uSwashTime = { value: 0 };
    for (const [name, layer] of Object.entries(packedLayers)) {
      const title = name[0].toUpperCase() + name.slice(1);
      shader.uniforms[`uCb${title}Albedo`] = { value: layer.albedo };
      shader.uniforms[`uCb${title}Nrh`] = { value: layer.nrh };
    }
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCormorantWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCormorantWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
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

  material.customProgramCacheKey = () => 'cormorant-bay-layered-wetland-pbr-v1';
  material.needsUpdate = true;
  return material;
}
