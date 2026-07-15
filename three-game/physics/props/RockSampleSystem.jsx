'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConvexHullCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { movementTerrainHeight, terrainBiomeAt } from '../../world/terrain';
import { isWaterColumnAt } from '../../world/water';
import { getRuntimeObstacles, syncDestroyedObstacles } from '../../world/obstacles';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../../world/regions/materials/pbrTerrainTextures';
import { claimSwing, onPropEvent } from './propEvents';
import { triggerHitstop } from '../../world/worldTime';
import { makeChipGeometry, makeFragmentGeometry, seededUnit } from './rockDebrisGeometry';
import {
  getHammerMaterialProfile,
  groundHammerMaterial,
  inferHammerMaterial,
  isRockBreakable,
  resolveHammerOutcome,
  rockSampleKey,
  rockStrikeBudget,
  selectRockSampleTarget,
} from './rockSampling';

const CHIP_PROMPT_DISTANCE = 1.75;
const CHIP_MAX_AGE = 150;
const CHIP_FALL_CULL_Y = -18;
const BURST_LIFETIME = 1.05;
const IMPACT_FLASH_LIFETIME = 0.28;

function normalize2(x, z, fallback = { x: 0, z: -1 }) {
  const length = Math.hypot(x, z);
  if (length < 0.001) return fallback;
  return { x: x / length, z: z / length };
}

function rockSurfaceRadius(rock, normal) {
  const scale = typeof rock.scale === 'number' ? rock.scale : 1;
  const yaw = rock.yaw || 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const localX = normal.x * cos - normal.z * sin;
  const localZ = normal.x * sin + normal.z * cos;
  let support = 0;
  for (const shape of rock.shapes || []) {
    const [offsetX = 0, , offsetZ = 0] = shape.offset || [0, 0, 0];
    if (shape.type === 'convex' && shape.points?.length) {
      support = Math.max(support, ...shape.points.map(([x, z]) => (
        ((x + offsetX) * localX + (z + offsetZ) * localZ) * scale
      )));
    } else if (shape.radius) {
      support = Math.max(
        support,
        ((offsetX * localX + offsetZ * localZ) + shape.radius) * scale,
      );
    }
  }
  return Math.max(0.35, support || rock.radius || 0.5);
}

function configureChipTexture(texture, repeat = 1.4) {
  if (!texture) return;
  texture.repeat.set(repeat, repeat);
}

// Two shared materials: basalt-family debris reuses the RockField PBR maps so
// chips visually match the boulders they came off; softer materials read
// through vertex colors alone.
function useChipMaterials() {
  return useMemo(() => {
    const textures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.darkBasaltGravel);
    configureChipTexture(textures.albedo, 1.6);
    configureChipTexture(textures.normal, 2.2);
    configureChipTexture(textures.roughness, 1.6);
    const mapped = new THREE.MeshStandardMaterial({
      map: textures.albedo,
      normalMap: textures.normal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: textures.roughness,
      vertexColors: true,
      color: '#ffffff',
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
    });
    const plain = new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: '#ffffff',
      roughness: 0.94,
      metalness: 0,
      flatShading: true,
    });
    return { textures, mapped, plain };
  }, []);
}

