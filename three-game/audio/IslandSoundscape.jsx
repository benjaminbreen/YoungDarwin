'use client';

import { useEffect, useRef } from 'react';
import { getThreeSpecimens } from '../data';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';
import { onPropEvent } from '../physics/props/propEvents';
import { getZoneProps } from '../physics/props/propRegistry';
import { inferContactResponseKind } from '../world/surfaceContactResponse';
import { getSpecimenRuntimePoses } from '../world/specimenRuntime';
import { getZone } from '../world/floreanaZones';
import { terrainBiomeAt } from '../world/terrain';
import { WATER_LEVEL } from '../world/water';
import { getSurfaceContactProfile } from '../world/surfaceContact';
import { postOfficeBayCoastZ } from '../world/regions/postOfficeBay/terrain';
import { weatherEnv } from '../world/weatherEnvRuntime';
import {
  CONTEXTUAL_WORLD_AUDIO,
  DARWIN_BODY_AUDIO,
  INTERACTION_AUDIO,
  MOVEMENT_WILDLIFE_AUDIO,
  POST_OFFICE_BAY_AUDIO,
  WILDLIFE_FIELDWORK_AUDIO,
} from './audioAssets';
import { interactionMaterialForProp } from './interactionMaterials';
import {
  computeEnvironmentalAudioTargets,
  diurnalBirdCallsAllowed,
  dryInsectHabitat,
  isInteriorAmbienceZone,
  nocturnalOwlCallsAllowed,
  surfPresenceForZone,
  zoneHasDirectCoast,
} from './environmentMix';
import {
  activatePostOfficeBayAudio,
  playAudioSprite,
  setAmbientAudioTargets,
  setSpatialAudioTarget,
  setSoundscapeAudioEnabled,
  setSoundscapeEnvironmentDebug,
  soundscapeAmbientIsReady,
  soundscapeAudioIsRunning,
} from './audioRuntime';

const WILDLIFE_CALL_PROFILES = Object.freeze({
  gull: Object.freeze({ speciesIds: new Set(['lavagull']), maxDistance: 38, nearDistance: 6, gain: 0.12, retry: [3500, 6500], interval: [13000, 29000], initial: [6500, 12500], nocturnal: false }),
  finch: Object.freeze({ speciesIds: new Set(['largegroundfinch', 'mediumgroundfinch']), maxDistance: 21, nearDistance: 3, gain: 0.085, retry: [3500, 6500], interval: [8000, 18000], initial: [4000, 9000], nocturnal: false }),
  dove: Object.freeze({ speciesIds: new Set(['galapagosdove']), maxDistance: 25, nearDistance: 4, gain: 0.09, retry: [5000, 8500], interval: [19000, 41000], initial: [9000, 18000], nocturnal: false }),
  mockingbird: Object.freeze({ speciesIds: new Set(['floreanamockingbird', 'galapagosmockingbird']), maxDistance: 28, nearDistance: 4, gain: 0.085, retry: [5000, 8500], interval: [16000, 36000], initial: [8000, 17000], nocturnal: false }),
  hawk: Object.freeze({ speciesIds: new Set(['galapagoshawk']), maxDistance: 50, nearDistance: 10, gain: 0.11, retry: [7000, 11000], interval: [36000, 76000], initial: [16000, 35000], nocturnal: false }),
  owl: Object.freeze({ speciesIds: new Set(['shortearedowl']), maxDistance: 34, nearDistance: 6, gain: 0.095, retry: [6000, 10000], interval: [24000, 56000], initial: [12000, 26000], nocturnal: true }),
  goatBleat: Object.freeze({ speciesIds: new Set(['feralgoat']), maxDistance: 34, nearDistance: 6, gain: 0.085, retry: [7000, 12000], interval: [38000, 82000], initial: [18000, 41000], nocturnal: false }),
});

