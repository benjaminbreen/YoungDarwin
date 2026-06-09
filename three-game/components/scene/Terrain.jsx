'use client';

import React, { useMemo } from 'react';
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

export function Terrain() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const authoredPostOffice = currentZoneId === 'POST_OFFICE_BAY' || currentZoneId === 'post-office-bay-anchorage';
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

  const material = useMemo(() => (
    authoredPostOffice
      ? createTerrainMaterial()
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
  ), [authoredPostOffice]);

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
