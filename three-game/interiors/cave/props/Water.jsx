'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Still water in the cave: the spring pool and the rain cask. Drips fall from
// the roof on fixed rhythms; each one lands as a ring on the surface. The
// rings and the falling drops share one clock, so they line up.

const MAX_DRIPS = 8;
const GRAVITY = 9.81;

function dripState(drip, time) {
  const fall = Math.sqrt((2 * Math.max(0.05, drip.top - drip.bottom)) / GRAVITY);
  const cycle = drip.period;
  const local = (time + drip.offset * cycle) % cycle;
  // Hang and swell at the roof, then fall.
  const hang = cycle - fall;
  if (local < hang) return { y: drip.top, swell: local / hang, falling: false, landed: (local + fall) };
  const t = local - hang;
  return { y: drip.top - 0.5 * GRAVITY * t * t, swell: 1, falling: true, landed: cycle - local };
}

function createWaterMaterial({ color, opacity, drips }) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.04,
    metalness: 0.0,
    transparent: true,
    opacity,
    depthWrite: false,
    envMapIntensity: 1.4,
  });
  material.name = 'CaveWater';
  const uniforms = {
    uWaterTime: { value: 0 },
    uDrips: { value: Array.from({ length: MAX_DRIPS }, () => new THREE.Vector4(0, 0, 999, 0)) },
  };
  material.userData.waterUniforms = uniforms;
  material.userData.drips = drips;
  material.customProgramCacheKey = () => 'cave-water-v1';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWaterWorld;
        uniform float uWaterTime;
        uniform vec4 uDrips[${MAX_DRIPS}];`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Rings spreading from each landed drip, plus a faint shiver.
          vec2 slope = vec2(
            sin(vWaterWorld.x * 7.0 + uWaterTime * 0.9) * 0.004,
            sin(vWaterWorld.z * 6.0 - uWaterTime * 0.7) * 0.004
          );
          for (int i = 0; i < ${MAX_DRIPS}; i++) {
            vec4 drip = uDrips[i];
            float age = drip.z;
            if (age > 3.0) continue;
            vec2 d = vWaterWorld.xz - drip.xy;
            float r = length(d);
            float front = age * 0.42;
            float wave = sin((r - front) * 38.0) * exp(-abs(r - front) * 14.0) * exp(-age * 1.4) * drip.w;
            slope += (d / max(r, 0.001)) * wave * 0.22;
          }
          vec3 waterNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
          normal = normalize((viewMatrix * vec4(waterNormal, 0.0)).xyz);
        }`,
      );
  };
  return material;
}

export function useWaterMaterial({ color = '#16211f', opacity = 0.72, drips = [] } = {}) {
  const material = useMemo(() => createWaterMaterial({ color, opacity, drips }), [color, drips, opacity]);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

// A water surface clipped to a plan outline, at height `y`.
export function WaterSurface({ outline, y, material, grow = 0.25, name = 'CaveWaterSurface' }) {
  const geometry = useMemo(() => {
    const cx = outline.reduce((sum, p) => sum + p[0], 0) / outline.length;
    const cz = outline.reduce((sum, p) => sum + p[1], 0) / outline.length;
    const shape = new THREE.Shape();
    outline.forEach(([x, z], i) => {
      const dx = x - cx;
      const dz = z - cz;
      const length = Math.hypot(dx, dz) || 1;
      // Grow the outline so the surface tucks under the rock rim.
      const px = x + (dx / length) * grow;
      const pz = z + (dz / length) * grow;
      // Shape lies in XY; rotating -90° about X maps shape y to world -z.
      if (i === 0) shape.moveTo(px, -pz);
      else shape.lineTo(px, -pz);
    });
    const shapeGeometry = new THREE.ShapeGeometry(shape, 12);
    shapeGeometry.rotateX(-Math.PI / 2);
    shapeGeometry.translate(0, y, 0);
    return shapeGeometry;
  }, [grow, outline, y]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name={name} geometry={geometry} material={material} receiveShadow renderOrder={2} userData={{ noBatch: true }} />;
}

// Falling drops, drawn as one instanced mesh, driving the water's rings.
export function Drips({ drips, waterMaterials = [] }) {
  const meshRef = useRef(null);
  const geometry = useMemo(() => {
    const sphere = new THREE.SphereGeometry(1, 8, 6);
    sphere.scale(0.012, 0.02, 0.012);
    return sphere;
  }, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c8d6d4', roughness: 0.05, transparent: true, opacity: 0.75, name: 'CaveDrip' }), []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = clock.elapsedTime;
    drips.forEach((drip, i) => {
      const state = dripState(drip, time);
      position.set(drip.x, state.y - (state.falling ? 0 : 0.01), drip.z);
      const s = state.falling ? 1 : 0.4 + state.swell * 0.6;
      scale.set(s, state.falling ? 1.6 : s, s);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    for (const water of waterMaterials) {
      if (!water) continue;
      const uniforms = water.userData.waterUniforms;
      uniforms.uWaterTime.value = time;
      const own = water.userData.drips || [];
      for (let i = 0; i < MAX_DRIPS; i += 1) {
        const drip = own[i];
        const target = uniforms.uDrips.value[i];
        if (!drip) {
          target.set(0, 0, 999, 0);
          continue;
        }
        const fall = Math.sqrt((2 * Math.max(0.05, drip.top - drip.bottom)) / GRAVITY);
        const local = (time + drip.offset * drip.period) % drip.period;
        const sinceLanding = local - (drip.period - fall) - fall;
        const age = sinceLanding >= 0 ? sinceLanding : sinceLanding + drip.period;
        target.set(drip.x, drip.z, age, drip.strength ?? 1);
      }
    }
  });
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, Math.max(1, drips.length)]}
      count={drips.length}
      frustumCulled={false}
      userData={{ noBatch: true }}
      name="CaveDrips"
    />
  );
}
