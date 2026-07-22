'use client';

import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { getThreeSpecimens } from '../data';
import { setTouchControl } from '../input/touchControls';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';
import { getNpcPoses } from '../world/npcRuntime';
import { getSpecimenRuntimeBounds, getSpecimenRuntimePoses } from '../world/specimenRuntime';
import { getRegionMap } from '../../game-core/regionMaps';
import { getInteriorDefinition } from '../interiors/interiorRegistry';
import { prepareTerrainResource, terrainResourceIsReady } from '../world/terrainResource';
import {
  borderVistaResourceIsReady,
  prepareBorderVistaResource,
} from '../world/vistas/borderVistaResource';
import {
  prepareRegionEcologyResource,
  regionEcologyResourceIsReady,
} from '../world/ecology/ecologyResource';
import { prefetchRegionTerrainTextures } from '../world/terrainPrefetch';
import {
  prepareWaterTextureResource,
  waterTextureResourceIsReady,
} from '../world/waterTextureResource';
import {
  regionTypeRendersDetailedWater,
  waterBakeResolutionForQuality,
  waterContactResolutionForQuality,
} from '../world/waterTextureManifest';
import { ecologyIsCached } from '../world/ecology';
import { prefetchIslandMapImage } from '../ui/expedition/map/islandLocations';
import { emitPropEvent } from '../physics/props/propEvents';
import { SYMS_FIELD_CASE_ID } from '../npcs/symsActivityPlan';

const HARNESS_VERSION = 3;
const FULL_CONTENT_PHASE = 6;

let renderRuntime = {
  activeContentPhase: 0,
  contentTarget: FULL_CONTENT_PHASE,
  renderer: null,
  gameStarted: false,
  sceneReady: false,
  launchOverlayDismissed: false,
  playerVisualReady: false,
  playerAnimationBanksReady: false,
  loadersStable: false,
  terrainSegmentCap: null,
  waterEnabled: true,
  waterQuality: 'polished',
  worldDetailsEnabled: true,
};

let frameRuntime = {
  candidateKey: null,
  frameRevision: 0,
  stableFrames: 0,
  lastFrameAt: 0,
};

let progressRuntime = {
  key: '',
  revision: 0,
  lastProgressAt: 0,
};

function isE2EEnabled() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('e2e') || params.has('screenshot') || params.get('testMode') === 'e2e';
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function plainVector(vector = {}) {
  return {
    x: finiteNumber(vector.x),
    y: finiteNumber(vector.y),
    z: finiteNumber(vector.z),
  };
}

function plainPose(pose = {}) {
  return {
    position: plainVector(pose.position),
    facing: plainVector(pose.facing || { z: -1 }),
  };
}

function actorIdFor(specimen) {
  return specimen?.instanceId || specimen?.id || null;
}

function specimenPosition(state, specimen) {
  const actorId = actorIdFor(specimen);
  const runtime = state.specimenRuntimePositions?.[state.currentZoneId]?.[actorId];
  const spawn = specimen?.spawnPoint || [0, 0, 0];
  return {
    x: finiteNumber(runtime?.x, finiteNumber(spawn[0])),
    y: finiteNumber(runtime?.y, finiteNumber(spawn[1])),
    z: finiteNumber(runtime?.z, finiteNumber(spawn[2])),
  };
}

function squaredDistance(a, b) {
  const dx = finiteNumber(a?.x) - finiteNumber(b?.x);
  const dz = finiteNumber(a?.z) - finiteNumber(b?.z);
  return dx * dx + dz * dz;
}

function summarizeExamineSession(session) {
  if (!session) return null;
  return {
    id: session.id || null,
    kind: session.kind || null,
    actorId: session.actorId || null,
    typeId: session.typeId || null,
    name: session.name || null,
    latin: session.latin || null,
    focus: session.focus ? plainVector(session.focus) : null,
    frameHint: session.frameHint
      ? {
          height: finiteNumber(session.frameHint.height),
          radius: finiteNumber(session.frameHint.radius),
          closeup: Boolean(session.frameHint.closeup),
        }
      : null,
    noteSaved: Boolean(session.noteSaved),
    facts: Array.isArray(session.facts)
      ? session.facts.map(fact => ({
          id: fact.id || null,
          label: fact.label || null,
          value: fact.value || null,
          saved: Boolean(fact.saved),
        }))
      : [],
  };
}

