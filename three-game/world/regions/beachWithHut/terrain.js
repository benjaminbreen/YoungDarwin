import * as THREE from 'three';
import { crackNoise, elevationNoise, surfaceNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';

// ---------------------------------------------------------------------------
// Beach with Hut (S_HUT) — a small southwest Floreana beach.
//
// Layout (z axis: -35 north → +35 south, x axis: -40 west → +40 east):
//   west/south ocean wraps a pale shell-sand beach; the back-beach shifts into
//   warmer beige sand, then rises northeast into a hut shelf with sparse dry
//   grass, a lean-to, and abandoned loam seedbeds.

export const BEACH_WITH_HUT = 'S_HUT';

export const BEACH_HUT_PATHS = [
  [
    [38, -25, 3.4],
    [27, -21, 3.1],
    [16, -17, 3.3],
    [8, -10, 3.1],
    [1, 1, 2.9],
    [-4, 12, 2.7],
  ],
  [
    [16, -17, 2.4],
    [23, -18, 2.1],
    [30, -16, 2.0],
  ],
  [
    [7, -14, 2.2],
    [2, -9, 2.0],
  ],
];

export const BEACH_HUT_GARDENS = [
  { id: 'upper-seedbed', x: 26, z: -21, halfX: 4.6, halfZ: 2.2, yaw: -0.34, rowAxis: 'x', rowSpacing: 0.86 },
  { id: 'lower-seedbed', x: 22, z: -15, halfX: 4.0, halfZ: 2.0, yaw: -0.29, rowAxis: 'x', rowSpacing: 0.82 },
  { id: 'small-seedbed', x: 31, z: -13, halfX: 2.5, halfZ: 1.45, yaw: 0.12, rowAxis: 'z', rowSpacing: 0.76 },
];

export const BEACH_HUT_PADS = [
  { id: 'main-hut', x: 15, z: -17, radius: 6.0 },
  { id: 'lean-to', x: 6.5, z: -14, radius: 4.3 },
];

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smoothstep01(value, min, max) {
  return THREE.MathUtils.smoothstep(value, min, max);
}

export function beachHutWestCoastX(z) {
  const southBend = smoothstep01(z, 8, 31);
  return -29.5
    + Math.sin(z * 0.08 + 0.65) * 2.2
    + Math.sin(z * 0.027 - 1.1) * 1.15
    + southBend * 5.7;
}

export function beachHutSouthCoastZ(x) {
  const westPocket = smoothstep01(-x, 18, 38);
  return 20.5
    + Math.sin(x * 0.074 - 0.8) * 2.25
    + Math.sin(x * 0.028 + 1.5) * 1.1
    - westPocket * 7.2;
}

export function beachHutCoastInfo(x, z) {
  const westDistance = x - beachHutWestCoastX(z);
  const southDistance = beachHutSouthCoastZ(x) - z;
  const distance = Math.min(westDistance, southDistance);
  return {
    distance,
    westDistance,
    southDistance,
    edge: westDistance < southDistance ? 'west' : 'south',
  };
}

export function beachHutCoastDistance(x, z) {
  return beachHutCoastInfo(x, z).distance;
}

function beachHutNorthEastRise(x, z) {
  const diagonal = (x - z) * 0.70710678;
  return smoothstep01(diagonal, 24, 58);
}

export function beachHutRockMask(x, z) {
  const westSurf = Math.exp(-(Math.pow((x + 27) / 7.2, 2) + Math.pow((z - 2) / 8.5, 2)));
  const southSurf = Math.exp(-(Math.pow((x - 12) / 8.4, 2) + Math.pow((z - 23) / 5.8, 2)));
  const corner = Math.exp(-(Math.pow((x + 25) / 7.8, 2) + Math.pow((z - 23) / 7.2, 2)));
  return Math.max(westSurf, Math.max(southSurf, corner));
}

function segmentInfo(px, pz, ax, az, aw, bx, bz, bw) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return {
    distance: Math.hypot(px - cx, pz - cz),
    width: THREE.MathUtils.lerp(aw, bw, t),
    tangentX: abx / Math.sqrt(lengthSq),
    tangentZ: abz / Math.sqrt(lengthSq),
    centerX: cx,
    centerZ: cz,
  };
}

