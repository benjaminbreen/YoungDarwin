'use client';

// Destructible procedural lava cactus clumps, built on the shared
// BreakablePlantField runtime (hammer/shotgun/landing/run-in breaks, wind
// sway, push-bend, collection). Columns are stiffer and more brittle than
// opuntia pads: they barely sway, bend less under a shoulder, and snap at a
// lower run speed. Broken columns collect as the existing `cactus` specimen;
// flowers as `lavacactusflower`.

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { movementTerrainHeight, terrainHeight } from '../../../world/terrain';
import { BreakablePlantField } from '../breakablePlant/BreakablePlantField';
import { seededUnit } from '../breakablePlant/plantGeoUtils';
import { getFlowerGeometries } from '../pricklyPear/pricklyPearModel';
import { LAVA_CACTUS_SITES } from './lavaCactusSites';
import {
  buildLavaCactus,
  buildLavaCactusDressing,
  columnColliderSpec,
  columnHitPoints,
  getColumnGeometry,
  getColumnSpineGeometry,
  getLavaCactusMaterials,
  COLUMN_TINTS_YOUNG,
  OLD_AGE_THRESHOLD,
} from './lavaCactusModel';

// Idle wind: columns are stiff little posts — only young pulpy ones flex, and
// far less than opuntia pads. Flowers tremble a bit more.
const WIND_COLUMN_YOUNG = 0.007;
const WIND_COLUMN_OLD = 0.003;
const WIND_FLOWER = 0.03;

const UP = new THREE.Vector3(0, 1, 0);

function buildZonePieces(zoneId) {
  const sites = LAVA_CACTUS_SITES[zoneId] || [];
  const pieces = [];
  const scratch = new THREE.Vector3();
  for (const site of sites) {
    const plant = buildLavaCactus(site);
    const groundY = movementTerrainHeight(site.x, site.z, zoneId);
    const siteQuat = new THREE.Quaternion().setFromAxisAngle(UP, site.yaw || 0);
    const keyFor = localId => `${zoneId}:lava-cactus:${site.id}:${localId}`;
    for (const column of plant.columns) {
      const spawn = scratch.copy(column.position).applyQuaternion(siteQuat);
      const quaternion = siteQuat.clone().multiply(column.quaternion);
      const euler = new THREE.Euler().setFromQuaternion(quaternion);
      const center = new THREE.Vector3(0, column.height * 0.5, 0)
        .applyQuaternion(quaternion)
        .add(spawn)
        .add(new THREE.Vector3(site.x, groundY, site.z));
      const collider = columnColliderSpec(column);
      const old = column.age > OLD_AGE_THRESHOLD;
      pieces.push({
        key: keyFor(column.id),
        parentKey: null,
        type: 'column',
        siteId: site.id,
        spawn: [site.x + spawn.x, groundY + spawn.y, site.z + spawn.z],
        rotation: [euler.x, euler.y, euler.z],
        center,
        topY: center.y + column.height * 0.5,
        width: column.radius * 2,
        height: column.height,
        mass: column.mass,
        hits: columnHitPoints(column),
        variant: column.variant,
        old,
        colliderArgs: collider.halfExtents,
        colliderOffset: collider.offset,
        ccd: false,
        dustCount: 8,
        releaseWithParent: false,
        breakOnLanding: true,
        pushable: true,
        windAmp: old ? WIND_COLUMN_OLD : WIND_COLUMN_YOUNG,
        specimenId: 'cactus',
        sampleLabel: 'lava cactus column',
        promptText: 'Press E to collect lava cactus column',
        sampleOutcome: {
          condition: 'field_collected',
          collectMessage: 'You snap the bristled column at its base and roll it into a cloth.',
          evidence: 'collected lava cactus column',
          scoreDelta: 2,
          symsLine: 'Syms turns the column over. "All spine and no leaf, sir — how does it live on bare rock?"',
        },
        educationalNote: 'Brachycereus nesioticus is a pioneer: the first plant to colonize young lava flows, catching rain that vanishes into the rock within minutes.',
        tone: column.tone,
      });
    }
    for (const flower of plant.flowers) {
      const spawn = scratch.copy(flower.position).applyQuaternion(siteQuat);
      const quaternion = siteQuat.clone().multiply(flower.quaternion);
      const euler = new THREE.Euler().setFromQuaternion(quaternion);
      const center = new THREE.Vector3(site.x + spawn.x, groundY + spawn.y, site.z + spawn.z);
      pieces.push({
        key: keyFor(flower.id),
        parentKey: keyFor(flower.columnId),
        type: 'flower',
        siteId: site.id,
        spawn: [center.x, center.y, center.z],
        rotation: [euler.x, euler.y, euler.z],
        center,
        topY: center.y + 0.08,
        width: flower.scale,
        height: flower.scale * 0.4,
        mass: flower.mass,
        hits: 1,
        colliderArgs: [flower.scale * 0.45, flower.scale * 0.2, flower.scale * 0.45],
        colliderOffset: [0, flower.scale * 0.08, 0],
        ccd: true,
        dustCount: 4,
        releaseWithParent: true,
        breakOnLanding: false,
        pushable: false,
        windAmp: WIND_FLOWER,
        specimenId: 'lavacactusflower',
        sampleLabel: 'lava cactus flower',
        promptText: 'Press E to collect lava cactus flower',
        sampleOutcome: {
          condition: 'field_collected',
          collectMessage: 'You pluck the pale flower and press it before the midday heat can close it.',
          evidence: 'collected lava cactus flower',
          scoreDelta: 3,
          symsLine: 'Syms cups the cream petals. "It blooms where nothing else dares, sir."',
        },
        educationalNote: 'Lava cactus flowers open creamy white in the cool of early morning and wilt by midday — pollinators must come early.',
        scale: flower.scale,
        tone: seededUnit(keyFor(flower.id), 7),
      });
    }
  }
  return pieces;
}

