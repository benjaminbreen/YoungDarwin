import * as THREE from 'three';
import {
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  POST_SCRUB_RISE,
  scrubRiseBasaltExposure,
  scrubRisePathInfo,
  scrubRiseThicketStrength,
  scrubRiseWashMask,
} from './path';

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

function organicRelief(x, z) {
  // Overlapping swells and saddles keep the overall inland climb rolling at
  // every scale. There are no level terraces or clamped plateaus here.
  const westLowerSwell = gaussian(x, z, -31, -35, 22, 21) * 1.05;
  const eastLowerSaddle = gaussian(x, z, 19, -29, 19, 17) * -0.72;
  const westMiddleKnoll = gaussian(x, z, -24, -1, 20, 25) * 1.28;
  const eastMiddleSwell = gaussian(x, z, 29, 7, 22, 23) * 1.08;
  const forkSaddle = gaussian(x, z, 2, 19, 18, 14) * -0.54;
  const southShoulder = gaussian(x, z, -8, 41, 30, 17) * 0.94;
  return westLowerSwell + eastLowerSaddle + westMiddleKnoll + eastMiddleSwell + forkSaddle + southShoulder;
}

function smallScaleRelief(x, z, movementSurface) {
  // Uneven volcanic soil accumulates in shallow hummocks and eroded rills.
  // Movement receives a muted version so the rendered ground has convincing
  // relief without making the player bob over every small surface change.
  const hummocks = elevationNoise(x * 0.165 - 24.2, z * 0.148 + 16.7);
  const crossHummocks = elevationNoise(x * 0.255 + 8.4, z * 0.225 - 21.3);
  const rills = terrainSurfaceNoise(x * 1.7 + 11.0, z * 1.48 - 8.0);
  const granular = terrainFineDetail(x, z);
  if (movementSurface) {
    return hummocks * 0.075 + crossHummocks * 0.035 + rills * 0.018 + granular * 0.055;
  }
  return hummocks * 0.19 + crossHummocks * 0.085 + rills * 0.07 + granular * 0.62;
}

export function postScrubRiseHeight(x, z, { movementSurface = false } = {}) {
  const inlandProgress = THREE.MathUtils.clamp((z + 54) / 108, 0, 1);
  const broad = elevationNoise(x * 0.021 + 7.2, z * 0.02 - 4.7);
  const crossRoll = elevationNoise(x * 0.041 - 12.6, z * 0.038 + 9.4);
  const medium = elevationNoise(x * 0.083 + 19.0, z * 0.074 - 13.0);
  const longWave = Math.sin(x * 0.035 + z * 0.052 + 0.8) * 0.52
    + Math.sin(x * 0.061 - z * 0.029 - 1.1) * 0.31;
  const wash = scrubRiseWashMask(x, z);
  const path = scrubRisePathInfo(x, z);
  const basalt = scrubRiseBasaltExposure(x, z);
  const fractured = Math.max(0, crackNoise(x * 0.17 + 3, z * 0.15 - 7));

  let y = 3.05
    + inlandProgress * 4.45
    + broad * 1.38
    + crossRoll * 0.76
    + medium * 0.38
    + longWave
    + organicRelief(x, z)
    - wash * (0.38 + (terrainSurfaceNoise(x * 0.2, z * 0.2) * 0.5 + 0.5) * 0.22)
    + fractured * basalt * (movementSurface ? 0.12 : 0.38)
    + smallScaleRelief(x, z, movementSurface);

  // The trail is worn into the rolling surface but follows it rather than
  // cutting a flat bench through the hillside.
  y -= path.tread * 0.12 + path.center * 0.035;
  return y;
}

export function postScrubRiseBiomeAt(x, z, y = postScrubRiseHeight(x, z)) {
  const path = scrubRisePathInfo(x, z);
  if (path.tread > 0.48 || path.center > 0.3) return 'scrub-rise-path';
  if (path.shoulder > 0.38) return 'scrub-rise-path-shoulder';
  if (scrubRiseWashMask(x, z) > 0.54) return 'dry-wash';
  if (scrubRiseBasaltExposure(x, z) > 0.68) return 'basalt-scrub';
  if (scrubRiseThicketStrength(x, z) > 0.42) return 'thorn-scrub';
  if (y > 7.1) return 'inland-grass-rise';
  return 'open-dry-grass';
}

