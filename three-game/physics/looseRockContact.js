// Pure geometry for Darwin against loose rocks (physics/props/LooseRocks.jsx).
// His capsule never meets a loose rock in Rapier (collisionGroups.js), so
// everything here works from the live pose LooseRocks publishes:
// { x, y, z, qx, qy, qz, qw } plus the ellipsoid radii [rx, ry, rz].

// Tallest rise Darwin takes in his stride (metres). Shared with the walk-into
// step-up in PlayerController so a loose rock is never easier to climb than
// any other obstacle.
export const MAX_WALK_STEP_HEIGHT = 0.75;
const PLAYER_BODY_HEIGHT = 1.75;
const PLAYER_BLOCK_RADIUS = 0.42;
// Feet this close above the surface under them count as standing on it.
const STANDING_TOLERANCE = 0.1;

// The ellipsoid's world shape matrix S = (R D)(R D)^T, D = diag(radii). The
// rock is { p : (p - c)^T S^-1 (p - c) <= 1 }, so its highest point is
// c.y + sqrt(S_yy) and its ground shadow is the 2x2 x/z block of S.
function shapeMatrix(pose, radii) {
  const { qx = 0, qy = 0, qz = 0, qw = 1 } = pose;
  const columns = [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy)],
    [2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx)],
    [2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)],
  ].map((column, index) => column.map(value => value * radii[index]));
  const entry = (row, col) => columns.reduce((sum, column) => sum + column[row] * column[col], 0);
  return { xx: entry(0, 0), xz: entry(0, 2), zz: entry(2, 2), yy: entry(1, 1) };
}

// Highest and lowest points of a loose rock in its live pose.
export function looseRockVerticalExtent(pose, radii) {
  const half = Math.sqrt(shapeMatrix(pose, radii).yy);
  return { top: pose.y + half, bottom: pose.y - half };
}

// The rock's ground shadow grown by `inflate` metres along both principal
// axes: { inverse: [a, b, c] } with (dx, dz) inside when
// a*dx^2 + 2*b*dx*dz + c*dz^2 < 1.
function inflatedShadow(pose, radii, inflate) {
  const { xx, xz, zz } = shapeMatrix(pose, radii);
  const mean = (xx + zz) / 2;
  const spread = Math.sqrt(((xx - zz) / 2) ** 2 + xz * xz);
  const major = mean + spread;
  const minor = Math.max(1e-6, mean - spread);
  // Major axis direction of the shadow.
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const inverseMajor = 1 / (Math.sqrt(major) + inflate) ** 2;
  const inverseMinor = 1 / (Math.sqrt(minor) + inflate) ** 2;
  return [
    inverseMajor * cos * cos + inverseMinor * sin * sin,
    (inverseMajor - inverseMinor) * cos * sin,
    inverseMajor * sin * sin + inverseMinor * cos * cos,
  ];
}

// Lateral block for loose rocks too tall to step onto. Returns null, or
// { x, z, normal: { x, y: 0, z }, penetration, state } with the feet pushed
// out of the rock's (radius-inflated) shadow. `surfaceY(state, x, z)` gives
// the rock surface straight above a point, or null off the rock, so a Darwin
// already standing on a rock is never shoved off it.
export function resolveLooseRockBlock(position, states, surfaceY, {
  playerRadius = PLAYER_BLOCK_RADIUS,
  stepHeight = MAX_WALK_STEP_HEIGHT,
  bodyHeight = PLAYER_BODY_HEIGHT,
} = {}) {
  let x = position.x;
  let z = position.z;
  const feetY = position.y;
  let hit = null;
  for (const state of states) {
    if (!state?.radii) continue;
    const { top, bottom } = looseRockVerticalExtent(state, state.radii);
    if (top <= feetY + stepHeight || bottom >= feetY + bodyHeight) continue;
    const dx = x - state.x;
    const dz = z - state.z;
    const [a, b, c] = inflatedShadow(state, state.radii, playerRadius);
    const q = a * dx * dx + 2 * b * dx * dz + c * dz * dz;
    if (q >= 1) continue;
    const under = surfaceY(state, x, z);
    if (under !== null && under <= feetY + STANDING_TOLERANCE) continue;
    let nx;
    let nz;
    let outX;
    let outZ;
    if (q < 1e-8) {
      // Dead centre: leave along the shadow's shortest way out, the axis of
      // the larger eigenvalue of [[a, b], [b, c]].
      const angle = 0.5 * Math.atan2(2 * b, a - c);
      nx = Math.cos(angle);
      nz = Math.sin(angle);
      const reach = 1 / Math.sqrt(a * nx * nx + 2 * b * nx * nz + c * nz * nz);
      outX = state.x + nx * reach;
      outZ = state.z + nz * reach;
    } else {
      // Radial projection onto the boundary; the outward normal is the
      // shadow's gradient there.
      const scale = 1 / Math.sqrt(q);
      outX = state.x + dx * scale;
      outZ = state.z + dz * scale;
      const gx = a * dx + b * dz;
      const gz = b * dx + c * dz;
      const length = Math.hypot(gx, gz) || 1;
      nx = gx / length;
      nz = gz / length;
    }
    const penetration = Math.hypot(outX - x, outZ - z);
    x = outX;
    z = outZ;
    hit = { normal: { x: nx, y: 0, z: nz }, penetration, state, top };
  }
  return hit ? { ...hit, x, z } : null;
}

// Hammer swings: the one loose rock a swing from `origin` along `facing`
// lands on, or null. Nearest rim first, with a little preference for the rock
// squarely ahead, the same way rock sampling picks its boulder.
export function selectLooseRockStrikeTarget(states, origin, facing, {
  range = 2.6,
  facingDot = 0.3,
  footprintScale = 0.85,
} = {}) {
  const fx = facing?.x || 0;
  const fz = facing?.z || 0;
  const facingLength = Math.hypot(fx, fz) || 1;
  let best = null;
  for (const state of states) {
    if (!state?.radii) continue;
    const dx = state.x - (origin?.x || 0);
    const dz = state.z - (origin?.z || 0);
    const distance = Math.hypot(dx, dz);
    const rim = distance - Math.max(state.radii[0], state.radii[2]) * footprintScale;
    if (rim > range) continue;
    const dot = distance > 0.2 ? (dx * fx + dz * fz) / (distance * facingLength) : 1;
    if (dot < facingDot) continue;
    const score = Math.max(0, rim) - dot * 0.6;
    if (!best || score < best.score) {
      best = {
        key: state.id,
        state,
        rim,
        score,
        direction: distance > 0.2
          ? { x: dx / distance, z: dz / distance }
          : { x: fx / facingLength, z: fz / facingLength },
      };
    }
  }
  return best;
}
