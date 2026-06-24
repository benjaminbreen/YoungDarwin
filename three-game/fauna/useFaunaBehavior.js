'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';
import { getFaunaBehaviorProfile } from './faunaBehaviorProfiles';
import { createFaunaMotionController, habitatFor, seedFromSpecimen } from './faunaMotionController';
import { onPropEvent } from '../physics/props/propEvents';

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
    });
  }, [basePosition, basePositionRef, currentZoneId, habitat, profile, seed]);
  const positionRef = useRef(basePosition?.clone?.() || null);
  const yawRef = useRef(0);
  const animationRef = useRef(null);
  const debugRef = useRef(null);
  const statusRef = useRef({ ok: false, reason: 'not-started' });

  useEffect(() => {
    const base = basePositionRef?.current || basePosition;
    if (controller && base) {
      controller.reset({ basePosition: base, zoneId: currentZoneId });
      positionRef.current = controller.state.position;
      yawRef.current = controller.state.yaw;
      animationRef.current = controller.state.animation;
      debugRef.current = controller.state.debug;
      return;
    }
    positionRef.current = base || null;
    yawRef.current = 0;
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

  useFrame(({ clock, delta }) => {
    if (!controller || !profile) return;
    const base = basePositionRef?.current || basePosition;
    const playerPose = getRuntimePlayerPose();
    const status = controller.update({
      basePosition: base,
      zoneId: currentZoneId,
      playerPosition: playerPose?.position,
      elapsedTime: clock.elapsedTime,
      delta,
      paused,
    });
    statusRef.current = status;
    positionRef.current = controller.state.position;
    yawRef.current = controller.state.yaw;
    animationRef.current = controller.state.animation;
    debugRef.current = controller.state.debug;
  });

  return {
    active: Boolean(controller && profile),
    profile,
    positionRef,
    yawRef,
    animationRef,
    debugRef,
    statusRef,
    reset: next => controller?.reset(next),
  };
}
