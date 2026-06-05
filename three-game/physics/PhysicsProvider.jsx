'use client';

import React from 'react';
import { Physics } from '@react-three/rapier';

export function PhysicsProvider({ debug = false, children }) {
  return (
    <Physics gravity={[0, -15.5, 0]} timeStep="vary" debug={debug}>
      {children}
    </Physics>
  );
}
