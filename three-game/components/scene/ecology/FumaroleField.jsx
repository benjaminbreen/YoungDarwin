'use client';

import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';

// Fumarole vapour: soft camera-facing puffs that leave each vent thin and
// warm, swell, lean downwind and thin out. One instanced draw for the whole
// layer; each puff carries its vent's position and strength, and the vertex
// shader runs its whole life from time and seed. Steam, not smoke: pale,
// faintly yellow at the throat, alpha-blended and never depth-writing.

const PUFFS_PER_UNIT_STRENGTH = 22;

function createSteamMaterial() {
  return new THREE.ShaderMaterial({
    name: 'FumaroleSteam',
    uniforms: {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(0.62, 0.22) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aVent;
      attribute float aSeed;
      uniform float uTime;
      uniform vec2 uWind;
      varying vec2 vUv;
      varying float vLife;
      varying float vSeed;
      varying float vStrength;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        vStrength = aVent.w;
        float rate = 0.16 + fract(aSeed * 7.13) * 0.06;
        float life = fract(uTime * rate + aSeed);
        vLife = life;
        float rise = (0.35 + aVent.w * 0.9) * (life * 3.6 - life * life * 0.9);
        float lean = life * life * (1.4 + aVent.w * 1.2);
        vec3 center = aVent.xyz + vec3(
          uWind.x * lean + sin(aSeed * 41.0 + uTime * 0.7) * 0.18 * life,
          0.15 + rise,
          uWind.y * lean + cos(aSeed * 29.0 + uTime * 0.6) * 0.18 * life
        );
        float size = (0.32 + life * (1.3 + aVent.w * 0.9)) * (0.8 + fract(aSeed * 3.7) * 0.4);
        vec4 mv = modelViewMatrix * vec4(center, 1.0);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv;
      varying float vLife;
      varying float vSeed;
      varying float vStrength;
      float steamHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float steamNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(steamHash(i), steamHash(i + vec2(1.0, 0.0)), u.x), mix(steamHash(i + vec2(0.0, 1.0)), steamHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float steamFbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) { v += a * steamNoise(p); p *= 2.07; a *= 0.5; }
        return v;
      }
      void main() {
        vec2 c = vUv - 0.5;
        float n = steamFbm(vUv * 2.6 + vec2(vSeed * 17.0, -uTime * 0.18));
        float puff = smoothstep(0.5, 0.06, length(c) + (n - 0.5) * 0.36);
        float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.45, 1.0, vLife));
        float alpha = puff * fade * (0.1 + vStrength * 0.12);
        vec3 throat = vec3(0.93, 0.9, 0.74);
        vec3 plume = vec3(0.88, 0.89, 0.88);
        vec3 color = mix(throat, plume, smoothstep(0.0, 0.35, vLife)) * (0.86 + n * 0.2);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function buildSteamGeometry(vents) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('uv', quad.getAttribute('uv'));
  const ventData = [];
  const seeds = [];
  vents.forEach((vent, ventIndex) => {
    const count = Math.max(6, Math.round(PUFFS_PER_UNIT_STRENGTH * vent.strength));
    for (let i = 0; i < count; i += 1) {
      ventData.push(vent.x, vent.y, vent.z, vent.strength);
      seeds.push(((i * 0.618034) + ventIndex * 0.37) % 1);
    }
  });
  geometry.setAttribute('aVent', new THREE.InstancedBufferAttribute(new Float32Array(ventData), 4));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
  geometry.instanceCount = seeds.length;
  const center = vents.reduce((sum, vent) => sum.add(new THREE.Vector3(vent.x, vent.y, vent.z)), new THREE.Vector3())
    .multiplyScalar(1 / Math.max(1, vents.length));
  const radius = vents.reduce((max, vent) => Math.max(max, center.distanceTo(new THREE.Vector3(vent.x, vent.y, vent.z))), 0);
  geometry.boundingSphere = new THREE.Sphere(center.add(new THREE.Vector3(0, 3, 0)), radius + 9);
  quad.dispose();
  return geometry;
}

function inspectVent(event) {
  event.stopPropagation();
  useThreeGameStore.getState().setInspectedObject?.(catalogToInspectable('fumarole', event.point, { sourceId: 'fumarole' }));
}

export function FumaroleField({ layer }) {
  const vents = layer.items;
  const resources = useMemo(() => ({
    geometry: buildSteamGeometry(vents),
    material: createSteamMaterial(),
    hit: new THREE.CylinderGeometry(0.7, 0.9, 1.4, 8),
  }), [vents]);
  useEffect(() => () => {
    resources.geometry.dispose();
    resources.material.dispose();
    resources.hit.dispose();
  }, [resources]);
  useFrame(({ clock }) => {
    resources.material.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <group name={`FumaroleField:${layer.id}`}>
      <mesh geometry={resources.geometry} material={resources.material} renderOrder={6} />
      {/* Invisible pick volumes so the vents themselves can be examined. */}
      {vents.map(vent => (
        <mesh key={vent.id} geometry={resources.hit} position={[vent.x, vent.y + 0.6, vent.z]} visible={false} onClick={inspectVent} />
      ))}
    </group>
  );
}
