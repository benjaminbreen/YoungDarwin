import * as THREE from 'three';
import {
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';

const smoothstep = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

export const POST_OFFICE_BAY_3 = 'POST_OFFICE_BAY_3';

// A north-facing version of the Post Office Bay anchorage. Water lies north
// of this curve; land and the inland trail run toward positive z.
export function postOfficeBay3CoastZ(x) {
  let coast = -12.5;
  coast += 18.0 * Math.exp(-Math.pow((x - 5.0) / 25.0, 2.0));
  coast -= 26.0 * smoothstep(-x, 22.0, 48.0);
  coast -= 8.0 * smoothstep(x, 37.0, 56.0);
  coast += elevationNoise(x * 0.055 + 8.0, 3.1) * 1.7;
  return coast;
}

export function postOfficeBay3BayMask(x, z) {
  const coast = postOfficeBay3CoastZ(x);
  const d = z - coast;
  const along = Math.exp(-Math.pow((x - 5.0) / 28.0, 2.0));
  const shallow = smoothstep(-d, 0.0, 4.0) * (1.0 - smoothstep(-d, 17.0, 33.0));
  return along * shallow;
}

function headlandMask(x, z) {
  return Math.exp(-Math.pow((x + 42.0) / 23.0, 2.0) - Math.pow((z + 22.0) / 21.0, 2.0));
}

function eastBasaltMask(x, z) {
  return Math.exp(-Math.pow((x - 49.0) / 13.0, 2.0) - Math.pow((z + 17.0) / 10.5, 2.0));
}

export function postOfficeBay3LandingMask(x, z) {
  const dx = (x - 24.0) / 9.5;
  const dz = (z + 0.5) / 6.2;
  return clamp(1.0 - Math.hypot(dx, dz), 0, 1);
}

export const POST_OFFICE_BAY_3_TRAIL = [
  [24, -1],
  [18, 8],
  [11, 18],
  [6, 30],
  [1, 43],
  [-7, 55],
];

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

export function postOfficeBay3TrailDistance(x, z) {
  let nearest = Infinity;
  for (let i = 0; i < POST_OFFICE_BAY_3_TRAIL.length - 1; i += 1) {
    const a = POST_OFFICE_BAY_3_TRAIL[i];
    const b = POST_OFFICE_BAY_3_TRAIL[i + 1];
    nearest = Math.min(nearest, pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]));
  }
  return nearest;
}

export function postOfficeBay3TrailInfluence(x, z, width = 4.2, feather = 8.2) {
  return 1.0 - smoothstep(postOfficeBay3TrailDistance(x, z), width, feather);
}

export function postOfficeBay3TrailCenterMask(x, z) {
  return 1.0 - smoothstep(postOfficeBay3TrailDistance(x, z), 1.8, 4.2);
}

export function postOfficeBay3TrailShoulderMask(x, z) {
  const d = postOfficeBay3TrailDistance(x, z);
  return smoothstep(d, 3.3, 5.2) * (1.0 - smoothstep(d, 6.8, 10.4));
}

export function postOfficeBay3ScrubWallMask(x, z) {
  const coast = postOfficeBay3CoastZ(x);
  const inland = smoothstep(z - coast, 10.0, 21.0);
  const pathEdge = postOfficeBay3TrailShoulderMask(x, z);
  const leftWall = smoothstep(x, -36.0, -16.0) * smoothstep(z, 1.0, 18.0);
  const eastWall = smoothstep(x, 22.0, 38.0) * smoothstep(z, 3.0, 20.0);
  const backWall = smoothstep(z, 28.0, 45.0);
  return clamp(Math.max(pathEdge * 0.75, leftWall, eastWall, backWall) * inland, 0, 1);
}

