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
  shouldAllowLlmThought,
  textHash,
} from './narrator/narratorEvents';
import {
  createExamineSession,
  examinableFromItem,
  examinableFromSpecimen,
  getExaminableItem,
} from './examine/examinables';
import { currentZoneId, getTravelCardForRoute, getZone } from './world/floreanaZones';
import { getRegionWeather, tickWeatherSim } from './world/weatherDirector';
import { normalizeWeatherState } from './world/weatherStates';
import { ACTION_DURATION, MOVEMENT_FATIGUE } from './components/player/playerConfig';
import {
  DEFAULT_PLAYABLE_MODE_ID,
  findPlayableSpawn,
  getPlayableMode,
  getPlayableToolbarIds,
} from './playable/playableModes';
import { clampToWalkable, terrainHeight } from './world/terrain';
import { forageableAllowsMode } from './world/forageables';
import { getReadableBook } from './books/bookCatalog';
import { getInteriorDefinition } from './interiors/interiorRegistry';
import {
  clampNpcEncounterEffects,
  encounterAmbientLine,
  getNpcEncounter,
  getNpcEncounterPresentation,
} from './encounters/npcEncounters';
import {
  MAX_ACTIVE_SNARES,
  SNARE_CHECK_AFTER_MINUTES,
  activeSnareStatuses,
  isSnareCompatibleSpecimen,
  normalizeSnareSpecimenId,
  snareActorId,
  snareTargetLabel,
} from './snareTraps';
import {
  CATASTROPHIC_FALL_SPEED,
  INCAPACITATION_CURIOSITY_COST,
  INCAPACITATION_RECOVERY_FATIGUE,
  INCAPACITATION_RECOVERY_HEALTH,
  INCAPACITATION_RECOVERY_ZONE_ID,
  expeditionOutcomeCause,
  minutesUntilRecoveryMorning,
  resolveExpeditionDamage,
} from './expeditionOutcomes';
import {
  applyTranscriptEvaluation,
  buildFinalAssessmentRecord,
  buildLocalHenslowAssessment,
  isEndGameNarratorCommand,
} from './finalAssessment';

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
  name: 'Vesicular Basalt Exposure',
  latin: 'Lava basaltica',
  ontology: 'Mineral',
  description: 'Dark volcanic basalt from Floreana lava outcrops.',
  scientificValue: 6,
};
const HAMMER_TOOL = threeTools.find(tool => tool.id === 'hammer') || { id: 'hammer', name: 'Geological Hammer' };
const HANDS_TOOL = threeTools.find(tool => tool.id === 'hands') || { id: 'hands', name: 'Bare Hands' };
const SNARE_TOOL = threeTools.find(tool => tool.id === 'snare') || { id: 'snare', name: 'Twine Snare' };

export const threeRuntimeState = {
  playerPose: {
    position: { ...INITIAL_PLAYER_POSE.position },
    facing: { ...INITIAL_PLAYER_POSE.facing },
  },
  // Hot-path locomotion intent for contact-reactive world systems. This is
  // published before the character controller clips movement against fixed
  // colliders, so plants can still feel a sustained push after Darwin stops.
  playerMotion: {
    intendedPlanarVelocity: { x: 0, z: 0 },
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

function resetThreeRuntimeState() {
  threeRuntimeState.playerPose.position = { ...INITIAL_PLAYER_POSE.position };
  threeRuntimeState.playerPose.facing = { ...INITIAL_PLAYER_POSE.facing };
  threeRuntimeState.playerMotion.intendedPlanarVelocity = { x: 0, z: 0 };
  threeRuntimeState.footContacts.left = { x: 0, y: 0, z: 0, groundY: 0, contact: 0, pulse: 0, phase: 0, active: false };
  threeRuntimeState.footContacts.right = { x: 0, y: 0, z: 0, groundY: 0, contact: 0, pulse: 0, phase: 0, active: false };
  threeRuntimeState.footContacts.lastStep = { side: null, id: 0, x: 0, y: 0, z: 0, intensity: 0, time: 0 };
}

function expeditionOutcomeStats(state) {
  const documented = new Set([
    ...(state.collectedSpecimenIds || []),
    ...(state.documentedSpecimenIds || []),
  ]);
  const availableSpecimenTypes = new Set(
    getThreeSpecimens(state.currentZoneId).map(specimen => specimen.id),
  );
  return {
    day: state.day || 1,
    timeOfDay: state.timeOfDay || 0,
    locationId: state.currentZoneId,
    locationName: getThreeIslandLocation(state.currentZoneId).name || getZone(state.currentZoneId).name,
    specimensDocumented: documented.size,
    specimensAvailable: availableSpecimenTypes.size,
    notesRecorded: (state.journal || []).length,
    curiosity: state.curiosity || 0,
  };
}

function healthDamagePatch(state, {
  amount,
  source = 'injury',
  fatalOnZero = false,
  forceZero = false,
} = {}) {
  if (state.expeditionOutcome) return { health: state.health };
  const resolution = resolveExpeditionDamage({
    health: state.health,
    amount,
    fatalOnZero,
    forceZero,
  });
  if (!resolution.outcomeType || state.playableModeId !== 'darwin') {
    return { health: resolution.health };
  }
  const stats = expeditionOutcomeStats(state);
  return {
    health: resolution.health,
    expeditionOutcome: {
      id: `expedition-outcome-${Date.now()}`,
      type: resolution.outcomeType,
      source,
      cause: expeditionOutcomeCause({
        type: resolution.outcomeType,
        source,
        locationName: stats.locationName,
      }),
      stats,
      phase: 'presenting',
      createdAt: Date.now(),
    },
    activeConstraint: null,
    majorEvent: null,
    statusViewOpen: false,
    examineSession: null,
    readableBookSession: null,
    activeNpcEncounter: null,
    beagleTravelPrompt: null,
    carriedObjectId: null,
    carryPrompt: null,
  };
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
    !state.collectedSpecimenActorIds?.includes(specimen.instanceId || specimen.id)
    && ((specimen.instanceId || specimen.id) === specimenId || specimen.id === specimenId)
  )) || null;
}

function safeConfidence(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'high' || text === 'moderate' || text === 'low') return text;
  return 'moderate';
}

const EXAMINE_MEASURE_RE = /\b(measure|how (?:long|wide|tall|big|large|high)|size|length|width|height)\b/i;

// Offline/failed-request stand-in for the field-inquiry LLM: grounded in the
// examinable's own data so the screen stays usable without a network.
function localExamineFallback(input, session) {
  if (EXAMINE_MEASURE_RE.test(input)) {
    const hint = session.frameHint || {};
    const size = Math.max(hint.height || 0, (hint.radius || 0) * 2, 0.1);
    const value = size >= 1 ? `~${size.toFixed(1)} m` : `~${Math.round(size * 100)} cm`;
    return {
      reply: `You take out the pocket rule and measure as best the subject allows: roughly ${value} at its greatest extent. The estimate is moderate confidence from the current view.`,
      fact: { label: 'Size (est.)', value, confidence: 'moderate', measurement: true },
      behavior: '',
      uncertainty: '',
      fallback: true,
    };
  }
  const details = session.details || [];
  const answered = session.chat.filter(entry => entry.role === 'assistant').length;
  const detail = details.length ? details[answered % details.length] : '';
  return {
    reply: detail
      ? `You look closely. ${detail}${/[.!?]$/.test(detail) ? '' : '.'}`
      : `You study it at length. ${session.description || 'It offers no easy answer; a careful note would preserve what you see.'}`,
    fact: null,
    behavior: '',
    uncertainty: '',
    fallback: true,
  };
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

const LLM_RECENT_CONTEXT_KINDS = new Set(['player', 'narrator']);
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

export function getRuntimePlayerMotion() {
  return threeRuntimeState.playerMotion;
}

export function updateRuntimePlayerMotion(motion = {}) {
  const velocity = motion.intendedPlanarVelocity || motion.velocity || motion;
  const x = Number(velocity?.x);
  const z = Number(velocity?.z);
  const target = threeRuntimeState.playerMotion.intendedPlanarVelocity;
  target.x = Number.isFinite(x) ? x : 0;
  target.z = Number.isFinite(z) ? z : 0;
  return threeRuntimeState.playerMotion;
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
    authorship: 'field-record',
    condition,
    content: `${specimen.name}: ${result.reason}`,
    createdAt: new Date().toISOString(),
  };
}

function gameMinutesForState(state) {
  return Math.round((state.timeOfDay || 0) * 60);
}

function snareElapsedMinutes(trap, state) {
  if (!trap) return 0;
  return Math.max(0, ((state.day || 1) - (trap.setDay || 1)) * 1440 + gameMinutesForState(state) - (trap.setAt || 0));
}

function snareRuntimePositionForSpecimen(state, specimen, zoneId = state.currentZoneId) {
  if (!specimen) return null;
  const actorId = snareActorId(specimen);
  const runtime = state.specimenRuntimePositions?.[zoneId]?.[actorId];
  const spawn = specimen.spawnPoint || [0, 0, 0];
  return {
    x: runtime?.x ?? spawn[0] ?? 0,
    y: runtime?.y ?? spawn[1] ?? 0,
    z: runtime?.z ?? spawn[2] ?? 0,
  };
}

function findSnareSpecimen(state, trap) {
  const zoneId = trap?.zoneId || state.currentZoneId;
  const specimens = getThreeSpecimens(zoneId);
  if (trap?.caughtActorId) {
    return specimens.find(specimen => snareActorId(specimen) === trap.caughtActorId) || null;
  }
  if (trap?.targetActorId) {
    return specimens.find(specimen => snareActorId(specimen) === trap.targetActorId) || null;
  }
  if (trap?.targetSpecimenId) {
    const targetId = normalizeSnareSpecimenId(trap.targetSpecimenId);
    return specimens.find(specimen => normalizeSnareSpecimenId(specimen.id) === targetId) || null;
  }
  const collected = new Set(state.collectedSpecimenActorIds || []);
  let best = null;
  let bestDistance = Infinity;
  for (const specimen of specimens) {
    const actorId = snareActorId(specimen);
    if (!actorId || collected.has(actorId) || !isSnareCompatibleSpecimen(specimen)) continue;
    const runtime = snareRuntimePositionForSpecimen(state, specimen, zoneId);
    const distance = Math.hypot((runtime?.x || 0) - trap.position.x, (runtime?.z || 0) - trap.position.z);
    if (distance < bestDistance) {
      best = specimen;
      bestDistance = distance;
    }
  }
  return bestDistance <= 5.5 ? best : null;
}

