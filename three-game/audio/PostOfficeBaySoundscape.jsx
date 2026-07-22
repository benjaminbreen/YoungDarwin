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
import { getSurfaceContactProfile } from '../world/surfaceContact';
import { postOfficeBayCoastZ } from '../world/regions/postOfficeBay/terrain';
import { weatherEnv } from '../world/weatherEnvRuntime';
import {
  DARWIN_BODY_AUDIO,
  INTERACTION_AUDIO,
  MOVEMENT_WILDLIFE_AUDIO,
  POST_OFFICE_BAY_AUDIO,
} from './audioAssets';
import { interactionMaterialForProp } from './interactionMaterials';
import { computeEnvironmentalAudioTargets } from './environmentMix';
import {
  activatePostOfficeBayAudio,
  playAudioSprite,
  setAmbientAudioTargets,
  setSpatialAudioTarget,
  setSoundscapeAudioEnabled,
  soundscapeAudioIsRunning,
} from './audioRuntime';

const FINCH_IDS = new Set(['largegroundfinch', 'mediumgroundfinch']);

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

function nearestAudibleWildlife(zoneId, family) {
  const player = getRuntimePlayerPose()?.position;
  const poses = getSpecimenRuntimePoses(zoneId);
  if (!player || !poses) return null;
  let nearest = null;
  for (const specimen of getThreeSpecimens(zoneId)) {
    const matches = family === 'gull' ? specimen.id === 'lavagull' : FINCH_IDS.has(specimen.id);
    if (!matches) continue;
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

export function PostOfficeBaySoundscape({ active, enabled }) {
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
    rockTakeoff: -1,
    rockLanding: -1,
    gull: -1,
    finch: -1,
    pain: -1,
    collapse: -1,
    breath: -1,
    bodyImpact: -1,
    gear: -1,
    symsGrit: -1,
    symsSand: -1,
    symsRock: -1,
  });
  const lastStepAtRef = useRef(0);
  const lastLandingAtRef = useRef(0);
  const lastWaterAtRef = useRef(0);
  const lastFoliageAtRef = useRef(0);
  const lastBodyImpactAtRef = useRef(0);
  const lastGearAtRef = useRef(0);
  const lastPainAtRef = useRef(0);
  const lastSymsStepAtRef = useRef(0);
  const beeAudioRef = useRef({ lastAt: 0 });
  const handledDamageIdRef = useRef(lastHealthDamage?.id || 0);
  const windedRef = useRef({ active: false, intensity: 0, nextAt: 0 });
  const propContactsRef = useRef(new Map());
  const wildlifeScheduleRef = useRef({
    zoneId: null,
    gull: 0,
    finch: 0,
  });
  latestRef.current = { currentZoneId, playableModeId, runtimeEnabled, timeOfDay, health };

  useEffect(() => {
    propContactsRef.current.clear();
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    wildlifeScheduleRef.current = {
      zoneId: currentZoneId,
      gull: now + randomBetween(6500, 12500),
      finch: now + randomBetween(4000, 9000),
    };
  }, [currentZoneId]);

  useEffect(() => {
    setSoundscapeAudioEnabled(Boolean(enabled));
    if (!runtimeEnabled) {
      windedRef.current.active = false;
      setAmbientAudioTargets({ surf: 0, wind: 0, rain: 0, insects: 0 }, 0.35);
      setSpatialAudioTarget('bee', { gain: 0 }, 0.12);
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
      if (!soundscapeAudioIsRunning()) void activatePostOfficeBayAudio();
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
      const hour = ((Number(current.timeOfDay) || 0) % 24 + 24) % 24;
      const daylight = hour >= 5.35 && hour <= 19.25;
      const now = performance.now();
      const schedule = wildlifeScheduleRef.current;
      if (schedule.zoneId !== current.currentZoneId) return;

      for (const family of ['gull', 'finch']) {
        if (now < schedule[family]) continue;
        const actor = nearestAudibleWildlife(current.currentZoneId, family);
        const maxDistance = family === 'gull' ? 38 : 21;
        if (!daylight || !actor || actor.distance > maxDistance) {
          schedule[family] = now + randomBetween(3500, 6500);
          continue;
        }
        const presence = 1 - smoothstep(family === 'gull' ? 6 : 3, maxDistance, actor.distance);
        const sprite = MOVEMENT_WILDLIFE_AUDIO[family];
        const previous = variantsRef.current[family];
        const index = chooseVariant(previous, sprite.variants);
        variantsRef.current[family] = index;
        playAudioSprite(sprite, {
          family,
          index,
          gain: (family === 'gull' ? 0.12 : 0.085) * (0.4 + presence * 0.6),
          playbackRate: 0.98 + Math.random() * 0.04,
          pan: wildlifePanFromWorldPosition(actor.position),
        });
        schedule[family] = now + (
          family === 'gull'
            ? randomBetween(13000, 29000)
            : randomBetween(8000, 18000)
        );
      }
    };
    updateWildlife();
    const timer = window.setInterval(updateWildlife, 750);
    return () => window.clearInterval(timer);
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
      setAmbientAudioTargets(computeEnvironmentalAudioTargets({
        zone,
        position,
        resolveZone: getZone,
        shorelineDistance,
        weather: weatherEnv,
        timeOfDay: current.timeOfDay,
        gust: slowGust,
      }), 0.95);
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
      });
    };

    const offSurface = onPropEvent('surface-contact', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled
        || current.playableModeId !== 'darwin') return;
      const now = performance.now();
      const responseKind = inferContactResponseKind(event.surfaceProfile || {}, event.target);
      const contactKind = event?.kind || 'footstep';
      const hardRock = targetLooksLikeRock(event?.target)
        || profileLooksLikeHardRock(event?.surfaceProfile);
      if (contactKind === 'footstep') {
        if (now - lastStepAtRef.current < 115) return;
        lastStepAtRef.current = now;
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
        } else if (['grit', 'dust', 'ash', 'litter', 'mud'].includes(responseKind)) {
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
      } else if (['grit', 'dust', 'ash', 'litter', 'mud'].includes(responseKind)) {
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
      } else if (['grit', 'dust', 'ash', 'litter', 'mud'].includes(responseKind)) {
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
    const offFoliage = onPropEvent('foliage-contact', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const now = performance.now();
      if (now - lastFoliageAtRef.current < 310) return;
      lastFoliageAtRef.current = now;
      const family = event?.kind === 'grass' ? 'grass' : 'shrub';
      playContact(family, INTERACTION_AUDIO[family], {
        intensity: event?.intensity,
        baseGain: family === 'grass' ? 0.105 : 0.115,
        pan: panFromWorldPosition(event?.position),
        playbackJitter: 0.08,
      });
    });
    const offPropStruck = onPropEvent('prop-struck', event => {
      const current = latestRef.current;
      if (!current.runtimeEnabled || current.playableModeId !== 'darwin') return;
      const prop = getZoneProps(current.currentZoneId).find(item => item.id === event?.propId);
      const material = interactionMaterialForProp(prop);
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
    return () => {
      offSurface();
      offNpcFootstep();
      offWater();
      offWaterSplash();
      offPropContact();
      offFoliage();
      offPropStruck();
    };
  }, []);

  return null;
}