function visibleCanvasInfo() {
  const canvas = document.querySelector('canvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    width: canvas.width,
    height: canvas.height,
    rect: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
    },
  };
}

function launchOverlayInfo() {
  const overlay = document.querySelector('[data-testid="three-launch-overlay"]');
  if (!overlay) return null;
  return {
    mode: overlay.getAttribute('data-mode') || null,
    text: overlay.innerText?.trim().replace(/\s+/g, ' ').slice(0, 500) || '',
  };
}

function gameplayHudReady() {
  return Boolean(document.querySelector('button[aria-label^="View "]'));
}

function waterResourceDescriptor(zoneId) {
  const interior = getInteriorDefinition(zoneId);
  const openOceanOnly = Boolean(interior);
  const detailedSurface = regionTypeRendersDetailedWater(getRegionMap(zoneId).type);
  return {
    skip: renderRuntime.waterEnabled === false
      || interior?.scene?.water === false
      || (!openOceanOnly && !detailedSurface),
    bakeRes: waterBakeResolutionForQuality(renderRuntime.waterQuality),
    options: {
      contactRes: waterContactResolutionForQuality(renderRuntime.waterQuality),
      openOceanOnly,
    },
  };
}

function makeReadiness({ trackProgress = true } = {}) {
  const state = useThreeGameStore.getState();
  const zoneId = state.currentZoneId;
  const phase = finiteNumber(renderRuntime.activeContentPhase);
  const phaseTarget = state.transition ? FULL_CONTENT_PHASE : finiteNumber(renderRuntime.contentTarget, FULL_CONTENT_PHASE);
  const canvas = visibleCanvasInfo();
  const launchOverlay = launchOverlayInfo();
  const interior = getInteriorDefinition(zoneId);
  const waterResource = waterResourceDescriptor(zoneId);
  const resources = {
    terrain: terrainResourceIsReady(zoneId, renderRuntime.terrainSegmentCap),
    border: Boolean(interior) || phaseTarget < 2 || borderVistaResourceIsReady(zoneId),
    ecology: Boolean(interior)
      || renderRuntime.worldDetailsEnabled === false
      || phaseTarget < 3
      || (state.transition
        ? regionEcologyResourceIsReady(zoneId)
        : ecologyIsCached(zoneId)),
    water: waterResource.skip || waterTextureResourceIsReady(
      zoneId,
      waterResource.bakeRes,
      waterResource.options,
    ),
    playerVisual: Boolean(renderRuntime.playerVisualReady),
    playerAnimationBanks: state.playableModeId !== 'darwin'
      || Boolean(renderRuntime.playerAnimationBanksReady),
  };
  const blockers = [];
  if (!renderRuntime.gameStarted) blockers.push('game-not-started');
  if (!canvas) blockers.push('canvas-missing');
  if (!renderRuntime.sceneReady) blockers.push('scene-not-committed');
  if (!renderRuntime.launchOverlayDismissed || launchOverlay) blockers.push('launch-overlay-visible');
  if (phase < phaseTarget) blockers.push(`content-phase-${phase}-of-${phaseTarget}`);
  for (const [name, ready] of Object.entries(resources)) {
    if (!ready) blockers.push(`resource-${name}`);
  }

  const visualCandidate = blockers.length === 0;
  const candidateKey = visualCandidate
    ? `${zoneId}:${state.transition?.id || 'settled'}:${phaseTarget}`
    : null;
  const stableFrames = frameRuntime.candidateKey === candidateKey ? frameRuntime.stableFrames : 0;
  const sceneCommitted = Boolean(renderRuntime.sceneReady && canvas && frameRuntime.frameRevision > 0);
  const visualReady = visualCandidate && sceneCommitted && stableFrames >= 2;
  const readiness = {
    version: HARNESS_VERSION,
    revision: progressRuntime.revision,
    lastProgressAt: progressRuntime.lastProgressAt || null,
    shellReady: Boolean(renderRuntime.gameStarted && canvas),
    sceneCommitted,
    overlayDismissed: Boolean(renderRuntime.launchOverlayDismissed && !launchOverlay),
    criticalResourcesReady: Object.values(resources).every(Boolean),
    renderPassReady: visualReady,
    visualReady,
    gameplayReady: visualReady && gameplayHudReady(),
    zoneId,
    transitionPhase: state.transition?.phase || null,
    contentPhase: phase,
    contentTarget: phaseTarget,
    frameRevision: frameRuntime.frameRevision,
    stableFrames,
    lastFrameAt: frameRuntime.lastFrameAt || null,
    resources,
    blockers,
    renderer: renderRuntime.renderer,
    backgroundLoadingStable: Boolean(renderRuntime.loadersStable),
  };

  if (trackProgress) {
    const progressKey = JSON.stringify({
      zoneId,
      transitionPhase: readiness.transitionPhase,
      contentPhase: phase,
      blockers,
      frameCandidate: frameRuntime.candidateKey,
      stableFrames,
    });
    if (progressRuntime.key !== progressKey) {
      progressRuntime = {
        key: progressKey,
        revision: progressRuntime.revision + 1,
        lastProgressAt: performance.now(),
      };
      readiness.revision = progressRuntime.revision;
      readiness.lastProgressAt = progressRuntime.lastProgressAt;
    }
  }

  return readiness;
}