function collectionBlockForSpecimen(state, specimen, tool) {
  if (state.inventory.length >= state.caseCapacity) {
    return {
      message: 'The specimen case is full. The snare can hold for now, but there is no room to case the animal properly.',
      syms: 'Syms taps the case lid. "Not an inch of room left, sir."',
    };
  }
  if (state.supplies.labels <= 0) {
    return {
      message: 'No labels remain. Leave the snare undisturbed until the animal can be recorded properly.',
      syms: 'Syms turns out his pockets. "Last label went on the finch, sir."',
    };
  }
  if (specimenNeedsJar(specimen, tool.id) && state.supplies.spareJars <= 0) {
    return {
      message: 'No spirit jars remain for a wet specimen. The snare is holding, but the collection must wait.',
      syms: 'Syms shakes the empty satchel. "Glass is all spoken for, sir."',
    };
  }
  return null;
}

function makeSnareSuccessResult(specimen) {
  const scoreDelta = Math.max(1, Math.round((specimen.scientificValue || 2) * 0.85));
  return {
    success: true,
    reason: `The twine loop has sprung cleanly around the ${specimen.name.toLowerCase()}. You ease it free, record the exact trap site, and pass Syms a usable specimen.`,
    outcomeType: 'clean_specimen',
    category: 'snare_trap',
    methodId: 'snare',
    methodFit: 1,
    threshold: 1,
    roll: 0,
    damage: 0.12,
    evidence: 'snare placement, track marks, and the exact capture point',
    scoreDelta,
    scientificScoreDelta: 1,
    fatigueDelta: 1,
  };
}

function makeSnareFailedResult(specimen = null) {
  const name = specimen?.name ? `the ${specimen.name.toLowerCase()}` : 'a wary animal';
  return {
    success: false,
    reason: `The snare has been disturbed but ${name} slipped the loop. The track marks still tell you which path the animal used.`,
    outcomeType: 'partial_evidence',
    category: 'snare_trap',
    methodId: 'snare',
    damage: 0,
    evidence: 'disturbed twine, footprints, and a better sense of the animal path',
    scoreDelta: 1,
    scientificScoreDelta: 0,
    fatigueDelta: 1,
  };
}

function localSnareEscapeResolution(input = '') {
  const text = String(input || '').toLowerCase();
  const sensible = /\b(?:cut|knife|blade|untie|untying|loosen|loose|slacken|unhook|free|remove|work\s+(?:the\s+)?loop|pry|lever|use\s+(?:the\s+)?net|pole|stick|call|ask|summon|syms|assistant|calm|careful|slowly)\b/.test(text);
  const reckless = /\b(?:run|walk|jump|kick|thrash|yank|pull\s+hard|ignore|drag)\b/.test(text);
  if (sensible && !reckless) {
    return {
      narration: 'You stop pulling against the loop and work at the knot with deliberate fingers. The waxed twine slackens enough to slide free of your boot.',
      escapeSucceeded: true,
      consequence: 'freed',
      healthDelta: 0,
      actionDisposition: 'observed',
      targetType: 'self',
      sounds: ['twine slackening in sand'],
      source: 'local-snare-escape',
      fallback: true,
    };
  }
  return {
    narration: 'The more you pull against the loop, the more faithfully it does its work. You remain caught, with sand in your sleeve and no useful progress made.',
    escapeSucceeded: false,
    consequence: reckless ? 'worse' : 'still_trapped',
    healthDelta: reckless ? -3 : 0,
    actionDisposition: reckless ? 'unsafe' : 'needs_modal',
    targetType: 'self',
    sounds: ['taut twine scraping over sand'],
    source: 'local-snare-escape',
    fallback: true,
  };
}

const FIELD_DILEMMA_CONFIG = {
  net_snagged: {
    eventType: 'net_snag_attempt',
    objective: 'Free the insect net from cactus or scrub without tearing the mesh.',
    title: 'The insect net is snagged.',
    retryTitle: 'The net is still caught.',
    body: 'The mesh has caught on cactus spines; yanking may tear it.',
    retryBody: 'The net remains hooked and the mesh is under tension.',
    helper: 'Describe a careful way to back it out, cut only the caught fibers, or get Syms to help.',
    placeholder: 'Describe how Darwin frees the net...',
    failureFallback: 'The net remains caught. You need a more careful plan before it tears.',
    resolvedFallback: 'You free the net without tearing the useful mesh.',
    targetType: 'tool',
  },
  cactus_spines: {
    eventType: 'cactus_spine_treatment',
    objective: 'Treat embedded cactus spines with field tools before continuing.',
    title: 'Cactus spines are embedded.',
    retryTitle: 'The spines still hurt.',
    body: 'Several Opuntia spines have gone in deeply enough to make careless movement costly.',
    retryBody: 'The spines remain in place and every movement reminds you of them.',
    helper: 'Describe a concrete treatment: knife point, lens, water, cloth, or Syms helping.',
    placeholder: 'Describe how Darwin treats the spines...',
    failureFallback: 'The spines remain embedded. A vague intention is no treatment.',
    resolvedFallback: 'You work the spines out carefully and can continue.',
    targetType: 'self',
  },
  hammer_shard: {
    eventType: 'hammer_shard_treatment',
    objective: 'Deal with a flying rock shard or grit from hammering before continuing fieldwork.',
    title: 'A hammer chip has struck you.',
    retryTitle: 'The shard is still a problem.',
    body: 'A hard rock flake has caught your hand or eye after the hammer blow.',
    retryBody: 'The shard or grit has not been dealt with safely.',
    helper: 'Describe a concrete remedy: rinse with water, wrap the hand, remove the shard, or ask Syms.',
    placeholder: 'Describe how Darwin deals with the shard...',
    failureFallback: 'The injury is no better, and continuing to hammer would be foolish.',
    resolvedFallback: 'You treat the chip injury and regain the use of your hand and tools.',
    targetType: 'self',
  },
};

const FIELD_DILEMMA_TYPES = new Set(Object.keys(FIELD_DILEMMA_CONFIG));

function constraintBlocksTool(constraint, toolId) {
  if (!constraint || !toolId) return false;
  return Array.isArray(constraint.blockedTools) && constraint.blockedTools.includes(toolId);
}

function blockedToolMessage(constraint, toolId) {
  if (constraint?.type === 'net_snagged' && toolId === 'insect_net') {
    return {
      message: 'The insect net is still caught. Free the mesh before trying to use it again.',
      symsLine: '"The net first, sir. A trapped tool catches nothing."',
    };
  }
  if (constraint?.type === 'hammer_shard' && toolId === 'hammer') {
    return {
      message: 'Your hand and eye need attention before more hammering.',
      symsLine: '"No more blows until that chip is seen to, sir."',
    };
  }
  return {
    message: 'That tool is not usable until the current problem is dealt with.',
    symsLine: '"One thing at a time, sir."',
  };
}

function localFieldDilemmaResolution(type, input = '') {
  const text = String(input || '').toLowerCase();
  const reckless = /\b(?:yank|pull\s+hard|thrash|run|ignore|keep\s+going|continue\s+hammering|hammer\s+again|rub\s+(?:my\s+)?eye|rub\s+it|kick|tear)\b/.test(text);
  const sensibleByType = {
    net_snagged: /\b(?:knife|blade|cut|trim|untangle|unhook|back\s+(?:it|the\s+net)\s+out|reverse|loosen|free|mesh|fiber|fibre|twine|syms|assistant|hold\s+(?:the\s+)?cactus|careful|slowly)\b/,
    cactus_spines: /\b(?:knife|blade|point|needle|tweezer|magnifier|lens|inspect|spine|pull\s+(?:out|them)|remove|wash|rinse|water|cloth|bandage|wrap|syms|assistant|careful|slowly)\b/,
    hammer_shard: /\b(?:wash|rinse|water|blink|eye|shard|splinter|chip|remove|knife|blade|tweezer|wrap|cloth|bandage|hand|syms|assistant|stop\s+hammering|careful|slowly)\b/,
  };
  const sensible = sensibleByType[type]?.test(text) || false;
  const config = FIELD_DILEMMA_CONFIG[type] || FIELD_DILEMMA_CONFIG.cactus_spines;
  if (sensible && !reckless) {
    const narration = type === 'net_snagged'
      ? 'You stop pulling against the mesh and work the caught edge back along the spines. The net comes free with only a few fibers frayed.'
      : type === 'cactus_spines'
        ? 'You treat the spines as objects, not insults: inspect, lift, and draw them out one by one. The pain becomes manageable.'
        : 'You stop hammering and attend to the small injury before it becomes a large one. Water, cloth, and patience restore the use of your hand and eye.';
    return {
      narration,
      resolved: true,
      consequence: 'resolved',
      healthDelta: 0,
      actionDisposition: 'observed',
      targetType: config.targetType,
      sounds: type === 'net_snagged' ? ['mesh slipping free of spines'] : ['field kit being opened'],
      source: 'local-field-dilemma',
      fallback: true,
    };
  }
  return {
    narration: reckless
      ? (type === 'net_snagged'
          ? 'The harder you pull, the more firmly the cactus keeps the net. A few threads part with an unhappy little snap.'
          : 'Force makes the injury worse, and the island offers no sympathy for haste.')
      : config.failureFallback,
    resolved: false,
    consequence: reckless ? 'worse' : 'still_pending',
    healthDelta: reckless ? -3 : 0,
    actionDisposition: reckless ? 'unsafe' : 'needs_modal',
    targetType: config.targetType,
    sounds: type === 'net_snagged' ? ['taut mesh scraping over spines'] : ['a sharp breath'],
    source: 'local-field-dilemma',
    fallback: true,
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
    playableModeId: DEFAULT_PLAYABLE_MODE_ID,
    playableSpawnPoint: null,
    playableHiddenActorId: null,
    activeToolId: 'hands',
    toolbarOrder: ['shotgun', 'insect_net', 'snare', 'hammer', 'hands', 'sketch'],
    supplies: { ...INITIAL_SUPPLIES, spareJars: (INITIAL_SUPPLIES.spareJars || 0) + SYMS_BONUS_JARS },
    caseCapacity: CASE_CAPACITY,
    favoriteSpecimenIds: [],
    inventory: expedition.inventory,
    journal: expedition.journal,
    // In-progress journal entry text; lives in the store so an accidental
    // close of the notebook doesn't lose writing.
    journalDraft: '',
    collectedSpecimenIds: expedition.collectedSpecimenIds,
    collectedSpecimenActorIds: expedition.collectedSpecimenActorIds || [],
    documentedSpecimenIds: expedition.documentedSpecimenIds,
    // Type-level examination record: examining one finch of a species unlocks
    // collecting that species everywhere. Gates both collection and sketching.
    examinedTypeIds: expedition.examinedTypeIds || [],
    // Collected non-specimen examinables (letters, books) — sorted as items.
    items: [],
    consultedBookIds: expedition.consultedBookIds || [],
    bookLastPages: expedition.bookLastPages || {},
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
    nearbyNpcEncounter: null,
    nearbyItem: null,
    examineSession: null,
    readableBookSession: null,
    interiorPrompt: null,
    message: initialNarration.narration,
    educationalNote: initialNarration.educationalNote,
    narratorLog: createInitialNarratorLog(initialNarration),
    assessmentPlayerTranscript: [],
    narratorPending: false,
    narratorError: null,
    activeNpcEncounter: null,
    npcEncounterPending: false,
    npcEncounterError: null,
    // The current /three runtime has no save/load bridge. Keep encounter
    // consequences stable for this play session without implying persistence.
    npcEncounterState: { syms_covington: { trust: 50, flags: [] } },
    narratorScriptedKeys: {
      [`zone:${currentZoneId}`]: 1 * 1440 + INITIAL_NARRATOR_TIME * 60,
    },
    weather: normalizeWeatherState(initialNarration.weather, 'sunny'),
    // Narration/LLM weather pins the sky for a while; the island weather
    // simulation resumes authority once untilMinutes passes.
    weatherOverride: null,
    sounds: initialNarration.sounds,
    viewMode: 'shoulder',
    transition: null,
    edgePrompt: null,
    dismissedEdgePromptId: null,
    arrivalEdgeBlock: null,
    animalModeNpcEncounter: null,
    animalModeDarwinNpcPose: null,
    animalModeStats: {},
    lastOutcome: null,
    expeditionOutcome: null,
    finalAssessment: null,
    activeConstraint: null,
    majorEvent: null,
    snareTraps: [],
    animalDroppings: [],
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
    beagleTravelPrompt: null,
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
    collectedSampleIds: [],
    // Per-rock hammer damage, keyed by rockSampleKey. Each entry tracks strike
    // count against the rock's budget plus world-space bite records that the
    // RockField renderer carves out of the matching boulder mesh.
    rockDamage: {},
    harvestedCropIds: [],
    foragedObjectIds: [],
    symsLine: 'Syms waits with labels, twine, and the specimen bag ready.',
  };
}

