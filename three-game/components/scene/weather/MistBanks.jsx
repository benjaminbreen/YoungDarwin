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
  const count = band === 'highland' ? 4 : 3;
  const anchors = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + zoneId.length;
    const radius = size * (band === 'highland' ? 0.34 : 0.5);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    let y = 6;
    try {
      y = Math.max(terrainHeight(x, z, zoneId) + 3.5, 4);
    } catch {
      // Unauthored placeholder terrain: keep the default height.
    }
    anchors.push({ x, y, z, seed: i + 11, scale: band === 'highland' ? 1.25 : 1 });
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
  const [mist, setMist] = useState(0);
  const throttle = useRef(0);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.visible = mist > 0.02;
      // Mist creeps downwind far slower than the cumulus overhead.
      groupRef.current.position.x += weatherEnv.windX * weatherEnv.windSpeed * delta * 0.12;
      groupRef.current.position.z += weatherEnv.windZ * weatherEnv.windSpeed * delta * 0.12;
      const drift = Math.hypot(groupRef.current.position.x, groupRef.current.position.z);
      if (drift > 14) groupRef.current.position.set(0, 0, 0);
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
            speed={0.08}
            fade={12}
            opacity={quantize(mist * 0.5)}
            color="#dbe6e9"
          />
        ))}
      </Clouds>
    </group>
  );
}
