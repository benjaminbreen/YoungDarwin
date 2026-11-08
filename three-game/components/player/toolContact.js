import * as THREE from 'three';
import { rotateBoneWorld, solveTwoBoneIK } from './armIK';
import { NET_SWEEP, netSweepState } from './netSweep';

export const HAMMER_CONTACT = Object.freeze({ strike: 0.55, length: Math.hypot(0.093, 0.27) * 1.05, face: [0.093, 0.27, 0] });
export const hammerContactState = { active: false, startedAt: 0, point: null, witness: null, handOffset: [0, 0.05, 0.02] };

export function beginHammerContact(now, point) {
  Object.assign(hammerContactState, { active: Boolean(point), startedAt: now, point: point ? { ...point } : null, witness: null });
}

export function toolContactWeight(age, strike) {
  return THREE.MathUtils.smoothstep(age, strike - 0.28, strike - 0.025)
    * (1 - THREE.MathUtils.smoothstep(age, strike + 0.035, strike + 0.23));
}

export function createToolContactRig(scene, motionRef) {
  const find = name => {
    let result = null;
    scene.traverse(bone => { if (bone.isBone && new RegExp(`${name}$`, 'i').test(bone.name)) result = bone; });
    return result;
  };
  const upper = find('RightArm'), lower = find('RightForeArm'), hand = find('RightHand');
  const spine = find('Spine1');
  const bones = [spine, upper, lower, hand].filter(Boolean), poses = bones.map(() => new THREE.Quaternion());
  const wrist = new THREE.Vector3(), direction = new THREE.Vector3(), target = new THREE.Vector3(), delta = new THREE.Vector3();
  const root = new THREE.Vector3(), right = new THREE.Vector3(), offset = new THREE.Vector3();
  const wristQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion();
  const bodyQ = new THREE.Quaternion(), leanQ = new THREE.Quaternion();
  let changed = false;
  const restorePose = () => { if (changed) bones.forEach((bone, i) => bone.quaternion.copy(poses[i])); changed = false; };
  return {
    restorePose,
    update(now) {
      const motion = motionRef?.current;
      if (!hand || !upper || !lower || !motion || motion.airborne || motion.swimming) return;
      const hammer = /^(swingHammer|heavyToolSwing)$/.test(motion.action || '') && hammerContactState.active;
      const net = /^(butterflyNetSwing|swingNet)$/.test(motion.action || '') && netSweepState.active;
      if (!hammer && !net) return;
      const point = hammer ? hammerContactState.point : netSweepState.aim;
      const startedAt = hammer ? hammerContactState.startedAt : netSweepState.startedAt;
      const strike = hammer ? HAMMER_CONTACT.strike : NET_SWEEP.strike;
      const weight = toolContactWeight(now - startedAt, strike);
      if (!point || weight < 0.005) return;
      bones.forEach((bone, i) => poses[i].copy(bone.quaternion)); changed = true;
      if (hammer && spine) {
        scene.getWorldPosition(root); scene.getWorldQuaternion(bodyQ);
        right.set(1, 0, 0).applyQuaternion(bodyQ);
        const lean = THREE.MathUtils.clamp((0.95 - (point.y - root.y)) * 0.9, 0, 0.5) * weight;
        rotateBoneWorld(spine, leanQ.setFromAxisAngle(right, lean));
      }
      hand.getWorldPosition(wrist);
      hand.getWorldQuaternion(wristQ);
      offset.fromArray(hammer ? hammerContactState.handOffset : [0, 0.014, -0.015]).applyQuaternion(wristQ);
      target.set(point.x, point.y, point.z);
      // Pick the grip on the shoulder-to-contact ray. A wrist-to-contact
      // ray can ask a bent arm to reach beyond its length even when the tool
      // and arm together can comfortably reach the surface.
      upper.getWorldPosition(root);
      direction.copy(target).sub(root).sub(offset).normalize();
      target.addScaledVector(direction, -(hammer ? HAMMER_CONTACT.length : NET_SWEEP.poleLength));
      target.sub(offset);
      delta.subVectors(target, wrist);
      delta.clampLength(0, 0.55).multiplyScalar(weight);
      target.copy(wrist).add(delta);
      solveTwoBoneIK(upper, lower, hand, target);
      hand.parent.getWorldQuaternion(parentQ);
      hand.quaternion.copy(parentQ.invert().multiply(wristQ));
      hand.updateWorldMatrix(false, true);
    },
    dispose: restorePose,
  };
}
