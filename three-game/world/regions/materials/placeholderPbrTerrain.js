import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from './pbrTerrainTextures';

const PROFILE_IDS = {
  dry: 0,
  lava: 1,
  beach: 2,
  wetland: 3,
  highland: 4,
  grass: 5,
};

const PROFILE_BY_TYPE = {
  bay: 'beach',
  beach: 'beach',
  ocean: 'beach',
  reef: 'beach',
  coastallava: 'lava',
  lavafield: 'lava',
  promontory: 'lava',
  cliff: 'lava',
  wetland: 'wetland',
  forest: 'highland',
  highland: 'highland',
  grassland: 'grass',
  settlement: 'grass',
  clearing: 'grass',
  camp: 'dry',
  coastalTrail: 'dry',
  scrubland: 'dry',
  shipwreck: 'beach',
};

const PROFILE_LAYERS = {
  dry: ['redCinderDirt', 'coastalScrub', 'dryGrassLitter'],
  lava: ['darkBasaltGravel', 'wetBasalt', 'redCinderDirt'],
  beach: ['olivineBeach', 'sandyTuff', 'wetBasalt'],
  wetland: ['mangroveLagoon', 'loam', 'grass'],
  highland: ['loam', 'grass', 'wetBasalt'],
  grass: ['grass', 'loam', 'coastalGrassShoulder'],
};

function terrainProfile(regionType) {
  return PROFILE_BY_TYPE[regionType] || 'dry';
}

function loadLayers(profileName) {
  return PROFILE_LAYERS[profileName].map(key => ({
    key,
    textureSet: FLOREANA_PBR_TEXTURES[key],
    loaded: loadPbrTerrainSet(FLOREANA_PBR_TEXTURES[key]),
  }));
}

