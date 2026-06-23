import * as THREE from 'three';
import {
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';

// Alternate Post Office Bay, shaped from the satellite contour of the real
// anchorage: a crescent of pale sand facing north, a green mangrove-capped
// headland enclosing the bay on the west, a small white landing flat with the
// barrel on the northeast arm, and dry brown scrub rolling inland to the
// south with the old trail cutting through it.

const smoothstep = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// Waterline z for a given x. Water lies at z < coast (north); land to the south.
export function altPostOfficeCoastZ(x) {
  let coast = -10;
  // The beach crescent: the sea bites south into the middle of the map.
  coast += 19 * Math.exp(-Math.pow((x - 4) / 24, 2));
  // Western headland juts far north, enclosing the bay.
  coast -= 30 * smoothstep(-x, 22, 46);
  // Low eastern point closes the bay on the right.
  coast -= 9 * smoothstep(x, 36, 56);
  coast += elevationNoise(x * 0.055 + 11, 3.7) * 2.1;
  return coast;
}

// How "inside the bay" a point is (0..1), used for turquoise shallows.
export function altBayMask(x, z) {
  const along = Math.exp(-Math.pow((x - 4) / 26, 2));
  const d = z - altPostOfficeCoastZ(x);
  const seaward = smoothstep(-d, 0, 4) * (1 - smoothstep(-d, 18, 34));
  return along * seaward;
}

// Raised green headland mass on the west.
function headlandMass(x, z) {
  return Math.exp(-Math.pow((x + 42) / 24, 2) - Math.pow((z + 20) / 22, 2));
}

// Low basalt point on the east side of the bay mouth.
function eastPointMass(x, z) {
  return Math.exp(-Math.pow((x - 50) / 13, 2) - Math.pow((z + 18) / 11, 2));
}

// Flat white landing shelf where the barrel stands (northeast arm of beach).
function landingFlatMask(x, z) {
  const dx = (x - 26) / 8.5;
  const dz = (z + 1) / 5.5;
  return Math.max(0, 1 - Math.hypot(dx, dz));
}

export const ALT_POST_OFFICE_TRAIL = [
  [26, -1],
  [20, 8],
  [13, 18],
  [8, 30],
  [4, 44],
  [2, 56],
];

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

export function altPostOfficeTrailInfluence(x, z, width = 2.4, feather = 6.4) {
  let nearest = Infinity;
  for (let i = 0; i < ALT_POST_OFFICE_TRAIL.length - 1; i += 1) {
    const a = ALT_POST_OFFICE_TRAIL[i];
    const b = ALT_POST_OFFICE_TRAIL[i + 1];
    nearest = Math.min(nearest, pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]));
  }
  return 1 - smoothstep(nearest, width, feather);
}

export function altPostOfficeTerrainHeight(x, z, { movementSurface = false } = {}) {
  const coast = altPostOfficeCoastZ(x);
  const d = z - coast;
  const bay = altBayMask(x, z);
  const headland = headlandMass(x, z);
  const eastPoint = eastPointMass(x, z);

  let y;
  if (d < 0) {
    // Seafloor: inside the bay the bed shelves gradually (pale shallows ->
    // turquoise -> blue, and a wide surf zone for breakers); outside it drops
    // away quickly to open ocean.
    const slope = lerp(0.21, 0.085, bay);
    y = -0.28 + d * slope - Math.max(0, -d - 12) * 0.12 * (1 - bay);
    y = Math.max(lerp(-4.6, -3.4, bay), y);
  } else {
    // Beach berm climbing off the waterline.
    y = -0.28 + 1.55 * (1 - Math.exp(-d * 0.115));
  }

  // Rolling dry scrub plain inland.
  const inland = smoothstep(d, 6, 24);
  y += inland * (elevationNoise(x * 0.04 + 6, z * 0.044 - 3) * 1.1 + 0.5);
  // Interior rises away to the south (toward the highlands).
  y += smoothstep(z, 26, 54) * 2.7;

  // Western headland: raised, rounded, green.
  y += headland * (3.9 + Math.abs(crackNoise(x * 0.21, z * 0.19)) * (movementSurface ? 0.4 : 1.0)) * smoothstep(d, -1, 5);
  // Eastern basalt point: low dark shelf.
  y += eastPoint * 1.5 * smoothstep(d, -1, 3);

  // Landing flat: level pale shelf for the post barrel.
  const flat = landingFlatMask(x, z);
  y = lerp(y, 0.5 + terrainFineDetail(x, z) * 0.05, flat * 0.85);

  // Compacted trail.
  y += altPostOfficeTrailInfluence(x, z) * 0.16;

  // Fine surface detail (reduced on the movement surface).
  y += movementSurface ? terrainFineDetail(x, z) * 0.2 : terrainFineDetail(x, z) * 0.8;

  return Math.max(-4.8, y);
}

