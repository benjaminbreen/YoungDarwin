'use client';

import { create } from 'zustand';
import {
  CASE_CAPACITY,
  INITIAL_SUPPLIES,
  SYMS_BONUS_JARS,
  specimenIsInsect,
  specimenNeedsJar,
} from '../data/inventoryItems';
import { baseSpecimens } from '../data/specimens';
import { createInitialExpeditionState } from '../game-core/save';
import { evaluateCollectionAttempt } from '../utils/expeditionSystems';
import { getThreeInitialNarration, getThreeIslandLocation, getThreeSpecimens, threeTools } from './data';
import {
  darwinThought,
  localNarratorFallback,
  specimenNarration,
  zoneNarration,
} from './narrator/narratorContent';
import {
  INITIAL_NARRATOR_TIME,
  SCRIPTED_NARRATION_COOLDOWN_MINUTES,
  appendNarratorEvents,
  createInitialNarratorLog,
  createNarratorEvent,
  gameClockMinutes,
  narrationPayloadToEvents,
  shouldAllowLlmFieldNote,
  shouldAllowLlmThought,
  textHash,
} from './narrator/narratorEvents';
import { currentZoneId, getTravelCardForRoute, getZone } from './world/floreanaZones';
import { getRegionWeather, tickWeatherSim } from './world/weatherDirector';
import { MOVEMENT_FATIGUE } from './components/player/playerConfig';

const MAX_HEALTH = 100;
const MAX_FATIGUE = 100;
const MAX_CURIOSITY = 100;
const HOURS_PER_DAY = 24;
const INITIAL_PLAYER_POSE = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  facing: Object.freeze({ x: 0, y: 0, z: -1 }),
});
// Minimap is low-resolution, so the player marker only needs a fresh pose
// object once the player has moved/turned a perceptible amount. Below these
// thresholds we reuse the existing minimapPlayerPose so walking doesn't
// re-render the (always-mounted) minimap subtree on every pose publish.
const MINIMAP_POSE_EPSILON = 0.2;
const MINIMAP_HEADING_EPSILON = 1.5;
const BASALT_SPECIMEN = baseSpecimens.find(specimen => specimen.id === 'basalt') || {
  id: 'basalt',
  name: 'Basalt Formation',
  latin: 'Lava basaltica',
  ontology: 'Mineral',
  description: 'Dark volcanic basalt from Floreana lava outcrops.',
  scientificValue: 6,
};
const HAMMER_TOOL = threeTools.find(tool => tool.id === 'hammer') || { id: 'hammer', name: 'Geological Hammer' };
const HANDS_TOOL = threeTools.find(tool => tool.id === 'hands') || { id: 'hands', name: 'Bare Hands' };

