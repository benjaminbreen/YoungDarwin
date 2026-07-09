'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { weatherEnv } from '../../../world/weatherEnvRuntime';

const FRONT_WIDTH = 190;
const FRONT_HEIGHT = 54;
const FRONT_DISTANCE = 72;

const _fogColor = new THREE.Color();
const _storm = new THREE.Color('#56636c');
const _light = new THREE.Color('#d9e3e5');

export function WeatherFront() {
  const { camera, scene } = useThree();
  const meshRef = useRef(null);

  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uDarkness: { value: 0 },
      uLight: { value: new THREE.Color('#d9e3e5') },
      uStorm: { value: new THREE.Color('#56636c') },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorld;
      uniform float uTime;
      uniform float uAmount;
      uniform float uDarkness;
      uniform vec3 uLight;
      uniform vec3 uStorm;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.55;
        for (int i = 0; i < 4; i++) {
          v += noise(p) * a;
          p = p * 2.03 + vec2(8.4, -3.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        if (uAmount < 0.01) discard;
        vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
        float edge = smoothstep(-1.0, -0.72, p.x) * (1.0 - smoothstep(0.72, 1.0, p.x));
        float vertical = smoothstep(0.0, 0.16, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
        float base = smoothstep(0.0, 0.52, 1.0 - vUv.y);
        float torn = fbm(vec2(p.x * 2.0 + uTime * 0.035, vUv.y * 3.4 - uTime * 0.02));
        float sheets = smoothstep(0.45, 0.9, torn + base * 0.42);
        float virga = smoothstep(0.66, 0.18, vUv.y)
          * smoothstep(0.2, 0.75, fbm(vec2(p.x * 5.8, uTime * 0.22 + p.x * 0.3)));
        float alpha = (sheets * 0.42 + virga * 0.34) * edge * vertical * uAmount;
        if (alpha < 0.006) discard;
        vec3 color = mix(uLight, uStorm, clamp(uDarkness + sheets * 0.25, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  useLayoutEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const amount = weatherEnv.frontAmount;
    mesh.visible = amount > 0.015;
    if (!mesh.visible) return;

    const windX = weatherEnv.windX || -0.55;
    const windZ = weatherEnv.windZ || -0.83;
    mesh.position.set(
      camera.position.x - windX * FRONT_DISTANCE,
      camera.position.y + 12,
      camera.position.z - windZ * FRONT_DISTANCE
    );
    mesh.rotation.set(0, Math.atan2(windX, windZ), 0);

    const u = material.uniforms;
    u.uTime.value = weatherEnv.frontProgress;
    u.uAmount.value = amount;
    u.uDarkness.value = weatherEnv.frontDarkness;
    if (scene.fog) {
      _fogColor.copy(scene.fog.color);
      u.uLight.value.copy(_fogColor).lerp(_light, 0.25);
      u.uStorm.value.copy(_fogColor).lerp(_storm, 0.65);
    }
  });

  return (
    <mesh ref={meshRef} renderOrder={-4} frustumCulled={false}>
      <planeGeometry args={[FRONT_WIDTH, FRONT_HEIGHT, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
