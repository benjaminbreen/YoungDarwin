import * as THREE from 'three';
import { rotateBoneWorld, solveTwoBoneIK } from './armIK';
import { fieldReachWeight } from './fieldReach';

export function createFieldReachRig(scene, motionRef) {
  const find = name => {
    let result = null;
    scene.traverse(bone => { if (bone.isBone && new RegExp(`${name}$`, 'i').test(bone.name)) result = bone; });
    return result;
  };
  const upper = find('RightArm'), lower = find('RightForeArm'), hand = find('RightHand');
  const fingers = ['RightHandMiddle1', 'RightHandIndex1'].map(find).filter(Boolean);
  const neck = find('Neck'), head = find('Head');
  const gazeBones = [neck, head].filter(Boolean);
  const gazePose = gazeBones.map(() => new THREE.Quaternion());
  const headForward = new THREE.Vector3(0, 0, 1);
  if (head) headForward.applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert());
  const lookDirection = new THREE.Vector3(), subjectDirection = new THREE.Vector3(), right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const gazeRotation = new THREE.Quaternion();
  const bones = [upper, lower, hand].filter(Boolean);
  const original = bones.map(() => new THREE.Quaternion());
  const palm = new THREE.Vector3(), target = new THREE.Vector3(), correction = new THREE.Vector3();
  const tip = new THREE.Vector3(), wrist = new THREE.Vector3();
  const wristRotation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion();
  const contactTarget = new THREE.Vector3();
  let changed = false;
  let gazing = false;
  const restorePose = () => {
    if (changed) bones.forEach((bone, i) => bone.quaternion.copy(original[i]));
    if (gazing) gazeBones.forEach((bone, i) => bone.quaternion.copy(gazePose[i]));
    changed = false;
    gazing = false;
  };
  const lookAtSpecimen = (reach, now) => {
    if (!head || !reach.groundStudy) return;
    const weight = THREE.MathUtils.smoothstep(now - reach.startedAt, 0, 0.18)
      * (1 - THREE.MathUtils.smoothstep(now, reach.contactAt + 0.10, reach.releaseAt));
    if (weight < 0.005) return;
    head.getWorldPosition(lookDirection);
    subjectDirection.set(reach.target.x, reach.target.y, reach.target.z).sub(lookDirection).normalize();
    head.getWorldQuaternion(gazeRotation);
    lookDirection.copy(headForward).applyQuaternion(gazeRotation);
    const yaw = Math.atan2(
      subjectDirection.x * lookDirection.z - subjectDirection.z * lookDirection.x,
      subjectDirection.x * lookDirection.x + subjectDirection.z * lookDirection.z,
    );
    const pitch = Math.asin(THREE.MathUtils.clamp(lookDirection.y, -1, 1))
      - Math.asin(THREE.MathUtils.clamp(subjectDirection.y, -1, 1));
    right.crossVectors(up, lookDirection).normalize();
    if (right.lengthSq() < 0.001) return;
    gazeBones.forEach((bone, i) => gazePose[i].copy(bone.quaternion));
    gazing = true;
    for (const bone of gazeBones) {
      const share = !neck ? 1 : bone === neck ? 0.36 : 0.64;
      rotateBoneWorld(bone, gazeRotation.setFromAxisAngle(right, THREE.MathUtils.clamp(pitch, -0.18, 0.48) * weight * share));
      rotateBoneWorld(bone, gazeRotation.setFromAxisAngle(up, THREE.MathUtils.clamp(yaw, -0.4, 0.4) * weight * share));
    }
  };
  return {
    restorePose,
    update(now) {
      const motion = motionRef?.current, reach = motion?.fieldReach;
      if (!upper || !lower || !hand || !reach || reach.clip === 'heavyToolSwing' || motion.action !== reach.clip || motion.airborne || motion.swimming) {
        if (typeof window !== 'undefined') window.__darwinReachDebug = null;
        return;
      }
      lookAtSpecimen(reach, now);
      const weight = fieldReachWeight(reach, now);
      if (weight < 0.005) return;
      hand.getWorldPosition(wrist);
      palm.copy(wrist);
      if (fingers.length) {
        fingers[0].getWorldPosition(tip);
        palm.lerp(tip, 0.7);
      }
      target.set(reach.target.x, reach.target.y, reach.target.z);
      correction.subVectors(target, palm);
      // Only finish an already plausible authored reach. The approach phase
      // owns foot placement; IK cannot turn a distant object into a long arm.
      correction.clampLength(0, 0.45).multiplyScalar(weight);
      target.copy(wrist).add(correction);
      bones.forEach((bone, i) => original[i].copy(bone.quaternion));
      changed = true;
      hand.getWorldQuaternion(wristRotation);
      solveTwoBoneIK(upper, lower, hand, target);
      hand.parent.getWorldQuaternion(parentRotation);
      hand.quaternion.copy(parentRotation.invert().multiply(wristRotation));
      hand.updateWorldMatrix(false, true);
      hand.getWorldPosition(palm);
      if (fingers.length) { fingers[0].getWorldPosition(tip); palm.lerp(tip, 0.7); }
      contactTarget.set(reach.target.x, reach.target.y, reach.target.z);
      reach.witness = { x: palm.x, y: palm.y, z: palm.z, at: now, error: palm.distanceTo(contactTarget) };
      if (typeof window !== 'undefined') window.__darwinReachDebug = { clip: reach.clip, weight, committed: reach.committed, target: { ...reach.target }, hand: { ...reach.witness } };
    },
    dispose: restorePose,
  };
}
