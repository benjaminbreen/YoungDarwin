import * as THREE from 'three';
import { movementTerrainHeight } from '../world/terrain';

export const DEFAULT_MOBILITY = {
  mode: 'none',
  strength: 0.2,
  maxSpeed: 0.45,
  contactMaxSpeed: null,
  sustainedSeconds: 0,
  minDownhillDrop: 0.08,
  verticalLaunchMax: 0.28,
  groundedExtraDamping: 0,
};

export function normalizeMobility(mobility = null, fallbackMode = 'none') {
  return {
    ...DEFAULT_MOBILITY,
    mode: fallbackMode,
    ...(mobility || {}),
  };
}

export function canPickupObject(mobility, carryable = null) {
  const mode = normalizeMobility(mobility).mode;
  return Boolean(carryable) && (mode === 'pickup' || mode === 'pickup-push');
}

export function canPushObject(mobility) {
  const mode = normalizeMobility(mobility).mode;
  return mode === 'push'
    || mode === 'pickup-push'
    || mode === 'downhill-push'
    || mode === 'fixed';
}

export function isDownhillMoveAllowed({ position, direction, zoneId, mobility }) {
  const config = normalizeMobility(mobility);
  if (config.mode !== 'downhill-push') return true;
  const currentY = movementTerrainHeight(position.x, position.z, zoneId);
  const aheadY = movementTerrainHeight(position.x + direction.x * 0.9, position.z + direction.z * 0.9, zoneId);
  return currentY - aheadY >= config.minDownhillDrop;
}

export function downhillGrade({ position, direction, zoneId }) {
  const currentY = movementTerrainHeight(position.x, position.z, zoneId);
  const aheadY = movementTerrainHeight(position.x + direction.x * 0.9, position.z + direction.z * 0.9, zoneId);
  return THREE.MathUtils.clamp((currentY - aheadY) / 0.9, -1, 1);
}

export function computePushAmount({ mobility, impactSpeed = 0, sustainedTime = 0, slope = 0 }) {
  const config = normalizeMobility(mobility);
  if (!canPushObject(config) || config.mode === 'fixed') return 0;
  if (sustainedTime < config.sustainedSeconds) return 0;
  const strength = Math.max(0, config.strength ?? DEFAULT_MOBILITY.strength);
  const impact = THREE.MathUtils.clamp(impactSpeed / 4, 0.15, 1);
  const effort = THREE.MathUtils.clamp((sustainedTime - config.sustainedSeconds) / 1.2, 0.35, 1);
  const slopeBoost = config.mode === 'downhill-push'
    ? THREE.MathUtils.clamp(0.45 + Math.max(0, slope) * 1.8, 0.35, 1)
    : 1;
  return strength * impact * effort * slopeBoost;
}

export function horizontalSpeed(vector = {}) {
  return Math.hypot(vector.x || 0, vector.z || 0);
}

export function capHorizontalVelocity(velocity = {}, maxSpeed = DEFAULT_MOBILITY.maxSpeed) {
  const safeMax = Math.max(0, Number.isFinite(maxSpeed) ? maxSpeed : DEFAULT_MOBILITY.maxSpeed);
  const speed = horizontalSpeed(velocity);
  if (safeMax <= 0 || speed <= safeMax || speed <= 0.0001) {
    return {
      x: velocity.x || 0,
      y: velocity.y || 0,
      z: velocity.z || 0,
    };
  }
  const scale = safeMax / speed;
  return {
    x: (velocity.x || 0) * scale,
    y: velocity.y || 0,
    z: (velocity.z || 0) * scale,
  };
}

export function mobilityMaxSpeed(mobility) {
  const config = normalizeMobility(mobility);
  const assistSpeed = config.assistSpeed ?? config.strength ?? DEFAULT_MOBILITY.strength;
  return Math.max(
    0.05,
    config.contactMaxSpeed ?? config.maxSpeed ?? Math.max(DEFAULT_MOBILITY.maxSpeed, assistSpeed),
  );
}

function movePlanarVelocityToward(velocity, targetX, targetZ, maxChange) {
  const deltaX = targetX - (velocity.x || 0);
  const deltaZ = targetZ - (velocity.z || 0);
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= maxChange || distance <= 0.0001) {
    return { x: targetX, z: targetZ };
  }
  const scale = maxChange / distance;
  return {
    x: (velocity.x || 0) + deltaX * scale,
    z: (velocity.z || 0) + deltaZ * scale,
  };
}

