'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { FabricBundle } from './primitives';
import { GABRIEL_CAVE_QUARTERS_ZONE_ID as ZONE } from '../../blueprints/gabrielCave';
import { makeBoulderGeometry } from '../CaveShell';
import { wallAnchor, yawFacing } from './anchors';
import { HearthFire } from './Fire';
import { buildBunchGeometry, HangingMesh } from './hanging';
import { Ball, Beam, Block, Candle, Cyl, hash, Lathe, Rope, SheetStack, StaticBatch, useGround } from './primitives';

// The living chamber: hearth, bed, table, larder. Gabriel keeps it in the
// order of a man who expects to leave in a hurry. Positions follow the
// fixedColliders in blueprints/gabrielCave.js.

const HEARTH = [-1.2, 0.8];

const boulders = [makeBoulderGeometry(5, 1), makeBoulderGeometry(13, 1), makeBoulderGeometry(17, 1)];

function HearthRing({ ground, rock, materials }) {
  const y = ground(HEARTH[0], HEARTH[1]);
  const stones = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + hash(i, 1) * 0.2;
    const r = 0.6 + hash(i, 2) * 0.06;
    return { x: HEARTH[0] + Math.cos(a) * r, z: HEARTH[1] + Math.sin(a) * r, s: 0.13 + hash(i, 3) * 0.06, yaw: a, g: i % 3 };
  }), []);
  return (
    <group>
      {stones.map((stone, i) => (
        <mesh
          key={i}
          geometry={boulders[stone.g]}
          material={rock}
          position={[stone.x, y + stone.s * 0.35, stone.z]}
          rotation={[0, stone.yaw, 0]}
          scale={[stone.s * 1.3, stone.s, stone.s]}
          castShadow
          receiveShadow
        />
      ))}
      {/* Ash bed and charred ends of wood in it. */}
      <Ball r={0.56} material={materials.ash} scale={[1, 0.08, 1]} position={[HEARTH[0], y + 0.005, HEARTH[1]]} />
      {[0.3, 1.9, 3.6, 5.0].map((a, i) => (
        <group key={i} position={[HEARTH[0] + Math.cos(a) * 0.18, y + 0.07, HEARTH[1] + Math.sin(a) * 0.18]} rotation={[0, -a, 0.1]}>
          <Cyl r={0.04} h={0.52} segments={7} material={materials.charcoal} rotation={[0, 0, Math.PI / 2]} position={[0.2, 0, 0]} />
        </group>
      ))}
    </group>
  );
}

function Tripod({ ground, materials }) {
  const y = ground(HEARTH[0], HEARTH[1]);
  const apex = [HEARTH[0], y + 1.32, HEARTH[1]];
  const feet = [0.4, 2.5, 4.6].map(a => [HEARTH[0] + Math.cos(a) * 0.82, y, HEARTH[1] + Math.sin(a) * 0.82]);
  return (
    <group>
      {feet.map((foot, i) => {
        const dx = apex[0] - foot[0];
        const dy = apex[1] - foot[1];
        const dz = apex[2] - foot[2];
        const length = Math.hypot(dx, dy, dz) + 0.18;
        const mid = [foot[0] + dx * 0.55, foot[1] + dy * 0.55, foot[2] + dz * 0.55];
        const direction = new THREE.Vector3(dx, dy, dz).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        return <Cyl key={i} r={0.03} rTop={0.022} h={length} segments={7} material={materials.bark} position={mid} quaternion={quaternion} />;
      })}
      <Rope points={[[apex[0], apex[1] + 0.02, apex[2]], [apex[0] + 0.04, apex[1] - 0.04, apex[2]]]} radius={0.04} sag={0} material={materials.rope} />
      {/* Pot chain and the iron pot over the coals. */}
      <Rope points={[[apex[0], apex[1], apex[2]], [apex[0], y + 0.82, apex[2]]]} radius={0.008} sag={0} material={materials.iron} />
      <group position={[apex[0], y + 0.46, apex[2]]}>
        <Lathe profile={[[0, 0], [0.12, 0.01], [0.2, 0.08], [0.22, 0.18], [0.2, 0.28], [0.19, 0.3], [0.205, 0.31]]} segments={18} material={materials.iron} />
        <Cyl r={0.19} h={0.01} segments={18} material={materials.meat} position={[0, 0.26, 0]} />
        <mesh material={materials.iron} position={[0, 0.32, 0]} rotation={[0, 0, 0]} castShadow>
          <torusGeometry args={[0.2, 0.006, 4, 16, Math.PI]} />
        </mesh>
        {/* Short stubby legs of a cast pot. */}
        {[0, 2.1, 4.2].map(a => <Cyl key={a} r={0.015} h={0.06} segments={5} material={materials.iron} position={[Math.cos(a) * 0.1, -0.01, Math.sin(a) * 0.1]} />)}
      </group>
      {/* A carved spoon and a gourd bowl on a flat stone. */}
      <group position={[HEARTH[0] + 0.95, y, HEARTH[1] - 0.25]}>
        <mesh geometry={boulders[1]} material={materials.slate} scale={[0.22, 0.06, 0.18]} position={[0, 0.03, 0]} receiveShadow castShadow />
        <Block size={[0.26, 0.012, 0.03]} material={materials.timber} position={[0, 0.07, 0.02]} rotation={[0, 0.4, 0]} />
        <Lathe profile={[[0, 0], [0.07, 0.01], [0.09, 0.04], [0.085, 0.05]]} segments={12} material={materials.gourd} position={[0.04, 0.06, -0.06]} />
      </group>
    </group>
  );
}

