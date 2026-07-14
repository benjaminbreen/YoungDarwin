'use client';

import React from 'react';
import { Physics } from '@react-three/rapier';

// Keep Rapier's context stable when UI-only parents rerender (for example, the
// performance panel publishing fresh metrics). @react-three/rapier includes
// the gravity array identity in its context memo; an inline array therefore
// rebuilt the context and retriggered the player's spawn-sync effect.
const WORLD_GRAVITY = [0, -15.5, 0];

export function PhysicsProvider({ debug = false, children }) {
  return (
    <Physics gravity={WORLD_GRAVITY} timeStep={1 / 60} maxCcdSubsteps={4} debug={debug}>
      {children}
    </Physics>
  );
}
