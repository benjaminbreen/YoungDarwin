'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThreeGameStore } from '../store';
import { getFaunaBehaviorProfile } from './faunaBehaviorProfiles';
import { createFaunaMotionController, habitatFor, seedFromKey, specimenSeedKey } from './faunaMotionController';
import { specimenCollisionRadius } from './specimenCollision';
import { getPlayableMode } from '../playable/playableModes';
import { getWildlifeSpecies, normalizeWildlifeId } from '../wildlife/wildlifeCatalog';
import { onPropEvent } from '../physics/props/propEvents';
import { consumeSpecimenStimuli } from '../world/specimenRuntime';
import { faunaDebugEnabled } from '../runtimeDebug';

const MAX_FAUNA_SIMULATION_STEP = 0.2;
const MAX_FAUNA_CATCHUP = 0.6;

// Is the player currently playing as this animal's own kind (same species, or
// the same catalog kin group, e.g. a player finch among ground finches)?
function isPlayerKin(playableModeId, specimenId) {
  const mode = getPlayableMode(playableModeId);
  if (mode?.kind !== 'animal' || !mode.specimenId || !specimenId) return false;
  const playerSpecies = normalizeWildlifeId(mode.specimenId);
  const actorSpecies = normalizeWildlifeId(specimenId);
  if (playerSpecies && playerSpecies === actorSpecies) return true;
  const playerGroup = getWildlifeSpecies(playerSpecies)?.kinGroup;
  return Boolean(playerGroup && playerGroup === getWildlifeSpecies(actorSpecies)?.kinGroup);
}

export function useFaunaBehavior({ specimen, basePositionRef, basePosition, paused = false }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  // Key every derived value on stable primitives, not the specimen object:
  // parents may hand over a fresh but identical record on re-render, and
  // rebuilding the controller then reset the animal back to its spawn.
  const specimenId = specimen?.id || specimen?.specimenId || null;
  const actorKey = specimen?.instanceId || specimen?.id || null;
  const seedKey = specimenSeedKey(specimen);
  const habitatRadiusX = specimen?.habitatRadiusX;
  const habitatRadiusZ = specimen?.habitatRadiusZ;
  const sceneScale = specimen?.sceneScale || 1;
  const bodyRadius = specimenCollisionRadius(specimen);
  const profile = useMemo(() => getFaunaBehaviorProfile({ id: specimenId }), [specimenId]);
  const seed = useMemo(() => seedFromKey(seedKey), [seedKey]);
  const habitat = useMemo(
    () => (profile ? habitatFor({ habitatRadiusX, habitatRadiusZ }, profile) : null),
    [habitatRadiusX, habitatRadiusZ, profile],
  );
  const debugEnabled = useMemo(faunaDebugEnabled, []);
  const controller = useMemo(() => {
    if (!profile || !habitat) return null;
    const base = basePositionRef?.current || basePosition;
    return createFaunaMotionController({
      profile,
      habitat,
      seed,
      zoneId: currentZoneId,
      basePosition: base,
      actorScale: sceneScale,
      actorId: actorKey,
      bodyRadius,
    });
  }, [actorKey, basePosition, basePositionRef, bodyRadius, currentZoneId, habitat, profile, sceneScale, seed]);
  const positionRef = useRef(basePosition?.clone?.() || null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const rollRef = useRef(0);
  const airborneRef = useRef(false);
  const animationRef = useRef(null);
  const debugRef = useRef(null);
  const statusRef = useRef({ ok: false, reason: 'not-started' });

  useEffect(() => {
    const base = basePositionRef?.current || basePosition;
    if (controller && base) {
      controller.reset({ basePosition: base, zoneId: currentZoneId });
      positionRef.current = controller.state.position;
      yawRef.current = controller.state.yaw;
      pitchRef.current = controller.state.pitch || 0;
      rollRef.current = controller.state.roll || 0;
      airborneRef.current = controller.state.airborne === true;
      animationRef.current = controller.state.animation;
      debugRef.current = controller.state.debug;
      return;
    }
    positionRef.current = base || null;
    yawRef.current = 0;
    pitchRef.current = 0;
    rollRef.current = 0;
    airborneRef.current = false;
    animationRef.current = null;
    debugRef.current = null;
    statusRef.current = { ok: false, reason: 'inactive' };
  }, [basePosition, basePositionRef, controller, currentZoneId]);

  useEffect(() => {
    if (!controller || !profile) return undefined;
    return onPropEvent('tool-swing', event => {
      if (event.tool !== 'hammer') return;
      controller.addHammerThreat(event, basePositionRef?.current || basePosition);
    });
  }, [basePosition, basePositionRef, controller, profile]);

  const update = useCallback(({
    playerPosition = null,
    elapsedTime = 0,
    delta = 0,
  } = {}) => {
    if (!controller || !profile) return statusRef.current;
    const { timeOfDay, playableModeId } = useThreeGameStore.getState();
    const playerIsKin = isPlayerKin(playableModeId, specimenId);
    const base = basePositionRef?.current || basePosition;
    const actorId = actorKey;
    const stimuli = consumeSpecimenStimuli(currentZoneId, actorId);
    if (debugEnabled && stimuli.length && typeof window !== 'undefined') {
      window.__faunaStimulusDebug = {
        ...(window.__faunaStimulusDebug || {}),
        [actorId]: {
          zoneId: currentZoneId,
          specimenId,
          count: stimuli.length,
          last: stimuli[stimuli.length - 1],
          at: globalThis.performance?.now?.() / 1000 || 0,
        },
      };
    }
    for (const stimulus of stimuli) {
      if (stimulus.kind === 'contact') {
        controller.addContactThreat(stimulus, base);
      }
    }
    // Scheduled medium/far actors receive accumulated world time. Step it in
    // controller-sized slices so throttling lowers orchestration frequency
    // without slowing integrated patrol/flee movement.
    let remaining = Math.min(MAX_FAUNA_CATCHUP, Math.max(0, delta));
    let status = statusRef.current;
    if (remaining <= 0) {
      status = controller.update({
        basePosition: base,
        zoneId: currentZoneId,
        playerPosition,
        elapsedTime,
        delta: 0,
        timeOfDay,
        paused,
        playerIsKin,
      });
    } else {
      while (remaining > 0.000001) {
        const step = Math.min(MAX_FAUNA_SIMULATION_STEP, remaining);
        const stepElapsed = elapsedTime - remaining + step;
        status = controller.update({
          basePosition: base,
          zoneId: currentZoneId,
          playerPosition,
          elapsedTime: stepElapsed,
          delta: step,
          timeOfDay,
          paused,
          playerIsKin,
        });
        remaining -= step;
      }
    }
    statusRef.current = status;
    positionRef.current = controller.state.position;
    yawRef.current = controller.state.yaw;
    pitchRef.current = controller.state.pitch || 0;
    rollRef.current = controller.state.roll || 0;
    airborneRef.current = controller.state.airborne === true;
    animationRef.current = controller.state.animation;
    debugRef.current = controller.state.debug;
    return status;
  }, [
    actorKey,
    basePosition,
    basePositionRef,
    controller,
    currentZoneId,
    debugEnabled,
    paused,
    profile,
    specimenId,
  ]);

  return useMemo(() => ({
    active: Boolean(controller && profile),
    profile,
    positionRef,
    yawRef,
    pitchRef,
    rollRef,
    airborneRef,
    animationRef,
    debugRef,
    statusRef,
    update,
    reset: next => controller?.reset(next),
  }), [controller, profile, update]);
}
