'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Gabriel's hearth fire: tongues of flame drawn on crossed cards with a
// scrolling-noise shader, a bed of embers that breathe, sparks that ride the
// draught, and a smoke column drawn up into the flue. Everything is additive
// or soft-alpha and casts no shadow; the hearth's point light does the
// lighting.

const NOISE = /* glsl */`
float fireHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fireNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fireHash(i), fireHash(i + vec2(1.0, 0.0)), u.x), mix(fireHash(i + vec2(0.0, 1.0)), fireHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fireFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * fireNoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
`;

function createFlameMaterial() {
  return new THREE.ShaderMaterial({
    name: 'CaveHearthFlame',
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 p = position;
        // Tips sway in the draught.
        p.x += sin(uTime * 3.1 + position.y * 4.0) * 0.04 * uv.y * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      uniform float uIntensity;
      ${NOISE}
      void main() {
        vec2 uv = vUv;
        float n = fireFbm(vec2(uv.x * 3.2, uv.y * 2.4 - uTime * 2.2));
        float n2 = fireFbm(vec2(uv.x * 6.0 + 3.1, uv.y * 4.0 - uTime * 3.4));
        // Flame body: wide at the base, narrowing upward, torn by noise.
        float width = mix(0.42, 0.04, pow(uv.y, 0.8));
        float body = 1.0 - smoothstep(width * 0.55, width, abs(uv.x - 0.5) + (n - 0.5) * 0.22);
        float height = 1.0 - smoothstep(0.35, 1.0, uv.y + (n2 - 0.5) * 0.5);
        float flame = body * height * smoothstep(0.0, 0.08, uv.y);
        // Hot core near the base.
        float core = flame * (1.0 - smoothstep(0.0, 0.5, uv.y + abs(uv.x - 0.5) * 1.2));
        vec3 color = mix(vec3(0.85, 0.22, 0.04), vec3(1.0, 0.62, 0.2), flame);
        color = mix(color, vec3(1.0, 0.92, 0.7), core);
        float alpha = flame * (0.75 + n2 * 0.4);
        gl_FragColor = vec4(color * alpha * 2.6 * uIntensity, alpha);
      }
    `,
  });
}

function createSmokeMaterial() {
  return new THREE.ShaderMaterial({
    name: 'CaveHearthSmoke',
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute float aSeed;
      varying vec2 vUv;
      varying float vLife;
      varying float vSeed;
      uniform float uTime;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        float life = fract(uTime * 0.11 + aSeed);
        vLife = life;
        // Puffs rise, widen and drift toward the flue.
        vec3 center = vec3(
          sin(aSeed * 40.0 + uTime * 0.6) * 0.12 * life - 0.3 * life * life,
          0.4 + life * 4.6,
          cos(aSeed * 31.0 + uTime * 0.5) * 0.12 * life - 0.4 * life * life
        );
        float size = 0.35 + life * 1.3;
        vec4 mv = modelViewMatrix * vec4(center, 1.0);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying float vLife;
      varying float vSeed;
      uniform float uTime;
      ${NOISE}
      void main() {
        vec2 c = vUv - 0.5;
        float n = fireFbm(vUv * 3.0 + vec2(vSeed * 13.0, -uTime * 0.2));
        float puff = smoothstep(0.5, 0.1, length(c) + (n - 0.5) * 0.3);
        float alpha = puff * smoothstep(0.0, 0.15, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife)) * 0.2;
        gl_FragColor = vec4(vec3(0.34, 0.31, 0.29) * (0.8 + n * 0.3), alpha);
      }
    `,
  });
}

