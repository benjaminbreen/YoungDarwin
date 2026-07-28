import * as THREE from 'three';
import {
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  pointSegmentDistance,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';

// Wetlands Forest (S_WETLANDS) - mangrove lowland rising northwest into dense
// scalesia forest. The map reads high-NW -> low-SE: the Watkins Creek seam
// spills in through a notch on the north edge, the trail follows the fall line
// past an abandoned farm plot, and the southeast lowland breaks into wet-mud
// pools around one brackish heron lagoon (the only real water surface here).
//
// Every mask below is mirrored in material.js GLSL. Change constants in both
// files together or the splat layers drift off the geometry.

export const SOUTHERN_WETLANDS = 'S_WETLANDS';

// Main spine: north seam (x=18 shared with WATKINS_CREEK_SOUTHERN_WETLANDS_SEAM)
// down through the farm terrace, then east to the SE_PROMONTORY edge.
export const WETLANDS_TRAIL = [
  [18, -49],
  [13, -37],
  [6, -26],
  [10, -14],
  [2, -3],
  [-7, 8],
  [0, 18],
  [12, 24],
  [28, 21],
  [42, 16],
  [56, 12],
];

// West spur splits at the farm approach toward S_VOLCANIC.
export const WETLANDS_TRAIL_WEST = [
  [-7, 8],
  [-22, 5],
  [-38, 2],
  [-56, 0],
];

// Shader-only wet-mud depressions. These stay above WATER_LEVEL: they read as
// swampy loam through material wetness, not as water meshes.
const POOLS = [
  { x: 30, z: 34, rx: 8, rz: 5.5, strength: 0.85 },
  { x: 40, z: 4, rx: 7, rz: 5, strength: 0.7 },
  { x: 14, z: 40, rx: 7, rz: 5, strength: 0.75 },
  { x: -34, z: 26, rx: 8, rz: 6, strength: 0.8 },
  { x: 16, z: -30, rx: 6, rz: 4.5, strength: 0.55 },
];

// The one real water body: three overlapping lobes in the south-center
// lowland, rendered by a single StandingWaterSurface in the ecology module.
const LAGOON_LOBES = [
  { x: -12, z: 30, rx: 13, rz: 8, strength: 1.0 },
  { x: 0, z: 39, rx: 9, rz: 6, strength: 0.88 },
  { x: -26, z: 36, rx: 8, rz: 5.5, strength: 0.7 },
];

// Abandoned farm plot: a levelled terrace beside the trail fork, with the
// crumbled stone wall discovery along its northeast side.
export const FARM_PLOT = { x: -18, z: -2, halfX: 7.5, halfZ: 6.5 };

function gaussianField(x, z, blobs) {
  let value = 0;
  for (const blob of blobs) {
    const dx = (x - blob.x) / blob.rx;
    const dz = (z - blob.z) / blob.rz;
    value = Math.max(value, Math.exp(-(dx * dx + dz * dz) * 2.25) * blob.strength);
  }
  return THREE.MathUtils.clamp(value, 0, 1);
}

function trailDistanceAlong(points, x, z) {
  let d = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [ax, az] = points[index];
    const [bx, bz] = points[index + 1];
    d = Math.min(d, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  return d;
}

export function wetlandsTrailInfluence(x, z, inner = 1.3, outer = 5.2) {
  const d = Math.min(
    trailDistanceAlong(WETLANDS_TRAIL, x, z),
    trailDistanceAlong(WETLANDS_TRAIL_WEST, x, z),
  );
  const wobble = terrainSurfaceNoise(x * 0.6 - 3, z * 0.66 + 8) * 0.4;
  return 1 - THREE.MathUtils.smoothstep(d + wobble, inner, outer);
}

export function wetlandsPoolMask(x, z) {
  return gaussianField(x, z, POOLS);
}

export function wetlandsLagoonField(x, z) {
  return gaussianField(x, z, LAGOON_LOBES);
}

// Open water for the StandingWaterSurface mesh and ocean-sheet suppression.
export function wetlandsStandingWaterMask(x, z) {
  return THREE.MathUtils.smoothstep(wetlandsLagoonField(x, z), 0.34, 0.66);
}

// Mud apron ringing the lagoon: outside open water, inside dry meadow.
export function wetlandsLagoonApron(x, z) {
  const field = wetlandsLagoonField(x, z);
  return THREE.MathUtils.smoothstep(field, 0.12, 0.3)
    * (1 - THREE.MathUtils.smoothstep(field, 0.34, 0.62));
}

// Normalized fall-line coordinate: -1.55 near the NW corner, +1.55 near SE.
function fallLine(x, z) {
  return THREE.MathUtils.clamp((x / 56) * 0.55 + (z / 49) * 1.0, -1.55, 1.55);
}

// Dense forest belt: map borders plus the whole NW upland, broken by trail,
// pools, lagoon, and the farm terrace so the playable corridor stays open.
export function wetlandsForestWallMask(x, z) {
  const edge = Math.max(Math.abs(x) / 56, Math.abs(z) / 49);
  const edgeWall = THREE.MathUtils.smoothstep(edge, 0.78, 0.96);
  const upWall = 1 - THREE.MathUtils.smoothstep(fallLine(x, z), -1.2, -0.1);
  const noise = terrainSurfaceNoise(x * 0.3 + 11, z * 0.31 - 7);
  const trail = wetlandsTrailInfluence(x, z, 1.4, 7.4);
  const farm = wetlandsFarmMask(x, z);
  const open = (1 - trail * 0.86)
    * (1 - wetlandsPoolMask(x, z) * 0.8)
    * (1 - THREE.MathUtils.smoothstep(wetlandsLagoonField(x, z), 0.1, 0.4))
    * (1 - farm);
  return THREE.MathUtils.clamp(
    (Math.max(edgeWall, upWall * 0.82) * (0.78 + noise * 0.26)) * open,
    0,
    1,
  );
}

export function wetlandsFarmMask(x, z) {
  const u = Math.abs(x - FARM_PLOT.x) / FARM_PLOT.halfX;
  const v = Math.abs(z - FARM_PLOT.z) / FARM_PLOT.halfZ;
  const box = Math.max(u, v);
  return 1 - THREE.MathUtils.smoothstep(box, 0.82, 1.12);
}

export function wetlandsFernBenchMask(x, z) {
  const trailEdge = wetlandsTrailInfluence(x, z, 2.2, 9.2);
  const poolEdge = wetlandsPoolMask(x, z);
  const apron = wetlandsLagoonApron(x, z);
  return THREE.MathUtils.clamp(
    Math.max(trailEdge * 0.72, Math.max(poolEdge * 0.6, apron * 0.8)),
    0,
    1,
  );
}

// Valley notch carrying the creek seam down through the northern upland lip.
function creekNotch(x, z) {
  const across = (x - 18) / 9;
  const along = 1 - THREE.MathUtils.smoothstep(z, -49, -18);
  return Math.exp(-across * across) * along;
}

export function wetlandsHeight(x, z, { movementSurface = false } = {}) {
  const broad = elevationNoise(x * 0.03 + 7, z * 0.033 - 4);
  const medium = elevationNoise(x * 0.08 - 11, z * 0.076 + 9);
  const trail = wetlandsTrailInfluence(x, z);
  const pool = wetlandsPoolMask(x, z);
  const lagoonField = wetlandsLagoonField(x, z);
  const wall = wetlandsForestWallMask(x, z);
  const farm = wetlandsFarmMask(x, z);

  const upland = (1 - THREE.MathUtils.smoothstep(fallLine(x, z), -1.2, 0.9)) * 4.6;

  let y = -0.12 + broad * 0.5 + medium * 0.24 + upland;
  y -= creekNotch(x, z) * Math.min(2.2, upland * 0.75);
  y += wall * 0.34;
  y -= trail * 0.2;
  y -= pool * 0.55;

  // Farm terrace: levelled bench cut into the lower slope.
  y = THREE.MathUtils.lerp(y, 2.0, farm * 0.85);

  // Lagoon bed: lerp toward a flat floor below WATER_LEVEL (Punta Cormorant
  // pattern) instead of subtracting, so the bed stays calm under the surface.
  const lagoonBlend = THREE.MathUtils.smoothstep(lagoonField, 0.22, 0.6);
  const lagoonCore = THREE.MathUtils.smoothstep(lagoonField, 0.35, 0.95);
  y = THREE.MathUtils.lerp(y, WATER_LEVEL - 0.32 - lagoonCore * 0.34, lagoonBlend);

  const rootRidges = Math.max(0, crackNoise(x * 0.17 + 3, z * 0.19 - 8));
  y += wall * rootRidges * (movementSurface ? 0.07 : 0.28);

  const dryDetail = (1 - lagoonBlend * 0.8) * (1 - pool * 0.5);
  y += terrainFineDetail(x, z) * dryDetail * (movementSurface ? 0.06 : 0.22);

  // Only the lagoon owns water here (Watkins rule: beds below WATER_LEVEL
  // must belong to a suppressed Water2 surface). Everywhere else gets a soft
  // floor above the shared ocean sheet, so mud pools and low trail runs read
  // as damp loam instead of catching white tidal water.
  const floorY = WATER_LEVEL + 0.08;
  if (y < floorY) {
    const guarded = floorY + (y - floorY) * 0.12;
    y = THREE.MathUtils.lerp(guarded, y, lagoonBlend);
  }
  return Math.max(-1.62, y);
}

export function wetlandsBiomeAt(x, z, y = wetlandsHeight(x, z)) {
  const lagoonMask = wetlandsStandingWaterMask(x, z);
  if (lagoonMask > 0.5 && y < WATER_LEVEL + 0.05) return 'wetland-lagoon';
  if (wetlandsLagoonApron(x, z) > 0.42 || wetlandsPoolMask(x, z) > 0.5) return 'wet-mud';
  const trail = wetlandsTrailInfluence(x, z);
  if (trail > 0.55) return 'mud-trail';
  if (wetlandsFarmMask(x, z) > 0.55) return 'farm-clearing';
  if (wetlandsFernBenchMask(x, z) > 0.5) return 'fern-bank';
  if (wetlandsForestWallMask(x, z) > 0.55) return 'forest-floor';
  if (fallLine(x, z) < -0.35) return 'upland-forest';
  return 'wet-meadow';
}

export function wetlandsColor(x, z, y) {
  const biome = wetlandsBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color();
  if (biome === 'wetland-lagoon') color.set('#2c443c');
  else if (biome === 'wet-mud') color.set('#463b2b');
  else if (biome === 'mud-trail') color.set('#54492f');
  else if (biome === 'farm-clearing') color.set('#5d6b3d');
  else if (biome === 'fern-bank') color.set('#47603c');
  else if (biome === 'forest-floor') color.set('#3d5233');
  else if (biome === 'upland-forest') color.set('#44593a');
  else color.set('#4f6a38');

  color.lerp(new THREE.Color('#232f26'), wetlandsForestWallMask(x, z) * 0.3);
  color.lerp(new THREE.Color('#758550'), Math.max(0, noise) * 0.16);
  color.lerp(new THREE.Color('#26332c'), wetlandsPoolMask(x, z) * 0.3);
  return color;
}

export function isWetlandsWalkable(x, z, config) {
  const margin = 1.8;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  if (wetlandsLagoonField(x, z) > 0.55) return false;
  const y = wetlandsHeight(x, z, { movementSurface: true });
  const trail = wetlandsTrailInfluence(x, z, 1.15, 8.0);
  if (y < WATER_LEVEL + 0.02 && trail < 0.3) return false;
  const wall = wetlandsForestWallMask(x, z);
  const fern = wetlandsFernBenchMask(x, z);
  if (wall > 0.66 && trail < 0.16 && fern < 0.3) return false;
  const step = 0.85;
  const left = wetlandsHeight(x - step, z, { movementSurface: true });
  const right = wetlandsHeight(x + step, z, { movementSurface: true });
  const back = wetlandsHeight(x, z - step, { movementSurface: true });
  const forward = wetlandsHeight(x, z + step, { movementSurface: true });
  const slope = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return slope < 0.72;
}

export const southernWetlandsRegion = {
  id: SOUTHERN_WETLANDS,
  aliases: ['southern-wetlands', 'wetlands-forest'],
  terrain: {
    height: wetlandsHeight,
    movementHeight: (x, z) => wetlandsHeight(x, z, { movementSurface: true }),
    biomeAt: wetlandsBiomeAt,
    color: wetlandsColor,
    standingWaterMask: wetlandsStandingWaterMask,
    standingWaterRendering: {
      globalWaterSuppression: {
        fadeStart: 0.08,
        fadeEnd: 0.3,
        rippleCutoff: 0.12,
      },
    },
    isWalkable: isWetlandsWalkable,
    defaultSpawn: [9, 0, -18],
    defaultFacing: [-0.3, 0, 1],
    entrySpawns: {
      north: [18, 0, -46.5],
      west: [-53, 0, 0.5],
      east: [53, 0, 12.5],
    },
    entryFacings: {
      north: [-0.15, 0, 1],
      west: [1, 0, 0],
      east: [-1, 0, 0],
    },
  },
};
