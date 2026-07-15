'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { onPropEvent } from '../physics/props/propEvents';
import { dustPaletteForBiome } from '../components/player/playerFeedback';

const MAX_IMPACTS = 8;
const MAX_SMOKE = 3;
const FLASH_SPRITE_LIFETIME = 0.1;
const FLASH_LIGHT_LIFETIME = 0.14;
const FLASH_LIGHT_PEAK = 14;
const SMOKE_LIFETIME = 1.6;
const IMPACT_LIFETIME = 0.7;
const FOLIAGE_LIFETIME = 1.1;
const FAUNA_LIFETIME = 0.8;

const WOOD_CHIP_COLORS = ['#a67c4a', '#7a5a36', '#c39a63'];
const FOLIAGE_FLECK_COLORS = ['#5a7a3c', '#7a9a4e', '#3f5c2c'];
const FAUNA_PUFF_COLORS = ['#d8d2c0', '#bfb49b'];

function normalizeVec3(vec, fallback) {
  const x = vec?.x ?? fallback.x;
  const y = vec?.y ?? fallback.y;
  const z = vec?.z ?? fallback.z;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function seedHash(seedKey, index) {
  const base = typeof seedKey === 'string'
    ? seedKey.length * 78.233 + seedKey.charCodeAt(0) * 3.7
    : Number(seedKey) || 0;
  const n = Math.sin((index + 1) * 12.9898 + base) * 43758.5453;
  return n - Math.floor(n);
}

function reflectVec(dir, normal) {
  const dot = dir.x * normal.x + dir.y * normal.y + dir.z * normal.z;
  return {
    x: dir.x - 2 * dot * normal.x,
    y: dir.y - 2 * dot * normal.y,
    z: dir.z - 2 * dot * normal.z,
  };
}

function makeBurstVectors(seedKey, baseDir, count, opts = {}) {
  const {
    spreadMin = 0.26,
    spreadMax = 0.84,
    forwardMin = 0.32,
    forwardMax = 1.04,
    upMin = 0.18,
    upMax = 0.9,
  } = opts;
  const side = { x: -baseDir.z, z: baseDir.x };
  return Array.from({ length: count }, (_, index) => {
    const r = seedHash(seedKey, index);
    const r2 = seedHash(seedKey, index + 53);
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + r * 0.8;
    const scatter = spreadMin + r2 * (spreadMax - spreadMin);
    const forward = forwardMin + r * (forwardMax - forwardMin);
    return {
      x: baseDir.x * forward + side.x * Math.cos(angle) * scatter,
      y: upMin + r2 * (upMax - upMin),
      z: baseDir.z * forward + side.z * Math.sin(angle) * scatter,
      rotationRate: (r - 0.5) * 3.4,
      swayPhase: r2 * Math.PI * 2,
    };
  });
}

function makeSoftRadialTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSmokeParticles(id, count = 7) {
  return Array.from({ length: count }, (_, index) => {
    const r1 = seedHash(id, index);
    const r2 = seedHash(id, index + 97);
    const r3 = seedHash(id, index + 211);
    const jitterAngle = r1 * Math.PI * 2;
    const jitterRadius = 0.03 + r2 * 0.05;
    return {
      jitterX: Math.cos(jitterAngle) * jitterRadius,
      jitterY: 0.02 + r3 * 0.06,
      jitterZ: Math.sin(jitterAngle) * jitterRadius,
      curlPhase: r1 * Math.PI * 2,
      curlAmp: 0.12 + r2 * 0.18,
      speedScale: 0.78 + r3 * 0.4,
      sizeSeed: r2,
    };
  });
}

function floorCount(base, intensity, min = 2) {
  return Math.max(min, Math.floor(base * THREE.MathUtils.clamp(intensity, 0.15, 1)));
}

function MuzzleFlash({ texture }) {
  const spriteRef = useRef(null);
  const lightRef = useRef(null);
  const state = useRef({ active: false, age: 0 });
  const colorStart = useMemo(() => new THREE.Color('#ffd9a0'), []);
  const colorEnd = useMemo(() => new THREE.Color('#ff9a4a'), []);
  const spriteMaterial = useMemo(() => new THREE.SpriteMaterial({
    map: texture,
    color: '#ffd9a0',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [texture]);

  useEffect(() => () => {
    spriteMaterial.dispose();
  }, [spriteMaterial]);

  useEffect(() => onPropEvent('shotgun-fired', event => {
    const position = event?.position;
    if (!position) return;
    if (spriteRef.current) {
      spriteRef.current.position.set(position.x, position.y, position.z);
      spriteRef.current.visible = true;
    }
    if (lightRef.current) {
      lightRef.current.position.set(position.x, position.y, position.z);
    }
    state.current.active = true;
    state.current.age = 0;
  }), []);

  useFrame((_, delta) => {
    const s = state.current;
    if (!s.active) return;
    s.age += delta;
    const age = s.age;

    if (spriteRef.current) {
      const spriteT = age / FLASH_SPRITE_LIFETIME;
      if (spriteT < 1) {
        spriteMaterial.opacity = 0.85 * (1 - spriteT);
        spriteMaterial.color.lerpColors(colorStart, colorEnd, THREE.MathUtils.clamp(spriteT, 0, 1));
        spriteRef.current.scale.setScalar(0.28 * (0.7 + spriteT * 0.5));
      } else if (spriteRef.current.visible) {
        spriteMaterial.opacity = 0;
        spriteRef.current.visible = false;
      }
    }

    if (lightRef.current) {
      const lightT = THREE.MathUtils.clamp(age / FLASH_LIGHT_LIFETIME, 0, 1);
      const ramp = lightT < 0.35 ? lightT / 0.35 : 1 - (lightT - 0.35) / 0.65;
      lightRef.current.intensity = Math.max(0, ramp) * FLASH_LIGHT_PEAK;
    }

    if (age >= FLASH_SPRITE_LIFETIME && age >= FLASH_LIGHT_LIFETIME) {
      s.active = false;
      if (lightRef.current) lightRef.current.intensity = 0;
    }
  });

  return (
    <group>
      <sprite ref={spriteRef} visible={false} material={spriteMaterial} renderOrder={6} />
      <pointLight
        ref={lightRef}
        color="#ffc878"
        intensity={0}
        distance={7}
        decay={2}
        castShadow={false}
      />
    </group>
  );
}

function SmokePlume({ event, texture, onExpired }) {
  const ageRef = useRef(0);
  const spriteRefs = useRef([]);
  const dir = useMemo(() => normalizeVec3(event.dir, { x: 0, y: 0, z: -1 }), [event.dir]);
  const particles = useMemo(() => makeSmokeParticles(event.id, 7), [event.id]);
  const disp = useMemo(() => particles.map(() => ({ x: 0, y: 0, z: 0 })), [particles]);
  const intensity = THREE.MathUtils.clamp(event.intensity ?? 1, 0.2, 1);
  const material = useMemo(() => new THREE.SpriteMaterial({
    map: texture,
    color: '#e6e1d6',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }), [texture]);

  useEffect(() => () => {
    material.dispose();
  }, [material]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const age = ageRef.current;
    if (age >= SMOKE_LIFETIME) {
      onExpired(event.id);
      return;
    }
    const progress = age / SMOKE_LIFETIME;
    const fadeIn = Math.min(1, age / 0.12);
    const fadeOut = Math.pow(1 - progress, 1.4);
    material.opacity = 0.34 * fadeIn * fadeOut * intensity;

    const speed = 0.8 * Math.exp(-1.1 * age);
    const upSpeed = 0.35 * Math.exp(-0.6 * age);
    const growth = Math.min(1, progress * 1.3);
    const size = THREE.MathUtils.lerp(0.22, 1.0, growth);

    particles.forEach((p, index) => {
      const d = disp[index];
      d.x += dir.x * speed * p.speedScale * delta;
      d.z += dir.z * speed * p.speedScale * delta;
      d.y += upSpeed * delta;
      const curl = Math.sin(age * 1.6 + p.curlPhase) * p.curlAmp * delta * 2;
      d.x += -dir.z * curl;
      d.z += dir.x * curl;

      const sprite = spriteRefs.current[index];
      if (!sprite) return;
      sprite.position.set(
        event.position.x + p.jitterX + d.x,
        event.position.y + p.jitterY + d.y,
        event.position.z + p.jitterZ + d.z,
      );
      sprite.scale.setScalar(size * (0.85 + p.sizeSeed * 0.3));
    });
  });

  return (
    <group>
      {particles.map((_, index) => (
        <sprite
          key={index}
          ref={mesh => { spriteRefs.current[index] = mesh; }}
          material={material}
          renderOrder={6}
        />
      ))}
    </group>
  );
}

function SmokeSystem({ texture }) {
  const [plumes, setPlumes] = useState([]);
  useEffect(() => onPropEvent('shotgun-fired', event => {
    const position = event?.position;
    if (!position) return;
    setPlumes(current => {
      const next = current.length >= MAX_SMOKE ? current.slice(1) : current;
      return [...next, {
        id: `smoke:${performance.now().toFixed(1)}:${current.length}`,
        position,
        dir: event.dir,
        intensity: event.intensity,
      }];
    });
  }), []);
  const expire = id => setPlumes(current => current.filter(event => event.id !== id));
  return (
    <group>
      {plumes.map(event => (
        <SmokePlume key={event.id} event={event} texture={texture} onExpired={expire} />
      ))}
    </group>
  );
}

function TerrainImpact({ event, onExpired }) {
  const ageRef = useRef(0);
  const ringRef = useRef(null);
  const chipRefs = useRef([]);
  const dir = useMemo(() => normalizeVec3(event.dir, { x: 0, y: 0, z: 1 }), [event.dir]);
  const palette = useMemo(() => dustPaletteForBiome(event.biome), [event.biome]);
  const intensity = THREE.MathUtils.clamp(event.intensity ?? 1, 0.15, 1);
  const chipCount = floorCount(6, intensity);
  const chips = useMemo(() => makeBurstVectors(event.id, { x: -dir.x, z: -dir.z }, chipCount, {
    spreadMin: 0.18, spreadMax: 0.5, forwardMin: 0.2, forwardMax: 0.62, upMin: 0.2, upMax: 0.72,
  }), [chipCount, dir, event.id]);

  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.24, 0.4, 28), []);
  const chipGeometry = useMemo(() => new THREE.CircleGeometry(0.045, 8), []);
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: palette.ring,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }), [palette.ring]);
  const chipMaterials = useMemo(() => chips.map((_, index) => new THREE.MeshBasicMaterial({
    color: palette.particles[index % palette.particles.length],
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })), [chips, palette.particles]);

  useEffect(() => () => {
    ringGeometry.dispose();
    chipGeometry.dispose();
    ringMaterial.dispose();
    chipMaterials.forEach(material => material.dispose());
  }, [chipGeometry, chipMaterials, ringGeometry, ringMaterial]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const age = ageRef.current;
    if (age >= IMPACT_LIFETIME) {
      onExpired(event.id);
      return;
    }
    const progress = age / IMPACT_LIFETIME;
    const fade = Math.pow(1 - progress, 1.5) * intensity;

    if (ringRef.current) {
      ringRef.current.scale.setScalar((0.5 + progress * 1.3) * (0.55 + intensity * 0.45));
      ringRef.current.material.opacity = fade * palette.opacity * 0.55;
    }
    chips.forEach((v, index) => {
      const mesh = chipRefs.current[index];
      if (!mesh) return;
      mesh.position.set(
        event.position.x + v.x * age,
        event.position.y + 0.04 + v.y * age - 2.2 * age * age,
        event.position.z + v.z * age,
      );
      mesh.material.opacity = fade * 0.48;
    });
  });

  return (
    <group>
      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[event.position.x, event.position.y + 0.03, event.position.z]}
        geometry={ringGeometry}
        material={ringMaterial}
        renderOrder={4}
      />
      {chips.map((_, index) => (
        <mesh
          key={index}
          ref={mesh => { chipRefs.current[index] = mesh; }}
          geometry={chipGeometry}
          material={chipMaterials[index]}
          renderOrder={5}
        />
      ))}
    </group>
  );
}

