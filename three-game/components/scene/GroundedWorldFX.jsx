'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { terrainBiomeAt, terrainHeight } from '../../world/terrain';
import { getSurfaceContactProfile, isWaterSurfaceContact } from '../../world/surfaceContact';
import { WATER_LEVEL } from '../../world/water';
import { isWetWeather } from '../../world/weatherStates';
import { onPropEvent } from '../../physics/props/propEvents';

const RIPPLE_COUNT = 48;
const WATER_STEP_COUNT = 36;
const DUST_RING_COUNT = 52;
const DUST_POINT_COUNT = 360;
const SKID_STREAK_COUNT = 32;
const INSECT_COUNT = 96;
const INSECT_RADIUS = 18;
const INSECT_RESPAWN_DISTANCE = 11;
const INSECT_PLACEMENT_ATTEMPTS = 6;
const dummy = new THREE.Object3D();

function dustKindScale(kind) {
  if (kind === 'takeoff') return 1.25;
  if (kind === 'footstep') return 1.05;
  if (kind === 'step-up') return 1.15;
  if (kind === 'collision') return 1.2;
  if (kind === 'skid' || kind === 'scramble') return 1.35;
  if (kind === 'landing-jump' || kind === 'landing') return 1.55;
  return 0.7;
}

function eventDirection(event) {
  const direction = event?.direction;
  const x = Number.isFinite(direction?.x) ? direction.x : 0;
  const z = Number.isFinite(direction?.z) ? direction.z : -1;
  const length = Math.hypot(x, z);
  if (length < 0.001) return { x: 0, z: -1, yaw: 0 };
  return { x: x / length, z: z / length, yaw: Math.atan2(x, z) };
}

function dayEdgeFactor(hour) {
  const h = ((hour % 24) + 24) % 24;
  const dawn = Math.max(0, 1 - Math.abs(h - 6.15) / 1.55);
  const dusk = Math.max(0, 1 - Math.abs(h - 18.05) / 1.75);
  return Math.max(dawn, dusk);
}

function isNightHour(hour) {
  const h = ((Number(hour || 0) % 24) + 24) % 24;
  return h >= 18.7 || h < 5.65;
}

function insectBiomeWeight(biome) {
  if (biome === 'wet-mud' || biome === 'salt-scrub' || biome === 'sesuvium-flat') return 1;
  if (biome === 'dry-scrub' || biome === 'palo-santo' || biome === 'grass' || biome === 'saltgrass') return 0.72;
  if (biome === 'green-beach' || biome === 'olivine-trail' || biome === 'trail') return 0.48;
  if (biome === 'wet-basalt' || biome === 'black-lava' || biome === 'ash-slope') return 0.32;
  return 0.18;
}

