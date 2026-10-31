import { fieldGradient, sampleField } from '../caveField';
import { caveAuthoredFloor, caveCeilingHeight, getCaveRuntime } from '../caveRuntime';

// Where furnishings meet the rock. The rendered shell is the zero surface of
// the cave field, so these march through the same field rather than trusting
// the authored plan, which ignores wall and floor noise.

function refine(field, ax, ay, az, bx, by, bz) {
  // Bisect between an air point (a) and a rock point (b).
  for (let i = 0; i < 10; i += 1) {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const mz = (az + bz) / 2;
    if (sampleField(field, mx, my, mz) < 0) {
      ax = mx; ay = my; az = mz;
    } else {
      bx = mx; by = my; bz = mz;
    }
  }
  return [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2];
}

// Rock floor under (x, z): the highest air→rock crossing below `fromY`.
export function floorAt(zoneId, x, z, fromY = null) {
  const runtime = getCaveRuntime(zoneId);
  const authored = caveAuthoredFloor(zoneId, x, z);
  if (!runtime) return authored;
  const { field } = runtime;
  let y = fromY ?? authored + 1.2;
  if (sampleField(field, x, y, z) >= 0) return authored;
  const step = field.step * 0.4;
  for (let i = 0; i < 80; i += 1) {
    const next = y - step;
    if (sampleField(field, x, next, z) >= 0) return refine(field, x, y, z, x, next, z)[1];
    y = next;
  }
  return authored;
}

export function ceilingAt(zoneId, x, z) {
  return caveCeilingHeight(zoneId, x, z);
}

// March horizontally from (x, y, z) along `dir` [dx, dz] until the wall, and
// return the contact point and the outward (into-air) normal there.
export function wallAnchor(zoneId, x, y, z, dir, maxDistance = 8) {
  const runtime = getCaveRuntime(zoneId);
  if (!runtime) return null;
  const { field } = runtime;
  const length = Math.hypot(dir[0], dir[1]) || 1;
  const dx = dir[0] / length;
  const dz = dir[1] / length;
  const step = field.step * 0.3;
  let px = x;
  let pz = z;
  if (sampleField(field, px, y, pz) >= 0) return null;
  for (let travelled = 0; travelled < maxDistance; travelled += step) {
    const nx = px + dx * step;
    const nz = pz + dz * step;
    if (sampleField(field, nx, y, nz) >= 0) {
      const point = refine(field, px, y, pz, nx, y, nz);
      const gradient = fieldGradient(field, point[0], point[1], point[2]);
      const normal = [-gradient[0], -gradient[1], -gradient[2]];
      return { position: point, normal };
    }
    px = nx;
    pz = nz;
  }
  return null;
}

// Yaw that turns a +z-facing plane to face along a horizontal normal.
export function yawFacing(normal) {
  return Math.atan2(normal[0], normal[2]);
}