function recordPresentedFrame() {
  const readiness = makeReadiness({ trackProgress: false });
  const candidateKey = readiness.blockers.length === 0
    ? `${readiness.zoneId}:${useThreeGameStore.getState().transition?.id || 'settled'}:${readiness.contentTarget}`
    : null;
  const sameCandidate = candidateKey && frameRuntime.candidateKey === candidateKey;
  frameRuntime = {
    candidateKey,
    frameRevision: frameRuntime.frameRevision + 1,
    stableFrames: candidateKey ? (sameCandidate ? frameRuntime.stableFrames + 1 : 1) : 0,
    lastFrameAt: performance.now(),
  };
}

function readinessRequirementsMet(readiness, requirements = {}) {
  if (requirements.shellReady === true && !readiness.shellReady) return false;
  if (requirements.sceneCommitted === true && !readiness.sceneCommitted) return false;
  if (requirements.visualReady === true && !readiness.visualReady) return false;
  if (requirements.gameplayReady === true && !readiness.gameplayReady) return false;
  if (requirements.criticalResourcesReady === true && !readiness.criticalResourcesReady) return false;
  if (Number.isFinite(requirements.contentPhaseAtLeast)
    && readiness.contentPhase < requirements.contentPhaseAtLeast) return false;
  if (requirements.zoneId && readiness.zoneId !== requirements.zoneId) return false;
  if (requirements.transitionPhase !== undefined
    && readiness.transitionPhase !== requirements.transitionPhase) return false;
  if (Number.isFinite(requirements.afterFrame)) {
    const framesAfter = Math.max(1, finiteNumber(requirements.framesAfter, 1));
    if (readiness.frameRevision < requirements.afterFrame + framesAfter) return false;
  }
  return true;
}

