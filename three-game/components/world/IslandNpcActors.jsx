'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import { getRuntimePlayerMotion, getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { getNpcEncounter } from '../../encounters/npcEncounters';
import { createIslandNpcNavigation, findNpcRetreat, npcDistance, pointAlongNpcPath } from '../../npcs/islandNpcNavigation';
import { getIslandNpcReaction } from '../../npcs/islandNpcReactions';
import { startIslandNpcGuide, updateIslandNpcGuide } from '../../npcs/islandNpcGuidance';
import { getIslandNpcGuide, getIslandNpcIdsForZone, getIslandNpcSchedule, getIslandNpcWeatherLeg, STOKES_ID, WELL_BOY_ID } from '../../npcs/islandNpcSchedule';
import { NPC_STATUS, npcStatusStyle } from '../../npcs/npcStatus';
import { getNpcPoses, publishNpcPose, removeNpcPose } from '../../world/npcRuntime';
import { getSpecimenRuntimePoses, pushSpecimenStimulus } from '../../world/specimenRuntime';
import { normalizeWildlifeId } from '../../wildlife/wildlifeCatalog';
import { isWetWeather } from '../../world/weatherStates';
import { isExpeditionPaused } from '../../input/typingMode';
import { ModelAsset } from '../assets/ModelAsset';
import { NpcStatusOrb } from './NpcStatusOrb';
import { TerrainRingMarker } from './TerrainRingMarker';
import { NpcFallback } from './StationaryNpc';

const DECISION_INTERVAL = 0.2;
const WALK_SPEED = { maria: 1.13, gabriel_puig: 1.38 };
const RUN_SPEED = { maria: 2.55, gabriel_puig: 3.45 };
const STATUS_BY_REACTION = {
  approach: NPC_STATUS.FRIENDLY,
  greet: NPC_STATUS.FRIENDLY,
  flee: NPC_STATUS.ALERT,
  wary: NPC_STATUS.ALERT,
  wave: NPC_STATUS.ALERT,
};
const REACTION_ACTIVITIES = {
  flee: 'Getting out of sight',
  approach: 'Coming over',
  greet: 'Ready to talk',
  wave: 'Waving Darwin back',
  wary: 'Keeping watch',
};

function npcActivity({ guide, mode, leg }, rainPause, sharedWait) {
  if (mode === 'flee') return REACTION_ACTIVITIES.flee;
  if (guide?.phase === 'leading') return guide.plan.leading;
  if (guide?.phase === 'waiting') return 'Waiting for Darwin';
  if (guide?.phase === 'showing') return guide.plan.arrival;
  if (REACTION_ACTIVITIES[mode]) return REACTION_ACTIVITIES[mode];
  if (rainPause) return 'Pausing the survey in the rain';
  if (sharedWait) return 'Making room by the water';
  return leg.activity;
}

function surveyPlayer(motion, navigation, npcId, player, state, wet) {
  const { x, z } = motion.position;
  const distance = npcDistance(motion.position, player);
  const heightGap = Math.abs((player.y ?? navigation.height(x, z)) - navigation.height(x, z));
  const visible = distance < 9 && heightGap < 2.1 && navigation.line(motion.position, player);
  const velocity = getRuntimePlayerMotion()?.intendedPlanarVelocity;
  const playerSpeed = velocity ? Math.hypot(velocity.x, velocity.z) : 0;
  const closingSpeed = velocity && distance > 0.1
    ? (velocity.x * (x - player.x) + velocity.z * (z - player.z)) / distance : 0;
  let witnessed = false;
  if (visible && npcId === 'gabriel_puig' && !motion.leg.privateSite) {
    for (const [id, pose] of getNpcPoses(state.currentZoneId) || []) {
      if (id === npcId || npcDistance(motion.position, pose) > 6) continue;
      if (navigation.line(motion.position, pose)) {
        witnessed = true;
        break;
      }
    }
  }
  return {
    distance, visible, playerSpeed, closingSpeed, witnessed,
    armed: state.shotgunHolder === 'darwin' && state.activeToolId === 'shotgun',
    wet,
  };
}

