import { TERRAIN_BOUNDS } from '../../world/terrain';
import { DARWIN5_CLIP_DURATIONS, darwin5ClipExitEarly, darwin5ClipLockDuration } from './darwin5AnimationManifest.mjs';

export const EMPTY_KEYS = {};

export const PLAYER = {
  walkSpeed: 4.45,
  runSpeed: 7.45,
  jumpVelocity: 7.05,
  gravity: 10.8,
  groundAcceleration: 38,
  groundDeceleration: 22,
  lowSpeedTurnBoost: 2.15,
  airAcceleration: 6.2,
  airDeceleration: 2.4,
  turnDamping: 20,
  coyoteTime: 0.2,
  jumpBufferTime: 0.16,
  runningJumpVerticalBonus: 0.82,
  chargedJumpBonus: 2.25,
  jumpChargeStartDelay: 0.16,
  jumpChargeMaxDuration: 0.58,
  fallGravityMultiplier: 1.34,
  jumpReleaseGravityMultiplier: 2.05,
  groundContactEpsilon: 0.11,
  groundSnapDistance: 0.62,
  uphillSpeedPenalty: 0.14,
  downhillSpeedBoost: 0.05,
  tiredRunFatigue: 68,
  exhaustedRunFatigue: 92,
  bounds: TERRAIN_BOUNDS,
};

// Sprint tier: sustained full-speed running spools up into a faster sprint
// gait with a widened camera FOV. Dropping below the effort gate (slowing,
// tiring, crouching, aiming) spools back down.
export const SPRINT = {
  spoolTime: 1.15,      // seconds of sustained near-max running before sprint engages
  speedScale: 1.12,     // sprint ground-speed multiplier over runSpeed
  fovBonus: 8,          // degrees of FOV widen at full sprint
  surgeFov: 2.6,        // extra FOV pop (degrees) the moment sprint engages
  surgeDuration: 0.6,   // seconds for the engage pop to swell and settle
  minSpeedRatio: 0.8,   // fraction of runSpeed that counts as sprint effort
};

// Idle-life behavior: winded recovery after sustained running, and the
// long-wait idle for a player who parks Darwin.
export const IDLE_BEHAVIOR = {
  longIdleAfter: 42,        // seconds of standing still before waitingIdle
  windedEffort: 5.5,        // run-effort seconds that leave Darwin winded
  windedEffortFatigued: 3.6, // lower bar when already fatigued
  windedRecover: 1.1,       // effort level at which breathing settles
};

export const MOVEMENT_FATIGUE = {
  runningPerFrame60: 0.010,
  walkingPerFrame60: 0.0035,
  airbornePerFrame60: 0.0015,
};

// Swimming: past enterDepth Darwin floats and swims instead of drowning.
// Fatigue is the limiting resource — an exhausted swimmer starts to drown.
export const SWIM = {
  enterDepth: 1.12,
  exitDepth: 0.92,
  bodySink: 0.78,
  speed: 2.9,
  sprintSpeed: 4.15,
  fatiguePerSecond: 0.8,
  sprintFatiguePerSecond: 1.8,
  exhaustedFatigue: 97,
};

export const SWIM_POLISH = {
  enabled: true,
  // Root sink is measured from waterline down to Darwin's controller origin.
  // Idle treading should leave head/neck above water; active swimming rides
  // slightly higher so the stroke reads.
  idleBodySink: 1.32,
  movingBodySink: 1.12,
  sprintBodySink: 1.04,
  seafloorClearance: 0.12,
  sinkDamping: 2.8,
  heightDamping: 7.5,
  snapDistance: 1.9,
  cameraPitchBias: 0.22,
  cameraDistanceBias: 0.28,
  cameraSideBias: 0.34,
  cameraPivotBelowSurface: 0.28,
  cameraDistanceMin: 3.7,
  cameraDistanceMax: 5.8,
};

export const SPAWN_DROP = {
  height: 0,
  initialVelocity: -1.2,
  maxFallSpeed: -16,
  landingLock: 0,
};

export const BUMP_FEEDBACK = {
  duration: 0.24,
  cooldown: 0.48,
  minSpeed: 3.4,
  minHeadOn: 0.68,
};

export const CACTUS_HAZARD = {
  cooldown: 1.15,
  shove: 3.8,
  minSpeed: 0.35,
};

export const LANDING_DUST = {
  duration: 0.82,
  particles: 14,
};

