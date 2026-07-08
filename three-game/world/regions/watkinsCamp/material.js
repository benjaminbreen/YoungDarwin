import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

// Watkins Camp terrain splat. Same recipe as the placeholder PBR terrain the
// unauthored maps use (world-space triplanar-ish layers, fbm-broken blends),
// but with a fourth layer and weights driven by the authored site masks:
// grass bowl, red-dirt yard/paths, dry-grass litter on the plateau, and wet
// basalt in the stream bed and on the southern terraces.
//
// The river/path/yard curves here MUST match regions/watkinsCamp/terrain.js.

const LAYERS = ['grass', 'redCinderDirt', 'dryGrassLitter', 'wetBasalt'];

const COMMON_GLSL = /* glsl */`
        uniform sampler2D uWkAlbedo0;
        uniform sampler2D uWkNormal0;
        uniform sampler2D uWkRoughness0;
        uniform sampler2D uWkAlbedo1;
        uniform sampler2D uWkNormal1;
        uniform sampler2D uWkRoughness1;
        uniform sampler2D uWkAlbedo2;
        uniform sampler2D uWkNormal2;
        uniform sampler2D uWkRoughness2;
        uniform sampler2D uWkAlbedo3;
        uniform sampler2D uWkNormal3;
        uniform sampler2D uWkRoughness3;
        uniform vec4 uWkScale;
        uniform vec4 uWkNormalStrength;
        varying vec3 vWkWorld;

        float wkHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float wkNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(wkHash(i), wkHash(i + vec2(1.0, 0.0)), u.x),
            mix(wkHash(i + vec2(0.0, 1.0)), wkHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float wkFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += wkNoise(p) * amp;
            p = mat2(1.63, -1.02, 1.02, 1.63) * p + vec2(4.1, -2.8);
            amp *= 0.52;
          }
          return value;
        }
        vec2 wkRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 wkSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 wkAlbedo(sampler2D tex, vec2 p, float scale, float salt) {
          float broad = wkFbm(p * 0.061 + vec2(13.0 + salt, -5.0));
          vec2 uvA = p * scale + vec2(0.17 + salt * 0.07, -0.09);
          vec2 uvB = wkRotate(p, 0.72 + salt * 0.11) * (scale * 0.61) + vec2(-0.31, 0.23 + salt * 0.05);
          vec3 a = wkSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = wkSrgbToLinear(texture2D(tex, uvB).rgb);
          return mix(a, b, 0.16 + broad * 0.14);
        }
        float wkRoughnessTex(sampler2D tex, vec2 p, float scale, float salt) {
          vec2 uv = p * scale + vec2(0.17 + salt * 0.07, -0.09);
          // Matte floor: dry grass and dirt must not glint (wet stones get
          // their shine back through the explicit wet-band override below).
          return clamp(texture2D(tex, uv).r, 0.55, 1.0);
        }
        vec3 wkNormalMap(sampler2D tex, vec2 p, float scale, float strength, float salt) {
          vec2 uv = p * scale + vec2(0.17 + salt * 0.07, -0.09);
          vec3 mapped = texture2D(tex, uv).xyz * 2.0 - 1.0;
          return normalize(vec3(mapped.xy * strength, max(mapped.z, 0.16)));
        }

        // --- authored site masks (mirror terrain.js) -----------------------
        float wkRiverCenterZ(float x) {
          return 10.0 + sin(x * 0.055 + 1.2) * 4.2 + sin(x * 0.021 - 0.6) * 2.4;
        }
        float wkRiverHalf(float x) {
          return 3.4 + sin(x * 0.07 + 2.0) * 0.8;
        }
        float wkSegDist(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(0.001, dot(ab, ab)), 0.0, 1.0);
          return length(p - (a + ab * t));
        }
        float wkTrack(vec2 p) {
          vec2 n[11];
          n[0] = vec2(2.0, -44.0);
          n[1] = vec2(1.0, -33.0);
          n[2] = vec2(-2.0, -25.0);
          n[3] = vec2(0.0, -13.0);
          n[4] = vec2(2.0, -4.0);
          n[5] = vec2(1.0, 6.0);
          n[6] = vec2(1.0, 12.7);
          n[7] = vec2(4.0, 15.5);
          n[8] = vec2(12.0, 17.0);
          n[9] = vec2(22.0, 16.5);
          n[10] = vec2(30.0, 16.0);
          float d = 999.0;
          for (int i = 0; i < 10; i++) d = min(d, wkSegDist(p, n[i], n[i + 1]));
          vec2 w[4];
          w[0] = vec2(-50.0, -14.0);
          w[1] = vec2(-38.0, -15.5);
          w[2] = vec2(-26.0, -17.5);
          w[3] = vec2(-16.0, -19.0);
          for (int i = 0; i < 3; i++) d = min(d, wkSegDist(p, w[i], w[i + 1]));
          float wobble = (wkFbm(p * 0.35 + vec2(2.0, -6.0)) - 0.5) * 0.8;
          return 1.0 - smoothstep(1.15, 3.6, d + wobble);
        }
        float wkYard(vec2 p) {
          float dx = (p.x + 7.0) / 15.5;
          float dz = (p.y + 18.5) / 11.5;
          return exp(-(dx * dx + dz * dz));
        }

        vec4 wkLayerWeights(vec3 surfaceNormal) {
          vec2 p = vWkWorld.xz;
          float h = vWkWorld.y;
          float slope = clamp(1.0 - abs(surfaceNormal.y), 0.0, 1.0);
          float broad = wkFbm(p * 0.07 + vec2(3.0, -9.0));
          float fine = wkFbm(p * 0.39 + vec2(-7.0, 2.0));

          float riverD = abs(p.y - wkRiverCenterZ(p.x));
          float half_ = wkRiverHalf(p.x);
          float bankWobble = (wkFbm(p * 0.09 + vec2(3.0, -7.0)) - 0.5) * 3.2;
          // Mirror of terrain.js watkinsRiverInfo: one concave cross-section.
          float outer_ = half_ + 12.0;
          float crossT = clamp(1.0 - (riverD + bankWobble) / outer_, 0.0, 1.0);
          float crossS = pow(crossT, 1.45);
          float water = smoothstep(0.76, 0.9, crossS);
          float valley = smoothstep(0.03, 0.55, crossS);
          // Exposed reddish riverbank soil in a broken band along the water.
          float bankSoil = smoothstep(0.4, 0.8, crossS)
            * (1.0 - water)
            * (0.55 + wkFbm(p * 0.5 + vec2(-2.0, 6.0)) * 0.45);
          float cliffZ = p.y - wkRiverCenterZ(p.x);
          float cliff = smoothstep(9.0, 27.0, cliffZ);
          float track = wkTrack(p);
          float yard = wkYard(p);
          float wetShore = 1.0 - smoothstep(-0.75, -0.05, h);

          // 3: wet basalt — stream bed, damp shore stones, terrace faces.
          float w3 = clamp(
            max(max(water * (0.72 + wetShore * 0.28), wetShore * valley * 0.85),
                cliff * (0.34 + slope * 0.62 + fine * 0.14)),
            0.0, 0.96);

          // 1: red cinder dirt — trodden track, homestead yard, dry knuckles,
          // and the exposed soil along the riverbank.
          float w1 = clamp(
            track * 0.9
              + yard * (0.42 + fine * 0.26)
              + bankSoil * 0.82
              + smoothstep(0.52, 0.86, broad) * 0.24 * (1.0 - valley),
            0.0, 0.94) * (1.0 - w3);

          // 2: dry grass litter — plateau patches, thins near the stream.
          float w2 = clamp(
            smoothstep(0.42, 0.8, fine) * (0.3 + smoothstep(1.4, 3.4, h) * 0.4),
            0.0, 0.85) * (1.0 - w3) * (1.0 - w1 * 0.8) * (1.0 - valley * 0.72);

          // Green belt (mirror of ecology watkinsGreenBelt): grass takes over
          // from litter and loose dirt in the damp pocket by the north bank.
          float greenBelt = clamp(
            exp(-pow((p.x - 16.0) / 22.0, 2.0) - pow((p.y + 3.0) / 9.0, 2.0))
            + exp(-pow((p.x + 24.0) / 14.0, 2.0) - pow((p.y - 2.0) / 7.0, 2.0)) * 0.7,
            0.0, 1.0);
          w2 *= 1.0 - greenBelt * 0.65;
          w1 = mix(w1, min(w1, track * 0.9 + bankSoil * 0.82), greenBelt * 0.7);

          float w0 = max(0.0, 1.0 - w1 - w2 - w3);
          vec4 weights = vec4(w0, w1, w2, w3);
          return weights / max(0.001, weights.x + weights.y + weights.z + weights.w);
        }
`;

