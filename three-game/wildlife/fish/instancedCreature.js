// Shared instancing plumbing for the vertex-shader swimmers (parrotfish,
// manta ray). Each species supplies its own geometry and material; this owns
// the per-instance attribute buffers and the phase integration.
//
// The swim phase is accumulated on the CPU rather than derived from a clock,
// so an animal that speeds up or slows down never jumps mid-stroke.

import * as THREE from 'three';

export function seededUnit(seed, salt = 0) {
  let hash = 2166136261;
  const text = `${seed}:${salt}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash >>>= 0;
  const value = Math.sin(hash * 0.0001739) * 43758.5453;
  return value - Math.floor(value);
}

export function createInstancedCreature({
  geometry: source,
  material,
  count = 1,
  hoverRate,
  burstRate,
  seed = 'creature',
  dead = false,
  castShadow = false,
}) {
  const geometry = source.clone();
  const phase = new Float32Array(count);
  const energy = new Float32Array(count);
  const deadFlag = new Float32Array(count);
  const tint = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    phase[i] = seededUnit(`${seed}:${i}`, 3) * Math.PI * 2;
    energy[i] = 0.35;
    deadFlag[i] = dead ? 1 : 0;
    tint[i * 3] = 1;
    tint[i * 3 + 1] = 1;
    tint[i * 3 + 2] = 1;
  }
  const phaseAttr = new THREE.InstancedBufferAttribute(phase, 1);
  const energyAttr = new THREE.InstancedBufferAttribute(energy, 1);
  const deadAttr = new THREE.InstancedBufferAttribute(deadFlag, 1);
  const tintAttr = new THREE.InstancedBufferAttribute(tint, 3);
  phaseAttr.setUsage(THREE.DynamicDrawUsage);
  energyAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPhase', phaseAttr);
  geometry.setAttribute('aEnergy', energyAttr);
  geometry.setAttribute('aDead', deadAttr);
  geometry.setAttribute('aTint', tintAttr);

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Instances travel tens of metres from the mesh origin, so the geometry
  // bounding sphere would cull the whole group the moment the origin left the
  // frustum.
  if (count > 1) mesh.frustumCulled = false;
  // InstancedMesh ships with an uninitialised matrix buffer; identity keeps a
  // single mount visible before anything writes a transform.
  const identity = new THREE.Matrix4();
  for (let i = 0; i < count; i += 1) mesh.setMatrixAt(i, identity);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;

  return {
    mesh,
    phase,
    energy,
    dead: deadFlag,
    setDead(index, value) {
      deadFlag[index] = value ? 1 : 0;
      deadAttr.needsUpdate = true;
    },
    setTint(index, color) {
      tint[index * 3] = color.r;
      tint[index * 3 + 1] = color.g;
      tint[index * 3 + 2] = color.b;
      tintAttr.needsUpdate = true;
    },
    advance(dt) {
      for (let i = 0; i < count; i += 1) {
        const rate = THREE.MathUtils.lerp(hoverRate, burstRate, energy[i]);
        phase[i] = (phase[i] + dt * rate) % (Math.PI * 2);
      }
      phaseAttr.needsUpdate = true;
      energyAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
    },
  };
}