function makeSnapshot() {
  const state = useThreeGameStore.getState();
  const pose = getRuntimePlayerPose() || state.playerPose;
  return {
    currentZoneId: state.currentZoneId,
    playableModeId: state.playableModeId,
    viewMode: state.viewMode,
    activeToolId: state.activeToolId,
    carriedObjectId: state.carriedObjectId || null,
    carryDropRequest: state.carryDropRequest
      ? {
          id: state.carryDropRequest.id || null,
          requestId: finiteNumber(state.carryDropRequest.requestId),
          mode: state.carryDropRequest.mode || null,
          reason: state.carryDropRequest.reason || null,
        }
      : null,
    carryPrompt: state.carryPrompt
      ? {
          id: state.carryPrompt.id || null,
          mode: state.carryPrompt.mode || null,
          distance: finiteNumber(state.carryPrompt.distance),
        }
      : null,
    contextPrompt: state.contextPrompt
      ? {
          id: state.contextPrompt.id || null,
          source: state.contextPrompt.source || null,
          keyLabel: state.contextPrompt.keyLabel || null,
          label: state.contextPrompt.label || null,
        }
      : null,
    fieldAction: state.fieldAction
      ? {
          id: state.fieldAction.id,
          kind: state.fieldAction.kind,
          toolId: state.fieldAction.toolId,
          label: state.fieldAction.label,
          targetId: state.fieldAction.target?.id || null,
          targetKind: state.fieldAction.target?.kind || null,
        }
      : null,
    observationMode: Boolean(state.observationMode),
    toolbarOrder: Array.isArray(state.toolbarOrder) ? [...state.toolbarOrder] : [],
    transition: state.transition
      ? {
          zoneId: state.transition.zoneId || null,
          phase: state.transition.phase || null,
        }
      : null,
    statusViewOpen: Boolean(state.statusViewOpen),
    symsDirective: state.symsDirective || null,
    symsZoneId: state.symsZoneId || null,
    symsPose: (() => {
      const pose = getNpcPoses(state.currentZoneId)?.get('syms');
      return pose ? plainVector(pose) : null;
    })(),
    activeNpcEncounterId: state.activeNpcEncounter?.npcId || null,
    nearbySpecimenId: state.nearbySpecimenId || null,
    selectedSpecimenId: state.selectedSpecimenId || null,
    inventoryCount: Array.isArray(state.inventory) ? state.inventory.length : 0,
    journalCount: Array.isArray(state.journal) ? state.journal.length : 0,
    assessmentTranscriptCount: Array.isArray(state.assessmentPlayerTranscript) ? state.assessmentPlayerTranscript.length : 0,
    health: finiteNumber(state.health),
    curiosity: finiteNumber(state.curiosity),
    fatigue: finiteNumber(state.fatigue),
    consultedBookIds: Array.isArray(state.consultedBookIds) ? [...state.consultedBookIds] : [],
    readableBookSession: state.readableBookSession
      ? {
          bookId: state.readableBookSession.bookId || null,
          page: finiteNumber(state.bookLastPages?.[state.readableBookSession.bookId], 1),
        }
      : null,
    interiorPrompt: state.interiorPrompt
      ? {
          id: state.interiorPrompt.id || null,
          mode: state.interiorPrompt.mode || null,
          bookId: state.interiorPrompt.bookId || null,
        }
      : null,
    examinedTypeIds: Array.isArray(state.examinedTypeIds) ? [...state.examinedTypeIds] : [],
    collectedSpecimenIds: Array.isArray(state.collectedSpecimenIds) ? [...state.collectedSpecimenIds] : [],
    collectedSpecimenActorIds: Array.isArray(state.collectedSpecimenActorIds) ? [...state.collectedSpecimenActorIds] : [],
    documentedSpecimenIds: Array.isArray(state.documentedSpecimenIds) ? [...state.documentedSpecimenIds] : [],
    animalDroppingsCount: Array.isArray(state.animalDroppings) ? state.animalDroppings.length : 0,
    animalModeStats: state.animalModeStats || {},
    expeditionOutcome: state.expeditionOutcome
      ? {
          type: state.expeditionOutcome.type || null,
          source: state.expeditionOutcome.source || null,
          phase: state.expeditionOutcome.phase || null,
          cause: state.expeditionOutcome.cause || null,
      }
      : null,
    finalAssessment: state.finalAssessment
      ? {
          phase: state.finalAssessment.phase || null,
          source: state.finalAssessment.source || null,
          overall: finiteNumber(state.finalAssessment.profile?.overall),
          verdict: state.finalAssessment.profile?.verdict || null,
          transcriptAdjustment: finiteNumber(state.finalAssessment.profile?.interactionAudit?.adjustment),
          transcriptClassification: state.finalAssessment.profile?.interactionAudit?.classification || null,
          conductCap: state.finalAssessment.profile?.interactionAudit?.conductCap ?? null,
        }
      : null,
    examineSession: summarizeExamineSession(state.examineSession),
    message: state.message || null,
    playerPose: plainPose(pose),
    canvas: visibleCanvasInfo(),
    launchOverlay: launchOverlayInfo(),
    gameplayHudReady: gameplayHudReady(),
    activeContentPhase: finiteNumber(renderRuntime.activeContentPhase),
    contentSettled: finiteNumber(renderRuntime.activeContentPhase) >= 6,
    renderer: renderRuntime.renderer,
    readiness: makeReadiness(),
  };
}

