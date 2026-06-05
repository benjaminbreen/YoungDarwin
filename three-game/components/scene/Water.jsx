'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Water2 } from 'three-stdlib';

function seededNoise(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = seededNoise(x0, y0, seed);
  const b = seededNoise(x0 + 1, y0, seed);
  const c = seededNoise(x0, y0 + 1, seed);
  const d = seededNoise(x0 + 1, y0 + 1, seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
}

function waterHeight(x, y, seed) {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  for (let i = 0; i < 5; i += 1) {
    value += smoothNoise(x * freq, y * freq, seed + i * 19) * amp;
    freq *= 2.04;
    amp *= 0.5;
  }
  value += Math.sin(x * 17 + seed) * 0.055;
  value += Math.cos(y * 13 - seed) * 0.045;
  return value;
}

function makeNormalMap(seed) {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const strength = 5.8;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const hL = waterHeight(u - 1 / size, v, seed);
      const hR = waterHeight(u + 1 / size, v, seed);
      const hD = waterHeight(u, v - 1 / size, seed);
      const hU = waterHeight(u, v + 1 / size, seed);
      const normal = new THREE.Vector3((hL - hR) * strength, (hD - hU) * strength, 1).normalize();
      const index = (y * size + x) * 4;
      data[index] = Math.round((normal.x * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      data[index + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createShoreMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      shallow: { value: new THREE.Color('#92fff0') },
      foam: { value: new THREE.Color('#fbfff1') },
    },
    vertexShader: `
      uniform float time;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        p.z += sin(p.x * 0.15 + time * 0.9) * 0.015;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 shallow;
      uniform vec3 foam;
      varying vec3 vWorld;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(41.7, 289.3))) * 19341.13);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float radial = length(vWorld.xz / vec2(30.0, 26.0));
        float lagoon = smoothstep(1.08, 0.68, radial) * 0.32;
        float shore = smoothstep(0.08, 0.0, abs(radial - 0.93));
        float outer = smoothstep(0.04, 0.0, abs(radial - 1.04));
        float lace = noise(vWorld.xz * 1.16 + vec2(time * 0.34, -time * 0.18));
        float streak = pow(max(0.0, sin(vWorld.x * 1.5 + vWorld.z * 0.42 - time * 1.55)), 10.0);
        float foamAlpha = (shore * smoothstep(0.38, 0.86, lace) + outer * streak * 0.35) * 0.46;
        vec3 color = mix(shallow, foam, clamp(foamAlpha * 2.0, 0.0, 1.0));
        gl_FragColor = vec4(color, clamp(lagoon + foamAlpha, 0.0, 0.64));
      }
    `,
  });
}

export function Water() {
  const water = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(210, 210, 1, 1);
    const mesh = new Water2(geometry, {
      color: '#42d5df',
      textureWidth: 384,
      textureHeight: 384,
      clipBias: 0.02,
      flowDirection: new THREE.Vector2(0.82, 0.28),
      flowSpeed: 0.026,
      reflectivity: 0.18,
      scale: 2.25,
      normalMap0: makeNormalMap(11),
      normalMap1: makeNormalMap(47),
    });
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.9;
    mesh.renderOrder = -3;
    mesh.material.depthWrite = false;
    mesh.material.transparent = true;
    return mesh;
  }, []);

  const shoreRef = useRef(null);
  const shoreMaterial = useMemo(() => createShoreMaterial(), []);

  useFrameSafe(shoreRef);

  useEffect(() => {
    return () => {
      water.geometry.dispose();
      water.material.uniforms.tNormalMap0.value.dispose();
      water.material.uniforms.tNormalMap1.value.dispose();
      water.material.dispose();
      shoreMaterial.dispose();
    };
  }, [shoreMaterial, water]);

  return (
    <group>
      <primitive object={water} />
      <mesh ref={shoreRef} rotation-x={-Math.PI / 2} position={[0, -0.84, 0]} material={shoreMaterial} renderOrder={-1}>
        <planeGeometry args={[84, 74, 1, 1]} />
      </mesh>
    </group>
  );
}

function useFrameSafe(ref) {
  useFrame(({ clock }) => {
    if (ref.current) ref.current.material.uniforms.time.value = clock.elapsedTime;
  });
}
