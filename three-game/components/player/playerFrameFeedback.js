import * as THREE from 'three';
import { getRuntimeFootContacts, useThreeGameStore } from '../../store';
import { BUMP_FEEDBACK, PLAYER } from './playerConfig';
import { orientDebugVector } from './playerUtils';

const UP = new THREE.Vector3(0, 1, 0);
const horizontalVelocity = new THREE.Vector3();
const localVelocity = new THREE.Vector3();

export function updatePlayerFrameFeedback({
  group,
  warningRef,
  modelFeedbackRef,
  contactShadowRef,
  debugCollisionRef,
  debugMovementRef,
  bounceFeedback,
  velocity,
  terrainFeedback,
  lastModelYaw,
  collisionAdapter,
  characterDebug,
  viewMode,
  physicsDebug,
  now,
  delta,
}) {
  if (!group.current) return;
  const storeState = useThreeGameStore.getState();
  const feedback = bounceFeedback.current;
  const feedbackAge = now - feedback.startedAt;
  const feedbackProgress = THREE.MathUtils.clamp(feedbackAge / BUMP_FEEDBACK.duration, 0, 1);
  const feedbackEase = Math.sin(feedbackProgress * Math.PI);

  if (warningRef.current) {
    const opacity = (1 - feedbackProgress) * feedback.intensity * 0.42;
    warningRef.current.visible = opacity > 0.015;
    warningRef.current.position.set(-feedback.normal.x * 0.28, 0.055, -feedback.normal.z * 0.28);
    warningRef.current.scale.setScalar(0.74 + feedbackProgress * 0.95 + feedback.intensity * 0.28);
    warningRef.current.children.forEach(child => {
      if (child.material) child.material.opacity = opacity;
    });
  }

  if (modelFeedbackRef.current) {
    // Hide Darwin's body in first person; status view still needs the external
    // model for inspection.
    modelFeedbackRef.current.visible = viewMode !== 'first' || storeState.statusViewOpen;
    horizontalVelocity.set(velocity.current.x, 0, velocity.current.z);
    const speedRatio = THREE.MathUtils.clamp(horizontalVelocity.length() / PLAYER.runSpeed, 0, 1);
    localVelocity.copy(horizontalVelocity).applyAxisAngle(UP, -group.current.rotation.y);
    const yawDelta = Math.atan2(
      Math.sin(group.current.rotation.y - lastModelYaw.current),
      Math.cos(group.current.rotation.y - lastModelYaw.current),
    );
    lastModelYaw.current = group.current.rotation.y;
    const slope = terrainFeedback.current;
    const collisionLean = feedbackEase * feedback.intensity * 0.105;
    const slopePitch = THREE.MathUtils.clamp(slope.grade * slope.uphillDot * -0.18, -0.12, 0.09);
    const stancePitch = THREE.MathUtils.clamp(slope.stancePitch || 0, -0.09, 0.09);
    const stanceRoll = THREE.MathUtils.clamp(slope.stanceRoll || 0, -0.09, 0.09);
    const targetPitch = -speedRatio * 0.075 + slopePitch + stancePitch - feedback.normal.z * collisionLean;
    const targetRoll = THREE.MathUtils.clamp((localVelocity.x / PLAYER.runSpeed) * -0.08 + yawDelta * -1.4, -0.16, 0.16)
      + stanceRoll
      + feedback.normal.x * collisionLean;
    modelFeedbackRef.current.rotation.x = THREE.MathUtils.damp(modelFeedbackRef.current.rotation.x, targetPitch, 10, delta);
    modelFeedbackRef.current.rotation.z = THREE.MathUtils.damp(modelFeedbackRef.current.rotation.z, targetRoll, 10, delta);
    modelFeedbackRef.current.position.x = feedback.normal.x * feedbackEase * feedback.intensity * 0.045;
    modelFeedbackRef.current.position.z = feedback.normal.z * feedbackEase * feedback.intensity * 0.045;
  }

  if (contactShadowRef.current) {
    const shadowGround = collisionAdapter.groundInfo(group.current.position);
    const groundOffset = shadowGround.y - group.current.position.y + 0.018;
    const airGap = Math.max(0, group.current.position.y - shadowGround.y);
    const horizontalSpeed = Math.hypot(velocity.current.x, velocity.current.z);
    const airborneFade = THREE.MathUtils.clamp(1 - airGap / 3.2, 0, 1);
    const speedScale = THREE.MathUtils.clamp(horizontalSpeed / PLAYER.runSpeed, 0, 1);
    contactShadowRef.current.position.y = groundOffset;
    contactShadowRef.current.scale.set(
      0.72 + speedScale * 0.18 + airGap * 0.045,
      0.5 + speedScale * 0.08 + airGap * 0.025,
      1,
    );
    // Fake contact-AO, so a touch fainter at night (no hard sun to cast it).
    const hour = storeState.timeOfDay ?? 12;
    const dayFactor = (hour >= 8 && hour <= 17) ? 1 : (hour < 5 || hour > 20) ? 0.7 : 0.85;
    const feet = getRuntimeFootContacts();
    const plantedFeet = Math.max(feet.left.contact || 0, feet.right.contact || 0);
    contactShadowRef.current.material.opacity = (0.24 - plantedFeet * 0.05) * airborneFade * dayFactor;
    contactShadowRef.current.visible = airborneFade > 0.02;
  }

  if (physicsDebug) {
    orientDebugVector(debugCollisionRef.current, characterDebug.current.normal, characterDebug.current.normal.length() * 0.85);
    orientDebugVector(debugMovementRef.current, characterDebug.current.movement, Math.min(1.2, characterDebug.current.movement.length() * 18));
  }
}