const COMMON_GLSL = /* glsl */`
        uniform float uPlaceholderProfile;
        uniform sampler2D uPlaceholderAlbedo0;
        uniform sampler2D uPlaceholderNormal0;
        uniform sampler2D uPlaceholderRoughness0;
        uniform sampler2D uPlaceholderAlbedo1;
        uniform sampler2D uPlaceholderNormal1;
        uniform sampler2D uPlaceholderRoughness1;
        uniform sampler2D uPlaceholderAlbedo2;
        uniform sampler2D uPlaceholderNormal2;
        uniform sampler2D uPlaceholderRoughness2;
        uniform vec3 uPlaceholderScale;
        uniform vec3 uPlaceholderNormalStrength;
        varying vec3 vPlaceholderWorld;

        float phHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float phNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(phHash(i), phHash(i + vec2(1.0, 0.0)), u.x),
            mix(phHash(i + vec2(0.0, 1.0)), phHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float phFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += phNoise(p) * amp;
            p = mat2(1.63, -1.02, 1.02, 1.63) * p + vec2(4.1, -2.8);
            amp *= 0.52;
          }
          return value;
        }
        vec2 phRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 phSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 phAlbedo(sampler2D tex, vec2 p, float scale, float salt) {
          float broad = phFbm(p * 0.061 + vec2(13.0 + salt, -5.0));
          vec2 uvA = p * scale + vec2(0.17 + salt * 0.07, -0.09);
          vec2 uvB = phRotate(p, 0.72 + salt * 0.11) * (scale * 0.61) + vec2(-0.31, 0.23 + salt * 0.05);
          vec3 a = phSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = phSrgbToLinear(texture2D(tex, uvB).rgb);
          return mix(a, b, 0.16 + broad * 0.14);
        }
        float phRoughness(sampler2D tex, vec2 p, float scale, float salt) {
          vec2 uv = p * scale + vec2(0.17 + salt * 0.07, -0.09);
          return clamp(texture2D(tex, uv).r, 0.22, 1.0);
        }
        vec3 phNormalMap(sampler2D tex, vec2 p, float scale, float strength, float salt) {
          vec2 uv = p * scale + vec2(0.17 + salt * 0.07, -0.09);
          vec3 mapped = texture2D(tex, uv).xyz * 2.0 - 1.0;
          return normalize(vec3(mapped.xy * strength, max(mapped.z, 0.16)));
        }
        vec3 phLayerWeights(vec3 surfaceNormal) {
          vec2 p = vPlaceholderWorld.xz;
          float h = vPlaceholderWorld.y;
          float slope = clamp(1.0 - abs(surfaceNormal.y), 0.0, 1.0);
          float broad = phFbm(p * 0.07 + vec2(3.0, -9.0));
          float fine = phFbm(p * 0.39 + vec2(-7.0, 2.0));
          float lowWet = 1.0 - smoothstep(-0.95, -0.12, h);
          float high = smoothstep(2.2, 7.8, h);
          float w1 = 0.0;
          float w2 = 0.0;

          if (uPlaceholderProfile < 0.5) {
            // Dry scrub and trails: red dirt base, scrub pockets, dry litter.
            w1 = smoothstep(0.4, 0.78, broad) * (1.0 - slope * 0.42) * 0.72;
            w2 = smoothstep(0.42, 0.82, fine) * (0.35 + high * 0.42);
          } else if (uPlaceholderProfile < 1.5) {
            // Lava: dark gravel base, wet basalt low/steep, cinder dust inland.
            w1 = clamp(max(lowWet * 0.85, slope * 0.62), 0.0, 0.92);
            w2 = smoothstep(0.48, 0.86, broad) * (1.0 - lowWet * 0.72) * 0.58;
          } else if (uPlaceholderProfile < 2.5) {
            // Beach/reef: olivine sand base, pale tuff patches, wet basalt edge.
            w1 = smoothstep(0.32, 0.74, broad) * (1.0 - lowWet * 0.4) * 0.68;
            w2 = clamp(lowWet * 0.64 + slope * 0.32, 0.0, 0.86);
          } else if (uPlaceholderProfile < 3.5) {
            // Wetland: lagoon mud base, loam hummocks, grassier high spots.
            w1 = smoothstep(0.35, 0.76, broad) * (1.0 - lowWet * 0.28) * 0.72;
            w2 = smoothstep(0.18, 0.82, high + fine * 0.22) * (1.0 - lowWet * 0.55) * 0.74;
          } else if (uPlaceholderProfile < 4.5) {
            // Highland/forest: loam base, grass clearings, wet dark gullies.
            w1 = smoothstep(0.38, 0.78, broad) * (1.0 - slope * 0.18) * 0.78;
            w2 = clamp(lowWet * 0.4 + slope * 0.32 + (1.0 - fine) * 0.12, 0.0, 0.62);
          } else {
            // Grass/settlement/clearings: grass base, loam scuffs, trampled shoulder.
            w1 = smoothstep(0.42, 0.82, 1.0 - broad) * 0.62;
            w2 = smoothstep(0.44, 0.84, fine) * (0.32 + slope * 0.22);
          }

          w1 = clamp(w1, 0.0, 0.95);
          w2 = clamp(w2 * (1.0 - w1 * 0.45), 0.0, 0.9);
          float w0 = max(0.0, 1.0 - w1 - w2);
          vec3 weights = vec3(w0, w1, w2);
          return weights / max(0.001, weights.x + weights.y + weights.z);
        }
`;

