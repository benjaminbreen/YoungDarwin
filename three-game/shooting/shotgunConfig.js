// Tuning for Darwin's double-barreled collecting shotgun. The design goal is
// forgiving, readable hunting: a scored spread cone instead of a pinpoint ray,
// a clear effective-range band, and a two-shots-then-reload rhythm. Aiming is
// a proper over-the-shoulder mode (hold right mouse or toggle F; touch uses
// the Aim button) with the world slowed so wing shots are possible.
// Distances in meters, angles in radians, times in seconds.
export const SHOTGUN = {
  barrels: 2,
  reloadDuration: 2.1,
  // The blast lands this far into the fireRifle clip (matches the queued
  // tool-swing impactDelay pattern in PhysicsProp).
  impactDelay: 0.1,
  // Re-fire is allowed once the action lock releases so the second barrel
  // feels snappy.
  refireDelay: 0.5,
  // The fire action window; the clip itself is capped via maxTime so only a
  // single trigger pull of the source animation shows.
  fireActionDuration: 0.55,
  fireClipMaxTime: 0.5,
  muzzleHeight: 1.32,
  muzzleForward: 0.55,
  // Spread cone used both for target scoring and for scattering the visual
  // pellet impacts around the primary hit.
  coneHalfAngle: 0.14,
  minRange: 1.4,
  maxRange: 34,
  // Inside sweetRange a centered shot is a clean kill; between sweetRange and
  // maxRange hits degrade to "winged" (target flees, no specimen).
  sweetRange: 22,
  // Closer than this ruins a small specimen (historically true: point-blank
  // shot destroyed skins).
  ruinRange: 3.2,
  // Angular score below which a fauna candidate counts as winged, not killed.
  wingedScore: 0.42,
  // Fauna within this radius of the muzzle startle and flee on every shot.
  panicRadius: 26,
  recoil: { intensity: 0.34, duration: 0.26 },
  // Visual pellet scatter: extra impact bursts faked around the primary hit.
  scatterImpacts: 5,
  scatterRadius: 0.85,

  // --- Aim-down-sights mode ---
  ads: {
    // World simulation speed while shouldered: slow enough to track a bird.
    timeScale: 0.3,
    fov: 41,
    // Camera offset relative to the aim pivot (right, up, back along aim).
    shoulderSide: 0.48,
    shoulderUp: 1.62,
    shoulderBack: 1.85,
    // Pitch limits while aiming (radians; negative looks up in camera terms).
    minPitch: -1.12,
    maxPitch: 1.2,
    // Mouse-look sensitivity under pointer lock; touch drag uses its own.
    lookSpeed: 0.0015,
    touchLookSpeed: 0.0042,
  },

  // Real-time freeze on a confirmed kill.
  hitstop: 0.075,

  // Physics props inside this distance of the pellet ray get a kick.
  prop: {
    rayRadius: 0.62,
    impulse: 4.6,
    maxRange: 26,
    // Breakables shatter instead of just jumping when the ray passes close
    // and the shot lands inside this range.
    breakRange: 14,
  },

  // Firing steeply downward at the ground right at Darwin's feet is an
  // accident: health damage plus a stumble.
  selfHit: {
    maxDistance: 2.0,
    minDownComponent: 0.72,
    damage: 14,
  },

  // Syms occupies a capsule this size at his runtime position.
  npc: {
    radius: 0.5,
    height: 1.95,
  },
};
