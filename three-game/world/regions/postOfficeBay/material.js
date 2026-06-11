import * as THREE from 'three';

export function createPostOfficeBayTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    flatShading: false,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = { value: new THREE.Color('#f1d38a') };
    shader.uniforms.rimIntensity = { value: 0.08 };
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
        varying vec3 vTerrainWorld;
        float terrainHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float terrainNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), u.x), mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float terrainFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += terrainNoise(p) * amp;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p;
            amp *= 0.52;
          }
          return value;
        }
        float ridgeLine(vec2 p, float frequency, float width) {
          float wave = abs(sin((p.x * 0.72 + p.y * 0.28) * frequency));
          return smoothstep(width, 0.0, wave);
        }
        vec3 lavaMaterial(vec2 p) {
          float broad = terrainFbm(p * 0.19);
          float chips = terrainFbm(p * 2.6 + vec2(14.0, -8.0));
          float crack = ridgeLine(p + vec2(chips * 0.9, broad), 2.8, 0.045);
          vec3 color = mix(vec3(0.055, 0.058, 0.05), vec3(0.18, 0.17, 0.14), broad);
          color = mix(color, vec3(0.35, 0.29, 0.18), smoothstep(0.72, 0.94, chips) * 0.65);
          color = mix(color, vec3(0.018, 0.019, 0.017), crack * 0.75);
          return color;
        }
        vec3 tuffMaterial(vec2 p) {
          float grain = terrainFbm(p * 0.75);
          float strata = ridgeLine(p + vec2(grain, 0.0), 0.62, 0.12);
          vec3 color = mix(vec3(0.44, 0.37, 0.25), vec3(0.72, 0.62, 0.42), grain);
          color = mix(color, vec3(0.30, 0.27, 0.21), strata * 0.22);
          return color;
        }
        vec3 ashMaterial(vec2 p) {
          float dust = terrainFbm(p * 0.42 + vec2(-5.0, 2.0));
          float pebble = smoothstep(0.76, 0.96, terrainFbm(p * 3.8));
          vec3 color = mix(vec3(0.40, 0.36, 0.25), vec3(0.62, 0.56, 0.38), dust);
          color += pebble * vec3(0.06, 0.05, 0.035);
          return color;
        }
        vec3 beachMaterial(vec2 p) {
          float grain = terrainFbm(p * 0.62 + vec2(4.0, -9.0));
          float ripple = ridgeLine(p + vec2(grain * 0.8, 0.0), 0.92, 0.16);
          vec3 color = mix(vec3(0.58, 0.52, 0.38), vec3(0.82, 0.72, 0.48), grain);
          color = mix(color, vec3(0.92, 0.82, 0.58), ripple * 0.18);
          return color;
        }
        vec3 scrubMaterial(vec2 p) {
          float scrub = terrainFbm(p * 0.58 + vec2(3.0, 11.0));
          float drySeed = smoothstep(0.68, 0.93, terrainFbm(p * 2.2));
          vec3 color = mix(vec3(0.34, 0.38, 0.22), vec3(0.55, 0.49, 0.30), scrub);
          color = mix(color, vec3(0.70, 0.62, 0.36), drySeed * 0.28);
          return color;
        }
        float pobSegmentDistance(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
          return length(p - (a + ab * t));
        }
        float pobTrailSegment(vec2 p, vec2 a, vec2 b) {
          float d = pobSegmentDistance(p, a, b);
          return 1.0 - smoothstep(1.2, 3.8, d);
        }
        float pobTrail(vec2 p) {
          float t = 0.0;
          t = max(t, pobTrailSegment(p, vec2(11.0, 6.0), vec2(6.0, 12.0)));
          t = max(t, pobTrailSegment(p, vec2(6.0, 12.0), vec2(1.0, 20.0)));
          t = max(t, pobTrailSegment(p, vec2(1.0, 20.0), vec2(-9.0, 28.0)));
          t = max(t, pobTrailSegment(p, vec2(-9.0, 28.0), vec2(-23.0, 31.0)));
          t = max(t, pobTrailSegment(p, vec2(-23.0, 31.0), vec2(-38.0, 27.0)));
          t = max(t, pobTrailSegment(p, vec2(-38.0, 27.0), vec2(-51.0, 17.0)));
          t = max(t, pobTrailSegment(p, vec2(-51.0, 17.0), vec2(-58.0, 6.0)));
          float brokenEdge = terrainFbm(p * 1.25 + vec2(2.0, -5.0));
          return t * (0.82 + brokenEdge * 0.22);
        }
        `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vTerrainWorld.xz;
        vec3 n = normalize(vNormal);
        float height = vTerrainWorld.y;
        float slope = smoothstep(0.34, 0.86, 1.0 - abs(n.y));
        float waterByHeight = 1.0 - smoothstep(-1.08, -0.16, height);
        float shoreBand = 1.0 - smoothstep(0.0, 0.78, abs(height + 0.42));
        float wet = max(waterByHeight, shoreBand * 0.58);
        float beach = shoreBand * (1.0 - slope * 0.72);
        beach = max(beach, smoothstep(-13.0, -27.0, p.y) * smoothstep(-0.2, 2.2, height) * (1.0 - slope * 0.55));
        float trail = pobTrail(p) * smoothstep(-0.4, 1.8, height) * (1.0 - smoothstep(0.22, 0.72, waterByHeight));
        float ridge = max(smoothstep(15.0, 30.0, p.y), smoothstep(5.0, 7.6, height));
        float lava = max(smoothstep(0.22, 0.72, terrainFbm(p * 0.12 + vec2(8.0, -3.0))), smoothstep(-7.0, -18.0, p.x));
        float scrub = smoothstep(5.0, 20.0, p.x) * smoothstep(-3.0, 13.0, p.y) * (1.0 - slope * 0.85);
        vec3 color = ashMaterial(p);
        color = mix(color, lavaMaterial(p), clamp(lava * 0.88 + wet * 0.45, 0.0, 1.0));
        color = mix(color, tuffMaterial(p), clamp(ridge * 0.78 + slope * 0.35, 0.0, 1.0));
        color = mix(color, scrubMaterial(p), clamp(scrub * 0.62, 0.0, 1.0));
        color = mix(color, beachMaterial(p), clamp(beach * 0.58, 0.0, 1.0));
        color = mix(color, vec3(0.10, 0.18, 0.16), wet * 0.18);
        color = mix(color, vec3(0.73, 0.57, 0.31), clamp(trail * 0.58, 0.0, 0.72));
        color = mix(color, vec3(0.86, 0.73, 0.46), clamp(trail * smoothstep(0.56, 0.9, terrainFbm(p * 2.1)), 0.0, 0.24));
        float fine = terrainFbm(p * 6.5);
        float grit = smoothstep(0.62, 0.96, fine);
        color *= 0.92 + fine * 0.18;
        color += grit * vec3(0.035, 0.028, 0.018);
        diffuseColor.rgb = mix(diffuseColor.rgb, color, 0.94);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float detailHeight = terrainFbm(vTerrainWorld.xz * 2.2) * 0.6 + terrainFbm(vTerrainWorld.xz * 7.5) * 0.18;
        vec3 dpdx = dFdx(vTerrainWorld);
        vec3 dpdy = dFdy(vTerrainWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.55 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.needsUpdate = true;
  return material;
}
