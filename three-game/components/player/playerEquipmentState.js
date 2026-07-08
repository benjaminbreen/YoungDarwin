import { ACTION_DURATION } from './playerConfig';
import { pulseEquippedToolOnUse } from './playerInputState';
import { tryFireShotgun } from '../../shooting/fireShotgun';
import { SHOTGUN } from '../../shooting/shotgunConfig';
import { shotgunAimState } from '../../shooting/aimState';

export function updatePlayerEquipmentState({
  keys,
  stateRef,
  lastButtons,
  lastToolId,
  lastFirePulse,
  activeToolId,
  riflePressed,
  preInputMovementLocked,
  firePulseRef,
  aimActiveRef,
  startAction,
  playerPosition = null,
  playerFacing = null,
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

  // Two ways into ADS: F (or the touch Aim button) toggles a persistent aim,
  // holding right mouse aims for as long as it is held (shooter convention).
  // Either grants the same state.
  const aimToggleAllowed = !stateRef.current.action || stateRef.current.action === 'changeItem';
  if (riflePressed && !lastButtons.current.rifle && !preInputMovementLocked && aimToggleAllowed && hasRifle) {
    stateRef.current.aimToggled = !stateRef.current.aimToggled;
  }
  if (!hasRifle) stateRef.current.aimToggled = false;
  lastButtons.current.rifle = riflePressed;
  const holdIntent = hasRifle && !preInputMovementLocked && Boolean(shotgunAimState.holdIntent);
  const wantAim = hasRifle && !stateRef.current.swimming && (stateRef.current.aimToggled || holdIntent);
  if (wantAim !== Boolean(stateRef.current.aiming)) {
    stateRef.current.aiming = wantAim;
    if (aimToggleAllowed) {
      startAction(wantAim ? 'rifleEquip' : 'rifleUnequip', 0.7, { lockMovement: false });
    }
  }
  if (aimActiveRef) aimActiveRef.current = stateRef.current.aiming;

  if (stateRef.current.aiming && hasRifle && firePulseRef
    && firePulseRef.current !== lastFirePulse.current) {
    lastFirePulse.current = firePulseRef.current;
    if (!stateRef.current.action) {
      const fired = tryFireShotgun({ position: playerPosition, facing: playerFacing });
      // A short action window (the clip itself is trimmed via maxTime so only
      // one trigger pull of the source loop shows) keeps the second barrel
      // snappy; a click on empty barrels plays the reload gesture instead.
      if (fired === 'fired') {
        startAction('fireRifle', Math.max(SHOTGUN.refireDelay, SHOTGUN.fireActionDuration), { lockMovement: true });
      } else {
        startAction('rifleEquip', ACTION_DURATION.rifleEquip, { lockMovement: false });
      }
    }
  }

  pulseEquippedToolOnUse(keys, lastButtons);
  return { activeToolId, hasRifle };
}
