'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';
import { getFaunaBehaviorProfile } from './faunaBehaviorProfiles';
import { createFaunaMotionController, habitatFor, seedFromSpecimen } from './faunaMotionController';
import { onPropEvent } from '../physics/props/propEvents';
import { consumeSpecimenStimuli } from '../world/specimenRuntime';
import { worldTime } from '../world/worldTime';

export function useFaunaBehavior({ specimen, basePositionRef, basePosition, paused = false }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const profile = useMemo(() => getFaunaBehaviorProfile(specimen), [specimen]);
  const seed = useMemo(() => seedFromSpecimen(specimen), [specimen]);
  const habitat = useMemo(() => (profile ? habitatFor(specimen, profile) : null), [profile, specimen]);
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
    });
  }, [basePosition, basePositionRef, currentZoneId, habitat, profile, seed]);
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

  useFrame(() => {
    if (!controller || !profile) return;
    const base = basePositionRef?.current || basePosition;
    const actorId = specimen.instanceId || specimen.id;
    const stimuli = consumeSpecimenStimuli(currentZoneId, actorId);
    if (stimuli.length && typeof window !== 'undefined') {
      window.__faunaStimulusDebug = {
        ...(window.__faunaStimulusDebug || {}),
        [actorId]: {
          zoneId: currentZoneId,
          specimenId: specimen.id,
          count: stimuli.length,
          last: stimuli[stimuli.length - 1],
          at: performance.now() / 1000,
        },
      };
    }
    for (const stimulus of stimuli) {
      if (stimulus.kind === 'contact') {
        controller.addContactThreat(stimulus, base);
      }
    }
    const playerPose = getRuntimePlayerPose();
    // Fauna live on the world clock, not the frame clock: bullet time while
    // Darwin shoulders the shotgun (and kill-confirm hitstop) slow them down.
    const status = controller.update({
      basePosition: base,
      zoneId: currentZoneId,
      playerPosition: playerPose?.position,
      elapsedTime: worldTime.elapsed,
      delta: worldTime.delta,
      paused,
    });
    statusRef.current = status;
    positionRef.current = controller.state.position;
    yawRef.current = controller.state.yaw;
    pitchRef.current = controller.state.pitch || 0;
    rollRef.current = controller.state.roll || 0;
    airborneRef.current = controller.state.airborne === true;
    animationRef.current = controller.state.animation;
    debugRef.current = controller.state.debug;
  });

  return {
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
    reset: next => controller?.reset(next),
  };
}
