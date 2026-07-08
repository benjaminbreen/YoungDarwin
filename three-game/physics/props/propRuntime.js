const propPosesByZone = new Map();

function zonePoseMap(zoneId) {
  const key = zoneId || 'UNKNOWN';
  let poses = propPosesByZone.get(key);
  if (!poses) {
    poses = new Map();
    propPosesByZone.set(key, poses);
  }
  return poses;
}

export function publishPropPose(zoneId, propId, pose) {
  if (!zoneId || !propId || !pose) return;
  zonePoseMap(zoneId).set(propId, {
    x: pose.x,
    y: pose.y,
    z: pose.z,
  });
}

export function removePropPose(zoneId, propId) {
  const poses = propPosesByZone.get(zoneId || 'UNKNOWN');
  if (!poses) return;
  poses.delete(propId);
}

export function clearZonePropPoses(zoneId) {
  if (!zoneId) return;
  propPosesByZone.delete(zoneId);
}

export function getZonePropCollisionProps(zoneId, props = []) {
  const poses = propPosesByZone.get(zoneId || 'UNKNOWN');
  if (!poses || poses.size === 0) return props;
  return props.map(prop => {
    const pose = poses.get(prop.id);
    return pose ? { ...prop, x: pose.x, y: pose.y, z: pose.z } : prop;
  });
}
