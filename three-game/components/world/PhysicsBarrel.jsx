'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody, useRapier } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { terrainHeight, isWalkableTerrain } from '../../world/terrain';

const PICKUP_DISTANCE = 2.15;
const HOLD_DISTANCE = 1.12;

const PROPS = [
  {
    id: 'post-office-rollable-barrel',
    label: 'barrel',
    kind: 'barrel',
    x: -2.4,
    z: -3.6,
    restOffset: 0.52,
    rotation: [0, 0, Math.PI / 2],
    mass: 7,
    radius: 0.48,
    halfLength: 0.45,
    release: 0.38,
  },
  {
    id: 'shore-supply-crate',
    label: 'crate',
    kind: 'crate',
    x: -4.4,
    z: -3.1,
    restOffset: 0.44,
    rotation: [0.08, 0.35, 0],
    mass: 10,
    halfExtents: [0.48, 0.42, 0.48],
    release: 0.22,
  },
  {
    id: 'loose-basalt-stone',
    label: 'loose stone',
    kind: 'stone',
    x: -0.9,
    z: -5.5,
    restOffset: 0.34,
    rotation: [0.2, -0.5, 0.12],
    mass: 4,
    radius: 0.34,
    release: 0.48,
  },
];

function vectorFromStore(value, fallback = new THREE.Vector3()) {
  if (!value) return fallback.clone();
  return new THREE.Vector3(value.x || 0, value.y || 0, value.z || 0);
}

function BarrelVisual() {
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a5a31', roughness: 0.86, metalness: 0.02 }), []);
  const band = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2c2a25', roughness: 0.72, metalness: 0.18 }), []);
  const end = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6f4325', roughness: 0.9, metalness: 0.01 }), []);

  useEffect(() => () => {
    wood.dispose();
    band.dispose();
    end.dispose();
  }, [band, end, wood]);

  return (
    <group>
      <mesh castShadow receiveShadow material={wood}>
        <cylinderGeometry args={[0.48, 0.48, 0.9, 14, 1]} />
      </mesh>
      {[-0.34, 0, 0.34].map(y => (
        <mesh key={y} castShadow receiveShadow position={[0, y, 0]} material={band}>
          <cylinderGeometry args={[0.505, 0.505, 0.055, 14, 1, true]} />
        </mesh>
      ))}
      {[-0.47, 0.47].map(y => (
        <mesh key={y} castShadow receiveShadow position={[0, y, 0]} material={end}>
          <cylinderGeometry args={[0.43, 0.43, 0.035, 14]} />
        </mesh>
      ))}
    </group>
  );
}

function CrateVisual() {
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7c5632', roughness: 0.88, metalness: 0.01 }), []);
  const slat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4e3420', roughness: 0.9, metalness: 0.01 }), []);

  useEffect(() => () => {
    wood.dispose();
    slat.dispose();
  }, [slat, wood]);

  return (
    <group>
      <mesh castShadow receiveShadow material={wood}>
        <boxGeometry args={[0.96, 0.84, 0.96]} />
      </mesh>
      {[[-0.51, 0, 0], [0.51, 0, 0], [0, 0, -0.51], [0, 0, 0.51]].map(([x, y, z], index) => (
        <mesh key={index} castShadow receiveShadow position={[x, y, z]} material={slat}>
          <boxGeometry args={x ? [0.055, 0.92, 1.04] : [1.04, 0.92, 0.055]} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 0.47, 0]} material={slat}>
        <boxGeometry args={[1.06, 0.055, 1.06]} />
      </mesh>
    </group>
  );
}

function StoneVisual() {
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#31332d',
    roughness: 0.93,
    metalness: 0.02,
    flatShading: true,
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh castShadow receiveShadow material={material} scale={[1.12, 0.78, 0.95]}>
      <dodecahedronGeometry args={[0.42, 0]} />
    </mesh>
  );
}

function PropVisual({ kind }) {
  if (kind === 'crate') return <CrateVisual />;
  if (kind === 'stone') return <StoneVisual />;
  return <BarrelVisual />;
}

function PropCollider({ prop, colliderRef }) {
  if (prop.kind === 'crate') {
    return <CuboidCollider ref={colliderRef} args={prop.halfExtents} friction={1.15} restitution={0.04} />;
  }
  if (prop.kind === 'stone') {
    return <BallCollider ref={colliderRef} args={[prop.radius]} friction={1.08} restitution={0.08} />;
  }
  return <CylinderCollider ref={colliderRef} args={[prop.halfLength, prop.radius]} friction={1.18} restitution={0.06} />;
}

function HighlightRing({ visible }) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#f8df8a',
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  }), []);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh visible={visible} position={[0, -0.44, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={6}>
      <ringGeometry args={[0.72, 0.88, 48]} />
    </mesh>
  );
}

