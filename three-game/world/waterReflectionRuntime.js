// Shared bookkeeping for the water planar-reflection pass.
//
// The mirror renders an explicit whitelist (objects flagged `reflect` in
// userData, minus `noReflect` descendants) — the rippled water needs the ship
// and nearby characters, not every shrub, fish, and inspectable prop. The
// pass used to enforce that by toggling `.visible` on every non-whitelisted
// renderable in the scene and restoring afterwards: two O(scene) sweeps per
// refresh, every frame while the camera moved. It now uses a camera layer
// instead — whitelisted objects (and lights, which must be visible to the
// mirror camera for lit materials) carry REFLECTION_LAYER, the virtual camera
// renders only that layer, and the per-refresh sweeps disappear entirely.
//
// Layer membership is synced by a full scene traverse, but only when marked
// dirty (zone change, a reflect-flagged model mounting) or on a slow cadence
// that catches stragglers (newly spawned lights, late-loading GLB children).
// This module is a leaf on purpose: Water.jsx, ModelAsset.jsx, and Beagle.jsx
// all import it, and none of their import chains can cycle through it.

// Three reserves nothing above layer 0 by default and no other system in this
// codebase uses layers; 7 is arbitrary but must stay unique repo-wide.
export const REFLECTION_LAYER = 7;

// Refreshes between periodic re-syncs. Explicit dirty marks handle the cases
// that matter visually (player/ship mounting); the cadence is a safety net.
const SYNC_EVERY_N_REFRESHES = 30;

let syncCountdown = 0;

export function markReflectionSceneDirty() {
  syncCountdown = 0;
}

function hasReflectionFlag(object, flag) {
  let current = object;
  while (current) {
    if (current.userData?.[flag]) return true;
    current = current.parent;
  }
  return false;
}

// Flags only — main-pass visibility still applies at render time, so the
// layer assignment stays valid when objects toggle on and off.
export function shouldRenderInReflection(object) {
  if (hasReflectionFlag(object, 'noReflect')) return false;
  return hasReflectionFlag(object, 'reflect');
}

// Ensure layer membership is current. Called once per reflection refresh;
// almost always a countdown decrement, occasionally a scene traverse.
export function syncReflectionLayers(scene) {
  if (syncCountdown > 0) {
    syncCountdown -= 1;
    return;
  }
  syncCountdown = SYNC_EVERY_N_REFRESHES;
  scene.traverse(object => {
    // Lights must test true against the mirror camera or the whitelisted
    // objects render unlit. Enabling an extra layer bit has no effect on the
    // main pass (camera layer 0 membership is untouched) or the shadow pass
    // (shadow updates are suspended during the mirror render).
    if (object.isLight) {
      object.layers.enable(REFLECTION_LAYER);
      return;
    }
    const renderable = object.isMesh || object.isSkinnedMesh || object.isSprite
      || object.isLine || object.isPoints;
    if (!renderable) return;
    if (shouldRenderInReflection(object)) object.layers.enable(REFLECTION_LAYER);
    else object.layers.disable(REFLECTION_LAYER);
  });
}
