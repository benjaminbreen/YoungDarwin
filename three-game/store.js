'use client';

import { create } from 'zustand';
import { ACTION_DURATION, MOVEMENT_FATIGUE } from './components/player/playerConfig';
import { CATASTROPHIC_FALL_SPEED, INCAPACITATION_RECOVERY_ZONE_ID, minutesUntilRecoveryMorning } from './expeditionOutcomes';
import { DEFAULT_DARWIN_TOOLBAR, assignToolbarSlot, moveToolbarSlot as reorderToolbarSlot } from './toolbar';
import {
  FIELD_DILEMMA_CONFIG,
  HOURS_PER_DAY,
  INITIAL_PLAYER_POSE,
  MAX_FATIGUE,
  MAX_HEALTH,
  MINIMAP_HEADING_EPSILON,
  MINIMAP_POSE_EPSILON,
  REST_ANIMATION_MS,
  REST_MINUTES,
  advanceTimeState,
  ambientThoughtPatch,
  blockedToolMessage,
  carryDropRequestId,
  caseFullPatch,
  clamp,
  constraintBlocksTool,
  createExpeditionSlice,
  createSceneSlice,
  findRuntimeSpecimen,
  getRuntimePlayerPose,
  healthDamagePatch,
  narratorSessionId,
  normalizeSupplies,
  recordSpecimenPatch,
  resetThreeRuntimeState,
  specimenWithinSightingRange,
  threeRuntimeState,
  updateRuntimePlayerPose,
} from './storeSlices/shared';
import { FIRST_DIRECTIVE_ID, resolveDirective } from './directives';
import {
  PERSISTED_STRING_ARRAY_FIELDS,
  PERSISTED_TOOLBAR_FIELDS,
  buildSessionSnapshot,
  clearSessionSnapshot,
  isExpeditionFinished,
  isUsableSessionSnapshot,
  sanitizeFieldMeasurements,
  sanitizeAssessmentTranscript,
  sanitizeNpcEncounterState,
  writeSessionSnapshot,
} from './sessionSave';
import {
  SCRIPTED_NARRATION_COOLDOWN_MINUTES,
  appendNarratorEvents,
  createInitialNarratorLog,
  createNarratorEvent,
  gameClockMinutes,
  narrationPayloadToEvents,
  textHash,
} from './narrator/narratorEvents';
import { acknowledgeContextPromptState, clearContextPromptState, publishContextPromptState } from './ui/contextPromptService';
import { applyTranscriptEvaluation, buildFinalAssessmentRecord, buildLocalHenslowAssessment } from './finalAssessment';
import { baseSpecimens } from '../data/specimens';
import { createExamineSession, examinableFromFieldTarget } from './examine/examinables';
import { darwinThought, specimenNarration, zoneNarration } from './narrator/narratorContent';
import { emitPropEvent } from './physics/props/propEvents';
import { encounterAmbientLine } from './encounters/npcEncounters';
import { evaluateCollectionAttempt } from '../utils/expeditionSystems';
import { findPlayableSpawn, getPlayableMode, getPlayableToolbarIds } from './playable/playableModes';
import { generativeRequestsAllowed } from './ai/generativePolicy';
import { getInteriorDefinition } from './interiors/interiorRegistry';
import { getSpecimenRarity } from './rarity';
import {
  getThreeInitialNarration,
  getThreeIslandLocation,
  getThreeSpecimens,
  threeTools,
} from './data';
import { getZone } from './world/floreanaZones';
import { inventoryItems } from '../data/inventoryItems';
import { normalizeWeatherState } from './world/weatherStates';
import { restFlavor } from './restFlavor';
import { sameFieldAction } from './fieldActions';
import { createShotgunActions } from './storeSlices/shotgunSlice';
import { createWarinessActions } from './storeSlices/warinessSlice';
import { sanitizeWildlifeWariness } from './wildlife/wariness';
import { createNpcActions } from './storeSlices/npcSlice';
import { createLibraryActions } from './storeSlices/librarySlice';
import { createCaseActions } from './storeSlices/caseSlice';
import { createFieldCollectionActions } from './storeSlices/fieldCollectionSlice';
import { createAnimalModeActions } from './storeSlices/animalModeSlice';
import { createExamineActions } from './storeSlices/examineSlice';
import { createZoneTravelActions } from './storeSlices/zoneTravelSlice';
import { createNarratorActions } from './storeSlices/narratorSlice';

// Counts collection attempts this session so a retry rolls afresh.
let collectionAttemptSerial = 0;
const nextCollectionAttempt = () => {
  collectionAttemptSerial += 1;
  return collectionAttemptSerial;
};

// Runtime singletons other modules read straight from the store module.
export {
  getFieldDilemma,
  getRuntimeFootContacts,
  getRuntimePlayerMotion,
  getRuntimePlayerPose,
  publishRuntimeFootStep,
  threeRuntimeState,
  updateRuntimeFootContacts,
  updateRuntimePlayerMotion,
  updateRuntimePlayerPose,
} from './storeSlices/shared';

