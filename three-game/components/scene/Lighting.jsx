'use client';

import React from 'react';
import { useThreeGameStore } from '../../store';

export function Lighting() {
  const weather = useThreeGameStore(state => state.weather);
  const cloudy = weather === 'cloudy' || weather === 'misty';

  // Ambient, hemisphere and the sun-tracking key light are owned by
  // <SkyController>, which drives them from the time of day. This component
  // keeps only the local fill: a soft sky-bounce directional and the warm
  // point light near the player, both still nudged by weather.
  return (
    <>
      <directionalLight
        position={[7, 6, -8]}
        intensity={cloudy ? 0.5 : 0.62}
        color="#9ed7ff"
      />
      <pointLight position={[0, 2.6, -3.2]} intensity={0.7} distance={8} color="#fff3cf" />
    </>
  );
}
