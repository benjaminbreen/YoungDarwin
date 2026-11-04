'use client';

import { useEffect, useRef } from 'react';
import { getThreeSpecimens } from '../data';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';
import { onPropEvent } from '../physics/props/propEvents';
import { getZoneProps } from '../physics/props/propRegistry';
import { inferContactResponseKind } from '../world/surfaceContactResponse';
import { isRockBody } from './contactTargets';
import { getSpecimenRuntimePoses } from '../world/specimenRuntime';
import { getSocialEntry } from '../fauna/behavior/socialField';
import { getZone } from '../world/floreanaZones';
import { terrainBiomeAt, terrainHeight } from '../world/terrain';
import { WATER_LEVEL } from '../world/water';
import { getSurfaceContactProfile } from '../world/surfaceContact';
import { currentFoliageImmersion } from '../world/ecology/foliageContact';
import { postOfficeBayCoastZ } from '../world/regions/postOfficeBay/terrain';
import { weatherEnv } from '../world/weatherEnvRuntime';
import { exhaustionAmount } from '../world/exhaustionLook';
import {
  CONTEXTUAL_WORLD_AUDIO,
  DARWIN_BODY_AUDIO,
  FAUNA_AUDIO,
  FIELD_FOLEY_AUDIO,
  FOLEY_AUDIO,
  HAMMER_STRIKE_AUDIO,
  INTERACTION_AUDIO,
  MOTION_AUDIO,
  MOVEMENT_WILDLIFE_AUDIO,
  POST_OFFICE_BAY_AUDIO,
  TOOL_FOLEY_AUDIO,
  WILDLIFE_FIELDWORK_AUDIO,
} from './audioAssets';
import {
  HAMMER_STRIKE_PROFILES,
  acousticSpaceForZone,
  hammerStrikeMaterial,
  interactionMaterialForProp,
  knifeCutMaterial,
  materialFromInteractionEvent,
  pelletImpactSound,
} from './interactionMaterials';
import {
  computeEnvironmentalAudioTargets,
  dryInsectHabitat,
  isInteriorAmbienceZone,
  surfPresenceForZone,
  zoneHasDirectCoast,
} from './environmentMix';
import { crossedDusk, playDuskBell, playJournalEntryCue } from './interfaceFoley';
import {
  WILDLIFE_VOICE_PROFILES,
  createWildlifeVoiceDirector,
  lineOccluded,
  propagate,
  seabirdColonyBed,
  stepWildlifeVoices,
} from './wildlifeVoices';
import { jumpSoundShape } from './jumpSounds';
import { pickPlaceSound, placeAmbienceGains, placeLoopGains, probeWaterAround, soundPlacesForZone } from './placeSounds';
import {
  activatePostOfficeBayAudio,
  playAudioSprite,
  preloadSoundscapeToolEffects,
  setAcousticSpace,
  setAmbientAudioTargets,
  setSpatialAudioTarget,
  setSoundscapeAudioEnabled,
  setSoundscapeEnvironmentDebug,
  soundscapeAmbientIsReady,
  soundscapeAudioIsRunning,
} from './audioRuntime';

// The sprites behind every voice the wildlife director can ask for. Calls
// recorded in the field keep their original families so mixer trims carry
// over; modelled sounds use their own keys.
const WILDLIFE_SOUND_SPRITES = Object.freeze({
  gull: MOVEMENT_WILDLIFE_AUDIO.gull,
  finch: MOVEMENT_WILDLIFE_AUDIO.finch,
  dove: WILDLIFE_FIELDWORK_AUDIO.dove,
  mockingbird: WILDLIFE_FIELDWORK_AUDIO.mockingbird,
  hawk: WILDLIFE_FIELDWORK_AUDIO.hawk,
  owl: WILDLIFE_FIELDWORK_AUDIO.owl,
  goatBleat: CONTEXTUAL_WORLD_AUDIO.goatBleat,
  ...Object.fromEntries(Object.entries(FAUNA_AUDIO).filter(([, asset]) => asset?.url)),
});

function resolveWildlifeSound(sound) {
  return WILDLIFE_SOUND_SPRITES[sound] || null;
}

// Swimming, Darwin's controller rides about a metre below the waterline;
// wading never gets that deep.
function listenerSwimming(position) {
  return Number.isFinite(position?.y) && WATER_LEVEL - position.y > 0.85;
}

const ANIMAL_CONTACT_PROFILES = Object.freeze({
  floreanagianttortoise: Object.freeze({ family: 'tortoiseFootfall', stepDistance: 0.55, maxDistance: 18, nearDistance: 2, gain: 0.08, rate: 1 }),
  // Lava lizards are only heard when they dash, not as they creep.
  lavalizard: Object.freeze({ family: 'lizardScurry', stepDistance: 0.9, maxDistance: 9, nearDistance: 1.2, gain: 0.06, rate: 1, minSpeed: 0.9 }),
  galapagosracer: Object.freeze({ family: 'racerSlither', stepDistance: 1.6, maxDistance: 10, nearDistance: 1.5, gain: 0.07, rate: 1 }),
  crab: Object.freeze({ family: 'crabScuttle', stepDistance: 0.32, maxDistance: 12, nearDistance: 1.2, gain: 0.06, rate: 1.03 }),
  marineiguana: Object.freeze({ family: 'iguanaClaws', stepDistance: 0.48, maxDistance: 15, nearDistance: 1.5, gain: 0.072, rate: 0.94 }),
  feralgoat: Object.freeze({ family: 'goatHoof', stepDistance: 0.72, maxDistance: 25, nearDistance: 2.5, gain: 0.09, rate: 1.05 }),
  feralhorse: Object.freeze({ family: 'horseHoof', stepDistance: 0.92, maxDistance: 34, nearDistance: 3.5, gain: 0.115, rate: 0.99 }),
});

const WET_MICRO_ZONES = new Set(['MANGROVES', 'WATKINS_CREEK', 'ASILO_SPRING', 'S_WETLANDS']);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function chooseVariant(previous, count) {
  if (count <= 1) return 0;
  let next = Math.floor(Math.random() * count);
  if (next === previous) next = (next + 1 + Math.floor(Math.random() * (count - 1))) % count;
  return next;
}

function panFromWorldPosition(position) {
  const pose = getRuntimePlayerPose();
  if (!position || !pose?.position || !pose?.facing) return 0;
  const dx = (Number(position.x) || 0) - (Number(pose.position.x) || 0);
  const dz = (Number(position.z) || 0) - (Number(pose.position.z) || 0);
  const leftX = -(Number(pose.facing.z) || -1);
  const leftZ = Number(pose.facing.x) || 0;
  return Math.max(-0.22, Math.min(0.22, (dx * leftX + dz * leftZ) / 4));
}

function wildlifePanFromWorldPosition(position) {
  return Math.max(-0.42, Math.min(0.42, panFromWorldPosition(position) * 1.9));
}

// A sound with a place in the world: the runtime pans it through an HRTF
// panner at that position (camera-relative, full width, front and back);
// the stereo pan is only the fallback before the listener is live.
function worldSpatial(position) {
  return { position, pan: wildlifePanFromWorldPosition(position) };
}

function targetLooksLikeRock(target) {
  const text = [target?.contactMaterial, target?.material, target?.kind, target?.type, target?.id, target?.label]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /rock|stone|basalt|lava|boulder/.test(text);
}

function profileLooksLikeHardRock(profile) {
  return /basalt|lava|boulder|rock|cliff/.test(String(profile?.biome || '').toLowerCase());
}


// Flying birds whose takeoff is worth a wingbeat, and how fast each clip
// plays: the finch recording, slowed for heavier wings.
const FLYING_BIRD_PATTERN = /finch|dove|gull|hawk|owl|mockingbird|warbler|flycatcher|heron|egret|tern|noddy|booby|frigate|tattler|plover|stilt|turnstone|martin|cuckoo|tropicbird|petrel|cormorant|pelican/;
const TAKEOFF_RATE = [
  [/gull|hawk|owl|heron|pelican|frigate|booby|cormorant/, 0.9],
  [/dove|mockingbird|tern|noddy|tattler|egret/, 0.96],
];

// Spatial loops the place probe drives (placeSounds.js).
const PLACE_LOOP_KEYS = ['springBrook', 'rockLap', 'leaves', 'scrubInsects', 'crickets', 'edgeWind', 'tidePool'];

// Darwin's footfalls follow his pace: a stroll is soft and dark, a run lands
// harder and brighter, and each foot sits a touch to its own side of centre
// instead of every step coming from one random point.
const DARWIN_RUN_SPEED = 7.45;
// Takeoffs and landings were authored against the old, quieter footfalls;
// they rise with them so a landing still outweighs a step.
const DARWIN_FOLEY_LIFT = 1.75;

function darwinStepShape(event) {
  const pace = clamp01((Number(event?.horizontalSpeed) || 0) / DARWIN_RUN_SPEED);
  const side = event?.side === 'left' ? -1 : event?.side === 'right' ? 1 : 0;
  return {
    pace,
    gain: 0.82 + pace * 0.3,
    rate: 0.975 + pace * 0.04,
    // Only a stroll is softened; a normal walk is effectively unfiltered.
    filterHz: 4800 + pace * 9000,
    pan: side * 0.045 + (Math.random() - 0.5) * 0.04,
  };
}

// The brush layer under each step while wading through a plant. Grass is a
// light, quick swish; leafy and woody scrub is fuller; cactus pads are a dry,
// stiff scrape that should never read as leaves.
// Gains are set against the measured recordings (the grass rustle is ~6 dB
// quieter than the shrub one) so each brush peaks a few dB under a footfall.
const FOLIAGE_BRUSH = {
  grass: { track: 'brushGrass', sprite: 'grass', gain: 0.55, rate: 1.05, filterHz: 7200 },
  shrub: { track: 'brushShrub', sprite: 'shrub', gain: 0.32, rate: 0.98, filterHz: 6000 },
  spine: { track: 'brushSpine', sprite: 'shrub', gain: 0.17, rate: 1.2, filterHz: 4200 },
};

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function playRandomVariant(variantsRef, family, sprite, options = {}) {
  const previous = variantsRef.current[family];
  const index = chooseVariant(previous, sprite.variants);
  variantsRef.current[family] = index;
  return playAudioSprite(sprite, { family, index, ...options });
}

