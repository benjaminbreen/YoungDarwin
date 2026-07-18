'use client';

// Procedural interactive palo santo. The trunk and main scaffold are solid
// fixed obstacles; reachable outer branches can flex, snap into dynamic rigid
// bodies, collide with the terrain, and be collected as aromatic twig samples.

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { movementTerrainHeight, terrainHeight } from '../../../world/terrain';
import { BreakablePlantField } from '../breakablePlant/BreakablePlantField';
import { getPaloSantoSites, PALO_SANTO_SITES } from './paloSantoSites';
import {
  branchColliderSpec,
  branchHitPoints,
  buildPaloSanto,
  buildPaloSantoDressing,
  buildPaloSantoFoliageGeometry,
  buildPaloSantoLimbGeometry,
  getPaloSantoBranchGeometry,
  getPaloSantoMaterials,
} from './paloSantoModel';

const UP = new THREE.Vector3(0, 1, 0);

function buildZonePieces(zoneId, sites = getPaloSantoSites(zoneId)) {
  const pieces = [];
  for (const site of sites) {
    const tree = buildPaloSanto(site);
    const groundY = movementTerrainHeight(site.x, site.z, zoneId);
    const siteQuat = new THREE.Quaternion().setFromAxisAngle(UP, site.yaw || 0);
    const keyFor = localId => `${zoneId}:palo-santo:${site.id}:${localId}`;
    for (const branch of tree.segments) {
      const localBase = branch.position.clone().applyQuaternion(siteQuat);
      const quaternion = siteQuat.clone().multiply(branch.quaternion);
      const euler = new THREE.Euler().setFromQuaternion(quaternion);
      const spawn = new THREE.Vector3(
        site.x + localBase.x,
        groundY + localBase.y,
        site.z + localBase.z,
      );
      const center = new THREE.Vector3(0, branch.length * 0.5, 0)
        .applyQuaternion(quaternion)
        .add(spawn);
      const collider = branchColliderSpec(branch);
      const trunk = branch.role === 'trunk';
      const inverseBranchQuat = branch.quaternion.clone().invert();
      const toBranchLocal = point => point.clone()
        .sub(branch.position)
        .applyQuaternion(inverseBranchQuat);
      const visualGeometry = buildPaloSantoLimbGeometry({
        points: branch.points.map(toBranchLocal),
        radiusStart: branch.radiusStart,
        radiusEnd: branch.radiusEnd,
        role: branch.role,
        variant: branch.variant,
      }, branch.twigs.map(twig => ({
        ...twig,
        points: twig.points.map(toBranchLocal),
      })));
      const foliageGeometry = buildPaloSantoFoliageGeometry(branch.foliage.map(cluster => ({
        ...cluster,
        position: toBranchLocal(cluster.position).toArray(),
        direction: cluster.direction.clone().applyQuaternion(inverseBranchQuat).normalize().toArray(),
      })));
      const highestPointY = [...branch.points, ...branch.twigs.flatMap(twig => twig.points)]
        .reduce((highest, point) => Math.max(highest, point.y), branch.position.y);
      pieces.push({
        key: keyFor(branch.id),
        parentKey: branch.parentId ? keyFor(branch.parentId) : null,
        type: branch.role,
        siteId: site.id,
        spawn: [spawn.x, spawn.y, spawn.z],
        rotation: [euler.x, euler.y, euler.z],
        center,
        topY: groundY + highestPointY + branch.radiusStart,
        width: branch.radiusStart * 2,
        height: branch.length,
        length: branch.length,
        radius: branch.radiusStart,
        mass: branch.mass,
        hits: branchHitPoints(branch),
        variant: branch.variant,
        colliderArgs: collider.halfExtents,
        colliderOffset: collider.offset,
        ccd: branch.role === 'branch',
        dustCount: trunk ? 8 : 5,
        releaseWithParent: branch.generation >= 2,
        breakOnLanding: !trunk,
        pushable: branch.generation >= 2,
        unbreakable: trunk,
        // The shared site-level sway moves the whole tree coherently. Segment-
        // local wind would pull adjoining meshes apart and expose bright seams.
        windAmp: 0,
        visualGeometry,
        foliageGeometry,
        barkIndex: branch.barkIndex,
        specimenId: 'palosantotwig',
        sampleLabel: 'palo santo twig',
        promptText: 'Press E to collect palo santo twig',
        sampleOutcome: {
          condition: 'field_collected',
          collectMessage: 'You wrap the pale twig; its resinous fragrance remains on your fingers.',
          evidence: 'collected palo santo twig',
          scoreDelta: 3,
          symsLine: 'Syms lifts the label to his nose. "A powerful scent for such dry wood, sir."',
        },
        educationalNote: 'Palo santo sheds its leaves through the long dry season; its aromatic wood stores resin beneath pale mottled bark.',
        tone: branch.variant / 8,
      });
    }
  }
  return pieces;
}

