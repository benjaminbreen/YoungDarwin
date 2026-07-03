import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  loadRepeatingTerrainTexture,
} from '../materials/pbrTerrainTextures';
import {
  createStandardFootPathSplatTexture,
  standardFootPathSplatGLSL,
  standardFootPathSplatUniforms,
} from '../../paths/standardPath';
import { BEACH_HUT_GARDENS, BEACH_HUT_PATHS } from './terrain';

const BEACH_HUT_SPLAT_BOUNDS = { originX: -42, originZ: -37, width: 84, depth: 74, size: 1024 };

function f(value) {
  return Number(value).toFixed(3);
}

function gardenMaskGLSL() {
  const gardenTerms = BEACH_HUT_GARDENS.map(plot => `
          {
            vec2 d = p - vec2(${f(plot.x)}, ${f(plot.z)});
            vec2 l = mat2(${f(Math.cos(plot.yaw))}, ${f(Math.sin(plot.yaw))}, ${f(-Math.sin(plot.yaw))}, ${f(Math.cos(plot.yaw))}) * d;
            float wob = (bhNoise(p * 0.48 + vec2(${f(plot.x)}, ${f(-plot.z)})) - 0.5) * 1.15;
            float outside = max(abs(l.x) - ${f(plot.halfX)} + wob, abs(l.y) - ${f(plot.halfZ)} + wob);
            float m = 1.0 - smoothstep(-1.05, 1.05, outside);
            if (m > garden.x) {
              float across = ${plot.rowAxis === 'x' ? 'l.y' : 'l.x'};
              garden = vec2(m, across * ${f((Math.PI * 2) / plot.rowSpacing)});
            }
          }`).join('');

  return /* glsl */`
        vec2 bhGardenInfo(vec2 p) {
          vec2 garden = vec2(0.0);${gardenTerms}
          return garden;
        }`;
}

function loadAlbedo(textureSet) {
  return loadRepeatingTerrainTexture(textureSet.albedo, {
    fallback: textureSet.fallbacks?.albedo || '#ffffff',
    colorSpace: THREE.SRGBColorSpace,
  });
}

