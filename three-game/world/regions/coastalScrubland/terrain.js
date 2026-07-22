import * as THREE from 'three';
import {
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  COASTAL_SCRUBLAND,
  coastalScrubBasaltExposure,
  coastalScrubPathInfo,
  coastalScrubSaltExposure,
  coastalScrubSeepMask,
  coastalScrubThicketStrength,
} from './path';

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

export function coastalScrublandHeight(x, z, { movementSurface = false } = {}) {
  const westShoulder = 1 - THREE.MathUtils.smoothstep(x, -48, -9);
  const coastwardFall = THREE.MathUtils.smoothstep(x, 20, 55);
  const broad = elevationNoise(x * 0.025 + 4.7, z * 0.023 - 8.4);
  const crossRoll = elevationNoise(x * 0.055 - 13.2, z * 0.049 + 6.8);
  const windRidges = Math.sin(x * 0.038 + z * 0.078 + 1.1) * 0.34
    + Math.sin(x * 0.071 - z * 0.043 - 0.7) * 0.21;
  const basalt = coastalScrubBasaltExposure(x, z);
  const seep = coastalScrubSeepMask(x, z);
  const path = coastalScrubPathInfo(x, z);
  const fractured = Math.max(0, crackNoise(x * 0.18 + 5, z * 0.17 - 7));
  const smallRelief = movementSurface
    ? elevationNoise(x * 0.16 - 3, z * 0.15 + 12) * 0.07 + terrainFineDetail(x, z) * 0.08
    : elevationNoise(x * 0.16 - 3, z * 0.15 + 12) * 0.2 + terrainFineDetail(x, z) * 0.48;

  let y = 3.05
    + westShoulder * 3.5
    - coastwardFall * 0.78
    + broad * 0.92
    + crossRoll * 0.46
    + windRidges
    + gaussian(x, z, -28, -29, 20, 18) * 0.72
    + gaussian(x, z, -35, 27, 18, 25) * 0.96
    - gaussian(x, z, 22, 20, 24, 19) * 0.42
    - seep * (0.3 + (terrainSurfaceNoise(x * 0.22, z * 0.2) * 0.5 + 0.5) * 0.16)
    + fractured * basalt * (movementSurface ? 0.1 : 0.34)
    + smallRelief;

  y -= path.tread * 0.13 + path.center * 0.035;
  return y;
}

export function coastalScrublandBiomeAt(x, z, y = coastalScrublandHeight(x, z)) {
  const path = coastalScrubPathInfo(x, z);
  if (path.tread > 0.48 || path.center > 0.3) return 'coastal-cinder-trail';
  if (path.shoulder > 0.38) return 'coastal-trail-shoulder';
  if (coastalScrubSeepMask(x, z) > 0.52) return 'dry-seep-basin';
  if (coastalScrubBasaltExposure(x, z) > 0.68) return 'coastal-basalt-shoulder';
  if (coastalScrubSaltExposure(x, z) > 0.58) return 'salt-scoured-scrub';
  if (coastalScrubThicketStrength(x, z) > 0.43) return 'wind-pruned-thicket';
  return y > 5.25 ? 'upland-dry-scrub' : 'open-coastal-scrub';
}

export function coastalScrublandColor(x, z, y) {
  const biome = coastalScrublandBiomeAt(x, z, y);
  const path = coastalScrubPathInfo(x, z);
  const soil = terrainSurfaceNoise(x * 0.48 + 5, z * 0.44 - 9) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.72 - 17, z * 1.54 + 3) * 0.5 + 0.5;
  const color = new THREE.Color('#716047');
  color.lerp(new THREE.Color('#92714d'), soil * 0.28);
  color.lerp(new THREE.Color('#4b4b3d'), coastalScrubBasaltExposure(x, z) * (0.12 + (1 - soil) * 0.22));
  color.lerp(new THREE.Color('#a38a62'), fine * 0.08);
  if (biome === 'dry-seep-basin') color.lerp(new THREE.Color('#69684a'), 0.42);
  if (biome === 'salt-scoured-scrub') color.lerp(new THREE.Color('#847c5c'), 0.34);
  if (biome === 'wind-pruned-thicket') color.lerp(new THREE.Color('#5c6744'), 0.3);
  if (biome === 'upland-dry-scrub') color.lerp(new THREE.Color('#6e7048'), 0.2);
  if (biome === 'coastal-basalt-shoulder') color.lerp(new THREE.Color('#41413a'), 0.48);
  if (biome === 'coastal-trail-shoulder') color.lerp(new THREE.Color('#8f764f'), 0.46 + path.shoulder * 0.16);
  if (biome === 'coastal-cinder-trail') color.lerp(new THREE.Color('#a46039'), 0.7 + path.center * 0.1);
  color.multiplyScalar(0.88 + soil * 0.08 + fine * 0.04);
  return color;
}

export function isCoastalScrublandWalkable(x, z, config) {
  const margin = 1.4;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const path = coastalScrubPathInfo(x, z);
  const step = 0.82;
  const left = coastalScrublandHeight(x - step, z, { movementSurface: true });
  const right = coastalScrublandHeight(x + step, z, { movementSurface: true });
  const back = coastalScrublandHeight(x, z - step, { movementSurface: true });
  const forward = coastalScrublandHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 1.02 || path.path > 0.18;
}

export const coastalScrublandRegion = {
  id: COASTAL_SCRUBLAND,
  aliases: ['coastal-scrubland'],
  terrain: {
    height: coastalScrublandHeight,
    movementHeight: (x, z) => coastalScrublandHeight(x, z, { movementSurface: true }),
    biomeAt: coastalScrublandBiomeAt,
    color: coastalScrublandColor,
    isWalkable: isCoastalScrublandWalkable,
    defaultSpawn: [8, 0, -10],
    defaultFacing: [-0.55, 0, 0.84],
    entrySpawns: {
      north: [-10, 0, -46.5],
      south: [-33, 0, 46.5],
    },
    entryFacings: {
      north: [-0.12, 0, 1],
      south: [0.55, 0, -0.84],
    },
  },
};