const ANIMAL_CONTACT_PROFILES = Object.freeze({
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

function materialFromInteractionEvent(event, prop = null) {
  const direct = String(event?.material || '').toLowerCase();
  if (['wood', 'stone', 'metal', 'ceramic'].includes(direct)) return direct;
  const registered = interactionMaterialForProp(prop);
  if (registered) return registered;
  const text = `${event?.propId || ''} ${event?.kind || ''} ${event?.label || ''} ${direct}`.toLowerCase();
  if (/rock|stone|basalt|lava|volcan|boulder/.test(text)) return 'stone';
  if (/iron|metal|brass|tin|candlestick|mug/.test(text)) return 'metal';
  if (/ceramic|glass|bottle|jug|pot|bowl|earthen/.test(text)) return 'ceramic';
  if (/wood|timber|crate|barrel|chest|case|stool|chair|fence|gate|post|cactus|plant|crop/.test(text)) return 'wood';
  return null;
}

function nearestAudibleWildlife(zoneId, family) {
  const player = getRuntimePlayerPose()?.position;
  const poses = getSpecimenRuntimePoses(zoneId);
  if (!player || !poses) return null;
  let nearest = null;
  const profile = WILDLIFE_CALL_PROFILES[family];
  if (!profile) return null;
  for (const specimen of getThreeSpecimens(zoneId)) {
    if (!specimen?.id) continue;
    if (!profile.speciesIds.has(specimen.id)) continue;
    const actorId = specimen.instanceId || specimen.id;
    const position = poses.get(actorId);
    if (!position) continue;
    const distance = Math.hypot(
      position.x - player.x,
      position.y - player.y,
      position.z - player.z,
    );
    if (!nearest || distance < nearest.distance) nearest = { actorId, position, distance };
  }
  return nearest;
}

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
  const lastWaterAtRef = useRef(0);
  const lastFoliageAtRef = useRef(0);
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
  const scheduledAudioRef = useRef(new Set());
  const wildlifeScheduleRef = useRef({ zoneId: null });
  const waveBreakScheduleRef = useRef({ zoneId: null, nextAt: 0 });
  const animalMotionRef = useRef(new Map());
  const microDetailRef = useRef({ zoneId: null, lastRain: 0, postRainUntil: 0, nextDripAt: 0, nextBranchAt: 0, nextSettlementAt: 0 });
  latestRef.current = { currentZoneId, playableModeId, runtimeEnabled, timeOfDay, health };

  useEffect(() => {
    propContactsRef.current.clear();
    pushAudioRef.current.clear();
    animalMotionRef.current.clear();
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    wildlifeScheduleRef.current = { zoneId: currentZoneId };
    for (const [family, profile] of Object.entries(WILDLIFE_CALL_PROFILES)) {
      wildlifeScheduleRef.current[family] = now + randomBetween(...profile.initial);
    }
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
        gain: 0.105 * presence * presence * phaseGain * clamp01(event.gate),
        pan: wildlifePanFromWorldPosition(position),
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

  useEffect(() => {
    if (!runtimeEnabled) return undefined;
    const updateWildlife = () => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || document.hidden || !soundscapeAudioIsRunning()) return;
      const birdCallsAllowed = diurnalBirdCallsAllowed({
        timeOfDay: current.timeOfDay,
        rainIntensity: weatherEnv.rainIntensity,
      });
      const now = performance.now();
      const schedule = wildlifeScheduleRef.current;
      if (schedule.zoneId !== current.currentZoneId) return;

      for (const [family, profile] of Object.entries(WILDLIFE_CALL_PROFILES)) {
        if (now < schedule[family]) continue;
        const actor = nearestAudibleWildlife(current.currentZoneId, family);
        const callsAllowed = profile.nocturnal
          ? nocturnalOwlCallsAllowed({ timeOfDay: current.timeOfDay, rainIntensity: weatherEnv.rainIntensity })
          : birdCallsAllowed;
        if (!callsAllowed || !actor || actor.distance > profile.maxDistance) {
          schedule[family] = now + randomBetween(...profile.retry);
          continue;
        }
        const presence = 1 - smoothstep(profile.nearDistance, profile.maxDistance, actor.distance);
        const sprite = MOVEMENT_WILDLIFE_AUDIO[family]
          || WILDLIFE_FIELDWORK_AUDIO[family]
          || CONTEXTUAL_WORLD_AUDIO[family];
        const previous = variantsRef.current[family];
        const index = chooseVariant(previous, sprite.variants);
        variantsRef.current[family] = index;
        playAudioSprite(sprite, {
          family,
          index,
          gain: profile.gain * (0.4 + presence * 0.6),
          playbackRate: 0.98 + Math.random() * 0.04,
          pan: wildlifePanFromWorldPosition(actor.position),
        });
        schedule[family] = now + randomBetween(...profile.interval);
      }
    };
    updateWildlife();
    const timer = window.setInterval(updateWildlife, 750);
    return () => window.clearInterval(timer);
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
              pan: wildlifePanFromWorldPosition(position),
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
        const sprite = CONTEXTUAL_WORLD_AUDIO[profile.family];
        playRandomVariant(variantsRef, profile.family, sprite, {
          gain: profile.gain * (0.28 + presence * 0.72) * (0.7 + speedPresence * 0.3),
          playbackRate: profile.rate * randomBetween(0.975, 1.025),
          pan: wildlifePanFromWorldPosition(position),
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

  useEffect(() => {
    if (!runtimeEnabled) return undefined;
    const update = () => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || document.hidden) {
        setAmbientAudioTargets({ surf: 0, wind: 0, rain: 0, insects: 0 }, 0.55);
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
        && surfPresence >= 0.58
        && now >= waveSchedule.nextAt) {
        const closeness = smoothstep(0.58, 1, surfPresence);
        playRandomVariant(variantsRef, 'waveBreak', POST_OFFICE_BAY_AUDIO.waveBreak, {
          gain: 0.055 + closeness * 0.075,
          playbackRate: randomBetween(0.975, 1.025),
          pan: randomBetween(-0.2, 0.2),
        });
        waveSchedule.nextAt = now + randomBetween(17000, 39000);
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
    const playContact = (family, sprite, {
      intensity = 0.55,
      baseGain = 0.18,
      pan = (Math.random() - 0.5) * 0.12,
      playbackJitter = 0.05,
      playbackRateCenter = 1,
      filterHz = null,
    } = {}) => {
      const previous = variantsRef.current[family];
      const index = chooseVariant(previous, sprite.variants);
      variantsRef.current[family] = index;
      const strength = 0.76 + clamp01(Number(intensity) || 0.55) * 0.24;
      playAudioSprite(sprite, {
        family,
        index,
        gain: baseGain * strength,
        playbackRate: playbackRateCenter - playbackJitter * 0.5 + Math.random() * playbackJitter,
        pan,
        filterHz,
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
        const gaitGain = soreSide ? 1 - injury * 0.22 : 1 + injury * 0.04;
        const gaitRate = soreSide ? 1 - injury * 0.025 : 1;
        if (hardRock) {
          playContact('rockStep', MOVEMENT_WILDLIFE_AUDIO.rockStep, {
            intensity: event.intensity,
            baseGain: 0.13 * gaitGain,
            playbackJitter: 0.035,
            playbackRateCenter: gaitRate,
          });
        } else if (responseKind === 'sand') {
          playContact('sand', POST_OFFICE_BAY_AUDIO.sandSteps, {
            intensity: event.intensity,
            baseGain: 0.19 * gaitGain,
            playbackRateCenter: gaitRate,
          });
        } else if (responseKind === 'wood') {
          playContact('woodStep', MOVEMENT_WILDLIFE_AUDIO.woodStep, {
            intensity: event.intensity,
            baseGain: 0.155 * gaitGain,
            playbackRateCenter: gaitRate,
            playbackJitter: 0.035,
          });
        } else if (responseKind === 'mud') {
          playContact('mudStep', MOVEMENT_WILDLIFE_AUDIO.mudStep, {
            intensity: event.intensity,
            baseGain: 0.18 * gaitGain,
            playbackRateCenter: gaitRate,
            playbackJitter: 0.04,
          });
        } else if (responseKind === 'litter') {
          playContact('litterStep', MOVEMENT_WILDLIFE_AUDIO.litterStep, {
            intensity: event.intensity,
            baseGain: 0.175 * gaitGain,
            playbackRateCenter: gaitRate,
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
            baseGain: 0.165 * gaitGain,
            playbackRateCenter: gaitRate,
          });
        }
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
      if (landing && Number(event?.fallSpeed) >= 4.8 && now - lastGearAtRef.current >= 420) {
        lastGearAtRef.current = now;
        playRandomVariant(variantsRef, 'gear', DARWIN_BODY_AUDIO.gear, {
          gain: 0.068 + fallStrength * 0.035,
          playbackRate: randomBetween(0.965, 1.035),
          pan: panFromWorldPosition(event?.position) * 0.5,
        });
      }
      if (landing && Number(event?.fallSpeed) >= 7.5 && now - lastBodyImpactAtRef.current >= 1400) {
        lastBodyImpactAtRef.current = now;
        playRandomVariant(variantsRef, 'bodyImpact', DARWIN_BODY_AUDIO.bodyImpact, {
          gain: 0.105 + fallStrength * 0.04,
          playbackRate: randomBetween(0.97, 1.02),
          pan: panFromWorldPosition(event?.position) * 0.35,
        });
      }
      if (hardRock) {
        const family = landing ? 'rockLanding' : contactKind === 'step-up' ? 'rockStep' : 'rockTakeoff';
        playContact(family, MOVEMENT_WILDLIFE_AUDIO[family], {
          intensity: movementIntensity,
          baseGain: landing ? 0.19 + fallStrength * 0.045 : contactKind === 'step-up' ? 0.145 : 0.13,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.035,
        });
      } else if (responseKind === 'sand') {
        playContact('sand', POST_OFFICE_BAY_AUDIO.sandSteps, {
          intensity: movementIntensity,
          baseGain: landing ? 0.23 + fallStrength * 0.035 : 0.14,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.055,
        });
      } else if (responseKind === 'wood') {
        playContact('woodStep', MOVEMENT_WILDLIFE_AUDIO.woodStep, {
          intensity: movementIntensity,
          baseGain: landing ? 0.2 + fallStrength * 0.035 : 0.125,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.035,
        });
      } else if (responseKind === 'mud') {
        playContact('mudStep', MOVEMENT_WILDLIFE_AUDIO.mudStep, {
          intensity: movementIntensity,
          baseGain: landing ? 0.22 + fallStrength * 0.035 : 0.135,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.045,
        });
      } else if (responseKind === 'litter') {
        playContact('litterStep', MOVEMENT_WILDLIFE_AUDIO.litterStep, {
          intensity: movementIntensity,
          baseGain: landing ? 0.21 + fallStrength * 0.035 : 0.13,
          pan: panFromWorldPosition(event?.position),
          playbackJitter: 0.05,
        });
      } else if (['grit', 'dust', 'ash'].includes(responseKind)) {
        playContact('grit', POST_OFFICE_BAY_AUDIO.gritSteps, {
          intensity: movementIntensity,
          baseGain: landing ? 0.205 + fallStrength * 0.04 : 0.125,
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
        pan: wildlifePanFromWorldPosition(position),
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
      const family = event?.kind === 'grass' ? 'grass' : 'shrub';
      playContact(family, INTERACTION_AUDIO[family], {
        intensity: event?.intensity,
        baseGain: (family === 'grass' ? 0.105 : 0.115) * (tortoise ? 0.62 : 1),
        pan: panFromWorldPosition(event?.position),
        playbackJitter: 0.08,
        playbackRateCenter: tortoise ? 0.94 : 1,
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
      playRandomVariant(variantsRef, 'shotgunReport', MOVEMENT_WILDLIFE_AUDIO.shotgunReport, {
        gain: 0.42,
        playbackRate: randomBetween(0.985, 1.018),
        pan: panFromWorldPosition(event?.position) * 0.3,
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
    const offPropStruck = onPropEvent('prop-struck', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const prop = getZoneProps(current.currentZoneId).find(item => item.id === event?.propId);
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
    });
    const offFieldwork = onPropEvent('fieldwork-foley', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
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
      offSurface();
      offNpcFootstep();
      offWater();
      offWaterSplash();
      offPropContact();
      offPropSettled();
      offPropPush();
      offFoliage();
      offFinchWing();
      offShotgun();
      offPropStruck();
      offFieldwork();
      offEquipment();
      offContainer();
      offSkid();
      offScramble();
      offLightning();
      for (const timer of scheduledAudioRef.current) window.clearTimeout(timer);
      scheduledAudioRef.current.clear();
    };
  }, []);

  return null;
}
