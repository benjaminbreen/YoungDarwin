'use client';

import React, { useMemo } from 'react';
import { COLONIST_RANCHO_SITE } from '../blueprints/colonistRancho';
import { WETLANDS_GARDEN_FENCE } from '../../world/regions/southernWetlands/terrain';
import { useThreeGameStore } from '../../store';
import { catalogToInspectable } from '../../world/inspectables';
import { Beam, Cyl, hash, StaticBatch } from '../cave/props/primitives';
import { mergeAll, poleGeometry, seeded } from './hutGeometry';
import { HangingProduce, Plantain } from './hutProps';
import { useDisposable } from './useDisposable';

// The rancho's garden, in the building's own frame (the rancho stands
// unrotated, so local = world - site): the stake fence around the sweet
// potato and maize plots (crops themselves are planted by the ecology crop
// layer on the terrain's ridges), plantains along the fence and behind the
// house, a maize crib, a chopping block, and the scrap of red cloth on a
// stake by the old wall. `ground(x, z)` gives the terrain height here.

const SITE = COLONIST_RANCHO_SITE;
const F = WETLANDS_GARDEN_FENCE;
const fence = {
  minX: F.minX - SITE.x,
  maxX: F.maxX - SITE.x,
  minZ: F.minZ - SITE.z,
  maxZ: F.maxZ - SITE.z,
  gateZ: F.gateZ - SITE.z,
  gateHalf: F.gateHalf,
};

const PLANTAINS = [
  { x: 11.9, z: -1.5, height: 2.9, bunch: true },
  { x: 12.1, z: 1.0, height: 2.4 },
  { x: 11.8, z: 3.6, height: 3.1, bunch: true },
  { x: 12.0, z: 6.1, height: 2.2 },
  { x: 11.7, z: 8.2, height: 2.7 },
  { x: -4.8, z: 2.0, height: 2.8, bunch: true },
  { x: -4.6, z: -1.8, height: 3.0 },
  { x: -2.5, z: -4.1, height: 2.5 },
  { x: 5.4, z: -3.7, height: 2.6, bunch: true },
  { x: 8.6, z: -3.8, height: 2.3 },
];

const CRIB = { x: -5.2, z: 5.6, yaw: 0.25 };

function inspect(catalogId, sourceId) {
  return event => {
    event.stopPropagation();
    useThreeGameStore.getState().setInspectedObject?.(catalogToInspectable(catalogId, event.point, { sourceId }));
  };
}

// Stakes and cane rails, one post every metre or so, a gap for the gate.
function buildFence(ground) {
  const rand = seeded(311);
  const posts = [];
  const stakes = [];
  const rails = [];
  const runs = [
    [[fence.minX, fence.minZ], [fence.maxX, fence.minZ]],
    [[fence.maxX, fence.minZ], [fence.maxX, fence.maxZ]],
    [[fence.maxX, fence.maxZ], [fence.minX, fence.maxZ]],
    [[fence.minX, fence.maxZ], [fence.minX, fence.gateZ + fence.gateHalf]],
    [[fence.minX, fence.gateZ - fence.gateHalf], [fence.minX, fence.minZ]],
  ];
  for (const [[ax, az], [bx, bz]] of runs) {
    const length = Math.hypot(bx - ax, bz - az);
    const postCount = Math.max(1, Math.round(length / 1.1));
    const at = t => [ax + (bx - ax) * t, az + (bz - az) * t];
    for (let i = 0; i <= postCount; i += 1) {
      const [x, z] = at(i / postCount);
      const y = ground(x, z);
      const lean = (rand() - 0.5) * 0.06;
      posts.push(poleGeometry([x, y - 0.15, z], [x + lean, y + 1.1 + rand() * 0.12, z + lean], 0.045, { radiusEnd: 0.038, radial: 5 }).toNonIndexed());
    }
    // Two cane rails, lashed to the posts.
    for (const h of [0.42, 0.88]) {
      const segments = Math.max(2, Math.round(length / 2.2));
      for (let s = 0; s < segments; s += 1) {
        const [x0, z0] = at(s / segments);
        const [x1, z1] = at((s + 1) / segments);
        rails.push(poleGeometry([x0, ground(x0, z0) + h + (rand() - 0.5) * 0.04, z0], [x1, ground(x1, z1) + h + (rand() - 0.5) * 0.04, z1], 0.022, { radial: 4 }).toNonIndexed());
      }
    }
    // Close-set split stakes between the rails keep pigs and goats out.
    const stakeCount = Math.floor(length / 0.22);
    for (let i = 1; i < stakeCount; i += 1) {
      const [x, z] = at(i / stakeCount);
      const y = ground(x, z);
      const top = 0.95 + rand() * 0.22;
      stakes.push(poleGeometry([x, y - 0.05, z], [x + (rand() - 0.5) * 0.05, y + top, z + (rand() - 0.5) * 0.05], 0.018 + rand() * 0.008, { radiusEnd: 0.008, radial: 3 }).toNonIndexed());
    }
  }
  return { posts: mergeAll(posts), stakes: mergeAll(stakes), rails: mergeAll(rails) };
}

function Fence({ materials, ground }) {
  const geometry = useDisposable(() => buildFence(ground), [ground]);
  return (
    <group onClick={inspect('colony_fence', 'wetlands-garden-fence')} name="RanchoGarden_Fence">
      <mesh geometry={geometry.posts} material={materials.pole} castShadow receiveShadow />
      <mesh geometry={geometry.stakes} material={materials.timberRound} castShadow receiveShadow />
      <mesh geometry={geometry.rails} material={materials.cane} castShadow />
    </group>
  );
}