function updateSharedWait(motion, navigation, state, senses) {
  const flags = state.npcEncounterState?.[WELL_BOY_ID]?.flags;
  const waiting = motion.leg.clip === 'wait' && !motion.reaction && senses.visible && !senses.armed
    && senses.distance >= 2.55 && senses.distance < 6.1 && senses.playerSpeed < 0.25;
  if (!waiting || flags?.includes('waited_quietly_at_the_well')) {
    motion.quietSince = null;
    return;
  }
  motion.quietSince ??= motion.clock;
  if (motion.clock - motion.quietSince < 4) return;
  for (const dove of getSpecimenRuntimePoses(state.currentZoneId)?.values() || []) {
    if (normalizeWildlifeId(dove.specimenId) !== 'galapagosdove' || npcDistance(motion.position, dove) > 10) continue;
    if (dove.y > navigation.height(dove.x, dove.z) + 0.48) continue;
    state.recordNpcActivity(WELL_BOY_ID, 'waited_together', { trustDelta: 2, flags: ['waited_quietly_at_the_well'] });
    break;
  }
}

function startWellWarning(motion, state, player) {
  motion.reaction = { mode: 'wave', until: motion.clock + 4.5 };
  const zoneId = state.currentZoneId;
  for (const [actorId, dove] of getSpecimenRuntimePoses(zoneId) || []) {
    if (normalizeWildlifeId(dove.specimenId) !== 'galapagosdove' || npcDistance(dove, motion.position) > 9) continue;
    pushSpecimenStimulus(zoneId, actorId, {
      kind: 'contact', sourceActorId: WELL_BOY_ID, position: player, radius: 12, intensity: 1.35, duration: 1.6,
    });
  }
  state.recordNpcActivity(WELL_BOY_ID, 'waved_back', { trustDelta: -1, flags: ['rushed_the_well'] });
}

function beginLeg(motion, navigation, leg, minute, clockJump) {
  if (!motion.position || clockJump) {
    const progress = MathUtils.clamp((minute - leg.start) / (leg.end - leg.start), 0, 1);
    const path = navigation.path(leg.from, leg.to);
    motion.position = pointAlongNpcPath(path, progress) || navigation.nearest(leg.from);
    motion.reaction = null;
    motion.quietSince = null;
    motion.yaw = leg.yaw ?? 0;
  }
  motion.leg = leg;
  motion.path = motion.position ? navigation.path(motion.position, leg.to).slice(1) : [];
  if (motion.path.length && npcDistance(motion.position, motion.path[0]) < 0.025) motion.path.shift();
  motion.nextDecision = 0;
}

function startFlight(motion, navigation, npcId, player, state, armed) {
  const target = findNpcRetreat(navigation, motion.position, player, npcId === 'gabriel_puig' ? 9 : 5);
  const firstMeeting = npcId === 'gabriel_puig'
    && !state.npcEncounterState?.[npcId]?.flags?.includes('gabriel_first_sighting');
  if (!target) {
    // A narrow passage can leave no room to run. Keep the same social boundary.
    motion.reaction = { mode: 'wary', until: motion.clock + 3 };
    if (firstMeeting) state.recordNpcActivity(npcId, 'startled', { flags: ['gabriel_first_sighting'] });
    return;
  }
  motion.reaction = {
    mode: 'flee', target, path: navigation.path(motion.position, target).slice(1),
    started: motion.clock, until: motion.clock + 6, firstMeeting,
    playerStart: { x: player.x, z: player.z },
    npcStart: motion.position,
  };
  state.recordNpcActivity(npcId, armed ? 'armed' : 'fled', {
    flags: firstMeeting ? ['gabriel_first_sighting'] : [],
    trustDelta: armed ? -4 : 0,
  });
}

