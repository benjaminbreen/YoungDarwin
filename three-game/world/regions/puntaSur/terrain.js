import * as THREE from 'three';
import {
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  PUNTA_SUR,
  puntaSurBasaltExposure,
  puntaSurCoastDistance,
  puntaSurCrownMask,
  puntaSurFaceMask,
  puntaSurGullyMask,
  puntaSurPathInfo,
  puntaSurRedEarthMask,
  puntaSurRimMask,
  puntaSurRockRibMask,
  puntaSurShelterMask,
  puntaSurSprayExposure,
  puntaSurWaterEntryMask,
} from './path';

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

export function puntaSurHeight(x, z, { movementSurface = false } = {}) {
  const coastDistance = puntaSurCoastDistance(x, z);
  if (coastDistance < 0) {
    const deepWater = Math.max(0, -coastDistance - 4.5);
    const seabed = -1.18 + coastDistance * 0.34 - deepWater * 0.13;
    const westStack = gaussian(x, z, -27, 39, 4.8, 5.4);
    const eastStack = gaussian(x, z, 25, 42, 3.8, 4.7);
    const stack = Math.max(westStack, eastStack * 0.86);
    const shelfBand = Math.exp(-Math.pow((coastDistance + 2.1) / 1.35, 2));
    const waveCutShelf = Math.max(
      Math.exp(-Math.pow((x + 10) / 5.2, 2)),
      Math.exp(-Math.pow((x - 13) / 4.8, 2)) * 0.88,
    ) * shelfBand;
    return Math.max(-5.2, seabed
      + stack * (9.4 + Math.max(0, crackNoise(x * 0.28, z * 0.3)) * 0.8)
      + waveCutShelf * 2.55);
  }

  const path = puntaSurPathInfo(x, z);
  const face = puntaSurFaceMask(x, z);
  const rim = puntaSurRimMask(x, z);
  const crown = puntaSurCrownMask(x, z);
  const gully = puntaSurGullyMask(x, z);
  const redEarth = puntaSurRedEarthMask(x, z);
  const rockRib = puntaSurRockRibMask(x, z);
  const waterEntry = puntaSurWaterEntryMask(x, z);
  const coastalVariation = 0.9 + elevationNoise(x * 0.071 - 5, z * 0.052 + 3) * 0.13;
  const cliffRise = 8.05 * (1 - Math.exp(-coastDistance * 0.43))
    * coastalVariation * (1 - waterEntry * 0.72);
  const northDescent = (1 - THREE.MathUtils.smoothstep(z, -44, -20)) * 2.7;
  const westDescent = (1 - THREE.MathUtils.smoothstep(x, -47, -31)) * 1.45;
  const eastDescent = THREE.MathUtils.smoothstep(x, 33, 47) * 1.35;
  const broad = elevationNoise(x * 0.026 + 4, z * 0.025 - 8);
  const crossRoll = elevationNoise(x * 0.064 - 10, z * 0.058 + 6);
  const flowWarp = Math.sin(x * 0.13 + 0.7) * 0.22 + Math.sin(x * 0.049 - 1.5) * 0.3;
  const strata = Math.sin(coastDistance * 1.82 + flowWarp) * face
    + Math.sin(coastDistance * 3.7 - x * 0.052) * face * 0.38;
  const fractured = Math.max(0, crackNoise(x * 0.18 + 7, z * 0.2 - 5));
  const gullyCut = gully * (0.76 + THREE.MathUtils.smoothstep(z, -8, 28) * 0.7);
  const lookoutBench = gaussian(x, z, 1, 25, 10, 8) * rim;
  const ribLift = rockRib * (1.15 + face * 0.8) * (1 - waterEntry);
  const erosionCut = redEarth * (0.12 + Math.max(0, terrainSurfaceNoise(x * 0.19, z * 0.17)) * 0.2);
  const smallRelief = movementSurface
    ? elevationNoise(x * 0.15 - 4, z * 0.14 + 9) * 0.06 + terrainFineDetail(x, z) * 0.05
    : elevationNoise(x * 0.15 - 4, z * 0.14 + 9) * 0.18 + terrainFineDetail(x, z) * 0.4;

  let y = -0.7
    + cliffRise
    - northDescent
    - westDescent
    - eastDescent
    + crown * 1.28
    + broad * 0.62
    + crossRoll * 0.46
    + ribLift
    - gullyCut
    - erosionCut
    - lookoutBench * 0.48
    + strata * (movementSurface ? 0.04 : 0.23)
    + fractured * puntaSurBasaltExposure(x, z) * (movementSurface ? 0.06 : 0.26)
    + smallRelief;
  y -= path.tread * 0.16 + path.center * 0.04;
  return y;
}