const MAPPED_CHIP_MATERIALS = new Set(['basalt', 'olivine', 'iron_crust']);

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
  // A swing over standing water splashes (HammerStrikeResolver); it never
  // chips a sample off the seabed.
  if (isWaterColumnAt(x, z, zoneId)) return null;
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
  const playerX = strike.position?.x || 0;
  const playerZ = strike.position?.z || 0;
  const fallback = normalize2(-(strike.facing?.x || 0), -(strike.facing?.z || -1), { x: 0, z: 1 });
  const normal = normalize2(playerX - (rock.x || 0), playerZ - (rock.z || 0), fallback);
  const radius = rockSurfaceRadius(rock, normal);
  const surfaceX = (rock.x || 0) + normal.x * radius * 0.92;
  const surfaceZ = (rock.z || 0) + normal.z * radius * 0.92;
  const groundY = movementTerrainHeight(surfaceX, surfaceZ, zoneId);
  const rockTop = rock.colliderTop ?? rock.height ?? 0.9;
  const hitY = target.groundSample
    ? groundY + 0.08
    : groundY + THREE.MathUtils.clamp(rockTop * 0.52, 0.35, 1.42);
  const seed = `${key}:${sequence}`;
  const side = { x: -normal.z, z: normal.x };
  const chipRadius = (0.16 + seededUnit(seed, 1) * 0.08) * (profile.shape === 'flake' ? 0.92 : 1);
  // Dense rock: chips should thud out and drop, not sail. Impulses are in
  // velocity terms (mass-scaled on apply), kept low and paired with heavy
  // damping on the body.
  const outward = (0.82 + seededUnit(seed, 2) * 0.38) * (profile.impulseScale || 1);
  const sideways = (seededUnit(seed, 3) - 0.5) * 0.4 * (profile.impulseScale || 1);
  const colors = profile.colors?.length ? profile.colors : ['#30342f'];
  const fx = profile.fx || {};
  const dustCount = fx.dustCount ?? 12;
  const puffCount = fx.puffCount ?? 1;
  const sparkCount = rock.kind === 'boulder'
    ? Math.max(10, (fx.sparkCount ?? 0) * 2)
    : (fx.sparkCount ?? 0);

  return {
    id: `${key}:chip:${sequence}`,
    sourceRockKey: key,
    rockId: rock.id,
    zoneId,
    groundSample: Boolean(target.groundSample),
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
    fractureColor: profile.fractureColor || '#4d5457',
    scarColor: profile.scarColor || '#171917',
    dustColor: profile.dustColor || '#5b5140',
    sparkColor: fx.sparkColor || '#ffd36a',
    puffSize: fx.puffSize || 0.16,
    dustSize: fx.dustSize || 0.045,
    impulse: {
      x: normal.x * outward + side.x * sideways,
      y: 0.72 + seededUnit(seed, 8) * 0.28,
      z: normal.z * outward + side.z * sideways,
    },
    torque: {
      x: (seededUnit(seed, 9) - 0.5) * 0.5,
      y: (seededUnit(seed, 10) - 0.5) * 0.35,
      z: (seededUnit(seed, 11) - 0.5) * 0.5,
    },
    // Bite sphere for the persistent carve in RockField. Center sits just
    // outside the struck face so projecting vertices onto the sphere scoops a
    // dent instead of raising a bump.
    bite: {
      x: surfaceX + normal.x * chipRadius * 1.15,
      y: hitY + 0.02,
      z: surfaceZ + normal.z * chipRadius * 1.15,
      r: chipRadius * (rock.kind === 'boulder' ? 3.35 : 2.1),
      normal: { x: normal.x, y: 0, z: normal.z },
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
  }), [chip.scarColor]);
  useEffect(() => () => material.dispose(), [material]);
  const yaw = Math.atan2(chip.normal.x, chip.normal.z);
  // Rock scars stand on the struck face; ground samples leave a flat divot
  // lying on the terrain instead of a plate jutting out of the soil.
  const flat = chip.groundSample;
  return (
    <mesh
      position={[
        chip.scarPosition.x,
        flat ? chip.scarPosition.y - 0.055 : chip.scarPosition.y,
        chip.scarPosition.z,
      ]}
      rotation={flat ? [-Math.PI / 2, 0, yaw] : [0, yaw, 0]}
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
  }), [chip.dustColor, chip.dustSize]);
  const puffMaterial = useMemo(() => new THREE.PointsMaterial({
    color: chip.dustColor || '#5b5140',
    size: (chip.puffSize || 0.18) * 2.1,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  }), [chip.dustColor, chip.puffSize]);
  const sparkMaterial = useMemo(() => new THREE.LineBasicMaterial({
    color: chip.sparkColor || '#ffd36a',
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [chip.sparkColor]);
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

function HammerSampleChip({ chip, materials, onExpired }) {
  const bodyRef = useRef(null);
  const ageRef = useRef(0);
  const geometry = useMemo(() => makeChipGeometry(chip.id, {
    rindColor: chip.color,
    fractureColor: chip.fractureColor,
    liftColors: MAPPED_CHIP_MATERIALS.has(chip.material),
    scale: [
      chip.radius * chip.scale[0],
      chip.radius * chip.scale[1],
      chip.radius * chip.scale[2],
    ],
  }), [chip]);
  const hullVertices = useMemo(() => Float32Array.from(geometry.attributes.position.array), [geometry]);
  const material = MAPPED_CHIP_MATERIALS.has(chip.material) ? materials.mapped : materials.plain;
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);

  useEffect(() => () => geometry.dispose(), [geometry]);

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
      friction={1.25}
      restitution={0.05}
      linearDamping={1.05}
      angularDamping={1.7}
      density={2600}
      ccd
      userData={{ id: chip.id, kind: 'rock-sample-chip' }}
    >
      <ConvexHullCollider args={[hullVertices]} />
      <mesh castShadow receiveShadow material={material} geometry={geometry} />
    </RigidBody>
  );
}

