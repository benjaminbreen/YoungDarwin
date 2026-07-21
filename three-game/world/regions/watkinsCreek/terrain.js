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
  WATKINS_CREEK,
  watkinsCreekBasaltExposure,
  watkinsCreekChannelInfo,
  watkinsCreekFlowAt,
  watkinsCreekMoisture,
  watkinsCreekPathInfo,
  watkinsCreekStandingWaterMask,
  watkinsCreekStandingWaterSuppressionMask,
} from './path';

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

function uplandRelief(x, z, movementSurface) {
  const northLift = THREE.MathUtils.smoothstep(-z, 17, 48) * 3.25;
  const southShoulder = THREE.MathUtils.smoothstep(z, 22, 49) * 1.15;
  const westBench = gaussian(x, z, -40, -5, 22, 24) * 0.72;
  const eastBench = gaussian(x, z, 37, -13, 24, 20) * 0.6;
  const southSaddle = gaussian(x, z, 7, 35, 19, 15) * -0.48;
  const broad = elevationNoise(x * 0.025 + 8, z * 0.027 - 6) * 0.9;
  const medium = elevationNoise(x * 0.065 - 13, z * 0.061 + 9) * 0.38;
  const fine = terrainFineDetail(x, z) * (movementSurface ? 0.055 : 0.34);
  return 2.15 + northLift + southShoulder + westBench + eastBench + southSaddle + broad + medium + fine;
}

export function watkinsCreekHeight(x, z, { movementSurface = false } = {}) {
  const creek = watkinsCreekChannelInfo(x, z);
  const path = watkinsCreekPathInfo(x, z);
  const basalt = watkinsCreekBasaltExposure(x, z);
  let y = uplandRelief(x, z, movementSurface);

  // A continuous creek cross-section: channel bed -> submerged silt shelf ->
  // exposed mud -> gravel bench -> upland. The render surface gets restrained
  // micro-relief while the movement surface remains smooth and dependable.
  if (creek.shoreDistance < 11.5) {
    const shoreD = creek.shoreDistance;
    const centerDepth = 0.36 + creek.pool * 0.86 - creek.ford * 0.24;
    const channelT = 1 - THREE.MathUtils.smoothstep(
      creek.distance,
      creek.wetHalfWidth * 0.08,
      creek.wetHalfWidth,
    );
    const bedRipple = terrainSurfaceNoise(x * 0.62 - 5, z * 0.58 + 8)
      * (movementSurface ? 0.018 : 0.065) * (creek.water + creek.submergedShelf * 0.42);
    let creekProfile;
    if (shoreD <= 0) {
      creekProfile = WATER_LEVEL - 0.035 - centerDepth * Math.pow(channelT, 0.72) + bedRipple;
    } else if (shoreD <= 1.35) {
      const mudT = THREE.MathUtils.smoothstep(shoreD, 0, 1.35);
      creekProfile = WATER_LEVEL - 0.015 + mudT * 0.13
        + terrainSurfaceNoise(x * 0.32 + 2, z * 0.34 - 7) * (movementSurface ? 0.012 : 0.035);
    } else if (shoreD <= 3.8) {
      const gravelT = THREE.MathUtils.smoothstep(shoreD, 1.35, 3.8);
      creekProfile = WATER_LEVEL + 0.115 + gravelT * 0.27
        + terrainSurfaceNoise(x * 0.78 - 11, z * 0.74 + 3) * (movementSurface ? 0.02 : 0.09);
    } else {
      const bankT = THREE.MathUtils.smoothstep(shoreD, 3.8, 11.5);
      const innerBank = WATER_LEVEL + 0.38
        + terrainSurfaceNoise(x * 0.19 + 6, z * 0.21 - 5) * (movementSurface ? 0.035 : 0.11);
      creekProfile = THREE.MathUtils.lerp(innerBank, y, bankT);
    }
    y = creekProfile;
  }

  // The island between the forked channels remains a low, readable shelf;
  // fractured relief is render-heavy but movement-light.
  const fractured = Math.max(0, crackNoise(x * 0.16 + 3, z * 0.15 - 7));
  y += basalt * fractured * (movementSurface ? 0.08 : 0.28)
    * (1 - creek.water * 0.9)
    * (1 - creek.mud * 0.72);
  y -= path.tread * (0.09 + creek.valley * 0.025) + path.center * 0.03;
  return y;
}

