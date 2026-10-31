import { getInteriorFixedColliders } from '../interiors/interiorRegistry';

// Box colliders for the walls and furniture of the hut interiors (the
// whalers' hut and the colonist's rancho), from their blueprints'
// fixedColliders. The hut scenes draw every piece inside these boxes.
const cache = new Map();

const PREFIX = {
  WHALERS_HUT_INTERIOR: 'whalers-hut',
  COLONIST_RANCHO: 'colonist-rancho',
};

export function getHutInteriorObstacles(zoneId) {
  if (cache.has(zoneId)) return cache.get(zoneId);
  const prefix = PREFIX[zoneId] || zoneId.toLowerCase();
  const obstacles = getInteriorFixedColliders(zoneId).map(item => {
    const [x, y, z] = item.position;
    const [width, height, depth] = item.size;
    const shape = { type: 'box', size: [width, height, depth], offset: [0, y, 0] };
    return {
      id: `${prefix}-${item.id}`,
      kind: item.kind || 'structure',
      path: null,
      x,
      z,
      baseX: x,
      baseZ: z,
      radius: Math.hypot(width, depth) * 0.5,
      height,
      colliderTop: y + height * 0.5,
      colliderBottom: y - height * 0.5,
      scale: 1,
      yaw: item.yaw || 0,
      jumpable: false,
      climbable: false,
      edgeRisk: false,
      pushable: false,
      mobility: { mode: 'fixed' },
      definition: { collider: shape },
      zoneId,
      shapes: [shape],
    };
  });
  cache.set(zoneId, obstacles);
  return obstacles;
}
