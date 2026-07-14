// Small deterministic-geometry helpers shared by the procedural breakable
// plants (prickly pear, lava cactus): seeded hashing/rng and the flat-array
// spike emitter their spine/tuft geometries are built from.

import * as THREE from 'three';

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededUnit(seed, salt = 0) {
  const value = Math.sin((hashString(seed) + salt * 1013) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function makeRng(seed) {
  let salt = 0;
  return () => {
    salt += 1;
    return seededUnit(seed, salt);
  };
}

// Emit one tiny 4-sided spike into flat arrays (4 side triangles, open base).
export function pushSpike(positions, origin, dir, radius, length) {
  const axis = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
  const tip = new THREE.Vector3().copy(origin).addScaledVector(axis, length);
  const side = Math.abs(axis.y) > 0.9
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(axis, side).normalize().multiplyScalar(radius);
  const v = new THREE.Vector3().crossVectors(axis, u).normalize().multiplyScalar(radius);
  const base = [
    new THREE.Vector3().copy(origin).add(u),
    new THREE.Vector3().copy(origin).add(v),
    new THREE.Vector3().copy(origin).sub(u),
    new THREE.Vector3().copy(origin).sub(v),
  ];
  for (let i = 0; i < 4; i += 1) {
    const a = base[i];
    const b = base[(i + 1) % 4];
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
  }
}
