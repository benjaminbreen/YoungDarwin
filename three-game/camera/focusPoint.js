// A camera focus is a world point and nothing else.
//
// The camera rig dollies to `focus.x/y/z` without checking. One caller passed the
// string 'memory' as a note about *why* a panel opened, so `focus.y` was
// undefined, every camera coordinate went NaN, and the rig's own zero-length
// guard waved it through because `NaN < 0.001` is false. A NaN camera then
// poisons everything reading it: the solar glare overlay rendered
// `opacity: NaN` on nine layers, and the player's rigid body tripped the physics
// watchdog with a runaway position. Validate at every boundary instead.
export function cameraFocusPoint(focus) {
  if (!focus || typeof focus !== 'object') return null;
  const x = Number(focus.x);
  const y = Number(focus.y);
  const z = Number(focus.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}
