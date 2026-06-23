'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { clampToWalkable, terrainHeight } from '../../world/terrain';
import { specimenToInspectable } from '../../world/inspectables';
import { useFaunaBehavior } from '../../fauna/useFaunaBehavior';
import { getFaunaCarryProfile } from '../../fauna/faunaBehaviorProfiles';
import { addRimLight, toonMaterial } from '../scene/materials';
import { ContactShadow } from '../scene/ContactShadow';
import { ModelAsset } from '../assets/ModelAsset';

const CARRY_PICKUP_DISTANCE = 2.15;
const CARRY_HOLD_DISTANCE = 1.12;
const CARRY_DROP_DISTANCE = 1.3;
const COTTON_FOLIAGE_MOTION = { wind: 1.9, bend: 0.35, bendRadius: 1.45 };
const DRY_GRASS_FOLIAGE_MOTION = { wind: 1.45, bend: 0.55, bendRadius: 1.25 };
const CACTUS_FOLIAGE_MOTION = { wind: 0.35, bend: 0.35 };

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
  if (specimen.id === 'marineiguana') return 'marineIguana';
  if (specimen.id === 'greenturtle' || specimen.id === 'greenTurtle') return 'greenTurtle';
  if (specimen.id === 'sealion' || specimen.id === 'seaLion') return 'seaLion';
  if (specimen.id === 'mediumgroundfinch') return 'mediumGroundFinch';
  if (specimen.id === 'floreanagianttortoise') return 'floreanaGiantTortoise';
  if (specimen.id === 'galapagospenguin') return 'galapagosPenguin';
  if (specimen.id === 'flightlesscormorant') return 'flightlessCormorant';
  if (specimen.id === 'frigatebird') return 'frigatebird';
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
    group.current.rotation.x = Math.sin(t * 6.0) * 0.035 * burst;
    group.current.rotation.z = Math.sin(t * 7.3) * 0.055 * burst;
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

