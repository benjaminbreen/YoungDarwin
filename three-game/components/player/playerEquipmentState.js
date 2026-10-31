import { ACTION_DURATION } from './playerConfig';
import { pulseEquippedToolOnUse } from './playerInputState';
import { triggerToolUse } from '../../input/touchControls';
import { tryFireShotgun } from '../../shooting/fireShotgun';
import { SHOTGUN } from '../../shooting/shotgunConfig';
import { shotgunAimState } from '../../shooting/aimState';

// F held this long shoulders the shotgun; a shorter press is a shot.
export const SHOTGUN_AIM_HOLD_SECONDS = 0.2;

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
  disabled = false,
}) {
  const hasRifle = activeToolId === 'shotgun';
  if (disabled) {
    stateRef.current.aimToggled = false;
    stateRef.current.aiming = false;
    stateRef.current.aimKeyHeldSince = null;
    lastButtons.current.rifle = riflePressed;
    lastButtons.current.aimKey = Boolean(keys.useTool);
    lastButtons.current.useTool = Boolean(keys.useTool);
    lastToolId.current = activeToolId;
    if (aimActiveRef) aimActiveRef.current = false;
    return { activeToolId, hasRifle: false };
  }
  if (lastToolId.current !== null && activeToolId !== lastToolId.current
    && !stateRef.current.action && !preInputMovementLocked && !stateRef.current.swimming) {
    const transitionClip = activeToolId === 'shotgun'
      ? 'rifleEquip'
      : (lastToolId.current === 'shotgun' ? 'rifleUnequip' : 'changeItem');
    startAction(transitionClip, ACTION_DURATION[transitionClip] || ACTION_DURATION.changeItem, { lockMovement: false });
  }
  lastToolId.current = activeToolId;

  // Three ways into ADS, all granting the same state: hold F, hold right
  // mouse (shooter convention), or the touch Aim button, which toggles. A tap
  // of F fires instead — through the crosshair if already aiming, along
  // Darwin's facing otherwise.
  const aimKeyHeld = hasRifle && Boolean(keys.useTool);
  const nowSeconds = performance.now() / 1000;
  if (aimKeyHeld && !lastButtons.current.aimKey) stateRef.current.aimKeyHeldSince = nowSeconds;
  const aimKeyHeldFor = aimKeyHeld && stateRef.current.aimKeyHeldSince !== null
    ? nowSeconds - stateRef.current.aimKeyHeldSince
    : 0;
  const keyAimIntent = aimKeyHeld && aimKeyHeldFor >= SHOTGUN_AIM_HOLD_SECONDS;
  let aimKeyTapped = false;
  if (!aimKeyHeld && lastButtons.current.aimKey && hasRifle) {
    aimKeyTapped = !stateRef.current.aimKeyAimed;
    stateRef.current.aimKeyAimed = false;
  }
  if (!aimKeyHeld) stateRef.current.aimKeyHeldSince = null;
  if (keyAimIntent) stateRef.current.aimKeyAimed = true;
  lastButtons.current.aimKey = aimKeyHeld;
  const aimToggleAllowed = !stateRef.current.action || stateRef.current.action === 'changeItem';
  if (riflePressed && !lastButtons.current.rifle && !preInputMovementLocked && aimToggleAllowed && hasRifle) {
    stateRef.current.aimToggled = !stateRef.current.aimToggled;
  }
  if (!hasRifle) stateRef.current.aimToggled = false;
  lastButtons.current.rifle = riflePressed;
  const holdIntent = hasRifle && !preInputMovementLocked && Boolean(shotgunAimState.holdIntent);
  const wantAim = hasRifle && !stateRef.current.swimming
    && (stateRef.current.aimToggled || holdIntent || (keyAimIntent && !preInputMovementLocked));
  if (wantAim !== Boolean(stateRef.current.aiming)) {
    stateRef.current.aiming = wantAim;
    if (aimToggleAllowed) {
      startAction(wantAim ? 'rifleEquip' : 'rifleUnequip', 0.7, { lockMovement: false });
    }
  }
  if (aimActiveRef) aimActiveRef.current = stateRef.current.aiming;

  if (aimKeyTapped && !preInputMovementLocked) {
    if (stateRef.current.aiming && firePulseRef) firePulseRef.current += 1;
    else triggerToolUse('shotgun');
  }

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
