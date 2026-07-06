'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BallCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { movementTerrainHeight, terrainBiomeAt } from '../../world/terrain';
import { getRuntimeObstacles } from '../../world/obstacles';
import { onPropEvent } from './propEvents';
import {
  getHammerMaterialProfile,
  groundHammerMaterial,
  inferHammerMaterial,
  resolveHammerOutcome,
  rockSampleKey,
  selectRockSampleTarget,
} from './rockSampling';

const CHIP_PROMPT_DISTANCE = 1.75;
const CHIP_MAX_AGE = 150;
const CHIP_FALL_CULL_Y = -18;
const BURST_LIFETIME = 1.05;
const IMPACT_FLASH_LIFETIME = 0.28;

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed, salt = 0) {
  const value = Math.sin((hashString(seed) + salt * 1013) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function normalize2(x, z, fallback = { x: 0, z: -1 }) {
  const length = Math.hypot(x, z);
  if (length < 0.001) return fallback;
  return { x: x / length, z: z / length };
}

function chipScaleForShape(shape, seed) {
  if (shape === 'flake') {
    return [
      1.42 + seededUnit(seed, 4) * 0.36,
      0.24 + seededUnit(seed, 5) * 0.16,
      0.78 + seededUnit(seed, 6) * 0.32,
    ];
  }
  if (shape === 'sliver') {
    return [
      0.82 + seededUnit(seed, 4) * 0.28,
      0.38 + seededUnit(seed, 5) * 0.16,
      1.38 + seededUnit(seed, 6) * 0.44,
    ];
  }
  if (shape === 'jagged') {
    return [
      0.92 + seededUnit(seed, 4) * 0.38,
      0.74 + seededUnit(seed, 5) * 0.3,
      0.72 + seededUnit(seed, 6) * 0.36,
    ];
  }
  return [
    1.0 + seededUnit(seed, 4) * 0.28,
    0.62 + seededUnit(seed, 5) * 0.25,
    0.78 + seededUnit(seed, 6) * 0.28,
  ];
}

function groundSampleKey(zoneId, material, x, z) {
  const qx = Math.round(x / 4) * 4;
  const qz = Math.round(z / 4) * 4;
  return `${zoneId || 'UNKNOWN'}:ground:${material}:${qx}:${qz}`;
}

function makeGroundSampleTarget(strike, zoneId, sampledRockIds = [], activeSourceKeys = []) {
  const facing = normalize2(strike.facing?.x, strike.facing?.z);
  const sourceX = strike.position?.x || 0;
  const sourceZ = strike.position?.z || 0;
  const x = sourceX + facing.x * 1.45;
  const z = sourceZ + facing.z * 1.45;
  const y = movementTerrainHeight(x, z, zoneId);
  const biome = terrainBiomeAt(x, z, y, zoneId);
  const material = groundHammerMaterial({ zoneId, biome });
  if (!material) return null;
  const key = groundSampleKey(zoneId, material, x, z);
  if (sampledRockIds.includes(key) || activeSourceKeys.includes(key)) return null;
  return {
    key,
    biome,
    groundSample: true,
    rock: {
      id: key,
      kind: 'rock',
      x,
      z,
      radius: 0.24,
      height: 0.22,
      colliderTop: 0.22,
      hammerProfile: material,
      groundSample: true,
    },
  };
}

function profileForTarget(target, zoneId) {
  const rock = target.rock;
  const y = movementTerrainHeight(rock.x || 0, rock.z || 0, zoneId);
  const biome = target.biome || terrainBiomeAt(rock.x || 0, rock.z || 0, y, zoneId);
  const material = inferHammerMaterial({ rock, zoneId, biome });
  return getHammerMaterialProfile(material);
}

function makeChipFromTarget(target, strike, zoneId, sequence, profile, outcome) {
  const rock = target.rock;
  const key = target.key || rockSampleKey(zoneId, rock.id);
  const radius = Math.max(0.38, rock.radius || 0.55);
  const playerX = strike.position?.x || 0;
  const playerZ = strike.position?.z || 0;
  const fallback = normalize2(-(strike.facing?.x || 0), -(strike.facing?.z || -1), { x: 0, z: 1 });
  const normal = normalize2(playerX - (rock.x || 0), playerZ - (rock.z || 0), fallback);
  const surfaceX = (rock.x || 0) + normal.x * radius * 0.92;
  const surfaceZ = (rock.z || 0) + normal.z * radius * 0.92;
  const groundY = movementTerrainHeight(surfaceX, surfaceZ, zoneId);
  const rockTop = rock.colliderTop ?? rock.height ?? 0.9;
  const hitY = target.groundSample
    ? groundY + 0.08
    : groundY + THREE.MathUtils.clamp(rockTop * 0.52, 0.35, 1.42);
  const seed = `${key}:${sequence}`;
  const side = { x: -normal.z, z: normal.x };
  const chipRadius = (0.15 + seededUnit(seed, 1) * 0.075) * (profile.shape === 'flake' ? 0.92 : 1);
  const outward = (1.15 + seededUnit(seed, 2) * 0.45) * (profile.impulseScale || 1);
  const sideways = (seededUnit(seed, 3) - 0.5) * 0.55 * (profile.impulseScale || 1);
  const colors = profile.colors?.length ? profile.colors : ['#30342f'];
  const fx = profile.fx || {};
  const dustCount = fx.dustCount ?? 12;
  const puffCount = fx.puffCount ?? 1;
  const sparkCount = fx.sparkCount ?? 0;

  return {
    id: `${key}:chip:${sequence}`,
    sourceRockKey: key,
    rockId: rock.id,
    zoneId,
    material: profile.material,
    specimenId: profile.specimenId,
    sampleNoun: profile.sampleNoun,
    promptText: profile.promptText,
    educationalNote: profile.educationalNote,
    outcome,
    position: {
      x: surfaceX + normal.x * (chipRadius + 0.12),
      y: hitY + 0.04,
      z: surfaceZ + normal.z * (chipRadius + 0.12),
    },
    scarPosition: {
      x: surfaceX + normal.x * 0.045,
      y: hitY,
      z: surfaceZ + normal.z * 0.045,
    },
    normal,
    radius: chipRadius,
    scale: chipScaleForShape(profile.shape, seed),
    color: colors[Math.floor(seededUnit(seed, 7) * colors.length) % colors.length],
    scarColor: profile.scarColor || '#171917',
    dustColor: profile.dustColor || '#5b5140',
    sparkColor: fx.sparkColor || '#ffd36a',
    puffSize: fx.puffSize || 0.16,
    dustSize: fx.dustSize || 0.045,
    impulse: {
      x: normal.x * outward + side.x * sideways,
      y: 1.05 + seededUnit(seed, 8) * 0.35,
      z: normal.z * outward + side.z * sideways,
    },
    torque: {
      x: (seededUnit(seed, 9) - 0.5) * 0.8,
      y: (seededUnit(seed, 10) - 0.5) * 0.55,
      z: (seededUnit(seed, 11) - 0.5) * 0.8,
    },
    burst: Array.from({ length: dustCount }, (_, index) => {
      const particleSeed = `${seed}:p:${index}`;
      const angle = seededUnit(particleSeed, 1) * Math.PI * 2;
      const speed = 0.35 + seededUnit(particleSeed, 2) * 1.1;
      return {
        x: Math.cos(angle) * speed * 0.35 + normal.x * (0.45 + seededUnit(particleSeed, 3) * 0.35),
        y: 0.25 + seededUnit(particleSeed, 4) * 0.85,
        z: Math.sin(angle) * speed * 0.35 + normal.z * (0.45 + seededUnit(particleSeed, 5) * 0.35),
      };
    }),
    puffs: Array.from({ length: puffCount }, (_, index) => {
      const puffSeed = `${seed}:puff:${index}`;
      const spread = 0.12 + seededUnit(puffSeed, 1) * 0.32;
      return {
        x: normal.x * (0.14 + seededUnit(puffSeed, 2) * 0.22) + side.x * (seededUnit(puffSeed, 3) - 0.5) * spread,
        y: 0.12 + seededUnit(puffSeed, 4) * 0.24,
        z: normal.z * (0.14 + seededUnit(puffSeed, 5) * 0.22) + side.z * (seededUnit(puffSeed, 6) - 0.5) * spread,
      };
    }),
    sparks: Array.from({ length: sparkCount }, (_, index) => {
      const sparkSeed = `${seed}:spark:${index}`;
      const lateral = (seededUnit(sparkSeed, 1) - 0.5) * 1.4;
      const speed = 1.0 + seededUnit(sparkSeed, 2) * 1.45;
      return {
        x: normal.x * speed + side.x * lateral,
        y: 0.38 + seededUnit(sparkSeed, 3) * 0.85,
        z: normal.z * speed + side.z * lateral,
      };
    }),
  };
}

function RockChipScar({ chip }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: chip.scarColor || '#171917',
    roughness: 0.96,
    metalness: 0,
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  const yaw = Math.atan2(chip.normal.x, chip.normal.z);
  return (
    <mesh
      position={[chip.scarPosition.x, chip.scarPosition.y, chip.scarPosition.z]}
      rotation={[0, yaw, 0]}
      scale={[chip.radius * 1.65, chip.radius * 1.05, 0.024]}
      material={material}
      renderOrder={2}
    >
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function RockChipImpactFlash({ chip }) {
  const groupRef = useRef(null);
  const ageRef = useRef(0);
  const flashMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: chip.sparkColor || '#ffd36a',
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), [chip.sparkColor]);
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: chip.dustColor || '#5b5140',
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [chip.dustColor]);

  useEffect(() => () => {
    flashMaterial.dispose();
    ringMaterial.dispose();
  }, [flashMaterial, ringMaterial]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const t = THREE.MathUtils.clamp(ageRef.current / IMPACT_FLASH_LIFETIME, 0, 1);
    if (groupRef.current) {
      groupRef.current.visible = t < 1;
      groupRef.current.scale.setScalar(0.28 + t * 0.92);
    }
    flashMaterial.opacity = 0.95 * Math.pow(1 - t, 2.5);
    ringMaterial.opacity = 0.34 * Math.pow(1 - t, 1.35);
  });

  const yaw = Math.atan2(chip.normal.x, chip.normal.z);
  const x = chip.scarPosition.x + chip.normal.x * 0.035;
  const y = chip.scarPosition.y + 0.015;
  const z = chip.scarPosition.z + chip.normal.z * 0.035;
  return (
    <group ref={groupRef} position={[x, y, z]} rotation={[0, yaw, 0]} renderOrder={4}>
      <mesh material={flashMaterial} scale={[chip.radius * 1.7, chip.radius * 1.7, 1]}>
        <circleGeometry args={[1, 24]} />
      </mesh>
      <mesh material={ringMaterial} scale={[chip.radius * 2.5, chip.radius * 2.5, 1]}>
        <ringGeometry args={[0.48, 1, 32]} />
      </mesh>
    </group>
  );
}

