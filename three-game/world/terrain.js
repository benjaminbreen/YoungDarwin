import * as THREE from 'three';
import { getZone } from './floreanaZones';
import { getRegionMap } from '../../game-core/regionMaps';
import { getRegionDefinition } from './regions';
import {
  WADE_DEPTH,
  WATER_LEVEL,
  elevationNoise,
  surfaceNoise,
  terrainSurfaceNoise,
} from './terrainShared';
import { coveWaterMask, islandMask } from './regions/postOfficeBay/terrain';

export { WADE_DEPTH, WATER_LEVEL, terrainFineDetail, terrainSurfaceNoise } from './terrainShared';
export {
  POST_OFFICE_BAY_TRAIL,
  coveWaterMask,
  islandMask,
  postOfficeTrailInfluence,
} from './regions/postOfficeBay/terrain';
export { northShoreCoastZ, northShorePromontory } from './regions/northShore/terrain';
export {
  nwReefCoastZ,
  nwReefCoralMask,
  nwReefGardenMask,
  nwReefIsletField,
  nwReefOutcrop,
} from './regions/northwestReef/terrain';

const activeZone = getZone();

export const TERRAIN_SIZE = activeZone.terrainSize || 118;
export const TERRAIN_SEGMENTS = activeZone.terrainSegments || 188;
export const TERRAIN_BOUNDS = activeZone.bounds || 43;

export function getRegionTerrainConfig(regionId) {
  const region = getRegionMap(regionId || 'POST_OFFICE_BAY');
  return {
    width: region.terrain.width || TERRAIN_SIZE,
    depth: region.terrain.depth || TERRAIN_SIZE,
    segments: region.terrain.segments || TERRAIN_SEGMENTS,
    bounds: Math.min(region.terrain.width || TERRAIN_SIZE, region.terrain.depth || TERRAIN_SIZE) * 0.5,
    preset: region.terrain.preset,
    type: region.type,
  };
}


function placeholderProfile(regionId) {
  const region = getRegionMap(regionId);
  const type = String(region.type || '').toLowerCase();
  if (type === 'reef' || type === 'ocean') return { base: -0.55, relief: 0.22, biome: 'water-edge', color: '#4f9caf' };
  if (type === 'forest') return { base: 1.2, relief: 1.25, biome: 'humid-forest', color: '#4f6f3b' };
  if (type === 'wetland') return { base: 0.08, relief: 0.38, biome: 'wetland', color: '#637b48' };
  if (type === 'highland') return { base: 2.6, relief: 2.15, biome: 'highland', color: '#82785b' };
  if (type === 'cliff' || type === 'promontory') return { base: 2.0, relief: 2.4, biome: 'cliff', color: '#70675a' };
  if (type === 'lavafield' || type === 'coastallava') return { base: 0.4, relief: 0.9, biome: 'black-lava', color: '#2c2b25' };
  if (type === 'settlement' || type === 'camp' || type === 'hut') return { base: 0.45, relief: 0.45, biome: 'settlement', color: '#8a744e' };
  if (type === 'beagle' || type === 'interior' || type === 'office' || type === 'governorslibrary' || type === 'governorshouse') return { base: 0, relief: 0.02, biome: 'interior', color: '#7b5f3a' };
  if (type === 'beach' || type === 'bay') return { base: 0.16, relief: 0.35, biome: 'beach', color: '#9b8459' };
  return { base: 0.65, relief: 0.75, biome: 'dry-scrub', color: '#6f7545' };
}

function placeholderTerrainHeight(x, z, regionId) {
  const config = getRegionTerrainConfig(regionId);
  const profile = placeholderProfile(regionId);
  const nx = x / Math.max(1, config.width);
  const nz = z / Math.max(1, config.depth);
  const edge = Math.max(Math.abs(x) / (config.width * 0.5), Math.abs(z) / (config.depth * 0.5));
  const ridge = Math.max(0, edge - 0.62) * profile.relief * 0.8;
  const broad = elevationNoise(nx * 7.5 + 13, nz * 7.5 - 9) * profile.relief;
  const fine = surfaceNoise(nx * 31, nz * 31) * profile.relief * 0.16;
  return profile.base + broad + fine + ridge;
}


function authoredRegion(regionId = 'POST_OFFICE_BAY') {
  return getRegionDefinition(regionId || 'POST_OFFICE_BAY');
}

export function terrainBiomeAt(x, z, y = terrainHeight(x, z), regionId = 'POST_OFFICE_BAY') {
  const definition = authoredRegion(regionId);
  if (definition?.terrain?.biomeAt) return definition.terrain.biomeAt(x, z, y);
  return placeholderProfile(regionId).biome;
}