function radialPointTexture() {
  if (typeof document === 'undefined') return null;
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function WaterContactRipples({ enabled }) {
  const meshRef = useRef(null);
  const cursor = useRef(0);
  const ripples = useRef(Array.from({ length: RIPPLE_COUNT }, () => ({
    birth: -1000,
    intensity: 0,
  })));

  const { geometry, material, births, intensities } = useMemo(() => {
    const geo = new THREE.RingGeometry(0.48, 0.64, 44);
    geo.rotateX(-Math.PI / 2);
    const birthArray = new Float32Array(RIPPLE_COUNT).fill(-1000);
    const intensityArray = new Float32Array(RIPPLE_COUNT).fill(0);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birthArray, 1));
    geo.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(intensityArray, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#eefaf8') },
      },
      vertexShader: /* glsl */`
        attribute float aBirth;
        attribute float aIntensity;
        uniform float uTime;
        varying float vFade;
        varying float vIntensity;
        void main() {
          float age = max(0.0, uTime - aBirth);
          vFade = clamp(1.0 - age / 1.35, 0.0, 1.0);
          vIntensity = aIntensity;
          float grow = 1.0 + age * (2.2 + aIntensity * 1.2);
          vec3 transformed = position * vec3(grow, 1.0, grow);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying float vFade;
        varying float vIntensity;
        void main() {
          float a = pow(vFade, 1.7) * (0.16 + vIntensity * 0.36);
          if (a < 0.006) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    return { geometry: geo, material: mat, births: birthArray, intensities: intensityArray };
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    if (!enabled) return undefined;
    return onPropEvent('water-ripple', event => {
      const mesh = meshRef.current;
      if (!mesh || !event?.position) return;
      const index = cursor.current;
      cursor.current = (cursor.current + 1) % RIPPLE_COUNT;
      const now = performance.now() / 1000;
      const intensity = THREE.MathUtils.clamp(event.intensity ?? 0.35, 0.08, 1);
      dummy.position.set(event.position.x, WATER_LEVEL + 0.034, event.position.z);
      dummy.rotation.set(0, event.yaw || 0, 0);
      dummy.scale.setScalar(0.42 + intensity * 0.28);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      births[index] = now;
      intensities[index] = intensity;
      ripples.current[index] = { birth: now, intensity };
      mesh.visible = true;
      geometry.attributes.aBirth.needsUpdate = true;
      geometry.attributes.aIntensity.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [births, enabled, geometry, intensities]);

  useFrame(() => {
    material.uniforms.uTime.value = performance.now() / 1000;
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!enabled) {
      mesh.visible = false;
      return;
    }
    // Keep old ripples tucked just below the surface instead of testing them in
    // the fragment shader forever.
    const now = material.uniforms.uTime.value;
    let changed = false;
    let active = false;
    ripples.current.forEach((ripple, index) => {
      if (ripple.birth < 0) return;
      if (now - ripple.birth < 1.5) {
        active = true;
        return;
      }
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      ripple.birth = -1000;
      births[index] = -1000;
      changed = true;
    });
    if (changed) {
      geometry.attributes.aBirth.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    }
    mesh.visible = active;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, RIPPLE_COUNT]}
      frustumCulled={false}
      visible={false}
      renderOrder={3}
      userData={{ renderSource: 'player-water-ripples', renderLabel: 'Player water ripples', renderKind: 'water-contact-fx', noReflect: true }}
    />
  );
}

function WaterStepPlops({ enabled }) {
  const meshRef = useRef(null);
  const cursor = useRef(0);
  const steps = useRef(Array.from({ length: WATER_STEP_COUNT }, () => ({ birth: -1000 })));
  const { geometry, material, births, intensities } = useMemo(() => {
    const geo = new THREE.CircleGeometry(0.16, 20);
    geo.rotateX(-Math.PI / 2);
    const birthArray = new Float32Array(WATER_STEP_COUNT).fill(-1000);
    const intensityArray = new Float32Array(WATER_STEP_COUNT).fill(0);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birthArray, 1));
    geo.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(intensityArray, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#dff8f5') },
      },
      vertexShader: /* glsl */`
        attribute float aBirth;
        attribute float aIntensity;
        uniform float uTime;
        varying vec2 vUv;
        varying float vFade;
        varying float vIntensity;
        void main() {
          vUv = uv;
          float age = max(0.0, uTime - aBirth);
          vFade = clamp(1.0 - age / 0.48, 0.0, 1.0);
          vIntensity = aIntensity;
          float grow = 0.85 + age * (1.7 + aIntensity);
          vec3 transformed = position * vec3(grow, 1.0, grow * 0.72);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vFade;
        varying float vIntensity;
        void main() {
          vec2 c = vUv - 0.5;
          float ring = smoothstep(0.34, 0.28, abs(length(c * vec2(1.0, 1.35)) - 0.27));
          float core = smoothstep(0.22, 0.02, length(c * vec2(1.0, 1.45)));
          float a = (ring * 0.22 + core * 0.12) * pow(vFade, 1.25) * (0.45 + vIntensity);
          if (a < 0.006) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    return { geometry: geo, material: mat, births: birthArray, intensities: intensityArray };
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    if (!enabled) return undefined;
    return onPropEvent('water-step', event => {
      const mesh = meshRef.current;
      if (!mesh || !event?.position) return;
      const index = cursor.current;
      cursor.current = (cursor.current + 1) % WATER_STEP_COUNT;
      const now = performance.now() / 1000;
      const intensity = THREE.MathUtils.clamp(event.intensity ?? 0.25, 0.08, 0.85);
      const direction = event.direction || { x: 0, z: -1 };
      const yaw = Number.isFinite(event.yaw) ? event.yaw : Math.atan2(direction.x || 0, direction.z || -1);
      dummy.position.set(event.position.x, WATER_LEVEL + 0.04, event.position.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(0.8 + intensity * 0.65);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      births[index] = now;
      intensities[index] = intensity;
      steps.current[index] = { birth: now };
      mesh.visible = true;
      geometry.attributes.aBirth.needsUpdate = true;
      geometry.attributes.aIntensity.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [births, enabled, geometry, intensities]);

  useFrame(() => {
    material.uniforms.uTime.value = performance.now() / 1000;
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!enabled) {
      mesh.visible = false;
      return;
    }
    const now = material.uniforms.uTime.value;
    let changed = false;
    let active = false;
    steps.current.forEach((step, index) => {
      if (step.birth < 0) return;
      if (now - step.birth < 0.62) {
        active = true;
        return;
      }
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      step.birth = -1000;
      births[index] = -1000;
      changed = true;
    });
    if (changed) {
      geometry.attributes.aBirth.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    }
    mesh.visible = active;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, WATER_STEP_COUNT]}
      frustumCulled={false}
      visible={false}
      renderOrder={4}
      userData={{ renderSource: 'player-water-steps', renderLabel: 'Player water step plops', renderKind: 'water-contact-fx', noReflect: true }}
    />
  );
}

function TerrainDustPuffs({ enabled }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const ringRef = useRef(null);
  const pointsRef = useRef(null);
  const ringCursor = useRef(0);
  const pointCursor = useRef(0);
  const rings = useRef(Array.from({ length: DUST_RING_COUNT }, () => ({ birth: -1000, life: 0.8 })));
  const scratchColor = useRef(new THREE.Color());

  const ringData = useMemo(() => {
    const geo = new THREE.RingGeometry(0.34, 0.68, 40);
    geo.rotateX(-Math.PI / 2);
    const birthArray = new Float32Array(DUST_RING_COUNT).fill(-1000);
    const intensityArray = new Float32Array(DUST_RING_COUNT).fill(0);
    const lifeArray = new Float32Array(DUST_RING_COUNT).fill(0.8);
    const colorArray = new Float32Array(DUST_RING_COUNT * 3);
    for (let i = 0; i < DUST_RING_COUNT; i += 1) {
      colorArray[i * 3] = 0.82;
      colorArray[i * 3 + 1] = 0.72;
      colorArray[i * 3 + 2] = 0.52;
    }
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birthArray, 1));
    geo.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(intensityArray, 1));
    geo.setAttribute('aLife', new THREE.InstancedBufferAttribute(lifeArray, 1));
    geo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colorArray, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */`
        attribute float aBirth;
        attribute float aIntensity;
        attribute float aLife;
        attribute vec3 instanceColor;
        uniform float uTime;
        varying vec2 vUv;
        varying float vFade;
        varying float vIntensity;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          float age = max(0.0, uTime - aBirth);
          float progress = clamp(age / max(aLife, 0.001), 0.0, 1.0);
          vFade = pow(1.0 - progress, 1.6) * step(0.0, uTime - aBirth);
          vIntensity = aIntensity;
          vColor = instanceColor;
          float grow = 0.72 + progress * (1.15 + aIntensity * 0.78);
          vec3 transformed = position * vec3(grow, 1.0, grow);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        varying float vFade;
        varying float vIntensity;
        varying vec3 vColor;
        void main() {
          float broken = 0.78 + 0.22 * sin(vUv.x * 23.0 + vUv.y * 17.0);
          float a = vFade * broken * (0.08 + vIntensity * 0.22);
          if (a < 0.006) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    return { geometry: geo, material: mat, births: birthArray, intensities: intensityArray, lifes: lifeArray, colors: colorArray };
  }, []);

  const pointData = useMemo(() => {
    const positions = new Float32Array(DUST_POINT_COUNT * 3);
    const velocities = new Float32Array(DUST_POINT_COUNT * 3);
    const colors = new Float32Array(DUST_POINT_COUNT * 3);
    const births = new Float32Array(DUST_POINT_COUNT).fill(-1000);
    const lifes = new Float32Array(DUST_POINT_COUNT).fill(0.85);
    const sizes = new Float32Array(DUST_POINT_COUNT).fill(0);
    const alphas = new Float32Array(DUST_POINT_COUNT).fill(0);
    for (let i = 0; i < DUST_POINT_COUNT; i += 1) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
      colors[i * 3] = 0.8;
      colors[i * 3 + 1] = 0.7;
      colors[i * 3 + 2] = 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aBirth', new THREE.BufferAttribute(births, 1));
    geo.setAttribute('aLife', new THREE.BufferAttribute(lifes, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */`
        attribute vec3 aVelocity;
        attribute vec3 aColor;
        attribute float aBirth;
        attribute float aLife;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vProgress;
        void main() {
          float age = uTime - aBirth;
          float progress = clamp(age / max(aLife, 0.001), 0.0, 1.0);
          float liveMask = step(0.0, age) * (1.0 - step(0.999, progress));
          vec3 animated = position + aVelocity * age;
          animated.y += sin(progress * 3.14159265) * aSize * 0.42;
          vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
          float perspective = clamp(190.0 / max(1.0, -mvPosition.z), 12.0, 120.0);
          gl_PointSize = liveMask * aSize * perspective * uPixelRatio;
          gl_Position = projectionMatrix * mvPosition;
          vColor = aColor;
          vProgress = progress;
          vAlpha = liveMask * aAlpha * pow(1.0 - progress, 1.45);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vAlpha;
        varying float vProgress;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float soft = smoothstep(0.5, 0.06, d);
          float grain = 0.82 + 0.18 * sin((gl_PointCoord.x * 41.0 + gl_PointCoord.y * 29.0) + vProgress * 9.0);
          float hollow = mix(1.0, smoothstep(0.02, 0.36, d), 0.34);
          float a = soft * grain * hollow * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    return { geometry: geo, material: mat, positions, velocities, colors, births, lifes, sizes, alphas };
  }, []);

  useEffect(() => () => {
    ringData.geometry.dispose();
    ringData.material.dispose();
    pointData.geometry.dispose();
    pointData.material.dispose();
  }, [pointData, ringData]);

  useEffect(() => {
    if (!enabled) return undefined;
    return onPropEvent('terrain-dust', event => {
      if (!event?.position) return;
      const kind = event.kind || 'dust';
      if (kind === 'footstep') {
        const { timeOfDay } = useThreeGameStore.getState();
        if (isNightHour(timeOfDay)) return;
      }
      const x = event.position.x;
      const z = event.position.z;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const rawY = Number.isFinite(event.position.y)
        ? event.position.y
        : terrainHeight(x, z, currentZoneId) + 0.04;
      if (rawY < WATER_LEVEL - 0.02) return;
      const biome = event.biome || terrainBiomeAt(x, z, rawY, currentZoneId);
      const profile = event.surfaceProfile || getSurfaceContactProfile({
        x,
        z,
        y: rawY,
        zoneId: currentZoneId,
        biome,
      });
      if (isWaterSurfaceContact(profile)) return;
      const surfaceDust = THREE.MathUtils.clamp(event.dustiness ?? Math.max(profile.dustiness, 0.42), 0, 1.5);
      if (surfaceDust <= 0.04) return;

      const direction = eventDirection(event);
      const fallSpeed = Math.max(0, event.fallSpeed || 0);
      const travelDistance = Math.max(0, event.travelDistance || 0);
      const horizontalSpeed = Math.max(0, event.horizontalSpeed || 0);
      const jumpBoost = (kind === 'landing' || kind === 'landing-jump')
        ? THREE.MathUtils.clamp(travelDistance / 9.5 + fallSpeed / 34, 0, 0.42)
        : 0;
      const intensity = THREE.MathUtils.clamp(
        (event.intensity ?? 0.36) * dustKindScale(kind) * surfaceDust + jumpBoost,
        0.22,
        1.18,
      );
      const now = performance.now() / 1000;
      const y = rawY + 0.035;
      const particleTotal = Math.round(THREE.MathUtils.clamp(
        8 + intensity * 20 + travelDistance * 0.45 + fallSpeed * 0.25,
        kind === 'footstep' ? 8 : 10,
        kind === 'landing' || kind === 'landing-jump' ? 34 : 24,
      ));
      const radiusScale = event.radiusScale || 1;
      const ringLife = THREE.MathUtils.clamp(0.72 + intensity * 0.58 + travelDistance * 0.022, 0.7, 1.45);
      const baseRadius = (0.58 + intensity * 0.58 + Math.min(travelDistance, 8) * 0.05) * radiusScale;
      const ringIndex = ringCursor.current;
      ringCursor.current = (ringCursor.current + 1) % DUST_RING_COUNT;
      dummy.position.set(x, y - 0.022, z);
      dummy.rotation.set(0, direction.yaw, 0);
      dummy.scale.set(baseRadius, 1, baseRadius * (kind === 'skid' || kind === 'scramble' ? 0.58 : 0.82));
      dummy.updateMatrix();
      ringRef.current?.setMatrixAt(ringIndex, dummy.matrix);
      scratchColor.current.set(profile.ring);
      ringData.colors[ringIndex * 3] = scratchColor.current.r;
      ringData.colors[ringIndex * 3 + 1] = scratchColor.current.g;
      ringData.colors[ringIndex * 3 + 2] = scratchColor.current.b;
      ringData.births[ringIndex] = now;
      ringData.intensities[ringIndex] = intensity * Math.max(profile.opacity, 0.28);
      ringData.lifes[ringIndex] = ringLife;
      rings.current[ringIndex] = { birth: now, life: ringLife };
      ringData.geometry.attributes.instanceColor.needsUpdate = true;
      ringData.geometry.attributes.aBirth.needsUpdate = true;
      ringData.geometry.attributes.aIntensity.needsUpdate = true;
      ringData.geometry.attributes.aLife.needsUpdate = true;
      if (ringRef.current) {
        ringRef.current.instanceMatrix.needsUpdate = true;
        ringRef.current.visible = true;
      }

      const driftBase = Math.min(0.85, horizontalSpeed / 14 + travelDistance / 28);
      const directionAngle = Math.atan2(direction.z, direction.x);
      for (let i = 0; i < particleTotal; i += 1) {
        const index = pointCursor.current;
        pointCursor.current = (pointCursor.current + 1) % DUST_POINT_COUNT;
        const seed = now * 97.3 + index * 17.17 + i * 11.7;
        const radial = seededUnit(seed + 0.4);
        const landingSpread = kind === 'landing' || kind === 'landing-jump';
        const angle = landingSpread
          ? seededUnit(seed + 1.2) * Math.PI * 2
          : directionAngle + Math.PI + (seededUnit(seed + 1.2) - 0.5) * Math.PI * 1.2;
        const startRadius = (0.05 + radial * (0.18 + intensity * 0.16)) * radiusScale;
        const speed = (0.18 + seededUnit(seed + 2.1) * 0.42 + intensity * 0.3 + driftBase * 0.18) * (landingSpread ? 0.86 : 1);
        const sideDrift = seededUnit(seed + 6.8) - 0.5;
        const color = scratchColor.current.set(profile.particles[index % profile.particles.length]);
        pointData.positions[index * 3] = x + Math.cos(angle) * startRadius;
        pointData.positions[index * 3 + 1] = y + seededUnit(seed + 3.7) * 0.035;
        pointData.positions[index * 3 + 2] = z + Math.sin(angle) * startRadius;
        pointData.velocities[index * 3] = Math.cos(angle) * speed - direction.x * driftBase * 0.12 + (-direction.z) * sideDrift * 0.08;
        pointData.velocities[index * 3 + 1] = 0.04 + seededUnit(seed + 4.8) * (0.16 + intensity * 0.12);
        pointData.velocities[index * 3 + 2] = Math.sin(angle) * speed - direction.z * driftBase * 0.12 + direction.x * sideDrift * 0.08;
        pointData.colors[index * 3] = color.r;
        pointData.colors[index * 3 + 1] = color.g;
        pointData.colors[index * 3 + 2] = color.b;
        pointData.births[index] = now;
        pointData.lifes[index] = THREE.MathUtils.clamp(0.52 + intensity * 0.52 + seededUnit(seed + 5.2) * 0.22, 0.48, 1.34);
        pointData.sizes[index] = (0.13 + seededUnit(seed + 7.1) * 0.12 + intensity * 0.24) * (landingSpread ? 1.28 : 1.08) * radiusScale;
        pointData.alphas[index] = THREE.MathUtils.clamp(Math.max(profile.opacity, 0.26) * (0.82 + intensity * 0.88), 0.16, 0.72);
      }
      pointData.geometry.attributes.position.needsUpdate = true;
      pointData.geometry.attributes.aVelocity.needsUpdate = true;
      pointData.geometry.attributes.aColor.needsUpdate = true;
      pointData.geometry.attributes.aBirth.needsUpdate = true;
      pointData.geometry.attributes.aLife.needsUpdate = true;
      pointData.geometry.attributes.aSize.needsUpdate = true;
      pointData.geometry.attributes.aAlpha.needsUpdate = true;
      if (pointsRef.current) pointsRef.current.visible = true;
    });
  }, [currentZoneId, enabled, pointData, ringData, scratchColor]);

  useFrame(() => {
    const now = performance.now() / 1000;
    ringData.material.uniforms.uTime.value = now;
    pointData.material.uniforms.uTime.value = now;
    const ringMesh = ringRef.current;
    const points = pointsRef.current;
    if (!enabled) {
      if (ringMesh) ringMesh.visible = false;
      if (points) points.visible = false;
      return;
    }
    let activeRing = false;
    for (let i = 0; i < rings.current.length; i += 1) {
      const ring = rings.current[i];
      if (now - ring.birth < ring.life) {
        activeRing = true;
        break;
      }
    }
    let activePoint = false;
    for (let i = 0; i < DUST_POINT_COUNT; i += 1) {
      if (now - pointData.births[i] < pointData.lifes[i]) {
        activePoint = true;
        break;
      }
    }
    if (ringMesh) ringMesh.visible = activeRing;
    if (points) points.visible = activePoint;
  });

  return (
    <group userData={{ renderSource: 'terrain-dust-puffs', renderLabel: 'Terrain dust puffs', renderKind: 'terrain-contact-fx', noReflect: true }}>
      <instancedMesh
        ref={ringRef}
        args={[ringData.geometry, ringData.material, DUST_RING_COUNT]}
        frustumCulled={false}
        visible={false}
        renderOrder={5}
      />
      <points
        ref={pointsRef}
        geometry={pointData.geometry}
        material={pointData.material}
        frustumCulled={false}
        visible={false}
        renderOrder={6}
      />
    </group>
  );
}

function PlayerSkidStreaks({ enabled }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const meshRef = useRef(null);
  const cursor = useRef(0);
  const streaks = useRef(Array.from({ length: SKID_STREAK_COUNT }, () => ({ birth: -1000 })));
  const { geometry, material, births, intensities } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.18, 1.15);
    geo.rotateX(-Math.PI / 2);
    const birthArray = new Float32Array(SKID_STREAK_COUNT).fill(-1000);
    const intensityArray = new Float32Array(SKID_STREAK_COUNT).fill(0);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birthArray, 1));
    geo.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(intensityArray, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#2d261c') },
      },
      vertexShader: /* glsl */`
        attribute float aBirth;
        attribute float aIntensity;
        uniform float uTime;
        varying vec2 vUv;
        varying float vFade;
        varying float vIntensity;
        void main() {
          vUv = uv;
          float age = max(0.0, uTime - aBirth);
          vFade = clamp(1.0 - age / 1.15, 0.0, 1.0);
          vIntensity = aIntensity;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vFade;
        varying float vIntensity;
        void main() {
          vec2 c = vUv - 0.5;
          float width = smoothstep(0.5, 0.06, abs(c.x));
          float taper = smoothstep(0.5, 0.12, abs(c.y));
          float broken = smoothstep(0.08, 0.18, fract(vUv.y * 8.0 + vUv.x * 3.0));
          float a = width * taper * broken * pow(vFade, 1.8) * (0.08 + vIntensity * 0.22);
          if (a < 0.006) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    return { geometry: geo, material: mat, births: birthArray, intensities: intensityArray };
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    if (!enabled) return undefined;
    const spawn = event => {
      const mesh = meshRef.current;
      if (!mesh || !event?.position) return;
      const direction = event.direction || { x: 0, z: -1 };
      const yaw = Math.atan2(direction.x || 0, direction.z || -1);
      const index = cursor.current;
      cursor.current = (cursor.current + 1) % SKID_STREAK_COUNT;
      const now = performance.now() / 1000;
      const intensity = THREE.MathUtils.clamp(event.intensity ?? 0.35, 0.08, 1);
      dummy.position.set(event.position.x, terrainHeight(event.position.x, event.position.z, currentZoneId) + 0.018, event.position.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(0.72 + intensity * 0.5, 0.78 + intensity * 0.82, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      births[index] = now;
      intensities[index] = intensity;
      streaks.current[index] = { birth: now };
      mesh.visible = true;
      geometry.attributes.aBirth.needsUpdate = true;
      geometry.attributes.aIntensity.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    };
    const offSkid = onPropEvent('player-skid', spawn);
    const offScramble = onPropEvent('player-scramble', spawn);
    return () => {
      offSkid();
      offScramble();
    };
  }, [births, currentZoneId, enabled, geometry, intensities]);

  useFrame(() => {
    material.uniforms.uTime.value = performance.now() / 1000;
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!enabled) {
      mesh.visible = false;
      return;
    }
    const now = material.uniforms.uTime.value;
    let changed = false;
    let active = false;
    streaks.current.forEach((streak, index) => {
      if (streak.birth < 0) return;
      if (now - streak.birth < 1.25) {
        active = true;
        return;
      }
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      streak.birth = -1000;
      births[index] = -1000;
      changed = true;
    });
    if (changed) {
      geometry.attributes.aBirth.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    }
    mesh.visible = active;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, SKID_STREAK_COUNT]}
      frustumCulled={false}
      visible={false}
      renderOrder={2}
      userData={{ renderSource: 'player-skid-streaks', renderLabel: 'Player skid streaks', renderKind: 'terrain-contact-fx', noReflect: true }}
    />
  );
}

function InsectMotes({ enabled }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const pointsRef = useRef(null);
  const spawnCenter = useRef(new THREE.Vector3(Infinity, 0, Infinity));
  const centerScratch = useRef(new THREE.Vector3());
  const seeds = useRef(Array.from({ length: INSECT_COUNT }, (_, index) => index * 37.17 + 11.3));
  const basePositions = useRef(Array.from({ length: INSECT_COUNT }, () => new THREE.Vector3(0, -100, 0)));
  const positions = useMemo(() => new Float32Array(INSECT_COUNT * 3), []);
  const colors = useMemo(() => new Float32Array(INSECT_COUNT * 3), []);
  const texture = useMemo(radialPointTexture, []);
  const activeRef = useRef(false);

  const material = useMemo(() => new THREE.PointsMaterial({
    size: 0.075,
    map: texture || undefined,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }), [texture]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [colors, positions]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    texture?.dispose?.();
  }, [geometry, material, texture]);

  useEffect(() => {
    spawnCenter.current.set(Infinity, 0, Infinity);
  }, [currentZoneId]);

  function respawn(center, hour) {
    spawnCenter.current.copy(center);
    const warm = dayEdgeFactor(hour ?? 12);
    for (let index = 0; index < INSECT_COUNT; index += 1) {
      let placed = false;
      for (let attempt = 0; attempt < INSECT_PLACEMENT_ATTEMPTS; attempt += 1) {
        const seed = seeds.current[index] + attempt * 101.9;
        const angle = seededUnit(seed) * Math.PI * 2;
        const radius = Math.sqrt(seededUnit(seed + 4.1)) * INSECT_RADIUS;
        const x = center.x + Math.cos(angle) * radius;
        const z = center.z + Math.sin(angle) * radius;
        const y = terrainHeight(x, z, currentZoneId);
        const biome = terrainBiomeAt(x, z, y, currentZoneId);
        const waterEdge = y < WATER_LEVEL + 0.42 && y > WATER_LEVEL - 0.95 ? 0.38 : 0;
        const weight = Math.max(insectBiomeWeight(biome), waterEdge);
        if (attempt < INSECT_PLACEMENT_ATTEMPTS - 1 && seededUnit(seed + 8.2) > weight) continue;
        basePositions.current[index].set(x, y + 0.35 + seededUnit(seed + 13.3) * 1.4, z);
        const color = new THREE.Color().setHSL(
          0.12 + warm * 0.03 + seededUnit(seed + 2.7) * 0.025,
          0.35 + warm * 0.22,
          0.58 + warm * 0.18 + weight * 0.08,
        );
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
        placed = true;
        break;
      }
      if (!placed) basePositions.current[index].set(center.x, -100, center.z);
    }
    geometry.attributes.color.needsUpdate = true;
  }

  useFrame(({ clock, camera }, delta) => {
    const { timeOfDay, weather } = useThreeGameStore.getState();
    const duskFactor = dayEdgeFactor(timeOfDay ?? 12);
    const weatherFactor = isWetWeather(weather) ? 0.35 : 1;
    const targetOpacity = enabled ? duskFactor * weatherFactor : 0;
    const pose = getRuntimePlayerPose();
    const player = pose.position || { x: camera.position.x, y: 0, z: camera.position.z };
    const center = centerScratch.current.set(player.x, player.y || 0, player.z);
    activeRef.current = targetOpacity > 0.04;
    material.opacity = THREE.MathUtils.damp(material.opacity, activeRef.current ? Math.min(0.42, targetOpacity * 0.34) : 0, 3.2, delta);
    const visible = activeRef.current || material.opacity >= 0.01;
    if (pointsRef.current) pointsRef.current.visible = visible;
    if (!visible) return;

    if (!Number.isFinite(spawnCenter.current.x) || spawnCenter.current.distanceToSquared(center) > INSECT_RESPAWN_DISTANCE * INSECT_RESPAWN_DISTANCE) {
      respawn(center, timeOfDay ?? 12);
    }

    const t = clock.elapsedTime;
    for (let index = 0; index < INSECT_COUNT; index += 1) {
      const base = basePositions.current[index];
      const seed = seeds.current[index];
      const orbit = 0.14 + seededUnit(seed + 5) * 0.26;
      const speed = 0.75 + seededUnit(seed + 6) * 1.2;
      positions[index * 3] = base.x + Math.sin(t * speed + seed) * orbit + Math.sin(t * 2.1 + seed * 0.4) * 0.045;
      positions[index * 3 + 1] = base.y + Math.sin(t * (1.4 + seededUnit(seed + 7)) + seed * 0.2) * (0.08 + seededUnit(seed + 9) * 0.12);
      positions[index * 3 + 2] = base.z + Math.cos(t * speed * 0.8 + seed) * orbit;
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      visible={false}
      renderOrder={2}
      userData={{ renderSource: 'insect-motes', renderLabel: 'Dusk insect motes', renderKind: 'ambient-microfauna', noReflect: true }}
    />
  );
}

export function GroundedWorldFX({ enabled = true, waterRipples = true, terrainDust = true }) {
  return (
    <group userData={{ renderSource: 'grounded-world-fx', renderLabel: 'Grounded world FX', renderKind: 'ambient-vfx', noReflect: true }}>
      <WaterContactRipples enabled={enabled && waterRipples} />
      <WaterStepPlops enabled={enabled && waterRipples} />
      <TerrainDustPuffs enabled={terrainDust} />
      <PlayerSkidStreaks enabled={enabled} />
      <InsectMotes enabled={enabled} />
    </group>
  );
}