export function watkinsCreekBiomeAt(x, z, y = watkinsCreekHeight(x, z)) {
  const creek = watkinsCreekChannelInfo(x, z);
  const path = watkinsCreekPathInfo(x, z);
  const basalt = watkinsCreekBasaltExposure(x, z);
  const moisture = watkinsCreekMoisture(x, z);
  if (creek.water > 0.45 && y < WATER_LEVEL - 0.03) return creek.pool > 0.42 ? 'creek-pool' : 'creek-water';
  if (creek.mud > 0.42) return 'saturated-creek-mud';
  if (creek.gravel > 0.38) return 'creek-gravel-bank';
  if (creek.riparian > 0.36) return 'riparian-creek-bank';
  if (path.tread > 0.5 || path.center > 0.3) return creek.valley > 0.48 ? 'muddy-ford-path' : 'highland-cinder-path';
  if (basalt > 0.64) return 'weathered-basalt-shelf';
  if (creek.valley > 0.52) return 'damp-creek-bank';
  if (moisture > 0.46) return 'green-creek-meadow';
  if (path.shoulder > 0.34) return 'highland-path-shoulder';
  return 'dry-highland-grass';
}

export function watkinsCreekColor(x, z, y) {
  const biome = watkinsCreekBiomeAt(x, z, y);
  const broad = terrainSurfaceNoise(x * 0.17 + 4, z * 0.16 - 9) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.45 - 8, z * 1.36 + 6) * 0.5 + 0.5;
  const color = new THREE.Color('#687044');
  color.lerp(new THREE.Color('#85804d'), broad * 0.26);
  if (biome === 'creek-pool') color.set('#263d39');
  else if (biome === 'creek-water') color.set('#3f5b4b');
  else if (biome === 'muddy-ford-path') color.set('#4b4936');
  else if (biome === 'saturated-creek-mud') color.set('#41473c');
  else if (biome === 'creek-gravel-bank') color.set('#606159');
  else if (biome === 'riparian-creek-bank') color.set('#50643d');
  else if (biome === 'highland-cinder-path') color.set('#965333');
  else if (biome === 'weathered-basalt-shelf') color.set('#4b4d47');
  else if (biome === 'damp-creek-bank') color.set('#475b39');
  else if (biome === 'green-creek-meadow') color.set('#5b7041');
  else if (biome === 'highland-path-shoulder') color.set('#777247');
  color.lerp(new THREE.Color('#263328'), watkinsCreekMoisture(x, z) * 0.12);
  color.multiplyScalar(0.88 + fine * 0.1);
  return color;
}

export function isWatkinsCreekWalkable(x, z, config) {
  const margin = 1.35;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const y = watkinsCreekHeight(x, z, { movementSurface: true });
  if (y <= WATER_LEVEL - WADE_DEPTH + 0.05) return false;
  const path = watkinsCreekPathInfo(x, z);
  const creek = watkinsCreekChannelInfo(x, z);
  const step = 0.82;
  const left = watkinsCreekHeight(x - step, z, { movementSurface: true });
  const right = watkinsCreekHeight(x + step, z, { movementSurface: true });
  const back = watkinsCreekHeight(x, z - step, { movementSurface: true });
  const forward = watkinsCreekHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 1.0 || path.path > 0.16 || creek.ford > 0.28;
}

export const watkinsCreekRegion = {
  id: WATKINS_CREEK,
  aliases: ['watkins-creek', 'highland-creek-fork'],
  terrain: {
    height: watkinsCreekHeight,
    movementHeight: (x, z) => watkinsCreekHeight(x, z, { movementSurface: true }),
    biomeAt: watkinsCreekBiomeAt,
    color: watkinsCreekColor,
    standingWaterMask: watkinsCreekStandingWaterMask,
    standingWaterSuppressionMask: watkinsCreekStandingWaterSuppressionMask,
    standingWaterFlowAt: watkinsCreekFlowAt,
    standingWaterRendering: {
      globalWaterSuppression: {
        fadeStart: 0.06,
        fadeEnd: 0.28,
        rippleCutoff: 0.12,
      },
    },
    isWalkable: isWatkinsCreekWalkable,
    defaultSpawn: [-7.5, 0, -40],
    defaultFacing: [0.05, 0, 1],
    entrySpawns: {
      north: [-6, 0, -44],
      west: [-50.5, 0, -2.2],
      east: [50.5, 0, -14],
      south: [15.5, 0, 43.5],
    },
    entryFacings: {
      north: [0.05, 0, 1],
      west: [1, 0, 0],
      east: [-1, 0, 0],
      south: [-0.18, 0, -1],
    },
  },
};
