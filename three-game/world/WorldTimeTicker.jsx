'use client';

import { useFrame } from '@react-three/fiber';
import { noteFrameDelta } from '../frameTiming';
import { advanceWorldTime } from './worldTime';

// Advances the shared world clock exactly once per frame, before every
// consumer (fauna hooks, FX, the shotgun resolver) via negative priority.
// Also feeds the shared frame-time pressure signal, since this is the one
// callback guaranteed to run exactly once per rendered frame.
export default function WorldTimeTicker() {
  useFrame((_, delta) => {
    noteFrameDelta(delta);
    advanceWorldTime(delta);
  }, -100);
  return null;
}
