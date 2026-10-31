// Which of two nearby subjects Darwin is attending to, from where they stand
// relative to him. Used to settle the one action key between a companion who
// is merely close by and the animal in front of him.

const IN_FRONT_COS = 0.5;

function inFront(dx, dz, length, facing) {
  return length > 0.001 && (dx * facing.x + dz * facing.z) / length > IN_FRONT_COS;
}

// True when the specimen should keep the action key over the NPC: it is the
// closer of the two, or it is in front of Darwin while the NPC is not.
export function npcYieldsToSpecimen({ npc, specimen, position, facing }) {
  if (!npc || !specimen || !position || !facing) return false;
  const sx = specimen.x - position.x;
  const sz = specimen.z - position.z;
  const nx = npc.x - position.x;
  const nz = npc.z - position.z;
  const specimenDistance = Math.hypot(sx, sz);
  const npcDistance = Math.hypot(nx, nz);
  if (specimenDistance < npcDistance) return true;
  return inFront(sx, sz, specimenDistance, facing) && !inFront(nx, nz, npcDistance, facing);
}
