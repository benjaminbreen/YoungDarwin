const propPosesByZone = new Map();
const waterInfluencesByZone = new Map();

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

function zoneWaterInfluenceMap(zoneId) {
  const key = zoneId || 'UNKNOWN';
  let influences = waterInfluencesByZone.get(key);
  if (!influences) {
    influences = new Map();
    waterInfluencesByZone.set(key, influences);
  }
  return influences;
}

function waterInfluencePhase(propId) {
  let hash = 2166136261;
  for (let index = 0; index < propId.length; index += 1) {
    hash ^= propId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295) * Math.PI * 2;
}

// A deliberately small, mutable bridge between Rapier props and the water
// shader. Water reads this map during its own frame update, so floating props
// can leave continuous wakes without pushing React state or emitting an event
// every physics tick.
export function publishPropWaterInfluence(zoneId, propId, influence) {
  if (!zoneId || !propId || !influence) return;
  const x = Number(influence.x);
  const z = Number(influence.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  const influences = zoneWaterInfluenceMap(zoneId);
  const previous = influences.get(propId);
  influences.set(propId, {
    id: propId,
    x,
    z,
    vx: Number(influence.vx) || 0,
    vz: Number(influence.vz) || 0,
    radius: Math.max(0.12, Number(influence.radius) || 0.3),
    strength: Math.max(0, Number(influence.strength) || 0),
    phase: previous?.phase ?? waterInfluencePhase(propId),
  });
}

export function removePropWaterInfluence(zoneId, propId) {
  const influences = waterInfluencesByZone.get(zoneId || 'UNKNOWN');
  if (!influences) return;
  influences.delete(propId);
}

export function getZonePropWaterInfluences(zoneId) {
  return waterInfluencesByZone.get(zoneId || 'UNKNOWN')?.values() || [];
}

export function clearZonePropPoses(zoneId) {
  if (!zoneId) return;
  propPosesByZone.delete(zoneId);
  waterInfluencesByZone.delete(zoneId);
}

export function getZonePropCollisionProps(zoneId, props = []) {
  const poses = propPosesByZone.get(zoneId || 'UNKNOWN');
  if (!poses || poses.size === 0) return props;
  return props.map(prop => {
    const pose = poses.get(prop.id);
    return pose ? { ...prop, x: pose.x, y: pose.y, z: pose.z } : prop;
  });
}