function postOfficeBay3TerrainBlend(x, z, y = postOfficeBay3TerrainHeight(x, z)) {
  const coast = postOfficeBay3CoastZ(x);
  const d = z - coast;
  const bay = postOfficeBay3BayMask(x, z);
  const headland = headlandMask(x, z);
  const eastPoint = eastBasaltMask(x, z);
  const landing = postOfficeBay3LandingMask(x, z);
  const trail = postOfficeBay3TrailInfluence(x, z);
  const trailCenter = postOfficeBay3TrailCenterMask(x, z);
  const trailShoulder = postOfficeBay3TrailShoulderMask(x, z);
  const scrubWall = postOfficeBay3ScrubWallMask(x, z);
  const surface = terrainSurfaceNoise(x, z);

  const water = smoothstep(-y, 0.52, 0.9);
  const wetSand = (1.0 - smoothstep(Math.abs(d), 0.45, 2.4)) * (1.0 - water);
  const beachArc = Math.exp(-Math.pow((x - 5.0) / 28.0, 2.0));
  const shellSand = smoothstep(d, 0.3, 1.5) * (1.0 - smoothstep(d, 7.0, 13.0)) * (0.35 + beachArc * 0.65) * (1.0 - water);
  const compactedPath = Math.max(trailCenter, trail * 0.78) * smoothstep(d, 0.4, 3.4) * (1.0 - water);
  const pathShoulder = trailShoulder * smoothstep(d, 2.0, 7.0) * (1.0 - water);
  const greenHeadland = headland * smoothstep(d, -0.5, 4.5) * (1.0 - water);
  const basalt = Math.max(
    eastPoint * smoothstep(d, -1.0, 2.0),
    smoothstep(-surface, 0.48, 0.76) * 0.36 * smoothstep(d, 7.0, 13.0),
  ) * (1.0 - water);
  const denseScrub = scrubWall * (1.0 - water) * (1.0 - compactedPath * 0.92);
  const dryScrub = smoothstep(d, 6.0, 17.0) * (1.0 - headland * 0.72) * (1.0 - water) * (1.0 - compactedPath * 0.72);
  const inlandRise = smoothstep(z, 30.0, 55.0) * (1.0 - water);

  return {
    water,
    wetSand,
    shellSand,
    landing: landing * (1.0 - water),
    compactedPath,
    pathShoulder,
    greenHeadland,
    basalt,
    denseScrub,
    dryScrub,
    inlandRise,
    bay,
  };
}

export function postOfficeBay3TerrainBiomeAt(x, z, y = postOfficeBay3TerrainHeight(x, z)) {
  const blend = postOfficeBay3TerrainBlend(x, z, y);
  let best = 'dry-scrub';
  let bestValue = 0.25;
  [
    ['water', blend.water],
    ['wet-sand', blend.wetSand],
    ['shell-sand', Math.max(blend.shellSand, blend.landing)],
    ['trail', blend.compactedPath],
    ['path-shoulder', blend.pathShoulder],
    ['green-headland', blend.greenHeadland],
    ['basalt', blend.basalt],
    ['dense-scrub', blend.denseScrub],
    ['dry-scrub', blend.dryScrub],
  ].forEach(([biome, value]) => {
    if (value > bestValue) {
      best = biome;
      bestValue = value;
    }
  });
  return best;
}

export function postOfficeBay3TerrainHeight(x, z, { movementSurface = false } = {}) {
  const coast = postOfficeBay3CoastZ(x);
  const d = z - coast;
  const bay = postOfficeBay3BayMask(x, z);
  const headland = headlandMask(x, z);
  const eastPoint = eastBasaltMask(x, z);
  const landing = postOfficeBay3LandingMask(x, z);
  const trail = postOfficeBay3TrailInfluence(x, z);

  let y;
  if (d < 0) {
    const shelfSlope = lerp(0.20, 0.075, bay);
    y = -0.32 + d * shelfSlope - Math.max(0, -d - 13.0) * 0.10 * (1.0 - bay);
    y = Math.max(lerp(-4.8, -3.4, bay), y);
  } else {
    y = -0.25 + 1.45 * (1.0 - Math.exp(-d * 0.13));
  }

  const inland = smoothstep(d, 7.0, 24.0);
  y += inland * (elevationNoise(x * 0.04 + 4.0, z * 0.044 - 5.0) * 0.9 + 0.45);
  y += smoothstep(z, 28.0, 56.0) * 2.1;
  // The fractured headland is broad, collision-scale relief. Keep it in the
  // shared surface so its visible ridges cannot be walked through.
  y += headland * (3.1 + Math.abs(crackNoise(x * 0.18, z * 0.17)) * 0.85) * smoothstep(d, -1.0, 5.0);
  y += eastPoint * 1.25 * smoothstep(d, -1.0, 3.0);

  // The compacted track is smoother and slightly worn into the ash/sand.
  y -= trail * 0.085 * smoothstep(d, 0.8, 6.0);
  y = lerp(y, 0.44 + terrainFineDetail(x, z) * 0.035, landing * 0.86);

  const detailMask = 1.0 - trail * 0.65 - landing * 0.7;
  const fineDetail = terrainFineDetail(x, z) * detailMask;
  const inlandCracks = crackNoise(x * 0.34, z * 0.28) * smoothstep(d, 9.0, 20.0);
  y += fineDetail * 0.16 + inlandCracks * 0.025;
  if (!movementSurface) {
    // Retain close surface breakup without separating the rendered ground from
    // its collider by more than a boot-scale amount.
    y += clamp(fineDetail * (0.62 - 0.16) + inlandCracks * (0.08 - 0.025), -0.065, 0.065);
  }

  return Math.max(-4.9, y);
}

