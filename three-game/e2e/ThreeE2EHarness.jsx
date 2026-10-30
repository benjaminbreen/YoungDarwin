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
import { getRuntimeObstacles, obstacleBaseY } from '../world/obstacles';
import { findAmbientFieldTarget } from '../fieldActions';
import { SYMS_FIELD_CASE_ID } from '../npcs/symsActivityPlan';
import { getPlayerHarnessBridge } from './playerHarnessBridge';
import { auditRenderIntegrity } from './renderIntegrity';

const HARNESS_VERSION = 4;
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

const storeTrace = { entries: [], unsubscribe: null };

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

function clampUnit(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
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
    fatigue: finiteNumber(state.fatigue),
    day: finiteNumber(state.day),
    timeOfDay: finiteNumber(state.timeOfDay),
    expeditionDeparted: Boolean(state.expeditionDeparted),
    finalAssessmentPhase: state.finalAssessment?.phase || null,
    restSession: state.restSession
      ? { phase: state.restSession.phase, title: state.restSession.title || null }
      : null,
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

function playerPosition() {
  const state = useThreeGameStore.getState();
  const pose = getRuntimePlayerPose() || state.playerPose;
  return plainVector(pose?.position || state.playableSpawnPoint || {});
}

function round2(value) {
  return Math.round(finiteNumber(value) * 100) / 100;
}

// Everything an agent might want to walk to, nearest first: rocks and other
// obstacles, specimens (live positions) and NPCs. Positions are world x/z.
function listNearbyTargets({ radius = 20, limit = 25, kinds = null } = {}) {
  const state = useThreeGameStore.getState();
  const zoneId = state.currentZoneId;
  const origin = playerPosition();
  const wanted = kinds ? new Set(Array.isArray(kinds) ? kinds : [kinds]) : null;
  const items = [];
  const push = item => {
    const distance = Math.sqrt(squaredDistance(origin, item));
    if (distance > radius) return;
    if (wanted && !wanted.has(item.category)) return;
    items.push({ ...item, x: round2(item.x), z: round2(item.z), radius: round2(item.radius), distance: round2(distance) });
  };
  for (const obstacle of getRuntimeObstacles(zoneId)) {
    push({
      category: 'obstacle',
      id: obstacle.id,
      kind: obstacle.kind || null,
      x: obstacle.x,
      z: obstacle.z,
      radius: obstacle.radius || 0.5,
    });
  }
  const collectedActors = new Set(state.collectedSpecimenActorIds || []);
  const poses = getSpecimenRuntimePoses(zoneId);
  for (const specimen of getThreeSpecimens(zoneId)) {
    const actorId = actorIdFor(specimen);
    if (!actorId || collectedActors.has(actorId) || actorId === state.playableHiddenActorId) continue;
    const pose = poses?.get(actorId) || specimenPosition(state, specimen);
    push({
      category: 'specimen',
      id: actorId,
      kind: specimen.id || null,
      name: specimen.name || null,
      examined: (state.examinedTypeIds || []).includes(specimen.id),
      x: pose.x,
      z: pose.z,
      radius: 0.4,
    });
  }
  for (const [npcId, pose] of getNpcPoses(zoneId) || []) {
    push({ category: 'npc', id: npcId, kind: 'npc', x: pose.x, z: pose.z, radius: 0.45 });
  }
  items.sort((a, b) => a.distance - b.distance);
  return { origin: { x: round2(origin.x), y: round2(origin.y), z: round2(origin.z) }, zoneId, items: items.slice(0, limit) };
}

function resolveTarget(target) {
  if (target && typeof target === 'object' && Number.isFinite(target.x) && Number.isFinite(target.z)) {
    return { x: target.x, z: target.z, radius: finiteNumber(target.radius, 0), id: target.id || null };
  }
  const { items } = listNearbyTargets({ radius: Infinity, limit: Infinity });
  if (typeof target !== 'string' || !target) return null;
  // Exact id first, then category shorthands ("rock", "specimen", "npc"),
  // then a substring of id/kind/name.
  const exact = items.find(item => item.id === target);
  if (exact) return exact;
  if (target === 'rock') return items.find(item => /rock|boulder|basalt|scoria|outcrop|lava/i.test(`${item.kind} ${item.id}`)) || null;
  if (target === 'specimen' || target === 'npc' || target === 'obstacle') return items.find(item => item.category === target) || null;
  if (target === 'unexamined') return items.find(item => item.category === 'specimen' && !item.examined) || null;
  const needle = target.toLowerCase();
  return items.find(item => `${item.id} ${item.kind || ''} ${item.name || ''}`.toLowerCase().includes(needle)) || null;
}

function teleportPlayer(x, z, { heading = null, y = null } = {}) {
  const bridge = getPlayerHarnessBridge();
  if (!bridge) throw new Error('Player harness bridge is not registered (is the player mounted?).');
  return bridge.teleport({ x, z, y, heading });
}

// Steers the player with the analog touch stick (camera-relative, like a real
// joystick) until it is within `radius` of the point, stops making progress,
// or times out. Movement input is rotated by the camera yaw in
// PlayerController, so the world direction is rotated back by -yaw here.
// There is no pathfinding: when progress stalls it sidesteps at alternating
// angles for a moment (enough to slide round a boulder or a cactus), and only
// reports `stuck` once several detours have failed.
function walkPlayerTo(x, z, { radius = 0.9, run = false, timeoutMs = 20000, stallMs = 700, maxDetours = 6 } = {}) {
  const bridge = getPlayerHarnessBridge();
  if (!bridge) return Promise.reject(new Error('Player harness bridge is not registered.'));
  return new Promise(resolve => {
    const startedAt = performance.now();
    const start = playerPosition();
    let best = Infinity;
    let bestAt = startedAt;
    let detours = 0;
    let detour = null;
    const finish = reason => {
      setTouchControl('moveX', 0);
      setTouchControl('moveY', 0);
      setTouchControl('run', false);
      const end = playerPosition();
      resolve({
        reason,
        arrived: reason === 'arrived',
        distance: round2(Math.hypot(x - end.x, z - end.z)),
        travelled: round2(Math.hypot(end.x - start.x, end.z - start.z)),
        detours,
        elapsedMs: Math.round(performance.now() - startedAt),
        position: { x: round2(end.x), y: round2(end.y), z: round2(end.z) },
      });
    };
    const step = () => {
      const now = performance.now();
      const position = playerPosition();
      let dx = x - position.x;
      let dz = z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= radius) return finish('arrived');
      if (now - startedAt > timeoutMs) return finish('timeout');
      if (distance < best - 0.05) {
        best = distance;
        bestAt = now;
      } else if (!detour && now - bestAt > stallMs) {
        if (detours >= maxDetours) return finish('stuck');
        detours += 1;
        const side = detours % 2 === 1 ? 1 : -1;
        detour = { angle: side * (Math.PI / 2.4 + detours * 0.12), until: now + 450 + detours * 120 };
        bestAt = now;
      }
      if (detour && now > detour.until) detour = null;
      if (detour) {
        const cosA = Math.cos(detour.angle);
        const sinA = Math.sin(detour.angle);
        [dx, dz] = [dx * cosA + dz * sinA, -dx * sinA + dz * cosA];
      }
      const length = Math.hypot(dx, dz) || 1;
      const yaw = finiteNumber(bridge.getCameraYaw?.());
      const cos = Math.cos(-yaw);
      const sin = Math.sin(-yaw);
      setTouchControl('moveX', (dx * cos + dz * sin) / length);
      setTouchControl('moveY', (-dx * sin + dz * cos) / length);
      setTouchControl('run', Boolean(run));
      window.requestAnimationFrame(step);
      return undefined;
    };
    step();
  });
}

