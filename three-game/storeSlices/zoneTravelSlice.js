// Region-to-region travel and its fade phases.
// Spread into useThreeGameStore in three-game/store.js.

import { INCAPACITATION_RECOVERY_FATIGUE, INCAPACITATION_RECOVERY_HEALTH } from '../expeditionOutcomes';
import {
  MAX_FATIGUE,
  advanceTimeState,
  clamp,
  threeRuntimeState,
} from './shared';
import {
  SCRIPTED_NARRATION_COOLDOWN_MINUTES,
  appendNarratorEvents,
  gameClockMinutes,
  narrationPayloadToEvents,
} from '../narrator/narratorEvents';
import { darwinThought, zoneNarration } from '../narrator/narratorContent';
import { emitPropEvent } from '../physics/props/propEvents';
import { getRegionWeather, tickWeatherSim } from '../world/weatherDirector';
import { getTravelCardForRoute, getZone } from '../world/floreanaZones';
import { isInteriorZone } from '../interiors/interiorRegistry';
import { normalizeWeatherState } from '../world/weatherStates';
import { symsZoneAfterTransition } from '../npcs/symsCompanion';
import { travelFlavorLine } from '../../data/travelFlavor';

export const createZoneTravelActions = (set, get) => ({
  beginZoneTransition: (zoneId, options = {}) => {
    const zone = getZone(zoneId);
    const currentZone = getZone(get().currentZoneId);
    const routeTravelCard = getTravelCardForRoute(currentZone.id, zone.id);
    const travelCard = options.travelCard
      ? { ...(routeTravelCard || {}), ...options.travelCard }
      : routeTravelCard;
    const optionMinutes = Number(options.minutes);
    const optionFatigue = Number(options.fatigue);
    const minutes = Number.isFinite(optionMinutes) ? optionMinutes : travelCard?.estimatedMinutes || 0;
    const fatigue = Number.isFinite(optionFatigue) ? optionFatigue : travelCard?.fatigueDelta || 0;
    const transitionId = `${currentZone.id}:${zone.id}:${Date.now()}`;
    const source = options.source || 'edge';
    const mode = options.mode || (options.localTransition ? 'threshold' : 'island');
    set({
      transition: {
        id: transitionId,
        fromZoneId: currentZone.id,
        zoneId: zone.id,
        mode,
        source,
        phase: source === 'island-map' ? 'chart' : 'departing',
        phaseStartedAt: Date.now(),
        entryEdge: options.entryEdge || null,
        from: currentZone.name,
        to: zone.name,
        travelCard,
        subtitle: zone.subtitle,
        island: zone.island,
        note: options.note
          || travelFlavorLine(currentZone.id, zone.id)
          || travelCard?.description
          || zone.loadingNote,
        educationalNote: options.educationalNote || travelCard?.educationalNote || zone.educationalNote,
        minutes,
        fatigue,
        startedAt: Date.now(),
        committedAt: null,
        readyAt: null,
        arrivingAt: null,
        viewSnapshot: {
          viewMode: get().viewMode,
        },
      },
      beagleTravelPrompt: null,
      inspectedObject: null,
      inspectedScreenPosition: null,
      readableBookSession: null,
      interiorPrompt: null,
    });
    if (isInteriorZone(currentZone.id) || isInteriorZone(zone.id)) {
      emitPropEvent('fieldwork-foley', {
        kind: 'door',
        fromZoneId: currentZone.id,
        toZoneId: zone.id,
        position: get().playerPose?.position || threeRuntimeState.playerPose.position,
      });
    }
  },

  setZoneTransitionPhase: (phase, transitionId = null) => set(state => {
    if (!state.transition || (transitionId && state.transition.id !== transitionId)) return {};
    const now = Date.now();
    return {
      transition: {
        ...state.transition,
        phase,
        phaseStartedAt: now,
        ...(phase === 'ready' ? { readyAt: now } : {}),
        ...(phase === 'arriving' ? { arrivingAt: state.transition.arrivingAt || now } : {}),
      },
    };
  }),

  commitZoneTransition: (transitionId = null) => set(state => {
    if (!state.transition) return {};
    if (transitionId && state.transition.id !== transitionId) return {};
    if (state.transition.committedAt) return {};
    const zone = getZone(state.transition.zoneId);
    const nextLocalCellId = zone.defaultLocalCellId || state.currentLocalCellId;
    // Advance the island weather sim through the travel time, then arrive
    // under whatever sky the destination region currently has.
    const arrival = advanceTimeState(state, state.transition.minutes || 0);
    tickWeatherSim((arrival.day || 1) * 1440 + arrival.timeOfDay * 60);
    const arrivalWeather = normalizeWeatherState(getRegionWeather(zone.id) || zone.weather, state.weather);
    const arrivalState = { ...state, ...arrival, currentZoneId: zone.id, weather: arrivalWeather };
    const scripted = zoneNarration(zone, arrivalState);
    const thoughtKey = `thought:${zone.id}:arrival`;
    const nowMinutes = gameClockMinutes(arrivalState);
    const thoughtSeen = state.narratorScriptedKeys[thoughtKey];
    const thought = (!Number.isFinite(thoughtSeen) || nowMinutes - thoughtSeen >= SCRIPTED_NARRATION_COOLDOWN_MINUTES)
      ? darwinThought({ zone, weather: arrivalWeather, timeOfDay: arrival.timeOfDay })
      : null;
    const zoneKey = `zone:${zone.id}`;
    const recovering = state.transition.source === 'incapacitation-recovery';
    const recoveryMessage = 'You wake in your berth aboard HMS Beagle, weak but alive. The expedition has been cut short for the day.';
    const recoveryLine = '"Easy now, sir. The island will still be there when you are fit to meet it."';
    return {
      currentZoneId: zone.id,
      symsZoneId: symsZoneAfterTransition({
        directive: state.symsDirective,
        playableModeId: state.playableModeId,
        destinationZoneId: zone.id,
        symsZoneId: state.symsZoneId,
      }),
      currentLocalCellId: nextLocalCellId,
      visitedZoneIds: state.visitedZoneIds.includes(zone.id)
        ? state.visitedZoneIds
        : [...state.visitedZoneIds, zone.id],
      visitedLocalCellIds: state.visitedLocalCellIds.includes(nextLocalCellId)
        ? state.visitedLocalCellIds
        : [...state.visitedLocalCellIds, nextLocalCellId],
      transition: {
        ...state.transition,
        phase: 'mounting',
        phaseStartedAt: Date.now(),
        committedAt: Date.now(),
      },
      edgePrompt: null,
      fieldAction: null,
      observationMode: false,
      contextPrompt: null,
      contextPromptCandidates: {},
      beagleTravelPrompt: null,
      dismissedEdgePromptId: null,
      arrivalEdgeBlock: state.transition.entryEdge
        ? {
          zoneId: zone.id,
          edge: state.transition.entryEdge,
          clearance: 10,
        }
        : null,
      pushableObstacleOffsets: state.pushableObstacleOffsets,
      carryPrompt: null,
      carriedObjectId: null,
      carryDropRequest: null,
      selectedSpecimenId: null,
      nearbySpecimenId: null,
      nearbyNpcEncounter: null,
      activeNpcEncounter: null,
      nearbyItem: null,
      examineSession: null,
      readableBookSession: null,
      interiorPrompt: null,
      message: recovering ? recoveryMessage : (scripted?.narration || zone.loadingNote || state.message),
      educationalNote: recovering
        ? 'Darwin\'s shore work depended on companions, boats, and shipboard routines that made recovery possible.'
        : (scripted?.educationalNote || zone.educationalNote || state.educationalNote),
      weather: arrivalWeather,
      weatherOverride: null,
      sounds: Array.isArray(zone.sounds) ? zone.sounds : state.sounds,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: recovering ? recoveryMessage : (scripted?.narration || zone.loadingNote),
        symsLine: recovering ? recoveryLine : null,
        darwinThought: recovering ? null : thought,
      }, arrivalState, recovering ? 'recovery' : 'scripted-zone', { allowThought: !recovering && Boolean(thought) })),
      narratorScriptedKeys: {
        ...state.narratorScriptedKeys,
        [zoneKey]: nowMinutes,
        ...(thought ? { [thoughtKey]: nowMinutes } : {}),
      },
      playerSpawnId: state.transition.entryEdge || 'default',
      fatigue: clamp(state.fatigue + (state.transition.fatigue || 0), 0, MAX_FATIGUE),
      ...arrival,
      ...(recovering ? {
        health: INCAPACITATION_RECOVERY_HEALTH,
        fatigue: INCAPACITATION_RECOVERY_FATIGUE,
        minutesSinceMeal: 0,
        expeditionOutcome: null,
        activeConstraint: null,
        majorEvent: null,
        symsLine: recoveryLine,
      } : {}),
    };
  }),

  finishZoneTransition: (transitionId = null) => set(state => {
    if (!state.transition || (transitionId && state.transition.id !== transitionId)) return {};
    return { transition: null };
  }),

  // Automation and direct-zone launch paths need a synchronous escape hatch.
  // Player-facing travel uses commitZoneTransition + finishZoneTransition so
  // the cover remains mounted until the destination is actually ready.
  completeZoneTransition: () => {
    const transitionId = get().transition?.id;
    if (!transitionId) return;
    get().commitZoneTransition(transitionId);
    get().finishZoneTransition(transitionId);
  },
});
