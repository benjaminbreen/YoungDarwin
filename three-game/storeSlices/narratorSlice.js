// Narrator responses and typed narrator commands.
// Spread into useThreeGameStore in three-game/store.js.

import { DEFAULT_PLAYABLE_MODE_ID } from '../playable/playableModes';
import {
  appendNarratorEvents,
  createNarratorEvent,
  narrationPayloadToEvents,
  shouldAllowLlmThought,
  textHash,
} from '../narrator/narratorEvents';
import {
  describeNarratorError,
  fetchWithTimeout,
  findRuntimeSpecimen,
  narratorSessionId,
  nearbyPeopleContext,
  playerHeading,
  recentNarrationContext,
  threeRuntimeState,
} from './shared';
import { getThreeIslandLocation, threeTools } from '../data';
import { getZone } from '../world/floreanaZones';
import { isEndGameNarratorCommand } from '../finalAssessment';
import { localNarratorFallback } from '../narrator/narratorContent';
import { narratorRequestsAllowed } from '../ai/generativePolicy';
import { normalizeWeatherState } from '../world/weatherStates';

export const createNarratorActions = (set, get) => ({
  applyNarration: (data, options = {}) => set(state => {
    const allowThought = options.allowThought ?? shouldAllowLlmThought(data, options.playerInput || '', state);
    const narratedWeather = data.weather ? normalizeWeatherState(data.weather, null) : null;
    return {
      message: data.narration || state.message,
      educationalNote: state.educationalNote,
      weather: narratedWeather || state.weather,
      // Hold narration weather for ~90 game minutes before the island
      // simulation takes the sky back.
      weatherOverride: narratedWeather
        ? { state: narratedWeather, untilMinutes: (state.day || 1) * 1440 + state.timeOfDay * 60 + 90 }
        : state.weatherOverride,
      sounds: Array.isArray(data.sounds) ? data.sounds.slice(0, 3) : state.sounds,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents(data, state, data.source || 'llm', {
        allowThought,
      })),
    };
  }),

  submitNarratorCommand: async input => {
    const trimmed = String(input || '').trim();
    if (!trimmed) return null;

    const isHelp = /^(?:hotkeys?|controls?|commands?|help)$/i.test(trimmed);
    const isEndingExpedition = isEndGameNarratorCommand(trimmed);
    let requestState = null;
    set(state => {
      requestState = state;
      const assessmentSpecimen = !isHelp && !isEndingExpedition
        ? findRuntimeSpecimen(state, state.nearbySpecimenId || state.selectedSpecimenId)
        : null;
      const assessmentZone = !isHelp && !isEndingExpedition ? getZone(state.currentZoneId) : null;
      const assessmentLocation = !isHelp && !isEndingExpedition
        ? getThreeIslandLocation(state.currentZoneId)
        : null;
      const symsNearby = state.nearbyNpcEncounter?.npcId === 'syms_covington' || (assessmentZone
        ? nearbyPeopleContext(state, assessmentZone).some(person => person.startsWith('Syms Covington is close by'))
        : false);
      const playerEntry = createNarratorEvent({
        kind: 'player',
        text: trimmed,
        day: state.day,
        timeOfDay: state.timeOfDay,
        source: 'player',
      });
      const hotkeysEntry = isHelp
        ? createNarratorEvent({
            kind: 'hotkeys',
            text: 'The narrator opens the command list.',
            day: state.day,
            timeOfDay: state.timeOfDay,
            source: 'local',
          })
        : null;
      return {
        narratorLog: appendNarratorEvents(state.narratorLog, [playerEntry, hotkeysEntry]),
        assessmentPlayerTranscript: !isHelp && !isEndingExpedition
          ? [...(state.assessmentPlayerTranscript || []), {
              id: playerEntry.id,
              text: trimmed.slice(0, 2000),
              day: state.day,
              timeOfDay: state.timeOfDay,
              zoneId: state.currentZoneId,
              locationName: assessmentLocation?.name || assessmentZone?.name || '',
              specimenId: assessmentSpecimen?.id || null,
              specimenName: assessmentSpecimen?.name || null,
              activeToolId: state.activeToolId || null,
              symsNearby,
              createdAt: Date.now(),
            }].slice(-64)
          : (state.assessmentPlayerTranscript || []),
        narratorPending: isHelp ? state.narratorPending : !isEndingExpedition,
        narratorError: null,
      };
    });

    if (isHelp) return { local: true };
    if (isEndingExpedition) return get().beginFinalAssessment();

    const state = requestState || get();
    const zone = getZone(state.currentZoneId);
    const islandLocation = getThreeIslandLocation(state.currentZoneId);
    const nearbySpecimen = findRuntimeSpecimen(state, state.nearbySpecimenId || state.selectedSpecimenId);
    const tool = threeTools.find(item => item.id === state.activeToolId);
    const nearbyPeople = nearbyPeopleContext(state, zone);
    const pose = state.playerPose || threeRuntimeState.playerPose;
    const recentNarration = recentNarrationContext(state.narratorLog);
    const idempotencyKey = [
      state.seed || 'three',
      state.playableModeId || DEFAULT_PLAYABLE_MODE_ID,
      state.currentZoneId,
      state.day,
      Math.round((state.timeOfDay || 0) * 60),
      state.activeConstraint?.type || 'free',
      textHash(trimmed),
    ].join(':');

    if (!narratorRequestsAllowed()) {
      const data = localNarratorFallback({
        input: trimmed,
        nearbySpecimen,
        playableModeId: state.playableModeId,
      });
      set({ narratorPending: false, narratorError: null });
      get().applyNarration({ ...data, source: 'authored' }, {
        playerInput: trimmed,
        allowThought: false,
      });
      return data;
    }

    try {
      const response = await fetchWithTimeout('/api/three-narrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-young-darwin-session': narratorSessionId(state.seed),
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          eventType: 'player_action',
          playableModeId: state.playableModeId,
          playerInput: trimmed,
          objective: state.questComplete
            ? 'Quest complete: return to Syms with specimen evidence.'
            : 'Collect or document one animal, plant, or mineral sample.',
          location: islandLocation.name || zone.name,
          locationContext: {
            id: zone.id,
            localCellId: state.currentLocalCellId,
            island: zone.island,
            historicalName: zone.historicalName,
            biome: zone.biome,
            description: zone.loadingNote || zone.description || islandLocation.subtitle || '',
            discoveries: zone.discoveries || [],
            notableFeatures: zone.notableFeatures || [],
          },
          specimenId: nearbySpecimen?.id || null,
          npcId: nearbyPeople.some(item => item.includes('Syms Covington')) ? 'syms_covington' : null,
          nearbyPeople,
          toolId: tool?.id || state.activeToolId || 'hands',
          weather: state.weather,
          timeOfDay: `${Math.floor(state.timeOfDay || 0)}:${String(Math.floor(((state.timeOfDay || 0) % 1) * 60)).padStart(2, '0')}`,
          day: state.day,
          stats: {
            health: state.health,
            fatigue: state.fatigue,
          },
          playerPose: {
            x: Number.isFinite(Number(pose?.position?.x)) ? Number(pose.position.x).toFixed(1) : null,
            z: Number.isFinite(Number(pose?.position?.z)) ? Number(pose.position.z).toFixed(1) : null,
            heading: playerHeading(pose),
          },
          recentNarration,
          journalContext: state.journal?.at(-1)?.content || '',
          idempotencyKey,
        }),
      });
      const data = response.ok
        ? await response.json()
        : localNarratorFallback({ input: trimmed, nearbySpecimen, playableModeId: state.playableModeId });
      set({
        narratorPending: false,
        narratorError: data?.fallback ? 'Narration fell back to a local response.' : null,
      });
      get().applyNarration(data, { playerInput: trimmed });
      return data;
    } catch (error) {
      const fallback = localNarratorFallback({
        input: trimmed,
        nearbySpecimen,
        playableModeId: state.playableModeId,
      });
      set({
        narratorPending: false,
        narratorError: describeNarratorError(error),
      });
      get().applyNarration(fallback, { playerInput: trimmed, allowThought: false });
      return fallback;
    }
  },
});
