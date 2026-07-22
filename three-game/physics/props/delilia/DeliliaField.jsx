'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { movementTerrainHeight, terrainHeight } from '../../../world/terrain';
import { BreakablePlantField } from '../breakablePlant/BreakablePlantField';
import { DELILIA_SITES, getDeliliaSites } from './deliliaSites';
import {
  buildDelilia,
  buildDeliliaDressing,
  buildDeliliaSegmentGeometry,
  deliliaColliderSpec,
  getDeliliaMaterials,
} from './deliliaModel';

const UP = new THREE.Vector3(0, 1, 0);

function buildZonePieces(zoneId, sites = getDeliliaSites(zoneId)) {
  const pieces = [];
  for (const site of sites) {
    const plant = buildDelilia(site);
    const groundY = Math.max(
      movementTerrainHeight(site.x, site.z, zoneId),
      terrainHeight(site.x, site.z, zoneId),
    ) + 0.018;
    const siteQuat = new THREE.Quaternion().setFromAxisAngle(UP, site.yaw || 0);
    const keyFor = localId => `${zoneId}:delilia-inelegans:${site.id}:${localId}`;

    for (const segment of plant.segments) {
      const localBase = segment.position.clone().applyQuaternion(siteQuat);
      const quaternion = siteQuat.clone().multiply(segment.quaternion);
      const euler = new THREE.Euler().setFromQuaternion(quaternion);
      const spawn = new THREE.Vector3(site.x + localBase.x, groundY + localBase.y, site.z + localBase.z);
      const center = new THREE.Vector3(0, segment.length * 0.5, 0).applyQuaternion(quaternion).add(spawn);
      const collider = deliliaColliderSpec(segment);
      const rootStem = segment.generation === 0;
      pieces.push({
        key: keyFor(segment.id),
        parentKey: segment.parentId ? keyFor(segment.parentId) : null,
        type: 'flowering-herb-segment',
        siteId: site.id,
        spawn: spawn.toArray(),
        rotation: [euler.x, euler.y, euler.z],
        center,
        topY: Math.max(spawn.y, center.y + segment.length * 0.5),
        width: Math.max(segment.radius * 2, ...segment.leafPairs.map(pair => pair.width * 2)),
        height: segment.length,
        mass: segment.mass,
        hits: rootStem ? 7 : 3,
        colliderArgs: collider.halfExtents,
        colliderOffset: collider.offset,
        ccd: false,
        dustCount: 2,
        cutDustCount: 1,
        releaseWithParent: segment.generation >= 2,
        breakOnLanding: false,
        pushable: true,
        knifeCuttable: !rootStem,
        unbreakable: rootStem,
        windAmp: 0.01 + segment.generation * 0.006,
        visualGeometry: buildDeliliaSegmentGeometry(segment),
        specimenId: 'deliliainelegans',
        sampleLabel: 'flowering delilia sprig',
        promptText: 'Press E to collect the flowering delilia sprig',
        sampleOutcome: {
          condition: 'field_collected',
          collectMessage: 'You arrange the opposite leaves and crowded axillary heads between dry sheets, preserving the slight herb whole enough to study.',
          evidence: 'collected Delilia inelegans sprig',
          scoreDelta: 7,
          symsLine: 'Syms peers at the small heads. “Easy enough to walk past, sir. Perhaps that is why it feels such a find.”',
        },
        educationalNote: 'Hooker described this plant from Darwin’s Charles Island specimen: an annual about one foot high, divided into three ascending branches, with opposite serrated leaves and flattened flower-heads crowded in their axils.',
      });
    }
  }
  return pieces;
}

function SiteDressing({ site, zoneId }) {
  const dressing = useMemo(() => buildDeliliaDressing(site), [site]);
  const material = getDeliliaMaterials().litter;
  return (
    <group>
      {dressing.map(item => (
        <mesh
          key={item.id}
          castShadow={false}
          receiveShadow
          position={[
            site.x + item.x,
            terrainHeight(site.x + item.x, site.z + item.z, zoneId) + item.scale * 0.18,
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
  const materials = getDeliliaMaterials();
  const geometry = piece.visualGeometry;
  return (
    <>
      {geometry.stems && <mesh castShadow geometry={geometry.stems} material={materials.stem} />}
      {geometry.leaves && <mesh castShadow receiveShadow geometry={geometry.leaves} material={materials.leaf} />}
      {geometry.veins && <mesh castShadow={false} geometry={geometry.veins} material={materials.vein} />}
      {geometry.hairs && <mesh castShadow={false} geometry={geometry.hairs} material={materials.hair} />}
      {geometry.flowerHeads && <mesh castShadow geometry={geometry.flowerHeads} material={materials.flowerHead} />}
      {geometry.flowerTips && <mesh castShadow={false} geometry={geometry.flowerTips} material={materials.flowerTip} />}
    </>
  );
}

const DELILIA_SPEC = {
  id: 'delilia-inelegans',
  sitesByZone: DELILIA_SITES,
  getSites: getDeliliaSites,
  examinableSpecimenId: 'deliliainelegans',
  highlight: { markerY: 0.7, footprintRadius: 0.66 },
  buildZonePieces,
  SiteDressing,
  renderPiece,
  strikeAbsorbMessage: piece => (piece.unbreakable
    ? 'The small crown bows beneath the hammer and returns. A knife-cut flowering sprig would preserve the evidence.'
    : 'The pubescent branch bruises but stays attached; the pocket knife would make a clean botanical cutting.'),
  absorbEducationalNote: 'For a slight composite herb, the branching pattern, paired leaves, and flower-head position matter more than a large battered sample.',
  tuning: {
    strikeDamage: 1,
    shotgunDamage: 2,
    contactBreakDamage: 0,
    propBreakContactForce: 1800,
    pushMaxBend: 0.2,
    pushBreakSpeed: 30,
    pushBreakAngle: 0.22,
    pushBreakDelay: 0.2,
    pushBreakKick: 0.55,
    bendStiffness: 20,
    bendDamping: 5.6,
    contactBendBase: 0.12,
    contactBendSpeed: 0.014,
    windSway: 0.025,
    knifeReleaseSpeed: 0.62,
    knifeReleaseLiftSpeed: 0.1,
    knifeReleaseVelocityCap: 0.92,
    coherentCascade: true,
    cascadeMomentumScale: 0.68,
    cascadeTorqueScale: 0.1,
  },
};

export function DeliliaField() {
  return <BreakablePlantField spec={DELILIA_SPEC} />;
}
