import * as THREE from 'three';
import { movementTerrainHeight } from '../world/terrain';

export const DEFAULT_MOBILITY = {
  mode: 'none',
  strength: 0.2,
  maxSpeed: 0.45,
  blend: 0.16,
  sustainedSeconds: 0,
  minDownhillDrop: 0.08,
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
