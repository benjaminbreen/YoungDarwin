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

export const BLACK_BEACH = 'BLACK_BEACH';

const smoothstep = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

function gaussian(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.exp(-(dx * dx + dz * dz));
}

// West-facing coast: water is x < coast, land rises slowly to the east.
export function blackBeachCoastX(z) {
  const centralCove = gaussian(0, z, 0, 2, 1, 28) * 29;
  const northHeadland = gaussian(0, z, 0, -36, 1, 15) * -10.5;
  const southPoint = gaussian(0, z, 0, 34, 1, 16) * -8.5;
  const northPocket = gaussian(0, z, 0, -15, 1, 9) * 4.2;
  return -15.5
    + centralCove
    + northPocket
    + northHeadland
    + southPoint
    + Math.sin(z * 0.095 + 0.9) * 2.0
    + Math.sin(z * 0.041 - 1.6) * 1.35
    + elevationNoise(z * 0.045 + 5, 8.7) * 1.35;
}

export function blackBeachInlandDistance(x, z) {
  return x - blackBeachCoastX(z);
}

// Curved wet-sand and swash shelves along the cove. This should read like a
// beach face, not like a causeway from the route edge.
export function blackBeachSandbarMask(x, z) {
  const d = blackBeachInlandDistance(x, z);
  const cove = gaussian(0, z, 0, 2, 1, 31);
  const shoreBand = 1 - smoothstep(Math.abs(d), 1.4, 8.8);
  const northPocket = gaussian(d, z, -1.5, -18, 7, 9) * 0.65;
  const southPocket = gaussian(d, z, -1.0, 21, 8, 11) * 0.48;
  const brokenBars = Math.max(
    gaussian(d, z, -6.4, -7, 5.4, 8.2),
    gaussian(d, z, -7.8, 13, 6.2, 8.8) * 0.72,
  );
  return clamp((shoreBand * (0.36 + cove * 0.64)) + northPocket + southPocket + brokenBars * 0.42, 0, 1);
}

export function blackBeachDuneMask(x, z) {
  const d = blackBeachInlandDistance(x, z);
  const broad = smoothstep(d, 9, 38);
  const duneNoise = elevationNoise(x * 0.052 + 3, z * 0.048 - 8) * 0.5 + 0.5;
  const lobes = Math.max(
    gaussian(x, z, 18, -28, 13, 10),
    gaussian(x, z, 34, -7, 17, 13),
    gaussian(x, z, 24, 22, 18, 14),
  );
  return clamp(broad * (duneNoise * 0.45 + lobes * 0.72), 0, 1);
}

export function blackBeachHeight(x, z, { movementSurface = false } = {}) {
  const d = blackBeachInlandDistance(x, z);
  const sandbar = blackBeachSandbarMask(x, z);
  const dunes = blackBeachDuneMask(x, z);

  let y;
  if (d < 0) {
    // Broad, very shallow black-sand shelf inside the cove. The bottom slopes
    // slowly offshore and never becomes swim-depth on this map.
    const offshore = Math.max(0, -d);
    const cove = gaussian(0, z, 0, 2, 1, 32);
    y = WATER_LEVEL - 0.06 - Math.pow(offshore, 1.08) * lerp(0.026, 0.016, cove);
    y = Math.max(WATER_LEVEL - WADE_DEPTH + 0.16, y);
    y += surfaceNoise(x * 0.15 + 4, z * 0.17 - 6) * (movementSurface ? 0.018 : 0.055);
  } else {
    // Slow black-sand rise into low hillocks, similar in readability to the
    // north-facing Cormorant beach but darker and flatter.
    y = -0.32 + 1.04 * (1 - Math.exp(-d * 0.074));
    y += smoothstep(d, 14, 42) * 0.58;
    y += smoothstep(x, 26, 54) * 0.46;
    y += dunes * (movementSurface ? 0.18 : 0.36);
  }

  if (sandbar > 0) {
    const barTarget = -0.22 + smoothstep(d, -5, 5) * 0.22
      + elevationNoise(x * 0.11 - 8, z * 0.13 + 2) * (movementSurface ? 0.015 : 0.04);
    y = lerp(y, barTarget, sandbar * 0.72);
  }

  // A few low black lava ribs interrupt the sand without making traversal
  // rocky or noisy.
  const basalt = Math.max(
    gaussian(x, z, 5, -36, 9, 4),
    gaussian(x, z, 2, 36, 10, 4.5),
    gaussian(x, z, 41, 26, 8, 8) * 0.7,
  );
  y += basalt * (movementSurface ? 0.08 : 0.22)
    * (0.5 + Math.abs(crackNoise(x * 0.28 + 2, z * 0.32 - 7)));

  const dry = smoothstep(y, WATER_LEVEL + 0.03, WATER_LEVEL + 0.6);
  y += terrainFineDetail(x, z) * dry * (movementSurface ? 0.12 : 0.34) * (1 - sandbar * 0.65);
  return Math.max(-3.0, y);
}