function RockImpact({ event, onExpired }) {
  const ageRef = useRef(0);
  const chipRefs = useRef([]);
  const dir = useMemo(() => normalizeVec3(event.dir, { x: 0, y: 0, z: 1 }), [event.dir]);
  const normal = useMemo(() => normalizeVec3(event.normal, { x: 0, y: 1, z: 0 }), [event.normal]);
  const intensity = THREE.MathUtils.clamp(event.intensity ?? 1, 0.15, 1);
  const hardBoulder = event.obstacleKind === 'boulder';
  const chipCount = floorCount(hardBoulder ? 12 : 5, intensity, hardBoulder ? 5 : 1);
  const sparkCount = floorCount(hardBoulder ? 12 : 2, intensity, hardBoulder ? 5 : 1);
  const chips = useMemo(() => makeBurstVectors(event.id, { x: -dir.x, z: -dir.z }, chipCount, {
    spreadMin: 0.2,
    spreadMax: hardBoulder ? 0.82 : 0.56,
    forwardMin: hardBoulder ? 0.46 : 0.24,
    forwardMax: hardBoulder ? 1.05 : 0.68,
    upMin: 0.22,
    upMax: hardBoulder ? 1.05 : 0.78,
  }), [chipCount, dir, event.id, hardBoulder]);
  const reflected = useMemo(() => reflectVec(dir, normal), [dir, normal]);
  const sparks = useMemo(() => makeBurstVectors(`${event.id}:sparks`, { x: reflected.x, z: reflected.z }, sparkCount, {
    spreadMin: 0.08,
    spreadMax: hardBoulder ? 0.38 : 0.2,
    forwardMin: hardBoulder ? 0.9 : 0.6,
    forwardMax: hardBoulder ? 1.85 : 1.1,
    upMin: 0.15,
    upMax: hardBoulder ? 0.78 : 0.5,
  }), [event.id, hardBoulder, reflected, sparkCount]);

  const chipGeometry = useMemo(() => new THREE.CircleGeometry(0.045, 6), []);
  const chipMaterials = useMemo(() => chips.map((_, index) => new THREE.MeshBasicMaterial({
    color: index % 2 === 0 ? '#6b6660' : '#4a4741',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })), [chips]);
  const sparkMaterial = useMemo(() => new THREE.LineBasicMaterial({
    color: '#ffd36a',
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  const sparkGeometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sparks.length * 2 * 3), 3));
    return buffer;
  }, [sparks.length]);

  useEffect(() => () => {
    chipGeometry.dispose();
    chipMaterials.forEach(material => material.dispose());
    sparkMaterial.dispose();
    sparkGeometry.dispose();
  }, [chipGeometry, chipMaterials, sparkGeometry, sparkMaterial]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const age = ageRef.current;
    if (age >= IMPACT_LIFETIME) {
      onExpired(event.id);
      return;
    }
    const progress = age / IMPACT_LIFETIME;
    const fade = Math.pow(1 - progress, 1.5) * intensity;

    chips.forEach((v, index) => {
      const mesh = chipRefs.current[index];
      if (!mesh) return;
      mesh.position.set(
        event.position.x + v.x * age,
        event.position.y + 0.04 + v.y * age - 2.6 * age * age,
        event.position.z + v.z * age,
      );
      mesh.material.opacity = fade * 0.5;
    });

    const sparkPositions = sparkGeometry.attributes.position;
    sparks.forEach((v, index) => {
      const base = index * 2;
      const leadAge = age;
      const tailAge = Math.max(0, age - 0.06);
      sparkPositions.setXYZ(
        base,
        event.position.x + v.x * leadAge,
        event.position.y + 0.08 + v.y * leadAge - 2.9 * leadAge * leadAge,
        event.position.z + v.z * leadAge,
      );
      sparkPositions.setXYZ(
        base + 1,
        event.position.x + v.x * tailAge,
        event.position.y + 0.08 + v.y * tailAge - 2.9 * tailAge * tailAge,
        event.position.z + v.z * tailAge,
      );
    });
    sparkPositions.needsUpdate = true;
    sparkMaterial.opacity = Math.pow(1 - progress, 2.1) * intensity;
  });

  return (
    <group>
      {chips.map((_, index) => (
        <mesh
          key={index}
          ref={mesh => { chipRefs.current[index] = mesh; }}
          geometry={chipGeometry}
          material={chipMaterials[index]}
          renderOrder={5}
        />
      ))}
      {Boolean(sparks.length) && (
        <lineSegments geometry={sparkGeometry} material={sparkMaterial} renderOrder={6} />
      )}
    </group>
  );
}

