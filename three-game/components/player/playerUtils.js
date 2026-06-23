import * as THREE from 'three';

export function easeInOutCubic(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function playerControllerDebugEnabled() {
  if (typeof window === 'undefined') return false;
  return window.__enablePlayerControllerDebug === true
    || new URLSearchParams(window.location.search).has('playerControllerDebug')
    || new URLSearchParams(window.location.search).has('modelBoundsDebug');
}

export function dampAngle(current, target, lambda, delta) {
  const deltaAngle = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + deltaAngle * (1 - Math.exp(-lambda * delta));
}

export function formatVector(vector) {
  if (!vector) return '--';
  return `${vector.x.toFixed(2)},${vector.y.toFixed(2)},${vector.z.toFixed(2)}`;
}

export function orientDebugVector(group, direction, length) {
  if (!group) return;
  const normalized = direction.clone();
  if (normalized.lengthSq() < 0.0001 || length <= 0.001) {
    group.visible = false;
    return;
  }
  normalized.normalize();
  group.visible = true;
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalized);
  group.scale.set(1, length, 1);
}
