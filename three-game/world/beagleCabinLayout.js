import { BEAGLE_CABIN_ZONE_ID, getInteriorFixedColliders } from '../interiors/interiorRegistry';

let cache = null;

export function getBeagleCabinObstacles() {
  if (cache) return cache;
  cache = getInteriorFixedColliders(BEAGLE_CABIN_ZONE_ID).map(item => {
    const [x, y, z] = item.position;
    const [width, height, depth] = item.size;
    const shape = {
      type: 'box',
      size: [width, height, depth],
      offset: [0, y, 0],
    };
    return {
      id: `beagle-cabin-${item.id}`,
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
      zoneId: BEAGLE_CABIN_ZONE_ID,
      shapes: [shape],
    };
  });
  return cache;
}