function WoodImpact({ event, onExpired }) {
  const ageRef = useRef(0);
  const puffRef = useRef(null);
  const chipRefs = useRef([]);
  const dir = useMemo(() => normalizeVec3(event.dir, { x: 0, y: 0, z: 1 }), [event.dir]);
  const intensity = THREE.MathUtils.clamp(event.intensity ?? 1, 0.15, 1);
  const chipCount = floorCount(6, intensity);
  const chips = useMemo(() => makeBurstVectors(event.id, { x: -dir.x, z: -dir.z }, chipCount, {
    spreadMin: 0.16, spreadMax: 0.46, forwardMin: 0.3, forwardMax: 0.78, upMin: 0.2, upMax: 0.7,
  }), [chipCount, dir, event.id]);
  const chipGeometry = useMemo(() => new THREE.PlaneGeometry(0.07, 0.02), []);
  const chipMaterials = useMemo(() => chips.map((_, index) => new THREE.MeshBasicMaterial({
    color: WOOD_CHIP_COLORS[index % WOOD_CHIP_COLORS.length],
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  })), [chips]);
  const puffGeometry = useMemo(() => new THREE.CircleGeometry(0.3, 16), []);
  const puffMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#c9b183',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }), []);

  useEffect(() => () => {
    chipGeometry.dispose();
    chipMaterials.forEach(material => material.dispose());
    puffGeometry.dispose();
    puffMaterial.dispose();
  }, [chipGeometry, chipMaterials, puffGeometry, puffMaterial]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const age = ageRef.current;
    if (age >= IMPACT_LIFETIME) {
      onExpired(event.id);
      return;
    }
    const progress = age / IMPACT_LIFETIME;
    const fade = Math.pow(1 - progress, 1.5) * intensity;

    chips.forEach((v, index) => {
      const mesh = chipRefs.current[index];
      if (!mesh) return;
      mesh.position.set(
        event.position.x + v.x * age,
        event.position.y + 0.05 + v.y * age - 2.4 * age * age,
        event.position.z + v.z * age,
      );
      mesh.rotation.z = v.rotationRate * age;
      mesh.material.opacity = fade * 0.5;
    });

    if (puffRef.current) {
      puffRef.current.scale.setScalar(0.6 + progress * 1.1);
      puffRef.current.material.opacity = fade * 0.18;
    }
  });

  return (
    <group>
      <mesh
        ref={puffRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[event.position.x, event.position.y + 0.05, event.position.z]}
        geometry={puffGeometry}
        material={puffMaterial}
        renderOrder={4}
      />
      {chips.map((_, index) => (
        <mesh
          key={index}
          ref={mesh => { chipRefs.current[index] = mesh; }}
          geometry={chipGeometry}
          material={chipMaterials[index]}
          renderOrder={5}
        />
      ))}
    </group>
  );
}

