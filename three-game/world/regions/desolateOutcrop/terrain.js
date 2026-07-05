import * as THREE from 'three';
import {
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';

export const DESOLATE_OUTCROP = 'N_OUTCROP';

const MAIN_RIBBON = [
  [2.0, -43.5, 5.8],
  [-4.4, -37.0, 7.6],
  [-1.2, -29.0, 8.8],
  [4.0, -20.0, 10.2],
  [-3.0, -9.0, 11.8],
  [2.0, 2.5, 12.3],
  [-2.4, 13.5, 12.8],
  [3.6, 25.5, 16.4],
  [0.0, 39.0, 20.2],
];

const SOUTH_SADDLE = [
  [-3.5, 16.0, 7.2],
  [4.0, 26.5, 14.4],
  [0.0, 39.0, 19.4],
];

const WEST_HORN = [
  [-2.5, -25.5, 4.6],
  [-12.0, -36.0, 4.4],
  [-9.0, -43.0, 3.2],
];

const EAST_HORN = [
  [2.0, -25.0, 4.8],
  [10.5, -35.0, 4.4],
  [7.2, -42.0, 3.4],
];

const TIDE_SHELF = [
  [13.5, -23.0, 4.4],
  [20.5, -12.5, 6.3],
  [23.5, 0.0, 7.1],
  [17.0, 12.0, 5.8],
  [10.0, 22.5, 4.4],
];

function gaussianEllipse(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.exp(-(dx * dx + dz * dz));
}

function smoothMask(distance, inner, outer) {
  return 1 - THREE.MathUtils.smoothstep(distance, inner, outer);
}

function channelInfo(x, z, points, widthScale = 1, widthBias = 0) {
  let best = {
    normalized: Number.POSITIVE_INFINITY,
    cx: 0,
    cz: 0,
    width: 1,
  };

  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az, aw] = points[i];
    const [bx, bz, bw] = points[i + 1];
    const abx = bx - ax;
    const abz = bz - az;
    const lengthSq = abx * abx + abz * abz || 1;
    const t = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / lengthSq, 0, 1);
    const cx = ax + abx * t;
    const cz = az + abz * t;
    const widthBase = THREE.MathUtils.lerp(aw, bw, t);
    const bankWobble = Math.sin(cx * 0.24 + cz * 0.17) * 0.75
      + Math.sin(cx * 0.09 - cz * 0.31) * 0.55;
    const width = Math.max(1.6, (widthBase + bankWobble + widthBias) * widthScale);
    const normalized = Math.hypot(x - cx, z - cz) / width;
    if (normalized < best.normalized) {
      best = { normalized, cx, cz, width };
    }
  }

  return best;
}

function channelMask(x, z, points, inner = 0.34, outer = 1.0, widthScale = 1, widthBias = 0) {
  return smoothMask(channelInfo(x, z, points, widthScale, widthBias).normalized, inner, outer);
}

export function desolateOutcropCoastDistance(x, z) {
  const base = channelInfo(x, z, MAIN_RIBBON);
  const edgeBand = THREE.MathUtils.smoothstep(base.normalized, 0.44, 1.16);
  const raggedEdge = terrainSurfaceNoise(x * 0.52 + 11.0, z * 0.46 - 5.0) * 0.075
    + crackNoise(x * 0.31 - 6.0, z * 0.58 + 2.0) * 0.045;
  const bite = Math.max(
    gaussianEllipse(x, z, -12.5, 27.0, 3.0, 8.0),
    gaussianEllipse(x, z, 15.0, 16.5, 3.7, 8.5),
    gaussianEllipse(x, z, -10.0, -19.0, 3.2, 7.0),
    gaussianEllipse(x, z, 13.0, -31.0, 3.0, 6.0),
  );
  const chip = Math.max(0, terrainSurfaceNoise(x * 0.9 - 3.0, z * 0.82 + 9.0)) * 0.055;
  return base.normalized + edgeBand * (raggedEdge + bite * 0.16 + chip);
}

export function desolateOutcropLandMask(x, z) {
  return smoothMask(desolateOutcropCoastDistance(x, z), 0.82, 1.06);
}

export function desolateOutcropSpineDistance(x, z) {
  return channelInfo(x, z, MAIN_RIBBON, 0.58, -0.3).normalized;
}

export function desolateOutcropSpineMask(x, z) {
  return smoothMask(desolateOutcropSpineDistance(x, z), 0.18, 0.84);
}

export function desolateOutcropSouthSaddleMask(x, z) {
  const fan = channelMask(x, z, SOUTH_SADDLE, 0.28, 1.0);
  return THREE.MathUtils.clamp(fan * THREE.MathUtils.smoothstep(z, 12, 37), 0, 1);
}