function SiteDressing({ site, zoneId }) {
  const roots = useMemo(() => {
    const dressing = buildPaloSantoDressing(site);
    const siteQuat = new THREE.Quaternion().setFromAxisAngle(UP, site.yaw || 0);
    return dressing.roots.map(root => {
      const quaternion = siteQuat.clone().multiply(root.quaternion);
      return { ...root, rotation: new THREE.Euler().setFromQuaternion(quaternion) };
    });
  }, [site]);
  const materials = getPaloSantoMaterials();
  const groundY = terrainHeight(site.x, site.z, zoneId);
  return (
    <group position={[site.x, groundY - 0.045, site.z]}>
      {roots.map((root, index) => (
        <mesh
          key={`root-${index}`}
          castShadow
          receiveShadow
          geometry={getPaloSantoBranchGeometry(root.variant)}
          material={materials.bark[root.barkIndex % materials.bark.length]}
          rotation={[root.rotation.x, root.rotation.y, root.rotation.z]}
          scale={[root.radius, root.length, root.radius]}
        />
      ))}
    </group>
  );
}

function renderPiece(piece) {
  const materials = getPaloSantoMaterials();
  const bark = materials.bark[(piece.barkIndex || 0) % materials.bark.length];
  return (
    <>
      <mesh
        castShadow
        receiveShadow
        geometry={piece.visualGeometry}
        material={bark}
      />
      {piece.foliageGeometry?.stems && (
        <mesh
          castShadow={false}
          geometry={piece.foliageGeometry.stems}
          material={materials.leafStems}
        />
      )}
      {piece.foliageGeometry?.greenLeaves && (
        <mesh
          castShadow={false}
          geometry={piece.foliageGeometry.greenLeaves}
          material={materials.leaves}
        />
      )}
      {piece.foliageGeometry?.oliveLeaves && (
        <mesh
          castShadow={false}
          geometry={piece.foliageGeometry.oliveLeaves}
          material={materials.oliveLeaves}
        />
      )}
      {piece.foliageGeometry?.dryLeaves && (
        <mesh
          castShadow={false}
          geometry={piece.foliageGeometry.dryLeaves}
          material={materials.dryLeaves}
        />
      )}
    </>
  );
}

const PALO_SANTO_SPEC = {
  id: 'palo-santo',
  sitesByZone: PALO_SANTO_SITES,
  getSites: getPaloSantoSites,
  inspectableType: 'palo_santo',
  buildZonePieces,
  SiteDressing,
  renderPiece,
  strikeAbsorbMessage: piece => (piece.unbreakable
    ? 'The hammer rebounds from the living trunk. Pale bark flakes away, but the tree stands firm.'
    : piece.hits > 2
      ? 'The crooked limb shudders and gives off a sharp resinous scent.'
      : 'The dry outer branch cracks along the grain; another blow should free it.'),
  absorbEducationalNote: 'Palo santo is a slow-growing dry-zone tree. A small twig is enough for a useful botanical and aromatic sample.',
  tuning: {
    strikeDamage: 1,
    shotgunDamage: 2,
    contactBreakDamage: 1,
    propBreakContactForce: 760,
    pushMaxBend: 0.065,
    pushBreakSpeed: 6.15,
    pushBreakReach: 0.5,
    pushBreakAngle: 0.052,
    pushBreakDelay: 0.12,
    pushBreakKick: 1.3,
    bendStiffness: 42,
    bendDamping: 11,
    contactBendBase: 0.035,
    contactBendSpeed: 0.006,
    windSway: 0.0025,
  },
};

export function PaloSantoField() {
  return <BreakablePlantField spec={PALO_SANTO_SPEC} />;
}