export function createWatkinsCampTerrainMaterial() {
  const layers = LAYERS.map(key => ({
    key,
    textureSet: FLOREANA_PBR_TEXTURES[key],
    loaded: loadPbrTerrainSet(FLOREANA_PBR_TEXTURES[key]),
  }));
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
    layers.forEach((layer, index) => {
      shader.uniforms[`uWkAlbedo${index}`] = { value: layer.loaded.albedo };
      shader.uniforms[`uWkNormal${index}`] = { value: layer.loaded.normal };
      shader.uniforms[`uWkRoughness${index}`] = { value: layer.loaded.roughness };
    });
    shader.uniforms.uWkScale = {
      value: new THREE.Vector4(
        layers[0].textureSet.scale * 1.7,
        layers[1].textureSet.scale,
        layers[2].textureSet.scale,
        layers[3].textureSet.scale,
      ),
    };
    shader.uniforms.uWkNormalStrength = {
      value: new THREE.Vector4(
        layers[0].textureSet.normalStrength,
        layers[1].textureSet.normalStrength,
        layers[2].textureSet.normalStrength,
        layers[3].textureSet.normalStrength,
      ),
    };
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWkWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWkWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 wkSurfaceNormal = normalize(cross(dFdx(vWkWorld), dFdy(vWkWorld)));
        if (wkSurfaceNormal.y < 0.0) wkSurfaceNormal *= -1.0;
        vec4 wkWeights = wkLayerWeights(wkSurfaceNormal);
        vec2 wkP = vWkWorld.xz;
        vec3 wkColor0 = wkAlbedo(uWkAlbedo0, wkP, uWkScale.x, 0.0);
        vec3 wkColor1 = wkAlbedo(uWkAlbedo1, wkP, uWkScale.y, 1.0);
        vec3 wkColor2 = wkAlbedo(uWkAlbedo2, wkP, uWkScale.z, 2.0);
        vec3 wkColor3 = wkAlbedo(uWkAlbedo3, wkP, uWkScale.w, 3.0);
        vec3 wkColor = wkColor0 * wkWeights.x + wkColor1 * wkWeights.y
          + wkColor2 * wkWeights.z + wkColor3 * wkWeights.w;
        // Lusher green ribbon along the stream banks; sun-dried plateau grass.
        float wkRiverD2 = abs(wkP.y - wkRiverCenterZ(wkP.x));
        float wkHalf2 = wkRiverHalf(wkP.x);
        float wkCross2 = pow(clamp(1.0 - wkRiverD2 / (wkHalf2 + 12.0), 0.0, 1.0), 1.45);
        float wkBank = smoothstep(0.08, 0.6, wkCross2)
          * (1.0 - smoothstep(-0.4, 0.9, -vWkWorld.y));
        wkColor = mix(wkColor, wkColor * vec3(0.78, 1.08, 0.6), clamp(wkBank * wkWeights.x, 0.0, 1.0) * 0.42);
        // Green belt ground tint (mirror of ecology watkinsGreenBelt).
        float wkGreenBelt = clamp(
          exp(-pow((wkP.x - 16.0) / 22.0, 2.0) - pow((wkP.y + 3.0) / 9.0, 2.0))
          + exp(-pow((wkP.x + 24.0) / 14.0, 2.0) - pow((wkP.y - 2.0) / 7.0, 2.0)) * 0.7,
          0.0, 1.0);
        wkColor = mix(wkColor, wkColor * vec3(0.8, 1.06, 0.62), wkGreenBelt * wkWeights.x * 0.38);
        float wkDry = smoothstep(1.9, 3.6, vWkWorld.y) * wkWeights.x;
        wkColor = mix(wkColor, wkColor * vec3(1.14, 1.04, 0.72), clamp(wkDry, 0.0, 1.0) * 0.34);
        // WK_ASH: the old fire scar by the south gate (WATKINS_FIRE_RING).
        float wkAshD = length(wkP - vec2(0.5, -14.7));
        float wkAsh = (1.0 - smoothstep(0.35, 1.15, wkAshD + (wkFbm(wkP * 2.6) - 0.5) * 0.3));
        wkColor = mix(wkColor, vec3(0.075, 0.07, 0.065), wkAsh * 0.85);
        wkColor *= 0.92 + wkFbm(wkP * 1.8 + vec2(5.0, -3.0)) * 0.14;
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(wkColor, 0.0, 1.0), 0.88);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec3 wkRoughNormal = normalize(cross(dFdx(vWkWorld), dFdy(vWkWorld)));
        if (wkRoughNormal.y < 0.0) wkRoughNormal *= -1.0;
        vec4 wkRoughWeights = wkLayerWeights(wkRoughNormal);
        vec2 wkRp = vWkWorld.xz;
        float wkRough = wkRoughnessTex(uWkRoughness0, wkRp, uWkScale.x, 0.0) * wkRoughWeights.x
          + wkRoughnessTex(uWkRoughness1, wkRp, uWkScale.y, 1.0) * wkRoughWeights.y
          + wkRoughnessTex(uWkRoughness2, wkRp, uWkScale.z, 2.0) * wkRoughWeights.z
          + wkRoughnessTex(uWkRoughness3, wkRp, uWkScale.w, 3.0) * wkRoughWeights.w;
        // Banks stay matte; only the SUBMERGED bed gets its wet-stone gloss
        // back (a band that ends right at the waterline, not above it).
        wkRough = clamp(wkRough, 0.6, 0.98);
        float wkWetBand = 1.0 - smoothstep(-0.94, -0.82, vWkWorld.y);
        wkRough = mix(wkRough, 0.4, clamp(wkWetBand * wkRoughWeights.w, 0.0, 1.0) * 0.5);
        roughnessFactor = mix(roughnessFactor, wkRough, 0.82);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec4 wkNormalWeights = wkLayerWeights(normal);
        vec2 wkNp = vWkWorld.xz;
        vec3 wkN0 = wkNormalMap(uWkNormal0, wkNp, uWkScale.x, uWkNormalStrength.x, 0.0);
        vec3 wkN1 = wkNormalMap(uWkNormal1, wkNp, uWkScale.y, uWkNormalStrength.y, 1.0);
        vec3 wkN2 = wkNormalMap(uWkNormal2, wkNp, uWkScale.z, uWkNormalStrength.z, 2.0);
        vec3 wkN3 = wkNormalMap(uWkNormal3, wkNp, uWkScale.w, uWkNormalStrength.w, 3.0);
        vec3 wkMapped = normalize(wkN0 * wkNormalWeights.x + wkN1 * wkNormalWeights.y
          + wkN2 * wkNormalWeights.z + wkN3 * wkNormalWeights.w);
        vec3 wkSurface = normal;
        vec3 wkTangentX = normalize(vec3(1.0, 0.0, 0.0) - wkSurface * dot(wkSurface, vec3(1.0, 0.0, 0.0)));
        vec3 wkTangentZ = normalize(cross(wkTangentX, wkSurface));
        vec3 wkWorldMapped = normalize(wkTangentX * wkMapped.x + wkTangentZ * wkMapped.y + wkSurface * wkMapped.z);
        normal = normalize(mix(normal, wkWorldMapped, 0.74));`,
      );
  };

  material.customProgramCacheKey = () => 'watkins-camp-stream-hollow-v3';
  material.needsUpdate = true;
  return material;
}
