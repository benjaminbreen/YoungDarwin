import * as THREE from 'three';
import {
  WADE_DEPTH,
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  SOUTHERN_INTERTIDAL,
  intertidalBackshoreMask,
  intertidalBasaltShelfMask,
  intertidalPathInfo,
  intertidalPoolMask,
  intertidalRequiredCausewayMask,
  intertidalSaltExposure,
  intertidalScrubBandStrength,
  intertidalShellSandMask,
  intertidalStandingWaterMask,
  intertidalTidalChannelMask,
  intertidalWrackBandMask,
  southernIntertidalSouthCoastZ,
} from './path';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function southernIntertidalHeight(x, z, { movementSurface = false } = {}) {
  const backshore = intertidalBackshoreMask(x, z);
  const basalt = intertidalBasaltShelfMask(x, z);
  const shellSand = intertidalShellSandMask(x, z);
  const channel = intertidalTidalChannelMask(x, z);
  const pool = intertidalPoolMask(x, z);
  const causeway = intertidalRequiredCausewayMask(x, z);
  const path = intertidalPathInfo(x, z);
  const broad = elevationNoise(x * 0.032 + 7, z * 0.035 - 4);
  const cross = elevationNoise(x * 0.072 - 5, z * 0.067 + 11);

  let y = -0.47
    + broad * 0.15
    + cross * 0.06
    + backshore * (1.08 + elevationNoise(x * 0.048 - 8, z * 0.052 + 3) * 0.32)
    + shellSand * 0.14
    + basalt * 0.48;

  const basaltFracture = Math.pow(Math.abs(crackNoise(x * 0.31 + 5, z * 0.29 - 9)), 2.5);
  y += basalt * basaltFracture * (movementSurface ? 0.07 : 0.28);

  const channelFloor = -1.34
    - THREE.MathUtils.smoothstep(z, 15, 48) * 0.28
    + elevationNoise(x * 0.09 + 13, z * 0.082 - 6) * (movementSurface ? 0.035 : 0.08);
  y = THREE.MathUtils.lerp(y, channelFloor, channel * (1 - causeway * 0.88));

  const poolFloor = -1.39
    + elevationNoise(x * 0.12 - 7, z * 0.11 + 4) * (movementSurface ? 0.025 : 0.07);
  y = THREE.MathUtils.lerp(y, poolFloor, pool * 0.92);

  // The cardinal routes sit on a naturally accumulated sand-and-basalt
  // causeway. The optional tidepool loop is not included in this mask and
  // remains visibly wetter and lower.
  const causewayTarget = -0.64 + backshore * 0.92 + basalt * 0.22;
  y = Math.max(y, THREE.MathUtils.lerp(y, causewayTarget, causeway * 0.88));

  // A definite shelf break turns the low-tide plain into actual ocean. The
  // broad lead-in leaves a wadeable swash apron; the outer half becomes deep
  // enough for the shared ocean shader's Gerstner swell and breakers to keep
  // their full silhouette instead of flattening over ankle-deep water.
  const southCoast = southernIntertidalSouthCoastZ(x);
  const oceanDrop = THREE.MathUtils.smoothstep(z, southCoast - 4.4, southCoast + 8.8);
  const outerDrop = THREE.MathUtils.smoothstep(z, southCoast + 5.5, 48.5);
  y -= oceanDrop * (3.15 + Math.max(0, terrainSurfaceNoise(x * 0.08, z * 0.08)) * 0.38);
  y -= outerDrop * 0.72;

  const exposed = clamp01(backshore + shellSand * 0.72 + basalt * 0.85);
  y += terrainFineDetail(x, z) * exposed * (movementSurface ? 0.045 : 0.18);
  y -= path.tread * (movementSurface ? 0.035 : 0.08);
  return Math.max(-4.45, y);
}

