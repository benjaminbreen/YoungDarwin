import * as THREE from 'three';
import {
  crackNoise,
  elevationNoise,
  ellipseDistance,
  smoothMin,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';

export function islandMask(x, z) {
  const main = ellipseDistance(x, z, 32, 38, 0, 5);
  const northHead = ellipseDistance(x, z, 20, 24, 2, 25);
  const southShelf = ellipseDistance(x, z, 30, 16, -5, -16);
  const coveBite = Math.max(0, 1 - ellipseDistance(x, z, 17, 9, 3, -29));
  const mainland = THREE.MathUtils.smoothstep(z, -28, -9);
  const southCornerFill = THREE.MathUtils.smoothstep(z, -22, -8)
    * THREE.MathUtils.smoothstep(Math.abs(x), 21, 43);
  const eastPeninsulaFill = THREE.MathUtils.smoothstep(x, 28, 42)
    * (1 - THREE.MathUtils.smoothstep(x, 58, 66))
    * (1 - THREE.MathUtils.smoothstep(Math.abs(z + 5), 8, 17));
  const mask = smoothMin(smoothMin(main, northHead, 0.34), southShelf, 0.28);
  return mask + coveBite * 0.38 - mainland * 0.34 - southCornerFill * 0.28 - eastPeninsulaFill * 0.26;
}

export function coveWaterMask(x, z) {
  const westTidePool = Math.max(0, 1 - ellipseDistance(x, z, 3.8, 2.2, -43, -17));
  const landingBay = polygonWaterMask(x, z, POST_OFFICE_BAY_WATER_POLYGON, 4.4);
  return Math.max(westTidePool * 0.8, landingBay);
}

function postOfficeLandContinuity(x, z) {
  const inland = THREE.MathUtils.smoothstep(z, -23, -8);
  const sideShelf = THREE.MathUtils.smoothstep(z, -22, -14)
    * Math.max(
      THREE.MathUtils.smoothstep(Math.abs(x), 22, 38),
      THREE.MathUtils.smoothstep(z, 2, 24),
    );
  return THREE.MathUtils.clamp(Math.max(inland, sideShelf), 0, 1);
}

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.hypot(dx, dz);
}

function pointInPolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    const intersects = ((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 0.0001) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonEdgeDistance(x, z, points) {
  let d = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    d = Math.min(d, pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]));
  }
  return d;
}

function polygonWaterMask(x, z, points, feather = 3.2) {
  const inside = pointInPolygon(x, z, points);
  const d = polygonEdgeDistance(x, z, points);
  if (inside) return THREE.MathUtils.smoothstep(d, 0, feather);
  return 0;
}

const POST_OFFICE_BAY_WATER_POLYGON = [
  [-66.0, -38.0],
  [-54.0, -33.0],
  [-45.5, -26.5],
  [-43.0, -18.6],
  [-39.0, -11.8],
  [-31.0, -5.4],
  [-20.5, -1.1],
  [-9.0, 1.7],
  [2.5, 2.7],
  [12.5, 1.6],
  [21.5, -1.4],
  [30.5, -5.6],
  [39.0, -9.8],
  [49.5, -12.5],
  [61.0, -12.0],
  [66.0, -15.0],
  [66.0, -38.0],
];

export const POST_OFFICE_BAY_TRAIL = [
  [11, 6],
  [6, 12],
  [1, 20],
  [-9, 28],
  [-23, 31],
  [-38, 27],
  [-51, 17],
  [-58, 6],
];

export function postOfficeTrailInfluence(x, z, width = 3.2, feather = 7.5) {
  let nearest = Infinity;
  for (let i = 0; i < POST_OFFICE_BAY_TRAIL.length - 1; i += 1) {
    const a = POST_OFFICE_BAY_TRAIL[i];
    const b = POST_OFFICE_BAY_TRAIL[i + 1];
    nearest = Math.min(nearest, pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]));
  }
  return 1 - THREE.MathUtils.smoothstep(nearest, width, feather);
}