function updateReaction(motion, navigation, npcId, player, state, senses) {
  const relation = state.npcEncounterState?.[npcId];
  const { distance, armed, visible, witnessed } = senses;
  const reaction = motion.reaction;
  if (visible) motion.lastSeen = motion.clock;
  else if (motion.clock - motion.lastSeen > 1.6) motion.greeted = false;

  if (reaction?.mode === 'flee') {
    if (reaction.firstMeeting && !reaction.resolved && motion.clock - reaction.started > 1.8) {
      const initialGap = npcDistance(reaction.playerStart, reaction.npcStart);
      const movedAway = npcDistance(player, reaction.npcStart) > initialGap + 2;
      const closedGap = npcDistance(reaction.playerStart, motion.position) - distance > 1.5;
      if (!armed && (distance > 9 || movedAway)) {
        reaction.resolved = true;
        state.recordNpcActivity(npcId, 'gave_space', { trustDelta: 4, flags: ['gabriel_gave_space'] });
      } else if (distance < 5 && closedGap) {
        reaction.resolved = true;
        state.recordNpcActivity(npcId, 'pursued', { trustDelta: -5, flags: ['gabriel_pursued'] });
      }
    }
    if (armed && distance < 7.5 && visible
        && npcDistance(motion.position, reaction.target) < 0.25) {
      startFlight(motion, navigation, npcId, player, state, true);
      return motion.reaction.mode;
    }
    if (motion.clock < reaction.until) return 'flee';
    motion.reaction = null;
    motion.cooldown = motion.clock + 5;
    motion.path = navigation.path(motion.position, motion.leg.to).slice(1);
  } else if (reaction && (motion.clock >= reaction.until
      || (['approach', 'greet'].includes(reaction.mode) && (!visible || witnessed || distance > 7.5)))) {
    motion.reaction = null;
    motion.cooldown = motion.clock + 8;
    motion.path = navigation.path(motion.position, motion.leg.to).slice(1);
  }

  const response = getIslandNpcReaction(npcId, {
    ...senses, leg: motion.leg, relation, distance: visible ? distance : Infinity, hour: state.timeOfDay,
    alreadyReacted: Boolean(motion.reaction) || motion.clock < motion.cooldown || motion.greeted,
  });
  if (response === 'flee' && motion.reaction?.mode !== 'wary' && (armed || motion.clock >= motion.cooldown)) {
    startFlight(motion, navigation, npcId, player, state, armed);
    return motion.reaction.mode;
  }
  if (motion.guide) return visible ? 'available' : 'ignore';
  if (motion.reaction?.mode === 'approach' && !armed) {
    if (distance <= 1.83) motion.reaction = { mode: 'greet', until: motion.clock + 5 };
    return motion.reaction.mode;
  }
  if (response === 'wave') {
    startWellWarning(motion, state, player);
    return 'wave';
  }
  if (response === 'approach') {
    motion.greeted = true;
    motion.reaction = { mode: 'approach', until: motion.clock + 7 };
    state.recordNpcActivity(npcId, 'approached');
    return 'approach';
  }
  if (npcId === WELL_BOY_ID) updateSharedWait(motion, navigation, state, senses);
  return motion.reaction?.mode || response;
}

function stepToward(motion, navigation, target, speed, delta, stopAt = 0) {
  if (!target) return false;
  const from = motion.position;
  const distance = npcDistance(from, target);
  if (distance <= stopAt + 0.015) return false;
  const step = Math.min(distance - stopAt, speed * delta);
  const x = from.x + (target.x - from.x) * step / distance;
  const z = from.z + (target.z - from.z) * step / distance;
  if (!navigation.line(from, { x, z })) return false;
  motion.yaw = Math.atan2(target.x - from.x, target.z - from.z);
  motion.position = { x, z };
  return true;
}

function walkPath(motion, navigation, path, speed, delta) {
  const target = path[0];
  const moving = stepToward(motion, navigation, target, speed, delta);
  if (target && npcDistance(motion.position, target) <= 0.025) path.shift();
  return moving;
}

function pathBlocker(from, target, player, zoneId, npcId) {
  if (!target) return null;
  const length = npcDistance(from, target);
  if (length <= 0.025) return null;
  const x = (target.x - from.x) / length;
  const z = (target.z - from.z) / length;
  const blocks = pose => {
    const dx = pose.x - from.x;
    const dz = pose.z - from.z;
    const ahead = dx * x + dz * z;
    return ahead > 0 && ahead < Math.min(length + 0.3, 1.15) && Math.abs(dx * z - dz * x) < 0.55;
  };
  if (player && blocks(player)) return player;
  for (const [id, pose] of getNpcPoses(zoneId) || []) {
    if (id !== npcId && pose.collisionEnabled && blocks(pose)) return pose;
  }
  return null;
}

function yieldAlongPath(motion, navigation, target, blocker, speed, delta) {
  const dx = target.x - motion.position.x;
  const dz = target.z - motion.position.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0.025) return false;
  for (const side of [1, -1]) {
    const step = {
      x: motion.position.x + side * dz * 0.65 / length,
      z: motion.position.z - side * dx * 0.65 / length,
    };
    if (npcDistance(step, blocker) > npcDistance(motion.position, blocker) && navigation.line(motion.position, step)) {
      return stepToward(motion, navigation, step, speed * 0.7, delta);
    }
  }
  return false;
}

function walkWithOthers(motion, navigation, path, speed, delta, player, zoneId, npcId) {
  const blocker = pathBlocker(motion.position, path[0], player, zoneId, npcId);
  return blocker
    ? yieldAlongPath(motion, navigation, path[0], blocker, speed, delta)
    : walkPath(motion, navigation, path, speed, delta);
}