export function blackBeachBiomeAt(x, z, y = blackBeachHeight(x, z)) {
  const d = blackBeachInlandDistance(x, z);
  const sandbar = blackBeachSandbarMask(x, z);
  if (y < WATER_LEVEL - WADE_DEPTH + 0.05) return 'deep-water';
  if (y < WATER_LEVEL) return y < WATER_LEVEL - 0.52 ? 'shallow-water' : 'ankle-water';
  if (sandbar > 0.35 || d < 2.2) return 'wet-black-sand';
  if (d < 16) return 'black-sand';
  if (d < 38) return 'black-dune-sand';
  if (blackBeachDuneMask(x, z) > 0.42) return 'dune-scrub';
  return 'dry-scrub';
}

export function blackBeachColor(x, z, y) {
  const biome = blackBeachBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color();
  if (biome === 'deep-water') color.set('#17465d');
  else if (biome === 'shallow-water') {
    color.set('#3c8a8d');
    color.lerp(new THREE.Color('#1e5c64'), clamp((WATER_LEVEL - y) / WADE_DEPTH, 0, 1) * 0.36);
  } else if (biome === 'ankle-water') color.set('#5e9d96');
  else if (biome === 'wet-black-sand') color.set('#252620');
  else if (biome === 'black-sand') {
    color.set('#343129');
    color.lerp(new THREE.Color('#4c4435'), Math.max(0, noise) * 0.24);
  } else if (biome === 'black-dune-sand') {
    color.set('#514934');
    color.lerp(new THREE.Color('#6f6140'), Math.max(0, noise) * 0.25);
    color.lerp(new THREE.Color('#343129'), Math.max(0, -noise) * 0.16);
  } else if (biome === 'dune-scrub') {
    color.set('#6f6d43');
    color.lerp(new THREE.Color('#8b8150'), Math.max(0, noise) * 0.28);
  } else {
    color.set('#5f663f');
    color.lerp(new THREE.Color('#837849'), Math.max(0, noise) * 0.2);
  }
  if (Math.abs(crackNoise(x * 0.8 + 5, z * 0.74 - 3)) > 0.9 && y > WATER_LEVEL) {
    color.lerp(new THREE.Color('#1e211d'), 0.12);
  }
  color.multiplyScalar(0.92 + noise * 0.08);
  return color;
}

export function isBlackBeachWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  return inBounds && blackBeachHeight(x, z, { movementSurface: true }) > -0.45;
}

export const blackBeachRegion = {
  id: BLACK_BEACH,
  aliases: ['black-beach'],
  terrain: {
    height: blackBeachHeight,
    movementHeight: (x, z) => blackBeachHeight(x, z, { movementSurface: true }),
    biomeAt: blackBeachBiomeAt,
    color: blackBeachColor,
    isWalkable: isBlackBeachWalkable,
    defaultSpawn: [12, 0, 3],
    entrySpawns: {
      west: [12, 0, 3],
    },
  },
};
