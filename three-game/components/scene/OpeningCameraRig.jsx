'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';

function smootherStep01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Runs after PlayerController's -1 frame callback. While physics/player are
// still suspended it supplies the complete aerial shot itself; once the player
// mounts it captures the ordinary playable camera every frame and blends into
// that exact pose for a snap-free handoff.
export function OpeningCameraRig({ openingCamera = null, playerReady = false }) {
  const { camera } = useThree();
  const runtime = useRef({
    sequenceId: null,
    startedAt: 0,
    descentStartedAt: 0,
    normalPoseReady: false,
    normalEye: new THREE.Vector3(),
    normalQuaternion: new THREE.Quaternion(),
    normalFov: 50,
  });
  const scratch = useMemo(() => ({
    pivot: new THREE.Vector3(),
    surveyCenter: new THREE.Vector3(),
    eye: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    aerialQuaternion: new THREE.Quaternion(),
    fallbackEye: new THREE.Vector3(),
    fallbackQuaternion: new THREE.Quaternion(),
    surveyOffset: new THREE.Vector3(8.5, 0, -6.5),
    fallbackOffset: new THREE.Vector3(3.6, 2.8, 5.4),
    looker: new THREE.Object3D(),
  }), []);

  useFrame(() => {
    if (!openingCamera?.active) {
      runtime.current.sequenceId = null;
      runtime.current.normalPoseReady = false;
      return;
    }

    const now = performance.now() / 1000;
    const sequenceId = openingCamera.sequenceId || 'opening-camera';
    if (runtime.current.sequenceId !== sequenceId) {
      runtime.current.sequenceId = sequenceId;
      runtime.current.startedAt = now;
      runtime.current.descentStartedAt = 0;
      runtime.current.normalPoseReady = false;
    }

    // PlayerController has already written the normal camera pose this frame.
    if (playerReady) {
      runtime.current.normalEye.copy(camera.position);
      runtime.current.normalQuaternion.copy(camera.quaternion);
      runtime.current.normalFov = camera.fov || 50;
      runtime.current.normalPoseReady = true;
    }

    const minAerial = Math.max(0.5, openingCamera.minAerialDuration || 3.8);
    const maxAerial = Math.max(minAerial, openingCamera.maxAerialDuration || 6.5);
    const descentDuration = Math.max(0.5, openingCamera.descentDuration || 5);
    const aerialElapsed = Math.max(0, now - runtime.current.startedAt);
    if (
      !runtime.current.descentStartedAt
      && ((openingCamera.visualReady && aerialElapsed >= minAerial) || aerialElapsed >= maxAerial)
    ) {
      runtime.current.descentStartedAt = now;
    }

    const descentProgress = runtime.current.descentStartedAt
      ? THREE.MathUtils.clamp((now - runtime.current.descentStartedAt) / descentDuration, 0, 1)
      : 0;
    const handoffT = smootherStep01(descentProgress);
    const surveyT = smootherStep01(aerialElapsed / maxAerial);
    const pose = useThreeGameStore.getState().playerPose?.position || { x: 0, y: 0, z: 0 };
    scratch.pivot.set(pose.x || 0, (pose.y || 0) + 1.1, pose.z || 0);
    scratch.surveyCenter.copy(scratch.pivot).add(scratch.surveyOffset);
    scratch.surveyCenter.lerp(scratch.pivot, surveyT * 0.28);

    const surveyAngle = -2.18 + surveyT * 0.48;
    const surveyRadius = THREE.MathUtils.lerp(22, 16.5, surveyT);
    const surveyHeight = THREE.MathUtils.lerp(104, 88, surveyT);
    scratch.eye.set(
      scratch.surveyCenter.x + Math.cos(surveyAngle) * surveyRadius,
      scratch.surveyCenter.y + surveyHeight,
      scratch.surveyCenter.z + Math.sin(surveyAngle) * surveyRadius,
    );
    scratch.lookTarget.copy(scratch.surveyCenter);
    scratch.lookTarget.y += THREE.MathUtils.lerp(-0.8, 0.2, surveyT);
    scratch.looker.position.copy(scratch.eye);
    scratch.looker.lookAt(scratch.lookTarget);
    scratch.aerialQuaternion.copy(scratch.looker.quaternion);

    if (!runtime.current.normalPoseReady) {
      scratch.fallbackEye.copy(scratch.pivot).add(scratch.fallbackOffset);
      scratch.looker.position.copy(scratch.fallbackEye);
      scratch.looker.lookAt(scratch.pivot);
      scratch.fallbackQuaternion.copy(scratch.looker.quaternion);
      runtime.current.normalEye.copy(scratch.fallbackEye);
      runtime.current.normalQuaternion.copy(scratch.fallbackQuaternion);
      runtime.current.normalFov = 50;
    }

    camera.position.copy(scratch.eye).lerp(runtime.current.normalEye, handoffT);
    camera.quaternion.copy(scratch.aerialQuaternion).slerp(runtime.current.normalQuaternion, handoffT);
    camera.rotation.z += Math.sin(surveyT * Math.PI * 1.35) * 0.006 * (1 - handoffT);
    const nextFov = THREE.MathUtils.lerp(46, runtime.current.normalFov, handoffT);
    if (Math.abs(camera.fov - nextFov) > 0.01) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
