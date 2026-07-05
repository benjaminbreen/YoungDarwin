import { ROCKY_CLEARING, ROCKY_CLEARING_CAVE } from './regions/rockyClearing/path';

const LOCAL_TRANSITIONS = {
  [ROCKY_CLEARING]: [
    {
      id: 'rocky-clearing-to-gabriels-cave',
      zoneId: ROCKY_CLEARING,
      toRegionId: ROCKY_CLEARING_CAVE.destinationZoneId,
      label: "Enter Gabriel's Cave",
      description: 'Duck beneath the basalt arch and step into the dark volcanic passage.',
      entryEdge: 'south',
      position: { x: ROCKY_CLEARING_CAVE.promptX, z: ROCKY_CLEARING_CAVE.promptZ },
      radius: 4.8,
      closeRadius: 2.75,
      facing: { x: 0, z: -1 },
      routeLabel: 'Cave mouth',
    },
  ],
};

export function getLocalTransitions(zoneId) {
  return LOCAL_TRANSITIONS[zoneId] || [];
}

export function nearestLocalTransitionPrompt(zoneId, position, facing = null) {
  let best = null;
  for (const transition of getLocalTransitions(zoneId)) {
    const dx = transition.position.x - position.x;
    const dz = transition.position.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > transition.radius) continue;
    const facingLength = Math.hypot(facing?.x || 0, facing?.z || 0);
    const towardLength = Math.hypot(dx, dz) || 1;
    const facingWeight = facingLength > 0.001
      ? ((facing.x || 0) * dx + (facing.z || 0) * dz) / (facingLength * towardLength)
      : 0;
    if (distance > transition.closeRadius && facingWeight < -0.25) continue;
    const score = distance - Math.max(0, facingWeight) * 1.2;
    if (!best || score < best.score) {
      best = {
        ...transition,
        kind: 'open',
        localTransition: true,
        distance,
        facingWeight,
        minutes: 0,
        fatigue: 0,
        score,
      };
    }
  }
  if (!best) return null;
  return {
    id: best.id,
    zoneId: best.zoneId,
    toRegionId: best.toRegionId,
    label: best.label,
    description: best.description,
    kind: best.kind,
    localTransition: true,
    distance: best.distance,
    facingWeight: best.facingWeight,
    minutes: best.minutes,
    fatigue: best.fatigue,
    routeLabel: best.routeLabel,
    entryEdge: best.entryEdge || null,
  };
}
