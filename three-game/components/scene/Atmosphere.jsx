'use client';

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud, Clouds } from '@react-three/drei';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { CloudDeck } from './weather/CloudDeck';
import { getCloudTextureUrl } from './weather/cloudTexture';

// Sky layers: the whole cumulus/overcast range lives in <CloudDeck/> — one
// sun-lit shader dome. The only sprite clouds left are rain scud (pannus):
// low, dark, ragged fragments racing under the deck, kept as billboards for
// the close-overhead parallax a dome can't fake. The ring revolves faster
// than the ceiling so it reads as wind-driven wrack.
const SCUD_SPECS = [
  { position: [-30, 17, -38], seed: 21, volume: 5 },
  { position: [42, 15, 12], seed: 22, volume: 4 },
  { position: [-8, 18, 44], seed: 23, volume: 6 },
  { position: [18, 14, -52], seed: 24, volume: 4 },
];

const SCUD_ROTATION_RATE = 0.008;
const SCUD_INTERNAL_SPEED = 0.12;

// Cloud opacity flows through React props (drei re-bakes instance data from
// props deterministically per seed), so quantize hard and update at ~5 Hz:
// renders only happen while a weather transition is actually in progress.
function quantize(value) {
  return Math.round(value * 25) / 25;
}

export function Atmosphere() {
  const scudRef = useRef(null);
  const [rain, setRain] = useState(0);
  const throttle = useRef(0);

  useFrame((_, delta) => {
    if (scudRef.current) {
      scudRef.current.rotation.y -= delta * SCUD_ROTATION_RATE * weatherEnv.cloudDriftSpeed;
    }
    throttle.current += delta;
    if (throttle.current < 0.2) return;
    throttle.current = 0;
    const nextRain = quantize(weatherEnv.rainIntensity);
    setRain(current => (current === nextRain ? current : nextRain));
  });

  return (
    <group>
      <CloudDeck />
      <group ref={scudRef} visible={rain > 0.02}>
        <Clouds texture={getCloudTextureUrl()} limit={36} frustumCulled={false}>
          {SCUD_SPECS.map(spec => {
            const opacity = quantize(rain * 0.5);
            if (opacity <= 0) return null;
            return (
              <Cloud
                key={spec.seed}
                seed={spec.seed}
                position={spec.position}
                segments={8}
                bounds={[11, 1.4, 6]}
                volume={spec.volume}
                growth={2}
                speed={SCUD_INTERNAL_SPEED}
                fade={14}
                opacity={opacity}
                color="#6b757d"
              />
            );
          })}
        </Clouds>
      </group>
    </group>
  );
}
