'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { movementTerrainHeight, terrainHeight } from '../../../world/terrain';
import { BreakablePlantField } from '../breakablePlant/BreakablePlantField';
import { getSicyosSites, SICYOS_SITES } from './sicyosSites';
import {
  buildSicyos,
  buildSicyosDressing,
  buildSicyosSegmentGeometry,
  getSicyosMaterials,
  sicyosColliderSpec,
} from './sicyosModel';

const UP = new THREE.Vector3(0, 1, 0);

function buildZonePieces(zoneId, sites = getSicyosSites(zoneId)) {
  const pieces = [];
  for (const site of sites) {
    const plant = buildSicyos(site);
    // Render terrain carries small-scale relief absent from the smoother
    // movement surface. Seat the crown on the higher of the two so the broad
    // leaves never begin clipped, with only a two-centimetre botanical lift.
    const groundY = Math.max(
      movementTerrainHeight(site.x, site.z, zoneId),
      terrainHeight(site.x, site.z, zoneId),
    ) + 0.022;
    const siteQuat = new THREE.Quaternion().setFromAxisAngle(UP, site.yaw || 0);
    const keyFor = localId => `${zoneId}:sicyos-villosus:${site.id}:${localId}`;

    for (const segment of plant.segments) {
      const localBase = segment.position.clone().applyQuaternion(siteQuat);
      const quaternion = siteQuat.clone().multiply(segment.quaternion);
      const euler = new THREE.Euler().setFromQuaternion(quaternion);
      const spawn = new THREE.Vector3(site.x + localBase.x, groundY + localBase.y, site.z + localBase.z);
      const center = new THREE.Vector3(0, segment.length * 0.5, 0)
        .applyQuaternion(quaternion)
        .add(spawn);
      const collider = sicyosColliderSpec(segment);
      const visualGeometry = buildSicyosSegmentGeometry(segment);
      const rootRunner = segment.generation === 0;
      pieces.push({
        key: keyFor(segment.id),
        parentKey: segment.parentId ? keyFor(segment.parentId) : null,
        type: 'vine-segment',
        siteId: site.id,
        spawn: spawn.toArray(),
        rotation: [euler.x, euler.y, euler.z],
        center,
        topY: Math.max(spawn.y, center.y + segment.length * 0.5),
        width: Math.max(segment.radius * 2, ...segment.leaves.map(leaf => leaf.width)),
        height: segment.length,
        mass: segment.mass,
        hits: rootRunner ? 6 : 3,
        colliderArgs: collider.halfExtents,
        colliderOffset: collider.offset,
        ccd: false,
        dustCount: 3,
        cutDustCount: 1,
        releaseWithParent: segment.generation >= 2,
        breakOnLanding: false,
        pushable: true,
        knifeCuttable: !rootRunner,
        unbreakable: rootRunner,
        windAmp: 0.015 + segment.generation * 0.006,
        visualGeometry,
        specimenId: 'sicyosvillosus',
        sampleLabel: 'hairy sicyos cutting',
        promptText: 'Press E to collect the pressed sicyos cutting',
        sampleOutcome: {
          condition: 'field_collected',
          collectMessage: 'You fold the great heart-shaped leaf around its cut stem and press it between dry sheets.',
          evidence: 'collected Sicyos villosus cutting',
          scoreDelta: 6,
          symsLine: 'Syms frees a tendril from his cuff. “A determined climber, sir — it has taken hold of everything.”',
        },
        educationalNote: 'Hooker later described this Charles Island vine from Darwin’s specimen: glandular-hairy stems, broad cordate leaves, divided tendrils, small yellow flowers, and bristly fruit.',
      });
    }
  }
  return pieces;
}

function SiteDressing({ site, zoneId }) {
  const dressing = useMemo(() => buildSicyosDressing(site), [site]);
  const material = getSicyosMaterials().litter;
  return (
    <group>
      {dressing.map(item => (
        <mesh
          key={item.id}
          castShadow={false}
          receiveShadow
          position={[
            site.x + item.x,
            terrainHeight(site.x + item.x, site.z + item.z, zoneId) + item.scale * 0.22,
            site.z + item.z,
          ]}
          rotation={[Math.PI * 0.46, item.yaw, 0]}
          scale={[
            item.scale * item.stretch[0],
            item.scale * item.stretch[1],
            item.scale * item.stretch[2],
          ]}
          material={material}
        >
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
    </group>
  );
}

function renderPiece(piece) {
  const materials = getSicyosMaterials();
  const geometry = piece.visualGeometry;
  return (
    <>
      {geometry.stems && <mesh castShadow geometry={geometry.stems} material={materials.stem} />}
      {geometry.leaves && <mesh castShadow receiveShadow geometry={geometry.leaves} material={materials.leaf} />}
      {geometry.veins && <mesh castShadow={false} geometry={geometry.veins} material={materials.vein} />}
      {geometry.tendrils && <mesh castShadow={false} geometry={geometry.tendrils} material={materials.tendril} />}
      {geometry.hairs && <mesh castShadow={false} geometry={geometry.hairs} material={materials.hair} />}
      {geometry.petals && <mesh castShadow={false} geometry={geometry.petals} material={materials.petal} />}
      {geometry.centers && <mesh castShadow={false} geometry={geometry.centers} material={materials.flowerCenter} />}
      {geometry.fruits && <mesh castShadow geometry={geometry.fruits} material={materials.fruit} />}
      {geometry.fruitBristles && <mesh castShadow={false} geometry={geometry.fruitBristles} material={materials.fruitBristle} />}
    </>
  );
}

const SICYOS_SPEC = {
  id: 'sicyos-villosus',
  sitesByZone: SICYOS_SITES,
  getSites: getSicyosSites,
  examinableSpecimenId: 'sicyosvillosus',
  highlight: { markerY: 1.02, footprintRadius: 1.18 },
  buildZonePieces,
  SiteDressing,
  renderPiece,
  strikeAbsorbMessage: piece => (piece.unbreakable
    ? 'The soft crown flattens beneath the hammer and springs back. A careful cutting would preserve far more evidence.'
    : 'The hairy runner bruises but remains attached; the pocket knife would make a cleaner botanical cutting.'),
  absorbEducationalNote: 'A pressed shoot with leaf, tendril, flower, and fruit preserves the characters needed for comparison better than a battered stem.',
  tuning: {
    strikeDamage: 1,
    shotgunDamage: 2,
    contactBreakDamage: 0,
    propBreakContactForce: 1600,
    pushMaxBend: 0.24,
    pushBreakSpeed: 30,
    pushBreakAngle: 0.23,
    pushBreakDelay: 0.2,
    pushBreakKick: 0.7,
    bendStiffness: 18,
    bendDamping: 5.2,
    contactBendBase: 0.13,
    contactBendSpeed: 0.018,
    windSway: 0.032,
    knifeReleaseSpeed: 0.72,
    knifeReleaseLiftSpeed: 0.12,
    knifeReleaseVelocityCap: 1.05,
    coherentCascade: true,
    cascadeMomentumScale: 0.72,
    cascadeTorqueScale: 0.12,
  },
};

export function SicyosField() {
  return <BreakablePlantField spec={SICYOS_SPEC} />;
}
