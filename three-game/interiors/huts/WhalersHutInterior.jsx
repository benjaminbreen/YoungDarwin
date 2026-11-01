'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { FabricBundle } from '../cave/props/primitives';
import { WHALERS_HUT as H } from '../blueprints/whalersHut';
import { Beam, Block, Cask, Cyl, hash, Lathe, Rope, StaticBatch } from '../cave/props/primitives';
import { moundGeometry, seeded } from './hutGeometry';
import { Bottle, Carapace, CoiledLine, Hammock, StavePile, TinLantern, WhalingIron } from './hutProps';
import { useDisposable } from './useDisposable';

// The whalers' hut room: a sand floor, a cold fire pit ringed with beach
// stones, a plank bunk half buried under the fallen corner, a sea chest,
// irons against the wall and empty carapaces by the door. Every heavy piece
// sits inside its fixedCollider in blueprints/whalersHut.js.

const inner = { x: H.halfX - H.wall, z: H.halfZ - H.wall };
const FIRE = [-0.35, 0.05];
const BUNK = [-2.62, -0.35];
const CHEST = [2.55, -1.62];

function SandFloor({ materials }) {
  const geometry = useDisposable(() => {
    const plane = new THREE.PlaneGeometry(inner.x * 2 + 0.3, inner.z * 2 + 0.3, 36, 26);
    plane.rotateX(-Math.PI / 2);
    const position = plane.attributes.position;
    const uv = plane.attributes.uv;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      // Sand drifts up against the walls and lies trodden flat on the path
      // from door to fire.
      const edge = Math.min(inner.x - Math.abs(x), inner.z - Math.abs(z));
      const banked = Math.max(0, 0.45 - edge) * 0.16;
      const ripple = Math.sin(x * 5.3 + z * 1.7) * 0.006 + Math.sin(x * 1.3 - z * 3.9) * 0.008;
      position.setY(i, 0.005 + banked + ripple);
      uv.setXY(i, x / 1.6, z / 1.6);
    }
    plane.computeVertexNormals();
    return plane;
  }, []);
  return <mesh geometry={geometry} material={materials.sand} receiveShadow name="WhalersHut_SandFloor" />;
}

// The sand that came in with the roof.
function CollapseDrift({ materials }) {
  const geometry = useDisposable(() => moundGeometry({ rx: 1.25, rz: 0.85, height: 0.36, seed: 13, sink: 0.04, tile: 1.6 }), []);
  return <mesh geometry={geometry} material={materials.sand} position={[-2.35, 0, -1.55]} rotation={[0, 0.3, 0]} receiveShadow name="WhalersHut_CollapseDrift" />;
}

