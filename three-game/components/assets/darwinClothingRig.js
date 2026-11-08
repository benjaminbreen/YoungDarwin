import * as THREE from 'three';
import { getFootContactProfile } from '../player/gaitProfiles';

const { clamp, damp, smoothstep } = THREE.MathUtils;
const SATCHEL_PIVOT = [-0.199, 1.178, 0.006];
const COAT_DRAG_LIMIT = 0.075;
const COAT_SWEEP_LIMIT = 0.052;

// Bind-pose metres of the fused Darwin5 mesh. The bag blends into the ends
// of its strap and the coat underneath it. The hem fades in below the waist
// and stays on the back and outside of the skirt, clear of the trousers.
function satchelWeight(x, y, z) {
  return smoothstep(-x, 0.162, 0.233)
    * smoothstep(y, 0.873, 0.927) * (1 - smoothstep(y, 1.16, 1.26))
    * smoothstep(z, -0.18, -0.126) * (1 - smoothstep(z, 0.14, 0.19));
}

function hemWeight(x, y, z) {
  const outside = Math.max(1 - smoothstep(z, -0.14, -0.105), smoothstep(Math.abs(x - 0.012), 0.185, 0.225));
  return smoothstep(y, 0.62, 0.66) * (1 - smoothstep(y, 0.70, 1.02)) * outside;
}

function reweightSatchel(index, weight, vertex, joint, amount) {
  // The original weights are in descending order. Keep the three strongest
  // when the helper joint needs the fourth slot.
  const a = weight.getX(vertex), b = weight.getY(vertex), c = weight.getZ(vertex);
  const remainder = (1 - amount) / (a + b + c || 1);
  index.setW(vertex, joint);
  weight.setXYZW(vertex, a * remainder, b * remainder, c * remainder, amount);
}

function spring(state, target, frequency, damping, dt) {
  // Substep the response on slow frames so a hitch cannot fling the cloth.
  const steps = Math.ceil(dt * 120);
  const step = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    state.velocity += ((target - state.value) * frequency * frequency - state.velocity * damping) * step;
    state.value += state.velocity * step;
  }
}

