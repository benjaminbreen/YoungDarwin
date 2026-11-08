export function rockSurfaceRadius(rock, normal) {
  const scale = typeof rock.scale === 'number' ? rock.scale : 1;
  const cos = Math.cos(rock.yaw || 0), sin = Math.sin(rock.yaw || 0);
  const localX = normal.x * cos - normal.z * sin;
  const localZ = normal.x * sin + normal.z * cos;
  let support = 0;
  for (const shape of rock.shapes || []) {
    const [ox = 0, , oz = 0] = shape.offset || [];
    if (shape.type === 'convex' && shape.points?.length) {
      for (const [x, z] of shape.points) support = Math.max(support, ((x + ox) * localX + (z + oz) * localZ) * scale);
    } else if (shape.radius) support = Math.max(support, (ox * localX + oz * localZ + shape.radius) * scale);
  }
  return Math.max(0.35, support || rock.radius || 0.5);
}

// The visible hammer face, fracture scar and debris share this exact point.
// Height is supplied by the movement surface, as in the original sampling path.
export function rockStrikeContact(rock, player, heightAt, groundSample = false, facing = { x: 0, z: -1 }) {
  const dx = player.x - (rock.x || 0), dz = player.z - (rock.z || 0);
  const distance = Math.hypot(dx, dz);
  const fallbackLength = Math.hypot(facing?.x || 0, facing?.z || 0);
  const normal = distance >= 0.001 ? { x: dx / distance, z: dz / distance }
    : fallbackLength >= 0.001 ? { x: -facing.x / fallbackLength, z: -facing.z / fallbackLength }
      : { x: 0, z: 1 };
  const radius = rockSurfaceRadius(rock, normal);
  const surfaceX = (rock.x || 0) + normal.x * radius * 0.92;
  const surfaceZ = (rock.z || 0) + normal.z * radius * 0.92;
  const top = rock.colliderTop ?? rock.height ?? 0.9;
  const y = heightAt(surfaceX, surfaceZ) + (groundSample ? 0.08 : Math.min(1.42, Math.max(0.35, top * 0.52)));
  return { normal, surfaceX, surfaceZ, position: { x: surfaceX + normal.x * 0.045, y, z: surfaceZ + normal.z * 0.045 } };
}