function FoliageImpact({ event, onExpired }) {
  const ageRef = useRef(0);
  const fleckRefs = useRef([]);
  const dir = useMemo(() => normalizeVec3(event.dir, { x: 0, y: 0, z: 1 }), [event.dir]);
  const intensity = THREE.MathUtils.clamp(event.intensity ?? 1, 0.15, 1);
  const fleckCount = floorCount(7, intensity);
  const flecks = useMemo(() => makeBurstVectors(event.id, dir, fleckCount, {
    spreadMin: 0.2, spreadMax: 0.58, forwardMin: 0.22, forwardMax: 0.6, upMin: 0.32, upMax: 0.85,
  }), [dir, fleckCount, event.id]);
  const popEnd = 0.26;

  const fleckGeometry = useMemo(() => new THREE.PlaneGeometry(0.06, 0.05), []);
  const fleckMaterials = useMemo(() => flecks.map((_, index) => new THREE.MeshBasicMaterial({
    color: FOLIAGE_FLECK_COLORS[index % FOLIAGE_FLECK_COLORS.length],
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  })), [flecks]);

  useEffect(() => () => {
    fleckGeometry.dispose();
    fleckMaterials.forEach(material => material.dispose());
  }, [fleckGeometry, fleckMaterials]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const age = ageRef.current;
    if (age >= FOLIAGE_LIFETIME) {
      onExpired(event.id);
      return;
    }
    const progress = age / FOLIAGE_LIFETIME;
    const fade = Math.pow(1 - progress, 1.3) * intensity;

    flecks.forEach((v, index) => {
      const mesh = fleckRefs.current[index];
      if (!mesh) return;
      let x;
      let y;
      let z;
      if (age <= popEnd) {
        x = event.position.x + v.x * age;
        y = event.position.y + 0.05 + v.y * age - 3.4 * age * age;
        z = event.position.z + v.z * age;
      } else {
        const settle = age - popEnd;
        const sway = Math.sin(settle * 3.4 + v.swayPhase) * 0.18;
        const popY = event.position.y + 0.05 + v.y * popEnd - 3.4 * popEnd * popEnd;
        x = event.position.x + v.x * popEnd + v.x * sway;
        y = popY - settle * 0.55;
        z = event.position.z + v.z * popEnd + v.z * sway;
      }
      mesh.position.set(x, y, z);
      mesh.rotation.z = v.rotationRate * age;
      mesh.material.opacity = fade * 0.5;
    });
  });

  return (
    <group>
      {flecks.map((_, index) => (
        <mesh
          key={index}
          ref={mesh => { fleckRefs.current[index] = mesh; }}
          geometry={fleckGeometry}
          material={fleckMaterials[index]}
          renderOrder={5}
        />
      ))}
    </group>
  );
}