export function createDarwinClothingRig(scene, config) {
  let mesh;
  scene.traverse(object => {
    if (object.isSkinnedMesh && object.material?.name === config.material
      && config.vertexCounts.includes(object.geometry.attributes.position.count)) mesh = object;
  });
  if (!mesh) return null;
  const skeleton = mesh.skeleton;
  const hipsIndex = skeleton.bones.findIndex(bone => /Hips$/i.test(bone.name));
  if (hipsIndex < 0 || mesh.morphTargetInfluences?.length) return null;

  const geometry = mesh.geometry.clone();
  const { position, skinIndex, skinWeight } = geometry.attributes;
  const bag = new THREE.Bone();
  bag.name = 'DarwinSatchelSwing';
  const pivot = new THREE.Matrix4().makeTranslation(...SATCHEL_PIVOT).premultiply(mesh.bindMatrix);
  const localBind = skeleton.boneInverses[hipsIndex].clone().multiply(pivot);
  localBind.decompose(bag.position, bag.quaternion, bag.scale);
  const restRotation = bag.quaternion.clone();
  const bagIndex = skeleton.bones.length;
  skeleton.bones[hipsIndex].add(bag);
  skeleton.bones.push(bag);
  skeleton.boneInverses = [...skeleton.boneInverses, pivot.invert()];
  skeleton.init();

  const drag = new THREE.Float32BufferAttribute(new Float32Array(position.count * 3), 3);
  const sweep = new THREE.Float32BufferAttribute(new Float32Array(position.count * 3), 3);
  drag.name = 'DarwinCoatDrag';
  sweep.name = 'DarwinCoatSweep';
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const bagWeight = satchelWeight(x, y, z);
    if (bagWeight > 0.005) reweightSatchel(skinIndex, skinWeight, i, bagIndex, bagWeight);
    const hem = hemWeight(x, y, z) * (1 - bagWeight);
    drag.setXYZ(i, 0, hem * COAT_DRAG_LIMIT * 0.14, -hem * COAT_DRAG_LIMIT);
    sweep.setX(i, hem * COAT_SWEEP_LIMIT);
  }
  geometry.morphAttributes.position = [drag, sweep];
  geometry.morphTargetsRelative = true;
  mesh.geometry = geometry;
  mesh.updateMorphTargets();

  const pitch = { value: 0, velocity: 0 }, roll = { value: 0, velocity: 0 }, twist = { value: 0, velocity: 0 };
  const dragMotion = { value: 0, velocity: 0 }, sweepMotion = { value: 0, velocity: 0 };
  const channels = [pitch, roll, twist, dragMotion, sweepMotion];
  const previous = new THREE.Vector3(), current = new THREE.Vector3(), movement = new THREE.Vector3();
  const velocity = new THREE.Vector3(), nextVelocity = new THREE.Vector3(), acceleration = new THREE.Vector3();
  const forward = new THREE.Vector3(), orientation = new THREE.Quaternion(), offset = new THREE.Quaternion();
  const swing = new THREE.Euler();
  let previousYaw = null;
  let turn = 0;

  function pose() {
    swing.set(pitch.value, twist.value, roll.value, 'YXZ');
    bag.quaternion.copy(restRotation).multiply(offset.setFromEuler(swing));
    mesh.morphTargetInfluences[0] = clamp(dragMotion.value, 0, 1);
    mesh.morphTargetInfluences[1] = clamp(sweepMotion.value, -1, 1);
  }

  return {
    update(delta, group, motion, action) {
      group.getWorldPosition(current);
      group.getWorldQuaternion(orientation);
      forward.set(0, 0, 1).applyQuaternion(orientation);
      forward.y = 0;
      forward.normalize();
      const yaw = Math.atan2(forward.x, forward.z);
      movement.subVectors(current, previous).setY(0);
      previous.copy(current);
      if (previousYaw === null || delta <= 0 || delta > 0.12 || movement.lengthSq() > 1) {
        previousYaw = yaw;
        velocity.set(0, 0, 0);
        turn = 0;
        for (const channel of channels) { channel.value = 0; channel.velocity = 0; }
        pose();
        return;
      }
      const yawDelta = yaw - previousYaw;
      previousYaw = yaw;
      turn = damp(turn, Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta)) / delta, 14, delta);
      nextVelocity.copy(velocity).lerp(movement.multiplyScalar(1 / delta), 1 - Math.exp(-15 * delta));
      acceleration.subVectors(nextVelocity, velocity).multiplyScalar(1 / delta);
      velocity.copy(nextVelocity);

      const enabled = !motion?.swimming && !motion?.lying && !motion?.sitting;
      const speed = enabled ? velocity.length() : 0;
      const yawRate = enabled ? clamp(turn, -10, 10) : 0;
      const forwardAcceleration = enabled ? clamp(acceleration.dot(forward), -21, 21) : 0;
      const clip = action?.getClip();
      const gait = clip && getFootContactProfile('darwin5', clip.name);
      const stride = gait ? Math.sin(action.time / clip.duration * (gait.cycles || 1) * Math.PI * 2) : 0;
      const cadence = stride * smoothstep(speed, 0.2, 3.2);

      const pitchDrive = forwardAcceleration * (forwardAcceleration > 0 ? 0.014 : 0.019);
      spring(pitch, pitchDrive + cadence * 0.05, 13, 13, delta);
      spring(roll, -clamp(speed * 0.023 + Math.abs(yawRate) * 0.012, 0, 0.17), 13, 15, delta);
      spring(twist, -yawRate * 0.023, 14, 15, delta);
      spring(dragMotion, clamp(speed * 0.14 + Math.abs(yawRate) * 0.055 + cadence * 0.09, 0, 1), 15, 15, delta);
      spring(sweepMotion, clamp(-yawRate * 0.117 + cadence * 0.11, -1, 1), 16, 16, delta);
      pose();
    },
    dispose: () => geometry.dispose(),
  };
}
