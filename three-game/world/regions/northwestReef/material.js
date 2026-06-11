import * as THREE from 'three';

// Per-pixel splat shader for the Northwest Reef: bright coral-sand beach with
// ripple and shell flecks, a swash line on the authored coast curve, dappled
// turquoise sand shelf seen through the water, mottled coral heads ringing the
// islet, and dark basalt on the outcrops and islet crown.
export function createNorthwestReefTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = { value: new THREE.Color('#f6e3ae') };
    shader.uniforms.rimIntensity = { value: 0.04 };
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
        vec3 nwrSand(vec2 p) {
          // Kept close to Northern Shore's tropical shallows palette: bright
          // coral sand, but not paper-white once ACES and water glints hit it.
          float grain = nwrFbm(p * 0.7 + vec2(4.0, -9.0));
          float rippleWave = sin((p.x * 0.35 + p.y * 1.25) * 1.7 + nwrFbm(p * 0.5) * 2.4);
          float ripple = smoothstep(0.18, 0.0, abs(rippleWave) - 0.05);
          vec3 color = mix(vec3(0.46, 0.44, 0.35), vec3(0.62, 0.58, 0.46), grain);
          color = mix(color, vec3(0.69, 0.65, 0.52), ripple * 0.14);
          color = mix(color, vec3(0.40, 0.38, 0.31), smoothstep(0.6, 0.95, nwrFbm(p * 3.1 + vec2(-2.0, 6.0))) * 0.2);
          return color;
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
        float di = nwrIslet(p);
        vec3 color = nwrSand(p);
        // Shell and coral-fragment flecks scattered on the dry beach.
        // Soft dune-scale shading breaks up the flat beach plane.
        float dune = nwrFbm(p * 0.07 + vec2(13.0, 2.0));
        color *= 0.93 + dune * 0.1;
        // Sparse shell flecks: jittered cells (no grid rows), gentle highlight.
        vec2 shellCell = floor(p * 5.0 + vec2(nwrHash(floor(p.yx * 5.0)) * 0.9));
        float shell = step(0.985, nwrHash(shellCell)) * smoothstep(-0.3, 0.2, h);
        color = mix(color, vec3(0.84, 0.81, 0.73), shell * 0.55);
        // High-water wrack ribbon.
        float wrackPath = abs(d - 4.8 - sin(p.x * 0.19) * 0.7);
        float wrack = smoothstep(0.5, 0.1, wrackPath) * smoothstep(0.4, 0.72, nwrFbm(p * 2.1 + vec2(3.0, -6.0))) * step(0.0, d);
        color = mix(color, vec3(0.42, 0.37, 0.28), wrack * 0.5);
        // Submerged shelf: dappled sand, coral heads in the ring patches.
        float sub = smoothstep(-0.32, -0.62, h);
        float band = smoothstep(1.1, 1.4, di) * (1.0 - smoothstep(1.85, 2.3, di));
        float coralPatch = smoothstep(0.38, 0.62, nwrFbm(p * 0.14 + vec2(21.0, -7.0)));
        float coralZone = max(band * coralPatch * 1.4, nwrGarden(p) * 1.1);
        vec3 seabed = nwrSeabed(p, h);
        // Coral should read through the water, but not as saturated dry
        // geometry. Blend it down into the submerged sand colour.
        seabed = mix(seabed, nwrCoral(p), clamp(coralZone, 0.0, 1.0) * sub * 0.58);
        color = mix(color, seabed, sub);
        // Basalt outcrops and the islet crown.
        float basalt = max(smoothstep(0.3, 0.55, nwrOutcrop(p)), (1.0 - smoothstep(0.38, 0.58, di)) * smoothstep(0.42, 0.7, h));
        color = mix(color, nwrBasalt(p), clamp(basalt, 0.0, 1.0));
        // --- Rhythmic swash on the beach face ---
        float swashCycle = sin(uSwashTime * 0.8976) * 0.5 + 0.5;
        float swashD = 0.25 + swashCycle * 1.7 + sin(p.x * 0.17 + uSwashTime * 0.45) * 0.3;
        float foamEdge = smoothstep(0.5, 0.05, abs(d - swashD)) * step(0.0, d) * (1.0 - basalt);
        float foamSpeckle = smoothstep(0.35, 0.75, nwrFbm(p * 5.0 + vec2(uSwashTime * 0.6, 0.0)));
        // Wet sand below the swash line and around every waterline (islet too).
        float wet = max(
          smoothstep(swashD + 1.6, swashD * 0.4, d) * step(0.0, d),
          smoothstep(-0.05, -0.4, h) * (1.0 - sub)
        );
        color = mix(color, color * vec3(0.50, 0.56, 0.54), clamp(wet, 0.0, 1.0) * 0.7);
        color = mix(color, vec3(0.78, 0.86, 0.82), foamEdge * (0.20 + foamSpeckle * 0.28));
        float fine = nwrFbm(p * 6.5);
        color *= 0.91 + fine * 0.1;
        diffuseColor.rgb = mix(diffuseColor.rgb, color, 0.9);`,
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
        normal = normalize(normal - 0.34 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'nw-reef-splat-v5';
  material.needsUpdate = true;
  return material;
}

