const GROUND_MIN_NORMAL_Y = 0.45;
const SIDE_MAX_ABS_NORMAL_Y = 0.45;
const SIDE_MIN_HORIZONTAL_NORMAL = 0.75;

export function rapierContactTarget(contact) {
  return contact?.userData || contact?.rigidBody?.userData || null;
}

export function isTerrainContactTarget(target) {
  return target?.kind === 'terrain' || target?.id === 'terrain';
}

function finiteNormal(contact) {
  const x = Number(contact?.normal?.x);
  const y = Number(contact?.normal?.y);
  const z = Number(contact?.normal?.z);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

// Rapier reports the support plane as a computed collision while walking.
// Keep support and blocking contacts mutually exclusive so a steep terrain
// triangle cannot also masquerade as an obstacle and start a push animation.
export function classifyRapierCharacterContacts(collisionDetails = []) {
  let groundContact = null;
  let groundTarget = null;
  let sideContact = null;
  let sideTarget = null;

  for (const contact of collisionDetails || []) {
    const normal = finiteNormal(contact);
    if (!normal) continue;
    const target = rapierContactTarget(contact);

    if (!groundContact && normal.y > GROUND_MIN_NORMAL_Y) {
      groundContact = contact;
      groundTarget = target;
    }

    if (sideContact || !target || isTerrainContactTarget(target)) continue;
    const horizontalNormal = Math.hypot(normal.x, normal.z);
    if (
      Math.abs(normal.y) <= SIDE_MAX_ABS_NORMAL_Y
      && horizontalNormal >= SIDE_MIN_HORIZONTAL_NORMAL
    ) {
      sideContact = contact;
      sideTarget = target;
    }
  }

  return {
    groundContact,
    groundTarget,
    sideContact,
    sideTarget,
  };
}
