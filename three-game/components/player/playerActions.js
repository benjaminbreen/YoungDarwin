import { useCallback } from 'react';
import { ACTION_DURATION, MOVEMENT_INTERRUPTIBLE_ACTIONS } from './playerConfig';

export function usePlayerActions(stateRef, lastButtonsRef) {
  const startAction = useCallback((now, clip, duration = ACTION_DURATION[clip] || 1.2, {
    lockMovement = true,
    recoverAction = null,
    recoverDuration = ACTION_DURATION[recoverAction] || 1.2,
    onStart = null,
  } = {}) => {
    stateRef.current.action = clip;
    stateRef.current.actionStartedAt = now;
    stateRef.current.actionUntil = now + duration;
    stateRef.current.lockMovementUntil = lockMovement ? now + duration : stateRef.current.lockMovementUntil;
    stateRef.current.recoverAction = recoverAction ? { clip: recoverAction, duration: recoverDuration } : null;
    onStart?.();
  }, [stateRef]);

  const interruptAction = useCallback((now, allowed = MOVEMENT_INTERRUPTIBLE_ACTIONS) => {
    if (!allowed.has(stateRef.current.action)) return false;
    stateRef.current.action = null;
    stateRef.current.recoverAction = null;
    stateRef.current.actionUntil = 0;
    stateRef.current.lockMovementUntil = Math.min(stateRef.current.lockMovementUntil, now);
    return true;
  }, [stateRef]);

  const triggerAction = useCallback((now, keys, touch, button, clip, duration = ACTION_DURATION[clip] || 1.2, options = {}) => {
    const pressed = Boolean(keys[button] || touch[button]);
    const allowWhileActing = options.allowWhileActing === true;
    const blocked = options.movementLocked || (!allowWhileActing && stateRef.current.action);
    if (pressed && !lastButtonsRef.current[button] && !blocked) {
      startAction(now, clip, duration, options);
    }
    lastButtonsRef.current[button] = pressed;
  }, [lastButtonsRef, startAction, stateRef]);

  return { startAction, interruptAction, triggerAction };
}
