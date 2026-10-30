// The handful of player internals the e2e harness needs that are not in the
// store: the camera yaw (movement input is camera-relative) and a way to place
// the character body directly. PlayerController registers the live functions;
// the harness and the agent play driver call them through window.__darwinE2E.

let bridge = null;

export function registerPlayerHarnessBridge(next) {
  bridge = next;
  return () => {
    if (bridge === next) bridge = null;
  };
}

export function getPlayerHarnessBridge() {
  return bridge;
}
