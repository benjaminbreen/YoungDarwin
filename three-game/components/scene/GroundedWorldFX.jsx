'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { terrainBiomeAt, terrainColor, terrainHeight } from '../../world/terrain';
import { getSurfaceContactProfile, isWaterSurfaceContact } from '../../world/surfaceContact';
import { resolveSurfaceContactResponse } from '../../world/surfaceContactResponse';
import { WATER_LEVEL } from '../../world/water';
import { isWetWeather } from '../../world/weatherStates';
import { skyState, sunDirection } from '../../world/celestial';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { onPropEvent } from '../../physics/props/propEvents';
import { Pollinators } from './ecology/Pollinators';

const RIPPLE_COUNT = 48;
const WATER_STEP_COUNT = 36;
const DUST_RING_COUNT = 52;
const DUST_POINT_COUNT = 360;
const SKID_STREAK_COUNT = 32;
const INSECT_COUNT = 48;
const INSECT_RADIUS = 16;
const INSECT_RESPAWN_DISTANCE = 11;
const INSECT_PLACEMENT_ATTEMPTS = 6;
const MOTE_COUNT = 130;
const MOTE_RADIUS = 11;
const MOTE_RESPAWN_DISTANCE = 8;
const SPARKLE_COUNT = 380;
const SPARKLE_RADIUS = 20;
const SPARKLE_RESPAWN_DISTANCE = 10;
const SPARKLE_PLACEMENT_ATTEMPTS = 5;
const SALTATION_COUNT = 150;
const SALTATION_RADIUS = 15;
const SALTATION_RESPAWN_DISTANCE = 7;
const SALTATION_PLACEMENT_ATTEMPTS = 5;
const dummy = new THREE.Object3D();
const VOLCANIC_DUST_TINT = new THREE.Color('#75472f');
const NIGHT_DUST_TINT = new THREE.Color('#536071');