export function terrainHeight(x, z, regionId = 'POST_OFFICE_BAY') {
  const definition = authoredRegion(regionId);
  if (definition?.terrain?.height) return definition.terrain.height(x, z);
  return placeholderTerrainHeight(x, z, regionId);
}

export function movementTerrainHeight(x, z, regionId = 'POST_OFFICE_BAY') {
  const definition = authoredRegion(regionId);
  if (definition?.terrain?.movementHeight) return definition.terrain.movementHeight(x, z);
  return placeholderTerrainHeight(x, z, regionId);
}

export function terrainSlopeAt(x, z, regionId = 'POST_OFFICE_BAY', step = 0.85) {
  const left = movementTerrainHeight(x - step, z, regionId);
  const right = movementTerrainHeight(x + step, z, regionId);
  const back = movementTerrainHeight(x, z - step, regionId);
  const forward = movementTerrainHeight(x, z + step, regionId);
  const dx = (right - left) / (step * 2);
  const dz = (forward - back) / (step * 2);
  const normal = new THREE.Vector3(-dx, 1, -dz).normalize();
  return {
    dx,
    dz,
    grade: Math.hypot(dx, dz),
    normal,
  };
}

export function isWalkableTerrain(x, z, regionId = 'POST_OFFICE_BAY') {
  const config = getRegionTerrainConfig(regionId);
  const definition = authoredRegion(regionId);
  if (definition?.terrain?.isWalkable) return definition.terrain.isWalkable(x, z, config);
  return Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
}

// Walkable for the player specifically: normal walkable land, plus the band of
// shallow seabed where Darwin can wade. The band is gated by depth (seabed no
// deeper than WADE_DEPTH below the surface) and an upper bound that keeps it
// from legitimising unwalkable dry ground.
export function isWadeableTerrain(x, z, regionId = 'POST_OFFICE_BAY', options = null) {
  if (isWalkableTerrain(x, z, regionId)) return true;
  const config = getRegionTerrainConfig(regionId);
  const definition = authoredRegion(regionId);
  if (definition?.id === 'POST_OFFICE_BAY') {
    if (Math.hypot(x, z) > config.bounds) return false;
  } else if (Math.abs(x) > config.width * 0.5 - 1.2 || Math.abs(z) > config.depth * 0.5 - 1.2) {
    return false;
  }
  const y = movementTerrainHeight(x, z, regionId);
  // `deep` drops the depth floor: any water counts (used while the player is
  // airborne or already drowning, so deep water is enterable but not strollable).
  if (options?.deep) return y < -0.45;
  return y > WATER_LEVEL - WADE_DEPTH && y < -0.45;
}

export function getTerrainEdgeRisk(x, z, facing = null, regionId = 'POST_OFFICE_BAY') {
  const hereY = movementTerrainHeight(x, z, regionId);
  const definition = authoredRegion(regionId);
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0.707, 0, 0.707),
    new THREE.Vector3(-0.707, 0, 0.707),
    new THREE.Vector3(0.707, 0, -0.707),
    new THREE.Vector3(-0.707, 0, -0.707),
  ];
  const look = facing && facing.lengthSq && facing.lengthSq() > 0.001 ? facing.clone().normalize() : null;
  let best = null;

  for (const direction of directions) {
    const facingWeight = look ? Math.max(0.18, direction.dot(look)) : 1;
    const nearX = x + direction.x * 1.25;
    const nearZ = z + direction.z * 1.25;
    const farX = x + direction.x * 2.35;
    const farZ = z + direction.z * 2.35;
    const nearWalkable = isWalkableTerrain(nearX, nearZ, regionId);
    const farWalkable = isWalkableTerrain(farX, farZ, regionId);
    const nearY = movementTerrainHeight(nearX, nearZ, regionId);
    const farY = movementTerrainHeight(farX, farZ, regionId);
    const waterRisk = !nearWalkable || !farWalkable || (definition?.id === 'POST_OFFICE_BAY' && (coveWaterMask(farX, farZ) > 0.66 || islandMask(farX, farZ) > 1.0));
    const drop = Math.max(hereY - nearY, hereY - farY);
    const cliffRisk = drop > 1.45;
    if (!waterRisk && !cliffRisk) continue;

    const raw = Math.max(waterRisk ? 0.62 : 0, THREE.MathUtils.clamp((drop - 1.15) / 2.6, 0, 1));
    const intensity = THREE.MathUtils.clamp(raw * facingWeight, 0, 1);
    if (intensity < 0.36) continue;
    if (!best || intensity > best.intensity) {
      best = {
        direction,
        intensity,
        kind: waterRisk ? 'water' : 'drop',
        drop,
      };
    }
  }

  return best;
}

