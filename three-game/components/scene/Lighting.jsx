'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { weatherEnv } from '../../world/weatherEnvRuntime';

export function Lighting() {
  const fillRef = useRef(null);

  // Ambient, hemisphere and the sun-tracking key light are owned by
  // <SkyController>, which drives them from the time of day. This component
  // keeps only the local fill: a soft sky-bounce directional and the warm
  // point light near the player. The fill dims smoothly with the weather
  // env's continuous lightDim instead of snapping on a state change.
  useFrame(() => {
    if (fillRef.current) fillRef.current.intensity = 0.62 * (1 - weatherEnv.lightDim * 0.3);
  });

  return (
    <>
      <directionalLight
        ref={fillRef}
        position={[7, 6, -8]}
        intensity={0.62}
        color="#9ed7ff"
      />
      <pointLight position={[0, 2.6, -3.2]} intensity={0.7} distance={8} color="#fff3cf" />
    </>
  );
}
