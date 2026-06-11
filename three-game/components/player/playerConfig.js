import { TERRAIN_BOUNDS } from '../../world/terrain';

export const EMPTY_KEYS = {};

export const PLAYER = {
  walkSpeed: 4.45,
  runSpeed: 7.45,
  jumpVelocity: 6.8,
  gravity: 10.8,
  groundAcceleration: 24,
  groundDeceleration: 22,
  airAcceleration: 6.2,
  airDeceleration: 2.4,
  turnDamping: 15,
  coyoteTime: 0.16,
  runningJumpVerticalBonus: 0.65,
  chargedJumpBonus: 2.25,
  jumpChargeStartDelay: 0.16,
  jumpChargeMaxDuration: 0.58,
  fallGravityMultiplier: 1.18,
  jumpReleaseGravityMultiplier: 1.85,
  groundContactEpsilon: 0.11,
  groundSnapDistance: 0.62,
  uphillSpeedPenalty: 0.14,
  downhillSpeedBoost: 0.05,
  tiredRunFatigue: 68,
  exhaustedRunFatigue: 92,
  bounds: TERRAIN_BOUNDS,
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
  swingHammer: 1.15,
  swingNet: 1.6,
  gather: 3.2,
  pickUp: 1.35,
  lookAround: 2.1,
  lookAroundShort: 1.45,
  point: 1.4,
  trip: 1.8,
  hitReaction: 1.15,
  bigHitFall: 2.25,
  shoulderHitAndFall: 2.35,
  changeItem: 1.0,
  write: 3.8,
  kneelInspect: 3.0,
  standingInspectDownward: 2.4,
  climb: 2.15,
  sprintToWallClimb: 1.25,
  climbingUpWall: 1.55,
  scramble: 0.58,
  teeter: 1.45,
  startWalking: 0.42,
  stopWalking: 0.38,
  runToStop: 0.83,
  standingJump: 1.1,
  runningJump: 0.82,
  turnLeft90: 0.48,
  turnRight90: 0.48,
  fallingToLanding: 0.55,
  landing: 1.0,
  runningLanding: 0.9,
  hardLanding: 1.8,
  bigJumpDown: 1.35,
  fallingToRoll: 1.5,
  dodgeRoll: 0.95,
  gettingUp: 1.65,
  fallingForwardDeath: 2.4,
  jumpTakeoff: 0.42,
};

export const MOVEMENT_INTERRUPTIBLE_ACTIONS = new Set([
  'startWalking',
  'lookAroundShort',
  'stopWalking',
  'runToStop',
  'landing',
  'runningLanding',
  'teeter',
]);

export const CONTROL_INTERRUPTIBLE_ACTIONS = new Set([
  ...MOVEMENT_INTERRUPTIBLE_ACTIONS,
  'startWalking',
]);