export function clampToWalkable(position, previousPosition = null, regionId = 'POST_OFFICE_BAY', options = null) {
  const allowed = options?.wade
    ? (x, z) => isWadeableTerrain(x, z, regionId, options)
    : (x, z) => isWalkableTerrain(x, z, regionId);
  const p = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y || 0, position.z);
  const config = getRegionTerrainConfig(regionId);
  const definition = authoredRegion(regionId);
  if (definition?.id !== 'POST_OFFICE_BAY') {
    p.x = THREE.MathUtils.clamp(p.x, -config.width * 0.5 + 1.2, config.width * 0.5 - 1.2);
    p.z = THREE.MathUtils.clamp(p.z, -config.depth * 0.5 + 1.2, config.depth * 0.5 - 1.2);
    if (definition) {
      // Never spawn/strand the player in the surf: march inland to dry sand.
      let guard = 0;
      while (!allowed(p.x, p.z) && p.z < config.depth * 0.5 - 1.5 && guard < 80) {
        p.z += 1.1;
        guard += 1;
      }
    }
    return p;
  }
  const dist = Math.hypot(p.x, p.z);
  if (dist > config.bounds) {
    p.x *= config.bounds / dist;
    p.z *= config.bounds / dist;
  }
  if (allowed(p.x, p.z)) return p;
  if (previousPosition && allowed(previousPosition.x, previousPosition.z)) {
    const previous = previousPosition.clone
      ? previousPosition.clone()
      : new THREE.Vector3(previousPosition.x, previousPosition.y || 0, previousPosition.z);
    const slideX = new THREE.Vector3(p.x, previous.y, previous.z);
    const slideZ = new THREE.Vector3(previous.x, previous.y, p.z);
    const candidates = [slideX, slideZ].filter(candidate => allowed(candidate.x, candidate.z));
    if (candidates.length) {
      candidates.sort((a, b) => a.distanceToSquared(p) - b.distanceToSquared(p));
      return candidates[0];
    }
    return previous;
  }
  const angle = Math.atan2(p.z, p.x);
  for (let radius = Math.min(dist, config.bounds); radius > 2; radius -= 1.25) {
    const candidate = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    if (allowed(candidate.x, candidate.z)) return candidate;
  }
  return new THREE.Vector3(0, 0, 7.5);
}

export function terrainColor(x, z, y, regionId = 'POST_OFFICE_BAY') {
  const definition = authoredRegion(regionId);
  if (definition?.terrain?.color) return definition.terrain.color(x, z, y);
  const profile = placeholderProfile(regionId);
  const color = new THREE.Color(profile.color);
  const noise = terrainSurfaceNoise(x, z);
  color.offsetHSL(0.015 * noise, -0.03, noise * 0.075);
  return color;
}

export function sampleRegionMap(regionId, x, z) {
  const y = movementTerrainHeight(x, z, regionId);
  return {
    height: y,
    biome: terrainBiomeAt(x, z, y, regionId),
    color: terrainColor(x, z, y, regionId),
    walkable: isWalkableTerrain(x, z, regionId),
  };
}

export function regionSpawnPoint(regionId, entryEdge = null) {
  const config = getRegionTerrainConfig(regionId);
  const region = getRegionMap(regionId);
  const definition = authoredRegion(regionId);
  const defaultSpawn = definition?.terrain?.defaultSpawn;
  const start = Array.isArray(region.playerStart)
    ? region.playerStart
    : Array.isArray(defaultSpawn)
      ? defaultSpawn
      : null;
  const margin = 5.2;
  let x = Number.isFinite(start?.[0]) ? start[0] : 0;
  let z = Number.isFinite(start?.[2]) ? start[2] : 0;
  if (entryEdge === 'east') x = config.width * 0.5 - margin;
  else if (entryEdge === 'west') x = -config.width * 0.5 + margin;
  else if (entryEdge === 'south') z = config.depth * 0.5 - margin;
  else if (entryEdge === 'north') z = -config.depth * 0.5 + margin;
  else if (entryEdge === 'northeast') {
    x = config.width * 0.5 - margin;
    z = -config.depth * 0.5 + margin;
  } else if (entryEdge === 'northwest') {
    x = -config.width * 0.5 + margin;
    z = -config.depth * 0.5 + margin;
  } else if (entryEdge === 'southeast') {
    x = config.width * 0.5 - margin;
    z = config.depth * 0.5 - margin;
  } else if (entryEdge === 'southwest') {
    x = -config.width * 0.5 + margin;
    z = config.depth * 0.5 - margin;
  } else if (start) {
    // Authored default spawn from the region map.
  } else if (definition?.id === 'MANGROVES') {
    x = -3;
    z = 20;
  } else if (definition?.id === 'POST_OFFICE_BAY') {
    x = 6.6;
    z = 3.4;
  }
  const clamped = clampToWalkable(new THREE.Vector3(x, 0, z), null, regionId);
  clamped.y = movementTerrainHeight(clamped.x, clamped.z, regionId) + 0.04;
  return clamped;
}