function IslandNpcActor({ npcId, zoneId, motionPaused }) {
  const encounter = getNpcEncounter(npcId);
  const group = useRef(null);
  const clip = useRef('idle');
  const animationSelector = useMemo(() => () => clip.current, []);
  const motion = useRef({
    leg: null, position: null, path: [], reaction: null,
    clock: 0, nextDecision: 0, cooldown: 0, worldMinute: null, yaw: 0, mode: 'ignore',
    guide: null, quietSince: null, greeted: false, lastSeen: -Infinity, retryAt: 0, visible: false,
  });
  const [display, setDisplay] = useState({ mode: 'ignore', activity: '', talking: false });
  const offsets = useThreeGameStore(state => state.pushableObstacleOffsets);
  const navigation = useMemo(() => createIslandNpcNavigation(zoneId, offsets), [zoneId, offsets]);

  useEffect(() => () => removeNpcPose(zoneId, npcId), [zoneId, npcId]);

  useFrame((_, delta) => {
    const body = group.current;
    if (!body) return;
    const state = useThreeGameStore.getState();
    const wet = isWetWeather(state.weather);
    const current = motion.current;
    const minute = state.timeOfDay * 60;
    const worldMinute = state.day * 1440 + minute;
    const talking = state.activeNpcEncounter?.npcId === npcId;
    const clockJump = current.worldMinute != null && Math.abs(worldMinute - current.worldMinute) > 3;
    if (clockJump && !talking) current.guide = null;
    const request = state.npcGuideRequest;
    const guidePlan = request?.npcId === npcId && getIslandNpcGuide(request.id, npcId, zoneId);
    const holdLeg = talking || current.guide || guidePlan;
    const leg = holdLeg && current.leg ? current.leg : getIslandNpcWeatherLeg(
      npcId, getIslandNpcSchedule(npcId, state.day, state.timeOfDay), wet,
    );
    if (leg?.zoneId !== zoneId || leg.hidden) {
      if (body.visible) removeNpcPose(zoneId, npcId);
      body.visible = false;
      current.leg = null;
      current.position = null;
      current.reaction = null;
      current.greeted = false;
      current.quietSince = null;
      current.mode = 'ignore';
      if (guidePlan) state.consumeNpcGuide(request);
      return;
    }
    current.worldMinute = worldMinute;
    if (current.leg !== leg || (clockJump && !holdLeg)) beginLeg(current, navigation, leg, minute, clockJump);
    if (!current.position) return;

    const dt = Math.min(delta, 0.06);
    const player = getRuntimePlayerPose()?.position;
    const paused = motionPaused || state.transition || isExpeditionPaused();
    if (!paused && !talking) {
      if (guidePlan) {
        current.guide = startIslandNpcGuide(guidePlan, navigation, current.position, current.clock);
        current.reaction = null;
        current.nextDecision = 0;
        state.consumeNpcGuide(request);
      }
      current.clock += dt;
      if (player && current.clock >= current.nextDecision) {
        current.nextDecision = current.clock + DECISION_INTERVAL;
        const senses = surveyPlayer(current, navigation, npcId, player, state, wet);
        current.visible = senses.visible;
        current.mode = updateReaction(current, navigation, npcId, player, state, senses);
        if (current.guide) {
          const phase = updateIslandNpcGuide(current.guide, {
            clock: current.clock,
            distance: senses.distance,
            armed: senses.armed && senses.visible,
          });
          if (phase === 'done') {
            current.guide = null;
            current.path = navigation.path(current.position, leg.to).slice(1);
          } else {
            current.guide.phase = phase;
          }
        }
      }
    }

    let moving = false;
    if (!paused && !talking) {
      if (current.mode === 'flee') {
        moving = walkPath(current, navigation, current.reaction?.path ?? [], RUN_SPEED[npcId] ?? 2.65, dt);
      } else if (current.guide) {
        if (current.guide.phase === 'leading') {
          moving = walkWithOthers(current, navigation, current.guide.path, 1.16, dt, player, zoneId, npcId);
          if (!moving && current.guide.path.length && current.clock >= current.retryAt) {
            current.retryAt = current.clock + 1.5;
            const route = navigation.path(current.position, current.guide.plan.site).slice(1);
            if (route.length) current.guide.path = route;
            else current.guide = null;
          }
        }
      } else if (current.mode === 'approach' && player) {
        moving = stepToward(current, navigation, player, WALK_SPEED[npcId] ?? 1.16, dt, 1.62);
      } else if (current.path.length && !['greet', 'wary', 'wave'].includes(current.mode)) {
        const target = current.path[0];
        moving = walkWithOthers(current, navigation, current.path, WALK_SPEED[npcId] ?? 1.16, dt, player, zoneId, npcId);
        if (!moving && current.path[0] === target && current.clock >= current.retryAt) {
          current.retryAt = current.clock + 1.5;
          current.path = navigation.path(current.position, leg.to).slice(1);
        }
      }
    }
    const guide = current.guide;
    const looking = player && (talking || current.mode === 'approach' || current.mode === 'greet'
      || current.mode === 'wary' || current.mode === 'wave' || guide?.phase === 'waiting')
      && current.visible && current.mode !== 'flee';
    if (!moving && looking) {
      current.yaw = Math.atan2(player.x - current.position.x, player.z - current.position.z);
    } else if (!moving && (guide ? !guide.path.length : !current.path.length)
        && Number.isFinite(leg.yaw) && current.mode !== 'flee') {
      current.yaw = guide?.plan.site.yaw ?? leg.yaw;
    }

    const { x, z } = current.position;
    const y = navigation.height(x, z) + 0.03;
    body.position.set(x, y, z);
    if (!body.visible) body.rotation.y = current.yaw;
    const yawDelta = Math.atan2(Math.sin(current.yaw - body.rotation.y), Math.cos(current.yaw - body.rotation.y));
    body.rotation.y += yawDelta * (1 - Math.exp(-dt * 12));
    body.visible = true;
    const rainPause = npcId === STOKES_ID && leg.clip === 'sketch' && wet;
    const conversationalPose = leg.clip === 'wait' ? 'wait'
      : npcId === WELL_BOY_ID && (leg.moveClip === 'carry' || ['hold_pail', 'fill'].includes(leg.clip)) ? 'hold_pail' : 'idle';
    clip.current = talking || paused ? conversationalPose
      : moving ? (current.mode === 'flee' ? 'run' : leg.moveClip ?? 'walk')
        : current.mode === 'wave' ? 'wave'
        : current.mode === 'flee' || current.mode === 'wary' || current.mode === 'greet' || guide || rainPause ? 'look'
          : leg.clip === 'walk' || leg.clip === 'carry' ? 'idle' : leg.clip;

    const sharedWait = npcId === WELL_BOY_ID && leg.clip === 'wait'
      && state.npcEncounterState?.[npcId]?.flags?.includes('waited_quietly_at_the_well') && current.visible;
    const activity = npcActivity(current, rainPause, sharedWait);
    const available = current.visible && !['ignore', 'flee', 'wave'].includes(current.mode)
      && (current.mode !== 'wary' || !(state.shotgunHolder === 'darwin' && state.activeToolId === 'shotgun'));
    publishNpcPose(zoneId, npcId, {
      x, y, z, activity,
      encounterEnabled: talking || available,
      collisionRadius: npcId === WELL_BOY_ID ? 0.23 : 0.31,
      collisionHeight: npcId === WELL_BOY_ID ? (leg.clip === 'wait' ? 0.91 : 1.22) : npcId === 'maria' ? 1.61 : 1.73,
    });
    if (display.mode !== current.mode || display.activity !== activity || display.talking !== talking) {
      setDisplay({ mode: current.mode, activity, talking });
    }
  });

  const status = display.talking ? NPC_STATUS.FRIENDLY : STATUS_BY_REACTION[display.mode] || NPC_STATUS.NEUTRAL;
  return (
    <group ref={group} visible={false} userData={{ renderSource: `npc:${npcId}`, renderKind: 'npc' }}>
      <ModelAsset id={encounter.modelAssetId} animationSelector={animationSelector} reflect fallback={<NpcFallback npcId={npcId} />} />
      {display.mode !== 'flee' && display.mode !== 'ignore' && (
        <TerrainRingMarker radius={0.72} opacity={0.38} color={npcStatusStyle(status).ring} zoneId={zoneId} />
      )}
      {display.mode !== 'ignore' && display.mode !== 'flee' && (
        <NpcStatusOrb status={status} name={encounter.name} activity={display.activity} height={encounter.markerHeight ?? 2.18} />
      )}
    </group>
  );
}

export function IslandNpcActors({ zoneId, motionPaused }) {
  const mode = useThreeGameStore(state => state.playableModeId);
  const ids = useMemo(() => getIslandNpcIdsForZone(zoneId), [zoneId]);
  if (mode !== 'darwin') return null;
  return ids.map(npcId => <IslandNpcActor key={`${zoneId}:${npcId}`} npcId={npcId} zoneId={zoneId} motionPaused={motionPaused} />);
}