export const threeRuntimeState = {
  playerPose: {
    position: { ...INITIAL_PLAYER_POSE.position },
    facing: { ...INITIAL_PLAYER_POSE.facing },
  },
  footContacts: {
    left: { x: 0, y: 0, z: 0, groundY: 0, contact: 0, pulse: 0, phase: 0, active: false },
    right: { x: 0, y: 0, z: 0, groundY: 0, contact: 0, pulse: 0, phase: 0, active: false },
    lastStep: { side: null, id: 0, x: 0, y: 0, z: 0, intensity: 0, time: 0 },
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function specimenById(specimenId) {
  return baseSpecimens.find(specimen => specimen.id === specimenId) || null;
}

function advanceTimeState(state, minutes) {
  const totalHours = state.timeOfDay + minutes / 60;
  const dayDelta = Math.floor(totalHours / HOURS_PER_DAY);
  return {
    timeOfDay: ((totalHours % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY,
    day: state.day + dayDelta,
  };
}

function findRuntimeSpecimen(state, specimenId) {
  if (!specimenId) return null;
  return getThreeSpecimens(state.currentZoneId).find(specimen => (
    (specimen.instanceId || specimen.id) === specimenId || specimen.id === specimenId
  )) || null;
}

function narratorSessionId(seed) {
  if (typeof window === 'undefined') return `three-${seed || 'anonymous'}`;
  try {
    const key = 'young-darwin-three-narrator-session';
    const existing = window.sessionStorage?.getItem(key);
    if (existing) return existing;
    const next = `three-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage?.setItem(key, next);
    return next;
  } catch {
    return `three-${seed || 'anonymous'}`;
  }
}

function playerHeading(playerPose) {
  const facing = playerPose?.facing || {};
  const fx = Number(facing.x);
  const fz = Number(facing.z);
  if (!Number.isFinite(fx) || !Number.isFinite(fz)) return null;
  return Math.round(Math.atan2(fx, fz || -1) * (180 / Math.PI));
}

function nearbyPeopleContext(state, zone) {
  const people = [];
  const player = state.playerPose?.position || threeRuntimeState.playerPose.position || {};
  const px = Number(player.x);
  const pz = Number(player.z);
  if ((state.currentZoneId === 'POST_OFFICE_BAY' || state.currentZoneId === 'BEAGLE') && Number.isFinite(px) && Number.isFinite(pz)) {
    const distance = Math.hypot(px - 4.0, pz - 7.0);
    people.push(`Syms Covington is ${distance < 3 ? 'close by' : `${distance.toFixed(1)}m away`}; he is carrying labels, twine, and the specimen bag.`);
  }
  for (const npcId of zone?.npcs || []) {
    if (npcId !== 'syms_covington') people.push(`regional NPC present: ${npcId}`);
  }
  return people.slice(0, 4);
}

const LLM_RECENT_CONTEXT_KINDS = new Set(['player']);
const LLM_RECENT_CONTEXT_SOURCES = new Set(['player', 'llm', 'scripted-identity', 'scripted-place', 'local']);

function recentNarrationContext(log) {
  return (Array.isArray(log) ? log : [])
    .filter(entry => LLM_RECENT_CONTEXT_KINDS.has(entry?.kind))
    .filter(entry => !entry?.source || LLM_RECENT_CONTEXT_SOURCES.has(entry.source))
    .map(entry => {
      const text = String(entry?.text || '').trim();
      if (!text) return null;
      const speaker = entry.kind === 'player' ? 'You' : 'Narrator';
      return `${speaker}: ${text}`;
    })
    .filter(Boolean)
    .slice(-4);
}

function ambientThoughtPatch(state, { weather = state.weather, timeOfDay = state.timeOfDay, trigger = 'ambient' } = {}) {
  const zone = getZone(state.currentZoneId);
  const thoughtState = { ...state, weather, timeOfDay };
  const thought = darwinThought({ zone, weather, timeOfDay });
  if (!thought) return {};
  const nowMinutes = gameClockMinutes(thoughtState);
  const thoughtKey = `thought:${zone.id}:${trigger}:${weather}:${Math.floor(Number(timeOfDay) || 0)}`;
  const thoughtSeen = state.narratorScriptedKeys?.[thoughtKey];
  if (Number.isFinite(thoughtSeen) && nowMinutes - thoughtSeen < SCRIPTED_NARRATION_COOLDOWN_MINUTES) return {};
  return {
    narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
      darwinThought: thought,
    }, thoughtState, 'scripted-thought', { allowThought: true })),
    narratorScriptedKeys: {
      ...state.narratorScriptedKeys,
      [thoughtKey]: nowMinutes,
    },
  };
}

export function getRuntimePlayerPose() {
  return threeRuntimeState.playerPose;
}

export function updateRuntimePlayerPose(playerPose) {
  const position = playerPose?.position;
  const facing = playerPose?.facing;
  if (!position || !facing) return threeRuntimeState.playerPose;
  const x = Number(position.x);
  const y = Number(position.y);
  const z = Number(position.z);
  const fx = Number(facing.x);
  const fy = Number(facing.y);
  const fz = Number(facing.z);
  if (![x, y, z, fx, fy, fz].every(Number.isFinite)) return threeRuntimeState.playerPose;
  threeRuntimeState.playerPose.position.x = x;
  threeRuntimeState.playerPose.position.y = y;
  threeRuntimeState.playerPose.position.z = z;
  threeRuntimeState.playerPose.facing.x = fx;
  threeRuntimeState.playerPose.facing.y = fy;
  threeRuntimeState.playerPose.facing.z = fz;
  return threeRuntimeState.playerPose;
}

export function getRuntimeFootContacts() {
  return threeRuntimeState.footContacts;
}

export function updateRuntimeFootContacts(next = {}) {
  const target = threeRuntimeState.footContacts;
  ['left', 'right'].forEach(side => {
    const source = next[side];
    if (!source) return;
    const contact = target[side];
    const x = Number(source.x);
    const y = Number(source.y);
    const z = Number(source.z);
    const groundY = Number(source.groundY);
    const strength = Number(source.contact);
    const pulse = Number(source.pulse);
    const phase = Number(source.phase);
    if (Number.isFinite(x)) contact.x = x;
    if (Number.isFinite(y)) contact.y = y;
    if (Number.isFinite(z)) contact.z = z;
    if (Number.isFinite(groundY)) contact.groundY = groundY;
    if (Number.isFinite(strength)) contact.contact = clamp(strength, 0, 1);
    if (Number.isFinite(pulse)) contact.pulse = clamp(pulse, 0, 1);
    if (Number.isFinite(phase)) contact.phase = phase;
    contact.active = Boolean(source.active);
  });
  if (next.lastStep) {
    const source = next.lastStep;
    const id = Number(source.id);
    if (Number.isFinite(id) && id > target.lastStep.id) {
      target.lastStep.side = source.side === 'right' ? 'right' : 'left';
      target.lastStep.id = id;
      target.lastStep.x = Number.isFinite(Number(source.x)) ? Number(source.x) : target.lastStep.x;
      target.lastStep.y = Number.isFinite(Number(source.y)) ? Number(source.y) : target.lastStep.y;
      target.lastStep.z = Number.isFinite(Number(source.z)) ? Number(source.z) : target.lastStep.z;
      target.lastStep.intensity = clamp(Number(source.intensity) || 0, 0, 1);
      target.lastStep.time = Number.isFinite(Number(source.time)) ? Number(source.time) : target.lastStep.time;
    }
  }
  return target;
}

function makeJournalEntry({ specimen, tool, result, documented = false, location, day, timeOfDay }) {
  const condition = documented ? 'documented in field' : result.outcomeType.replace(/_/g, ' ');
  return {
    id: `${Date.now()}-${specimen.id}`,
    day,
    timeOfDay,
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
    toolbarOrder: ['shotgun', 'insect_net', 'snare', 'hammer', 'hands', 'sketch'],
    supplies: { ...INITIAL_SUPPLIES, spareJars: (INITIAL_SUPPLIES.spareJars || 0) + SYMS_BONUS_JARS },
    caseCapacity: CASE_CAPACITY,
    favoriteSpecimenIds: [],
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
    // 0-100 social meter: 0 = distrusted by settlers/crew, 100 = respected.
    // Nothing moves it yet; quest and dialogue outcomes call adjustLocalStanding.
    localStanding: 50,
  };
}

function createSceneSlice() {
  const initialZone = getZone(currentZoneId);
  const initialNarration = {
    ...getThreeInitialNarration(currentZoneId),
    ...(zoneNarration(initialZone, {
      day: 1,
      timeOfDay: INITIAL_NARRATOR_TIME,
      source: 'initial',
    }) || {}),
  };
  return {
    selectedSpecimenId: null,
    nearbySpecimenId: null,
    message: initialNarration.narration,
    educationalNote: initialNarration.educationalNote,
    narratorLog: createInitialNarratorLog(initialNarration),
    narratorPending: false,
    narratorError: null,
    narratorScriptedKeys: {
      [`zone:${currentZoneId}`]: 1 * 1440 + INITIAL_NARRATOR_TIME * 60,
    },
    weather: initialNarration.weather,
    // Narration/LLM weather pins the sky for a while; the island weather
    // simulation resumes authority once untilMinutes passes.
    weatherOverride: null,
    sounds: initialNarration.sounds,
    viewMode: 'shoulder',
    transition: null,
    edgePrompt: null,
    dismissedEdgePromptId: null,
    arrivalEdgeBlock: null,
    lastOutcome: null,
    physicsDebug: null,
    // Graphics-quality knobs mirrored from perfSettings so material-building
    // components can react without prop-threading through the whole scene tree.
    // Defaults match the 'performance' tier (the boot default).
    cheapMaterials: true,
    foliageDrawScale: 0.85,
    pushableObstacleOffsets: {},
    specimenRuntimePositions: {},
    playerPose: {
      position: { ...INITIAL_PLAYER_POSE.position },
      facing: { ...INITIAL_PLAYER_POSE.facing },
    },
    minimapPlayerPose: {
      x: 0,
      z: 0,
      heading: 180,
      zoneId: currentZoneId,
    },
    carryPrompt: null,
    carriedObjectId: null,
    inspectedObject: null,
    inspectedScreenPosition: null,
    solarGlare: {
      x: 0.5,
      y: 0.42,
      strength: 0,
      rawStrength: 0,
      directness: 0,
      warmth: 0,
      viewportPresence: 0,
      centerResponse: 0,
      visible: false,
    },
    underwaterCamera: {
      amount: 0,
      cameraY: 0,
    },
    brokenPropIds: [],
    sampledRockIds: [],
    harvestedCropIds: [],
    symsLine: 'Syms waits with labels, twine, and the specimen bag ready.',
  };
}

export const useThreeGameStore = create((set, get) => ({
  ...createExpeditionSlice(),
  ...createSceneSlice(),

  setActiveTool: activeToolId => set({ activeToolId }),
  moveToolbarSlot: (from, to) => set(state => {
    if (from === to || from < 0 || to < 0 || from >= state.toolbarOrder.length || to >= state.toolbarOrder.length) return {};
    const toolbarOrder = [...state.toolbarOrder];
    const [moved] = toolbarOrder.splice(from, 1);
    toolbarOrder.splice(to, 0, moved);
    return { toolbarOrder };
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
  appendNarratorEntry: entry => set(state => ({
    narratorLog: appendNarratorEvents(state.narratorLog, [
      createNarratorEvent({
        ...entry,
        day: entry?.day || state.day,
        timeOfDay: entry?.timeOfDay ?? state.timeOfDay,
      }),
    ]),
  })),
  setNearbySpecimen: nearbySpecimenId => set(state => {
    if (state.nearbySpecimenId === nearbySpecimenId) return {};
    const patch = { nearbySpecimenId };
    if (!nearbySpecimenId) return patch;

    const specimen = findRuntimeSpecimen(state, nearbySpecimenId);
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
    ) return {};
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
      ? {}
      : { carryPrompt }
  )),
  setInspectedObject: inspectedObject => set({ inspectedObject, inspectedScreenPosition: null }),
  setInspectedScreenPosition: inspectedScreenPosition => set({ inspectedScreenPosition }),
  clearInspectedObject: () => set({ inspectedObject: null, inspectedScreenPosition: null }),
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
    ) return {};
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
  setCarriedObject: carriedObjectId => set({ carriedObjectId }),
  setSpecimenRuntimePosition: (specimenId, position, zoneId = get().currentZoneId) => set(state => {
    const zone = zoneId || get().currentZoneId;
    const currentByZone = state.specimenRuntimePositions[zone] || {};
    const nextX = Number(position?.x);
    const nextY = Number(position?.y);
    const nextZ = Number(position?.z);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !Number.isFinite(nextZ)) return {};
    const current = currentByZone[specimenId] || {};
    if (
      Math.abs((current.x || 0) - nextX) < 0.001
      && Math.abs((current.y || 0) - nextY) < 0.001
      && Math.abs((current.z || 0) - nextZ) < 0.001
    ) return {};
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
  markPropBroken: (propId, loot = null) => set(state => {
    if (state.brokenPropIds.includes(propId)) return {};
    const supplies = { ...state.supplies };
    for (const [key, amount] of Object.entries(loot?.supplies || {})) {
      supplies[key] = (supplies[key] || 0) + amount;
    }
    const hasNarration = Boolean(loot?.message || loot?.syms);
    return {
      brokenPropIds: [...state.brokenPropIds, propId],
      supplies,
      ...(loot?.message ? { message: loot.message } : {}),
      ...(loot?.syms ? { symsLine: loot.syms } : {}),
      ...(hasNarration ? {
        narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
          narration: loot?.message,
          symsLine: loot?.syms,
        }, state, 'prop-break')),
      } : {}),
    };
  }),
  collectRockSample: sample => {
    const sourceRockKey = sample?.sourceRockKey || sample?.sampleId || sample?.id;
    if (!sourceRockKey) return false;
    let collected = false;

    set(state => {
      const promptBelongsToSample = state.carryPrompt?.sample?.sourceRockKey === sourceRockKey
        || state.carryPrompt?.id === sample?.sampleId;
      if (state.sampledRockIds.includes(sourceRockKey)) {
        collected = true;
        return promptBelongsToSample ? { carryPrompt: null } : {};
      }
      if (state.inventory.length >= state.caseCapacity) {
        const message = 'The specimen case is full. The basalt chip will have to wait.';
        const symsLine = 'Syms taps the case lid. "Not an inch of room left, sir."';
        return {
          message,
          symsLine,
          lastOutcome: null,
          narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
            narration: message,
            symsLine,
          }, state, 'blocked-action')),
        };
      }
      if (state.supplies.labels <= 0) {
        const message = 'No labels remain. An unlabeled rock chip would be nearly useless back aboard the Beagle.';
        const symsLine = 'Syms turns out his pockets. "A clean chip needs a clean label, sir."';
        return {
          message,
          symsLine,
          lastOutcome: null,
          narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
            narration: message,
            symsLine,
          }, state, 'blocked-action')),
        };
      }

      collected = true;
      const zoneId = sample?.zoneId || state.currentZoneId;
      const islandLocation = getThreeIslandLocation(zoneId);
      const specimen = specimenById(sample?.specimenId) || BASALT_SPECIMEN;
      const outcome = sample?.outcome || {};
      const sampleLabel = sample?.sampleLabel || specimen.name.toLowerCase();
      const result = {
        success: true,
        reason: outcome.collectMessage || `You collect a ${sampleLabel} and wrap it for the specimen case.`,
        outcomeType: outcome.condition || 'hammer_sample',
        evidence: outcome.evidence || `hammer-collected ${sampleLabel}`,
        damage: 0,
        scoreDelta: outcome.scoreDelta ?? 2,
        fatigueDelta: outcome.fatigueDelta ?? 1,
      };
      const entry = makeJournalEntry({
        specimen,
        tool: HAMMER_TOOL,
        result,
        documented: false,
        location: islandLocation,
        day: state.day,
        timeOfDay: state.timeOfDay,
      });

      const educationalNote = sample?.educationalNote || 'A hammer sample preserves a fresh fracture surface, which is often more useful than a weathered exterior.';
      const symsLine = outcome.symsLine || sample?.symsLine || `Syms wraps the ${sampleLabel}. "Best keep the locality clear on the label, sir."`;

      return {
        supplies: {
          ...state.supplies,
          labels: Math.max(0, state.supplies.labels - 1),
        },
        fatigue: clamp(state.fatigue + result.fatigueDelta, 0, MAX_FATIGUE),
        curiosity: clamp(state.curiosity + result.scoreDelta * 5, 0, MAX_CURIOSITY),
        inventory: [
          ...state.inventory,
          {
            ...specimen,
            condition: result.outcomeType,
            material: sample?.material || specimen.id,
            sampleLabel,
            quality: outcome.quality || 'field',
            sourceRockKey,
            sourceZoneId: zoneId,
            sampledAt: sample?.position || null,
          },
        ],
        journal: [...state.journal, entry],
        collectedSpecimenIds: state.collectedSpecimenIds.includes(specimen.id)
          ? state.collectedSpecimenIds
          : [...state.collectedSpecimenIds, specimen.id],
        sampledRockIds: [...state.sampledRockIds, sourceRockKey],
        questComplete: true,
        lastOutcome: { specimen, tool: HAMMER_TOOL, result, documented: false },
        message: result.reason,
        educationalNote,
        symsLine,
        narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
          narration: result.reason,
          symsLine,
          fieldNote: educationalNote,
        }, state, 'rock-sample', { allowFieldNote: true })),
        ...(promptBelongsToSample ? { carryPrompt: null } : {}),
      };
    });

    return collected;
  },
  // Harvest a settlement crop (E-prompt mode 'harvest-crop'). The first
  // plant of each kind is documented like a collected specimen; repeat
  // pickings just add provisions. Mirrors collectRockSample's shape.
  harvestCrop: crop => {
    const cropKey = crop?.cropId;
    if (!cropKey) return false;
    let collected = false;

    set(state => {
      const promptBelongsToCrop = state.carryPrompt?.crop?.cropId === cropKey
        || state.carryPrompt?.id === cropKey;
      if (state.harvestedCropIds.includes(cropKey)) {
        collected = true;
        return promptBelongsToCrop ? { carryPrompt: null } : {};
      }

      const specimen = specimenById(crop.specimenId);
      const firstOfKind = specimen && !state.collectedSpecimenIds.includes(specimen.id);
      if (firstOfKind && state.inventory.length >= state.caseCapacity) {
        const message = 'The specimen case is full; a cultivated plant sample will have to wait.';
        const symsLine = 'Syms weighs the case in one hand. "Not room for so much as a leaf, sir."';
        return {
          message,
          symsLine,
          lastOutcome: null,
          narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
            narration: message,
            symsLine,
          }, state, 'blocked-action')),
        };
      }

      collected = true;
      const zoneId = crop.zoneId || state.currentZoneId;
      const islandLocation = getThreeIslandLocation(zoneId);
      const reason = crop.harvestMessage || `You gather ${crop.label || 'a cultivated plant'}.`;
      const symsLine = crop.harvestSyms || state.symsLine;
      const patch = {
        harvestedCropIds: [...state.harvestedCropIds, cropKey],
        supplies: {
          ...state.supplies,
          food: (state.supplies.food || 0) + 1,
        },
        fatigue: clamp(state.fatigue + 1, 0, MAX_FATIGUE),
        message: reason,
        symsLine,
        educationalNote: crop.educationalNote || state.educationalNote,
        narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
          narration: reason,
          symsLine: crop.harvestSyms || null,
          fieldNote: firstOfKind ? crop.educationalNote : '',
        }, state, 'crop-harvest', { allowFieldNote: Boolean(firstOfKind && crop.educationalNote) })),
        ...(promptBelongsToCrop ? { carryPrompt: null } : {}),
      };

      if (firstOfKind) {
        const result = {
          success: true,
          reason,
          outcomeType: 'field_harvest',
          evidence: `hand-gathered ${specimen.name.toLowerCase()}`,
          damage: 0,
          scoreDelta: 2,
          fatigueDelta: 1,
        };
        const entry = makeJournalEntry({
          specimen,
          tool: HANDS_TOOL,
          result,
          documented: false,
          location: islandLocation,
          day: state.day,
          timeOfDay: state.timeOfDay,
        });
        patch.inventory = [
          ...state.inventory,
          {
            ...specimen,
            condition: result.outcomeType,
            quality: 'field',
            sourceZoneId: zoneId,
            sampledAt: crop.position || null,
          },
        ];
        patch.journal = [...state.journal, entry];
        patch.collectedSpecimenIds = [...state.collectedSpecimenIds, specimen.id];
        patch.curiosity = clamp(state.curiosity + result.scoreDelta * 5, 0, MAX_CURIOSITY);
        patch.questComplete = true;
        patch.lastOutcome = { specimen, tool: HANDS_TOOL, result, documented: false };
      }

      return patch;
    });

    return collected;
  },
  recordHammerStrikeFeedback: feedback => set(state => {
    const hasNarration = Boolean(feedback?.message || feedback?.symsLine);
    return {
      fatigue: clamp(state.fatigue + Math.max(0, feedback?.fatigueDelta || 0), 0, MAX_FATIGUE),
      message: feedback?.message || state.message,
      educationalNote: feedback?.educationalNote || state.educationalNote,
      symsLine: feedback?.symsLine || state.symsLine,
      ...(hasNarration ? {
        narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
          narration: feedback?.message,
          symsLine: feedback?.symsLine,
        }, state, 'hammer-feedback')),
      } : {}),
    };
  }),
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

  setWeather: weather => set(state => (
    state.weather === weather
      ? {}
      : {
          weather,
          ...ambientThoughtPatch(state, { weather, trigger: 'weather' }),
        }
  )),
  setWeatherOverride: weatherOverride => set({ weatherOverride }),

  statusViewOpen: false,
  openStatusView: () => set({ statusViewOpen: true }),
  closeStatusView: () => set({ statusViewOpen: false }),
  adjustLocalStanding: delta => set(state => ({
    localStanding: clamp(state.localStanding + delta, 0, 100),
  })),

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
    // Advance the island weather sim through the travel time, then arrive
    // under whatever sky the destination region currently has.
    const arrival = advanceTimeState(state, state.transition.minutes || 0);
    tickWeatherSim((arrival.day || 1) * 1440 + arrival.timeOfDay * 60);
    const arrivalWeather = getRegionWeather(zone.id) || zone.weather || state.weather;
    const arrivalState = { ...state, ...arrival, currentZoneId: zone.id, weather: arrivalWeather };
    const scripted = zoneNarration(zone, arrivalState);
    const thoughtKey = `thought:${zone.id}:arrival`;
    const nowMinutes = gameClockMinutes(arrivalState);
    const thoughtSeen = state.narratorScriptedKeys[thoughtKey];
    const thought = (!Number.isFinite(thoughtSeen) || nowMinutes - thoughtSeen >= SCRIPTED_NARRATION_COOLDOWN_MINUTES)
      ? darwinThought({ zone, weather: arrivalWeather, timeOfDay: arrival.timeOfDay })
      : null;
    const zoneKey = `zone:${zone.id}`;
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
      dismissedEdgePromptId: null,
      arrivalEdgeBlock: state.transition.entryEdge
        ? {
          zoneId: zone.id,
          edge: state.transition.entryEdge,
          clearance: 10,
          returnBand: 2.35,
        }
        : null,
      pushableObstacleOffsets: state.pushableObstacleOffsets,
      carryPrompt: null,
      carriedObjectId: null,
      selectedSpecimenId: null,
      nearbySpecimenId: null,
      message: scripted?.narration || zone.loadingNote || state.message,
      educationalNote: scripted?.educationalNote || zone.educationalNote || state.educationalNote,
      weather: arrivalWeather,
      weatherOverride: null,
      sounds: Array.isArray(zone.sounds) ? zone.sounds : state.sounds,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: scripted?.narration || zone.loadingNote,
        darwinThought: thought,
      }, arrivalState, 'scripted-zone', { allowThought: Boolean(thought) })),
      narratorScriptedKeys: {
        ...state.narratorScriptedKeys,
        [zoneKey]: nowMinutes,
        ...(thought ? { [thoughtKey]: nowMinutes } : {}),
      },
      playerSpawnId: state.transition.entryEdge || 'default',
      fatigue: clamp(state.fatigue + (state.transition.fatigue || 0), 0, MAX_FATIGUE),
      ...arrival,
    };
  }),

  cycleViewMode: () => set(state => ({
    viewMode: state.viewMode === 'shoulder' ? 'first' : state.viewMode === 'first' ? 'top' : 'shoulder',
  })),

  applyMovementCost: ({ running = false, walking = false, airborne = false, falling = 0, fatigueDelta = null } = {}) => set(state => ({
    fatigue: clamp(state.fatigue + (fatigueDelta ?? (
      (running ? MOVEMENT_FATIGUE.runningPerFrame60 : walking ? MOVEMENT_FATIGUE.walkingPerFrame60 : 0)
      + (airborne ? MOVEMENT_FATIGUE.airbornePerFrame60 : 0)
    )), 0, MAX_FATIGUE),
    health: clamp(state.health - Math.max(0, falling - 7.5) * 1.25, 0, MAX_HEALTH),
  })),

  applyDrowningDamage: amount => set(state => {
    const message = 'You are out of your depth — the sea is closing over you.';
    const symsLine = '"Sir! Back to the shallows — the Beagle has no second naturalist!"';
    return {
      health: clamp(state.health - Math.max(0, amount), 0, MAX_HEALTH),
      message,
      symsLine,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine,
      }, state, 'hazard')),
    };
  }),

  applyCactusDamage: (amount = 8) => set(state => {
    const message = 'You stagger back from the Opuntia spines.';
    const educationalNote = 'Large prickly pear cactus can dominate dry Galapagos scrub; its spines make careless movement costly.';
    const symsLine = '"Mind the cactus, sir. Those spines will write their own field note."';
    return {
      health: clamp(state.health - Math.max(0, amount), 0, MAX_HEALTH),
      message,
      educationalNote,
      symsLine,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine,
        fieldNote: educationalNote,
      }, state, 'hazard', { allowFieldNote: true })),
    };
  }),

  rest: () => set(state => {
    const provisioned = state.supplies.food > 0 && state.supplies.water > 0;
    const message = provisioned
      ? 'You rest for two hours in a strip of shade, sharing biscuit and water while Syms reorders the collecting bag.'
      : 'You rest for two hours in a strip of shade, but the provisions are gone — the rest does little good.';
    const educationalNote = 'Fieldwork depended on pacing: heat, daylight, and fatigue changed what a naturalist could safely collect.';
    return {
      ...advanceTimeState(state, 120),
      fatigue: clamp(state.fatigue - (provisioned ? 26 : 12), 0, MAX_FATIGUE),
      health: clamp(state.health + (provisioned ? 10 : 4), 0, MAX_HEALTH),
      supplies: {
        ...state.supplies,
        food: Math.max(0, state.supplies.food - 1),
        water: Math.max(0, state.supplies.water - 1),
      },
      message,
      educationalNote,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        fieldNote: educationalNote,
      }, state, 'rest', { allowFieldNote: true })),
    };
  }),

  applyNarration: (data, options = {}) => set(state => {
    const allowFieldNote = options.allowFieldNote ?? shouldAllowLlmFieldNote(data, options.playerInput || '');
    const allowThought = options.allowThought ?? shouldAllowLlmThought(data, options.playerInput || '', state);
    return {
      message: data.narration || state.message,
      educationalNote: allowFieldNote && data.educationalNote ? data.educationalNote : state.educationalNote,
      weather: data.weather || state.weather,
      // Hold narration weather for ~90 game minutes before the island
      // simulation takes the sky back.
      weatherOverride: data.weather
        ? { state: data.weather, untilMinutes: (state.day || 1) * 1440 + state.timeOfDay * 60 + 90 }
        : state.weatherOverride,
      sounds: Array.isArray(data.sounds) ? data.sounds.slice(0, 3) : state.sounds,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents(data, state, data.source || 'llm', {
        allowFieldNote,
        allowThought,
      })),
    };
  }),

  submitNarratorCommand: async input => {
    const trimmed = String(input || '').trim();
    if (!trimmed) return null;

    const isHelp = /^(?:hotkeys?|controls?|commands?|help)$/i.test(trimmed);
    let requestState = null;
    set(state => {
      requestState = state;
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
        narratorPending: isHelp ? state.narratorPending : true,
        narratorError: null,
      };
    });

    if (isHelp) return { local: true };

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
      state.currentZoneId,
      state.day,
      Math.round((state.timeOfDay || 0) * 60),
      textHash(trimmed),
    ].join(':');

    try {
      const response = await fetch('/api/three-narrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-young-darwin-session': narratorSessionId(state.seed),
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          eventType: 'player_action',
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
            curiosity: state.curiosity,
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
      const data = response.ok ? await response.json() : localNarratorFallback({ input: trimmed, nearbySpecimen });
      set({
        narratorPending: false,
        narratorError: data?.fallback ? 'Narration fell back to a local response.' : null,
      });
      get().applyNarration(data, { playerInput: trimmed });
      return data;
    } catch (error) {
      const fallback = localNarratorFallback({ input: trimmed, nearbySpecimen });
      set({
        narratorPending: false,
        narratorError: String(error?.message || error || 'Narration unavailable.'),
      });
      get().applyNarration(fallback, { playerInput: trimmed, allowFieldNote: false, allowThought: false });
      return fallback;
    }
  },

  collectNearby: async () => {
    const state = get();
    const specimenId = state.nearbySpecimenId || state.selectedSpecimenId;
    const zoneSpecimens = getThreeSpecimens(state.currentZoneId);
    const specimen = zoneSpecimens.find(item => (item.instanceId || item.id) === specimenId || item.id === specimenId);
    const tool = threeTools.find(item => item.id === state.activeToolId) || threeTools.find(item => item.id === 'hands');
    if (!specimen) return null;

    const islandLocation = getThreeIslandLocation(state.currentZoneId);
    const alreadyCollected = state.collectedSpecimenIds.includes(specimen.id);
    const documented = tool.id === 'sketch' || alreadyCollected;

    // Supplies and case space gate physical collection (documenting is always free).
    if (!documented) {
      const needsJar = specimenNeedsJar(specimen, tool.id);
      const blocked = state.inventory.length >= state.caseCapacity
        ? { message: 'The specimen case is full. Something must be documented and released, or carried loose at its peril.', syms: 'Syms taps the case lid. "Not an inch of room left, sir."' }
        : state.supplies.labels <= 0
          ? { message: 'No labels remain. An unlabeled specimen is a scientific orphan — better to document it instead.', syms: 'Syms turns out his pockets. "Last label went on the finch, sir."' }
          : needsJar && state.supplies.spareJars <= 0
            ? { message: 'No spirit jars remain for a wet specimen. Document it, or come back provisioned.', syms: 'Syms shakes the empty satchel. "Glass is all spoken for, sir."' }
            : tool.id === 'snare' && state.supplies.twine <= 0
              ? { message: 'No twine left to set a snare. The lizards remain at liberty.', syms: '"Used the last of the twine on the case lashings, sir."' }
	              : null;
      if (blocked) {
        set(current => ({
          message: blocked.message,
          symsLine: blocked.syms,
          lastOutcome: null,
          narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
            narration: blocked.message,
            symsLine: blocked.syms,
          }, current, 'blocked-action')),
        }));
        return null;
      }
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
        });

    const entry = makeJournalEntry({ specimen, tool, result, documented, location: islandLocation, day: state.day, timeOfDay: state.timeOfDay });
    const collected = result.success && !documented;
    const spendSupplies = current => {
      const supplies = { ...current.supplies };
      if (tool.id === 'snare') supplies.twine = Math.max(0, supplies.twine - 1);
      if (!collected) return supplies;
      supplies.labels = Math.max(0, supplies.labels - 1);
      if (specimenNeedsJar(specimen, tool.id)) supplies.spareJars = Math.max(0, supplies.spareJars - 1);
      if (specimenIsInsect(specimen)) supplies.pins = Math.max(0, supplies.pins - 2);
      return supplies;
    };

    set(current => {
      const educationalNote = documented
        ? 'Observation without collection was often the least damaging way to preserve locality and behavior evidence.'
        : 'Specimen condition, collection method, and locality determine scientific usefulness.';
      const symsLine = collected
        ? `Syms wraps the ${specimen.name} label twice. "That one will travel, sir."`
        : `Syms peers over your shoulder. "A note is better than a ruined specimen, sir."`;
      const source = documented ? 'documentation' : 'collection';
      return {
        supplies: spendSupplies(current),
        fatigue: clamp(current.fatigue + result.fatigueDelta, 0, MAX_FATIGUE),
        curiosity: clamp(current.curiosity + (documented ? 10 : result.scoreDelta * 5), 0, MAX_CURIOSITY),
        inventory: collected ? [...current.inventory, { ...specimen, condition: result.outcomeType }] : current.inventory,
        journal: [...current.journal, entry],
        collectedSpecimenIds: collected && !current.collectedSpecimenIds.includes(specimen.id)
          ? [...current.collectedSpecimenIds, specimen.id]
          : current.collectedSpecimenIds,
        documentedSpecimenIds: documented && !current.documentedSpecimenIds.includes(specimen.id)
          ? [...current.documentedSpecimenIds, specimen.id]
          : current.documentedSpecimenIds,
        questComplete: current.questComplete || collected || documented,
        lastOutcome: { specimen, tool, result, documented },
        message: result.reason,
        educationalNote,
        symsLine,
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: result.reason,
          symsLine,
          fieldNote: educationalNote,
        }, current, source, { allowFieldNote: true })),
      };
    });

    return result;
  },
}));