// Character contact is authored rather than delegated to Rapier's one-mass
// automatic shove. Weight controls how long an object resists and how quickly
// it gathers speed; the per-type mobility profile still owns its final pace.
export function computeControlledPushVelocity({
  velocity = {},
  direction = {},
  mobility = null,
  mass = 1,
  impactSpeed = 0,
  sustainedTime = 0,
  delta = 1 / 60,
}) {
  const config = normalizeMobility(mobility);
  if (!canPushObject(config) || config.mode === 'fixed') return { ...velocity };

  const safeMass = Math.max(0.1, Number.isFinite(mass) ? mass : 1);
  const onset = Number.isFinite(config.contactDelay)
    ? Math.max(0, config.contactDelay)
    : THREE.MathUtils.clamp((safeMass - 12) / 240, 0, 0.28);
  const maxSpeed = mobilityMaxSpeed(config);
  const current = capHorizontalVelocity(velocity, maxSpeed);
  if (sustainedTime < onset) {
    return {
      ...current,
      // Walking contact must never provide the lift that tips a barrel onto
      // Darwin; negative velocity is preserved so falling objects still fall.
      y: Math.min(current.y || 0, 0.02),
    };
  }

  const length = Math.hypot(direction.x || 0, direction.z || 0) || 1;
  const dx = (direction.x || 0) / length;
  const dz = (direction.z || 0) / length;
  const effort = THREE.MathUtils.clamp((sustainedTime - onset) / 0.36, 0, 1);
  const contactEnergy = THREE.MathUtils.clamp(impactSpeed / 4.45, 0.55, 1);
  const authoredSpeed = Math.max(0, config.assistSpeed ?? config.strength ?? DEFAULT_MOBILITY.strength);
  const targetSpeed = Math.min(maxSpeed, authoredSpeed * (0.35 + effort * 0.65) * contactEnergy);
  const acceleration = Number.isFinite(config.pushAcceleration)
    ? Math.max(0, config.pushAcceleration)
    : THREE.MathUtils.clamp(11 / Math.sqrt(safeMass), 0.8, 3.2);
  const next = movePlanarVelocityToward(
    current,
    dx * targetSpeed,
    dz * targetSpeed,
    acceleration * Math.min(Math.max(delta, 0), 0.05),
  );

  return capHorizontalVelocity({
    x: next.x,
    y: Math.min(current.y || 0, 0.02),
    z: next.z,
  }, maxSpeed);
}

// A landing should make a loose prop settle and wobble, never launch it. The
// response falls off with mass so a mug reacts visibly while a loaded barrel
// merely gives a small, weighty shudder.
export function computeLandingSettleMotion({
  linearVelocity = {},
  angularVelocity = {},
  direction = {},
  mass = 1,
  fallSpeed = 0,
} = {}) {
  const impact = THREE.MathUtils.clamp((Number(fallSpeed) || 0) / 12, 0, 1);
  const massResponse = 1 / Math.sqrt(Math.max(1, (Number(mass) || 1) / 2));
  const directionLength = Math.hypot(direction.x || 0, direction.z || 0) || 1;
  const dx = (direction.x || 0) / directionLength;
  const dz = (direction.z || 0) / directionLength;
  const planarKeep = THREE.MathUtils.lerp(0.96, 0.84, impact);
  const downwardSpeed = (0.04 + impact * 0.32) * massResponse;
  const wobble = impact * 0.38 * massResponse;
  return {
    linear: {
      x: (linearVelocity.x || 0) * planarKeep,
      y: Math.min(linearVelocity.y || 0, -downwardSpeed),
      z: (linearVelocity.z || 0) * planarKeep,
    },
    angular: {
      x: (angularVelocity.x || 0) + dz * wobble,
      y: (angularVelocity.y || 0) * 0.92,
      z: (angularVelocity.z || 0) - dx * wobble,
    },
  };
}

export function mobilityVelocityCaps(mobility) {
  const config = normalizeMobility(mobility);
  const maxSpeed = mobilityMaxSpeed(config);
  return {
    horizontalMaxSpeed: maxSpeed,
    struckHorizontalMaxSpeed: config.struckMaxSpeed ?? Math.max(maxSpeed * 2.8, 1.8),
    verticalLaunchMax: config.verticalLaunchMax ?? DEFAULT_MOBILITY.verticalLaunchMax,
    struckVerticalLaunchMax: config.struckVerticalLaunchMax ?? 1.1,
    groundedExtraDamping: config.groundedExtraDamping ?? DEFAULT_MOBILITY.groundedExtraDamping,
  };
}

export function mobilityPushAnimationTarget(object, mobility = null) {
  const config = normalizeMobility(mobility || object?.mobility);
  const height = Number.isFinite(object?.colliderTop) ? object.colliderTop : object?.height;
  const pushMass = object?.pushMass || object?.mass || 1;
  return {
    kind: object?.kind || object?.type || 'prop',
    height,
    colliderTop: height,
    pushMass,
    fixed: config.mode === 'fixed',
  };
}
