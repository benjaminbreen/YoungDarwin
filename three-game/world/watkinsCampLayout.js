import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  WATKINS,
  watkinsHeight,
  watkinsPathInfo,
  watkinsRiverCenterZ,
  watkinsRiverInfo,
} from './regions/watkinsCamp/terrain';

// Watkins Camp site furniture: boulder clumps on the south terraces and
// riverbanks, the stepping-stone ford, and small fire-ring stones. Everything
// here is a "rock" record so visuals (ecology rocks pass) and collision
// (obstacles.js) come from the same list.

// Former yard footprint (world coords). The cabin sits at (-8, -20). Keep this
// as a no-rock clearing even though the enclosing stone wall has been removed.
const WALL = { minX: -20, maxX: 6, minZ: -29, maxZ: -8 };

export function getWatkinsWallStones() {
  return [];
}

let boulders = null;

export function getWatkinsBoulders() {
  if (boulders) return boulders;
  const rocks = [];

  // Hero boulders: perched on the south slope above the cabin's side of the
  // ford — Darwin can start one rolling toward the yard.
  const HEROES = [
    [-6, 24, 1.25, 0.4],
    [4, 26, 1.05, -0.7],
    [14, 25, 1.4, 0.15],
    [26, 27, 1.1, 0.9],
    [-18, 26, 1.2, -0.3],
    [36, 12, 1.0, 0.5],
  ];
  HEROES.forEach(([x, z, scale, yaw], i) => {
    rocks.push({
      id: `watkins-hero-boulder-${i}`,
      x,
      z,
      y: watkinsHeight(x, z),
      scale,
      yaw,
      tone: 0.35 + seededRandom(i, 41) * 0.4,
      radiusX: scale * (0.9 + seededRandom(i, 43) * 0.4),
      radiusY: scale * (0.55 + seededRandom(i, 47) * 0.2),
      radiusZ: scale * (0.75 + seededRandom(i, 53) * 0.35),
      sink: scale * 0.2,
      collide: true,
    });
  });

  // Scatter: terrace clutter and riverbank stones.
  let attempts = 0;
  while (rocks.length < 40 && attempts < 2200) {
    attempts += 1;
    const x = -47 + seededRandom(attempts, 3) * 94;
    const z = -40 + seededRandom(attempts, 9) * 80;
    const river = watkinsRiverInfo(x, z);
    if (river.water > 0.08) continue;
    if (watkinsPathInfo(x, z).tread > 0.35) continue;
    // Prefer the south terraces and the banks; sparse on the north plateau.
    const southBias = z > watkinsRiverCenterZ(x) + 4 ? 1 : river.valley > 0.25 ? 0.7 : 0.16;
    if (seededRandom(attempts, 15) > southBias) continue;
    // Keep the homestead yard clear for the cabin and wall.
    if (x > WALL.minX - 2 && x < WALL.maxX + 2 && z > WALL.minZ - 2 && z < WALL.maxZ + 2) continue;
    const scale = 0.34 + seededRandom(attempts, 13) * 0.85;
    rocks.push({
      id: `watkins-rock-${rocks.length}`,
      x,
      z,
      y: watkinsHeight(x, z),
      scale,
      yaw: seededRandom(attempts, 17) * Math.PI * 2,
      tone: seededRandom(attempts, 27),
      radiusX: scale * (0.85 + seededRandom(attempts, 31) * 0.45),
      radiusY: scale * (0.34 + seededRandom(attempts, 33) * 0.2),
      radiusZ: scale * (0.68 + seededRandom(attempts, 37) * 0.38),
      sink: scale * 0.18,
      collide: scale > 0.75,
    });
  }
  boulders = rocks;
  return boulders;
}

let fordStones = null;

// Flat-topped stepping stones across the ford, tops just proud of the water.
export function getWatkinsSteppingStones() {
  if (fordStones) return fordStones;
  const stones = [];
  const fordX = 1;
  const center = watkinsRiverCenterZ(fordX);
  const from = center - 3.2;
  const to = center + 3.2;
  const count = 5;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const z = from + (to - from) * t;
    const x = fordX + Math.sin(t * Math.PI * 1.7 + 0.4) * 0.55;
    const bedY = watkinsHeight(x, z, { movementSurface: true });
    const s = 0.52 + seededRandom(i, 61) * 0.1;
    stones.push({
      id: `watkins-ford-stone-${i}`,
      x,
      z,
      y: bedY,
      scale: s,
      yaw: seededRandom(i, 67) * Math.PI,
      tone: 0.25 + seededRandom(i, 71) * 0.25,
      radiusX: s * 1.15,
      // Tall enough that the flattened top clears the water line.
      radiusY: Math.max(0.2, (-0.72 - bedY) * 0.5 + 0.16),
      radiusZ: s * 1.0,
      sink: 0.04,
      collide: true,
    });
  }
  fordStones = stones;
  return fordStones;
}

// The cold fire ring outside the south gate: a circle of small blackened
// stones. Charred-shell props (propRegistry) sit inside it; the ash stain is
// painted by the terrain material (see watkinsCamp/material.js WK_ASH).
export const WATKINS_FIRE_RING = { x: 0.5, z: -14.7, radius: 0.85 };

let fireRing = null;

export function getWatkinsFireRing() {
  if (fireRing) return fireRing;
  const stones = [];
  const count = 8;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.3;
    const r = WATKINS_FIRE_RING.radius + (seededRandom(i, 83) - 0.5) * 0.14;
    const x = WATKINS_FIRE_RING.x + Math.cos(angle) * r;
    const z = WATKINS_FIRE_RING.z + Math.sin(angle) * r;
    const s = 0.15 + seededRandom(i, 89) * 0.07;
    stones.push({
      id: `watkins-fire-stone-${i}`,
      x,
      z,
      y: watkinsHeight(x, z),
      scale: s,
      yaw: seededRandom(i, 97) * Math.PI,
      tone: 0.12 + seededRandom(i, 101) * 0.18, // smoke-blackened
      radiusX: s * 1.2,
      radiusY: s * 0.7,
      radiusZ: s * 1.05,
      sink: s * 0.22,
      collide: false,
    });
  }
  fireRing = stones;
  return fireRing;
}

export function getWatkinsCampRocks() {
  return [
    ...getWatkinsWallStones(),
    ...getWatkinsBoulders(),
    ...getWatkinsSteppingStones(),
    ...getWatkinsFireRing(),
  ];
}

let obstacleCache = null;

export function getWatkinsCampObstacles() {
  if (obstacleCache) return obstacleCache;
  obstacleCache = buildRockObstacles(getWatkinsCampRocks(), {
    zoneId: WATKINS,
    idPrefix: 'watkins-camp',
    radiusScale: 0.8,
    colliderShape: 'cylinder',
    traversalLabel: 'step over the stone',
    climbLabel: 'loose stone',
    pushFriction: 0.92,
    filter: rock => rock.collide,
  });
  return obstacleCache;
}
