'use client';

import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRegionTerrainConfig, terrainBiomeAt, terrainColor, terrainHeight, terrainSurfaceNoise } from '../../world/terrain';
import { getRegionEdgeHints } from '../../../game-core/regionMaps';
import { useThreeGameStore } from '../../store';

// Matches the water surface in Water.jsx; used for the damp-shore band.
const WATER_SURFACE_Y = -0.9;

function createTerrainMaterial() {
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
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vTerrainWorld.xz;
        vec3 n = normalize(vNormal);
        float height = vTerrainWorld.y;
        float slope = smoothstep(0.34, 0.86, 1.0 - abs(n.y));
        float cove = max(0.0, 1.0 - length((p - vec2(3.0, -29.0)) / vec2(18.0, 10.0)));
        float wet = max(smoothstep(0.10, 0.62, cove), smoothstep(-18.0, -27.0, p.y));
        float beach = smoothstep(0.12, 0.66, cove) * (1.0 - slope * 0.72);
        beach = max(beach, smoothstep(-13.0, -27.0, p.y) * smoothstep(-0.2, 2.2, height) * (1.0 - slope * 0.55));
        float ridge = max(smoothstep(15.0, 30.0, p.y), smoothstep(5.0, 7.6, height));
        float lava = max(smoothstep(0.22, 0.72, terrainFbm(p * 0.12 + vec2(8.0, -3.0))), smoothstep(-7.0, -18.0, p.x));
        float scrub = smoothstep(5.0, 20.0, p.x) * smoothstep(-3.0, 13.0, p.y) * (1.0 - slope * 0.85);
        vec3 color = ashMaterial(p);
        color = mix(color, lavaMaterial(p), clamp(lava * 0.88 + wet * 0.45, 0.0, 1.0));
        color = mix(color, tuffMaterial(p), clamp(ridge * 0.78 + slope * 0.35, 0.0, 1.0));
        color = mix(color, scrubMaterial(p), clamp(scrub * 0.62, 0.0, 1.0));
        color = mix(color, beachMaterial(p), clamp(beach * 0.58, 0.0, 1.0));
        color = mix(color, vec3(0.10, 0.18, 0.16), wet * 0.18);
        float fine = terrainFbm(p * 6.5);
        float grit = smoothstep(0.62, 0.96, fine);
        color *= 0.94 + fine * 0.14;
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
        normal = normalize(normal - 0.42 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
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

// Per-pixel splat shader for the Northern Shore: black volcanic sand with
// mineral sparkle, rippled ash beach, rust sesuvium mottle, tawny dry-grass
// stipple, fractured lava on the west promontory, and a crisp wet band along
// the exact authored coast curve (mirrored from terrain.js northShoreCoastZ).
function createNorthShoreTerrainMaterial() {
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

// Per-pixel splat shader for the Northwest Reef: bright coral-sand beach with
// ripple and shell flecks, a swash line on the authored coast curve (mirrored
// from terrain.js nwReefCoastZ), dappled turquoise sand shelf seen through the
// water, mottled coral heads ringing the islet, and dark basalt on the
// outcrops and islet crown.
function createNorthwestReefTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
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
          // Albedo capped around 0.74 — real coral sand reflects ~0.4-0.6, and
          // anything brighter blows out to paper white under the noon sun.
          float grain = nwrFbm(p * 0.7 + vec2(4.0, -9.0));
          float ripple = smoothstep(0.12, 0.0, abs(sin((p.x * 0.5 + p.y * 1.5) * 1.6)) - 0.05);
          vec3 color = mix(vec3(0.62, 0.57, 0.44), vec3(0.74, 0.69, 0.56), grain);
          color = mix(color, vec3(0.81, 0.77, 0.65), ripple * 0.14);
          return color;
        }
        vec3 nwrSeabed(vec2 p, float h) {
          // Sun dapple over pale sand; deeper water shifts toward turquoise.
          float dapple = nwrFbm(p * 0.8 + vec2(2.0, 5.0)) * 0.6 + nwrFbm(p * 2.6 + vec2(-7.0, 1.0)) * 0.4;
          vec3 shallow = mix(vec3(0.70, 0.83, 0.74), vec3(0.84, 0.92, 0.84), dapple);
          vec3 deep = mix(vec3(0.22, 0.55, 0.56), vec3(0.34, 0.68, 0.64), dapple);
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
        seabed = mix(seabed, nwrCoral(p), clamp(coralZone, 0.0, 1.0) * sub);
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
        color = mix(color, color * vec3(0.62, 0.66, 0.64), clamp(wet, 0.0, 1.0) * 0.6);
        color = mix(color, vec3(0.87, 0.9, 0.88), foamEdge * (0.32 + foamSpeckle * 0.42));
        float fine = nwrFbm(p * 6.5);
        color *= 0.95 + fine * 0.1;
        diffuseColor.rgb = mix(diffuseColor.rgb, color, 0.93);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float detailHeight = nwrFbm(vTerrainWorld.xz * 2.2) * 0.4 + nwrFbm(vTerrainWorld.xz * 8.0) * 0.14;
        vec3 dpdx = dFdx(vTerrainWorld);
        vec3 dpdy = dFdy(vTerrainWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.3 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'nw-reef-splat-v3';
  material.needsUpdate = true;
  return material;
}

export function Terrain() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const authoredPostOffice = currentZoneId === 'POST_OFFICE_BAY' || currentZoneId === 'post-office-bay-anchorage';
  const authoredNorthShore = currentZoneId === 'N_SHORE';
  const authoredNwReef = currentZoneId === 'NW_REEF';
  const geometry = useMemo(() => {
    const config = getRegionTerrainConfig(currentZoneId);
    const geo = new THREE.PlaneGeometry(config.width, config.depth, config.segments, config.segments);
    geo.rotateX(-Math.PI / 2);
    const colors = [];
    const roughness = [];
    const position = geo.attributes.position;

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = terrainHeight(x, z, currentZoneId);
      position.setY(i, y);

      const c = terrainColor(x, z, y, currentZoneId);
      const biome = terrainBiomeAt(x, z, y, currentZoneId);
      const grain = terrainSurfaceNoise(x * 2.7, z * 2.7);
      if (biome === 'black-lava' || biome === 'wet-basalt') c.offsetHSL(0, -0.03, grain * 0.045);
      if (biome === 'tuff-ridge' || biome === 'ash-slope') c.offsetHSL(0.015, -0.02, grain * 0.035);
      // Damp shore band: darken (and smooth) the ground toward the waterline so
      // the coast reads wet where the tide washes, like the reference beach.
      const wet = 1 - THREE.MathUtils.smoothstep(y, WATER_SURFACE_Y - 0.3, WATER_SURFACE_Y + 0.8);
      if (wet > 0 && biome !== 'water') c.multiplyScalar(1 - wet * 0.42);
      colors.push(c.r, c.g, c.b);
      roughness.push(biome === 'wet-basalt' || wet > 0.5 ? 0.6 : 0.96);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('roughnessMix', new THREE.Float32BufferAttribute(roughness, 1));
    geo.computeVertexNormals();
    return geo;
  }, [currentZoneId]);

  const material = useMemo(() => {
    if (authoredPostOffice) return createTerrainMaterial();
    if (authoredNorthShore) return createNorthShoreTerrainMaterial();
    if (authoredNwReef) return createNorthwestReefTerrainMaterial();
    return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  }, [authoredPostOffice, authoredNorthShore, authoredNwReef]);

  // Drives the rhythmic swash line in the shore shader.
  useFrame(({ clock }) => {
    const shader = material.userData?.shader;
    if (shader?.uniforms?.uSwashTime) shader.uniforms.uSwashTime.value = clock.elapsedTime;
  });

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow />
      <ContinuationTerrainSkirts regionId={currentZoneId} material={material} />
    </group>
  );
}

function buildSkirtGeometry(regionId) {
  const config = getRegionTerrainConfig(regionId);
  const openHints = getRegionEdgeHints(regionId).filter(hint => hint.kind === 'open');
  const stripDepth = 22;
  const steps = 18;
  const positions = [];
  const colors = [];
  const indices = [];
  const addVertex = (x, z, fade) => {
    const sampleX = THREE.MathUtils.clamp(x, -config.width / 2, config.width / 2);
    const sampleZ = THREE.MathUtils.clamp(z, -config.depth / 2, config.depth / 2);
    const y = terrainHeight(sampleX, sampleZ, regionId) - fade * 2.4;
    const color = terrainColor(sampleX, sampleZ, y, regionId).multiplyScalar(1 - fade * 0.48);
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  };
  const addStrip = edge => {
    const startIndex = positions.length / 3;
    const alongX = edge === 'north' || edge === 'south';
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const xBase = -config.width / 2 + t * config.width;
      const zBase = -config.depth / 2 + t * config.depth;
      for (let j = 0; j <= 1; j += 1) {
        const fade = j;
        if (alongX) {
          const z = edge === 'north' ? -config.depth / 2 - stripDepth * fade : config.depth / 2 + stripDepth * fade;
          addVertex(xBase, z, fade);
        } else {
          const x = edge === 'west' ? -config.width / 2 - stripDepth * fade : config.width / 2 + stripDepth * fade;
          addVertex(x, zBase, fade);
        }
      }
    }
    for (let i = 0; i < steps; i += 1) {
      const a = startIndex + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  const addCorner = edge => {
    const startIndex = positions.length / 3;
    const east = edge.includes('east');
    const south = edge.includes('south');
    const baseX = east ? config.width / 2 : -config.width / 2;
    const baseZ = south ? config.depth / 2 : -config.depth / 2;
    for (let iz = 0; iz <= 1; iz += 1) {
      for (let ix = 0; ix <= 1; ix += 1) {
        const x = baseX + (east ? 1 : -1) * stripDepth * ix;
        const z = baseZ + (south ? 1 : -1) * stripDepth * iz;
        addVertex(x, z, Math.max(ix, iz));
      }
    }
    indices.push(startIndex, startIndex + 1, startIndex + 2, startIndex + 1, startIndex + 3, startIndex + 2);
  };
  openHints
    .filter(hint => ['north', 'south', 'east', 'west'].includes(hint.edge))
    .forEach(hint => addStrip(hint.edge));
  openHints
    .filter(hint => ['northeast', 'northwest', 'southeast', 'southwest'].includes(hint.edge))
    .forEach(hint => addCorner(hint.edge));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function ContinuationTerrainSkirts({ regionId, material }) {
  const geometry = useMemo(() => buildSkirtGeometry(regionId), [regionId]);
  if (!geometry.attributes.position?.count) return null;
  return <mesh geometry={geometry} material={material} receiveShadow={false} />;
}
