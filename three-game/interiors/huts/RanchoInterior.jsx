'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { COLONIST_RANCHO as R } from '../blueprints/colonistRancho';
import { HearthFire } from '../cave/props/Fire';
import { Beam, Block, Candle, Cyl, hash, Lathe, Rope, StaticBatch } from '../cave/props/primitives';
import { seeded } from './hutGeometry';
import { Basket, Gourd, HangingProduce, Sack } from './hutProps';
import { useDisposable } from './useDisposable';

// Inside the rancho: packed-earth floor, a three-stone hearth with its
// griddle and pot, a cane bed on forked posts, the household saint on a
// shelf, maize hung from the tie beams, stores by the wall. Every heavy
// piece sits inside its fixedCollider in blueprints/colonistRancho.js.

const inner = { x: R.halfX - R.wall, z: R.halfZ - R.wall };
const BED = [2.05, -1.15];
const TIE_Y = R.wallTop - 0.02;

function EarthFloor({ materials }) {
  const geometry = useDisposable(() => {
    const plane = new THREE.PlaneGeometry(inner.x * 2 + 0.2, inner.z * 2 + 0.2, 30, 24);
    plane.rotateX(-Math.PI / 2);
    const position = plane.attributes.position;
    const uv = plane.attributes.uv;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      // Swept hollow in the middle, a little raised at the walls.
      const edge = Math.min(inner.x - Math.abs(x), inner.z - Math.abs(z));
      position.setY(i, 0.004 + Math.max(0, 0.3 - edge) * 0.05 + Math.sin(x * 3.1 + z * 2.3) * 0.004);
      uv.setXY(i, x / 1.4, z / 1.4);
    }
    plane.computeVertexNormals();
    return plane;
  }, []);
  return <mesh geometry={geometry} material={materials.earthFloor} receiveShadow name="Rancho_EarthFloor" />;
}