export function desolateOutcropNorthHornMask(x, z) {
  const west = channelMask(x, z, WEST_HORN, 0.2, 1.02);
  const east = channelMask(x, z, EAST_HORN, 0.2, 1.02);
  const splitNotch = gaussianEllipse(x, z, 0.6, -35.5, 3.2, 8.0) * 0.45;
  return THREE.MathUtils.clamp(Math.max(west, east) * (1 - splitNotch), 0, 1);
}

export function desolateOutcropTideShelfMask(x, z) {
  const shelfRibbon = channelMask(x, z, TIDE_SHELF, 0.28, 1.02);
  const coastDistance = desolateOutcropCoastDistance(x, z);
  const edgeFringe = THREE.MathUtils.smoothstep(coastDistance, 0.58, 0.94)
    * (1 - THREE.MathUtils.smoothstep(coastDistance, 1.03, 1.24));
  const eastExposure = THREE.MathUtils.smoothstep(x, 4, 24);
  const northExposure = THREE.MathUtils.smoothstep(-z, 20, 42) * 0.38;
  return THREE.MathUtils.clamp(Math.max(shelfRibbon, edgeFringe * Math.max(eastExposure, northExposure)), 0, 1);
}

export function desolateOutcropDryMask(x, z) {
  return desolateOutcropLandMask(x, z);
}

export function desolateOutcropTidepoolMask(x, z) {
  const pools = [
    [19.5, -15.5, 2.8, 4.4],
    [24.0, -3.0, 3.9, 5.0],
    [18.0, 8.5, 3.2, 4.8],
    [10.8, 18.2, 2.9, 3.8],
  ];
  let value = 0;
  for (const [cx, cz, rx, rz] of pools) {
    value = Math.max(value, gaussianEllipse(x, z, cx, cz, rx, rz));
  }
  const shelf = desolateOutcropTideShelfMask(x, z);
  const breakup = THREE.MathUtils.smoothstep(terrainSurfaceNoise(x * 0.72 + 3, z * 0.64 - 1), -0.28, 0.5);
  return THREE.MathUtils.clamp(value * shelf * (0.48 + breakup * 0.6), 0, 1);
}

export function desolateOutcropGuanoMask(x, z) {
  const horn = desolateOutcropNorthHornMask(x, z);
  const ledge = channelMask(x, z, [
    [-12.0, -30.0, 4.2],
    [-2.0, -28.0, 5.0],
    [10.0, -31.0, 4.2],
  ], 0.2, 1.0);
  const streaks = Math.abs(crackNoise(x * 0.19 - 8, z * 0.72 + 4));
  return THREE.MathUtils.clamp(Math.max(horn * 0.58, ledge * 0.42) * THREE.MathUtils.smoothstep(streaks, 0.34, 0.82), 0, 1);
}

export function desolateOutcropHeight(x, z, { movementSurface = false } = {}) {
  const coastDistance = desolateOutcropCoastDistance(x, z);
  const land = desolateOutcropLandMask(x, z);
  const shelf = desolateOutcropTideShelfMask(x, z);
  const spine = desolateOutcropSpineMask(x, z);
  const northHorn = desolateOutcropNorthHornMask(x, z);
  const southSaddle = desolateOutcropSouthSaddleMask(x, z);
  const terrain = Math.max(land, shelf * 0.68);
  const coastEdge = THREE.MathUtils.smoothstep(coastDistance, 0.54, 1.06);

  let y = -2.18 + land * 1.94 + shelf * 0.64;
  y += spine * 0.58;
  y += northHorn * 0.62;
  y += southSaddle * 0.26;
  y -= coastEdge * land * 0.34;

  const shelfTarget = -0.34 + elevationNoise(x * 0.055 + 4, z * 0.052 - 8) * 0.08;
  const shelfFlat = shelf * THREE.MathUtils.smoothstep(coastDistance, 0.44, 1.08);
  y = THREE.MathUtils.lerp(y, shelfTarget, shelfFlat * (movementSurface ? 0.64 : 0.52));

  const saddleTarget = 0.16 + elevationNoise(x * 0.038 - 9, z * 0.04 + 3) * 0.1;
  y = THREE.MathUtils.lerp(y, saddleTarget, southSaddle * THREE.MathUtils.smoothstep(z, 19, 38) * 0.34);

  const northSlab = Math.max(
    channelMask(x, z, WEST_HORN, 0.16, 0.72, 0.9),
    channelMask(x, z, EAST_HORN, 0.16, 0.72, 0.9),
  );
  y += northSlab * (movementSurface ? 0.08 : 0.16);

  const deepN = THREE.MathUtils.smoothstep(-z, 33, 47);
  const deepE = THREE.MathUtils.smoothstep(x, 36, 50);
  const deepW = THREE.MathUtils.smoothstep(-x, 35, 49);
  const exposedDrop = Math.max(deepN, deepE, deepW) * (1 - terrain * 0.82);
  y -= exposedDrop * 2.85;

  const seamA = 1 - THREE.MathUtils.smoothstep(Math.abs(crackNoise(x * 0.16 + 12, z * 0.54 - 4)), 0.015, 0.13);
  const seamB = 1 - THREE.MathUtils.smoothstep(Math.abs(crackNoise(x * 0.42 - 7, z * 0.18 + 8)), 0.018, 0.14);
  const fractureCut = Math.max(seamA, seamB) * land * (1 - shelf * 0.45);
  y -= fractureCut * (movementSurface ? 0.035 : 0.15);

  const basaltChip = Math.pow(Math.abs(crackNoise(x * 0.48 + 5, z * 0.43 - 8)), 4.5);
  y += land * basaltChip * (movementSurface ? 0.035 : 0.16);
  y += terrainFineDetail(x, z) * terrain * (movementSurface ? 0.07 : 0.22);
  y += elevationNoise(x * 0.045 + 13, z * 0.052 - 7) * terrain * (movementSurface ? 0.05 : 0.13);

  return Math.max(-5.2, y);
}