const FRAGMENT_FALL_CULL_Y = -18;
const MAX_FRAGMENT_PIECES = 24;

function RockBreakFragmentPiece({ fragment, piece, materials, onExpired }) {
  const bodyRef = useRef(null);
  const ageRef = useRef(0);
  const geometry = useMemo(() => makeFragmentGeometry(piece.id, {
    cutDir: piece.cutDir,
    cutDistance: piece.cutDistance,
    radii: piece.radii,
    rindColor: fragment.rindColor,
    fractureColor: fragment.fractureColor,
  }), [fragment, piece]);
  const hullVertices = useMemo(() => Float32Array.from(geometry.attributes.position.array), [geometry]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const mass = body.mass?.() || 1;
    body.applyImpulse({
      x: piece.impulse.x * mass,
      y: piece.impulse.y * mass,
      z: piece.impulse.z * mass,
    }, true);
    body.applyTorqueImpulse({
      x: piece.torque.x * mass,
      y: piece.torque.y * mass,
      z: piece.torque.z * mass,
    }, true);
  }, [piece]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const body = bodyRef.current;
    if (!body) return;
    if (
      body.translation().y < FRAGMENT_FALL_CULL_Y
      || (piece.maxAge && ageRef.current >= piece.maxAge)
    ) onExpired(piece.id);
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={[piece.position.x, piece.position.y, piece.position.z]}
      rotation={[0, piece.yaw, 0]}
      friction={1.35}
      restitution={0.03}
      linearDamping={0.85}
      angularDamping={1.5}
      density={2600}
      userData={{ id: piece.id, kind: 'rock-break-fragment' }}
    >
      <ConvexHullCollider args={[hullVertices]} />
      <mesh castShadow receiveShadow material={materials.mapped} geometry={geometry} />
    </RigidBody>
  );
}

// Splits a broken boulder into two matching halves plus a couple of rubble
// wedges, sized from the obstacle's collider footprint.
function makeBreakFragments(rock, key, zoneId, profile, groundY) {
  const seed = `${key}:break`;
  const angle = seededUnit(seed, 1) * Math.PI * 2;
  const dir = { x: Math.cos(angle), z: Math.sin(angle) };
  const radius = Math.max(0.32, rock.radius || 0.5);
  const top = Math.max(0.28, rock.colliderTop ?? rock.height ?? 0.5);
  const rx = radius * 0.78;
  const ry = top * 0.5;
  const rz = radius * 0.72;
  const pieces = [];
  const pushPiece = (id, cutDir, radii, offset, kick) => {
    pieces.push({
      id: `${seed}:${id}`,
      cutDir,
      cutDistance: 0.06,
      radii,
      yaw: seededUnit(seed, 5 + pieces.length) * Math.PI * 2,
      position: {
        x: rock.x + offset.x,
        y: groundY + radii[1] * 0.85,
        z: rock.z + offset.z,
      },
      impulse: {
        x: kick.x,
        y: 0.35 + seededUnit(seed, 9 + pieces.length) * 0.2,
        z: kick.z,
      },
      torque: {
        x: (seededUnit(seed, 13 + pieces.length) - 0.5) * 0.4,
        y: (seededUnit(seed, 14 + pieces.length) - 0.5) * 0.3,
        z: (seededUnit(seed, 15 + pieces.length) - 0.5) * 0.4,
      },
    });
  };

  pushPiece('half-a', { x: dir.x, y: 0.1, z: dir.z }, [rx, ry, rz],
    { x: -dir.x * rx * 0.4, z: -dir.z * rx * 0.4 },
    { x: -dir.x * 0.55, z: -dir.z * 0.55 });
  pushPiece('half-b', { x: -dir.x, y: -0.08, z: -dir.z }, [rx * 0.92, ry * 0.96, rz * 0.9],
    { x: dir.x * rx * 0.4, z: dir.z * rx * 0.4 },
    { x: dir.x * 0.55, z: dir.z * 0.55 });
  const rubbleCount = 1 + Math.round(seededUnit(seed, 3));
  for (let index = 0; index < rubbleCount; index += 1) {
    const side = index === 0 ? { x: -dir.z, z: dir.x } : { x: dir.z, z: -dir.x };
    pushPiece(`rubble-${index}`, { x: side.x, y: 0.4, z: side.z },
      [rx * 0.34, ry * 0.4, rz * 0.32],
      { x: side.x * rx * 0.7, z: side.z * rx * 0.7 },
      { x: side.x * 0.8, z: side.z * 0.8 });
  }

  return {
    id: `${seed}`,
    key,
    zoneId,
    rindColor: profile.colors?.[0] || '#30342f',
    fractureColor: profile.fractureColor || '#4d5457',
    pieces,
  };
}

