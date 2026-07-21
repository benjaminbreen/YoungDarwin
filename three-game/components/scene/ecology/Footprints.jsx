'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainBiomeAt, terrainSlopeAt } from '../../../world/terrain';
import { surfaceContactProfileForBiome } from '../../../world/surfaceContact';
import { resolveFootprintResponse } from '../../../world/surfaceContactResponse';
import { getRuntimeFootContacts, getRuntimePlayerPose } from '../../../store';

// Persistent soft-ground marks consume the same authoritative foot contacts as
// step VFX. The controller publishes a cadence contact when an animation blend
// does not provide a dependable skeletal plant.

const FOOTPRINT_COUNT = 72;
const UP = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const normal = new THREE.Vector3();
const basis = new THREE.Matrix4();
const color = new THREE.Color();

export function Footprints({ zoneId }) {
  const meshRef = useRef(null);
  const state = useRef({ cursor: 0, lastStepId: getRuntimeFootContacts().lastStep?.id || 0 });

  const data = useMemo(() => {
    // Darwin's model is life-sized; the previous 16 x 32 cm mark read like a
    // narrow shoe at the gameplay camera distance rather than a period boot.
    const geometry = new THREE.PlaneGeometry(0.18, 0.37);
    geometry.rotateX(-Math.PI / 2);
    const births = new Float32Array(FOOTPRINT_COUNT).fill(-1000);
    const lifes = new Float32Array(FOOTPRINT_COUNT).fill(1);
    const opacities = new Float32Array(FOOTPRINT_COUNT).fill(0);
    const sides = new Float32Array(FOOTPRINT_COUNT).fill(1);
    const colors = new Float32Array(FOOTPRINT_COUNT * 3);
    geometry.setAttribute('aBirth', new THREE.InstancedBufferAttribute(births, 1));
    geometry.setAttribute('aLife', new THREE.InstancedBufferAttribute(lifes, 1));
    geometry.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(opacities, 1));
    geometry.setAttribute('aSide', new THREE.InstancedBufferAttribute(sides, 1));
    geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 3));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float aBirth;
        attribute float aLife;
        attribute float aOpacity;
        attribute float aSide;
        attribute vec3 instanceColor;
        uniform float uTime;
        varying vec2 vUv;
        varying float vFade;
        varying float vOpacity;
        varying float vSide;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          vFade = clamp(1.0 - (uTime - aBirth) / max(aLife, 0.001), 0.0, 1.0);
          vOpacity = aOpacity;
          vSide = aSide;
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        varying float vFade;
        varying float vOpacity;
        varying float vSide;
        varying vec3 vColor;
        void main() {
          vec2 p = vUv;
          if (vSide < 0.0) p.x = 1.0 - p.x;
          float toe = 1.0 - smoothstep(0.3, 0.52, length((p - vec2(0.52, 0.73)) * vec2(1.65, 2.5)));
          float forefoot = 1.0 - smoothstep(0.29, 0.5, length((p - vec2(0.49, 0.57)) * vec2(1.9, 2.3)));
          float heel = 1.0 - smoothstep(0.27, 0.48, length((p - vec2(0.46, 0.25)) * vec2(2.25, 2.55)));
          float sole = max(toe, max(forefoot, heel));
          float centerGroove = 1.0 - smoothstep(0.025, 0.07, abs(p.x - 0.5));
          float crossTread = 1.0 - smoothstep(0.08, 0.18, abs(fract(p.y * 7.0) - 0.5));
          float tread = clamp(centerGroove * 0.28 + crossTread * 0.34, 0.0, 0.48);
          float a = sole * (0.7 + tread) * vFade * vOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    return { geometry, material, births, lifes, opacities, sides, colors };
  }, []);

  useEffect(() => () => {
    data.geometry.dispose();
    data.material.dispose();
  }, [data]);

  useEffect(() => {
    state.current.cursor = 0;
    state.current.lastStepId = getRuntimeFootContacts().lastStep?.id || 0;
    data.births.fill(-1000);
    data.geometry.attributes.aBirth.needsUpdate = true;
  }, [data, zoneId]);

  useFrame(({ clock }) => {
    data.material.uniforms.uTime.value = clock.elapsedTime;
    const mesh = meshRef.current;
    if (!mesh) return;
    const s = state.current;
    const step = getRuntimeFootContacts().lastStep;
    if (!step || step.id <= s.lastStepId) return;
    s.lastStepId = step.id;
    if (step.groundSource === 'authored-obstacle') return;

    const biome = terrainBiomeAt(step.x, step.z, step.y, zoneId);
    const response = resolveFootprintResponse(surfaceContactProfileForBiome(biome), step.intensity);
    if (!response.visible) return;

    const pose = getRuntimePlayerPose();
    const facing = pose.facing || { x: 0, z: -1 };
    normal.copy(terrainSlopeAt(step.x, step.z, zoneId, 0.22).normal || UP).normalize();
    forward.set(
      Number.isFinite(facing.x) ? facing.x : 0,
      0,
      Number.isFinite(facing.z) ? facing.z : -1,
    ).addScaledVector(
      normal,
      -forward.dot(normal),
    );
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize().applyAxisAngle(normal, step.side === 'left' ? -0.045 : 0.045);
    right.crossVectors(normal, forward).normalize();
    forward.crossVectors(right, normal).normalize();
    basis.makeBasis(right, normal, forward);

    const index = s.cursor;
    dummy.position.set(step.x, step.y + 0.003, step.z);
    dummy.quaternion.setFromRotationMatrix(basis);
    dummy.scale.set(response.widthScale, 1, response.lengthScale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    data.births[index] = clock.elapsedTime;
    data.lifes[index] = response.lifetime;
    data.opacities[index] = response.opacity;
    data.sides[index] = step.side === 'left' ? -1 : 1;
    color.set(response.color);
    data.colors[index * 3] = color.r;
    data.colors[index * 3 + 1] = color.g;
    data.colors[index * 3 + 2] = color.b;
    data.geometry.attributes.aBirth.needsUpdate = true;
    data.geometry.attributes.aLife.needsUpdate = true;
    data.geometry.attributes.aOpacity.needsUpdate = true;
    data.geometry.attributes.aSide.needsUpdate = true;
    data.geometry.attributes.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    s.cursor = (index + 1) % FOOTPRINT_COUNT;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[data.geometry, data.material, FOOTPRINT_COUNT]}
      frustumCulled={false}
      renderOrder={1}
      userData={{ noReflect: true }}
    />
  );
}
