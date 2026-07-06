'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { clampToWalkable, terrainHeight } from '../../world/terrain';
import { getRegionDefinition } from '../../world/regions';
import { WATER_LEVEL } from '../../world/water';
import { specimenToInspectable } from '../../world/inspectables';
import { removeSpecimenRuntimePose, setSpecimenRuntimePose } from '../../world/specimenRuntime';
import { useFaunaBehavior } from '../../fauna/useFaunaBehavior';
import { getFaunaBehaviorProfile, getFaunaCarryProfile } from '../../fauna/faunaBehaviorProfiles';
import { getWildlifeAssetId } from '../../wildlife/wildlifeCatalog';
import { addRimLight, toonMaterial } from '../scene/materials';
import { ContactShadow } from '../scene/ContactShadow';
import { ModelAsset } from '../assets/ModelAsset';

const CARRY_PICKUP_DISTANCE = 2.15;
const CARRY_HOLD_DISTANCE = 1.12;
const CARRY_DROP_DISTANCE = 1.3;
const COTTON_FOLIAGE_MOTION = { wind: 1.9, bend: 0.35, bendRadius: 1.45 };
const DRY_GRASS_FOLIAGE_MOTION = { wind: 1.45, bend: 0.55, bendRadius: 1.25 };
const CACTUS_FOLIAGE_MOTION = { wind: 0.35, bend: 0.35 };
const STANDING_WATER_SURFACE_LIFT = 0.036;
const NO_RAYCAST = () => null;

function publishActorRuntimePosition({
  publisher,
  ref,
  actorId,
  zoneId,
  position,
  now = 0,
  force = false,
  debug = null,
}) {
  if (
    !Number.isFinite(position?.x)
    || !Number.isFinite(position?.y)
    || !Number.isFinite(position?.z)
  ) return;
  setSpecimenRuntimePose(zoneId, actorId, {
    x: position.x,
    y: position.y,
    z: position.z,
    yaw: position.yaw || 0,
  });
  const previous = ref.current;
  const dx = position.x - previous.x;
  const dy = position.y - previous.y;
  const dz = position.z - previous.z;
  if (!force && now - previous.time < 0.22 && Math.hypot(dx, dy, dz) < 0.45) return;
  publisher(actorId, { x: position.x, y: position.y, z: position.z }, zoneId);
  if (typeof window !== 'undefined' && debug) {
    window.__faunaMotionDebug = {
      ...(window.__faunaMotionDebug || {}),
      [actorId]: debug,
    };
  }
  ref.current = { x: position.x, y: position.y, z: position.z, time: now };
}

function isFiniteVector3(value) {
  return (
    Number.isFinite(value?.x)
    && Number.isFinite(value?.y)
    && Number.isFinite(value?.z)
  );
}

function copyFinitePosition(target, preferred, fallback) {
  const source = isFiniteVector3(preferred) ? preferred : fallback;
  if (!isFiniteVector3(source)) return false;
  target.copy(source);
  return source === preferred;
}

function standingWaterMaskAt(x, z, zoneId) {
  const maskFn = getRegionDefinition(zoneId)?.terrain?.standingWaterMask;
  return maskFn ? THREE.MathUtils.clamp(maskFn(x, z), 0, 1) : 0;
}

function specimenStandingWaterState(position, zoneId) {
  if (!isFiniteVector3(position)) {
    return { active: false, mask: 0, depth: 0, localSurfaceY: 0 };
  }
  const mask = standingWaterMaskAt(position.x, position.z, zoneId);
  const localSurfaceY = WATER_LEVEL + STANDING_WATER_SURFACE_LIFT - position.y;
  const depth = WATER_LEVEL - position.y;
  return {
    active: mask > 0.28 && depth > 0.08,
    mask,
    depth,
    localSurfaceY,
  };
}

function specimenColor(id) {
  if (id === 'crab') return '#e4572e';
  if (id === 'marineiguana') return '#202124';
  if (id === 'mediumgroundfinch') return '#6b4a2f';
  if (id === 'floreanagianttortoise') return '#4d5638';
  if (id === 'galapagospenguin') return '#1f2326';
  if (id === 'cactus') return '#5d9239';
  if (id === 'basalt') return '#38342f';
  return '#9b7653';
}