export function desolateOutcropBiomeAt(x, z, y = desolateOutcropHeight(x, z)) {
  if (y < -2.15) return 'water';
  const dry = desolateOutcropDryMask(x, z);
  const shelf = desolateOutcropTideShelfMask(x, z);
  const pools = desolateOutcropTidepoolMask(x, z);
  if (y < WATER_LEVEL) return pools > 0.18 ? 'tidepool' : 'shallow-basalt';
  if (pools > 0.34 || (shelf > 0.35 && y < 0.16)) return 'wet-basalt';
  if (desolateOutcropGuanoMask(x, z) > 0.38 && y > 0.28) return 'guano-rock';
  if (desolateOutcropSouthSaddleMask(x, z) > 0.38 && z > 19 && y > -0.22) return 'red-cinder';
  if (dry > 0.08) return 'dry-basalt';
  return 'wave-cut-basalt';
}

export function desolateOutcropColor(x, z, y) {
  const noise = terrainSurfaceNoise(x, z);
  const biome = desolateOutcropBiomeAt(x, z, y);
  const color = new THREE.Color();
  if (biome === 'water') color.set('#123d4d');
  else if (biome === 'shallow-basalt') color.set('#23464b');
  else if (biome === 'tidepool') color.set('#142f31');
  else if (biome === 'wet-basalt') color.set('#151d1b');
  else if (biome === 'guano-rock') color.set('#b5ad93');
  else if (biome === 'red-cinder') color.set('#4d3328');
  else if (biome === 'wave-cut-basalt') color.set('#1b1e1b');
  else color.set('#252620');

  if (biome === 'dry-basalt' || biome === 'wave-cut-basalt') {
    color.lerp(new THREE.Color('#3f3a2f'), Math.max(0, noise) * 0.16);
    if (Math.abs(crackNoise(x * 1.2, z * 1.18)) > 0.91) color.lerp(new THREE.Color('#7d735d'), 0.12);
  }
  if (biome === 'red-cinder') {
    color.lerp(new THREE.Color('#6f3f2d'), Math.max(0, noise) * 0.18);
  }
  if (biome === 'wet-basalt' || biome === 'tidepool') {
    color.lerp(new THREE.Color('#244a3f'), Math.max(0, noise) * 0.18);
  }
  color.multiplyScalar(0.9 + noise * 0.07);
  return color;
}

export function isDesolateOutcropWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  if (!inBounds) return false;
  const y = desolateOutcropHeight(x, z, { movementSurface: true });
  return y > -0.58 && (desolateOutcropDryMask(x, z) > 0.06 || desolateOutcropTideShelfMask(x, z) > 0.34);
}

export const desolateOutcropRegion = {
  id: DESOLATE_OUTCROP,
  aliases: [],
  terrain: {
    height: desolateOutcropHeight,
    movementHeight: (x, z) => desolateOutcropHeight(x, z, { movementSurface: true }),
    biomeAt: desolateOutcropBiomeAt,
    color: desolateOutcropColor,
    isWalkable: isDesolateOutcropWalkable,
  },
};
