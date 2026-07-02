import * as THREE from 'three';

const BOULDER_WAIST_MAX_HEIGHT = 1.45;
const BOULDER_HEAD_MAX_HEIGHT = 1.9;

export function boulderTraversalProfile(heightDelta, heroic, durationFor) {
  if (heightDelta <= BOULDER_WAIST_MAX_HEIGHT) {
    const actionDurationValue = durationFor('climbWaistHeight');
    return {
      clip: 'climbWaistHeight',
      actionDuration: Math.min(actionDurationValue, heroic ? 0.62 : 0.72),
      motionDuration: THREE.MathUtils.clamp(0.24 + heightDelta * (heroic ? 0.16 : 0.2), 0.34, 0.52),
      arcHeight: THREE.MathUtils.clamp(0.08 + heightDelta * 0.08, 0.12, 0.2),
      lockMovement: heroic ? 0.16 : 0.22,
      exitSpeedScale: heroic ? 0.92 : 0.45,
      crouching: false,
      earlyExitAt: heroic ? 0.58 : 0.66,
      cancelAt: heroic ? 0.42 : 0.52,
    };
  }
  if (heightDelta <= BOULDER_HEAD_MAX_HEIGHT) {
    const actionDurationValue = durationFor('climbHeadHeight');
    return {
      clip: 'climbHeadHeight',
      actionDuration: Math.min(actionDurationValue, heroic ? 0.82 : 0.95),
      motionDuration: THREE.MathUtils.clamp(0.36 + heightDelta * (heroic ? 0.18 : 0.22), 0.56, 0.78),
      arcHeight: THREE.MathUtils.clamp(0.1 + heightDelta * 0.09, 0.2, 0.3),
      lockMovement: heroic ? 0.24 : 0.34,
      exitSpeedScale: heroic ? 0.76 : 0.32,
      crouching: false,
      earlyExitAt: heroic ? 0.64 : 0.72,
      cancelAt: heroic ? 0.48 : 0.58,
    };
  }
  const actionDurationValue = durationFor('climbingUpWall');
  return {
    clip: 'climbingUpWall',
    actionDuration: Math.min(actionDurationValue, THREE.MathUtils.clamp(0.82 + heightDelta * 0.22, 1.18, 1.62)),
    motionDuration: THREE.MathUtils.clamp(0.72 + heightDelta * 0.22, 1.05, 1.58),
    arcHeight: THREE.MathUtils.clamp(0.12 + heightDelta * 0.05, 0.2, 0.34),
    lockMovement: heroic ? 0.34 : 0.48,
    exitSpeedScale: heroic ? 0.38 : 0.16,
    crouching: false,
    earlyExitAt: heroic ? 0.7 : 0.78,
    cancelAt: heroic ? 0.52 : 0.62,
  };
}

export function beginClimbMotion({
  group,
  stateRef,
  velocity,
  characterController,
  startAction,
  durationFor,
  now,
  clip,
  end,
  heightDelta,
  targetYaw,
  durationScale = 1,
  options = {},
}) {
  characterController.sync(group.current.position);
  const climbDuration = options.actionDuration ?? durationFor(clip) * durationScale;
  startAction(clip, climbDuration, { lockMovement: options.lockMovement ?? true });
  stateRef.current.climbMotion = {
    start: group.current.position.clone(),
    end,
    heightDelta,
    duration: options.motionDuration ?? climbDuration * 0.92,
    startedAt: now,
    targetYaw,
    arcHeight: options.arcHeight,
    exitSpeed: options.exitSpeed || 0,
    earlyExitAt: options.earlyExitAt,
    cancelAt: options.cancelAt,
  };
  velocity.current.set(0, 0, 0);
}
