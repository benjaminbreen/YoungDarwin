import * as THREE from 'three';

// Per-pixel splat shader for the Northern Shore: black volcanic sand with
// mineral sparkle, rippled ash beach, rust sesuvium mottle, tawny dry-grass
// stipple, fractured lava on the west promontory, and a crisp wet band along
// the exact authored coast curve.
export function createNorthShoreTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = { value: new THREE.Color('#f1d38a') };
    shader.uniforms.rimIntensity = { value: 0.07 };
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
            p = mat2(1.62, -1.04, 1.04, 1.62) * p;
            amp *= 0.52;
          }
          return value;
        }
        float nsCoastZ(float x) {
          return -16.0 + sin(x * 0.072 + 1.3) * 3.6 + sin(x * 0.031 + 0.7) * 2.2;
        }
        vec3 nsBlackSand(vec2 p) {
          float grain = nsFbm(p * 2.4);
          float drift = nsFbm(p * 0.34 + vec2(7.0, -2.0));
          vec3 color = mix(vec3(0.16, 0.15, 0.13), vec3(0.30, 0.28, 0.24), grain * 0.7 + drift * 0.3);
          float glint = step(0.985, nsHash(floor(p * 14.0)));
          color += glint * vec3(0.30, 0.29, 0.24);
          return color;
        }
        vec3 nsAshBeach(vec2 p) {
          float grain = nsFbm(p * 0.62 + vec2(4.0, -9.0));
          float ripple = smoothstep(0.12, 0.0, abs(sin((p.x * 0.6 + p.y * 1.7) * 1.7)) - 0.06);
          vec3 color = mix(vec3(0.48, 0.44, 0.36), vec3(0.66, 0.60, 0.48), grain);
          color = mix(color, vec3(0.74, 0.68, 0.54), ripple * 0.16);
          return color;
        }
        vec3 nsSesuvium(vec2 p) {
          float mottle = nsFbm(p * 1.7 + vec2(-3.0, 8.0));
          float pad = smoothstep(0.42, 0.78, nsFbm(p * 3.4));
          vec3 earth = vec3(0.46, 0.36, 0.27);
          vec3 rust = vec3(0.55, 0.27, 0.19);
          vec3 green = vec3(0.36, 0.40, 0.22);
          vec3 color = mix(earth, rust, smoothstep(0.38, 0.72, mottle));
          color = mix(color, green, pad * (1.0 - mottle) * 0.55);
          return color;
        }
        vec3 nsDryGrass(vec2 p) {
          float tussock = nsFbm(p * 0.9 + vec2(3.0, 11.0));
          float blade = smoothstep(0.66, 0.92, nsFbm(p * 5.2));
          vec3 color = mix(vec3(0.45, 0.41, 0.24), vec3(0.62, 0.55, 0.31), tussock);
          color = mix(color, vec3(0.74, 0.65, 0.38), blade * 0.4);
          color = mix(color, vec3(0.36, 0.38, 0.21), smoothstep(0.7, 0.95, tussock) * 0.3);
          return color;
        }
        vec3 nsLava(vec2 p) {
          float broad = nsFbm(p * 0.22);
          float chips = nsFbm(p * 2.8 + vec2(14.0, -8.0));
          float crack = smoothstep(0.05, 0.0, abs(sin((p.x * 0.7 + p.y * 0.32) * 2.6)) - 0.03);
          vec3 color = mix(vec3(0.075, 0.073, 0.065), vec3(0.21, 0.20, 0.17), broad);
          color = mix(color, vec3(0.33, 0.28, 0.20), smoothstep(0.74, 0.95, chips) * 0.5);
          color = mix(color, vec3(0.03, 0.03, 0.028), crack * 0.7);
          return color;
        }
        vec3 nsSeabed(vec2 p) {
          float dapple = nsFbm(p * 0.9 + vec2(2.0, 5.0));
          return mix(vec3(0.30, 0.55, 0.55), vec3(0.50, 0.72, 0.64), dapple);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vTerrainWorld.xz;
        vec3 n = normalize(vNormal);
        float d = p.y - nsCoastZ(p.x);
        float prom = exp(-pow((p.x + 36.0) / 9.5, 2.0)) * smoothstep(-34.0, -6.0, p.y);
        // Black sand extends inland in wind-blown streaks, not a hard band.
        float blackSand = smoothstep(3.4, 1.2, d);
        blackSand = max(blackSand, smoothstep(0.66, 0.92, nsFbm(p * 0.42 + vec2(11.0, 3.0))) * smoothstep(9.0, 4.0, d) * 0.55);
        float ash = smoothstep(10.5, 3.4, d) * (1.0 - blackSand);
        // Sesuvium: blobby carpets, irregular edges (two crossed fbm gates).
        float sesuviumBand = smoothstep(6.5, 9.0, d) * smoothstep(17.5, 12.5, d);
        float sesuviumMask = sesuviumBand
          * smoothstep(0.44, 0.60, nsFbm(p * 0.35 + vec2(5.0, 0.0)))
          * smoothstep(0.32, 0.55, nsFbm(p * 0.21 + vec2(-9.0, 14.0)));
        float palo = smoothstep(26.0, 34.0, p.y);
        float seabed = smoothstep(0.4, -1.2, d);
        vec3 color = nsDryGrass(p);
        color = mix(color, nsSesuvium(p), sesuviumMask);
        color = mix(color, nsAshBeach(p), ash);
        color = mix(color, nsBlackSand(p), blackSand);
        color = mix(color, mix(color, nsDryGrass(p * 1.4) * 0.92, 0.55), palo * (1.0 - blackSand - ash));
        color = mix(color, nsLava(p), clamp(prom * 1.2, 0.0, 1.0));
        color = mix(color, nsSeabed(p), seabed);
        // High-water wrack line: a dark, broken ribbon of stranded debris.
        float wrackPath = abs(d - 5.4 - sin(p.x * 0.21) * 0.7);
        float wrack = smoothstep(0.55, 0.1, wrackPath) * smoothstep(0.38, 0.7, nsFbm(p * 2.1 + vec2(3.0, -6.0)));
        color = mix(color, vec3(0.22, 0.19, 0.14), wrack * 0.7);
        // Shell-sand flecks bleaching the upper beach.
        float shell = step(0.975, nsHash(floor(p * 7.0))) * smoothstep(2.4, 3.4, d) * smoothstep(9.5, 7.0, d);
        color = mix(color, vec3(0.88, 0.84, 0.72), shell * 0.8);
        // --- Rhythmic swash: the foam edge runs up the sand and slides back ---
        float swashCycle = sin(uSwashTime * 0.8976) * 0.5 + 0.5; // ~7s period
        float swashD = 0.25 + swashCycle * 1.85 + sin(p.x * 0.18 + uSwashTime * 0.45) * 0.3;
        float foamEdge = smoothstep(0.5, 0.05, abs(d - swashD)) * step(0.0, d);
        float foamSpeckle = smoothstep(0.35, 0.75, nsFbm(p * 5.0 + vec2(uSwashTime * 0.6, 0.0)));
        // Everything below the swash line stays wet; dampness lingers above it.
        float wet = smoothstep(swashD + 1.4, swashD * 0.4, d) * (1.0 - seabed * 0.65);
        wet = max(wet, smoothstep(1.2, 0.0, abs(d)) * 0.8);
        color = mix(color, color * vec3(0.46, 0.53, 0.51), clamp(wet, 0.0, 1.0) * 0.7);
        color = mix(color, vec3(0.93, 0.96, 0.94), foamEdge * (0.4 + foamSpeckle * 0.5));
        float fine = nsFbm(p * 6.5);
        color *= 0.94 + fine * 0.13;
        diffuseColor.rgb = mix(diffuseColor.rgb, color, 0.93);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float detailHeight = nsFbm(vTerrainWorld.xz * 2.4) * 0.5 + nsFbm(vTerrainWorld.xz * 8.5) * 0.16;
        vec3 dpdx = dFdx(vTerrainWorld);
        vec3 dpdy = dFdy(vTerrainWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.38 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'north-shore-splat-v1';
  material.needsUpdate = true;
  return material;
}


