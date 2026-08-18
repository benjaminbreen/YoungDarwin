'use client';

// Procedural interactive palo santo. The trunk and main scaffold are solid
// fixed obstacles; reachable outer branches can flex, snap into dynamic rigid
// bodies, collide with the terrain, and be collected as aromatic twig samples.

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { movementTerrainHeight, terrainHeight } from '../../../world/terrain';
import {
  BreakablePlantField,
  composePlantPartMatrix,
} from '../breakablePlant/BreakablePlantField';
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
        // Only outer twigs snap off in the hand, but the trunk and main limbs
        // still register a shoulder. Without this the piece nearest Darwin
        // when he leans on the bole was never a push candidate at all, so the
        // tree simply ignored him.
        pushContact: true,
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

// Surface roots for every site, merged into one static mesh per bark tint —
// this was one mesh per root (23 draw calls at Post Office Bay).
function ZoneDressing({ sites, zoneId }) {
  const materials = getPaloSantoMaterials();
  const merged = useMemo(() => {
    const byBark = new Map();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const siteQuat = new THREE.Quaternion();
    for (const site of sites) {
      const dressing = buildPaloSantoDressing(site);
      siteQuat.setFromAxisAngle(UP, site.yaw || 0);
      const groundY = terrainHeight(site.x, site.z, zoneId);
      position.set(site.x, groundY - 0.045, site.z);
      for (const root of dressing.roots) {
        quaternion.copy(siteQuat).multiply(root.quaternion);
        scale.set(root.radius, root.length, root.radius);
        const geometry = getPaloSantoBranchGeometry(root.variant).clone();
        geometry.applyMatrix4(matrix.compose(position, quaternion, scale));
        const barkIndex = root.barkIndex % materials.bark.length;
        if (!byBark.has(barkIndex)) byBark.set(barkIndex, []);
        byBark.get(barkIndex).push(geometry);
      }
    }
    const buckets = [];
    for (const [barkIndex, list] of byBark) {
      const geometry = mergeGeometries(list, false);
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      for (const part of list) part.dispose();
      buckets.push({ barkIndex, geometry });
    }
    return buckets;
  }, [materials, sites, zoneId]);

  useEffect(() => () => {
    for (const bucket of merged) bucket.geometry.dispose();
  }, [merged]);

  return (
    <group>
      {merged.map(bucket => (
        <mesh
          key={`roots-${bucket.barkIndex}`}
          castShadow
          receiveShadow
          geometry={bucket.geometry}
          material={materials.bark[bucket.barkIndex]}
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

function dormantVisualParts(piece) {
  const materials = getPaloSantoMaterials();
  const matrix = composePlantPartMatrix(piece);
  const parts = [{
    geometry: piece.visualGeometry,
    material: materials.bark[(piece.barkIndex || 0) % materials.bark.length],
    matrix,
    castShadow: true,
    receiveShadow: true,
  }];
  if (piece.foliageGeometry?.stems) {
    parts.push({
      geometry: piece.foliageGeometry.stems,
      material: materials.leafStems,
      matrix,
    });
  }
  if (piece.foliageGeometry?.greenLeaves) {
    parts.push({
      geometry: piece.foliageGeometry.greenLeaves,
      material: materials.leaves,
      matrix,
    });
  }
  if (piece.foliageGeometry?.oliveLeaves) {
    parts.push({
      geometry: piece.foliageGeometry.oliveLeaves,
      material: materials.oliveLeaves,
      matrix,
    });
  }
  if (piece.foliageGeometry?.dryLeaves) {
    parts.push({
      geometry: piece.foliageGeometry.dryLeaves,
      material: materials.dryLeaves,
      matrix,
    });
  }
  return parts;
}

const PALO_SANTO_SPEC = {
  id: 'palo-santo',
  sitesByZone: PALO_SANTO_SITES,
  getSites: getPaloSantoSites,
  inspectableType: 'palo_santo',
  buildZonePieces,
  ZoneDressing,
  renderPiece,
  dormantVisualParts,
  // Every limb's geometry is procedurally unique, so instanced batching
  // degenerates to one draw per part (227 uncullable calls in Post Office
  // Bay). Merge each site's parts per material instead.
  dormantLodStrategy: 'merged-per-site',
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
    // A slender dry-zone trunk. It should not sway like a shrub, but the old
    // 0.065 rad (3.7 deg) cap with near-critical damping meant shouldering a
    // palo santo produced no readable movement at all. 0.11 rad is about 6
    // degrees at the trunk — roughly what a young Bursera gives to a walking
    // adult — and the looser damping lets the crown swing back once.
    pushMaxBend: 0.11,
    pushBreakSpeed: 6.15,
    pushBreakReach: 0.5,
    pushBreakAngle: 0.085,
    pushBreakDelay: 0.12,
    pushBreakKick: 1.3,
    bendStiffness: 42,
    bendDamping: 7.1,
    pushDrag: 0.16,
    pushRecoilRatio: 0.42,
    contactBendBase: 0.062,
    contactBendSpeed: 0.009,
    windSway: 0.0025,
  },
};

export function PaloSantoField() {
  return <BreakablePlantField spec={PALO_SANTO_SPEC} />;
}
