import { getInteriorFixedColliders } from '../interiors/interiorRegistry';

// Box colliders for the furniture and built structures in Gabriel's cave. The
// rock walls themselves need no colliders: the cave floor rises into rock
// outside the walkable plan (see world/regions/gabrielCave/terrain.js).
const cache = new Map();

export function getGabrielCaveObstacles(zoneId) {
  if (cache.has(zoneId)) return cache.get(zoneId);
  const obstacles = getInteriorFixedColliders(zoneId).map(item => {
    const [x, y, z] = item.position;
    const [width, height, depth] = item.size;
    const shape = {
      type: 'box',
      size: [width, height, depth],
      offset: [0, y, 0],
    };
    return {
      id: `gabriel-cave-${item.id}`,
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
