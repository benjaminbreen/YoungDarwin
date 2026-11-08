import * as THREE from 'three';

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);

export function jumpStyleForLaunch({ moving, running, speed, walkSpeed }) {
  if (running || speed > walkSpeed * 1.12) return 'running';
  return moving || speed > 0.55 ? 'moving' : 'standing';
}

// Time to the controller's contact plane, including accelerated descent.
// A fixed distance threshold prepares too early on a hop and too late on a fall.
export function jumpTimeToContact(distance, verticalSpeed, gravity) {
  if (verticalSpeed >= 0) return Infinity;
  const height = Math.max(0, distance);
  return (Math.sqrt(verticalSpeed * verticalSpeed + 2 * gravity * height) + verticalSpeed) / gravity;
}

export function darwinJumpAnimation(motion) {
  const running = motion.jumpWasRunning;
  const rising = motion.verticalSpeed > 0;
  const ascent = clamp01(1 - (motion.verticalSpeed || 0) / Math.max(1, motion.jumpLaunchVelocity || 6.8));
  const descent = clamp01(1 - (motion.jumpTimeToContact ?? Infinity) / 0.34);
  // Sample only the push-off/flight section: the standing source's long
  // grounded crouch must not play after the physical body has already launched.
  const sampleTime = running
    ? (rising ? THREE.MathUtils.lerp(0.06, 0.38, ascent) : THREE.MathUtils.lerp(0.38, 0.82, descent))
    : (rising ? THREE.MathUtils.lerp(0.5, 0.76, ascent) : THREE.MathUtils.lerp(0.76, 1.06, descent));
  return { clip: running ? 'runningJump' : 'standingJump', sampleTime, fade: 0.06 };
}

export function darwinJumpRecoveryAnimation(motion, now) {
  const recovery = motion.jumpRecovery;
  if (!recovery || motion.airborne || motion.swimming || motion.crouching || motion.aiming) return null;
  const moving = (motion.speed || 0) > 0.7;
  // Input may shorten a standing settle into a step. Once shortened, stopping
  // must not stretch the clock again and rewind the knees into their crouch.
  const duration = Math.min(recovery.duration ?? 0.34, moving ? 0.2 : 0.34);
  recovery.duration = duration;
  const progress = (now - recovery.startedAt) / duration;
  if (progress < 0 || progress >= 1) return null;
  return {
    clip: recovery.running ? 'runningJump' : 'standingJump',
    sampleTime: recovery.running
      ? THREE.MathUtils.lerp(0.82, 1.07, progress)
      : THREE.MathUtils.lerp(1.06, 1.5, progress),
    fade: 0.06,
  };
}
