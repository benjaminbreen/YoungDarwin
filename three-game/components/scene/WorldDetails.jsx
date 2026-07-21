'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimeObstacles, obstacleRenderPosition } from '../../world/obstacles';
import { useThreeGameStore } from '../../store';
import { StaticGLB } from '../assets/StaticGLB';
import { getEcology } from '../../world/ecology';
import { readRegionEcologyResource } from '../../world/ecology/ecologyResource';
import { EcologyRenderer } from './ecology/EcologyRenderer';
import { FacetedBoulderField } from './ecology/FacetedBoulderField';
import { usesFacetedBoulderSurface } from '../../world/facetedBoulders';
import { onPropEvent } from '../../physics/props/propEvents';

const TREE_MOTION = { wind: 0.62, bend: 0.28, bendRadius: 2.15 };
const TREE_CONTACT_BEND = {
  maxRadians: 0.085,
  stiffness: 46,
  damping: 11,
};

// Obstacles with a real vertical silhouette cast into the (small, throttled,
// player-following) shadow map; low scatter keeps contact shadows only.
// Authored specs can still force either way with an explicit castShadow.
function obstacleCastsShadow(obstacle) {
  if (obstacle.castShadow != null) return obstacle.castShadow === true;
  if (obstacle.kind === 'tree' || obstacle.kind === 'structure') return true;
  return (obstacle.colliderTop ?? 0) >= 0.85;
}

function BendableObstacleGLB({ obstacle, currentZoneId }) {
  const groupRef = useRef(null);
  const bendRef = useRef({
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    targetX: 0,
    targetZ: 0,
    lastContactAt: -10,
  });
  const position = useMemo(() => obstacleRenderPosition(obstacle), [obstacle]);
  const rotation = useMemo(() => [0, obstacle.yaw, 0], [obstacle.yaw]);
  const bendConfig = obstacle.bend || TREE_CONTACT_BEND;

  useEffect(() => onPropEvent('obstacle-push-contact', event => {
    if (event?.obstacleId !== obstacle.id) return;
    if ((event.zoneId || currentZoneId) !== currentZoneId) return;
    const direction = event.direction || {};
    const length = Math.hypot(direction.x || 0, direction.z || 0);
    if (length < 0.001) return;
    const maxRadians = bendConfig.maxRadians ?? TREE_CONTACT_BEND.maxRadians;
    const amount = THREE.MathUtils.clamp(event.intensity ?? 0.35, 0, 1) * maxRadians;
    const dx = (direction.x || 0) / length;
    const dz = (direction.z || 0) / length;
    const sin = Math.sin(-obstacle.yaw);
    const cos = Math.cos(-obstacle.yaw);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const bend = bendRef.current;
    bend.targetX = localZ * amount;
    bend.targetZ = -localX * amount;
    bend.lastContactAt = performance.now() / 1000;
  }), [bendConfig.maxRadians, currentZoneId, obstacle.id, obstacle.yaw]);

  useFrame((_, delta) => {
    const node = groupRef.current;
    if (!node) return;
    const bend = bendRef.current;
    const now = performance.now() / 1000;
    const targetX = now - bend.lastContactAt < 0.16 ? bend.targetX : 0;
    const targetZ = now - bend.lastContactAt < 0.16 ? bend.targetZ : 0;
    const dt = Math.min(delta || 0.016, 0.05);
    const stiffness = bendConfig.stiffness ?? TREE_CONTACT_BEND.stiffness;
    const damping = bendConfig.damping ?? TREE_CONTACT_BEND.damping;
    bend.vx += (targetX - bend.x) * stiffness * dt;
    bend.vz += (targetZ - bend.z) * stiffness * dt;
    const keep = Math.exp(-damping * dt);
    bend.vx *= keep;
    bend.vz *= keep;
    bend.x += bend.vx * dt;
    bend.z += bend.vz * dt;
    if (Math.abs(bend.x) + Math.abs(bend.z) + Math.abs(bend.vx) + Math.abs(bend.vz) < 0.0002) {
      bend.x = 0;
      bend.z = 0;
      bend.vx = 0;
      bend.vz = 0;
    }
    node.rotation.set(rotation[0] + bend.x, rotation[1], rotation[2] + bend.z);
  });

  return (
    <StaticGLB
      groupRef={groupRef}
      path={obstacle.path}
      position={position}
      rotation={rotation}
      scale={obstacle.scale}
      tint={obstacle.kind === 'tree' ? '#5d5142' : (obstacle.kind === 'structure' ? null : '#536056')}
      tintStrength={obstacle.kind === 'tree' ? 0.08 : (obstacle.kind === 'structure' ? 0 : 0.18)}
      castShadow={obstacleCastsShadow(obstacle)}
      receiveShadow={obstacle.receiveShadow === true}
      maxVisibleDistance={obstacle.maxVisibleDistance ?? 105}
      sourceId={`obstacle:${currentZoneId}:${obstacle.id}`}
      sourceLabel={obstacle.id}
      sourceKind={`obstacle-${obstacle.kind || 'prop'}`}
      motion={obstacle.kind === 'tree' ? TREE_MOTION : null}
      contactShadow={obstacle.contactShadow ?? ((obstacle.kind === 'tree' ? 1.1 : 0.85) * (typeof obstacle.scale === 'number' ? obstacle.scale : 1))}
    />
  );
}

