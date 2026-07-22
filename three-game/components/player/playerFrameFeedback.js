import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { BUMP_FEEDBACK, PLAYER } from './playerConfig';
import { orientDebugVector } from './playerUtils';

const UP = new THREE.Vector3(0, 1, 0);
const horizontalVelocity = new THREE.Vector3();
const localVelocity = new THREE.Vector3();
const IDLE_STANCE_ALIGNMENT_BOOST = 2.5;
const IDLE_STANCE_ALIGNMENT_SPEED = 0.8;
const IDLE_STANCE_MAX_TILT = 0.17;

export function updatePlayerFrameFeedback({
  group,
  warningRef,
  modelFeedbackRef,
  stateRef,
  debugCollisionRef,
  debugMovementRef,
  bounceFeedback,
  velocity,
  terrainFeedback,
  lastModelYaw,
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
    // model for inspection. During examination the camera sits between Darwin
    // and the subject, so his body would intrude into the frame — hide it.
    modelFeedbackRef.current.visible = (viewMode !== 'first' || storeState.statusViewOpen)
      && !storeState.examineSession;
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
    // The controller's stance plane is deliberately subtle in motion. At rest
    // it can align much more closely to the ground beneath both boots, which
    // removes the persistent uphill-foot/downhill-foot gap without touching
    // or stretching either leg bone.
    const idleStanceBlend = 1 - THREE.MathUtils.clamp(
      horizontalVelocity.length() / IDLE_STANCE_ALIGNMENT_SPEED,
      0,
      1,
    );
    const stanceAlignment = THREE.MathUtils.lerp(1, IDLE_STANCE_ALIGNMENT_BOOST, idleStanceBlend);
    const stancePitch = THREE.MathUtils.clamp(
      (slope.stancePitch || 0) * stanceAlignment,
      -IDLE_STANCE_MAX_TILT,
      IDLE_STANCE_MAX_TILT,
    );
    const stanceRoll = THREE.MathUtils.clamp(
      (slope.stanceRoll || 0) * stanceAlignment,
      -IDLE_STANCE_MAX_TILT,
      IDLE_STANCE_MAX_TILT,
    );
    // Step smoothing playback: PlayerController banks sharp grounded Y snaps
    // (obstacle step-ups/downs) into stepSmoothOffset. Ease it back to zero so
    // the model visibly rises or settles through the step while the collider
    // has already teleported to the new support height, and lean the gait with
    // it — forward while climbing through an up-step, slightly back while
    // settling off a drop — so the step reads inside the walk/run cycle.
    const stepOffset = stateRef?.current?.stepSmoothOffset || 0;
    const nextStepOffset = Math.abs(stepOffset) < 0.002 ? 0 : THREE.MathUtils.damp(stepOffset, 0, 11, delta);
    if (stateRef?.current) stateRef.current.stepSmoothOffset = nextStepOffset;
    modelFeedbackRef.current.position.y = nextStepOffset;
    const stepLean = THREE.MathUtils.clamp(nextStepOffset * 0.22, -0.11, 0.09);

    const targetPitch = -speedRatio * 0.075 + slopePitch + stancePitch + stepLean - feedback.normal.z * collisionLean;
    const targetRoll = THREE.MathUtils.clamp((localVelocity.x / PLAYER.runSpeed) * -0.08 + yawDelta * -1.4, -0.16, 0.16)
      + stanceRoll
      + feedback.normal.x * collisionLean;
    modelFeedbackRef.current.rotation.x = THREE.MathUtils.damp(modelFeedbackRef.current.rotation.x, targetPitch, 10, delta);
    modelFeedbackRef.current.rotation.z = THREE.MathUtils.damp(modelFeedbackRef.current.rotation.z, targetRoll, 10, delta);
    modelFeedbackRef.current.position.x = feedback.normal.x * feedbackEase * feedback.intensity * 0.045;
    modelFeedbackRef.current.position.z = feedback.normal.z * feedbackEase * feedback.intensity * 0.045;

    // Squash & stretch: landing compresses toward the feet (group origin is
    // at ground level, so scaling reads as sinking into the landing), takeoff
    // stretches tall. Impact fields are written by playerAirborneMotion.
    let squashY = 1;
    let squashXZ = 1;
    const impact = stateRef?.current;
    if (impact) {
      const landAge = now - (impact.impactLandedAt ?? -10);
      if (landAge >= 0 && landAge < 0.34) {
        const p = landAge / 0.34;
        const env = (1 - p) * (1 - p);
        const amp = impact.impactIntensity || 0;
        squashY -= amp * 0.16 * env;
        squashXZ += amp * 0.1 * env;
      }
      const takeAge = now - (impact.impactTakeoffAt ?? -10);
      if (takeAge >= 0 && takeAge < 0.24) {
        const env = Math.sin((takeAge / 0.24) * Math.PI);
        const amp = impact.impactStretch || 0;
        squashY += amp * 0.075 * env;
        squashXZ -= amp * 0.045 * env;
      }
    }
    modelFeedbackRef.current.scale.x = THREE.MathUtils.damp(modelFeedbackRef.current.scale.x, squashXZ, 22, delta);
    modelFeedbackRef.current.scale.y = THREE.MathUtils.damp(modelFeedbackRef.current.scale.y, squashY, 22, delta);
    modelFeedbackRef.current.scale.z = THREE.MathUtils.damp(modelFeedbackRef.current.scale.z, squashXZ, 22, delta);
  }

  if (physicsDebug) {
    orientDebugVector(debugCollisionRef.current, characterDebug.current.normal, characterDebug.current.normal.length() * 0.85);
    orientDebugVector(debugMovementRef.current, characterDebug.current.movement, Math.min(1.2, characterDebug.current.movement.length() * 18));
  }
}
