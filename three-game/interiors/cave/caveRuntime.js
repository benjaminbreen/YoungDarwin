// Per-zone cache of the cave field and its walkable floor.
//
// The physics heightfield, movement queries, fauna steering and the rendered
// shell all read through here, so a zone's field is sampled once per session.

import { getGabrielCaveBlueprint } from '../blueprints/gabrielCave';
import {
  buildCaveField,
  buildFloorGrid,
  caveFloorFunction,
  planDistance,
  polygonDistance,
  sampleField,
  sampleFloorGrid,
  smin,
} from './caveField';

const cache = new Map();

export function getCaveSpec(zoneId) {
  return getGabrielCaveBlueprint(zoneId)?.cave || null;
}

export function getCaveRuntime(zoneId) {
  if (cache.has(zoneId)) return cache.get(zoneId);
  const spec = getCaveSpec(zoneId);
  if (!spec) return null;
  const field = buildCaveField(spec);
  const floorGrid = buildFloorGrid(field);
  const runtime = { zoneId, spec, field, floorGrid };
  cache.set(zoneId, runtime);
  return runtime;
}

// Signed distance to the walkable plan (negative inside), honouring holes such
// as the spring pool.
export function caveWalkDistance(spec, x, z) {
  const walk = spec.walk || spec.air;
  let d = Infinity;
  const blend = walk.blend ?? 0.6;
  for (const polygon of walk.polygons || []) {
    const value = polygonDistance(x, z, polygon);
    d = d === Infinity ? value : smin(d, value, blend);
  }
  for (const capsule of walk.capsules || []) {
    const ex = capsule.b[0] - capsule.a[0];
    const ez = capsule.b[1] - capsule.a[1];
    const t = Math.max(0, Math.min(1, ((x - capsule.a[0]) * ex + (z - capsule.a[1]) * ez) / (ex * ex + ez * ez || 1e-9)));
    const value = Math.hypot(x - (capsule.a[0] + ex * t), z - (capsule.a[1] + ez * t)) - capsule.r;
    d = d === Infinity ? value : smin(d, value, blend);
  }
  for (const hole of walk.holes || []) {
    d = Math.max(d, -polygonDistance(x, z, hole));
  }
  return d;
}

export function isCaveWalkable(zoneId, x, z) {
  const spec = getCaveSpec(zoneId);
  if (!spec) return false;
  return caveWalkDistance(spec, x, z) < -(spec.walk?.margin ?? 0.3);
}

export function caveMovementHeight(zoneId, x, z) {
  const runtime = getCaveRuntime(zoneId);
  if (!runtime) return 0;
  return sampleFloorGrid(runtime.field, runtime.floorGrid, x, z);
}

// Cheap analytic floor (no grid) for colouring and ground-cover placement.
export function caveAuthoredFloor(zoneId, x, z) {
  const spec = getCaveSpec(zoneId);
  return spec ? caveFloorFunction(spec, x, z) : 0;
}

export function cavePlanDistance(zoneId, x, z) {
  const spec = getCaveSpec(zoneId);
  return spec ? planDistance(spec, x, z) : Infinity;
}

// The authored ceiling (rough, without wall noise) at a column, used to hang
// lava stalactites, roots, and lamps from the roof.
export function caveCeilingHeight(zoneId, x, z) {
  const runtime = getCaveRuntime(zoneId);
  if (!runtime) return 4;
  const { field } = runtime;
  const i = Math.round((x - field.min[0]) / field.step);
  const k = Math.round((z - field.min[2]) / field.step);
  if (i < 0 || k < 0 || i >= field.nx || k >= field.nz) return 4;
  // Walk down from the top of the grid to the first rock-to-air crossing.
  const { ny, nx, values, step, min } = field;
  let previous = values[(k * ny + (ny - 1)) * nx + i];
  for (let j = ny - 2; j >= 0; j -= 1) {
    const value = values[(k * ny + j) * nx + i];
    if (previous >= 0 && value < 0) {
      return min[1] + j * step + step * (value / (value - previous));
    }
    previous = value;
  }
  return field.columnCeiling[k * nx + i];
}

// Distance along a ray (origin → direction, up to maxDistance) before it
// enters rock, for keeping the chase camera inside the cave. Coarse steps,
// then a short bisection; `skin` keeps the hit a little short of the wall.
export function caveRayDistance(zoneId, origin, direction, maxDistance, skin = 0.08) {
  const runtime = getCaveRuntime(zoneId);
  if (!runtime) return maxDistance;
  const { field } = runtime;
  const step = field.step * 0.6;
  let previous = 0;
  for (let t = step; t <= maxDistance + 1e-6; t += step) {
    const value = sampleField(field, origin.x + direction.x * t, origin.y + direction.y * t, origin.z + direction.z * t);
    if (value > -skin) {
      let lo = previous;
      let hi = t;
      for (let i = 0; i < 6; i += 1) {
        const mid = (lo + hi) / 2;
        const v = sampleField(field, origin.x + direction.x * mid, origin.y + direction.y * mid, origin.z + direction.z * mid);
        if (v > -skin) hi = mid;
        else lo = mid;
      }
      return lo;
    }
    previous = t;
  }
  return maxDistance;
}