export function beachHutPathInfo(x, z) {
  let nearest = null;
  for (const polyline of BEACH_HUT_PATHS) {
    for (let i = 0; i < polyline.length - 1; i += 1) {
      const [ax, az, aw] = polyline[i];
      const [bx, bz, bw] = polyline[i + 1];
      const info = segmentInfo(x, z, ax, az, aw, bx, bz, bw);
      if (!nearest || info.distance < nearest.distance) nearest = info;
    }
  }

  const edgeNoise = Math.sin(nearest.centerX * 0.22 + nearest.centerZ * 0.29) * 0.28
    + terrainSurfaceNoise(x * 0.58 + 6, z * 0.58 - 2) * 0.42;
  const width = Math.max(1.8, nearest.width + edgeNoise);
  const center = 1 - smoothstep01(nearest.distance, width * 0.2, width * 0.48);
  const tread = 1 - smoothstep01(nearest.distance, width * 0.38, width * 0.78);
  const shoulder = smoothstep01(nearest.distance, width * 0.36, width * 1.08)
    * (1 - smoothstep01(nearest.distance, width * 0.88, width * 1.52));
  const path = 1 - smoothstep01(nearest.distance, width * 0.56, width * 1.08);
  return {
    ...nearest,
    width,
    center: clamp01(center),
    tread: clamp01(tread),
    shoulder: clamp01(shoulder),
    path: clamp01(path),
  };
}

function rotatedLocal(x, z, cx, cz, yaw) {
  const dx = x - cx;
  const dz = z - cz;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { lx: dx * cos - dz * sin, lz: dx * sin + dz * cos };
}

export function beachHutGardenInfo(x, z) {
  let best = { mask: 0, rowPhase: 0, plot: null };
  for (const plot of BEACH_HUT_GARDENS) {
    const { lx, lz } = rotatedLocal(x, z, plot.x, plot.z, plot.yaw);
    const wobble = terrainSurfaceNoise(x * 0.52 + plot.x, z * 0.52 - plot.z) * 0.34;
    const dx = Math.abs(lx) - plot.halfX + wobble;
    const dz = Math.abs(lz) - plot.halfZ + wobble;
    const outside = Math.max(dx, dz);
    const mask = clamp01(1 - smoothstep01(outside, -0.75, 0.72));
    if (mask > best.mask) {
      const across = plot.rowAxis === 'x' ? lz : lx;
      best = { mask, rowPhase: (across / plot.rowSpacing) * Math.PI * 2, plot };
    }
  }
  return best;
}

export function beachHutPadMask(x, z) {
  let mask = 0;
  for (const pad of BEACH_HUT_PADS) {
    const d = Math.hypot(x - pad.x, z - pad.z);
    mask = Math.max(mask, 1 - smoothstep01(d, pad.radius * 0.45, pad.radius * 1.05));
  }
  return clamp01(mask);
}

