export const DARWIN5_ANIMATION_MANIFEST = {
  idle: { category: 'idle', loop: true, fade: 0.22 },
  holdIdle: { category: 'idle', loop: true, fade: 0.2, fallback: 'idle' },
  holdToolIdle: { category: 'idle', loop: true, fade: 0.18, fallback: 'idle' },
  lookAround: { category: 'idleAction', duration: 6.93, lockDuration: 0, fade: 0.18, exitEarly: 0.3, fallback: 'idle' },
  lookAroundShort: { category: 'idleAction', duration: 3.6, lockDuration: 0, fade: 0.16, exitEarly: 0.28, fallback: 'lookAround' },
  // Idle variety pool. One-shot fidgets exit early (exitEarly) so the fade
  // back to idle overlaps the clip's own return-to-base instead of starting
  // from a clamped final frame.
  fidgetStand: { category: 'idleAction', duration: 10.6, lockDuration: 0, fade: 0.3, exitEarly: 0.4, fallback: 'lookAroundShort' },
  neckStretch: { category: 'idleAction', duration: 4.63, lockDuration: 0, fade: 0.3, exitEarly: 0.35, fallback: 'lookAroundShort' },
  armStretch: { category: 'idleAction', duration: 10.77, lockDuration: 0, fade: 0.3, exitEarly: 0.4, fallback: 'neckStretch' },
  neutralIdle: { category: 'idleAction', duration: 7.2, lockDuration: 0, fade: 0.32, exitEarly: 0.4, fallback: 'idle' },
  happyIdle: { category: 'idleAction', duration: 2.03, lockDuration: 0, fade: 0.24, exitEarly: 0.2, fallback: 'lookAroundShort' },
  // Mixamo "Sad Idle" (head down, fidgety foot kick) repurposed as a
  // studying-something-on-the-ground fidget — only offered near a specimen.
  inspectNearbyIdle: { category: 'idleAction', duration: 2.83, lockDuration: 0, fade: 0.28, exitEarly: 0.2, fallback: 'lookAroundShort' },
  // Conditional base idles: looped, selected by the animation selector while
  // the condition holds (winded after a sprint, bored after a long idle,
  // exhausted at high fatigue). boredIdle is a GLB alias of fidgetStand.
  windedIdle: { category: 'idle', loop: true, fade: 0.28, fallback: 'idle' },
  boredIdle: { category: 'idle', loop: true, fade: 0.34, fallback: 'idle' },
  tiredIdle: { category: 'idle', loop: true, fade: 0.3, fallback: 'windedIdle' },
  walk: { category: 'locomotion', loop: true, fade: 0.14 },
  run: { category: 'locomotion', loop: true, fade: 0.12 },
  sprint: { category: 'locomotion', loop: true, fade: 0.16, fallback: 'run' },
  grassRun: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'run' },
  jog: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'run' },
  tiredWalk: { category: 'locomotion', loop: true, fade: 0.16, fallback: 'walk' },
  wadeWalk: { category: 'water', loop: true, fade: 0.2, fallback: 'tiredWalk' },
  walkBackwards: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'walk' },
  runBackwards: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'walkBackwards' },
  jogBackwards: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'runBackwards' },
  backwardTurnLeft: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'walkBackwards' },
  backwardTurnRight: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'walkBackwards' },
  walkStrafeLeft: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'walk' },
  walkStrafeRight: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'walk' },
  runStrafeLeft: { category: 'locomotion', loop: true, fade: 0.12, fallback: 'run' },
  runStrafeRight: { category: 'locomotion', loop: true, fade: 0.12, fallback: 'run' },
  walkCarry: { category: 'locomotion', loop: true, fade: 0.16, fallback: 'walk' },
  // Shouldered shotgun (ADS): dedicated aiming idle/walk transplanted from
  // "Idle Aiming.fbx" / "Walking Aiming.fbx".
  aimIdle: { category: 'idle', loop: true, fade: 0.16, fallback: 'aim' },
  aimWalk: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'walkRifle' },
  holdWalk: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'walkCarry' },
  holdToolWalk: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'torchWalk' },
  holdToolRun: { category: 'locomotion', loop: true, fade: 0.12, fallback: 'holdToolWalk' },
  crouchWalk: { category: 'locomotion', loop: true, fade: 0.16, fallback: 'torchCrouchWalk' },
  crouchRun: { category: 'locomotion', loop: true, fade: 0.14, fallback: 'crouchWalk' },
  crouchIdle: { category: 'idle', loop: true, fade: 0.18 },
  startWalking: { category: 'locomotionTransition', duration: 0.42, lockDuration: 0, fade: 0.1 },
  stopWalking: { category: 'locomotionTransition', duration: 0.38, lockDuration: 0, fade: 0.1 },
  runToStop: { category: 'locomotionTransition', duration: 0.83, lockDuration: 0, fade: 0.08 },
  runningTurn180: { category: 'locomotionTransition', duration: 0.38, lockDuration: 0, fade: 0.04 },
  runningTurnLeft: { category: 'locomotionTransition', duration: 0.42, lockDuration: 0, fade: 0.04, fallback: 'runningTurn180' },
  runningTurnRight: { category: 'locomotionTransition', duration: 0.42, lockDuration: 0, fade: 0.04, fallback: 'runningTurn180' },

  standingJumpHold: { category: 'jump', loop: true, fade: 0.05 },
  runningJumpHold: { category: 'jump', loop: true, fade: 0.05 },
  fallingIdle: { category: 'fall', duration: 0.73, loop: true, fade: 0.08, fallback: 'fall' },
  fallingToLanding: { category: 'landing', duration: 1.1, lockDuration: 0.18, fade: 0.05, exitEarly: 0.18 },
  jumpDown: { category: 'landing', duration: 2.3, lockDuration: 0.28, fade: 0.05, exitEarly: 0.3, fallback: 'fallingToLanding' },
  bigJumpDown: { category: 'landing', duration: 2.6, lockDuration: 0.38, fade: 0.05, exitEarly: 0.3, fallback: 'jumpDown' },
  fallingToRoll: { category: 'landing', duration: 1.83, lockDuration: 0.5, fade: 0.05 },
  landing: { category: 'landing', duration: 1.0, lockDuration: 0.14, fade: 0.05 },
  runningLanding: { category: 'landing', duration: 0.9, lockDuration: 0.12, fade: 0.05 },
  hardLanding: { category: 'impact', duration: 1.8, lockDuration: 0.9, fade: 0.06 },
  fallingIntoPool: { category: 'water', duration: 1.1, lockDuration: 0.4, fade: 0.05, fallback: 'runToDive' },
  dive: { category: 'water', duration: 1.23, lockDuration: 0.36, fade: 0.05, fallback: 'runToDive' },
  runToDive: { category: 'water', duration: 1.23, lockDuration: 0.4, fade: 0.05, fallback: 'fallingToRoll' },
  swimFast: { category: 'water', loop: true, fade: 0.14, fallback: 'swim' },
  swimToEdge: { category: 'water', duration: 5.03, lockDuration: 0.34, fade: 0.16 },

  climb: { category: 'climb', duration: 2.15, lockDuration: 0.85, fade: 0.06, fallback: 'climbingUpWall' },
  climbWaistHeight: { category: 'climb', duration: 1.05, lockDuration: 0.32, fade: 0.05, fallback: 'vault' },
  climbHeadHeight: { category: 'climb', duration: 1.18, lockDuration: 0.44, fade: 0.05, fallback: 'climbingUpWall' },
  sprintToWallClimb: { category: 'climb', duration: 1.83, lockDuration: 0.9, fade: 0.06, fallback: 'climbingUpWall' },
  climbingUpWall: { category: 'climb', duration: 2.03, lockDuration: 1.05, fade: 0.06 },
  climbingDownWall: { category: 'climb', duration: 3.16, lockDuration: 1.15, fade: 0.08 },
  vault: { category: 'climb', duration: 2.13, lockDuration: 0.5, fade: 0.05, fallback: 'climbingUpWall' },
  descendStairs: { category: 'locomotion', duration: 0.96, loop: true, fade: 0.16 },

  gather: { category: 'action', duration: 3.7, lockDuration: 1.2, fade: 0.12, exitEarly: 0.3, fallback: 'gatherGround' },
  gatherGround: { category: 'action', duration: 3.8, lockDuration: 1.25, fade: 0.12, exitEarly: 0.3, fallback: 'gather' },
  gatherChestHeight: { category: 'action', duration: 4.23, lockDuration: 1.35, fade: 0.12, exitEarly: 0.3, fallback: 'gatherGround' },
  kneelInspect: { category: 'action', duration: 4.96, lockDuration: 1.2, fade: 0.12, exitEarly: 0.35, fallback: 'torchInspectForward' },
  write: { category: 'action', duration: 6.0, lockDuration: 1.0, fade: 0.14, exitEarly: 0.35, fallback: 'torchInspectForward' },
  swingTool: { category: 'action', duration: 1.63, lockDuration: 0.72, fade: 0.06, fallback: 'heavyToolSwing' },
  swingHammer: { category: 'action', duration: 1.63, lockDuration: 0.72, fade: 0.06, fallback: 'heavyToolSwing' },
  swingNet: { category: 'action', duration: 1.63, lockDuration: 0.72, fade: 0.06, fallback: 'butterflyNetSwing' },
  butterflyNetSwing: { category: 'action', duration: 3.33, lockDuration: 0.9, fade: 0.06, fallback: 'swingTool' },
  heavyToolSwing: { category: 'action', duration: 1.63, lockDuration: 0.72, fade: 0.06, fallback: 'swingTool' },
  pushStart: { category: 'push', duration: 4.77, lockDuration: 0.35, fade: 0.08, fallback: 'pushMedium' },
  pushLow: { category: 'push', duration: 0.9, loop: true, lockDuration: 0.16, fade: 0.08, fallback: 'pushMedium' },
  pushMedium: { category: 'push', duration: 0.95, loop: true, lockDuration: 0.18, fade: 0.08, fallback: 'pushLow' },
  pushHeavy: { category: 'push', duration: 1.2, loop: true, lockDuration: 0.24, fade: 0.08, fallback: 'pushMedium' },
  pushStop: { category: 'push', duration: 2.63, lockDuration: 0.2, fade: 0.08, fallback: 'pushMedium' },
  standToSit: { category: 'rest', duration: 2.27, lockDuration: 0.9, fade: 0.12 },
  lyingDown: { category: 'rest', duration: 5.76, lockDuration: 1.2, fade: 0.18 },
  layingIdle: { category: 'rest', loop: true, fade: 0.3 },
  gettingUp: { category: 'rest', duration: 2.73, lockDuration: 1.1, fade: 0.1, fallback: 'rifleKneelToStand' },

  hitReaction: { category: 'impact', duration: 2.13, lockDuration: 0.34, fade: 0.04, fallback: 'teeter' },
  stumble: { category: 'impact', duration: 1.2, lockDuration: 0.12, fade: 0.04, fallback: 'teeter' },
  trip: { category: 'impact', duration: 1.63, lockDuration: 0.65, fade: 0.04, fallback: 'fallingToRoll' },
  shoulderHitAndFall: { category: 'impact', duration: 3.13, lockDuration: 1.05, fade: 0.04, fallback: 'bigHitFall' },
  runningSlide: { category: 'impact', duration: 1.56, lockDuration: 0.55, fade: 0.05, fallback: 'fallingToRoll' },
};

