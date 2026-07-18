import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import { terrainSurfaceNoise } from '../../terrainShared';
import {
  NORTHERN_HIGHLANDS_ALT_POST_OFFICE_BAY_SEAM,
  NORTHERN_HIGHLANDS_CORMORANT_BAY_SEAM,
  NORTHERN_HIGHLANDS_WATKINS_CREEK_SEAM,
  POST_SCRUB_RISE_NORTHERN_HIGHLANDS_SEAM,
} from '../../routeSeams';

export const NORTHERN_HIGHLANDS = 'NORTHERN_HIGHLANDS';

// A four-way field trail. The western Scrub Rise approach and the southern
// Watkins Creek descent form the visual spine; the coastal routes branch
// naturally rather than meeting in a plaza-like central hub.
export const NORTHERN_HIGHLANDS_PATH_POINTS = [
  [
    [...POST_SCRUB_RISE_NORTHERN_HIGHLANDS_SEAM.target.point, 1.82],
    [-43, 6, 1.76],
    [-30, 2, 1.72],
    [-15, 5, 1.8],
    [0, 4, 1.88],
  ],
  [
    [0, 4, 1.88],
    [-5, -10, 1.72],
    [1, -24, 1.68],
    [7, -38, 1.62],
    [...NORTHERN_HIGHLANDS_CORMORANT_BAY_SEAM.source.point, 1.6],
  ],
  [
    [0, 4, 1.88],
    [14, 2, 1.76],
    [28, -3, 1.7],
    [43, -9, 1.64],
    [...NORTHERN_HIGHLANDS_ALT_POST_OFFICE_BAY_SEAM.source.point, 1.6],
  ],
  [
    [0, 4, 1.88],
    [8, 15, 1.78],
    [5, 28, 1.72],
    [-1, 40, 1.66],
    [...NORTHERN_HIGHLANDS_WATKINS_CREEK_SEAM.source.point, 1.62],
  ],
];

// The Northern Highlands keeps only one modest worked patch. Its dimensions,
// row direction, and spacing intentionally match the Penal Colony sweet-potato
// plot so the terrain furrows and interactive crop renderer share one grammar.
export const NORTHERN_HIGHLANDS_GARDENS = [
  {
    id: 'sweet-potato-plot',
    crop: 'sweetPotato',
    x: 20.5,
    z: 20,
    halfX: 6.5,
    halfZ: 3.8,
    yaw: -0.14,
    rowAxis: 'x',
    rowSpacing: 1.15,
  },
];

const SCRUB_CLUSTERS = [
  { x: -39, z: -29, rx: 14, rz: 13, strength: 0.92 },
  { x: -24, z: -17, rx: 17, rz: 15, strength: 0.86 },
  { x: 24, z: -28, rx: 18, rz: 14, strength: 0.84 },
  { x: 39, z: 4, rx: 15, rz: 18, strength: 0.8 },
  { x: -34, z: 19, rx: 18, rz: 15, strength: 0.74 },
  { x: 28, z: 39, rx: 19, rz: 12, strength: 0.7 },
];

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function rotatedLocal(x, z, cx, cz, yaw) {
  const dx = x - cx;
  const dz = z - cz;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { lx: dx * cos - dz * sin, lz: dx * sin + dz * cos };
}

export function northernHighlandsPathInfo(x, z) {
  const frame = pathFrameAt(NORTHERN_HIGHLANDS_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.2 + frame.centerX * 0.12) * 0.2
    + Math.sin(along * 0.09 - frame.centerZ * 0.17) * 0.16
    + terrainSurfaceNoise(x * 0.74 + 4, z * 0.74 - 9) * 0.24;
  const width = Math.max(1.68, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.18, width * 0.48);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.38, width * 0.84);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.46, width * 1.08)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.92, width * 1.56));
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.56, width * 1.12);
  return {
    ...frame,
    tangentX,
    tangentZ,
    width,
    center: clamp01(center),
    tread: clamp01(tread),
    shoulder: clamp01(shoulder),
    path: clamp01(path),
  };
}

