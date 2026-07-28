// Shared frame-delta ceiling.
//
// `useFrame` deltas come straight from THREE.Clock and are not capped. Browsers
// throttle or stop requestAnimationFrame for hidden tabs, so the first frame
// after a tab regains focus carries the entire elapsed gap — tens or hundreds of
// seconds. Anything that integrates delta (simulation steps, the expedition
// clock, damage over time) must clamp first or a single frame applies hours of
// change at once.
//
// 0.05s (20 Hz) matches the ceiling PlayerController already uses for movement.
// Below that frame rate the simulation deliberately runs in slow motion rather
// than taking large, unstable steps.
export const MAX_FRAME_DELTA = 0.05;

export function clampFrameDelta(delta, max = MAX_FRAME_DELTA) {
  const value = Number(delta);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, max);
}
