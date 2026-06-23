'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { onPropEvent } from './propEvents';

const IMPACT_LIFETIME = 0.72;
const FLASH_LIFETIME = 0.22;

function normalizeImpactDir(dir) {
  const x = dir?.x || 0;
  const z = dir?.z || -1;
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

function makeParticles(seedKey, impactDir, count) {
  const dir = normalizeImpactDir(impactDir);
  const side = { x: -dir.z, z: dir.x };
  return Array.from({ length: count }, (_, index) => {
    const n = Math.sin((index + 1) * 12.9898 + String(seedKey).length * 78.233) * 43758.5453;
    const r = n - Math.floor(n);
    const a = (index / Math.max(1, count)) * Math.PI * 2 + r * 0.8;
    const scatter = 0.26 + r * 0.58;
    return {
      x: dir.x * (0.42 + r * 0.72) + side.x * Math.cos(a) * scatter,
      y: 0.24 + ((index * 37) % 100) / 100 * 0.72,
      z: dir.z * (0.42 + r * 0.72) + side.z * Math.sin(a) * scatter,
    };
  });
}

function HammerImpactBurst({ event, onExpired }) {
  const ageRef = useRef(0);
  const flashRef = useRef(null);
  const dir = useMemo(() => normalizeImpactDir(event.impactDir), [event.impactDir]);
  const dust = useMemo(() => makeParticles(event.id, dir, event.dustCount || 18), [dir, event.dustCount, event.id]);
  const sparks = useMemo(() => makeParticles(`${event.id}:sparks`, dir, event.sparkCount || 4), [dir, event.id, event.sparkCount]);
  const dustMaterial = useMemo(() => new THREE.PointsMaterial({
    color: event.dustColor || '#8f7352',
    size: 0.11,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  }), [event.dustColor]);
  const sparkMaterial = useMemo(() => new THREE.LineBasicMaterial({
    color: event.sparkColor || '#ffd36a',
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [event.sparkColor]);
  const flashMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: event.sparkColor || '#ffd36a',
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [event.sparkColor]);
  const dustGeometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dust.length * 3), 3));
    return buffer;
  }, [dust.length]);
  const sparkGeometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sparks.length * 2 * 3), 3));
    return buffer;
  }, [sparks.length]);

  useEffect(() => () => {
    dustGeometry.dispose();
    sparkGeometry.dispose();
    dustMaterial.dispose();
    sparkMaterial.dispose();
    flashMaterial.dispose();
  }, [dustGeometry, dustMaterial, flashMaterial, sparkGeometry, sparkMaterial]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const age = ageRef.current;
    if (age >= IMPACT_LIFETIME) {
      onExpired(event.id);
      return;
    }
    const dustPositions = dustGeometry.attributes.position;
    dust.forEach((velocity, index) => {
      dustPositions.setXYZ(
        index,
        event.position.x + velocity.x * age,
        event.position.y + 0.05 + velocity.y * age - 1.1 * age * age,
        event.position.z + velocity.z * age,
      );
    });
    dustPositions.needsUpdate = true;
    dustMaterial.opacity = 0.58 * Math.pow(1 - age / IMPACT_LIFETIME, 1.35);

    const sparkPositions = sparkGeometry.attributes.position;
    sparks.forEach((velocity, index) => {
      const base = index * 2;
      const leadAge = age;
      const tailAge = Math.max(0, age - 0.075);
      sparkPositions.setXYZ(
        base,
        event.position.x + velocity.x * leadAge,
        event.position.y + 0.08 + velocity.y * leadAge - 2.9 * leadAge * leadAge,
        event.position.z + velocity.z * leadAge,
      );
      sparkPositions.setXYZ(
        base + 1,
        event.position.x + velocity.x * tailAge,
        event.position.y + 0.08 + velocity.y * tailAge - 2.9 * tailAge * tailAge,
        event.position.z + velocity.z * tailAge,
      );
    });
    sparkPositions.needsUpdate = true;
    sparkMaterial.opacity = Math.pow(1 - age / IMPACT_LIFETIME, 2.1);

    const flashT = THREE.MathUtils.clamp(age / FLASH_LIFETIME, 0, 1);
    if (flashRef.current) {
      flashRef.current.visible = flashT < 1;
      flashRef.current.scale.setScalar(0.18 + flashT * 0.62);
    }
    flashMaterial.opacity = 0.9 * Math.pow(1 - flashT, 2.4);
  });

  const yaw = Math.atan2(dir.x, dir.z);
  const x = event.position.x + dir.x * 0.08;
  const y = event.position.y + 0.08;
  const z = event.position.z + dir.z * 0.08;
  return (
    <group>
      <group ref={flashRef} position={[x, y, z]} rotation={[0, yaw, 0]} renderOrder={4}>
        <mesh material={flashMaterial} scale={[0.5, 0.5, 1]}>
          <circleGeometry args={[1, 20]} />
        </mesh>
      </group>
      <points geometry={dustGeometry} material={dustMaterial} />
      {Boolean(sparks.length) && <lineSegments geometry={sparkGeometry} material={sparkMaterial} />}
    </group>
  );
}

export function HammerImpactFX() {
  const [events, setEvents] = useState([]);
  useEffect(() => onPropEvent('prop-struck', event => {
    setEvents(current => [...current, {
      id: `${event.propId || 'prop'}:${performance.now().toFixed(1)}:${current.length}`,
      dustCount: 18,
      sparkCount: event.sparkCount ?? 4,
      dustColor: event.dustColor || '#8f7352',
      sparkColor: event.sparkColor || '#ffd36a',
      ...event,
    }]);
  }), []);
  const expire = id => setEvents(current => current.filter(event => event.id !== id));
  return (
    <group userData={{ renderSource: 'hammer-impact-fx', renderLabel: 'Hammer impact FX', renderKind: 'transient-fx' }}>
      {events.map(event => (
        <HammerImpactBurst key={event.id} event={event} onExpired={expire} />
      ))}
    </group>
  );
}
