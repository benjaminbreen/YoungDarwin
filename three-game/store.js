'use client';

import { create } from 'zustand';
import { evaluateCollectionAttempt } from '../utils/expeditionSystems';
import { islandLocation, initialNarration, threeSpecimens, threeTools } from './data';
import { currentZoneId, getZone } from './world/floreanaZones';

const MAX_HEALTH = 100;
const MAX_FATIGUE = 100;
const MAX_CURIOSITY = 100;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeJournalEntry({ specimen, tool, result, documented = false }) {
  const condition = documented ? 'documented in field' : result.outcomeType.replace(/_/g, ' ');
  return {
    id: `${Date.now()}-${specimen.id}`,
    specimenId: specimen.id,
    specimenName: specimen.name,
    latin: specimen.latin,
    location: islandLocation.name,
    method: tool.name,
    condition,
    content: `${specimen.name}: ${result.reason}`,
    createdAt: new Date().toISOString(),
  };
}

export const useThreeGameStore = create((set, get) => ({
  health: MAX_HEALTH,
  fatigue: 4,
  curiosity: 20,
  activeToolId: 'hands',
  selectedSpecimenId: null,
  nearbySpecimenId: null,
  inventory: [],
  journal: [],
  collectedSpecimenIds: [],
  message: initialNarration.narration,
  educationalNote: initialNarration.educationalNote,
  weather: initialNarration.weather,
  sounds: initialNarration.sounds,
  questComplete: false,
  viewMode: 'shoulder',
  currentZoneId,
  transition: null,
  timeOfDay: 7.15,
  lastOutcome: null,
  symsLine: 'Syms waits with labels, twine, and a doubtful look at your boots.',

  setActiveTool: activeToolId => set({ activeToolId }),
  setNearbySpecimen: nearbySpecimenId => set({ nearbySpecimenId }),
  setSelectedSpecimen: selectedSpecimenId => set({ selectedSpecimenId }),
  beginZoneTransition: zoneId => {
    const zone = getZone(zoneId);
    const currentZone = getZone(get().currentZoneId);
    set({
      transition: {
        zoneId: zone.id,
        from: currentZone.name,
        to: zone.name,
        subtitle: zone.subtitle,
        island: zone.island,
        note: zone.loadingNote,
        educationalNote: zone.educationalNote,
        startedAt: Date.now(),
        progress: 0,
      },
    });
  },
  completeZoneTransition: () => set(state => {
    if (!state.transition) return {};
    const zone = getZone(state.transition.zoneId);
    return {
      currentZoneId: zone.id,
      transition: null,
      message: zone.loadingNote || state.message,
      educationalNote: zone.educationalNote || state.educationalNote,
      weather: zone.weather || state.weather,
      sounds: Array.isArray(zone.sounds) ? zone.sounds : state.sounds,
      fatigue: clamp(state.fatigue + (zone.travelCost?.fatigue || 0), 0, MAX_FATIGUE),
      timeOfDay: state.timeOfDay + ((zone.travelCost?.minutes || 0) / 60),
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
    fatigue: clamp(state.fatigue - 18, 0, MAX_FATIGUE),
    health: clamp(state.health + 6, 0, MAX_HEALTH),
    message: 'You pause in a strip of shade while Syms reorders the collecting bag.',
    educationalNote: 'Fieldwork depended on pacing: heat and fatigue changed what a naturalist could safely collect.',
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
    const specimen = threeSpecimens.find(item => item.id === specimenId);
    const tool = threeTools.find(item => item.id === state.activeToolId) || threeTools.find(item => item.id === 'hands');
    if (!specimen || state.collectedSpecimenIds.includes(specimen.id)) return null;

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
          seed: 'three-darwin-v1',
        });

    const entry = makeJournalEntry({ specimen, tool, result, documented });
    const collected = result.success && !documented;

    set(current => ({
      fatigue: clamp(current.fatigue + result.fatigueDelta, 0, MAX_FATIGUE),
      curiosity: clamp(current.curiosity + (documented ? 10 : result.scoreDelta * 5), 0, MAX_CURIOSITY),
      inventory: collected ? [...current.inventory, { ...specimen, condition: result.outcomeType }] : current.inventory,
      journal: [...current.journal, entry],
      collectedSpecimenIds: collected ? [...current.collectedSpecimenIds, specimen.id] : current.collectedSpecimenIds,
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
