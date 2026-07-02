import * as THREE from 'three';
import { PLAYER } from './playerConfig';
import { dampAngle, easeInOutCubic } from './playerUtils';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function inputWorldDirection(keys, touch, yaw, target = new THREE.Vector3()) {
  target.set(
    (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0),
    0,
    (keys.backward || touch.backward ? 1 : 0) - (keys.forward || touch.forward ? 1 : 0),
  );
  if (target.lengthSq() <= 0.0001) return null;
  return target.normalize().applyAxisAngle(WORLD_UP, yaw);
}

export function updatePlayerActionMotion({
  group,
  stateRef,
  velocity,
  facing,
  wasAirborne,
  characterController,
  characterDebug,
  collisionAdapter,
  frameScratch,
  keys,
  touch,
  yawRef,
  startOfFramePosition,
  now,
  delta,
  finalizeFrame,
}) {
  if (stateRef.current.collectionFaceMotion) {
    const motion = stateRef.current.collectionFaceMotion;
    if (!stateRef.current.action || now >= motion.until) {
      stateRef.current.collectionFaceMotion = null;
    } else {
      group.current.rotation.y = dampAngle(group.current.rotation.y, motion.targetYaw, 14, delta);
      facing.current.set(Math.sin(group.current.rotation.y), 0, Math.cos(group.current.rotation.y)).normalize();
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, PLAYER.groundDeceleration * 1.4, delta);
      velocity.current.z = THREE.MathUtils.damp(velocity.current.z, 0, PLAYER.groundDeceleration * 1.4, delta);
    }
  }

  if (stateRef.current.climbMotion) {
    const climb = stateRef.current.climbMotion;
    const progress = THREE.MathUtils.clamp((now - climb.startedAt) / climb.duration, 0, 1);
    const eased = easeInOutCubic(progress);
    const arcHeight = Number.isFinite(climb.arcHeight)
      ? climb.arcHeight
      : Math.max(0.28, climb.heightDelta * 0.32);
    const arc = Math.sin(Math.PI * progress) * arcHeight;
    group.current.position.lerpVectors(climb.start, climb.end, eased);
    group.current.position.y += arc;
    characterController.sync(group.current.position);
    velocity.current.set(0, 0, 0);
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, climb.targetYaw, 10, delta);
    stateRef.current.running = false;
    stateRef.current.walking = false;
    stateRef.current.airborne = false;
    stateRef.current.strafeLeft = false;
    stateRef.current.strafeRight = false;
    const climbForward = frameScratch.forwardFacing.set(Math.sin(climb.targetYaw), 0, Math.cos(climb.targetYaw));
    const climbInput = inputWorldDirection(keys, touch, yawRef.current, frameScratch.targetVelocity);
    const climbInputDot = climbInput ? climbInput.dot(climbForward) : 0;
    const climbCancelled = climbInput && Number.isFinite(climb.cancelAt) && progress >= climb.cancelAt && climbInputDot < -0.25;
    const climbEarlyExit = Number.isFinite(climb.earlyExitAt) && progress >= climb.earlyExitAt && (!climbInput || climbInputDot >= -0.1);
    if (progress >= 1 || climbCancelled || climbEarlyExit) {
      group.current.position.copy(climb.end);
      characterController.sync(group.current.position);
      stateRef.current.climbMotion = null;
      stateRef.current.action = null;
      stateRef.current.lockMovementUntil = 0;
      if (climb.exitSpeed && !climbCancelled) {
        const exitDirection = climbInput && climbInputDot > 0.2 ? climbInput : climbForward;
        velocity.current.x = exitDirection.x * climb.exitSpeed;
        velocity.current.z = exitDirection.z * climb.exitSpeed;
      }
    }
    wasAirborne.current = false;
    stateRef.current.airborne = false;
    finalizeFrame({ skipFootsteps: true });
    return true;
  }

  if (stateRef.current.traverseMotion) {
    const traverse = stateRef.current.traverseMotion;
    const progress = THREE.MathUtils.clamp((now - traverse.startedAt) / traverse.duration, 0, 1);
    const eased = easeInOutCubic(progress);
    const arc = Math.sin(Math.PI * progress) * traverse.arcHeight;
    group.current.position.lerpVectors(traverse.start, traverse.end, eased);
    group.current.position.y += arc;
    characterController.sync(group.current.position);
    velocity.current.set(0, 0, 0);
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, traverse.targetYaw, 14, delta);
    stateRef.current.running = false;
    stateRef.current.walking = false;
    stateRef.current.airborne = false;
    stateRef.current.crouching = traverse.crouching;
    stateRef.current.strafeLeft = false;
    stateRef.current.strafeRight = false;
    const traverseForward = frameScratch.forwardFacing.set(Math.sin(traverse.targetYaw), 0, Math.cos(traverse.targetYaw));
    const traverseInput = inputWorldDirection(keys, touch, yawRef.current, frameScratch.targetVelocity);
    const traverseInputDot = traverseInput ? traverseInput.dot(traverseForward) : 0;
    const traverseCancelled = traverseInput && Number.isFinite(traverse.cancelAt) && progress >= traverse.cancelAt && traverseInputDot < -0.25;
    const traverseEarlyExit = Number.isFinite(traverse.earlyExitAt) && progress >= traverse.earlyExitAt && (!traverseInput || traverseInputDot >= -0.1);
    if (progress >= 1 || traverseCancelled || traverseEarlyExit) {
      const landingGround = collisionAdapter.groundInfo(traverse.end);
      group.current.position.copy(traverse.end);
      group.current.position.y = landingGround.y;
      characterController.sync(group.current.position);
      stateRef.current.traverseMotion = null;
      stateRef.current.action = null;
      stateRef.current.lockMovementUntil = 0;
      stateRef.current.crouching = false;
      if (traverse.exitSpeed && !traverseCancelled) {
        const exitDirection = traverseInput && traverseInputDot > 0.2 ? traverseInput : traverseForward;
        velocity.current.x = exitDirection.x * traverse.exitSpeed;
        velocity.current.z = exitDirection.z * traverse.exitSpeed;
      }
    }
    wasAirborne.current = false;
    stateRef.current.airborne = false;
    finalizeFrame({ skipFootsteps: true });
    return true;
  }

  if (stateRef.current.rollMotion) {
    const roll = stateRef.current.rollMotion;
    const progress = THREE.MathUtils.clamp((now - roll.startedAt) / roll.duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const target = frameScratch.rollTarget || new THREE.Vector3();
    const desired = frameScratch.rollDesired || new THREE.Vector3();
    frameScratch.rollTarget = target;
    frameScratch.rollDesired = desired;
    target.copy(roll.start).addScaledVector(roll.direction, roll.distance * eased);
    desired.set(target.x - group.current.position.x, 0, target.z - group.current.position.z);
    const characterMove = {
      movement: desired,
      grounded: false,
      collisions: 0,
      collision: null,
      source: 'analytic-character',
    };
    characterDebug.current.movement.copy(characterMove.movement);
    characterDebug.current.collisions = characterMove.collisions;
    characterDebug.current.grounded = characterMove.grounded;
    characterDebug.current.source = characterMove.source;
    characterDebug.current.normal.set(0, 0, 0);
    group.current.position.add(characterMove.movement);
    const rollCollision = collisionAdapter.resolveCollision(group.current.position, startOfFramePosition);
    if (rollCollision) {
      group.current.position.copy(rollCollision.position).addScaledVector(rollCollision.normal, 0.035);
      characterMove.collisions = 1;
      characterMove.collision = rollCollision;
      characterDebug.current.collisions = 1;
      characterDebug.current.normal.copy(rollCollision.normal);
    }
    const rollGround = collisionAdapter.groundInfo(group.current.position);
    group.current.position.y = rollGround.y;
    characterController.sync(group.current.position);
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, roll.targetYaw, 12, delta);
    velocity.current.set(0, 0, 0);
    stateRef.current.running = false;
    stateRef.current.walking = false;
    stateRef.current.airborne = false;
    stateRef.current.strafeLeft = false;
    stateRef.current.strafeRight = false;
    if (progress >= 1 || characterMove.collision) {
      stateRef.current.rollMotion = null;
      stateRef.current.action = null;
      stateRef.current.lockMovementUntil = 0;
      if (roll.exitSpeed && !characterMove.collision) {
        velocity.current.x = roll.direction.x * roll.exitSpeed;
        velocity.current.z = roll.direction.z * roll.exitSpeed;
      }
    }
    wasAirborne.current = false;
    stateRef.current.airborne = false;
    finalizeFrame({ skipFootsteps: true });
    return true;
  }

  if (stateRef.current.turnMotion) {
    const turn = stateRef.current.turnMotion;
    const progress = THREE.MathUtils.clamp((now - turn.startedAt) / turn.duration, 0, 1);
    group.current.rotation.y = dampAngle(group.current.rotation.y, turn.targetYaw, 18, delta);
    const turnForward = frameScratch.forwardFacing.set(Math.sin(group.current.rotation.y), 0, Math.cos(group.current.rotation.y));
    const horizontalSpeed = Math.hypot(velocity.current.x, velocity.current.z);
    if (horizontalSpeed > 0.05) {
      const keep = THREE.MathUtils.lerp(turn.speedKeep ?? 0.82, 1, progress);
      velocity.current.x = turnForward.x * horizontalSpeed * keep;
      velocity.current.z = turnForward.z * horizontalSpeed * keep;
    }
    stateRef.current.running = horizontalSpeed > PLAYER.walkSpeed * 1.15;
    stateRef.current.walking = horizontalSpeed > 0.45 && !stateRef.current.running;
    stateRef.current.airborne = false;
    stateRef.current.strafeLeft = false;
    stateRef.current.strafeRight = false;
    if (progress >= 1) {
      group.current.rotation.y = turn.targetYaw;
      facing.current.set(Math.sin(turn.targetYaw), 0, Math.cos(turn.targetYaw)).normalize();
      if (horizontalSpeed > 0.05) {
        const keep = turn.exitSpeedScale ?? 0.88;
        velocity.current.x = facing.current.x * horizontalSpeed * keep;
        velocity.current.z = facing.current.z * horizontalSpeed * keep;
      }
      stateRef.current.turnMotion = null;
      stateRef.current.action = null;
      stateRef.current.lockMovementUntil = 0;
    }
    wasAirborne.current = false;
    stateRef.current.airborne = false;
    finalizeFrame({ skipFootsteps: true });
    return true;
  }

  return false;
}
