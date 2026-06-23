import * as THREE from 'three';
import { triggerToolUse } from '../../input/touchControls';
import { useThreeGameStore } from '../../store';

const SHORTCUT_SENSITIVE_BUTTONS = [
  'pray',
  'fireRifle',
  'hammer',
  'net',
  'gather',
  'write',
  'inspect',
  'lookAround',
  'point',
  'trip',
  'teeter',
  'sit',
  'rest',
  'useTool',
  'tool1',
  'tool2',
  'tool3',
  'tool4',
  'tool5',
  'tool6',
];

export function sanitizeShortcutKeys(keys) {
  if (typeof window === 'undefined' || window.__darwinShortcutModifierActive !== true) return keys;
  const sanitized = { ...keys };
  SHORTCUT_SENSITIVE_BUTTONS.forEach(button => {
    sanitized[button] = false;
  });
  return sanitized;
}

export function readPlayerInput(keys, touch, target = new THREE.Vector3()) {
  const input = target.set(
    (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0),
    0,
    (keys.backward || touch.backward ? 1 : 0) - (keys.forward || touch.forward ? 1 : 0),
  );
  const moving = input.lengthSq() > 0;
  const crouchPressed = Boolean(keys.crouch || touch.crouch);
  const riflePressed = Boolean(keys.rifle || touch.rifle);
  const rotateLeftPressed = Boolean(keys.rotateLeft);
  const rotateRightPressed = Boolean(keys.rotateRight);
  const climbPressed = Boolean(keys.climb || touch.climb);
  const dodgePressed = Boolean(keys.dodge || touch.dodge);
  const jumpPressed = Boolean(keys.jump || touch.jump);
  const anyDirectActionPressed = Boolean(
    keys.pray || keys.fireRifle || keys.hammer || keys.net || keys.gather || keys.write || keys.inspect
    || keys.lookAround || keys.point || keys.trip || keys.teeter || keys.sit || keys.rest
    || touch.net || touch.hammer || touch.gather || touch.fireRifle || touch.write
  );

  return {
    input,
    moving,
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
  // "Use tool" command (J key / clicking the equipped tool): pulse the
  // control mapped to the active tool; triggerAction picks it up next frame.
  const useToolPressed = Boolean(keys.useTool);
  if (useToolPressed && !lastButtonsRef.current.useTool) {
    triggerToolUse(useThreeGameStore.getState().activeToolId);
  }
  lastButtonsRef.current.useTool = useToolPressed;
}
