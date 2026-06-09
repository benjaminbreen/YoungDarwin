import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { getZone } from './floreanaZones';
import { getRegionMap } from '../../game-core/regionMaps';

const activeZone = getZone();

export const TERRAIN_SIZE = activeZone.terrainSize || 118;
export const TERRAIN_SEGMENTS = activeZone.terrainSegments || 188;
export const TERRAIN_BOUNDS = activeZone.bounds || 43;

const elevationNoise = createNoise2D(() => 0.37);
const surfaceNoise = createNoise2D(() => 0.73);
const crackNoise = createNoise2D(() => 0.19);

function ellipseDistance(x, z, sx, sz, ox = 0, oz = 0) {
  const nx = (x - ox) / sx;
  const nz = (z - oz) / sz;
  return Math.sqrt(nx * nx + nz * nz);
}

function smoothMin(a, b, k = 0.28) {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return THREE.MathUtils.lerp(b, a, h) - k * h * (1 - h);
}

export function islandMask(x, z) {
  const main = ellipseDistance(x, z, 32, 38, 0, 5);
  const northHead = ellipseDistance(x, z, 20, 24, 2, 25);
  const southShelf = ellipseDistance(x, z, 30, 16, -5, -16);
  const coveBite = Math.max(0, 1 - ellipseDistance(x, z, 17, 9, 3, -29));
  const mask = smoothMin(smoothMin(main, northHead, 0.34), southShelf, 0.28);
  return mask + coveBite * 0.38;
}

export function coveWaterMask(x, z) {
  return Math.max(0, 1 - ellipseDistance(x, z, 18, 10, 3, -29));
}

function postOfficeLandContinuity(x, z) {
  const inland = THREE.MathUtils.smoothstep(z, -23, -8);
  const sideShelf = THREE.MathUtils.smoothstep(z, -22, -14)
    * Math.max(
      THREE.MathUtils.smoothstep(Math.abs(x), 22, 38),
      THREE.MathUtils.smoothstep(z, 2, 24),
    );
  return THREE.MathUtils.clamp(Math.max(inland, sideShelf), 0, 1);
}

export function terrainSurfaceNoise(x, z) {
  return surfaceNoise(x * 0.23, z * 0.23);
}

export function terrainFineDetail(x, z) {
  const lavaChip = crackNoise(x * 1.15 + 8, z * 1.08 - 3) * 0.055;
  const ashRipple = surfaceNoise(x * 0.74 - 11, z * 0.68 + 4) * 0.035;
  const fracture = Math.abs(crackNoise(x * 0.52, z * 0.48));
  return lavaChip + ashRipple + Math.pow(fracture, 5) * 0.12;
}

function isAuthoredPostOffice(regionId) {
  return !regionId || regionId === 'POST_OFFICE_BAY' || regionId === 'post-office-bay-anchorage';
}

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

function postOfficeTerrainBiomeAt(x, z, y = postOfficeTerrainHeight(x, z)) {
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  if ((mask > 1.04 && continuity < 0.45) || y < -0.72) return 'water';
  if (cove > 0.2 || z < -18) return 'wet-basalt';
  if (z > 19 || y > 5.8) return 'tuff-ridge';
  if (x < -12 || terrainSurfaceNoise(x, z) < -0.42) return 'black-lava';
  if (x > 10 && z > 0) return 'dry-scrub';
  if (z > 7) return 'palo-santo';
  return 'ash-slope';
}

function postOfficeTerrainHeight(x, z, { movementSurface = false } = {}) {
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  const seaFalloff = Math.max(0, mask - 0.94) * (1 - continuity * 0.92);
  const coveCut = cove * 3.7;

  const cliffWall = Math.exp(-Math.pow((z + 19) / 7.2, 2)) * Math.exp(-Math.pow((x - 2) / 25, 2)) * 5.3;
  const tuffRidge = Math.exp(-Math.pow((z - 20) / 13, 2)) * (2.1 + Math.exp(-Math.pow((x + 9) / 10, 2)) * 2.7);
  const westernLavaRamp = Math.exp(-Math.pow((x + 19) / 9, 2)) * Math.exp(-Math.pow((z - 2) / 24, 2)) * 2.4;
  const overlookShoulder = Math.max(0, 1 - ellipseDistance(x, z, 16, 13, 11, 16)) * 2.2;
  const landingShelf = Math.max(0, 1 - ellipseDistance(x, z, 13, 8, -2, -8)) * 0.9;

  let y = -0.15;
  y += elevationNoise(x * 0.035 + 4, z * 0.035 - 1) * 1.45;
  y += elevationNoise(x * 0.105 - 2, z * 0.11 + 6) * 0.46;
  y += crackNoise(x * 0.42, z * 0.34) * (movementSurface ? 0.045 : 0.13);
  y += movementSurface ? terrainFineDetail(x, z) * 0.24 : terrainFineDetail(x, z);
  y += cliffWall + tuffRidge + westernLavaRamp + overlookShoulder + landingShelf;
  y -= coveCut;
  y -= seaFalloff * 15.5;
  y += continuity * 0.35;

  if (z < -24) y -= Math.abs(z + 24) * 0.18;
  if (mask > 1.08) y -= (mask - 1.08) * 18 * (1 - continuity * 0.9);
  return Math.max(-2.4, y);
}