export const useThreeGameStore = create((set, get) => ({
  ...createExpeditionSlice(),
  ...createSceneSlice(),

  resetExpedition: () => {
    resetThreeRuntimeState();
    set(useThreeGameStore.getInitialState(), true);
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
      carriedObjectId: null,
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
    const toolbarOrder = getPlayableToolbarIds(mode.id);
    const nextActiveToolId = toolbarOrder.includes(state.activeToolId) ? state.activeToolId : toolbarOrder[0];
    const patch = {
      playableModeId: mode.id,
      activeToolId: nextActiveToolId,
      toolbarOrder,
      selectedSpecimenId: null,
      nearbySpecimenId: null,
      nearbyNpcEncounter: null,
      activeNpcEncounter: null,
      carryPrompt: null,
      carriedObjectId: null,
      examineSession: null,
      readableBookSession: null,
      interiorPrompt: null,
    };

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
  setActiveTool: activeToolId => set({ activeToolId }),
  // Double-barreled shotgun ammo. Timestamps are performance.now()-seconds so
  // the aim/HUD layers can share the clock without a store tick per frame.
  shotgunShells: 2,
  shotgunReloadUntil: 0,
  setShotgunAmmo: ({ shells, reloadUntil }) => set({
    shotgunShells: shells,
    shotgunReloadUntil: reloadUntil,
  }),
  // Specimens dropped by a clean shotgun hit: they lie where they fell until
  // Darwin walks over and gathers them (the ordinary collection judgment runs
  // at pickup). Keyed by actorId.
  downedSpecimenActors: {},
  markSpecimenDowned: (actorId, info = {}) => set(state => {
    if (!actorId || state.downedSpecimenActors?.[actorId]) return {};
    return {
      downedSpecimenActors: {
        ...(state.downedSpecimenActors || {}),
        [actorId]: {
          specimenId: info.specimenId || null,
          x: info.x ?? 0,
          y: info.y ?? 0,
          z: info.z ?? 0,
          at: Date.now(),
          method: 'shotgun',
        },
      },
    };
  }),
  applyShotgunSelfInjury: (amount = 14) => set(state => {
    const message = 'The charge tears into the ground at your own boot. A stupid, searing mistake.';
    const symsLine = '"Sir! Point the muzzle at the birds, not the naturalist!"';
    return {
      ...healthDamagePatch(state, { amount, source: 'shotgun_injury' }),
      message,
      symsLine,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine,
      }, state, 'hazard')),
    };
  }),
  applyShotgunNpcHit: (npcId, { distance } = {}) => set(state => {
    const direct = Number.isFinite(distance) && distance < 6;
    const message = direct
      ? 'The blast catches Syms across the shoulder. He staggers, white-faced, pellets in his coat.'
      : 'Stray pellets rattle past Syms. He drops flat behind the nearest rock.';
    const symsLine = direct
      ? '"You have SHOT me, sir! Your own assistant!"'
      : '"Hold your fire, sir — I am not a specimen!"';
    return {
      message,
      symsLine,
      localStanding: clamp((state.localStanding ?? 50) - (direct ? 8 : 3), 0, 100),
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine,
      }, state, 'major-event')),
    };
  }),
  shotgunStructureHits: {},
  recordShotgunStructureHit: structureId => set(state => {
    if (!structureId) return {};
    const hits = { ...(state.shotgunStructureHits || {}) };
    hits[structureId] = (hits[structureId] || 0) + 1;
    const patch = { shotgunStructureHits: hits };
    if (hits[structureId] === 3) {
      const message = 'Buckshot in the timbers. Whoever raised this will notice.';
      patch.message = message;
      patch.symsLine = 'Syms winces at each report. "That wall did you no wrong, sir."';
      patch.narratorLog = appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine: patch.symsLine,
      }, state, 'shotgun-structure'));
    }
    return patch;
  }),
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
  setJournalDraft: value => set({ journalDraft: String(value ?? '') }),
  addUserJournalEntry: content => set(state => {
    const trimmed = String(content || '').trim();
    if (!trimmed) return {};
    const location = getThreeIslandLocation(state.currentZoneId);
    return {
      curiosity: clamp(state.curiosity + 1, 0, MAX_CURIOSITY),
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
  setNearbyNpcEncounter: nearbyNpcEncounter => set(state => (
    (state.nearbyNpcEncounter?.npcId || null) === (nearbyNpcEncounter?.npcId || null)
      ? state
      : { nearbyNpcEncounter }
  )),
  recordNpcActivity: (npcId, event = 'nearby') => set(state => {
    const encounter = getNpcEncounter(npcId);
    const relation = state.npcEncounterState?.[npcId] || { trust: 50, flags: [] };
    const line = encounterAmbientLine(npcId, event, relation);
    if (!encounter || !line) return {};
    const key = `npc-activity:${npcId}:${event}:${state.currentZoneId}`;
    const nowMinutes = gameClockMinutes(state);
    const lastSeen = state.narratorScriptedKeys?.[key];
    if (Number.isFinite(lastSeen) && nowMinutes - lastSeen < SCRIPTED_NARRATION_COOLDOWN_MINUTES) return {};
    return {
      narratorLog: appendNarratorEvents(state.narratorLog, createNarratorEvent({
        kind: 'npcActivity',
        speaker: encounter.name || 'Syms Covington',
        text: line,
        day: state.day,
        timeOfDay: state.timeOfDay,
        source: 'scripted-npc-activity',
        meta: { npcId, event },
      })),
      narratorScriptedKeys: { ...state.narratorScriptedKeys, [key]: nowMinutes },
    };
  }),
  openNpcEncounter: npcId => set(state => {
    const encounter = getNpcEncounter(npcId);
    if (!encounter) return {};
    const relation = state.npcEncounterState?.[npcId] || { trust: 50, flags: [] };
    const presentation = getNpcEncounterPresentation(npcId, relation) || encounter;
    return {
      activeNpcEncounter: {
        npcId,
        openedAt: Date.now(),
        turns: [{ role: 'npc', text: presentation.opener }],
        suggestedReplies: presentation.suggestedReplies,
        trust: relation.trust,
        flags: relation.flags || [],
      },
      npcEncounterPending: false,
      npcEncounterError: null,
    };
  }),
  closeNpcEncounter: () => set({ activeNpcEncounter: null, npcEncounterPending: false, npcEncounterError: null }),
  submitNpcEncounter: async input => {
    const playerInput = String(input || '').trim();
    const state = get();
    const active = state.activeNpcEncounter;
    if (!active || !playerInput || state.npcEncounterPending) return null;
    const npcId = active.npcId;
    const encounter = getNpcEncounter(npcId);
    if (!encounter) return null;
    const zone = getZone(state.currentZoneId);
    const location = getThreeIslandLocation(state.currentZoneId);
    const turn = { role: 'player', text: playerInput };
    const turns = [...(active.turns || []), turn].slice(-8);
    set(current => ({
      activeNpcEncounter: current.activeNpcEncounter?.npcId === npcId
        ? { ...current.activeNpcEncounter, turns }
        : current.activeNpcEncounter,
      npcEncounterPending: true,
      npcEncounterError: null,
    }));
    const requestState = get();
    // One player turn has one request identity. Do not derive this from the
    // reply text: repeated questions are valid new turns with new trust effects.
    const turnId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const idempotencyKey = [requestState.seed || 'three', npcId, 'encounter-turn', turnId].join(':');
    try {
      const response = await fetch('/api/three-encounter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-young-darwin-session': narratorSessionId(requestState.seed),
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          npcId,
          playerInput,
          location: location.name || zone.name,
          locationContext: {
            id: zone.id,
            historicalName: zone.historicalName,
            description: zone.loadingNote || zone.description || location.subtitle || '',
          },
          weather: requestState.weather,
          timeOfDay: `${Math.floor(requestState.timeOfDay || 0)}:${String(Math.floor(((requestState.timeOfDay || 0) % 1) * 60)).padStart(2, '0')}`,
          trust: active.trust,
          flags: active.flags,
          subjectContext: requestState.lastOutcome?.specimen?.name || requestState.nearbySpecimenId || '',
          recentTurns: turns.map(item => `${item.role === 'npc' ? 'NPC' : 'Darwin'}: ${item.text}`),
          turnId,
          idempotencyKey,
        }),
      });
      const data = response.ok ? await response.json() : null;
      const dialogue = String(data?.dialogue || '“I beg your pardon, sir; I have lost the thread of it.”').trim();
      const { trustDelta, flags } = clampNpcEncounterEffects(npcId, data);
      set(current => {
        if (current.activeNpcEncounter?.npcId !== npcId) return { npcEncounterPending: false };
        const previous = current.npcEncounterState?.[npcId] || { trust: 50, flags: [] };
        const nextTrust = Math.max(0, Math.min(100, previous.trust + trustDelta));
        const nextFlags = [...new Set([...(previous.flags || []), ...flags])];
        const nextTurns = [...(current.activeNpcEncounter.turns || []), { role: 'npc', text: dialogue }].slice(-8);
        return {
          activeNpcEncounter: {
            ...current.activeNpcEncounter,
            turns: nextTurns,
            trust: nextTrust,
            flags: nextFlags,
          },
          npcEncounterState: {
            ...current.npcEncounterState,
            [npcId]: { trust: nextTrust, flags: nextFlags },
          },
          npcEncounterPending: false,
          npcEncounterError: data?.fallback ? 'The reply is constrained by a local fallback.' : null,
        };
      });
      return data;
    } catch {
      set(current => ({
        activeNpcEncounter: current.activeNpcEncounter?.npcId === npcId
          ? { ...current.activeNpcEncounter, turns: [...(current.activeNpcEncounter.turns || []), { role: 'npc', text: '“The wind has made a muddle of the moment, sir. Try me again.”' }].slice(-8) }
          : current.activeNpcEncounter,
        npcEncounterPending: false,
        npcEncounterError: 'Conversation is temporarily unavailable.',
      }));
      return null;
    }
  },
  setNearbySpecimen: nearbySpecimenId => set(state => {
    if (state.nearbySpecimenId === nearbySpecimenId) return state;
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
  setNearbyItem: nearbyItem => set(state => (
    (state.nearbyItem?.actorId || null) === (nearbyItem?.actorId || null) ? state : { nearbyItem }
  )),
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
  openReadableBook: (bookId, options = {}) => set(state => {
    const book = getReadableBook(bookId);
    if (!book) return {};
    const firstConsultation = !state.consultedBookIds.includes(book.id);
    return {
      readableBookSession: {
        bookId: book.id,
        focus: options.focus || null,
        openedAt: Date.now(),
      },
      consultedBookIds: firstConsultation
        ? [...state.consultedBookIds, book.id]
        : state.consultedBookIds,
      curiosity: firstConsultation ? clamp(state.curiosity + 1, 0, MAX_CURIOSITY) : state.curiosity,
      inspectedObject: null,
      inspectedScreenPosition: null,
    };
  }),
  closeReadableBook: () => set({ readableBookSession: null }),
  setReadableBookPage: (bookId, page) => set(state => ({
    bookLastPages: {
      ...state.bookLastPages,
      [bookId]: Math.max(1, Math.round(Number(page) || 1)),
    },
  })),
  saveReadableBookNote: ({ bookId, page, content }) => set(state => {
    const book = getReadableBook(bookId);
    const trimmed = String(content || '').trim();
    if (!book || !trimmed) return {};
    const location = getThreeIslandLocation(state.currentZoneId);
    const pageNumber = Math.max(1, Math.round(Number(page) || 1));
    return {
      curiosity: clamp(state.curiosity + 1, 0, MAX_CURIOSITY),
      journal: [...state.journal, {
        id: `${Date.now()}-reading-${book.id}-${pageNumber}`,
        day: state.day,
        timeOfDay: state.timeOfDay,
        location: location.name,
        method: 'reading and comparison',
        kind: 'reading',
        authorship: 'player',
        title: `${book.shortTitle}, page ${pageNumber}`,
        content: trimmed,
        source: { type: 'book', bookId: book.id, page: pageNumber },
        createdAt: new Date().toISOString(),
      }],
      message: `You add a note from ${book.shortTitle} to the field journal.`,
    };
  }),
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
  setInspectedObject: inspectedObject => set({ inspectedObject, inspectedScreenPosition: null }),
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
  setCarriedObject: carriedObjectId => set({ carriedObjectId }),
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
      // Guard against double-collecting the same physical chip; the source
      // rock itself can yield further chips until its strike budget runs out.
      const sampleId = sample?.sampleId || sourceRockKey;
      if (state.collectedSampleIds.includes(sampleId)) {
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
        sampledRockIds: state.sampledRockIds.includes(sourceRockKey)
          ? state.sampledRockIds
          : [...state.sampledRockIds, sourceRockKey],
        collectedSampleIds: [...state.collectedSampleIds, sampleId].slice(-64),
        questComplete: true,
        lastOutcome: { specimen, tool: HAMMER_TOOL, result, documented: false },
        message: result.reason,
        educationalNote,
        symsLine,
        narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
          narration: result.reason,
          symsLine,
        }, state, 'rock-sample')),
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
        }, state, 'crop-harvest')),
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
  consumeForageable: forageable => {
    const forageKey = forageable?.forageId || forageable?.id;
    if (!forageKey) return null;

    let result = null;
    set(state => {
      const mode = getPlayableMode(state.playableModeId);
      const promptBelongsToForage = state.carryPrompt?.forageable?.forageId === forageKey
        || state.carryPrompt?.id === forageKey;
      if (!forageableAllowsMode(forageable, mode)) {
        const message = forageable?.blockedMessage
          || (mode.id === 'darwin'
            ? 'That is not useful field food or a specimen worth gathering here.'
            : `${mode.label} cannot feed on that.`);
        result = { consumed: false, reason: 'wrong-mode', forageId: forageKey, foodLabel: forageable?.foodLabel || forageable?.label };
        return {
          message,
          ...(promptBelongsToForage ? { carryPrompt: null } : {}),
        };
      }
      const foragedObjectIds = state.foragedObjectIds || [];
      if (foragedObjectIds.includes(forageKey)) {
        result = { consumed: false, reason: 'already-foraged', forageId: forageKey, foodLabel: forageable?.foodLabel || forageable?.label };
        return promptBelongsToForage ? { carryPrompt: null } : {};
      }

      const label = forageable.label || 'forage';
      const foodLabel = forageable.foodLabel || label;
      const message = forageable.consumeMessage
        || (mode.id === 'darwin'
          ? `You gather ${label}.`
          : `${mode.label} feeds on ${foodLabel}.`);
      result = {
        consumed: true,
        forageId: forageKey,
        sourceKind: forageable.sourceKind || 'forageable',
        layerId: forageable.layerId || null,
        itemId: forageable.itemId || null,
        zoneId: forageable.zoneId || state.currentZoneId,
        label,
        foodLabel,
        nutrition: forageable.nutrition ?? 0,
        water: forageable.water ?? 0,
      };
      return {
        foragedObjectIds: [...foragedObjectIds, forageKey],
        message,
        educationalNote: forageable.educationalNote || state.educationalNote,
        ...(promptBelongsToForage ? { carryPrompt: null } : {}),
      };
    });

    return result;
  },
  recordRockStrike: ({
    key,
    rockId,
    zoneId,
    x,
    z,
    budget = 3,
    broken = false,
    bite = null,
    countStrike = true,
  } = {}) => set(state => {
    if (!key) return {};
    const existing = state.rockDamage[key] || { strikes: 0, bites: [] };
    return {
      rockDamage: {
        ...state.rockDamage,
        [key]: {
          ...existing,
          rockId: rockId ?? existing.rockId,
          zoneId: zoneId ?? existing.zoneId,
          x: x ?? existing.x,
          z: z ?? existing.z,
          budget,
          strikes: existing.strikes + (countStrike ? 1 : 0),
          broken: existing.broken || broken,
          bites: bite ? [...existing.bites, bite].slice(-12) : existing.bites,
        },
      },
    };
  }),
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
  recordAnimalModeNpcEncounter: encounter => set(state => {
    const mode = getPlayableMode(state.playableModeId);
    if (mode.kind !== 'animal') return {};
    const animalName = mode.label.toLowerCase();
    const message = encounter?.message
      || `Darwin crouches near the ${animalName}, notebook open, and considers whether it belongs in the collecting bag.`;
    return {
      animalModeNpcEncounter: {
        ...encounter,
        modeId: mode.id,
        modeLabel: mode.label,
        at: Date.now(),
      },
      message,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        educationalNote: encounter?.educationalNote || 'In animal modes, Darwin becomes part of the island ecology: an observer, a collector, and eventually a risk to avoid.',
      }, state, 'scripted', { timeOfDay: state.timeOfDay, day: state.day })),
    };
  }),
  recordAnimalModeAction: (payload = {}) => set(state => {
    const mode = getPlayableMode(state.playableModeId);
    if (mode.kind !== 'animal') return {};
    const actionId = payload.actionId || payload.id || 'unknown';
    const current = state.animalModeStats?.[mode.id] || {};
    const actions = current.actions || {};
    const previous = actions[actionId] || {};
    const foodLabel = actionId === 'eat'
      ? (payload.foodLabel || previous.foodLabel || (mode.id === 'tortoise' ? 'low leaves and ground herbs' : 'dry seeds and small shoots'))
      : previous.foodLabel;
    const forage = payload.forage || null;
    return {
      animalModeStats: {
        ...(state.animalModeStats || {}),
        [mode.id]: {
          ...current,
          modeId: mode.id,
          updatedAtRealMs: Date.now(),
          lastActionId: actionId,
          actions: {
            ...actions,
            [actionId]: {
              ...previous,
              count: (previous.count || 0) + 1,
              lastAt: gameMinutesForState(state),
              lastDay: state.day || 1,
              lastZoneId: state.currentZoneId,
              ...(foodLabel ? { foodLabel } : {}),
              ...(forage ? {
                lastForage: {
                  forageId: forage.forageId || null,
                  sourceKind: forage.sourceKind || null,
                  layerId: forage.layerId || null,
                  itemId: forage.itemId || null,
                  zoneId: forage.zoneId || state.currentZoneId,
                  label: forage.label || forage.foodLabel || foodLabel,
                },
                foragedCount: (previous.foragedCount || 0) + 1,
              } : {}),
            },
          },
        },
      },
    };
  }),
  setAnimalModeDarwinNpcPose: pose => set(state => {
    if (!pose) {
      return state.animalModeDarwinNpcPose ? { animalModeDarwinNpcPose: null } : state;
    }
    const previous = state.animalModeDarwinNpcPose;
    const next = {
      zoneId: pose.zoneId || state.currentZoneId,
      x: Number(pose.x) || 0,
      y: Number(pose.y) || 0,
      z: Number(pose.z) || 0,
      yaw: Number(pose.yaw) || 0,
      at: Date.now(),
    };
    if (
      previous
      && previous.zoneId === next.zoneId
      && Math.abs(previous.x - next.x) < 0.06
      && Math.abs(previous.y - next.y) < 0.04
      && Math.abs(previous.z - next.z) < 0.06
      && Math.abs(previous.yaw - next.yaw) < 0.04
    ) return state;
    return { animalModeDarwinNpcPose: next };
  }),
  addAnimalDropping: (payload = {}) => set(state => {
    const zoneId = payload.zoneId || state.currentZoneId;
    const source = payload.position || state.playerPose?.position || threeRuntimeState.playerPose.position || INITIAL_PLAYER_POSE.position;
    const rawX = Number(source.x);
    const rawZ = Number(source.z);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawZ)) return {};
    const falling = payload.status === 'falling';
    const safe = falling ? { x: rawX, z: rawZ } : clampToWalkable({ x: rawX, y: 0, z: rawZ }, null, zoneId);
    const rawY = Number(source.y);
    const y = Number.isFinite(rawY)
      ? Number(source.y)
      : terrainHeight(safe.x, safe.z, zoneId) + 0.026;
    const nowRealMs = Date.now();
    const sourceModeId = payload.sourceModeId || state.playableModeId || null;
    const dropping = {
      id: payload.id || `dropping-${zoneId}-${state.day || 1}-${gameMinutesForState(state)}-${Math.round(safe.x * 100)}-${Math.round(safe.z * 100)}-${nowRealMs}`,
      zoneId,
      sourceModeId,
      kind: payload.kind || (sourceModeId === 'finch' ? 'bird' : 'animal'),
      position: { x: safe.x, y, z: safe.z },
      velocity: payload.velocity ? {
        x: Number(payload.velocity.x) || 0,
        y: Number(payload.velocity.y) || 0,
        z: Number(payload.velocity.z) || 0,
      } : null,
      yaw: Number(payload.yaw) || 0,
      radius: Number(payload.radius) || 0.24,
      status: payload.status || 'fresh',
      stuckTo: payload.stuckTo || null,
      impact: payload.impact || null,
      createdAt: gameMinutesForState(state),
      createdDay: state.day || 1,
      createdAtRealMs: nowRealMs,
      smushedAtRealMs: null,
      smushCount: 0,
      seed: Number(payload.seed) || Math.abs(Math.sin((safe.x * 12.9898) + (safe.z * 78.233)) * 43758.5453),
    };
    const next = [
      ...(state.animalDroppings || []).filter(item => item.id !== dropping.id),
      dropping,
    ];
    return { animalDroppings: next.slice(-80) };
  }),
  settleAnimalDropping: (droppingId, payload = {}) => set(state => {
    let changed = false;
    const next = (state.animalDroppings || []).map(item => {
      if (item.id !== droppingId) return item;
      changed = true;
      const nextYaw = Number(payload.yaw);
      const nextRadius = Number(payload.radius);
      return {
        ...item,
        status: payload.status || 'splat',
        position: payload.position || item.position,
        velocity: null,
        yaw: Number.isFinite(nextYaw) ? nextYaw : (item.yaw || 0),
        radius: Number.isFinite(nextRadius) ? nextRadius : item.radius,
        stuckTo: payload.stuckTo || null,
        impact: payload.impact || null,
        landedAtRealMs: Date.now(),
      };
    });
    if (!changed) return {};
    const darwinHit = payload.stuckTo?.type === 'darwin';
    return {
      animalDroppings: next,
      ...(darwinHit ? {
        message: 'A pale finch dropping lands squarely on Darwin. For once, the naturalist is the specimen under observation.',
        animalModeNpcEncounter: {
          ...(state.animalModeNpcEncounter || {}),
          type: 'finch-dropping-hit',
          modeId: 'finch',
          modeLabel: 'Finch',
          at: Date.now(),
          npcPosition: payload.position || null,
          message: 'A pale finch dropping lands squarely on Darwin. For once, the naturalist is the specimen under observation.',
        },
      } : {}),
    };
  }),
  smushAnimalDropping: (droppingId, payload = {}) => set(state => {
    let changed = false;
    const next = (state.animalDroppings || []).map(item => {
      if (item.id !== droppingId || item.status === 'smushed') return item;
      changed = true;
      return {
        ...item,
        status: 'smushed',
        smushedAtRealMs: Date.now(),
        smushedBy: payload.by || state.playableModeId || 'player',
        smushCount: (item.smushCount || 0) + 1,
      };
    });
    return changed ? { animalDroppings: next } : {};
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

  // --- Examination ------------------------------------------------------
  // The diegetic examine screen: camera pulls in on the subject, clock
  // pauses, and a field-inquiry chat + key-facts panel frame the live shot.
  // `target` is null (examine the nearby specimen), an actor id, or
  // { itemTypeId, actorId, focus } for standalone items like letters.
  openExamine: (target = null) => set(state => {
    if (state.examineSession) return {};
    let examinable = null;
    let focus = target?.focus || null;
    if (target?.itemTypeId) {
      examinable = examinableFromItem(getExaminableItem(target.itemTypeId), target.actorId);
    } else if (!target && !state.nearbySpecimenId && !state.selectedSpecimenId && state.nearbyItem) {
      examinable = examinableFromItem(getExaminableItem(state.nearbyItem.typeId), state.nearbyItem.actorId);
      focus = state.nearbyItem.focus || null;
    } else {
      const actorId = (typeof target === 'string' && target) || state.nearbySpecimenId || state.selectedSpecimenId;
      const specimen = findRuntimeSpecimen(state, actorId);
      examinable = examinableFromSpecimen(specimen);
      if (examinable && !focus) {
        const runtime = state.specimenRuntimePositions?.[state.currentZoneId]?.[examinable.actorId];
        const spawn = specimen.spawnPoint || [0, 0, 0];
        focus = {
          x: runtime?.x ?? spawn[0] ?? 0,
          y: runtime?.y ?? spawn[1] ?? 0,
          z: runtime?.z ?? spawn[2] ?? 0,
        };
      }
    }
    if (!examinable) return {};
    return {
      examineSession: createExamineSession(examinable, {
        focus,
        day: state.day,
        timeOfDay: state.timeOfDay,
      }),
    };
  }),
  closeExamine: () => set({ examineSession: null }),

  saveExamineFact: factId => set(state => {
    const session = state.examineSession;
    if (!session) return {};
    const facts = session.facts.map(fact => (fact.id === factId ? { ...fact, saved: true } : fact));
    return { examineSession: { ...session, facts } };
  }),

  // Saving a written field note is what completes an examination: the note
  // becomes the player's own journal entry (with any saved facts appended)
  // and the type unlocks for collection everywhere.
  saveExamineNote: content => {
    const trimmed = String(content || '').trim();
    const session = get().examineSession;
    if (!trimmed || !session) return false;
    set(state => {
      const location = getThreeIslandLocation(state.currentZoneId);
      const savedFacts = state.examineSession.facts.filter(fact => fact.saved && fact.id !== 'category');
      const factLines = savedFacts.length
        ? `\n\nRecorded facts:\n${savedFacts.map(fact => `${fact.label}: ${fact.value}`).join('\n')}`
        : '';
      const firstExamination = !state.examinedTypeIds.includes(session.typeId);
      const entry = {
        id: `${Date.now()}-examination-${session.typeId}`,
        day: state.day,
        timeOfDay: state.timeOfDay,
        specimenId: session.kind === 'specimen' ? session.typeId : undefined,
        specimenName: session.name,
        latin: session.latin,
        location: location.name,
        method: 'field examination',
        condition: 'examined in field',
        kind: 'examination',
        authorship: 'player',
        title: `Examination: ${session.name}`,
        content: `${trimmed}${factLines}`,
        createdAt: new Date().toISOString(),
      };
      const message = firstExamination
        ? `Your notes on the ${session.name.toLowerCase()} enter the field book. You may now collect one when the chance offers.`
        : `You add a further note on the ${session.name.toLowerCase()} to the field book.`;
      return {
        journal: [...state.journal, entry],
        examinedTypeIds: firstExamination
          ? [...state.examinedTypeIds, session.typeId]
          : state.examinedTypeIds,
        curiosity: clamp(state.curiosity + 1, 0, MAX_CURIOSITY),
        message,
        examineSession: { ...state.examineSession, noteSaved: true },
        narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
          narration: message,
        }, state, 'examination')),
      };
    });
    return true;
  },

  // Collect the examined individual without leaving the screen. Specimens
  // route through collectNearby (same rules, supplies, and journal shape);
  // items land in the items list.
  collectFromExamine: async () => {
    const state = get();
    const session = state.examineSession;
    if (!session || !state.examinedTypeIds.includes(session.typeId)) return null;
    if (session.kind === 'item') {
      const item = getExaminableItem(session.typeId);
      if (!item || state.items.some(entry => entry.typeId === session.typeId)) return null;
      const message = `You take the ${item.name.toLowerCase()} and stow it flat between the leaves of the field book.`;
      set(current => ({
        items: [...current.items, { ...item, collectedAt: new Date().toISOString(), day: current.day }],
        message,
        examineSession: null,
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: message,
        }, current, 'item-collect')),
      }));
      return { success: true, item };
    }
    set({ selectedSpecimenId: session.actorId });
    const result = await get().collectNearby(session.actorId);
    set({ examineSession: null, selectedSpecimenId: null });
    return result;
  },

  sendExamineMessage: async input => {
    const trimmed = String(input || '').trim();
    const state = get();
    const session = state.examineSession;
    if (!trimmed || !session || session.pending) return null;

    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set(current => (current.examineSession ? {
      examineSession: {
        ...current.examineSession,
        chat: [...current.examineSession.chat, { id: `you-${entryId}`, role: 'you', text: trimmed, at: Date.now() }],
        pending: true,
        error: null,
      },
    } : {}));

    const zone = getZone(state.currentZoneId);
    const applyReply = payload => set(current => {
      const active = current.examineSession;
      if (!active) return {};
      const facts = [...active.facts];
      let measurementCallout = active.measurementCallout;
      const fact = payload.fact && payload.fact.label && payload.fact.value ? payload.fact : null;
      if (fact) {
        const factId = String(fact.label).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const existing = facts.findIndex(item => item.id === factId);
        const nextFact = {
          id: factId,
          label: String(fact.label),
          value: String(fact.value),
          confidence: safeConfidence(fact.confidence),
          measurement: Boolean(fact.measurement),
          saved: existing >= 0 ? facts[existing].saved : false,
        };
        if (existing >= 0) facts[existing] = nextFact;
        else facts.push(nextFact);
        if (nextFact.measurement) measurementCallout = nextFact.value;
      }
      const uncertainties = payload.uncertainty
        ? [...new Set([...active.uncertainties, String(payload.uncertainty)])].slice(-4)
        : active.uncertainties;
      return {
        examineSession: {
          ...active,
          chat: [...active.chat, {
            id: `assistant-${entryId}`,
            role: 'assistant',
            text: payload.reply,
            behavior: payload.behavior || '',
            at: Date.now(),
          }],
          facts,
          uncertainties,
          measurementCallout,
          pending: false,
          error: payload.fallback ? 'Field inquiry fell back to a local response.' : null,
        },
      };
    });

    try {
      const response = await fetch('/api/three-examine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-young-darwin-session': narratorSessionId(state.seed),
        },
        body: JSON.stringify({
          playerInput: trimmed,
          examinable: {
            typeId: session.typeId,
            kind: session.kind,
            living: session.living,
            name: session.name,
            latin: session.latin,
            category: session.category,
            // Items have no server-side registry entry; ground the LLM from
            // the session copy. Specimens are looked up by typeId instead.
            description: session.kind === 'item' ? session.description : '',
            details: session.kind === 'item' ? session.details : [],
          },
          chat: session.chat.slice(-8).map(entry => ({ role: entry.role, text: entry.text })),
          knownFacts: session.facts.map(fact => `${fact.label}: ${fact.value}`),
          location: getThreeIslandLocation(state.currentZoneId).name || zone.name,
          weather: state.weather,
          day: state.day,
          timeOfDay: `${Math.floor(state.timeOfDay || 0)}:${String(Math.floor(((state.timeOfDay || 0) % 1) * 60)).padStart(2, '0')}`,
        }),
      });
      const payload = response.ok ? await response.json() : localExamineFallback(trimmed, session);
      applyReply(payload);
      return payload;
    } catch {
      const payload = localExamineFallback(trimmed, session);
      applyReply(payload);
      return payload;
    }
  },
  adjustLocalStanding: delta => set(state => ({
    localStanding: clamp(state.localStanding + delta, 0, 100),
  })),

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
        note: options.note || travelCard?.description || zone.loadingNote,
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
        curiosity: clamp(state.curiosity - INCAPACITATION_CURIOSITY_COST, 0, MAX_CURIOSITY),
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

  cycleViewMode: () => set(state => ({
    viewMode: state.viewMode === 'shoulder'
      ? 'hero'
      : state.viewMode === 'hero'
        ? 'first'
        : state.viewMode === 'first' ? 'top' : 'shoulder',
  })),

  applyMovementCost: ({ running = false, walking = false, airborne = false, falling = 0, fatigueDelta = null } = {}) => set(state => {
    const catastrophicFall = state.playableModeId === 'darwin' && falling >= CATASTROPHIC_FALL_SPEED;
    return {
      fatigue: clamp(state.fatigue + (fatigueDelta ?? (
        (running ? MOVEMENT_FATIGUE.runningPerFrame60 : walking ? MOVEMENT_FATIGUE.walkingPerFrame60 : 0)
        + (airborne ? MOVEMENT_FATIGUE.airbornePerFrame60 : 0)
      )), 0, MAX_FATIGUE),
      ...healthDamagePatch(state, {
        amount: catastrophicFall ? MAX_HEALTH : Math.max(0, falling - 7.5) * 1.25,
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
    if (!constraint?.movementLock && constraint?.type !== 'snare_immobilized') return {};
    const message = constraint.type === 'net_snagged'
      ? 'The net is still caught fast. Free it before turning back to fieldwork.'
      : constraint.type === 'snare_immobilized'
        ? 'The snare is still holding you. Work out the escape in the narrator panel first.'
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
    const eventId = `major-net-snag-${Date.now()}`;
    const hazardLabel = details.hazardLabel || 'cactus spines';
    const message = `The insect net catches on ${hazardLabel}. The mesh is under tension, and a hard pull would tear it.`;
    return {
      activeConstraint: {
        type: 'net_snagged',
        requiresNarratorInput: true,
        movementLock: true,
        blockedTools: ['insect_net'],
        toolId: 'insect_net',
        startedAt: Date.now(),
        attempts: 0,
        details,
        composerPlaceholder: config.placeholder,
        reaction: {
          clip: 'stumble',
          duration: ACTION_DURATION.stumble,
          lockMovement: 0.28,
          interrupt: true,
        },
      },
      majorEvent: {
        id: eventId,
        type: 'net_snagged',
        severity: 'warning',
        title: config.title,
        body: config.body,
        helper: config.helper,
        requiresNarratorInput: true,
        createdAt: Date.now(),
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
    const eventId = `major-hammer-shard-${Date.now()}`;
    const sampleLabel = details.sampleLabel || details.material || 'rock';
    const message = `A sharp ${sampleLabel} chip snaps back from the hammer strike and catches you before it falls into the dust.`;
    return {
      activeConstraint: {
        type: 'hammer_shard',
        requiresNarratorInput: true,
        movementLock: false,
        movementSpeedScale: 0.88,
        blockedTools: ['hammer'],
        toolId: 'hammer',
        startedAt: Date.now(),
        attempts: 0,
        healthPenalty: 6,
        details,
        composerPlaceholder: config.placeholder,
        reaction: {
          clip: 'hitReaction',
          duration: ACTION_DURATION.hitReaction,
          lockMovement: 0.38,
          interrupt: true,
        },
      },
      majorEvent: {
        id: eventId,
        type: 'hammer_shard',
        severity: 'danger',
        title: config.title,
        body: config.body,
        helper: config.helper,
        requiresNarratorInput: true,
        createdAt: Date.now(),
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
    const message = 'You stagger back from the Opuntia spines.';
    const educationalNote = 'Large prickly pear cactus can dominate dry Galapagos scrub; its spines make careless movement costly.';
    const symsLine = '"Mind the cactus, sir. Those spines will write their own field note."';
    const embedSpines = Boolean(options.embedSpines && !state.activeConstraint);
    const config = FIELD_DILEMMA_CONFIG.cactus_spines;
    const eventId = `major-cactus-spines-${Date.now()}`;
    return {
      ...(embedSpines ? {
        activeConstraint: {
          type: 'cactus_spines',
          requiresNarratorInput: true,
          movementLock: false,
          movementSpeedScale: 0.72,
          disableRun: true,
          startedAt: Date.now(),
          attempts: 0,
          details: {
            cactusId: options.cactusId || 'cactus',
            impactSpeed: Number.isFinite(Number(options.impactSpeed)) ? Number(options.impactSpeed) : null,
            severeFall: Boolean(options.severeFall),
          },
          composerPlaceholder: config.placeholder,
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
        majorEvent: {
          id: eventId,
          type: 'cactus_spines',
          severity: 'danger',
          title: config.title,
          body: config.body,
          helper: config.helper,
          requiresNarratorInput: true,
          createdAt: Date.now(),
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
      }, state, 'rest')),
    };
  }),

  applySnareEscapeResolution: (data, options = {}) => set(state => {
    const constraint = state.activeConstraint;
    if (constraint?.type !== 'snare_immobilized') return { narratorPending: false };
    const consequence = String(data?.consequence || '').trim() || (data?.escapeSucceeded ? 'freed' : 'still_trapped');
    const escaped = data?.escapeSucceeded === true || consequence === 'freed';
    const rawHealthDelta = Number(data?.healthDelta);
    const healthDelta = Number.isFinite(rawHealthDelta)
      ? clamp(rawHealthDelta, -10, 5)
      : (consequence === 'worse' ? -3 : 0);
    const nextAttempts = (constraint.attempts || 0) + 1;
    const fallback = escaped
      ? 'You free yourself from the snare and gather the sprung twine from the sand.'
      : 'The snare holds. You will need a more careful plan before you can move again.';
    const narration = data?.narration || fallback;
    const nextConstraint = escaped
      ? null
      : {
          ...constraint,
          attempts: nextAttempts,
          lastAttempt: options.playerInput || '',
          lastAttemptAt: Date.now(),
        };
    const nextMajorEvent = escaped
      ? null
      : {
          id: `major-snare-still-${constraint.trapId || 'trap'}-${nextAttempts}`,
          type: 'snare_immobilized',
          severity: consequence === 'worse' ? 'danger' : 'warning',
          title: consequence === 'worse' ? 'The snare tightens.' : 'Still caught in the snare.',
          body: consequence === 'worse'
            ? 'The loop bites harder as you struggle against it.'
            : 'You remain immobilized and must try another escape plan.',
          helper: 'Describe a careful way to loosen, cut, or get help with the snare in the narrator panel.',
          requiresNarratorInput: true,
          createdAt: Date.now(),
        };
    return {
      activeConstraint: nextConstraint,
      majorEvent: nextMajorEvent,
      snareTraps: escaped && constraint.trapId
        ? (state.snareTraps || []).map(trap => (
            trap.id === constraint.trapId && trap.status === 'sprung-darwin'
              ? { ...trap, status: 'cleared', checkedAt: gameMinutesForState(state), checkedDay: state.day || 1 }
              : trap
          ))
        : state.snareTraps,
      message: narration,
      narratorPending: false,
      narratorError: data?.fallback ? 'Narration fell back to a local escape ruling.' : null,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        ...data,
        narration,
      }, state, escaped ? 'snare-escape' : 'snare-escape-failed', {
        allowThought: false,
      })),
      ...(healthDelta < 0
        ? healthDamagePatch(state, { amount: -healthDelta, source: 'snare' })
        : { health: clamp(state.health + healthDelta, 0, MAX_HEALTH) }),
    };
  }),

  applyFieldDilemmaResolution: (data, options = {}) => set(state => {
    const constraint = state.activeConstraint;
    const config = FIELD_DILEMMA_CONFIG[constraint?.type];
    if (!constraint || !config) return { narratorPending: false };
    const consequence = String(data?.consequence || '').trim() || (data?.resolved ? 'resolved' : 'still_pending');
    const resolved = data?.resolved === true || consequence === 'resolved' || consequence === 'freed';
    const rawHealthDelta = Number(data?.healthDelta);
    const healthDelta = Number.isFinite(rawHealthDelta)
      ? clamp(rawHealthDelta, -8, 4)
      : (consequence === 'worse' ? -3 : 0);
    const nextAttempts = (constraint.attempts || 0) + 1;
    const narration = data?.narration || (resolved ? config.resolvedFallback : config.failureFallback);
    const nextConstraint = resolved
      ? null
      : {
          ...constraint,
          attempts: nextAttempts,
          lastAttempt: options.playerInput || '',
          lastAttemptAt: Date.now(),
        };
    const nextMajorEvent = resolved
      ? null
      : {
          id: `major-${constraint.type}-${nextAttempts}-${Date.now()}`,
          type: constraint.type,
          severity: consequence === 'worse' ? 'danger' : 'warning',
          title: consequence === 'worse' ? config.retryTitle : config.retryTitle,
          body: consequence === 'worse'
            ? 'The attempted remedy has made the problem worse.'
            : config.retryBody,
          helper: config.helper,
          requiresNarratorInput: true,
          createdAt: Date.now(),
        };
    return {
      activeConstraint: nextConstraint,
      majorEvent: nextMajorEvent,
      message: narration,
      narratorPending: false,
      narratorError: data?.fallback ? 'Narration fell back to a local field ruling.' : null,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        ...data,
        narration,
      }, state, resolved ? `${constraint.type}-resolved` : `${constraint.type}-failed`, {
        allowThought: false,
      })),
      ...(healthDelta < 0
        ? healthDamagePatch(state, { amount: -healthDelta, source: constraint.type || 'field_injury' })
        : { health: clamp(state.health + healthDelta, 0, MAX_HEALTH) }),
    };
  }),

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
      state.currentZoneId,
      state.day,
      Math.round((state.timeOfDay || 0) * 60),
      state.activeConstraint?.type || 'free',
      textHash(trimmed),
    ].join(':');

    if (state.activeConstraint?.type === 'snare_immobilized') {
      try {
        const response = await fetch('/api/three-narrate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-young-darwin-session': narratorSessionId(state.seed),
            'x-idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({
            eventType: 'snare_escape_attempt',
            playerInput: trimmed,
            objective: 'Escape the snare before resuming fieldwork.',
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
            constraint: state.activeConstraint,
            idempotencyKey,
          }),
        });
        const data = response.ok ? await response.json() : localSnareEscapeResolution(trimmed);
        const resolved = data?.escapeSucceeded === undefined ? localSnareEscapeResolution(trimmed) : data;
        get().applySnareEscapeResolution(resolved, { playerInput: trimmed });
        return resolved;
      } catch {
        const fallback = localSnareEscapeResolution(trimmed);
        get().applySnareEscapeResolution(fallback, { playerInput: trimmed });
        return fallback;
      }
    }

    if (FIELD_DILEMMA_TYPES.has(state.activeConstraint?.type)) {
      const config = FIELD_DILEMMA_CONFIG[state.activeConstraint.type];
      try {
        const response = await fetch('/api/three-narrate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-young-darwin-session': narratorSessionId(state.seed),
            'x-idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({
            eventType: config.eventType,
            playerInput: trimmed,
            objective: config.objective,
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
            toolId: state.activeConstraint.toolId || tool?.id || state.activeToolId || 'hands',
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
            nearbyPeople,
            constraint: state.activeConstraint,
            idempotencyKey,
          }),
        });
        const data = response.ok ? await response.json() : localFieldDilemmaResolution(state.activeConstraint.type, trimmed);
        const resolved = data?.resolved === undefined ? localFieldDilemmaResolution(state.activeConstraint.type, trimmed) : data;
        get().applyFieldDilemmaResolution(resolved, { playerInput: trimmed });
        return resolved;
      } catch {
        const fallback = localFieldDilemmaResolution(state.activeConstraint.type, trimmed);
        get().applyFieldDilemmaResolution(fallback, { playerInput: trimmed });
        return fallback;
      }
    }

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
      get().applyNarration(fallback, { playerInput: trimmed, allowThought: false });
      return fallback;
    }
  },

  placeSnareTrap: (options = {}) => {
    const state = get();
    const activeStatuses = activeSnareStatuses();
    const activeCount = (state.snareTraps || []).filter(trap => activeStatuses.has(trap.status)).length;
    const targetId = options.targetActorId || options.targetSpecimenId || state.nearbySpecimenId || state.selectedSpecimenId;
    const targetSpecimen = findRuntimeSpecimen(state, targetId);
    const targetActorId = targetSpecimen ? snareActorId(targetSpecimen) : null;
    const targetLabel = snareTargetLabel(targetSpecimen);

    if (state.supplies.twine <= 0) {
      const message = 'No twine remains for a snare. Syms will need to cut another length from the kit before you can set one.';
      set(current => ({
        message,
        symsLine: '"Used the last of the twine on the case lashings, sir."',
        lastOutcome: null,
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: message,
          symsLine: '"Used the last of the twine on the case lashings, sir."',
        }, current, 'blocked-action')),
      }));
      return null;
    }
    if (activeCount >= MAX_ACTIVE_SNARES) {
      const message = `You already have ${MAX_ACTIVE_SNARES} snares set. Check or retrieve one before laying more twine.`;
      set(current => ({
        message,
        symsLine: '"Too many loops in the scrub and we will lose track of our own work, sir."',
        lastOutcome: null,
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: message,
          symsLine: '"Too many loops in the scrub and we will lose track of our own work, sir."',
        }, current, 'blocked-action')),
      }));
      return null;
    }
    if (targetSpecimen && !targetLabel) {
      const message = `A twine snare is a poor choice for ${targetSpecimen.name.toLowerCase()}. Set it on small ground paths: lizards, crabs, finches, and similar animals.`;
      set(current => ({
        message,
        symsLine: '"That one would either break the loop or never touch it, sir."',
        lastOutcome: null,
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: message,
          symsLine: '"That one would either break the loop or never touch it, sir."',
        }, current, 'blocked-action')),
      }));
      return null;
    }

    const pose = options.position || state.playerPose?.position || threeRuntimeState.playerPose.position || INITIAL_PLAYER_POSE.position;
    const facing = options.facing || state.playerPose?.facing || threeRuntimeState.playerPose.facing || INITIAL_PLAYER_POSE.facing;
    let forwardX = Number(facing.x) || 0;
    let forwardZ = Number(facing.z) || -1;
    const facingLength = Math.hypot(forwardX, forwardZ) || 1;
    forwardX /= facingLength;
    forwardZ /= facingLength;

    let x = (Number(pose.x) || 0) + forwardX * 1.12;
    let z = (Number(pose.z) || 0) + forwardZ * 1.12;
    const targetRuntime = targetSpecimen ? snareRuntimePositionForSpecimen(state, targetSpecimen) : null;
    if (targetRuntime) {
      const dx = targetRuntime.x - (Number(pose.x) || 0);
      const dz = targetRuntime.z - (Number(pose.z) || 0);
      const distance = Math.hypot(dx, dz);
      if (distance > 0.4 && distance < 5.0) {
        const placementDistance = Math.min(1.65, Math.max(0.9, distance * 0.48));
        x = (Number(pose.x) || 0) + (dx / distance) * placementDistance;
        z = (Number(pose.z) || 0) + (dz / distance) * placementDistance;
        forwardX = dx / distance;
        forwardZ = dz / distance;
      }
    }
    const safe = clampToWalkable({ x, y: 0, z }, null, state.currentZoneId);
    const y = terrainHeight(safe.x, safe.z, state.currentZoneId) + 0.035;
    const yaw = Math.atan2(forwardX, forwardZ);
    const nowMinutes = gameMinutesForState(state);
    const placedAtRealMs = Date.now();
    const trap = {
      id: `snare-${state.currentZoneId}-${state.day}-${nowMinutes}-${Math.round(safe.x * 10)}-${Math.round(safe.z * 10)}-${placedAtRealMs}`,
      zoneId: state.currentZoneId,
      position: { x: safe.x, y, z: safe.z },
      yaw,
      targetSpecimenId: targetSpecimen?.id || null,
      targetActorId,
      targetName: targetLabel || 'small ground animal',
      status: 'set',
      setAt: nowMinutes,
      setDay: state.day || 1,
      checkAfter: SNARE_CHECK_AFTER_MINUTES,
      placedAtRealMs,
      triggerRadius: 1.02,
    };
    const message = targetSpecimen
      ? `You kneel and set a waxed-twine loop along the ${targetSpecimen.name.toLowerCase()}'s path. It will work only if the animal moves through the loop undisturbed.`
      : 'You kneel and set a waxed-twine loop on a small animal path, pegging the trigger line lightly into the sand.';
    set(current => ({
      snareTraps: [...(current.snareTraps || []), trap],
      supplies: {
        ...current.supplies,
        twine: Math.max(0, current.supplies.twine - 1),
      },
      fatigue: clamp(current.fatigue + 1, 0, MAX_FATIGUE),
      message,
      symsLine: '"We mark the spot and give it time, sir."',
      lastOutcome: null,
      narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine: '"We mark the spot and give it time, sir."',
      }, current, 'snare-set')),
    }));
    return trap;
  },

  springSnareTrap: (trapId, actorId) => set(state => {
    const trap = (state.snareTraps || []).find(item => item.id === trapId);
    if (!trap || trap.status !== 'set') return {};
    const specimen = getThreeSpecimens(trap.zoneId || state.currentZoneId)
      .find(item => snareActorId(item) === actorId);
    if (!specimen || !isSnareCompatibleSpecimen(specimen)) return {};
    const message = `The snare snaps tight as the ${specimen.name.toLowerCase()} crosses the loop. Check it before it works itself loose.`;
    return {
      snareTraps: (state.snareTraps || []).map(item => (
        item.id === trapId
          ? {
              ...item,
              status: 'sprung',
              caughtActorId: actorId,
              targetSpecimenId: specimen.id,
              targetName: specimen.name,
              sprungAt: gameMinutesForState(state),
              sprungDay: state.day || 1,
              sprungAtRealMs: Date.now(),
            }
          : item
      )),
      message,
      symsLine: '"There, sir. The loop has taken."',
    };
  }),

  springSnareTrapByCharacter: (trapId, characterId = 'darwin') => set(state => {
    const trap = (state.snareTraps || []).find(item => item.id === trapId);
    if (!trap || trap.status !== 'set') return {};
    const character = characterId === 'syms' ? 'syms' : 'darwin';
    const isSyms = character === 'syms';
    const message = isSyms
      ? 'Syms steps into the hidden loop; the peg flips loose and the twine snaps around his boot.'
      : 'Darwin puts his boot through his own snare. The loop catches, the peg kicks free, and he pitches forward into the sand.';
    const eventId = `major-snare-${trapId}-${Date.now()}`;
    return {
      snareTraps: (state.snareTraps || []).map(item => (
        item.id === trapId
          ? {
              ...item,
              status: isSyms ? 'sprung-syms' : 'sprung-darwin',
              caughtBy: character,
              targetName: isSyms ? 'Syms Covington' : 'Darwin',
              sprungAt: gameMinutesForState(state),
              sprungDay: state.day || 1,
              sprungAtRealMs: Date.now(),
            }
          : item
      )),
      activeConstraint: isSyms
        ? state.activeConstraint
        : {
            type: 'snare_immobilized',
            trapId,
            requiresNarratorInput: true,
            movementLock: true,
            startedAt: Date.now(),
            attempts: 0,
            healthPenalty: 25,
          },
      majorEvent: isSyms
        ? state.majorEvent
        : {
            id: eventId,
            type: 'snare_immobilized',
            severity: 'danger',
            title: "You've been caught in your own snare.",
            body: 'You are immobilized for now.',
            helper: 'Decide on your next move and enter it in the narrator panel.',
            requiresNarratorInput: true,
            createdAt: Date.now(),
          },
      message,
      symsLine: isSyms
        ? '"That one found me before it found a lizard, sir."'
        : '"Proof of principle, sir, though perhaps not the intended specimen."',
      lastOutcome: null,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine: isSyms
          ? '"That one found me before it found a lizard, sir."'
          : '"Proof of principle, sir, though perhaps not the intended specimen."',
      }, state, isSyms ? 'snare-syms-trigger' : 'major-event')),
      ...(isSyms
        ? { health: state.health }
        : healthDamagePatch(state, { amount: 25, source: 'snare' })),
    };
  }),

  checkSnareTrap: trapId => {
    const state = get();
    const trap = (state.snareTraps || []).find(item => item.id === trapId);
    if (!trap) return null;
    const elapsedMinutes = snareElapsedMinutes(trap, state);
    const specimen = findSnareSpecimen(state, trap);
    const islandLocation = getThreeIslandLocation(trap.zoneId || state.currentZoneId);

    if (trap.status === 'sprung-darwin' || trap.status === 'sprung-syms') {
      const caughtSyms = trap.status === 'sprung-syms';
      if (!caughtSyms && state.activeConstraint?.type === 'snare_immobilized' && state.activeConstraint.trapId === trapId) {
        const message = 'The loop is still under tension. Decide how to extract yourself and write the attempt in the narrator panel.';
        set(current => ({
          message,
          symsLine: '"A plan first, sir. Pulling at random is how the knot earns its keep."',
          lastOutcome: null,
          narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
            narration: message,
            symsLine: '"A plan first, sir. Pulling at random is how the knot earns its keep."',
          }, current, 'snare-blocked-clear')),
        }));
        return null;
      }
      const message = caughtSyms
        ? 'You unhook the twine from Syms and reset the disturbed sand where the trigger peg tore loose.'
        : 'Darwin works the twine off his boot, gathers the sprung loop, and clears the trap from the path.';
      set(current => ({
        snareTraps: (current.snareTraps || []).map(item => (
          item.id === trapId ? { ...item, status: 'cleared', checkedAt: gameMinutesForState(current), checkedDay: current.day || 1 } : item
        )),
        message,
        symsLine: caughtSyms
          ? '"I shall watch the ground more closely, sir."'
          : '"Best place the next one off our own line of march."',
        lastOutcome: null,
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: message,
          symsLine: caughtSyms
            ? '"I shall watch the ground more closely, sir."'
            : '"Best place the next one off our own line of march."',
        }, current, 'snare-clear')),
      }));
      return null;
    }

    if (trap.status === 'failed') {
      const message = 'You lift the slack twine, smooth the disturbed sand, and clear the failed snare from the path.';
      set(current => ({
        snareTraps: (current.snareTraps || []).map(item => (
          item.id === trapId ? { ...item, status: 'cleared', checkedAt: gameMinutesForState(current), checkedDay: current.day || 1 } : item
        )),
        message,
        symsLine: '"We will knot the next one a little lower, sir."',
        lastOutcome: null,
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: message,
          symsLine: '"We will knot the next one a little lower, sir."',
        }, current, 'snare-clear')),
      }));
      return null;
    }

    if (trap.status === 'set' && elapsedMinutes < (trap.checkAfter || SNARE_CHECK_AFTER_MINUTES)) {
      const remaining = Math.ceil((trap.checkAfter || SNARE_CHECK_AFTER_MINUTES) - elapsedMinutes);
      const message = `The loop is still open and clean. Give the snare about ${remaining} more minute${remaining === 1 ? '' : 's'} of quiet.`;
      set(current => ({
        message,
        symsLine: '"Best not fuss with it too soon, sir."',
        lastOutcome: null,
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: message,
          symsLine: '"Best not fuss with it too soon, sir."',
        }, current, 'snare-check')),
      }));
      return null;
    }

    const resolvedSpecimen = specimen && isSnareCompatibleSpecimen(specimen) ? specimen : null;
    const collectedActorIds = new Set(state.collectedSpecimenActorIds || []);
    const collectedActorId = resolvedSpecimen ? (trap.caughtActorId || snareActorId(resolvedSpecimen)) : null;
    const passiveCheck = trap.status === 'set' && resolvedSpecimen
      ? evaluateCollectionAttempt({
          specimen: resolvedSpecimen,
          method: SNARE_TOOL,
          approach: 'patient quiet ground snare on a fresh animal path',
          location: islandLocation,
          fatigue: state.fatigue,
          gameTime: gameMinutesForState(state),
          seed: state.seed,
        })
      : null;
    const shouldCollect = resolvedSpecimen
      && !collectedActorIds.has(collectedActorId)
      && (trap.status === 'sprung' || passiveCheck?.success);
    const result = shouldCollect
      ? makeSnareSuccessResult(resolvedSpecimen)
      : (passiveCheck || makeSnareFailedResult(resolvedSpecimen));

    if (shouldCollect) {
      const blocked = collectionBlockForSpecimen(state, resolvedSpecimen, SNARE_TOOL);
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

    const entry = resolvedSpecimen
      ? makeJournalEntry({
          specimen: resolvedSpecimen,
          tool: SNARE_TOOL,
          result,
          documented: !shouldCollect,
          location: islandLocation,
          day: state.day,
          timeOfDay: state.timeOfDay,
        })
      : null;

    set(current => {
      const collected = shouldCollect && resolvedSpecimen;
      const nextTrapStatus = collected ? 'collected' : 'failed';
      const educationalNote = collected
        ? 'A passive snare turns animal movement into evidence: the exact path and capture point are part of the record.'
        : 'A failed snare is still field evidence when it reveals a route, trackway, or disturbance pattern.';
      return {
        snareTraps: (current.snareTraps || []).map(item => (
          item.id === trapId
            ? { ...item, status: nextTrapStatus, result, checkedAt: gameMinutesForState(current), checkedDay: current.day || 1 }
            : item
        )),
        fatigue: clamp(current.fatigue + result.fatigueDelta, 0, MAX_FATIGUE),
        curiosity: clamp(current.curiosity + (collected ? result.scoreDelta * 5 : 4), 0, MAX_CURIOSITY),
        supplies: collected
          ? {
              ...current.supplies,
              labels: Math.max(0, current.supplies.labels - 1),
              spareJars: specimenNeedsJar(resolvedSpecimen, SNARE_TOOL.id)
                ? Math.max(0, current.supplies.spareJars - 1)
                : current.supplies.spareJars,
            }
          : current.supplies,
        inventory: collected ? [...current.inventory, { ...resolvedSpecimen, condition: result.outcomeType }] : current.inventory,
        journal: entry ? [...current.journal, entry] : current.journal,
        examinedTypeIds: resolvedSpecimen && !current.examinedTypeIds.includes(resolvedSpecimen.id)
          ? [...current.examinedTypeIds, resolvedSpecimen.id]
          : current.examinedTypeIds,
        collectedSpecimenIds: collected && !current.collectedSpecimenIds.includes(resolvedSpecimen.id)
          ? [...current.collectedSpecimenIds, resolvedSpecimen.id]
          : current.collectedSpecimenIds,
        collectedSpecimenActorIds: collected && collectedActorId && !(current.collectedSpecimenActorIds || []).includes(collectedActorId)
          ? [...(current.collectedSpecimenActorIds || []), collectedActorId]
          : (current.collectedSpecimenActorIds || []),
        nearbySpecimenId: collected && current.nearbySpecimenId === collectedActorId ? null : current.nearbySpecimenId,
        selectedSpecimenId: collected && current.selectedSpecimenId === collectedActorId ? null : current.selectedSpecimenId,
        questComplete: current.questComplete || Boolean(collected),
        lastOutcome: resolvedSpecimen ? { specimen: resolvedSpecimen, tool: SNARE_TOOL, result, documented: !collected, collectedActorId: collected ? collectedActorId : null } : null,
        message: result.reason,
        educationalNote,
        symsLine: collected
          ? `Syms keeps one finger on the twine while labeling the ${resolvedSpecimen.name}. "Neat work, sir."`
          : '"Worth noting even so, sir. Something passed this way."',
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: result.reason,
          symsLine: collected
            ? `Syms keeps one finger on the twine while labeling the ${resolvedSpecimen.name}. "Neat work, sir."`
            : '"Worth noting even so, sir. Something passed this way."',
        }, current, collected ? 'snare-collection' : 'snare-check')),
      };
    });
    return result;
  },

  collectNearby: async (targetSpecimenId = null) => {
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
    if (tool.id === 'snare') {
      return get().placeSnareTrap({
        targetSpecimenId: specimen?.id || null,
        targetActorId: specimen ? snareActorId(specimen) : null,
      });
    }
    if (!specimen) return null;
    const actorId = specimen.instanceId || specimen.id;

    // Examination gates collection and sketching alike: the player must have
    // studied one individual of this type (any map) before taking or
    // documenting one. The gate is on types, not individuals.
    if (!state.examinedTypeIds.includes(specimen.id)) {
      const message = `You cannot yet say what this ${specimen.name.toLowerCase()} truly is. Examine it first — observation before acquisition.`;
      const symsLine = 'Syms holds the case shut. "Have a proper look before it goes in the bag, sir."';
      set(current => ({
        message,
        symsLine,
        lastOutcome: null,
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: message,
          symsLine,
        }, current, 'blocked-action')),
      }));
      return null;
    }

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
        collectedSpecimenActorIds: collected && !(current.collectedSpecimenActorIds || []).includes(actorId)
          ? [...(current.collectedSpecimenActorIds || []), actorId]
          : (current.collectedSpecimenActorIds || []),
        downedSpecimenActors: collected && current.downedSpecimenActors?.[actorId]
          ? Object.fromEntries(Object.entries(current.downedSpecimenActors).filter(([key]) => key !== actorId))
          : (current.downedSpecimenActors || {}),
        documentedSpecimenIds: documented && !current.documentedSpecimenIds.includes(specimen.id)
          ? [...current.documentedSpecimenIds, specimen.id]
          : current.documentedSpecimenIds,
        nearbySpecimenId: collected && current.nearbySpecimenId === actorId ? null : current.nearbySpecimenId,
        selectedSpecimenId: collected && current.selectedSpecimenId === actorId ? null : current.selectedSpecimenId,
        questComplete: current.questComplete || collected || documented,
        lastOutcome: { specimen, tool, result, documented, collectedActorId: collected ? actorId : null },
        message: result.reason,
        educationalNote,
        symsLine,
        narratorLog: appendNarratorEvents(current.narratorLog, [
          ...narrationPayloadToEvents({ narration: result.reason }, current, source),
          ...(collected && current.nearbyNpcEncounter?.npcId === 'syms_covington'
            ? [createNarratorEvent({
                kind: 'npcActivity',
                speaker: 'Syms Covington',
                text: encounterAmbientLine('syms_covington', 'collected', current.npcEncounterState?.syms_covington),
                day: current.day,
                timeOfDay: current.timeOfDay,
                source: 'collection-npc-activity',
                meta: { npcId: 'syms_covington', event: 'collected' },
              })]
            : []),
        ]),
      };
    });

    return result;
  },
}));
