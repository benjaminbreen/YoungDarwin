'use client';

import { useEffect } from 'react';
import { getThreeSpecimens } from '../data';
import { setTouchControl } from '../input/touchControls';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';

const HARNESS_VERSION = 1;

function isE2EEnabled() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('e2e') || params.get('testMode') === 'e2e';
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

function makeSnapshot() {
  const state = useThreeGameStore.getState();
  const pose = getRuntimePlayerPose() || state.playerPose;
  return {
    currentZoneId: state.currentZoneId,
    playableModeId: state.playableModeId,
    activeToolId: state.activeToolId,
    carriedObjectId: state.carriedObjectId || null,
    carryPrompt: state.carryPrompt
      ? {
          id: state.carryPrompt.id || null,
          mode: state.carryPrompt.mode || null,
          distance: finiteNumber(state.carryPrompt.distance),
        }
      : null,
    toolbarOrder: Array.isArray(state.toolbarOrder) ? [...state.toolbarOrder] : [],
    statusViewOpen: Boolean(state.statusViewOpen),
    nearbySpecimenId: state.nearbySpecimenId || null,
    selectedSpecimenId: state.selectedSpecimenId || null,
    inventoryCount: Array.isArray(state.inventory) ? state.inventory.length : 0,
    journalCount: Array.isArray(state.journal) ? state.journal.length : 0,
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
    examineSession: summarizeExamineSession(state.examineSession),
    message: state.message || null,
    playerPose: plainPose(pose),
    canvas: visibleCanvasInfo(),
    launchOverlay: launchOverlayInfo(),
    gameplayHudReady: gameplayHudReady(),
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

function createHarnessApi() {
  const api = {
    version: HARNESS_VERSION,
    isEnabled: () => true,
    getState: () => makeSnapshot(),
    getPlayerPose: () => makeSnapshot().playerPose,
    waitForSceneReady: (timeoutMs = 75000) => waitForPredicate(() => {
      const snapshot = makeSnapshot();
      return snapshot.canvas && !snapshot.launchOverlay ? snapshot : null;
    }, timeoutMs, '3D scene readiness'),
    waitForGameplayReady: (timeoutMs = 75000) => waitForPredicate(() => {
      const snapshot = makeSnapshot();
      return snapshot.canvas && !snapshot.launchOverlay && snapshot.gameplayHudReady ? snapshot : null;
    }, timeoutMs, '3D gameplay HUD readiness'),
    setMode: modeId => {
      useThreeGameStore.getState().setPlayableMode(modeId);
      return makeSnapshot();
    },
    setTool: toolId => {
      useThreeGameStore.getState().setActiveTool(toolId);
      return makeSnapshot();
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

export function ThreeE2EHarness() {
  useEffect(() => {
    if (!isE2EEnabled()) return undefined;
    const api = createHarnessApi();
    window.__darwinE2E = api;
    window.__darwinE2EReady = true;
    return () => {
      if (window.__darwinE2E === api) {
        delete window.__darwinE2E;
        delete window.__darwinE2EReady;
      }
    };
  }, []);

  return null;
}
