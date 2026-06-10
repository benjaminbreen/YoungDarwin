'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainHeight, terrainBiomeAt } from '../../../world/terrain';
import { useThreeGameStore } from '../../../store';

// A ring buffer of fading footprint decals stamped under the player's stride
// on soft ground. One instanced draw call; prints fade over ~42 seconds.

const FOOTPRINT_COUNT = 72;
const dummy = new THREE.Object3D();

export function Footprints({ zoneId, biomes }) {
  const meshRef = useRef(null);
  const state = useRef({ lastX: null, lastZ: null, side: 1, cursor: 0 });
  const biomeSet = useMemo(() => new Set(biomes), [biomes]);

  const { geometry, material, births } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.15, 0.3);
    geo.rotateX(-Math.PI / 2);
    const birthArray = new Float32Array(FOOTPRINT_COUNT).fill(-1000);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birthArray, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float aBirth;
        uniform float uTime;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vUv = uv;
          vFade = clamp(1.0 - (uTime - aBirth) / 42.0, 0.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vec2 c = vUv - 0.5;
          float oval = smoothstep(0.5, 0.18, length(c * vec2(2.4, 1.15)));
          float heel = smoothstep(0.32, 0.1, length((vUv - vec2(0.5, 0.28)) * vec2(2.6, 1.9)));
          float a = max(oval * 0.8, heel) * vFade * 0.34;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.08, 0.07, 0.06), a);
        }
      `,
    });
    return { geometry: geo, material: mat, births: birthArray };
  }, []);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    const mesh = meshRef.current;
    if (!mesh) return;
    const pose = useThreeGameStore.getState().playerPose;
    const { x, z } = pose.position || {};
    if (x === undefined) return;
    const s = state.current;
    if (s.lastX === null) { s.lastX = x; s.lastZ = z; return; }
    if (Math.hypot(x - s.lastX, z - s.lastZ) < 0.78) return;
    s.lastX = x;
    s.lastZ = z;
    if (!biomeSet.has(terrainBiomeAt(x, z, undefined, zoneId))) return;
    const facing = pose.facing || { x: 0, z: -1 };
    const yaw = Math.atan2(facing.x, facing.z);
    s.side *= -1;
    const px = x + Math.cos(yaw) * 0.09 * s.side;
    const pz = z - Math.sin(yaw) * 0.09 * s.side;
    dummy.position.set(px, terrainHeight(px, pz, zoneId) + 0.015, pz);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(s.cursor, dummy.matrix);
    births[s.cursor] = clock.elapsedTime;
    geometry.attributes.aBirth.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    s.cursor = (s.cursor + 1) % FOOTPRINT_COUNT;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, FOOTPRINT_COUNT]}
      frustumCulled={false}
      renderOrder={1}
      userData={{ noReflect: true }}
    />
  );
}
