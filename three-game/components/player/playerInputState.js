import * as THREE from 'three';
import { triggerToolUse } from '../../input/touchControls';
import { useThreeGameStore } from '../../store';

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
    dodgePressed,
    jumpPressed,
    anyDirectActionPressed,
    lateralOnlyInput: input.z === 0 && input.x !== 0,
  };
}

export function pulseEquippedToolOnUse(keys, lastButtonsRef) {
  // "Use tool" command (F key / clicking the equipped tool): pulse the
  // control mapped to the active tool; triggerAction picks it up next frame.
  // The shotgun reads F itself (playerEquipmentState): a tap fires and a
  // hold shoulders it, so it cannot fire on the press.
  const useToolPressed = Boolean(keys.useTool);
  const activeToolId = useThreeGameStore.getState().activeToolId;
  if (useToolPressed && !lastButtonsRef.current.useTool && activeToolId !== 'shotgun') {
    triggerToolUse(activeToolId);
  }
  lastButtonsRef.current.useTool = useToolPressed;
}
