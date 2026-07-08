'use client';

import { useFrame } from '@react-three/fiber';
import { advanceWorldTime } from './worldTime';

// Advances the shared world clock exactly once per frame, before every
// consumer (fauna hooks, FX, the shotgun resolver) via negative priority.
export default function WorldTimeTicker() {
  useFrame((_, delta) => {
    advanceWorldTime(delta);
  }, -100);
  return null;
}