function Hearth({ materials }) {
  return (
    <group position={[R.hearth.x, 0, R.hearth.z]}>
      {[0, 1, 2].map(i => {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        return (
          <mesh key={i} material={materials.sootStone} position={[Math.cos(a) * 0.24, 0.1, Math.sin(a) * 0.24]} rotation={[0, a, 0]} scale={[0.13, 0.12, 0.11]} castShadow receiveShadow>
            <icosahedronGeometry args={[1, 1]} />
          </mesh>
        );
      })}
      <mesh material={materials.ash} position={[0, 0.01, 0]} scale={[0.36, 0.03, 0.34]} receiveShadow>
        <sphereGeometry args={[1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* Clay griddle (tiesto) on two of the stones, a pot of sweet potatoes on the third. */}
      <Cyl r={0.2} rBottom={0.18} h={0.025} segments={16} material={materials.clayDark} position={[0.05, 0.235, 0.12]} rotation={[0.08, 0, -0.05]} />
      <Lathe profile={[[0.001, 0], [0.1, 0.01], [0.15, 0.08], [0.15, 0.16], [0.11, 0.22], [0.115, 0.24]]} segments={14} material={materials.clay} position={[-0.12, 0.18, -0.18]} />
      {[0, 1, 2].map(i => (
        <mesh key={`p${i}`} material={materials.sweetPotato} position={[-0.12 + (i - 1) * 0.05, 0.42, -0.18 + (i % 2) * 0.04]} scale={[0.05, 0.03, 0.035]} rotation={[0, i, 0]}>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
      {/* A blowing tube and a fan of woven palm. */}
      <Cyl r={0.012} h={0.45} segments={5} material={materials.cane} position={[0.42, 0.02, 0.2]} rotation={[Math.PI / 2, 0.5, 0]} />
      <Block size={[0.2, 0.01, 0.16]} material={materials.petate} position={[0.42, 0.02, -0.12]} rotation={[0, 0.7, 0]} />
    </group>
  );
}

// The barbacoa: a cane platform lashed across poles in forked posts.
function Barbacoa({ materials }) {
  return (
    <group position={[BED[0], 0, BED[1]]}>
      {[[-0.58, -0.88], [0.58, -0.88], [-0.58, 0.88], [0.58, 0.88]].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <Cyl r={0.045} h={0.5} segments={6} material={materials.pole} position={[0, 0.25, 0]} />
          {[-1, 1].map(s => (
            <Cyl key={s} r={0.022} h={0.12} segments={5} material={materials.pole} position={[s * 0.03, 0.54, 0]} rotation={[0, 0, s * 0.35]} />
          ))}
        </group>
      ))}
      {[-1, 1].map(side => (
        <Cyl key={side} r={0.04} h={1.95} segments={7} material={materials.pole} position={[side * 0.58, 0.52, 0]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
      <Block size={[1.28, 0.03, 1.9]} material={materials.cane} position={[0, 0.57, 0]} />
      <Block size={[1.1, 0.012, 1.72]} material={materials.petate} position={[0, 0.592, 0.02]} />
      {/* Blanket half-thrown back; a rolled shirt for a pillow. */}
      <mesh material={materials.ponchoWool} position={[0.05, 0.62, 0.35]} scale={[0.52, 0.04, 0.55]} castShadow receiveShadow>
        <sphereGeometry args={[1, 14, 8]} />
      </mesh>
      <Cyl r={0.08} h={0.55} segments={9} material={materials.linen} position={[0, 0.66, -0.72]} rotation={[0, 0, Math.PI / 2]} />
    </group>
  );
}

// The household saint: a woodcut pasted to a board on a shelf, a candle,
// a stick cross, wild flowers in a gourd.
function Altar({ materials }) {
  const z = -inner.z + 0.13;
  const shelfY = 1.15;
  return (
    <group position={[R.altar.x, 0, z]}>
      <Beam size={[0.72, 0.035, 0.24]} material={materials.timber} position={[0, shelfY, 0]} />
      {[-0.26, 0.26].map(x => (
        <Cyl key={x} r={0.018} h={0.22} segments={5} material={materials.pole} position={[x, shelfY - 0.03, -0.04]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
      <Beam size={[0.36, 0.46, 0.02]} material={materials.timber} position={[0, shelfY + 0.27, -0.09]} rotation={[-0.08, 0, 0]} />
      <Cyl r={0.012} h={0.36} segments={5} material={materials.pole} position={[0.24, shelfY + 0.2, 0.02]} />
      <Cyl r={0.01} h={0.18} segments={5} material={materials.pole} position={[0.24, shelfY + 0.3, 0.02]} rotation={[0, 0, Math.PI / 2]} />
      <Gourd materials={materials} size={0.05} position={[-0.22, shelfY + 0.018, 0.02]} />
      {[0, 1, 2, 3].map(i => (
        <group key={i} position={[-0.22 + (hash(i, 1) - 0.5) * 0.05, shelfY + 0.17, 0.02 + (hash(i, 2) - 0.5) * 0.04]}>
          <Cyl r={0.004} h={0.12} segments={3} material={materials.leaf} position={[0, 0, 0]} rotation={[(hash(i, 3) - 0.5) * 0.6, 0, (hash(i, 4) - 0.5) * 0.6]} />
          <mesh material={i % 2 ? materials.tomatoFruit : materials.maizeKernel} position={[0, 0.07, 0]} scale={0.022}>
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        </group>
      ))}
      <Candle materials={materials} position={[0.02, shelfY + 0.018, 0.04]} height={0.12} />
    </group>
  );
}

function GrindingStone({ materials }) {
  return (
    <group position={[-0.75, 0, -1.75]} rotation={[0, 0.05, 0]}>
      {/* Low bench of split log, the metate tilted down toward the kneeler. */}
      <Beam size={[0.62, 0.22, 0.38]} material={materials.pole} position={[0, 0.11, 0]} />
      <mesh material={materials.rubble} position={[0, 0.3, 0.01]} rotation={[-0.12, 0, 0]} scale={[0.3, 0.07, 0.18]} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1, 1, 16, 1]} />
      </mesh>
      <Cyl r={0.04} h={0.26} segments={8} material={materials.rubble} position={[0.02, 0.38, 0.06]} rotation={[0, 0, Math.PI / 2]} />
      <mesh material={materials.maizeKernel} position={[-0.1, 0.345, 0.07]} scale={[0.08, 0.012, 0.06]}>
        <sphereGeometry args={[1, 8, 5]} />
      </mesh>
      <Basket materials={materials} radius={0.13} height={0.1} fill="maizeKernel" position={[0.42, 0, 0.1]} />
    </group>
  );
}

function Firewood({ materials }) {
  const logs = useMemo(() => {
    const rand = seeded(61);
    return Array.from({ length: 18 }, (_, i) => ({
      row: Math.floor(i / 5),
      k: i % 5,
      r: 0.045 + rand() * 0.025,
      l: 0.8 + rand() * 0.15,
      jitter: (rand() - 0.5) * 0.04,
    }));
  }, []);
  return (
    <group position={[-2.5, 0, -0.25]}>
      {logs.map((log, i) => (
        <Cyl key={i} r={log.r} h={log.l} segments={6} material={materials.pole} position={[-0.18 + log.k * 0.09 + log.row * 0.04, 0.05 + log.row * 0.1, log.jitter]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
    </group>
  );
}

function Stores({ materials }) {
  return (
    <group position={[-2.3, 0, 1.45]}>
      <Sack materials={materials} position={[-0.22, 0, -0.14]} rotation={[0, 0.4, 0]} />
      <Sack materials={materials} size={[0.38, 0.48, 0.34]} position={[0.2, 0, -0.2]} rotation={[0, -0.3, 0.06]} />
      <Sack materials={materials} size={[0.44, 0.3, 0.4]} tied={false} position={[0.05, 0, 0.22]} rotation={[0.2, 1.2, 0]} />
      {[0, 1, 2, 3].map(i => (
        <mesh key={i} material={materials.sweetPotato} position={[0.32 + i * 0.06, 0.04, 0.26 + (i % 2) * 0.05]} scale={[0.07, 0.04, 0.045]} rotation={[0, i * 0.8, 0]}>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
      <Basket materials={materials} radius={0.17} height={0.16} fill="clayDark" position={[-0.32, 0, 0.24]} />
    </group>
  );
}

// A big clay tinaja on a ring of stones, its mouth covered with a board, a
// gourd dipper on top.
function WaterJar({ materials }) {
  return (
    <group position={[-0.55, 0, 1.72]}>
      <Lathe profile={[[0.001, 0], [0.12, 0.0], [0.24, 0.16], [0.27, 0.34], [0.22, 0.56], [0.13, 0.64], [0.12, 0.68], [0.15, 0.7]]} segments={18} material={materials.clay} position={[0, 0.02, 0]} />
      <Cyl r={0.17} h={0.025} segments={12} material={materials.timber} position={[0, 0.725, 0]} />
      <group position={[0.02, 0.74, 0.02]} rotation={[0, 0.6, Math.PI / 2 - 0.2]}>
        <Gourd materials={materials} size={0.05} />
      </group>
      <Cyl r={0.12} h={0.04} segments={10} material={materials.rubble} position={[0, 0.02, 0]} />
    </group>
  );
}

function SmallChest({ materials }) {
  return (
    <group position={[2.3, 0, 1.5]} rotation={[0, -0.1, 0]}>
      <Beam size={[0.78, 0.42, 0.44]} material={materials.crateWood} position={[0, 0.21, 0]} />
      <Beam size={[0.8, 0.05, 0.46]} material={materials.timber} position={[0, 0.445, 0]} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <Block key={`${sx}${sz}`} size={[0.08, 0.47, 0.08]} material={materials.hide} position={[sx * 0.37, 0.235, sz * 0.2]} />
      ))}
      <Block size={[0.07, 0.08, 0.02]} material={materials.iron} position={[0, 0.38, 0.23]} />
    </group>
  );
}

// Machete on a peg by the door; hoe and digging stick against the wall.
function Tools({ materials }) {
  const z = inner.z - 0.08;
  return (
    <group>
      <Cyl r={0.014} h={0.12} segments={5} material={materials.pole} position={[1.45, 1.12, z]} rotation={[Math.PI / 2, 0, 0]} />
      <group position={[1.45, 1.05, z - 0.03]} rotation={[0, 0, -0.12]}>
        <Beam size={[0.035, 0.13, 0.025]} material={materials.leather} position={[0, 0, 0]} />
        <Block size={[0.06, 0.48, 0.004]} material={materials.iron} position={[0.01, -0.3, 0]} />
      </group>
      <group position={[1.85, 0, z - 0.05]} rotation={[-0.12, 0, 0.06]}>
        <Cyl r={0.018} h={1.25} segments={6} material={materials.pole} position={[0, 0.625, 0]} />
        <Block size={[0.18, 0.12, 0.012]} material={materials.rust} position={[0, 0.02, 0.06]} rotation={[0.5, 0, 0]} />
      </group>
      <Cyl r={0.016} rTop={0.012} h={1.1} segments={5} material={materials.pole} position={[2.08, 0.55, z - 0.08]} rotation={[-0.15, 0, -0.05]} />
    </group>
  );
}

function Stools({ materials }) {
  return (
    <group>
      <Cyl r={0.15} h={0.26} segments={9} material={materials.pole} position={[-1.2, 0.13, -0.6]} />
      <Cyl r={0.145} h={0.01} segments={9} material={materials.timber} position={[-1.2, 0.265, -0.6]} />
      <Beam size={[0.6, 0.06, 0.24]} material={materials.timber} position={[0.6, 0.32, 0.6]} rotation={[0, 0.3, 0]} />
      {[-0.22, 0.22].map(x => (
        <Beam key={x} size={[0.06, 0.3, 0.18]} material={materials.timber} position={[0.6 + x * Math.cos(0.3), 0.15, 0.6 - x * Math.sin(0.3)]} rotation={[0, 0.3, 0]} />
      ))}
    </group>
  );
}

export function RanchoInterior({ materials }) {
  const produce = useMemo(() => [
    { kind: 'maize', position: [-1.15, TIE_Y - 0.02, -1.4], count: 10, seed: 11 },
    { kind: 'maize', position: [-1.15, TIE_Y - 0.02, -0.7], count: 8, seed: 13 },
    { kind: 'maize', position: [-1.15, TIE_Y - 0.02, 0.9], count: 9, seed: 17 },
    { kind: 'maize', position: [1.15, TIE_Y - 0.02, 1.2], count: 8, seed: 19 },
    { kind: 'plantain', position: [1.15, TIE_Y - 0.02, 0.35], seed: 23 },
  ], []);
  return (
    <>
      <EarthFloor materials={materials} />
      <StaticBatch name="Rancho_Furnishings">
        <Hearth materials={materials} />
        <Barbacoa materials={materials} />
        <Altar materials={materials} />
        <GrindingStone materials={materials} />
        <Firewood materials={materials} />
        <Stores materials={materials} />
        <WaterJar materials={materials} />
        <SmallChest materials={materials} />
        <Tools materials={materials} />
        <Stools materials={materials} />
        {/* A petate unrolled in the middle of the floor. */}
        <Block size={[1.2, 0.008, 0.85]} material={materials.petate} position={[0.25, 0.012, 0.15]} rotation={[0, 0.08, 0]} />
        {/* Gourds hung on a cord along the back wall. */}
        <Rope points={[[-2.6, 1.75, -inner.z + 0.08], [-0.4, 1.8, -inner.z + 0.08]]} radius={0.006} sag={0.06} material={materials.twine} />
        {[0, 1, 2].map(i => (
          <Gourd key={i} materials={materials} size={0.07} position={[-2.2 + i * 0.6, 1.5, -inner.z + 0.1]} />
        ))}
      </StaticBatch>
      <HangingProduce materials={materials} items={produce} />
      <HearthFire position={[R.hearth.x, 0.04, R.hearth.z]} scale={0.55} />
    </>
  );
}