function postOfficeTerrainBlend(x, z, y = postOfficeTerrainHeight(x, z)) {
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  const broad = elevationNoise(x * 0.035 + 4, z * 0.035 - 1);
  const medium = elevationNoise(x * 0.08 - 7, z * 0.075 + 5);
  const surface = terrainSurfaceNoise(x, z);
  const ridgeLine = 16 + Math.sin(x * 0.075 + 0.8) * 4.2 + broad * 4.8;
  const scrubLine = -1 + Math.sin((x - 6) * 0.095) * 3.8 + medium * 4.2;
  const lavaFront = -10 + Math.sin(z * 0.082 - 0.5) * 5.0 + medium * 4.6;
  const wetLine = -19 + Math.sin(x * 0.115 + 1.8) * 2.8 + surface * 2.6;
  const water = Math.max(
    THREE.MathUtils.smoothstep(mask, 1.0, 1.08) * (1 - continuity * 0.86),
    THREE.MathUtils.smoothstep(-y, 0.62, 0.92),
  );
  const wetBasalt = Math.max(
    THREE.MathUtils.smoothstep(cove, 0.08, 0.48),
    THREE.MathUtils.smoothstep(z - wetLine, -4, 7),
  ) * (1 - water);
  const tuffRidge = Math.max(
    THREE.MathUtils.smoothstep(z - ridgeLine, -6, 8),
    THREE.MathUtils.smoothstep(y, 4.9, 7.0),
  ) * (1 - water);
  const blackLava = Math.max(
    THREE.MathUtils.smoothstep(lavaFront - x, -8, 11),
    THREE.MathUtils.smoothstep(-surface, 0.27, 0.62) * 0.86,
  ) * (1 - water);
  const dryScrub = THREE.MathUtils.smoothstep(x - scrubLine, -8, 13)
    * THREE.MathUtils.smoothstep(z, -4, 16)
    * (1 - water);
  const paloSanto = THREE.MathUtils.smoothstep(z - (7 + Math.sin(x * 0.11) * 3.4 + broad * 3.2), -5, 8)
    * (1 - water);
  const trail = postOfficeTrailInfluence(x, z, 2.6, 6.8) * (1 - water);

  return {
    water,
    wetBasalt,
    tuffRidge,
    blackLava,
    dryScrub,
    paloSanto,
    trail,
    ashSlope: 0.72 * (1 - water),
  };
}

function strongestPostOfficeBiome(blend) {
  let best = 'ash-slope';
  let bestValue = blend.ashSlope;
  [
    ['water', blend.water],
    ['wet-basalt', blend.wetBasalt],
    ['tuff-ridge', blend.tuffRidge],
    ['black-lava', blend.blackLava],
    ['dry-scrub', blend.dryScrub],
    ['palo-santo', blend.paloSanto],
  ].forEach(([biome, value]) => {
    if (value > bestValue) {
      best = biome;
      bestValue = value;
    }
  });
  return best;
}

export function postOfficeTerrainBiomeAt(x, z, y = postOfficeTerrainHeight(x, z)) {
  return strongestPostOfficeBiome(postOfficeTerrainBlend(x, z, y));
}

export function postOfficeTerrainHeight(x, z, { movementSurface = false } = {}) {
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  const seaFalloff = Math.max(0, mask - 0.94) * (1 - continuity * 0.92);
  const coveCut = cove * 3.9;

  const cliffWall = Math.exp(-Math.pow((z + 19) / 7.2, 2)) * Math.exp(-Math.pow((x - 2) / 25, 2)) * 5.3;
  const tuffRidge = Math.exp(-Math.pow((z - 20) / 13, 2)) * (2.1 + Math.exp(-Math.pow((x + 9) / 10, 2)) * 2.7);
  const westernLavaRamp = Math.exp(-Math.pow((x + 19) / 9, 2)) * Math.exp(-Math.pow((z - 2) / 24, 2)) * 2.4;
  const overlookShoulder = Math.max(0, 1 - ellipseDistance(x, z, 16, 13, 11, 16)) * 2.2;
  const landingShelf = Math.max(0, 1 - ellipseDistance(x, z, 13, 8, -2, -8)) * 0.55;
  const bayLandingShelf = Math.max(0, 1 - ellipseDistance(x, z, 8.5, 5.2, 11.6, 5.2));
  const northBayRim = THREE.MathUtils.smoothstep(x, 20, 36)
    * (1 - THREE.MathUtils.smoothstep(x, 57, 65))
    * Math.exp(-Math.pow((z + 9.8) / 4.0, 2))
    * (1 - THREE.MathUtils.smoothstep(cove, 0.08, 0.38));
  const trail = postOfficeTrailInfluence(x, z, 2.8, 7.2);

  let y = -0.15;
  y += elevationNoise(x * 0.035 + 4, z * 0.035 - 1) * 1.45;
  y += elevationNoise(x * 0.105 - 2, z * 0.11 + 6) * 0.46;
  y += crackNoise(x * 0.42, z * 0.34) * (movementSurface ? 0.045 : 0.13);
  y += movementSurface ? terrainFineDetail(x, z) * 0.24 : terrainFineDetail(x, z);
  y += cliffWall + tuffRidge + westernLavaRamp + overlookShoulder + landingShelf;
  y += trail * 0.34;
  y -= coveCut;
  y = THREE.MathUtils.lerp(y, -0.24 + terrainFineDetail(x, z) * 0.08, bayLandingShelf * 0.82);
  y += northBayRim * 1.55;
  y -= seaFalloff * 15.5;
  y += continuity * 0.35;
  y += THREE.MathUtils.smoothstep(z, 20, 52) * 1.2;

  if (z < -24) y -= Math.abs(z + 24) * 0.18;
  if (mask > 1.08) y -= (mask - 1.08) * 18 * (1 - continuity * 0.9);
  return Math.max(-2.4, y);
}