export const DARWIN5_CLIP_DURATIONS = Object.fromEntries(
  Object.entries(DARWIN5_ANIMATION_MANIFEST)
    .filter(([, meta]) => Number.isFinite(meta.duration))
    .map(([clip, meta]) => [clip, meta.duration]),
);

export const DARWIN5_REQUIRED_RUNTIME_CLIPS = [
  'idle',
  'walk',
  'run',
  'startWalking',
  'stopWalking',
  'runToStop',
  'runningTurn180',
  'runningTurnLeft',
  'runningTurnRight',
  'crouchWalk',
  'crouchRun',
  'fallingIdle',
  'fallingToRoll',
  'jumpDown',
  'bigJumpDown',
  'dive',
  'swimFast',
  'climbWaistHeight',
  'climbHeadHeight',
  'runToDive',
  'swimToEdge',
  'stumble',
  'trip',
  'gather',
  'gatherGround',
  'gatherChestHeight',
  'butterflyNetSwing',
  'pushLow',
  'pushMedium',
  'pushHeavy',
  'write',
  'vault',
  'gettingUp',
  'lookAroundShort',
  'walkStrafeLeft',
  'walkStrafeRight',
  'runStrafeLeft',
  'runStrafeRight',
  'holdIdle',
  'holdToolIdle',
  'walkCarry',
  'holdWalk',
  'holdToolWalk',
  'holdToolRun',
  'heavyToolSwing',
  'sprint',
  'runBackwards',
  'jogBackwards',
  'windedIdle',
  'boredIdle',
  'inspectNearbyIdle',
  'tiredIdle',
  'fidgetStand',
  'neckStretch',
  'armStretch',
  'breathingIdle',
];

function normalizeClipKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const DARWIN5_META_BY_NORMALIZED = new Map(
  Object.entries(DARWIN5_ANIMATION_MANIFEST).map(([clip, meta]) => [normalizeClipKey(clip), meta]),
);

export function darwin5AnimationMeta(clip) {
  return DARWIN5_ANIMATION_MANIFEST[clip] || DARWIN5_META_BY_NORMALIZED.get(normalizeClipKey(clip)) || null;
}

export function darwin5ClipDuration(clip) {
  return darwin5AnimationMeta(clip)?.duration ?? null;
}

export function darwin5ClipLockDuration(clip) {
  return darwin5AnimationMeta(clip)?.lockDuration ?? null;
}

export function darwin5ClipFallback(clip) {
  return darwin5AnimationMeta(clip)?.fallback ?? null;
}

// Seconds to end a one-shot action before its clip runs out, so the crossfade
// back to the base state overlaps the clip's own return-to-base motion rather
// than starting from a clamped final frame.
export function darwin5ClipExitEarly(clip) {
  return darwin5AnimationMeta(clip)?.exitEarly ?? null;
}

export function darwin5ClipSettings(clip) {
  const meta = darwin5AnimationMeta(clip);
  if (!meta) return {};
  const settings = {};
  if (meta.loop !== undefined) settings.loop = meta.loop;
  if (meta.fade !== undefined) settings.fade = meta.fade;
  return settings;
}

export function darwin5TransitionFade(fromClip, toClip) {
  const to = darwin5AnimationMeta(toClip);
  const from = darwin5AnimationMeta(fromClip);
  if (to?.fade !== undefined) return to.fade;
  if (to?.category === 'impact') return 0.04;
  if (to?.category === 'landing' || to?.category === 'jump') return 0.05;
  if (to?.category === 'climb') return 0.06;
  if (to?.category === 'water') return 0.16;
  if (to?.category === 'locomotionTransition') return 0.08;
  if (to?.category === 'locomotion' && from?.category === 'locomotion') return 0.12;
  if (to?.category === 'locomotion' || from?.category === 'locomotion') return 0.15;
  if (to?.category === 'action' || to?.category === 'idleAction') return 0.12;
  return null;
}
