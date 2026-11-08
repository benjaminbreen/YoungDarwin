import * as THREE from 'three';
import { rotateBoneWorld } from './armIK';
import { footPhasePulse, getVisualSoleOffset } from './gaitProfiles';

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const direction = new THREE.Vector3();
const bend = new THREE.Vector3();
const joint = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const ankleRotation = new THREE.Quaternion();
const parentRotation = new THREE.Quaternion();

// Rotate the two leg joints; never move a bone, stretch a segment, or force
// Mixamo's bone-local axes to match world axes. Keep the animated knee plane
// and the boot's world orientation, including its authored heel/toe roll.
export function solveLegPlant(upper, lower, foot, target, forward, kneeForward = false) {
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  foot.getWorldPosition(c);
  foot.getWorldQuaternion(ankleRotation);
  const thigh = a.distanceTo(b);
  const shin = b.distanceTo(c);
  if (thigh < 0.01 || shin < 0.01) return;
  direction.subVectors(target, a);
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(thigh - shin) + 0.001, thigh + shin - 0.001);
  direction.normalize();
  from.subVectors(c, a).normalize();
  bend.subVectors(b, a);
  bend.addScaledVector(from, -bend.dot(from));
  if (kneeForward) bend.copy(forward);
  if (bend.lengthSq() < 0.0001) bend.copy(forward);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 0.0001) return;
  bend.normalize();
  const along = (thigh * thigh + distance * distance - shin * shin) / (2 * distance);
  const out = Math.sqrt(Math.max(0, thigh * thigh - along * along));
  joint.copy(a).addScaledVector(direction, along).addScaledVector(bend, out);
  from.subVectors(b, a).normalize();
  to.subVectors(joint, a).normalize();
  rotateBoneWorld(upper, rotation.setFromUnitVectors(from, to));
  lower.getWorldPosition(b);
  foot.getWorldPosition(c);
  from.subVectors(c, b).normalize();
  to.copy(a).addScaledVector(direction, distance).sub(b).normalize();
  rotateBoneWorld(lower, rotation.setFromUnitVectors(from, to));
  foot.parent.getWorldQuaternion(parentRotation);
  foot.quaternion.copy(parentRotation.invert().multiply(ankleRotation));
  foot.updateWorldMatrix(false, true);
}

const ALLOWED_CLIP = /^(idle|holdIdle|holdToolIdle|aimIdle|walk|run|jog|sprint|grassRun|tiredWalk|holdToolWalk|holdToolRun|torchWalk|torchRun|walkRifle|runRifle|walkBackwards|runBackwards|jogBackwards|walkStrafeLeft|walkStrafeRight|runStrafeLeft|runStrafeRight|startWalking|startRunning|stopWalking|runToStop|walkingTurn180|runningTurn180|runningTurnLeft|runningTurnRight|turnLeft90|turnRight90)$/;