export function postOfficeTerrainColor(x, z, y) {
  const noise = terrainSurfaceNoise(x, z);
  const biome = postOfficeTerrainBiomeAt(x, z, y);
  const blend = postOfficeTerrainBlend(x, z, y);
  if (biome === 'water') return new THREE.Color('#49b9c7');
  const color = new THREE.Color('#9b8359');
  const total = blend.ashSlope
    + blend.wetBasalt
    + blend.tuffRidge
    + blend.blackLava
    + blend.dryScrub
    + blend.paloSanto
    + blend.trail;
  color.multiplyScalar(blend.ashSlope / Math.max(0.001, total));
  color.add(new THREE.Color('#5b6657').multiplyScalar(blend.wetBasalt / Math.max(0.001, total)));
  color.add(new THREE.Color('#b69a68').multiplyScalar(blend.tuffRidge / Math.max(0.001, total)));
  color.add(new THREE.Color('#262621').multiplyScalar(blend.blackLava / Math.max(0.001, total)));
  color.add(new THREE.Color('#6f7d45').multiplyScalar(blend.dryScrub / Math.max(0.001, total)));
  color.add(new THREE.Color('#777a4c').multiplyScalar(blend.paloSanto / Math.max(0.001, total)));
  color.add(new THREE.Color('#c2aa79').multiplyScalar(blend.trail / Math.max(0.001, total)));

  color.multiplyScalar(0.9 + noise * 0.11);
  const cove = coveWaterMask(x, z);
  if (biome === 'wet-basalt') {
    color.lerp(new THREE.Color('#8dc5b4'), Math.max(0, cove - 0.24) * 0.24);
    color.lerp(new THREE.Color('#c9b17b'), THREE.MathUtils.smoothstep(cove, 0.2, 0.62) * 0.34);
  }
  if (Math.abs(noise) > 0.72 && biome !== 'water') color.lerp(new THREE.Color('#d2b776'), 0.26);
  if (z < -25 && biome !== 'water') color.lerp(new THREE.Color('#b79f70'), 0.22);
  return color;
}

export function isPostOfficeRegion(regionId) {
  return !regionId || regionId === 'POST_OFFICE_BAY' || regionId === 'post-office-bay-anchorage';
}

export function isPostOfficeWalkable(x, z) {
  const y = postOfficeTerrainHeight(x, z, { movementSurface: true });
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  const landShelf = mask < 1.02 || continuity > 0.45;
  const forgivingDryShelf = mask < 1.1 && continuity > 0.12 && y > -0.55 && cove < 0.25;
  return (landShelf || forgivingDryShelf) && y > -0.82 && cove < 0.76;
}

export const postOfficeBayRegion = {
  id: 'POST_OFFICE_BAY',
  aliases: ['post-office-bay-anchorage'],
  terrain: {
    height: postOfficeTerrainHeight,
    movementHeight: (x, z) => postOfficeTerrainHeight(x, z, { movementSurface: true }),
    biomeAt: postOfficeTerrainBiomeAt,
    color: postOfficeTerrainColor,
    isWalkable: isPostOfficeWalkable,
    defaultSpawn: [11.4, 0, 6.1],
  },
};
