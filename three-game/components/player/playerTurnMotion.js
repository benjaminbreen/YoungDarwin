import * as THREE from 'three';
import { rotateBoneWorld } from './armIK';

const TURN_CLIP = /^(runningTurn180|walkingTurn180|runningTurnLeft|runningTurnRight|turnLeft90|turnRight90|torchTurnLeft90|torchTurnRight90)$/;
const MOVING_TURN = /^(runningTurn180|walkingTurn180|runningTurnLeft|runningTurnRight)$/;

export function advancePlayerHeading(yaw, target, speed, delta) {
  const difference = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  const rate = THREE.MathUtils.lerp(18, 9.5, THREE.MathUtils.clamp(speed / 7.45, 0, 1));
  const step = difference * (1 - Math.exp(-24 * delta));
  return yaw + THREE.MathUtils.clamp(step, -rate * delta, rate * delta);
}

export function turnTravelScale(action, startedAt, now) {
  if (!MOVING_TURN.test(action || '')) return 1;
  const progress = THREE.MathUtils.smoothstep(now - startedAt, 0, 0.26);
  return THREE.MathUtils.lerp(action === 'runningTurn180' || action === 'walkingTurn180' ? 0.5 : 0.78, 1, progress);
}

export function turnAnimationRequest(motion, now) {
  // The 180 source ends in a broad sideways lunge. Use its plant/pivot and
  // blend into the requested gait before that lunge drags across the ground.
  const windows = {
    runningTurn180: [0.02, 0.42], walkingTurn180: [0.02, 0.7],
    runningTurnLeft: [0, 19 / 24], runningTurnRight: [0, 19 / 24],
    turnLeft90: [0, 29 / 30], turnRight90: [0, 29 / 30],
  };
  const window = windows[motion.action];
  if (!window) return null;
  const span = Math.max(0.1, motion.actionUntil - motion.actionStartedAt);
  const progress = THREE.MathUtils.clamp((now - motion.actionStartedAt) / span, 0, 1);
  return { clip: motion.action, sampleTime: THREE.MathUtils.lerp(window[0], window[1], progress), fade: 0.07 };
}

export function createPlayerTurnRig(scene, groupRef, motionRef) {
  const find = suffix => {
    let found = null;
    scene.traverse(bone => { if (bone.isBone && new RegExp(`${suffix}$`, 'i').test(bone.name)) found = bone; });
    return found;
  };
  const hips = find('Hips');
  const chest = find('Spine2');
  const neck = find('Neck');
  const head = find('Head');
  const poses = [hips, chest, neck, head].filter(Boolean).map(bone => ({ bone, original: new THREE.Quaternion(), changed: false }));
  const groupRotation = new THREE.Quaternion();
  const relative = new THREE.Quaternion();
  const boneRotation = new THREE.Quaternion();
  const deltaRotation = new THREE.Quaternion();
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  let lead = 0;
  let turnTail = 0;
  const rotate = (bone, angle) => {
    const pose = poses.find(pose => pose.bone === bone);
    if (!pose || Math.abs(angle) < 0.0001) return;
    pose.original.copy(bone.quaternion);
    pose.changed = true;
    rotateBoneWorld(bone, deltaRotation.setFromAxisAngle(up, angle));
  };
  const restorePose = () => poses.forEach(pose => {
    if (pose.changed) pose.bone.quaternion.copy(pose.original);
    pose.changed = false;
  });
  return {
    restorePose,
    update(delta, clip) {
      const group = groupRef.current;
      const motion = motionRef?.current;
      if (!group || !hips || !motion) return;
      group.getWorldQuaternion(groupRotation);
      up.set(0, 1, 0).applyQuaternion(groupRotation);
      const turning = TURN_CLIP.test(clip || '');
      const aimedStrike = clip === 'heavyToolSwing';
      turnTail = turning || aimedStrike ? 0.22 : Math.max(0, turnTail - delta);
      if (turning || turnTail > 0) {
        // The authored clip already turns the pelvis. The controller owns
        // heading, so remove that extra yaw in model space (the Armature has
        // a 90-degree basis rotation) while retaining pitch, roll and footwork.
        hips.getWorldQuaternion(boneRotation);
        relative.copy(groupRotation).invert().multiply(boneRotation);
        forward.set(0, 0, 1).applyQuaternion(relative);
        const yaw = Math.atan2(forward.x, forward.z);
        rotate(hips, -yaw);
      }
      const allowed = !motion.airborne && !motion.swimming && !motion.aiming && !motion.handsBusy
        && (!motion.action || turning);
      lead = THREE.MathUtils.damp(lead, allowed ? THREE.MathUtils.clamp(motion.headingError || 0, -0.9, 0.9) : 0, 18, delta);
      rotate(chest, lead * 0.25);
      rotate(neck, lead * 0.12);
      rotate(head, lead * 0.28);
    },
    dispose: restorePose,
  };
}