function PhysicsCarryProp({ prop }) {
  const bodyRef = useRef(null);
  const colliderRef = useRef(null);
  const carriedRef = useRef(false);
  const { rapier } = useRapier();
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const carriedObjectId = useThreeGameStore(state => state.carriedObjectId);
  const carryPrompt = useThreeGameStore(state => state.carryPrompt);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);

  const initialY = useMemo(() => terrainHeight(prop.x, prop.z, currentZoneId) + prop.restOffset, [currentZoneId, prop]);
  const isPrompted = carryPrompt?.id === prop.id;
  const isCarried = carriedObjectId === prop.id;

  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.id === prop.id) setCarryPrompt(null);
  }, [prop.id, setCarryPrompt]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body || currentZoneId !== 'POST_OFFICE_BAY') return;

    const playerPose = useThreeGameStore.getState().playerPose;
    const player = vectorFromStore(playerPose.position);
    const facing = vectorFromStore(playerPose.facing, new THREE.Vector3(0, 0, -1));
    if (facing.lengthSq() < 0.001) facing.set(0, 0, -1);
    facing.normalize();

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
        body.setLinvel({ x: facing.x * prop.release, y: 0.02, z: facing.z * prop.release }, true);
        body.setAngvel({ x: facing.z * -prop.release * 1.8, y: 0, z: facing.x * prop.release * 1.8 }, true);
      }
    }

    if (carried) {
      const target = player.clone().addScaledVector(facing, HOLD_DISTANCE);
      target.y += prop.kind === 'crate' ? 0.95 : 1.02;
      body.setTranslation(target, true);
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

    const translation = body.translation();
    const propPosition = new THREE.Vector3(translation.x, translation.y, translation.z);
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

    const groundY = terrainHeight(translation.x, translation.z, currentZoneId);
    if (!isWalkableTerrain(translation.x, translation.z, currentZoneId) || translation.y < groundY - 3) {
      const reset = { x: prop.x, y: initialY, z: prop.z };
      body.setTranslation(reset, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    const radius = prop.radius || Math.max(...(prop.halfExtents || [0.42]));
    const linvel = body.linvel();
    if (translation.y < groundY + radius * 0.28) {
      body.setTranslation({ x: translation.x, y: groundY + radius + 0.025, z: translation.z }, true);
      body.setLinvel({ x: linvel.x * 0.42, y: Math.max(0, linvel.y) * 0.1, z: linvel.z * 0.42 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    const angvel = body.angvel();
    const horizontalSpeedSq = linvel.x * linvel.x + linvel.z * linvel.z;
    const angularSpeedSq = angvel.x * angvel.x + angvel.y * angvel.y + angvel.z * angvel.z;
    if (Math.abs(linvel.y) < 0.08 && horizontalSpeedSq < 0.0025 && angularSpeedSq < 0.0064) {
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      body.sleep?.();
      return;
    }

    const damp = Math.max(0, 1 - delta * (prop.kind === 'barrel' ? 0.32 : 0.52));
    body.setLinvel({ x: linvel.x * damp, y: linvel.y, z: linvel.z * damp }, false);
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={[prop.x, initialY, prop.z]}
      rotation={prop.rotation}
      linearDamping={prop.kind === 'barrel' ? 0.72 : 0.92}
      angularDamping={prop.kind === 'barrel' ? 0.62 : 0.88}
      restitution={0.08}
      friction={0.95}
      mass={prop.mass}
      canSleep
      ccd
      additionalSolverIterations={8}
      userData={{ id: prop.id, kind: `physics-${prop.kind}` }}
    >
      <PropCollider prop={prop} colliderRef={colliderRef} />
      <PropVisual kind={prop.kind} />
      <HighlightRing visible={isPrompted || isCarried} />
    </RigidBody>
  );
}

export function PhysicsBarrel() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const setCarriedObject = useThreeGameStore(state => state.setCarriedObject);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const keyDownRef = useRef(false);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.code !== 'KeyE') return;
      if (keyDownRef.current) return;
      const state = useThreeGameStore.getState();
      const prompt = state.carryPrompt;
      if (!prompt) return;
      event.preventDefault();
      keyDownRef.current = true;
      if (state.carriedObjectId) {
        setCarriedObject(null);
        return;
      }
      if (prompt.mode === 'pickup') {
        setCarriedObject(prompt.id);
      }
    };
    const onKeyUp = event => {
      if (event.code !== 'KeyE') return;
      keyDownRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [setCarriedObject]);

  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt) setCarryPrompt(null);
    if (state.carriedObjectId) setCarriedObject(null);
  }, [setCarriedObject, setCarryPrompt]);

  if (currentZoneId !== 'POST_OFFICE_BAY') return null;

  return (
    <group>
      {PROPS.map(prop => <PhysicsCarryProp key={prop.id} prop={prop} />)}
    </group>
  );
}
