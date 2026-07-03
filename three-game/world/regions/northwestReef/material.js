import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  loadPbrTerrainSet,
  loadRepeatingTerrainTexture,
} from '../materials/pbrTerrainTextures';

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

// Per-pixel splat shader for the Northwest Reef: bright coral-sand beach with
// sandy-tuff PBR detail, a pale swash line on the authored coast curve, dappled
// turquoise sand shelf seen through the water, mottled coral heads ringing the
// islet, and dark basalt on the outcrops.
export function createNorthwestReefTerrainMaterial() {
  const sandyTuffSet = FLOREANA_PBR_TEXTURES.sandyTuff;
  const sandyTuffTextures = loadPbrTerrainSet(sandyTuffSet);
  const whiteSandSet = FLOREANA_PBR_TEXTURES.whiteSand;
  const whiteSandAlbedo = loadAlbedo(whiteSandSet);
  const whiteSandHeight = loadDataTexture(whiteSandSet.height, whiteSandSet.fallbacks?.height || [128, 128, 128, 255]);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });
  material.addEventListener('dispose', () => {
    sandyTuffTextures.albedo.dispose();
    sandyTuffTextures.normal.dispose();
    sandyTuffTextures.roughness.dispose();
    sandyTuffTextures.height?.dispose?.();
    whiteSandAlbedo.dispose();
    whiteSandHeight.dispose();
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = { value: new THREE.Color('#f6e3ae') };
    shader.uniforms.rimIntensity = { value: 0.04 };
    shader.uniforms.uSwashTime = { value: 0 };
    shader.uniforms.uNwrTuffAlbedo = { value: sandyTuffTextures.albedo };
    shader.uniforms.uNwrTuffNormal = { value: sandyTuffTextures.normal };
    shader.uniforms.uNwrTuffRoughness = { value: sandyTuffTextures.roughness };
    shader.uniforms.uNwrTuffScale = { value: sandyTuffSet.scale };
    shader.uniforms.uNwrTuffNormalStrength = { value: sandyTuffSet.normalStrength };
    shader.uniforms.uNwrTuffRoughnessMix = { value: sandyTuffSet.roughnessMix };
    shader.uniforms.uNwrWhiteSandAlbedo = { value: whiteSandAlbedo };
    shader.uniforms.uNwrWhiteSandHeight = { value: whiteSandHeight };
    shader.uniforms.uNwrWhiteSandScale = { value: whiteSandSet.scale };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 rimColor;
        uniform float rimIntensity;
        uniform float uSwashTime;
        uniform sampler2D uNwrTuffAlbedo;
        uniform sampler2D uNwrTuffNormal;
        uniform sampler2D uNwrTuffRoughness;
        uniform sampler2D uNwrWhiteSandAlbedo;
        uniform sampler2D uNwrWhiteSandHeight;
        uniform float uNwrTuffScale;
        uniform float uNwrTuffNormalStrength;
        uniform float uNwrTuffRoughnessMix;
        uniform float uNwrWhiteSandScale;
        varying vec3 vTerrainWorld;
        float nwrHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float nwrNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(nwrHash(i), nwrHash(i + vec2(1.0, 0.0)), u.x), mix(nwrHash(i + vec2(0.0, 1.0)), nwrHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float nwrFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            value += nwrNoise(p) * amp;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p;
            amp *= 0.52;
          }
          return value;
        }
        vec2 nwrRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 nwrSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 nwrTuffAlbedo(vec2 p) {
          float broad = nwrFbm(p * 0.064 + vec2(11.0, -5.0));
          vec2 uvA = p * uNwrTuffScale + vec2(0.17, -0.09);
          vec2 uvB = nwrRotate(p, 0.72) * (uNwrTuffScale * 0.63) + vec2(-0.31, 0.23);
          vec3 a = nwrSrgbToLinear(texture2D(uNwrTuffAlbedo, uvA).rgb);
          vec3 b = nwrSrgbToLinear(texture2D(uNwrTuffAlbedo, uvB).rgb);
          return mix(a, b, 0.14 + broad * 0.12);
        }
        float nwrTuffRoughness(vec2 p) {
          vec2 uv = p * uNwrTuffScale + vec2(0.17, -0.09);
          float r = texture2D(uNwrTuffRoughness, uv).r;
          return clamp(r, 0.58, 0.98);
        }
        vec3 nwrTuffNormal(vec2 p) {
          vec2 uv = p * uNwrTuffScale + vec2(0.17, -0.09);
          vec3 mapped = texture2D(uNwrTuffNormal, uv).xyz * 2.0 - 1.0;
          return normalize(vec3(mapped.xy * uNwrTuffNormalStrength, max(mapped.z, 0.18)));
        }
        float nwrWhiteHeightGrain(vec2 p) {
          vec2 uvA = p * uNwrWhiteSandScale + vec2(0.17, -0.09);
          vec2 uvB = nwrRotate(p, 0.72) * (uNwrWhiteSandScale * 0.62) + vec2(-0.31, 0.23);
          float a = texture2D(uNwrWhiteSandHeight, uvA).r;
          float b = texture2D(uNwrWhiteSandHeight, uvB).r;
          return mix(a, b, 0.35);
        }
        float nwrDryTuffMask(float h, float basalt, float sub) {
          float aboveWater = smoothstep(-0.36, 0.08, h);
          return clamp((1.0 - sub) * aboveWater * (1.0 - basalt), 0.0, 1.0);
        }
        float nwrCoastZ(float x) {
          float bend = smoothstep(34.0, 54.0, -x);
          return 6.0 + sin(x * 0.058 + 0.8) * 3.4 + sin(x * 0.026 + 2.1) * 2.0 + bend * 26.0;
        }
        float nwrIslet(vec2 p) {
          vec2 q = p - vec2(-6.0, -27.0);
          float ang = atan(q.y, q.x);
          float wobble = 1.0 + sin(ang * 3.0 + 1.7) * 0.2 + sin(ang * 5.0 - 0.6) * 0.13;
          return length(q / (vec2(7.0, 5.4) * wobble));
        }
        float nwrGarden(vec2 p) {
          float g1 = exp(-(dot(p - vec2(16.0, -10.0), p - vec2(16.0, -10.0))) / 35.28);
          float g2 = exp(-(dot(p - vec2(30.0, -16.0), p - vec2(30.0, -16.0))) / 35.28);
          float g3 = exp(-(dot(p - vec2(-28.0, -13.0), p - vec2(-28.0, -13.0))) / 35.28);
          return max(g1, max(g2, g3));
        }
        float nwrOutcrop(vec2 p) {
          float east = exp(-(pow((p.x - 40.0) / 8.5, 2.0) + pow((p.y - 11.0) / 7.5, 2.0)));
          float back = exp(-(pow((p.x + 32.0) / 7.5, 2.0) + pow((p.y - 28.0) / 7.0, 2.0)));
          float mid = exp(-(pow((p.x - 6.0) / 5.0, 2.0) + pow((p.y - 35.0) / 5.5, 2.0)));
          return max(east, max(back, mid));
        }
        float nwrBeachDistance(vec2 p) {
          // The analytic coast curve is the berm break; the visible waterline
          // sits lower on the shelf, about six metres seaward in d-space.
          return p.y - nwrCoastZ(p.x) + 6.35;
        }
        float nwrMainWhiteBeach(vec2 p) {
          float bd = nwrBeachDistance(p);
          return smoothstep(-1.4, 2.0, bd) * (1.0 - smoothstep(28.0, 44.0, bd));
        }
        float nwrShorePearl(vec2 p) {
          float bd = nwrBeachDistance(p);
          return (1.0 - smoothstep(5.0, 26.0, bd)) * smoothstep(-1.2, 1.4, bd);
        }
        float nwrWhiteBeachMask(vec2 p, float h) {
          float di = nwrIslet(p);
          float shore = nwrMainWhiteBeach(p);
          float islet = (1.0 - smoothstep(0.82, 1.18, di)) * smoothstep(-0.35, 0.08, h);
          float outcrop = smoothstep(0.3, 0.55, nwrOutcrop(p));
          return clamp(max(shore, islet) * (1.0 - outcrop), 0.0, 1.0);
        }
        vec3 nwrSand(vec2 p) {
          // Kept close to Northern Shore's tropical shallows palette: bright
          // coral sand, but not paper-white once ACES and water glints hit it.
          float grain = nwrFbm(p * 0.7 + vec2(4.0, -9.0));
          float rippleWave = sin((p.x * 0.35 + p.y * 1.25) * 1.7 + nwrFbm(p * 0.5) * 2.4);
          float ripple = smoothstep(0.18, 0.0, abs(rippleWave) - 0.05);
          vec3 color = mix(vec3(0.46, 0.44, 0.35), vec3(0.62, 0.58, 0.46), grain);
          vec3 tuff = nwrTuffAlbedo(p) * vec3(1.08, 1.04, 0.94);
          color = mix(color, tuff, 0.68);
          color = mix(color, vec3(0.69, 0.65, 0.52), ripple * 0.14);
          color = mix(color, vec3(0.40, 0.38, 0.31), smoothstep(0.6, 0.95, nwrFbm(p * 3.1 + vec2(-2.0, 6.0))) * 0.2);
          return color;
        }
        vec3 nwrWhiteSand(vec2 p) {
          float broad = nwrFbm(p * 0.052 + vec2(11.0, -5.0));
          vec2 uvA = p * uNwrWhiteSandScale + vec2(0.17, -0.09);
          vec2 uvB = nwrRotate(p, 0.72) * (uNwrWhiteSandScale * 0.62) + vec2(-0.31, 0.23);
          vec3 a = nwrSrgbToLinear(texture2D(uNwrWhiteSandAlbedo, uvA).rgb);
          vec3 b = nwrSrgbToLinear(texture2D(uNwrWhiteSandAlbedo, uvB).rgb);
          vec3 tex = mix(a, b, 0.12 + broad * 0.12);
          float heightGrain = nwrWhiteHeightGrain(p) - 0.5;
          float fine = nwrFbm(p * 5.4 + vec2(4.0, -7.0));
          vec3 contrast = clamp((tex - vec3(0.66, 0.58, 0.46)) * 1.4 + vec3(0.80, 0.76, 0.60), 0.0, 1.0);
          vec3 shellWhite = mix(vec3(0.84, 0.80, 0.60), vec3(0.98, 0.94, 0.74), broad * 0.62 + fine * 0.2);
          vec3 sand = mix(shellWhite, contrast, 0.38);
          sand += heightGrain * vec3(0.16, 0.145, 0.10);
          sand += (fine - 0.5) * vec3(0.065, 0.058, 0.04);
          return clamp(sand, 0.0, 1.0);
        }
        vec3 nwrSeabed(vec2 p, float h) {
          // Northern Shore-style shallow colour: turquoise-grey sand under
          // water, not exposed dry sand. The water shader supplies the sparkle.
          float dapple = nwrFbm(p * 0.8 + vec2(2.0, 5.0)) * 0.6 + nwrFbm(p * 2.6 + vec2(-7.0, 1.0)) * 0.4;
          vec3 shallow = mix(vec3(0.38, 0.62, 0.58), vec3(0.58, 0.76, 0.66), dapple);
          vec3 deep = mix(vec3(0.25, 0.52, 0.53), vec3(0.42, 0.68, 0.61), dapple);
          float depth = clamp((-0.45 - h) / 1.4, 0.0, 1.0);
          return mix(shallow, deep, depth);
        }
        vec3 nwrTropicalSeabed(vec2 p, float h, vec3 shoreSand) {
          float depth = clamp((-0.45 - h) / 1.55, 0.0, 1.0);
          float dapple = nwrFbm(p * 0.68 + vec2(2.0, 5.0)) * 0.62 + nwrFbm(p * 2.0 + vec2(-7.0, 1.0)) * 0.38;
          vec3 wetPearl = mix(vec3(0.80, 0.80, 0.70), vec3(0.96, 0.93, 0.80), dapple);
          vec3 shallowTeal = mix(vec3(0.43, 0.84, 0.86), vec3(0.68, 0.94, 0.85), dapple);
          vec3 deeper = mix(vec3(0.28, 0.76, 0.82), vec3(0.50, 0.90, 0.82), dapple);
          vec3 seabed = mix(wetPearl, shallowTeal, smoothstep(0.08, 0.34, depth));
          seabed = mix(seabed, deeper, smoothstep(0.42, 1.0, depth));
          seabed = mix(seabed, shoreSand * vec3(0.96, 0.95, 0.84), 0.16 * (1.0 - smoothstep(0.18, 0.5, depth)));
          return seabed;
        }
        vec3 nwrCoral(vec2 p) {
          float mottle = nwrFbm(p * 1.9 + vec2(-3.0, 8.0));
          float head = smoothstep(0.45, 0.8, nwrFbm(p * 3.6 + vec2(9.0, -4.0)));
          float crevice = smoothstep(0.06, 0.0, abs(sin((p.x * 0.9 + p.y * 0.6) * 2.3)) - 0.035);
          vec3 color = mix(vec3(0.62, 0.45, 0.41), vec3(0.74, 0.42, 0.46), smoothstep(0.35, 0.7, mottle));
          color = mix(color, vec3(0.60, 0.58, 0.36), head * 0.5);
          color = mix(color, vec3(0.78, 0.70, 0.58), smoothstep(0.75, 0.95, mottle) * 0.45);
          color = mix(color, vec3(0.16, 0.14, 0.13), crevice * 0.55);
          return color;
        }
        vec3 nwrBasalt(vec2 p) {
          float broad = nwrFbm(p * 0.24);
          float chips = nwrFbm(p * 2.7 + vec2(14.0, -8.0));
          float crack = smoothstep(0.05, 0.0, abs(sin((p.x * 0.68 + p.y * 0.3) * 2.5)) - 0.03);
          vec3 color = mix(vec3(0.085, 0.082, 0.074), vec3(0.22, 0.21, 0.18), broad);
          color = mix(color, vec3(0.32, 0.28, 0.21), smoothstep(0.74, 0.95, chips) * 0.4);
          color = mix(color, vec3(0.035, 0.035, 0.032), crack * 0.65);
          return color;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vTerrainWorld.xz;
        float h = vTerrainWorld.y;
        float d = p.y - nwrCoastZ(p.x);
        float beachD = nwrBeachDistance(p);
        float di = nwrIslet(p);
        vec3 color = nwrSand(p);
        // Soft dune-scale shading breaks up the flat beach plane.
        float dune = nwrFbm(p * 0.07 + vec2(13.0, 2.0));
        color *= 0.93 + dune * 0.1;
        vec3 whiteSand = nwrWhiteSand(p);
        float shoreWhite = nwrMainWhiteBeach(p);
        float outcropMask = smoothstep(0.3, 0.55, nwrOutcrop(p));
        float whiteSandMask = nwrWhiteBeachMask(p, h);
        color = mix(color, whiteSand, whiteSandMask);
        float shorePearl = nwrShorePearl(p) * shoreWhite * (1.0 - outcropMask);
        vec3 pearlSand = mix(whiteSand, vec3(0.98, 0.94, 0.80), 0.36);
        color = mix(color, pearlSand, shorePearl * 0.5);
        // High-water wrack stays behind the clean white beach face.
        float wrackPath = abs(beachD - 9.0 - sin(p.x * 0.19) * 0.7);
        float wrack = smoothstep(0.5, 0.1, wrackPath) * smoothstep(0.4, 0.72, nwrFbm(p * 2.1 + vec2(3.0, -6.0))) * step(0.0, beachD) * (1.0 - smoothstep(0.45, 0.9, whiteSandMask));
        color = mix(color, vec3(0.52, 0.48, 0.37), wrack * 0.22);
        // Submerged shelf: dappled sand, coral heads in the ring patches.
        float sub = 1.0 - smoothstep(-1.08, -0.84, h);
        float band = smoothstep(1.1, 1.4, di) * (1.0 - smoothstep(1.85, 2.3, di));
        float coralPatch = smoothstep(0.38, 0.62, nwrFbm(p * 0.14 + vec2(21.0, -7.0)));
        float coralZone = max(band * coralPatch * 1.4, nwrGarden(p) * 1.1);
        vec3 seabed = nwrSeabed(p, h);
        float tropicalShelf = max(smoothstep(-22.0, -2.0, d), (1.0 - smoothstep(1.16, 2.05, di)));
        seabed = mix(seabed, nwrTropicalSeabed(p, h, whiteSand), clamp(tropicalShelf, 0.0, 1.0));
        // Coral should read through the water, but not as saturated dry
        // geometry. Blend it down into the submerged sand colour.
        seabed = mix(seabed, nwrCoral(p), clamp(coralZone, 0.0, 1.0) * sub * 0.58);
        color = mix(color, seabed, sub);
        // Basalt outcrops; the islet itself stays white sand.
        float basalt = outcropMask;
        color = mix(color, nwrBasalt(p), clamp(basalt, 0.0, 1.0));
        // --- Rhythmic swash on the beach face ---
        float swashCycle = sin(uSwashTime * 0.5984) * 0.5 + 0.5;
        float swashD = 0.25 + swashCycle * 1.7 + sin(p.x * 0.17 + uSwashTime * 0.30) * 0.3;
        float foamEdge = smoothstep(0.5, 0.05, abs(beachD - swashD)) * step(0.0, beachD) * (1.0 - basalt);
        float foamSpeckle = smoothstep(0.35, 0.75, nwrFbm(p * 5.0 + vec2(uSwashTime * 0.4, 0.0)));
        // Wet sand should read as a pale reflective sheen, not a muddy band.
        float wet = (1.0 - smoothstep(swashD * 0.45, swashD + 1.15, beachD)) * step(0.0, beachD) * shoreWhite * (1.0 - basalt);
        vec3 wetSand = mix(color, vec3(0.88, 0.86, 0.74), 0.1);
        color = mix(color, wetSand, clamp(wet, 0.0, 1.0) * 0.18);
        color = mix(color, vec3(0.78, 0.86, 0.82), foamEdge * (0.20 + foamSpeckle * 0.28));
        float fine = nwrFbm(p * 6.5);
        color *= 0.91 + fine * 0.1;
        diffuseColor.rgb = mix(diffuseColor.rgb, color, 0.9);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec2 rp = vTerrainWorld.xz;
        float rh = vTerrainWorld.y;
        float rSub = 1.0 - smoothstep(-1.08, -0.84, rh);
        float rDi = nwrIslet(rp);
        float rBasalt = max(smoothstep(0.3, 0.55, nwrOutcrop(rp)), (1.0 - smoothstep(0.38, 0.58, rDi)) * smoothstep(0.42, 0.7, rh));
        float rTuffMask = nwrDryTuffMask(rh, clamp(rBasalt, 0.0, 1.0), rSub) * (1.0 - nwrWhiteBeachMask(rp, rh));
        float rTuff = nwrTuffRoughness(rp);
        roughnessFactor = mix(roughnessFactor, rTuff, rTuffMask * uNwrTuffRoughnessMix);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        // Shore-parallel wind ripples + grain give the sand surface relief so
        // it shades like sand instead of a flat bright plane.
        float rippleRelief = sin((vTerrainWorld.x * 0.35 + vTerrainWorld.z * 1.25) * 1.7 + nwrFbm(vTerrainWorld.xz * 0.5) * 2.4) * 0.22;
        float detailHeight = nwrFbm(vTerrainWorld.xz * 2.2) * 0.4 + nwrFbm(vTerrainWorld.xz * 8.0) * 0.14 + rippleRelief;
        vec3 dpdx = dFdx(vTerrainWorld);
        vec3 dpdy = dFdy(vTerrainWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.34 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));
        float nSub = 1.0 - smoothstep(-1.08, -0.84, vTerrainWorld.y);
        float nDi = nwrIslet(vTerrainWorld.xz);
        float nBasalt = max(smoothstep(0.3, 0.55, nwrOutcrop(vTerrainWorld.xz)), (1.0 - smoothstep(0.38, 0.58, nDi)) * smoothstep(0.42, 0.7, vTerrainWorld.y));
        float nTuffMask = nwrDryTuffMask(vTerrainWorld.y, clamp(nBasalt, 0.0, 1.0), nSub) * (1.0 - nwrWhiteBeachMask(vTerrainWorld.xz, vTerrainWorld.y));
        vec3 tuffNormal = nwrTuffNormal(vTerrainWorld.xz);
        vec3 surfaceNormal = normal;
        vec3 tangentX = normalize(vec3(1.0, 0.0, 0.0) - surfaceNormal * dot(surfaceNormal, vec3(1.0, 0.0, 0.0)));
        vec3 tangentZ = normalize(cross(tangentX, surfaceNormal));
        vec3 mappedNormal = normalize(tangentX * tuffNormal.x + tangentZ * tuffNormal.y + surfaceNormal * tuffNormal.z);
        normal = normalize(mix(normal, mappedNormal, nTuffMask * 0.86));`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'nw-reef-tropical-white-shore-v4';
  material.needsUpdate = true;
  return material;
}
