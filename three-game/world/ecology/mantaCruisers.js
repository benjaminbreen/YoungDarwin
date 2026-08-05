// Shared spec for procedural manta cruisers. ReefSwimmers reads the same
// orbit/avoid fields as the GLB cruisers; `kind: 'manta'` swaps the renderer
// for the instanced procedural rig.
//
// Mantas want long slow orbits and wide avoid radii — the animal is three
// metres across, so a tight turn or a quick dodge reads as a bat, not a ray.

export function mantaCruiser(id, {
  variant = 'chevron',
  orbit,
  y,
  bob = 0.2,
  speed = 0.8,
  scale = 0.9,
  direction = 1,
  phase = 0,
  ...rest
}) {
  return {
    id,
    kind: 'manta',
    variant,
    orbit,
    y,
    bob,
    speed,
    scale,
    direction,
    phase,
    cruiseEnergy: 0.4,
    bank: 0.2,
    maxPitch: 0.07,
    turnResponse: 0.05,
    avoidRadius: 11,
    avoidPush: 5.2,
    avoidDive: 0.3,
    avoidBank: 0.24,
    ...rest,
  };
}
