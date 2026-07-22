import { terrainHeight } from '../../world/terrain';

export function propHorizontalRadius(prop) {
  const scale = prop?.scale || 1;
  const collider = prop?.collider || {};
  if (collider.shape === 'cuboid') {
    const [hx = 0.42, , hz = 0.42] = collider.halfExtents || [];
    return Math.hypot(hx * scale, hz * scale);
  }
  if (collider.shape === 'ball') return (collider.radius || 0.34) * scale;
  if (collider.shape === 'cylinder') {
    const [rx = 0, , rz = 0] = prop.rotation || [];
    const sideways = Math.abs(Math.sin(rx)) > 0.55 || Math.abs(Math.sin(rz)) > 0.55;
    const radius = collider.radius || 0.4;
    const halfHeight = collider.halfHeight || radius;
    return (sideways ? Math.max(radius, halfHeight) : radius) * scale;
  }
  return (collider.radius || 0.42) * scale;
}

export function propColliderHeight(prop) {
  const scale = prop?.scale || 1;
  const collider = prop?.collider || {};
  if (collider.shape === 'cuboid') return (collider.halfExtents?.[1] || 0.42) * 2 * scale;
  if (collider.shape === 'ball') return (collider.radius || 0.34) * 2 * scale;
  if (collider.shape === 'cylinder') {
    const [rx = 0, , rz = 0] = prop.rotation || [];
    const sideways = Math.abs(Math.sin(rx)) > 0.55 || Math.abs(Math.sin(rz)) > 0.55;
    return (sideways ? (collider.radius || 0.4) * 2 : (collider.halfHeight || 0.45) * 2) * scale;
  }
  return 0.85 * scale;
}

// Lightweight actor-vs-prop separation shared by autonomous characters.
// Prop definitions provide the authored collider dimensions; propRuntime
// overlays live Rapier positions so actors follow objects after they move.
export function resolveActorPropCollision(
  position,
  previousPosition,
  props,
  zoneId,
  actorRadius = 0.42,
) {
  const resolved = position.clone();
  let collided = null;
  for (const prop of props || []) {
    if (!prop?.collider || !Number.isFinite(prop.x) || !Number.isFinite(prop.z)) continue;
    const propRadius = propHorizontalRadius(prop);
    const combinedRadius = Math.max(0.05, propRadius + actorRadius);
    const dx = resolved.x - prop.x;
    const dz = resolved.z - prop.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq >= combinedRadius * combinedRadius) continue;

    const colliderHeight = propColliderHeight(prop);
    const propTop = Number.isFinite(prop.y)
      ? prop.y + colliderHeight * 0.5
      : terrainHeight(prop.x, prop.z, zoneId) + colliderHeight;
    if (resolved.y > propTop + 0.35) continue;

    const distance = Math.sqrt(distanceSq);
    let normalX = 1;
    let normalZ = 0;
    if (distance > 0.0001) {
      normalX = dx / distance;
      normalZ = dz / distance;
    } else if (previousPosition) {
      const previousDx = previousPosition.x - prop.x;
      const previousDz = previousPosition.z - prop.z;
      const previousDistance = Math.hypot(previousDx, previousDz);
      if (previousDistance > 0.0001) {
        normalX = previousDx / previousDistance;
        normalZ = previousDz / previousDistance;
      }
    }

    const penetration = combinedRadius - distance;
    resolved.x += normalX * penetration;
    resolved.z += normalZ * penetration;
    const previousDistance = previousPosition
      ? Math.hypot(previousPosition.x - prop.x, previousPosition.z - prop.z)
      : Infinity;
    const currentDistance = Math.hypot(position.x - prop.x, position.z - prop.z);
    collided = {
      prop,
      impact: Math.max(0, previousDistance - currentDistance),
      normal: { x: normalX, y: 0, z: normalZ },
      penetration,
      position: resolved,
    };
  }
  return collided ? { ...collided, position: resolved } : null;
}
