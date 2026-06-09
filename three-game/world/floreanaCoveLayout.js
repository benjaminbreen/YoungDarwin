import * as THREE from 'three';
import { terrainBiomeAt, terrainHeight, terrainSlopeAt, terrainSurfaceNoise, coveWaterMask, islandMask } from './terrain';

function seeded(index, salt = 0) {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const floreanaCoveHeroRocks = [
  [-20, -15, 1.6, 0.2],
  [-16, -7, 1.05, -0.7],
  [-11, -20, 0.9, 0.8],
  [9, -18, 1.1, -0.35],
  [17, -13, 1.35, 0.7],
  [23, -4, 1.8, -0.1],
  [-23, 10, 1.7, 0.45],
  [-15, 20, 1.45, -0.2],
  [18, 24, 1.25, 0.5],
].map(([x, z, scale, yaw], index) => ({
  id: `hero-rock-${index}`,
  x,
  z,
  y: terrainHeight(x, z),
  scale,
  yaw,
}));

export const floreanaTidePools = [
  [-11.5, -18.8, 1.15, -0.2],
  [-5.2, -14.6, 0.78, 0.35],
  [5.8, -18.2, 0.95, -0.45],
  [14.2, -12.6, 0.72, 0.2],
].map(([x, z, scale, yaw], index) => ({
  id: `tide-pool-${index}`,
  x,
  z,
  y: terrainHeight(x, z),
  scale,
  yaw,
}));

export const floreanaTrailMarkers = [
  [-3, 8.5, 0.2],
  [0.8, 14.6, 0.05],
  [5.5, 20.2, -0.16],
  [11.5, 25.6, -0.28],
];

function smoothBand(value, min, max, feather = 2.5) {
  return Math.min(
    THREE.MathUtils.smoothstep(value, min - feather, min),
    1 - THREE.MathUtils.smoothstep(value, max, max + feather),
  );
}

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.hypot(dx, dz);
}

function trailInfluence(x, z) {
  let nearest = Infinity;
  for (let i = 0; i < floreanaTrailMarkers.length - 1; i += 1) {
    const a = floreanaTrailMarkers[i];
    const b = floreanaTrailMarkers[i + 1];
    nearest = Math.min(nearest, pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]));
  }
  return 1 - THREE.MathUtils.smoothstep(nearest, 2.4, 8.5);
}

export function dryGrassSuitability(x, z, y = terrainHeight(x, z)) {
  if (islandMask(x, z) > 1.0 || coveWaterMask(x, z) > 0.58 || y < -0.48 || y > 6.2) return 0;
  const biome = terrainBiomeAt(x, z, y);
  const slope = terrainSlopeAt(x, z).grade;
  if (slope > 0.78) return 0;

  const noise = terrainSurfaceNoise(x, z);
  const backshore = smoothBand(z, -13.5, -4.2, 3.2) * (1 - THREE.MathUtils.smoothstep(Math.abs(x), 19, 31));
  const drainageCenter = Math.sin(z * 0.18) * 3.2 - 2.4 + Math.sin(z * 0.41) * 1.1;
  const drainage = Math.exp(-Math.pow((x - drainageCenter) / 4.6, 2)) * smoothBand(z, -5.5, 20.5, 4.5);
  const scrubPocket = (biome === 'dry-scrub' || biome === 'palo-santo' ? 0.72 : 0) * smoothBand(z, 1.5, 25, 5);
  const ashPocket = biome === 'ash-slope' ? 0.48 * smoothBand(z, -7.5, 14, 4.5) : 0;
  const lavaCrevice = biome === 'black-lava' ? 0.26 * Math.max(0, -noise) : 0;
  const trailEdge = trailInfluence(x, z) * smoothBand(z, 2, 25, 5) * 0.52;
  const drynessBreakup = 0.82 + noise * 0.22;
  const slopePenalty = 1 - THREE.MathUtils.smoothstep(slope, 0.34, 0.78);
  return THREE.MathUtils.clamp(Math.max(backshore, drainage, scrubPocket, ashPocket, lavaCrevice, trailEdge) * drynessBreakup * slopePenalty, 0, 1);
}

function acceptedForLayer(layer, x, z, y) {
  if (islandMask(x, z) > 1.0 || coveWaterMask(x, z) > 0.58 || y < -0.55) return false;
  const biome = terrainBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  if (layer === 'basalt') return (biome === 'wet-basalt' || biome === 'black-lava') && noise > -0.35;
  if (layer === 'scree') return biome === 'tuff-ridge' || (z > 8 && noise > 0.05);
  if (layer === 'scrub') return (biome === 'dry-scrub' || biome === 'palo-santo') && y > 1.1 && noise > -0.2;
  if (layer === 'grass') return z > -8 && z < 18 && y > 0.35 && y < 5.8 && noise < 0.35;
  if (layer === 'dry-grass') return dryGrassSuitability(x, z, y) > 0.34 && noise < 0.72;
  if (layer === 'dry-grass-patch') return dryGrassSuitability(x, z, y) > 0.42 && noise < 0.68;
  if (layer === 'opuntia') return biome === 'dry-scrub' && y > 1.4 && x > 7 && noise > -0.05;
  return false;
}

export function makeFloreanaScatter(layer, count, seed, {
  minX = -30,
  maxX = 30,
  minZ = -22,
  maxZ = 34,
  scale = [1, 1],
} = {}) {
  const items = [];
  let attempts = 0;
  while (items.length < count && attempts < count * 60) {
    attempts += 1;
    const i = attempts + seed * 1000;
    const x = minX + seeded(i, 3) * (maxX - minX);
    const z = minZ + seeded(i, 9) * (maxZ - minZ);
    const y = terrainHeight(x, z);
    if (!acceptedForLayer(layer, x, z, y)) continue;
    const s = scale[0] + seeded(i, 13) * (scale[1] - scale[0]);
    items.push({
      id: `${layer}-${items.length}`,
      x,
      y,
      z,
      scale: s,
      yaw: seeded(i, 17) * Math.PI * 2,
      variant: Math.floor(seeded(i, 21) * 4),
      tone: seeded(i, 27),
    });
  }
  return items;
}