export const useThreeGameStore = create((set, get) => ({
  ...createExpeditionSlice(),
  ...createSceneSlice(),

  resetExpedition: () => {
    resetThreeRuntimeState();
    set(useThreeGameStore.getInitialState(), true);
  },

  // Resume support. `saveSession` is called on meaningful progress (see
  // useSessionAutosave); `restoreSession` replays a snapshot over a fresh
  // initial state so any field the snapshot does not carry keeps its default.
  saveSession: () => {
    // Every save path (autosave, page hide, Main menu) lands here, so an ended
    // run is caught once: drop the stale resume point rather than write one.
    if (isExpeditionFinished(get())) {
      clearSessionSnapshot();
      return null;
    }
    const snapshot = buildSessionSnapshot(get());
    return writeSessionSnapshot(snapshot) ? snapshot : null;
  },

  restoreSession: snapshot => {
    if (!isUsableSessionSnapshot(snapshot)) return false;
    resetThreeRuntimeState();
    const initial = useThreeGameStore.getInitialState();
    // getZone falls back to the default region for unknown ids rather than
    // returning null, so compare the resolved id: a renamed or removed region in
    // an older save must not silently drop the player somewhere else.
    const zone = getZone(snapshot.currentZoneId);
    if (!zone || zone.id !== snapshot.currentZoneId) return false;

    const patch = { ...initial };
    const assign = (key, value, fallback) => {
      patch[key] = value === null || value === undefined ? fallback : value;
    };

    assign('seed', snapshot.seed, initial.seed);
    assign('playableModeId', snapshot.playableModeId, initial.playableModeId);
    patch.currentZoneId = snapshot.currentZoneId;
    assign('currentLocalCellId', snapshot.currentLocalCellId, initial.currentLocalCellId);
    assign('playerSpawnId', snapshot.playerSpawnId, initial.playerSpawnId);
    assign('health', snapshot.health, initial.health);
    assign('fatigue', snapshot.fatigue, initial.fatigue);
    assign('timeOfDay', snapshot.timeOfDay, initial.timeOfDay);
    assign('day', snapshot.day, initial.day);
    assign('localStanding', snapshot.localStanding, initial.localStanding);
    patch.questComplete = Boolean(snapshot.questComplete);
    assign('activeToolId', snapshot.activeToolId, initial.activeToolId);
    patch.supplies = normalizeSupplies(snapshot.supplies, initial.supplies);
    assign('minutesSinceMeal', snapshot.minutesSinceMeal, 0);
    // A resumed save keeps its objective; a snapshot from before objectives
    // existed falls back to re-resolving from the first.
    patch.activeDirectiveId = typeof snapshot.activeDirectiveId === 'string'
      ? snapshot.activeDirectiveId
      : FIRST_DIRECTIVE_ID;
    assign('symsDirective', snapshot.symsDirective, initial.symsDirective);
    assign('symsZoneId', snapshot.symsZoneId, initial.symsZoneId);
    patch.weather = normalizeWeatherState(snapshot.weather, initial.weather);
    patch.inventory = Array.isArray(snapshot.inventory) ? snapshot.inventory : initial.inventory;
    patch.shipCollection = Array.isArray(snapshot.shipCollection)
      ? snapshot.shipCollection
      : initial.shipCollection;
    patch.items = Array.isArray(snapshot.items) ? snapshot.items : initial.items;
    patch.journal = Array.isArray(snapshot.journal) && snapshot.journal.length > 0
      ? snapshot.journal
      : initial.journal;
    patch.bookLastPages = snapshot.bookLastPages || initial.bookLastPages;
    patch.fieldMeasurements = sanitizeFieldMeasurements(snapshot.fieldMeasurements);
    patch.assessmentPlayerTranscript = sanitizeAssessmentTranscript(snapshot.assessmentPlayerTranscript);
    patch.npcEncounterState = {
      ...initial.npcEncounterState,
      ...sanitizeNpcEncounterState(snapshot.npcEncounterState),
    };
    // The same field list buildSessionSnapshot writes, so a field cannot be
    // saved and then quietly dropped on load (or the reverse).
    for (const key of PERSISTED_STRING_ARRAY_FIELDS) {
      if (Array.isArray(snapshot[key])) patch[key] = snapshot[key];
    }
    // An empty belt in an old save means "never set", not "no tools".
    for (const key of PERSISTED_TOOLBAR_FIELDS) {
      if (Array.isArray(snapshot[key]) && snapshot[key].length > 0) patch[key] = snapshot[key];
    }
    patch.journalDraft = typeof snapshot.journalDraft === 'string' ? snapshot.journalDraft : initial.journalDraft;
    patch.downedSpecimenActors = snapshot.downedSpecimenActors && typeof snapshot.downedSpecimenActors === 'object'
      ? snapshot.downedSpecimenActors
      : initial.downedSpecimenActors;
    // Older saves predate island tameness: their animals start tame.
    patch.wildlifeWariness = sanitizeWildlifeWariness(snapshot.wildlifeWariness);
    // The snare tool was retired; older saves may still carry it on the belt.
    for (const key of ['toolbarOrder', 'darwinToolbarOrder']) {
      if (Array.isArray(patch[key])) {
        patch[key] = patch[key].map(id => (id === 'snare' ? 'pocket_knife' : id));
      }
    }
    if (patch.activeToolId === 'snare') patch.activeToolId = 'hands';
    // Visited regions must always include where the player actually is.
    if (!patch.visitedZoneIds.includes(patch.currentZoneId)) {
      patch.visitedZoneIds = [...patch.visitedZoneIds, patch.currentZoneId];
    }

    // Re-narrate arrival for the restored region so the log is not empty and the
    // player is told where they have resumed.
    const narration = {
      ...getThreeInitialNarration(patch.currentZoneId),
      ...(zoneNarration(zone, {
        day: patch.day,
        timeOfDay: patch.timeOfDay,
        source: 'initial',
      }) || {}),
    };
    const resumeText = String(narration.narration || zone.description || '').trim();
    if (resumeText) {
      patch.message = resumeText;
      patch.narratorLog = createInitialNarratorLog(
        { narration: resumeText, educationalNote: narration.educationalNote || '' },
        { day: patch.day, timeOfDay: patch.timeOfDay },
      );
    }

    set(patch, true);
    return true;
  },

  beginFinalAssessment: async () => {
    const state = get();
    if (state.finalAssessment) return state.finalAssessment;

    const location = getThreeIslandLocation(state.currentZoneId);
    const zone = getZone(state.currentZoneId);
    const record = buildFinalAssessmentRecord({
      ...state,
      currentLocationName: location.name || zone.name,
      specimenMetadata: Object.fromEntries(baseSpecimens.map(specimen => [specimen.id, {
        name: specimen.name,
        scientificValue: specimen.scientificValue,
        ontology: specimen.ontology,
      }])),
    });
    const localAssessment = buildLocalHenslowAssessment(record.profile);
    const closingEvent = createNarratorEvent({
      kind: 'narrator',
      text: 'The field book closes. Your specimens, notes, and omissions are sent onward to Cambridge for Professor Henslow’s judgment.',
      day: state.day,
      timeOfDay: state.timeOfDay,
      source: 'local',
    });

    set(current => ({
      finalAssessment: record,
      narratorLog: appendNarratorEvents(current.narratorLog, closingEvent),
      narratorPending: false,
      narratorError: null,
      activeConstraint: null,
      majorEvent: null,
      expeditionOutcome: null,
      statusViewOpen: false,
      specimenDetail: null,
      examineSession: null,
      readableBookSession: null,
      activeNpcEncounter: null,
      beagleTravelPrompt: null,
      transition: null,
      edgePrompt: null,
      fieldAction: null,
      observationMode: false,
      contextPrompt: null,
      contextPromptCandidates: {},
      carriedObjectId: null,
      carryDropRequest: null,
      carryPrompt: null,
    }));

    // Bad expeditions need a stable, unsparing judgment. Keeping the severe
    // failure bands canonical prevents a language model from finding generic
    // praise in a trivial note or inflating a nearly empty field packet.
    if (record.profile.overall < 4 && record.request.narratorTranscript.turnCount === 0) {
      const completed = {
        ...record,
        phase: 'ready',
        source: 'canonical',
        assessment: localAssessment,
      };
      set(current => (
        current.finalAssessment?.id === record.id
          ? { finalAssessment: completed }
          : {}
      ));
      return completed;
    }

    if (!generativeRequestsAllowed()) {
      const completed = {
        ...record,
        phase: 'ready',
        source: 'canonical',
        assessment: localAssessment,
      };
      set(current => (
        current.finalAssessment?.id === record.id
          ? { finalAssessment: completed }
          : {}
      ));
      return completed;
    }

    const idempotencyKey = [
      'final-assessment',
      state.seed || 'three',
      state.day || 1,
      record.profile.stats.evidence,
      record.profile.stats.notes,
      record.profile.stats.locations,
      textHash(record.request.narratorTranscript.text),
    ].join(':');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);

    try {
      const response = await fetch('/api/end-game-assessment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-young-darwin-session': narratorSessionId(state.seed),
          'x-idempotency-key': idempotencyKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          ...record.request,
          idempotencyKey,
        }),
      });
      const data = await response.json().catch(() => ({}));
      const assessment = String(data?.assessment || '').trim();
      if (!response.ok || assessment.length < 40) {
        throw new Error(data?.error || `Assessment request failed (${response.status})`);
      }
      const completed = {
        ...record,
        phase: 'ready',
        source: 'remote',
        assessment,
        profile: applyTranscriptEvaluation(record.profile, data?.transcriptEvaluation || {
          adjustment: 0,
          classification: 'neutral',
          summary: record.request.narratorTranscript.turnCount
            ? 'No reliable transcript judgment was returned; no adjustment was applied.'
            : '',
        }),
      };
      set(current => (
        current.finalAssessment?.id === record.id
          ? { finalAssessment: completed }
          : {}
      ));
      return completed;
    } catch (error) {
      const completed = {
        ...record,
        phase: 'ready',
        source: 'local',
        assessment: localAssessment,
        profile: record.request.narratorTranscript.turnCount
          ? applyTranscriptEvaluation(record.profile, {
              adjustment: 0,
              classification: 'neutral',
              summary: 'The narrator-panel transcript could not be assessed; no adjustment was applied.',
            })
          : record.profile,
        error: error?.name === 'AbortError'
          ? 'Professor Henslow’s full letter took too long to arrive; a field-office assessment is shown instead.'
          : 'Professor Henslow’s full letter is unavailable; a field-office assessment is shown instead.',
      };
      set(current => (
        current.finalAssessment?.id === record.id
          ? { finalAssessment: completed }
          : {}
      ));
      return completed;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  setPlayableMode: playableModeId => set(state => {
    const mode = getPlayableMode(playableModeId);
    const narratorIsPristine = (state.narratorLog || []).every(entry => entry?.source === 'initial');
    const darwinToolbarOrder = state.playableModeId === 'darwin'
      ? state.toolbarOrder
      : (state.darwinToolbarOrder || DEFAULT_DARWIN_TOOLBAR);
    const toolbarOrder = mode.id === 'darwin'
      ? [...darwinToolbarOrder]
      : getPlayableToolbarIds(mode.id);
    const nextActiveToolId = toolbarOrder.includes(state.activeToolId) ? state.activeToolId : toolbarOrder[0];
    const patch = {
      playableModeId: mode.id,
      activeToolId: nextActiveToolId,
      toolbarOrder,
      darwinToolbarOrder: [...darwinToolbarOrder],
      selectedSpecimenId: null,
      nearbySpecimenId: null,
      nearbyNpcEncounter: null,
      activeNpcEncounter: null,
      carryPrompt: null,
      fieldAction: null,
      observationMode: false,
      contextPrompt: null,
      contextPromptCandidates: {},
      carriedObjectId: null,
      carryDropRequest: null,
      examineSession: null,
      readableBookSession: null,
      interiorPrompt: null,
    };
    if (narratorIsPristine && mode.kind === 'animal' && mode.narrator?.initialNarration) {
      const animalInitialNarration = {
        narration: mode.narrator.initialNarration,
        educationalNote: '',
      };
      patch.message = animalInitialNarration.narration;
      patch.educationalNote = '';
      patch.narratorLog = createInitialNarratorLog(animalInitialNarration, {
        day: state.day,
        timeOfDay: state.timeOfDay,
      });
    }

    if (mode.kind === 'animal') {
      const spawn = findPlayableSpawn(mode.id, state.currentZoneId);
      if (spawn) {
        patch.currentZoneId = spawn.zoneId;
        patch.playerSpawnId = `playable:${mode.id}`;
        patch.playableSpawnPoint = spawn.point;
        patch.playableHiddenActorId = spawn.actorId;
        patch.minimapPlayerPose = {
          x: spawn.point.x,
          z: spawn.point.z,
          heading: 180,
          zoneId: spawn.zoneId,
        };
      } else {
        patch.playableSpawnPoint = null;
        patch.playableHiddenActorId = null;
      }
    } else {
      patch.playableSpawnPoint = null;
      patch.playableHiddenActorId = null;
      patch.playerSpawnId = String(state.playerSpawnId || '').startsWith('playable:') ? 'default' : state.playerSpawnId;
    }

    return patch;
  }),
  setActiveTool: activeToolId => {
    const previousToolId = get().activeToolId;
    if (previousToolId === activeToolId) return;
    set({ activeToolId });
    emitPropEvent('equipment-foley', {
      kind: 'tool-change',
      fromToolId: previousToolId,
      toToolId: activeToolId,
      position: getRuntimePlayerPose()?.position,
    });
  },
  // Double-barreled shotgun ammo. Timestamps are performance.now()-seconds so
  // the aim/HUD layers can share the clock without a store tick per frame.
  shotgunShells: 2,
  shotgunReloadUntil: 0,
  ...createShotgunActions(set, get),
  ...createWarinessActions(set, get),

  setToolbarSlot: (slotIndex, toolId) => set(state => {
    if (state.playableModeId !== 'darwin') return {};
    const availableToolIds = inventoryItems.map(item => item.id);
    const toolbarOrder = assignToolbarSlot(state.toolbarOrder, slotIndex, toolId, availableToolIds);
    if (toolbarOrder === state.toolbarOrder) return {};
    const displacedToolId = state.toolbarOrder[slotIndex];
    return {
      toolbarOrder,
      darwinToolbarOrder: [...toolbarOrder],
      activeToolId: state.activeToolId === displacedToolId && !toolbarOrder.includes(displacedToolId)
        ? toolId
        : state.activeToolId,
    };
  }),
  moveToolbarSlot: (from, to) => set(state => {
    const toolbarOrder = reorderToolbarSlot(state.toolbarOrder, from, to);
    if (toolbarOrder === state.toolbarOrder) return {};
    return {
      toolbarOrder,
      ...(state.playableModeId === 'darwin' ? { darwinToolbarOrder: [...toolbarOrder] } : {}),
    };
  }),
  specimenDetail: null,
  openSpecimenDetail: (specimens, index = 0) => set({ specimenDetail: { specimens, index } }),
  navigateSpecimenDetail: index => set(state => (
    state.specimenDetail
      ? { specimenDetail: { ...state.specimenDetail, index: Math.max(0, Math.min(state.specimenDetail.specimens.length - 1, index)) } }
      : {}
  )),
  closeSpecimenDetail: () => set({ specimenDetail: null }),
  toggleFavoriteSpecimen: specimenId => set(state => ({
    favoriteSpecimenIds: state.favoriteSpecimenIds.includes(specimenId)
      ? state.favoriteSpecimenIds.filter(id => id !== specimenId)
      : [...state.favoriteSpecimenIds, specimenId],
  })),
  setJournalDraft: value => set({ journalDraft: String(value ?? '') }),
  addUserJournalEntry: content => set(state => {
    const trimmed = String(content || '').trim();
    if (!trimmed) return {};
    const location = getThreeIslandLocation(state.currentZoneId);
    return {
      journal: [
        ...state.journal,
        {
          id: `${Date.now()}-field-note`,
          day: state.day,
          timeOfDay: state.timeOfDay,
          location: location.name,
          content: trimmed,
          kind: 'note',
          authorship: 'player',
          title: 'Field Note',
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }),
  recordNarratorEvents: events => set(state => ({
    narratorLog: appendNarratorEvents(
      state.narratorLog,
      (Array.isArray(events) ? events : [events]).map(entry => createNarratorEvent({
        ...entry,
        day: entry?.day || state.day,
        timeOfDay: entry?.timeOfDay ?? state.timeOfDay,
      })),
    ),
  })),
  recordScriptedNarration: ({ key, text, kind = 'narrator', speaker, meta = {} } = {}) => set(state => {
    if (!key || !text || state.narratorScriptedKeys?.[key]) return {};
    return {
      narratorLog: appendNarratorEvents(state.narratorLog, createNarratorEvent({
        kind,
        speaker,
        text,
        day: state.day,
        timeOfDay: state.timeOfDay,
        source: 'scripted-proximity',
        meta,
      })),
      narratorScriptedKeys: { ...state.narratorScriptedKeys, [key]: gameClockMinutes(state) },
    };
  }),
  appendNarratorEntry: entry => set(state => ({
    narratorLog: appendNarratorEvents(state.narratorLog, [
      createNarratorEvent({
        ...entry,
        day: entry?.day || state.day,
        timeOfDay: entry?.timeOfDay ?? state.timeOfDay,
      }),
    ]),
  })),
  ...createNpcActions(set, get),

  setNearbySpecimen: nearbySpecimenId => set(state => {
    if (state.nearbySpecimenId === nearbySpecimenId) return state;
    const patch = { nearbySpecimenId };
    if (!nearbySpecimenId) return patch;

    const specimen = findRuntimeSpecimen(state, nearbySpecimenId);
    // First close encounter with a species is a discovery beat: record it and
    // hand the HUD a sighting to celebrate. Species the player has already
    // studied or taken enter the record silently. The range gate matters
    // because SpecimenActor's onClick also routes here from a camera raycast
    // with no distance limit: a click on a speck across the clearing must not
    // burn the once-per-save beat.
    if (specimen?.id
      && !(state.sightedSpecimenIds || []).includes(specimen.id)
      && specimenWithinSightingRange(state, specimen)) {
      patch.sightedSpecimenIds = [...(state.sightedSpecimenIds || []), specimen.id];
      const alreadyKnown = state.collectedSpecimenIds.includes(specimen.id)
        || state.documentedSpecimenIds.includes(specimen.id)
        || state.examinedTypeIds.includes(specimen.id);
      if (!alreadyKnown) {
        patch.specimenSighting = {
          id: specimen.id,
          name: specimen.name,
          latin: specimen.latin || '',
          at: Date.now(),
        };
      }
    }
    const scripted = specimenNarration(specimen, { zoneId: state.currentZoneId });
    const key = `specimen:${state.currentZoneId}:${nearbySpecimenId}`;
    const nowMinutes = gameClockMinutes(state);
    const lastSeen = state.narratorScriptedKeys[key];
    if (scripted?.narration && (!Number.isFinite(lastSeen) || nowMinutes - lastSeen >= SCRIPTED_NARRATION_COOLDOWN_MINUTES)) {
      const zone = getZone(state.currentZoneId);
      const thoughtKey = `thought:${state.currentZoneId}:${specimen?.id || nearbySpecimenId}`;
      const thoughtSeen = state.narratorScriptedKeys[thoughtKey];
      const thought = (!Number.isFinite(thoughtSeen) || nowMinutes - thoughtSeen >= SCRIPTED_NARRATION_COOLDOWN_MINUTES)
        ? darwinThought({ zone, specimen, weather: state.weather, timeOfDay: state.timeOfDay })
        : null;
      patch.message = scripted.narration;
      patch.educationalNote = scripted.educationalNote || state.educationalNote;
      patch.narratorLog = appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        ...scripted,
        darwinThought: thought,
      }, state, 'scripted-proximity', { allowThought: Boolean(thought) }));
      patch.narratorScriptedKeys = {
        ...state.narratorScriptedKeys,
        [key]: nowMinutes,
        ...(thought ? { [thoughtKey]: nowMinutes } : {}),
      };
    }
    return patch;
  }),
  setSelectedSpecimen: selectedSpecimenId => set({ selectedSpecimenId }),
  setNearbyItem: nearbyItem => set(state => (
    (state.nearbyItem?.actorId || null) === (nearbyItem?.actorId || null) ? state : { nearbyItem }
  )),
  setFieldAction: fieldAction => set(state => (
    sameFieldAction(state.fieldAction, fieldAction) ? state : { fieldAction }
  )),
  setObservationMode: observationMode => set({
    observationMode: Boolean(observationMode),
    inspectedObject: null,
    inspectedScreenPosition: null,
  }),
  toggleObservationMode: () => set(state => ({
    observationMode: !state.observationMode,
    inspectedObject: null,
    inspectedScreenPosition: null,
  })),
  setPhysicsDebug: physicsDebug => set({ physicsDebug }),
  setGraphicsQuality: ({ cheapMaterials, foliageDrawScale }) => set(state => ({
    cheapMaterials: cheapMaterials ?? state.cheapMaterials,
    foliageDrawScale: foliageDrawScale ?? state.foliageDrawScale,
  })),
  setUnderwaterCamera: ({ amount = 0, cameraY = 0 } = {}) => set(state => {
    const nextAmount = clamp(Number(amount) || 0, 0, 1);
    const nextCameraY = Number(cameraY);
    const safeCameraY = Number.isFinite(nextCameraY) ? nextCameraY : 0;
    const previous = state.underwaterCamera || {};
    if (
      Math.abs((previous.amount || 0) - nextAmount) < 0.018
      && Math.abs((previous.cameraY || 0) - safeCameraY) < 0.08
    ) return state;
    return {
      underwaterCamera: {
        amount: nextAmount,
        cameraY: safeCameraY,
      },
    };
  }),
  setEdgePrompt: edgePrompt => set(state => ({
    edgePrompt,
    dismissedEdgePromptId: edgePrompt
      ? (state.dismissedEdgePromptId === edgePrompt.id ? state.dismissedEdgePromptId : null)
      : null,
  })),
  dismissEdgePrompt: edgePromptId => set(state => ({
    edgePrompt: state.edgePrompt?.id === edgePromptId ? null : state.edgePrompt,
    dismissedEdgePromptId: edgePromptId || state.edgePrompt?.id || null,
  })),
  publishContextPrompt: (source, prompt) => set(state => publishContextPromptState(state, source, prompt)),
  clearContextPrompt: source => set(state => clearContextPromptState(state, source)),
  acknowledgeContextPrompt: source => set(state => acknowledgeContextPromptState(state, source)),
  markHintSeen: hintId => set(state => (!hintId || state.seenHints.includes(hintId)
    ? {}
    : { seenHints: [...state.seenHints, hintId] })),
  clearArrivalEdgeBlock: () => set({ arrivalEdgeBlock: null }),
  setPlayerPose: playerPose => {
    updateRuntimePlayerPose(playerPose);
    set(state => {
      const x = Number(playerPose?.position?.x);
      const z = Number(playerPose?.position?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return { playerPose };
      const fx = Number(playerPose?.facing?.x);
      const fz = Number(playerPose?.facing?.z);
      const heading = Math.atan2(Number.isFinite(fx) ? fx : 0, Number.isFinite(fz) ? fz : -1) * (180 / Math.PI);
      // Only emit a new minimapPlayerPose object when the quantised pose
      // actually changes; otherwise the always-mounted minimap re-renders its
      // whole marker/trail subtree on every pose publish (~15x/sec while
      // walking). `playerPose` still updates every call for full-resolution
      // consumers (island map modal + runtime mirror).
      const previous = state.minimapPlayerPose;
      const unchanged = previous
        && previous.zoneId === state.currentZoneId
        && Math.abs(previous.x - x) < MINIMAP_POSE_EPSILON
        && Math.abs(previous.z - z) < MINIMAP_POSE_EPSILON
        && Math.abs(previous.heading - heading) < MINIMAP_HEADING_EPSILON;
      if (unchanged) return { playerPose };
      return {
        playerPose,
        minimapPlayerPose: { x, z, heading, zoneId: state.currentZoneId },
      };
    });
  },
  setCarryPrompt: carryPrompt => set(state => (
    (state.carryPrompt?.id || null) === (carryPrompt?.id || null)
      && state.carryPrompt?.mode === carryPrompt?.mode
      && state.carryPrompt?.text === carryPrompt?.text
      && Math.abs((state.carryPrompt?.distance ?? 0) - (carryPrompt?.distance ?? 0)) < 0.08
      ? state
      : { carryPrompt }
  )),
  setInteriorPrompt: interiorPrompt => set(state => (
    (state.interiorPrompt?.id || null) === (interiorPrompt?.id || null)
      && Math.abs((state.interiorPrompt?.distance ?? 0) - (interiorPrompt?.distance ?? 0)) < 0.08
      ? state
      : { interiorPrompt }
  )),
  ...createLibraryActions(set, get),

  restInInterior: (label, authoredMessage = null) => set(state => {
    const rested = advanceTimeState(state, 120);
    const place = String(label || 'berth');
    const interior = getInteriorDefinition(state.currentZoneId);
    const message = authoredMessage
      || interior?.restNarration
      || `You lie down in the ${place}. Two hours pass with the creak of timbers and water against the stern.`;
    return {
      ...rested,
      fatigue: clamp(state.fatigue - 30, 0, MAX_FATIGUE),
      health: clamp(state.health + 8, 0, MAX_HEALTH),
      message,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({ narration: message }, state, 'rest')),
    };
  }),
  reportInteriorMessage: message => set(state => {
    const narration = String(message || 'There is nothing more to do here.');
    return {
      message: narration,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({ narration }, state, 'interior')),
    };
  }),
  setInspectedObject: inspectedObject => set(state => {
    if (state.observationMode && inspectedObject) {
      const examinable = examinableFromFieldTarget({
        id: inspectedObject.sourceId || inspectedObject.id,
        actorId: inspectedObject.sourceId || inspectedObject.id,
        typeId: inspectedObject.id,
        specimenId: inspectedObject.specimenId || null,
        kind: inspectedObject.kind,
        category: inspectedObject.category,
        name: inspectedObject.englishName,
        latin: inspectedObject.latinName,
        focus: inspectedObject.worldPosition,
        inspectable: inspectedObject,
      }, { zoneId: state.currentZoneId });
      return examinable ? {
        observationMode: false,
        inspectedObject: null,
        inspectedScreenPosition: null,
        examineSession: createExamineSession(examinable, {
          focus: inspectedObject.worldPosition || null,
          day: state.day,
          timeOfDay: state.timeOfDay,
        }),
      } : {};
    }
    return { inspectedObject, inspectedScreenPosition: null };
  }),
  setInspectedScreenPosition: inspectedScreenPosition => set({ inspectedScreenPosition }),
  clearInspectedObject: () => set({ inspectedObject: null, inspectedScreenPosition: null }),
  openBeagleTravelPrompt: (beagleTravelPrompt = {}) => set({
    beagleTravelPrompt: {
      id: `beagle-return:${Date.now()}`,
      openedAt: Date.now(),
      ...beagleTravelPrompt,
    },
    inspectedObject: null,
    inspectedScreenPosition: null,
  }),
  closeBeagleTravelPrompt: () => set({ beagleTravelPrompt: null }),

  // Re-evaluates the active objective against current state. Cheap enough to
  // call after any action that could satisfy one; a no-op when nothing
  // changed, so callers never need to know which objective is active.
  refreshDirective: () => set(state => {
    if (!state.activeDirectiveId) return {};
    const next = resolveDirective(state, state.activeDirectiveId);
    if (next === state.activeDirectiveId) return {};
    return {
      activeDirectiveId: next,
      // Named for the HUD's completion beat; cleared by clearCompletedDirective
      // once that has played.
      directiveCompletedId: state.activeDirectiveId,
    };
  }),

  clearCompletedDirective: () => set(state => (
    state.directiveCompletedId ? { directiveCompletedId: null } : {}
  )),

  ...createCaseActions(set, get),

  dismissNightlyDebrief: () => set(state => (state.nightlyDebrief
    ? {
        nightlyDebrief: null,
        dayTitleCard: {
          day: state.nightlyDebrief.nextDay,
          finalDay: state.nightlyDebrief.finalDay,
          zoneName: getZone(state.currentZoneId)?.name || '',
          at: Date.now(),
        },
      }
    : { nightlyDebrief: null })),
  setSolarGlare: solarGlare => set(state => {
    const nextStrength = clamp(Number(solarGlare?.strength) || 0, 0, 1);
    const nextRawStrength = clamp(Number(solarGlare?.rawStrength) || 0, 0, 1);
    const nextDirectness = clamp(Number(solarGlare?.directness) || 0, 0, 1);
    const nextWarmth = clamp(Number(solarGlare?.warmth) || 0, 0, 1);
    const nextViewportPresence = clamp(Number(solarGlare?.viewportPresence) || 0, 0, 1);
    const nextCenterResponse = clamp(Number(solarGlare?.centerResponse) || 0, 0, 1);
    const nextX = clamp(Number(solarGlare?.x) || 0.5, -0.18, 1.18);
    const nextY = clamp(Number(solarGlare?.y) || 0.42, -0.18, 1.18);
    const nextVisible = Boolean(solarGlare?.visible) && nextStrength > 0.006;
    const previous = state.solarGlare || {};
    if (
      previous.visible === nextVisible
      && Math.abs((previous.strength || 0) - nextStrength) < 0.012
      && Math.abs((previous.rawStrength || 0) - nextRawStrength) < 0.012
      && Math.abs((previous.directness || 0) - nextDirectness) < 0.018
      && Math.abs((previous.warmth || 0) - nextWarmth) < 0.018
      && Math.abs((previous.viewportPresence || 0) - nextViewportPresence) < 0.018
      && Math.abs((previous.centerResponse || 0) - nextCenterResponse) < 0.018
      && Math.abs((previous.x || 0.5) - nextX) < 0.006
      && Math.abs((previous.y || 0.42) - nextY) < 0.006
    ) return state;
    return {
      solarGlare: {
        x: nextX,
        y: nextY,
        strength: nextStrength,
        rawStrength: nextRawStrength,
        directness: nextDirectness,
        warmth: nextWarmth,
        viewportPresence: nextViewportPresence,
        centerResponse: nextCenterResponse,
        visible: nextVisible,
      },
    };
  }),
  // Picking up and releasing both invalidate the old per-frame prompt. A
  // physics prop may complete a requested drop synchronously before React has
  // rendered the new store value, so keep this state change atomic.
  setCarriedObject: carriedObjectId => {
    const previousObjectId = get().carriedObjectId;
    if (previousObjectId === carriedObjectId) return;
    set(state => ({
      carriedObjectId,
      carryDropRequest: null,
      ...(
        state.carryPrompt?.id === state.carriedObjectId
        || state.carryPrompt?.id === carriedObjectId
          ? { carryPrompt: null }
          : {}
      ),
    }));
    if (carriedObjectId) {
      emitPropEvent('equipment-foley', {
        kind: 'carry-pickup',
        propId: carriedObjectId,
        position: getRuntimePlayerPose()?.position,
      });
    }
  },
  dropCarriedObject: (options = {}) => set(state => {
    if (!state.carriedObjectId || state.carryDropRequest) return state;
    const pose = getRuntimePlayerPose();
    return {
      carryDropRequest: {
        id: state.carriedObjectId,
        requestId: ++carryDropRequestId,
        zoneId: state.currentZoneId,
        reason: options.reason || 'manual',
        mode: options.mode === 'release' ? 'release' : 'place',
        position: { ...(pose?.position || state.playerPose?.position || INITIAL_PLAYER_POSE.position) },
        facing: { ...(pose?.facing || state.playerPose?.facing || INITIAL_PLAYER_POSE.facing) },
      },
      carryPrompt: null,
    };
  }),
  completeCarryDrop: (objectId, requestId) => set(state => (
    state.carriedObjectId === objectId
      && state.carryDropRequest?.id === objectId
      && state.carryDropRequest.requestId === requestId
      ? { carriedObjectId: null, carryDropRequest: null, carryPrompt: null }
      : state
  )),
  cancelCarryDrop: (objectId, requestId, message = null) => set(state => (
    state.carriedObjectId === objectId
      && state.carryDropRequest?.id === objectId
      && state.carryDropRequest.requestId === requestId
      ? {
          carryDropRequest: null,
          ...(message ? { message } : {}),
        }
      : state
  )),
  setSpecimenRuntimePosition: (specimenId, position, zoneId = get().currentZoneId) => set(state => {
    const zone = zoneId || get().currentZoneId;
    const currentByZone = state.specimenRuntimePositions[zone] || {};
    const nextX = Number(position?.x);
    const nextY = Number(position?.y);
    const nextZ = Number(position?.z);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !Number.isFinite(nextZ)) return state;
    const current = currentByZone[specimenId] || {};
    if (
      Math.abs((current.x || 0) - nextX) < 0.001
      && Math.abs((current.y || 0) - nextY) < 0.001
      && Math.abs((current.z || 0) - nextZ) < 0.001
    ) return state;
    return {
      specimenRuntimePositions: {
        ...state.specimenRuntimePositions,
        [zone]: {
          ...currentByZone,
          [specimenId]: {
            x: nextX,
            y: nextY,
            z: nextZ,
          },
        },
      },
    };
  }),
  ...createFieldCollectionActions(set, get),

  ...createAnimalModeActions(set, get),

  movePushableObstacle: (obstacleId, delta, zoneId = get().currentZoneId, maxOffset = null) => set(state => {
    const key = `${zoneId}:${obstacleId}`;
    const current = state.pushableObstacleOffsets[key] || { x: 0, z: 0 };
    let next = {
      x: current.x + (delta?.x || 0),
      z: current.z + (delta?.z || 0),
    };
    if (Number.isFinite(maxOffset) && maxOffset > 0) {
      const distance = Math.hypot(next.x, next.z);
      if (distance > maxOffset) {
        const scale = maxOffset / Math.max(0.0001, distance);
        next = {
          x: next.x * scale,
          z: next.z * scale,
        };
      }
    }
    return {
      pushableObstacleOffsets: {
        ...state.pushableObstacleOffsets,
        [key]: next,
      },
    };
  }),
  advanceTime: minutes => set(state => advanceTimeState(state, minutes)),
  setTimeOfDay: hour => set(state => {
    const timeOfDay = clamp(Number(hour) || 0, 0, HOURS_PER_DAY - 1 / 60);
    if (state.timeOfDay === timeOfDay) return {};
    return {
      timeOfDay,
      ...ambientThoughtPatch(state, { timeOfDay, trigger: 'time' }),
    };
  }),

  setWeather: weather => set(state => {
    const normalized = normalizeWeatherState(weather, state.weather);
    return state.weather === normalized
      ? {}
      : {
          weather: normalized,
          ...ambientThoughtPatch(state, { weather: normalized, trigger: 'weather' }),
        };
  }),
  setWeatherOverride: weatherOverride => set(state => ({
    weatherOverride: weatherOverride?.state
      ? {
          ...weatherOverride,
          state: normalizeWeatherState(weatherOverride.state, state.weather),
        }
      : weatherOverride,
  })),

  statusViewOpen: false,
  openStatusView: () => set({ statusViewOpen: true }),
  closeStatusView: () => set({ statusViewOpen: false }),

  ...createExamineActions(set, get),

  adjustLocalStanding: delta => set(state => ({
    localStanding: clamp(state.localStanding + delta, 0, 100),
  })),

  ...createZoneTravelActions(set, get),

  beginIncapacitationRecovery: () => {
    const state = get();
    if (state.expeditionOutcome?.type !== 'incapacitated') return;
    const minutes = minutesUntilRecoveryMorning(state.timeOfDay);
    set(current => ({
      expeditionOutcome: current.expeditionOutcome
        ? { ...current.expeditionOutcome, phase: 'recovering' }
        : null,
    }));
    get().beginZoneTransition(INCAPACITATION_RECOVERY_ZONE_ID, {
      source: 'incapacitation-recovery',
      mode: 'threshold',
      minutes,
      fatigue: 0,
      note: 'The crew carry Darwin back aboard HMS Beagle. He wakes in the aft cabin the following morning.',
      educationalNote: 'Shore work depended on companions, boats, and the shipboard routines that made recovery possible.',
    });
  },

  applyFatalInjury: (source = 'fatal_injury') => set(state => ({
    ...healthDamagePatch(state, {
      amount: MAX_HEALTH,
      source,
      fatalOnZero: true,
      forceZero: true,
    }),
  })),

  // The player has two views: the chase camera and first person. The
  // shoulder and overhead rigs remain for the dev camera lab and interiors,
  // but V only toggles between these two.
  cycleViewMode: () => set(state => ({
    viewMode: state.viewMode === 'first' ? 'hero' : 'first',
  })),

  applyMovementCost: ({ running = false, walking = false, airborne = false, falling = 0, fatigueDelta = null } = {}) => set(state => {
    const catastrophicFall = state.playableModeId === 'darwin' && falling >= CATASTROPHIC_FALL_SPEED;
    return {
      fatigue: clamp(state.fatigue + (fatigueDelta ?? (
        (running ? MOVEMENT_FATIGUE.runningPerFrame60 : walking ? MOVEMENT_FATIGUE.walkingPerFrame60 : 0)
        + (airborne ? MOVEMENT_FATIGUE.airbornePerFrame60 : 0)
      )), 0, MAX_FATIGUE),
      ...healthDamagePatch(state, {
        amount: catastrophicFall ? MAX_HEALTH : Math.max(0, falling - 9.1) * 1.05,
        source: catastrophicFall ? 'catastrophic_fall' : 'fall_injury',
        fatalOnZero: catastrophicFall,
        forceZero: catastrophicFall,
      }),
    };
  }),

  applyDrowningDamage: amount => set(state => {
    const message = 'You are out of your depth — the sea is closing over you.';
    const symsLine = '"Sir! Back to the shallows — the Beagle has no second naturalist!"';
    return {
      ...healthDamagePatch(state, { amount, source: 'drowning', fatalOnZero: true }),
      message,
      symsLine,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine,
      }, state, 'hazard')),
    };
  }),

  reportConstraintBlockedTool: toolId => set(state => {
    if (!constraintBlocksTool(state.activeConstraint, toolId)) return {};
    const { message, symsLine } = blockedToolMessage(state.activeConstraint, toolId);
    return {
      message,
      symsLine,
      lastOutcome: null,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine,
      }, state, 'blocked-action')),
    };
  }),

  reportConstraintBlockedAction: () => set(state => {
    const constraint = state.activeConstraint;
    if (!constraint?.movementLock) return {};
    const message = constraint.type === 'net_snagged'
      ? 'The net is still caught fast. Free it before turning back to fieldwork.'
      : 'This problem needs your attention before fieldwork can continue.';
    const symsLine = constraint.type === 'net_snagged'
      ? '"The cactus has the net for now, sir."'
      : '"A plan first, sir."';
    return {
      message,
      symsLine,
      lastOutcome: null,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine,
      }, state, 'blocked-action')),
    };
  }),

  triggerNetSnagDilemma: (details = {}) => set(state => {
    if (state.activeConstraint) return {};
    const config = FIELD_DILEMMA_CONFIG.net_snagged;
    const hazardLabel = details.hazardLabel || 'cactus spines';
    const message = `The insect net catches on ${hazardLabel}. The mesh is under tension, and a hard pull would tear it.`;
    return {
      activeConstraint: {
        type: 'net_snagged',
        movementLock: true,
        blockedTools: ['insect_net'],
        toolId: 'insect_net',
        startedAt: Date.now(),
        attempts: 0,
        details,
        reaction: {
          clip: 'stumble',
          duration: ACTION_DURATION.stumble,
          lockMovement: 0.28,
          interrupt: true,
        },
      },
      message,
      symsLine: '"Steady, sir. The mesh will not thank us for brute force."',
      lastOutcome: null,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine: '"Steady, sir. The mesh will not thank us for brute force."',
      }, state, 'major-event')),
    };
  }),

  triggerHammerShardDilemma: (details = {}) => set(state => {
    if (state.activeConstraint) return {};
    const config = FIELD_DILEMMA_CONFIG.hammer_shard;
    const sampleLabel = details.sampleLabel || details.material || 'rock';
    const message = `A sharp ${sampleLabel} chip snaps back from the hammer strike and catches you before it falls into the dust.`;
    return {
      activeConstraint: {
        type: 'hammer_shard',
        movementLock: false,
        movementSpeedScale: 0.88,
        blockedTools: ['hammer'],
        toolId: 'hammer',
        startedAt: Date.now(),
        attempts: 0,
        healthPenalty: 6,
        details,
        reaction: {
          clip: 'hitReaction',
          duration: ACTION_DURATION.hitReaction,
          lockMovement: 0.38,
          interrupt: true,
        },
      },
      message,
      symsLine: '"Best look to your hand before the stone, sir."',
      lastOutcome: null,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine: '"Best look to your hand before the stone, sir."',
      }, state, 'major-event')),
      ...healthDamagePatch(state, { amount: 6, source: 'hammer_shard' }),
    };
  }),

  applyCactusDamage: (amount = 8, options = {}) => set(state => {
    const hazardLabel = options.hazardLabel || 'cactus';
    const message = `You recoil from the ${hazardLabel}'s spines.`;
    const educationalNote = options.educationalNote
      || 'Cactus spines make hurried movement through dry Galápagos scrub costly.';
    const symsLine = '"Mind the cactus, sir. Those spines will write their own field note."';
    const embedSpines = Boolean(options.embedSpines && !state.activeConstraint);
    const config = FIELD_DILEMMA_CONFIG.cactus_spines;
    return {
      ...(embedSpines ? {
        activeConstraint: {
          type: 'cactus_spines',
          movementLock: false,
          movementSpeedScale: 0.72,
          disableRun: true,
          startedAt: Date.now(),
          attempts: 0,
          details: {
            cactusId: options.cactusId || 'cactus',
            cactusKind: options.cactusKind || null,
            hazardLabel,
            impactSpeed: Number.isFinite(Number(options.impactSpeed)) ? Number(options.impactSpeed) : null,
            injuryChance: Number.isFinite(Number(options.injuryChance)) ? Number(options.injuryChance) : null,
            severeFall: Boolean(options.severeFall),
          },
          reaction: options.severeFall
            ? {
                clip: 'shoulderHitAndFall',
                duration: ACTION_DURATION.shoulderHitAndFall,
                lockMovement: true,
                recoverAction: 'gettingUp',
                recoverDuration: ACTION_DURATION.gettingUp,
                interrupt: true,
              }
            : {
                clip: 'hitReaction',
                duration: ACTION_DURATION.hitReaction,
                lockMovement: 0.36,
                interrupt: true,
              },
        },
      } : {}),
      message,
      educationalNote,
      symsLine,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine,
      }, state, 'hazard')),
      ...healthDamagePatch(state, { amount, source: 'cactus' }),
    };
  }),

  dismissMajorEvent: eventId => set(state => {
    if (!state.majorEvent || (eventId && state.majorEvent.id !== eventId)) return {};
    if (state.majorEvent.requiresNarratorInput) return {};
    return { majorEvent: null };
  }),

  // Resting is a two-beat action: Darwin lies down, then two hours are gone.
  // `beginRest` opens the beat and lets the player controller play the clip;
  // `completeRest` spends the time and raises the card. Both the R key and the
  // HUD button route through the input path (see playerActionTriggers) so the
  // animation can never be skipped by one of them.
  beginRest: () => {
    const state = get();
    if (state.restSession || state.playableModeId !== 'darwin') return false;
    // Interiors have their own berth-and-bunk rest with authored narration.
    if (getInteriorDefinition(state.currentZoneId) || state.currentZoneId === 'BEAGLE') return false;
    if (state.expeditionDeparted || state.finalAssessment || state.expeditionOutcome) return false;
    if (state.activeConstraint || state.transition) return false;
    const id = `rest-${Date.now()}`;
    set({ restSession: { id, phase: 'resting' } });
    setTimeout(() => get().completeRest(id), REST_ANIMATION_MS);
    return true;
  },

  completeRest: (sessionId = null) => set(state => {
    if (!state.restSession || state.restSession.phase !== 'resting') return {};
    if (sessionId && state.restSession.id !== sessionId) return {};
    const provisioned = (state.supplies.provisions || 0) > 0;
    const zone = getZone(state.currentZoneId);
    const flavor = restFlavor({
      zoneId: state.currentZoneId,
      zoneType: zone.biome || zone.type,
      timeOfDay: state.timeOfDay,
      provisioned,
    });
    const advanced = advanceTimeState(state, REST_MINUTES);
    const fatigueBefore = state.fatigue;
    const fatigueAfter = clamp(state.fatigue - (provisioned ? 26 : 12), 0, MAX_FATIGUE);
    const message = `${flavor.line} ${flavor.provision}`;
    const educationalNote = 'Fieldwork depended on pacing: heat, daylight, and fatigue changed what a naturalist could safely collect.';
    const suppliesAfter = advanced.supplies || state.supplies;
    return {
      ...advanced,
      minutesSinceMeal: 0,
      fatigue: fatigueAfter,
      health: clamp((advanced.health ?? state.health) + (provisioned ? 10 : 4), 0, MAX_HEALTH),
      supplies: {
        ...suppliesAfter,
        provisions: Math.max(0, (suppliesAfter.provisions || 0) - 1),
      },
      restSession: {
        ...state.restSession,
        phase: 'complete',
        ...flavor,
        placeName: zone.shortName || zone.name,
        provisioned,
        fatigueRecovered: fatigueBefore - fatigueAfter,
        endedAt: advanced.timeOfDay,
        // A rest that runs the clock past the last day ends the survey instead
        // of raising a card nobody can read.
        departed: Boolean(advanced.expeditionDeparted),
      },
      message,
      educationalNote,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
      }, state, 'rest')),
    };
  }),

  dismissRest: () => set(state => (state.restSession ? { restSession: null } : {})),

  // Kept for automation and the e2e harness, which want the effect without the
  // animation beat.
  rest: () => {
    if (!get().beginRest()) return false;
    get().completeRest();
    return true;
  },

  // The one exit from a field dilemma: an authored choice with a
  // deterministic cost in time or health. Clearing the constraint restores
  // movement and unblocks the tool.
  resolveFieldDilemmaChoice: choiceId => set(state => {
    const constraint = state.activeConstraint;
    const config = FIELD_DILEMMA_CONFIG[constraint?.type];
    const choice = config?.choices?.find(item => item.id === choiceId);
    if (!constraint || !choice) return {};
    const advanced = choice.minutes > 0 ? advanceTimeState(state, choice.minutes) : {};
    return {
      ...advanced,
      activeConstraint: null,
      majorEvent: null,
      message: choice.narration,
      symsLine: choice.symsLine,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: choice.narration,
        symsLine: choice.symsLine,
      }, state, `${constraint.type}-resolved`)),
      ...(choice.healthCost > 0
        ? healthDamagePatch(state, { amount: choice.healthCost, source: constraint.type })
        : {}),
    };
  }),

  ...createNarratorActions(set, get),

  collectNearby: async (targetSpecimenId = null, { assured = false } = {}) => {
    const state = get();
    const specimenId = targetSpecimenId || state.nearbySpecimenId || state.selectedSpecimenId;
    const zoneSpecimens = getThreeSpecimens(state.currentZoneId);
    const collectedActorIds = new Set(state.collectedSpecimenActorIds || []);
    const tool = threeTools.find(item => item.id === state.activeToolId) || threeTools.find(item => item.id === 'hands');
    if (constraintBlocksTool(state.activeConstraint, tool.id)) {
      get().reportConstraintBlockedTool?.(tool.id);
      return null;
    }
    const specimen = zoneSpecimens.find(item => {
      const actorId = item.instanceId || item.id;
      return !collectedActorIds.has(actorId) && (actorId === specimenId || item.id === specimenId);
    });
    if (!specimen) return null;
    const actorId = specimen.instanceId || specimen.id;

    const islandLocation = getThreeIslandLocation(state.currentZoneId);
    const alreadyCollected = state.collectedSpecimenIds.includes(specimen.id);
    const documented = tool.id === 'sketch' || alreadyCollected;

    // The case is the only limit on taking specimens. Full case: the player
    // chooses between retiring to the Beagle and releasing something.
    if (!documented && state.inventory.length >= state.caseCapacity) {
      set(caseFullPatch(specimen.name, actorId));
      return null;
    }
    const result = documented
      ? {
          success: false,
          reason: alreadyCollected
            ? `You already have a ${specimen.name} specimen, so you document this living example without removing it from its habitat.`
            : `You document the ${specimen.name} carefully without removing it from its habitat.`,
          outcomeType: 'documented',
          evidence: alreadyCollected ? 'repeat sighting and behavior note' : 'field sketch and behavior note',
          damage: 0,
          scoreDelta: alreadyCollected ? 0 : 1,
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
          attempt: nextCollectionAttempt(),
          assured,
        });

    const collected = result.success && !documented;

    set(current => {
      const rarityTier = getSpecimenRarity(specimen).id;
      const symsLine = collected
        ? rarityTier === 'singular'
          ? `Syms stares into the case a long moment. "Lord, sir — look at him. They will talk of this one in London."`
          : rarityTier === 'remarkable'
            ? `Syms whistles low as he wraps the label. "A proper fine one, sir."`
            : `Syms wraps the ${specimen.name} label twice. "That one will travel, sir."`
        : `Syms peers over your shoulder. "A note is better than a ruined specimen, sir."`;
      return {
        ...recordSpecimenPatch(current, {
          specimen,
          tool,
          result,
          documented,
          actorId,
          location: islandLocation,
          caseEntry: { sourceZoneId: current.currentZoneId, sourceZoneName: islandLocation.name },
          narrationSource: documented ? 'documentation' : 'collection',
          educationalNote: documented
            ? 'Observation without collection was often the least damaging way to preserve locality and behavior evidence.'
            : 'Specimen condition, collection method, and locality determine scientific usefulness.',
          symsLine,
          extraNarratorEvents: collected && current.nearbyNpcEncounter?.npcId === 'syms_covington'
            ? [createNarratorEvent({
                kind: 'npcActivity',
                speaker: 'Syms Covington',
                text: encounterAmbientLine('syms_covington', 'collected', current.npcEncounterState?.syms_covington),
                day: current.day,
                timeOfDay: current.timeOfDay,
                source: 'collection-npc-activity',
                meta: { npcId: 'syms_covington', event: 'collected' },
              })]
            : [],
        }),
        downedSpecimenActors: collected && current.downedSpecimenActors?.[actorId]
          ? Object.fromEntries(Object.entries(current.downedSpecimenActors).filter(([key]) => key !== actorId))
          : (current.downedSpecimenActors || {}),
        nearbySpecimenId: collected && current.nearbySpecimenId === actorId ? null : current.nearbySpecimenId,
        selectedSpecimenId: collected && current.selectedSpecimenId === actorId ? null : current.selectedSpecimenId,
      };
    });

    if (documented) {
      emitPropEvent('fieldwork-foley', {
        kind: 'note',
        specimenId: specimen.id,
        position: state.playerPose?.position || threeRuntimeState.playerPose.position,
      });
    } else if (collected) {
      emitPropEvent('fieldwork-foley', {
        kind: 'container',
        specimenId: specimen.id,
        needsJar: false,
        position: state.playerPose?.position || threeRuntimeState.playerPose.position,
      });
    }

    return result;
  },
}));
