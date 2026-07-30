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

// Rolling frame-time pressure signal, fed once per frame by WorldTimeTicker.
// Background work that competes with the render loop (the serialized GLB
// preload pump) consults it to defer main-thread parses while frames are
// already over budget. The EMA spans roughly the last 25-30 frames; a single
// note is clamped at 250ms so one tab-restore mega-delta cannot poison the
// average for seconds afterwards.
let frameMsEma = 16.7;

export function noteFrameDelta(delta) {
  const value = Number(delta);
  if (!Number.isFinite(value) || value <= 0) return;
  const ms = Math.min(value * 1000, 250);
  frameMsEma += (ms - frameMsEma) * 0.08;
}

export function recentFrameMs() {
  return frameMsEma;
}
