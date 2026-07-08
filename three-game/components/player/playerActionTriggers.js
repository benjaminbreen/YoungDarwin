import { emitPropEvent } from '../../physics/props/propEvents';
import { useThreeGameStore } from '../../store';
import { ACTION_DURATION } from './playerConfig';
import { maybeTriggerNetSnagFromSwing } from './fieldDilemmaTriggers';
import { tryFireShotgun } from '../../shooting/fireShotgun';
import { SHOTGUN } from '../../shooting/shotgunConfig';

export function triggerDirectPlayerActions({
  triggerAction,
  group,
  facing,
  movementLocked,
  keys = {},
  touch = {},
  lastButtons = null,
  activeConstraint = null,
}) {
  const actionOptions = { movementLocked };
  const toolBlocked = (button, toolId) => {
    const blocked = Array.isArray(activeConstraint?.blockedTools) && activeConstraint.blockedTools.includes(toolId);
    if (!blocked) return false;
    const pressed = Boolean(keys[button] || touch[button]);
    if (pressed && !lastButtons?.current?.[button]) {
      useThreeGameStore.getState().reportConstraintBlockedTool?.(toolId);
    }
    return true;
  };
  triggerAction('pray', 'pray', ACTION_DURATION.pray, actionOptions);
  triggerAction('fireRifle', 'fireRifle', SHOTGUN.fireActionDuration, {
    ...actionOptions,
    onStart: () => {
      // Direct fire (touch Fire button) shoots through the crosshair while
      // aiming, level along Darwin's facing otherwise; empty barrels make the
      // gesture a dry one — no blast, no smoke.
      if (useThreeGameStore.getState().activeToolId !== 'shotgun') return;
      tryFireShotgun({
        position: group.current?.position,
        facing: facing.current,
      });
    },
  });
  const hammerBlocked = toolBlocked('hammer', 'hammer');
  triggerAction('hammer', 'swingHammer', ACTION_DURATION.swingHammer, {
    ...actionOptions,
    movementLocked: movementLocked || hammerBlocked,
    onStart: () => {
      emitPropEvent('tool-swing', {
        tool: 'hammer',
        position: { x: group.current.position.x, y: group.current.position.y, z: group.current.position.z },
        facing: { x: facing.current.x, y: 0, z: facing.current.z },
        impactDelay: 0.55,
      });
    },
  });
  const netBlocked = toolBlocked('net', 'insect_net');
  triggerAction('net', 'butterflyNetSwing', ACTION_DURATION.butterflyNetSwing, {
    ...actionOptions,
    movementLocked: movementLocked || netBlocked,
    onStart: () => {
      maybeTriggerNetSnagFromSwing({
        position: group.current?.position,
        facing: facing.current,
      });
    },
  });
  triggerAction('snare', 'kneelInspect', ACTION_DURATION.kneelInspect, {
    ...actionOptions,
    lockMovement: true,
    onStart: () => {
      useThreeGameStore.getState().placeSnareTrap?.({
        position: group.current?.position,
        facing: facing.current,
      });
    },
  });
  triggerAction('gather', 'gatherGround', ACTION_DURATION.gatherGround, actionOptions);
  triggerAction('write', 'write', ACTION_DURATION.write, { ...actionOptions, lockMovement: true });
  triggerAction('inspect', 'kneelInspect', ACTION_DURATION.kneelInspect, { ...actionOptions, lockMovement: true });
  triggerAction('lookAround', 'lookAround', ACTION_DURATION.lookAround, actionOptions);
  triggerAction('point', 'point', ACTION_DURATION.point, actionOptions);
  triggerAction('trip', 'trip', ACTION_DURATION.trip, { ...actionOptions, lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.45 });
  triggerAction('teeter', 'teeter', ACTION_DURATION.teeter, { ...actionOptions, lockMovement: false });
  triggerAction('sit', 'standToSit', ACTION_DURATION.standToSit, { ...actionOptions, lockMovement: true });
  triggerAction('rest', 'lyingDown', ACTION_DURATION.lyingDown, { ...actionOptions, lockMovement: true });
}
