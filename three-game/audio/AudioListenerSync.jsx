import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { getRuntimePlayerPose } from '../store';
import { updateAudioListener } from './audioRuntime';

// Darwin's ears for the soundscape's HRTF panners: at his head, facing the
// way the camera looks, so a call from off-screen left is heard on the left
// and swings round as the camera turns. Distance is measured from Darwin by
// the callers, so the ears stay with him rather than the camera.
const EAR_HEIGHT = 1.5;
const forward = new Vector3();
const up = new Vector3();
const position = { x: 0, y: 0, z: 0 };

export function AudioListenerSync() {
  useFrame(({ camera }) => {
    const pose = getRuntimePlayerPose()?.position;
    if (pose) {
      position.x = pose.x;
      position.y = pose.y + EAR_HEIGHT;
      position.z = pose.z;
    } else {
      position.x = camera.position.x;
      position.y = camera.position.y;
      position.z = camera.position.z;
    }
    camera.getWorldDirection(forward);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    updateAudioListener({ position, forward, up });
  });
  return null;
}
