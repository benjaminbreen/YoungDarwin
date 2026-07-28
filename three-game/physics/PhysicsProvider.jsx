'use client';

import React from 'react';
import { Physics } from '@react-three/rapier';
import { PhysicsWatchdog } from './PhysicsWatchdog';

// Keep Rapier's context stable when UI-only parents rerender (for example, the
// performance panel publishing fresh metrics). @react-three/rapier includes
// the gravity array identity in its context memo; an inline array therefore
// rebuilt the context and retriggered the player's spawn-sync effect.
const WORLD_GRAVITY = [0, -15.5, 0];

export function PhysicsProvider({ debug = false, children }) {
  return (
    <Physics gravity={WORLD_GRAVITY} timeStep={1 / 60} maxCcdSubsteps={4} debug={debug}>
      {/* First child so its before-step sweep samples the body set ahead of
          anything the zone content does to it this frame. */}
      <PhysicsWatchdog />
      {children}
    </Physics>
  );
}