function RockChipBurst({ chip, onExpired }) {
  const ageRef = useRef(0);
  const material = useMemo(() => new THREE.PointsMaterial({
    color: chip.dustColor || '#5b5140',
    size: (chip.dustSize || 0.045) * 1.9,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  }), []);
  const puffMaterial = useMemo(() => new THREE.PointsMaterial({
    color: chip.dustColor || '#5b5140',
    size: (chip.puffSize || 0.18) * 2.1,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  }), []);
  const sparkMaterial = useMemo(() => new THREE.LineBasicMaterial({
    color: chip.sparkColor || '#ffd36a',
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  const geometry = useMemo(() => {
    const positions = new Float32Array(chip.burst.length * 3);
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return buffer;
  }, [chip.burst.length]);
  const puffGeometry = useMemo(() => {
    const positions = new Float32Array((chip.puffs?.length || 0) * 3);
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return buffer;
  }, [chip.puffs]);
  const sparkGeometry = useMemo(() => {
    const positions = new Float32Array((chip.sparks?.length || 0) * 2 * 3);
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return buffer;
  }, [chip.sparks]);

  useEffect(() => () => {
    geometry.dispose();
    puffGeometry.dispose();
    sparkGeometry.dispose();
    material.dispose();
    puffMaterial.dispose();
    sparkMaterial.dispose();
  }, [geometry, material, puffGeometry, puffMaterial, sparkGeometry, sparkMaterial]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const age = ageRef.current;
    if (age >= BURST_LIFETIME) {
      onExpired(chip.id);
      return;
    }
    const positions = geometry.attributes.position;
    chip.burst.forEach((velocity, index) => {
      positions.setXYZ(
        index,
        chip.scarPosition.x + velocity.x * age,
        chip.scarPosition.y + velocity.y * age - 1.2 * age * age,
        chip.scarPosition.z + velocity.z * age,
      );
    });
    positions.needsUpdate = true;
    material.opacity = 0.68 * Math.pow(1 - age / BURST_LIFETIME, 1.2);

    const puffPositions = puffGeometry.attributes.position;
    chip.puffs?.forEach((velocity, index) => {
      const drift = age * 1.15;
      puffPositions.setXYZ(
        index,
        chip.scarPosition.x + velocity.x * drift,
        chip.scarPosition.y + velocity.y * drift + 0.04 * Math.sin(age * 8 + index),
        chip.scarPosition.z + velocity.z * drift,
      );
    });
    if (chip.puffs?.length) puffPositions.needsUpdate = true;
    puffMaterial.opacity = 0.36 * Math.pow(1 - age / BURST_LIFETIME, 1.55);

    const sparkPositions = sparkGeometry.attributes.position;
    chip.sparks?.forEach((velocity, index) => {
      const base = index * 2;
      const leadAge = age;
      const tailAge = Math.max(0, age - 0.085);
      sparkPositions.setXYZ(
        base,
        chip.scarPosition.x + velocity.x * leadAge,
        chip.scarPosition.y + velocity.y * leadAge - 2.8 * leadAge * leadAge,
        chip.scarPosition.z + velocity.z * leadAge,
      );
      sparkPositions.setXYZ(
        base + 1,
        chip.scarPosition.x + velocity.x * tailAge,
        chip.scarPosition.y + velocity.y * tailAge - 2.8 * tailAge * tailAge,
        chip.scarPosition.z + velocity.z * tailAge,
      );
    });
    if (chip.sparks?.length) sparkPositions.needsUpdate = true;
    sparkMaterial.opacity = Math.pow(1 - age / BURST_LIFETIME, 2.0);
  });

  return (
    <group>
      <RockChipImpactFlash chip={chip} />
      <points geometry={geometry} material={material} />
      {Boolean(chip.puffs?.length) && <points geometry={puffGeometry} material={puffMaterial} />}
      {Boolean(chip.sparks?.length) && <lineSegments geometry={sparkGeometry} material={sparkMaterial} />}
    </group>
  );
}

function HammerSampleChip({ chip, onExpired }) {
  const bodyRef = useRef(null);
  const ageRef = useRef(0);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: chip.color,
    roughness: 0.95,
    metalness: 0.01,
    flatShading: true,
  }), [chip.color]);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const mass = body.mass?.() || 1;
    body.applyImpulse({
      x: chip.impulse.x * mass,
      y: chip.impulse.y * mass,
      z: chip.impulse.z * mass,
    }, true);
    body.applyTorqueImpulse({
      x: chip.torque.x * mass,
      y: chip.torque.y * mass,
      z: chip.torque.z * mass,
    }, true);
  }, [chip]);

  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.id === chip.id) setCarryPrompt(null);
  }, [chip.id, setCarryPrompt]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const body = bodyRef.current;
    if (!body) return;
    const translation = body.translation();
    if (translation.y < CHIP_FALL_CULL_Y || ageRef.current > CHIP_MAX_AGE) {
      const state = useThreeGameStore.getState();
      if (state.carryPrompt?.id === chip.id) setCarryPrompt(null);
      onExpired(chip.id);
      return;
    }

    if (ageRef.current < 0.55) return;
    const pose = getRuntimePlayerPose();
    const player = pose?.position || { x: 0, z: 0 };
    const distance = Math.hypot(translation.x - player.x, translation.z - player.z);
    const activePrompt = useThreeGameStore.getState().carryPrompt;
    if (distance <= CHIP_PROMPT_DISTANCE) {
      if (!activePrompt || activePrompt.id === chip.id || distance < (activePrompt.distance ?? Infinity)) {
        setCarryPrompt({
          id: chip.id,
          label: chip.sampleNoun || 'geological sample',
          mode: 'collect-rock-sample',
          distance,
          text: chip.promptText || 'Press E to collect geological sample',
          sample: {
            sampleId: chip.id,
            sourceRockKey: chip.sourceRockKey,
            rockId: chip.rockId,
            zoneId: chip.zoneId,
            material: chip.material,
            specimenId: chip.specimenId,
            sampleLabel: chip.sampleNoun,
            outcome: chip.outcome,
            educationalNote: chip.educationalNote,
            position: {
              x: translation.x,
              y: translation.y,
              z: translation.z,
            },
          },
        });
      }
    } else if (activePrompt?.id === chip.id) {
      setCarryPrompt(null);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={[chip.position.x, chip.position.y, chip.position.z]}
      rotation={[seededUnit(chip.id, 12) * Math.PI, seededUnit(chip.id, 13) * Math.PI, seededUnit(chip.id, 14) * Math.PI]}
      friction={1.08}
      restitution={0.18}
      linearDamping={0.45}
      angularDamping={0.62}
      density={950}
      ccd
      userData={{ id: chip.id, kind: 'rock-sample-chip' }}
    >
      <BallCollider args={[chip.radius * 0.74]} />
      <mesh castShadow receiveShadow material={material} scale={[chip.radius * chip.scale[0], chip.radius * chip.scale[1], chip.radius * chip.scale[2]]}>
        <dodecahedronGeometry args={[1, 0]} />
      </mesh>
    </RigidBody>
  );
}