// A raised crib for drying maize: four posts, a pole floor stacked with
// ears, a small thatched gable against the rain.
function MaizeCrib({ materials, ground }) {
  const y = ground(CRIB.x, CRIB.z);
  const produce = useMemo(() => [
    { kind: 'maize', position: [-0.45, 1.08, 0], count: 9, seed: 31 },
    { kind: 'maize', position: [0.1, 1.08, 0.05], count: 7, seed: 37 },
    { kind: 'maize', position: [0.55, 1.08, -0.05], count: 8, seed: 41 },
  ], []);
  const ears = useMemo(() => {
    const rand = seeded(53);
    return Array.from({ length: 34 }, (_, i) => ({
      x: -0.62 + (i % 9) * 0.155 + (rand() - 0.5) * 0.04,
      y: 1.32 + Math.floor(i / 9) * 0.05,
      z: -0.28 + rand() * 0.56,
      yaw: (rand() - 0.5) * 0.5,
    }));
  }, []);
  return (
    <group position={[CRIB.x, y, CRIB.z]} rotation={[0, CRIB.yaw, 0]} onClick={inspect('maize_crib', 'wetlands-maize-crib')} name="RanchoGarden_MaizeCrib">
      <StaticBatch name="RanchoGarden_CribBatch">
        {[[-0.75, -0.42], [0.75, -0.42], [-0.75, 0.42], [0.75, 0.42]].map(([x, z]) => (
          <Cyl key={`${x}${z}`} r={0.055} rTop={0.045} h={2.15} segments={6} material={materials.pole} position={[x, 0.95, z]} />
        ))}
        {[-0.38, -0.19, 0, 0.19, 0.38].map(z => (
          <Cyl key={z} r={0.03} h={1.7} segments={5} material={materials.pole} position={[0, 1.27, z]} rotation={[0, 0, Math.PI / 2]} />
        ))}
        {ears.map((ear, i) => (
          <Cyl key={`ear${i}`} r={0.03} rTop={0.022} h={0.19} segments={6} material={hash(i, 3) > 0.3 ? materials.maizeKernel : materials.maizeHusk} position={[ear.x, ear.y, ear.z]} rotation={[Math.PI / 2, ear.yaw, 0]} />
        ))}
        {/* Thatched gable. */}
        {[-1, 1].map(side => (
          <Beam key={side} size={[2.0, 0.08, 0.72]} material={materials.thatch} tile={1.2} position={[0, 2.08, side * 0.3]} rotation={[side * 0.62, 0, 0]} />
        ))}
        <Cyl r={0.04} h={2.1} segments={5} material={materials.pole} position={[0, 2.3, 0]} rotation={[0, 0, Math.PI / 2]} />
      </StaticBatch>
      <HangingProduce materials={materials} items={produce} />
    </group>
  );
}

function ChoppingBlock({ materials, ground }) {
  const x = -4.0;
  const z = 1.4;
  const y = ground(x, z);
  return (
    <group position={[x, y, z]}>
      <Cyl r={0.24} rTop={0.22} h={0.5} segments={10} material={materials.pole} position={[0, 0.22, 0]} />
      <Cyl r={0.22} h={0.01} segments={10} material={materials.timber} position={[0, 0.475, 0]} />
      {/* An axe left bitten into the block. */}
      <group position={[0.05, 0.5, 0]} rotation={[0, 0.4, 0.5]}>
        <Cyl r={0.018} h={0.7} segments={5} material={materials.timber} position={[0, 0.33, 0]} />
        <Beam size={[0.16, 0.1, 0.03]} material={materials.iron} position={[0.05, 0.0, 0]} />
      </group>
      {[0, 1, 2, 3, 4].map(i => (
        <Beam key={i} size={[0.08, 0.06, 0.34]} material={materials.timber} position={[0.35 + hash(i, 1) * 0.3, 0.03, -0.2 + hash(i, 2) * 0.5]} rotation={[0, hash(i, 3) * 3, 0]} />
      ))}
    </group>
  );
}

// The red cloth from the Wetlands discovery: a rag tied to a stake by the
// old wall, faded, snapping in the wind off the slope.
function RedCloth({ materials, ground }) {
  const x = 6.4;
  const z = -4.3;
  const y = ground(x, z);
  return (
    <group position={[x, y, z]} rotation={[0, 0.5, 0.06]}>
      <Cyl r={0.025} rTop={0.018} h={1.7} segments={5} material={materials.pole} position={[0, 0.8, 0]} />
      <mesh material={materials.redWool} position={[0.18, 1.5, 0]} rotation={[0, 0, -0.25]} castShadow>
        <planeGeometry args={[0.34, 0.2, 3, 2]} />
      </mesh>
    </group>
  );
}

export function RanchoGarden({ materials, groundAt }) {
  const plantains = useMemo(() => PLANTAINS.map((p, i) => ({ ...p, seed: 17 + i * 13, y: groundAt(p.x, p.z) })), [groundAt]);
  return (
    <group name="RanchoGarden">
      <Fence materials={materials} ground={groundAt} />
      <group onClick={inspect('plantain', 'wetlands-plantains')}>
        {plantains.map((p, i) => (
          <Plantain key={i} materials={materials} seed={p.seed} height={p.height} bunch={Boolean(p.bunch)} position={[p.x, p.y - 0.05, p.z]} rotation={[0, hash(i, 9) * Math.PI * 2, 0]} />
        ))}
      </group>
      <MaizeCrib materials={materials} ground={groundAt} />
      <StaticBatch name="RanchoGarden_Yard">
        <ChoppingBlock materials={materials} ground={groundAt} />
      </StaticBatch>
      <RedCloth materials={materials} ground={groundAt} />
    </group>
  );
}
