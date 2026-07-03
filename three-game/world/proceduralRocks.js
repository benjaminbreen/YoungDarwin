const DEFAULT_RADIUS_SCALE = 0.86;

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
    ...(extra ? extra(rock, { bounds, top, radius, collider }) : null),
  };
}

export function buildRockObstacles(rocks, {
  filter = rock => rockVisualBounds(rock).height > 0.5,
  ...options
} = {}) {
  return rocks
    .filter(filter)
    .map(rock => buildRockObstacle(rock, options));
}
