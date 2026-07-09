import * as THREE from 'three';
import {
  WATER_LEVEL,
  WADE_DEPTH,
  crackNoise,
  elevationNoise,
  surfaceNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';

export const BLACK_BEACH_SURF = 'BLACK_BEACH_SURF';

const smoothstep = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

function gaussian(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.exp(-(dx * dx + dz * dz));
}

function segmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

export function blackBeachSurfProgressWest(x) {
  return clamp((44 - x) / 88, 0, 1);
}

// Matching route sandbar on the east side, tying into Black Beach's west edge.
export function blackBeachSurfSandbarMask(x, z) {
  const bar = 1 - smoothstep(segmentDistance(x, z, 47, 0.5, 27, 1.4), 4.4, 10.6);
  const eastGate = smoothstep(x, 21, 42);
  return clamp(bar * eastGate, 0, 1);
}

export function blackBeachSurfHeight(x, z, { movementSurface = false } = {}) {
  const west = blackBeachSurfProgressWest(x);
  const sandbar = blackBeachSurfSandbarMask(x, z);

  let y;
  if (west < 0.52) {
    y = lerp(WATER_LEVEL - 0.1, WATER_LEVEL - 1.04, west / 0.52);
  } else {
    y = lerp(WATER_LEVEL - 1.14, WATER_LEVEL - 2.72, (west - 0.52) / 0.48);
  }

  // Long, low bars make the east half visibly wadable before the floor drops.
  const outerBar = Math.max(
    gaussian(x, z, 22, -17, 18, 7),
    gaussian(x, z, 12, 18, 20, 8) * 0.82,
  );
  y += outerBar * 0.28;
  y += surfaceNoise(x * 0.14 + 9, z * 0.16 - 2) * (movementSurface ? 0.025 : 0.08);
  y += elevationNoise(x * 0.035 - 4, z * 0.04 + 7) * 0.08;

  if (sandbar > 0) {
    const target = -0.34 + smoothstep(x, 28, 47) * 0.09
      + terrainFineDetail(x, z) * (movementSurface ? 0.04 : 0.11);
    y = lerp(y, target, sandbar * 0.95);
  }

  // A few drowned basalt teeth should be visible, but remain mostly decorative.
  const basalt = Math.max(
    gaussian(x, z, 4, -30, 8, 5),
    gaussian(x, z, -19, 24, 10, 6),
  );
  y += basalt * (movementSurface ? 0.04 : 0.16)
    * (0.6 + Math.abs(crackNoise(x * 0.36 + 2, z * 0.31 - 5)));

  return Math.max(-4.2, y);
}

export function blackBeachSurfBiomeAt(x, z, y = blackBeachSurfHeight(x, z)) {
  if (blackBeachSurfSandbarMask(x, z) > 0.36 && y > WATER_LEVEL - 0.08) return 'wet-black-sand';
  if (y < WATER_LEVEL - WADE_DEPTH - 0.2) return 'deep-water';
  if (y < WATER_LEVEL - WADE_DEPTH * 0.9) return 'swim-water';
  if (y < WATER_LEVEL) return 'shallow-water';
  return 'wet-black-sand';
}

export function blackBeachSurfColor(x, z, y) {
  const biome = blackBeachSurfBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color();
  if (biome === 'deep-water') {
    color.set('#0c334d');
    color.lerp(new THREE.Color('#08263d'), Math.max(0, -noise) * 0.25);
  } else if (biome === 'swim-water') {
    color.set('#1f6070');
    color.lerp(new THREE.Color('#2f7d82'), Math.max(0, noise) * 0.22);
  } else if (biome === 'shallow-water') {
    color.set('#5a9b91');
    color.lerp(new THREE.Color('#2d6d6d'), clamp((WATER_LEVEL - y) / WADE_DEPTH, 0, 1) * 0.24);
  } else {
    color.set('#282822');
    color.lerp(new THREE.Color('#464033'), Math.max(0, noise) * 0.28);
  }
  color.multiplyScalar(0.92 + noise * 0.075);
  return color;
}

export function isBlackBeachSurfWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  return inBounds
    && blackBeachSurfSandbarMask(x, z) > 0.22
    && blackBeachSurfHeight(x, z, { movementSurface: true }) > -0.45;
}

export const blackBeachSurfRegion = {
  id: BLACK_BEACH_SURF,
  aliases: ['black-beach-surf'],
  terrain: {
    height: blackBeachSurfHeight,
    movementHeight: (x, z) => blackBeachSurfHeight(x, z, { movementSurface: true }),
    biomeAt: blackBeachSurfBiomeAt,
    color: blackBeachSurfColor,
    isWalkable: isBlackBeachSurfWalkable,
    defaultSpawn: [38, 0, 1],
  },
};
