'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud, Clouds } from '@react-three/drei';
import * as THREE from 'three';
import { useThreeGameStore } from '../../../store';
import { weatherEnv } from '../../../world/weatherEnvRuntime';
import { getRegionClimateBand } from '../../../world/weatherDirector';
import { getZone } from '../../../world/floreanaZones';
import { terrainHeight } from '../../../world/terrain';
import { getCloudTextureUrl } from './cloudTexture';

// Localized garúa banks: low, flattened cloud volumes hugging the terrain.
// Anchors are sampled from the zone's own heightfield, so on highland maps
// the mist clusters over the high ground; opacity tracks the weather env's
// mistAmount, which means banks visibly burn off toward midday.
function makeAnchors(zoneId) {
  const zone = getZone(zoneId);
  const band = getRegionClimateBand(zoneId);
  const size = (zone.terrainSize || 100) * 0.5;
  const count = band === 'highland' ? 5 : band === 'windward' ? 3 : band === 'inland' ? 1 : 0;
  const anchors = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + zoneId.length;
    const radius = size * (band === 'highland' ? 0.28 + (i % 2) * 0.12 : band === 'windward' ? 0.42 : 0.34);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    let y = 6;
    let pocket = 0.4;
    try {
      const center = terrainHeight(x, z, zoneId);
      const sampleRadius = band === 'highland' ? 13 : band === 'windward' ? 10 : 8;
      const around = [
        terrainHeight(x + sampleRadius, z, zoneId),
        terrainHeight(x - sampleRadius, z, zoneId),
        terrainHeight(x, z + sampleRadius, zoneId),
        terrainHeight(x, z - sampleRadius, zoneId),
      ];
      const rim = around.reduce((sum, value) => sum + value, 0) / around.length;
      pocket = THREE.MathUtils.clamp((rim - center + 1.5) / 6, 0.18, 1);
      y = Math.max(center + THREE.MathUtils.lerp(2.1, 4.0, pocket), 3.5);
    } catch {
      // Unauthored placeholder terrain: keep the default height.
    }
    const scaleBase = band === 'highland' ? 1.18 : band === 'windward' ? 0.88 : 0.72;
    const opacityMax = band === 'highland' ? 0.66 : band === 'windward' ? 0.42 : 0.26;
    anchors.push({
      x,
      y,
      z,
      seed: i + 11,
      scale: scaleBase + pocket * 0.3,
      opacity: THREE.MathUtils.lerp(0.16, opacityMax, pocket),
      speed: THREE.MathUtils.lerp(0.035, 0.075, 1 - pocket),
    });
  }
  return anchors;
}

function quantize(value) {
  return Math.round(value * 25) / 25;
}

export function MistBanks() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const anchors = useMemo(() => makeAnchors(currentZoneId), [currentZoneId]);
  const groupRef = useRef(null);
  const driftPhase = useRef(0);
  const [mist, setMist] = useState(0);
  const throttle = useRef(0);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.visible = mist > 0.02;
      // Mist creeps downwind far slower than the cumulus overhead.
      driftPhase.current += weatherEnv.mistDriftSpeed * delta * 0.055;
      const drift = Math.sin(driftPhase.current) * 7;
      groupRef.current.position.x = weatherEnv.windX * drift;
      groupRef.current.position.z = weatherEnv.windZ * drift;
    }
    throttle.current += delta;
    if (throttle.current < 0.25) return;
    throttle.current = 0;
    const next = quantize(weatherEnv.mistAmount);
    setMist(current => (current === next ? current : next));
  });

  if (!anchors.length) return null;

  return (
    <group ref={groupRef}>
      <Clouds texture={getCloudTextureUrl()} limit={anchors.length * 18} frustumCulled={false}>
        {anchors.map(anchor => (
          <Cloud
            key={anchor.seed}
            seed={anchor.seed}
            position={[anchor.x, anchor.y, anchor.z]}
            segments={14}
            bounds={[16 * anchor.scale, 1.6, 11 * anchor.scale]}
            volume={7 * anchor.scale}
            growth={2}
            speed={anchor.speed}
            fade={12}
            opacity={quantize(mist * anchor.opacity)}
            color="#dbe6e9"
          />
        ))}
      </Clouds>
    </group>
  );
}
