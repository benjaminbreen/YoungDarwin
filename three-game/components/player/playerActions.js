import { useCallback } from 'react';
import { MOVEMENT_INTERRUPTIBLE_ACTIONS, actionDuration } from './playerConfig';

export function usePlayerActions(stateRef, lastButtonsRef) {
  const startAction = useCallback((now, clip, duration = actionDuration(clip, stateRef.current.modelAssetId), {
    lockMovement = true,
    recoverAction = null,
    recoverDuration = actionDuration(recoverAction, stateRef.current.modelAssetId),
    onStart = null,
  } = {}) => {
    stateRef.current.action = clip;
    stateRef.current.actionStartedAt = now;
    stateRef.current.actionUntil = now + duration;
    const lockDuration = typeof lockMovement === 'number'
      ? Math.max(0, lockMovement)
      : (lockMovement ? duration : 0);
    stateRef.current.lockMovementUntil = lockDuration > 0 ? now + lockDuration : stateRef.current.lockMovementUntil;
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

  const triggerAction = useCallback((now, keys, touch, button, clip, duration = actionDuration(clip, stateRef.current.modelAssetId), options = {}) => {
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
