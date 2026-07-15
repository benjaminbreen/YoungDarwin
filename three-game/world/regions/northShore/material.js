import * as THREE from 'three';
import {
  createStandardFootPathSplatTexture,
  standardFootPathSplatGLSL,
  standardFootPathSplatUniforms,
} from '../../paths/standardPath';
import {
  FLOREANA_PBR_TEXTURES,
  loadRepeatingTerrainTexture,
} from '../materials/pbrTerrainTextures';
import { N_SHORE_PATH_POINTS } from './terrain';

const N_SHORE_PATH_SPLAT_BOUNDS = {
  originX: -54,
  originZ: -46,
  width: 108,
  depth: 92,
  size: 1024,
};

function loadAlbedo(textureSet) {
  return loadRepeatingTerrainTexture(textureSet.albedo, {
    fallback: textureSet.fallbacks?.albedo || '#ffffff',
    colorSpace: THREE.SRGBColorSpace,
  });
}

function loadDataTexture(path, fallback) {
  return loadRepeatingTerrainTexture(path, {
    fallback,
    colorSpace: THREE.NoColorSpace,
  });
}

// Northern Shore uses the same intentionally narrow material path as Southern
// Reefs: one authored beach texture family, shallow-water tinting, and swash.
// The old shader evaluated every inland biome family for every terrain pixel,
// even on the beach, which made this small early-authored region unusually
// expensive. Vertex color still supplies restrained inland variation and the
// route splat remains intact.
export function createNorthShoreTerrainMaterial() {
  const basaltSet = FLOREANA_PBR_TEXTURES.darkBasaltGravel;
  const basaltAlbedo = loadAlbedo(basaltSet);
  const basaltHeight = loadDataTexture(
    basaltSet.height,
    basaltSet.fallbacks?.height || [128, 128, 128, 255],
  );
  const pathSplatTexture = createStandardFootPathSplatTexture({
    pathPoints: N_SHORE_PATH_POINTS[0],
    bounds: N_SHORE_PATH_SPLAT_BOUNDS,
    minimumWidth: 1.76,
  });
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    basaltAlbedo.dispose();
    basaltHeight.dispose();
    pathSplatTexture.dispose();
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
    shader.uniforms.uNsBasaltAlbedo = { value: basaltAlbedo };
    shader.uniforms.uNsBasaltHeight = { value: basaltHeight };
    shader.uniforms.uNsBasaltScale = { value: basaltSet.scale };
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
        uniform vec3 rimColor;
        uniform float rimIntensity;
        uniform float uSwashTime;
        uniform sampler2D uNsBasaltAlbedo;
        uniform sampler2D uNsBasaltHeight;
        uniform float uNsBasaltScale;
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
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(nsHash(i), nsHash(i + vec2(1.0, 0.0)), u.x), mix(nsHash(i + vec2(0.0, 1.0)), nsHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float nsFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            value += nsNoise(p) * amp;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p + vec2(3.7, -2.6);
            amp *= 0.52;
          }
          return value;
        }
        vec2 nsRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 nsSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        float nsCoastZ(float x) {
          return -16.0 + sin(x * 0.072 + 1.3) * 3.6 + sin(x * 0.031 + 0.7) * 2.2;
        }
        vec3 nsDarkBeach(vec2 p) {
          vec2 uvA = p * uNsBasaltScale + vec2(0.17, -0.09);
          vec2 uvB = nsRotate(p, 0.72) * (uNsBasaltScale * 0.62) + vec2(-0.31, 0.23);
          vec3 a = nsSrgbToLinear(texture2D(uNsBasaltAlbedo, uvA).rgb);
          vec3 b = nsSrgbToLinear(texture2D(uNsBasaltAlbedo, uvB).rgb);
          float broad = nsFbm(p * 0.052 + vec2(11.0, -5.0));
          vec3 textureColor = mix(a, b, 0.14 + broad * 0.12);
          float heightGrain = mix(
            texture2D(uNsBasaltHeight, uvA).r,
            texture2D(uNsBasaltHeight, uvB).r,
            0.35
          ) - 0.5;
          vec3 mineralColor = mix(vec3(0.105, 0.098, 0.086), vec3(0.245, 0.225, 0.185), broad);
          vec3 basalt = mix(mineralColor, textureColor * vec3(1.08, 1.02, 0.90), 0.62);
          basalt += heightGrain * vec3(0.12, 0.105, 0.075);
          return clamp(basalt, 0.025, 0.48);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vNorthShoreWorld.xz;
        float h = vNorthShoreWorld.y;
        float d = p.y - nsCoastZ(p.x);

        vec3 basalt = nsDarkBeach(p);
        float inland = smoothstep(8.0, 22.0, d);
        vec3 inlandTint = mix(basalt * vec3(1.04, 0.94, 0.76), diffuseColor.rgb, 0.22);
        vec3 color = mix(basalt, inlandTint, inland);

        float submerged = 1.0 - smoothstep(-1.0, 0.12, d);
        float depth = clamp((-0.12 - d) / 2.3, 0.0, 1.0);
        float dapple = nsFbm(p * 0.72 + vec2(2.0, 5.0));
        vec3 wetStone = mix(vec3(0.09, 0.15, 0.15), vec3(0.16, 0.25, 0.23), dapple);
        vec3 shallowTeal = mix(vec3(0.24, 0.53, 0.54), vec3(0.41, 0.68, 0.61), dapple);
        vec3 seabed = mix(wetStone, shallowTeal, smoothstep(0.08, 0.75, depth));
        color = mix(color, seabed, submerged);

        vec4 pathSplat = nsPathSplat(p);
        float pathCover = clamp(max(pathSplat.r, pathSplat.g * 0.56), 0.0, 1.0) * (1.0 - submerged);
        float pathShoulder = pathSplat.a * (1.0 - submerged);
        vec3 pathDirt = basalt * vec3(1.28, 0.94, 0.68) + vec3(0.055, 0.026, 0.008);
        color = mix(color, pathDirt, pathShoulder * 0.26);
        color = mix(color, pathDirt, pathCover * 0.76);

        float swashCycle = sin(uSwashTime * 0.5984) * 0.5 + 0.5;
        float swashD = 0.18 + swashCycle * 1.55 + sin(p.x * 0.18 + uSwashTime * 0.28) * 0.22;
        float foamEdge = smoothstep(0.48, 0.04, abs(d - swashD)) * step(0.0, d);
        float foamSpeckle = smoothstep(0.36, 0.78, nsNoise(p * 5.1 + vec2(uSwashTime * 0.4, 0.0)));
        float wet = max(
          smoothstep(swashD + 1.45, swashD * 0.36, d) * step(0.0, d),
          (1.0 - smoothstep(-0.18, 0.15, d)) * (1.0 - submerged)
        );
        color = mix(color, color * vec3(0.52, 0.60, 0.58), clamp(wet, 0.0, 1.0) * 0.68);
        color = mix(color, vec3(0.90, 0.94, 0.89), foamEdge * (0.28 + foamSpeckle * 0.42));

        float fine = nsNoise(p * 7.0);
        color *= 0.94 + fine * 0.08;
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.96);`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'north-shore-single-dark-beach-v1';
  material.needsUpdate = true;
  return material;
}
