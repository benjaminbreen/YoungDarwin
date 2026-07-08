import * as THREE from 'three';
import {
  WADE_DEPTH,
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  pointSegmentDistance,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';

// Watkins Camp: the abandoned homestead of Patrick Watkins (c. 1807-1810),
// rebuilt inland between the penal colony, Rocky Clearing, and Windy
// Promontory. A grassy north plateau holds the walled homestead yard and the
// derelict two-room cabin; a clear stream crosses the hollow below it
// (fordable at the stones, deep enough to swim at two pools); basalt
// terraces climb away to the south, cut by a ravine path to the southeast.
//
// The stream bed is carved below the global WATER_LEVEL so the shared
// wade/swim/buoyancy systems treat it exactly like the sea: shallow reaches
// sit just under the surface, the pools drop past WADE_DEPTH.

export const WATKINS = 'WATKINS';

// Keep these in sync with material.js (the splat shader re-derives the same
// curves in GLSL) and with the ecology/prop layouts.
export const WATKINS_CABIN = { x: -8, z: -20 };
export const WATKINS_YARD = { x: -7, z: -18.5 };

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// --- Stream ---------------------------------------------------------------

export function watkinsRiverCenterZ(x) {
  return 10 + Math.sin(x * 0.055 + 1.2) * 4.2 + Math.sin(x * 0.021 - 0.6) * 2.4;
}

function riverHalfWidth(x) {
  return 3.4 + Math.sin(x * 0.07 + 2.0) * 0.8;
}

// Two deep pools (west of the ford and downstream to the east) and a raised
// gravel ford where the crossing path meets the water.
function poolFactor(x) {
  const west = Math.exp(-(((x + 14) / 5.5) ** 2));
  const east = Math.exp(-(((x - 20) / 6.5) ** 2));
  return clamp01(west + east);
}

function fordFactor(x) {
  return Math.exp(-(((x - 1) / 4.5) ** 2));
}

// One continuous cross-section from upland rim to river bed: `cross` runs
// 0 at the valley rim to 1 on the centerline along a concave power curve, so
// the ground eases down to the water with NO break of slope at the shore —
// the waterline is simply wherever the curve passes WATER_LEVEL.
export function watkinsRiverInfo(x, z) {
  const center = watkinsRiverCenterZ(x);
  const half = riverHalfWidth(x);
  const d = Math.abs(z - center);
  // Organic banks: the valley edge wanders with low-frequency noise so the
  // glen reads as a weathered watercourse, not a carved trench.
  const wobble = terrainSurfaceNoise(x * 0.11 + 3, z * 0.12 - 7) * 1.6;
  const outer = half + 12.0;
  const t = Math.max(0, Math.min(1, 1 - (d + wobble) / outer));
  const cross = Math.pow(t, 1.45);
  // Wet channel mask, slightly generous toward the banks so the Water2
  // surface always tucks under the shoreline instead of leaving a gap.
  const water = THREE.MathUtils.smoothstep(cross, 0.76, 0.9);
  const valley = THREE.MathUtils.smoothstep(cross, 0.03, 0.55);
  return { center, half, d, cross, water, valley, pool: poolFactor(x), ford: fordFactor(x) };
}

// Footprint for the Water2 surface geometry: deliberately wider than the wet
// channel so the mesh edge is buried ~0.3 m under the bank. If it ends near
// the waterline, terrain micro-noise lets bright shore quads saw-tooth
// through the ground.
export function watkinsStandingWaterMask(x, z) {
  return THREE.MathUtils.smoothstep(watkinsRiverInfo(x, z).cross, 0.68, 0.84);
}

// --- Southern terraces and the ravine -------------------------------------

export function watkinsCliffFactor(x, z) {
  const zd = z - watkinsRiverCenterZ(x);
  const broken = 0.82 + terrainSurfaceNoise(x * 0.14 + 7, z * 0.16 - 3) * 0.18;
  return clamp01(THREE.MathUtils.smoothstep(zd, 9, 27) * broken);
}

const RAVINE_PATH = [[30, 16], [36, 26], [41, 33], [45, 40]];

export function watkinsRavineMask(x, z) {
  let best = Infinity;
  for (let i = 0; i < RAVINE_PATH.length - 1; i += 1) {
    const [ax, az] = RAVINE_PATH[i];
    const [bx, bz] = RAVINE_PATH[i + 1];
    best = Math.min(best, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  const wobble = terrainSurfaceNoise(x * 0.32 - 5, z * 0.3 + 8) * 0.6;
  return 1 - THREE.MathUtils.smoothstep(best + wobble, 2.4, 6.4);
}

// --- Paths and the homestead yard ------------------------------------------

// One long track: north entry -> yard gate -> ford -> south-bank bench ->
// ravine foot. The west spur joins the yard from the penal colony side.
const MAIN_TRACK = [[2, -44], [1, -33], [-2, -25], [0, -13], [2, -4], [1, 6], [1, 12.7], [4, 15.5], [12, 17], [22, 16.5], [30, 16]];
const WEST_SPUR = [[-50, -14], [-38, -15.5], [-26, -17.5], [-16, -19]];

function polylineDistance(x, z, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    best = Math.min(best, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  return best;
}

export function watkinsPathInfo(x, z) {
  const d = Math.min(polylineDistance(x, z, MAIN_TRACK), polylineDistance(x, z, WEST_SPUR));
  const wobble = terrainSurfaceNoise(x * 0.5 + 2, z * 0.47 - 6) * 0.35;
  const tread = 1 - THREE.MathUtils.smoothstep(d + wobble, 1.15, 3.4);
  const center = 1 - THREE.MathUtils.smoothstep(d + wobble, 0.35, 1.5);
  return { d, tread, center };
}

export function watkinsYardMask(x, z) {
  return Math.exp(
    -(((x - WATKINS_YARD.x) / 15.5) ** 2) - (((z - WATKINS_YARD.z) / 11.5) ** 2),
  );
}

// --- Height ----------------------------------------------------------------

function uplandHeight(x, z, { movementSurface = false } = {}) {
  const broad = elevationNoise(x * 0.028 + 6.0, z * 0.031 - 4.0) * 0.62;
  const roll = Math.sin(x * 0.045 + z * 0.034) * 0.16 + Math.sin(z * 0.052 - 1.7) * 0.13;
  const northLift = THREE.MathUtils.smoothstep(-z, 24, 44) * 0.85;
  const path = watkinsPathInfo(x, z);
  const yard = watkinsYardMask(x, z);

  let y = 1.95 + broad * (1 - yard * 0.6) + roll * (1 - yard * 0.55) + northLift;
  y -= path.tread * 0.11 + path.center * 0.05;
  y -= yard * 0.22;

  // Southern basalt terraces, cut by the ravine ramp to the SE corner.
  const cliff = watkinsCliffFactor(x, z);
  if (cliff > 0.001) {
    const ravine = watkinsRavineMask(x, z);
    const lift = Math.pow(cliff, 1.18) * 6.4;
    const stepped = Math.floor(lift / 1.35) * 1.35
      + Math.abs(crackNoise(x * 0.2 - 3, z * 0.22 + 5)) * (movementSurface ? 0.16 : 0.55);
    const terraced = THREE.MathUtils.lerp(lift, stepped, 0.52);
    y += terraced * (1 - ravine * 0.82);
    y += ravine * cliff * 2.1;
  }
  return y;
}

let cabinPadY = null;
function getCabinPadY() {
  if (cabinPadY === null) cabinPadY = uplandHeight(WATKINS_CABIN.x, WATKINS_CABIN.z);
  return cabinPadY;
}

export function watkinsHeight(x, z, options = {}) {
  const movementSurface = Boolean(options.movementSurface);
  let y = uplandHeight(x, z, options);

  // Level the cabin pad hard, feathered across the yard.
  const padD = Math.hypot(x - WATKINS_CABIN.x, z - WATKINS_CABIN.z);
  if (padD < 13.5) {
    const w = 1 - THREE.MathUtils.smoothstep(padD, 5.5, 12.5);
    y = THREE.MathUtils.lerp(y, getCabinPadY(), w * 0.94);
  }

  // The stream glen: one smooth concave descent from the upland all the way
  // to the gravel bed. The bed dips ~0.6 m under the surface in the ordinary
  // reaches (fordable anywhere), ~0.2 m at the stepping-stone ford, and
  // drops into two swimmable pools.
  const river = watkinsRiverInfo(x, z);
  if (river.cross > 0.001) {
    const ripple = terrainSurfaceNoise(x * 0.62 - 4, z * 0.58 + 9)
      * (movementSurface ? 0.03 : 0.09) * river.water;
    const bed = WATER_LEVEL - 0.62 - river.pool * 2.2 + river.ford * 0.42 + ripple;
    y = THREE.MathUtils.lerp(y, bed, river.cross);
  }

  const fine = terrainFineDetail(x, z) * (movementSurface ? 0.026 : 0.11);
  y += fine * (1 - river.water * 0.7) * (1 - watkinsYardMask(x, z) * 0.4);
  return y;
}

// --- Biomes / colors --------------------------------------------------------

export function watkinsBiomeAt(x, z, y = watkinsHeight(x, z)) {
  const river = watkinsRiverInfo(x, z);
  if (river.water > 0.42 && y < WATER_LEVEL - 0.04) {
    return river.pool > 0.45 ? 'stream-pool' : 'stream-water';
  }
  if (river.valley > 0.55) return 'stream-bank';
  const path = watkinsPathInfo(x, z);
  if (path.center > 0.3 || path.tread > 0.56) return 'red-dirt-path';
  if (watkinsYardMask(x, z) > 0.42) return 'homestead-yard';
  const cliff = watkinsCliffFactor(x, z);
  if (cliff > 0.62 && watkinsRavineMask(x, z) < 0.4) return 'basalt-terrace';
  if (cliff > 0.3) return 'terrace-scrub';
  return 'dry-grass';
}

export function watkinsColor(x, z, y) {
  const biome = watkinsBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color('#77804a');
  if (biome === 'stream-pool') color.set('#254a4a');
  else if (biome === 'stream-water') color.set('#3f6e60');
  else if (biome === 'stream-bank') color.set('#5c7a42');
  else if (biome === 'red-dirt-path') color.set('#8a5a33');
  else if (biome === 'homestead-yard') color.set('#8c7c4e');
  else if (biome === 'basalt-terrace') color.set('#3a3a33');
  else if (biome === 'terrace-scrub') color.set('#6b6b42');
  else color.set('#7d7f4b');
  color.lerp(new THREE.Color('#2c381f'), Math.max(0, -noise) * 0.22);
  color.lerp(new THREE.Color('#b0a066'), Math.max(0, noise) * 0.16);
  color.multiplyScalar(0.9 + noise * 0.08);
  return color;
}

export function isWatkinsWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  if (!inBounds) return false;
  const y = watkinsHeight(x, z, { movementSurface: true });
  // The pools are swimming water, not walkable ground.
  if (y <= WATER_LEVEL - WADE_DEPTH + 0.05) return false;
  // Sheer terrace faces are climb-proof except along the ravine ramp.
  if (watkinsCliffFactor(x, z) > 0.86 && watkinsRavineMask(x, z) < 0.24) return false;
  return true;
}

export const watkinsCampRegion = {
  id: WATKINS,
  aliases: ['watkins-camp', 'WATKINS_CAMP'],
  terrain: {
    height: watkinsHeight,
    movementHeight: (x, z) => watkinsHeight(x, z, { movementSurface: true }),
    biomeAt: watkinsBiomeAt,
    color: watkinsColor,
    standingWaterMask: watkinsStandingWaterMask,
    isWalkable: isWatkinsWalkable,
    defaultSpawn: [2, 0, -32],
  },
};