export function createLegPlantRig(scene, groupRef) {
  const legs = ['Left', 'Right'].map(side => {
    const find = suffix => {
      let found = null;
      scene.traverse(node => { if (node.isBone && new RegExp(`${side}${suffix}$`, 'i').test(node.name)) found = node; });
      return found;
    };
    return {
      side: side.toLowerCase(), upper: find('UpLeg'), lower: find('Leg'), foot: find('Foot'), toe: find('ToeBase'),
      anchor: new THREE.Vector3(), weight: 0, planted: false, released: false, age: 0,
      pose: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()], changed: false,
    };
  }).filter(leg => leg.upper && leg.lower && leg.foot && leg.toe);
  const toe = new THREE.Vector3();
  const ankle = new THREE.Vector3();
  const target = new THREE.Vector3();
  const correction = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const root = new THREE.Vector3();
  const lastRoot = new THREE.Vector3();
  const worldRotation = new THREE.Quaternion();
  const right = new THREE.Vector3();
  const slopeRotation = new THREE.Quaternion();
  let hasRoot = false;

  function restorePose() {
    legs.forEach(leg => {
      if (!leg.changed) return;
      [leg.upper, leg.lower, leg.foot].forEach((bone, i) => bone.quaternion.copy(leg.pose[i]));
      leg.changed = false;
    });
  }

  return {
    restorePose,
    update({ delta, canGround, motion, adapter, clip, phase, profile }) {
      const group = groupRef.current;
      if (!group) return;
      group.getWorldPosition(root);
      const teleported = hasRoot && root.distanceTo(lastRoot) > 0.65;
      lastRoot.copy(root);
      hasRoot = true;
      group.getWorldQuaternion(worldRotation);
      forward.set(0, 0, 1).applyQuaternion(worldRotation);
      right.set(1, 0, 0).applyQuaternion(worldRotation);
      const enabled = canGround && ALLOWED_CLIP.test(clip || '') && !motion.crouching
        && Math.abs(motion.stepSmoothOffset || 0) < 0.12
        && (typeof window === 'undefined' || window.__darwinFootPlanting !== false);
      legs.forEach(leg => { leg.toe.getWorldPosition(toe); leg.animatedHeight = toe.y; });
      legs.forEach(leg => {
        const pulse = profile ? footPhasePulse(phase, profile[leg.side], profile.width, profile.cycles || 1) : 0;
        leg.toe.getWorldPosition(toe);
        const support = adapter?.groundInfo(toe, { supportRadius: 0.07 });
        const groundY = support?.source === 'authored-obstacle' || support?.source === 'physics-prop' || support?.source === 'loose-rock'
          ? support.y : (support?.terrainY ?? support?.y ?? toe.y);
        const nearGround = Math.abs(toe.y - groundY) < 0.18;
        const stance = enabled && nearGround && (profile ? pulse > 0.12 : toe.y - groundY < 0.045);
        if (!enabled || teleported) {
          leg.weight = 0; leg.planted = false; leg.released = false;
          return;
        }
        const savePose = () => {
          if (leg.changed) return;
          [leg.upper, leg.lower, leg.foot].forEach((bone, i) => leg.pose[i].copy(bone.quaternion));
          leg.changed = true;
        };
        // Keep the support foot planted; only the already swinging boot takes
        // the higher recovery step. The gait phase continues uninterrupted.
        const balance = motion.terrainBalance;
        const otherHeight = legs.find(other => other !== leg)?.animatedHeight ?? leg.animatedHeight;
        const swing = profile ? (1 - pulse) * THREE.MathUtils.smoothstep(leg.animatedHeight - otherHeight, 0.015, 0.09) : 0;
        const lift = (balance?.pulse || 0) * swing * Math.min(0.17, 0.08 + (balance?.rise || 0) * 0.3);
        if (lift > 0.002) {
          savePose();
          leg.foot.getWorldPosition(ankle);
          target.copy(ankle); target.y += lift;
          solveLegPlant(leg.upper, leg.lower, leg.foot, target, forward);
          leg.toe.getWorldPosition(toe);
        }
        if (!stance) { leg.planted = false; leg.released = false; }
        if (stance && !leg.planted && !leg.released) {
          leg.anchor.copy(toe);
          leg.anchor.y = groundY - getVisualSoleOffset('darwin5', leg.side);
          leg.planted = true;
          leg.age = 0;
        }
        if (leg.planted) {
          leg.age += delta;
          const horizontal = Math.hypot(leg.anchor.x - toe.x, leg.anchor.z - toe.z);
          // Release a step instead of dragging a foot across the body or
          // trying to keep a boot on a support the player has left behind.
          if (horizontal > 0.22 || Math.abs(leg.anchor.y - groundY) > 0.16
            || ((motion.speed || 0) > 0.7 && leg.age > 0.28)) {
            leg.planted = false;
            leg.released = true;
          }
        }
        leg.weight = THREE.MathUtils.damp(leg.weight, leg.planted ? 1 : 0, leg.planted ? 40 : 28, delta);
        if (leg.weight < 0.01) return;
        correction.subVectors(leg.anchor, toe);
        correction.y = THREE.MathUtils.clamp(correction.y, -0.12, 0.14);
        const horizontal = Math.hypot(correction.x, correction.z);
        if (horizontal > 0.22) { correction.x *= 0.22 / horizontal; correction.z *= 0.22 / horizontal; }
        correction.multiplyScalar(leg.weight);
        savePose();
        leg.foot.getWorldPosition(ankle);
        target.copy(ankle).add(correction);
        solveLegPlant(leg.upper, leg.lower, leg.foot, target, forward);
        // Let a planted boot follow the slope without tilting the whole body
        // onto it. Preserve the clip's heel/toe roll and keep the adjustment
        // small on a stone's edge.
        if (balance && leg.planted) {
          rotateBoneWorld(leg.foot, slopeRotation.setFromAxisAngle(right, THREE.MathUtils.clamp(-balance.forwardGrade * 0.35, -0.18, 0.18) * leg.weight));
          rotateBoneWorld(leg.foot, slopeRotation.setFromAxisAngle(forward, THREE.MathUtils.clamp(balance.crossGrade * 0.3, -0.14, 0.14) * leg.weight));
        }
      });
    },
    debug: () => legs.map(leg => ({ side: leg.side, planted: leg.planted, weight: leg.weight, anchor: leg.anchor.toArray() })),
    dispose: restorePose,
  };
}
