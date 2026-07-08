'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampToWalkable, terrainHeight } from '../../world/terrain';
import { addRimLight, toonMaterial } from '../scene/materials';
import { ModelAsset } from '../assets/ModelAsset';
import { useThreeGameStore } from '../../store';
import { onPropEvent } from '../../physics/props/propEvents';
import { publishNpcPose, removeNpcPose } from '../../world/npcRuntime';
import { SNARE_ARM_SECONDS, SNARE_CHARACTER_TRIGGER_RADIUS } from '../../snareTraps';

function ProceduralCrewFigure({ motion = 0 }) {
  const coat = useMemo(() => addRimLight(toonMaterial('#25323a'), { intensity: 0.18 }), []);
  const skin = useMemo(() => toonMaterial('#c89262'), []);
  const hat = useMemo(() => toonMaterial('#5b4630'), []);
  const bag = useMemo(() => toonMaterial('#9a6a36'), []);

  return (
    <group rotation={[0, Math.PI * 0.86 + motion * 0.08, 0]}>
      <mesh castShadow position={[0, 1.48, 0]} material={skin}>
        <sphereGeometry args={[0.23, 16, 16]} />
      </mesh>
      <mesh castShadow position={[0, 1.76, 0]} material={hat}>
        <cylinderGeometry args={[0.28, 0.36, 0.12, 18]} />
      </mesh>
      <mesh castShadow position={[0, 0.98, 0]} material={coat}>
        <capsuleGeometry args={[0.26, 0.7, 5, 10]} />
      </mesh>
      <mesh castShadow position={[-0.23, 0.42, 0]} rotation={[motion, 0, 0.08]} material={coat}>
        <capsuleGeometry args={[0.065, 0.58, 4, 8]} />
      </mesh>
      <mesh castShadow position={[0.23, 0.42, 0]} rotation={[-motion, 0, -0.08]} material={coat}>
        <capsuleGeometry args={[0.065, 0.58, 4, 8]} />
      </mesh>
      <mesh castShadow position={[0.36, 0.96, -0.08]} rotation={[0, -0.12, -0.18]} material={bag}>
        <boxGeometry args={[0.28, 0.38, 0.13]} />
      </mesh>
    </group>
  );
}

