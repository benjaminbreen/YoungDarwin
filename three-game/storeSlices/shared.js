// Store-wide constants, runtime singletons and pure helpers shared by
// three-game/store.js and its action slices in this folder.

import { CASE_CAPACITY, INITIAL_SUPPLIES } from '../../data/inventoryItems';
import { DEFAULT_DARWIN_TOOLBAR } from '../toolbar';
import { DEFAULT_PLAYABLE_MODE_ID } from '../playable/playableModes';
import { DEFAULT_SYMS_DIRECTIVE, SYMS_DIRECTIVES, normalizeSymsDirective } from '../npcs/symsActivityPlan';
import {
  EXPEDITION_DAYS,
  LAST_MINUTE_OF_DAY,
  expeditionOutcomeCause,
  nightfallMessage,
  resolveExpeditionDamage,
} from '../expeditionOutcomes';
import { FIRST_DIRECTIVE_ID } from '../directives';
import {
  INITIAL_NARRATOR_TIME,
  SCRIPTED_NARRATION_COOLDOWN_MINUTES,
  appendNarratorEvents,
  createInitialNarratorLog,
  gameClockMinutes,
  narrationPayloadToEvents,
} from '../narrator/narratorEvents';
import { SYMS_HOME_ZONE_ID } from '../npcs/symsCompanion';
import { baseSpecimens } from '../../data/specimens';
import { createInitialExpeditionState } from '../../game-core/save';
import { currentZoneId, getZone } from '../world/floreanaZones';
import { darwinThought, zoneNarration } from '../narrator/narratorContent';
import { getNpcPoses } from '../world/npcRuntime';
import { getSpecimenRarity } from '../rarity';
import {
  getThreeInitialNarration,
  getThreeIslandLocation,
  getThreeSpecimens,
  threeTools,
} from '../data';
import { normalizeWeatherState } from '../world/weatherStates';
export const MAX_HEALTH = 100;
// A night aboard ends at first light rather than advancing a fixed span, so
// the player always resumes the expedition at a workable hour.
export const BEAGLE_MORNING_HOUR = 6.5;
export const REST_MINUTES = 120;
// Long enough for `lyingDown` to reach the ground, short enough that the card
// lands before the player wonders whether the button worked.
export const REST_ANIMATION_MS = 2400;
export const MAX_FATIGUE = 100;
export const HOURS_PER_DAY = 24;

// Narration/examine/encounter requests had no timeout, so a stalled connection
// left `narratorPending` true forever and the composer stuck on its loading
// dots with no way out. Every LLM route already answers with local fallback
// prose on error, so aborting simply routes into that existing path.
export const LLM_REQUEST_TIMEOUT_MS = 20000;

export async function fetchWithTimeout(url, options = {}, timeoutMs = LLM_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// An aborted request reports browser-internal text ("signal is aborted without
// reason"); say something a player can act on instead.
export function describeNarratorError(error, fallbackMessage = 'Narration unavailable.') {
  if (error?.name === 'AbortError') return 'The narrator did not answer in time; a local note was written instead.';
  return String(error?.message || error || fallbackMessage);
}
export const INITIAL_PLAYER_POSE = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  facing: Object.freeze({ x: 0, y: 0, z: -1 }),
});
// Minimap is low-resolution, so the player marker only needs a fresh pose
// object once the player has moved/turned a perceptible amount. Below these
// thresholds we reuse the existing minimapPlayerPose so walking doesn't
// re-render the (always-mounted) minimap subtree on every pose publish.
export const MINIMAP_POSE_EPSILON = 0.2;
export const MINIMAP_HEADING_EPSILON = 1.5;
export const BASALT_SPECIMEN = baseSpecimens.find(specimen => specimen.id === 'basalt') || {
  id: 'basalt',
  name: 'Vesicular Basalt Exposure',
  latin: 'Lava basaltica',
  ontology: 'Mineral',
  description: 'Dark volcanic basalt from Floreana lava outcrops.',
  scientificValue: 6,
};
export const HAMMER_TOOL = threeTools.find(tool => tool.id === 'hammer') || { id: 'hammer', name: 'Geological Hammer' };
export const HANDS_TOOL = threeTools.find(tool => tool.id === 'hands') || { id: 'hands', name: 'Bare Hands' };
export let carryDropRequestId = 0;

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
    visualActive: false,
  },
  footContacts: {
    left: { x: 0, y: 0, z: 0, groundY: 0, contact: 0, pulse: 0, phase: 0, active: false },
    right: { x: 0, y: 0, z: 0, groundY: 0, contact: 0, pulse: 0, phase: 0, active: false },
    lastStep: { side: null, id: 0, x: 0, y: 0, z: 0, groundSource: null, target: null, intensity: 0, time: 0 },
  },
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


