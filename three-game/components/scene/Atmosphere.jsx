'use client';

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud, Clouds } from '@react-three/drei';
import * as THREE from 'three';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { CloudDeck } from './weather/CloudDeck';
import { getCloudTextureUrl } from './weather/cloudTexture';

// Cloud archetypes (real genera, gamified):
//  - fair cumulus: detached puffy volumes that thicken as skies close over
//  - rain scud (pannus): low, dark, ragged fragments racing under the deck
//  - the broad nimbostratus ceiling itself is <CloudDeck/> (one shader plane)
// The whole cumulus group revolves slowly with the wind (rotation needs no
// wrapping); scud rides a faster ring beneath it.
const CUMULUS_SPECS = [
  { position: [-34, 27, -52], seed: 1, volume: 9, base: 0.5, minCoverage: 0.0 },
  { position: [26, 31, -58], seed: 2, volume: 11, base: 0.45, minCoverage: 0.0 },
  { position: [58, 24, 18], seed: 3, volume: 8, base: 0.5, minCoverage: 0.2 },
  { position: [-58, 29, 30], seed: 4, volume: 12, base: 0.55, minCoverage: 0.35 },
  { position: [8, 33, 62], seed: 5, volume: 13, base: 0.6, minCoverage: 0.5 },
  { position: [-12, 26, -20], seed: 6, volume: 10, base: 0.55, minCoverage: 0.65 },
];

const SCUD_SPECS = [
  { position: [-30, 17, -38], seed: 21, volume: 5 },
  { position: [42, 15, 12], seed: 22, volume: 4 },
  { position: [-8, 18, 44], seed: 23, volume: 6 },
  { position: [18, 14, -52], seed: 24, volume: 4 },
];

const _cloudColor = new THREE.Color();
const _white = new THREE.Color('#ffffff');
const _grey = new THREE.Color('#9aa6ad');
const _stormGrey = new THREE.Color('#5f6b75');
const CUMULUS_ROTATION_RATE = 0.0015;
const SCUD_ROTATION_RATE = 0.008;
const CUMULUS_INTERNAL_SPEED = 0.05;
const SCUD_INTERNAL_SPEED = 0.12;

// Cloud opacity flows through React props (drei re-bakes instance data from
// props deterministically per seed), so quantize hard and update at ~5 Hz:
// renders only happen while a weather transition is actually in progress.
function quantize(value) {
  return Math.round(value * 25) / 25;
}

export function Atmosphere() {
  const cumulusRef = useRef(null);
  const scudRef = useRef(null);
  const [coverage, setCoverage] = useState(0);
  const [rain, setRain] = useState(0);
  const throttle = useRef(0);

  useFrame((_, delta) => {
    const wind = weatherEnv.cloudDriftSpeed;
    if (cumulusRef.current) cumulusRef.current.rotation.y += delta * CUMULUS_ROTATION_RATE * wind;
    // Scud slides faster than the ceiling, but should still read as weather
    // scale motion instead of small props orbiting the player.
    if (scudRef.current) scudRef.current.rotation.y -= delta * SCUD_ROTATION_RATE * wind;
    throttle.current += delta;
    if (throttle.current < 0.2) return;
    throttle.current = 0;
    const nextCoverage = quantize(weatherEnv.overcast);
    const nextRain = quantize(weatherEnv.rainIntensity);
    setCoverage(current => (current === nextCoverage ? current : nextCoverage));
    setRain(current => (current === nextRain ? current : nextRain));
  });

  _cloudColor.copy(_white).lerp(_grey, coverage * 0.8).lerp(_stormGrey, rain * 0.7);
  const cumulusColor = `#${_cloudColor.getHexString()}`;

  return (
    <group>
      <CloudDeck />
      <group ref={cumulusRef}>
        <Clouds texture={getCloudTextureUrl()} limit={140} frustumCulled={false}>
          {CUMULUS_SPECS.map(spec => {
            const reveal = THREE.MathUtils.clamp((Math.max(0.18, coverage) - spec.minCoverage) / 0.32, 0, 1);
            const opacity = quantize(spec.base * reveal * (0.55 + coverage * 0.45));
            // Don't render clouds that have faded to nothing: a clear/fair sky
            // keeps only the ~2 fair-weather puffs instead of paying for six
            // fully-transparent billboard volumes worth of overdraw.
            if (opacity <= 0) return null;
            return (
              <Cloud
                key={spec.seed}
                seed={spec.seed}
                position={spec.position}
                segments={12}
                bounds={[14, 3.2, 9]}
                volume={spec.volume}
                growth={3}
                speed={CUMULUS_INTERNAL_SPEED}
                fade={18}
                opacity={opacity}
                color={cumulusColor}
              />
            );
          })}
        </Clouds>
      </group>
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
