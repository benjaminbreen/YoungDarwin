import * as THREE from 'three';
import { terrainBiomeAt, terrainHeight, terrainSlopeAt, terrainSurfaceNoise } from './terrain';
import { POST_OFFICE_BAY_TRAIL, coveWaterMask, islandMask, postOfficeTrailInfluence } from './regions/postOfficeBay/terrain';

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
  if (layer === 'galapagos-cotton') return (biome === 'dry-scrub' || biome === 'palo-santo') && y > 1.2 && noise > -0.1;
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

const SOUTHERN_OPUNTIA_GROVE = [
  { id: 'south-opuntia-1', x: -27, z: 32, scale: 1.12, yaw: 0.2, tone: 0.42 },
  { id: 'south-opuntia-2', x: -18, z: 38, scale: 1.18, yaw: -0.5, tone: 0.58 },
  { id: 'south-opuntia-3', x: -9, z: 41, scale: 1.32, yaw: 0.35, tone: 0.66 },
  { id: 'south-opuntia-4', x: 2, z: 38, scale: 1.05, yaw: 1.1, tone: 0.35 },
  { id: 'south-opuntia-5', x: 23, z: 36, scale: 1.08, yaw: 0.65, tone: 0.5 },
  { id: 'south-opuntia-6', x: 0, z: 49, scale: 1.28, yaw: -0.2, tone: 0.62 },
];

export function getPostOfficeBayOpuntiaHazards() {
  if (postOfficeBayOpuntiaHazards) return postOfficeBayOpuntiaHazards;
  const scattered = makeFloreanaScatter('opuntia', 8, 23, {
    minX: 8,
    maxX: 30,
    minZ: 3,
    maxZ: 30,
    scale: [0.65, 1.15],
  });
  const southernGrove = SOUTHERN_OPUNTIA_GROVE.map(item => ({
    ...item,
    y: terrainHeight(item.x, item.z),
    variant: 0,
  }));
  postOfficeBayOpuntiaHazards = [...scattered, ...southernGrove].map(item => {
    const renderScale = item.scale * 2.8;
    return {
      ...item,
      renderScale,
      hazardRadius: THREE.MathUtils.clamp(renderScale * 0.58, 1.15, 2.05),
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
  return getPostOfficeBayBasaltBlocks()
    .filter(rock => rock.radiusY * 2 - rock.sink > 0.26)
    .map(rock => {
      const top = rock.centerLift + rock.radiusY - rock.sink;
      const radius = Math.max(rock.radiusX, rock.radiusZ) * 0.78;
      const collider = {
        type: 'cylinder',
        radius,
        height: top,
        offset: [0, top * 0.5, 0],
      };
      return {
        id: `post-office-bay-${rock.id}`,
        kind: 'rock',
        path: null,
        x: rock.x,
        z: rock.z,
        radius,
        height: top,
        colliderTop: top,
        colliderBottom: 0,
        scale: 1,
        yaw: rock.yaw,
        jumpable: top >= 0.72,
        climbable: top >= 1.1,
        edgeRisk: false,
        pushable: false,
        pushMass: 1,
        pushFriction: 0.88,
        traversal: top > 0.48 ? 'vault' : 'scramble',
        traversalLabel: 'scramble over basalt',
        definition: { collider },
        zoneId: 'POST_OFFICE_BAY',
        shapes: [collider],
      };
    });
}
