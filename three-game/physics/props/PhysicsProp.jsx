'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody, useRapier } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { movementTerrainHeight, isWalkableTerrain } from '../../world/terrain';
import { onPropEvent } from './propEvents';
import { PropVisual, HighlightRing } from './PropVisuals';

const PICKUP_DISTANCE = 2.15;
const HOLD_DISTANCE = 1.12;
const STRIKE_RANGE = 2.6;
const STRIKE_FACING_DOT = 0.3;

function vectorFromStore(value, fallback = new THREE.Vector3()) {
  if (!value) return fallback.clone();
  return new THREE.Vector3(value.x || 0, value.y || 0, value.z || 0);
}

function PropCollider({ prop, colliderRef }) {
  const { shape } = prop.collider;
  const common = { ref: colliderRef, friction: prop.friction, restitution: prop.restitution };
  if (shape === 'cuboid') return <CuboidCollider {...common} args={prop.collider.halfExtents} />;
  if (shape === 'ball') return <BallCollider {...common} args={[prop.collider.radius]} />;
  return <CylinderCollider {...common} args={[prop.collider.halfHeight, prop.collider.radius]} />;
}

// A single dynamic physics prop. Behaviors (carryable / breakable /
// strikeable) come from the prop's type config; see propTypes.js.
export function PhysicsProp({ prop, onBreak }) {
  const bodyRef = useRef(null);
  const colliderRef = useRef(null);
  const carriedRef = useRef(false);
  const pendingStrikesRef = useRef([]);
  const clockRef = useRef(0);
  const { rapier } = useRapier();
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const carriedObjectId = useThreeGameStore(state => state.carriedObjectId);
  const carryPrompt = useThreeGameStore(state => state.carryPrompt);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);

  const spawnY = useMemo(
    () => movementTerrainHeight(prop.x, prop.z, currentZoneId) + prop.restOffset + 0.05,
    [currentZoneId, prop],
  );
  const isPrompted = carryPrompt?.id === prop.id;
  const isCarried = carriedObjectId === prop.id;
  const breakable = prop.behaviors?.breakable;
  const strikeable = prop.behaviors?.strikeable;
  const carryable = prop.behaviors?.carryable;

  // Queue tool swings; the hit lands impactDelay seconds into the animation.
  useEffect(() => {
    if (!breakable && !strikeable) return undefined;
    return onPropEvent('tool-swing', event => {
      const responds = (breakable && event.tool === breakable.tool)
        || (strikeable && event.tool === strikeable.tool);
      if (!responds) return;
      pendingStrikesRef.current.push({ ...event, at: clockRef.current + (event.impactDelay ?? 0.55) });
    });
  }, [breakable, strikeable]);

  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.id === prop.id) setCarryPrompt(null);
  }, [prop.id, setCarryPrompt]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    clockRef.current += delta;

    const translation = body.translation();
    const propPosition = new THREE.Vector3(translation.x, translation.y, translation.z);

    // Resolve queued tool strikes once their impact moment arrives.
    if (pendingStrikesRef.current.length) {
      const due = pendingStrikesRef.current.filter(s => s.at <= clockRef.current);
      if (due.length) {
        pendingStrikesRef.current = pendingStrikesRef.current.filter(s => s.at > clockRef.current);
        for (const strike of due) {
          const origin = vectorFromStore(strike.position);
          const facing = vectorFromStore(strike.facing, new THREE.Vector3(0, 0, -1)).setY(0).normalize();
          const toProp = propPosition.clone().sub(origin).setY(0);
          const distance = toProp.length();
          if (distance > STRIKE_RANGE) continue;
          if (distance > 0.2 && toProp.clone().normalize().dot(facing) < STRIKE_FACING_DOT) continue;
          const impactDir = distance > 0.2 ? toProp.normalize() : facing;
          if (breakable && strike.tool === breakable.tool) {
            onBreak?.(prop, {
              position: { x: translation.x, y: translation.y, z: translation.z },
              impactDir: { x: impactDir.x, y: 0, z: impactDir.z },
            });
            return;
          }
          if (strikeable && strike.tool === strikeable.tool) {
            body.wakeUp();
            body.applyImpulse({
              x: impactDir.x * strikeable.impulse,
              y: strikeable.impulse * 0.22,
              z: impactDir.z * strikeable.impulse,
            }, true);
          }
        }
      }
    }

    const playerPose = useThreeGameStore.getState().playerPose;
    const player = vectorFromStore(playerPose.position);
    const facing = vectorFromStore(playerPose.facing, new THREE.Vector3(0, 0, -1));
    if (facing.lengthSq() < 0.001) facing.set(0, 0, -1);
    facing.normalize();

    if (carryable) {
      const carried = useThreeGameStore.getState().carriedObjectId === prop.id;
      if (carried !== carriedRef.current) {
        carriedRef.current = carried;
        if (carried) {
          colliderRef.current?.setSensor(true);
          body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        } else {
          colliderRef.current?.setSensor(false);
          body.setBodyType(rapier.RigidBodyType.Dynamic, true);
          body.setLinvel({ x: facing.x * carryable.release, y: 0.02, z: facing.z * carryable.release }, true);
          body.setAngvel({ x: facing.z * -carryable.release * 1.8, y: 0, z: facing.x * carryable.release * 1.8 }, true);
        }
      }

      if (carried) {
        const target = player.clone().addScaledVector(facing, HOLD_DISTANCE);
        target.y += carryable.holdHeight;
        body.setNextKinematicTranslation(target);
        setCarryPrompt({
          id: prop.id,
          label: prop.label,
          mode: 'drop',
          distance: 0,
          text: `Press E to drop ${prop.label}`,
        });
        return;
      }

      const distance = propPosition.distanceTo(player);
      const activePrompt = useThreeGameStore.getState().carryPrompt;
      if (!activePrompt || activePrompt.id === prop.id || distance < (activePrompt.distance ?? Infinity)) {
        if (distance <= PICKUP_DISTANCE) {
          setCarryPrompt({
            id: prop.id,
            label: prop.label,
            mode: 'pickup',
            distance,
            text: `Press E to pick up ${prop.label}`,
          });
        } else if (activePrompt?.id === prop.id) {
          setCarryPrompt(null);
        }
      }
    }

    // Fail-safe only: respawn props that escape the world. Normal resting
    // contact is left entirely to rapier — no per-frame snapping.
    const groundY = movementTerrainHeight(translation.x, translation.z, currentZoneId);
    if (!isWalkableTerrain(translation.x, translation.z, currentZoneId) || translation.y < groundY - 6) {
      body.setTranslation({ x: prop.x, y: spawnY, z: prop.z }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={[prop.x, spawnY, prop.z]}
      rotation={prop.rotation}
      linearDamping={prop.linearDamping}
      angularDamping={prop.angularDamping}
      mass={prop.mass}
      canSleep
      ccd
      additionalSolverIterations={4}
      userData={{ id: prop.id, kind: `physics-${prop.type}` }}
    >
      <PropCollider prop={prop} colliderRef={colliderRef} />
      <PropVisual visual={prop.visual} />
      <HighlightRing visible={isPrompted || isCarried} />
    </RigidBody>
  );
}