function ObstacleProps() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const pushableObstacleOffsets = useThreeGameStore(state => state.pushableObstacleOffsets);
  const obstacles = useMemo(
    () => getRuntimeObstacles(currentZoneId, pushableObstacleOffsets),
    [currentZoneId, pushableObstacleOffsets],
  );
  const texturedBoulders = useMemo(
    () => obstacles.filter(usesFacetedBoulderSurface),
    [obstacles],
  );
  const otherObstacles = useMemo(() => obstacles.filter(obstacle => (
    obstacle.path && !usesFacetedBoulderSurface(obstacle)
  )), [obstacles]);
  return (
    <group>
      {otherObstacles.map(obstacle => (
        obstacle.bendable ? (
          <BendableObstacleGLB
            key={obstacle.id}
            obstacle={obstacle}
            currentZoneId={currentZoneId}
          />
        ) : (
          <StaticGLB
            key={obstacle.id}
            path={obstacle.path}
            position={obstacleRenderPosition(obstacle)}
            rotation={[0, obstacle.yaw, 0]}
            scale={obstacle.scale}
            tint={obstacle.kind === 'tree' ? '#5d5142' : (obstacle.kind === 'structure' ? null : '#536056')}
            tintStrength={obstacle.kind === 'tree' ? 0.08 : (obstacle.kind === 'structure' ? 0 : 0.18)}
            castShadow={obstacleCastsShadow(obstacle)}
            receiveShadow={obstacle.receiveShadow === true}
            maxVisibleDistance={obstacle.maxVisibleDistance ?? 105}
            sourceId={`obstacle:${currentZoneId}:${obstacle.id}`}
            sourceLabel={obstacle.id}
            sourceKind={`obstacle-${obstacle.kind || 'prop'}`}
            motion={obstacle.kind === 'tree' ? TREE_MOTION : null}
            contactShadow={obstacle.contactShadow ?? ((obstacle.kind === 'tree' ? 1.1 : 0.85) * (typeof obstacle.scale === 'number' ? obstacle.scale : 1))}
          />
        )
      ))}
      {texturedBoulders.length ? (
        <FacetedBoulderField obstacles={texturedBoulders} currentZoneId={currentZoneId} />
      ) : null}
    </group>
  );
}

export function WorldDetails({ settings = {}, contentPhase = 6 }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const transitionDestinationId = useThreeGameStore(state => state.transition?.zoneId || null);
  const preparingDestination = transitionDestinationId === currentZoneId;
  if (preparingDestination) readRegionEcologyResource(currentZoneId);
  const ecology = getEcology(currentZoneId);
  if (!ecology) return null;
  return (
    <group>
      {(!preparingDestination || contentPhase >= 5) && <ObstacleProps />}
      <EcologyRenderer
        ecology={ecology}
        settings={settings}
        preparationPhase={preparingDestination ? contentPhase : 6}
      />
    </group>
  );
}
