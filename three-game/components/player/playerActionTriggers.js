import { emitPropEvent, nextSwingId } from '../../physics/props/propEvents';
import { useThreeGameStore } from '../../store';
import { ACTION_DURATION } from './playerConfig';
import { maybeTriggerNetSnagFromSwing } from './fieldDilemmaTriggers';
import { tryFireShotgun } from '../../shooting/fireShotgun';
import { SHOTGUN } from '../../shooting/shotgunConfig';
import { toolTargetDirection } from './toolTargeting';
import { NET_SWEEP, beginNetSweep, netSweepState } from './netSweep';

// A swing at a marked subject turns Darwin onto it over the wind-up, so the
// strike lands where the marker was rather than straight down his facing.
function aimToolSwing(toolId, group, facing, stateRef) {
  const position = group.current?.position;
  const direction = toolTargetDirection(toolId, position, facing.current);
  if (!direction) return { x: facing.current.x, y: 0, z: facing.current.z };
  if (stateRef) {
    const now = performance.now() / 1000;
    stateRef.current.collectionFaceMotion = {
      targetYaw: Math.atan2(direction.x, direction.z),
      startedAt: now,
      until: now + 0.32,
    };
  }
  return { x: direction.x, y: 0, z: direction.z };
}

// Start the aimed net sweep from where Darwin stands: commit the subject, step
// in when it sits past the hoop's reach, and tell the plants and sounds.
// Shared by the plain F swing and the E collection.
export function startNetSweep({ position, facing, stateRef, target = null }) {
  const now = performance.now() / 1000;
  const sweep = beginNetSweep({ position, facing, now, target });
  const dx = sweep.aim.x - position.x;
  const dz = sweep.aim.z - position.z;
  const distance = Math.hypot(dx, dz);
  const lunge = Math.min(NET_SWEEP.maxLunge, distance - NET_SWEEP.reach);
  if (stateRef && lunge > 0.05) {
    stateRef.current.netLunge = {
      startedAt: now + 0.06,
      duration: NET_SWEEP.strike - 0.1,
      x: dx / distance,
      z: dz / distance,
      distance: lunge,
      done: 0,
    };
  }
  emitPropEvent('tool-swing', {
    tool: 'insect_net',
    swingId: nextSwingId(),
    sweepId: sweep.id,
    position: { x: position.x, y: position.y, z: position.z },
    facing: { x: sweep.facing.x, y: 0, z: sweep.facing.z },
    impactDelay: NET_SWEEP.strike,
  });
  // A thorn or snag fouls the mesh: nothing is caught this sweep.
  if (maybeTriggerNetSnagFromSwing({ position, facing: { x: dx, y: 0, z: dz } })) {
    netSweepState.resolved = true;
    netSweepState.outcome = 'snagged';
    return { sweep, snagged: true };
  }
  return { sweep, snagged: false };
}

export function triggerDirectPlayerActions({
  triggerAction,
  group,
  facing,
  movementLocked,
  keys = {},
  touch = {},
  lastButtons = null,
  activeConstraint = null,
  stateRef = null,
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
        swingId: nextSwingId(),
        position: { x: group.current.position.x, y: group.current.position.y, z: group.current.position.z },
        facing: aimToolSwing('hammer', group, facing, stateRef),
        impactDelay: 0.55,
      });
    },
  });
  const knifeBlocked = toolBlocked('knife', 'pocket_knife');
  triggerAction('knife', 'swingTool', ACTION_DURATION.swingTool, {
    ...actionOptions,
    movementLocked: movementLocked || knifeBlocked,
    onStart: () => {
      emitPropEvent('tool-swing', {
        tool: 'pocket_knife',
        swingId: nextSwingId(),
        position: { x: group.current.position.x, y: group.current.position.y, z: group.current.position.z },
        facing: { x: facing.current.x, y: 0, z: facing.current.z },
        impactDelay: 0.34,
      });
    },
  });
  const netBlocked = toolBlocked('net', 'insect_net');
  triggerAction('net', 'butterflyNetSwing', NET_SWEEP.duration, {
    ...actionOptions,
    movementLocked: movementLocked || netBlocked,
    onStart: () => {
      const swingFacing = aimToolSwing('insect_net', group, facing, stateRef);
      if (!group.current) return;
      startNetSweep({ position: group.current.position, facing: swingFacing, stateRef });
    },
  });
  triggerAction('gather', 'gatherGround', ACTION_DURATION.gatherGround, actionOptions);
  triggerAction('write', 'write', ACTION_DURATION.write, { ...actionOptions, lockMovement: true });
  triggerAction('inspect', 'kneelInspect', ACTION_DURATION.kneelInspect, { ...actionOptions, lockMovement: true });
  triggerAction('lookAround', 'lookAround', ACTION_DURATION.lookAround, actionOptions);
  triggerAction('point', 'point', ACTION_DURATION.point, actionOptions);
  triggerAction('sit', 'standToSit', ACTION_DURATION.standToSit, { ...actionOptions, lockMovement: true });
  // R and the HUD's Rest button both land here. The store decides whether the
  // halt is allowed and spends the two hours; the clip is the same either way,
  // so a refused rest still reads as Darwin lying down and getting back up.
  triggerAction('rest', 'lyingDown', ACTION_DURATION.lyingDown, {
    ...actionOptions,
    lockMovement: true,
    recoverAction: 'gettingUp',
    recoverDuration: ACTION_DURATION.gettingUp,
    onStart: () => {
      useThreeGameStore.getState().beginRest?.();
    },
  });
}
