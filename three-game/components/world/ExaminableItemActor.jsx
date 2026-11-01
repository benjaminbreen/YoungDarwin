'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getZoneExaminableItems } from '../../examine/examinables';
import { floorAt, wallAnchor } from '../../interiors/cave/props/anchors';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { terrainHeight } from '../../world/terrain';

const DEFAULT_REACH = 2.3;
const READABLE_REACH = 1.7;
// A paper on the rock face is read from where the floor lets Darwin stand,
// which on a sloping tube wall can be well short of the paper itself.
const WALL_REACH = 2.2;
const PROXIMITY_POLL_S = 0.12;

// Where an item sits. Field props rest on the terrain; cave papers sit on the
// furnishings (`surface: 'cave'` + `lift` above the rock floor) or on the rock
// face itself (`wall`), found the same way the furnishings that show them are.
export function resolveItemPlacement(item, zoneId) {
  const placement = item.worldPlacement;
  const { x, z } = placement;
  if (placement.wall) {
    const anchor = wallAnchor(zoneId, x, placement.wall.y, z, placement.wall.dir);
    if (anchor) {
      const [px, py, pz] = anchor.position;
      const [nx, , nz] = anchor.normal;
      return new THREE.Vector3(px + nx * 0.05, py, pz + nz * 0.05);
    }
    return new THREE.Vector3(x, floorAt(zoneId, x, z) + placement.wall.y, z);
  }
  if (placement.surface === 'cave') {
    return new THREE.Vector3(x, floorAt(zoneId, x, z) + (placement.lift || 0), z);
  }
  return new THREE.Vector3(x, terrainHeight(x, z, zoneId) + 0.02 + (placement.lift || 0), z);
}

function FoldedLetter() {
  // Two thin leaves of salt-stained paper and a tar seal.
  return (
    <>
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
    </>
  );
}

function PostBoard() {
  // A short plank nailed across a staff, its lines burned in: dark scorched
  // strokes on weathered wood.
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0, 0.045]}>
        <boxGeometry args={[0.46, 0.22, 0.025]} />
        <meshStandardMaterial color="#7a6346" roughness={0.92} />
      </mesh>
      {[0.065, 0.02, -0.025, -0.07].map((y, i) => (
        <mesh key={y} position={[i === 0 ? -0.06 : 0, y, 0.0585]}>
          <planeGeometry args={[i === 0 ? 0.22 : 0.36, 0.018]} />
          <meshStandardMaterial color="#2a1d12" roughness={1} />
        </mesh>
      ))}
      {[-0.19, 0.19].map(x => (
        <mesh key={x} position={[x, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.01, 6]} />
          <meshStandardMaterial color="#3a3530" roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
    </>
  );
}

const PROPS = {
  letter: FoldedLetter,
  board: PostBoard,
};

// A standalone examinable prop (letter, book, a paper in Gabriel's cave): not
// a specimen. Papers whose look is already drawn by the furnishings
// (`prop: 'none'`) render nothing of their own and exist only as a place to
// read from.
function ExaminableItemActor({ item, position }) {
  const collected = useThreeGameStore(state => state.items.some(entry => entry.typeId === item.typeId));
  const Prop = PROPS[item.worldPlacement.prop || 'letter'];
  if (collected || !Prop) return null;
  return (
    <group position={position} rotation={[0, item.worldPlacement.rotationY || 0, 0]}>
      <Prop />
    </group>
  );
}

// One proximity pass for every item in the zone, so papers a hand's breadth
// apart on one table do not fight over the prompt: the nearest one wins,
// with a bias to whichever Darwin is facing. Publishes nearbyItem so the
// examine prompt and Enter key work exactly as they do for specimens.
export function ExaminableItems() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const setNearbyItem = useThreeGameStore(state => state.setNearbyItem);
  const placed = useMemo(() => getZoneExaminableItems(currentZoneId).map(item => ({
    item,
    position: resolveItemPlacement(item, currentZoneId),
    reach: item.worldPlacement.reach
      || (item.worldPlacement.wall ? WALL_REACH : item.readable ? READABLE_REACH : DEFAULT_REACH),
  })), [currentZoneId]);
  const pollAt = useRef(0);

  useFrame(({ clock }) => {
    if (!placed.length) return;
    const elapsed = clock.getElapsedTime();
    if (elapsed - pollAt.current < PROXIMITY_POLL_S) return;
    pollAt.current = elapsed;
    const pose = getRuntimePlayerPose();
    const player = pose?.position || { x: 0, z: 0 };
    const facing = pose?.facing || { x: 0, z: 1 };
    const facingLength = Math.hypot(facing.x || 0, facing.z || 0) || 1;
    const state = useThreeGameStore.getState();
    let best = null;
    let bestScore = Infinity;
    for (const entry of placed) {
      if (state.items.some(owned => owned.typeId === entry.item.typeId)) continue;
      const dx = entry.position.x - player.x;
      const dz = entry.position.z - player.z;
      const distance = Math.hypot(dx, dz);
      if (distance > entry.reach) continue;
      const along = distance > 1e-4 ? (dx * facing.x + dz * facing.z) / (distance * facingLength) : 1;
      const score = distance * (1.25 - 0.5 * Math.max(0, along));
      if (score < bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    const current = state.nearbyItem;
    const ownsCurrent = current && placed.some(entry => entry.item.typeId === current.actorId);
    if (best && current?.actorId !== best.item.typeId) {
      setNearbyItem({
        typeId: best.item.typeId,
        actorId: best.item.typeId,
        name: best.item.name,
        readable: Boolean(best.item.readable),
        focus: { x: best.position.x, y: best.position.y, z: best.position.z },
      });
    } else if (!best && ownsCurrent) {
      setNearbyItem(null);
    }
  });

  if (!placed.length) return null;
  return placed.map(entry => <ExaminableItemActor key={entry.item.typeId} item={entry.item} position={entry.position} />);
}
