'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { warmGateRuntime } from '../../world/warmGateRuntime';

// Mounts children invisible until a warm render pass has paid their
// first-draw cost. See warmGateRuntime.js for the contract. Wrap a content
// family that mounts after the reveal; do not wrap anything the opening
// sequence inspects by its wrapper's own visibility.
export function WarmGate({ children }) {
  const groupRef = useRef(null);

  useLayoutEffect(() => warmGateRuntime.register(groupRef.current), []);

  return <group ref={groupRef}>{children}</group>;
}