function FaunaImpact({ event, texture, onExpired }) {
  const ageRef = useRef(0);
  const spriteRefs = useRef([]);
  const dir = useMemo(() => normalizeVec3(event.dir, { x: 0, y: 0, z: 1 }), [event.dir]);
  const intensity = THREE.MathUtils.clamp(event.intensity ?? 1, 0.15, 1);
  const puffCount = floorCount(5, intensity);
  const puffs = useMemo(() => makeBurstVectors(event.id, dir, puffCount, {
    spreadMin: 0.14, spreadMax: 0.34, forwardMin: 0.1, forwardMax: 0.28, upMin: 0.28, upMax: 0.6,
  }), [dir, event.id, puffCount]);
  const disp = useMemo(() => puffs.map(() => ({ x: 0, y: 0, z: 0 })), [puffs]);

  const materials = useMemo(() => puffs.map((_, index) => new THREE.SpriteMaterial({
    map: texture,
    color: FAUNA_PUFF_COLORS[index % FAUNA_PUFF_COLORS.length],
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })), [puffs, texture]);

  useEffect(() => () => {
    materials.forEach(material => material.dispose());
  }, [materials]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const age = ageRef.current;
    if (age >= FAUNA_LIFETIME) {
      onExpired(event.id);
      return;
    }
    const progress = age / FAUNA_LIFETIME;
    const fadeIn = Math.min(1, age / 0.08);
    const fadeOut = Math.pow(1 - progress, 1.6);
    const opacity = 0.3 * fadeIn * fadeOut * intensity;

    const drift = 0.55 * Math.exp(-1.4 * age);
    const lift = 0.4 * Math.exp(-0.8 * age);
    const size = THREE.MathUtils.lerp(0.14, 0.34, Math.min(1, progress * 1.4));

    puffs.forEach((v, index) => {
      const d = disp[index];
      d.x += v.x * drift * delta;
      d.z += v.z * drift * delta;
      d.y += lift * delta;
      const sprite = spriteRefs.current[index];
      if (!sprite) return;
      sprite.position.set(
        event.position.x + d.x,
        event.position.y + 0.06 + d.y,
        event.position.z + d.z,
      );
      sprite.scale.setScalar(size);
      materials[index].opacity = opacity;
    });
  });

  return (
    <group>
      {puffs.map((_, index) => (
        <sprite
          key={index}
          ref={mesh => { spriteRefs.current[index] = mesh; }}
          material={materials[index]}
          renderOrder={6}
        />
      ))}
    </group>
  );
}

