'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { weatherEnv } from '../../../world/weatherEnvRuntime';

// GPU rain: one THREE.Points draw call, animated entirely in the vertex
// shader (modulo-wrap fall), after fromtheghost's rain-demo. The volume rides
// the camera so it never shows an edge; intensity gates per-particle alpha so
// the same geometry covers drizzle through downpour with zero CPU churn.
const RAIN_VOLUME = { width: 56, height: 34, depth: 56 };
const _dir = new THREE.Vector3();

function buildGeometry(count) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * RAIN_VOLUME.width;
    positions[i * 3 + 1] = Math.random() * RAIN_VOLUME.height;
    positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_VOLUME.depth;
    seeds[i] = Math.random();
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RAIN_VOLUME.width);
  return geometry;
}

const VERTEX = /* glsl */`
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uIntensity;
  uniform vec2 uWind;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    float speed = 22.0 + aSeed * 12.0;
    vec3 p = position;
    p.y = mod(position.y - uTime * speed, uHeight);
    // Wind shear: drops drift further downwind the longer they have fallen.
    p.xz += uWind * (uHeight - p.y) * 0.05;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (10.0 + aSeed * 9.0) * uPixelRatio * (9.0 / max(2.0, -mv.z));
    // Intensity gates which particles exist at all: drizzle keeps only the
    // low-seed drops, a downpour wakes the full field.
    float gate = smoothstep(aSeed - 0.12, aSeed + 0.02, uIntensity);
    // Fade near the volume floor/ceiling so wraps never pop.
    float bandFade = smoothstep(0.0, 1.6, p.y) * (1.0 - smoothstep(uHeight - 2.5, uHeight, p.y));
    vAlpha = gate * bandFade * (0.32 + uIntensity * 0.35);
    vSeed = aSeed;
  }
`;

const FRAGMENT = /* glsl */`
  precision mediump float;
  uniform float uSquash;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    if (vAlpha < 0.004) discard;
    vec2 c = gl_PointCoord - 0.5;
    // A thin vertical streak that relaxes toward a round drop when the camera
    // pitches down (rain-demo's squash trick), so top-down views stay sane.
    float halfWidth = mix(0.055, 0.24, uSquash);
    float streak = (1.0 - smoothstep(halfWidth * 0.35, halfWidth, abs(c.x)))
      * (1.0 - smoothstep(mix(0.12, 0.32, uSquash), 0.5, abs(c.y)));
    if (streak < 0.01) discard;
    vec3 tint = mix(vec3(0.62, 0.70, 0.78), vec3(0.82, 0.88, 0.94), vSeed);
    gl_FragColor = vec4(tint, streak * vAlpha);
  }
`;

export function Rain({ count = 14000 }) {
  const { camera, gl } = useThree();
  const pointsRef = useRef(null);

  const geometry = useMemo(() => buildGeometry(count), [count]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: RAIN_VOLUME.height },
      uIntensity: { value: 0 },
      uWind: { value: new THREE.Vector2() },
      uPixelRatio: { value: 1 },
      uSquash: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  }), []);

  useLayoutEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ clock }) => {
    const points = pointsRef.current;
    if (!points) return;
    const intensity = weatherEnv.rainIntensity;
    points.visible = intensity > 0.005;
    if (!points.visible) return;

    points.position.set(camera.position.x, camera.position.y - RAIN_VOLUME.height * 0.55, camera.position.z);
    const u = material.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uIntensity.value = intensity;
    u.uWind.value.set(weatherEnv.windX * weatherEnv.rainShearSpeed, weatherEnv.windZ * weatherEnv.rainShearSpeed);
    u.uPixelRatio.value = gl.getPixelRatio();
    // How vertically the camera is looking: 0 level, 1 straight down/up.
    const pitch = Math.abs(camera.getWorldDirection(_dir).y);
    u.uSquash.value = THREE.MathUtils.smoothstep(pitch, 0.45, 0.95);
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />;
}
