'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { terrainBiomeAt, terrainHeight } from '../../world/terrain';
import { WATER_LEVEL } from '../../world/water';
import { isWetWeather } from '../../world/weatherStates';
import { onPropEvent } from '../../physics/props/propEvents';

const RIPPLE_COUNT = 48;
const INSECT_COUNT = 160;
const INSECT_RADIUS = 18;
const dummy = new THREE.Object3D();

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
      geometry.attributes.aBirth.needsUpdate = true;
      geometry.attributes.aIntensity.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [births, enabled, geometry, intensities]);

  useFrame(() => {
    material.uniforms.uTime.value = performance.now() / 1000;
    if (!enabled) return;
    const mesh = meshRef.current;
    if (!mesh) return;
    // Keep old ripples tucked just below the surface instead of testing them in
    // the fragment shader forever.
    const now = material.uniforms.uTime.value;
    let changed = false;
    ripples.current.forEach((ripple, index) => {
      if (ripple.birth < 0 || now - ripple.birth < 1.5) return;
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
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, RIPPLE_COUNT]}
      frustumCulled={false}
      renderOrder={3}
      userData={{ renderSource: 'player-water-ripples', renderLabel: 'Player water ripples', renderKind: 'water-contact-fx', noReflect: true }}
    />
  );
}

function InsectMotes({ enabled }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const spawnCenter = useRef(new THREE.Vector3(Infinity, 0, Infinity));
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
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const seed = seeds.current[index] + attempt * 101.9;
        const angle = seededUnit(seed) * Math.PI * 2;
        const radius = Math.sqrt(seededUnit(seed + 4.1)) * INSECT_RADIUS;
        const x = center.x + Math.cos(angle) * radius;
        const z = center.z + Math.sin(angle) * radius;
        const y = terrainHeight(x, z, currentZoneId);
        const biome = terrainBiomeAt(x, z, y, currentZoneId);
        const waterEdge = y < WATER_LEVEL + 0.42 && y > WATER_LEVEL - 0.95 ? 0.38 : 0;
        const weight = Math.max(insectBiomeWeight(biome), waterEdge);
        if (attempt < 7 && seededUnit(seed + 8.2) > weight) continue;
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
    const center = new THREE.Vector3(player.x, player.y || 0, player.z);
    activeRef.current = targetOpacity > 0.04;
    material.opacity = THREE.MathUtils.damp(material.opacity, activeRef.current ? Math.min(0.42, targetOpacity * 0.34) : 0, 3.2, delta);
    if (!activeRef.current && material.opacity < 0.01) return;

    if (!Number.isFinite(spawnCenter.current.x) || spawnCenter.current.distanceToSquared(center) > 7 * 7) {
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
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={2}
      userData={{ renderSource: 'insect-motes', renderLabel: 'Dusk insect motes', renderKind: 'ambient-microfauna', noReflect: true }}
    />
  );
}

export function GroundedWorldFX({ enabled = true, waterRipples = true }) {
  return (
    <group userData={{ renderSource: 'grounded-world-fx', renderLabel: 'Grounded world FX', renderKind: 'ambient-vfx', noReflect: true }}>
      <WaterContactRipples enabled={enabled && waterRipples} />
      <InsectMotes enabled={enabled} />
    </group>
  );
}
