import * as THREE from 'three';
import { triggerToolUse } from '../../input/touchControls';
import { useThreeGameStore } from '../../store';
import { catchPlan } from '../../catchRules';
import { requestSpecimenCatch } from './catchRequest';

export function readPlayerInput(keys, touch, target = new THREE.Vector3()) {
  // The on-screen joystick publishes an analog vector (touch.moveX/moveY);
  // when it's live it supersedes the touch direction booleans so the two
  // sources never double-count. Keyboard is always full-strength digital.
  const analogX = Number(touch.moveX) || 0;
  const analogZ = Number(touch.moveY) || 0;
  const analogActive = Math.abs(analogX) > 0.001 || Math.abs(analogZ) > 0.001;
  const touchX = analogActive ? analogX : (touch.right ? 1 : 0) - (touch.left ? 1 : 0);
  const touchZ = analogActive ? analogZ : (touch.backward ? 1 : 0) - (touch.forward ? 1 : 0);
  const keyboardX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const keyboardZ = (keys.backward ? 1 : 0) - (keys.forward ? 1 : 0);
  const input = target.set(
    THREE.MathUtils.clamp(keyboardX + touchX, -1, 1),
    0,
    THREE.MathUtils.clamp(keyboardZ + touchZ, -1, 1),
  );
  const moving = input.lengthSq() > 0.0016;
  // Analog deflection scales walk speed (direction is normalized downstream,
  // so magnitude would otherwise be lost). Full-strength by the joystick's
  // run threshold; keyboard input always moves at full speed.
  const analogSpeedScale = analogActive && keyboardX === 0 && keyboardZ === 0
    ? THREE.MathUtils.clamp(Math.hypot(analogX, analogZ) / 0.8, 0.4, 1)
    : 1;
  const crouchPressed = Boolean(keys.crouch || touch.crouch);
  const riflePressed = Boolean(keys.rifle || touch.rifle);
  const rotateLeftPressed = Boolean(keys.rotateLeft);
  const rotateRightPressed = Boolean(keys.rotateRight);
  const climbPressed = Boolean(keys.climb || touch.climb);
  const pushPressed = Boolean(keys.push || touch.push);
  const dodgePressed = Boolean(keys.dodge || touch.dodge);
  const jumpPressed = Boolean(keys.jump || touch.jump);
  const anyDirectActionPressed = Boolean(
    keys.rest
    || touch.rest || touch.net || touch.hammer || touch.knife || touch.gather || touch.fireRifle || touch.write || touch.inspect
    || touch.pray || touch.lookAround || touch.point || touch.sit
    || touch.animalEat || touch.animalSleep || touch.animalDefecate
  );

  return {
    input,
    moving,
    analogSpeedScale,
    crouchPressed,
    riflePressed,
    rotateLeftPressed,
    rotateRightPressed,
    climbPressed,
    pushPressed,
    dodgePressed,
    jumpPressed,
    anyDirectActionPressed,
    lateralOnlyInput: input.z === 0 && input.x !== 0,
  };
}

// What F should do about the subject in front of Darwin, when the tool in
// hand is not the one for it: `catch` hands a creature to the interaction loop
// (which takes up the right tool and uses it in the same press), `swing` names
// the tool to change to before swinging. Null leaves F to the tool in hand.
function toolForSubject(state, zoneSpecimens) {
  if (state.playableModeId !== 'darwin' || state.examineSession) return null;
  const activeToolId = state.activeToolId;
  if (activeToolId === 'sketch') return null;
  const target = state.fieldAction?.target;
  if (!target) return null;
  if (target.kind === 'specimen') {
    const specimen = (zoneSpecimens || []).find(item => item && (item.instanceId || item.id) === target.actorId)
      || (zoneSpecimens || []).find(item => item && item.id === target.typeId);
    if (!specimen) return null;
    const plan = catchPlan({
      specimen,
      toolId: activeToolId,
      downed: Boolean(state.downedSpecimenActors?.[target.actorId]),
      alreadyCollected: state.collectedSpecimenIds?.includes(specimen.id),
      toolbarOrder: state.toolbarOrder,
    });
    if (plan?.kind === 'wrongTool' && plan.bestToolId !== 'shotgun') return { catch: target.actorId };
    // Bare hands have no swing of their own: F reaches for the creature.
    if (activeToolId === 'hands' && (plan?.kind === 'hand' || plan?.kind === 'take' || plan?.kind === 'pickup')) {
      return { catch: target.actorId };
    }
    return null;
  }
  if (target.kind === 'obstacle' && target.category === 'Geology'
    && activeToolId !== 'hammer' && (state.toolbarOrder || []).includes('hammer')) {
    return { swing: 'hammer' };
  }
  return null;
}

// A swing waits this long after the tool is taken up, so the marker has
// settled on the subject (toolTargeting solves it for the tool in hand).
const TOOL_CHANGE_SWING_DELAY_MS = 160;

export function pulseEquippedToolOnUse(keys, lastButtonsRef, zoneSpecimens = null) {
  // "Use tool" command (F key / clicking the equipped tool): pulse the
  // control mapped to the active tool; triggerAction picks it up next frame.
  // The shotgun reads F itself (playerEquipmentState): a tap fires and a
  // hold shoulders it, so it cannot fire on the press.
  const useToolPressed = Boolean(keys.useTool);
  const state = useThreeGameStore.getState();
  const activeToolId = state.activeToolId;
  const pending = lastButtonsRef.current.pendingToolSwing;
  if (pending && performance.now() >= pending.at) {
    lastButtonsRef.current.pendingToolSwing = null;
    if (activeToolId === pending.toolId) triggerToolUse(pending.toolId);
  }
  if (useToolPressed && !lastButtonsRef.current.useTool && activeToolId !== 'shotgun') {
    const choice = toolForSubject(state, zoneSpecimens);
    if (choice?.catch) {
      requestSpecimenCatch(choice.catch);
    } else if (choice?.swing) {
      state.setActiveTool(choice.swing);
      lastButtonsRef.current.pendingToolSwing = {
        toolId: choice.swing,
        at: performance.now() + TOOL_CHANGE_SWING_DELAY_MS,
      };
    } else {
      triggerToolUse(activeToolId);
    }
  }
  lastButtonsRef.current.useTool = useToolPressed;
}
