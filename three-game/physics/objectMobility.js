import * as THREE from 'three';
import { movementTerrainHeight } from '../world/terrain';

export const DEFAULT_MOBILITY = {
  mode: 'none',
  strength: 0.2,
  maxSpeed: 0.45,
  contactMaxSpeed: null,
  blend: 0.16,
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

export function computeAssistedPushVelocity({ velocity = {}, direction = {}, mobility = null }) {
  const config = normalizeMobility(mobility);
  const targetSpeed = Math.max(0, config.assistSpeed ?? config.strength ?? DEFAULT_MOBILITY.strength);
  const maxSpeed = mobilityMaxSpeed(config);
  const blend = THREE.MathUtils.clamp(config.blend ?? DEFAULT_MOBILITY.blend, 0, 1);
  const dirLength = Math.hypot(direction.x || 0, direction.z || 0) || 1;
  const dx = (direction.x || 0) / dirLength;
  const dz = (direction.z || 0) / dirLength;
  const currentAlongPush = Math.max(0, (velocity.x || 0) * dx + (velocity.z || 0) * dz);
  const assistedSpeed = Math.min(Math.max(currentAlongPush, targetSpeed), maxSpeed);

  return capHorizontalVelocity({
    x: (velocity.x || 0) + (dx * assistedSpeed - (velocity.x || 0)) * blend,
    y: velocity.y || 0,
    z: (velocity.z || 0) + (dz * assistedSpeed - (velocity.z || 0)) * blend,
  }, maxSpeed);
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
