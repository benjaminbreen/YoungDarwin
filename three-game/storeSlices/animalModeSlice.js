// Finch and tortoise play: actions, NPC reactions and droppings.
// Spread into useThreeGameStore in three-game/store.js.

import { INITIAL_PLAYER_POSE, gameMinutesForState, threeRuntimeState } from './shared';
import { appendNarratorEvents, narrationPayloadToEvents } from '../narrator/narratorEvents';
import { clampToWalkable, terrainHeight } from '../world/terrain';
import { getPlayableMode } from '../playable/playableModes';

export const createAnimalModeActions = set => ({
  recordAnimalModeNpcEncounter: encounter => set(state => {
    const mode = getPlayableMode(state.playableModeId);
    if (mode.kind !== 'animal') return {};
    const animalName = mode.label.toLowerCase();
    const message = encounter?.message
      || `Darwin crouches near the ${animalName}, notebook open, and considers whether it belongs in the collecting bag.`;
    return {
      animalModeNpcEncounter: {
        ...encounter,
        modeId: mode.id,
        modeLabel: mode.label,
        at: Date.now(),
      },
      message,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        educationalNote: encounter?.educationalNote || 'In animal modes, Darwin becomes part of the island ecology: an observer, a collector, and eventually a risk to avoid.',
      }, state, 'scripted', { timeOfDay: state.timeOfDay, day: state.day })),
    };
  }),
  recordAnimalModeAction: (payload = {}) => set(state => {
    const mode = getPlayableMode(state.playableModeId);
    if (mode.kind !== 'animal') return {};
    const actionId = payload.actionId || payload.id || 'unknown';
    const current = state.animalModeStats?.[mode.id] || {};
    const actions = current.actions || {};
    const previous = actions[actionId] || {};
    const foodLabel = actionId === 'eat'
      ? (payload.foodLabel || previous.foodLabel || (mode.id === 'tortoise' ? 'low leaves and ground herbs' : 'dry seeds and small shoots'))
      : previous.foodLabel;
    const forage = payload.forage || null;
    // The HUD's Energy bar is 100 - fatigue, and movement drains it for
    // animals just as for Darwin — so sleep and food must refill it or the
    // mode has a resource with no recovery. Real forage (which is finite and
    // per-patch) restores much more than idle grazing.
    const clampStat = value => Math.max(0, Math.min(100, value));
    let statPatch = {};
    if (actionId === 'sleep') {
      statPatch = { fatigue: clampStat((state.fatigue || 0) - 25) };
    } else if (actionId === 'eat') {
      const nutrition = forage ? Number(forage.nutrition) || 0 : 0;
      const recovered = forage ? 6 + nutrition * 6 : 3;
      statPatch = {
        fatigue: clampStat((state.fatigue || 0) - recovered),
        ...(forage ? { health: clampStat((state.health || 0) + 2) } : {}),
      };
    }
    return {
      ...statPatch,
      animalModeStats: {
        ...(state.animalModeStats || {}),
        [mode.id]: {
          ...current,
          modeId: mode.id,
          updatedAtRealMs: Date.now(),
          lastActionId: actionId,
          actions: {
            ...actions,
            [actionId]: {
              ...previous,
              count: (previous.count || 0) + 1,
              lastAt: gameMinutesForState(state),
              lastDay: state.day || 1,
              lastZoneId: state.currentZoneId,
              ...(foodLabel ? { foodLabel } : {}),
              ...(forage ? {
                lastForage: {
                  forageId: forage.forageId || null,
                  sourceKind: forage.sourceKind || null,
                  layerId: forage.layerId || null,
                  itemId: forage.itemId || null,
                  zoneId: forage.zoneId || state.currentZoneId,
                  label: forage.label || forage.foodLabel || foodLabel,
                },
                foragedCount: (previous.foragedCount || 0) + 1,
              } : {}),
            },
          },
        },
      },
    };
  }),
  setAnimalModeDarwinNpcPose: pose => set(state => {
    if (!pose) {
      return state.animalModeDarwinNpcPose ? { animalModeDarwinNpcPose: null } : state;
    }
    const previous = state.animalModeDarwinNpcPose;
    const next = {
      zoneId: pose.zoneId || state.currentZoneId,
      x: Number(pose.x) || 0,
      y: Number(pose.y) || 0,
      z: Number(pose.z) || 0,
      yaw: Number(pose.yaw) || 0,
      at: Date.now(),
    };
    if (
      previous
      && previous.zoneId === next.zoneId
      && Math.abs(previous.x - next.x) < 0.06
      && Math.abs(previous.y - next.y) < 0.04
      && Math.abs(previous.z - next.z) < 0.06
      && Math.abs(previous.yaw - next.yaw) < 0.04
    ) return state;
    return { animalModeDarwinNpcPose: next };
  }),
  addAnimalDropping: (payload = {}) => set(state => {
    const zoneId = payload.zoneId || state.currentZoneId;
    const source = payload.position || state.playerPose?.position || threeRuntimeState.playerPose.position || INITIAL_PLAYER_POSE.position;
    const rawX = Number(source.x);
    const rawZ = Number(source.z);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawZ)) return {};
    const falling = payload.status === 'falling';
    const safe = falling ? { x: rawX, z: rawZ } : clampToWalkable({ x: rawX, y: 0, z: rawZ }, null, zoneId);
    const rawY = Number(source.y);
    const y = Number.isFinite(rawY)
      ? Number(source.y)
      : terrainHeight(safe.x, safe.z, zoneId) + 0.026;
    const nowRealMs = Date.now();
    const sourceModeId = payload.sourceModeId || state.playableModeId || null;
    const dropping = {
      id: payload.id || `dropping-${zoneId}-${state.day || 1}-${gameMinutesForState(state)}-${Math.round(safe.x * 100)}-${Math.round(safe.z * 100)}-${nowRealMs}`,
      zoneId,
      sourceModeId,
      kind: payload.kind || (sourceModeId === 'finch' ? 'bird' : 'animal'),
      position: { x: safe.x, y, z: safe.z },
      velocity: payload.velocity ? {
        x: Number(payload.velocity.x) || 0,
        y: Number(payload.velocity.y) || 0,
        z: Number(payload.velocity.z) || 0,
      } : null,
      yaw: Number(payload.yaw) || 0,
      radius: Number(payload.radius) || 0.24,
      status: payload.status || 'fresh',
      stuckTo: payload.stuckTo || null,
      impact: payload.impact || null,
      createdAt: gameMinutesForState(state),
      createdDay: state.day || 1,
      createdAtRealMs: nowRealMs,
      smushedAtRealMs: null,
      smushCount: 0,
      seed: Number(payload.seed) || Math.abs(Math.sin((safe.x * 12.9898) + (safe.z * 78.233)) * 43758.5453),
    };
    const next = [
      ...(state.animalDroppings || []).filter(item => item.id !== dropping.id),
      dropping,
    ];
    return { animalDroppings: next.slice(-80) };
  }),
  settleAnimalDropping: (droppingId, payload = {}) => set(state => {
    let changed = false;
    const next = (state.animalDroppings || []).map(item => {
      if (item.id !== droppingId) return item;
      changed = true;
      const nextYaw = Number(payload.yaw);
      const nextRadius = Number(payload.radius);
      return {
        ...item,
        status: payload.status || 'splat',
        position: payload.position || item.position,
        velocity: null,
        yaw: Number.isFinite(nextYaw) ? nextYaw : (item.yaw || 0),
        radius: Number.isFinite(nextRadius) ? nextRadius : item.radius,
        stuckTo: payload.stuckTo || null,
        impact: payload.impact || null,
        landedAtRealMs: Date.now(),
      };
    });
    if (!changed) return {};
    const darwinHit = payload.stuckTo?.type === 'darwin';
    return {
      animalDroppings: next,
      ...(darwinHit ? {
        message: 'A pale finch dropping lands squarely on Darwin. For once, the naturalist is the specimen under observation.',
        animalModeNpcEncounter: {
          ...(state.animalModeNpcEncounter || {}),
          type: 'finch-dropping-hit',
          modeId: 'finch',
          modeLabel: 'Finch',
          at: Date.now(),
          npcPosition: payload.position || null,
          message: 'A pale finch dropping lands squarely on Darwin. For once, the naturalist is the specimen under observation.',
        },
      } : {}),
    };
  }),
  smushAnimalDropping: (droppingId, payload = {}) => set(state => {
    let changed = false;
    const next = (state.animalDroppings || []).map(item => {
      if (item.id !== droppingId || item.status === 'smushed') return item;
      changed = true;
      return {
        ...item,
        status: 'smushed',
        smushedAtRealMs: Date.now(),
        smushedBy: payload.by || state.playableModeId || 'player',
        smushCount: (item.smushCount || 0) + 1,
      };
    });
    return changed ? { animalDroppings: next } : {};
  }),
});
