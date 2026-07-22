'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { weatherEnv } from '../../../world/weatherEnvRuntime';
import { emitPropEvent } from '../../../physics/props/propEvents';
import { useThreeGameStore } from '../../../store';

// Storm lightning: an ambient cool-white flash with the classic double-strike
// envelope (sharp leader, softer return stroke). Pure light intensity — no
// geometry, no extra draw calls — and it only arms when rain intensity is in
// storm territory.
export function LightningFX() {
  const lightRef = useRef(null);
  const state = useRef({ countdown: 8, flashTime: null });

  useFrame((_, delta) => {
    const light = lightRef.current;
    if (!light) return;
    const storm = Math.max(0, (weatherEnv.rainIntensity - 0.82) / 0.18);
    if (storm <= 0) {
      light.intensity = 0;
      state.current.flashTime = null;
      return;
    }

    const s = state.current;
    if (s.flashTime === null) {
      s.countdown -= delta * storm;
      if (s.countdown <= 0) {
        s.flashTime = 0;
        s.countdown = 6 + Math.random() * 16;
        emitPropEvent('lightning-flash', {
          zoneId: useThreeGameStore.getState().currentZoneId,
          distance: 120 + Math.pow(Math.random(), 1.6) * 920,
          pan: (Math.random() - 0.5) * 0.75,
          storm,
        });
      }
      light.intensity = 0;
      return;
    }

    s.flashTime += delta;
    const t = s.flashTime;
    // Leader spike then a delayed, broader return stroke.
    const envelope = Math.exp(-t * 16) + 0.65 * Math.exp(-((t - 0.16) ** 2) * 180);
    light.intensity = envelope * 2.4 * storm;
    if (t > 0.6) s.flashTime = null;
  });

  return <ambientLight ref={lightRef} intensity={0} color="#dce8ff" />;
}
