import * as THREE from 'three';
import {
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  EL_MIRADOR,
  elMiradorBasaltExposure,
  elMiradorCliffFaceMask,
  elMiradorCoastDistance,
  elMiradorGullyMask,
  elMiradorPathInfo,
  elMiradorRimMask,
  elMiradorShelterMask,
  elMiradorSummitMask,
  elMiradorWindExposure,
} from './path';

export function elMiradorHeight(x, z, { movementSurface = false } = {}) {
  const coastDistance = elMiradorCoastDistance(x, z);
  if (coastDistance < 0) {
    const deepWater = Math.max(0, -coastDistance - 3.5);
    return Math.max(-5.2, -1.18 + coastDistance * 0.34 - deepWater * 0.14);
  }

  const climb = THREE.MathUtils.smoothstep(z, -44, 34);
  const eastwardRise = THREE.MathUtils.smoothstep(x, -44, 28);
  const summit = elMiradorSummitMask(x, z);
  const gully = elMiradorGullyMask(x, z);
  const cliff = elMiradorCliffFaceMask(x, z);
  const path = elMiradorPathInfo(x, z);
  const broad = elevationNoise(x * 0.03 + 10, z * 0.032 - 6);
  const medium = elevationNoise(x * 0.074 - 13, z * 0.068 + 9);
  const fractured = Math.max(0, crackNoise(x * 0.15 + 2, z * 0.13 - 11));
  const southDescent = THREE.MathUtils.smoothstep(z, 35, 48);
  const cliffDrop = 11.6 * Math.exp(-coastDistance * 0.58);
  const faceStrata = (
    Math.sin(coastDistance * 2.3 + z * 0.18)
    + Math.sin(coastDistance * 4.7 - z * 0.1) * 0.42
  ) * cliff;
  const smallRelief = movementSurface
    ? elevationNoise(x * 0.16 - 3, z * 0.15 + 8) * 0.06 + terrainFineDetail(x, z) * 0.06
    : elevationNoise(x * 0.16 - 3, z * 0.15 + 8) * 0.17 + terrainFineDetail(x, z) * 0.4;

  let y = 3.0
    + climb * 3.45
    + eastwardRise * 1.15
    + summit * 2.55
    + broad * 0.88
    + medium * 0.46
    - southDescent * 2.05
    - gully * (0.58 + fractured * (movementSurface ? 0.08 : 0.32))
    - cliffDrop
    + faceStrata * (movementSurface ? 0.05 : 0.24)
    + fractured * elMiradorBasaltExposure(x, z) * (movementSurface ? 0.07 : 0.26)
    + smallRelief;

  // The old foot route is a worn bench following the land, not a floating
  // shelf. Movement samples omit the higher-frequency erosion and grit.
  y -= path.tread * 0.2 + path.center * 0.06;
  return Math.max(-5.2, y);
}

export function elMiradorBiomeAt(x, z, y = elMiradorHeight(x, z)) {
  if (y < WATER_LEVEL - 0.12) return 'open-water-bed';
  const path = elMiradorPathInfo(x, z);
  if (path.tread > 0.48 || path.center > 0.28) return 'red-dirt-path';
  if (path.shoulder > 0.36) return 'path-shoulder';
  if (elMiradorCliffFaceMask(x, z) > 0.48) return 'mirador-basalt-cliff';
  if (elMiradorRimMask(x, z) > 0.42) return 'wind-scoured-overlook-rim';
  if (elMiradorSummitMask(x, z) > 0.64 && y > 7.2) return 'mirador-summit-grass';
  if (elMiradorGullyMask(x, z) > 0.46) return 'eroded-highland-gully';
  if (elMiradorShelterMask(x, z) > 0.38) return 'sheltered-highland-grass';
  const exposed = terrainSurfaceNoise(x * 0.46 + 4.0, z * 0.46 - 8.0);
  if (elMiradorBasaltExposure(x, z) > 0.6 || exposed > 0.3) return 'stony-highland-slope';
  return 'dry-highland-grass';
}

export function elMiradorColor(x, z, y) {
  const biome = elMiradorBiomeAt(x, z, y);
  const path = elMiradorPathInfo(x, z);
  const noise = terrainSurfaceNoise(x * 0.52 + 3.0, z * 0.52 - 2.0) * 0.5 + 0.5;
  const color = new THREE.Color('#6b7048');
  color.lerp(new THREE.Color('#9b8c50'), noise * 0.26);
  color.lerp(new THREE.Color('#4c613b'), (1 - noise) * 0.2);
  if (biome === 'open-water-bed') color.set('#243b3c');
  if (biome === 'mirador-summit-grass') color.lerp(new THREE.Color('#aa9e59'), 0.42);
  if (biome === 'stony-highland-slope') color.lerp(new THREE.Color('#887a5c'), 0.26);
  if (biome === 'mirador-basalt-cliff') color.lerp(new THREE.Color('#303832'), 0.72);
  if (biome === 'wind-scoured-overlook-rim') color.lerp(new THREE.Color('#5b5d49'), 0.48);
  if (biome === 'eroded-highland-gully') color.lerp(new THREE.Color('#765b43'), 0.46);
  if (biome === 'sheltered-highland-grass') color.lerp(new THREE.Color('#536a3f'), 0.34);
  if (biome === 'path-shoulder') color.lerp(new THREE.Color('#7e7351'), 0.48 + path.shoulder * 0.18);
  if (biome === 'red-dirt-path') {
    color.lerp(new THREE.Color('#a7582b'), 0.68 + path.center * 0.12);
    color.lerp(new THREE.Color('#d0b072'), noise * 0.1);
  }
  color.multiplyScalar(0.88 + noise * 0.12);
  return color;
}

export function isElMiradorWalkable(x, z, config) {
  const margin = 1.6;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  if (elMiradorCoastDistance(x, z) < 6.2) return false;
  const path = elMiradorPathInfo(x, z);
  const step = 0.85;
  const left = elMiradorHeight(x - step, z, { movementSurface: true });
  const right = elMiradorHeight(x + step, z, { movementSurface: true });
  const back = elMiradorHeight(x, z - step, { movementSurface: true });
  const forward = elMiradorHeight(x, z + step, { movementSurface: true });
  const slope = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return slope < 0.96 || path.path > 0.2;
}

export const elMiradorRegion = {
  id: EL_MIRADOR,
  aliases: ['el-mirador'],
  terrain: {
    height: elMiradorHeight,
    movementHeight: (x, z) => elMiradorHeight(x, z, { movementSurface: true }),
    biomeAt: elMiradorBiomeAt,
    color: elMiradorColor,
    isWalkable: isElMiradorWalkable,
    defaultSpawn: [21, 0, 24],
    defaultFacing: [0.77, 0, -0.64],
    entrySpawns: {
      north: [-34, 0, -45.5],
      west: [-49.5, 0, 5.58],
      south: [24, 0, 45.5],
    },
    entryFacings: {
      north: [0.2, 0, 0.98],
      west: [0.98, 0, -0.12],
      south: [0.12, 0, -1],
    },
  },
};