export function resetThreeRuntimeState() {
  threeRuntimeState.playerPose.position = { ...INITIAL_PLAYER_POSE.position };
  threeRuntimeState.playerPose.facing = { ...INITIAL_PLAYER_POSE.facing };
  threeRuntimeState.playerMotion.intendedPlanarVelocity = { x: 0, z: 0 };
  threeRuntimeState.playerMotion.visualActive = false;
  threeRuntimeState.footContacts.left = { x: 0, y: 0, z: 0, groundY: 0, contact: 0, pulse: 0, phase: 0, active: false };
  threeRuntimeState.footContacts.right = { x: 0, y: 0, z: 0, groundY: 0, contact: 0, pulse: 0, phase: 0, active: false };
  threeRuntimeState.footContacts.lastStep = { side: null, id: 0, x: 0, y: 0, z: 0, groundSource: null, target: null, intensity: 0, time: 0 };
}

export function expeditionOutcomeStats(state) {
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
  };
}

export function healthDamagePatch(state, {
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
  const damage = Math.max(0, state.health - resolution.health);
  const now = Date.now();
  const damagePatch = {
    health: resolution.health,
    ...(damage > 0 ? {
      lastHealthDamage: {
        id: (state.lastHealthDamage?.id || 0) + 1,
        amount: damage,
        source,
        remainingHealth: resolution.health,
        outcomeType: resolution.outcomeType || null,
        at: now,
      },
    } : {}),
  };
  if (!resolution.outcomeType || state.playableModeId !== 'darwin') {
    return damagePatch;
  }
  const stats = expeditionOutcomeStats(state);
  return {
    ...damagePatch,
    expeditionOutcome: {
      id: `expedition-outcome-${now}`,
      type: resolution.outcomeType,
      source,
      cause: expeditionOutcomeCause({
        type: resolution.outcomeType,
        source,
        locationName: stats.locationName,
      }),
      stats,
      phase: 'presenting',
      createdAt: now,
    },
    activeConstraint: null,
    majorEvent: null,
    statusViewOpen: false,
    examineSession: null,
    readableBookSession: null,
    activeNpcEncounter: null,
    beagleTravelPrompt: null,
    carriedObjectId: null,
    carryDropRequest: null,
    carryPrompt: null,
  };
}

export function specimenById(specimenId) {
  return baseSpecimens.find(specimen => specimen.id === specimenId) || null;
}

// The one chokepoint for clock-driven day advance: travel, resting in an
// interior and incapacitation recovery all route through here. Running out of
// days ashore ends the expedition exactly as returning to the ship does.
// Old saves carried labels/pins/jars/twine/food/water; fold the edible pair
// into the single provisions count so a resumed expedition keeps eating.
export function normalizeSupplies(saved, fallback = INITIAL_SUPPLIES) {
  if (!saved || typeof saved !== 'object') return { ...fallback };
  if (Number.isFinite(saved.provisions)) return { provisions: Math.max(0, saved.provisions) };
  const food = Number.isFinite(saved.food) ? saved.food : fallback.provisions;
  const water = Number.isFinite(saved.water) ? saved.water : fallback.provisions;
  return { provisions: Math.max(0, Math.min(food, water)) };
}

// Darwin eats one provision every six field hours, automatically. With the
// bag empty he starves: health drains in 15-minute steps until the ordinary
// collapse path carries him back to the Beagle for the night.
export const MEAL_INTERVAL_MINUTES = 360;
export const STARVATION_DRAIN_PER_STEP = 4;
export const STARVATION_STEP_MINUTES = 15;

export function hungerPatch(state, minutes) {
  if (state.playableModeId !== 'darwin' || !(minutes > 0)) return {};
  if (state.expeditionOutcome || state.expeditionDeparted) return {};
  const before = Math.max(0, state.minutesSinceMeal || 0);
  let since = before + minutes;
  let provisions = Math.max(0, state.supplies?.provisions || 0);
  let ate = 0;
  while (since >= MEAL_INTERVAL_MINUTES && provisions > 0) {
    provisions -= 1;
    ate += 1;
    since -= MEAL_INTERVAL_MINUTES;
  }
  const patch = { minutesSinceMeal: since };
  if (ate > 0) {
    patch.supplies = { ...state.supplies, provisions };
    patch.message = provisions > 0
      ? 'Darwin pauses for biscuit and water from the provision bag.'
      : 'Darwin eats the last of the provisions. The bag is empty now.';
    return patch;
  }
  const starvedBefore = Math.max(0, before - MEAL_INTERVAL_MINUTES);
  const starvedNow = Math.max(0, since - MEAL_INTERVAL_MINUTES);
  const drainSteps = Math.floor(starvedNow / STARVATION_STEP_MINUTES)
    - Math.floor(starvedBefore / STARVATION_STEP_MINUTES);
  if (starvedNow > 0 && starvedBefore === 0) {
    patch.message = 'The provision bag is empty and Darwin is famished. Find food or make for the Beagle before the island decides for him.';
  }
  if (drainSteps > 0) {
    Object.assign(patch, healthDamagePatch(state, {
      amount: drainSteps * STARVATION_DRAIN_PER_STEP,
      source: 'hunger',
    }));
  }
  return patch;
}

export function advanceTimeState(state, minutes) {
  const totalHours = state.timeOfDay + minutes / 60;
  const dayDelta = Math.floor(totalHours / HOURS_PER_DAY);
  const nextDay = state.day + dayDelta;
  const timePatch = nextDay > EXPEDITION_DAYS
    ? { timeOfDay: LAST_MINUTE_OF_DAY, day: EXPEDITION_DAYS, expeditionDeparted: true }
    : {
        timeOfDay: ((totalHours % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY,
        day: nextDay,
      };
  const hunger = hungerPatch(state, minutes);
  const nightfall = nightfallMessage(state, minutes);
  if (!nightfall) return { ...timePatch, ...hunger };
  return {
    ...timePatch,
    ...hunger,
    message: hunger.message ? `${nightfall} ${hunger.message}` : nightfall,
  };
}

export function findRuntimeSpecimen(state, specimenId) {
  if (!specimenId) return null;
  return getThreeSpecimens(state.currentZoneId).find(specimen => (
    !state.collectedSpecimenActorIds?.includes(specimen.instanceId || specimen.id)
    && ((specimen.instanceId || specimen.id) === specimenId || specimen.id === specimenId)
  )) || null;
}

export function safeConfidence(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'high' || text === 'moderate' || text === 'low') return text;
  return 'moderate';
}

export const EXAMINE_MEASURE_RE = /\b(measure|how (?:long|wide|tall|big|large|high)|size|length|width|height)\b/i;

// Offline/failed-request stand-in for the field-inquiry LLM: grounded in the
// examinable's own data so the screen stays usable without a network.
export function localExamineFallback(input, session) {
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

export function narratorSessionId(seed) {
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

export function playerHeading(playerPose) {
  const facing = playerPose?.facing || {};
  const fx = Number(facing.x);
  const fz = Number(facing.z);
  if (!Number.isFinite(fx) || !Number.isFinite(fz)) return null;
  return Math.round(Math.atan2(fx, fz || -1) * (180 / Math.PI));
}

export function nearbyPeopleContext(state, zone) {
  const people = [];
  const player = state.playerPose?.position || threeRuntimeState.playerPose.position || {};
  const px = Number(player.x);
  const pz = Number(player.z);
  if (state.symsZoneId === state.currentZoneId && Number.isFinite(px) && Number.isFinite(pz)) {
    const fallback = state.currentZoneId === SYMS_HOME_ZONE_ID
      ? { x: 4, z: 7.4 }
      : { x: px + 1.5, z: pz + 0.7 };
    const pose = getNpcPoses(state.currentZoneId)?.get('syms') || fallback;
    const distance = Math.hypot(px - pose.x, pz - pose.z);
    const directive = normalizeSymsDirective(state.symsDirective);
    const activity = directive === SYMS_DIRECTIVES.FOLLOW
      ? 'following Darwin'
      : directive === SYMS_DIRECTIVES.WAIT
        ? 'waiting where Darwin left him'
        : 'ranging between fieldwork sites';
    const caseContext = state.currentZoneId === 'POST_OFFICE_BAY'
      ? 'the large collecting case remains at his shore base'
      : 'the large collecting case remains with the expedition stores';
    people.push(`Syms Covington is ${distance < 3 ? 'close by' : `${distance.toFixed(1)}m away`} and ${activity}; he keeps the collecting case supplied and ready, while ${caseContext}.`);
  }
  for (const npcId of zone?.npcs || []) {
    if (npcId !== 'syms_covington') people.push(`regional NPC present: ${npcId}`);
  }
  return people.slice(0, 4);
}

export const LLM_RECENT_CONTEXT_KINDS = new Set(['player', 'narrator']);
export const LLM_RECENT_CONTEXT_SOURCES = new Set(['player', 'llm', 'scripted-identity', 'scripted-place', 'local']);

export function recentNarrationContext(log) {
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
    // Eight turns, not four: a conversation that stays in 1835 needs enough
    // room for the narrator to still see what "they" referred to.
    .slice(-8);
}

export function ambientThoughtPatch(state, { weather = state.weather, timeOfDay = state.timeOfDay, trigger = 'ambient' } = {}) {
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
  if (motion.visualActive !== undefined) {
    threeRuntimeState.playerMotion.visualActive = Boolean(motion.visualActive);
  }
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
      target.lastStep.groundSource = typeof source.groundSource === 'string' ? source.groundSource : null;
      target.lastStep.target = source.target || null;
      target.lastStep.intensity = clamp(Number(source.intensity) || 0, 0, 1);
      target.lastStep.time = Number.isFinite(Number(source.time)) ? Number(source.time) : target.lastStep.time;
    }
  }
  return target;
}

// Skeletal contacts and the controller's cadence fallback both publish here.
// Assigning the id at the shared boundary keeps the stream monotonic when one
// source temporarily takes over from the other (clip blends, missing profiles,
// or a model whose foot probes do not quite reach the movement surface).
export function publishRuntimeFootStep(step = {}) {
  const target = threeRuntimeState.footContacts.lastStep;
  updateRuntimeFootContacts({
    lastStep: {
      ...step,
      id: target.id + 1,
    },
  });
  return target;
}

export function makeJournalEntry({ specimen, tool, result, documented = false, location, day, timeOfDay }) {
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

// Every way a specimen enters the record — a tool or bare hands on a live
// animal, a hammer chip, a hand-gathered crop, the examine view — ends here, so
// the case, the deduplication rule, the journal line, and the "what just
// happened" markers cannot drift apart between them.
//
// The rule: the first specimen of a species goes into the case; any later
// encounter with that species is documented, not taken. A full case refuses a
// new species and offers the choice of releasing something or going aboard.
export function caseFullPatch(name, actorId = null) {
  return {
    caseFullChoice: { actorId, specimenName: name, at: Date.now() },
    message: 'The specimen case is full.',
    lastOutcome: null,
  };
}

export function recordSpecimenPatch(state, {
  specimen,
  tool,
  result,
  documented = false,
  actorId = null,
  caseEntry = {},
  location,
  narrationSource,
  symsLine = null,
  educationalNote = null,
  extraNarratorEvents = [],
}) {
  const collected = Boolean(result.success && !documented);
  const entry = makeJournalEntry({
    specimen,
    tool,
    result,
    documented,
    location,
    day: state.day,
    timeOfDay: state.timeOfDay,
  });
  const rarityTier = getSpecimenRarity(specimen).id;
  const actorIds = state.collectedSpecimenActorIds || [];
  return {
    fatigue: clamp(state.fatigue + (result.fatigueDelta || 0), 0, MAX_FATIGUE),
    inventory: collected
      ? [...state.inventory, { ...specimen, condition: result.outcomeType, ...caseEntry }]
      : state.inventory,
    journal: [...state.journal, entry],
    collectedSpecimenIds: collected && !state.collectedSpecimenIds.includes(specimen.id)
      ? [...state.collectedSpecimenIds, specimen.id]
      : state.collectedSpecimenIds,
    collectedSpecimenActorIds: collected && actorId && !actorIds.includes(actorId)
      ? [...actorIds, actorId]
      : actorIds,
    documentedSpecimenIds: documented && !state.documentedSpecimenIds.includes(specimen.id)
      ? [...state.documentedSpecimenIds, specimen.id]
      : state.documentedSpecimenIds,
    // The species enters the sighted record however it was met, so a later
    // close approach cannot replay the discovery beat for it.
    ...(!state.sightedSpecimenIds.includes(specimen.id)
      ? { sightedSpecimenIds: [...state.sightedSpecimenIds, specimen.id] }
      : {}),
    questComplete: state.questComplete || collected || documented,
    lastOutcome: { specimen, tool, result, documented, collectedActorId: collected ? actorId : null },
    // The case tab's shimmer and the case-button glow need markers that
    // survive the per-frame actions that clear lastOutcome after a collect.
    ...(collected ? { lastCasedActorId: actorId, lastCasedAt: Date.now(), lastCasedRarityTier: rarityTier } : {}),
    message: result.reason,
    ...(educationalNote ? { educationalNote } : {}),
    ...(symsLine ? { symsLine } : {}),
    narratorLog: appendNarratorEvents(state.narratorLog, [
      ...narrationPayloadToEvents({ narration: result.reason, symsLine }, state, narrationSource),
      ...extraNarratorEvents,
    ]),
  };
}

// A sighting requires the animal to be genuinely near. Falls open when either
// position is unknown so headless and e2e flows still record sightings.
export const SIGHTING_RANGE_M = 15;
export function specimenWithinSightingRange(state, specimen) {
  const player = state.playerPose?.position;
  const actorId = specimen.instanceId || specimen.id;
  const runtime = state.specimenRuntimePositions?.[state.currentZoneId]?.[actorId];
  const spawn = Array.isArray(specimen.spawnPoint) ? specimen.spawnPoint : null;
  const x = runtime?.x ?? spawn?.[0];
  const z = runtime?.z ?? spawn?.[2];
  if (!Number.isFinite(player?.x) || !Number.isFinite(x) || !Number.isFinite(z)) return true;
  return Math.hypot(x - player.x, z - player.z) <= SIGHTING_RANGE_M;
}

export function gameMinutesForState(state) {
  return Math.round((state.timeOfDay || 0) * 60);
}

// Each dilemma resolves through one of two authored choices: quick with a
// cost, or careful with a delay. Deterministic — no typing, no model call.
export const FIELD_DILEMMA_CONFIG = {
  net_snagged: {
    title: 'The insect net is snagged',
    body: 'The mesh has caught on cactus spines. A hard pull would tear it, and the spines are close around your hand.',
    choices: [
      {
        id: 'quick',
        label: 'Rip it free',
        detail: 'Fast — but the spines rake your hand. Costs a little health.',
        minutes: 2,
        healthCost: 4,
        narration: 'You wrench the net clear in one motion. The mesh survives; your knuckles do not entirely.',
        symsLine: '"Effective, sir. Bloody, but effective."',
      },
      {
        id: 'careful',
        label: 'Work it loose, spine by spine',
        detail: 'Careful and clean. Costs half an hour of daylight.',
        minutes: 30,
        healthCost: 0,
        narration: 'You back the caught edge out along each spine in turn. The net comes away whole, and the morning is a little older.',
        symsLine: '"Patience saves the mesh, sir."',
      },
    ],
  },
  cactus_spines: {
    title: 'Cactus spines are embedded',
    body: 'Several spines have gone in deep enough that careless movement will be costly.',
    choices: [
      {
        id: 'quick',
        label: 'Pull them out now',
        detail: 'Immediate — but rough on the hand. Costs a little health.',
        minutes: 2,
        healthCost: 5,
        narration: 'You grip each spine and pull. It is quick, and it is not painless.',
        symsLine: '"A steadier hand would have hurt less, sir."',
      },
      {
        id: 'careful',
        label: 'Extract them with the knife point',
        detail: 'Slow and clean. Costs twenty minutes.',
        minutes: 20,
        healthCost: 0,
        narration: 'You treat the spines as objects, not insults: inspect, lift, and draw each one out whole.',
        symsLine: '"Neat work, sir. The lens helps."',
      },
    ],
  },
  hammer_shard: {
    title: 'A hammer chip has struck you',
    body: 'A hard rock flake has caught your hand after the blow. It needs dealing with before more hammering.',
    choices: [
      {
        id: 'quick',
        label: 'Rinse it and press on',
        detail: 'Quick — but the cut stays angry. Costs a little health.',
        minutes: 2,
        healthCost: 4,
        narration: 'A splash of water, a strip of cloth, and back to work. The hand complains for the rest of the day.',
        symsLine: '"If it festers, sir, we both regret it."',
      },
      {
        id: 'careful',
        label: 'Sit down and treat it properly',
        detail: 'Thorough. Costs twenty minutes.',
        minutes: 20,
        healthCost: 0,
        narration: 'You stop, clean the cut, and bind it as it deserves. The hand will serve for the rest of the survey.',
        symsLine: '"Better twenty minutes now than a bad hand for three days, sir."',
      },
    ],
  },
};


export function getFieldDilemma(type) {
  return FIELD_DILEMMA_CONFIG[type] || null;
}

export function constraintBlocksTool(constraint, toolId) {
  if (!constraint || !toolId) return false;
  return Array.isArray(constraint.blockedTools) && constraint.blockedTools.includes(toolId);
}

export function blockedToolMessage(constraint, toolId) {
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

export function createExpeditionSlice() {
  const expedition = createInitialExpeditionState();
  return {
    schemaVersion: expedition.schemaVersion,
    seed: expedition.seed,
    health: expedition.health,
    fatigue: expedition.fatigue,
    playableModeId: DEFAULT_PLAYABLE_MODE_ID,
    playableSpawnPoint: null,
    playableHiddenActorId: null,
    activeToolId: 'hands',
    toolbarOrder: [...DEFAULT_DARWIN_TOOLBAR],
    darwinToolbarOrder: [...DEFAULT_DARWIN_TOOLBAR],
    supplies: { ...INITIAL_SUPPLIES },
    minutesSinceMeal: 0,
    caseFullChoice: null,
    caseReleaseMode: false,
    caseCapacity: CASE_CAPACITY,
    favoriteSpecimenIds: [],
    inventory: expedition.inventory,
    // Specimens struck below deck on the Beagle. `inventory` is only what is
    // in the case Darwin carries; this is everything already landed.
    shipCollection: [],
    journal: expedition.journal,
    // In-progress journal entry text; lives in the store so an accidental
    // close of the notebook doesn't lose writing.
    journalDraft: '',
    collectedSpecimenIds: expedition.collectedSpecimenIds,
    collectedSpecimenActorIds: expedition.collectedSpecimenActorIds || [],
    documentedSpecimenIds: expedition.documentedSpecimenIds,
    // Species whose first nearby encounter has already fired the "new species
    // sighted" discovery beat, so each species announces itself once.
    sightedSpecimenIds: expedition.sightedSpecimenIds || [],
    specimenSighting: null,
    // Type-level examination record: a saved note on one finch marks the
    // species examined everywhere. No longer gates collection; it feeds the
    // final assessment's restraint ratio and the bare-hands Examine prompt.
    examinedTypeIds: expedition.examinedTypeIds || [],
    // One-time teaching lines already shown (see HINT_IDS in ThreeHUD). Kept
    // in the save so a returning player is not taught the same verb twice.
    seenHints: expedition.seenHints || [],
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
    // Set once the Beagle has sailed. The HUD watches it and opens Henslow's
    // judgment; nothing else reads it, so it is not persisted — a resumed save
    // always resumes playable and ends again on its own terms.
    expeditionDeparted: false,
    // The two-hour halt in the field: 'resting' while the clip plays, then
    // 'complete' with the authored card copy. See beginRest.
    restSession: null,
    questComplete: false,
    // Current game objective (see directives.js). Advances silently whenever
    // the active one is satisfied; `directiveCompletedId` briefly names the
    // one just finished so the HUD can play its tick-off before swapping.
    activeDirectiveId: FIRST_DIRECTIVE_ID,
    directiveCompletedId: null,
    // 0-100 social meter: 0 = distrusted by settlers/crew, 100 = respected.
    // Nothing moves it yet; quest and dialogue outcomes call adjustLocalStanding.
    localStanding: 50,
  };
}

export function createSceneSlice() {
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
    fieldAction: null,
    observationMode: false,
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
    // Encounter consequences persist in the bounded classroom resume snapshot
    // because the final assessment counts whom Darwin actually engaged.
    npcEncounterState: { syms_covington: { trust: 50, flags: [] } },
    symsDirective: DEFAULT_SYMS_DIRECTIVE,
    symsZoneId: SYMS_HOME_ZONE_ID,
    narratorScriptedKeys: {
      [`zone:${currentZoneId}`]: 1 * 1440 + INITIAL_NARRATOR_TIME * 60,
    },
    weather: normalizeWeatherState(initialNarration.weather, 'sunny'),
    // Narration/LLM weather pins the sky for a while; the island weather
    // simulation resumes authority once untilMinutes passes.
    weatherOverride: null,
    sounds: initialNarration.sounds,
    // Hero is the default: it steers itself as he moves, so an expedition never
    // starts needing a manual orbit to see where you are going.
    viewMode: 'hero',
    transition: null,
    edgePrompt: null,
    contextPrompt: null,
    contextPromptCandidates: {},
    contextPromptHistory: {},
    dismissedEdgePromptId: null,
    arrivalEdgeBlock: null,
    animalModeNpcEncounter: null,
    animalModeDarwinNpcPose: null,
    animalModeStats: {},
    lastOutcome: null,
    lastHealthDamage: null,
    lastCasedActorId: null,
    lastCasedAt: 0,
    lastCasedRarityTier: 'common',
    nightlyDebrief: null,
    dayTitleCard: null,
    expeditionOutcome: null,
    finalAssessment: null,
    activeConstraint: null,
    majorEvent: null,
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
    carryDropRequest: null,
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
    // Persistent for the current expedition session. Crop renderers remount on
    // region travel, so damaged vines need a small serializable state record
    // rather than storing permanent trampling only inside a React component.
    cropDamageById: {},
    foragedObjectIds: [],
    symsLine: 'Syms waits with the collecting case ready at his shore base.',
  };
}
