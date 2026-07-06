import * as THREE from 'three';

// Deck-plank painting for the BEAGLE region terrain. The heightfield is the
// walkable ship deck, so the fragment shader draws the planking analytically:
// fore-aft planks with staggered butts, caulked seams, a tarred waterway
// margin that follows the hull outline, tread rows on the ladder ramps and
// boarding steps, and light traffic wear amidships. The sea floor keeps its
// vertex colors with a faint sand-ripple modulation.
//
// Hull constants inlined below mirror ./hull.js — keep in sync.

const PLANK_GLSL = /* glsl */`
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
`;

const PLANK_APPLY = /* glsl */`
  {
    vec3 bp = vBeagleW;
    // Ship modelled in ship units, placed at SHIP_SCALE (1.8) — see hull.js.
    float hb = 1.8 * bgHalfBeam(bp.x / 1.8);
    bool onShip = bp.y > -3.0 && abs(bp.z) < hb + 2.6 && bp.x > -24.5 && bp.x < 24.5;
    if (onShip && bp.y > -1.1) {
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
      float plankTone = jitter * 0.17 + (bgHash(vec2(row, 18.4)) - 0.5) * 0.07;
      vec3 deckCol = diffuseColor.rgb * (1.0 + plankTone);

      float grainWave = sin(alongAxis * 6.8 + sin(alongAxis * 0.85 + row * 1.31) * 2.1 + ph * 18.0 + plankAxis * 0.75);
      float grainFine = sin(alongAxis * 42.0 + grainWave * 1.8 + ph * 31.0 + plankAxis * 3.0);
      float grainPore = bgHash(floor(vec2(alongAxis * 13.0, plankAxis * 44.0))) - 0.5;
      float fiber = grainWave * 0.42 + grainFine * 0.25 + grainPore * 0.22;
      deckCol *= 0.985 + fiber * 0.045;
      float ringDark = smoothstep(0.72, 1.0, abs(grainWave));
      deckCol = mix(deckCol, deckCol * vec3(0.72, 0.62, 0.48), ringDark * 0.10);
      float honeyGrain = smoothstep(0.35, 0.95, fiber * 0.5 + 0.5);
      deckCol = mix(deckCol, deckCol * vec3(1.08, 1.03, 0.93), honeyGrain * 0.08);

      float knotGate = step(0.80, bgHash(vec2(row * 1.7 + 8.0, col * 2.3 - 2.0)));
      vec2 knotCenter = vec2(
        0.26 + bgHash(vec2(row + 2.0, col + 9.0)) * 0.48,
        0.32 + bgHash(vec2(col + 5.0, row - 3.0)) * 0.36
      );
      vec2 knotUv = vec2(sx, sz) - knotCenter;
      float knotD = dot(knotUv * vec2(1.25, 5.4), knotUv * vec2(1.25, 5.4));
      float knotCore = (1.0 - smoothstep(0.0, 0.16, knotD)) * knotGate;
      float knotRing = (1.0 - smoothstep(0.0, 0.035, abs(knotD - 0.07))) * knotGate;
      deckCol = mix(deckCol, deckCol * vec3(0.52, 0.40, 0.27), knotCore * 0.45 + knotRing * 0.22);

      float seam = 1.0 - smoothstep(0.0, 0.085, min(sz, 1.0 - sz));
      float butt = 1.0 - smoothstep(0.0, 0.022, min(sx, 1.0 - sx));
      float seamMix = max(seam, butt * 0.9);
      deckCol = mix(deckCol, deckCol * 0.42, seamMix * 0.85);
      float endDark = 1.0 - smoothstep(0.0, 0.06, min(sx, 1.0 - sx));
      deckCol = mix(deckCol, deckCol * vec3(0.70, 0.60, 0.46), endDark * 0.18);
      float edge = hb - abs(bp.z);
      float waterway = (1.0 - smoothstep(0.32, 0.5, edge)) * step(0.0, edge) * step(2.4, bp.y);
      deckCol = mix(deckCol, vec3(0.135, 0.10, 0.065), waterway * 0.8);
      float wear = (1.0 - smoothstep(1.1, 3.6, abs(bp.z))) * step(2.4, bp.y) * step(bp.y, 4.3);
      float scuff = smoothstep(0.62, 0.96, bgHash(floor(vec2(bp.x * 1.15, bp.z * 3.2))));
      deckCol = mix(deckCol, deckCol * 1.06 + vec3(0.018), wear * (0.32 + scuff * 0.16));
      diffuseColor.rgb = deckCol;
    } else if (bp.y < -3.6) {
      float rip = sin(bp.x * 1.4 + sin(bp.z * 0.9) * 1.8) * 0.5 + 0.5;
      diffuseColor.rgb *= 0.94 + rip * 0.10;
    }
  }
`;

export function createBeagleDeckTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0.0,
  });
  material.onBeforeCompile = shader => {
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
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PLANK_APPLY}`);
  };
  material.customProgramCacheKey = () => 'beagle-deck-planks-v3';
  material.needsUpdate = true;
  return material;
}