export function RockSampleSystem() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const pushableObstacleOffsets = useThreeGameStore(state => state.pushableObstacleOffsets);
  const sampledRockIds = useThreeGameStore(state => state.sampledRockIds);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const [chips, setChips] = useState([]);
  const [bursts, setBursts] = useState([]);
  const clockRef = useRef(0);
  const sequenceRef = useRef(0);
  const pendingStrikesRef = useRef([]);
  const chipsRef = useRef([]);
  const obstaclesRef = useRef([]);
  const sampledRockIdsRef = useRef([]);
  const lastFeedbackRef = useRef(-Infinity);
  const lastShardDilemmaRef = useRef(-Infinity);

  const obstacles = useMemo(
    () => getRuntimeObstacles(currentZoneId, pushableObstacleOffsets),
    [currentZoneId, pushableObstacleOffsets],
  );

  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);

  useEffect(() => {
    chipsRef.current = chips;
  }, [chips]);

  useEffect(() => {
    sampledRockIdsRef.current = sampledRockIds || [];
    if (!sampledRockIds?.length) return;
    const sampled = new Set(sampledRockIds);
    setChips(current => current.filter(chip => !sampled.has(chip.sourceRockKey)));
  }, [sampledRockIds]);

  useEffect(() => onPropEvent('tool-swing', event => {
    if (event.tool !== 'hammer') return;
    pendingStrikesRef.current.push({
      ...event,
      at: clockRef.current + (event.impactDelay ?? 0.55),
    });
  }), []);

  useEffect(() => {
    pendingStrikesRef.current = [];
    setChips([]);
    setBursts([]);
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.mode === 'collect-rock-sample') setCarryPrompt(null);
  }, [currentZoneId, setCarryPrompt]);

  const expireChip = id => {
    setChips(current => current.filter(chip => chip.id !== id));
  };

  const expireBurst = id => {
    setBursts(current => current.filter(burst => burst.id !== id));
  };

  useFrame((_, delta) => {
    clockRef.current += delta;
    if (!pendingStrikesRef.current.length) return;
    const due = pendingStrikesRef.current.filter(strike => strike.at <= clockRef.current);
    if (!due.length) return;
    pendingStrikesRef.current = pendingStrikesRef.current.filter(strike => strike.at > clockRef.current);

    const activeKeys = chipsRef.current.map(chip => chip.sourceRockKey);
    const newChips = [];
    for (const strike of due) {
      let target = selectRockSampleTarget({
        obstacles: obstaclesRef.current,
        zoneId: currentZoneId,
        position: strike.position,
        facing: strike.facing,
        sampledRockIds: sampledRockIdsRef.current,
        activeSourceKeys: activeKeys,
      });
      if (!target) {
        target = makeGroundSampleTarget(strike, currentZoneId, sampledRockIdsRef.current, activeKeys);
      }
      if (!target && clockRef.current - lastFeedbackRef.current > 1.8) {
        const alreadySampled = selectRockSampleTarget({
          obstacles: obstaclesRef.current,
          zoneId: currentZoneId,
          position: strike.position,
          facing: strike.facing,
          sampledRockIds: [],
          activeSourceKeys: [],
        });
        if (alreadySampled) {
          const key = alreadySampled.key || rockSampleKey(currentZoneId, alreadySampled.rock.id);
          if (sampledRockIdsRef.current.includes(key) || activeKeys.includes(key)) {
            const profile = profileForTarget(alreadySampled, currentZoneId);
            useThreeGameStore.getState().recordHammerStrikeFeedback?.({
              message: activeKeys.includes(key)
                ? `A loosened ${profile.sampleNoun} already lies nearby.`
                : profile.soundMessage,
              educationalNote: profile.educationalNote,
              symsLine: profile.soundSyms,
              fatigueDelta: 0.2,
            });
            lastFeedbackRef.current = clockRef.current;
          }
        }
      }
      if (!target) continue;
      sequenceRef.current += 1;
      const profile = profileForTarget(target, currentZoneId);
      const outcome = resolveHammerOutcome(profile, target.key);
      const chip = makeChipFromTarget(target, strike, currentZoneId, sequenceRef.current, profile, outcome);
      const shardRisk = {
        basalt: 0.55,
        iron_crust: 0.48,
        scoria: 0.34,
        olivine: 0.3,
        coral_limestone: 0.14,
        tuff: 0.12,
      }[profile.material] ?? 0.22;
      if (
        clockRef.current - lastShardDilemmaRef.current > 28
        && seededUnit(`${chip.id}:field-dilemma`, 91) < shardRisk
      ) {
        lastShardDilemmaRef.current = clockRef.current;
        useThreeGameStore.getState().triggerHammerShardDilemma?.({
          material: profile.material,
          sampleLabel: chip.sampleNoun,
          sourceRockKey: chip.sourceRockKey,
          position: chip.scarPosition,
        });
      }
      newChips.push(chip);
      activeKeys.push(chip.sourceRockKey);
    }

    if (!newChips.length) return;
    setChips(current => [...current, ...newChips.filter(chip => (
      !current.some(existing => existing.sourceRockKey === chip.sourceRockKey)
    ))]);
    setBursts(current => [...current, ...newChips]);
  });

  return (
    <group userData={{
      renderSource: `rock-sampling:${currentZoneId}`,
      renderLabel: `${currentZoneId} rock sampling`,
      renderKind: 'physics-rock-sampling',
      renderPath: null,
    }}>
      {chips.map(chip => (
        <React.Fragment key={chip.id}>
          <RockChipScar chip={chip} />
          <HammerSampleChip chip={chip} onExpired={expireChip} />
        </React.Fragment>
      ))}
      {bursts.map(chip => (
        <RockChipBurst key={`${chip.id}:burst`} chip={chip} onExpired={expireBurst} />
      ))}
    </group>
  );
}