export function postScrubRiseColor(x, z, y) {
  const biome = postScrubRiseBiomeAt(x, z, y);
  const path = scrubRisePathInfo(x, z);
  const broadMottle = terrainSurfaceNoise(x * 0.17 + 7, z * 0.15 - 11) * 0.5 + 0.5;
  const soilMottle = terrainSurfaceNoise(x * 0.82 - 13, z * 0.74 + 5) * 0.5 + 0.5;
  const fineMottle = terrainSurfaceNoise(x * 2.55 + 19, z * 2.3 - 17) * 0.5 + 0.5;
  const fissures = Math.pow(Math.abs(crackNoise(x * 0.68 - 4, z * 0.64 + 9)), 4);
  const thicket = scrubRiseThicketStrength(x, z);
  const basalt = scrubRiseBasaltExposure(x, z);
  const color = new THREE.Color('#664938');

  // Broad ochre soil, darker weathered pockets, and fine cinder variation
  // break up the ground without producing a repeated or uniformly green fill.
  color.lerp(new THREE.Color('#90623f'), broadMottle * 0.34);
  color.lerp(new THREE.Color('#493f36'), (1 - soilMottle) * (0.13 + basalt * 0.17));
  color.lerp(new THREE.Color('#a17a51'), fineMottle * 0.09);
  color.lerp(new THREE.Color('#353632'), fissures * (0.13 + basalt * 0.16));

  // September vegetation changes the soil locally rather than recoloring the
  // whole rise. Green is strongest beneath authored thickets and grass pockets.
  color.lerp(new THREE.Color('#6d7046'), thicket * 0.2);
  if (biome === 'open-dry-grass') color.lerp(new THREE.Color('#84754d'), 0.13);
  if (biome === 'inland-grass-rise') color.lerp(new THREE.Color('#7a7448'), 0.18);
  if (biome === 'thorn-scrub') color.lerp(new THREE.Color('#59603d'), 0.3);
  if (biome === 'basalt-scrub') color.lerp(new THREE.Color('#403d34'), 0.52);
  if (biome === 'dry-wash') color.lerp(new THREE.Color('#625747'), 0.5);
  if (biome === 'scrub-rise-path-shoulder') color.lerp(new THREE.Color('#8c7049'), 0.46 + path.shoulder * 0.16);
  if (biome === 'scrub-rise-path') color.lerp(new THREE.Color('#a56b3d'), 0.68 + path.center * 0.12);
  color.multiplyScalar(0.86 + soilMottle * 0.1 + fineMottle * 0.04);
  return color;
}

export function isPostScrubRiseWalkable(x, z, config) {
  const margin = 1.35;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const path = scrubRisePathInfo(x, z);
  const step = 0.82;
  const left = postScrubRiseHeight(x - step, z, { movementSurface: true });
  const right = postScrubRiseHeight(x + step, z, { movementSurface: true });
  const back = postScrubRiseHeight(x, z - step, { movementSurface: true });
  const forward = postScrubRiseHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 1.12 || path.path > 0.18;
}

export const postScrubRiseRegion = {
  id: POST_SCRUB_RISE,
  aliases: ['post-office-scrub-rise'],
  terrain: {
    height: postScrubRiseHeight,
    movementHeight: (x, z) => postScrubRiseHeight(x, z, { movementSurface: true }),
    biomeAt: postScrubRiseBiomeAt,
    color: postScrubRiseColor,
    isWalkable: isPostScrubRiseWalkable,
    defaultSpawn: [-9.3, 0, -45.5],
    defaultFacing: [0.08, 0, 1],
    entrySpawns: {
      north: [-9, 0, -46.5],
      west: [-50.5, 0, 27.6],
      east: [50.5, 0, 7.4],
      south: [8, 0, 46.5],
    },
    entryFacings: {
      north: [0.08, 0, 1],
      west: [1, 0, 0],
      east: [-1, 0, 0],
      south: [0, 0, -1],
    },
  },
};
