// Live positions of walking NPCs (currently just Syms Covington), published
// per-frame by their components so line-of-fire, encounter, and character
// collision systems can test where each actor actually is. Module-level like
// propRuntime — no React and no per-frame store updates.
const npcPosesByZone = new Map();
const npcContactListeners = new Set();

export const DEFAULT_NPC_COLLISION_RADIUS = 0.38;
export const DEFAULT_NPC_COLLISION_HEIGHT = 1.82;

export function publishNpcPose(zoneId, npcId, pose) {
  if (!zoneId || !npcId || !pose) return;
  let poses = npcPosesByZone.get(zoneId);
  if (!poses) {
    poses = new Map();
    npcPosesByZone.set(zoneId, poses);
  }
  const current = poses.get(npcId) || {};
  current.x = pose.x;
  current.y = pose.y;
  current.z = pose.z;
  current.collisionRadius = Number.isFinite(pose.collisionRadius)
    ? Math.max(0, pose.collisionRadius)
    : DEFAULT_NPC_COLLISION_RADIUS;
  current.collisionHeight = Number.isFinite(pose.collisionHeight)
    ? Math.max(0, pose.collisionHeight)
    : DEFAULT_NPC_COLLISION_HEIGHT;
  current.collisionEnabled = pose.collisionEnabled !== false;
  poses.set(npcId, current);
}

export function removeNpcPose(zoneId, npcId) {
  npcPosesByZone.get(zoneId)?.delete(npcId);
}

export function getNpcPoses(zoneId) {
  return npcPosesByZone.get(zoneId) || null;
}

export function onNpcContact(handler) {
  if (typeof handler !== 'function') return () => {};
  npcContactListeners.add(handler);
  return () => npcContactListeners.delete(handler);
}

export function emitNpcContact(event) {
  if (!event?.npcId) return;
  for (const handler of [...npcContactListeners]) handler(event);
}
