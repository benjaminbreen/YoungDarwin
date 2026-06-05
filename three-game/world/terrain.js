import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { getZone } from './floreanaZones';

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

export function terrainSurfaceNoise(x, z) {
  return surfaceNoise(x * 0.23, z * 0.23);
}

export function terrainFineDetail(x, z) {
  const lavaChip = crackNoise(x * 1.15 + 8, z * 1.08 - 3) * 0.055;
  const ashRipple = surfaceNoise(x * 0.74 - 11, z * 0.68 + 4) * 0.035;
  const fracture = Math.abs(crackNoise(x * 0.52, z * 0.48));
  return lavaChip + ashRipple + Math.pow(fracture, 5) * 0.12;
}

export function terrainBiomeAt(x, z, y = terrainHeight(x, z)) {
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  if (mask > 1.04 || y < -0.72) return 'water';
  if (cove > 0.2 || z < -18) return 'wet-basalt';
  if (z > 19 || y > 5.8) return 'tuff-ridge';
  if (x < -12 || terrainSurfaceNoise(x, z) < -0.42) return 'black-lava';
  if (x > 10 && z > 0) return 'dry-scrub';
  if (z > 7) return 'palo-santo';
  return 'ash-slope';
}

export function terrainHeight(x, z) {
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const seaFalloff = Math.max(0, mask - 0.94);
  const coveCut = cove * 3.7;

  const cliffWall = Math.exp(-Math.pow((z + 19) / 7.2, 2)) * Math.exp(-Math.pow((x - 2) / 25, 2)) * 5.3;
  const tuffRidge = Math.exp(-Math.pow((z - 20) / 13, 2)) * (2.1 + Math.exp(-Math.pow((x + 9) / 10, 2)) * 2.7);
  const westernLavaRamp = Math.exp(-Math.pow((x + 19) / 9, 2)) * Math.exp(-Math.pow((z - 2) / 24, 2)) * 2.4;
  const overlookShoulder = Math.max(0, 1 - ellipseDistance(x, z, 16, 13, 11, 16)) * 2.2;
  const landingShelf = Math.max(0, 1 - ellipseDistance(x, z, 13, 8, -2, -8)) * 0.9;

  let y = -0.15;
  y += elevationNoise(x * 0.035 + 4, z * 0.035 - 1) * 1.45;
  y += elevationNoise(x * 0.105 - 2, z * 0.11 + 6) * 0.46;
  y += crackNoise(x * 0.42, z * 0.34) * 0.13;
  y += terrainFineDetail(x, z);
  y += cliffWall + tuffRidge + westernLavaRamp + overlookShoulder + landingShelf;
  y -= coveCut;
  y -= seaFalloff * 15.5;

  if (z < -24) y -= Math.abs(z + 24) * 0.18;
  if (mask > 1.08) y -= (mask - 1.08) * 18;
  return Math.max(-2.4, y);
}

export function isWalkableTerrain(x, z) {
  const y = terrainHeight(x, z);
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  return mask < 1.02 && y > -0.82 && cove < 0.76;
}

export function getTerrainEdgeRisk(x, z, facing = null) {
  const hereY = terrainHeight(x, z);
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
    const nearWalkable = isWalkableTerrain(nearX, nearZ);
    const farWalkable = isWalkableTerrain(farX, farZ);
    const nearY = terrainHeight(nearX, nearZ);
    const farY = terrainHeight(farX, farZ);
    const waterRisk = !nearWalkable || !farWalkable || coveWaterMask(farX, farZ) > 0.66 || islandMask(farX, farZ) > 1.0;
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

export function clampToWalkable(position, previousPosition = null) {
  const p = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y || 0, position.z);
  const dist = Math.hypot(p.x, p.z);
  if (dist > TERRAIN_BOUNDS) {
    p.x *= TERRAIN_BOUNDS / dist;
    p.z *= TERRAIN_BOUNDS / dist;
  }
  if (isWalkableTerrain(p.x, p.z)) return p;
  if (previousPosition && isWalkableTerrain(previousPosition.x, previousPosition.z)) {
    return previousPosition.clone ? previousPosition.clone() : new THREE.Vector3(previousPosition.x, previousPosition.y || 0, previousPosition.z);
  }
  const angle = Math.atan2(p.z, p.x);
  for (let radius = Math.min(dist, TERRAIN_BOUNDS); radius > 2; radius -= 1.25) {
    const candidate = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    if (isWalkableTerrain(candidate.x, candidate.z)) return candidate;
  }
  return new THREE.Vector3(0, 0, 7.5);
}

export function terrainColor(x, z, y) {
  const noise = terrainSurfaceNoise(x, z);
  const biome = terrainBiomeAt(x, z, y);
  const color = new THREE.Color();
  if (biome === 'water') color.set('#2d8fba');
  else if (biome === 'wet-basalt') color.set('#2f3331');
  else if (biome === 'tuff-ridge') color.set('#9a835d');
  else if (biome === 'black-lava') color.set('#262621');
  else if (biome === 'dry-scrub') color.set('#6f7d45');
  else if (biome === 'palo-santo') color.set('#777a4c');
  else color.set('#7b684b');

  color.multiplyScalar(0.9 + noise * 0.11);
  if (biome === 'wet-basalt') color.lerp(new THREE.Color('#76b9b4'), Math.max(0, coveWaterMask(x, z) - 0.32) * 0.18);
  if (Math.abs(noise) > 0.72 && biome !== 'water') color.lerp(new THREE.Color('#c1a36d'), 0.22);
  if (z < -25 && biome !== 'water') color.lerp(new THREE.Color('#3f564d'), 0.24);
  return color;
}