export function puntaSurBiomeAt(x, z, y = puntaSurHeight(x, z)) {
  if (y < WATER_LEVEL - 0.12) return 'punta-sur-seabed';
  const path = puntaSurPathInfo(x, z);
  if (path.tread > 0.48 || path.center > 0.3) return 'rainbow-cape-trail';
  if (path.shoulder > 0.36) return 'cape-trail-shoulder';
  if (puntaSurFaceMask(x, z) > 0.46) return 'spray-darkened-sea-cliff';
  if (puntaSurRimMask(x, z) > 0.42) return 'fractured-southern-rim';
  if (puntaSurGullyMask(x, z) > 0.38) return 'rain-cut-basalt-gully';
  if (puntaSurRockRibMask(x, z) > 0.52) return 'weathered-basalt-rib';
  if (puntaSurRedEarthMask(x, z) > 0.47) return 'rust-red-eroded-earth';
  if (puntaSurCrownMask(x, z) > 0.64) return 'wind-combed-cape-grass';
  if (puntaSurShelterMask(x, z) > 0.35) return 'sheltered-southern-scrub';
  if (puntaSurSprayExposure(x, z) > 0.45) return 'salt-wet-headland';
  return 'southern-promontory-scrub';
}

export function puntaSurColor(x, z, y) {
  const biome = puntaSurBiomeAt(x, z, y);
  const path = puntaSurPathInfo(x, z);
  const broad = terrainSurfaceNoise(x * 0.36 + 4, z * 0.34 - 7) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.34 - 12, z * 1.29 + 4) * 0.5 + 0.5;
  const color = new THREE.Color('#56604d');
  color.lerp(new THREE.Color('#73715b'), broad * 0.24);
  color.lerp(new THREE.Color('#363c38'), puntaSurBasaltExposure(x, z) * 0.38);
  if (biome === 'punta-sur-seabed') color.set('#18363a');
  if (biome === 'spray-darkened-sea-cliff') color.lerp(new THREE.Color('#202a2a'), 0.72);
  if (biome === 'fractured-southern-rim') color.lerp(new THREE.Color('#424943'), 0.5);
  if (biome === 'rain-cut-basalt-gully') color.lerp(new THREE.Color('#394a3e'), 0.48);
  if (biome === 'weathered-basalt-rib') color.lerp(new THREE.Color('#4b4038'), 0.56);
  if (biome === 'rust-red-eroded-earth') color.lerp(new THREE.Color('#aa603d'), 0.7);
  if (biome === 'wind-combed-cape-grass') color.lerp(new THREE.Color('#6f8253'), 0.44);
  if (biome === 'sheltered-southern-scrub') color.lerp(new THREE.Color('#4e704d'), 0.38);
  if (biome === 'rainbow-cape-trail') color.lerp(new THREE.Color('#9b5939'), 0.66 + path.center * 0.12);
  if (biome === 'cape-trail-shoulder') color.lerp(new THREE.Color('#79664d'), 0.42);
  color.multiplyScalar(0.86 + broad * 0.1 + fine * 0.04);
  return color;
}

export function isPuntaSurWalkable(x, z, config) {
  const margin = 1.35;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const coastDistance = puntaSurCoastDistance(x, z);
  const waterEntry = puntaSurWaterEntryMask(x, z);
  if (coastDistance < (waterEntry > 0.34 ? 0.8 : 5.2)) return false;
  const path = puntaSurPathInfo(x, z);
  const step = 0.78;
  const left = puntaSurHeight(x - step, z, { movementSurface: true });
  const right = puntaSurHeight(x + step, z, { movementSurface: true });
  const back = puntaSurHeight(x, z - step, { movementSurface: true });
  const forward = puntaSurHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < (waterEntry > 0.34 ? 1.12 : 0.94) || path.path > 0.2;
}

export const puntaSurRegion = {
  id: PUNTA_SUR,
  aliases: ['punta-sur'],
  terrain: {
    height: puntaSurHeight,
    movementHeight: (x, z) => puntaSurHeight(x, z, { movementSurface: true }),
    biomeAt: puntaSurBiomeAt,
    color: puntaSurColor,
    isWalkable: isPuntaSurWalkable,
    defaultSpawn: [4, 0, 17],
    defaultFacing: [0, 0, 1],
    defaultCameraFacing: [0, 0, 1],
    entrySpawns: {
      north: [-8.6, 0, -42.5],
      west: [-45.5, 0, -7.35],
      east: [45.5, 0, 18],
    },
    entryFacings: {
      north: [0.25, 0, 0.97],
      west: [1, 0, 0.12],
      east: [-1, 0, -0.08],
    },
    entryCameraFacings: {
      north: [0.25, 0, 0.97],
      west: [1, 0, 0.12],
      east: [-1, 0, -0.08],
    },
  },
};
