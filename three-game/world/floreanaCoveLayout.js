import * as THREE from 'three';
import { terrainBiomeAt, terrainHeight, terrainSlopeAt, terrainSurfaceNoise } from './terrain';
import { POST_OFFICE_BAY_TRAIL, coveWaterMask, islandMask, postOfficeTrailInfluence } from './regions/postOfficeBay/terrain';
import { buildRockObstacles } from './proceduralRocks';

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
  [22, -24, 1.15, 0.25],
  [15, -9, 0.95, -0.4],
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
  ...POST_OFFICE_BAY_TRAIL.map(([x, z], index) => [x, z, index === 0 ? -0.35 : index < 3 ? -0.18 : 0.05]),
];

function smoothBand(value, min, max, feather = 2.5) {
  return Math.min(
    THREE.MathUtils.smoothstep(value, min - feather, min),
    1 - THREE.MathUtils.smoothstep(value, max, max + feather),
  );
}

function trailInfluence(x, z) {
  return postOfficeTrailInfluence(x, z, 2.4, 8.5);
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

// Footprints of the hero boulders authored in game-core/obstacles.ts
// (x, z, clearance radius). Scatter must not spawn inside them.
const COVE_BOULDER_CLEARANCES = [
  [0.8, -4.8, 1.7],
  [-4.2, -6.4, 3.5],
  // Keep the default spawn open after removing the former north lava boulder.
  [8.8, 8.2, 3.1],
  [-15.4, 6.8, 3.3],
  [18.6, 21.4, 3.7],
];

function insideCoveBoulder(x, z) {
  return COVE_BOULDER_CLEARANCES.some(([bx, bz, r]) => (x - bx) * (x - bx) + (z - bz) * (z - bz) < r * r);
}

function acceptedForLayer(layer, x, z, y) {
  if (insideCoveBoulder(x, z)) return false;
  if (islandMask(x, z) > 1.0 || coveWaterMask(x, z) > 0.58 || y < -0.55) return false;
  const biome = terrainBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  if (layer === 'basalt') return (biome === 'wet-basalt' || biome === 'black-lava') && noise > -0.35;
  if (layer === 'scree') return biome === 'tuff-ridge' || (z > 8 && noise > 0.05);
  // Post Office Bay's overlapping coastal blend intentionally resolves much
  // of the dry shelf to wet-basalt as its strongest single biome. Vegetation
  // placement therefore uses the authored dry/inland height bands instead of
  // requiring dry-scrub to win that strongest-biome comparison.
  if (layer === 'scrub') return z > -2 && y > 0.65 && noise > -0.35;
  if (layer === 'grass') return z > -8 && z < 18 && y > 0.35 && y < 5.8 && noise < 0.35;
  if (layer === 'dry-grass') return dryGrassSuitability(x, z, y) > 0.34 && noise < 0.72;
  if (layer === 'dry-grass-patch') return dryGrassSuitability(x, z, y) > 0.42 && noise < 0.68;
  if (layer === 'opuntia') return z > 3 && y > 1.35 && x > 7 && noise > -0.22;
  if (layer === 'galapagos-cotton') return z > 4 && y > 1.05 && noise > -0.25;
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

let postOfficeBayBasaltBlocks = null;
let postOfficeBayOpuntiaHazards = null;

// Keep the tall tree-form Opuntia as a distant ecological accent instead of
// distributing large silhouettes throughout the landing and arrival view.
const EASTERN_OPUNTIA_CORNER = [
  { id: 'east-opuntia-1', x: 38, z: 38, scale: 1.0, yaw: 0.2, tone: 0.42 },
  { id: 'east-opuntia-2', x: 45, z: 42, scale: 1.12, yaw: -0.5, tone: 0.58 },
  { id: 'east-opuntia-3', x: 39, z: 48, scale: 1.18, yaw: 0.35, tone: 0.66 },
];

export function getPostOfficeBayOpuntiaHazards() {
  if (postOfficeBayOpuntiaHazards) return postOfficeBayOpuntiaHazards;
  postOfficeBayOpuntiaHazards = EASTERN_OPUNTIA_CORNER
    .map(item => ({
      ...item,
      y: terrainHeight(item.x, item.z),
      variant: 0,
    }))
    .map(item => {
      // The mature tree-cactus GLB is ~1.18 m tall at source scale. Render it
      // around 4.2–5 m while retaining a smaller trunk-contact hazard radius.
      const renderScale = item.scale * 3.6;
      return {
        ...item,
        renderScale,
        hazardRadius: THREE.MathUtils.clamp(renderScale * 0.48, 1.55, 2.35),
        damage: 8,
      };
    });
  return postOfficeBayOpuntiaHazards;
}

export function getPostOfficeBayBasaltBlocks() {
  if (postOfficeBayBasaltBlocks) return postOfficeBayBasaltBlocks;
  postOfficeBayBasaltBlocks = makeFloreanaScatter('basalt', 54, 4, {
    minX: -29,
    maxX: 32,
    minZ: -24,
    maxZ: 22,
    scale: [0.22, 0.72],
  }).map(item => ({
    ...item,
    color: item.tone > 0.58 ? '#5b564b' : '#6b6354',
    radiusX: item.scale * 1.25,
    radiusY: item.scale * 0.55,
    radiusZ: item.scale * 0.9,
    centerLift: item.scale * 0.34,
    sink: item.scale * 0.08,
  }));
  return postOfficeBayBasaltBlocks;
}

export function getPostOfficeBayRockObstacles() {
  return buildRockObstacles(getPostOfficeBayBasaltBlocks(), {
    zoneId: 'POST_OFFICE_BAY',
    idPrefix: 'post-office-bay',
    radiusScale: 0.78,
    colliderShape: 'cylinder',
    filter: rock => rock.radiusY * 2 - rock.sink > 0.26,
  });
}
