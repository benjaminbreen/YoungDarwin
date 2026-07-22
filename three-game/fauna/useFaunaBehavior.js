'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThreeGameStore } from '../store';
import { getFaunaBehaviorProfile } from './faunaBehaviorProfiles';
import { createFaunaMotionController, habitatFor, seedFromSpecimen } from './faunaMotionController';
import { onPropEvent } from '../physics/props/propEvents';
import { consumeSpecimenStimuli } from '../world/specimenRuntime';
import { faunaDebugEnabled } from '../runtimeDebug';

const MAX_FAUNA_SIMULATION_STEP = 0.2;
const MAX_FAUNA_CATCHUP = 0.6;

export function useFaunaBehavior({ specimen, basePositionRef, basePosition, paused = false }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const profile = useMemo(() => getFaunaBehaviorProfile(specimen), [specimen]);
  const seed = useMemo(() => seedFromSpecimen(specimen), [specimen]);
  const habitat = useMemo(() => (profile ? habitatFor(specimen, profile) : null), [profile, specimen]);
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
      actorScale: specimen?.sceneScale || 1,
      actorId: specimen?.instanceId || specimen?.id,
    });
  }, [basePosition, basePositionRef, currentZoneId, habitat, profile, seed, specimen.id, specimen.instanceId, specimen.sceneScale]);
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
    const timeOfDay = useThreeGameStore.getState().timeOfDay;
    const base = basePositionRef?.current || basePosition;
    const actorId = specimen.instanceId || specimen.id;
    const stimuli = consumeSpecimenStimuli(currentZoneId, actorId);
    if (debugEnabled && stimuli.length && typeof window !== 'undefined') {
      window.__faunaStimulusDebug = {
        ...(window.__faunaStimulusDebug || {}),
        [actorId]: {
          zoneId: currentZoneId,
          specimenId: specimen.id,
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
    basePosition,
    basePositionRef,
    controller,
    currentZoneId,
    debugEnabled,
    paused,
    profile,
    specimen.id,
    specimen.instanceId,
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
