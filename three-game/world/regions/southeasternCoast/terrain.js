import * as THREE from 'three';
import {
  WATER_LEVEL,
  WADE_DEPTH,
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  SOUTHEASTERN_COAST,
  southeasternCoastBasaltShelfMask,
  southeasternCoastInlandDistance,
  southeasternCoastPathInfo,
  southeasternCoastSaltExposure,
  southeasternCoastScrubStrength,
  southeasternCoastWetShoreMask,
} from './path';
import {
  EL_MIRADOR_SOUTHEASTERN_COAST_SEAM,
  SOUTHEASTERN_COAST_SHALLOW_SURF_SEAM,
  WATKINS_SOUTHEASTERN_COAST_SEAM,
} from '../../routeSeams';

export function southeasternCoastHeight(x, z, { movementSurface = false } = {}) {
  const inlandDistance = southeasternCoastInlandDistance(x, z);
  const basalt = southeasternCoastBasaltShelfMask(x, z);
  const path = southeasternCoastPathInfo(x, z);
  const broad = elevationNoise(x * 0.035 + 8, z * 0.037 - 5);

  if (inlandDistance < 0) {
    const offshore = -inlandDistance;
    const floorNoise = elevationNoise(x * 0.085 - 3, z * 0.078 + 9) * 0.08;
    const shelfDrop = THREE.MathUtils.smoothstep(offshore, 13, 29) * 0.26;
    const fractured = Math.max(0, crackNoise(x * 0.2 + 6, z * 0.23 - 4));
    const seabed = WATER_LEVEL + 0.12 - offshore * 0.034 - shelfDrop + floorNoise
      + basalt * (0.1 + fractured * (movementSurface ? 0.04 : 0.16));
    return Math.max(-3.1, seabed);
  }

  const inlandRise = 1.72 * (1 - Math.exp(-inlandDistance * 0.075));
  const rearRise = THREE.MathUtils.smoothstep(inlandDistance, 17, 62) * 1.0;
  const salt = southeasternCoastSaltExposure(x, z);
  const scrub = southeasternCoastScrubStrength(x, z);
  const rockFracture = Math.max(0, crackNoise(x * 0.19 - 7, z * 0.22 + 4));
  const detail = terrainFineDetail(x, z) * (movementSurface ? 0.06 : 0.25)
    + terrainSurfaceNoise(x * 0.72 + 2, z * 0.68 - 8) * (movementSurface ? 0.02 : 0.09);

  let y = WATER_LEVEL + 0.12
    + inlandRise
    + rearRise
    + broad * (0.12 + THREE.MathUtils.smoothstep(inlandDistance, 7, 38) * 0.42)
    + basalt * rockFracture * (movementSurface ? 0.06 : 0.22)
    + detail * (0.5 + scrub * 0.5);
  y -= salt * THREE.MathUtils.smoothstep(inlandDistance, 5, 24) * 0.1;
  y -= path.tread * 0.11 + path.center * 0.025;
  return y;
}

export function southeasternCoastBiomeAt(x, z, y = southeasternCoastHeight(x, z)) {
  if (y < WATER_LEVEL - WADE_DEPTH) return 'open-water-seabed';
  if (y < WATER_LEVEL) return southeasternCoastBasaltShelfMask(x, z) > 0.34
    ? 'submerged-basalt'
    : 'shallow-rocky-water';
  const path = southeasternCoastPathInfo(x, z);
  if (path.tread > 0.5 || path.center > 0.32) return 'coastal-cinder-trail';
  if (southeasternCoastWetShoreMask(x, z) > 0.28) return 'wet-basalt-swash';
  if (southeasternCoastBasaltShelfMask(x, z) > 0.42) return 'broken-basalt-shelf';
  if (southeasternCoastSaltExposure(x, z) > 0.58) return 'salt-scoured-coast';
  if (southeasternCoastScrubStrength(x, z) > 0.5) return 'wind-pruned-scrub';
  return 'open-dry-scrub';
}

export function southeasternCoastColor(x, z, y) {
  const biome = southeasternCoastBiomeAt(x, z, y);
  const broad = terrainSurfaceNoise(x * 0.31 + 4, z * 0.29 - 6) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.3 - 9, z * 1.2 + 3) * 0.5 + 0.5;
  const color = new THREE.Color('#75684d');
  if (biome === 'open-water-seabed') color.set('#173b42');
  else if (biome === 'shallow-rocky-water') color.set('#4b7169');
  else if (biome === 'submerged-basalt') color.set('#294b49');
  else if (biome === 'wet-basalt-swash') color.set('#202a28');
  else if (biome === 'broken-basalt-shelf') color.set('#393a32');
  else if (biome === 'salt-scoured-coast') color.set('#756f55');
  else if (biome === 'wind-pruned-scrub') color.set('#5f6847');
  else if (biome === 'coastal-cinder-trail') color.set('#8c6745');
  else color.set('#77674a');
  if (biome.includes('basalt')) color.lerp(new THREE.Color('#505047'), broad * 0.12);
  color.multiplyScalar(0.89 + broad * 0.08 + fine * 0.03);
  return color;
}

export function isSoutheasternCoastWalkable(x, z, config) {
  const margin = 1.3;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const y = southeasternCoastHeight(x, z, { movementSurface: true });
  if (y < WATER_LEVEL - WADE_DEPTH + 0.08) return false;
  const path = southeasternCoastPathInfo(x, z);
  const step = 0.82;
  const left = southeasternCoastHeight(x - step, z, { movementSurface: true });
  const right = southeasternCoastHeight(x + step, z, { movementSurface: true });
  const back = southeasternCoastHeight(x, z - step, { movementSurface: true });
  const forward = southeasternCoastHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 0.9 || path.path > 0.18;
}

export const southeasternCoastRegion = {
  id: SOUTHEASTERN_COAST,
  aliases: ['southeastern-coast', 'floreana-southeast-coast'],
  terrain: {
    height: southeasternCoastHeight,
    movementHeight: (x, z) => southeasternCoastHeight(x, z, { movementSurface: true }),
    biomeAt: southeasternCoastBiomeAt,
    color: southeasternCoastColor,
    isWalkable: isSoutheasternCoastWalkable,
    defaultSpawn: [2, 0, -10],
    defaultFacing: [0.72, 0, 0.69],
    defaultCameraFacing: [0.72, 0, 0.69],
    entrySpawns: {
      north: [EL_MIRADOR_SOUTHEASTERN_COAST_SEAM.target.point[0], 0, -46],
      west: [-52, 0, WATKINS_SOUTHEASTERN_COAST_SEAM.target.point[1]],
      east: [52, 0, SOUTHEASTERN_COAST_SHALLOW_SURF_SEAM.source.point[1]],
    },
    entryFacings: {
      north: [0, 0, 1],
      west: [1, 0, 0.08],
      east: [-1, 0, -0.06],
    },
    entryCameraFacings: {
      north: [0.42, 0, 0.91],
      west: [0.92, 0, 0.18],
      east: [-0.95, 0, -0.08],
    },
  },
};
