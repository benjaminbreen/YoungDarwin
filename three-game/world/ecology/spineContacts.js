// Live spine contacts from plants whose geometry only exists at runtime.
//
// Mature cactus GLBs publish fixed spine hazards through the shared obstacle
// list. The destructible prickly pears and lava cacti cannot: their pads bend,
// snap, and fall, so only their own field knows which piece Darwin is actually
// touching this frame. Each field reports its nearest touching piece here and
// the player controller reads it alongside the static hazards, so every spiny
// plant goes through the same recoil, damage, and pain feedback.

const STALE_AFTER_MS = 150;
const contacts = new Map();

export function reportSpineContact(sourceId, contact) {
  contacts.set(sourceId, { ...contact, reportedAt: performance.now() });
}

export function clearSpineContact(sourceId) {
  contacts.delete(sourceId);
}

// Shaped like a static cactus hazard contact: { cactus, normal, penetration }.
export function findLiveSpineContact(zoneId) {
  const now = performance.now();
  let best = null;
  for (const [sourceId, contact] of contacts) {
    if (now - contact.reportedAt > STALE_AFTER_MS) {
      contacts.delete(sourceId);
      continue;
    }
    if (zoneId && contact.zoneId !== zoneId) continue;
    if (!best || contact.penetration > best.penetration) best = contact;
  }
  return best;
}
