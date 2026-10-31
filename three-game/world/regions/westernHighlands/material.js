import * as THREE from 'three';
import {
  disposePackedPbrTerrainSet,
  FLOREANA_PBR_TEXTURES,
  loadPackedPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

// Western Highlands cloud-forest floor.
//
// Four packed PBR layers (albedo + normal/roughness/height), weighted by the
// same masks terrain.js uses for the biome: photographed grass for the fern
// clearings, loam for the leaf-litter floor under the scalesia, weathered
// basalt where the garua stream and the ridge shoulders break through, and
// brackish mud for the churned trail. A moss grade and a leaf-litter grade
// are laid over the photographs so the canopy floor reads green-brown and
// wet rather than as one smeared tone, and the packed normals carry the
// relief that the previous procedural bump only hinted at.
//
// The trail, clearing and wet-hollow masks mirror terrain.js
// (WESTERN_HIGHLANDS_TRAIL, westernHighlandsClearingMask,
// westernHighlandsWetHollowMask). Change them together.

const LAYERS = {
  grass: FLOREANA_PBR_TEXTURES.grass,
  loam: FLOREANA_PBR_TEXTURES.loam,
  basalt: FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt,
  mud: FLOREANA_PBR_TEXTURES.brackishMud,
};

const SCALE = {
  grass: LAYERS.grass.scale * 2.0,
  loam: LAYERS.loam.scale * 1.3,
  basalt: LAYERS.basalt.scale * 1.1,
  mud: LAYERS.mud.scale * 1.2,
};

const ROUGHNESS = {
  grass: [0.82, 0.97],
  loam: [0.72, 0.95],
  basalt: [0.6, 0.9],
  mud: [LAYERS.mud.roughnessMin ?? 0.5, LAYERS.mud.roughnessMax ?? 0.85],
};

function f(value) {
  return Number(value).toFixed(3);
}

function fragmentCommon() {
  return /* glsl */`
        uniform sampler2D uWhGrassAlbedo;
        uniform sampler2D uWhGrassNrh;
        uniform sampler2D uWhLoamAlbedo;
        uniform sampler2D uWhLoamNrh;
        uniform sampler2D uWhBasaltAlbedo;
        uniform sampler2D uWhBasaltNrh;
        uniform sampler2D uWhMudAlbedo;
        uniform sampler2D uWhMudNrh;
        uniform vec3 uMistGreen;
        uniform float uRimIntensity;
        varying vec3 vWhWorld;

        vec2 whGrassUv;
        vec2 whLoamUv;
        vec2 whBasaltUv;
        vec2 whMudUv;
        vec4 whWeights;
        vec4 whGrassNrh;
        vec4 whLoamNrh;
        vec4 whBasaltNrh;
        vec4 whMudNrh;
        float whWetness;

        float whHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float whNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 q = fract(p);
          vec2 u = q * q * (3.0 - 2.0 * q);
          return mix(mix(whHash(i), whHash(i + vec2(1.0, 0.0)), u.x), mix(whHash(i + vec2(0.0, 1.0)), whHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float whFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            value += whNoise(p) * amp;
            p = mat2(1.58, -0.92, 0.92, 1.58) * p + vec2(7.3, -3.1);
            amp *= 0.52;
          }
          return value;
        }
        float whTrailDistance(vec2 p) {
          vec2 nodes[9];
          nodes[0] = vec2(1.5, -43.0);
          nodes[1] = vec2(-5.5, -33.0);
          nodes[2] = vec2(-2.2, -22.0);
          nodes[3] = vec2(7.5, -12.0);
          nodes[4] = vec2(3.0, -1.0);
          nodes[5] = vec2(-8.5, 9.0);
          nodes[6] = vec2(-3.5, 20.0);
          nodes[7] = vec2(8.0, 31.0);
          nodes[8] = vec2(2.5, 43.0);
          float d = 999.0;
          for (int i = 0; i < 8; i++) {
            vec2 a = nodes[i];
            vec2 ab = nodes[i + 1] - a;
            float t = clamp(dot(p - a, ab) / max(0.001, dot(ab, ab)), 0.0, 1.0);
            d = min(d, length(p - (a + ab * t)));
          }
          return d + (whFbm(p * 0.35 + vec2(2.0, -5.0)) - 0.5) * 0.7;
        }
        float whClearing(vec2 p) {
          float c1 = exp(-(pow((p.x - 6.0) / 12.0, 2.0) + pow((p.y + 18.0) / 8.0, 2.0)) * 2.1);
          float c2 = exp(-(pow((p.x + 8.0) / 10.0, 2.0) + pow((p.y - 11.0) / 7.0, 2.0)) * 2.1) * 0.82;
          float c3 = exp(-(pow((p.x - 8.0) / 11.0, 2.0) + pow((p.y - 33.0) / 8.0, 2.0)) * 2.1) * 0.72;
          return clamp(max(max(c1, c2), c3), 0.0, 1.0);
        }
        float whWet(vec2 p) {
          float streamX = sin(p.y * 0.115 + 0.8) * 8.5 - 10.5 + sin(p.y * 0.31) * 2.2;
          float stream = exp(-pow((p.x - streamX) / 5.2, 2.0));
          float lowerBench = smoothstep(-38.0, -10.0, p.y) * (1.0 - smoothstep(18.0, 35.0, p.y));
          float pocket = exp(-pow((p.x + 18.0) / 13.0, 2.0) - pow((p.y - 4.0) / 18.0, 2.0)) * 0.75;
          return clamp(max(stream * lowerBench, pocket), 0.0, 1.0);
        }
        float whRidge(vec2 p) {
          return max(exp(-pow((p.x + 38.0) / 14.0, 2.0)), exp(-pow((p.x - 34.0) / 16.0, 2.0)));
        }
        vec4 whLayerWeights(vec2 p) {
          float d = whTrailDistance(p);
          float trailCore = 1.0 - smoothstep(1.1, 3.6, d);
          float trailEdge = 1.0 - smoothstep(1.4, 5.6, d);
          float clearing = whClearing(p);
          float wet = whWet(p);
          float ridge = whRidge(p);
          // Basalt shows through in the stream bed and on the ridge
          // shoulders, broken up so it reads as outcrop, not a band.
          float outcrop = smoothstep(0.48, 0.74, whFbm(p * 0.21 + vec2(3.0, 9.0)));
          float basaltWeight = clamp(wet * 0.55 + ridge * outcrop * 0.7, 0.0, 0.85) * (1.0 - trailCore);
          float mudWeight = clamp(trailCore * 0.9 + trailEdge * wet * 0.35, 0.0, 1.0);
          float grassWeight = clamp(clearing * 1.1 + trailEdge * (1.0 - trailCore) * 0.45, 0.0, 1.0)
            * (1.0 - mudWeight) * (1.0 - basaltWeight * 0.7);
          float loamWeight = max(0.0, 1.0 - grassWeight - mudWeight - basaltWeight);
          vec4 weights = vec4(grassWeight, loamWeight, basaltWeight, mudWeight);
          return weights / max(dot(weights, vec4(1.0)), 0.0001);
        }
        vec2 whNormalSlope(vec4 nrh, float strength) {
          vec2 xy = nrh.rg * 2.0 - 1.0;
          float z = sqrt(max(1.0 - min(dot(xy, xy), 0.98), 0.02));
          return (xy / max(z, 0.18)) * strength;
        }`;
}

function colorFragment() {
  return /* glsl */`
        vec2 whP = vWhWorld.xz;
        whGrassUv = whP * ${f(SCALE.grass)} + vec2(0.17, -0.11);
        whLoamUv = whP * ${f(SCALE.loam)} + vec2(-0.27, 0.21);
        whBasaltUv = whP * ${f(SCALE.basalt)} + vec2(0.09, 0.33);
        whMudUv = whP * ${f(SCALE.mud)} + vec2(-0.13, -0.23);
        whGrassNrh = texture2D(uWhGrassNrh, whGrassUv);
        whLoamNrh = texture2D(uWhLoamNrh, whLoamUv);
        whBasaltNrh = texture2D(uWhBasaltNrh, whBasaltUv);
        whMudNrh = texture2D(uWhMudNrh, whMudUv);
        whWeights = whLayerWeights(whP);
        // Height-biased blend: the taller texel wins at layer seams.
        whWeights *= mix(vec4(0.92), vec4(1.08), vec4(whGrassNrh.a, whLoamNrh.a, whBasaltNrh.a, whMudNrh.a));
        whWeights /= max(dot(whWeights, vec4(1.0)), 0.0001);

        vec3 whGrass = texture2D(uWhGrassAlbedo, whGrassUv).rgb;
        vec3 whLoam = texture2D(uWhLoamAlbedo, whLoamUv).rgb;
        vec3 whBasalt = texture2D(uWhBasaltAlbedo, whBasaltUv).rgb;
        vec3 whMud = texture2D(uWhMudAlbedo, whMudUv).rgb;

        float whClear = whClearing(whP);
        float whWetMask = whWet(whP);
        float whTrailMask = 1.0 - smoothstep(1.1, 3.6, whTrailDistance(whP));
        float whCanopy = clamp((0.72 + (whFbm(whP * 0.24) - 0.5) * 0.34) * (1.0 - whTrailMask * 0.75) * (1.0 - whClear * 0.82), 0.0, 1.0);

        // Leaf litter: the loam photograph warmed and speckled with fallen
        // scalesia leaves, brown and olive.
        float whLeafSpot = smoothstep(0.55, 0.8, whNoise(whP * 5.3)) * (0.6 + whNoise(whP * 1.7) * 0.4);
        vec3 whLitter = whLoam * vec3(1.08, 0.98, 0.78);
        whLitter = mix(whLitter, vec3(0.32, 0.25, 0.12), whLeafSpot * 0.45);
        // Moss: a cushion grade over litter and stone where the garua
        // keeps things wet and shaded.
        float whMossField = smoothstep(0.22, 0.86, whFbm(whP * 0.38 + vec2(-4.0, 2.0)) * 0.7 + whNoise(whP * 2.1) * 0.3);
        float whMossAmount = clamp(whMossField * (whCanopy * 0.75 + whWetMask * 0.6) + whWetMask * 0.2, 0.0, 0.9);
        vec3 whMossTint = mix(vec3(0.2, 0.34, 0.13), vec3(0.38, 0.5, 0.2), whNoise(whP * 2.4));
        whLitter = mix(whLitter, whLitter * 0.5 + whMossTint * 0.62, whMossAmount * 0.8);
        vec3 whStone = mix(whBasalt * vec3(0.86, 0.94, 0.88), whBasalt * 0.4 + whMossTint * 0.6, whMossAmount * 0.85);
        vec3 whMeadow = whGrass * mix(vec3(0.92, 1.1, 0.78), vec3(0.78, 1.0, 0.66), whNoise(whP * 0.11));
        vec3 whTrail = mix(whMud, whLoam, 0.35) * vec3(1.22, 1.1, 0.95);

        vec3 whColor = whMeadow * whWeights.x + whLitter * whWeights.y + whStone * whWeights.z + whTrail * whWeights.w;

        // Scalesia roots snaking across the floor near trunks.
        float whRoots = smoothstep(0.035, 0.0, abs(sin(whP.x * 0.34 + sin(whP.y * 0.19) * 1.7)) - 0.035) * whCanopy * (1.0 - whTrailMask);
        whColor = mix(whColor, vec3(0.12, 0.085, 0.055), whRoots * 0.45);
        // Canopy shade and the cool garua lift in openings.
        whColor *= mix(1.0, 0.8, whCanopy * 0.5);
        whColor *= 0.92 + whFbm(whP * 0.05) * 0.16;
        whColor = mix(whColor, uMistGreen * 0.6, whClear * 0.04 + whWetMask * 0.06);

        whWetness = clamp(whWetMask * 0.8 + whTrailMask * 0.45 + whMossAmount * 0.2, 0.0, 1.0);
        whColor = mix(whColor, whColor * vec3(0.7, 0.76, 0.7), whWetness * 0.4);
        diffuseColor.rgb = clamp(whColor, 0.0, 1.0);`;
}

function roughnessFragment() {
  return /* glsl */`
        float whR = dot(whWeights, vec4(
          mix(${f(ROUGHNESS.grass[0])}, ${f(ROUGHNESS.grass[1])}, whGrassNrh.b),
          mix(${f(ROUGHNESS.loam[0])}, ${f(ROUGHNESS.loam[1])}, whLoamNrh.b),
          mix(${f(ROUGHNESS.basalt[0])}, ${f(ROUGHNESS.basalt[1])}, whBasaltNrh.b),
          mix(${f(ROUGHNESS.mud[0])}, ${f(ROUGHNESS.mud[1])}, whMudNrh.b)
        ));
        // Wet trail and stream stones take a soft sheen; nothing goes glossy.
        whR = mix(whR, max(0.5, whR - 0.24), whWetness);
        roughnessFactor = mix(roughnessFactor, whR, 0.95);`;
}

function normalFragment() {
  return /* glsl */`
        vec2 whSlope = whNormalSlope(whGrassNrh, ${f(LAYERS.grass.normalStrength)}) * whWeights.x
          + whNormalSlope(whLoamNrh, ${f(LAYERS.loam.normalStrength * 1.2)}) * whWeights.y
          + whNormalSlope(whBasaltNrh, ${f(LAYERS.basalt.normalStrength * 1.25)}) * whWeights.z
          + whNormalSlope(whMudNrh, ${f(LAYERS.mud.normalStrength)}) * whWeights.w;
        vec3 whWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 whWorldX = normalize(vec3(1.0, 0.0, 0.0) - whWorldNormal * whWorldNormal.x);
        vec3 whWorldZ = normalize(cross(whWorldX, whWorldNormal));
        normal = normalize(mat3(viewMatrix) * normalize(whWorldNormal + whWorldX * whSlope.x + whWorldZ * whSlope.y));`;
}

export function createWesternHighlandsTerrainMaterial() {
  const packed = Object.fromEntries(
    Object.entries(LAYERS).map(([name, layer]) => [name, loadPackedPbrTerrainSet(layer)]),
  );
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    Object.values(packed).forEach(disposePackedPbrTerrainSet);
  });

  material.onBeforeCompile = shader => {
    for (const [name, layer] of Object.entries(packed)) {
      const title = name[0].toUpperCase() + name.slice(1);
      shader.uniforms[`uWh${title}Albedo`] = { value: layer.albedo };
      shader.uniforms[`uWh${title}Nrh`] = { value: layer.nrh };
    }
    shader.uniforms.uMistGreen = { value: new THREE.Color('#9fb59b') };
    shader.uniforms.uRimIntensity = { value: 0.045 };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWhWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWhWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${fragmentCommon()}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${colorFragment()}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
${roughnessFragment()}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
${normalFragment()}`)
      .replace('#include <dithering_fragment>', `float forestRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.4);
        outgoingLight += uMistGreen * forestRim * uRimIntensity;
        #include <dithering_fragment>`);
  };
  material.customProgramCacheKey = () => 'western-highlands-packed-pbr-v5';
  material.needsUpdate = true;
  return material;
}
