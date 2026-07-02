import { ACTION_DURATION } from './playerConfig';
import { pulseEquippedToolOnUse } from './playerInputState';

export function updatePlayerEquipmentState({
  keys,
  stateRef,
  lastButtons,
  lastToolId,
  lastFirePulse,
  activeToolId,
  riflePressed,
  preInputMovementLocked,
  swimState,
  firePulseRef,
  aimActiveRef,
  startAction,
}) {
  const hasRifle = activeToolId === 'shotgun';
  if (lastToolId.current !== null && activeToolId !== lastToolId.current
    && !stateRef.current.action && !preInputMovementLocked && !stateRef.current.swimming) {
    const transitionClip = activeToolId === 'shotgun'
      ? 'rifleEquip'
      : (lastToolId.current === 'shotgun' ? 'rifleUnequip' : 'changeItem');
    startAction(transitionClip, ACTION_DURATION[transitionClip] || ACTION_DURATION.changeItem, { lockMovement: false });
  }
  lastToolId.current = activeToolId;

  const aimToggleAllowed = !stateRef.current.action || stateRef.current.action === 'changeItem';
  if (riflePressed && !lastButtons.current.rifle && !preInputMovementLocked && aimToggleAllowed && hasRifle) {
    stateRef.current.aiming = !stateRef.current.aiming;
    if (stateRef.current.aiming) startAction('rifleEquip', 0.7, { lockMovement: false });
    else startAction('rifleUnequip', 0.7, { lockMovement: false });
  }
  if (!hasRifle) stateRef.current.aiming = false;
  lastButtons.current.rifle = riflePressed;
  if (aimActiveRef) aimActiveRef.current = stateRef.current.aiming;

  if (stateRef.current.aiming && hasRifle && firePulseRef
    && firePulseRef.current !== lastFirePulse.current) {
    lastFirePulse.current = firePulseRef.current;
    if (!stateRef.current.action) startAction('fireRifle', ACTION_DURATION.fireRifle, { lockMovement: true });
  }

  pulseEquippedToolOnUse(keys, lastButtons);
  return { activeToolId, hasRifle };
}