export const CAMERA = {
  minZoom: 2.8,
  maxZoom: 22,
  defaultZoom: 5.7,
  rotateSpeed: 0.0042,
  pitchSpeed: 0.005,
  minPitch: -0.45,
  maxPitch: 1.45,
  defaultPitch: 0.3,
  panSpeed: 0.0017,
  maxPan: 7,
  keyRotateSpeed: 2.2,
};

export const ACTION_DURATION = {
  pray: 2.8,
  fireRifle: 1.25,
  swingHammer: 1.65,
  swingNet: 1.85,
  gather: 3.2,
  gatherGround: 3.8,
  gatherChestHeight: 4.23,
  butterflyNetSwing: 3.33,
  pushStart: 4.77,
  pushLow: 0.9,
  pushMedium: 0.95,
  pushHeavy: 1.2,
  pushStop: 2.63,
  pickUp: 1.35,
  lookAround: 2.1,
  lookAroundShort: 1.45,
  idleFidget: 2.2,
  point: 1.4,
  trip: 1.8,
  hitReaction: 2.1,
  bigHitFall: 2.25,
  shoulderHitAndFall: 2.35,
  changeItem: 1.0,
  rifleEquip: 0.9,
  rifleUnequip: 0.9,
  rifleKneelToStand: 0.85,
  rifleCrouchWalkToIdle: 0.8,
  write: 3.8,
  kneelInspect: 4.9,
  standingInspectDownward: 2.4,
  climb: 2.15,
  sprintToWallClimb: 1.8,
  climbingUpWall: 2.0,
  climbingDownWall: 3.1,
  scramble: 0.58,
  vault: 0.72,
  stumble: 0.85,
  runningSlide: 1.55,
  fallingIntoPool: 1.1,
  dive: 1.23,
  jumpFromWall: 0.85,
  swimToEdge: 1.2,
  runningTurn180: 0.7,
  runningTurnLeft: 0.8,
  runningTurnRight: 0.8,
  walkingTurn180: 0.62,
  teeter: 1.45,
  startWalking: 0.42,
  stopWalking: 0.38,
  runToStop: 0.83,
  standingJump: 1.1,
  runningJump: 0.82,
  turnLeft90: 0.48,
  turnRight90: 0.48,
  fallingToLanding: 1.1,
  landing: 1.0,
  runningLanding: 0.9,
  hardLanding: 1.8,
  bigJumpDown: 1.35,
  runToDive: 1.05,
  fallingToRoll: 1.15,
  dodgeRoll: 0.95,
  wallRun: 0.95,
  standToSit: 2.25,
  lyingDown: 2.6,
  turnLeft: 0.95,
  turnRight: 0.95,
  gettingUp: 1.65,
  fallingForwardDeath: 2.4,
  jumpTakeoff: 0.42,
};

export const DARWIN5_ACTION_DURATION = {
  ...ACTION_DURATION,
  ...DARWIN5_CLIP_DURATIONS,
};

export function actionDuration(clip, modelAssetId = null) {
  if (modelAssetId === 'darwin5') {
    const base = DARWIN5_ACTION_DURATION[clip] || ACTION_DURATION[clip] || 1.2;
    // End one-shots slightly before the clip runs out so the crossfade back
    // overlaps the clip's return-to-base pose instead of a clamped last frame.
    const exitEarly = darwin5ClipExitEarly(clip);
    if (Number.isFinite(exitEarly) && exitEarly > 0) return Math.max(base * 0.5, base - exitEarly);
    return base;
  }
  return ACTION_DURATION[clip] || 1.2;
}

export function actionLockDuration(clip, modelAssetId = null, fallbackDuration = actionDuration(clip, modelAssetId)) {
  if (modelAssetId === 'darwin5') {
    const manifestLock = darwin5ClipLockDuration(clip);
    if (Number.isFinite(manifestLock)) return Math.max(0, manifestLock);
  }
  return Math.max(0, fallbackDuration || 0);
}

export const MOVEMENT_INTERRUPTIBLE_ACTIONS = new Set([
  'startWalking',
  'lookAroundShort',
  'lookAround',
  'fidgetStand',
  'neckStretch',
  'armStretch',
  'neutralIdle',
  'happyIdle',
  'inspectNearbyIdle',
  'stopWalking',
  'runToStop',
  'landing',
  'runningLanding',
  'teeter',
  'rifleEquip',
  'rifleUnequip',
]);

export const CONTROL_INTERRUPTIBLE_ACTIONS = new Set([
  ...MOVEMENT_INTERRUPTIBLE_ACTIONS,
  'startWalking',
  'stumble',
  'runningTurn180',
  'walkingTurn180',
]);