function createSparkMaterial() {
  return new THREE.ShaderMaterial({
    name: 'CaveHearthSparks',
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed;
      varying float vAlpha;
      uniform float uTime;
      uniform float uPixelRatio;
      void main() {
        float speed = 0.35 + fract(aSeed * 7.3) * 0.4;
        float life = fract(uTime * speed + aSeed);
        vec3 p = vec3(
          (fract(aSeed * 13.1) - 0.5) * 0.5 + sin(uTime * 4.0 + aSeed * 30.0) * 0.06 * life,
          0.15 + life * (1.6 + fract(aSeed * 3.7) * 1.8),
          (fract(aSeed * 17.9) - 0.5) * 0.5 + cos(uTime * 3.0 + aSeed * 20.0) * 0.06 * life
        );
        vAlpha = (1.0 - life) * step(0.55, fract(aSeed * 91.0 + floor(uTime * speed + aSeed) * 0.37));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.6 + fract(aSeed * 5.0) * 0.7) * uPixelRatio * (25.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.6, 0.22) * a * 2.0, a);
      }
    `,
  });
}

function emberGeometry() {
  // A heap of glowing coals: a squashed, lumpy dome.
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const lump = 1 + Math.sin(x * 9.1 + z * 4.3) * 0.08 + Math.sin(z * 11.7 - x * 3.1) * 0.07;
    position.setXYZ(i, x * lump, Math.max(-0.05, y) * 0.32 * lump, z * lump);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createEmberMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#070504', roughness: 1, emissive: '#ff5a14', emissiveIntensity: 1 });
  material.name = 'CaveHearthEmbers';
  const uniforms = { uTime: { value: 0 } };
  material.userData.fireUniforms = uniforms;
  material.customProgramCacheKey = () => 'cave-embers-v1';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmberPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmberPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vEmberPos;\nuniform float uTime;\n${NOISE}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // Cracks of glowing coal between black crust, breathing slowly.
          // Lumps of coal: cell edges glow, cell centres are black crust.
          vec2 cellUv = vEmberPos.xz * 13.0;
          float cells = fireNoise(cellUv + vec2(0.0, uTime * 0.12));
          float edges = 1.0 - abs(cells - 0.5) * 2.0;
          float crack = smoothstep(0.55, 0.92, edges);
          float breath = 0.55 + 0.45 * fireNoise(vEmberPos.xz * 2.5 + uTime * 0.6);
          float core = 1.0 - smoothstep(0.0, 0.8, length(vEmberPos.xz));
          float heat = crack * (0.6 + core * 0.9) + core * core * 0.5;
          totalEmissiveRadiance *= heat * breath * 1.6;
          totalEmissiveRadiance = mix(totalEmissiveRadiance, totalEmissiveRadiance * vec3(1.0, 1.25, 1.6), core * crack);
        }`,
      );
  };
  return material;
}

export function HearthFire({ position = [0, 0, 0], scale = 1 }) {
  const groupRef = useRef(null);
  const resources = useMemo(() => {
    const flame = createFlameMaterial();
    const smoke = createSmokeMaterial();
    const sparks = createSparkMaterial();
    const embers = createEmberMaterial();
    const card = new THREE.PlaneGeometry(0.7, 1.05);
    card.translate(0, 0.5, 0);
    const smallCard = new THREE.PlaneGeometry(0.38, 0.55);
    smallCard.translate(0, 0.275, 0);
    const puff = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    puff.index = quad.index;
    puff.attributes.position = quad.attributes.position;
    puff.attributes.uv = quad.attributes.uv;
    const smokeCount = 14;
    puff.instanceCount = smokeCount;
    puff.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from({ length: smokeCount }, (_, i) => i / smokeCount), 1));
    const sparkCount = 48;
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sparkCount * 3), 3));
    sparkGeometry.setAttribute('aSeed', new THREE.BufferAttribute(Float32Array.from({ length: sparkCount }, (_, i) => (i * 0.618034) % 1), 1));
    sparkGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 4);
    return { flame, smoke, sparks, embers, card, smallCard, puff, quad, sparkGeometry, ember: emberGeometry() };
  }, []);
  useEffect(() => () => {
    Object.values(resources).forEach(resource => resource?.dispose?.());
  }, [resources]);
  useFrame(({ clock, gl }) => {
    const t = clock.elapsedTime;
    resources.flame.uniforms.uTime.value = t;
    resources.flame.uniforms.uIntensity.value = 0.85 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13.1) * 0.05;
    resources.smoke.uniforms.uTime.value = t;
    resources.sparks.uniforms.uTime.value = t;
    resources.sparks.uniforms.uPixelRatio.value = gl.getPixelRatio();
    resources.embers.userData.fireUniforms.uTime.value = t;
    resources.embers.emissiveIntensity = 1.6 + Math.sin(t * 1.3) * 0.25 + Math.sin(t * 5.7) * 0.12;
  });
  const cards = [0, Math.PI / 3, (2 * Math.PI) / 3];
  return (
    <group ref={groupRef} position={position} scale={scale} name="HearthFire" userData={{ noBatch: true }}>
      <mesh geometry={resources.ember} material={resources.embers} scale={[0.44, 0.6, 0.4]} position={[0, 0.0, 0]} receiveShadow />
      {cards.map(angle => (
        <mesh key={angle} geometry={resources.card} material={resources.flame} rotation={[0, angle, 0]} position={[0, 0.05, 0]} renderOrder={3} />
      ))}
      {[[0.18, 0.08, 1.1], [-0.16, -0.1, 2.3], [0.04, 0.2, 0.4], [-0.2, 0.15, 0.9], [0.22, -0.16, 2.0]].map(([x, z, a]) => (
        <mesh key={a} geometry={resources.smallCard} material={resources.flame} rotation={[0, a, 0]} position={[x, 0.04, z]} renderOrder={3} />
      ))}
      <mesh geometry={resources.puff} material={resources.smoke} frustumCulled={false} renderOrder={4} />
      <points geometry={resources.sparkGeometry} material={resources.sparks} renderOrder={5} />
    </group>
  );
}