function specimenMaterial(id) {
  return addRimLight(toonMaterial(specimenColor(id)), { color: '#fff0b0', intensity: id === 'basalt' ? 0.16 : 0.28 });
}

function assetIdForSpecimen(specimen) {
  const wildlifeAssetId = getWildlifeAssetId(specimen);
  if (wildlifeAssetId) return wildlifeAssetId;
  if (specimen.id === 'dry_grass' || specimen.id === 'drygrass' || specimen.id === 'poaceae') return 'dryGrassPatch';
  return specimen.id;
}

function foliageMotionForSpecimen(specimen) {
  const id = String(specimen.id || '').toLowerCase();
  const latin = String(specimen.latin || '').toLowerCase();
  if (id === 'galapagoscotton') return COTTON_FOLIAGE_MOTION;
  if (id === 'dry_grass' || id === 'drygrass' || id === 'poaceae' || latin.includes('poaceae')) {
    return DRY_GRASS_FOLIAGE_MOTION;
  }
  if (id === 'cactus') return CACTUS_FOLIAGE_MOTION;
  return null;
}

function ProceduralSpecimenShape({ specimen }) {
  const material = useMemo(() => specimenMaterial(specimen.id), [specimen.id]);
  const warm = useMemo(() => addRimLight(toonMaterial('#d7b66f'), { intensity: 0.2 }), []);
  const dark = useMemo(() => addRimLight(toonMaterial('#292b28'), { intensity: 0.18 }), []);
  if (specimen.id === 'cactus') {
    return (
      <group>
        <mesh castShadow position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.25, 0.32, 1.5, 8]} />
          <primitive object={material} attach="material" />
        </mesh>
        <mesh castShadow position={[0.38, 0.95, 0]} rotation={[0, 0, -0.35]}>
          <cylinderGeometry args={[0.12, 0.16, 0.7, 8]} />
          <primitive object={warm} attach="material" />
        </mesh>
      </group>
    );
  }
  if (specimen.id === 'basalt') {
    return (
      <mesh castShadow receiveShadow position={[0, 0.35, 0]} scale={[1.1, 0.7, 0.9]}>
        <dodecahedronGeometry args={[0.7, 0]} />
        <primitive object={material} attach="material" />
      </mesh>
    );
  }
  if (specimen.id === 'mediumgroundfinch') {
    return (
      <group>
        <mesh castShadow position={[0, 0.42, 0]} scale={[0.52, 0.36, 0.7]}>
          <sphereGeometry args={[0.55, 18, 18]} />
          <primitive object={material} attach="material" />
        </mesh>
        <mesh castShadow position={[0, 0.68, -0.42]} scale={[0.35, 0.32, 0.35]}>
          <sphereGeometry args={[0.42, 18, 18]} />
          <meshToonMaterial color="#7c5c3b" />
        </mesh>
        <mesh castShadow position={[0, 0.68, -0.78]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.14, 0.28, 8]} />
          <primitive object={warm} attach="material" />
        </mesh>
      </group>
    );
  }
  if (specimen.id === 'marineiguana') {
    return (
      <group>
        <mesh castShadow position={[0, 0.28, 0]} scale={[0.55, 0.28, 1.2]}>
          <sphereGeometry args={[0.65, 18, 18]} />
          <primitive object={material} attach="material" />
        </mesh>
        <mesh castShadow position={[0, 0.32, -0.9]} scale={[0.36, 0.28, 0.38]}>
          <sphereGeometry args={[0.5, 18, 18]} />
          <primitive object={dark} attach="material" />
        </mesh>
        <mesh position={[0, 0.42, 0.98]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.16, 1.15, 8]} />
          <meshToonMaterial color="#1f211f" />
        </mesh>
      </group>
    );
  }
  if (specimen.id === 'floreanagianttortoise') {
    return (
      <group>
        <mesh castShadow position={[0, 0.48, 0]} scale={[0.95, 0.44, 0.68]}>
          <sphereGeometry args={[0.68, 18, 18]} />
          <primitive object={material} attach="material" />
        </mesh>
        <mesh castShadow position={[0, 0.36, -0.52]} scale={[0.36, 0.28, 0.36]}>
          <sphereGeometry args={[0.45, 18, 18]} />
          <meshToonMaterial color="#66704b" />
        </mesh>
      </group>
    );
  }
  if (specimen.id === 'galapagospenguin') {
    return (
      <group>
        <mesh castShadow position={[0, 0.55, 0]} scale={[0.38, 0.78, 0.32]}>
          <sphereGeometry args={[0.62, 18, 18]} />
          <primitive object={material} attach="material" />
        </mesh>
        <mesh castShadow position={[0, 0.72, -0.23]} scale={[0.24, 0.34, 0.18]}>
          <sphereGeometry args={[0.4, 18, 18]} />
          <meshToonMaterial color="#f3ead1" />
        </mesh>
      </group>
    );
  }
  if (specimen.id === 'flamingo') {
    return (
      <group>
        <mesh castShadow position={[0, 1.25, 0]} scale={[0.34, 0.24, 0.64]} rotation={[0.06, 0, 0]}>
          <sphereGeometry args={[0.72, 22, 18]} />
          <meshToonMaterial color="#e9a0a1" />
        </mesh>
        <mesh castShadow position={[0, 1.7, -0.34]} rotation={[0.58, 0, 0]}>
          <capsuleGeometry args={[0.055, 0.92, 6, 10]} />
          <meshToonMaterial color="#e7a2a6" />
        </mesh>
        <mesh castShadow position={[0, 2.08, -0.66]} scale={[0.24, 0.2, 0.3]}>
          <sphereGeometry args={[0.4, 18, 14]} />
          <meshToonMaterial color="#f0b2ae" />
        </mesh>
        <mesh castShadow position={[0, 2.04, -0.95]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.06, 0.38, 8]} />
          <meshToonMaterial color="#241f1f" />
        </mesh>
        {[-0.13, 0.13].map((x, index) => (
          <group key={index}>
            <mesh castShadow position={[x, 0.63, 0.06]}>
              <capsuleGeometry args={[0.025, 1.1, 4, 6]} />
              <meshToonMaterial color="#b97372" />
            </mesh>
            <mesh position={[x, 0.07, -0.04]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.55, 1]}>
              <capsuleGeometry args={[0.018, 0.34, 3, 5]} />
              <meshToonMaterial color="#493c32" />
            </mesh>
          </group>
        ))}
        <mesh castShadow position={[-0.22, 1.23, 0.04]} scale={[0.12, 0.19, 0.44]} rotation={[0.18, 0.15, -0.35]}>
          <sphereGeometry args={[0.56, 16, 12]} />
          <meshToonMaterial color="#d77f89" />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh castShadow position={[0, 0.25, 0]} scale={[0.8, 0.25, 0.55]}>
        <sphereGeometry args={[0.55, 18, 18]} />
        <primitive object={material} attach="material" />
      </mesh>
      {[-0.45, -0.15, 0.15, 0.45].map((x, index) => (
        <mesh key={index} position={[x, 0.16, -0.34]} rotation={[0.7, 0, 0]}>
          <capsuleGeometry args={[0.035, 0.4, 3, 6]} />
          <meshToonMaterial color="#b33a20" />
        </mesh>
      ))}
    </group>
  );
}

