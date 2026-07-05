import * as THREE from 'three';
import {
  WADE_DEPTH,
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  ellipseDistance,
  pointSegmentDistance,
  smoothMin,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';

export const PUNTA_CORMORANT = 'PUNTA_CORMORANT';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function puntaCormorantBeachLineZ(x) {
  return 26.5 + Math.sin(x * 0.052 - 0.3) * 2.8 + Math.sin(x * 0.018 + 1.7) * 1.7;
}

export function puntaCormorantNorthShoreZ(x) {
  return -33.5 + Math.sin(x * 0.055 + 0.9) * 2.2 + Math.sin(x * 0.021 - 1.4) * 1.35;
}

export function puntaCormorantNorthSeaMask(x, z) {
  const d = z - puntaCormorantNorthShoreZ(x);
  return clamp01(1 - THREE.MathUtils.smoothstep(d, -0.8, 2.5));
}

export function puntaCormorantNorthBeachMask(x, z) {
  const d = z - puntaCormorantNorthShoreZ(x);
  const beach = THREE.MathUtils.smoothstep(d, -1.0, 2.0) * (1 - THREE.MathUtils.smoothstep(d, 8.0, 14.0));
  const centralPocket = 1 - THREE.MathUtils.smoothstep(Math.abs(x), 42, 55);
  return clamp01(beach * centralPocket);
}

export function puntaCormorantLagoonField(x, z) {
  const west = ellipseDistance(x, z, 39, 23, -17, -4);
  const east = ellipseDistance(x, z, 34, 21, 18, -1);
  const south = ellipseDistance(x, z, 31, 15, -1, 13);
  const northPocket = ellipseDistance(x, z, 28, 12, 6, -17);
  return smoothMin(smoothMin(smoothMin(west, east, 0.34), south, 0.3), northPocket, 0.26);
}

export function puntaCormorantStandingWaterMask(x, z) {
  const lagoon = puntaCormorantLagoonField(x, z);
  const beachFade = 1 - THREE.MathUtils.smoothstep(z, 22, 30);
  const northShoreClear = 1 - Math.max(puntaCormorantNorthSeaMask(x, z), puntaCormorantNorthBeachMask(x, z)) * 0.96;
  return clamp01((1 - THREE.MathUtils.smoothstep(lagoon, 0.98, 1.16)) * beachFade * northShoreClear);
}

export function puntaCormorantLagoonEdgeMask(x, z) {
  const lagoon = puntaCormorantLagoonField(x, z);
  const nearWater = THREE.MathUtils.smoothstep(lagoon, 0.92, 1.12);
  const outerMud = 1 - THREE.MathUtils.smoothstep(lagoon, 1.34, 1.72);
  return clamp01(nearWater * outerMud);
}

export function puntaCormorantSwampMask(x, z) {
  const water = puntaCormorantStandingWaterMask(x, z);
  const edge = puntaCormorantLagoonEdgeMask(x, z);
  const interior = 1 - THREE.MathUtils.smoothstep(z, 16, 31);
  const broken = 0.72 + terrainSurfaceNoise(x * 0.42 - 6, z * 0.38 + 4) * 0.28;
  return clamp01(Math.max(edge, water * 0.44) * interior * broken);
}

export function puntaCormorantRimMask(x, z) {
  const north = THREE.MathUtils.smoothstep(-z, 27, 46);
  const east = THREE.MathUtils.smoothstep(x, 40, 54);
  const west = THREE.MathUtils.smoothstep(-x, 43, 56);
  const northShoreOpening = Math.max(puntaCormorantNorthSeaMask(x, z), puntaCormorantNorthBeachMask(x, z));
  const centralNorth = 1 - THREE.MathUtils.smoothstep(Math.abs(x), 34, 52);
  const broken = 0.76 + terrainSurfaceNoise(x * 0.2 + 8, z * 0.23 - 5) * 0.24;
  const northHeadland = north * (1 - northShoreOpening * centralNorth * 0.92) * (0.28 + (1 - centralNorth) * 0.72);
  return clamp01(Math.max(northHeadland, Math.max(east * 0.68, west * 0.54)) * broken);
}

export function puntaCormorantTrailDistance(x, z) {
  const points = [[-40, 37], [-28, 31], [-13, 27], [5, 27.5], [24, 31], [39, 37]];
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    best = Math.min(best, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  return best + terrainSurfaceNoise(x * 0.56 + 3, z * 0.52 - 8) * 0.28;
}

export function puntaCormorantBeachMask(x, z) {
  const beach = THREE.MathUtils.smoothstep(z - puntaCormorantBeachLineZ(x), -2, 8);
  const waterClear = 1 - puntaCormorantStandingWaterMask(x, z) * 0.85;
  return clamp01(beach * waterClear);
}

export function puntaCormorantHeight(x, z, { movementSurface = false } = {}) {
  const lagoon = puntaCormorantLagoonField(x, z);
  const standingWater = puntaCormorantStandingWaterMask(x, z);
  const lagoonEdge = puntaCormorantLagoonEdgeMask(x, z);
  const swamp = puntaCormorantSwampMask(x, z);
  const rim = puntaCormorantRimMask(x, z);
  const beach = puntaCormorantBeachMask(x, z);
  const northSea = puntaCormorantNorthSeaMask(x, z);
  const northBeach = puntaCormorantNorthBeachMask(x, z);
  const northD = z - puntaCormorantNorthShoreZ(x);
  const northDeep = 1 - THREE.MathUtils.smoothstep(northD, -10.5, -3.0);
  const trail = 1 - THREE.MathUtils.smoothstep(puntaCormorantTrailDistance(x, z), 1.35, 4.9);
  const fine = terrainFineDetail(x, z) * (movementSurface ? 0.035 : 0.16);
  const broad = elevationNoise(x * 0.032 + 2, z * 0.033 - 7);
  const core = 1 - THREE.MathUtils.smoothstep(lagoon, 0.34, 0.94);

  let y = -0.22 + broad * 0.24;
  y += beach * (0.48 + terrainSurfaceNoise(x * 0.4, z * 0.4) * 0.08);
  y -= lagoonEdge * 0.2;
  y -= swamp * 0.08;
  y -= trail * 0.08;
  y += rim * (1.08 + Math.abs(crackNoise(x * 0.22 - 4, z * 0.24 + 8)) * (movementSurface ? 0.08 : 0.42));

  if (standingWater > 0.02) {
    const ripple = terrainSurfaceNoise(x * 0.58 - 12, z * 0.54 + 3) * (movementSurface ? 0.025 : 0.075);
    const bed = WATER_LEVEL - 0.31 - core * 0.32 - lagoonEdge * 0.06 + ripple;
    y = THREE.MathUtils.lerp(y, bed, standingWater);
  }

  if (northSea > 0.02) {
    const seaRipple = terrainSurfaceNoise(x * 0.34 + 9, z * 0.3 - 2) * (movementSurface ? 0.018 : 0.055);
    const seabed = THREE.MathUtils.lerp(WATER_LEVEL - 0.34, WATER_LEVEL - 1.34, northDeep) + seaRipple;
    y = THREE.MathUtils.lerp(y, seabed, northSea);
  }

  if (northBeach > 0.02) {
    const beachRise = THREE.MathUtils.smoothstep(northD, 1.5, 11.0);
    const beachNoise = terrainSurfaceNoise(x * 0.38 - 4, z * 0.42 + 7) * (movementSurface ? 0.028 : 0.075);
    const beachY = WATER_LEVEL + 0.08 + beachRise * 0.38 + beachNoise;
    y = THREE.MathUtils.lerp(y, beachY, northBeach);
  }

  y += fine * (1 - standingWater * 0.62);
  return THREE.MathUtils.clamp(y, WATER_LEVEL - WADE_DEPTH + 0.12, 2.45);
}

export function puntaCormorantBiomeAt(x, z, y = puntaCormorantHeight(x, z)) {
  const standingWater = puntaCormorantStandingWaterMask(x, z);
  const lagoon = puntaCormorantLagoonField(x, z);
  const swamp = puntaCormorantSwampMask(x, z);
  const rim = puntaCormorantRimMask(x, z);
  const trail = puntaCormorantTrailDistance(x, z);
  const beach = puntaCormorantBeachMask(x, z);
  const northSea = puntaCormorantNorthSeaMask(x, z);
  const northBeach = puntaCormorantNorthBeachMask(x, z);

  if (northSea > 0.36 && y < WATER_LEVEL - 0.04) return 'north-shore-water';
  if (northBeach > 0.34) return 'green-beach';
  if (standingWater > 0.34 && y < WATER_LEVEL - 0.06) return 'brackish-lagoon';
  if (lagoon < 1.52 || swamp > 0.38) return 'wet-mud';
  if (trail < 3.2) return 'olivine-trail';
  if (beach > 0.42) return 'green-beach';
  if (rim > 0.52 && z < -24) return 'wet-basalt';
  if (rim > 0.42) return 'tuff-rim';
  return 'salt-scrub';
}

export function puntaCormorantColor(x, z, y) {
  const biome = puntaCormorantBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color('#6f7547');
  if (biome === 'brackish-lagoon') color.set('#405f52');
  else if (biome === 'north-shore-water') {
    color.set('#3f9e9b');
    color.lerp(new THREE.Color('#0d5261'), puntaCormorantNorthSeaMask(x, z) * 0.34);
  }
  else if (biome === 'wet-mud') color.set('#3f4532');
  else if (biome === 'olivine-trail') color.set('#867f4d');
  else if (biome === 'green-beach') color.set('#93915b');
  else if (biome === 'wet-basalt') color.set('#26231d');
  else if (biome === 'tuff-rim') color.set('#715c43');
  else color.set('#65754a');
  color.lerp(new THREE.Color('#243826'), Math.max(0, -noise) * 0.2);
  color.lerp(new THREE.Color('#a59a61'), Math.max(0, noise) * 0.16);
  color.multiplyScalar(0.9 + noise * 0.08);
  return color;
}

export function isPuntaCormorantWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  if (!inBounds) return false;
  const y = puntaCormorantHeight(x, z, { movementSurface: true });
  if (y <= WATER_LEVEL - WADE_DEPTH + 0.05) return false;
  if (puntaCormorantRimMask(x, z) > 0.84 && z < -37) return false;
  return true;
}

export const puntaCormorantRegion = {
  id: PUNTA_CORMORANT,
  aliases: ['punta-cormorant'],
  terrain: {
    height: puntaCormorantHeight,
    movementHeight: (x, z) => puntaCormorantHeight(x, z, { movementSurface: true }),
    biomeAt: puntaCormorantBiomeAt,
    color: puntaCormorantColor,
    standingWaterMask: puntaCormorantStandingWaterMask,
    isWalkable: isPuntaCormorantWalkable,
    defaultSpawn: [0, 0, 38],
  },
};