// Static, non-physics dressing that seats a clump in bare rock: jagged
// clinker chunks and sometimes a dead fallen column. Grounded on the visual
// terrain function (not the movement surface).
function SiteDressing({ site, zoneId }) {
  const dressing = useMemo(() => buildLavaCactusDressing(site), [site]);
  const materials = getLavaCactusMaterials();
  return (
    <group>
      {dressing.clinker.map((chunk, index) => (
        <mesh
          key={`clinker-${index}`}
          castShadow
          receiveShadow
          position={[
            site.x + chunk.x,
            terrainHeight(site.x + chunk.x, site.z + chunk.z, zoneId) + chunk.scale * (1 - chunk.sink),
            site.z + chunk.z,
          ]}
          rotation={[0, chunk.yaw, 0]}
          scale={[
            chunk.scale * chunk.stretch[0],
            chunk.scale * chunk.stretch[1],
            chunk.scale * chunk.stretch[2],
          ]}
          material={materials.clinker}
        >
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
      {dressing.fallenColumn && (
        <mesh
          castShadow
          receiveShadow
          position={[
            site.x + dressing.fallenColumn.x,
            terrainHeight(site.x + dressing.fallenColumn.x, site.z + dressing.fallenColumn.z, zoneId)
              + dressing.fallenColumn.radius * 0.8,
            site.z + dressing.fallenColumn.z,
          ]}
          rotation={[Math.PI / 2 * 0.96, dressing.fallenColumn.yaw, 0]}
          scale={[
            dressing.fallenColumn.radius * 2,
            dressing.fallenColumn.length,
            dressing.fallenColumn.radius * 2,
          ]}
          geometry={getColumnGeometry(dressing.fallenColumn.variant)}
          material={materials.deadColumn}
        />
      )}
    </group>
  );
}

function renderPiece(piece) {
  const materials = getLavaCactusMaterials();
  if (piece.type === 'column') {
    const tints = piece.old ? materials.columnsOld : materials.columnsYoung;
    const tintIndex = Math.floor((piece.tone ?? 0) * COLUMN_TINTS_YOUNG.length) % COLUMN_TINTS_YOUNG.length;
    return (
      <>
        {/* No receiveShadow, matching the opuntia pads: shadow-map texels
            read as blocky patches on thin curved stems, and the baked vertex
            shading already carries the self-occlusion. */}
        <mesh
          castShadow
          geometry={getColumnGeometry(piece.variant)}
          material={tints[tintIndex]}
          scale={[piece.width, piece.height, piece.width]}
        />
        <mesh
          castShadow={false}
          geometry={getColumnSpineGeometry(piece.variant)}
          material={piece.old ? materials.spinesOld : materials.spinesYoung}
          scale={[piece.width, piece.height, piece.width]}
        />
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

const LAVA_CACTUS_SPEC = {
  id: 'lava-cactus',
  sitesByZone: LAVA_CACTUS_SITES,
  buildZonePieces,
  SiteDressing,
  renderPiece,
  strikeAbsorbMessage: piece => (piece.hits > 1
    ? 'The hammer mashes into the grey column; the woody fibres crush but hold.'
    : 'The column splits at the base; one more blow will part it.'),
  absorbEducationalNote: 'Old lava cactus stems turn grey and fibrous with age; only the young golden columns part easily.',
  tuning: {
    // Brittle, stiff little posts: less bend, quicker spring, and a solid
    // run (not just a sprint) snaps one.
    pushMaxBend: 0.14,
    pushBreakSpeed: 5.0,
    bendStiffness: 34,
    bendDamping: 9,
    contactBendBase: 0.085,
    contactBendSpeed: 0.012,
    windSway: 0.007,
  },
};

export function LavaCactusField() {
  return <BreakablePlantField spec={LAVA_CACTUS_SPEC} />;
}
