import * as THREE from 'three';

// Post Office Bay III terrain follows the Northern Shore rendering pattern:
// vertex colors provide a safe authored base, then a compact per-pixel splat
// shader supplies the close ground material detail.
export function createPostOfficeBay3TerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = { value: new THREE.Color('#e7cf8f') };
    shader.uniforms.rimIntensity = { value: 0.05 };
    shader.uniforms.uSwashTime = { value: 0 };
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
        varying vec3 vTerrainWorld;

        float pob3Hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float pob3Noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(pob3Hash(i), pob3Hash(i + vec2(1.0, 0.0)), u.x), mix(pob3Hash(i + vec2(0.0, 1.0)), pob3Hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float pob3Fbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            value += pob3Noise(p) * amp;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p;
            amp *= 0.52;
          }
          return value;
        }
        float pob3CoastZ(float x) {
          float coast = -12.5;
          coast += 18.0 * exp(-pow((x - 5.0) / 25.0, 2.0));
          coast -= 26.0 * smoothstep(22.0, 48.0, -x);
          coast -= 8.0 * smoothstep(37.0, 56.0, x);
          coast += sin(x * 0.31 + 2.4) * 0.55 + sin(x * 0.13 - 1.2) * 0.75;
          return coast;
        }
        float pob3SegmentDistance(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
          return length(p - (a + ab * t));
        }
        float pob3TrailDistance(vec2 p) {
          float d = 999.0;
          d = min(d, pob3SegmentDistance(p, vec2(24.0, -1.0), vec2(18.0, 8.0)));
          d = min(d, pob3SegmentDistance(p, vec2(18.0, 8.0), vec2(11.0, 18.0)));
          d = min(d, pob3SegmentDistance(p, vec2(11.0, 18.0), vec2(6.0, 30.0)));
          d = min(d, pob3SegmentDistance(p, vec2(6.0, 30.0), vec2(1.0, 43.0)));
          d = min(d, pob3SegmentDistance(p, vec2(1.0, 43.0), vec2(-7.0, 55.0)));
          return d;
        }
        vec3 pob3Sand(vec2 p) {
          float grain = pob3Fbm(p * 0.62 + vec2(4.0, -9.0));
          float fine = pob3Fbm(p * 5.4 + vec2(-2.0, 8.0));
          float ripple = smoothstep(0.12, 0.0, abs(sin((p.x * 0.42 + p.y * 1.4 + grain) * 1.8)) - 0.07);
          float shell = step(0.976, pob3Hash(floor(p * 8.0))) * smoothstep(0.38, 0.88, fine);
          vec3 color = mix(vec3(0.50, 0.45, 0.31), vec3(0.83, 0.72, 0.48), grain);
          color = mix(color, vec3(0.94, 0.84, 0.60), ripple * 0.22);
          color = mix(color, vec3(0.96, 0.91, 0.74), shell * 0.72);
          color *= 0.88 + fine * 0.20;
          return color;
        }
        vec3 pob3Path(vec2 p, float trailDistance) {
          float dust = pob3Fbm(p * 0.45 + vec2(8.0, -2.0));
          float packed = pob3Fbm(p * vec2(1.45, 0.55) + vec2(-3.0, 12.0));
          float longWear = smoothstep(0.18, 0.0, abs(sin((p.y * 0.72 + p.x * 0.14) * 1.15)) - 0.06);
          float brokenEdge = smoothstep(0.42, 0.82, pob3Fbm(p * 1.9 + vec2(2.0, -5.0)));
          float pebble = step(0.972, pob3Hash(floor(p * 9.0))) * smoothstep(0.48, 0.90, packed);
          vec3 color = mix(vec3(0.25, 0.19, 0.12), vec3(0.56, 0.38, 0.22), dust);
          color = mix(color, vec3(0.72, 0.50, 0.28), packed * 0.24);
          color = mix(color, vec3(0.17, 0.13, 0.09), longWear * 0.30);
          color = mix(color, vec3(0.67, 0.47, 0.27), brokenEdge * smoothstep(1.8, 4.5, trailDistance) * 0.24);
          color += pebble * vec3(0.08, 0.06, 0.04);
          return color;
        }
        vec3 pob3Grass(vec2 p) {
          float grassPatch = pob3Fbm(p * 0.46 + vec2(3.0, 11.0));
          float lowGreen = smoothstep(0.42, 0.76, pob3Fbm(p * 0.9 + vec2(-7.0, 2.0)));
          float dry = smoothstep(0.58, 0.91, pob3Fbm(p * 1.8 + vec2(13.0, -6.0)));
          float tuft = smoothstep(0.66, 0.93, pob3Fbm(p * 5.8 + vec2(-1.0, 9.0)));
          vec3 color = mix(vec3(0.30, 0.38, 0.20), vec3(0.51, 0.52, 0.30), grassPatch);
          color = mix(color, vec3(0.20, 0.30, 0.15), lowGreen * 0.34);
          color = mix(color, vec3(0.64, 0.57, 0.34), dry * 0.20);
          color = mix(color, vec3(0.39, 0.45, 0.23), tuft * 0.18);
          return color;
        }
        vec3 pob3Scrub(vec2 p) {
          float earth = pob3Fbm(p * 0.55 + vec2(9.0, 2.0));
          float litter = smoothstep(0.55, 0.9, pob3Fbm(p * 2.6 + vec2(-8.0, 3.0)));
          float twig = step(0.968, pob3Hash(floor(p * 11.0 + vec2(3.0, -2.0))));
          vec3 color = mix(vec3(0.18, 0.23, 0.12), vec3(0.35, 0.35, 0.20), earth);
          color = mix(color, vec3(0.10, 0.11, 0.06), litter * 0.30);
          color = mix(color, vec3(0.31, 0.20, 0.10), twig * 0.16);
          return color;
        }
        vec3 pob3Sesuvium(vec2 p) {
          float mottle = pob3Fbm(p * 1.55 + vec2(-3.0, 8.0));
          float pad = smoothstep(0.40, 0.76, pob3Fbm(p * 3.1 + vec2(5.0, -2.0)));
          float darkLeaf = smoothstep(0.64, 0.92, pob3Fbm(p * 4.4 + vec2(-8.0, 7.0)));
          vec3 earth = vec3(0.43, 0.33, 0.23);
          vec3 rust = vec3(0.54, 0.19, 0.14);
          vec3 wine = vec3(0.34, 0.08, 0.10);
          vec3 green = vec3(0.32, 0.37, 0.20);
          vec3 color = mix(earth, rust, smoothstep(0.34, 0.72, mottle));
          color = mix(color, wine, darkLeaf * 0.42);
          color = mix(color, green, pad * (1.0 - mottle) * 0.34);
          return color;
        }
        vec3 pob3Basalt(vec2 p) {
          float broad = pob3Fbm(p * 0.22 + vec2(1.0, -1.0));
          float chips = pob3Fbm(p * 3.0 + vec2(14.0, -8.0));
          float crack = smoothstep(0.055, 0.0, abs(sin((p.x * 0.72 + p.y * 0.28 + broad) * 2.4)) - 0.026);
          vec3 color = mix(vec3(0.05, 0.05, 0.045), vec3(0.20, 0.18, 0.14), broad);
          color = mix(color, vec3(0.32, 0.26, 0.18), smoothstep(0.74, 0.96, chips) * 0.36);
          color = mix(color, vec3(0.018, 0.018, 0.016), crack * 0.70);
          return color;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vTerrainWorld.xz;
        float d = p.y - pob3CoastZ(p.x);
        float trailDistance = pob3TrailDistance(p);
        float beachArc = exp(-pow((p.x - 5.0) / 28.0, 2.0));
        float beach = smoothstep(-0.6, 1.2, d) * (1.0 - smoothstep(8.5, 16.0, d)) * (0.32 + beachArc * 0.68);
        float landing = clamp(1.0 - length(vec2((p.x - 24.0) / 9.5, (p.y + 0.5) / 6.2)), 0.0, 1.0);
        float trail = (1.0 - smoothstep(3.2, 7.2, trailDistance)) * smoothstep(0.0, 3.3, d);
        float trailCenter = (1.0 - smoothstep(1.25, 3.3, trailDistance)) * smoothstep(0.6, 3.8, d);
        float trailShoulder = smoothstep(2.9, 5.0, trailDistance) * (1.0 - smoothstep(7.2, 10.8, trailDistance)) * smoothstep(2.0, 8.0, d);
        float leftWall = (1.0 - smoothstep(-36.0, -16.0, p.x)) * smoothstep(1.0, 18.0, p.y);
        float eastWall = smoothstep(22.0, 38.0, p.x) * smoothstep(3.0, 20.0, p.y);
        float backWall = smoothstep(28.0, 45.0, p.y);
        float denseScrub = clamp(max(max(leftWall, eastWall), max(backWall, trailShoulder * 0.72)) * smoothstep(9.0, 22.0, d), 0.0, 1.0);
        denseScrub *= 1.0 - trailCenter * 0.86;
        float dryGrass = smoothstep(4.0, 18.0, d) * (1.0 - denseScrub * 0.42) * (1.0 - trailCenter * 0.82);
        float redBand = smoothstep(3.5, 7.2, d) * (1.0 - smoothstep(15.0, 21.0, d));
        float redPatch = redBand
          * smoothstep(0.36, 0.58, pob3Fbm(p * 0.30 + vec2(5.0, 0.0)))
          * smoothstep(0.28, 0.54, pob3Fbm(p * 0.19 + vec2(-9.0, 14.0)))
          * (1.0 - trailCenter * 0.65);
        float headland = exp(-pow((p.x + 42.0) / 23.0, 2.0) - pow((p.y + 22.0) / 21.0, 2.0)) * smoothstep(-1.0, 5.0, d);
        float eastPoint = exp(-pow((p.x - 49.0) / 13.0, 2.0) - pow((p.y + 17.0) / 10.5, 2.0)) * smoothstep(-1.0, 3.0, d);
        float basalt = clamp(eastPoint + smoothstep(0.78, 0.95, pob3Fbm(p * 0.08 + vec2(8.0, -4.0))) * smoothstep(7.0, 14.0, d) * 0.34, 0.0, 1.0);
        float seabed = smoothstep(-0.45, -2.6, d);

        vec3 color = pob3Grass(p);
        color = mix(color, pob3Scrub(p), clamp(denseScrub * 0.86, 0.0, 1.0));
        color = mix(color, pob3Sesuvium(p), clamp(redPatch * 0.86, 0.0, 1.0));
        color = mix(color, pob3Grass(p * 1.25) * vec3(0.84, 0.92, 0.78), clamp(headland * 0.80, 0.0, 1.0));
        color = mix(color, pob3Sand(p), clamp(beach * 1.08 + landing * 1.05, 0.0, 1.0));
        color = mix(color, pob3Grass(p) * vec3(0.94, 0.88, 0.64), clamp(trailShoulder * 0.58, 0.0, 1.0));
        color = mix(color, pob3Path(p, trailDistance), clamp(trail * 0.96 + trailCenter * 0.52, 0.0, 1.0));
        color = mix(color, pob3Basalt(p), clamp(basalt * 0.92, 0.0, 1.0));
        color = mix(color, vec3(0.30, 0.55, 0.55), seabed * 0.74);

        float swashCycle = sin(uSwashTime * 0.8976) * 0.5 + 0.5;
        float swashD = 0.25 + swashCycle * 1.65 + sin(p.x * 0.18 + uSwashTime * 0.45) * 0.25;
        float wet = smoothstep(swashD + 1.4, swashD * 0.4, d) * (1.0 - seabed * 0.65);
        wet = max(wet, smoothstep(1.3, 0.0, abs(d)) * 0.65);
        float foamEdge = smoothstep(0.5, 0.05, abs(d - swashD)) * step(0.0, d);
        float foamSpeckle = smoothstep(0.35, 0.75, pob3Fbm(p * 5.0 + vec2(uSwashTime * 0.6, 0.0)));
        color = mix(color, color * vec3(0.50, 0.56, 0.52), clamp(wet, 0.0, 1.0) * 0.45);
        color = mix(color, vec3(0.92, 0.96, 0.94), foamEdge * (0.32 + foamSpeckle * 0.44));

        float fine = pob3Fbm(p * 6.5);
        float speck = step(0.986, pob3Hash(floor(p * 13.0)));
        color *= 0.91 + fine * 0.15;
        color += speck * vec3(0.032, 0.027, 0.018) * (0.35 + beach * 0.55 + trail * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.94);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float detailHeight = pob3Fbm(vTerrainWorld.xz * 2.2) * 0.38 + pob3Fbm(vTerrainWorld.xz * 8.2) * 0.12;
        vec3 dpdx = dFdx(vTerrainWorld);
        vec3 dpdy = dFdy(vTerrainWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.40 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.7);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'post-office-bay-3-north-shore-style-splat-v2';
  material.needsUpdate = true;
  return material;
}
