'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { movementTerrainHeight, terrainHeight } from '../../../world/terrain';
import { BreakablePlantField } from '../breakablePlant/BreakablePlantField';
import { LECOCARPUS_SITES, getLecocarpusSites } from './lecocarpusSites';
import {
  buildLecocarpus,
  buildLecocarpusDressing,
  buildLecocarpusSegmentGeometry,
  getLecocarpusMaterials,
  lecocarpusColliderSpec,
} from './lecocarpusModel';

const UP = new THREE.Vector3(0, 1, 0);

function buildZonePieces(zoneId, sites = getLecocarpusSites(zoneId)) {
  const pieces = [];
  for (const site of sites) {
    const plant = buildLecocarpus(site);
    const groundY = Math.max(movementTerrainHeight(site.x, site.z, zoneId), terrainHeight(site.x, site.z, zoneId)) + 0.02;
    const siteQuat = new THREE.Quaternion().setFromAxisAngle(UP, site.yaw || 0);
    const keyFor = localId => `${zoneId}:lecocarpus-pinnatifidus:${site.id}:${localId}`;
    for (const segment of plant.segments) {
      const localBase = segment.position.clone().applyQuaternion(siteQuat);
      const quaternion = siteQuat.clone().multiply(segment.quaternion);
      const euler = new THREE.Euler().setFromQuaternion(quaternion);
      const spawn = new THREE.Vector3(site.x + localBase.x, groundY + localBase.y, site.z + localBase.z);
      const center = new THREE.Vector3(0, segment.length * 0.5, 0).applyQuaternion(quaternion).add(spawn);
      const collider = lecocarpusColliderSpec(segment);
      const trunk = segment.generation === 0;
      pieces.push({
        key: keyFor(segment.id),
        parentKey: segment.parentId ? keyFor(segment.parentId) : null,
        type: 'daisy-shrub-branch',
        siteId: site.id,
        spawn: spawn.toArray(),
        rotation: [euler.x, euler.y, euler.z],
        center,
        topY: Math.max(spawn.y, center.y + segment.length * 0.5 + (segment.terminal ? 0.11 : 0)),
        width: Math.max(segment.radius * 2, ...segment.leaves.map(leaf => leaf.width * 2)),
        height: segment.length + (segment.terminal ? 0.11 : 0),
        mass: segment.mass,
        hits: trunk ? 9 : segment.generation === 1 ? 5 : 3,
        colliderArgs: collider.halfExtents,
        colliderOffset: collider.offset,
        ccd: false,
        dustCount: 3,
        cutDustCount: 1,
        releaseWithParent: segment.generation >= 2,
        breakOnLanding: false,
        pushable: true,
        knifeCuttable: segment.generation >= 2,
        unbreakable: trunk,
        windAmp: 0.008 + segment.generation * 0.006,
        visualGeometry: buildLecocarpusSegmentGeometry(segment),
        specimenId: 'lecocarpuspinnatifidus',
        sampleLabel: 'flowering Floreana daisy sprig',
        promptText: 'Press E to collect the Floreana daisy sprig',
        sampleOutcome: {
          condition: 'field_collected',
          collectMessage: 'You cut a terminal sprig with leaf, yellow head, and winged fruit represented together, then settle it between pressing sheets.',
          evidence: 'collected Lecocarpus pinnatifidus sprig',
          scoreDelta: 7,
          symsLine: 'Syms turns the papery fruit in the light. “A wing on the seed—and nowhere beyond this island, you say?”',
        },
        educationalNote: 'Darwin collected this Floreana-endemic daisy in 1835. Its leaves range from broadly cut to deeply pinnatifid, and its winged fruit distinguishes it among Lecocarpus.',
      });
    }
  }
  return pieces;
}

function SiteDressing({ site, zoneId }) {
  const dressing = useMemo(() => buildLecocarpusDressing(site), [site]);
  const material = getLecocarpusMaterials().litter;
  return <group>{dressing.map(item => (
    <mesh key={item.id} castShadow={false} receiveShadow position={[site.x + item.x, terrainHeight(site.x + item.x, site.z + item.z, zoneId) + item.scale * 0.18, site.z + item.z]} rotation={[Math.PI * 0.46, item.yaw, 0]} scale={[item.scale * item.stretch[0], item.scale * item.stretch[1], item.scale * item.stretch[2]]} material={material}>
      <dodecahedronGeometry args={[1, 0]} />
    </mesh>
  ))}</group>;
}

function renderPiece(piece) {
  const materials = getLecocarpusMaterials();
  const geometry = piece.visualGeometry;
  return <>
    {geometry.stems && <mesh castShadow geometry={geometry.stems} material={materials.stem} />}
    {geometry.leaves && <mesh castShadow receiveShadow geometry={geometry.leaves} material={materials.leaf} />}
    {geometry.veins && <mesh castShadow={false} geometry={geometry.veins} material={materials.vein} />}
    {geometry.petals && <mesh castShadow={false} geometry={geometry.petals} material={materials.petal} />}
    {geometry.disks && <mesh castShadow geometry={geometry.disks} material={materials.disk} />}
    {geometry.fruits && <mesh castShadow geometry={geometry.fruits} material={materials.fruit} />}
    {geometry.wings && <mesh castShadow={false} geometry={geometry.wings} material={materials.wing} />}
  </>;
}

const LECOCARPUS_SPEC = {
  id: 'lecocarpus-pinnatifidus',
  sitesByZone: LECOCARPUS_SITES,
  getSites: getLecocarpusSites,
  examinableSpecimenId: 'lecocarpuspinnatifidus',
  highlight: { markerY: 1.25, footprintRadius: 0.86 },
  buildZonePieces,
  SiteDressing,
  renderPiece,
  strikeAbsorbMessage: piece => (piece.unbreakable
    ? 'The woody crown shudders and holds. A terminal cutting would preserve the leaf and fruit without destroying this rare shrub.'
    : 'The branch flexes, shedding a little dust; use the pocket knife on a slender flowering tip for a defensible specimen.'),
  absorbEducationalNote: 'A terminal sprig can preserve the variable cut leaf, composite head, and diagnostic winged fruit while leaving the rootstock alive.',
  tuning: {
    strikeDamage: 1,
    shotgunDamage: 2,
    contactBreakDamage: 0,
    propBreakContactForce: 1500,
    pushMaxBend: 0.16,
    pushBreakSpeed: 30,
    pushBreakAngle: 0.2,
    pushBreakDelay: 0.2,
    pushBreakKick: 0.48,
    bendStiffness: 25,
    bendDamping: 7,
    contactBendBase: 0.1,
    contactBendSpeed: 0.012,
    windSway: 0.02,
    knifeReleaseSpeed: 0.76,
    knifeReleaseLiftSpeed: 0.12,
    knifeReleaseVelocityCap: 1.08,
    coherentCascade: true,
    cascadeMomentumScale: 0.72,
    cascadeTorqueScale: 0.12,
  },
};

export function LecocarpusField() {
  return <BreakablePlantField spec={LECOCARPUS_SPEC} />;
}
