// How Darwin's jumps sound (see IslandSoundscape's surface-contact handler
// and scripts/build-motion-audio.mjs).

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

// Which jump this contact belongs to, and how heavy. Flat jumps land at
// about 7 m/s, so fall speed alone cannot tell a hop from a drop: the
// controller reports how far below the launch he came down.
export function jumpSoundShape(event, contactKind) {
  const running = event?.runningJump === true;
  if (contactKind === 'takeoff') {
    const charge = clamp01(Number(event?.charge) || 0);
    return running
      ? { body: 'jumpTakeoffRun', bodyGain: 0.075 + charge * 0.02, rate: 1, skid: 0.6 }
      : { body: 'jumpTakeoffStand', bodyGain: 0.065 + charge * 0.03, rate: 1.02 - charge * 0.03 };
  }
  const landing = contactKind === 'landing' || contactKind === 'landing-jump';
  if (!landing) return {};
  const drop = Math.max(0, Number(event?.dropHeight) || 0);
  const fallSpeed = Number(event?.fallSpeed) || 0;
  const intended = contactKind === 'landing-jump';
  // A running leap down a dune easily lands a metre lower; that is still a
  // leap. Walking off an edge needs less, since there was no spring in it.
  if ((intended && drop > 1.3) || (!intended && drop > 0.65)) {
    const weight = clamp01((drop - 0.6) / 3);
    return {
      body: 'jumpLandDrop',
      bodyGain: 0.075 + weight * 0.08,
      rate: 1.02 - weight * 0.06,
      weight,
      gear: true,
      bodyImpact: drop > 2.6,
      skid: running ? 0.8 : 0,
    };
  }
  if (intended && running) {
    return { body: 'jumpLandRun', bodyGain: 0.07, rate: 1, weight: 0.3, gear: true, skid: 1 };
  }
  if (intended || fallSpeed >= 3.2) {
    return { body: 'jumpLandStand', bodyGain: intended ? 0.095 : 0.07, rate: 1, weight: 0.15 };
  }
  return {};
}