function makeImpactChipFragments(event, sequence, profile, cause = 'shotgun') {
  const { obstacle, position, normal, intensity = 0.7, zoneId } = event;
  const key = rockSampleKey(zoneId, obstacle.id);
  const seed = `${key}:${cause}:${sequence}`;
  const side = { x: -normal.z, z: normal.x };
  const count = cause === 'shotgun'
    ? (intensity > 0.68 ? 5 : 4)
    : 3;
  const pieces = Array.from({ length: count }, (_, index) => {
    const radiusBase = cause === 'shotgun' ? 0.105 : 0.085;
    const radius = radiusBase + seededUnit(seed, 11 + index) * (cause === 'shotgun' ? 0.09 : 0.07);
    const lateral = (seededUnit(seed, 31 + index) - 0.5) * 1.1;
    const outward = (cause === 'shotgun' ? 1.25 : 0.82) + seededUnit(seed, 41 + index) * 0.8;
    return {
      id: `${seed}:chip-${index}`,
      cutDir: {
        x: normal.x,
        y: 0.18 + seededUnit(seed, 51 + index) * 0.3,
        z: normal.z,
      },
      cutDistance: radius * 0.18,
      radii: [
        radius * (0.75 + seededUnit(seed, 61 + index) * 0.4),
        radius * (0.55 + seededUnit(seed, 71 + index) * 0.35),
        radius * (0.7 + seededUnit(seed, 81 + index) * 0.42),
      ],
      yaw: seededUnit(seed, 91 + index) * Math.PI * 2,
      position: {
        x: position.x + normal.x * (0.08 + radius) + side.x * lateral * 0.06,
        y: position.y + 0.02 + index * 0.035,
        z: position.z + normal.z * (0.08 + radius) + side.z * lateral * 0.06,
      },
      impulse: {
        x: normal.x * outward + side.x * lateral,
        y: 0.5 + seededUnit(seed, 101 + index) * 0.55,
        z: normal.z * outward + side.z * lateral,
      },
      torque: {
        x: (seededUnit(seed, 111 + index) - 0.5) * 0.9,
        y: (seededUnit(seed, 121 + index) - 0.5) * 0.75,
        z: (seededUnit(seed, 131 + index) - 0.5) * 0.9,
      },
      maxAge: 45,
    };
  });
  return {
    id: seed,
    key,
    zoneId,
    rindColor: profile.colors?.[0] || '#30342f',
    fractureColor: profile.fractureColor || '#4d5457',
    pieces,
  };
}

