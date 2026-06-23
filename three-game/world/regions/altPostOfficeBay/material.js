import * as THREE from 'three';

// Terrain material for the alternate Post Office Bay. Same procedural-detail
// approach as the original cove, but keyed to the mockup palette: warm golden
// beach sand, olive-green scrub broken by dry patches, a green headland, and
// only small black basalt outcrops instead of broad lava sheets.

export function createAltPostOfficeBayTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = { value: new THREE.Color('#f4dc96') };
    shader.uniforms.rimIntensity = { value: 0.07 };
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
        // Approximation of the JS coastline: water at p.y < coast(x).
        float altCoastZ(float x) {
          float coast = -10.0;
          coast += 19.0 * exp(-pow((x - 4.0) / 24.0, 2.0));
          coast -= 30.0 * smoothstep(22.0, 46.0, -x);
          coast -= 9.0 * smoothstep(36.0, 56.0, x);
          return coast;
        }
        vec3 sandMaterial(vec2 p) {
          float grain = terrainFbm(p * 0.6 + vec2(4.0, -9.0));
          float ripple = ridgeLine(p + vec2(grain * 0.8, 0.0), 0.9, 0.16);
          vec3 color = mix(vec3(0.78, 0.66, 0.42), vec3(0.92, 0.81, 0.55), grain);
          color = mix(color, vec3(0.97, 0.89, 0.66), ripple * 0.2);
          return color;
        }
        vec3 scrubMaterial(vec2 p) {
          float scrub = terrainFbm(p * 0.55 + vec2(3.0, 11.0));
          float drySeed = smoothstep(0.66, 0.92, terrainFbm(p * 2.1));
          vec3 color = mix(vec3(0.33, 0.37, 0.20), vec3(0.55, 0.49, 0.29), scrub);
          color = mix(color, vec3(0.69, 0.60, 0.35), drySeed * 0.34);
          return color;
        }
        vec3 greenScrubMaterial(vec2 p) {
          float lush = terrainFbm(p * 0.7 + vec2(-8.0, 5.0));
          vec3 color = mix(vec3(0.24, 0.34, 0.16), vec3(0.42, 0.50, 0.24), lush);
          color = mix(color, vec3(0.55, 0.55, 0.30), smoothstep(0.74, 0.95, terrainFbm(p * 2.6)) * 0.3);
          return color;
        }
        vec3 basaltMaterial(vec2 p) {
          float broad = terrainFbm(p * 0.22);
          float chips = terrainFbm(p * 2.6 + vec2(14.0, -8.0));
          float crack = ridgeLine(p + vec2(chips * 0.9, broad), 2.8, 0.05);
          vec3 color = mix(vec3(0.06, 0.062, 0.055), vec3(0.19, 0.18, 0.15), broad);
          color = mix(color, vec3(0.02, 0.021, 0.019), crack * 0.7);
          return color;
        }
        float altSegmentDistance(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
          return length(p - (a + ab * t));
        }
        float altTrail(vec2 p) {
          float t = 0.0;
          t = max(t, 1.0 - smoothstep(1.1, 3.4, altSegmentDistance(p, vec2(26.0, -1.0), vec2(20.0, 8.0))));
          t = max(t, 1.0 - smoothstep(1.1, 3.4, altSegmentDistance(p, vec2(20.0, 8.0), vec2(13.0, 18.0))));
          t = max(t, 1.0 - smoothstep(1.1, 3.4, altSegmentDistance(p, vec2(13.0, 18.0), vec2(8.0, 30.0))));
          t = max(t, 1.0 - smoothstep(1.1, 3.4, altSegmentDistance(p, vec2(8.0, 30.0), vec2(4.0, 44.0))));
          t = max(t, 1.0 - smoothstep(1.1, 3.4, altSegmentDistance(p, vec2(4.0, 44.0), vec2(2.0, 56.0))));
          float brokenEdge = terrainFbm(p * 1.25 + vec2(2.0, -5.0));
          return t * (0.8 + brokenEdge * 0.24);
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
        float coastD = p.y - altCoastZ(p.x);
        float waterByHeight = 1.0 - smoothstep(-0.95, -0.12, height);
        float wetBand = 1.0 - smoothstep(0.0, 2.4, abs(coastD));
        // Golden beach: a band hugging the waterline, widest mid-bay.
        float bayArc = exp(-pow((p.x - 4.0) / 26.0, 2.0));
        float beach = smoothstep(-0.5, 1.2, coastD) * (1.0 - smoothstep(5.0, 11.0, coastD)) * (0.35 + bayArc * 0.65);
        // Pale landing flat around the post barrel.
        float landing = max(0.0, 1.0 - length(vec2((p.x - 26.0) / 9.0, (p.y + 1.0) / 6.0)));
        // Green headland on the west.
        float headland = exp(-pow((p.x + 42.0) / 24.0, 2.0) - pow((p.y + 20.0) / 22.0, 2.0)) * smoothstep(-1.0, 4.0, coastD);
        // Small basalt outcrops: eastern point plus scattered noise seeds.
        float eastPoint = exp(-pow((p.x - 50.0) / 13.0, 2.0) - pow((p.y + 18.0) / 11.0, 2.0)) * smoothstep(-1.0, 2.0, coastD);
        float basalt = max(eastPoint, smoothstep(0.78, 0.95, terrainFbm(p * 0.55 + vec2(9.0, -4.0))) * smoothstep(4.0, 8.0, coastD) * 0.8);
        float scrub = smoothstep(6.0, 16.0, coastD);
        float trail = altTrail(p) * smoothstep(0.5, 3.0, coastD);

        vec3 color = sandMaterial(p) * vec3(0.92, 0.88, 0.8); // dry ash base
        color = mix(color, scrubMaterial(p), clamp(scrub * 0.85, 0.0, 1.0));
        color = mix(color, greenScrubMaterial(p), clamp(headland * 1.2, 0.0, 1.0));
        color = mix(color, sandMaterial(p), clamp(beach * 1.1 + landing * 0.9, 0.0, 1.0));
        color = mix(color, basaltMaterial(p), clamp(basalt * 0.9 + slope * 0.25, 0.0, 1.0));
        color = mix(color, vec3(0.36, 0.33, 0.25), wetBand * (1.0 - smoothstep(0.0, 1.4, coastD)) * 0.55);
        color = mix(color, vec3(0.10, 0.20, 0.19), waterByHeight * 0.5);
        color = mix(color, vec3(0.80, 0.66, 0.42), clamp(trail * 0.6, 0.0, 0.7));
        float fine = terrainFbm(p * 6.5);
        float grit = smoothstep(0.62, 0.96, fine);
        color *= 0.93 + fine * 0.16;
        color += grit * vec3(0.035, 0.03, 0.02);
        diffuseColor.rgb = mix(diffuseColor.rgb, color, 0.94);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float detailHeight = terrainFbm(vTerrainWorld.xz * 2.2) * 0.55 + terrainFbm(vTerrainWorld.xz * 7.5) * 0.16;
        vec3 dpdx = dFdx(vTerrainWorld);
        vec3 dpdy = dFdy(vTerrainWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.5 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
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