export function postOfficeBay3TerrainColor(x, z, y) {
  const blend = postOfficeBay3TerrainBlend(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const macro = terrainSurfaceNoise(x * 0.62 + 17.0, z * 0.58 - 9.0) * 0.5 + 0.5;
  const grassMottle = terrainSurfaceNoise(x * 1.9 - 4.0, z * 1.4 + 12.0) * 0.5 + 0.5;
  const sandGrain = terrainSurfaceNoise(x * 4.6 + 2.0, z * 4.2 - 7.0) * 0.5 + 0.5;
  const dirtGrain = terrainSurfaceNoise(x * 3.1 - 8.0, z * 1.8 + 5.0) * 0.5 + 0.5;
  const mineral = Math.abs(crackNoise(x * 1.55 + 3.0, z * 1.35 - 6.0));
  if (blend.water > 0.62) return new THREE.Color('#56c6cf');
  const color = new THREE.Color('#b6a36f');
  const layers = [
    ['#5f5b4b', blend.wetSand * 1.0],
    ['#ddc78e', blend.shellSand * 1.2],
    ['#ead7a8', blend.landing * 1.35],
    ['#8d6337', blend.compactedPath * 2.6],
    ['#56652f', blend.pathShoulder * 1.55],
    ['#384d2c', blend.greenHeadland * 1.5],
    ['#25241f', blend.basalt * 1.2],
    ['#30381f', blend.denseScrub * 1.9],
    ['#55632f', blend.dryScrub * 1.35],
  ];
  let total = 1;
  for (const [, weight] of layers) total += weight;
  color.multiplyScalar(1 / total);
  for (const [hex, weight] of layers) color.add(new THREE.Color(hex).multiplyScalar(weight / total));
  color.lerp(new THREE.Color('#4e642f'), clamp(blend.dryScrub * 0.42, 0, 0.55));
  color.lerp(new THREE.Color('#263219'), clamp(blend.denseScrub * 0.64, 0, 0.72));
  color.lerp(new THREE.Color('#d9c083'), clamp(Math.max(blend.shellSand, blend.landing) * 0.48, 0, 0.68));
  color.lerp(new THREE.Color('#7b512b'), clamp(blend.compactedPath * 0.78, 0, 0.86));
  color.lerp(new THREE.Color('#536a34'), clamp(blend.pathShoulder * 0.58, 0, 0.66));
  color.lerp(new THREE.Color('#282621'), clamp(blend.basalt * 0.72, 0, 0.82));
  const sandMask = Math.max(blend.shellSand, blend.landing);
  const trailMask = blend.compactedPath;
  const grassMask = clamp(blend.dryScrub * (1 - blend.denseScrub * 0.35) * (1 - trailMask * 0.65), 0, 1);
  color.lerp(new THREE.Color('#2f3e1d'), clamp(grassMask * grassMottle * 0.22, 0, 0.22));
  color.lerp(new THREE.Color('#6b6538'), clamp(grassMask * (1 - grassMottle) * 0.14, 0, 0.14));
  color.lerp(new THREE.Color('#2b3019'), clamp(blend.denseScrub * macro * 0.28, 0, 0.28));
  color.lerp(new THREE.Color('#90704a'), clamp(trailMask * dirtGrain * 0.22, 0, 0.22));
  color.lerp(new THREE.Color('#4f3b25'), clamp(trailMask * mineral * 0.18, 0, 0.18));
  color.lerp(new THREE.Color('#ead8a6'), clamp(sandMask * sandGrain * 0.20, 0, 0.20));
  color.lerp(new THREE.Color('#7b7257'), clamp(blend.wetSand * mineral * 0.16, 0, 0.16));
  color.multiplyScalar(clamp(0.84 + (noise * 0.5 + 0.5) * 0.22 + mineral * 0.08, 0.72, 1.16));
  return color;
}

export function isPostOfficeBay3Walkable(x, z) {
  const y = postOfficeBay3TerrainHeight(x, z, { movementSurface: true });
  const d = z - postOfficeBay3CoastZ(x);
  return d > -2.4 && y > -0.82;
}

export const postOfficeBay3Region = {
  id: POST_OFFICE_BAY_3,
  aliases: ['post-office-bay-3', 'postofficebay3'],
  terrain: {
    height: postOfficeBay3TerrainHeight,
    movementHeight: (x, z) => postOfficeBay3TerrainHeight(x, z, { movementSurface: true }),
    biomeAt: postOfficeBay3TerrainBiomeAt,
    color: postOfficeBay3TerrainColor,
    isWalkable: isPostOfficeBay3Walkable,
    defaultSpawn: [23.5, 0, 3.5],
  },
};