export function southernIntertidalBiomeAt(x, z, y = southernIntertidalHeight(x, z)) {
  const path = intertidalPathInfo(x, z);
  const pool = intertidalPoolMask(x, z);
  const channel = intertidalTidalChannelMask(x, z);
  const basalt = intertidalBasaltShelfMask(x, z);
  const backshore = intertidalBackshoreMask(x, z);

  if (y < WATER_LEVEL - WADE_DEPTH) return 'water';
  if (pool > 0.42 && y < WATER_LEVEL - 0.12) return 'tidepool';
  if (channel > 0.38 && y < WATER_LEVEL - 0.08) return 'tidal-channel';
  if (path.tread > 0.52 && y > WATER_LEVEL - 0.02) return 'intertidal-causeway';
  if (basalt > 0.5) return y < WATER_LEVEL + 0.34 ? 'wet-basalt' : 'dry-basalt';
  if (backshore > 0.56 && intertidalScrubBandStrength(x, z) > 0.24) return 'backshore-scrub';
  if (intertidalWrackBandMask(x, z) > 0.4) return 'wrack-line';
  if (y < WATER_LEVEL + 0.24 || intertidalSaltExposure(x, z) > 0.68) return 'wet-sand';
  return 'white-sand';
}

export function southernIntertidalColor(x, z, y) {
  const biome = southernIntertidalBiomeAt(x, z, y);
  const broad = terrainSurfaceNoise(x * 0.34 + 5, z * 0.31 - 7) * 0.5 + 0.5;
  const color = new THREE.Color('#d8ceb4');
  if (biome === 'water') color.set('#226f7d');
  else if (biome === 'tidal-channel') color.set('#58aaa5');
  else if (biome === 'tidepool') color.set('#315f5b');
  else if (biome === 'wet-basalt') color.set('#172522');
  else if (biome === 'dry-basalt') color.set('#343934');
  else if (biome === 'backshore-scrub') color.set('#53633c');
  else if (biome === 'wrack-line') color.set('#665843');
  else if (biome === 'intertidal-causeway') color.set('#816046');
  else if (biome === 'wet-sand') color.set('#b9b6a2');
  else color.set('#e2d9bf');
  color.lerp(new THREE.Color('#eef0d8'), Math.max(0, broad - 0.58) * 0.16);
  color.multiplyScalar(0.94 + broad * 0.06);
  return color;
}

export function isSouthernIntertidalWalkable(x, z, config) {
  const margin = 1.3;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  if (z > 42) return false;
  const y = southernIntertidalHeight(x, z, { movementSurface: true });
  if (y < WATER_LEVEL - WADE_DEPTH + 0.04) return false;
  const path = intertidalPathInfo(x, z);
  const step = 0.82;
  const left = southernIntertidalHeight(x - step, z, { movementSurface: true });
  const right = southernIntertidalHeight(x + step, z, { movementSurface: true });
  const back = southernIntertidalHeight(x, z - step, { movementSurface: true });
  const forward = southernIntertidalHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 0.86 || path.path > 0.16;
}

export const southernIntertidalRegion = {
  id: SOUTHERN_INTERTIDAL,
  aliases: ['southern-intertidal', 'intertidal-flats'],
  terrain: {
    height: southernIntertidalHeight,
    movementHeight: (x, z) => southernIntertidalHeight(x, z, { movementSurface: true }),
    biomeAt: southernIntertidalBiomeAt,
    color: southernIntertidalColor,
    standingWaterMask: intertidalStandingWaterMask,
    standingWaterSuppressionMask: intertidalStandingWaterMask,
    standingWaterRendering: {
      globalWaterSuppression: { fadeStart: 0.24, fadeEnd: 0.66, rippleCutoff: 0.16 },
      oceanRippleMaskCutoff: 0.16,
    },
    isWalkable: isSouthernIntertidalWalkable,
    // Direct launches begin at the causeway fork so the tidepools, basalt
    // fingers, and both coastal routes compose together immediately. Seam
    // arrivals still enter through the landward scrub at z=-46.5.
    defaultSpawn: [-4, 0, -20],
    defaultFacing: [0, 0, 1],
    defaultCameraFacing: [0, 0, 1],
    entrySpawns: {
      north: [2, 0, -46.5],
      east: [53.5, 0, -8],
      west: [-53.5, 0, 8.5],
    },
    entryFacings: {
      north: [0, 0, 1],
      east: [-1, 0, 0.08],
      west: [1, 0, -0.08],
    },
    entryCameraFacings: {
      north: [0, 0, 1],
      east: [-1, 0, 0.08],
      west: [1, 0, -0.08],
    },
  },
};
