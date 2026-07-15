import * as THREE from 'three';
import {
  getRegionTerrainConfig,
  terrainRenderSample,
  terrainSurfaceNoise,
} from './terrain';

export const TERRAIN_WATER_SURFACE_Y = -0.9;
const WET_SAND_TINT = new THREE.Color('#7e9487');
const WET_ROCK_TINT = new THREE.Color('#172d30');
const WET_SCRUB_TINT = new THREE.Color('#536a55');
const TERRAIN_GEOMETRY_CACHE_LIMIT = 3;
const terrainGeometryCache = new Map();
let terrainGeometryUseCounter = 0;

export function resolveTerrainSegments(authoredSegments, segmentCap = null) {
  const authored = Math.max(32, Math.floor(Number(authoredSegments) || 32));
  if (segmentCap === null || segmentCap === undefined || segmentCap === false) return authored;
  const cap = Math.max(32, Math.floor(Number(segmentCap) || authored));
  return Math.min(authored, cap);
}

export function terrainGeometryStats(segments) {
  const safeSegments = Math.max(1, Math.floor(Number(segments) || 1));
  return {
    segments: safeSegments,
    vertices: (safeSegments + 1) ** 2,
    triangles: safeSegments * safeSegments * 2,
  };
}

function buildTerrainGeometry(regionId, segmentCap) {
  const config = getRegionTerrainConfig(regionId);
  const segments = resolveTerrainSegments(config.segments, segmentCap);
  const geometry = new THREE.PlaneGeometry(config.width, config.depth, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const colors = [];
  const roughness = [];
  const position = geometry.attributes.position;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const sample = terrainRenderSample(x, z, regionId);
    const y = sample.height;
    position.setY(index, y);

    const color = sample.color;
    const biome = sample.biome;
    const grain = terrainSurfaceNoise(x * 2.7, z * 2.7);
    if (biome === 'black-lava' || biome === 'wet-basalt') color.offsetHSL(0, -0.03, grain * 0.045);
    if (biome === 'tuff-ridge' || biome === 'ash-slope') color.offsetHSL(0.015, -0.02, grain * 0.035);
    const submergedWet = y <= TERRAIN_WATER_SURFACE_Y
      ? 1 - THREE.MathUtils.smoothstep(y, TERRAIN_WATER_SURFACE_Y - 0.55, TERRAIN_WATER_SURFACE_Y + 0.02)
      : 0;
    const exposedDamp = y > TERRAIN_WATER_SURFACE_Y
      ? 1 - THREE.MathUtils.smoothstep(y, TERRAIN_WATER_SURFACE_Y + 0.03, TERRAIN_WATER_SURFACE_Y + 0.62)
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
    colors.push(color.r, color.g, color.b);
    const wetRoughness = biome === 'wet-basalt' || biome === 'black-lava'
      ? THREE.MathUtils.lerp(0.9, 0.5, wet)
      : THREE.MathUtils.lerp(0.96, 0.72, wet);
    roughness.push(wet > 0 ? wetRoughness : 0.96);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('roughnessMix', new THREE.Float32BufferAttribute(roughness, 1));
  geometry.computeVertexNormals();
  geometry.userData.terrainSegments = segments;
  geometry.userData.terrainRegionId = regionId;
  return { geometry, segments };
}

function pruneTerrainGeometryCache(protectedKey = null) {
  while (terrainGeometryCache.size > TERRAIN_GEOMETRY_CACHE_LIMIT) {
    let oldest = null;
    for (const entry of terrainGeometryCache.values()) {
      if (entry.key === protectedKey || entry.references > 0) continue;
      if (!oldest || entry.lastUsed < oldest.lastUsed) oldest = entry;
    }
    if (!oldest) return;
    oldest.geometry.dispose();
    terrainGeometryCache.delete(oldest.key);
  }
}

export function getCachedTerrainGeometry(regionId, segmentCap = null) {
  const config = getRegionTerrainConfig(regionId);
  const segments = resolveTerrainSegments(config.segments, segmentCap);
  const key = `${regionId}:${segments}`;
  let entry = terrainGeometryCache.get(key);
  if (!entry) {
    entry = {
      key,
      ...buildTerrainGeometry(regionId, segments),
      references: 0,
      lastUsed: 0,
    };
    terrainGeometryCache.set(key, entry);
  }
  entry.lastUsed = ++terrainGeometryUseCounter;
  pruneTerrainGeometryCache(key);
  return entry;
}

export function retainTerrainGeometry(key) {
  const entry = terrainGeometryCache.get(key);
  if (entry) entry.references += 1;
}

export function releaseTerrainGeometry(key) {
  const entry = terrainGeometryCache.get(key);
  if (entry) entry.references = Math.max(0, entry.references - 1);
  pruneTerrainGeometryCache();
}
