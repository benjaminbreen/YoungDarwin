import * as THREE from 'three';

export const DEFAULT_CULL_CHECK_INTERVAL = 8;
export const DEFAULT_CULL_CAMERA_MOVE_SQ = 1.1 * 1.1;

export function createCameraCullState() {
  return {
    frame: 0,
    lastCameraPosition: new THREE.Vector3(Infinity, Infinity, Infinity),
  };
}

export function shouldRunCameraCull(camera, state, {
  interval = DEFAULT_CULL_CHECK_INTERVAL,
  moveSq = DEFAULT_CULL_CAMERA_MOVE_SQ,
} = {}) {
  state.frame = (state.frame + 1) % interval;
  const moved = state.lastCameraPosition.distanceToSquared(camera.position) > moveSq;
  if (state.frame !== 0 && !moved) return false;
  state.lastCameraPosition.copy(camera.position);
  return true;
}