export function RockSampleSystem() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const pushableObstacleOffsets = useThreeGameStore(state => state.pushableObstacleOffsets);
  const sampledRockIds = useThreeGameStore(state => state.sampledRockIds);
  const collectedSampleIds = useThreeGameStore(state => state.collectedSampleIds);
  const rockDamage = useThreeGameStore(state => state.rockDamage);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const chipMaterials = useChipMaterials();
  const [chips, setChips] = useState([]);
  const [bursts, setBursts] = useState([]);
  const [fragments, setFragments] = useState([]);
  const clockRef = useRef(0);
  const sequenceRef = useRef(0);
  const pendingStrikesRef = useRef([]);
  const chipsRef = useRef([]);
  const obstaclesRef = useRef([]);
  const sampledRockIdsRef = useRef([]);
  const exhaustedRockKeysRef = useRef([]);
  const lastFeedbackRef = useRef(-Infinity);
  const lastShardDilemmaRef = useRef(-Infinity);

  useEffect(() => () => {
    disposePbrTerrainSet(chipMaterials.textures);
    chipMaterials.mapped.dispose();
    chipMaterials.plain.dispose();
  }, [chipMaterials]);

  useEffect(() => {
    exhaustedRockKeysRef.current = Object.entries(rockDamage)
      .filter(([, damage]) => damage.broken || damage.strikes >= (damage.budget ?? 3))
      .map(([key]) => key);
    // Keep the movement/camera broad-phase registry mirroring the store, so a
    // store reset (new expedition) also restores collision.
    syncDestroyedObstacles(Object.values(rockDamage)
      .filter(damage => damage.broken && damage.rockId)
      .map(damage => damage.rockId));
  }, [rockDamage]);

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
  }, [sampledRockIds]);

  useEffect(() => {
    if (!collectedSampleIds?.length) return;
    const collected = new Set(collectedSampleIds);
    setChips(current => current.filter(chip => !collected.has(chip.id)));
  }, [collectedSampleIds]);

  useEffect(() => onPropEvent('tool-swing', event => {
    if (event.tool !== 'hammer') return;
    pendingStrikesRef.current.push({
      ...event,
      at: clockRef.current + (event.impactDelay ?? 0.55),
    });
  }), []);

  const commitBoulderFracture = useCallback((event, cause) => {
    if (!event?.obstacle || event.zoneId !== currentZoneId) return;
    sequenceRef.current += 1;
    const obstacle = event.obstacle;
    const profile = getHammerMaterialProfile(inferHammerMaterial({
      rock: obstacle,
      zoneId: currentZoneId,
    }));
    const surfaceRadius = rockSurfaceRadius(obstacle, event.normal);
    const surfaceEvent = {
      ...event,
      position: {
        x: obstacle.x + event.normal.x * surfaceRadius * 0.985,
        y: event.position.y,
        z: obstacle.z + event.normal.z * surfaceRadius * 0.985,
      },
    };
    const fracture = makeImpactChipFragments(surfaceEvent, sequenceRef.current, profile, cause);
    const biteRadius = cause === 'shotgun'
      ? 0.42 + (event.intensity || 0.7) * 0.18
      : 0.52;
    const store = useThreeGameStore.getState();
    store.recordRockStrike?.({
      key: fracture.key,
      rockId: obstacle.id,
      zoneId: currentZoneId,
      x: obstacle.x,
      z: obstacle.z,
      budget: rockStrikeBudget(obstacle),
      broken: false,
      countStrike: false,
      bite: {
        x: surfaceEvent.position.x + event.normal.x * biteRadius * 0.36,
        y: surfaceEvent.position.y + event.normal.y * biteRadius * 0.36,
        z: surfaceEvent.position.z + event.normal.z * biteRadius * 0.36,
        r: biteRadius,
        normal: event.normal,
      },
    });
    setFragments(current => {
      const merged = [...current, fracture];
      let totalPieces = merged.reduce((sum, item) => sum + item.pieces.length, 0);
      while (totalPieces > MAX_FRAGMENT_PIECES && merged.length > 1) {
        totalPieces -= merged[0].pieces.length;
        merged.shift();
      }
      return merged;
    });
  }, [currentZoneId]);

  useEffect(() => onPropEvent('rock-shotgun-fracture', event => {
    commitBoulderFracture(event, 'shotgun');
  }), [commitBoulderFracture]);

  useEffect(() => onPropEvent('rock-hammer-fracture', event => {
    commitBoulderFracture(event, 'hammer');
  }), [commitBoulderFracture]);

  useEffect(() => {
    pendingStrikesRef.current = [];
    setChips([]);
    setBursts([]);
    setFragments([]);
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.mode === 'collect-rock-sample') setCarryPrompt(null);
  }, [currentZoneId, setCarryPrompt]);

  const expireChip = id => {
    setChips(current => current.filter(chip => chip.id !== id));
  };

  const expireBurst = id => {
    setBursts(current => current.filter(burst => burst.id !== id));
  };

  const expireFragmentPiece = pieceId => {
    setFragments(current => current
      .map(fragment => ({
        ...fragment,
        pieces: fragment.pieces.filter(piece => piece.id !== pieceId),
      }))
      .filter(fragment => fragment.pieces.length));
  };

  useFrame((_, delta) => {
    clockRef.current += delta;
    if (!pendingStrikesRef.current.length) return;
    const due = pendingStrikesRef.current.filter(strike => strike.at <= clockRef.current);
    if (!due.length) return;
    pendingStrikesRef.current = pendingStrikesRef.current.filter(strike => strike.at > clockRef.current);

    const activeKeys = chipsRef.current.map(chip => chip.sourceRockKey);
    const newChips = [];
    const newFragments = [];
    for (const strike of due) {
      let target = selectRockSampleTarget({
        obstacles: obstaclesRef.current,
        zoneId: currentZoneId,
        position: strike.position,
        facing: strike.facing,
        sampledRockIds: exhaustedRockKeysRef.current,
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
          if (exhaustedRockKeysRef.current.includes(key) || activeKeys.includes(key)) {
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
      claimSwing(strike.swingId);
      // Dense rock stops the swing dead; a ground sample only checks it.
      triggerHitstop(target.groundSample ? 0.035 : 0.06);
      sequenceRef.current += 1;
      const profile = profileForTarget(target, currentZoneId);
      const outcome = resolveHammerOutcome(profile, `${target.key}:${sequenceRef.current}`);
      const chip = makeChipFromTarget(target, strike, currentZoneId, sequenceRef.current, profile, outcome);

      // Persist the strike: the RockField renderer carves a bite out of the
      // matching boulder, and small rocks shatter once their budget runs out.
      if (!target.groundSample) {
        const rock = target.rock;
        const store = useThreeGameStore.getState();
        const budget = rockStrikeBudget(rock);
        const priorStrikes = store.rockDamage[chip.sourceRockKey]?.strikes || 0;
        const broken = isRockBreakable(rock) && priorStrikes + 1 >= budget;
        store.recordRockStrike?.({
          key: chip.sourceRockKey,
          rockId: rock.id,
          zoneId: currentZoneId,
          x: rock.x,
          z: rock.z,
          budget,
          broken,
          bite: rock.proceduralRock || rock.kind === 'boulder' ? chip.bite : null,
        });
        if (broken) {
          const groundY = movementTerrainHeight(rock.x, rock.z, currentZoneId);
          newFragments.push(makeBreakFragments(rock, chip.sourceRockKey, currentZoneId, profile, groundY));
          store.recordHammerStrikeFeedback?.({
            message: 'The final blow lands true, and the boulder splits apart into heavy fragments.',
            educationalNote: profile.educationalNote,
            symsLine: 'Syms steps back from the rubble. "Clean through, sir. The whole stone gave way."',
            fatigueDelta: 0.6,
          });
        }
      }
      const shardRisk = {
        basalt: 0.22,
        iron_crust: 0.18,
        scoria: 0.12,
        olivine: 0.1,
        coral_limestone: 0.05,
        tuff: 0.04,
      }[profile.material] ?? 0.08;
      const store = useThreeGameStore.getState();
      if (
        !store.activeConstraint
        && clockRef.current - lastShardDilemmaRef.current > 75
        && seededUnit(`${chip.id}:field-dilemma`, 91) < shardRisk
      ) {
        lastShardDilemmaRef.current = clockRef.current;
        store.triggerHammerShardDilemma?.({
          material: profile.material,
          sampleLabel: chip.sampleNoun,
          sourceRockKey: chip.sourceRockKey,
          position: chip.scarPosition,
        });
      }
      newChips.push(chip);
      activeKeys.push(chip.sourceRockKey);
    }

    if (newFragments.length) {
      setFragments(current => {
        const merged = [...current, ...newFragments];
        let totalPieces = merged.reduce((sum, fragment) => sum + fragment.pieces.length, 0);
        while (totalPieces > MAX_FRAGMENT_PIECES && merged.length > 1) {
          totalPieces -= merged[0].pieces.length;
          merged.shift();
        }
        return merged;
      });
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
          {!rockDamage[chip.sourceRockKey]?.broken && <RockChipScar chip={chip} />}
          <HammerSampleChip chip={chip} materials={chipMaterials} onExpired={expireChip} />
        </React.Fragment>
      ))}
      {fragments.flatMap(fragment => fragment.pieces.map(piece => (
        <RockBreakFragmentPiece
          key={piece.id}
          fragment={fragment}
          piece={piece}
          materials={chipMaterials}
          onExpired={expireFragmentPiece}
        />
      )))}
      {bursts.map(chip => (
        <RockChipBurst key={`${chip.id}:burst`} chip={chip} onExpired={expireBurst} />
      ))}
    </group>
  );
}