function altPostOfficeTerrainBlend(x, z, y = altPostOfficeTerrainHeight(x, z)) {
  const coast = altPostOfficeCoastZ(x);
  const d = z - coast;
  const bay = altBayMask(x, z);
  const headland = headlandMass(x, z);
  const eastPoint = eastPointMass(x, z);
  const surface = terrainSurfaceNoise(x, z);

  const water = smoothstep(-y, 0.5, 0.85);
  const wetSand = (1 - smoothstep(Math.abs(d), 0.6, 2.6)) * (1 - water);
  const beachArc = Math.exp(-Math.pow((x - 4) / 26, 2));
  const sandBeach = smoothstep(d, 0.4, 1.6) * (1 - smoothstep(d, 6, 12)) * (0.4 + beachArc * 0.6) * (1 - water);
  const landing = landingFlatMask(x, z) * (1 - water);
  const greenScrub = headland * smoothstep(d, 0, 4) * (1 - water);
  const blackBasalt = Math.max(
    eastPoint * smoothstep(d, -1, 2),
    smoothstep(-surface, 0.42, 0.74) * 0.5 * smoothstep(d, 4, 9),
  ) * (1 - water);
  const dryScrub = smoothstep(d, 7, 18) * (1 - headland * 0.8) * (1 - water);
  const paloSanto = smoothstep(z, 30, 50) * (1 - water);
  const trail = altPostOfficeTrailInfluence(x, z) * smoothstep(d, 1, 4) * (1 - water);

  return { water, wetSand, sandBeach, landing, greenScrub, blackBasalt, dryScrub, paloSanto, trail, bay };
}

export function altPostOfficeTerrainBiomeAt(x, z, y = altPostOfficeTerrainHeight(x, z)) {
  const blend = altPostOfficeTerrainBlend(x, z, y);
  let best = 'ash-slope';
  let bestValue = 0.3;
  [
    ['water', blend.water],
    ['wet-sand', blend.wetSand],
    ['sand-beach', Math.max(blend.sandBeach, blend.landing)],
    ['green-scrub', blend.greenScrub],
    ['black-lava', blend.blackBasalt],
    ['dry-scrub', blend.dryScrub],
    ['palo-santo', blend.paloSanto],
    ['trail', blend.trail],
  ].forEach(([biome, value]) => {
    if (value > bestValue) {
      best = biome;
      bestValue = value;
    }
  });
  return best;
}

export function altPostOfficeTerrainColor(x, z, y) {
  const blend = altPostOfficeTerrainBlend(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  if (blend.water > 0.6) return new THREE.Color('#4fc4cd');

  const color = new THREE.Color('#a08a5c'); // ash/scrub base
  const layers = [
    ['#7a6f55', blend.wetSand * 1.2],
    ['#dcc28a', blend.sandBeach * 1.4],
    ['#e7d6a8', blend.landing * 1.6],
    ['#5d7240', blend.greenScrub * 1.5],
    ['#2b2a24', blend.blackBasalt * 1.2],
    ['#8a7f4e', blend.dryScrub],
    ['#77784b', blend.paloSanto * 0.8],
    ['#cfae72', blend.trail * 1.3],
  ];
  let total = 1;
  for (const [, w] of layers) total += w;
  color.multiplyScalar(1 / total);
  for (const [hex, w] of layers) {
    color.add(new THREE.Color(hex).multiplyScalar(w / total));
  }
  color.multiplyScalar(0.92 + noise * 0.1);
  return color;
}

export function isAltPostOfficeWalkable(x, z) {
  const y = altPostOfficeTerrainHeight(x, z, { movementSurface: true });
  const d = z - altPostOfficeCoastZ(x);
  return d > -2.2 && y > -0.8;
}

export const altPostOfficeBayRegion = {
  id: 'ALT_POST_OFFICE_BAY',
  aliases: ['alt-post-office-bay', 'altpostoffice'],
  terrain: {
    height: altPostOfficeTerrainHeight,
    movementHeight: (x, z) => altPostOfficeTerrainHeight(x, z, { movementSurface: true }),
    biomeAt: altPostOfficeTerrainBiomeAt,
    color: altPostOfficeTerrainColor,
    isWalkable: isAltPostOfficeWalkable,
    defaultSpawn: [22, 0, 4],
  },
};
