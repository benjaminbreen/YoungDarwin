'use client';

// Destructible procedural prickly pears, built on the shared
// BreakablePlantField runtime (see that file for the interaction model:
// hammer/knife/shotgun/landing/run-in breaks, wind sway, push-bend, collection).
// This module only supplies the opuntia-specific plant spec: piece graph,
// geometry/materials, site dressing, and narrator copy.

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { movementTerrainHeight, terrainHeight } from '../../../world/terrain';
import { BreakablePlantField } from '../breakablePlant/BreakablePlantField';
import { getPricklyPearSites, PRICKLY_PEAR_SITES } from './pricklyPearSites';
import {
  buildPricklyPear,
  buildSiteDressing,
  getBudGeometry,
  getPadGeometry,
  getPadStudGeometry,
  getFlowerGeometries,
  getPricklyPearMaterials,
  getTuftGeometry,
  padColliderSpec,
  padHitPoints,
  seededUnit,
  PAD_TINTS,
} from './pricklyPearModel';

// Idle wind: tiny two-sine sway, stronger on higher pads and on blossoms.
const WIND_PAD_BASE = 0.016;
const WIND_PER_GENERATION = 0.012;
const WIND_FLOWER = 0.04;

const UP = new THREE.Vector3(0, 1, 0);

function buildZonePieces(zoneId, sites = getPricklyPearSites(zoneId)) {
  const pieces = [];
  const scratch = new THREE.Vector3();
  for (const site of sites) {
    const plant = buildPricklyPear(site);
    const groundY = movementTerrainHeight(site.x, site.z, zoneId);
    const siteQuat = new THREE.Quaternion().setFromAxisAngle(UP, site.yaw || 0);
    const keyFor = localId => `${zoneId}:prickly-pear:${site.id}:${localId}`;
    for (const pad of plant.pads) {
      const spawn = scratch.copy(pad.position).applyQuaternion(siteQuat);
      const quaternion = siteQuat.clone().multiply(pad.quaternion);
      const euler = new THREE.Euler().setFromQuaternion(quaternion);
      const center = new THREE.Vector3(0, pad.height * 0.5, 0)
        .applyQuaternion(quaternion)
        .add(spawn)
        .add(new THREE.Vector3(site.x, groundY, site.z));
      const collider = padColliderSpec(pad);
      pieces.push({
        key: keyFor(pad.id),
        parentKey: pad.parentId ? keyFor(pad.parentId) : null,
        type: 'pad',
        siteId: site.id,
        spawn: [site.x + spawn.x, groundY + spawn.y, site.z + spawn.z],
        rotation: [euler.x, euler.y, euler.z],
        center,
        topY: center.y + pad.height * 0.5,
        width: pad.width,
        height: pad.height,
        mass: pad.mass,
        hits: padHitPoints(pad),
        variant: pad.variant,
        buds: pad.buds,
        colliderArgs: collider.halfExtents,
        colliderOffset: collider.offset,
        ccd: false,
        dustCount: 10,
        cutDustCount: 2,
        releaseWithParent: false,
        breakOnLanding: true,
        pushable: true,
        // Outer green pads make useful cuttings; the generation-zero pad is
        // the woody plant base and deliberately resists the pocket knife.
        knifeCuttable: pad.generation > 0,
        windAmp: WIND_PAD_BASE + pad.generation * WIND_PER_GENERATION,
        specimenId: 'pricklypearpad',
        sampleLabel: 'prickly pear pad',
        promptText: 'Press E to collect prickly pear pad',
        sampleOutcome: {
          condition: 'field_collected',
          collectMessage: 'You lever the spiny pad free and wrap it against the barbs.',
          evidence: 'collected prickly pear pad',
          scoreDelta: 2,
          symsLine: 'Syms handles the pad gingerly. "Mind the barbs, sir — they work through cloth."',
        },
        educationalNote: 'The prickly pear pad stores water behind a waxy hide; land iguanas and tortoises eat them, spines and all.',
        tone: pad.tone,
      });
    }
    for (const flower of plant.flowers) {
      const spawn = scratch.copy(flower.position).applyQuaternion(siteQuat);
      const quaternion = siteQuat.clone().multiply(flower.quaternion);
      const euler = new THREE.Euler().setFromQuaternion(quaternion);
      const center = new THREE.Vector3(site.x + spawn.x, groundY + spawn.y, site.z + spawn.z);
      pieces.push({
        key: keyFor(flower.id),
        parentKey: keyFor(flower.padId),
        type: 'flower',
        siteId: site.id,
        spawn: [center.x, center.y, center.z],
        rotation: [euler.x, euler.y, euler.z],
        center,
        topY: center.y + 0.1,
        width: flower.scale,
        height: flower.scale * 0.4,
        mass: flower.mass,
        hits: 1,
        colliderArgs: [flower.scale * 0.45, flower.scale * 0.2, flower.scale * 0.45],
        colliderOffset: [0, flower.scale * 0.08, 0],
        ccd: true,
        dustCount: 5,
        releaseWithParent: true,
        breakOnLanding: false,
        pushable: false,
        windAmp: WIND_FLOWER,
        specimenId: 'pricklypearblossom',
        sampleLabel: 'opuntia blossom',
        promptText: 'Press E to collect opuntia blossom',
        sampleOutcome: {
          condition: 'field_collected',
          collectMessage: 'You press the yellow blossom flat between paper sheets.',
          evidence: 'collected opuntia blossom',
          scoreDelta: 3,
          symsLine: 'Syms smooths the petals. "A cheerful thing to find among so many spines, sir."',
        },
        educationalNote: 'Opuntia blossoms feed Galapagos finches and bees; on islands with tortoises, the plants grow tall to keep pads out of reach.',
        scale: flower.scale,
        tone: seededUnit(keyFor(flower.id), 3),
      });
    }
  }
  return pieces;
}