// The first recordings were authored for Post Office Bay; this controller now
// owns the complete island-wide mix and remains mounted across regions.
export function IslandSoundscape({ active, enabled }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const health = useThreeGameStore(state => state.health);
  const lastHealthDamage = useThreeGameStore(state => state.lastHealthDamage);
  const runtimeEnabled = Boolean(active && enabled);
  const latestRef = useRef({ currentZoneId, playableModeId, runtimeEnabled, timeOfDay, health });
  const variantsRef = useRef({
    grit: -1,
    sand: -1,
    water: -1,
    wood: -1,
    stone: -1,
    metal: -1,
    ceramic: -1,
    grass: -1,
    shrub: -1,
    hammerSwing: -1,
    netSwing: -1,
    netContact: -1,
    hammerBasalt: -1,
    hammerScoria: -1,
    hammerTuff: -1,
    hammerOlivine: -1,
    hammerCoral: -1,
    hammerIronCrust: -1,
    hammerSplit: -1,
    hammerWood: -1,
    hammerSucculent: -1,
    hammerHerb: -1,
    hammerStrain: -1,
    shardCoat: -1,
    stowRock: -1,
    stowPlant: -1,
    knifeSwish: -1,
    knifeSucculent: -1,
    knifeStem: -1,
    knifeBark: -1,
    pelletsRock: -1,
    pelletsEarth: -1,
    pelletsFoliage: -1,
    pelletsWood: -1,
    wildlifeFlush: -1,
    rockStep: -1,
    woodStep: -1,
    mudStep: -1,
    litterStep: -1,
    rockTakeoff: -1,
    rockLanding: -1,
    shotgunReport: -1,
    shotgunReload: -1,
    finchWing: -1,
    tortoiseStep: -1,
    gull: -1,
    finch: -1,
    dove: -1,
    mockingbird: -1,
    hawk: -1,
    owl: -1,
    thunder: -1,
    waveBreak: -1,
    fieldNote: -1,
    specimenContainer: -1,
    snareRope: -1,
    door: -1,
    pain: -1,
    collapse: -1,
    breath: -1,
    bodyImpact: -1,
    gear: -1,
    symsGrit: -1,
    symsSand: -1,
    symsRock: -1,
    crabScuttle: -1,
    iguanaClaws: -1,
    goatHoof: -1,
    horseHoof: -1,
    goatBleat: -1,
    settlementWork: -1,
    leatherHandling: -1,
    waterDrop: -1,
    dryBranch: -1,
    rockTumble: -1,
  });
  const lastStepAtRef = useRef(0);
  const lastLandingAtRef = useRef(0);
  const lastRockBumpAtRef = useRef(0);
  const lastLooseStoneAtRef = useRef(0);
  const lastWaterAtRef = useRef(0);
  const lastFoliageAtRef = useRef(0);
  const lastBrushAtRef = useRef(0);
  const lastClothAtRef = useRef(0);
  const lastBodyImpactAtRef = useRef(0);
  const lastGearAtRef = useRef(0);
  const lastPainAtRef = useRef(0);
  const lastSymsStepAtRef = useRef(0);
  const lastTwigAtRef = useRef(0);
  const lastTerrainDetailAtRef = useRef(0);
  const beeAudioRef = useRef({ lastAt: 0 });
  const handledDamageIdRef = useRef(lastHealthDamage?.id || 0);
  const windedRef = useRef({ active: false, intensity: 0, nextAt: 0 });
  const propContactsRef = useRef(new Map());
  const pushAudioRef = useRef(new Map());
  // When the current hammer or knife swing is due to land, so the first
  // impact it causes is heard as that tool rather than a generic bump.
  const toolImpactWindowRef = useRef(null);
  // The last hammer blow or gunshot: birds taking off just after it bolt.
  const loudEventAtRef = useRef(0);
  const lastTiredBreathAtRef = useRef(0);
  const pelletAudioRef = useRef(new Map());
  const takeoffAudioRef = useRef({ lastAt: 0, actors: new Map() });
  const scheduledAudioRef = useRef(new Set());
  const voiceDirectorRef = useRef(null);
  if (!voiceDirectorRef.current) voiceDirectorRef.current = createWildlifeVoiceDirector();
  const waveBreakScheduleRef = useRef({ zoneId: null, nextAt: 0 });
  const placeProbeRef = useRef({ zoneId: null, probe: null, at: 0 });
  const animalMotionRef = useRef(new Map());
  const microDetailRef = useRef({ zoneId: null, lastRain: 0, postRainUntil: 0, nextDripAt: 0, nextBranchAt: 0, nextSettlementAt: 0 });
  latestRef.current = { currentZoneId, playableModeId, runtimeEnabled, timeOfDay, health };

  useEffect(() => {
    propContactsRef.current.clear();
    pushAudioRef.current.clear();
    animalMotionRef.current.clear();
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    waveBreakScheduleRef.current = { zoneId: currentZoneId, nextAt: now + randomBetween(9000, 19000) };
    microDetailRef.current = {
      zoneId: currentZoneId,
      lastRain: weatherEnv.rainIntensity,
      postRainUntil: 0,
      nextDripAt: now + randomBetween(4500, 9500),
      nextBranchAt: now + randomBetween(12000, 26000),
      nextSettlementAt: now + randomBetween(12000, 26000),
    };
  }, [currentZoneId]);

  useEffect(() => {
    setSoundscapeAudioEnabled(Boolean(enabled));
    if (!runtimeEnabled) {
      windedRef.current.active = false;
      setAmbientAudioTargets({ surf: 0, wind: 0, rain: 0, insects: 0 }, 0.35);
      setSpatialAudioTarget('bee', { gain: 0 }, 0.12);
      setSoundscapeEnvironmentDebug(null);
    }
  }, [enabled, runtimeEnabled]);

  useEffect(() => {
    if (!runtimeEnabled) return undefined;
    const offBee = onPropEvent('bee-audio-proximity', event => {
      const current = latestRef.current;
      beeAudioRef.current.lastAt = performance.now();
      if (!current.runtimeEnabled
        || document.hidden
        || !event?.active
        || event.zoneId !== current.currentZoneId) {
        setSpatialAudioTarget('bee', { gain: 0 }, 0.1);
        return;
      }
      const player = getRuntimePlayerPose()?.position;
      const position = event.position;
      if (!player || !position) {
        setSpatialAudioTarget('bee', { gain: 0 }, 0.1);
        return;
      }
      const distance = Math.hypot(
        position.x - player.x,
        position.y - player.y,
        position.z - player.z,
      );
      const presence = 1 - smoothstep(0.55, 6.25, distance);
      const phaseGain = event.phase === 'dart' ? 1 : event.phase === 'descend' ? 0.42 : 0.76;
      const phaseRate = event.phase === 'dart' ? 1.045 : event.phase === 'descend' ? 0.955 : 0.99;
      setSpatialAudioTarget('bee', {
        gain: 0.06 * presence * presence * phaseGain * clamp01(event.gate),
        ...worldSpatial(position),
        playbackRate: phaseRate,
      }, 0.07);
    });
    const staleTimer = window.setInterval(() => {
      if (document.hidden || performance.now() - beeAudioRef.current.lastAt > 320) {
        setSpatialAudioTarget('bee', { gain: 0 }, 0.12);
      }
    }, 180);
    return () => {
      offBee();
      window.clearInterval(staleTimer);
      setSpatialAudioTarget('bee', { gain: 0 }, 0.1);
    };
  }, [runtimeEnabled]);

  useEffect(() => {
    if (!lastHealthDamage || lastHealthDamage.id <= handledDamageIdRef.current) return;
    handledDamageIdRef.current = lastHealthDamage.id;
    const current = latestRef.current;
    if (!current.runtimeEnabled
      || current.playableModeId !== 'darwin'
      || lastHealthDamage.source === 'drowning') return;
    const now = performance.now();
    windedRef.current.nextAt = Math.max(windedRef.current.nextAt, now + 1700);

    if (lastHealthDamage.outcomeType) {
      playRandomVariant(variantsRef, 'collapse', DARWIN_BODY_AUDIO.collapse, {
        gain: 0.17,
        playbackRate: randomBetween(0.94, 0.985),
      });
      playRandomVariant(variantsRef, 'gear', DARWIN_BODY_AUDIO.gear, {
        gain: 0.095,
        playbackRate: randomBetween(0.96, 1.025),
      });
      return;
    }

    if (Number(lastHealthDamage.amount) < 1.5 || now - lastPainAtRef.current < 2700) return;
    lastPainAtRef.current = now;
    const severity = clamp01(Number(lastHealthDamage.amount) / 18);
    playRandomVariant(variantsRef, 'pain', DARWIN_BODY_AUDIO.pain, {
      gain: 0.105 + severity * 0.055,
      playbackRate: randomBetween(0.97, 1.025),
    });
  }, [lastHealthDamage]);

  useEffect(() => {
    if (!runtimeEnabled) return undefined;
    const windedState = windedRef.current;
    const offWinded = onPropEvent('player-winded', event => {
      const current = latestRef.current;
      if (current.playableModeId !== 'darwin') return;
      const now = performance.now();
      windedState.active = Boolean(event?.active);
      windedState.intensity = clamp01(
        (Number(event?.effort) - 5) / 9 + (Number(event?.fatigue) || 0) / 260,
      );
      if (event?.active) windedState.nextAt = now + randomBetween(180, 520);
    });
    const updateBreathing = () => {
      const current = latestRef.current;
      const winded = windedState;
      if (!current.runtimeEnabled
        || current.playableModeId !== 'darwin'
        || !winded.active
        || document.hidden
        || !soundscapeAudioIsRunning()) return;
      const now = performance.now();
      if (now < winded.nextAt) return;
      playRandomVariant(variantsRef, 'breath', DARWIN_BODY_AUDIO.breath, {
        gain: 0.09 + winded.intensity * 0.035,
        playbackRate: randomBetween(0.965, 1.025),
      });
      winded.nextAt = now + randomBetween(1450, 2450);
    };
    const timer = window.setInterval(updateBreathing, 180);
    return () => {
      offWinded();
      window.clearInterval(timer);
      windedState.active = false;
    };
  }, [runtimeEnabled]);

  useEffect(() => {
    if (!runtimeEnabled) return undefined;
    const ensureRunning = () => {
      if (!soundscapeAmbientIsReady()) {
        void activatePostOfficeBayAudio({ preloadEffects: false });
      }
    };
    const resumeWhenVisible = () => {
      if (!document.hidden) ensureRunning();
    };
    ensureRunning();
    window.addEventListener('pointerdown', ensureRunning, { passive: true });
    window.addEventListener('keydown', ensureRunning);
    document.addEventListener('visibilitychange', resumeWhenVisible);
    return () => {
      window.removeEventListener('pointerdown', ensureRunning);
      window.removeEventListener('keydown', ensureRunning);
      document.removeEventListener('visibilitychange', resumeWhenVisible);
    };
  }, [runtimeEnabled]);

  // Every call comes from a real animal, chosen by what it is doing (see
  // wildlifeVoices.js), and travels to Darwin: later and duller with range,
  // muffled behind ground, through the cave and cliff space.
  useEffect(() => {
    if (!runtimeEnabled) return undefined;
    const director = voiceDirectorRef.current;
    const pending = new Set();
    const updateWildlife = () => {
      const current = latestRef.current;
      const zoneId = current.currentZoneId;
      const listener = getRuntimePlayerPose()?.position;
      const poses = getSpecimenRuntimePoses(zoneId);
      if (!current.runtimeEnabled || document.hidden || !soundscapeAudioIsRunning() || !listener || !poses) {
        setSpatialAudioTarget('seabirdColony', { gain: 0 }, 0.6);
        return;
      }
      const nowSeconds = performance.now() / 1000;
      const animals = [];
      for (const specimen of getThreeSpecimens(zoneId)) {
        if (!specimen?.id || !WILDLIFE_VOICE_PROFILES[specimen.id]) continue;
        const actorId = specimen.instanceId || specimen.id;
        const position = poses.get(actorId);
        if (!position || nowSeconds - Number(position.updatedAt || 0) > 3) continue;
        const social = getSocialEntry(zoneId, actorId);
        animals.push({
          actorId,
          speciesId: specimen.id,
          position,
          activity: social?.activity || 'default',
          alarmed: Boolean(social?.alarmed),
        });
      }
      const started = stepWildlifeVoices(director, {
        zoneId,
        animals,
        listener,
        heightAt: (x, z) => terrainHeight(x, z, zoneId),
        hour: Number(current.timeOfDay) || 12,
        rain: Number(weatherEnv.rainIntensity) || 0,
        underwater: listenerSwimming(listener),
        now: performance.now(),
        resolve: resolveWildlifeSound,
        play: request => {
          const start = () => playRandomVariant(variantsRef, request.sound, request.sprite, {
            gain: request.gain,
            playbackRate: request.playbackRate,
            ...worldSpatial(request.position),
            filterHz: request.filterHz,
          });
          if (request.delayMs <= 0) {
            start();
            return;
          }
          const id = window.setTimeout(() => {
            pending.delete(id);
            start();
          }, request.delayMs);
          pending.add(id);
        },
      });
      const colony = seabirdColonyBed(animals, listener, {
        hour: Number(current.timeOfDay) || 12,
        rain: Number(weatherEnv.rainIntensity) || 0,
      });
      setSpatialAudioTarget('seabirdColony', {
        gain: colony?.gain || 0,
        ...(colony ? worldSpatial(colony.position) : { pan: 0 }),
        filterHz: colony?.filterHz || 20000,
      }, 1.6);
      // Read by the sound diagnostics and the play harness.
      const debug = window.__darwinWildlifeVoices || { recent: [] };
      debug.colony = colony && { gain: Number(colony.gain.toFixed(4)), distance: Math.round(colony.distance), count: colony.count };
      debug.zoneId = zoneId;
      debug.hour = Number(current.timeOfDay) || 0;
      debug.animals = animals.map(animal => ({
        actorId: animal.actorId,
        activity: animal.activity,
        alarmed: animal.alarmed,
        distance: Math.round(Math.hypot(animal.position.x - listener.x, animal.position.z - listener.z)),
      }));
      for (const request of started) {
        debug.recent = [...debug.recent.slice(-19), {
          actorId: request.actorId,
          sound: request.sound,
          kind: request.kind,
          distance: Math.round(request.distance),
          occluded: request.occluded,
          gain: Number(request.gain.toFixed(4)),
          filterHz: Math.round(request.filterHz),
          delayMs: Math.round(request.delayMs),
        }];
      }
      window.__darwinWildlifeVoices = debug;
    };
    updateWildlife();
    const timer = window.setInterval(updateWildlife, 250);
    return () => {
      window.clearInterval(timer);
      pending.forEach(id => window.clearTimeout(id));
      setSpatialAudioTarget('seabirdColony', { gain: 0 }, 0.6);
    };
  }, [runtimeEnabled]);

  // Water where it actually is: the nearest running spring water and the
  // nearest rocky sea edge, found by probing the ground around Darwin, plus
  // the authored places that boom on their own (placeSounds.js).
  useEffect(() => {
    if (!runtimeEnabled) return undefined;
    const placeState = { zoneId: null, nextAt: new Map() };
    const pending = new Set();
    const silence = () => {
      for (const key of PLACE_LOOP_KEYS) setSpatialAudioTarget(key, { gain: 0 }, 0.4);
    };
    const updatePlaces = () => {
      const current = latestRef.current;
      const zoneId = current.currentZoneId;
      const listener = getRuntimePlayerPose()?.position;
      if (!current.runtimeEnabled || document.hidden || !listener) {
        silence();
        return;
      }
      const heightAt = (x, z) => terrainHeight(x, z, zoneId);
      const probe = probeWaterAround(listener, {
        heightAt,
        biomeAt: (x, z, y) => terrainBiomeAt(x, z, y, zoneId),
        waterLevel: WATER_LEVEL,
      }) || {};
      // Gabriel's fern spring seeps inside the cave, out of the terrain's
      // reach.
      if (zoneId === 'GABRIEL_SPRING' && !probe.brook) {
        probe.brook = { x: listener.x, z: listener.z, distance: 6, strength: 0.45 };
      }
      const gains = placeLoopGains(probe);
      setSpatialAudioTarget('springBrook', {
        gain: gains.brook,
        ...(probe.brook ? worldSpatial(probe.brook) : { pan: 0 }),
        filterHz: 20000 / (1 + (probe.brook?.distance || 0) / 10),
      }, 0.9);
      setSpatialAudioTarget('rockLap', {
        gain: gains.rockLap,
        ...(probe.rockSea ? worldSpatial(probe.rockSea) : { pan: 0 }),
        filterHz: 20000 / (1 + (probe.rockSea?.distance || 0) / 6),
      }, 0.9);
      // The probe's other finds, for the shore crashes and the spots below.
      placeProbeRef.current = { zoneId, probe, at: performance.now() };
      const indoors = isInteriorAmbienceZone(getZone(zoneId));
      const ambience = placeAmbienceGains(probe, {
        windStrength: clamp01((Number(weatherEnv.windSpeed) - 0.5) / 1.2),
        rain: Number(weatherEnv.rainIntensity) || 0,
        hour: Number(current.timeOfDay) || 12,
      });
      const spots = {
        leaves: probe.canopy,
        scrubInsects: probe.scrub,
        crickets: probe.scrub,
        edgeWind: probe.edge,
        tidePool: probe.tidePool,
      };
      for (const [key, spot] of Object.entries(spots)) {
        setSpatialAudioTarget(key, {
          gain: indoors ? 0 : ambience[key],
          ...(spot ? worldSpatial(spot) : { pan: 0 }),
          filterHz: 20000 / (1 + (spot?.distance || 0) / 14),
        }, 1.2);
      }

      if (placeState.zoneId !== zoneId) {
        placeState.zoneId = zoneId;
        placeState.nextAt.clear();
      }
      if (!soundscapeAudioIsRunning()) return;
      const now = performance.now();
      for (const place of soundPlacesForZone(zoneId)) {
        if (!placeState.nextAt.has(place.id)) {
          placeState.nextAt.set(place.id, now + randomBetween(place.every[0], place.every[1]) * 600);
          continue;
        }
        if (now < placeState.nextAt.get(place.id)) continue;
        placeState.nextAt.set(place.id, now + randomBetween(place.every[0], place.every[1]) * 1000);
        const position = place.zoneWide ? null : { x: place.x, y: place.y, z: place.z };
        const distance = position
          ? Math.hypot(position.x - listener.x, position.y - listener.y, position.z - listener.z)
          : place.distance;
        const shaped = propagate(distance, {
          near: place.near,
          far: place.far,
          occluded: position ? lineOccluded(listener, position, heightAt) : false,
        });
        const choice = pickPlaceSound(place);
        const sprite = choice && resolveWildlifeSound(choice.sound);
        if (!shaped || !sprite) continue;
        const start = () => playRandomVariant(variantsRef, choice.sound, sprite, {
          gain: place.gain * choice.gain * shaped.gain,
          playbackRate: randomBetween(0.9, 1.04),
          ...(position ? worldSpatial(position) : { pan: randomBetween(-0.2, 0.2) }),
          filterHz: shaped.filterHz,
        });
        if (shaped.delayMs > 0) {
          const id = window.setTimeout(() => {
            pending.delete(id);
            start();
          }, shaped.delayMs);
          pending.add(id);
        } else {
          start();
        }
      }
    };
    updatePlaces();
    const timer = window.setInterval(updatePlaces, 400);
    return () => {
      window.clearInterval(timer);
      pending.forEach(id => window.clearTimeout(id));
      silence();
    };
  }, [runtimeEnabled]);

  useEffect(() => {
    if (!runtimeEnabled) return undefined;
    const updateAnimalContacts = () => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || document.hidden || !soundscapeAudioIsRunning()) return;
      const player = getRuntimePlayerPose()?.position;
      const poses = getSpecimenRuntimePoses(current.currentZoneId);
      if (!player || !poses) return;
      const now = performance.now();
      const nowSeconds = now / 1000;
      const actors = new Set();

      for (const specimen of getThreeSpecimens(current.currentZoneId)) {
        if (!specimen?.id) continue;
        const profile = ANIMAL_CONTACT_PROFILES[specimen.id];
        if (!profile) continue;
        const actorId = specimen.instanceId || specimen.id;
        const position = poses.get(actorId);
        if (!position || nowSeconds - Number(position.updatedAt || 0) > 0.7) continue;
        actors.add(actorId);
        const previous = animalMotionRef.current.get(actorId);
        const wet = specimen.id === 'marineiguana' && position.y <= WATER_LEVEL + 0.08;
        if (!previous) {
          animalMotionRef.current.set(actorId, { x: position.x, y: position.y, z: position.z, at: now, travel: 0, wet });
          continue;
        }
        const elapsed = Math.max(0.001, (now - previous.at) / 1000);
        const moved = Math.hypot(position.x - previous.x, position.z - previous.z);
        const plausibleMove = moved < 2.2 && moved / elapsed > 0.045;
        const travel = plausibleMove ? previous.travel + moved : 0;
        animalMotionRef.current.set(actorId, { x: position.x, y: position.y, z: position.z, at: now, travel, wet });
        if (!plausibleMove) continue;

        if (wet && !previous.wet) {
          const waterDistance = Math.hypot(position.x - player.x, position.z - player.z);
          if (waterDistance < 13) {
            const presence = 1 - smoothstep(1.5, 13, waterDistance);
            playRandomVariant(variantsRef, 'water', POST_OFFICE_BAY_AUDIO.waterSteps, {
              gain: 0.065 * presence,
              playbackRate: randomBetween(0.94, 1.01),
              ...worldSpatial(position),
            });
          }
        }
        if (travel < profile.stepDistance) continue;
        animalMotionRef.current.set(actorId, {
          x: position.x,
          y: position.y,
          z: position.z,
          at: now,
          travel: travel % profile.stepDistance,
          wet,
        });
        const distance = Math.hypot(position.x - player.x, position.y - player.y, position.z - player.z);
        if (distance >= profile.maxDistance) continue;
        const presence = 1 - smoothstep(profile.nearDistance, profile.maxDistance, distance);
        const speedPresence = clamp01((moved / elapsed - 0.04) / 1.35);
        if (profile.minSpeed && moved / elapsed < profile.minSpeed) continue;
        const sprite = CONTEXTUAL_WORLD_AUDIO[profile.family] || FAUNA_AUDIO[profile.family];
        playRandomVariant(variantsRef, profile.family, sprite, {
          gain: profile.gain * (0.28 + presence * 0.72) * (0.7 + speedPresence * 0.3),
          playbackRate: profile.rate * randomBetween(0.975, 1.025),
          ...worldSpatial(position),
        });
      }

      for (const actorId of animalMotionRef.current.keys()) {
        if (!actors.has(actorId)) animalMotionRef.current.delete(actorId);
      }
    };
    const timer = window.setInterval(updateAnimalContacts, 150);
    return () => {
      window.clearInterval(timer);
      animalMotionRef.current.clear();
    };
  }, [runtimeEnabled]);

  // Paper sounds for what Darwin writes, and the Beagle's bell at dusk. A
  // restored save replaces the journal wholesale, so only a single fresh
  // entry is heard.
  useEffect(() => {
    if (!runtimeEnabled) return undefined;
    return useThreeGameStore.subscribe((state, previous) => {
      if (!latestRef.current.runtimeEnabled) return;
      if (state.journal !== previous.journal && state.journal?.length === (previous.journal?.length || 0) + 1) {
        const entry = state.journal.at(-1);
        const age = Date.now() - Date.parse(entry?.createdAt || '');
        if (!(age > 5000)) playJournalEntryCue(entry);
      }
      if (state.timeOfDay !== previous.timeOfDay && crossedDusk(previous, state)) playDuskBell();
    });
  }, [runtimeEnabled]);

  useEffect(() => {
    if (!runtimeEnabled) return undefined;
    const update = () => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || document.hidden) {
        setAmbientAudioTargets({ surf: 0, wind: 0, rain: 0, insects: 0 }, 0.55);
        setSpatialAudioTarget('coatFlap', { gain: 0 }, 0.3);
        setSpatialAudioTarget('heartbeat', { gain: 0 }, 0.3);
        return;
      }
      const position = getRuntimePlayerPose()?.position;
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
      const zone = getZone(current.currentZoneId);
      const shorelineDistance = current.currentZoneId === 'POST_OFFICE_BAY'
        ? Math.abs(position.z - postOfficeBayCoastZ(position.x))
        : null;
      const now = performance.now();
      const slowGust = 0.82
        + Math.sin(now * 0.00019) * 0.11
        + Math.sin(now * 0.00047 + 1.8) * 0.07;
      const mixContext = {
        zone,
        position,
        resolveZone: getZone,
        shorelineDistance,
        weather: weatherEnv,
        timeOfDay: current.timeOfDay,
        gust: slowGust,
      };
      const targets = computeEnvironmentalAudioTargets(mixContext);
      const surfPresence = surfPresenceForZone(mixContext);
      const directCoast = zoneHasDirectCoast(zone);
      const indoors = isInteriorAmbienceZone(zone);
      const detail = microDetailRef.current;
      if (detail.zoneId !== current.currentZoneId) return;
      const rainIntensity = clamp01(weatherEnv.rainIntensity);
      if (detail.lastRain >= 0.1 && rainIntensity < 0.035) {
        detail.postRainUntil = now + randomBetween(65000, 115000);
      }
      detail.lastRain = rainIntensity;
      const wetMicroclimate = WET_MICRO_ZONES.has(current.currentZoneId)
        || /wetland|mangrove|spring|creek|humid|forest/.test(`${zone.biome || ''} ${zone.terrainPreset || ''}`.toLowerCase());
      const dripping = !indoors
        && rainIntensity < 0.42
        && (wetMicroclimate || rainIntensity >= 0.045 || now < detail.postRainUntil);
      const dryBranchMovement = !indoors
        && rainIntensity < 0.08
        && dryInsectHabitat(zone)
        && Number(weatherEnv.foliageWindSpeed) >= 1.08;
      const settlementActive = current.currentZoneId === 'PENAL_COLONY'
        && !indoors
        && rainIntensity < 0.08
        && current.timeOfDay >= 6.5
        && current.timeOfDay <= 18.5;
      setSoundscapeEnvironmentDebug({
        zoneId: zone.id,
        zoneName: zone.name,
        biome: zone.biome,
        terrainPreset: zone.terrainPreset,
        interior: indoors,
        directCoast,
        adjacentCoast: !directCoast && surfPresence > 0,
        dryInsectHabitat: dryInsectHabitat(zone),
        surfPresence,
        rainIntensity,
        windSpeed: weatherEnv.windSpeed,
        foliageWindSpeed: weatherEnv.foliageWindSpeed,
        timeOfDay: current.timeOfDay,
        microDetails: { dripping, dryBranchMovement, settlementActive },
        targets,
      });
      setAmbientAudioTargets(targets, 0.95);
      setAcousticSpace(acousticSpaceForZone(zone) || (indoors ? 'room' : 'open'));
      // Darwin's coat in the wind, strongest on the exposed Promontory.
      const exposure = indoors || current.playableModeId !== 'darwin'
        ? 0
        : zone?.type === 'promontory' ? 1 : directCoast ? 0.6 : 0.4;
      // windSpeed idles near 1, which should leave a faint flutter rather
      // than silence; a full gale (about 1.7) opens it all the way.
      const windStrength = clamp01((Number(weatherEnv.windSpeed) - 0.5) / 1.2);
      const gust = clamp01(Number(weatherEnv.windGust) || 0.5);
      setSpatialAudioTarget('coatFlap', {
        gain: 0.12 * windStrength ** 1.2 * exposure * (0.5 + gust * 0.5),
        playbackRate: 0.96 + gust * 0.08,
      }, 0.6);
      // Darwin's pulse rises under the drained-colour exhaustion look, from
      // the same ramp, and quickens as it deepens.
      const spent = current.playableModeId === 'darwin'
        ? exhaustionAmount(current.health, useThreeGameStore.getState().fatigue)
        : 0;
      setSpatialAudioTarget('heartbeat', {
        gain: spent > 0.04 ? 0.11 * spent ** 1.3 : 0,
        playbackRate: 0.92 + spent * 0.22,
      }, 1.2);

      if (dripping && now >= detail.nextDripAt) {
        playRandomVariant(variantsRef, 'waterDrop', CONTEXTUAL_WORLD_AUDIO.waterDrop, {
          gain: randomBetween(0.034, 0.058),
          playbackRate: randomBetween(0.94, 1.055),
          pan: randomBetween(-0.24, 0.24),
          filterHz: rainIntensity >= 0.045 ? 8200 : 12500,
        });
        detail.nextDripAt = now + randomBetween(4800, rainIntensity >= 0.045 ? 11800 : 15500);
      } else if (!dripping && now >= detail.nextDripAt) {
        detail.nextDripAt = now + randomBetween(3500, 6000);
      }

      if (dryBranchMovement && now >= detail.nextBranchAt) {
        const gustPresence = clamp01((Number(weatherEnv.foliageWindSpeed) - 1.02) / 0.45);
        playRandomVariant(variantsRef, 'dryBranch', CONTEXTUAL_WORLD_AUDIO.dryBranch, {
          gain: 0.032 + gustPresence * 0.026,
          playbackRate: randomBetween(0.94, 1.04),
          pan: randomBetween(-0.24, 0.24),
        });
        detail.nextBranchAt = now + randomBetween(18000, 44000);
      } else if (!dryBranchMovement && now >= detail.nextBranchAt) {
        detail.nextBranchAt = now + randomBetween(4500, 7500);
      }

      if (settlementActive && now >= detail.nextSettlementAt) {
        playRandomVariant(variantsRef, 'settlementWork', CONTEXTUAL_WORLD_AUDIO.settlementWork, {
          gain: randomBetween(0.052, 0.078),
          playbackRate: randomBetween(0.965, 1.02),
          pan: randomBetween(-0.22, 0.22),
          filterHz: randomBetween(2700, 4700),
        });
        detail.nextSettlementAt = now + randomBetween(24000, 56000);
      } else if (!settlementActive && now >= detail.nextSettlementAt) {
        detail.nextSettlementAt = now + randomBetween(5000, 8500);
      }

      const waveSchedule = waveBreakScheduleRef.current;
      if (waveSchedule.zoneId === current.currentZoneId
        && !indoors
        && directCoast
        && surfPresence >= 0.45
        && now >= waveSchedule.nextAt) {
        // Where the probe has found the shore, the swell breaks there and
        // comes in sets on the swell's period; otherwise an occasional
        // break somewhere along the coast.
        const placed = placeProbeRef.current;
        const shore = placed.zoneId === current.currentZoneId && now - placed.at < 2000
          ? placed.probe?.seaEdge
          : null;
        if (shore && shore.distance <= 24) {
          const closeness = 1 - smoothstep(2, 24, shore.distance);
          playRandomVariant(variantsRef, 'waveBreak', POST_OFFICE_BAY_AUDIO.waveBreak, {
            gain: (shore.rocky ? 0.045 : 0.035) + closeness * 0.05,
            playbackRate: randomBetween(0.95, 1.03) * (shore.rocky ? 0.96 : 1),
            ...worldSpatial({ x: shore.x, y: WATER_LEVEL, z: shore.z }),
            filterHz: 18000 / (1 + shore.distance / 18),
          });
          const set = waveSchedule.set = (waveSchedule.set || 0) + 1;
          if (set < 2 + Math.floor(Math.random() * 2)) {
            waveSchedule.nextAt = now + randomBetween(7500, 11500);
          } else {
            waveSchedule.set = 0;
            waveSchedule.nextAt = now + randomBetween(16000, 28000);
          }
        } else {
          const closeness = smoothstep(0.45, 1, surfPresence);
          playRandomVariant(variantsRef, 'waveBreak', POST_OFFICE_BAY_AUDIO.waveBreak, {
            gain: 0.035 + closeness * 0.045,
            playbackRate: randomBetween(0.975, 1.025),
            pan: randomBetween(-0.2, 0.2),
          });
          waveSchedule.nextAt = now + randomBetween(17000, 39000);
        }
      } else if (now >= waveSchedule.nextAt) {
        waveSchedule.nextAt = now + randomBetween(3500, 6000);
      }
    };
    update();
    const timer = window.setInterval(update, 240);
    return () => {
      window.clearInterval(timer);
      setAmbientAudioTargets({ surf: 0, wind: 0, rain: 0, insects: 0 }, 0.45);
    };
  }, [runtimeEnabled]);

  useEffect(() => {
    let disposed = false;
    const playContact = (family, sprite, {
      intensity = 0.55,
      baseGain = 0.18,
      pan = (Math.random() - 0.5) * 0.12,
      playbackJitter = 0.05,
      playbackRateCenter = 1,
      filterHz = null,
      position = null,
    } = {}) => {
      const previous = variantsRef.current[family];
      const index = chooseVariant(previous, sprite.variants);
      variantsRef.current[family] = index;
      const strength = 0.76 + clamp01(Number(intensity) || 0.55) * 0.24;
      return playAudioSprite(sprite, {
        family,
        index,
        gain: baseGain * strength,
        playbackRate: playbackRateCenter - playbackJitter * 0.5 + Math.random() * playbackJitter,
        pan,
        filterHz,
        position,
      });
    };

    // Layers riding on top of each of Darwin's footfalls: the plant he is
    // wading through, and on a run, the occasional shift of coat and satchel.
    const playDarwinStepLayers = (event, step, now) => {
      const immersion = currentFoliageImmersion();
      const brush = immersion && FOLIAGE_BRUSH[immersion.kind];
      // The entry rustle already covers the first contact with a plant.
      if (brush && step.pace > 0.08 && now - lastBrushAtRef.current >= 240
        && now - lastFoliageAtRef.current >= 150) {
        lastBrushAtRef.current = now;
        const depth = 0.35 + immersion.proximity * 0.65;
        playContact(brush.track, INTERACTION_AUDIO[brush.sprite], {
          intensity: step.pace,
          baseGain: brush.gain * depth * step.gain,
          pan: step.pan * 1.4,
          playbackJitter: 0.09,
          playbackRateCenter: brush.rate + step.pace * 0.03,
          filterHz: brush.filterHz,
        });
      }
      if (step.pace > 0.7 && now - lastClothAtRef.current >= 520 && Math.random() < 0.45) {
        lastClothAtRef.current = now;
        playRandomVariant(variantsRef, 'cloth', DARWIN_BODY_AUDIO.gear, {
          gain: 0.07 + (step.pace - 0.7) * 0.06,
          playbackRate: randomBetween(1.0, 1.06),
          pan: step.pan * 0.5,
          filterHz: 3800,
        });
      }
    };

    const scheduleToolFoley = (delayMs, callback) => {
      const requestedAt = performance.now();
      void preloadSoundscapeToolEffects().then(() => {
        if (disposed || !latestRef.current.runtimeEnabled) return;
        const remaining = Math.max(0, delayMs - (performance.now() - requestedAt));
        const timer = window.setTimeout(() => {
          scheduledAudioRef.current.delete(timer);
          if (!disposed && latestRef.current.runtimeEnabled) callback();
        }, remaining);
        scheduledAudioRef.current.add(timer);
      });
    };

    const offSurface = onPropEvent('surface-contact', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled
        || !['darwin', 'finch', 'tortoise'].includes(current.playableModeId)) return;
      const now = performance.now();
      const responseKind = inferContactResponseKind(event.surfaceProfile || {}, event.target);
      const contactKind = event?.kind || 'footstep';
      const hardRock = targetLooksLikeRock(event?.target)
        || profileLooksLikeHardRock(event?.surfaceProfile);
      if (contactKind === 'footstep') {
        if (now - lastStepAtRef.current < 115) return;
        lastStepAtRef.current = now;
        if (current.playableModeId === 'tortoise') {
          playContact('tortoiseStep', MOVEMENT_WILDLIFE_AUDIO.tortoiseStep, {
            intensity: event.intensity,
            baseGain: 0.09,
            playbackJitter: 0.035,
            playbackRateCenter: 0.94,
          });
          const surfaceLayer = hardRock
            ? ['rockStep', MOVEMENT_WILDLIFE_AUDIO.rockStep, 0.032]
            : responseKind === 'sand'
              ? ['sand', POST_OFFICE_BAY_AUDIO.sandSteps, 0.038]
              : responseKind === 'wood'
                ? ['woodStep', MOVEMENT_WILDLIFE_AUDIO.woodStep, 0.03]
                : responseKind === 'mud'
                  ? ['mudStep', MOVEMENT_WILDLIFE_AUDIO.mudStep, 0.045]
                  : responseKind === 'litter'
                    ? ['litterStep', MOVEMENT_WILDLIFE_AUDIO.litterStep, 0.04]
                    : ['grit', POST_OFFICE_BAY_AUDIO.gritSteps, 0.034];
          playContact(surfaceLayer[0], surfaceLayer[1], {
            intensity: event.intensity,
            baseGain: surfaceLayer[2],
            playbackJitter: 0.04,
            playbackRateCenter: 0.94,
          });
          return;
        }
        if (current.playableModeId === 'finch') {
          const sprite = hardRock
            ? MOVEMENT_WILDLIFE_AUDIO.rockStep
            : responseKind === 'sand'
              ? POST_OFFICE_BAY_AUDIO.sandSteps
              : responseKind === 'wood'
                ? MOVEMENT_WILDLIFE_AUDIO.woodStep
                : responseKind === 'mud'
                  ? MOVEMENT_WILDLIFE_AUDIO.mudStep
                  : responseKind === 'litter'
                    ? MOVEMENT_WILDLIFE_AUDIO.litterStep
                    : POST_OFFICE_BAY_AUDIO.gritSteps;
          const family = hardRock ? 'rockStep' : responseKind === 'sand' ? 'sand' : responseKind === 'wood'
            ? 'woodStep' : responseKind === 'mud' ? 'mudStep' : responseKind === 'litter' ? 'litterStep' : 'grit';
          playContact(family, sprite, {
            intensity: event.intensity,
            baseGain: 0.027,
            playbackJitter: 0.08,
            playbackRateCenter: 1.18,
          });
          return;
        }
        const injury = clamp01((58 - Number(current.health)) / 38);
        const soreSide = injury > 0 && event?.side === 'right';
        const step = darwinStepShape(event);
        const gaitGain = (soreSide ? 1 - injury * 0.22 : 1 + injury * 0.04) * step.gain;
        const gaitRate = (soreSide ? 1 - injury * 0.025 : 1) * step.rate;
        const stepPan = step.pan;
        const stepFilterHz = step.filterHz;
        if (isRockBody(event?.target)) {
          // On a boulder: the hobnailed heel clack, clearly not the ground.
          playContact('bootOnRock', FOLEY_AUDIO.bootOnRock, {
            intensity: event.intensity,
            baseGain: 0.17 * gaitGain,
            playbackJitter: 0.05,
            playbackRateCenter: gaitRate,
            pan: stepPan,
          });
          playContact('rockGrit', MOTION_AUDIO.rockGrit, {
            intensity: event.intensity,
            baseGain: 0.06 * gaitGain,
            playbackJitter: 0.08,
            playbackRateCenter: gaitRate,
            pan: stepPan,
          });
        } else if (hardRock) {
          playContact('rockStep', MOVEMENT_WILDLIFE_AUDIO.rockStep, {
            intensity: event.intensity,
            baseGain: 0.235 * gaitGain,
            playbackJitter: 0.035,
            playbackRateCenter: gaitRate,
            pan: stepPan,
            filterHz: stepFilterHz,
          });
          // Lava and basalt are never clean: cinder and grit crushed under
          // the heel and toe, the nails scratching, a pebble kicked away.
          playContact('rockGrit', MOTION_AUDIO.rockGrit, {
            intensity: event.intensity,
            baseGain: 0.13 * gaitGain * (0.8 + step.pace * 0.4),
            playbackJitter: 0.08,
            playbackRateCenter: gaitRate,
            pan: stepPan,
          });
        } else if (responseKind === 'sand') {
          playContact('sand', POST_OFFICE_BAY_AUDIO.sandSteps, {
            intensity: event.intensity,
            baseGain: 0.34 * gaitGain,
            playbackRateCenter: gaitRate,
            pan: stepPan,
            filterHz: stepFilterHz,
          });
        } else if (responseKind === 'wood') {
          playContact('woodStep', MOVEMENT_WILDLIFE_AUDIO.woodStep, {
            intensity: event.intensity,
            baseGain: 0.28 * gaitGain,
            playbackRateCenter: gaitRate,
            pan: stepPan,
            filterHz: stepFilterHz,
            playbackJitter: 0.035,
          });
        } else if (responseKind === 'mud') {
          playContact('mudStep', MOVEMENT_WILDLIFE_AUDIO.mudStep, {
            intensity: event.intensity,
            baseGain: 0.32 * gaitGain,
            playbackRateCenter: gaitRate,
            pan: stepPan,
            filterHz: stepFilterHz,
            playbackJitter: 0.04,
          });
        } else if (responseKind === 'litter') {
          playContact('litterStep', MOVEMENT_WILDLIFE_AUDIO.litterStep, {
            intensity: event.intensity,
            baseGain: 0.32 * gaitGain,
            playbackRateCenter: gaitRate,
            pan: stepPan,
            filterHz: stepFilterHz,
            playbackJitter: 0.045,
          });
          if (now - lastTwigAtRef.current >= 9000 && Math.random() < 0.075) {
            lastTwigAtRef.current = now;
            playRandomVariant(variantsRef, 'dryBranch', CONTEXTUAL_WORLD_AUDIO.dryBranch, {
              gain: 0.036,
              playbackRate: randomBetween(1.08, 1.2),
              pan: panFromWorldPosition(event?.position),
            });
          }
        } else if (['grit', 'dust', 'ash'].includes(responseKind)) {
          playContact('grit', POST_OFFICE_BAY_AUDIO.gritSteps, {
            intensity: event.intensity,
            baseGain: 0.3 * gaitGain,
            playbackRateCenter: gaitRate,
            pan: stepPan,
            filterHz: stepFilterHz,
          });
        }
        playDarwinStepLayers(event, step, now);
        return;
      }
      if (contactKind === 'collision') {
        if (current.playableModeId !== 'darwin' || !isRockBody(event?.target)) return;
        if (now - lastRockBumpAtRef.current < 420) return;
        lastRockBumpAtRef.current = now;
        playContact('rockBump', FOLEY_AUDIO.rockBump, {
          intensity: event.intensity,
          baseGain: 0.11 + clamp01(Number(event?.intensity) || 0.4) * 0.13,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.06,
        });
        return;
      }
      if (contactKind !== 'takeoff'
        && contactKind !== 'step-up'
        && contactKind !== 'landing'
        && contactKind !== 'landing-jump') return;
      if (now - lastLandingAtRef.current < 130) return;
      lastLandingAtRef.current = now;
      const landing = contactKind === 'landing' || contactKind === 'landing-jump';
      const fallStrength = clamp01((Number(event?.fallSpeed) || 0) / 11);
      const movementIntensity = clamp01((Number(event?.intensity) || 0.5) * 0.72 + fallStrength * 0.4);
      if (current.playableModeId !== 'darwin') {
        if (current.playableModeId === 'finch' && landing) {
          const sprite = hardRock
            ? MOVEMENT_WILDLIFE_AUDIO.rockStep
            : responseKind === 'wood'
              ? MOVEMENT_WILDLIFE_AUDIO.woodStep
              : responseKind === 'mud'
                ? MOVEMENT_WILDLIFE_AUDIO.mudStep
                : responseKind === 'litter'
                  ? MOVEMENT_WILDLIFE_AUDIO.litterStep
                  : responseKind === 'sand'
                    ? POST_OFFICE_BAY_AUDIO.sandSteps
                    : POST_OFFICE_BAY_AUDIO.gritSteps;
          const family = hardRock ? 'rockStep' : responseKind === 'wood' ? 'woodStep' : responseKind === 'mud'
            ? 'mudStep' : responseKind === 'litter' ? 'litterStep' : responseKind === 'sand' ? 'sand' : 'grit';
          playContact(family, sprite, {
            intensity: movementIntensity,
            baseGain: 0.04,
            pan: panFromWorldPosition(event?.position),
            playbackJitter: 0.07,
            playbackRateCenter: 1.16,
          });
        }
        return;
      }
      // Three kinds of jump, heard differently at both ends: a standing hop
      // (both boots together, compact), a running leap (one boot driven off,
      // the coat streaming; landing a beat apart and running out, the boot
      // skidding in whatever the ground is), and a drop from a height (his
      // whole weight down through bent knees, kit and breath following).
      const jump = jumpSoundShape(event, contactKind);
      if (jump.gear && now - lastGearAtRef.current >= 420) {
        lastGearAtRef.current = now;
        playRandomVariant(variantsRef, 'gear', DARWIN_BODY_AUDIO.gear, {
          gain: 0.06 + jump.weight * 0.05,
          playbackRate: randomBetween(0.965, 1.035),
          pan: panFromWorldPosition(event?.position) * 0.5,
        });
      }
      if (jump.bodyImpact && now - lastBodyImpactAtRef.current >= 1400) {
        lastBodyImpactAtRef.current = now;
        playRandomVariant(variantsRef, 'bodyImpact', DARWIN_BODY_AUDIO.bodyImpact, {
          gain: 0.09 + jump.weight * 0.06,
          playbackRate: randomBetween(0.97, 1.02),
          pan: panFromWorldPosition(event?.position) * 0.35,
        });
      }
      if (jump.body) {
        playContact(jump.body, MOTION_AUDIO[jump.body], {
          intensity: movementIntensity,
          baseGain: jump.bodyGain,
          pan: panFromWorldPosition(event?.position) * 0.5,
          playbackJitter: 0.05,
          playbackRateCenter: jump.rate,
        });
      }
      if (jump.skid) {
        const skid = hardRock || isRockBody(event?.target)
          ? ['skidRock', 0.11]
          : responseKind === 'sand' ? ['skidSand', 0.065]
            : ['grit', 'dust', 'ash'].includes(responseKind) ? ['skidGrit', 0.07] : null;
        if (skid) {
          playContact(skid[0], MOTION_AUDIO[skid[0]], {
            intensity: movementIntensity,
            baseGain: skid[1] * jump.skid,
            pan: panFromWorldPosition(event?.position) * 0.6,
            playbackJitter: 0.06,
          });
        }
      }
      const rockBody = isRockBody(event?.target);
      if (rockBody && landing) {
        playContact('rockLandingBody', FOLEY_AUDIO.rockLanding, {
          intensity: movementIntensity,
          baseGain: 0.16 + fallStrength * 0.08,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.05,
        });
      } else if (rockBody && contactKind === 'step-up') {
        playContact('rockScramble', FOLEY_AUDIO.rockScramble, {
          intensity: movementIntensity,
          baseGain: 0.2,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.05,
        });
      } else if (hardRock) {
        const family = landing ? 'rockLanding' : contactKind === 'step-up' ? 'rockStep' : 'rockTakeoff';
        playContact(family, MOVEMENT_WILDLIFE_AUDIO[family], {
          intensity: movementIntensity,
          baseGain: (landing ? 0.19 + fallStrength * 0.045 : contactKind === 'step-up' ? 0.145 : 0.13) * DARWIN_FOLEY_LIFT,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.035,
        });
      } else if (responseKind === 'sand') {
        playContact('sand', POST_OFFICE_BAY_AUDIO.sandSteps, {
          intensity: movementIntensity,
          baseGain: (landing ? 0.23 + fallStrength * 0.035 : 0.14) * DARWIN_FOLEY_LIFT,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.055,
        });
      } else if (responseKind === 'wood') {
        playContact('woodStep', MOVEMENT_WILDLIFE_AUDIO.woodStep, {
          intensity: movementIntensity,
          baseGain: (landing ? 0.2 + fallStrength * 0.035 : 0.125) * DARWIN_FOLEY_LIFT,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.035,
        });
      } else if (responseKind === 'mud') {
        playContact('mudStep', MOVEMENT_WILDLIFE_AUDIO.mudStep, {
          intensity: movementIntensity,
          baseGain: (landing ? 0.22 + fallStrength * 0.035 : 0.135) * DARWIN_FOLEY_LIFT,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.045,
        });
      } else if (responseKind === 'litter') {
        playContact('litterStep', MOVEMENT_WILDLIFE_AUDIO.litterStep, {
          intensity: movementIntensity,
          baseGain: (landing ? 0.21 + fallStrength * 0.035 : 0.13) * DARWIN_FOLEY_LIFT,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.05,
        });
      } else if (['grit', 'dust', 'ash'].includes(responseKind)) {
        playContact('grit', POST_OFFICE_BAY_AUDIO.gritSteps, {
          intensity: movementIntensity,
          baseGain: (landing ? 0.205 + fallStrength * 0.04 : 0.125) * DARWIN_FOLEY_LIFT,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.05,
        });
      }
    });
    const offNpcFootstep = onPropEvent('npc-footstep', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled
        || event?.npcId !== 'syms'
        || event?.zoneId !== current.currentZoneId) return;
      const now = performance.now();
      if (now - lastSymsStepAtRef.current < 105) return;
      const player = getRuntimePlayerPose()?.position;
      const position = event?.position;
      if (!player || !position) return;
      const distance = Math.hypot(
        position.x - player.x,
        position.y - player.y,
        position.z - player.z,
      );
      if (distance >= 23) return;
      lastSymsStepAtRef.current = now;
      const biome = terrainBiomeAt(position.x, position.z, position.y, current.currentZoneId);
      const profile = getSurfaceContactProfile({
        x: position.x,
        y: position.y,
        z: position.z,
        zoneId: current.currentZoneId,
        biome,
      });
      const responseKind = inferContactResponseKind(profile);
      const presence = 1 - smoothstep(1.5, 23, distance);
      const intensity = clamp01((Number(event.speed) || 0) / 3.7);
      const sharedOptions = {
        intensity,
        ...worldSpatial(position),
        playbackJitter: 0.045,
        playbackRateCenter: event.movementMode === 'run' ? 1.025 : event.movementMode === 'jog' ? 1.01 : 0.985,
      };
      if (profileLooksLikeHardRock(profile)) {
        playContact('symsRock', MOVEMENT_WILDLIFE_AUDIO.rockStep, {
          ...sharedOptions,
          baseGain: 0.102 * presence,
        });
      } else if (responseKind === 'sand') {
        playContact('symsSand', POST_OFFICE_BAY_AUDIO.sandSteps, {
          ...sharedOptions,
          baseGain: 0.132 * presence,
        });
      } else if (responseKind === 'wood') {
        playContact('woodStep', MOVEMENT_WILDLIFE_AUDIO.woodStep, {
          ...sharedOptions,
          baseGain: 0.112 * presence,
        });
      } else if (responseKind === 'mud') {
        playContact('mudStep', MOVEMENT_WILDLIFE_AUDIO.mudStep, {
          ...sharedOptions,
          baseGain: 0.125 * presence,
        });
      } else if (responseKind === 'litter') {
        playContact('litterStep', MOVEMENT_WILDLIFE_AUDIO.litterStep, {
          ...sharedOptions,
          baseGain: 0.12 * presence,
        });
      } else if (['grit', 'dust', 'ash'].includes(responseKind)) {
        playContact('symsGrit', POST_OFFICE_BAY_AUDIO.gritSteps, {
          ...sharedOptions,
          baseGain: 0.118 * presence,
        });
      }
    });
    const offWater = onPropEvent('water-step', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled
        || current.playableModeId !== 'darwin') return;
      const now = performance.now();
      if (now - lastWaterAtRef.current < 115) return;
      lastWaterAtRef.current = now;
      playContact('water', POST_OFFICE_BAY_AUDIO.waterSteps, { intensity: event?.intensity, baseGain: 0.23 });
    });
    const offWaterSplash = onPropEvent('water-splash', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const now = performance.now();
      if (now - lastWaterAtRef.current < 180) return;
      lastWaterAtRef.current = now;
      playContact('water', POST_OFFICE_BAY_AUDIO.waterSteps, {
        intensity: event?.intensity,
        baseGain: 0.28,
        pan: panFromWorldPosition(event?.position),
        playbackJitter: 0.04,
      });
    });
    const offPropContact = onPropEvent('player-physics-prop-contact', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const now = performance.now();
      const previousAt = propContactsRef.current.get(event?.propId) || 0;
      propContactsRef.current.set(event?.propId, now);
      // The character controller reports the same contact every frame while
      // pushing. Sound only the leading edge of a collision, after the bodies
      // have separated for long enough to make a new impact plausible.
      if (now - previousAt < 260 || Number(event?.impactSpeed) < 0.72) return;
      const prop = getZoneProps(current.currentZoneId).find(item => item.id === event.propId);
      const material = interactionMaterialForProp(prop);
      const sprite = material ? INTERACTION_AUDIO[material] : null;
      if (!sprite) return;
      const speed = clamp01((Number(event.impactSpeed) - 0.6) / 4.2);
      const baseGain = {
        wood: 0.125,
        stone: 0.13,
        metal: 0.072,
        ceramic: 0.068,
      }[material];
      playContact(material, sprite, {
        intensity: speed,
        baseGain,
        pan: panFromWorldPosition(event.contactPoint),
        playbackJitter: material === 'metal' || material === 'ceramic' ? 0.035 : 0.06,
      });
    });
    const offPropSettled = onPropEvent('carried-prop-settle', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled
        || current.playableModeId !== 'darwin'
        || event?.zoneId !== current.currentZoneId) return;
      const prop = getZoneProps(current.currentZoneId).find(item => item.id === event?.propId);
      const material = materialFromInteractionEvent(event, prop);
      const sprite = material ? INTERACTION_AUDIO[material] : null;
      if (!sprite) return;
      playContact(material, sprite, {
        intensity: event?.mode === 'release' ? 0.62 : 0.38,
        baseGain: { wood: 0.085, stone: 0.09, metal: 0.052, ceramic: 0.048 }[material],
        pan: panFromWorldPosition(event?.position),
        playbackJitter: material === 'metal' || material === 'ceramic' ? 0.03 : 0.055,
      });
    });
    const offPropPush = onPropEvent('player-push-contact', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const prop = getZoneProps(current.currentZoneId).find(item => item.id === event?.propId);
      const material = materialFromInteractionEvent(event, prop);
      const sprite = material ? INTERACTION_AUDIO[material] : null;
      if (!sprite) return;
      const now = performance.now();
      const previousAt = pushAudioRef.current.get(event.propId) || 0;
      const moving = Number(event?.speed) >= 0.035;
      const interval = moving ? (material === 'wood' ? 620 : 760) : 1450;
      if (now - previousAt < interval) return;
      pushAudioRef.current.set(event.propId, now);
      playContact(material, sprite, {
        intensity: moving ? clamp01(Number(event.speed) / 0.7) : 0.22,
        baseGain: { wood: 0.055, stone: 0.06, metal: 0.038, ceramic: 0.032 }[material],
        pan: panFromWorldPosition(event?.position),
        playbackJitter: 0.055,
        playbackRateCenter: material === 'stone' ? 0.89 : 0.93,
        filterHz: material === 'metal' ? 5600 : 4200,
      });
    });
    const offFoliage = onPropEvent('foliage-contact', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || !['darwin', 'tortoise'].includes(current.playableModeId)) return;
      const now = performance.now();
      const tortoise = current.playableModeId === 'tortoise';
      if (now - lastFoliageAtRef.current < (tortoise ? 420 : 310)) return;
      lastFoliageAtRef.current = now;
      const spine = event?.kind === 'spine';
      const family = event?.kind === 'grass' ? 'grass' : 'shrub';
      playContact(spine ? 'brushSpine' : family, INTERACTION_AUDIO[family], {
        intensity: event?.intensity,
        baseGain: (spine ? 0.13 : family === 'grass' ? 0.36 : 0.24) * (tortoise ? 0.62 : 1),
        pan: panFromWorldPosition(event?.position),
        playbackJitter: 0.08,
        playbackRateCenter: (tortoise ? 0.94 : 1) * (spine ? 1.18 : 1),
        filterHz: spine ? 4200 : null,
      });
    });
    // A spine catching cloth and skin: a short, tight snag of pad against
    // coat, then the coat tugged free. Darwin's pain voice comes from the
    // health damage that accompanies it.
    const offSpinePrick = onPropEvent('spine-prick', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const now = performance.now();
      const strength = clamp01(Number(event?.intensity) || 0.5);
      const pan = panFromWorldPosition(event?.position);
      lastFoliageAtRef.current = now;
      playContact('spineSnag', INTERACTION_AUDIO.shrub, {
        intensity: strength,
        baseGain: 0.2 + strength * 0.1,
        pan,
        playbackJitter: 0.05,
        playbackRateCenter: 1.22,
        filterHz: 5200,
      });
      lastGearAtRef.current = now;
      playRandomVariant(variantsRef, 'gear', DARWIN_BODY_AUDIO.gear, {
        gain: 0.15 + strength * 0.07,
        playbackRate: randomBetween(1.03, 1.1),
        pan: pan * 0.5,
      });
    });
    const offFinchWing = onPropEvent('finch-wingbeat', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'finch') return;
      const baseGain = event?.phase === 'takeoff' ? 0.14 : event?.phase === 'landing' ? 0.1 : 0.112;
      playContact('finchWing', MOVEMENT_WILDLIFE_AUDIO.finchWing, {
        intensity: event?.intensity,
        baseGain,
        pan: panFromWorldPosition(event?.position) * 0.45,
        playbackJitter: 0.08,
        playbackRateCenter: event?.phase === 'takeoff' ? 1.035 : 1,
      });
    });
    const offShotgun = onPropEvent('shotgun-fired', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const reportRate = randomBetween(0.985, 1.018);
      playRandomVariant(variantsRef, 'shotgunReport', MOVEMENT_WILDLIFE_AUDIO.shotgunReport, {
        gain: 0.42,
        playbackRate: reportRate,
        pan: panFromWorldPosition(event?.position) * 0.3,
        priority: true,
      });
      // The recorded crack is cut short; the modelled boom, rolling tail and
      // hill echoes give the black-powder report its weight and space.
      playRandomVariant(variantsRef, 'gunBlast', FOLEY_AUDIO.gunBlast, {
        gain: 0.3,
        playbackRate: reportRate,
        pan: panFromWorldPosition(event?.position) * 0.2,
        priority: true,
      });
      if (!event?.reloadStarted) return;
      const timer = window.setTimeout(() => {
        scheduledAudioRef.current.delete(timer);
        const latest = latestRef.current;
        if (!latest.runtimeEnabled || latest.playableModeId !== 'darwin') return;
        playRandomVariant(variantsRef, 'shotgunReload', MOVEMENT_WILDLIFE_AUDIO.shotgunReload, {
          gain: 0.2,
          playbackRate: 1,
          priority: true,
        });
      }, 280);
      scheduledAudioRef.current.add(timer);
    });
    const offToolSwing = onPropEvent('tool-swing', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      if (event?.tool === 'hammer' || event?.tool === 'pocket_knife') {
        const fallbackDelay = event.tool === 'hammer' ? 0.55 : 0.34;
        const landsAt = performance.now() + (Number(event?.impactDelay) || fallbackDelay) * 1000;
        toolImpactWindowRef.current = { tool: event.tool, opens: landsAt - 150, closes: landsAt + 450, used: false };
      }
      const profile = {
        hammer: {
          family: 'hammerSwing',
          sprite: TOOL_FOLEY_AUDIO.hammerSwing,
          delay: 235,
          gain: 0.115,
          rate: [0.965, 1.015],
        },
        // The blade's swish peaks ~0.115 s into its slot; land it on the cut.
        pocket_knife: {
          family: 'knifeSwish',
          sprite: FIELD_FOLEY_AUDIO.knifeSwish,
          delay: Math.max(0, (Number(event?.impactDelay) || 0.34) * 1000 - 115),
          gain: 0.085,
          rate: [0.96, 1.06],
        },
        insect_net: {
          family: 'netSwing',
          sprite: TOOL_FOLEY_AUDIO.netSwing,
          // The whoosh builds for ~0.44 s to its peak; land the peak on the
          // aimed sweep's strike (NET_SWEEP.strike), which is quicker than the
          // old clip, so the sprite runs a touch faster too.
          delay: Number.isFinite(event?.impactDelay) ? Math.max(0, event.impactDelay * 1000 - 440) : 610,
          gain: 0.11,
          rate: Number.isFinite(event?.impactDelay) ? [1.05, 1.11] : [0.99, 1.045],
        },
      }[event?.tool];
      if (!profile) return;
      scheduleToolFoley(profile.delay, () => {
        playRandomVariant(variantsRef, profile.family, profile.sprite, {
          gain: profile.gain,
          playbackRate: randomBetween(...profile.rate),
          pan: panFromWorldPosition(event?.position) * 0.35,
          priority: true,
        });
      });
    });
    const offNetContact = onPropEvent('net-contact', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      // A miss is the hoop cutting empty air past the subject: a thin, quick
      // brush of mesh rather than the bag's flump.
      const miss = event?.kind === 'miss';
      scheduleToolFoley(Math.max(0, Number(event?.delay) || 0) * 1000, () => {
        playRandomVariant(variantsRef, 'netContact', TOOL_FOLEY_AUDIO.netContact, {
          gain: event?.kind === 'snag' ? 0.115 : miss ? 0.045 : 0.1,
          playbackRate: miss ? randomBetween(1.18, 1.28) : randomBetween(0.985, 1.045),
          pan: panFromWorldPosition(event?.position),
          priority: true,
        });
        if (event?.material === 'shrub') {
          playContact('shrub', INTERACTION_AUDIO.shrub, {
            intensity: 0.48,
            baseGain: 0.065,
            pan: panFromWorldPosition(event?.position),
            playbackRateCenter: 1.035,
            playbackJitter: 0.05,
          });
        }
      });
    });
    // The swept hoop parting plants (InstancedGLBLayer). Only the first few
    // per sweep are sent, staggered a little so they read as one pass.
    const offNetBrush = onPropEvent('net-brush', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const material = event?.material === 'grass' ? 'grass' : 'shrub';
      scheduleToolFoley((Number(event?.index) || 0) * 45, () => {
        playContact(material, INTERACTION_AUDIO[material], {
          intensity: 0.62,
          baseGain: material === 'grass' ? 0.07 : 0.075,
          pan: panFromWorldPosition(event?.position),
          playbackRateCenter: 1.08,
          playbackJitter: 0.06,
        });
      });
    });
    const playHammerStrike = (event, prop) => {
      const material = hammerStrikeMaterial(event, prop);
      const profile = HAMMER_STRIKE_PROFILES[material];
      if (!profile) return false;
      const pan = panFromWorldPosition(event?.position);
      // A ground sample drives the head partly into soil and grit; an
      // examine tap is a careful knock, not a blow.
      const softened = event?.groundSample ? 0.72 : event?.tap ? 0.5 : 1;
      // A boulder cut back by earlier blows answers duller and a touch
      // lower; a tired arm lands softer.
      const wear = clamp01(Number(event?.wear) || 0);
      const tired = event?.tap ? 0 : clamp01(((useThreeGameStore.getState().fatigue || 0) - 45) / 45);
      const wornFilterHz = wear > 0.3 ? 16000 - wear * 8500 : null;
      playRandomVariant(variantsRef, profile.family, HAMMER_STRIKE_AUDIO[material], {
        gain: profile.gain * softened * (1 - tired * 0.22),
        playbackRate: randomBetween(...profile.rate) * (event?.groundSample ? 0.95 : 1) * (1 - wear * 0.035),
        pan,
        filterHz: event?.groundSample ? 4200 : event?.tap ? 7800 : (tired > 0.4 ? Math.min(wornFilterHz || 18000, 11000) : wornFilterHz),
        priority: true,
      });
      if (event?.tap) return true;
      const now = performance.now();
      loudEventAtRef.current = now;
      if (event?.strained) {
        scheduleToolFoley(25, () => {
          playRandomVariant(variantsRef, 'hammerStrain', HAMMER_STRIKE_AUDIO.strain, {
            gain: 0.1,
            playbackRate: randomBetween(0.95, 1.03),
            pan,
            priority: true,
          });
        });
      }
      if (tired > 0.25
        && !windedRef.current.active
        && now - lastTiredBreathAtRef.current > 3200
        && Math.random() < 0.35 + tired * 0.5) {
        lastTiredBreathAtRef.current = now;
        scheduleToolFoley(320, () => {
          playRandomVariant(variantsRef, 'breath', DARWIN_BODY_AUDIO.breath, {
            gain: 0.085 + tired * 0.06,
            playbackRate: randomBetween(0.97, 1.03),
          });
        });
      }
      if (profile.rustle) {
        playContact('shrub', INTERACTION_AUDIO.shrub, {
          intensity: 0.7,
          baseGain: profile.rustle * softened,
          pan,
          playbackRateCenter: material === 'succulent' ? 1.12 : 1.02,
          playbackJitter: 0.06,
        });
      }
      return true;
    };
    const KNIFE_CUTS = {
      succulent: { family: 'knifeSucculent', gain: 0.085 },
      stem: { family: 'knifeStem', gain: 0.08, rustle: 0.035 },
      bark: { family: 'knifeBark', gain: 0.085 },
    };
    const playKnifeCut = event => {
      const material = knifeCutMaterial(event);
      const cut = KNIFE_CUTS[material];
      const pan = panFromWorldPosition(event?.position);
      playRandomVariant(variantsRef, cut.family, FIELD_FOLEY_AUDIO[cut.family], {
        gain: cut.gain,
        playbackRate: randomBetween(0.95, 1.06),
        pan,
        priority: true,
      });
      if (cut.rustle) {
        playContact('shrub', INTERACTION_AUDIO.shrub, {
          intensity: 0.5, baseGain: cut.rustle, pan, playbackRateCenter: 1.08, playbackJitter: 0.06,
        });
      }
      return true;
    };
    const playToolImpact = (tool, event, prop) => (
      tool === 'pocket_knife' ? playKnifeCut(event) : playHammerStrike(event, prop)
    );
    const offPropStruck = onPropEvent('prop-struck', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const prop = getZoneProps(current.currentZoneId).find(item => item.id === event?.propId);
      const strikeWindow = toolImpactWindowRef.current;
      if (event?.tool === 'hammer') {
        if (strikeWindow && !event?.tap) strikeWindow.used = true;
        if (playHammerStrike(event, prop)) return;
        playStruckContact(event, prop);
        return;
      }
      // Breakables and plants do not say which tool struck them, so the
      // first impact inside the swing's landing window is taken as the
      // swung tool's own (hammer blow or knife cut). It waits for the end of the frame: one swing can also
      // rattle a loose stone beside the boulder it hits, and the boulder's
      // tagged strike must win. Anything else stays a generic knock.
      const now = performance.now();
      if (!strikeWindow || strikeWindow.used || now < strikeWindow.opens || now > strikeWindow.closes) {
        playStruckContact(event, prop);
        return;
      }
      const timer = window.setTimeout(() => {
        scheduledAudioRef.current.delete(timer);
        if (!latestRef.current.runtimeEnabled) return;
        if (!strikeWindow.used) {
          strikeWindow.used = true;
          if (playToolImpact(strikeWindow.tool, event, prop)) return;
        }
        playStruckContact(event, prop);
      }, 0);
      scheduledAudioRef.current.add(timer);
    });
    const playStruckContact = (event, prop) => {
      const material = materialFromInteractionEvent(event, prop);
      const sprite = material ? INTERACTION_AUDIO[material] : null;
      if (!sprite) return;
      const baseGain = {
        wood: 0.15,
        stone: 0.155,
        metal: 0.09,
        ceramic: 0.085,
      }[material];
      playContact(material, sprite, {
        intensity: 0.9,
        baseGain,
        pan: panFromWorldPosition(event?.position),
        playbackJitter: material === 'metal' || material === 'ceramic' ? 0.035 : 0.055,
      });
    };
    const offRockBroken = onPropEvent('rock-broken', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled
        || current.playableModeId !== 'darwin'
        || event?.zoneId !== current.currentZoneId) return;
      const pan = panFromWorldPosition(event?.position);
      // Softer stone parts with less of a crack and more crumble.
      const soft = ['tuff', 'scoria', 'coral_limestone'].includes(event?.hammerMaterial);
      playRandomVariant(variantsRef, 'hammerSplit', HAMMER_STRIKE_AUDIO.split, {
        gain: soft ? 0.085 : 0.11,
        playbackRate: randomBetween(0.96, 1.02) * (soft ? 0.94 : 1),
        pan,
        filterHz: soft ? 3600 : null,
        priority: true,
      });
      scheduleToolFoley(140, () => {
        playRandomVariant(variantsRef, 'rockTumble', CONTEXTUAL_WORLD_AUDIO.rockTumble, {
          gain: 0.075,
          playbackRate: randomBetween(0.92, 1),
          pan,
          priority: true,
        });
      });
    });
    // A knife cut into a mature cactus reports through its own sway event.
    const offCactusCut = onPropEvent('mature-cactus-impact', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin' || event?.tool !== 'pocket_knife') return;
      const strikeWindow = toolImpactWindowRef.current;
      if (strikeWindow?.tool === 'pocket_knife') strikeWindow.used = true;
      playKnifeCut({ propId: 'mature-cactus', position: event?.position });
    });
    const offShardHit = onPropEvent('hammer-shard-hit', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      scheduleToolFoley(90, () => {
        playRandomVariant(variantsRef, 'shardCoat', FIELD_FOLEY_AUDIO.shardCoat, {
          gain: 0.11,
          playbackRate: randomBetween(0.96, 1.05),
          pan: panFromWorldPosition(event?.position) * 0.3,
          priority: true,
        });
      });
    });
    const offShotHeard = onPropEvent('shotgun-fired', () => {
      loudEventAtRef.current = performance.now();
    });
    // Pellets landing: one cluster per surface per blast, arriving after the
    // report by the time sound takes to come back from where they struck.
    const offPellets = onPropEvent('shotgun-impact', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const sound = pelletImpactSound(event);
      const player = getRuntimePlayerPose()?.position;
      if (!sound || !player || !event?.position) return;
      const distance = Math.hypot(event.position.x - player.x, event.position.z - player.z);
      if (distance > 70) return;
      const now = performance.now();
      if (now - (pelletAudioRef.current.get(sound) || 0) < 160) return;
      pelletAudioRef.current.set(sound, now);
      const family = { rock: 'pelletsRock', earth: 'pelletsEarth', foliage: 'pelletsFoliage', wood: 'pelletsWood' }[sound];
      const base = { rock: 0.1, earth: 0.085, foliage: 0.09, wood: 0.095 }[sound];
      const intensity = clamp01(Number(event?.intensity) || 0.7);
      scheduleToolFoley((distance / 343) * 1000, () => {
        playRandomVariant(variantsRef, family, FIELD_FOLEY_AUDIO[family], {
          gain: base * (0.45 + intensity * 0.55) / (1 + distance / 14),
          playbackRate: randomBetween(0.95, 1.05),
          ...worldSpatial(event.position),
          filterHz: 16000 / (1 + distance / 22),
          priority: true,
        });
      });
    });
    // Birds leaving the ground. Just after a hammer blow or a shot they
    // bolt, so the beat doubles into a startled burst.
    const offTakeoff = onPropEvent('fauna-takeoff', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || event?.zoneId !== current.currentZoneId) return;
      const speciesId = String(event?.speciesId || '').toLowerCase();
      const player = getRuntimePlayerPose()?.position;
      if (!player || !event?.position) return;
      const distance = Math.hypot(event.position.x - player.x, event.position.z - player.z);
      // A painted locust breaking cover clatters its hindwings.
      if (/locust/.test(speciesId)) {
        if (distance > 12) return;
        playRandomVariant(variantsRef, 'locustFlight', FAUNA_AUDIO.locustFlight, {
          gain: 0.07 * (1 - distance / 12) ** 1.3,
          playbackRate: randomBetween(0.95, 1.08),
          ...worldSpatial(event.position),
          filterHz: 16000 / (1 + distance / 14),
        });
        return;
      }
      if (!FLYING_BIRD_PATTERN.test(speciesId) || /flightless/.test(speciesId)) return;
      if (distance > 26) return;
      const now = performance.now();
      const audio = takeoffAudioRef.current;
      if (now - audio.lastAt < 70 || now - (audio.actors.get(event.actorId) || 0) < 1200) return;
      audio.lastAt = now;
      audio.actors.set(event.actorId, now);
      if (audio.actors.size > 64) audio.actors.clear();
      const startled = now - loudEventAtRef.current < 2500;
      const rate = TAKEOFF_RATE.find(([pattern]) => pattern.test(speciesId))?.[1] ?? 1.08;
      const gain = 0.1 * (1 - distance / 26) ** 1.4 * (startled ? 1.25 : 1);
      const spatial = worldSpatial(event.position);
      const beats = startled ? 2 : 1;
      for (let beat = 0; beat < beats; beat += 1) {
        scheduleToolFoley(beat * randomBetween(55, 90), () => {
          playRandomVariant(variantsRef, 'wildlifeFlush', MOVEMENT_WILDLIFE_AUDIO.finchWing, {
            gain: gain * (beat ? 0.7 : 1),
            playbackRate: rate * randomBetween(0.97, 1.04),
            ...spatial,
            filterHz: 14000 / (1 + distance / 18),
          });
        });
      }
    });
    const offFieldwork = onPropEvent('fieldwork-foley', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      if (event?.kind === 'stow-sample') {
        // Timed to Darwin's kneel reaching the sample.
        const rock = Boolean(event.material);
        scheduleToolFoley(380, () => {
          playRandomVariant(variantsRef, rock ? 'stowRock' : 'stowPlant', FIELD_FOLEY_AUDIO[rock ? 'stowRock' : 'stowPlant'], {
            gain: rock ? 0.1 : 0.09,
            playbackRate: randomBetween(0.97, 1.03),
            pan: panFromWorldPosition(event?.position) * 0.4,
          });
        });
        return;
      }
      const family = {
        note: 'fieldNote',
        container: 'specimenContainer',
        snare: 'snareRope',
        door: 'door',
      }[event?.kind];
      const sprite = family ? WILDLIFE_FIELDWORK_AUDIO[family] : null;
      if (!sprite) return;
      playRandomVariant(variantsRef, family, sprite, {
        gain: { fieldNote: 0.15, specimenContainer: 0.12, snareRope: 0.135, door: 0.14 }[family],
        playbackRate: randomBetween(0.98, 1.025),
        pan: panFromWorldPosition(event?.position) * 0.5,
      });
    });
    const offEquipment = onPropEvent('equipment-foley', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const gain = {
        'case-open': 0.105,
        'case-close': 0.09,
        'tool-change': 0.075,
        'carry-pickup': 0.082,
      }[event?.kind] || 0.068;
      playRandomVariant(variantsRef, 'leatherHandling', CONTEXTUAL_WORLD_AUDIO.leatherHandling, {
        gain,
        playbackRate: randomBetween(0.965, 1.035),
        pan: panFromWorldPosition(event?.position) * 0.35,
      });
      if (event?.kind === 'carry-pickup' && event?.propId) {
        const prop = getZoneProps(current.currentZoneId).find(item => item.id === event.propId);
        const material = materialFromInteractionEvent(event, prop);
        const sprite = material ? INTERACTION_AUDIO[material] : null;
        if (sprite) {
          playContact(material, sprite, {
            intensity: 0.34,
            baseGain: { wood: 0.06, stone: 0.065, metal: 0.038, ceramic: 0.034 }[material],
            pan: panFromWorldPosition(event?.position) * 0.45,
            playbackRateCenter: 0.94,
            playbackJitter: 0.05,
            filterHz: 6500,
          });
        }
      }
    });
    const offContainer = onPropEvent('container-foley', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const closing = event?.kind === 'chest-close';
      playRandomVariant(variantsRef, 'door', WILDLIFE_FIELDWORK_AUDIO.door, {
        gain: closing ? 0.075 : 0.105,
        playbackRate: closing ? randomBetween(1.02, 1.08) : randomBetween(0.92, 0.99),
        pan: panFromWorldPosition(event?.position) * 0.7,
        filterHz: 7200,
      });
      playContact(closing ? 'metal' : 'wood', closing ? INTERACTION_AUDIO.metal : INTERACTION_AUDIO.wood, {
        intensity: closing ? 0.58 : 0.28,
        baseGain: closing ? 0.046 : 0.042,
        pan: panFromWorldPosition(event?.position),
        playbackRateCenter: closing ? 1.04 : 0.95,
        playbackJitter: 0.035,
        filterHz: 7000,
      });
    });
    const playLooseTerrainDetail = (event, scramble = false) => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const now = performance.now();
      if (now - lastTerrainDetailAtRef.current < (scramble ? 950 : 1500)) return;
      const rocky = /rock|basalt|lava|grit|scree|volcan/.test(String(event?.biome || '').toLowerCase());
      if (!rocky && !scramble) return;
      lastTerrainDetailAtRef.current = now;
      playRandomVariant(variantsRef, 'rockTumble', CONTEXTUAL_WORLD_AUDIO.rockTumble, {
        gain: (scramble ? 0.07 : 0.048) * (0.72 + clamp01(Number(event?.intensity) || 0.5) * 0.28),
        playbackRate: randomBetween(0.96, 1.055),
        pan: panFromWorldPosition(event?.position),
      });
      if (scramble && now - lastGearAtRef.current >= 700) {
        lastGearAtRef.current = now;
        playRandomVariant(variantsRef, 'leatherHandling', CONTEXTUAL_WORLD_AUDIO.leatherHandling, {
          gain: 0.052,
          playbackRate: randomBetween(0.98, 1.06),
          pan: panFromWorldPosition(event?.position) * 0.4,
        });
      }
    };
    // A loose stone shifting under Darwin (physics/props/LooseRocks.jsx): a
    // quiet clonk on the first step, louder as it rocks, loudest as it goes.
    const playLooseStone = (event, gain) => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const now = performance.now();
      if (now - lastLooseStoneAtRef.current < 260) return;
      lastLooseStoneAtRef.current = now;
      playContact('looseStone', FOLEY_AUDIO.looseStoneClonk, {
        intensity: clamp01((Number(event?.speed) || 0.3) / 1.5),
        baseGain: gain,
        pan: panFromWorldPosition(event?.position),
        playbackJitter: 0.07,
        // A heavier stone answers lower.
        playbackRateCenter: Number(event?.mass) > 200 ? 0.93 : 1.02,
      });
    };
    const offLooseStep = onPropEvent('loose-footing-step', event => playLooseStone(event, 0.1));
    const offLooseWobble = onPropEvent('loose-footing-wobble', event => playLooseStone(event, 0.16));
    const offLooseLost = onPropEvent('loose-footing-lost', event => playLooseStone(event, 0.24));
    const offSkid = onPropEvent('player-skid', event => playLooseTerrainDetail(event, false));
    const offScramble = onPropEvent('player-scramble', event => playLooseTerrainDetail(event, true));
    const offLightning = onPropEvent('lightning-flash', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || event?.zoneId !== current.currentZoneId) return;
      const distance = Math.max(90, Math.min(1200, Number(event?.distance) || 360));
      const timer = window.setTimeout(() => {
        scheduledAudioRef.current.delete(timer);
        const latest = latestRef.current;
        if (!latest.runtimeEnabled || latest.currentZoneId !== event.zoneId) return;
        const interior = isInteriorAmbienceZone(getZone(latest.currentZoneId));
        const distancePresence = 1 - smoothstep(100, 1200, distance);
        playRandomVariant(variantsRef, 'thunder', WILDLIFE_FIELDWORK_AUDIO.thunder, {
          gain: (0.085 + distancePresence * 0.19) * (interior ? 0.58 : 1),
          playbackRate: randomBetween(0.94, 1.01),
          pan: Math.max(-0.22, Math.min(0.22, Number(event?.pan) || 0)),
          filterHz: (interior ? 1150 : 2200) + distancePresence * (interior ? 900 : 5200),
          priority: true,
        });
      }, Math.round((distance / 343) * 1000));
      scheduledAudioRef.current.add(timer);
    });
    return () => {
      disposed = true;
      offSurface();
      offNpcFootstep();
      offWater();
      offWaterSplash();
      offPropContact();
      offPropSettled();
      offPropPush();
      offFoliage();
      offSpinePrick();
      offFinchWing();
      offShotgun();
      offToolSwing();
      offNetContact();
      offNetBrush();
      offPropStruck();
      offRockBroken();
      offCactusCut();
      offShardHit();
      offShotHeard();
      offPellets();
      offTakeoff();
      offFieldwork();
      offEquipment();
      offContainer();
      offLooseStep();
      offLooseWobble();
      offLooseLost();
      offSkid();
      offScramble();
      offLightning();
      for (const timer of scheduledAudioRef.current) window.clearTimeout(timer);
      scheduledAudioRef.current.clear();
    };
  }, []);

  return null;
}