export function SpecimenActor({ specimen }) {
  const group = useRef(null);
  const faunaMotionGroup = useRef(null);
  const selectedSpecimenId = useThreeGameStore(state => state.selectedSpecimenId);
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const setSelectedSpecimen = useThreeGameStore(state => state.setSelectedSpecimen);
  const setNearbySpecimen = useThreeGameStore(state => state.setNearbySpecimen);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const setSpecimenRuntimePosition = useThreeGameStore(state => state.setSpecimenRuntimePosition);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const setCarriedObject = useThreeGameStore(state => state.setCarriedObject);
  const collected = useThreeGameStore(state => state.collectedSpecimenIds.includes(specimen.id));
  // Narrow boolean: only flips when this specimen is picked up / put down, so
  // the contact shadow can hide while the animal is held off the ground.
  const isCarried = useThreeGameStore(state => state.carriedObjectId === specimen.id);
  const carryProfile = useMemo(() => getFaunaCarryProfile(specimen), [specimen]);
  const carriedRef = useRef(false);
  // Where the animal lives after being put down somewhere new; null = spawn.
  const carryBase = useRef(null);
  const position = useMemo(() => {
    const [x, , z] = specimen.spawnPoint;
    // Auto-generated spawn points can land in the surf; pull them onto land.
    const safe = clampToWalkable(new THREE.Vector3(x, 0, z), null, currentZoneId);
    return new THREE.Vector3(safe.x, terrainHeight(safe.x, safe.z, currentZoneId) + 0.04, safe.z);
  }, [currentZoneId, specimen.spawnPoint]);
  const faunaBehavior = useFaunaBehavior({
    specimen,
    groupRef: faunaMotionGroup,
    basePosition: position,
    collected,
  });

  useEffect(() => {
    setSpecimenRuntimePosition(specimen.id, {
      x: position.x,
      y: position.y,
      z: position.z,
    }, currentZoneId);
  }, [currentZoneId, position, setSpecimenRuntimePosition, specimen.id]);

  // Reset any relocated home when the zone (and therefore spawn) changes.
  useEffect(() => {
    carryBase.current = null;
  }, [currentZoneId, position]);

  // Release carry state if this actor unmounts or gets collected mid-carry.
  useEffect(() => {
    if (!carryProfile) return undefined;
    const release = () => {
      const state = useThreeGameStore.getState();
      if (state.carriedObjectId === specimen.id) setCarriedObject(null);
      if (state.carryPrompt?.id === specimen.id) setCarryPrompt(null);
    };
    if (collected) release();
    return release;
  }, [carryProfile, collected, setCarriedObject, setCarryPrompt, specimen.id]);

  // Single per-actor frame callback: bare-handed carry/pickup handling (mirrors
  // the PhysicsProp carry flow) followed by the idle-behaviour fallback for
  // specimens without fauna AI. Merged so each actor registers one useFrame.
  useFrame(({ clock }) => {
    if (collected || !group.current) return;
    const state = useThreeGameStore.getState();
    const carriedHere = state.carriedObjectId === specimen.id;

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
          carryBase.current = new THREE.Vector3(safe.x, groundY, safe.z);
          group.current.position.copy(carryBase.current);
          setSpecimenRuntimePosition(specimen.id, { x: safe.x, y: groundY, z: safe.z }, currentZoneId);
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
          id: specimen.id,
          label: carryProfile.label,
          mode: 'drop',
          distance: 0,
          text: `Press E to put down ${carryProfile.label}`,
        });
        setSpecimenRuntimePosition(specimen.id, {
          x: group.current.position.x,
          y: group.current.position.y,
          z: group.current.position.z,
        }, currentZoneId);
        return;
      }

      // Animals are only grabbable bare-handed so E still collects with tools.
      if (state.activeToolId !== 'hands') {
        if (state.carryPrompt?.id === specimen.id) setCarryPrompt(null);
      } else {
        const distance = Math.hypot(group.current.position.x - player.x, group.current.position.z - player.z);
        const activePrompt = state.carryPrompt;
        if (!activePrompt || activePrompt.id === specimen.id || distance < (activePrompt.distance ?? Infinity)) {
          if (distance <= CARRY_PICKUP_DISTANCE) {
            setCarryPrompt({
              id: specimen.id,
              label: carryProfile.label,
              mode: 'pickup',
              distance,
              text: `Press E to pick up ${carryProfile.label}`,
            });
          } else if (activePrompt?.id === specimen.id) {
            setCarryPrompt(null);
          }
        }
      }
    }

    // Idle behaviour fallback: fauna with AI drive their own transform, and a
    // carried animal is positioned above.
    if (faunaBehavior.active || carriedHere) return;
    const base = carryBase.current || position;
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
  });

  if (collected) return null;

  const selected = selectedSpecimenId === specimen.id;
  const nearby = nearbySpecimenId === specimen.id;
  const markerY = specimen.id === 'galapagoscotton' ? 3.45
    : specimen.id === 'cactus' ? 2.15
    : specimen.id === 'basalt' ? 1.15
    : specimen.id === 'barnacle' ? 0.85
    : specimen.id === 'floreanagianttortoise' ? 1.8
    : 1.45;
  const contactRadius = specimen.id === 'floreanagianttortoise' ? 1.15
    : specimen.id === 'basalt' ? 0.85
    : specimen.id === 'cactus' ? 0.6
    : specimen.id === 'galapagoscotton' ? 0.9
    : specimen.id === 'barnacle' ? 0.38
    : specimen.id === 'frigatebird' ? 0.7
    : specimen.id === 'mediumgroundfinch' || specimen.id === 'crab' ? 0.5
    : specimen.id === 'galapagospenguin' ? 0.55
    : 0.8;
  const specimenContent = (
    <>
      {!isCarried && <ContactShadow radius={contactRadius} />}
      <AnimatedSpecimenShape
        specimen={specimen}
        animationSelector={faunaBehavior.animationRef ? () => faunaBehavior.animationRef.current : null}
      />
      <mesh position={[0, 0.052, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.98, nearby ? 1.42 : selected ? 1.28 : 1.15, 48]} />
        <meshBasicMaterial color={nearby ? '#fff2a8' : selected ? '#ffe48a' : '#ffffff'} transparent opacity={nearby ? 0.72 : selected ? 0.52 : 0.14} depthWrite={false} />
      </mesh>
      {nearby && (
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
    </>
  );
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
        setSelectedSpecimen(specimen.id);
        setNearbySpecimen(specimen.id);
        setInspectedObject(specimenToInspectable(specimen, event.point || group.current?.position));
      }}
    >
      {faunaBehavior.active ? (
        <group ref={faunaMotionGroup}>{specimenContent}</group>
      ) : specimenContent}
    </group>
  );
}
