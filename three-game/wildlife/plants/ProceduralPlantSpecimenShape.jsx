'use client';

// Collectible plant specimens that reuse the procedural models already built
// for the breakable field props. The field props own the physics, the strike
// damage and the knife-cutting; this is the same plant with none of that, for
// the places a specimen actor is what the zone authored.
//
// Without this the four species below fell through to the generic placeholder
// shape, so a zone could show a beautifully modelled sicyos vine three metres
// from a beige blob of the same species.

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  buildSicyos,
  buildSicyosSegmentGeometry,
  getSicyosMaterials,
} from '../../physics/props/sicyos/sicyosModel';
import {
  buildDelilia,
  buildDeliliaSegmentGeometry,
  getDeliliaMaterials,
} from '../../physics/props/delilia/deliliaModel';
import {
  buildLecocarpus,
  buildLecocarpusSegmentGeometry,
  getLecocarpusMaterials,
} from '../../physics/props/lecocarpus/lecocarpusModel';
import {
  buildLavaCactus,
  getColumnGeometry,
  getColumnSpineGeometry,
  getLavaCactusMaterials,
  OLD_AGE_THRESHOLD,
} from '../../physics/props/lavaCactus/lavaCactusModel';

// Geometry key -> material key, per species. The builders return one merged
// geometry per part so each maps to exactly one material.
const SEGMENTED_SPECIES = {
  sicyosvillosus: {
    build: buildSicyos,
    segmentGeometry: buildSicyosSegmentGeometry,
    materials: getSicyosMaterials,
    size: 1,
    parts: {
      stems: 'stem',
      leaves: 'leaf',
      veins: 'vein',
      tendrils: 'tendril',
      hairs: 'hair',
      petals: 'petal',
      centers: 'flowerCenter',
      fruits: 'fruit',
      fruitBristles: 'fruitBristle',
    },
  },
  deliliainelegans: {
    build: buildDelilia,
    segmentGeometry: buildDeliliaSegmentGeometry,
    materials: getDeliliaMaterials,
    size: 1,
    parts: {
      stems: 'stem',
      leaves: 'leaf',
      veins: 'vein',
      hairs: 'hair',
      flowerHeads: 'flowerHead',
      flowerTips: 'flowerTip',
    },
  },
  lecocarpuspinnatifidus: {
    build: buildLecocarpus,
    segmentGeometry: buildLecocarpusSegmentGeometry,
    materials: getLecocarpusMaterials,
    size: 1,
    parts: {
      stems: 'stem',
      leaves: 'leaf',
      veins: 'vein',
      petals: 'petal',
      disks: 'disk',
      fruits: 'fruit',
      wings: 'wing',
    },
  },
};

// Casting shadows off thin stems and leaf blades costs a shadow-map draw for
// no visible gain; the baked vertex shading already carries the self-occlusion.
const CASTS_SHADOW = new Set(['stems', 'leaves', 'flowerHeads', 'disks', 'fruits']);

// The field props keep a mesh per segment because each one can break off on
// its own. A specimen never comes apart, so its segments are baked into one
// geometry per part — a dozen segments at nine parts each would otherwise cost
// fifty-odd draw calls for a single plant.
function bakePlant(species, seed) {
  const plant = species.build({ seed, size: species.size });
  const buckets = new Map();
  const scratch = new THREE.Matrix4();
  for (const segment of plant.segments) {
    const parts = species.segmentGeometry(segment);
    scratch.compose(segment.position, segment.quaternion, new THREE.Vector3(1, 1, 1));
    for (const key of Object.keys(species.parts)) {
      const geometry = parts[key];
      if (!geometry) continue;
      geometry.applyMatrix4(scratch);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(geometry);
    }
  }
  const baked = [];
  for (const [key, pieces] of buckets) {
    const merged = mergeGeometries(pieces, false);
    pieces.forEach(piece => piece.dispose());
    if (merged) baked.push({ key, geometry: merged });
  }
  return baked;
}

function SegmentedPlant({ specimenId, seed }) {
  const species = SEGMENTED_SPECIES[specimenId];
  const baked = useMemo(() => bakePlant(species, seed), [seed, species]);
  useEffect(() => () => baked.forEach(part => part.geometry.dispose()), [baked]);

  const materials = species.materials();
  return (
    <group>
      {baked.map(({ key, geometry }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={materials[species.parts[key]]}
          castShadow={CASTS_SHADOW.has(key)}
          receiveShadow={key === 'leaves'}
        />
      ))}
    </group>
  );
}

// Brachycereus grows as a clump of columns rather than a branching stem, so it
// assembles from the shared column geometries instead of per-segment merges.
function LavaCactusPlant({ seed }) {
  const plant = useMemo(() => buildLavaCactus({ seed, size: 1, flowerCount: 1 }), [seed]);
  const materials = getLavaCactusMaterials();
  return (
    <group>
      {plant.columns.map(column => {
        const old = column.age >= OLD_AGE_THRESHOLD;
        const tints = old ? materials.columnsOld : materials.columnsYoung;
        const tint = tints[Math.floor((column.tone ?? 0) * tints.length) % tints.length];
        return (
          <group
            key={column.id}
            position={[column.position.x, column.position.y, column.position.z]}
            quaternion={column.quaternion}
          >
            <mesh
              castShadow
              geometry={getColumnGeometry(column.variant)}
              material={tint}
              scale={[column.radius, column.height, column.radius]}
            />
            <mesh
              geometry={getColumnSpineGeometry(column.variant)}
              material={old ? materials.spinesOld : materials.spinesYoung}
              scale={[column.radius, column.height, column.radius]}
            />
          </group>
        );
      })}
    </group>
  );
}

export function isProceduralPlantSpecimen(specimenId) {
  return specimenId === 'cactus' || Boolean(SEGMENTED_SPECIES[specimenId]);
}

export function ProceduralPlantSpecimenShape({ specimen }) {
  const seed = specimen.instanceId || specimen.id;
  if (specimen.id === 'cactus') return <LavaCactusPlant seed={seed} />;
  return <SegmentedPlant specimenId={specimen.id} seed={seed} />;
}