function findNearestSpecimen() {
  const state = useThreeGameStore.getState();
  const playerPose = getRuntimePlayerPose() || state.playerPose;
  const playerPosition = playerPose?.position || state.playableSpawnPoint || { x: 0, y: 0, z: 0 };
  const collectedActors = new Set(state.collectedSpecimenActorIds || []);
  const hiddenActorId = state.playableHiddenActorId || null;
  let nearest = null;

  for (const specimen of getThreeSpecimens(state.currentZoneId)) {
    const actorId = actorIdFor(specimen);
    if (!actorId || actorId === hiddenActorId || collectedActors.has(actorId)) continue;
    const position = specimenPosition(state, specimen);
    const distanceSq = squaredDistance(playerPosition, position);
    if (!nearest || distanceSq < nearest.distanceSq) {
      nearest = {
        actorId,
        specimenId: specimen.id || actorId,
        name: specimen.name || actorId,
        latin: specimen.latin || null,
        position,
        distance: Math.sqrt(distanceSq),
        distanceSq,
      };
    }
  }

  if (!nearest) return null;
  return {
    actorId: nearest.actorId,
    specimenId: nearest.specimenId,
    name: nearest.name,
    latin: nearest.latin,
    position: nearest.position,
    distance: nearest.distance,
  };
}

