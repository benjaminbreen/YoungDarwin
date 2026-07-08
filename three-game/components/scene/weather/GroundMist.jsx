'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { weatherEnv } from '../../../world/weatherEnvRuntime';

// Floating garúa: a field of soft billboarded wisps that drifts with the wind
// at head height around the camera. Offsets wrap inside a fixed volume (the
// rain trick), so the field is endless with one instanced draw call. Each
// wisp breathes — slow scale and altitude undulation — so the mist visibly
// hangs and crawls instead of reading as a static texture.
const COUNT = 44;
const FIELD = 68; // metres; wisps wrap within this square around the camera

export function GroundMist() {
  const { camera, scene } = useThree();
  const meshRef = useRef(null);
  const drift = useRef(new THREE.Vector2());

  const geometry = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const offsets = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) {
      offsets[i * 3] = (Math.random() - 0.5) * FIELD;
      offsets[i * 3 + 1] = 0.2 + Math.random() * 2.8;
      offsets[i * 3 + 2] = (Math.random() - 0.5) * FIELD;
      seeds[i] = Math.random();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.instanceCount = COUNT;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10000);
    return geo;
  }, []);

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uMist: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uDrift: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color('#dde6e8') },
    },
    vertexShader: /* glsl */`
      attribute vec3 aOffset;
      attribute float aSeed;
      uniform float uTime;
      uniform float uMist;
      uniform vec3 uCenter;
      uniform vec2 uDrift;
      varying vec2 vUv;
      varying float vAlpha;
      const float FIELD = ${FIELD.toFixed(1)};
      void main() {
        // Wind-drifted offset, wrapped around the camera so the field never ends.
        vec2 rel = mod(aOffset.xz + uDrift * (0.6 + aSeed * 0.8) - uCenter.xz + FIELD * 0.5, FIELD) - FIELD * 0.5;
        float bob = sin(uTime * 0.11 + aSeed * 6.2831853) * 0.4;
        vec3 world = vec3(
          uCenter.x + rel.x,
          uCenter.y - 1.1 + aOffset.y + bob,
          uCenter.z + rel.y
        );
        float breathe = 0.82 + 0.18 * sin(uTime * 0.07 + aSeed * 4.0);
        float scale = (8.0 + aSeed * 11.0) * breathe;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        world += (right * position.x + up * (position.y * 0.45)) * scale;
        float dist = length(rel);
        // Fade at the wrap boundary and right at the camera.
        float edge = 1.0 - smoothstep(FIELD * 0.3, FIELD * 0.47, dist);
        float near = smoothstep(2.5, 8.0, dist);
        vAlpha = uMist * edge * near * (0.05 + aSeed * 0.07);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying float vAlpha;
      uniform vec3 uColor;
      void main() {
        if (vAlpha < 0.004) discard;
        vec2 c = vUv - 0.5;
        c.y *= 1.7;
        float d = length(c);
        float soft = 1.0 - smoothstep(0.1, 0.5, d);
        float alpha = vAlpha * soft;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  useLayoutEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.visible = weatherEnv.mistAmount > 0.03;
    if (!mesh.visible) return;
    drift.current.x += weatherEnv.windX * weatherEnv.mistDriftSpeed * delta;
    drift.current.y += weatherEnv.windZ * weatherEnv.mistDriftSpeed * delta;
    const u = material.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uMist.value = weatherEnv.mistAmount;
    u.uCenter.value.copy(camera.position);
    u.uDrift.value.copy(drift.current);
    if (scene.fog) {
      // Wisps sit slightly above the ambient haze, scaled by how bright that
      // haze actually is — dusk/overcast mist must not glow white.
      const fog = scene.fog.color;
      const lum = fog.r * 0.2126 + fog.g * 0.7152 + fog.b * 0.0722;
      u.uColor.value.copy(fog).lerp(_white, 0.08 + 0.3 * Math.min(1, lum * 1.6));
    }
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}

const _white = new THREE.Color('#ffffff');