function ImpactBurst({ event, texture, onExpired }) {
  switch (event.surface) {
    case 'terrain':
      return <TerrainImpact event={event} onExpired={onExpired} />;
    case 'rock':
      return <RockImpact event={event} onExpired={onExpired} />;
    case 'wood':
    case 'structure':
      return <WoodImpact event={event} onExpired={onExpired} />;
    case 'foliage':
      return <FoliageImpact event={event} onExpired={onExpired} />;
    case 'fauna':
      return <FaunaImpact event={event} texture={texture} onExpired={onExpired} />;
    default:
      return null;
  }
}

const TRACER_LIFETIME = 0.09;

// One-frame-ish additive streak from muzzle to impact: pellets are invisible,
// so this line is what sells the causality between the bang and the burst.
function TracerSystem() {
  const lineRef = useRef(null);
  const state = useRef({ active: false, age: 0 });
  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return buffer;
  }, []);
  const material = useMemo(() => new THREE.LineBasicMaterial({
    color: '#ffe9b8',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => onPropEvent('shotgun-tracer', event => {
    if (!event?.from || !event?.to) return;
    const positions = geometry.attributes.position;
    positions.setXYZ(0, event.from.x, event.from.y, event.from.z);
    positions.setXYZ(1, event.to.x, event.to.y, event.to.z);
    positions.needsUpdate = true;
    state.current.active = true;
    state.current.age = 0;
  }), [geometry]);

  useFrame((_, delta) => {
    const s = state.current;
    if (!s.active) return;
    s.age += delta;
    if (s.age >= TRACER_LIFETIME) {
      s.active = false;
      material.opacity = 0;
      if (lineRef.current) lineRef.current.visible = false;
      return;
    }
    if (lineRef.current) lineRef.current.visible = true;
    material.opacity = 0.55 * (1 - s.age / TRACER_LIFETIME);
  });

  return <lineSegments ref={lineRef} visible={false} geometry={geometry} material={material} renderOrder={6} frustumCulled={false} />;
}

function ImpactSystem({ texture }) {
  const [events, setEvents] = useState([]);
  useEffect(() => onPropEvent('shotgun-impact', event => {
    if (!event?.position) return;
    setEvents(current => {
      const next = current.length >= MAX_IMPACTS ? current.slice(1) : current;
      return [...next, {
        id: `impact:${performance.now().toFixed(1)}:${current.length}`,
        ...event,
      }];
    });
  }), []);
  const expire = id => setEvents(current => current.filter(event => event.id !== id));
  return (
    <group>
      {events.map(event => (
        <ImpactBurst key={event.id} event={event} texture={texture} onExpired={expire} />
      ))}
    </group>
  );
}

export default function ShotgunFX() {
  const texture = useMemo(() => makeSoftRadialTexture(), []);

  useEffect(() => () => {
    texture.dispose();
  }, [texture]);

  return (
    <group userData={{ renderSource: 'shotgun-fx', renderLabel: 'Shotgun FX', renderKind: 'transient-fx' }}>
      <MuzzleFlash texture={texture} />
      <SmokeSystem texture={texture} />
      <ImpactSystem texture={texture} />
      <TracerSystem />
    </group>
  );
}
