const DEFAULT_RADIUS_SCALE = 0.86;
// Rocks below a layout's collider filter used to be pure decoration, so Darwin
// waded straight through ankle-high stones. Anything from a low step up to the
// auto-traverse height now gives walk-over support (no blocking collider).
// Walk-over traversal starts above 0.18m; lower stones stay decoration.
const SUPPORT_STONE_MIN_TOP = 0.2;
const SUPPORT_STONE_MAX_TOP = 0.75;
const SUPPORT_STONE_MIN_FOOTPRINT = 0.3;

export function rockRenderTransform(rock) {
  return {
    position: [
      rock.x,
      rock.y + (rock.radiusY || 0) - (rock.sink || 0) * 2,
      rock.z,
    ],
    rotation: [0, rock.yaw || 0, 0],
    scale: [rock.radiusX || 0.4, rock.radiusY || 0.32, rock.radiusZ || 0.34],
  };
}

// A scattered rock is placed by the terrain height at its centre, which leaves
// the whole lower half of the crag ellipsoid above ground: on the flat it reads
// as a bun set down on the sand, on a slope its downhill side hangs in the air.
// Seat it on the lowest point under its footprint instead and bury `embed` of
// its height (render sinks 2 * sink of a 2 * radiusY crag), which leaves the
// widest part just above the lowest ground and below it everywhere else.
const SEAT_SAMPLES = 8;
export function seatRockInTerrain(rock, heightAt, embed = 0.42) {
  const radiusX = rock.radiusX || 0.4;
  const radiusY = rock.radiusY || 0.32;
  const radiusZ = rock.radiusZ || 0.34;
  const cos = Math.cos(rock.yaw || 0);
  const sin = Math.sin(rock.yaw || 0);
  let lowest = heightAt(rock.x, rock.z);
  for (let i = 0; i < SEAT_SAMPLES; i += 1) {
    const angle = (i / SEAT_SAMPLES) * Math.PI * 2;
    const lx = Math.cos(angle) * radiusX * 0.85;
    const lz = Math.sin(angle) * radiusZ * 0.85;
    lowest = Math.min(lowest, heightAt(rock.x + lx * cos + lz * sin, rock.z - lx * sin + lz * cos));
  }
  return { ...rock, y: lowest, sink: Math.max(rock.sink || 0, radiusY * embed) };
}

export function rockVisualBounds(rock) {
  const transform = rockRenderTransform(rock);
  const radiusX = rock.radiusX || 0.4;
  const radiusY = rock.radiusY || 0.32;
  const radiusZ = rock.radiusZ || 0.34;
  const top = transform.position[1] + radiusY - rock.y;
  const bottom = Math.max(0, transform.position[1] - radiusY - rock.y);
  return {
    top,
    bottom,
    height: Math.max(0, top - bottom),
    footprint: Math.max(radiusX, radiusZ),
  };
}

// The rendered rock is a unit crag mesh scaled by radiusX/Y/Z and yawed, so an
// ellipsoid in the rock's local frame is the closest analytic match to what
// the player sees. cy is the ellipsoid centre above the rock's base height.
export function rockSupportEllipsoid(rock) {
  const transform = rockRenderTransform(rock);
  const [rx, ry, rz] = transform.scale;
  return { rx, ry, rz, cy: transform.position[1] - rock.y };
}

function makeRockCollider(radius, top, shape) {
  if (shape === 'cylinder') {
    return {
      type: 'cylinder',
      radius,
      height: top,
      offset: [0, top * 0.5, 0],
    };
  }
  return {
    type: 'ball',
    radius,
    offset: [0, top - radius, 0],
  };
}

export function buildRockObstacle(rock, {
  zoneId,
  idPrefix = zoneId,
  radiusScale = DEFAULT_RADIUS_SCALE,
  colliderShape = 'ball',
  traversalLabel = 'scramble over basalt',
  climbLabel = 'basalt boulder',
  pushFriction = 0.88,
  minTop = 0.18,
  boundsForRock = rockVisualBounds,
  extra = null,
} = {}) {
  const bounds = boundsForRock(rock);
  const top = Math.max(minTop, bounds.top);
  const radius = Math.max(0.1, bounds.footprint * radiusScale);
  const collider = makeRockCollider(radius, top, colliderShape);
  return {
    id: `${idPrefix}-${rock.id}`,
    kind: 'rock',
    // Marks rocks whose visual comes from the procedural RockField renderer,
    // so hammer damage can carve/break the matching instanced mesh.
    proceduralRock: true,
    path: null,
    x: rock.x,
    z: rock.z,
    radius,
    height: top,
    colliderTop: top,
    colliderBottom: 0,
    visualBounds: bounds,
    scale: 1,
    yaw: rock.yaw || 0,
    jumpable: top >= 0.72,
    climbable: top >= 1.1,
    edgeRisk: false,
    pushable: false,
    pushMass: 1,
    pushFriction,
    traversalLabel,
    climbLabel,
    definition: { collider },
    zoneId,
    shapes: [collider],
    ellipsoid: rockSupportEllipsoid(rock),
    sourceRock: rock,
    ...(extra ? extra(rock, { bounds, top, radius, collider }) : null),
  };
}

// Layouts flag their few path-blocking rocks with `obstacle: true` or
// `collide: true` and default the rest to false. That flag only means "not a
// blocker": every visible rock still needs a body, or Darwin wades through it.
// Low ones become walk-over support stones; anything above a step blocks.
function unflaggedRockBody(rock) {
  const bounds = rockVisualBounds(rock);
  if (bounds.top < SUPPORT_STONE_MIN_TOP || bounds.footprint < SUPPORT_STONE_MIN_FOOTPRINT) return null;
  return bounds.top <= SUPPORT_STONE_MAX_TOP ? 'stone' : 'rock';
}

// Walk-over support only: kind 'stone' keeps these out of rock-specific
// systems (hammer breakage, examine prompts, water bakes, basking/roost
// searches), and the explicit step-up traversal keeps them out of Rapier and
// lateral obstacle collision.
export function buildSupportStone(rock, { zoneId, idPrefix = zoneId } = {}) {
  const bounds = rockVisualBounds(rock);
  const top = bounds.top;
  const radius = Math.max(0.1, bounds.footprint);
  const collider = { type: 'cylinder', radius, height: top, offset: [0, top * 0.5, 0] };
  return {
    id: `${idPrefix}-${rock.id}-stone`,
    kind: 'stone',
    supportOnly: true,
    path: null,
    x: rock.x,
    z: rock.z,
    radius,
    height: top,
    colliderTop: top,
    colliderBottom: 0,
    visualBounds: bounds,
    scale: 1,
    yaw: rock.yaw || 0,
    jumpable: false,
    climbable: false,
    edgeRisk: false,
    pushable: false,
    pushMass: 1,
    mobility: { mode: 'fixed' },
    traversal: 'step-up',
    definition: { collider },
    zoneId,
    shapes: [collider],
    ellipsoid: rockSupportEllipsoid(rock),
    sourceRock: rock,
  };
}

export function buildRockObstacles(rocks, {
  filter = rock => rockVisualBounds(rock).height > 0.5,
  supportStones = true,
  ...options
} = {}) {
  const obstacles = [];
  for (const rock of rocks) {
    if (filter(rock)) {
      obstacles.push(buildRockObstacle(rock, options));
      continue;
    }
    if (!supportStones) continue;
    const body = unflaggedRockBody(rock);
    if (body === 'stone') obstacles.push(buildSupportStone(rock, options));
    else if (body === 'rock') obstacles.push(buildRockObstacle(rock, options));
  }
  return obstacles;
}
