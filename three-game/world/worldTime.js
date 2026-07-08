// Global simulation time for the living world (fauna AI, fauna animation).
// The player, camera, and UI always run on real frame time; systems that
// should participate in bullet-time (aiming slowdown) and hitstop read their
// per-frame delta / elapsed clock from here instead of the r3f clock.
//
// Mutable module state (like propEvents / shotgunAimState) so 60hz updates
// never touch React. WorldTimeTicker advances it exactly once per frame at
// negative useFrame priority, before any consumer runs.
export const worldTime = {
  // Smoothed current scale applied to this frame's delta.
  scale: 1,
  // Where the scale is easing toward (1 = normal, ~0.3 = bullet time).
  targetScale: 1,
  // Accumulated scaled seconds. Monotonic; starts at 0 on load.
  elapsed: 0,
  // This frame's scaled delta.
  delta: 0,
  // Real (unscaled) wall-clock seconds when the current hitstop ends.
  hitstopUntil: 0,
  realElapsed: 0,
};

const HITSTOP_SCALE = 0.04;

export function setWorldTimeTarget(scale) {
  worldTime.targetScale = Math.min(1, Math.max(0.05, scale));
}

// Freeze the world for a beat (kill confirm). Duration is in REAL seconds so
// the pause feels identical inside and outside bullet time.
export function triggerHitstop(duration = 0.07) {
  worldTime.hitstopUntil = Math.max(worldTime.hitstopUntil, worldTime.realElapsed + duration);
}

export function advanceWorldTime(rawDelta) {
  const dt = Math.min(0.2, Math.max(0, rawDelta));
  worldTime.realElapsed += dt;
  const inHitstop = worldTime.realElapsed < worldTime.hitstopUntil;
  const target = inHitstop ? HITSTOP_SCALE : worldTime.targetScale;
  // Ease fast into slowdown/hitstop, slightly slower back out, so entering
  // aim feels like a snap and releasing feels like a breath.
  const rate = target < worldTime.scale ? 14 : 7;
  worldTime.scale += (target - worldTime.scale) * (1 - Math.exp(-rate * dt));
  if (Math.abs(worldTime.scale - target) < 0.004) worldTime.scale = target;
  worldTime.delta = dt * worldTime.scale;
  worldTime.elapsed += worldTime.delta;
  return worldTime.delta;
}