function FirePit({ materials }) {
  const stones = useMemo(() => {
    const rand = seeded(29);
    return Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2 + rand() * 0.2;
      const r = 0.4 + rand() * 0.05;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.09 + rand() * 0.05, yaw: rand() * 6, h: 0.6 + rand() * 0.4 };
    });
  }, []);
  return (
    <group position={[FIRE[0], 0, FIRE[1]]}>
      {stones.map((s, i) => (
        <mesh key={i} material={i % 3 ? materials.sootStone : materials.rubble} position={[s.x, s.s * s.h * 0.6, s.z]} rotation={[0, s.yaw, 0]} scale={[s.s * 1.2, s.s * s.h, s.s]} castShadow receiveShadow>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      ))}
      <mesh material={materials.ash} position={[0, 0.02, 0]} scale={[0.36, 0.04, 0.36]} receiveShadow>
        <sphereGeometry args={[1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* Charcoal, split shell and the scorched end of a rib. */}
      {[0, 1, 2, 3, 4].map(i => (
        <Cyl key={`c${i}`} r={0.025} h={0.22 + hash(i, 3) * 0.12} segments={5} material={materials.charcoal} position={[(hash(i, 1) - 0.5) * 0.35, 0.05, (hash(i, 2) - 0.5) * 0.3]} rotation={[Math.PI / 2, hash(i, 4) * 3, 0.1]} />
      ))}
      {[0, 1, 2].map(i => (
        <mesh key={`s${i}`} material={materials.carapace} position={[0.08 - i * 0.1, 0.05, -0.1 + i * 0.09]} rotation={[0.4 + i * 0.3, i * 1.7, 0.2]} scale={[0.09, 0.02, 0.07]}>
          <sphereGeometry args={[1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ))}
      <Cyl r={0.018} rTop={0.012} h={0.36} segments={6} material={materials.bone} position={[0.12, 0.06, 0.12]} rotation={[Math.PI / 2, 0.8, 0]} />
      {/* An iron pot left on its side by the ring. */}
      <Lathe profile={[[0.001, 0], [0.12, 0.01], [0.15, 0.08], [0.14, 0.17], [0.12, 0.19], [0.125, 0.2]]} segments={14} material={materials.iron} position={[0.62, 0.13, 0.32]} rotation={[0, 0, Math.PI / 2 - 0.15]} />
    </group>
  );
}

// Plank bunk on posts against the west wall; the roof boards from the fallen
// corner have slid across its back half.
function Bunk({ materials }) {
  return (
    <group position={[BUNK[0], 0, BUNK[1]]}>
      {[[-0.4, -0.9], [0.4, -0.9], [-0.4, 0.9], [0.4, 0.9]].map(([x, z]) => (
        <Beam key={`${x}${z}`} size={[0.09, 0.5, 0.09]} material={materials.timber} position={[x, 0.25, z]} />
      ))}
      {[-1, 1].map(side => (
        <Beam key={`rail${side}`} size={[0.06, 0.1, 1.95]} material={materials.timber} position={[side * 0.42, 0.47, 0]} />
      ))}
      {[0, 1, 2, 3, 4].map(i => (
        <Beam key={`board${i}`} size={[0.17, 0.035, 1.98]} material={materials.shipPlank} tile={1.6} position={[-0.36 + i * 0.18, 0.535, 0]} rotation={[0, (hash(i, 7) - 0.5) * 0.02, 0]} />
      ))}
      {/* Straw tick, flattened and split. */}
      <FabricBundle material={materials.sacking} position={[0.02, 0.6, 0.45]} radii={[0.38, 0.06, 0.62]} rings={8} />
      <mesh material={materials.straw} position={[0.12, 0.6, 1.0]} scale={[0.16, 0.03, 0.1]}>
        <sphereGeometry args={[1, 8, 5]} />
      </mesh>
      {/* Boards fallen from the roof, lying across the bunk into the corner. */}
      {[0, 1, 2, 3].map(i => (
        <Beam key={`fallen${i}`} size={[0.24, 0.03, 1.7 - i * 0.15]} material={i % 2 ? materials.tarredPlank : materials.shipPlank} tile={1.6} position={[-0.1 + i * 0.12, 0.72 + i * 0.07, -0.55 - i * 0.05]} rotation={[0.35 + i * 0.08, 0.2 - i * 0.15, 0.25 - i * 0.12]} />
      ))}
    </group>
  );
}

function SeaChest({ materials }) {
  return (
    <group position={[CHEST[0], 0, CHEST[1]]} rotation={[0, -0.06, 0]}>
      {/* Sailors' chests taper: wider at the foot than the lid. */}
      <mesh material={materials.timber} position={[0, 0.24, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.68, 0.48, 4, 1]} />
      </mesh>
      <Beam size={[0.88, 0.05, 0.46]} material={materials.shipPlank} position={[0, 0.505, 0]} />
      <Beam size={[0.9, 0.04, 0.48]} material={materials.tarredPlank} position={[0, 0.02, 0]} />
      {[-1, 1].map(side => (
        <group key={side} position={[side * 0.47, 0.3, 0]}>
          <Beam size={[0.04, 0.08, 0.14]} material={materials.timber} />
          <mesh material={materials.rope} position={[side * 0.04, -0.06, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.06, 0.012, 5, 10, Math.PI]} />
          </mesh>
        </group>
      ))}
      <Block size={[0.06, 0.07, 0.02]} material={materials.rust} position={[0, 0.44, 0.235]} />
    </group>
  );
}

// A shelf of ship's plank on the east wall: bottles, a horn cup, a tin lantern.
function EastShelf({ materials }) {
  const x = inner.x - 0.12;
  return (
    <group position={[x, 1.3, -0.95]}>
      <Beam size={[0.22, 0.035, 1.1]} material={materials.shipPlank} />
      {[-0.4, 0.4].map(z => (
        <Beam key={z} size={[0.18, 0.04, 0.04]} material={materials.timber} position={[0.02, -0.06, z]} rotation={[0, 0, 0.6]} />
      ))}
      <Bottle materials={materials} position={[0, 0.02, -0.35]} height={0.26} />
      <Bottle materials={materials} position={[0.03, 0.02, -0.22]} height={0.22} />
      <Bottle materials={materials} position={[0.02, 0.05, 0.12]} height={0.24} rotation={[0, 0, Math.PI / 2]} />
      <Lathe profile={[[0.001, 0], [0.035, 0], [0.045, 0.1], [0.042, 0.11]]} segments={10} material={materials.horn} position={[0, 0.02, 0.33]} />
    </group>
  );
}

function CaskCorner({ materials }) {
  return (
    <group position={[2.85, 0, 1.45]}>
      <Cask height={0.86} radius={0.3} material={materials.crateWood} hoop={materials.rust} headMaterial={materials.endGrain} position={[0, 0.43, 0]} />
      <Block size={[0.4, 0.03, 0.3]} material={materials.driftwood} position={[0.02, 0.88, 0]} rotation={[0, 0.3, 0]} />
    </group>
  );
}

export function WhalersHutInterior({ materials }) {
  const tally = useMemo(() => ({ x: 0.6, y: 1.45, z: -(H.halfZ - H.wall * 0.62) + 0.06 }), []);
  return (
    <>
      <SandFloor materials={materials} />
      <CollapseDrift materials={materials} />
      <StaticBatch name="WhalersHut_Furnishings">
        <FirePit materials={materials} />
        <Bunk materials={materials} />
        <SeaChest materials={materials} />
        <EastShelf materials={materials} />
        <CaskCorner materials={materials} />
        <StavePile materials={materials} seed={4} position={[-2.65, 0, 1.5]} rotation={[0, 0.2, 0]} />
        {/* Carapaces nested by the door, one rolled on its back. */}
        <group position={[0.25, 0, 1.62]}>
          <Carapace materials={materials} size={0.38} position={[-0.12, 0, 0]} rotation={[0, 0.4, 0]} />
          <Carapace materials={materials} size={0.34} position={[-0.1, 0.12, 0.02]} rotation={[0.08, 0.9, 0]} />
          <Carapace materials={materials} size={0.3} position={[-0.08, 0.22, 0.03]} rotation={[0.12, 1.6, 0.05]} />
          <Carapace materials={materials} size={0.3} flipped position={[0.24, 0.22, -0.04]} rotation={[0.1, 0.3, 0.12]} />
        </group>
        {/* Irons and lance leaning on the east wall. */}
        <WhalingIron materials={materials} position={[inner.x - 0.12, 0, -0.95 + 0.6]} rotation={[0.06, 0.2, 0.22]} />
        <WhalingIron materials={materials} position={[inner.x - 0.12, 0, -0.55 + 0.6]} rotation={[-0.04, -0.5, 0.2]} />
        <WhalingIron materials={materials} lance position={[inner.x - 0.1, 0, -0.1 + 0.4]} rotation={[0.02, 0.1, 0.17]} />
        <CoiledLine materials={materials} position={[2.15, 0, 0.55]} />
        {/* The tally plank, nailed to the back wall. */}
        <Beam size={[1.3, 0.3, 0.045]} material={materials.driftwood} tile={1.4} position={[tally.x, tally.y, tally.z - 0.02]} />
        {[-0.6, 0.6].map(dx => (
          <Cyl key={dx} r={0.012} h={0.03} segments={5} material={materials.rust} position={[tally.x + dx, tally.y, tally.z + 0.005]} rotation={[Math.PI / 2, 0, 0]} />
        ))}
        {/* A crate turned on end for a seat by the fire. */}
        <Beam size={[0.42, 0.4, 0.36]} material={materials.crateWood} position={[0.85, 0.2, -0.25]} rotation={[0, 0.5, 0]} />
        <Cyl r={0.17} rTop={0.15} h={0.36} segments={9} material={materials.driftwood} position={[-1.3, 0.18, 0.75]} />
        {/* Rope and a sail-needle palm on a nail by the door. */}
        <Rope points={[[H.door.x + 0.75, 1.55, inner.z - 0.05], [H.door.x + 1.25, 1.5, inner.z - 0.05]]} radius={0.012} sag={0.22} material={materials.manila} />
        {/* Tortoise bones swept into the corner. */}
        {[0, 1, 2, 3, 4, 5].map(i => (
          <Cyl key={`bone${i}`} r={0.015 + hash(i, 5) * 0.01} h={0.18 + hash(i, 6) * 0.14} segments={5} material={materials.bone} position={[-0.9 + hash(i, 7) * 0.4, 0.03, 1.75 + hash(i, 8) * 0.18]} rotation={[Math.PI / 2, hash(i, 9) * 3, 0]} />
        ))}
      </StaticBatch>
      <mesh material={materials.carvedPlank} position={[tally.x, tally.y, tally.z + 0.006]} name="WhalersHut_TallyCarving">
        <planeGeometry args={[1.26, 0.28]} />
      </mesh>
      <Hammock materials={materials} cloth="sailcloth" from={[-0.9, H.eave - 0.12, -1.3]} to={[1.95, H.eave - 0.12, -1.15]} sag={0.62} />
      <TinLantern materials={materials} position={[1.95, H.eave - 0.12, 0.6]} />
    </>
  );
}