function LogSeat({ materials, ...props }) {
  return (
    <group {...props}>
      <Cyl r={0.2} rTop={0.19} h={0.92} segments={12} material={materials.bark} position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]} />
      {[-0.461, 0.461].map(x => (
        <Cyl key={x} r={0.185} h={0.01} segments={12} material={materials.logEnd} position={[x, 0.2, 0]} rotation={[0, 0, Math.PI / 2]} />
      ))}
      {/* Adzed flat on top to sit on. */}
      <Beam size={[0.8, 0.02, 0.2]} material={materials.timber} position={[0, 0.39, 0]} />
    </group>
  );
}

function SleepingPlatform({ materials, ...props }) {
  return (
    <group {...props}>
      {/* Dry-stone footing and a frame of lashed poles. */}
      {[[-0.95, -0.45], [0.95, -0.45], [-0.95, 0.45], [0.95, 0.45]].map(([x, z], i) => (
        <Block key={i} size={[0.26, 0.22, 0.26]} material={materials.slate} position={[x, 0.11, z]} rotation={[0, hash(i, 2), 0]} />
      ))}
      {[-0.48, 0.48].map(z => <Cyl key={z} r={0.055} h={2.2} segments={8} material={materials.bark} position={[0, 0.27, z]} rotation={[0, 0, Math.PI / 2]} />)}
      {Array.from({ length: 9 }, (_, i) => (
        <Cyl key={i} r={0.03} h={1.06} segments={6} material={materials.timberRound} position={[-0.96 + i * 0.24, 0.33, 0]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
      {/* Straw tick, sagging and lumpy. */}
      <mesh material={materials.tick} position={[0, 0.41, 0]} scale={[1.02, 0.09, 0.5]} castShadow receiveShadow>
        <sphereGeometry args={[1, 18, 8]} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => (
        <Block key={`s${i}`} size={[0.12 + hash(i, 3) * 0.1, 0.006, 0.006]} material={materials.straw} position={[-1.0 + hash(i, 4) * 2.0, 0.37 + hash(i, 6) * 0.02, (hash(i, 5) > 0.5 ? 0.49 : -0.49)]} rotation={[0, hash(i, 7) * 3, 0.3]} />
      ))}
      {/* Grey wool blanket thrown back. */}
      <group position={[0.35, 0.47, 0.02]}>
        <Beam size={[1.2, 0.05, 0.94]} material={materials.wool} tile={0.3} rotation={[0.03, 0.04, 0.02]} />
        <Beam size={[0.32, 0.09, 0.92]} material={materials.wool} tile={0.3} position={[-0.62, 0.03, 0]} rotation={[0, 0.05, 0.2]} />
        <Beam size={[0.7, 0.03, 0.12]} material={materials.wool} tile={0.3} position={[0.2, -0.12, 0.5]} rotation={[1.2, 0, 0]} />
      </group>
      {/* Coat rolled for a pillow. */}
      <mesh material={materials.coat} position={[-0.84, 0.5, 0]} rotation={[Math.PI / 2, 0, 0.1]} castShadow>
        <capsuleGeometry args={[0.1, 0.5, 4, 10]} />
      </mesh>
      {/* A book left face down, open. */}
      <group position={[-0.35, 0.5, 0.3]} rotation={[0, 0.5, 0]}>
        <Block size={[0.14, 0.012, 0.2]} material={materials.bookCover} position={[-0.068, 0.02, 0]} rotation={[0, 0, 0.32]} />
        <Block size={[0.14, 0.012, 0.2]} material={materials.bookCover} position={[0.068, 0.02, 0]} rotation={[0, 0, -0.32]} />
        <Block size={[0.24, 0.03, 0.18]} material={materials.bookPages} position={[0, 0.005, 0]} />
      </group>
    </group>
  );
}

function CrateTable({ materials, ...props }) {
  return (
    <group {...props}>
      <Beam size={[0.5, 0.74, 0.8]} material={materials.crateWood} position={[-0.5, 0.37, 0]} />
      <Beam size={[0.5, 0.74, 0.8]} material={materials.crateWood} position={[0.5, 0.37, 0]} rotation={[0, 0.04, 0]} />
      {/* Plank top: two boards from a ship's hatch cover. */}
      <Beam size={[1.55, 0.05, 0.44]} material={materials.timber} position={[0, 0.765, -0.22]} />
      <Beam size={[1.5, 0.05, 0.44]} material={materials.timber} position={[0.02, 0.765, 0.22]} rotation={[0, 0.01, 0]} />
      {/* Letters tied with tape. */}
      <group position={[0, 0.8, 0.05]} rotation={[0, 0.3, 0]}>
        <Block size={[0.22, 0.04, 0.12]} material={materials.paperOld} />
        <Block size={[0.225, 0.042, 0.012]} material={materials.redWool} />
        <Block size={[0.012, 0.042, 0.125]} material={materials.redWool} />
      </group>
      {/* Writing: paper, inkwell, quill, sand-shaker. */}
      <SheetStack count={5} size={[0.3, 0.22]} materials={materials} seed={31} position={[-0.42, 0.79, 0.05]} rotation={[0, -0.2, 0]} />
      <group position={[-0.2, 0.79, -0.22]}>
        <Lathe profile={[[0, 0], [0.04, 0], [0.045, 0.03], [0.02, 0.05], [0.015, 0.06], [0, 0.06]]} segments={10} material={materials.glass} />
        <Cyl r={0.018} h={0.04} segments={8} material={materials.ink} position={[0, 0.02, 0]} />
        <Cyl r={0.003} rTop={0.0015} h={0.32} segments={4} material={materials.horn} position={[0.05, 0.12, 0]} rotation={[0.2, 0, -0.5]} />
        <mesh material={materials.herb} position={[0.12, 0.2, 0]} rotation={[0.2, 0, -0.5]} scale={[1, 1, 0.2]}>
          <coneGeometry args={[0.012, 0.14, 4]} />
        </mesh>
      </group>
      {/* An open book weighted with a stone. */}
      <group position={[0.45, 0.79, -0.15]} rotation={[0, -0.25, 0]}>
        <Block size={[0.36, 0.02, 0.24]} material={materials.bookCover} />
        <Block size={[0.17, 0.02, 0.22]} material={materials.bookPages} position={[-0.088, 0.016, 0]} rotation={[0, 0, 0.04]} />
        <Block size={[0.17, 0.02, 0.22]} material={materials.bookPages} position={[0.088, 0.016, 0]} rotation={[0, 0, -0.04]} />
        <Ball r={0.04} material={materials.slate} scale={[1, 0.6, 1]} position={[0.1, 0.04, 0.04]} />
      </group>
      {/* Spectacles folded on the book. */}
      <group position={[0.42, 0.825, 0.0]} rotation={[-Math.PI / 2, 0, 0.6]}>
        {[-0.022, 0.022].map(x => (
          <mesh key={x} material={materials.brass} position={[x, 0, 0]}>
            <torusGeometry args={[0.018, 0.0015, 3, 12]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Larder({ materials, ...props }) {
  const shelfY = [0.42, 0.88, 1.32];
  return (
    <group {...props}>
      {[-0.98, 0.98].map(x => [-0.28, 0.28].map(z => (
        <Beam key={`${x}${z}`} size={[0.07, 1.56, 0.07]} material={materials.timberRound} position={[x, 0.78, z]} />
      )))}
      {shelfY.map(y => (
        <Beam key={y} size={[2.06, 0.04, 0.62]} material={materials.timber} position={[0, y, 0]} />
      ))}
      {/* Bottom: maize sack and salt crock. */}
      <FabricBundle material={materials.sacking} position={[-0.55, 0.32, 0]} radii={[0.3, 0.32, 0.24]} />
      <Cyl r={0.04} h={0.12} segments={8} material={materials.sacking} position={[-0.55, 0.66, 0]} />
      <Lathe profile={[[0, 0], [0.12, 0], [0.15, 0.1], [0.14, 0.22], [0.1, 0.25], [0, 0.25]]} segments={14} material={materials.clay} position={[0.3, 0.44, 0.02]} />
      <Lathe profile={[[0, 0], [0.1, 0], [0.12, 0.08], [0.1, 0.18], [0.07, 0.2], [0, 0.2]]} segments={14} material={materials.clayDark} position={[0.7, 0.44, -0.05]} />
      {/* Middle: gourds and dried guava in a basket. */}
      {[[-0.75, 0.05, 0.13], [-0.45, -0.08, 0.11], [-0.2, 0.08, 0.12]].map(([x, z, r], i) => (
        <group key={i} position={[x, 0.9, z]} rotation={[0, 0, 0.1 * i]}>
          <Ball r={r} material={materials.gourd} scale={[1, 1.1, 1]} position={[0, r, 0]} />
          <Ball r={r * 0.6} material={materials.gourd} position={[0, r * 2.2, 0]} />
          <Cyl r={0.015} h={0.05} segments={6} material={materials.bark} position={[0, r * 2.8, 0]} />
        </group>
      ))}
      <group position={[0.45, 0.9, 0]}>
        <Lathe profile={[[0, 0], [0.14, 0], [0.2, 0.1], [0.21, 0.12]]} segments={14} material={materials.straw} />
        {Array.from({ length: 9 }, (_, i) => (
          <Ball key={i} r={0.04} material={materials.clay} segments={6} scale={[1, 0.6, 1]} position={[(hash(i, 1) - 0.5) * 0.22, 0.09 + hash(i, 2) * 0.03, (hash(i, 3) - 0.5) * 0.22]} />
        ))}
      </group>
      {/* Top: tobacco twist, a jar, spare candles, flint and steel. */}
      <Cyl r={0.03} h={0.24} segments={6} material={materials.leather} position={[-0.6, 1.36, 0]} rotation={[0.3, 0.2, Math.PI / 2]} />
      <Lathe profile={[[0, 0], [0.07, 0], [0.08, 0.14], [0.05, 0.17], [0.05, 0.2], [0, 0.2]]} segments={12} material={materials.clay} position={[-0.15, 1.34, 0.05]} />
      {[0, 1, 2, 3].map(i => (
        <Cyl key={i} r={0.016} h={0.18} segments={6} material={materials.tallow} position={[0.3 + i * 0.035, 1.35, 0.1]} rotation={[0, 0, Math.PI / 2]} />
      ))}
      <Block size={[0.08, 0.02, 0.05]} material={materials.iron} position={[0.65, 1.35, -0.05]} rotation={[0, 0.4, 0]} />
    </group>
  );
}

function WaterJars({ materials, ...props }) {
  const jar = [[0, 0], [0.16, 0], [0.24, 0.18], [0.26, 0.36], [0.2, 0.56], [0.12, 0.64], [0.13, 0.7], [0, 0.7]];
  return (
    <group {...props}>
      {[[-0.32, 0.05, 1], [0.32, -0.05, 0.92], [0.0, 0.32, 0.72]].map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]} scale={s}>
          <Lathe profile={jar} segments={16} material={i === 2 ? materials.clayDark : materials.clay} />
          {/* Wooden lid against dust and rats. */}
          <Cyl r={0.15} h={0.025} segments={12} material={materials.timber} position={[0, 0.71, 0]} />
        </group>
      ))}
      {/* Gourd dipper hung on the first jar. */}
      <group position={[-0.32, 0.6, 0.27]} rotation={[0.6, 0, 0]}>
        <Ball r={0.06} material={materials.gourd} />
        <Cyl r={0.012} h={0.22} segments={5} material={materials.gourd} position={[0, 0.12, 0]} />
      </group>
    </group>
  );
}

function WallHanging({ anchor, children, offset = 0.04 }) {
  if (!anchor) return null;
  const [x, y, z] = anchor.position;
  const n = anchor.normal;
  return (
    <group position={[x + n[0] * offset, y, z + n[2] * offset]} rotation={[0, yawFacing(n), 0]}>
      {children}
    </group>
  );
}

// A scraped goatskin, outline irregular, with the map drawn on it.
function hideGeometry() {
  const shape = new THREE.Shape();
  const points = 26;
  for (let i = 0; i <= points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    // Legs of the hide at four corners.
    const leg = Math.pow(Math.abs(Math.sin(a * 2)), 6) * 0.12;
    const r = 0.36 + leg + Math.sin(a * 5 + 1) * 0.02;
    const x = Math.cos(a) * r * 1.2;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geometry = new THREE.ShapeGeometry(shape, 8);
  const uv = geometry.attributes.uv;
  const position = geometry.attributes.position;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, position.getX(i) / 1.15 + 0.5, position.getY(i) / 0.96 + 0.5);
  }
  return geometry;
}

const HIDE = hideGeometry();

export function LivingChamber({ materials, rock }) {
  const ground = useGround(ZONE);
  const anchors = useMemo(() => ({
    cap: wallAnchor(ZONE, -3.7, 1.6, -2.3, [-0.55, -0.83]),
    coat: wallAnchor(ZONE, -3.2, 1.65, -2.3, [-0.3, -0.95]),
    map: wallAnchor(ZONE, 1.0, 1.55, -3.4, [0, -1]),
    tally: wallAnchor(ZONE, -6.9, 1.55, -1.6, [-0.55, -0.83]),
  }), []);
  const herbLines = useMemo(() => [
    { a: [-3.6, 2.15, -0.9], b: [0.6, 2.25, -1.3], sag: 0.05, count: 9, length: 0.3, width: 0.16, cards: 3, flare: 1.0 },
  ], []);
  const meatLines = useMemo(() => [
    { a: [-3.3, 2.05, -0.65], b: [0.2, 2.15, -1.05], sag: 0.05, count: 7, length: 0.32, width: 0.045, cards: 2, flare: 0.8 },
  ], []);
  return (
    <>
      <StaticBatch name="LivingChamberFurnishings">
        <HearthRing ground={ground} rock={rock} materials={materials} />
        <Tripod ground={ground} materials={materials} />
        <LogSeat materials={materials} position={[-2.95, ground(-2.95, 1.85), 1.85]} rotation={[0, 0.9, 0]} />
        <LogSeat materials={materials} position={[0.65, ground(0.65, 2.2), 2.2]} rotation={[0, -0.8, 0]} />
        <SleepingPlatform materials={materials} position={[-6.75, ground(-6.75, -1.05), -1.05]} rotation={[0, 0.18, 0]} />
        <CrateTable materials={materials} position={[2.7, ground(2.7, -2.0), -2.0]} rotation={[0, -0.22, 0]} />
        <Larder materials={materials} position={[4.9, ground(4.9, -4.7), -4.7]} rotation={[0, -0.35, 0]} />
        <WaterJars materials={materials} position={[-4.1, ground(-4.1, -3.7), -3.7]} rotation={[0, 0.4, 0]} />
        {/* Stump beside the bed for the candle. */}
        <group position={[-5.55, ground(-5.55, -2.3), -2.3]}>
          <Cyl r={0.17} rTop={0.15} h={0.72} segments={10} material={materials.bark} position={[0, 0.36, 0]} />
          <Cyl r={0.15} h={0.01} segments={10} material={materials.logEnd} position={[0, 0.725, 0]} />
        </group>
        {/* Firewood ready by the hearth. */}
        {Array.from({ length: 7 }, (_, i) => {
          const x = -2.9 + (i % 4) * 0.02;
          const z = -0.35 + (i % 4) * 0.13;
          return <Cyl key={i} r={0.045 + hash(i, 1) * 0.02} h={0.62} segments={7} material={materials.bark} position={[x, ground(x, z) + 0.05 + Math.floor(i / 4) * 0.1, z + Math.floor(i / 4) * 0.06]} rotation={[Math.PI / 2, 0.2 + hash(i, 2) * 0.2, 0]} />;
        })}
        {/* Drying lines for herbs and meat, from pegs in the wall. */}
        <Rope points={[herbLines[0].a, herbLines[0].b]} sag={herbLines[0].sag} radius={0.006} material={materials.rope} />
        <Rope points={[meatLines[0].a, meatLines[0].b]} sag={meatLines[0].sag} radius={0.006} material={materials.rope} />
        {/* Cap and coat on pegs. */}
        <WallHanging anchor={anchors.cap}>
          <Cyl r={0.018} h={0.14} segments={6} material={materials.timber} position={[0, 0, 0.05]} rotation={[Math.PI / 2 - 0.2, 0, 0]} />
          <group position={[0, -0.1, 0.1]} rotation={[0.2, 0, 0.15]}>
            <Lathe profile={[[0.11, 0], [0.115, 0.04], [0.1, 0.12], [0.06, 0.2], [0.02, 0.24], [0, 0.245]]} segments={14} material={materials.redWool} rotation={[Math.PI, 0, 0]} position={[0, 0.06, 0]} />
          </group>
        </WallHanging>
        <WallHanging anchor={anchors.coat}>
          <Cyl r={0.018} h={0.14} segments={6} material={materials.timber} position={[0, 0, 0.05]} rotation={[Math.PI / 2 - 0.2, 0, 0]} />
          {/* A worn frock coat hung by its collar: body, sleeves, skirts. */}
          <group position={[0, -0.06, 0.09]}>
            <Lathe profile={[[0.03, 0], [0.16, -0.04], [0.21, -0.14], [0.19, -0.42], [0.21, -0.7], [0.26, -0.98], [0.25, -1.0]]} segments={14} material={materials.coat} scale={[1, 1, 0.32]} />
            {[-1, 1].map(side => (
              <mesh key={side} material={materials.coat} position={[side * 0.2, -0.42, 0.03]} rotation={[0.05, 0, side * 0.1]} castShadow>
                <capsuleGeometry args={[0.055, 0.5, 4, 8]} />
              </mesh>
            ))}
            {[-0.2, -0.32, -0.44, -0.56].map(y => <Cyl key={y} r={0.012} h={0.01} segments={8} material={materials.brass} position={[0.05, y, 0.07]} rotation={[Math.PI / 2, 0, 0]} />)}
          </group>
        </WallHanging>
        <WallHanging anchor={anchors.map} offset={0.05}>
          <mesh geometry={HIDE} material={materials.hideMap} receiveShadow />
          {[[-0.5, 0.36], [0.5, 0.36], [-0.5, -0.36], [0.5, -0.36]].map(([x, y]) => (
            <Cyl key={`${x}${y}`} r={0.008} h={0.06} segments={4} material={materials.timber} position={[x * 0.92, y * 0.92, 0.02]} rotation={[Math.PI / 2, 0, 0]} />
          ))}
        </WallHanging>
      </StaticBatch>
      {anchors.tally && (
        <WallHanging anchor={anchors.tally} offset={0.03}>
          <mesh material={materials.tally} name="QuartersTally" userData={{ noBatch: true }}>
            <planeGeometry args={[1.2, 0.6]} />
          </mesh>
        </WallHanging>
      )}
      <HearthFire position={[HEARTH[0], ground(HEARTH[0], HEARTH[1]) + 0.02, HEARTH[1]]} />
      <HangingMesh name="Quarters_Herbs" build={buildBunchGeometry} lines={herbLines} seed={7} material={materials.herbHanging} castShadow={false} />
      <HangingMesh name="Quarters_Jerky" build={buildBunchGeometry} lines={meatLines} seed={11} material={materials.meatHanging} castShadow={false} />
      <Candle materials={materials} position={[-5.55, ground(-5.55, -2.3) + 0.73, -2.3]} holder="stone" />
    </>
  );
}