const OVERLAY_SELECTOR = [
  '[role="dialog"]',
  '[data-testid$="-modal"]',
  '[data-testid="examine-view"]',
  '[data-testid="pause-menu"]',
  '[data-testid="library-view"]',
  '[data-testid="gesture-wheel"]',
  '[data-testid="three-launch-overlay"]',
].join(',');

function openOverlays() {
  const seen = new Set();
  const result = [];
  for (const element of document.querySelectorAll(OVERLAY_SELECTOR)) {
    if (seen.has(element)) continue;
    seen.add(element);
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    result.push({
      testId: element.getAttribute('data-testid') || null,
      label: element.getAttribute('aria-label') || element.querySelector('h1,h2,h3')?.innerText?.trim() || null,
    });
  }
  return result;
}

// What the player would read on screen right now: the context prompt, the
// field-action verb, and the overlays covering the scene.
function describePrompt() {
  const state = useThreeGameStore.getState();
  return {
    contextPrompt: state.contextPrompt
      ? { keyLabel: state.contextPrompt.keyLabel || null, label: state.contextPrompt.label || null, source: state.contextPrompt.source || null }
      : null,
    fieldAction: state.fieldAction
      ? { kind: state.fieldAction.kind, label: state.fieldAction.label, toolId: state.fieldAction.toolId, targetId: state.fieldAction.target?.id || null }
      : null,
    activeToolId: state.activeToolId,
    message: state.message || null,
    overlays: openOverlays(),
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
      window.setTimeout(tick, 50);
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
    submitNarratorCommand: async command => {
      await useThreeGameStore.getState().submitNarratorCommand(command);
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
    // The expedition is three days long and travel costs under two hours, so
    // reaching the departure any other way takes dozens of moves.
    advanceExpeditionClock: (minutes = 60) => {
      useThreeGameStore.getState().advanceTime(Number(minutes) || 0);
      return makeSnapshot();
    },
    beginRest: () => ({
      started: useThreeGameStore.getState().beginRest(),
      state: makeSnapshot(),
    }),
    // Reaching the exhaustion threshold honestly costs two minutes of holding
    // Shift, which no automated check can afford.
    setFatigue: value => {
      useThreeGameStore.setState({ fatigue: Math.max(0, Math.min(100, Number(value) || 0)) });
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
    // Ambient examination without walking into interaction range: builds the
    // same fieldTarget the E-key path produces for the chosen (default:
    // largest) rock obstacle in the zone, so procedure/camera flows over
    // Mineral sessions are drivable headlessly.
    openExamineFieldRock: (obstacleId = null) => {
      const state = useThreeGameStore.getState();
      const rocks = getRuntimeObstacles(state.currentZoneId)
        .filter(obstacle => /rock|boulder|basalt|scoria|outcrop|lava/i.test(`${obstacle.kind || ''} ${obstacle.id || ''}`));
      const rock = (obstacleId && rocks.find(item => item.id === obstacleId))
        || rocks.reduce((best, item) => ((item.radius || 0) > (best?.radius || 0) ? item : best), null);
      if (!rock) return null;
      const target = findAmbientFieldTarget({
        zoneId: state.currentZoneId,
        position: { x: rock.x + (rock.radius || 1) + 0.6, y: obstacleBaseY(rock), z: rock.z },
        facing: { x: -1, y: 0, z: 0 },
        obstacles: [rock],
      });
      if (!target) return null;
      state.openExamine({ fieldTarget: target });
      return makeSnapshot().examineSession;
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
    openLibrary: (options = {}) => {
      useThreeGameStore.getState().openLibrary(options);
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
    // Stowing aboard is the day-turn chokepoint; walking there costs a real
    // transit no automated check can afford.
    landCollection: () => {
      useThreeGameStore.getState().landCollectionAtBeagle();
      return makeSnapshot();
    },
    // landCollection leaves the debrief modal up, which blocks gameplay
    // input; multi-day flows must dismiss it before continuing.
    dismissNightlyDebrief: () => {
      useThreeGameStore.getState().dismissNightlyDebrief();
      return makeSnapshot();
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
    // --- Agent play primitives (harness v4) ---------------------------------
    teleport: (x, z, options = {}) => {
      const placed = teleportPlayer(Number(x), Number(z), options);
      return { placed, prompt: describePrompt() };
    },
    // Stand `distance` metres from the edge of a target (id, "rock",
    // "specimen", "unexamined", "npc", or {x,z,radius}) and face it.
    teleportNear: (target, { distance = 0.8, angle = null } = {}) => {
      const resolved = resolveTarget(target);
      if (!resolved) return { error: `No target matching ${JSON.stringify(target)}.` };
      const origin = playerPosition();
      const approach = Number.isFinite(angle)
        ? angle
        : Math.atan2(origin.x - resolved.x, origin.z - resolved.z);
      const offset = finiteNumber(resolved.radius) + distance;
      const x = resolved.x + Math.sin(approach) * offset;
      const z = resolved.z + Math.cos(approach) * offset;
      const placed = teleportPlayer(x, z, { heading: { x: resolved.x - x, z: resolved.z - z } });
      return { target: resolved, placed, prompt: describePrompt() };
    },
    face: target => {
      const resolved = resolveTarget(target);
      if (!resolved) return { error: `No target matching ${JSON.stringify(target)}.` };
      const origin = playerPosition();
      const placed = teleportPlayer(origin.x, origin.z, { heading: { x: resolved.x - origin.x, z: resolved.z - origin.z } });
      return { target: resolved, placed, prompt: describePrompt() };
    },
    walkTo: async (target, options = {}) => {
      const resolved = resolveTarget(target);
      if (!resolved) return { error: `No target matching ${JSON.stringify(target)}.` };
      const radius = options.radius ?? finiteNumber(resolved.radius) + 0.7;
      const walk = await walkPlayerTo(resolved.x, resolved.z, { ...options, radius });
      return { target: resolved, ...walk, prompt: describePrompt() };
    },
    walk: async (forward = 1, right = 0, durationMs = 1000, { run = false } = {}) => {
      setTouchControl('moveX', clampUnit(right));
      setTouchControl('moveY', clampUnit(-forward));
      setTouchControl('run', Boolean(run));
      await new Promise(resolve => window.setTimeout(resolve, Math.max(0, Number(durationMs) || 0)));
      setTouchControl('moveX', 0);
      setTouchControl('moveY', 0);
      setTouchControl('run', false);
      return { position: playerPosition(), prompt: describePrompt() };
    },
    setCameraYaw: yaw => {
      getPlayerHarnessBridge()?.setCameraYaw(Number(yaw));
      return getPlayerHarnessBridge()?.getCameraYaw() ?? null;
    },
    getCameraYaw: () => getPlayerHarnessBridge()?.getCameraYaw() ?? null,
    // Resolves once the player is grounded with no action playing (a teleport
    // can land as a short drop, and its landing action swallows input).
    waitForSettled: (timeoutMs = 3000, calmMs = 300) => {
      let calmSince = null;
      return waitForPredicate(() => {
        const motion = getPlayerHarnessBridge()?.getMotionState?.();
        const calm = motion && !motion.action && motion.jumpPhase === 'grounded' && motion.speed < 0.05;
        if (!calm) {
          calmSince = null;
          return false;
        }
        calmSince ??= performance.now();
        return performance.now() - calmSince >= calmMs;
      }, timeoutMs, 'player settled').then(() => true, () => false);
    },
    getMotionState: () => JSON.parse(JSON.stringify(getPlayerHarnessBridge()?.getMotionState?.() ?? null)),
    nearby: (options = {}) => listNearbyTargets(options),
    // Records every change to the named store fields with a short stack, so
    // "what closed the examine view?" is a lookup instead of a guess.
    traceStore: (...keys) => {
      storeTrace.unsubscribe?.();
      storeTrace.entries = [];
      if (!keys.length) return { tracing: [] };
      storeTrace.unsubscribe = useThreeGameStore.subscribe((next, previous) => {
        for (const key of keys) {
          if (next[key] === previous[key]) continue;
          const summarize = value => (value && typeof value === 'object'
            ? (value.name || value.id || value.kind || (Array.isArray(value) ? `[array ${value.length}]` : '[object]'))
            : value);
          storeTrace.entries.push({
            at: Math.round(performance.now()),
            key,
            from: summarize(previous[key]),
            to: summarize(next[key]),
            stack: (new Error().stack || '').split('\n').slice(2, 9).map(line => line.trim().replace(/https?:\/\/[^/]+\/_next\/static\/chunks\//, '')),
          });
          if (storeTrace.entries.length > 200) storeTrace.entries.shift();
        }
      });
      return { tracing: keys };
    },
    traceLog: () => storeTrace.entries.slice(),
    obstacle: id => {
      const obstacle = getRuntimeObstacles(useThreeGameStore.getState().currentZoneId).find(item => item.id === id);
      return obstacle ? JSON.parse(JSON.stringify(obstacle, (key, value) => (typeof value === 'function' ? undefined : value))) : null;
    },
    // Raw store fields by name, JSON-safe (functions and cycles dropped), for
    // questions the curated snapshot does not answer.
    store: (...keys) => {
      const state = useThreeGameStore.getState();
      const picked = keys.length ? Object.fromEntries(keys.map(key => [key, state[key]])) : Object.fromEntries(
        Object.entries(state).filter(([, value]) => typeof value !== 'function').map(([key, value]) => [
          key,
          Array.isArray(value) ? `[array ${value.length}]` : value && typeof value === 'object' ? '[object]' : value,
        ]),
      );
      const seen = new WeakSet();
      return JSON.parse(JSON.stringify(picked, (key, value) => {
        if (typeof value === 'function') return undefined;
        if (value && typeof value === 'object') {
          if (seen.has(value)) return '[cycle]';
          seen.add(value);
          if (value.isObject3D || value.isMaterial || value.isTexture) return `[three ${value.type}]`;
        }
        return value;
      }));
    },
    getPrompt: () => describePrompt(),
    getOverlays: () => openOverlays(),
    setTimeOfDay: hours => {
      useThreeGameStore.setState({ timeOfDay: Math.max(0, Math.min(24, Number(hours) || 0)) });
      return makeSnapshot().timeOfDay;
    },
    renderAudit: (options = {}) => auditRenderIntegrity(window.__darwinScene, options),
    // Compact one-call status for an agent loop: where am I, what can I do,
    // what is covering the screen, is the scene healthy.
    look: () => {
      const state = useThreeGameStore.getState();
      const audit = auditRenderIntegrity(window.__darwinScene, { summaryOnly: true });
      return {
        zoneId: state.currentZoneId,
        mode: state.playableModeId,
        viewMode: state.viewMode,
        position: playerPosition(),
        cameraYaw: getPlayerHarnessBridge()?.getCameraYaw() ?? null,
        timeOfDay: finiteNumber(state.timeOfDay),
        day: finiteNumber(state.day),
        health: finiteNumber(state.health),
        fatigue: finiteNumber(state.fatigue),
        inventoryCount: Array.isArray(state.inventory) ? state.inventory.length : 0,
        examinedCount: Array.isArray(state.examinedTypeIds) ? state.examinedTypeIds.length : 0,
        examineSession: summarizeExamineSession(state.examineSession),
        prompt: describePrompt(),
        nearby: listNearbyTargets({ radius: 12, limit: 8 }).items,
        render: audit,
        ready: makeReadiness().gameplayReady,
      };
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