// Strongest garden influence at (x, z): { mask, rowPhase, plot }.
export function northernHighlandsGardenInfo(x, z) {
  let best = { mask: 0, rowPhase: 0, plot: null };
  for (const plot of NORTHERN_HIGHLANDS_GARDENS) {
    const { lx, lz } = rotatedLocal(x, z, plot.x, plot.z, plot.yaw);
    const wobble = terrainSurfaceNoise(x * 0.5 + plot.x, z * 0.5 - plot.z) * 0.36;
    const outside = Math.max(
      Math.abs(lx) - plot.halfX + wobble,
      Math.abs(lz) - plot.halfZ + wobble,
    );
    const mask = clamp01(1 - THREE.MathUtils.smoothstep(outside, -0.85, 0.72));
    if (mask > best.mask) {
      const along = plot.rowAxis === 'x' ? lz : lx;
      best = { mask, rowPhase: (along / plot.rowSpacing) * Math.PI * 2, plot };
    }
  }
  return best;
}

export function northernHighlandsGardenFringe(x, z) {
  let fringe = 0;
  for (const plot of NORTHERN_HIGHLANDS_GARDENS) {
    const { lx, lz } = rotatedLocal(x, z, plot.x, plot.z, plot.yaw);
    const outside = Math.max(Math.abs(lx) - plot.halfX, Math.abs(lz) - plot.halfZ);
    fringe = Math.max(fringe, 1 - THREE.MathUtils.smoothstep(outside, 0.5, 5.5));
  }
  return clamp01(fringe * (1 - northernHighlandsGardenInfo(x, z).mask));
}

export function northernHighlandsMoisture(x, z) {
  const southward = THREE.MathUtils.smoothstep(z, -8, 46);
  const hollowCenter = -10 + Math.sin(z * 0.11 + 0.8) * 7;
  const hollow = Math.exp(-Math.pow((x - hollowCenter) / 9.5, 2))
    * THREE.MathUtils.smoothstep(z, 13, 45);
  const pocket = Math.exp(-Math.pow((x + 27) / 15, 2) - Math.pow((z - 29) / 16, 2));
  const cormorantEdge = northernHighlandsCormorantEcotone(x, z);
  return clamp01(southward * 0.52 + hollow * 0.44 + pocket * 0.2 + cormorantEdge * 0.58);
}

// The north edge descends toward Cormorant Bay's salt meadow. This is an
// ecotone rather than a second highland-wide moisture source: it is strongest
// at the shared edge, broken into natural patches, and fades out before the
// central fork and garden landscape.
export function northernHighlandsCormorantEcotone(x, z) {
  const edgeDepth = 1 - THREE.MathUtils.smoothstep(z, -51.5, -32);
  const lateralFade = 1 - THREE.MathUtils.smoothstep(Math.abs(x), 47, 54);
  const breakup = 0.84 + terrainSurfaceNoise(x * 0.22 + 17, z * 0.22 - 8) * 0.16;
  return clamp01(edgeDepth * lateralFade * breakup);
}

export function northernHighlandsScrubStrength(x, z) {
  let strength = 0;
  for (const cluster of SCRUB_CLUSTERS) {
    const dx = (x - cluster.x) / cluster.rx;
    const dz = (z - cluster.z) / cluster.rz;
    strength = Math.max(strength, Math.exp(-(dx * dx + dz * dz) * 1.8) * cluster.strength);
  }
  const moisture = northernHighlandsMoisture(x, z);
  const breakup = terrainSurfaceNoise(x * 0.3 - 5, z * 0.3 + 12) * 0.12;
  return clamp01(strength * (1 - moisture * 0.26) + breakup);
}

export function northernHighlandsBasaltExposure(x, z) {
  const westShoulder = Math.exp(-Math.pow((x + 42) / 12, 2) - Math.pow((z - 1) / 31, 2));
  const eastShoulder = Math.exp(-Math.pow((x - 41) / 13, 2) - Math.pow((z + 4) / 34, 2));
  const northShelf = Math.exp(-Math.pow((x - 4) / 28, 2) - Math.pow((z + 39) / 11, 2));
  const fractured = terrainSurfaceNoise(x * 0.49 + 7, z * 0.49 - 3) * 0.5 + 0.5;
  const garden = northernHighlandsGardenInfo(x, z).mask;
  return clamp01((Math.max(westShoulder, eastShoulder, northShelf) * 0.8 + fractured * 0.22) * (1 - garden));
}
