import { terrainHeight } from './terrain';
import { WATER_LEVEL } from './terrainShared';
import { rockRenderTransform, rockSupportEllipsoid, rockVisualBounds } from './proceduralRocks';

// Which procedural rocks are realistically loose enough for Darwin to shift.
// A rock settled into the dirt, or a heavy block on flat ground, is fixed
// scenery. A small stone, a round rock on a steep flank, or one perched above
// the ground can be pushed, and it is handed to Rapier as a real rigid body
// (see LooseRocks.jsx) instead of rendering in the instanced RockField and
// contributing to the analytic obstacle list.

// Phase one: loose rocks are live only in these zones while the feel is tuned.
export const LOOSE_ROCK_ZONES = new Set(['POST_OFFICE_BAY', 'C_HIGH', 'W_LAVA']);

// About what a fit man can drive into a rock with legs braced, in newtons.
export const DARWIN_PUSH_FORCE = 900;
// Darwin's weight, carried by whatever loose rock he stands on.
export const DARWIN_MASS = 70;
// Speed of the rock surface under his boots (m/s): above WOBBLE he stumbles
// and catches himself, above FALL the stone has gone out from under him.
export const FOOTING_WOBBLE_SPEED = 0.45;
export const FOOTING_FALL_SPEED = 1.25;

const BASALT_DENSITY = 2600;
const SCORIA_DENSITY = 1150;
// The crag mesh is a lumpy sphere; facets and fracture cuts trim volume.
const CRAG_FILL = 0.85;
const MAX_BURIED_FRACTION = 0.3;
const MIN_TOP = 0.2;
const MIN_FOOTPRINT = 0.22;
// Everything Darwin can shift on flat ground by tipping it (F*h > m*g*d).
const FLAT_GROUND_MAX_MASS = 150;
// A round rock on a steep flank only has to be started; gravity does the rest.
const SLOPE_MIN_GRADE = 0.22;
const SLOPE_MAX_MASS = 700;
const SLOPE_MIN_ROUNDNESS = 0.4;
const PERCH_MIN_LIFT = 0.12;
const PERCH_MAX_MASS = 1200;
// Keep shoreline rocks out: water bakes and swimming read them as fixed.
const SHORE_CLEARANCE = 0.4;
const GRADE_SAMPLE = 0.6;

const classificationCache = new WeakMap();

function rockDensity(rock) {
  return rock.materialKey === 'oxidizedScoriaceousBasalt' ? SCORIA_DENSITY : BASALT_DENSITY;
}

export function rockMass(rock) {
  const { rx, ry, rz } = rockSupportEllipsoid(rock);
  return (4 / 3) * Math.PI * rx * ry * rz * CRAG_FILL * rockDensity(rock);
}

function downhillGrade(x, z, zoneId) {
  const dx = terrainHeight(x + GRADE_SAMPLE, z, zoneId) - terrainHeight(x - GRADE_SAMPLE, z, zoneId);
  const dz = terrainHeight(x, z + GRADE_SAMPLE, zoneId) - terrainHeight(x, z - GRADE_SAMPLE, zoneId);
  return Math.hypot(dx, dz) / (GRADE_SAMPLE * 2);
}

function classify(rock, zoneId) {
  const fixed = reason => ({ state: 'fixed', reason });
  if (rock.loose === false) return fixed('authored');
  const { rx, ry, rz } = rockSupportEllipsoid(rock);
  const bounds = rockVisualBounds(rock);
  const mass = rockMass(rock);
  const loose = reason => ({ state: 'loose', reason, mass });
  if (rock.loose === true) return loose('authored');
  if (!Number.isFinite(rock.y) || rock.y < WATER_LEVEL + SHORE_CLEARANCE) return fixed('shore');
  if ((rock.sink || 0) / ry > MAX_BURIED_FRACTION) return fixed('buried');
  if (bounds.top < MIN_TOP || bounds.footprint < MIN_FOOTPRINT) return fixed('pebble');
  if (mass <= FLAT_GROUND_MAX_MASS) return loose('light');
  const ground = terrainHeight(rock.x, rock.z, zoneId);
  if (rock.y - ground > PERCH_MIN_LIFT && mass <= PERCH_MAX_MASS) return loose('perched');
  const roundness = ry / Math.max(rx, rz);
  if (
    mass <= SLOPE_MAX_MASS
    && roundness >= SLOPE_MIN_ROUNDNESS
    && downhillGrade(rock.x, rock.z, zoneId) >= SLOPE_MIN_GRADE
  ) return loose('slope');
  return fixed('heavy');
}

