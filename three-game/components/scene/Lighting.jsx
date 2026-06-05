'use client';

import React from 'react';
import { useThreeGameStore } from '../../store';

export function Lighting() {
  const weather = useThreeGameStore(state => state.weather);
  const cloudy = weather === 'cloudy' || weather === 'misty';

  return (
    <>
      <ambientLight intensity={cloudy ? 0.78 : 0.66} />
      <hemisphereLight args={['#e4f8ff', '#9a7a52', cloudy ? 1.55 : 1.36]} />
      <directionalLight
        position={[-9, 18, 7]}
        intensity={cloudy ? 1.15 : 1.75}
        color={cloudy ? '#d8ecff' : '#fff0bd'}
      />
      <directionalLight
        position={[7, 6, -8]}
        intensity={cloudy ? 0.55 : 0.72}
        color="#9ed7ff"
      />
      <pointLight position={[0, 2.6, -3.2]} intensity={0.8} distance={8} color="#fff3cf" />
    </>
  );
}
