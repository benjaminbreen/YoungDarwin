import * as THREE from 'three';

const BEAGLE_DECK_TEXTURE_BASE = '/assets/textures/world/beagle-deck';
const BEAGLE_DECK_TEXTURES = {
  albedo: `${BEAGLE_DECK_TEXTURE_BASE}/Planks037A_1K-JPG_Color.jpg`,
  normal: `${BEAGLE_DECK_TEXTURE_BASE}/Planks037A_1K-JPG_NormalGL.jpg`,
  roughness: `${BEAGLE_DECK_TEXTURE_BASE}/Planks037A_1K-JPG_Roughness.jpg`,
  ao: `${BEAGLE_DECK_TEXTURE_BASE}/Planks037A_1K-JPG_AmbientOcclusion.jpg`,
};
const DECK_REPEAT_X = 8.64;
const DECK_REPEAT_Y = 31.2;

let deckTextureCache = null;

function fallbackTexture(fallback, colorSpace) {
  const color = new THREE.Color(fallback);
  const data = new Uint8Array([
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    255,
  ]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function loadDeckTexture(path, colorSpace, fallback) {
  const texture = typeof window === 'undefined'
    ? fallbackTexture(fallback, colorSpace)
    : new THREE.TextureLoader().load(path);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(DECK_REPEAT_X, DECK_REPEAT_Y);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  return texture;
}

function getBeagleDeckTextures() {
  if (!deckTextureCache) {
    deckTextureCache = {
      albedo: loadDeckTexture(BEAGLE_DECK_TEXTURES.albedo, THREE.SRGBColorSpace, '#8f7048'),
      normal: loadDeckTexture(BEAGLE_DECK_TEXTURES.normal, THREE.NoColorSpace, '#8080ff'),
      roughness: loadDeckTexture(BEAGLE_DECK_TEXTURES.roughness, THREE.NoColorSpace, '#dddddd'),
      ao: loadDeckTexture(BEAGLE_DECK_TEXTURES.ao, THREE.NoColorSpace, '#ffffff'),
    };
  }
  return deckTextureCache;
}

// Deck-plank painting for the BEAGLE region terrain. The heightfield is the
// walkable ship deck, so the fragment shader draws the planking analytically:
// fore-aft planks with staggered butts, caulked seams, a tarred waterway
// margin that follows the hull outline, tread rows on the ladder ramps and
// boarding steps, and light traffic wear amidships. The sea floor keeps its
// vertex colors with a faint sand-ripple modulation.
//
// Hull constants inlined below mirror ./hull.js — keep in sync.

const PLANK_GLSL = /* glsl */`
  uniform sampler2D uBeagleDeckAlbedo;
  uniform sampler2D uBeagleDeckRoughness;
  uniform sampler2D uBeagleDeckAo;
  varying vec3 vBeagleW;
  float bgHalfBeam(float x) {
    if (x >= 13.4) return 0.0;
    float fore = 1.0;
    if (x > 2.0) {
      float t = (x - 2.0) / 11.4;
      fore = sqrt(max(0.0, 1.0 - pow(t, 2.35)));
    }
    float u = clamp((-0.5 - x) / 12.7, 0.0, 1.0);
    float s = u * u * (3.0 - 2.0 * u);
    float aft = 1.0 - 0.30 * pow(s, 1.35);
    return 3.62 * fore * aft;
  }
  float bgHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  vec2 bgDeckTextureUv(vec3 bp) {
    return vec2(bp.x * 0.12, bp.z * 0.60);
  }
  bool bgOnShip(vec3 bp, float hb) {
    return bp.y > -3.0 && abs(bp.z) < hb + 2.6 && bp.x > -24.5 && bp.x < 24.5;
  }
  float bgDeckTopMask(vec3 bp) {
    vec3 n = normalize(cross(dFdx(bp), dFdy(bp)));
    return smoothstep(0.36, 0.64, abs(n.y));
  }
`;

const PLANK_APPLY = /* glsl */`
  {
    vec3 bp = vBeagleW;
    // Ship modelled in ship units, placed at SHIP_SCALE (1.8) — see hull.js.
    float hb = 1.8 * bgHalfBeam(bp.x / 1.8);
    bool onShip = bgOnShip(bp, hb);
    float deckTopMask = bgDeckTopMask(bp);
    if (onShip && bp.y > -1.1 && deckTopMask > 0.02) {
      bool ladderBand = abs(bp.z) > 1.76 && abs(bp.z) < 4.18
        && ((bp.x > 14.3 && bp.x < 17.4) || (bp.x > -13.8 && bp.x < -8.9));
      bool boardRamp = bp.z > hb - 0.68 && bp.z < hb + 2.16 && bp.x > 2.1 && bp.x < 10.9;
      float plankAxis = bp.z;
      float alongAxis = bp.x;
      float plankW = 0.245;
      float buttL = 3.3;
      if (ladderBand || boardRamp) {
        plankAxis = bp.x;
        alongAxis = bp.z;
        plankW = 0.30;
        buttL = 9.0;
      }
      float row = floor(plankAxis / plankW);
      float ph = bgHash(vec2(row, 3.7));
      float along = alongAxis + ph * buttL;
      float col = floor(along / buttL);
      float sz = fract(plankAxis / plankW);
      float sx = fract(along / buttL);
      float jitter = bgHash(vec2(row, col)) - 0.5;
      float plankTone = jitter * 0.30 + (bgHash(vec2(row, 18.4)) - 0.5) * 0.12;
      vec3 deckCol = diffuseColor.rgb * (1.0 + plankTone);
      vec2 deckUv = bgDeckTextureUv(bp);
      vec3 deckTex = texture2D(uBeagleDeckAlbedo, deckUv).rgb;
      float deckAo = texture2D(uBeagleDeckAo, deckUv).r;
      vec3 warmedDeckTex = deckTex * vec3(1.08, 1.02, 0.88);
      deckCol = mix(deckCol, warmedDeckTex, 0.78 * deckTopMask);
      deckCol *= mix(1.0, 0.76 + deckAo * 0.32, deckTopMask);

      float grainWander = sin(alongAxis * 0.58 + row * 1.31 + ph * 12.0) * 2.8;
      float grainWave = sin(alongAxis * 2.6 + grainWander + plankAxis * 1.15 + ph * 18.0);
      float grainRibbon = sin(alongAxis * 7.5 + grainWave * 2.4 + ph * 23.0 + plankAxis * 2.2);
      float grainFine = sin(alongAxis * 24.0 + grainRibbon * 1.6 + ph * 31.0 + plankAxis * 5.0);
      float grainPore = bgHash(floor(vec2(alongAxis * 8.0, plankAxis * 26.0))) - 0.5;
      float fiber = grainWave * 0.50 + grainRibbon * 0.32 + grainFine * 0.16 + grainPore * 0.18;
      deckCol *= 0.975 + fiber * 0.095;
      float ringDark = smoothstep(0.48, 0.98, abs(grainWave + grainRibbon * 0.38));
      deckCol = mix(deckCol, deckCol * vec3(0.62, 0.50, 0.34), ringDark * 0.22);
      float honeyGrain = smoothstep(0.35, 0.95, fiber * 0.5 + 0.5);
      deckCol = mix(deckCol, deckCol * vec3(1.16, 1.08, 0.92), honeyGrain * 0.14);

      float knotGate = step(0.70, bgHash(vec2(row * 1.7 + 8.0, col * 2.3 - 2.0)));
      vec2 knotCenter = vec2(
        0.26 + bgHash(vec2(row + 2.0, col + 9.0)) * 0.48,
        0.32 + bgHash(vec2(col + 5.0, row - 3.0)) * 0.36
      );
      vec2 knotUv = vec2(sx, sz) - knotCenter;
      float knotD = dot(knotUv * vec2(1.05, 4.2), knotUv * vec2(1.05, 4.2));
      float knotCore = (1.0 - smoothstep(0.0, 0.22, knotD)) * knotGate;
      float knotRing = (1.0 - smoothstep(0.0, 0.055, abs(knotD - 0.10))) * knotGate;
      deckCol = mix(deckCol, deckCol * vec3(0.42, 0.30, 0.18), knotCore * 0.58 + knotRing * 0.34);

      float seam = 1.0 - smoothstep(0.0, 0.085, min(sz, 1.0 - sz));
      float butt = 1.0 - smoothstep(0.0, 0.022, min(sx, 1.0 - sx));
      float seamMix = max(seam, butt * 0.9);
      deckCol = mix(deckCol, deckCol * 0.42, seamMix * 0.85 * deckTopMask);
      float endDark = 1.0 - smoothstep(0.0, 0.06, min(sx, 1.0 - sx));
      deckCol = mix(deckCol, deckCol * vec3(0.70, 0.60, 0.46), endDark * 0.18);
      float edge = hb - abs(bp.z);
      float waterway = (1.0 - smoothstep(0.32, 0.5, edge)) * step(0.0, edge) * step(2.4, bp.y);
      deckCol = mix(deckCol, vec3(0.135, 0.10, 0.065), waterway * 0.8);
      float wear = (1.0 - smoothstep(1.1, 3.6, abs(bp.z))) * step(2.4, bp.y) * step(bp.y, 4.3);
      float scuff = smoothstep(0.62, 0.96, bgHash(floor(vec2(bp.x * 1.15, bp.z * 3.2))));
      deckCol = mix(deckCol, deckCol * 1.06 + vec3(0.018), wear * (0.32 + scuff * 0.16));
      diffuseColor.rgb = deckCol;
    } else if (onShip && bp.y > -3.0) {
      // Steep hidden heightfield skirts at the hull edge should stay visually
      // quiet; the GLB hull wraps them, but tiny gaps otherwise reveal triangles.
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.085, 0.055), 0.72);
    } else if (bp.y < -3.6) {
      float rip = sin(bp.x * 1.4 + sin(bp.z * 0.9) * 1.8) * 0.5 + 0.5;
      diffuseColor.rgb *= 0.94 + rip * 0.10;
    }
  }
`;

const ROUGHNESS_APPLY = /* glsl */`
  {
    vec3 bp = vBeagleW;
    float hb = 1.8 * bgHalfBeam(bp.x / 1.8);
    float deckTopMask = bgDeckTopMask(bp);
    if (bgOnShip(bp, hb) && bp.y > -1.1 && deckTopMask > 0.02) {
      float deckRoughness = texture2D(uBeagleDeckRoughness, bgDeckTextureUv(bp)).r;
      roughnessFactor = mix(roughnessFactor, clamp(deckRoughness * 0.78 + 0.18, 0.42, 0.98), 0.82 * deckTopMask);
    }
  }
`;

export function createBeagleDeckTerrainMaterial() {
  const deckTextures = getBeagleDeckTextures();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.0,
    normalMap: deckTextures.normal,
    normalScale: new THREE.Vector2(0.42, 0.42),
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uBeagleDeckAlbedo = { value: deckTextures.albedo };
    shader.uniforms.uBeagleDeckRoughness = { value: deckTextures.roughness };
    shader.uniforms.uBeagleDeckAo = { value: deckTextures.ao };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBeagleW;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBeagleW = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PLANK_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PLANK_APPLY}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${ROUGHNESS_APPLY}`);
  };
  material.customProgramCacheKey = () => 'beagle-deck-planks-pbr-v2';
  material.needsUpdate = true;
  return material;
}
