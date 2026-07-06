import { emitPropEvent } from '../../physics/props/propEvents';
import { useThreeGameStore } from '../../store';
import { ACTION_DURATION } from './playerConfig';
import { maybeTriggerNetSnagFromSwing } from './fieldDilemmaTriggers';

export function triggerDirectPlayerActions({
  triggerAction,
  group,
  facing,
  movementLocked,
}) {
  const actionOptions = { movementLocked };
  triggerAction('pray', 'pray', ACTION_DURATION.pray, actionOptions);
  triggerAction('fireRifle', 'fireRifle', ACTION_DURATION.fireRifle, actionOptions);
  triggerAction('hammer', 'swingHammer', ACTION_DURATION.swingHammer, {
    ...actionOptions,
    onStart: () => {
      emitPropEvent('tool-swing', {
        tool: 'hammer',
        position: { x: group.current.position.x, y: group.current.position.y, z: group.current.position.z },
        facing: { x: facing.current.x, y: 0, z: facing.current.z },
        impactDelay: 0.55,
      });
    },
  });
  triggerAction('net', 'butterflyNetSwing', ACTION_DURATION.butterflyNetSwing, {
    ...actionOptions,
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
