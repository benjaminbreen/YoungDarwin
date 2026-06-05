'use client';

import React, { useMemo } from 'react';
import { BallCollider, CapsuleCollider, ConvexHullCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useThreeGameStore } from '../store';
import { getRuntimeObstacles, obstacleBaseY } from '../world/obstacles';

function colliderOffset(shape, scale) {
  const [x = 0, y = 0, z = 0] = shape.offset || [0, 0, 0];
  return [x * scale, y * scale, z * scale];
}

function PhysicsColliderShape({ shape, scale = 1 }) {
  const position = colliderOffset(shape, scale);
  if (shape.type === 'convex') {
    const yMin = (shape.yMin ?? 0) * scale;
    const yMax = (shape.yMax ?? shape.height) * scale;
    const vertices = [];
    for (const [x, z] of shape.points) vertices.push(x * scale, yMin, z * scale);
    for (const [x, z] of shape.points) vertices.push(x * scale, yMax, z * scale);
    return <ConvexHullCollider args={[new Float32Array(vertices)]} position={position} />;
  }
  if (shape.type === 'box') {
    return <CuboidCollider args={shape.size.map(value => (value * scale) / 2)} position={position} />;
  }
  if (shape.type === 'ball') {
    return <BallCollider args={[shape.radius * scale]} position={position} />;
  }
  if (shape.type === 'capsule') {
    return <CapsuleCollider args={[((shape.height || 1) * scale) / 2, shape.radius * scale]} position={position} />;
  }
  return <CylinderCollider args={[((shape.height || 1) * scale) / 2, shape.radius * scale]} position={position} />;
}

function PhysicsColliderDefinition({ collider, scale }) {
  if (collider.type === 'compound') {
    return collider.shapes.map((shape, index) => (
      <PhysicsColliderShape key={`${shape.type}-${index}`} shape={shape} scale={scale} />
    ));
  }
  return <PhysicsColliderShape shape={collider} scale={scale} />;
}

function ObstacleCollider({ obstacle }) {
  const collider = obstacle.definition.collider;
  const baseY = obstacleBaseY(obstacle);

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[obstacle.x, baseY, obstacle.z]}
      rotation={[0, obstacle.yaw, 0]}
      userData={{ id: obstacle.id, kind: obstacle.kind }}
    >
      <PhysicsColliderDefinition collider={collider} scale={obstacle.scale} />
    </RigidBody>
  );
}

export function PhysicsObstacles() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const obstacles = useMemo(() => getRuntimeObstacles(currentZoneId), [currentZoneId]);

  return (
    <>
      {obstacles.map(obstacle => (
        <ObstacleCollider key={obstacle.id} obstacle={obstacle} />
      ))}
    </>
  );
}
