'use client';

import { create } from 'zustand';
import { createInitialExpeditionState } from '../game-core/save';
import { evaluateCollectionAttempt } from '../utils/expeditionSystems';
import { getThreeInitialNarration, getThreeIslandLocation, getThreeSpecimens, threeTools } from './data';
import { currentZoneId, getTravelCardForRoute, getZone } from './world/floreanaZones';

const MAX_HEALTH = 100;
const MAX_FATIGUE = 100;
const MAX_CURIOSITY = 100;
const HOURS_PER_DAY = 24;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function advanceTimeState(state, minutes) {
  const totalHours = state.timeOfDay + minutes / 60;
  const dayDelta = Math.floor(totalHours / HOURS_PER_DAY);
  return {
    timeOfDay: ((totalHours % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY,
    day: state.day + dayDelta,
  };
}

function makeJournalEntry({ specimen, tool, result, documented = false, location }) {
  const condition = documented ? 'documented in field' : result.outcomeType.replace(/_/g, ' ');
  return {
    id: `${Date.now()}-${specimen.id}`,
    specimenId: specimen.id,
    specimenName: specimen.name,
    latin: specimen.latin,
    location: location.name,
    method: tool.name,
    condition,
    content: `${specimen.name}: ${result.reason}`,
    createdAt: new Date().toISOString(),
  };
}

function createExpeditionSlice() {
  const expedition = createInitialExpeditionState();
  return {
    schemaVersion: expedition.schemaVersion,
    seed: expedition.seed,
    health: expedition.health,
    fatigue: expedition.fatigue,
    curiosity: 20,
    activeToolId: 'hands',
    inventory: expedition.inventory,
    journal: expedition.journal,
    collectedSpecimenIds: expedition.collectedSpecimenIds,
    documentedSpecimenIds: expedition.documentedSpecimenIds,
    currentZoneId: expedition.currentZoneId,
    currentLocalCellId: expedition.currentLocalCellId,
    playerSpawnId: expedition.playerSpawnId,
    visitedZoneIds: expedition.visitedZoneIds,
    visitedLocalCellIds: expedition.visitedLocalCellIds,
    timeOfDay: expedition.timeMinutes / 60,
    day: expedition.day,
    questComplete: false,
  };
}

function createSceneSlice() {
  const initialNarration = getThreeInitialNarration(currentZoneId);
  return {
    selectedSpecimenId: null,
    nearbySpecimenId: null,
    message: initialNarration.narration,
    educationalNote: initialNarration.educationalNote,
    weather: initialNarration.weather,
    sounds: initialNarration.sounds,
    viewMode: 'shoulder',
    transition: null,
    edgePrompt: null,
    lastOutcome: null,
    physicsDebug: null,
    pushableObstacleOffsets: {},
    playerPose: {
      position: { x: 0, y: 0, z: 0 },
      facing: { x: 0, y: 0, z: -1 },
    },
    carryPrompt: null,
    carriedObjectId: null,
    symsLine: 'Syms waits with labels, twine, and a doubtful look at your boots.',
  };
}

export const useThreeGameStore = create((set, get) => ({
  ...createExpeditionSlice(),
  ...createSceneSlice(),

  setActiveTool: activeToolId => set({ activeToolId }),
  setNearbySpecimen: nearbySpecimenId => set({ nearbySpecimenId }),
  setSelectedSpecimen: selectedSpecimenId => set({ selectedSpecimenId }),
  setPhysicsDebug: physicsDebug => set({ physicsDebug }),
  setEdgePrompt: edgePrompt => set({ edgePrompt }),
  setPlayerPose: playerPose => set({ playerPose }),
  setCarryPrompt: carryPrompt => set(state => (
    (state.carryPrompt?.id || null) === (carryPrompt?.id || null)
      && state.carryPrompt?.mode === carryPrompt?.mode
      && state.carryPrompt?.text === carryPrompt?.text
      && Math.abs((state.carryPrompt?.distance ?? 0) - (carryPrompt?.distance ?? 0)) < 0.08
      ? {}
      : { carryPrompt }
  )),
  setCarriedObject: carriedObjectId => set({ carriedObjectId }),
  movePushableObstacle: (obstacleId, delta, zoneId = get().currentZoneId) => set(state => {
    const key = `${zoneId}:${obstacleId}`;
    const current = state.pushableObstacleOffsets[key] || { x: 0, z: 0 };
    return {
      pushableObstacleOffsets: {
        ...state.pushableObstacleOffsets,
        [key]: {
          x: current.x + (delta?.x || 0),
          z: current.z + (delta?.z || 0),
        },
      },
    };
  }),
  advanceTime: minutes => set(state => advanceTimeState(state, minutes)),

  beginZoneTransition: (zoneId, options = {}) => {
    const zone = getZone(zoneId);
    const currentZone = getZone(get().currentZoneId);
    const travelCard = getTravelCardForRoute(currentZone.id, zone.id);
    set({
      transition: {
        zoneId: zone.id,
        entryEdge: options.entryEdge || null,
        from: currentZone.name,
        to: zone.name,
        travelCard,
        subtitle: zone.subtitle,
        island: zone.island,
        note: options.note || travelCard?.description || zone.loadingNote,
        educationalNote: zone.educationalNote,
        minutes: travelCard?.estimatedMinutes || 0,
        fatigue: travelCard?.fatigueDelta || 0,
        startedAt: Date.now(),
        progress: 0,
      },
    });
  },

  completeZoneTransition: () => set(state => {
    if (!state.transition) return {};
    const zone = getZone(state.transition.zoneId);
    const nextLocalCellId = zone.defaultLocalCellId || state.currentLocalCellId;
    return {
      currentZoneId: zone.id,
      currentLocalCellId: nextLocalCellId,
      visitedZoneIds: state.visitedZoneIds.includes(zone.id)
        ? state.visitedZoneIds
        : [...state.visitedZoneIds, zone.id],
      visitedLocalCellIds: state.visitedLocalCellIds.includes(nextLocalCellId)
        ? state.visitedLocalCellIds
        : [...state.visitedLocalCellIds, nextLocalCellId],
      transition: null,
      edgePrompt: null,
      pushableObstacleOffsets: state.pushableObstacleOffsets,
      carryPrompt: null,
      carriedObjectId: null,
      selectedSpecimenId: null,
      nearbySpecimenId: null,
      message: zone.loadingNote || state.message,
      educationalNote: zone.educationalNote || state.educationalNote,
      weather: zone.weather || state.weather,
      sounds: Array.isArray(zone.sounds) ? zone.sounds : state.sounds,
      playerSpawnId: state.transition.entryEdge || 'default',
      fatigue: clamp(state.fatigue + (state.transition.fatigue || 0), 0, MAX_FATIGUE),
      ...advanceTimeState(state, state.transition.minutes || 0),
    };
  }),

  cycleViewMode: () => set(state => ({
    viewMode: state.viewMode === 'shoulder' ? 'first' : state.viewMode === 'first' ? 'top' : 'shoulder',
  })),

  applyMovementCost: ({ running = false, walking = false, airborne = false, falling = 0, fatigueDelta = null } = {}) => set(state => ({
    fatigue: clamp(state.fatigue + (fatigueDelta ?? ((running ? 0.026 : walking ? 0.008 : 0) + (airborne ? 0.004 : 0))), 0, MAX_FATIGUE),
    health: clamp(state.health - Math.max(0, falling - 7.5) * 1.25, 0, MAX_HEALTH),
  })),

  rest: () => set(state => ({
    ...advanceTimeState(state, 120),
    fatigue: clamp(state.fatigue - 18, 0, MAX_FATIGUE),
    health: clamp(state.health + 6, 0, MAX_HEALTH),
    message: 'You rest for two hours in a strip of shade while Syms reorders the collecting bag.',
    educationalNote: 'Fieldwork depended on pacing: heat, daylight, and fatigue changed what a naturalist could safely collect.',
  })),

  applyNarration: data => set({
    message: data.narration || get().message,
    educationalNote: data.educationalNote || get().educationalNote,
    weather: data.weather || get().weather,
    sounds: Array.isArray(data.sounds) ? data.sounds.slice(0, 3) : get().sounds,
  }),

  collectNearby: async () => {
    const state = get();
    const specimenId = state.nearbySpecimenId || state.selectedSpecimenId;
    const zoneSpecimens = getThreeSpecimens(state.currentZoneId);
    const specimen = zoneSpecimens.find(item => item.id === specimenId);
    const tool = threeTools.find(item => item.id === state.activeToolId) || threeTools.find(item => item.id === 'hands');
    if (!specimen || state.collectedSpecimenIds.includes(specimen.id)) return null;

    const islandLocation = getThreeIslandLocation(state.currentZoneId);
    const documented = tool.id === 'sketch';
    const result = documented
      ? {
          success: false,
          reason: `You document the ${specimen.name} carefully without removing it from its habitat.`,
          outcomeType: 'documented',
          evidence: 'field sketch and behavior note',
          damage: 0,
          scoreDelta: 1,
          fatigueDelta: 1,
        }
      : evaluateCollectionAttempt({
          specimen,
          method: tool,
          approach: 'careful quiet patient field collection',
          location: islandLocation,
          fatigue: state.fatigue,
          gameTime: Math.round(state.timeOfDay * 60),
          seed: state.seed,
        });

    const entry = makeJournalEntry({ specimen, tool, result, documented, location: islandLocation });
    const collected = result.success && !documented;

    set(current => ({
      fatigue: clamp(current.fatigue + result.fatigueDelta, 0, MAX_FATIGUE),
      curiosity: clamp(current.curiosity + (documented ? 10 : result.scoreDelta * 5), 0, MAX_CURIOSITY),
      inventory: collected ? [...current.inventory, { ...specimen, condition: result.outcomeType }] : current.inventory,
      journal: [...current.journal, entry],
      collectedSpecimenIds: collected ? [...current.collectedSpecimenIds, specimen.id] : current.collectedSpecimenIds,
      documentedSpecimenIds: documented && !current.documentedSpecimenIds.includes(specimen.id)
        ? [...current.documentedSpecimenIds, specimen.id]
        : current.documentedSpecimenIds,
      questComplete: current.questComplete || collected || documented,
      lastOutcome: { specimen, tool, result, documented },
      message: result.reason,
      educationalNote: documented
        ? 'Observation without collection was often the least damaging way to preserve locality and behavior evidence.'
        : 'Specimen condition, collection method, and locality determine scientific usefulness.',
      symsLine: collected
        ? `Syms wraps the ${specimen.name} label twice. "That one will travel, sir."`
        : `Syms peers over your shoulder. "A note is better than a ruined specimen, sir."`,
    }));

    try {
      const response = await fetch('/api/three-narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: documented ? 'journal' : 'collection',
          location: islandLocation.name,
          specimenId: specimen.id,
          toolId: tool.id,
          outcome: result.outcomeType,
          stats: {
            health: get().health,
            fatigue: get().fatigue,
            curiosity: get().curiosity,
          },
          journalContext: entry.content,
        }),
      });
      if (response.ok) get().applyNarration(await response.json());
    } catch {
      // Keep deterministic local outcome if narration is unavailable.
    }

    return result;
  },
}));