// { state: 'loose' | 'fixed', reason, mass? } for one layout rock in a zone.
export function classifyRock(rock, zoneId) {
  if (!rock || !LOOSE_ROCK_ZONES.has(zoneId)) return { state: 'fixed', reason: 'zone' };
  let byZone = classificationCache.get(rock);
  if (!byZone) {
    byZone = new Map();
    classificationCache.set(rock, byZone);
  }
  let result = byZone.get(zoneId);
  if (!result) {
    result = classify(rock, zoneId);
    byZone.set(zoneId, result);
  }
  return result;
}

export function isLooseRock(rock, zoneId) {
  return classifyRock(rock, zoneId).state === 'loose';
}

export function looseRockKey(zoneId, rock) {
  return `${zoneId}:loose-rock:${rock.id}`;
}

// Everything the rigid body needs, derived from the same transform the
// instanced RockField draws so a loose rock looks identical until it moves.
export function looseRockBody(rock, zoneId) {
  const transform = rockRenderTransform(rock);
  const ellipsoid = rockSupportEllipsoid(rock);
  return {
    key: looseRockKey(zoneId, rock),
    rock,
    zoneId,
    position: transform.position,
    yaw: rock.yaw || 0,
    radii: [ellipsoid.rx, ellipsoid.ry, ellipsoid.rz],
    mass: rockMass(rock),
    footprint: Math.max(ellipsoid.rx, ellipsoid.rz),
  };
}

const PLAYER_MIN_ENERGY = 60;

// Rockfall damage to Darwin from the closing kinetic energy (J): nothing below
// a shove, then about one point per 20 J, capped short of an outright kill.
export function rockfallPlayerDamage(energy) {
  if (!(energy >= PLAYER_MIN_ENERGY)) return 0;
  return Math.min(60, Math.max(3, Math.round((energy - PLAYER_MIN_ENERGY) / 20)));
}

// Height of a loose rock's ellipsoid surface straight above (x, z) for its
// live rigid-body pose { x, y, z, qx, qy, qz, qw } and radii [rx, ry, rz], or
// null when (x, z) is off the rock. The body origin is the ellipsoid centre
// (rockRenderTransform), so a rolled or tipped rock still gives exact support.
export function looseRockSurfaceY(pose, radii, x, z) {
  const [rx, ry, rz] = radii;
  const dx = x - pose.x;
  const dz = z - pose.z;
  if (dx * dx + dz * dz > Math.max(rx, ry, rz) ** 2) return null;
  // Rotate world offsets into the body frame with the inverse quaternion.
  const qx = -pose.qx;
  const qy = -pose.qy;
  const qz = -pose.qz;
  const qw = pose.qw;
  const rotate = (vx, vy, vz) => {
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    return [
      vx + qw * tx + (qy * tz - qz * ty),
      vy + qw * ty + (qz * tx - qx * tz),
      vz + qw * tz + (qx * ty - qy * tx),
    ];
  };
  // Vertical ray through (x, z): local point = u + t * v.
  const u = rotate(dx, 0, dz);
  const v = rotate(0, 1, 0);
  const a = (v[0] / rx) ** 2 + (v[1] / ry) ** 2 + (v[2] / rz) ** 2;
  const b = 2 * (u[0] * v[0] / (rx * rx) + u[1] * v[1] / (ry * ry) + u[2] * v[2] / (rz * rz));
  const c = (u[0] / rx) ** 2 + (u[1] / ry) ** 2 + (u[2] / rz) ** 2 - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  return pose.y + (-b + Math.sqrt(discriminant)) / (2 * a);
}

// 'fall' | 'wobble' | null for the speed of the rock surface under Darwin.
export function footingResponse(surfaceSpeed) {
  if (surfaceSpeed >= FOOTING_FALL_SPEED) return 'fall';
  if (surfaceSpeed >= FOOTING_WOBBLE_SPEED) return 'wobble';
  return null;
}