// Static, non-physics dressing that seats a plant in the ground: basalt
// pebbles, dry tufts, and usually one dried fallen pad. Grounded on the
// visual terrain function (not the movement surface).
function SiteDressing({ site, zoneId }) {
  const dressing = useMemo(() => buildSiteDressing(site), [site]);
  const materials = getPricklyPearMaterials();
  return (
    <group>
      {dressing.pebbles.map((pebble, index) => (
        <mesh
          key={`pebble-${index}`}
          castShadow
          receiveShadow
          position={[
            site.x + pebble.x,
            terrainHeight(site.x + pebble.x, site.z + pebble.z, zoneId) + pebble.scale * (1 - pebble.sink),
            site.z + pebble.z,
          ]}
          rotation={[0, pebble.yaw, 0]}
          scale={[
            pebble.scale * pebble.stretch[0],
            pebble.scale * pebble.stretch[1],
            pebble.scale * pebble.stretch[2],
          ]}
          material={materials.pebble}
        >
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
      {dressing.tufts.map((tuft, index) => (
        <mesh
          key={`tuft-${index}`}
          position={[
            site.x + tuft.x,
            terrainHeight(site.x + tuft.x, site.z + tuft.z, zoneId) - 0.01,
            site.z + tuft.z,
          ]}
          rotation={[0, tuft.yaw, 0]}
          scale={tuft.scale}
          geometry={getTuftGeometry()}
          material={materials.tuft}
        />
      ))}
      {dressing.fallenPad && (
        <mesh
          castShadow
          receiveShadow
          position={[
            site.x + dressing.fallenPad.x,
            terrainHeight(site.x + dressing.fallenPad.x, site.z + dressing.fallenPad.z, zoneId) + 0.008,
            site.z + dressing.fallenPad.z,
          ]}
          rotation={[Math.PI / 2 * 0.94, dressing.fallenPad.yaw, 0]}
          scale={[dressing.fallenPad.width, dressing.fallenPad.height, dressing.fallenPad.width]}
          geometry={getPadGeometry(1)}
          material={materials.driedPad}
        />
      )}
    </group>
  );
}

function renderPiece(piece) {
  const materials = getPricklyPearMaterials();
  if (piece.type === 'pad') {
    const padTintIndex = Math.floor((piece.tone ?? 0) * PAD_TINTS.length) % PAD_TINTS.length;
    return (
      <>
        {/* No receiveShadow: at standard shadow quality the map's ~2.5cm
            texels read as blocky patches on the small curved pads, and the
            baked vertex shading already carries the self-occlusion. */}
        <mesh
          castShadow
          geometry={getPadGeometry(piece.variant)}
          material={materials.pads[padTintIndex]}
          scale={[piece.width, piece.height, piece.width]}
        />
        <mesh
          castShadow={false}
          geometry={getPadStudGeometry(piece.variant)}
          material={materials.areole}
          scale={[piece.width, piece.height, piece.width]}
        />
        {piece.buds?.map((bud, index) => (
          <mesh
            key={`bud-${index}`}
            castShadow={false}
            geometry={getBudGeometry()}
            material={materials.bud}
            position={[bud.x, bud.y, bud.z]}
            scale={bud.scale}
          />
        ))}
      </>
    );
  }
  return (
    <>
      <mesh castShadow geometry={getFlowerGeometries().petals} material={materials.petal} scale={piece.scale} />
      <mesh castShadow geometry={getFlowerGeometries().center} material={materials.center} scale={piece.scale} />
    </>
  );
}

const PRICKLY_PEAR_SPEC = {
  id: 'prickly-pear',
  sitesByZone: PRICKLY_PEAR_SITES,
  getSites: getPricklyPearSites,
  buildZonePieces,
  SiteDressing,
  renderPiece,
  strikeAbsorbMessage: piece => (piece.type === 'pad' && piece.hits > 2
    ? 'The hammer thuds into the woody basal pad. It shudders, sheds spines, and holds.'
    : 'The pad splits partway; another blow should part it from the plant.'),
  absorbEducationalNote: 'Older opuntia pads turn woody and fibrous at the base; a specimen hammer is the wrong tool for felling one.',
  tuning: {
    // Succulent pads flex visibly at their joints and return with a soft,
    // slightly under-damped recoil. Site sway moves the whole silhouette;
    // per-pad wind above adds smaller independent tip motion.
    pushMaxBend: 0.32,
    pushBreakAngle: 0.27,
    pushBreakDelay: 0.16,
    bendStiffness: 24,
    bendDamping: 5.8,
    contactBendBase: 0.18,
    contactBendSpeed: 0.022,
    windSway: 0.022,
  },
};

export function PricklyPearField() {
  return <BreakablePlantField spec={PRICKLY_PEAR_SPEC} />;
}
