import * as THREE from 'three';
import { PLAYER } from './playerConfig';

const DEFAULT_TRACTION = {
  traction: 1,
  downhill: 1,
  skid: 1,
  dust: 1,
  landingCarry: 1,
};

const BIOME_TRACTION = {
  'ash-slope': { traction: 0.78, downhill: 1.28, skid: 1.35, dust: 1.35, landingCarry: 1.18 },
  'black-lava': { traction: 0.88, downhill: 1.08, skid: 1.15, dust: 0.95, landingCarry: 1.05 },
  'wet-basalt': { traction: 0.68, downhill: 1.18, skid: 1.55, dust: 0.45, landingCarry: 1.22 },
  'tuff-ridge': { traction: 0.84, downhill: 1.18, skid: 1.25, dust: 1.18, landingCarry: 1.12 },
  'dry-scrub': { traction: 0.96, downhill: 1.02, skid: 0.9, dust: 0.92, landingCarry: 0.94 },
  'palo-santo': { traction: 0.98, downhill: 1, skid: 0.86, dust: 0.88, landingCarry: 0.92 },
  'white-sand': { traction: 0.76, downhill: 0.92, skid: 1.18, dust: 1.12, landingCarry: 0.86 },
  'green-beach': { traction: 0.8, downhill: 0.94, skid: 1.12, dust: 1.08, landingCarry: 0.9 },
  sand: { traction: 0.76, downhill: 0.92, skid: 1.18, dust: 1.12, landingCarry: 0.86 },
};

const SKID_COOLDOWN = 0.18;
const PIVOT_COOLDOWN = 0.42;
const MAX_COMBINED_GROUND_SPEED_SCALE = 1.18;

function tractionForBiome(biome) {
  return BIOME_TRACTION[biome] || DEFAULT_TRACTION;
}

function horizontalSpeed(velocity) {
  return Math.hypot(velocity.x, velocity.z);
}

export function createArcadeLocomotionState() {
  return {
    skid: 0,
    scramble: 0,
    pivotBurst: 0,
    lastSkidAt: -10,
    lastPivotAt: -10,
    travel: new THREE.Vector3(),
    side: new THREE.Vector3(),
    landing: new THREE.Vector3(),
  };
}

export function computeArcadeLocomotion({
  state,
  delta,
  now,
  biome,
  slopeGrade,
  downhillDot,
  moving,
  running,
  airborne,
  swimming,
  crouching,
  aiming,
  velocity,
  inputDirection,
}) {
  const traction = tractionForBiome(biome);
  const speed = horizontalSpeed(velocity);
  const downhill = Math.max(0, downhillDot) * THREE.MathUtils.clamp(slopeGrade / 0.36, 0, 1);
  const scrambleTarget = (
    moving
    && running
    && !airborne
    && !swimming
    && !crouching
    && downhill > 0.42
    && slopeGrade > 0.18
  ) ? THREE.MathUtils.clamp((downhill - 0.32) * 1.7 * traction.skid, 0, 1) : 0;
  state.scramble = THREE.MathUtils.damp(state.scramble, scrambleTarget, 7, delta);

  let skidPulse = 0;
  let pivotBurst = 0;
  if (moving && !airborne && !swimming && !crouching && !aiming && inputDirection.lengthSq() > 0.001 && speed > PLAYER.walkSpeed * 1.15) {
    const travel = state.travel.set(velocity.x, 0, velocity.z);
    if (travel.lengthSq() > 0.001) {
      travel.normalize();
      const steeringDot = THREE.MathUtils.clamp(travel.dot(inputDirection), -1, 1);
      const hardTurn = steeringDot < -0.22;
      const pivotTurn = steeringDot < -0.68;
      if (hardTurn && now - state.lastSkidAt > SKID_COOLDOWN) {
        state.lastSkidAt = now;
        skidPulse = THREE.MathUtils.clamp((-steeringDot - 0.12) * traction.skid * speed / PLAYER.runSpeed, 0.18, 1);
      }
      if (pivotTurn && now - state.lastPivotAt > PIVOT_COOLDOWN) {
        state.lastPivotAt = now;
        pivotBurst = THREE.MathUtils.clamp((-steeringDot - 0.52) * speed / PLAYER.runSpeed, 0.12, 0.65);
      }
    }
  }
  state.skid = Math.max(skidPulse, Math.max(0, state.skid - delta * 5));
  state.pivotBurst = Math.max(pivotBurst, Math.max(0, state.pivotBurst - delta * 6));

  const baseDownhillBoost = running ? 0.2 : 0.1;
  const speedScale = 1
    + downhill * baseDownhillBoost * traction.downhill
    + state.scramble * 0.06;
  const accelScale = THREE.MathUtils.clamp(traction.traction - state.scramble * 0.18, 0.54, 1.12);
  const decelScale = THREE.MathUtils.clamp(traction.traction - state.skid * 0.28, 0.42, 1.08);
  const lateralKeep = THREE.MathUtils.clamp(state.skid * (0.16 + (1 - traction.traction) * 0.32), 0, 0.34);
  return {
    biome,
    traction,
    downhill,
    speedScale,
    accelScale,
    decelScale,
    lateralKeep,
    skid: state.skid,
    scramble: state.scramble,
    pivotBurst: state.pivotBurst,
    feedbackIntensity: THREE.MathUtils.clamp(Math.max(state.skid, state.scramble * 0.72, state.pivotBurst), 0, 1),
  };
}

export function cappedArcadeSpeedScale({ slopeSpeedScale, arcadeSpeedScale, airborne, swimming }) {
  if (airborne || swimming) return 1;
  const combined = slopeSpeedScale * arcadeSpeedScale;
  if (combined <= MAX_COMBINED_GROUND_SPEED_SCALE) return arcadeSpeedScale;
  return MAX_COMBINED_GROUND_SPEED_SCALE / Math.max(0.001, slopeSpeedScale);
}

export function applyArcadeSteering({ state, velocity, inputDirection, targetVelocity, arcade }) {
  if (!arcade || arcade.lateralKeep <= 0 || inputDirection.lengthSq() < 0.001) return;
  const current = state.travel.set(velocity.x, 0, velocity.z);
  if (current.lengthSq() < 0.001) return;
  const side = state.side.set(-inputDirection.z, 0, inputDirection.x);
  const sideAmount = current.dot(side);
  targetVelocity.addScaledVector(side, sideAmount * arcade.lateralKeep);
}

export function arcadeLandingMomentum({ state, velocity, facing, falling, landingSpeed, downhillDot, slopeGrade, biome }) {
  const traction = tractionForBiome(biome);
  const downhill = Math.max(0, downhillDot) * THREE.MathUtils.clamp(slopeGrade / 0.34, 0, 1);
  if (falling < 1.2 || landingSpeed < PLAYER.walkSpeed * 0.85 || downhill <= 0.12) {
    return { speedScale: 1, dustBonus: 0 };
  }
  const speedScale = 1 + THREE.MathUtils.clamp(downhill * 0.18 * traction.landingCarry, 0, 0.22);
  const dustBonus = THREE.MathUtils.clamp(downhill * 0.24 * traction.dust, 0, 0.22);
  if (speedScale > 1.01) {
    const current = state.landing.set(velocity.x, 0, velocity.z);
    if (current.lengthSq() > 0.001) current.multiplyScalar(speedScale);
    else current.copy(facing).setY(0).normalize().multiplyScalar(PLAYER.walkSpeed * 0.42);
    velocity.x = current.x;
    velocity.z = current.z;
  }
  return { speedScale, dustBonus };
}