export function terrainBiomeAt(x, z, y = terrainHeight(x, z), regionId = 'POST_OFFICE_BAY') {
  if (isAuthoredPostOffice(regionId)) return postOfficeTerrainBiomeAt(x, z, y);
  return placeholderProfile(regionId).biome;
}

export function terrainHeight(x, z, regionId = 'POST_OFFICE_BAY') {
  if (isAuthoredPostOffice(regionId)) return postOfficeTerrainHeight(x, z);
  return placeholderTerrainHeight(x, z, regionId);
}

export function movementTerrainHeight(x, z, regionId = 'POST_OFFICE_BAY') {
  if (isAuthoredPostOffice(regionId)) return postOfficeTerrainHeight(x, z, { movementSurface: true });
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
  if (!isAuthoredPostOffice(regionId)) {
    const config = getRegionTerrainConfig(regionId);
    return Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  }
  const y = movementTerrainHeight(x, z, regionId);
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  const landShelf = mask < 1.02 || continuity > 0.45;
  const forgivingDryShelf = mask < 1.1 && continuity > 0.12 && y > -0.55 && cove < 0.25;
  return (landShelf || forgivingDryShelf) && y > -0.82 && cove < 0.76;
}

export function getTerrainEdgeRisk(x, z, facing = null, regionId = 'POST_OFFICE_BAY') {
  const hereY = movementTerrainHeight(x, z, regionId);
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
    const waterRisk = !nearWalkable || !farWalkable || (isAuthoredPostOffice(regionId) && (coveWaterMask(farX, farZ) > 0.66 || islandMask(farX, farZ) > 1.0));
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

export function clampToWalkable(position, previousPosition = null, regionId = 'POST_OFFICE_BAY') {
  const p = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y || 0, position.z);
  const config = getRegionTerrainConfig(regionId);
  if (!isAuthoredPostOffice(regionId)) {
    p.x = THREE.MathUtils.clamp(p.x, -config.width * 0.5 + 1.2, config.width * 0.5 - 1.2);
    p.z = THREE.MathUtils.clamp(p.z, -config.depth * 0.5 + 1.2, config.depth * 0.5 - 1.2);
    return p;
  }
  const dist = Math.hypot(p.x, p.z);
  if (dist > config.bounds) {
    p.x *= config.bounds / dist;
    p.z *= config.bounds / dist;
  }
  if (isWalkableTerrain(p.x, p.z, regionId)) return p;
  if (previousPosition && isWalkableTerrain(previousPosition.x, previousPosition.z, regionId)) {
    const previous = previousPosition.clone
      ? previousPosition.clone()
      : new THREE.Vector3(previousPosition.x, previousPosition.y || 0, previousPosition.z);
    const slideX = new THREE.Vector3(p.x, previous.y, previous.z);
    const slideZ = new THREE.Vector3(previous.x, previous.y, p.z);
    const candidates = [slideX, slideZ].filter(candidate => isWalkableTerrain(candidate.x, candidate.z, regionId));
    if (candidates.length) {
      candidates.sort((a, b) => a.distanceToSquared(p) - b.distanceToSquared(p));
      return candidates[0];
    }
    return previous;
  }
  const angle = Math.atan2(p.z, p.x);
  for (let radius = Math.min(dist, config.bounds); radius > 2; radius -= 1.25) {
    const candidate = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    if (isWalkableTerrain(candidate.x, candidate.z, regionId)) return candidate;
  }
  return new THREE.Vector3(0, 0, 7.5);
}

export function terrainColor(x, z, y, regionId = 'POST_OFFICE_BAY') {
  if (!isAuthoredPostOffice(regionId)) {
    const profile = placeholderProfile(regionId);
    const color = new THREE.Color(profile.color);
    const noise = terrainSurfaceNoise(x, z);
    color.offsetHSL(0.015 * noise, -0.03, noise * 0.075);
    return color;
  }
  const noise = terrainSurfaceNoise(x, z);
  const biome = terrainBiomeAt(x, z, y, regionId);
  const color = new THREE.Color();
  if (biome === 'water') color.set('#49b9c7');
  else if (biome === 'wet-basalt') color.set('#5b6657');
  else if (biome === 'tuff-ridge') color.set('#b69a68');
  else if (biome === 'black-lava') color.set('#262621');
  else if (biome === 'dry-scrub') color.set('#6f7d45');
  else if (biome === 'palo-santo') color.set('#777a4c');
  else color.set('#9b8359');

  color.multiplyScalar(0.9 + noise * 0.11);
  const cove = coveWaterMask(x, z);
  if (biome === 'wet-basalt') {
    color.lerp(new THREE.Color('#8dc5b4'), Math.max(0, cove - 0.24) * 0.24);
    color.lerp(new THREE.Color('#c9b17b'), THREE.MathUtils.smoothstep(cove, 0.2, 0.62) * 0.34);
  }
  if (Math.abs(noise) > 0.72 && biome !== 'water') color.lerp(new THREE.Color('#d2b776'), 0.26);
  if (z < -25 && biome !== 'water') color.lerp(new THREE.Color('#b79f70'), 0.22);
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
  const margin = 5.2;
  let x = 0;
  let z = 0;
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
  } else if (isAuthoredPostOffice(regionId)) {
    z = 7.5;
  }
  const clamped = clampToWalkable(new THREE.Vector3(x, 0, z), null, regionId);
  clamped.y = movementTerrainHeight(clamped.x, clamped.z, regionId) + 0.04;
  return clamped;
}