export function beachWithHutHeight(x, z, { movementSurface = false } = {}) {
  const { distance: d } = beachHutCoastInfo(x, z);
  const neRise = beachHutNorthEastRise(x, z);

  let y;
  if (d < 0) {
    y = -0.2 + Math.max(d * 0.12, -1.14);
    y += surfaceNoise(x * 0.18 + 4, z * 0.18 - 6) * 0.05;
  } else {
    y = -0.2 + 1.22 * (1 - Math.exp(-d * 0.105));
    y += smoothstep01(d, 8, 25) * (elevationNoise(x * 0.055 + 3, z * 0.052 + 8) * 0.42 + 0.18);
    y += neRise * 1.55;
  }

  const path = beachHutPathInfo(x, z);
  const garden = beachHutGardenInfo(x, z);
  const pad = beachHutPadMask(x, z);

  y -= path.tread * 0.055 + path.center * 0.035;
  y -= garden.mask * (0.08 + (movementSurface ? 0 : Math.sin(garden.rowPhase) * 0.035));

  if (pad > 0) {
    const padTarget = 0.82 + neRise * 1.45 + smoothstep01(d, 18, 34) * 0.24;
    y = THREE.MathUtils.lerp(y, padTarget, pad * 0.55);
  }

  const rock = beachHutRockMask(x, z);
  y += rock * (0.72 + Math.abs(crackNoise(x * 0.4 + 5, z * 0.37 - 2)) * (movementSurface ? 0.28 : 0.82));

  const seaward = 1 - smoothstep01(d, -2.5, 0.0);
  const deepWest = smoothstep01(-x, 34, 40);
  const deepSouth = smoothstep01(z, 28, 35);
  y -= Math.max(deepWest, deepSouth) * seaward * 2.4;

  const dry = smoothstep01(y, -0.4, 0.1);
  const detailSuppression = clamp01(path.path * 0.42 + garden.mask * 0.54 + pad * 0.72);
  y += terrainFineDetail(x, z) * dry * (movementSurface ? 0.18 : 0.5) * (1 - detailSuppression);
  return Math.max(-4.3, y);
}

export function beachWithHutBiomeAt(x, z, y = beachWithHutHeight(x, z)) {
  const d = beachHutCoastDistance(x, z);
  if (y < -2.05) return 'water';
  if (y < -0.45) return 'shallow-water';
  if (beachHutRockMask(x, z) > 0.45) return 'basalt';
  if (d >= 0 && d < 1.8) return 'wet-white-sand';

  const garden = beachHutGardenInfo(x, z);
  if (garden.mask > 0.45) return 'garden-loam';
  const path = beachHutPathInfo(x, z);
  if (path.center > 0.24 || path.tread > 0.52) return 'sandy-path';
  if (d < 14.5) return 'white-sand';
  if (d < 29) return 'normal-sand';
  return 'dry-grass-shelf';
}

export function beachWithHutColor(x, z, y) {
  const noise = terrainSurfaceNoise(x, z);
  const biome = beachWithHutBiomeAt(x, z, y);
  const color = new THREE.Color();
  if (biome === 'water') color.set('#2b7691');
  else if (biome === 'shallow-water') color.set('#70bfb1');
  else if (biome === 'basalt') color.set('#37342e');
  else if (biome === 'wet-white-sand') color.set('#b8b294');
  else if (biome === 'garden-loam') {
    const garden = beachHutGardenInfo(x, z);
    color.set('#2d2118');
    color.lerp(new THREE.Color('#4a3322'), (Math.sin(garden.rowPhase) * 0.5 + 0.5) * 0.28);
  } else if (biome === 'sandy-path') color.set('#9e8052');
  else if (biome === 'white-sand') {
    color.set('#d8cfb5');
    color.lerp(new THREE.Color('#eee2c5'), Math.max(0, noise) * 0.36);
    color.lerp(new THREE.Color('#bfb392'), Math.max(0, -noise) * 0.2);
  } else if (biome === 'normal-sand') {
    color.set('#b89b6d');
    color.lerp(new THREE.Color('#d0b27d'), Math.max(0, noise) * 0.32);
    color.lerp(new THREE.Color('#93794f'), Math.max(0, -noise) * 0.2);
  } else {
    color.set('#857b4d');
    color.lerp(new THREE.Color('#a6985b'), Math.max(0, noise) * 0.34);
    color.lerp(new THREE.Color('#5f6840'), Math.max(0, -noise) * 0.26);
  }
  color.multiplyScalar(0.94 + noise * 0.07);
  return color;
}

export function isBeachWithHutWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  return inBounds && beachWithHutHeight(x, z, { movementSurface: true }) > -0.45;
}

export const beachWithHutRegion = {
  id: BEACH_WITH_HUT,
  aliases: ['beach-with-hut'],
  terrain: {
    height: beachWithHutHeight,
    movementHeight: (x, z) => beachWithHutHeight(x, z, { movementSurface: true }),
    biomeAt: beachWithHutBiomeAt,
    color: beachWithHutColor,
    isWalkable: isBeachWithHutWalkable,
  },
};
