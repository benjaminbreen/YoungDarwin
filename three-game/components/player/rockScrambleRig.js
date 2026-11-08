import * as THREE from 'three';
import { rotateBoneWorld } from './armIK';
import { solveLegPlant } from './legPlanting';
import { chooseRockHandhold, rockScrambleWeight } from './playerRockTraversal';
import { createVisualFootSurfaceSampler } from '../../world/visualFootSurfaces';

const smooth = (p, a, b) => THREE.MathUtils.smoothstep(p, a, b);

export function createRockScrambleRig(scene, groupRef, grounding) {
  const find = suffix => {
    let result = null;
    scene.traverse(bone => { if (bone.isBone && new RegExp(suffix + '$', 'i').test(bone.name)) result = bone; });
    return result;
  };
  const hips = find('Hips'), neck = find('Neck'), head = find('Head');
  const spine = find('Spine'), chest = find('Spine1');
  const limbs = ['Left', 'Right'].map(side => ({
    side, upper: find(side + 'UpLeg'), lower: find(side + 'Leg'), foot: find(side + 'Foot'),
    arm: find(side + 'Arm'), forearm: find(side + 'ForeArm'), hand: find(side + 'Hand'), finger: find(side + 'HandMiddle1'),
    start: new THREE.Vector3(), end: new THREE.Vector3(), final: new THREE.Vector3(), grip: new THREE.Vector3(), nominal: new THREE.Vector3(), handholds: [], gripLocked: false,
  })).filter(l => l.upper && l.lower && l.foot && l.arm && l.forearm && l.hand);
  const bones = [spine, chest, ...limbs.flatMap(l => [l.upper, l.lower, l.foot, l.arm, l.forearm, l.hand])].filter(Boolean);
  const poses = bones.map(() => new THREE.Quaternion());
  const point = new THREE.Vector3(), target = new THREE.Vector3(), wrist = new THREE.Vector3(), tip = new THREE.Vector3();
  const forward = new THREE.Vector3(), right = new THREE.Vector3();
  const hip = new THREE.Vector3(), knee = new THREE.Vector3(), ankle = new THREE.Vector3(), upperBody = new THREE.Vector3();
  const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), palmOffset = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), wristRotation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion();
  let changed = false, active = null;
  const restorePose = () => { if (changed) bones.forEach((bone, i) => bone.quaternion.copy(poses[i])); changed = false; };
  const floor = (x, z, motion, visual) => {
    const ground = grounding.collisionAdapter.groundInfo({ x, y: motion.end.y + 0.2, z }, { supportRadius: 0 });
    return Math.max((ground.terrainY ?? ground.y) - 0.015, visual.heightAt(x, z) ?? ground.y - 0.015);
  };
  return {
    restorePose,
    updateBody() {
      const motion = grounding?.motionRef?.current?.rockScramble;
      if (!motion) { active = null; return; }
      bones.forEach((bone, i) => poses[i].copy(bone.quaternion)); changed = true;
      forward.set(Math.sin(motion.targetYaw), 0, Math.cos(motion.targetYaw));
      right.set(forward.z, 0, -forward.x);
      if (active !== motion) {
        active = motion;
        const bounds = { minX: motion.start.x - 2, maxX: motion.start.x + 2, minZ: motion.start.z - 2, maxZ: motion.start.z + 2 };
        const visual = createVisualFootSurfaceSampler(grounding.zoneId, bounds, motion.end.y + 0.4);
        limbs.forEach((l, i) => {
          l.start.copy(motion.start).addScaledVector(right, i === 0 ? 0.14 : -0.14).addScaledVector(forward, i === 0 ? 0.02 : -0.16);
          l.start.y = floor(l.start.x, l.start.z, motion, visual) + 0.1;
          l.end.copy(motion.start).lerp(motion.end, i === 0 ? 0.6 : 1).addScaledVector(right, i === 0 ? 0.14 : -0.14);
          l.end.y = floor(l.end.x, l.end.z, motion, visual) + 0.1;
          l.final.copy(motion.end).addScaledVector(right, i === 0 ? 0.14 : -0.14).addScaledVector(forward, i === 0 ? 0.1 : 0);
          l.final.y = floor(l.final.x, l.final.z, motion, visual) + 0.1;
          l.nominal.copy(motion.start).lerp(motion.end, 0.85).addScaledVector(right, i === 0 ? 0.14 : -0.14);
          l.nominal.y = floor(l.nominal.x, l.nominal.z, motion, visual) + 0.008;
          l.grip.copy(l.nominal); l.gripLocked = false; l.handholds = [];
          for (const advance of [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]) for (const lateral of [-0.06, 0, 0.06]) {
            const candidate = l.nominal.clone().addScaledVector(forward, advance).addScaledVector(right, lateral);
            const y = visual.heightAt(candidate.x, candidate.z);
            if (y != null) { candidate.y = y + 0.008; l.handholds.push(candidate); }
          }
        });
      }
      // Bound the whole torso angle instead of folding one joint to force contact.
      if (hips && neck && spine && chest) {
        hips.getWorldPosition(hip); neck.getWorldPosition(upperBody); upperBody.sub(hip);
        const pitch = Math.atan2(upperBody.dot(forward), upperBody.y);
        const weight = rockScrambleWeight(motion.progress);
        const correction = THREE.MathUtils.clamp(0.85 - pitch, -0.4, 0.55) * weight;
        rotateBoneWorld(spine, rotation.setFromAxisAngle(right, correction * 0.65));
        rotateBoneWorld(chest, rotation.setFromAxisAngle(right, correction * 0.35));
      }
    },
    updateFeet() {
      const motion = grounding?.motionRef?.current?.rockScramble;
      if (!motion || motion !== active) return;
      limbs.forEach((l, i) => {
        const step = smooth(motion.progress, i === 0 ? 0.25 : 0.47, i === 0 ? 0.47 : 0.82);
        target.copy(l.start).lerp(l.end, step);
        target.y += Math.sin(Math.PI * step) * (i === 0 ? 0.1 : 0.08);
        const finish = i === 0 ? smooth(motion.progress, 0.84, 1) : 0;
        if (finish > 0) { target.lerp(l.final, finish); target.y += Math.sin(Math.PI * finish) * 0.045; }
        motion.feet ??= {};
        motion.feet[l.side.toLowerCase()] = { target: target.clone(), planted: (step === 0 || step === 1) && (finish === 0 || finish === 1) };
        solveLegPlant(l.upper, l.lower, l.foot, target, forward, true);
      });
    },
    updateHands() {
      const motion = grounding?.motionRef?.current?.rockScramble;
      if (!motion || motion !== active) return;
      const p = motion.progress;
      const weight = smooth(p, 0.06, 0.2) * (1 - smooth(p, 0.32, 0.48));
      const witness = [];
      // One supporting hand; the other arm remains free for balance. An
      // unreachable hold must yield, rather than pull the body into a knot.
      const l = limbs[0];
      if (l) {
        l.hand.getWorldPosition(wrist); l.hand.getWorldQuaternion(wristRotation);
        point.copy(wrist);
        if (l.finger) { l.finger.getWorldPosition(tip); point.lerp(tip, 0.7); }
        l.arm.getWorldPosition(shoulder); l.forearm.getWorldPosition(elbow);
        const length = shoulder.distanceTo(elbow) + elbow.distanceTo(wrist);
        palmOffset.subVectors(point, wrist);
        if (!l.gripLocked) l.grip.copy(chooseRockHandhold(l.handholds, l.nominal, shoulder, palmOffset, length));
        target.copy(l.grip).sub(palmOffset);
        const reachWeight = 1 - smooth(target.distanceTo(shoulder), length - 0.02, length + 0.06);
        const appliedWeight = weight * reachWeight;
        target.sub(wrist).multiplyScalar(appliedWeight).add(wrist);
        solveLegPlant(l.arm, l.forearm, l.hand, target, forward);
        l.hand.parent.getWorldQuaternion(parentRotation);
        l.hand.quaternion.copy(parentRotation.invert().multiply(wristRotation));
        l.hand.updateWorldMatrix(false, true);
        l.hand.getWorldPosition(point);
        if (l.finger) { l.finger.getWorldPosition(tip); point.lerp(tip, 0.7); }
        if (appliedWeight > 0.98 && point.distanceTo(l.grip) < 0.02) l.gripLocked = true;
        witness.push({ side: l.side, error: point.distanceTo(l.grip), weight: appliedWeight, target: l.grip.toArray(), palm: point.toArray(), shoulder: shoulder.toArray(), armLength: length, wristDistance: l.grip.clone().sub(palmOffset).distanceTo(shoulder) });
      }
      motion.contacts = { weight, hands: witness };
      if (hips && head && neck) {
        hips.getWorldPosition(hip); head.getWorldPosition(point); neck.getWorldPosition(upperBody); upperBody.sub(hip);
        motion.pose = { hips: hip.toArray(), head: point.toArray(), headAboveHips: point.y - hip.y, torsoPitch: Math.atan2(upperBody.dot(forward), upperBody.y), legs: limbs.map(leg => {
          leg.upper.getWorldPosition(hip); leg.lower.getWorldPosition(knee); leg.foot.getWorldPosition(ankle);
          const thigh = hip.distanceTo(knee), shin = knee.distanceTo(ankle), distance = hip.distanceTo(ankle);
          const flexion = Math.acos(THREE.MathUtils.clamp((distance * distance - thigh * thigh - shin * shin) / (2 * thigh * shin), -1, 1));
          return { side: leg.side, hipClearance: hip.y - ankle.y, kneeFlexion: flexion, ankle: ankle.toArray(), planted: motion.feet?.[leg.side.toLowerCase()]?.planted };
        }) };
      }
    },
    dispose: restorePose,
  };
}
