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
  ASILO_SPRING,
  asiloSpringChannelInfo,
  asiloSpringFlowAt,
  asiloSpringMoisture,
  asiloSpringPathInfo,
  asiloSpringRidgeInfo,
  asiloSpringStandingWaterMask,
  asiloSpringStandingWaterSuppressionMask,
} from './path';

const RIDGE_HEIGHT = 6.4;

function uplandRelief(x, z, movementSurface) {
  // Ground falls gently from the western highlands (north) toward the colony
  // and the southern forest.
  const northRise = THREE.MathUtils.smoothstep(-z, -10, 48) * 1.6;
  const broad = elevationNoise(x * 0.026 + 5, z * 0.028 - 9) * 0.8;
  const medium = elevationNoise(x * 0.064 - 11, z * 0.06 + 4) * 0.32;
  const fine = terrainFineDetail(x, z) * (movementSurface ? 0.05 : 0.32);
  return 1.55 + northRise + broad + medium + fine;
}

export function asiloSpringHeight(x, z, { movementSurface = false } = {}) {
  const brook = asiloSpringChannelInfo(x, z);
  const path = asiloSpringPathInfo(x, z);
  const ridge = asiloSpringRidgeInfo(x, z);
  let y = uplandRelief(x, z, movementSurface);

  // Crescent of tuff behind the pool. The crest gets weathered relief on the
  // render surface only; the movement surface stays smooth.
  const ridgeRelief = movementSurface
    ? 0
    : Math.max(0, crackNoise(x * 0.18 - 4, z * 0.17 + 6)) * 0.55 * ridge.mass;
  y += ridge.mass * RIDGE_HEIGHT + ridgeRelief
    + ridge.top * elevationNoise(x * 0.09 + 2, z * 0.08 - 1) * 0.6;

  // Pool and brook cross-section: bed -> submerged shelf -> mud -> gravel ->
  // fern bank -> upland, derived from one signed shore distance.
  if (brook.shoreDistance < 10) {
    const shoreD = brook.shoreDistance;
    const centerDepth = 0.34 + brook.pool * 0.82 - brook.ford * 0.2;
    const channelT = 1 - THREE.MathUtils.smoothstep(brook.distance, brook.wetHalfWidth * 0.08, brook.wetHalfWidth);
    const bedRipple = terrainSurfaceNoise(x * 0.6 - 3, z * 0.58 + 5)
      * (movementSurface ? 0.016 : 0.06) * (brook.water + brook.submergedShelf * 0.4);
    let profile;
    if (shoreD <= 0) {
      profile = WATER_LEVEL - 0.035 - centerDepth * Math.pow(channelT, 0.7) + bedRipple;
    } else if (shoreD <= 1.3) {
      profile = WATER_LEVEL - 0.015 + THREE.MathUtils.smoothstep(shoreD, 0, 1.3) * 0.13
        + terrainSurfaceNoise(x * 0.32 + 7, z * 0.34 - 2) * (movementSurface ? 0.012 : 0.035);
    } else if (shoreD <= 3.6) {
      profile = WATER_LEVEL + 0.115 + THREE.MathUtils.smoothstep(shoreD, 1.3, 3.6) * 0.26
        + terrainSurfaceNoise(x * 0.78 - 4, z * 0.74 + 9) * (movementSurface ? 0.02 : 0.08);
    } else {
      const innerBank = WATER_LEVEL + 0.37
        + terrainSurfaceNoise(x * 0.19 + 3, z * 0.21 - 8) * (movementSurface ? 0.035 : 0.1);
      profile = THREE.MathUtils.lerp(innerBank, y, THREE.MathUtils.smoothstep(shoreD, 3.6, 10));
    }
    y = profile;
  }

  y -= path.tread * (0.09 + brook.valley * 0.02) + path.center * 0.03;
  return y;
}

