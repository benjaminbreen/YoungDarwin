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

export const threeRuntimeState = {
  playerPose: {
    position: { ...INITIAL_PLAYER_POSE.position },
    facing: { ...INITIAL_PLAYER_POSE.facing },
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
  const initialNarration = getThreeInitialNarration(currentZoneId);
  return {
    selectedSpecimenId: null,
    nearbySpecimenId: null,
    message: initialNarration.narration,
    educationalNote: initialNarration.educationalNote,
    weather: initialNarration.weather,
    // Narration/LLM weather pins the sky for a while; the island weather
    // simulation resumes authority once untilMinutes passes.
    weatherOverride: null,
    sounds: initialNarration.sounds,
    viewMode: 'shoulder',
    transition: null,
    edgePrompt: null,
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
    brokenPropIds: [],
    sampledRockIds: [],
    symsLine: 'Syms waits with labels, twine, and a doubtful look at your boots.',
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
  setNearbySpecimen: nearbySpecimenId => set({ nearbySpecimenId }),
  setSelectedSpecimen: selectedSpecimenId => set({ selectedSpecimenId }),
  setPhysicsDebug: physicsDebug => set({ physicsDebug }),
  setGraphicsQuality: ({ cheapMaterials, foliageDrawScale }) => set(state => ({
    cheapMaterials: cheapMaterials ?? state.cheapMaterials,
    foliageDrawScale: foliageDrawScale ?? state.foliageDrawScale,
  })),
  setEdgePrompt: edgePrompt => set({ edgePrompt }),
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
    return {
      brokenPropIds: [...state.brokenPropIds, propId],
      supplies,
      ...(loot?.message ? { message: loot.message } : {}),
      ...(loot?.syms ? { symsLine: loot.syms } : {}),
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
        return {
          message: 'The specimen case is full. The basalt chip will have to wait.',
          symsLine: 'Syms taps the case lid. "Not an inch of room left, sir."',
          lastOutcome: null,
        };
      }
      if (state.supplies.labels <= 0) {
        return {
          message: 'No labels remain. An unlabeled rock chip would be nearly useless back aboard the Beagle.',
          symsLine: 'Syms turns out his pockets. "A clean chip needs a clean label, sir."',
          lastOutcome: null,
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
        educationalNote: sample?.educationalNote || 'A hammer sample preserves a fresh fracture surface, which is often more useful than a weathered exterior.',
        symsLine: outcome.symsLine || sample?.symsLine || `Syms wraps the ${sampleLabel}. "Best keep the locality clear on the label, sir."`,
        ...(promptBelongsToSample ? { carryPrompt: null } : {}),
      };
    });

    return collected;
  },
  recordHammerStrikeFeedback: feedback => set(state => ({
    fatigue: clamp(state.fatigue + Math.max(0, feedback?.fatigueDelta || 0), 0, MAX_FATIGUE),
    message: feedback?.message || state.message,
    educationalNote: feedback?.educationalNote || state.educationalNote,
    symsLine: feedback?.symsLine || state.symsLine,
  })),
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
  setTimeOfDay: hour => set({ timeOfDay: clamp(Number(hour) || 0, 0, HOURS_PER_DAY - 1 / 60) }),

  setWeather: weather => set(state => (state.weather === weather ? {} : { weather })),
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
      weather: getRegionWeather(zone.id) || zone.weather || state.weather,
      weatherOverride: null,
      sounds: Array.isArray(zone.sounds) ? zone.sounds : state.sounds,
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

  applyDrowningDamage: amount => set(state => ({
    health: clamp(state.health - Math.max(0, amount), 0, MAX_HEALTH),
    message: 'Darwin is out of his depth — the sea is closing over him.',
    symsLine: '"Sir! Back to the shallows — the Beagle has no second naturalist!"',
  })),

  applyCactusDamage: (amount = 8) => set(state => ({
    health: clamp(state.health - Math.max(0, amount), 0, MAX_HEALTH),
    message: 'Darwin staggers back from the Opuntia spines.',
    educationalNote: 'Large prickly pear cactus can dominate dry Galapagos scrub; its spines make careless movement costly.',
    symsLine: '"Mind the cactus, sir. Those spines will write their own field note."',
  })),

  rest: () => set(state => {
    const provisioned = state.supplies.food > 0 && state.supplies.water > 0;
    return {
      ...advanceTimeState(state, 120),
      fatigue: clamp(state.fatigue - (provisioned ? 26 : 12), 0, MAX_FATIGUE),
      health: clamp(state.health + (provisioned ? 10 : 4), 0, MAX_HEALTH),
      supplies: {
        ...state.supplies,
        food: Math.max(0, state.supplies.food - 1),
        water: Math.max(0, state.supplies.water - 1),
      },
      message: provisioned
        ? 'You rest for two hours in a strip of shade, sharing biscuit and water while Syms reorders the collecting bag.'
        : 'You rest for two hours in a strip of shade, but the provisions are gone — the rest does little good.',
      educationalNote: 'Fieldwork depended on pacing: heat, daylight, and fatigue changed what a naturalist could safely collect.',
    };
  }),

  applyNarration: data => set(state => ({
    message: data.narration || state.message,
    educationalNote: data.educationalNote || state.educationalNote,
    weather: data.weather || state.weather,
    // Hold narration weather for ~90 game minutes before the island
    // simulation takes the sky back.
    weatherOverride: data.weather
      ? { state: data.weather, untilMinutes: (state.day || 1) * 1440 + state.timeOfDay * 60 + 90 }
      : state.weatherOverride,
    sounds: Array.isArray(data.sounds) ? data.sounds.slice(0, 3) : state.sounds,
  })),

  collectNearby: async () => {
    const state = get();
    const specimenId = state.nearbySpecimenId || state.selectedSpecimenId;
    const zoneSpecimens = getThreeSpecimens(state.currentZoneId);
    const specimen = zoneSpecimens.find(item => item.id === specimenId);
    const tool = threeTools.find(item => item.id === state.activeToolId) || threeTools.find(item => item.id === 'hands');
    if (!specimen || state.collectedSpecimenIds.includes(specimen.id)) return null;

    const islandLocation = getThreeIslandLocation(state.currentZoneId);
    const documented = tool.id === 'sketch';

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
        set({ message: blocked.message, symsLine: blocked.syms, lastOutcome: null });
        return null;
      }
    }
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

    set(current => ({
      supplies: spendSupplies(current),
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