function litTerrainDustColor(target, source, groundColor, biome, sky) {
  const biomeName = String(biome || '').toLowerCase();
  const warmVolcanicGround = /red|cinder|ash|tuff|mirador/.test(biomeName);
  target.set(source).lerp(groundColor, warmVolcanicGround ? 0.56 : 0.4);
  if (warmVolcanicGround) target.lerp(VOLCANIC_DUST_TINT, 0.44);
  // The dust shader is intentionally unlit, so apply the world's celestial
  // illumination here. A low floor preserves a moonlit silhouette without
  // allowing pale particles to look emissive after sunset.
  const night = THREE.MathUtils.clamp(sky.night || 0, 0, 1);
  const illumination = THREE.MathUtils.clamp(
    0.2 + (sky.daylight || 0) * 0.8 + (sky.moonlight || 0) * 0.14,
    0.2,
    1,
  );
  target.lerp(NIGHT_DUST_TINT, night * 0.08);
  target.multiplyScalar(illumination);
  return target;
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

function insectBiomeWeight(biome) {
  if (biome === 'wet-mud' || biome === 'salt-scrub' || biome === 'sesuvium-flat') return 1;
  if (biome === 'dry-scrub' || biome === 'palo-santo' || biome === 'grass' || biome === 'saltgrass') return 0.72;
  if (biome === 'green-beach' || biome === 'olivine-trail' || biome === 'trail') return 0.48;
  if (biome === 'wet-basalt' || biome === 'black-lava' || biome === 'ash-slope') return 0.32;
  return 0.18;
}

// Where ground glitter lives: quartz-bright coral sand, olivine crystals on
// the green beaches, glassy flecks in fresh lava. Zero on mud — wet ground
// gets its sparkle from the waterline band below instead.
function sparkleBiomeWeight(biome) {
  if (biome === 'white-sand' || biome === 'sand') return 1.05;
  if (biome === 'green-beach' || biome === 'olivine-trail') return 1.12;
  if (biome === 'black-sand') return 1.32;
  if (biome === 'black-lava' || biome === 'lava-shelf') return 1.25;
  if (biome === 'wet-basalt') return 1.15;
  if (biome === 'dry-scrub' || biome === 'salt-scrub' || biome === 'trail') return 0.24;
  if (biome === 'tuff-ridge' || biome === 'ash-slope' || biome === 'tuff-rim') return 0.2;
  if (biome === 'wet-mud' || biome === 'sesuvium-flat') return 0;
  return 0.12;
}

function saltationBiomeProfile(biome) {
  const name = String(biome || '').toLowerCase();
  if (/wet|mud|water|pool|lagoon|swim|grass|meadow|scrub/.test(name)) return null;
  if (/black.sand|black.dune|ash.beach/.test(name)) return { weight: 1, color: '#66594d' };
  if (/sand|dune|beach/.test(name)) {
    return { weight: 1, color: '#c7b88c' };
  }
  if (/red.cinder|scoria/.test(name)) return { weight: 0.92, color: '#7b4b35' };
  if (/ash|tuff/.test(name)) return { weight: 0.86, color: '#806f5a' };
  if (/trail|path|dry.wash|dusty|clearing/.test(name)) return { weight: 0.3, color: '#948064' };
  return null;
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

// Compatibility/debug renderer. The active ocean and standing-water surfaces
// now consume these events directly, so this is intentionally not mounted by
// GroundedWorldFX.
export function WaterContactRipples({ enabled }) {
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

// Compatibility/debug renderer; see WaterContactRipples above.
export function WaterStepPlops({ enabled }) {
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

function SurfaceContactFX({ enabled }) {
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
          float soft = 1.0 - smoothstep(0.06, 0.5, d);
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
    return onPropEvent('surface-contact', event => {
      if (!event?.position) return;
      const kind = event.kind || 'dust';
      const x = event.position.x;
      const z = event.position.z;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const rawY = Number.isFinite(event.position.y)
        ? event.position.y
        : terrainHeight(x, z, currentZoneId) + 0.04;
      // Terrain contacts arrive at the smoothed movement height. Raise their
      // visual response to the rendered height so relief cannot bury marks or
      // an entire dust burst; higher obstacle/prop impacts remain untouched.
      const contactY = Math.max(rawY, terrainHeight(x, z, currentZoneId));
      if (contactY < WATER_LEVEL - 0.02) return;
      const biome = event.biome || terrainBiomeAt(x, z, contactY, currentZoneId);
      const profile = event.surfaceProfile || getSurfaceContactProfile({
        x,
        z,
        y: contactY,
        zoneId: currentZoneId,
        biome,
      });
      if (isWaterSurfaceContact(profile)) return;
      const response = resolveSurfaceContactResponse(profile, event);
      if (response.strength <= 0.025) return;
      const { timeOfDay, day } = useThreeGameStore.getState();
      const contactSky = skyState(timeOfDay ?? 12, day || 1);
      const contactGroundColor = terrainColor(x, z, contactY, currentZoneId);

      const direction = eventDirection(event);
      const fallSpeed = Math.max(0, event.fallSpeed || 0);
      const travelDistance = Math.max(0, event.travelDistance || 0);
      const horizontalSpeed = Math.max(0, event.horizontalSpeed || 0);
      const skidContact = kind === 'skid' || kind === 'scramble';
      const runningJump = kind === 'landing-jump' && event.runningJump === true;
      const intensity = response.strength;
      const now = performance.now() / 1000;
      const y = contactY + 0.055;
      const particleTotal = response.particleScale > 0
        ? Math.round(THREE.MathUtils.clamp(
          ((kind === 'footstep' ? 8 : skidContact ? 11 : 3)
            + intensity * (skidContact ? 34 : 22)
            + travelDistance * (runningJump ? 1.4 : 0.5)
            + fallSpeed * (runningJump ? 0.62 : 0.3)
            + (runningJump ? 16 : 0)) * response.particleScale,
          1,
          runningJump ? 74 : kind === 'landing' || kind === 'landing-jump' ? 48 : skidContact ? 58 : 32,
        ))
        : 0;
      const radiusScale = event.radiusScale || 1;
      const ringLife = THREE.MathUtils.clamp(
        (0.72 + intensity * 0.58 + travelDistance * 0.022) * response.lifeScale,
        0.35,
        1.8,
      );
      const baseRadius = (0.58 + intensity * 0.58 + Math.min(travelDistance, 8) * 0.05) * radiusScale;
      if (response.showRing) {
        const ringIndex = ringCursor.current;
        ringCursor.current = (ringCursor.current + 1) % DUST_RING_COUNT;
        dummy.position.set(x, y - 0.022, z);
        dummy.rotation.set(0, direction.yaw, 0);
        dummy.scale.set(baseRadius, 1, baseRadius * (kind === 'skid' || kind === 'scramble' ? 0.58 : 0.82));
        dummy.updateMatrix();
        ringRef.current?.setMatrixAt(ringIndex, dummy.matrix);
        litTerrainDustColor(
          scratchColor.current,
          response.ringColor,
          contactGroundColor,
          biome,
          contactSky,
        );
        ringData.colors[ringIndex * 3] = scratchColor.current.r;
        ringData.colors[ringIndex * 3 + 1] = scratchColor.current.g;
        ringData.colors[ringIndex * 3 + 2] = scratchColor.current.b;
        ringData.births[ringIndex] = now;
        ringData.intensities[ringIndex] = intensity * response.opacity * response.ringStrength;
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
      }

      const driftBase = Math.min(0.85, horizontalSpeed / 14 + travelDistance / 28);
      const directionAngle = Math.atan2(direction.z, direction.x);
      for (let i = 0; i < particleTotal; i += 1) {
        const index = pointCursor.current;
        pointCursor.current = (pointCursor.current + 1) % DUST_POINT_COUNT;
        const seed = now * 97.3 + index * 17.17 + i * 11.7;
        const radial = seededUnit(seed + 0.4);
        const landingSpread = kind === 'landing' || kind === 'landing-jump';
        const angle = landingSpread && !runningJump
          ? seededUnit(seed + 1.2) * Math.PI * 2
          : directionAngle + Math.PI + (seededUnit(seed + 1.2) - 0.5) * Math.PI * (runningJump ? 1.55 : 1.2);
        const startRadius = (0.05 + radial * (0.18 + intensity * 0.16)) * radiusScale;
        const speed = (0.18 + seededUnit(seed + 2.1) * 0.42 + intensity * 0.3 + driftBase * 0.18)
          * (landingSpread ? 0.86 : 1)
          * response.lateralScale;
        const sideDrift = seededUnit(seed + 6.8) - 0.5;
        const color = litTerrainDustColor(
          scratchColor.current,
          response.particles[index % response.particles.length],
          contactGroundColor,
          biome,
          contactSky,
        );
        pointData.positions[index * 3] = x + Math.cos(angle) * startRadius;
        pointData.positions[index * 3 + 1] = y + seededUnit(seed + 3.7) * 0.035;
        pointData.positions[index * 3 + 2] = z + Math.sin(angle) * startRadius;
        pointData.velocities[index * 3] = Math.cos(angle) * speed - direction.x * driftBase * 0.12 + (-direction.z) * sideDrift * 0.08;
        pointData.velocities[index * 3 + 1] = (0.04 + seededUnit(seed + 4.8) * (0.16 + intensity * 0.12))
          * response.liftScale;
        pointData.velocities[index * 3 + 2] = Math.sin(angle) * speed - direction.z * driftBase * 0.12 + direction.x * sideDrift * 0.08;
        pointData.colors[index * 3] = color.r;
        pointData.colors[index * 3 + 1] = color.g;
        pointData.colors[index * 3 + 2] = color.b;
        pointData.births[index] = now;
        pointData.lifes[index] = THREE.MathUtils.clamp(
          (0.52 + intensity * 0.52 + seededUnit(seed + 5.2) * 0.22) * response.lifeScale,
          0.28,
          1.9,
        );
        const motionScale = kind === 'footstep'
          ? 1.18 + Math.min(0.24, horizontalSpeed / 28)
          : runningJump ? 1.22 : skidContact ? 1.12 : 1;
        pointData.sizes[index] = (0.15 + seededUnit(seed + 7.1) * 0.14 + intensity * 0.28)
          * (landingSpread ? 1.28 : 1.08)
          * radiusScale
          * response.sizeScale
          * motionScale;
        pointData.alphas[index] = THREE.MathUtils.clamp(
          response.opacity * response.alphaScale * (0.98 + intensity),
          0.1,
          0.84,
        );
      }
      if (particleTotal > 0) {
        pointData.geometry.attributes.position.needsUpdate = true;
        pointData.geometry.attributes.aVelocity.needsUpdate = true;
        pointData.geometry.attributes.aColor.needsUpdate = true;
        pointData.geometry.attributes.aBirth.needsUpdate = true;
        pointData.geometry.attributes.aLife.needsUpdate = true;
        pointData.geometry.attributes.aSize.needsUpdate = true;
        pointData.geometry.attributes.aAlpha.needsUpdate = true;
        if (pointsRef.current) pointsRef.current.visible = true;
      }
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
    <group userData={{ renderSource: 'surface-contact-fx', renderLabel: 'Surface contact effects', renderKind: 'terrain-contact-fx', noReflect: true }}>
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
          float a = width * taper * broken * pow(vFade, 1.8) * (0.12 + vIntensity * 0.3);
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
  const pointSeeds = useMemo(
    () => new Float32Array(Array.from({ length: INSECT_COUNT }, (_, index) => seededUnit(index * 37.17 + 19.4))),
    [],
  );
  const activeRef = useRef(false);

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */`
      attribute vec3 color;
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vPulse;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vColor = color;
        // A small irregular shimmer suggests wings catching the last light;
        // it is deliberately too restrained to read as a firefly blink.
        vPulse = 0.84 + 0.16 * sin(uTime * (0.75 + aSeed * 0.8) + aSeed * 17.0);
        float apparent = (5.2 / max(1.0, -mv.z)) * (0.75 + aSeed * 0.35);
        gl_PointSize = clamp(apparent, 0.48, 1.45) * uPixelRatio;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vPulse;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float radius = length(c);
        if (radius > 0.5) discard;
        float core = smoothstep(0.32, 0.035, radius);
        float wingHalo = smoothstep(0.5, 0.12, radius) * 0.16;
        float alpha = (core + wingHalo) * uOpacity * vPulse;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(vColor * (0.62 + vPulse * 0.16), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(pointSeeds, 1));
    return geo;
  }, [colors, pointSeeds, positions]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

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
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uOpacity.value = THREE.MathUtils.damp(
      material.uniforms.uOpacity.value,
      activeRef.current ? Math.min(0.17, targetOpacity * 0.16) : 0,
      3.2,
      delta,
    );
    const visible = activeRef.current || material.uniforms.uOpacity.value >= 0.006;
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

// Daytime air-sparkle: drifting dust/pollen motes around the player that
// mostly sit as a faint haze, with a few at any moment catching the sun and
// flaring past 1.0 so the bloom pass gives them a halo. Companion to
// InsectMotes (which owns dawn/dusk); this one is gated by full daylight and
// leans warmer/brighter through golden hour.
function SunlitMotes({ enabled }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const pointsRef = useRef(null);
  const spawnCenter = useRef(new THREE.Vector3(Infinity, 0, Infinity));
  const centerScratch = useRef(new THREE.Vector3());
  const seeds = useRef(Array.from({ length: MOTE_COUNT }, (_, index) => index * 23.71 + 5.9));
  const basePositions = useRef(Array.from({ length: MOTE_COUNT }, () => new THREE.Vector3(0, -100, 0)));

  const { geometry, material, positions } = useMemo(() => {
    const positionArray = new Float32Array(MOTE_COUNT * 3);
    const seedArray = new Float32Array(MOTE_COUNT);
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      positionArray[i * 3 + 1] = -100;
      seedArray[i] = i * 23.71 + 5.9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seedArray, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uGate: { value: 0 },
        uGolden: { value: 0 },
        uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime;
        uniform float uGate;
        uniform float uGolden;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vBright;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float twinkleSpeed = 0.45 + fract(aSeed * 0.173) * 0.9;
          float twinkle = pow(0.5 + 0.5 * sin(uTime * twinkleSpeed * 1.3 + aSeed * 7.31), 16.0);
          // Dust in the light, not snow: stays warm and dim, and even the
          // twinkle peak only grazes the bloom threshold at golden hour.
          vBright = 0.26 + twinkle * (0.5 + uGolden * 0.72);
          vAlpha = uGate * (0.055 + twinkle * 0.3);
          float perspective = clamp(150.0 / max(1.0, -mvPosition.z), 8.0, 90.0);
          float size = 0.02 + twinkle * 0.011;
          gl_PointSize = size * perspective * uPixelRatio;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uGolden;
        varying float vAlpha;
        varying float vBright;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float soft = smoothstep(0.5, 0.08, length(c));
          float a = soft * vAlpha;
          if (a < 0.005) discard;
          vec3 tint = mix(vec3(1.0, 0.86, 0.6), vec3(1.0, 0.75, 0.44), uGolden);
          gl_FragColor = vec4(tint * vBright, a);
        }
      `,
    });
    return { geometry: geo, material: mat, positions: positionArray };
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    spawnCenter.current.set(Infinity, 0, Infinity);
  }, [currentZoneId]);

  function respawn(center) {
    spawnCenter.current.copy(center);
    for (let index = 0; index < MOTE_COUNT; index += 1) {
      const seed = seeds.current[index];
      const angle = seededUnit(seed) * Math.PI * 2;
      const radius = Math.sqrt(seededUnit(seed + 4.1)) * MOTE_RADIUS;
      const x = center.x + Math.cos(angle) * radius;
      const z = center.z + Math.sin(angle) * radius;
      const ground = terrainHeight(x, z, currentZoneId);
      if (ground < WATER_LEVEL - 0.4) {
        basePositions.current[index].set(x, -100, z);
        continue;
      }
      basePositions.current[index].set(x, ground + 0.35 + seededUnit(seed + 9.4) * 2.8, z);
    }
  }

  useFrame(({ clock, camera }, delta) => {
    const { timeOfDay, day } = useThreeGameStore.getState();
    const sky = skyState(timeOfDay ?? 12, day || 1);
    const airGate = Math.max(0, 1 - weatherEnv.overcast * 0.7)
      * Math.max(0, 1 - weatherEnv.rainIntensity)
      * Math.max(0, 1 - weatherEnv.mistAmount * 0.5);
    // Primarily a low-sun phenomenon — dust catches slanting light. Midday
    // keeps only a faint trace so the sky stays clean.
    const targetGate = enabled ? sky.daylight * airGate * (0.15 + sky.golden * 0.85) : 0;
    material.uniforms.uGate.value = THREE.MathUtils.damp(material.uniforms.uGate.value, targetGate, 3.2, delta);
    material.uniforms.uGolden.value = THREE.MathUtils.damp(material.uniforms.uGolden.value, sky.golden, 3.2, delta);
    material.uniforms.uTime.value = clock.elapsedTime;
    const visible = material.uniforms.uGate.value > 0.02;
    if (pointsRef.current) pointsRef.current.visible = visible;
    if (!visible) return;

    const pose = getRuntimePlayerPose();
    const player = pose.position || { x: camera.position.x, y: 0, z: camera.position.z };
    const center = centerScratch.current.set(player.x, player.y || 0, player.z);
    if (!Number.isFinite(spawnCenter.current.x) || spawnCenter.current.distanceToSquared(center) > MOTE_RESPAWN_DISTANCE * MOTE_RESPAWN_DISTANCE) {
      respawn(center);
    }

    // Lazy drift: a shared breeze heading plus per-mote wander, so the field
    // reads as air moving rather than particles orbiting fixed anchors.
    const t = clock.elapsedTime;
    const breezeX = Math.sin(t * 0.07) * 1.4;
    const breezeZ = Math.cos(t * 0.055) * 1.4;
    for (let index = 0; index < MOTE_COUNT; index += 1) {
      const base = basePositions.current[index];
      const seed = seeds.current[index];
      const wander = 0.3 + seededUnit(seed + 5) * 0.55;
      const speed = 0.16 + seededUnit(seed + 6) * 0.24;
      positions[index * 3] = base.x + breezeX + Math.sin(t * speed + seed) * wander;
      positions[index * 3 + 1] = base.y + Math.sin(t * (0.22 + seededUnit(seed + 7) * 0.3) + seed * 0.7) * 0.5;
      positions[index * 3 + 2] = base.z + breezeZ + Math.cos(t * speed * 0.85 + seed) * wander;
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
      userData={{ renderSource: 'sunlit-motes', renderLabel: 'Sunlit air motes', renderKind: 'ambient-vfx', noReflect: true }}
    />
  );
}

// Trade-wind saltation: tiny sand/ash grains travel in low ballistic hops and
// vanish at either end of their path. Placement and color come from the live
// terrain biome, while wind and rain come from the shared weather director.
// The low particle count and shader-only motion keep this cheaper than a CPU
// particle system while avoiding a decorative loop on wet/vegetated ground.
function WindborneSaltation({ enabled }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const pointsRef = useRef(null);
  const spawnCenter = useRef(new THREE.Vector3(Infinity, 0, Infinity));
  const centerScratch = useRef(new THREE.Vector3());
  const windScratch = useRef(new THREE.Vector2(-0.55, -0.83));
  const grainColor = useRef(new THREE.Color());
  const profileColor = useRef(new THREE.Color());
  const seeds = useRef(Array.from({ length: SALTATION_COUNT }, (_, index) => index * 53.71 + 5.3));

  const { geometry, material, positions, weights, colors } = useMemo(() => {
    const positionArray = new Float32Array(SALTATION_COUNT * 3);
    const seedArray = new Float32Array(SALTATION_COUNT);
    const weightArray = new Float32Array(SALTATION_COUNT);
    const colorArray = new Float32Array(SALTATION_COUNT * 3);
    for (let index = 0; index < SALTATION_COUNT; index += 1) {
      positionArray[index * 3 + 1] = -100;
      seedArray[index] = index * 53.71 + 5.3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seedArray, 1));
    geo.setAttribute('aWeight', new THREE.BufferAttribute(weightArray, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colorArray, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uGate: { value: 0 },
        uLight: { value: 1 },
        uWind: { value: new THREE.Vector2(-0.55, -0.83).normalize() },
        uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        attribute float aWeight;
        attribute vec3 aColor;
        uniform float uTime;
        uniform float uGate;
        uniform float uLight;
        uniform vec2 uWind;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float variation = fract(aSeed * 0.371);
          float phase = fract(uTime * (0.24 + variation * 0.2) + fract(aSeed * 0.113));
          float envelope = sin(phase * 3.14159265);
          float travel = (phase - 0.5) * (1.25 + variation * 1.65);
          vec2 crossWind = vec2(-uWind.y, uWind.x);
          vec3 moved = position;
          moved.xz += uWind * travel;
          moved.xz += crossWind * sin(phase * 6.2831853 + aSeed) * 0.045;
          moved.y += pow(max(envelope, 0.0), 1.6) * (0.025 + aWeight * 0.072);
          vec4 mvPosition = modelViewMatrix * vec4(moved, 1.0);
          float perspective = clamp(170.0 / max(1.0, -mvPosition.z), 8.0, 80.0);
          gl_PointSize = clamp((0.035 + variation * 0.018) * perspective * uPixelRatio, 0.8, 3.8);
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = pow(max(envelope, 0.0), 0.7) * uGate * (0.25 + aWeight * 0.38);
          vColor = aColor * uLight;
        }
      `,
      fragmentShader: /* glsl */`
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec2 grain = (gl_PointCoord - 0.5) * vec2(0.82, 1.35);
          float alpha = smoothstep(0.48, 0.08, length(grain)) * vAlpha;
          if (alpha < 0.008) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });
    return {
      geometry: geo,
      material: mat,
      positions: positionArray,
      weights: weightArray,
      colors: colorArray,
    };
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    spawnCenter.current.set(Infinity, 0, Infinity);
  }, [currentZoneId]);

  function respawn(center) {
    spawnCenter.current.copy(center);
    for (let index = 0; index < SALTATION_COUNT; index += 1) {
      let placed = false;
      weights[index] = 0;
      for (let attempt = 0; attempt < SALTATION_PLACEMENT_ATTEMPTS; attempt += 1) {
        const seed = seeds.current[index] + attempt * 73.9;
        const angle = seededUnit(seed) * Math.PI * 2;
        const radius = Math.sqrt(seededUnit(seed + 3.4)) * SALTATION_RADIUS;
        const x = center.x + Math.cos(angle) * radius;
        const z = center.z + Math.sin(angle) * radius;
        const y = terrainHeight(x, z, currentZoneId);
        if (y < WATER_LEVEL - 0.02) continue;
        const biome = terrainBiomeAt(x, z, y, currentZoneId);
        const profile = saltationBiomeProfile(biome);
        if (!profile) continue;
        if (attempt < SALTATION_PLACEMENT_ATTEMPTS - 1 && seededUnit(seed + 8.7) > profile.weight) continue;
        positions[index * 3] = x;
        positions[index * 3 + 1] = y + 0.028;
        positions[index * 3 + 2] = z;
        weights[index] = profile.weight;
        grainColor.current
          .copy(terrainColor(x, z, y, currentZoneId))
          .lerp(profileColor.current.set(profile.color), 0.72);
        colors[index * 3] = grainColor.current.r;
        colors[index * 3 + 1] = grainColor.current.g;
        colors[index * 3 + 2] = grainColor.current.b;
        placed = true;
        break;
      }
      if (!placed) positions[index * 3 + 1] = -100;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aWeight.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
  }

  useFrame(({ clock, camera }, delta) => {
    const { timeOfDay, day } = useThreeGameStore.getState();
    const sky = skyState(timeOfDay ?? 12, day || 1);
    const windGate = THREE.MathUtils.smoothstep(weatherEnv.windSpeed, 0.62, 1.42);
    const dryGate = Math.max(0, 1 - weatherEnv.rainIntensity * 1.25)
      * Math.max(0, 1 - weatherEnv.mistAmount * 0.7);
    const gust = THREE.MathUtils.clamp(
      0.62 + Math.sin(clock.elapsedTime * 0.37) * 0.24 + Math.sin(clock.elapsedTime * 0.91 + 1.7) * 0.14,
      0.18,
      1,
    );
    const targetGate = enabled ? windGate * dryGate * (0.48 + gust * 0.52) : 0;
    material.uniforms.uGate.value = THREE.MathUtils.damp(material.uniforms.uGate.value, targetGate, 2.7, delta);
    material.uniforms.uLight.value = THREE.MathUtils.damp(
      material.uniforms.uLight.value,
      0.16 + sky.daylight * 0.84 + sky.moonlight * 0.08,
      2.4,
      delta,
    );
    material.uniforms.uTime.value = clock.elapsedTime;
    windScratch.current.set(weatherEnv.windX, weatherEnv.windZ);
    if (windScratch.current.lengthSq() < 0.001) windScratch.current.set(-0.55, -0.83);
    material.uniforms.uWind.value.copy(windScratch.current.normalize());
    const visible = material.uniforms.uGate.value > 0.015;
    if (pointsRef.current) pointsRef.current.visible = visible;
    if (!visible) return;

    const pose = getRuntimePlayerPose();
    const player = pose.position || { x: camera.position.x, y: 0, z: camera.position.z };
    const center = centerScratch.current.set(player.x, player.y || 0, player.z);
    if (!Number.isFinite(spawnCenter.current.x)
      || spawnCenter.current.distanceToSquared(center) > SALTATION_RESPAWN_DISTANCE * SALTATION_RESPAWN_DISTANCE) {
      respawn(center);
    }
  });

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      visible={false}
      renderOrder={2}
      userData={{ renderSource: 'windborne-saltation', renderLabel: 'Windborne sand and ash', renderKind: 'ambient-vfx', noReflect: true }}
    />
  );
}

// Ground glitter: each point is a micro-facet (a quartz grain, an olivine
// crystal, a fleck of volcanic glass) with its own randomly tilted normal.
// The vertex shader runs a real half-vector specular against the live sun, so
// glints pop in and out as the camera or player moves — the way beach sand
// actually sparkles — instead of blinking on a timer. Peaks are pushed past
// 1.0 for the bloom pass. Placement is biome-weighted with a bonus band along
// the waterline for wet-sand glitter.
function GroundSparkles({ enabled }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const pointsRef = useRef(null);
  const spawnCenter = useRef(new THREE.Vector3(Infinity, 0, Infinity));
  const centerScratch = useRef(new THREE.Vector3());
  const sunScratch = useRef(new THREE.Vector3());
  const seeds = useRef(Array.from({ length: SPARKLE_COUNT }, (_, index) => index * 41.37 + 3.1));

  const { geometry, material, positions, facets, strengths } = useMemo(() => {
    const positionArray = new Float32Array(SPARKLE_COUNT * 3);
    const facetArray = new Float32Array(SPARKLE_COUNT * 3);
    const seedArray = new Float32Array(SPARKLE_COUNT);
    const strengthArray = new Float32Array(SPARKLE_COUNT);
    for (let i = 0; i < SPARKLE_COUNT; i += 1) {
      positionArray[i * 3 + 1] = -100;
      facetArray[i * 3 + 1] = 1;
      seedArray[i] = i * 41.37 + 3.1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
    geo.setAttribute('aFacet', new THREE.BufferAttribute(facetArray, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seedArray, 1));
    geo.setAttribute('aStrength', new THREE.BufferAttribute(strengthArray, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
        uGate: { value: 0 },
        uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */`
        attribute vec3 aFacet;
        attribute float aSeed;
        attribute float aStrength;
        uniform float uTime;
        uniform vec3 uSun;
        uniform float uGate;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vBright;
        void main() {
          vec3 viewDir = normalize(cameraPosition - position);
          vec3 hv = normalize(normalize(uSun) + viewDir);
          float alignment = max(dot(aFacet, hv), 0.0);
          float directionalGlint = pow(alignment, 34.0);
          // A very sparse micro-flash floor keeps volcanic glass legible when
          // no random facet happens to hit the exact half-vector. Directional
          // glint still dominates as soon as the camera crosses the sun path.
          float flashPhase = 0.5 + 0.5 * sin(uTime * (0.55 + fract(aSeed * 0.41) * 0.9) + aSeed * 2.13);
          float surfaceFlash = clamp((aStrength - 0.58) * 1.45, 0.0, 1.0);
          float glint = max(directionalGlint, pow(flashPhase, 20.0) * (0.035 + surfaceFlash * 0.09));
          // Slow shimmer keeps grains alive while standing still (heat haze,
          // micro-movement) without turning into a blink pattern.
          float shimmer = 0.72 + 0.28 * sin(uTime * (1.1 + fract(aSeed * 0.29) * 1.6) + aSeed);
          float surfaceStrength = 0.32 + clamp(aStrength, 0.0, 1.35) * 0.78;
          float intensity = glint * shimmer * uGate * surfaceStrength;
          vAlpha = clamp(intensity * 1.55, 0.0, 0.82);
          vBright = 1.0 + min(intensity, 1.0) * 0.9;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float perspective = clamp(160.0 / max(1.0, -mvPosition.z), 10.0, 110.0);
          float size = (0.032 + glint * 0.052) * mix(0.88, 1.08, clamp(aStrength, 0.0, 1.0));
          gl_PointSize = size * perspective * uPixelRatio;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */`
        varying float vAlpha;
        varying float vBright;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float core = smoothstep(0.32, 0.03, d);
          // Faint 4-point star flare on the hottest glints reads as "sparkle".
          float star = max(
            smoothstep(0.5, 0.0, abs(c.x)) * smoothstep(0.1, 0.0, abs(c.y)),
            smoothstep(0.5, 0.0, abs(c.y)) * smoothstep(0.1, 0.0, abs(c.x))
          ) * 0.3;
          float a = (core + star) * vAlpha;
          if (a < 0.006) discard;
          gl_FragColor = vec4(vec3(1.16, 1.12, 0.98) * vBright, a);
        }
      `,
    });
    return {
      geometry: geo,
      material: mat,
      positions: positionArray,
      facets: facetArray,
      strengths: strengthArray,
    };
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    spawnCenter.current.set(Infinity, 0, Infinity);
  }, [currentZoneId]);

  function respawn(center) {
    spawnCenter.current.copy(center);
    for (let index = 0; index < SPARKLE_COUNT; index += 1) {
      let placed = false;
      strengths[index] = 0;
      for (let attempt = 0; attempt < SPARKLE_PLACEMENT_ATTEMPTS; attempt += 1) {
        const seed = seeds.current[index] + attempt * 89.3;
        const angle = seededUnit(seed) * Math.PI * 2;
        const radius = Math.sqrt(seededUnit(seed + 4.1)) * SPARKLE_RADIUS;
        const x = center.x + Math.cos(angle) * radius;
        const z = center.z + Math.sin(angle) * radius;
        const y = terrainHeight(x, z, currentZoneId);
        if (y < WATER_LEVEL - 0.06) continue;
        const biome = terrainBiomeAt(x, z, y, currentZoneId);
        const wetBand = y < WATER_LEVEL + 0.55 ? 1.25 : 0;
        const weight = Math.max(sparkleBiomeWeight(biome), wetBand);
        if (attempt < SPARKLE_PLACEMENT_ATTEMPTS - 1 && seededUnit(seed + 8.2) > weight) continue;
        if (weight <= 0.01) continue;
        positions[index * 3] = x;
        positions[index * 3 + 1] = y + 0.05;
        positions[index * 3 + 2] = z;
        strengths[index] = weight;
        // Mostly-up facet with a random tilt: low sun lights grains between
        // the camera and the sun path; high sun favours near-flat grains.
        const tiltAngle = seededUnit(seed + 11.7) * Math.PI * 2;
        const tilt = seededUnit(seed + 13.9) * 0.55;
        const nx = Math.cos(tiltAngle) * tilt;
        const nz = Math.sin(tiltAngle) * tilt;
        const invLen = 1 / Math.hypot(nx, 1, nz);
        facets[index * 3] = nx * invLen;
        facets[index * 3 + 1] = invLen;
        facets[index * 3 + 2] = nz * invLen;
        placed = true;
        break;
      }
      if (!placed) positions[index * 3 + 1] = -100;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aFacet.needsUpdate = true;
    geometry.attributes.aStrength.needsUpdate = true;
  }

  useFrame(({ clock, camera }, delta) => {
    const { timeOfDay, day } = useThreeGameStore.getState();
    const sky = skyState(timeOfDay ?? 12, day || 1);
    const airGate = Math.max(0, 1 - weatherEnv.overcast * 0.45)
      * Math.max(0, 1 - weatherEnv.rainIntensity * 0.98);
    const targetGate = enabled ? sky.daylight * airGate : 0;
    material.uniforms.uGate.value = THREE.MathUtils.damp(material.uniforms.uGate.value, targetGate, 3.2, delta);
    material.uniforms.uTime.value = clock.elapsedTime;
    const visible = material.uniforms.uGate.value > 0.02;
    if (pointsRef.current) pointsRef.current.visible = visible;
    if (!visible) return;

    const sun = sunDirection(timeOfDay ?? 12, day || 1);
    material.uniforms.uSun.value.copy(sunScratch.current.set(sun[0], sun[1], sun[2]));

    const pose = getRuntimePlayerPose();
    const player = pose.position || { x: camera.position.x, y: 0, z: camera.position.z };
    const center = centerScratch.current.set(player.x, player.y || 0, player.z);
    if (!Number.isFinite(spawnCenter.current.x) || spawnCenter.current.distanceToSquared(center) > SPARKLE_RESPAWN_DISTANCE * SPARKLE_RESPAWN_DISTANCE) {
      respawn(center);
    }
  });

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      visible={false}
      renderOrder={2}
      userData={{ renderSource: 'ground-sparkles', renderLabel: 'Ground glitter facets', renderKind: 'ambient-vfx', noReflect: true }}
    />
  );
}

export function GroundedWorldFX({ enabled = true, terrainDust = true }) {
  return (
    <group userData={{ renderSource: 'grounded-world-fx', renderLabel: 'Grounded world FX', renderKind: 'ambient-vfx', noReflect: true }}>
      <SurfaceContactFX enabled={terrainDust} />
      <PlayerSkidStreaks enabled={enabled} />
      <InsectMotes enabled={enabled} />
      <SunlitMotes enabled={enabled} />
      <WindborneSaltation enabled={enabled} />
      <GroundSparkles enabled={enabled} />
      <Pollinators enabled={enabled} />
    </group>
  );
}