export function asiloSpringBiomeAt(x, z, y = asiloSpringHeight(x, z)) {
  const brook = asiloSpringChannelInfo(x, z);
  const path = asiloSpringPathInfo(x, z);
  const ridge = asiloSpringRidgeInfo(x, z);
  const moisture = asiloSpringMoisture(x, z);
  if (brook.water > 0.45 && y < WATER_LEVEL - 0.03) return brook.pool > 0.4 ? 'spring-pool' : 'spring-brook';
  if (brook.mud > 0.42) return 'spring-mud';
  if (brook.gravel > 0.38) return 'brook-gravel-bank';
  if (path.tread > 0.5 || path.center > 0.3) return brook.valley > 0.48 ? 'muddy-ford-path' : 'highland-cinder-path';
  if (ridge.face > 0.5) return 'seeping-tuff-face';
  if (brook.riparian > 0.36) return 'fern-bank';
  if (ridge.top > 0.45) return 'tuff-ridge-scalesia';
  if (moisture > 0.52) return 'damp-spring-meadow';
  if (path.shoulder > 0.34) return 'highland-path-shoulder';
  return 'highland-grass';
}

const BIOME_COLORS = {
  'spring-pool': '#253b37',
  'spring-brook': '#3d5849',
  'spring-mud': '#40463a',
  'brook-gravel-bank': '#5f6058',
  'muddy-ford-path': '#4b4936',
  'highland-cinder-path': '#93533a',
  'seeping-tuff-face': '#6b5a43',
  'fern-bank': '#45603a',
  'tuff-ridge-scalesia': '#55663e',
  'damp-spring-meadow': '#58703f',
  'highland-path-shoulder': '#777247',
  'highland-grass': '#69733f',
};

export function asiloSpringColor(x, z, y) {
  const biome = asiloSpringBiomeAt(x, z, y);
  const broad = terrainSurfaceNoise(x * 0.17 + 2, z * 0.16 - 6) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.45 - 3, z * 1.36 + 8) * 0.5 + 0.5;
  const color = new THREE.Color(BIOME_COLORS[biome] || '#69733f');
  color.lerp(new THREE.Color('#82794a'), broad * 0.16);
  color.lerp(new THREE.Color('#263328'), asiloSpringMoisture(x, z) * 0.12);
  color.multiplyScalar(0.87 + fine * 0.1);
  return color;
}

export function isAsiloSpringWalkable(x, z, config) {
  const margin = 1.35;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const y = asiloSpringHeight(x, z, { movementSurface: true });
  if (y <= WATER_LEVEL - WADE_DEPTH + 0.05) return false;
  const path = asiloSpringPathInfo(x, z);
  const brook = asiloSpringChannelInfo(x, z);
  const step = 0.82;
  const left = asiloSpringHeight(x - step, z, { movementSurface: true });
  const right = asiloSpringHeight(x + step, z, { movementSurface: true });
  const back = asiloSpringHeight(x, z - step, { movementSurface: true });
  const forward = asiloSpringHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 1.0 || path.path > 0.16 || brook.ford > 0.3;
}

export const asiloSpringRegion = {
  id: ASILO_SPRING,
  aliases: ['asilo-spring', 'highland-spring'],
  terrain: {
    height: asiloSpringHeight,
    movementHeight: (x, z) => asiloSpringHeight(x, z, { movementSurface: true }),
    biomeAt: asiloSpringBiomeAt,
    color: asiloSpringColor,
    standingWaterMask: asiloSpringStandingWaterMask,
    standingWaterSuppressionMask: asiloSpringStandingWaterSuppressionMask,
    standingWaterFlowAt: asiloSpringFlowAt,
    standingWaterRendering: {
      globalWaterSuppression: {
        fadeStart: 0.06,
        fadeEnd: 0.28,
        rippleCutoff: 0.12,
      },
    },
    isWalkable: isAsiloSpringWalkable,
    // From the southern trail the pool, the seeping tuff face, and the cleft
    // all sit in one view.
    defaultSpawn: [-5.2, 0, 13.5],
    defaultFacing: [-0.2, 0, -0.98],
    entrySpawns: {
      north: [2.8, 0, -46.5],
      east: [53.5, 0, 2.4],
      south: [-4.3, 0, 46.5],
      west: [-53.5, 0, -34.5],
    },
    entryFacings: {
      north: [0, 0, 1],
      east: [-1, 0, -0.05],
      south: [0.05, 0, -1],
      west: [0.7, 0, 0.7],
    },
  },
};
