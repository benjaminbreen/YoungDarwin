// Live positions of walking NPCs (currently just Syms Covington), published
// per-frame by their components so systems that need line-of-fire checks
// (the shotgun resolver) can test against where the character actually is,
// offsets and flees included. Module-level like propRuntime — no React.
const npcPosesByZone = new Map();

export function publishNpcPose(zoneId, npcId, pose) {
  if (!zoneId || !npcId || !pose) return;
  let poses = npcPosesByZone.get(zoneId);
  if (!poses) {
    poses = new Map();
    npcPosesByZone.set(zoneId, poses);
  }
  poses.set(npcId, { x: pose.x, y: pose.y, z: pose.z });
}

export function removeNpcPose(zoneId, npcId) {
  npcPosesByZone.get(zoneId)?.delete(npcId);
}

export function getNpcPoses(zoneId) {
  return npcPosesByZone.get(zoneId) || null;
}