export function SpecimenShape({ specimen, animationSelector }) {
  const foliageMotion = foliageMotionForSpecimen(specimen);
  return (
    <ModelAsset
      id={assetIdForSpecimen(specimen)}
      fallback={<ProceduralSpecimenShape specimen={specimen} />}
      animationSelector={animationSelector}
      motion={foliageMotion}
    />
  );
}

// Crab-only idle wiggle. Kept in its own component so the per-frame callback is
// only registered for crabs instead of running a no-op for every specimen.
function CrabWiggle({ children }) {
  const group = useRef(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const burst = Math.max(0, Math.sin(t * 2.6));
    group.current.position.y = 0.01 + Math.abs(Math.sin(t * 9.0)) * 0.012 * burst;
    group.current.scale.setScalar(1 + Math.sin(t * 8.2) * 0.018 * burst);
  });
  return <group ref={group}>{children}</group>;
}

function AnimatedSpecimenShape({ specimen, animationSelector }) {
  if (specimen.id !== 'crab') {
    return <SpecimenShape specimen={specimen} animationSelector={animationSelector} />;
  }
  return (
    <CrabWiggle>
      <SpecimenShape specimen={specimen} animationSelector={animationSelector} />
    </CrabWiggle>
  );
}

function WadingWaterline({ localY, radius = 0.58, depth = 0.35 }) {
  const opacity = THREE.MathUtils.clamp(0.12 + depth * 0.08, 0.12, 0.22);
  const ringOpacity = THREE.MathUtils.clamp(0.08 + depth * 0.04, 0.08, 0.14);
  return (
    <group position={[0, localY, 0]} rotation-x={-Math.PI / 2}>
      <mesh scale={[radius * 1.12, radius * 0.72, 1]} renderOrder={4} raycast={NO_RAYCAST}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial
          color="#496f69"
          transparent
          opacity={opacity}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <mesh scale={[radius * 1.22, radius * 0.82, 1]} renderOrder={5} raycast={NO_RAYCAST}>
        <ringGeometry args={[0.86, 1, 64]} />
        <meshBasicMaterial
          color="#a8c9c1"
          transparent
          opacity={ringOpacity}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

export function SpecimenActor({ specimen }) {
  const group = useRef(null);
  const groundAffordanceRef = useRef(null);
  const actorId = specimen.instanceId || specimen.id;
  const runtimePublishRef = useRef({ x: Infinity, y: Infinity, z: Infinity, time: -Infinity });
  const isCollectedActor = useThreeGameStore(state => state.collectedSpecimenActorIds?.includes(actorId) || false);
  const selectedSpecimenId = useThreeGameStore(state => state.selectedSpecimenId);
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const setSelectedSpecimen = useThreeGameStore(state => state.setSelectedSpecimen);
  const setNearbySpecimen = useThreeGameStore(state => state.setNearbySpecimen);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const snareTrap = useThreeGameStore(state => (
    state.snareTraps?.find(trap => trap.status === 'sprung' && trap.caughtActorId === actorId) || null
  ));
  const setSpecimenRuntimePosition = useThreeGameStore(state => state.setSpecimenRuntimePosition);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const setCarriedObject = useThreeGameStore(state => state.setCarriedObject);
  // Narrow boolean: only flips when this specimen is picked up / put down, so
  // the contact shadow can hide while the animal is held off the ground.
  const isCarried = useThreeGameStore(state => state.carriedObjectId === actorId);
  // While this actor is under examination the camera is framing it; hold its
  // wander/patrol in place (idle animation keeps playing) so the shot stays
  // composed and any behavior the inquiry narrates has a steady subject.
  const isUnderExamination = useThreeGameStore(state => state.examineSession?.actorId === actorId);
  const examineOpen = useThreeGameStore(state => Boolean(state.examineSession));
  const carryProfile = useMemo(() => getFaunaCarryProfile(specimen), [specimen]);
  const behaviorProfile = useMemo(() => getFaunaBehaviorProfile(specimen), [specimen]);
  const carriedRef = useRef(false);
  // Where the animal currently lives; moving fauna patrol around this base.
  const behaviorBaseRef = useRef(null);
  const position = useMemo(() => {
    const [x, , z] = specimen.spawnPoint;
    // Auto-generated spawn points can land in the surf; pull them onto land.
    const safe = clampToWalkable(new THREE.Vector3(x, 0, z), null, currentZoneId);
    return new THREE.Vector3(safe.x, terrainHeight(safe.x, safe.z, currentZoneId) + 0.04, safe.z);
  }, [currentZoneId, specimen.spawnPoint]);
  const faunaBehavior = useFaunaBehavior({
    specimen,
    basePositionRef: behaviorBaseRef,
    basePosition: position,
    paused: isCarried || isUnderExamination || Boolean(snareTrap),
  });

  useEffect(() => {
    if (isCollectedActor) return;
    publishActorRuntimePosition({
      publisher: setSpecimenRuntimePosition,
      ref: runtimePublishRef,
      actorId,
      zoneId: currentZoneId,
      position,
      force: true,
    });
  }, [actorId, currentZoneId, isCollectedActor, position, setSpecimenRuntimePosition]);

  // Reset any relocated home when the zone (and therefore spawn) changes.
  useEffect(() => {
    behaviorBaseRef.current = position;
    faunaBehavior.reset?.({ basePosition: position, zoneId: currentZoneId });
  }, [currentZoneId, position]);

  // Release carry state if this actor unmounts while being held.
  useEffect(() => {
    if (!carryProfile) return undefined;
    const release = () => {
      const state = useThreeGameStore.getState();
      if (state.carriedObjectId === actorId) setCarriedObject(null);
      if (state.carryPrompt?.id === actorId) setCarryPrompt(null);
    };
    return release;
  }, [actorId, carryProfile, setCarriedObject, setCarryPrompt]);

  useEffect(() => (
    () => removeSpecimenRuntimePose(currentZoneId, actorId)
  ), [actorId, currentZoneId]);

  useEffect(() => {
    if (!isCollectedActor) return;
    removeSpecimenRuntimePose(currentZoneId, actorId);
    if (selectedSpecimenId === actorId) setSelectedSpecimen(null);
    if (nearbySpecimenId === actorId) setNearbySpecimen(null);
    const state = useThreeGameStore.getState();
    if (state.carriedObjectId === actorId) setCarriedObject(null);
    if (state.carryPrompt?.id === actorId) setCarryPrompt(null);
  }, [
    actorId,
    currentZoneId,
    isCollectedActor,
    nearbySpecimenId,
    selectedSpecimenId,
    setCarriedObject,
    setCarryPrompt,
    setNearbySpecimen,
    setSelectedSpecimen,
  ]);

  // Single per-actor frame callback: bare-handed carry/pickup handling (mirrors
  // the PhysicsProp carry flow) followed by the idle-behaviour fallback for
  // specimens without fauna AI. Merged so each actor registers one useFrame.
  useFrame(({ clock }) => {
    if (isCollectedActor) return;
    if (!group.current) return;
    const state = useThreeGameStore.getState();
    const carriedHere = state.carriedObjectId === actorId;
    if (groundAffordanceRef.current) {
      groundAffordanceRef.current.visible = !carriedHere && !snareTrap && faunaBehavior.airborneRef?.current !== true;
    }

    if (snareTrap) {
      const t = clock.elapsedTime;
      group.current.position.set(
        snareTrap.position.x,
        snareTrap.position.y + 0.045 + Math.sin(t * 8.5 + actorId.length) * 0.008,
        snareTrap.position.z,
      );
      group.current.rotation.set(0, (snareTrap.yaw || 0) + Math.sin(t * 6.2) * 0.12, Math.sin(t * 9.1) * 0.05);
      publishActorRuntimePosition({
        publisher: setSpecimenRuntimePosition,
        ref: runtimePublishRef,
        actorId,
        zoneId: currentZoneId,
        position: group.current.position,
        now: t,
        force: true,
        debug: { motionStatus: 'snared', trapId: snareTrap.id },
      });
      return;
    }

    if (carryProfile) {
      const pose = getRuntimePlayerPose();
      const player = pose?.position || { x: 0, y: 0, z: 0 };
      const facing = pose?.facing || { x: 0, z: -1 };
      const facingLength = Math.hypot(facing.x, facing.z) || 1;
      const aheadX = facing.x / facingLength;
      const aheadZ = facing.z / facingLength;

      if (carriedHere !== carriedRef.current) {
        carriedRef.current = carriedHere;
        if (!carriedHere) {
          // Put down: settle on walkable ground just ahead of the player.
          const safe = clampToWalkable(
            new THREE.Vector3(player.x + aheadX * CARRY_DROP_DISTANCE, 0, player.z + aheadZ * CARRY_DROP_DISTANCE),
            null,
            currentZoneId,
          );
          const groundY = terrainHeight(safe.x, safe.z, currentZoneId) + 0.04;
          behaviorBaseRef.current = new THREE.Vector3(safe.x, groundY, safe.z);
          faunaBehavior.reset?.({ basePosition: behaviorBaseRef.current, zoneId: currentZoneId });
          group.current.position.copy(behaviorBaseRef.current);
          setSpecimenRuntimePosition(actorId, { x: safe.x, y: groundY, z: safe.z }, currentZoneId);
        }
      }

      if (carriedHere) {
        group.current.position.set(
          player.x + aheadX * CARRY_HOLD_DISTANCE,
          player.y + carryProfile.holdHeight,
          player.z + aheadZ * CARRY_HOLD_DISTANCE,
        );
        group.current.rotation.y = Math.atan2(aheadX, aheadZ);
        setCarryPrompt({
          id: actorId,
          label: carryProfile.label,
          mode: 'drop',
          distance: 0,
          text: `Press E to put down ${carryProfile.label}`,
        });
        setSpecimenRuntimePosition(actorId, {
          x: group.current.position.x,
          y: group.current.position.y,
          z: group.current.position.z,
        }, currentZoneId);
        return;
      }

      // Animals are only grabbable bare-handed so E still collects with tools.
      if (state.activeToolId !== 'hands') {
        if (state.carryPrompt?.id === actorId) setCarryPrompt(null);
      } else {
        const distance = Math.hypot(group.current.position.x - player.x, group.current.position.z - player.z);
        const activePrompt = state.carryPrompt;
        if (!activePrompt || activePrompt.id === actorId || distance < (activePrompt.distance ?? Infinity)) {
          if (distance <= CARRY_PICKUP_DISTANCE) {
            setCarryPrompt({
              id: actorId,
              label: carryProfile.label,
              mode: 'pickup',
              distance,
              text: `Press E to pick up ${carryProfile.label}`,
            });
          } else if (activePrompt?.id === actorId) {
            setCarryPrompt(null);
          }
        }
      }
    }

    if (faunaBehavior.active) {
      const base = behaviorBaseRef.current || position;
      const motionPosition = faunaBehavior.positionRef.current;
      const usedMotion = copyFinitePosition(group.current.position, motionPosition, base);
      if (isFiniteVector3(group.current.position)) {
        group.current.rotation.set(
          faunaBehavior.pitchRef.current || 0,
          faunaBehavior.yawRef.current || 0,
          faunaBehavior.rollRef.current || 0,
        );
        const debug = {
          ...(faunaBehavior.debugRef.current || {}),
          motionStatus: faunaBehavior.statusRef.current,
          usedMotion,
          fallbackToBase: !usedMotion,
        };
        publishActorRuntimePosition({
          publisher: setSpecimenRuntimePosition,
          ref: runtimePublishRef,
          actorId,
          zoneId: currentZoneId,
          position: group.current.position,
          now: clock.elapsedTime,
          debug,
        });
      }
      return;
    }
    if (carriedHere) return;

    // Idle behaviour fallback for specimens without fauna AI.
    const base = behaviorBaseRef.current || position;
    const t = clock.elapsedTime;
    if (specimen.behavior === 'skitter') {
      const burst = Math.max(0, Math.sin(t * 2.2));
      group.current.position.x = base.x + Math.sin(t * 1.9) * 0.38 * burst;
      group.current.position.z = base.z + Math.cos(t * 1.35) * 0.12 * burst;
      group.current.rotation.y = Math.PI / 2 + Math.sin(t * 3.1) * 0.2 * burst;
    }
    if (specimen.behavior === 'curious') group.current.rotation.y = Math.sin(t * 1.2) * 0.8;
    if (specimen.behavior === 'bask') group.current.rotation.y = Math.sin(t * 0.35) * 0.18;
    if (specimen.behavior === 'graze') {
      group.current.rotation.y = -0.45 + Math.sin(t * 0.22) * 0.16;
      group.current.position.x = base.x + Math.sin(t * 0.18) * 0.12;
      group.current.position.z = base.z + Math.cos(t * 0.16) * 0.08;
    }
    if (specimen.behavior === 'waddle') {
      group.current.rotation.y = Math.PI + Math.sin(t * 1.4) * 0.18;
      group.current.rotation.z = Math.sin(t * 5.8) * 0.035;
      group.current.position.x = base.x + Math.sin(t * 0.75) * 0.18;
    }
    group.current.position.y = base.y + Math.abs(Math.sin(t * 1.1)) * (specimen.behavior === 'still' ? 0 : 0.03);
    publishActorRuntimePosition({
      publisher: setSpecimenRuntimePosition,
      ref: runtimePublishRef,
      actorId,
      zoneId: currentZoneId,
      position: group.current.position,
      now: t,
    });
  });

  const selected = selectedSpecimenId === actorId;
  const nearby = nearbySpecimenId === actorId;
  const markerY = specimen.id === 'galapagoscotton' ? 3.45
    : specimen.id === 'cactus' ? 2.15
    : specimen.id === 'basalt' ? 1.15
    : specimen.id === 'barnacle' ? 0.85
    : specimen.id === 'floreanagianttortoise' ? 1.8
    : specimen.id === 'flamingo' ? 2.35
    : specimen.id === 'lavagull' ? 1.05
    : specimen.id === 'cat' ? 0.95
    : 1.45;
  const contactRadius = specimen.id === 'floreanagianttortoise' ? 1.15
    : specimen.id === 'basalt' ? 0.85
    : specimen.id === 'cactus' ? 0.6
    : specimen.id === 'galapagoscotton' ? 0.9
    : specimen.id === 'barnacle' ? 0.38
    : specimen.id === 'frigatebird' ? 0.7
    : specimen.id === 'booby' ? 0.62
    : specimen.id === 'flamingo' ? 0.58
    : specimen.id === 'lavagull' ? 0.5
    : specimen.id === 'mediumgroundfinch' || specimen.id === 'crab' ? 0.5
    : specimen.id === 'cat' ? 0.45
    : specimen.id === 'galapagospenguin' ? 0.55
    : 0.8;
  const standingWater = useMemo(
    () => specimenStandingWaterState(position, currentZoneId),
    [currentZoneId, position],
  );
  const hideGroundAffordances = standingWater.active;
  const showWadingWaterline = standingWater.active
    && (behaviorProfile?.movementStyle === 'wade' || specimen.id === 'flamingo');
  const specimenContent = (
    <>
      <group ref={groundAffordanceRef}>
        {!isCarried && !hideGroundAffordances && <ContactShadow radius={contactRadius} />}
        {/* Selection rings/marker are HUD affordances — they'd pollute the
            composed examine shot, so they hide while a session is open. */}
        {!examineOpen && !hideGroundAffordances && (
          <mesh position={[0, 0.052, 0]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.98, nearby ? 1.42 : selected ? 1.28 : 1.15, 48]} />
            <meshBasicMaterial color={nearby ? '#fff2a8' : selected ? '#ffe48a' : '#ffffff'} transparent opacity={nearby ? 0.72 : selected ? 0.52 : 0.14} depthWrite={false} />
          </mesh>
        )}
        {nearby && !examineOpen && !hideGroundAffordances && (
          <>
            <mesh position={[0, 0.075, 0]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[1.52, 1.62, 64]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.42} depthWrite={false} />
            </mesh>
            <mesh position={[0, markerY, 0]} rotation={[0, Math.PI / 4, 0]}>
              <octahedronGeometry args={[0.18, 0]} />
              <meshBasicMaterial color="#fff2a8" transparent opacity={0.9} />
            </mesh>
          </>
        )}
      </group>
      {showWadingWaterline && (
        <WadingWaterline
          localY={standingWater.localSurfaceY}
          radius={contactRadius}
          depth={standingWater.depth}
        />
      )}
      <AnimatedSpecimenShape
        specimen={specimen}
        animationSelector={faunaBehavior.animationRef ? () => faunaBehavior.animationRef.current : null}
      />
    </>
  );
  if (isCollectedActor) return null;
  return (
    <group
      ref={group}
      position={position}
      scale={specimen.sceneScale || 1}
      userData={{
        renderSource: `specimen:${specimen.instanceId || specimen.id}`,
        renderLabel: `Specimen: ${specimen.id}`,
        renderKind: 'specimen-actor',
        renderPath: null,
      }}
      onClick={event => {
        event.stopPropagation();
        setSelectedSpecimen(actorId);
        setNearbySpecimen(actorId);
        setInspectedObject(specimenToInspectable(specimen, event.point || group.current?.position));
      }}
    >
      {specimenContent}
    </group>
  );
}