export function createPlaceholderPbrTerrainMaterial({ regionType = 'scrubland' } = {}) {
  const profileName = terrainProfile(regionType);
  const profileId = PROFILE_IDS[profileName] ?? PROFILE_IDS.dry;
  const layers = loadLayers(profileName);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    layers.forEach(layer => disposePbrTerrainSet(layer.loaded));
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.uPlaceholderProfile = { value: profileId };
    layers.forEach((layer, index) => {
      shader.uniforms[`uPlaceholderAlbedo${index}`] = { value: layer.loaded.albedo };
      shader.uniforms[`uPlaceholderNormal${index}`] = { value: layer.loaded.normal };
      shader.uniforms[`uPlaceholderRoughness${index}`] = { value: layer.loaded.roughness };
    });
    shader.uniforms.uPlaceholderScale = {
      value: new THREE.Vector3(
        layers[0].textureSet.scale,
        layers[1].textureSet.scale,
        layers[2].textureSet.scale,
      ),
    };
    shader.uniforms.uPlaceholderNormalStrength = {
      value: new THREE.Vector3(
        layers[0].textureSet.normalStrength,
        layers[1].textureSet.normalStrength,
        layers[2].textureSet.normalStrength,
      ),
    };
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPlaceholderWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPlaceholderWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 phSurfaceNormal = normalize(cross(dFdx(vPlaceholderWorld), dFdy(vPlaceholderWorld)));
        if (phSurfaceNormal.y < 0.0) phSurfaceNormal *= -1.0;
        vec3 phWeights = phLayerWeights(phSurfaceNormal);
        vec2 phP = vPlaceholderWorld.xz;
        vec3 phColor0 = phAlbedo(uPlaceholderAlbedo0, phP, uPlaceholderScale.x, 0.0);
        vec3 phColor1 = phAlbedo(uPlaceholderAlbedo1, phP, uPlaceholderScale.y, 1.0);
        vec3 phColor2 = phAlbedo(uPlaceholderAlbedo2, phP, uPlaceholderScale.z, 2.0);
        vec3 phColor = phColor0 * phWeights.x + phColor1 * phWeights.y + phColor2 * phWeights.z;
        phColor *= 0.92 + phFbm(phP * 1.8 + vec2(5.0, -3.0)) * 0.14;
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(phColor, 0.0, 1.0), 0.88);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec3 phRoughNormal = normalize(cross(dFdx(vPlaceholderWorld), dFdy(vPlaceholderWorld)));
        if (phRoughNormal.y < 0.0) phRoughNormal *= -1.0;
        vec3 phRoughWeights = phLayerWeights(phRoughNormal);
        vec2 phRp = vPlaceholderWorld.xz;
        float phRough = phRoughness(uPlaceholderRoughness0, phRp, uPlaceholderScale.x, 0.0) * phRoughWeights.x
          + phRoughness(uPlaceholderRoughness1, phRp, uPlaceholderScale.y, 1.0) * phRoughWeights.y
          + phRoughness(uPlaceholderRoughness2, phRp, uPlaceholderScale.z, 2.0) * phRoughWeights.z;
        if (uPlaceholderProfile > 0.5 && uPlaceholderProfile < 1.5) {
          float phBasaltCover = clamp(phRoughWeights.x + phRoughWeights.y, 0.0, 1.0);
          phRough = max(phRough, mix(0.76, 0.88, phBasaltCover));
          phRough = mix(phRough, 0.93, phBasaltCover * 0.28);
        }
        roughnessFactor = mix(roughnessFactor, clamp(phRough, 0.32, 0.98), 0.82);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec3 phNormalWeights = phLayerWeights(normal);
        vec2 phNp = vPlaceholderWorld.xz;
        vec3 phN0 = phNormalMap(uPlaceholderNormal0, phNp, uPlaceholderScale.x, uPlaceholderNormalStrength.x, 0.0);
        vec3 phN1 = phNormalMap(uPlaceholderNormal1, phNp, uPlaceholderScale.y, uPlaceholderNormalStrength.y, 1.0);
        vec3 phN2 = phNormalMap(uPlaceholderNormal2, phNp, uPlaceholderScale.z, uPlaceholderNormalStrength.z, 2.0);
        vec3 phMapped = normalize(phN0 * phNormalWeights.x + phN1 * phNormalWeights.y + phN2 * phNormalWeights.z);
        vec3 phSurface = normal;
        vec3 phTangentX = normalize(vec3(1.0, 0.0, 0.0) - phSurface * dot(phSurface, vec3(1.0, 0.0, 0.0)));
        vec3 phTangentZ = normalize(cross(phTangentX, phSurface));
        vec3 phWorldMapped = normalize(phTangentX * phMapped.x + phTangentZ * phMapped.y + phSurface * phMapped.z);
        float phNormalMix = (uPlaceholderProfile > 0.5 && uPlaceholderProfile < 1.5) ? 0.62 : 0.78;
        normal = normalize(mix(normal, phWorldMapped, phNormalMix));`,
      );
  };

  material.customProgramCacheKey = () => `placeholder-pbr-terrain-${profileName}-v2`;
  material.needsUpdate = true;
  return material;
}
