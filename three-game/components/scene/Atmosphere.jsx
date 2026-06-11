'use client';

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud, Clouds } from '@react-three/drei';
import * as THREE from 'three';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { getCloudTextureUrl } from './weather/cloudTexture';

// Authored cumulus bank: position, scale, seed, base opacity. The whole group
// slowly revolves with the wind (an old trick: rotation needs no wrapping), so
// clouds drift continually across the island. Coverage from the weather env
// fades the back ranks in as skies close over.
const CLOUD_SPECS = [
  { position: [-34, 27, -52], seed: 1, volume: 9, base: 0.5, minCoverage: 0.0 },
  { position: [26, 31, -58], seed: 2, volume: 11, base: 0.45, minCoverage: 0.0 },
  { position: [58, 24, 18], seed: 3, volume: 8, base: 0.5, minCoverage: 0.2 },
  { position: [-58, 29, 30], seed: 4, volume: 12, base: 0.55, minCoverage: 0.35 },
  { position: [8, 33, 62], seed: 5, volume: 13, base: 0.6, minCoverage: 0.5 },
  { position: [-12, 26, -20], seed: 6, volume: 10, base: 0.55, minCoverage: 0.65 },
];

const _cloudColor = new THREE.Color();
const _white = new THREE.Color('#ffffff');
const _grey = new THREE.Color('#9aa6ad');

// Cloud opacity flows through React props (drei re-bakes instance data from
// props), so quantize hard and update at ~5 Hz: renders only happen while a
// weather transition is actually in progress.
function quantize(value) {
  return Math.round(value * 25) / 25;
}

export function Atmosphere() {
  const groupRef = useRef(null);
  const [coverage, setCoverage] = useState(0);
  const throttle = useRef(0);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.0045 * weatherEnv.windSpeed;
    }
    throttle.current += delta;
    if (throttle.current < 0.2) return;
    throttle.current = 0;
    const next = quantize(weatherEnv.overcast);
    setCoverage(current => (current === next ? current : next));
  });

  _cloudColor.copy(_white).lerp(_grey, coverage * 0.8);
  const colorHex = `#${_cloudColor.getHexString()}`;

  return (
    <group ref={groupRef}>
      <Clouds texture={getCloudTextureUrl()} limit={CLOUD_SPECS.length * 26} frustumCulled={false}>
        {CLOUD_SPECS.map(spec => {
          const reveal = THREE.MathUtils.clamp((Math.max(0.18, coverage) - spec.minCoverage) / 0.32, 0, 1);
          return (
            <Cloud
              key={spec.seed}
              seed={spec.seed}
              position={spec.position}
              segments={22}
              bounds={[14, 3.2, 9]}
              volume={spec.volume}
              growth={3}
              speed={0.12}
              fade={18}
              opacity={quantize(spec.base * reveal * (0.55 + coverage * 0.45))}
              color={colorHex}
            />
          );
        })}
      </Clouds>
    </group>
  );
}