export function createBeachWithHutTerrainMaterial() {
  const whiteSandAlbedo = loadAlbedo(FLOREANA_PBR_TEXTURES.whiteSand);
  const normalSandAlbedo = loadAlbedo(FLOREANA_PBR_TEXTURES.normalSand);
  const loamAlbedo = loadAlbedo(FLOREANA_PBR_TEXTURES.loam);
  const pathSplatTexture = createStandardFootPathSplatTexture({
    pathPoints: BEACH_HUT_PATHS,
    bounds: BEACH_HUT_SPLAT_BOUNDS,
  });
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    whiteSandAlbedo.dispose();
    normalSandAlbedo.dispose();
    loamAlbedo.dispose();
    pathSplatTexture.dispose();
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplatTexture, {
      bounds: BEACH_HUT_SPLAT_BOUNDS,
      textureUniform: 'uBeachHutPathSplat',
      boundsUniform: 'uBeachHutPathSplatBounds',
    }));
    shader.uniforms.rimColor = { value: new THREE.Color('#efd49b') };
    shader.uniforms.rimIntensity = { value: 0.04 };
    shader.uniforms.uSwashTime = { value: 0 };
    shader.uniforms.uBhWhiteSandAlbedo = { value: whiteSandAlbedo };
    shader.uniforms.uBhNormalSandAlbedo = { value: normalSandAlbedo };
    shader.uniforms.uBhLoamAlbedo = { value: loamAlbedo };
    shader.uniforms.uBhWhiteSandScale = { value: FLOREANA_PBR_TEXTURES.whiteSand.scale };
    shader.uniforms.uBhNormalSandScale = { value: FLOREANA_PBR_TEXTURES.normalSand.scale };
    shader.uniforms.uBhLoamScale = { value: FLOREANA_PBR_TEXTURES.loam.scale };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBeachHutWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBeachHutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 rimColor;
        uniform float rimIntensity;
        uniform float uSwashTime;
        uniform sampler2D uBhWhiteSandAlbedo;
        uniform sampler2D uBhNormalSandAlbedo;
        uniform sampler2D uBhLoamAlbedo;
        uniform float uBhWhiteSandScale;
        uniform float uBhNormalSandScale;
        uniform float uBhLoamScale;
        varying vec3 vBeachHutWorld;

        float bhHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float bhNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(bhHash(i), bhHash(i + vec2(1.0, 0.0)), u.x), mix(bhHash(i + vec2(0.0, 1.0)), bhHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float bhFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            value += bhNoise(p) * amp;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p + vec2(3.7, -2.6);
            amp *= 0.52;
          }
          return value;
        }
        vec2 bhRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 bhSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 bhAlbedo(sampler2D tex, vec2 p, float scale, float salt) {
          float broad = bhFbm(p * 0.058 + vec2(11.0 + salt, -5.0));
          vec2 uvA = p * scale + vec2(0.17 + salt * 0.07, -0.09);
          vec2 uvB = bhRotate(p, 0.72 + salt * 0.1) * (scale * 0.62) + vec2(-0.31, 0.23 + salt * 0.04);
          vec3 a = bhSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = bhSrgbToLinear(texture2D(tex, uvB).rgb);
          return mix(a, b, 0.13 + broad * 0.14);
        }
        float bhWestCoastX(float z) {
          float southBend = smoothstep(8.0, 31.0, z);
          return -29.5 + sin(z * 0.08 + 0.65) * 2.2 + sin(z * 0.027 - 1.1) * 1.15 + southBend * 5.7;
        }
        float bhSouthCoastZ(float x) {
          float westPocket = smoothstep(18.0, 38.0, -x);
          return 20.5 + sin(x * 0.074 - 0.8) * 2.25 + sin(x * 0.028 + 1.5) * 1.1 - westPocket * 7.2;
        }
        float bhCoastDistance(vec2 p) {
          return min(p.x - bhWestCoastX(p.y), bhSouthCoastZ(p.x) - p.y);
        }
        float bhRockMask(vec2 p) {
          float westSurf = exp(-(pow((p.x + 27.0) / 7.2, 2.0) + pow((p.y - 2.0) / 8.5, 2.0)));
          float southSurf = exp(-(pow((p.x - 12.0) / 8.4, 2.0) + pow((p.y - 23.0) / 5.8, 2.0)));
          float corner = exp(-(pow((p.x + 25.0) / 7.8, 2.0) + pow((p.y - 23.0) / 7.2, 2.0)));
          return max(westSurf, max(southSurf, corner));
        }
        ${standardFootPathSplatGLSL({
          functionName: 'bhPathSplat',
          textureUniform: 'uBeachHutPathSplat',
          boundsUniform: 'uBeachHutPathSplatBounds',
        })}
        ${gardenMaskGLSL()}
        float bhWhiteSandMask(float d) {
          return 1.0 - smoothstep(8.0, 24.0, d);
        }
        float bhBackshoreMask(vec2 p, float d) {
          float diagonal = (p.x - p.y) * 0.70710678;
          float shelf = smoothstep(24.0, 39.0, d) * smoothstep(21.0, 56.0, diagonal);
          float broken = 0.58 + bhFbm(p * 0.16 + vec2(8.0, -4.0)) * 0.48;
          return clamp(shelf * broken, 0.0, 1.0);
        }
        vec3 bhBasalt(vec2 p) {
          float broad = bhFbm(p * 0.24);
          float chips = bhFbm(p * 2.6 + vec2(14.0, -8.0));
          float crack = smoothstep(0.05, 0.0, abs(sin((p.x * 0.68 + p.y * 0.3) * 2.5)) - 0.03);
          vec3 color = mix(vec3(0.08, 0.078, 0.07), vec3(0.24, 0.22, 0.18), broad);
          color = mix(color, vec3(0.34, 0.29, 0.21), smoothstep(0.74, 0.95, chips) * 0.36);
          color = mix(color, vec3(0.035, 0.034, 0.031), crack * 0.68);
          return color;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vBeachHutWorld.xz;
        float h = vBeachHutWorld.y;
        float d = bhCoastDistance(p);
        float whiteMask = bhWhiteSandMask(d);
        float backshore = bhBackshoreMask(p, d);
        float rock = bhRockMask(p);
        vec4 pathSplat = bhPathSplat(p);
        vec2 garden = bhGardenInfo(p);

        vec3 whiteSand = bhAlbedo(uBhWhiteSandAlbedo, p, uBhWhiteSandScale, 0.0) * vec3(0.82, 0.84, 0.78);
        vec3 normalSand = bhAlbedo(uBhNormalSandAlbedo, p, uBhNormalSandScale, 1.0) * vec3(0.86, 0.78, 0.62);
        vec3 color = mix(normalSand, whiteSand, whiteMask);

        float dune = bhFbm(p * 0.075 + vec2(13.0, 2.0));
        color *= 0.91 + dune * 0.12;
        vec3 scrubGround = mix(normalSand * vec3(0.82, 0.86, 0.66), vec3(0.42, 0.43, 0.25), bhFbm(p * 0.8 + vec2(3.0, 11.0)));
        color = mix(color, scrubGround, backshore * 0.58);

        float wrackPath = abs(d - 4.7 - sin((p.x + p.y) * 0.12) * 0.65);
        float wrack = smoothstep(0.55, 0.1, wrackPath)
          * smoothstep(0.38, 0.72, bhFbm(p * 2.0 + vec2(3.0, -6.0)))
          * step(0.0, d);
        color = mix(color, vec3(0.36, 0.31, 0.23), wrack * 0.48);

        float pathCover = clamp(pathSplat.r * 0.54 + pathSplat.g * 0.76 + pathSplat.a * 0.16, 0.0, 1.0);
        vec3 pathColor = mix(normalSand * vec3(0.8, 0.72, 0.58), vec3(0.52, 0.32, 0.17), pathSplat.g * 0.42 + pathSplat.r * 0.18);
        pathColor = mix(pathColor, whiteSand * vec3(0.92, 0.88, 0.72), pathSplat.b * 0.18);
        pathColor = mix(pathColor, vec3(0.32, 0.23, 0.16), pathSplat.g * smoothstep(0.68, 0.95, bhFbm(p * 3.2)) * 0.2);
        color = mix(color, pathColor, clamp(pathCover * 0.78, 0.0, 0.78));

        vec3 loam = bhAlbedo(uBhLoamAlbedo, p, uBhLoamScale, 2.0) * vec3(0.62, 0.54, 0.46);
        float furrow = sin(garden.y) * 0.5 + 0.5;
        loam = mix(loam, loam * vec3(1.18, 1.08, 0.95), furrow * 0.28);
        loam = mix(loam, vec3(0.14, 0.10, 0.075), smoothstep(0.66, 0.94, bhFbm(p * 1.55 + vec2(-2.0, 4.0))) * 0.34);
        color = mix(color, loam, garden.x * 0.88);

        color = mix(color, bhBasalt(p), smoothstep(0.32, 0.55, rock));

        float sub = smoothstep(-0.32, -0.62, h);
        float dapple = bhFbm(p * 0.74 + vec2(2.0, 5.0)) * 0.62 + bhFbm(p * 2.2 + vec2(-7.0, 1.0)) * 0.38;
        vec3 seabed = mix(vec3(0.42, 0.66, 0.60), vec3(0.65, 0.78, 0.64), dapple);
        seabed = mix(seabed, whiteSand * vec3(0.72, 0.84, 0.74), 0.32);
        color = mix(color, seabed, sub);

        float swashCycle = sin(uSwashTime * 0.5984) * 0.5 + 0.5;
        float swashD = 0.25 + swashCycle * 1.65 + sin((p.x + p.y) * 0.12 + uSwashTime * 0.28) * 0.25;
        float foamEdge = smoothstep(0.52, 0.05, abs(d - swashD)) * step(0.0, d) * (1.0 - smoothstep(0.25, 0.52, rock));
        float foamSpeckle = smoothstep(0.36, 0.78, bhFbm(p * 5.0 + vec2(uSwashTime * 0.4, 0.0)));
        float wet = max(
          smoothstep(swashD + 1.45, swashD * 0.42, d) * step(0.0, d),
          smoothstep(-0.05, -0.4, h) * (1.0 - sub)
        );
        color = mix(color, color * vec3(0.52, 0.58, 0.55), clamp(wet, 0.0, 1.0) * 0.68);
        color = mix(color, vec3(0.86, 0.92, 0.86), foamEdge * (0.28 + foamSpeckle * 0.38));

        float fine = bhFbm(p * 6.4);
        color *= 0.92 + fine * 0.11;
        diffuseColor.rgb = mix(diffuseColor.rgb, color, 0.92);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec2 rp = vBeachHutWorld.xz;
        float rd = bhCoastDistance(rp);
        vec4 rPathSplat = bhPathSplat(rp);
        vec2 rGarden = bhGardenInfo(rp);
        float rPath = clamp(rPathSplat.r * 0.5 + rPathSplat.g * 0.78 + rPathSplat.a * 0.18, 0.0, 1.0);
        float rWet = max(smoothstep(1.8, 0.2, rd), smoothstep(-0.05, -0.4, vBeachHutWorld.y));
        float rValue = 0.9 + bhFbm(rp * 1.7 + vec2(4.0, -2.0)) * 0.08;
        rValue = mix(rValue, 0.82, rPath * 0.34);
        rValue = mix(rValue, 0.88, rGarden.x * 0.44);
        rValue = mix(rValue, 0.58, clamp(rWet, 0.0, 1.0) * 0.28);
        roughnessFactor = mix(roughnessFactor, clamp(rValue, 0.56, 0.99), 0.82);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float bhD = bhCoastDistance(vBeachHutWorld.xz);
        float rippleRelief = sin((vBeachHutWorld.x * 0.48 - vBeachHutWorld.z * 0.92) * 1.6 + bhFbm(vBeachHutWorld.xz * 0.42) * 2.0) * 0.08 * bhWhiteSandMask(bhD);
        vec2 bhGarden = bhGardenInfo(vBeachHutWorld.xz);
        float detailHeight = bhFbm(vBeachHutWorld.xz * 2.2) * 0.34 + bhFbm(vBeachHutWorld.xz * 7.8) * 0.12 + rippleRelief + sin(bhGarden.y) * bhGarden.x * 0.035;
        vec3 dpdx = dFdx(vBeachHutWorld);
        vec3 dpdy = dFdy(vBeachHutWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.3 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'beach-with-hut-nw-reef-style-v1';
  material.needsUpdate = true;
  return material;
}