function waitForPredicate(predicate, timeoutMs = 75000, label = 'condition') {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      try {
        const value = predicate();
        if (value) {
          resolve(value);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${label}.`));
        return;
      }
      window.setTimeout(tick, 250);
    };
    tick();
  });
}

function waitForReadiness(requirements = {}, timeoutMs = 75000) {
  return waitForPredicate(() => {
    const readiness = makeReadiness();
    return readinessRequirementsMet(readiness, requirements)
      ? { readiness, state: makeSnapshot() }
      : null;
  }, timeoutMs, `readiness ${JSON.stringify(requirements)}`).catch(error => {
    const readiness = makeReadiness();
    throw new Error(`${error.message} Last readiness: ${JSON.stringify(readiness)}`);
  });
}

function createHarnessApi() {
  const api = {
    version: HARNESS_VERSION,
    isEnabled: () => true,
    getState: () => makeSnapshot(),
    getReadiness: () => makeReadiness(),
    waitForReadiness,
    getPlayerPose: () => makeSnapshot().playerPose,
    getExamineSubjectDebug: () => {
      const state = useThreeGameStore.getState();
      const actorId = state.examineSession?.actorId;
      if (!actorId) return null;
      const pose = getSpecimenRuntimePoses(state.currentZoneId)?.get(actorId);
      const bounds = getSpecimenRuntimeBounds(state.currentZoneId)?.get(actorId);
      return {
        actorId,
        zoneId: state.currentZoneId,
        pose: pose ? plainVector(pose) : null,
        bounds: bounds
          ? { height: finiteNumber(bounds.height), radius: finiteNumber(bounds.radius) }
          : null,
      };
    },
    waitForSceneReady: (timeoutMs = 75000) => waitForReadiness({ visualReady: true }, timeoutMs),
    waitForGameplayReady: (timeoutMs = 75000) => waitForReadiness({ gameplayReady: true }, timeoutMs),
    setMode: modeId => {
      useThreeGameStore.getState().setPlayableMode(modeId);
      return makeSnapshot();
    },
    setZone: zoneId => {
      const store = useThreeGameStore.getState();
      if (!zoneId) return makeSnapshot();
      if (store.currentZoneId === zoneId) return makeSnapshot();
      store.beginZoneTransition(zoneId, {
        minutes: 0,
        fatigue: 0,
        source: 'e2e',
        localTransition: true,
      });
      useThreeGameStore.getState().completeZoneTransition();
      return makeSnapshot();
    },
    prepareTravel: async zoneId => {
      if (!zoneId) return null;
      const startedAt = performance.now();
      prefetchRegionTerrainTextures(zoneId);
      const completionMs = {};
      const [terrainResource, borderResource, ecologyResource, waterResource, mapPreparation] = await Promise.all([
        prepareTerrainResource(zoneId, 200).then(value => {
          completionMs.terrain = performance.now() - startedAt;
          return value;
        }),
        prepareBorderVistaResource(zoneId).then(value => {
          completionMs.border = performance.now() - startedAt;
          return value;
        }),
        prepareRegionEcologyResource(zoneId).then(value => {
          completionMs.ecology = performance.now() - startedAt;
          return value;
        }),
        prepareWaterTextureResource(zoneId, 256).then(value => {
          completionMs.water = performance.now() - startedAt;
          return value;
        }),
        prefetchIslandMapImage().then(value => {
          completionMs.map = performance.now() - startedAt;
          return value;
        }),
      ]);
      return {
        zoneId,
        ready: true,
        durationMs: performance.now() - startedAt,
        completionMs,
        terrainPreparation: terrainResource.preparation || null,
        borderPreparation: borderResource.preparation || null,
        ecologyPreparation: ecologyResource.preparation || null,
        waterPreparation: waterResource ? { mode: 'generated-texture' } : null,
        mapPreparation,
      };
    },
    travelTo: zoneId => {
      const store = useThreeGameStore.getState();
      if (!zoneId || store.currentZoneId === zoneId || store.transition) return makeSnapshot();
      store.beginZoneTransition(zoneId, {
        source: 'edge',
        mode: 'island',
        minutes: 0,
        fatigue: 0,
      });
      return makeSnapshot();
    },
    setTool: toolId => {
      useThreeGameStore.getState().setActiveTool(toolId);
      return makeSnapshot();
    },
    setViewMode: viewMode => {
      if (!['shoulder', 'hero', 'first', 'top'].includes(viewMode)) return makeSnapshot();
      useThreeGameStore.setState({ viewMode });
      return makeSnapshot();
    },
    openNpcEncounter: (npcId = 'syms_covington') => {
      useThreeGameStore.getState().openNpcEncounter(npcId);
      return makeSnapshot();
    },
    setSymsDirective: directive => {
      useThreeGameStore.getState().setSymsDirective(directive);
      return makeSnapshot();
    },
    toggleSymsFieldCase: () => {
      emitPropEvent('toggle-syms-field-case', { id: SYMS_FIELD_CASE_ID });
      return true;
    },
    interact: () => {
      setTouchControl('interact', true);
      return makeSnapshot();
    },
    setCarriedObject: objectId => {
      useThreeGameStore.getState().setCarriedObject(objectId || null);
      return makeSnapshot();
    },
    openStatus: () => {
      useThreeGameStore.getState().openStatusView();
      return makeSnapshot();
    },
    closeStatus: () => {
      useThreeGameStore.getState().closeStatusView();
      return makeSnapshot();
    },
    triggerIncrementalCollapse: () => {
      useThreeGameStore.getState().applyCactusDamage(1000);
      return makeSnapshot();
    },
    triggerFatalOutcome: (source = 'catastrophic_fall') => {
      useThreeGameStore.getState().applyFatalInjury(source);
      return makeSnapshot();
    },
    completeRecovery: () => {
      const store = useThreeGameStore.getState();
      store.beginIncapacitationRecovery();
      useThreeGameStore.getState().completeZoneTransition();
      return makeSnapshot();
    },
    selectNearestSpecimen: () => {
      const nearest = findNearestSpecimen();
      if (!nearest) return null;
      const store = useThreeGameStore.getState();
      store.setNearbySpecimen(nearest.actorId);
      store.setSelectedSpecimen(nearest.actorId);
      return nearest;
    },
    openExamineNearestSpecimen: () => {
      const nearest = api.selectNearestSpecimen();
      if (!nearest) return null;
      useThreeGameStore.getState().openExamine(nearest.actorId);
      return makeSnapshot().examineSession;
    },
    openExamineSpecimen: actorId => {
      if (!actorId) return null;
      const store = useThreeGameStore.getState();
      const specimen = getThreeSpecimens(store.currentZoneId).find(item => (
        actorIdFor(item) === actorId
        || item.localInstanceId === actorId
        || item.id === actorId
      ));
      const resolvedActorId = actorIdFor(specimen);
      if (!resolvedActorId) return null;
      store.setNearbySpecimen(resolvedActorId);
      store.setSelectedSpecimen(resolvedActorId);
      useThreeGameStore.getState().openExamine(resolvedActorId);
      return makeSnapshot().examineSession;
    },
    closeExamine: () => {
      useThreeGameStore.getState().closeExamine();
      return makeSnapshot();
    },
    saveExamineNote: (content = 'E2E field note: observed through Playwright smoke automation.') => (
      useThreeGameStore.getState().saveExamineNote(content)
    ),
    openBook: bookId => {
      useThreeGameStore.getState().openReadableBook(bookId);
      return makeSnapshot();
    },
    setBookPage: page => {
      const store = useThreeGameStore.getState();
      store.setReadableBookPage(store.readableBookSession?.bookId, page);
      return makeSnapshot();
    },
    saveBookNote: content => useThreeGameStore.getState().saveReadableBookNote(content),
    closeBook: () => {
      useThreeGameStore.getState().closeReadableBook();
      return makeSnapshot();
    },
    restInInterior: label => {
      useThreeGameStore.getState().restInInterior(label);
      return makeSnapshot();
    },
    collectFromExamine: async () => useThreeGameStore.getState().collectFromExamine(),
    collectSelected: async () => {
      const state = useThreeGameStore.getState();
      return state.collectNearby(state.selectedSpecimenId || state.nearbySpecimenId || null);
    },
    recordAnimalAction: (actionId, payload = {}) => {
      const store = useThreeGameStore.getState();
      store.recordAnimalModeAction({ ...payload, actionId });
      if (actionId === 'defecate') {
        const pose = getRuntimePlayerPose() || store.playerPose;
        store.addAnimalDropping({
          id: `e2e-dropping-${Date.now()}`,
          sourceModeId: store.playableModeId,
          position: pose?.position,
          kind: store.playableModeId === 'finch' ? 'bird' : 'animal',
        });
      }
      return makeSnapshot();
    },
  };

  return api;
}

export function ThreeE2EFrameSignal({ enabled = false }) {
  useFrame(() => {
    if (enabled) recordPresentedFrame();
  });
  return null;
}

export function ThreeE2EHarness({
  activeContentPhase = 0,
  contentTarget = FULL_CONTENT_PHASE,
  renderer = null,
  gameStarted = false,
  sceneReady = false,
  launchOverlayDismissed = false,
  playerVisualReady = false,
  playerAnimationBanksReady = false,
  loadersStable = false,
  terrainSegmentCap = null,
  waterEnabled = true,
  waterQuality = 'polished',
  worldDetailsEnabled = true,
}) {
  useEffect(() => {
    renderRuntime = {
      activeContentPhase,
      contentTarget,
      renderer,
      gameStarted,
      sceneReady,
      launchOverlayDismissed,
      playerVisualReady,
      playerAnimationBanksReady,
      loadersStable,
      terrainSegmentCap,
      waterEnabled,
      waterQuality,
      worldDetailsEnabled,
    };
    return () => {
      renderRuntime = {
        activeContentPhase: 0,
        contentTarget: FULL_CONTENT_PHASE,
        renderer: null,
        gameStarted: false,
        sceneReady: false,
        launchOverlayDismissed: false,
        playerVisualReady: false,
        playerAnimationBanksReady: false,
        loadersStable: false,
        terrainSegmentCap: null,
        waterEnabled: true,
        waterQuality: 'polished',
        worldDetailsEnabled: true,
      };
    };
  }, [
    activeContentPhase,
    contentTarget,
    gameStarted,
    launchOverlayDismissed,
    loadersStable,
    playerAnimationBanksReady,
    playerVisualReady,
    renderer,
    sceneReady,
    terrainSegmentCap,
    waterEnabled,
    waterQuality,
    worldDetailsEnabled,
  ]);

  useEffect(() => {
    if (!isE2EEnabled()) return undefined;
    const api = createHarnessApi();
    window.__darwinE2E = api;
    window.__darwinE2EReady = true;
    return () => {
      if (window.__darwinE2E === api) {
        delete window.__darwinE2E;
        delete window.__darwinE2EReady;
        frameRuntime = {
          candidateKey: null,
          frameRevision: 0,
          stableFrames: 0,
          lastFrameAt: 0,
        };
        progressRuntime = { key: '', revision: 0, lastProgressAt: 0 };
      }
    };
  }, []);

  return null;
}
