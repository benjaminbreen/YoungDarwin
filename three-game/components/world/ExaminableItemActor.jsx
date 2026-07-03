'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getZoneExaminableItems } from '../../examine/examinables';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { terrainHeight } from '../../world/terrain';

const NEARBY_DISTANCE = 2.3;
const PROXIMITY_POLL_S = 0.12;

// A standalone examinable prop (letter, book): not a specimen, collected as an
// item from inside the examination screen. Publishes nearbyItem so the examine
// prompt/button and Enter key work exactly as they do for specimens.
function ExaminableItemActor({ item }) {
  const group = useRef(null);
  const pollAt = useRef(0);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const setNearbyItem = useThreeGameStore(state => state.setNearbyItem);
  const collected = useThreeGameStore(state => state.items.some(entry => entry.typeId === item.typeId));

  const position = useMemo(() => {
    const { x, z } = item.worldPlacement;
    return new THREE.Vector3(x, terrainHeight(x, z, currentZoneId) + 0.02, z);
  }, [currentZoneId, item.worldPlacement]);

  useFrame(({ clock }) => {
    if (collected) return;
    const elapsed = clock.getElapsedTime();
    if (elapsed - pollAt.current < PROXIMITY_POLL_S) return;
    pollAt.current = elapsed;
    const player = getRuntimePlayerPose()?.position || { x: 0, z: 0 };
    const distance = Math.hypot(position.x - player.x, position.z - player.z);
    const state = useThreeGameStore.getState();
    const isNearby = state.nearbyItem?.actorId === item.typeId;
    if (distance <= NEARBY_DISTANCE && !isNearby) {
      setNearbyItem({
        typeId: item.typeId,
        actorId: item.typeId,
        name: item.name,
        focus: { x: position.x, y: position.y, z: position.z },
      });
    } else if (distance > NEARBY_DISTANCE && isNearby) {
      setNearbyItem(null);
    }
  });

  if (collected) return null;

  return (
    <group ref={group} position={position} rotation={[0, item.worldPlacement.rotationY || 0, 0]}>
      {/* Folded letter: two thin leaves of salt-stained paper and a tar seal */}
      <mesh castShadow receiveShadow rotation={[0, 0, 0.03]} position={[0, 0.012, 0]}>
        <boxGeometry args={[0.24, 0.018, 0.17]} />
        <meshStandardMaterial color="#d8c9a3" roughness={0.88} />
      </mesh>
      <mesh castShadow rotation={[0, 0.16, -0.02]} position={[0.02, 0.03, 0.01]}>
        <boxGeometry args={[0.22, 0.014, 0.155]} />
        <meshStandardMaterial color="#cbb98f" roughness={0.9} />
      </mesh>
      <mesh position={[0.045, 0.042, 0.015]}>
        <cylinderGeometry args={[0.016, 0.016, 0.008, 12]} />
        <meshStandardMaterial color="#2b241c" roughness={0.6} />
      </mesh>
    </group>
  );
}

export function ExaminableItems() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const items = useMemo(() => getZoneExaminableItems(currentZoneId), [currentZoneId]);
  if (!items.length) return null;
  return items.map(item => <ExaminableItemActor key={item.typeId} item={item} />);
}
