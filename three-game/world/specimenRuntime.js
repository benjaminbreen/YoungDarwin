const runtimeByZone = new Map();
const boundsByZone = new Map();
const stimuliByZone = new Map();
const UNKNOWN_ZONE = 'UNKNOWN_ZONE';
const MAX_STIMULI_PER_ACTOR = 4;

function zoneKey(zoneId) {
  return zoneId || UNKNOWN_ZONE;
}

function nowSeconds() {
  return (globalThis.performance?.now?.() ?? Date.now()) / 1000;
}

function runtimeZoneMap(zoneId) {
  const key = zoneKey(zoneId);
  let map = runtimeByZone.get(key);
  if (!map) {
    map = new Map();
    runtimeByZone.set(key, map);
  }
  return map;
}

function boundsZoneMap(zoneId) {
  const key = zoneKey(zoneId);
  let map = boundsByZone.get(key);
  if (!map) {
    map = new Map();
    boundsByZone.set(key, map);
  }
  return map;
}

export function setSpecimenRuntimePose(zoneId, actorId, pose) {
  if (!actorId || !Number.isFinite(pose?.x) || !Number.isFinite(pose?.y) || !Number.isFinite(pose?.z)) return;
  runtimeZoneMap(zoneId).set(actorId, {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    yaw: Number.isFinite(pose.yaw) ? pose.yaw : 0,
    updatedAt: nowSeconds(),
  });
}

export function removeSpecimenRuntimePose(zoneId, actorId) {
  if (!actorId) return;
  const key = zoneKey(zoneId);
  const map = runtimeByZone.get(key);
  const bounds = boundsByZone.get(key);
  const stimuli = stimuliByZone.get(key);
  map?.delete(actorId);
  bounds?.delete(actorId);
  stimuli?.delete(actorId);
}

export function getSpecimenRuntimePoses(zoneId) {
  return runtimeByZone.get(zoneKey(zoneId)) || null;
}

// Rendered GLBs are not necessarily the same size as their gameplay
// interaction height. Keep their loaded bounds alongside live poses so camera
// framing can fit what the player actually sees rather than a content guess.
export function setSpecimenRuntimeBounds(zoneId, actorId, bounds) {
  if (
    !actorId
    || !Number.isFinite(bounds?.height)
    || !Number.isFinite(bounds?.radius)
  ) return;
  boundsZoneMap(zoneId).set(actorId, {
    height: Math.max(0.025, bounds.height),
    radius: Math.max(0.025, bounds.radius),
  });
}

export function getSpecimenRuntimeBounds(zoneId) {
  return boundsByZone.get(zoneKey(zoneId)) || null;
}

export function pushSpecimenStimulus(zoneId, actorId, stimulus) {
  if (!actorId) return;
  const key = zoneKey(zoneId);
  let byActor = stimuliByZone.get(key);
  if (!byActor) {
    byActor = new Map();
    stimuliByZone.set(key, byActor);
  }
  const queue = byActor.get(actorId) || [];
  queue.push({
    ...stimulus,
    at: nowSeconds(),
  });
  byActor.set(actorId, queue.slice(-MAX_STIMULI_PER_ACTOR));
}

export function consumeSpecimenStimuli(zoneId, actorId) {
  const byActor = stimuliByZone.get(zoneKey(zoneId));
  if (!byActor || !actorId) return [];
  const queue = byActor.get(actorId) || [];
  byActor.delete(actorId);
  return queue;
}
