import * as THREE from 'three';
import { rotateBoneWorld } from './armIK';

export const FOOTING_RECOVERY_SECONDS = 0.68;
const WALK_ACTION = /^(startWalking|startRunning|stopWalking|runToStop|walkingTurn180|runningTurn180|runningTurnLeft|runningTurnRight)$/;
export const balanceAllowsAction = action => !action || WALK_ACTION.test(action);

export function createTerrainBalanceState() {
  return { forwardGrade: 0, crossGrade: 0, startedAt: -10, strength: 0, rise: 0, side: 1,
    lastX: NaN, lastZ: NaN, count: 0, source: null, pulse: 0, supportKey: null, supportLastSeenAt: -10 };
}

export function footingRecoveryPulse(balance, now) {
  const age = now - balance.startedAt;
  if (age < 0 || age >= FOOTING_RECOVERY_SECONDS) return 0;
  const attack = THREE.MathUtils.smoothstep(age, 0, 0.14);
  const release = 1 - THREE.MathUtils.smoothstep(age, 0.18, FOOTING_RECOVERY_SECONDS);
  return attack * release * balance.strength;
}

export function beginFootingRecovery(balance, { now, position, rise = 0.15, side = 0, source = 'step', supportKey = null }) {
  if (supportKey && supportKey === balance.supportKey) return false;
  if (now - balance.startedAt < 0.82) return false;
  if (Number.isFinite(balance.lastX) && Math.hypot(position.x - balance.lastX, position.z - balance.lastZ) < 0.65) return false;
  balance.startedAt = now;
  balance.rise = THREE.MathUtils.clamp(Math.abs(rise), 0.06, 0.45);
  balance.strength = THREE.MathUtils.clamp(0.22 + balance.rise * 1.8, 0.28, 0.88);
  balance.side = side || (balance.count % 2 === 0 ? 1 : -1);
  balance.lastX = position.x; balance.lastZ = position.z;
  balance.count += 1; balance.source = source;
  if (supportKey) { balance.supportKey = supportKey; balance.supportLastSeenAt = now; }
  return true;
}

// Compare supports with the local movement-surface plane. A smooth incline
// changes posture, while a small stone proud of that plane earns a recovery
// step. Render-only grit never changes movement or triggers a stumble.
export function updateTerrainBalance(balance, { now, delta, position, previous, facing, slope, stance, speed, enabled }) {
  const active = enabled && speed > 0.55;
  const forward = active ? slope.dx * facing.x + slope.dz * facing.z : 0;
  const cross = active ? slope.dx * facing.z - slope.dz * facing.x : 0;
  balance.forwardGrade = THREE.MathUtils.damp(balance.forwardGrade, THREE.MathUtils.clamp(forward, -0.7, 0.7), 7, delta);
  balance.crossGrade = THREE.MathUtils.damp(balance.crossGrade, THREE.MathUtils.clamp(cross, -0.6, 0.6), 7, delta);
  if (!enabled) { balance.pulse = 0; balance.startedAt = -10; return; }
  if (!active) { balance.pulse = footingRecoveryPulse(balance, now); return; }
  const travel = Math.hypot(position.x - previous.x, position.z - previous.z);
  if (travel > 0.65 || Math.abs(position.y - previous.y) > 1) { balance.pulse = 0; balance.startedAt = -10; return; }
  let candidate = null;
  let onSameSupport = false;
  for (const sample of stance?.samples || []) {
    if (!/^(authored-obstacle|loose-rock)$/.test(sample.source || '') || !/rock|stone|basalt|boulder/i.test(sample.obstacle?.kind || '')) continue;
    const supportKey = sample.obstacle?.id || sample.obstacle?.looseRockKey || null;
    if (supportKey && supportKey === balance.supportKey) onSameSupport = true;
    const expected = slope.dx * (sample.x - position.x) + slope.dz * (sample.z - position.z);
    const residual = sample.y - (stance.center?.y ?? position.y) - expected;
    if (Math.abs(residual) >= 0.075 && Math.abs(residual) <= 0.45 && (!candidate || Math.abs(residual) > Math.abs(candidate.rise))) {
      candidate = { rise: residual, side: Math.sign(sample.rightOffset || 0), source: sample.source, supportKey };
    }
  }
  if (onSameSupport) balance.supportLastSeenAt = now;
  else if (now - balance.supportLastSeenAt > 0.24) balance.supportKey = null;
  const dy = position.y - previous.y;
  // Also catch short irregularities in authored movement terrain. Discard
  // cliffs, teleports and the ordinary height gain of a smooth slope.
  if (!candidate && !balance.supportKey && travel > 0.001 && travel < 0.4 && Math.abs(dy) > Math.max(0.075, travel * (slope.grade + 0.45)) && Math.abs(dy) <= 0.45) {
    candidate = { rise: dy, source: 'terrain-step' };
  }
  if (candidate) beginFootingRecovery(balance, { ...candidate, now, position });
  balance.pulse = footingRecoveryPulse(balance, now);
}

export function createTerrainBalanceRig(scene, groupRef) {
  const find = suffix => {
    let found = null;
    scene.traverse(bone => { if (bone.isBone && new RegExp(`${suffix}$`, 'i').test(bone.name)) found = bone; });
    return found;
  };
  const chest = find('Spine1'), neck = find('Neck'), leftArm = find('LeftArm'), rightArm = find('RightArm');
  const bones = [chest, neck, leftArm, rightArm].filter(Boolean);
  const poses = bones.map(() => new THREE.Quaternion());
  const right = new THREE.Vector3(), forward = new THREE.Vector3(), q = new THREE.Quaternion(), rotation = new THREE.Quaternion();
  let changed = false;
  const restorePose = () => { if (changed) bones.forEach((bone, i) => bone.quaternion.copy(poses[i])); changed = false; };
  return {
    restorePose,
    update(motion, canGround) {
      const balance = motion.terrainBalance, group = groupRef.current;
      if (!balance || !group || !canGround || !balanceAllowsAction(motion.action) || motion.crouching || motion.aiming) return;
      const pulse = balance.pulse || 0;
      const pitch = THREE.MathUtils.clamp(balance.forwardGrade * 0.23, -0.1, 0.15) + pulse * 0.11;
      const roll = THREE.MathUtils.clamp(balance.crossGrade * 0.16, -0.075, 0.075) + pulse * balance.side * 0.055;
      if (Math.abs(pitch) + Math.abs(roll) < 0.001) return;
      bones.forEach((bone, i) => poses[i].copy(bone.quaternion)); changed = true;
      group.getWorldQuaternion(rotation);
      right.set(1, 0, 0).applyQuaternion(rotation); forward.set(0, 0, 1).applyQuaternion(rotation);
      if (chest) { rotateBoneWorld(chest, q.setFromAxisAngle(right, pitch)); rotateBoneWorld(chest, q.setFromAxisAngle(forward, roll)); }
      if (neck) { rotateBoneWorld(neck, q.setFromAxisAngle(right, -pitch * 0.45)); rotateBoneWorld(neck, q.setFromAxisAngle(forward, -roll * 0.5)); }
      if (!motion.handsBusy && pulse > 0.01) {
        if (leftArm) rotateBoneWorld(leftArm, q.setFromAxisAngle(forward, -pulse * 0.16));
        if (rightArm) rotateBoneWorld(rightArm, q.setFromAxisAngle(forward, pulse * 0.16));
      }
    },
    dispose: restorePose,
  };
}
