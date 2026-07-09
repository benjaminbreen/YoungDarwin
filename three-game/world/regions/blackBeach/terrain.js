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

function segmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

// West-facing coast: water is x < coast, land rises slowly to the east.
export function blackBeachCoastX(z) {
  const northPocket = gaussian(0, z, 0, -27, 1, 13) * 4.2;
  const southPoint = gaussian(0, z, 0, 31, 1, 15) * -3.6;
  return 4.0
    + Math.sin(z * 0.071 + 0.8) * 3.2
    + Math.sin(z * 0.026 - 1.4) * 1.55
    + northPocket
    + southPoint;
}

export function blackBeachInlandDistance(x, z) {
  return x - blackBeachCoastX(z);
}

// A low wet-sand tongue at the west route seam. It keeps route transitions
// reliable while the surrounding half of the map remains shallow water.
export function blackBeachSandbarMask(x, z) {
  const coast = blackBeachCoastX(z);
  const bar = 1 - smoothstep(segmentDistance(x, z, -53, 0, coast + 5, 1.6), 4.6, 11.5);
  const endSoft = 1 - smoothstep(x, coast + 8, coast + 17);
  return clamp(bar * endSoft, 0, 1);
}

export function blackBeachDuneMask(x, z) {
  const d = blackBeachInlandDistance(x, z);
  const broad = smoothstep(d, 9, 38);
  const duneNoise = elevationNoise(x * 0.052 + 3, z * 0.048 - 8) * 0.5 + 0.5;
  const lobes = Math.max(
    gaussian(x, z, 20, -25, 14, 10),
    gaussian(x, z, 33, -6, 16, 12),
    gaussian(x, z, 22, 22, 18, 14),
  );
  return clamp(broad * (duneNoise * 0.45 + lobes * 0.72), 0, 1);
}

export function blackBeachHeight(x, z, { movementSurface = false } = {}) {
  const d = blackBeachInlandDistance(x, z);
  const sandbar = blackBeachSandbarMask(x, z);
  const dunes = blackBeachDuneMask(x, z);

  let y;
  if (d < 0) {
    // Broad, very shallow black-sand shelf. Even the far west side of this
    // map stays wadeable; swimming belongs to BLACK_BEACH_SURF.
    y = WATER_LEVEL - 0.08 + d * 0.028;
    y = Math.max(WATER_LEVEL - WADE_DEPTH + 0.18, y);
    y += surfaceNoise(x * 0.15 + 4, z * 0.17 - 6) * (movementSurface ? 0.018 : 0.055);
  } else {
    // Slow black-sand rise into low hillocks, intentionally shallower than the
    // north-facing Cormorant beach.
    y = -0.34 + 0.82 * (1 - Math.exp(-d * 0.055));
    y += smoothstep(d, 10, 44) * 0.72;
    y += smoothstep(x, 22, 54) * 0.58;
    y += dunes * (movementSurface ? 0.18 : 0.36);
  }

  if (sandbar > 0) {
    const barTarget = -0.22 + smoothstep(x, -50, -9) * 0.16
      + elevationNoise(x * 0.11 - 8, z * 0.13 + 2) * (movementSurface ? 0.015 : 0.04);
    y = lerp(y, barTarget, sandbar * 0.98);
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
    defaultSpawn: [16, 0, 0],
  },
};
