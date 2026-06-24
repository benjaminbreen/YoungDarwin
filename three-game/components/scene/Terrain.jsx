'use client';

import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRegionTerrainConfig, terrainBiomeAt, terrainColor, terrainHeight, terrainSurfaceNoise } from '../../world/terrain';
import { getRegionDefinition } from '../../world/regions';
import { getRegionEdgeHints } from '../../../game-core/regionMaps';
import { useThreeGameStore } from '../../store';
import { skyState } from '../../world/celestial';
import { weatherEnv } from '../../world/weatherEnvRuntime';

// Matches the water surface in Water.jsx; used for the damp-shore band.
const WATER_SURFACE_Y = -0.9;
const WET_SAND_TINT = new THREE.Color('#7e9487');
const WET_ROCK_TINT = new THREE.Color('#172d30');
const WET_SCRUB_TINT = new THREE.Color('#536a55');

// ---------------------------------------------------------------------------
// Seabed caustics — the dancing light net on submerged sand. Lives in the
// terrain shader (light belongs on the bottom, where the eye expects it),
// works for every zone's material, and costs a few noise lookups only on
// pixels that are actually underwater. Two counter-scrolling Worley layers
// min()-ed together so the filaments never look static (GPU Gems 2.4 trick).
const CAUSTICS_GLSL = /* glsl */`
  uniform float uCausticsTime;
  uniform float uCausticsStrength;
  uniform float uRainWetness;
  varying vec3 vCausticsW;
  vec2 cstHash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }
  float cstWorley(vec2 p, float t) {
    vec2 cell = floor(p);
    vec2 frac = fract(p);
    float d = 1.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = cstHash2(cell + g);
        o = 0.5 + 0.45 * sin(t + 6.2831 * o);
        vec2 r = g + o - frac;
        d = min(d, dot(r, r));
      }
    }
    return d;
  }
  float cstLight(vec2 p, float t) {
    float a = 1.0 - sqrt(cstWorley(p, t));
    float b = 1.0 - sqrt(cstWorley(p * 1.31 + vec2(4.7, 9.1), -t * 0.83 + 2.0));
    return pow(max(min(a, b), 0.0), 4.0);
  }
`;

const CAUSTICS_APPLY = /* glsl */`
  if (uRainWetness > 0.001) {
    float wetAboveWater = smoothstep(${(WATER_SURFACE_Y + 0.04).toFixed(2)}, ${(WATER_SURFACE_Y + 0.55).toFixed(2)}, vCausticsW.y);
    float wetHeightFade = 1.0 - smoothstep(26.0, 42.0, vCausticsW.y);
    float rainWet = uRainWetness * wetAboveWater * (0.55 + wetHeightFade * 0.45);
    outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.66, 0.74, 0.72), clamp(rainWet * 0.34, 0.0, 0.34));
  }
  float cstDepth = ${WATER_SURFACE_Y.toFixed(2)} - vCausticsW.y;
  if (cstDepth > 0.02 && uCausticsStrength > 0.001) {
    float cstFade = smoothstep(0.02, 0.22, cstDepth) * (1.0 - smoothstep(2.2, 4.5, cstDepth));
    vec2 cstP = vCausticsW.xz * 0.8 + vec2(uCausticsTime * 0.03, -uCausticsTime * 0.022);
    float cst = cstLight(cstP, uCausticsTime * 0.7);
    outgoingLight += vec3(1.0, 0.97, 0.85) * cst * cstFade * uCausticsStrength;
  }
`;

// Layers caustics onto any terrain material, composing with whatever
// onBeforeCompile the material already has.
function injectSeabedCaustics(material) {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = shader => {
    if (previousCompile) previousCompile(shader);
    shader.uniforms.uCausticsTime = { value: 0 };
    shader.uniforms.uCausticsStrength = { value: 0 };
    shader.uniforms.uRainWetness = { value: 0 };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCausticsW;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCausticsW = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CAUSTICS_GLSL}`)
      .replace('#include <opaque_fragment>', `${CAUSTICS_APPLY}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () =>
    `${previousKey ? previousKey.call(material) : 'terrain-default'}|caustics-rain-wetness-v1`;
  material.needsUpdate = true;
  return material;
}

