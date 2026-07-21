import * as THREE from 'three';
import {
  getRegionTerrainConfig,
  movementTerrainHeight,
  terrainRenderSample,
  terrainSurfaceNoise,
} from './terrain';

// Kept local so the worker does not import the main-thread geometry/cache
// module. These values deliberately mirror terrainGeometry.js.
const TERRAIN_WATER_SURFACE_Y = -0.9;
const WET_SAND_TINT = new THREE.Color('#7e9487');
const WET_ROCK_TINT = new THREE.Color('#172d30');
const WET_SCRUB_TINT = new THREE.Color('#536a55');

function resolveTerrainSegments(authoredSegments, segmentCap = null) {
  const authored = Math.max(32, Math.floor(Number(authoredSegments) || 32));
  if (segmentCap === null || segmentCap === undefined || segmentCap === false) return authored;
  const cap = Math.max(32, Math.floor(Number(segmentCap) || authored));
  return Math.min(authored, cap);
}

function resolveColliderSegments(regionId, authoredSegments) {
  // Keep in sync with terrainResource.js's synchronous recovery path.
  const cap = regionId === 'N_SHORE' || regionId === 'PENAL_COLONY' ? 96 : 128;
  return Math.min(cap, Math.max(96, Math.floor(authoredSegments || 96)));
}

function buildTerrainPayload(regionId, segmentCap) {
  const config = getRegionTerrainConfig(regionId);
  const segments = resolveTerrainSegments(config.segments, segmentCap);
  const side = segments + 1;
  const count = side * side;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const roughness = new Float32Array(count);
  const indexCount = segments * segments * 6;
  const indices = count > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let minimumHeight = Infinity;
  let maximumHeight = -Infinity;
  let index = 0;
  for (let zIndex = 0; zIndex < side; zIndex += 1) {
    const z = -config.depth * 0.5 + (zIndex / segments) * config.depth;
    for (let xIndex = 0; xIndex < side; xIndex += 1) {
      const x = -config.width * 0.5 + (xIndex / segments) * config.width;
      const sample = terrainRenderSample(x, z, regionId);
      const y = sample.height;
      const color = sample.color;
      const biome = sample.biome;
      const grain = terrainSurfaceNoise(x * 2.7, z * 2.7);
      if (biome === 'black-lava' || biome === 'wet-basalt') color.offsetHSL(0, -0.03, grain * 0.045);
      if (biome === 'tuff-ridge' || biome === 'ash-slope') color.offsetHSL(0.015, -0.02, grain * 0.035);
      const submergedWet = y <= TERRAIN_WATER_SURFACE_Y
        ? 1 - THREE.MathUtils.smoothstep(
          y,
          TERRAIN_WATER_SURFACE_Y - 0.55,
          TERRAIN_WATER_SURFACE_Y + 0.02,
        )
        : 0;
      const exposedDamp = y > TERRAIN_WATER_SURFACE_Y
        ? 1 - THREE.MathUtils.smoothstep(
          y,
          TERRAIN_WATER_SURFACE_Y + 0.03,
          TERRAIN_WATER_SURFACE_Y + 0.62,
        )
        : 0;
      const wet = THREE.MathUtils.clamp(Math.max(submergedWet * 0.62, exposedDamp), 0, 1);
      if (wet > 0 && biome !== 'water') {
        const rockWet = biome === 'wet-basalt' || biome === 'black-lava';
        const beachWet = biome === 'green-beach' || biome === 'olivine-trail' || biome === 'trail';
        color.multiplyScalar(1 - wet * (rockWet ? 0.34 : beachWet ? 0.22 : 0.16));
        if (rockWet) color.lerp(WET_ROCK_TINT, wet * 0.2);
        else if (beachWet) color.lerp(WET_SAND_TINT, wet * 0.18);
        else color.lerp(WET_SCRUB_TINT, wet * 0.08);
      }
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      uvs[index * 2] = xIndex / segments;
      uvs[index * 2 + 1] = 1 - zIndex / segments;
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
      minimumHeight = Math.min(minimumHeight, y);
      maximumHeight = Math.max(maximumHeight, y);
      const wetRoughness = biome === 'wet-basalt' || biome === 'black-lava'
        ? THREE.MathUtils.lerp(0.9, 0.5, wet)
        : THREE.MathUtils.lerp(0.96, 0.72, wet);
      roughness[index] = wet > 0 ? wetRoughness : 0.96;
      index += 1;
    }
  }

  // Match PlaneGeometry's winding after its -90deg X rotation, but do the
  // allocation and normal calculation in the worker. The main thread can then
  // attach transferred typed arrays without looping over every terrain vertex.
  let indexOffset = 0;
  for (let zIndex = 0; zIndex < segments; zIndex += 1) {
    for (let xIndex = 0; xIndex < segments; xIndex += 1) {
      const a = xIndex + side * zIndex;
      const b = xIndex + side * (zIndex + 1);
      const c = xIndex + 1 + side * (zIndex + 1);
      const d = xIndex + 1 + side * zIndex;
      indices[indexOffset++] = a;
      indices[indexOffset++] = b;
      indices[indexOffset++] = d;
      indices[indexOffset++] = b;
      indices[indexOffset++] = c;
      indices[indexOffset++] = d;
    }
  }
  const normalGeometry = new THREE.BufferGeometry();
  normalGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  normalGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  normalGeometry.computeVertexNormals();
  const normals = normalGeometry.getAttribute('normal').array;
  normalGeometry.dispose();

  const colliderSegments = resolveColliderSegments(regionId, config.segments);
  const colliderSide = colliderSegments + 1;
  const colliderHeights = new Float32Array(colliderSide * colliderSide);
  index = 0;
  // Rapier heightfields are column-major: x is the outer loop.
  for (let xIndex = 0; xIndex < colliderSide; xIndex += 1) {
    const x = -config.width * 0.5 + (xIndex / colliderSegments) * config.width;
    for (let zIndex = 0; zIndex < colliderSide; zIndex += 1) {
      const z = -config.depth * 0.5 + (zIndex / colliderSegments) * config.depth;
      colliderHeights[index] = movementTerrainHeight(x, z, regionId);
      index += 1;
    }
  }
  return {
    regionId,
    width: config.width,
    depth: config.depth,
    segments,
    positions,
    normals,
    uvs,
    indices,
    colors,
    roughness,
    minimumHeight,
    maximumHeight,
    colliderSegments,
    colliderHeights,
  };
}

self.onmessage = event => {
  const { requestId, regionId, segmentCap } = event.data || {};
  try {
    const startedAt = performance.now();
    const payload = buildTerrainPayload(regionId, segmentCap);
    payload.preparationDurationMs = performance.now() - startedAt;
    self.postMessage({ requestId, payload }, [
      payload.positions.buffer,
      payload.normals.buffer,
      payload.uvs.buffer,
      payload.indices.buffer,
      payload.colors.buffer,
      payload.roughness.buffer,
      payload.colliderHeights.buffer,
    ]);
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