export function SymsCovington() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const group = useRef(null);
  const body = useRef(null);
  const animationRef = useRef('idle');
  const visible = currentZoneId === 'POST_OFFICE_BAY' || currentZoneId === 'BEAGLE';
  // Aboard the Beagle, Syms keeps to the waist beside the fore hatch; ashore
  // he holds his usual spot on the Post Office Bay shelf.
  const x = currentZoneId === 'BEAGLE' ? 5.4 : 4.0;
  const z = currentZoneId === 'BEAGLE' ? -1.9 : 7.0;
  const y = terrainHeight(x, z, currentZoneId) + 0.04;
  const clockRef = useRef(0);
  const reactionRef = useRef({
    mode: 'idle',
    until: 0,
    offsetX: 0,
    offsetZ: 0,
    targetX: 0,
    targetZ: 0,
    pending: [],
    lastLineAt: -Infinity,
    lastPenaltyAt: -Infinity,
    snareYaw: Math.PI * 0.82,
  });

  useEffect(() => onPropEvent('tool-swing', event => {
    if (event.tool !== 'hammer') return;
    reactionRef.current.pending.push({
      ...event,
      at: clockRef.current + (event.impactDelay ?? 0.55),
    });
  }), []);

  // Struck by shotgun pellets (the resolver decided the ray reached him):
  // bolt hard away from the muzzle. Narration/standing land via the store.
  useEffect(() => onPropEvent('shotgun-npc-hit', event => {
    if (event.npcId !== 'syms') return;
    const reaction = reactionRef.current;
    if (reaction.mode === 'snared') return;
    const sx = x + reaction.offsetX;
    const sz = z + reaction.offsetZ;
    let awayX = sx - (event.origin?.x ?? sx);
    let awayZ = sz - (event.origin?.z ?? sz);
    const length = Math.hypot(awayX, awayZ) || 1;
    awayX /= length;
    awayZ /= length;
    const safe = clampToWalkable({ x: sx + awayX * 8.5, y: 0, z: sz + awayZ * 8.5 }, null, currentZoneId);
    reaction.mode = 'flee';
    reaction.until = clockRef.current + 8.5;
    reaction.targetX = safe.x - x;
    reaction.targetZ = safe.z - z;
  }), [currentZoneId, x, z]);

  // Any nearby report makes him duck aside even when the shot misses.
  useEffect(() => onPropEvent('shotgun-fired', event => {
    const reaction = reactionRef.current;
    if (reaction.mode === 'flee' || reaction.mode === 'snared') return;
    const sx = x + reaction.offsetX;
    const sz = z + reaction.offsetZ;
    let awayX = sx - (event.position?.x || 0);
    let awayZ = sz - (event.position?.z || 0);
    const distance = Math.hypot(awayX, awayZ);
    if (distance > 11) return;
    const length = distance || 1;
    awayX /= length;
    awayZ /= length;
    const safe = clampToWalkable({ x: sx + awayX * 2.2, y: 0, z: sz + awayZ * 2.2 }, null, currentZoneId);
    reaction.mode = 'flinch';
    reaction.until = clockRef.current + 2.4;
    reaction.targetX = safe.x - x;
    reaction.targetZ = safe.z - z;
  }), [currentZoneId, x, z]);

  useEffect(() => () => removeNpcPose(currentZoneId, 'syms'), [currentZoneId]);

  useFrame(({ clock }, delta) => {
    if (!visible || !group.current) return;
    const time = clock.elapsedTime;
    clockRef.current = time;
    const reaction = reactionRef.current;

    if (reaction.pending.length) {
      const due = reaction.pending.filter(event => event.at <= time);
      reaction.pending = reaction.pending.filter(event => event.at > time);
      for (const event of due) {
        const sx = x + reaction.offsetX;
        const sz = z + reaction.offsetZ;
        const dx = sx - (event.position?.x || 0);
        const dz = sz - (event.position?.z || 0);
        const distance = Math.hypot(dx, dz);
        if (distance > 2.45) continue;
        const facingLength = Math.hypot(event.facing?.x || 0, event.facing?.z || 0) || 1;
        const toSymsLength = Math.max(0.001, distance);
        const facingDot = ((event.facing?.x || 0) / facingLength) * (dx / toSymsLength)
          + ((event.facing?.z || 0) / facingLength) * (dz / toSymsLength);
        if (facingDot < 0.12 && distance > 1.15) continue;

        const direct = distance < 1.18;
        let awayX = dx / toSymsLength;
        let awayZ = dz / toSymsLength;
        if (Math.hypot(awayX, awayZ) < 0.001) {
          awayX = -(event.facing?.x || 0);
          awayZ = -(event.facing?.z || -1);
        }
        const awayLength = Math.hypot(awayX, awayZ) || 1;
        awayX /= awayLength;
        awayZ /= awayLength;

        const retreatDistance = direct ? 7.2 : 2.6;
        const safe = clampToWalkable({
          x: sx + awayX * retreatDistance,
          y: 0,
          z: sz + awayZ * retreatDistance,
        }, null, currentZoneId);
        reaction.mode = direct ? 'flee' : 'flinch';
        reaction.until = time + (direct ? 7.5 : 2.4);
        reaction.targetX = safe.x - x;
        reaction.targetZ = safe.z - z;

        const store = useThreeGameStore.getState();
        if (time - reaction.lastLineAt > 1.8) {
          store.recordHammerStrikeFeedback?.({
            message: direct
              ? 'Syms bolts out of hammer reach, clutching the label book to his chest.'
              : 'Syms hops back from the hammer swing and gives Darwin a wounded look.',
            educationalNote: 'Field tools are useful only when handled carefully; reckless hammering can damage trust as well as specimens.',
            symsLine: direct
              ? '"Sir! I am your assistant, not a basalt outcrop!"'
              : '"Careful with that hammer, sir."',
            fatigueDelta: 0,
          });
          reaction.lastLineAt = time;
        }
        if (direct && time - reaction.lastPenaltyAt > 12) {
          store.adjustLocalStanding?.(-3);
          reaction.lastPenaltyAt = time;
        }
      }
    }

    const activeReaction = time < reaction.until;
    if (!activeReaction) {
      reaction.targetX = 0;
      reaction.targetZ = 0;
      reaction.mode = 'idle';
    }
    const returnRate = activeReaction ? (reaction.mode === 'flee' ? 5.5 : 8.0) : 0.18;
    const damp = 1 - Math.exp(-Math.max(0.001, delta) * returnRate);
    reaction.offsetX += (reaction.targetX - reaction.offsetX) * damp;
    reaction.offsetZ += (reaction.targetZ - reaction.offsetZ) * damp;

    const worldX = x + reaction.offsetX;
    const worldZ = z + reaction.offsetZ;
    const groundY = terrainHeight(worldX, worldZ, currentZoneId) + 0.04;
    // Line-of-fire systems (the shotgun resolver) test against where Syms
    // actually stands, offsets and flees included.
    publishNpcPose(currentZoneId, 'syms', { x: worldX, y: groundY, z: worldZ });
    if (reaction.mode !== 'snared') {
      const store = useThreeGameStore.getState();
      const trap = (store.snareTraps || []).find(item => (
        item.zoneId === currentZoneId
        && item.status === 'set'
        && Date.now() - (item.placedAtRealMs || Date.now()) >= SNARE_ARM_SECONDS * 1000
        && Math.hypot(worldX - item.position.x, worldZ - item.position.z) <= SNARE_CHARACTER_TRIGGER_RADIUS
      ));
      if (trap) {
        store.springSnareTrapByCharacter?.(trap.id, 'syms');
        reaction.mode = 'snared';
        reaction.until = time + 7.5;
        reaction.targetX = reaction.offsetX;
        reaction.targetZ = reaction.offsetZ;
        reaction.snareYaw = Math.atan2(worldX - trap.position.x, worldZ - trap.position.z) + Math.PI * 0.5;
      }
    }
    group.current.position.set(worldX, groundY + Math.sin(time * 1.4) * 0.015, worldZ);
    if (reaction.mode === 'snared') {
      group.current.position.y = groundY + 0.08;
      group.current.rotation.set(0, reaction.snareYaw, 0);
      if (body.current) {
        body.current.position.set(0, 0.14, 0);
        body.current.rotation.set(-Math.PI / 2, 0, 0.08);
      }
      animationRef.current = 'idle';
      return;
    }
    if (body.current) {
      body.current.position.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-delta * 8));
      body.current.rotation.x = THREE.MathUtils.damp(body.current.rotation.x, 0, 8, delta);
      body.current.rotation.z = THREE.MathUtils.damp(body.current.rotation.z, 0, 8, delta);
    }
    if (activeReaction && Math.hypot(reaction.targetX - reaction.offsetX, reaction.targetZ - reaction.offsetZ) > 0.15) {
      group.current.rotation.y = Math.atan2(reaction.targetX - reaction.offsetX, reaction.targetZ - reaction.offsetZ);
      animationRef.current = reaction.mode === 'flee' ? 'gather' : 'lookAroundShort';
      return;
    }

    group.current.rotation.y = Math.PI * 0.82;
    const cycle = time % 30;
    if (cycle > 25) animationRef.current = 'kneelInspect';
    else if (cycle > 20) animationRef.current = 'write';
    else if (cycle > 16) animationRef.current = 'gather';
    else if (cycle > 12) animationRef.current = 'lookAroundShort';
    else if (cycle > 9) animationRef.current = 'point';
    else animationRef.current = 'idle';
  });

  if (!visible) return null;

  return (
    <group ref={group} position={[x, y, z]} rotation={[0, Math.PI * 0.82, 0]} userData={{
      renderSource: 'npc:syms',
      renderLabel: 'Syms Covington actor',
      renderKind: 'npc',
      renderPath: null,
    }}>
      <group ref={body}>
        <ModelAsset id="syms" animationSelector={() => animationRef.current} reflect fallback={<ProceduralCrewFigure motion={0.16} />} />
      </group>
      <mesh position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.72, 0.82, 36]} />
        <meshBasicMaterial color="#d9e6ba" transparent opacity={0.42} />
      </mesh>
      <mesh position={[0, 2.22, 0]}>
        <sphereGeometry args={[0.08, 12, 8]} />
        <meshBasicMaterial color="#d9e6ba" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 2.43, 0]}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshBasicMaterial color="#d9e6ba" transparent opacity={0.68} />
      </mesh>
    </group>
  );
}