export function Terrain() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const cheapMaterials = useThreeGameStore(state => state.cheapMaterials);
  const regionDefinition = getRegionDefinition(currentZoneId);
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
      // Damp shore band: keep the old cheap height-based mask, but treat beach
      // sand and basalt differently so the boundary reads as wet ground rather
      // than a generic dark outline.
      const submergedWet = y <= WATER_SURFACE_Y
        ? 1 - THREE.MathUtils.smoothstep(y, WATER_SURFACE_Y - 0.55, WATER_SURFACE_Y + 0.02)
        : 0;
      const exposedDamp = y > WATER_SURFACE_Y
        ? 1 - THREE.MathUtils.smoothstep(y, WATER_SURFACE_Y + 0.03, WATER_SURFACE_Y + 0.62)
        : 0;
      const wet = THREE.MathUtils.clamp(Math.max(submergedWet * 0.62, exposedDamp), 0, 1);
      if (wet > 0 && biome !== 'water') {
        const rockWet = biome === 'wet-basalt' || biome === 'black-lava';
        const beachWet = biome === 'green-beach' || biome === 'olivine-trail' || biome === 'trail';
        c.multiplyScalar(1 - wet * (rockWet ? 0.34 : beachWet ? 0.22 : 0.16));
        if (rockWet) c.lerp(WET_ROCK_TINT, wet * 0.2);
        else if (beachWet) c.lerp(WET_SAND_TINT, wet * 0.18);
        else c.lerp(WET_SCRUB_TINT, wet * 0.08);
      }
      colors.push(c.r, c.g, c.b);
      const wetRoughness = biome === 'wet-basalt' || biome === 'black-lava'
        ? THREE.MathUtils.lerp(0.9, 0.5, wet)
        : THREE.MathUtils.lerp(0.96, 0.72, wet);
      roughness.push(wet > 0 ? wetRoughness : 0.96);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('roughnessMix', new THREE.Float32BufferAttribute(roughness, 1));
    geo.computeVertexNormals();
    return geo;
  }, [currentZoneId]);

  const material = useMemo(() => {
    // The ground covers most of the screen, so its per-fragment shading cost is
    // significant. It's matte non-metal, so MeshPhong (no specular) looks the
    // same as MeshStandard here without the PBR/IBL math. Caustics inject into
    // core chunks that exist in Phong too. Region-custom terrain materials keep
    // their own shader untouched.
    const baseMaterial = regionDefinition?.createTerrainMaterial
      ? regionDefinition.createTerrainMaterial()
      : cheapMaterials
        ? new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 0, specular: new THREE.Color(0x000000) })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    return injectSeabedCaustics(baseMaterial);
  }, [regionDefinition, cheapMaterials]);

  // Drives the rhythmic swash line and the underwater caustics.
  useFrame(({ clock }) => {
    const shader = material.userData?.shader;
    if (!shader?.uniforms) return;
    if (shader.uniforms.uSwashTime) shader.uniforms.uSwashTime.value = clock.elapsedTime;
    if (shader.uniforms.uCausticsTime) {
      const store = useThreeGameStore.getState();
      const time = ((store.timeOfDay % 24) + 24) % 24;
      const rainWetness = weatherEnv.rainIntensity;
      shader.uniforms.uCausticsTime.value = clock.elapsedTime;
      shader.uniforms.uCausticsStrength.value = skyState(time, store.day || 1).daylight * 0.5 * (1 - rainWetness * 0.85);
      if (shader.uniforms.uRainWetness) shader.uniforms.uRainWetness.value = rainWetness;
    }
  });

  return (
    <group userData={{
      renderSource: `terrain:${currentZoneId}`,
      renderLabel: `${currentZoneId} terrain`,
      renderKind: 'terrain',
      renderPath: null,
    }}>
      <mesh geometry={geometry} material={material} receiveShadow userData={{
        reflect: true,
        renderSource: `terrain:${currentZoneId}:heightfield`,
        renderLabel: `${currentZoneId} terrain heightfield`,
        renderKind: 'terrain',
        renderPath: null,
      }} />
      <ContinuationTerrainSkirts regionId={currentZoneId} material={material} />
    </group>
  );
}

function buildSkirtGeometry(regionId) {
  const config = getRegionTerrainConfig(regionId);
  const openHints = getRegionEdgeHints(regionId).filter(hint => hint.kind === 'open');
  const stripDepth = 12;
  const steps = 26;
  const rows = 4;
  const positions = [];
  const colors = [];
  const indices = [];
  const addVertex = (x, z, fade) => {
    const sampleX = THREE.MathUtils.clamp(x, -config.width / 2, config.width / 2);
    const sampleZ = THREE.MathUtils.clamp(z, -config.depth / 2, config.depth / 2);
    const edgeY = terrainHeight(sampleX, sampleZ, regionId);
    const y = edgeY - fade * fade * 1.15;
    const color = terrainColor(sampleX, sampleZ, edgeY, regionId).multiplyScalar(1 - fade * 0.16);
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
      for (let j = 0; j <= rows; j += 1) {
        const fade = j / rows;
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
      for (let j = 0; j < rows; j += 1) {
        const stride = rows + 1;
        const a = startIndex + i * stride + j;
        indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
  };
  const addCorner = edge => {
    const startIndex = positions.length / 3;
    const east = edge.includes('east');
    const south = edge.includes('south');
    const baseX = east ? config.width / 2 : -config.width / 2;
    const baseZ = south ? config.depth / 2 : -config.depth / 2;
    for (let iz = 0; iz <= rows; iz += 1) {
      for (let ix = 0; ix <= rows; ix += 1) {
        const fx = ix / rows;
        const fz = iz / rows;
        const x = baseX + (east ? 1 : -1) * stripDepth * fx;
        const z = baseZ + (south ? 1 : -1) * stripDepth * fz;
        addVertex(x, z, Math.max(fx, fz));
      }
    }
    const stride = rows + 1;
    for (let iz = 0; iz < rows; iz += 1) {
      for (let ix = 0; ix < rows; ix += 1) {
        const a = startIndex + iz * stride + ix;
        indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
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
  // Short edge fade only. Neighboring-map topography lives in BorderVistas as
  // opaque terrain aprons; do not use these skirts as distant scenery.
  return <mesh geometry={geometry} material={material} receiveShadow={false} userData={{
    renderSource: `terrain:${regionId}:skirts`,
    renderLabel: `${regionId} terrain skirts`,
    renderKind: 'terrain-skirt',
    renderPath: null,
  }} />;
}
