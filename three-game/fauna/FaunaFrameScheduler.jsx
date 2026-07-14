'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getRuntimePlayerPose } from '../store';
import { faunaDebugEnabled } from '../runtimeDebug';
import { worldTime } from '../world/worldTime';
import { faunaFrameScheduler } from './faunaFrameScheduler';

export function FaunaFrameScheduler() {
  const debugEnabled = useMemo(faunaDebugEnabled, []);
  const nextDebugPublishAt = useRef(0);

  // WorldTimeTicker advances at -100. Fauna then updates at -50 so model
  // animation selectors and other default-priority presentation consumers see
  // the latest scheduled actor state during the same rendered frame.
  useFrame(({ clock }) => {
    const stats = faunaFrameScheduler.run({
      realElapsed: clock.elapsedTime,
      worldElapsed: worldTime.elapsed,
      worldDelta: worldTime.delta,
      playerPose: getRuntimePlayerPose(),
    });
    if (
      debugEnabled
      && typeof window !== 'undefined'
      && clock.elapsedTime >= nextDebugPublishAt.current
    ) {
      window.__faunaFrameSchedulerDebug = { ...stats, at: clock.elapsedTime };
      nextDebugPublishAt.current = clock.elapsedTime + 0.5;
    }
  }, -50);

  return null;
}
