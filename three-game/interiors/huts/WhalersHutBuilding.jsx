'use client';

import React from 'react';
import * as THREE from 'three';
import { WHALERS_HUT as H } from '../blueprints/whalersHut';
import { Beam, Block, Cyl, hash, Rope, StaticBatch } from '../cave/props/primitives';
import {
  mergeAll,
  moundGeometry,
  plankBox,
  plankWallGeometry,
  poleGeometry,
  seeded,
  stoneWallGeometry,
} from './hutGeometry';
import { useDisposable } from './useDisposable';
import { WhalersHutYard } from './WhalersHutYard';

// The whalers' hut as a building: dry-stone base, salvaged-plank walls and a
// planked gable roof with a fallen back corner. Rendered on the beach (with
// sand drifted against it) and as the shell of its own interior zone (with
// the roof grouped as "ceiling" so the top-down cutaway lifts it off).

const slope = (H.ridge - H.eave) / H.halfZ;
const inner = { x: H.halfX - H.wall, z: H.halfZ - H.wall };
const plankLineZ = H.halfZ - H.wall * 0.62;
const plankLineX = H.halfX - H.wall * 0.62;

function roofY(z) {
  return H.ridge - Math.abs(z) * slope;
}

function buildStone(sink) {
  const w = H.wall / 2;
  const points = [
    [-H.halfX + w, -H.halfZ + w],
    [H.halfX - w, -H.halfZ + w],
    [H.halfX - w, H.halfZ - w],
    [-H.halfX + w, H.halfZ - w],
  ];
  // Front run (segment 2) goes east to west.
  const eastEnd = H.halfX - w;
  const doorFrom = eastEnd - (H.door.x + H.door.width / 2);
  const doorTo = eastEnd - (H.door.x - H.door.width / 2);
  return stoneWallGeometry(points, {
    height: H.stoneHeight + sink,
    thickness: H.wall,
    course: 0.23,
    seed: 41,
    closed: true,
    crumble: 0.16,
    sink,
    openings: [{ segment: 2, from: doorFrom, to: doorTo }],
  });
}

function buildWalls() {
  const rand = seeded(5);
  const parts = [];
  const base = H.stoneHeight - 0.06;
  // Front wall: door and window cut through the boards.
  parts.push(plankWallGeometry([-H.halfX + 0.08, plankLineZ], [H.halfX - 0.08, plankLineZ], {
    bottom: base,
    top: () => H.eave + 0.02,
    seed: 11,
    openings: [
      { from: H.halfX - 0.08 + H.door.x - H.door.width / 2, to: H.halfX - 0.08 + H.door.x + H.door.width / 2, bottom: -1, top: H.door.height },
      { from: H.halfX - 0.08 + H.window.x - H.window.width / 2, to: H.halfX - 0.08 + H.window.x + H.window.width / 2, bottom: H.window.bottom, top: H.window.top },
    ],
  }));
  // Back wall: boards nearest the fallen corner have split and dropped.
  parts.push(plankWallGeometry([-H.halfX + 0.08, -plankLineZ], [H.halfX - 0.08, -plankLineZ], {
    bottom: base,
    top: along => {
      const x = -H.halfX + 0.08 + along;
      if (x < H.collapse.maxX - 0.2) return H.eave - 0.15 - rand() * 0.55;
      return H.eave + 0.02;
    },
    seed: 13,
    missing: 0.04,
  }));
  // Gable ends.
  for (const side of [-1, 1]) {
    parts.push(plankWallGeometry([side * plankLineX, -H.halfZ + 0.08], [side * plankLineX, H.halfZ - 0.08], {
      bottom: base,
      top: along => {
        const z = -H.halfZ + 0.08 + along;
        const y = roofY(z) - 0.06;
        if (side < 0 && z < H.collapse.maxZ - 0.3) return Math.min(y, H.eave - 0.1 - rand() * 0.6);
        return y;
      },
      seed: side < 0 ? 17 : 19,
      missing: side > 0 ? 0.05 : 0.02,
    }));
  }
  return parts;
}

// Roof boards laid down the slope on both sides, plus the ridge cap.
function buildRoofBoards(materialSplit) {
  const rand = seeded(23);
  const sound = [];
  const tarred = [];
  const slopeLength = Math.hypot(H.halfZ + H.overhang, (H.halfZ + H.overhang) * slope);
  const pitch = Math.atan(slope);
  const matrix = new THREE.Matrix4();
  for (const side of [-1, 1]) {
    let x = -H.halfX - H.overhang * 0.6;
    while (x < H.halfX + H.overhang * 0.6) {
      const width = 0.2 + rand() * 0.12;
      const mid = x + width / 2;
      x += width + 0.006;
      let from = 0;
      let to = slopeLength;
      if (side < 0 && mid < H.collapse.maxX) {
        // Fallen corner: boards end ragged short of the gap.
        const keep = (H.collapse.maxZ * -1) / (H.halfZ + H.overhang);
        if (rand() < 0.35) continue;
        to = slopeLength * Math.min(1, keep * (0.3 + rand() * 0.7));
      }
      const length = to - from;
      if (length < 0.1) continue;
      const geometry = plankBox(width, 0.03, length, 1.4, rand);
      const centre = from + length / 2;
      const zz = side * centre * Math.cos(pitch);
      const yy = H.ridge + 0.05 - centre * Math.sin(pitch);
      matrix.makeRotationX(side * pitch);
      matrix.setPosition(mid, yy + (rand() - 0.5) * 0.01, zz);
      geometry.applyMatrix4(matrix);
      (rand() < materialSplit ? tarred : sound).push(geometry.toNonIndexed());
      geometry.dispose();
    }
  }
  return { sound, tarred };
}

function mergeList(list) {
  return mergeAll(list);
}

function buildRafters() {
  const poles = [];
  const reach = H.halfZ + H.overhang * 0.7;
  for (let x = -H.halfX + 0.35; x <= H.halfX - 0.3; x += 0.95) {
    for (const side of [-1, 1]) {
      const end = [x, roofY(side * reach) - 0.08, side * reach];
      const start = [x, H.ridge - 0.05, 0];
      if (side < 0 && x < H.collapse.maxX) {
        // Snapped rafter: the upper stub, and the lower half hanging into the room.
        const breakT = 0.38;
        const mid = start.map((v, i) => v + (end[i] - v) * breakT);
        poles.push(poleGeometry(start, mid, 0.055, { radiusEnd: 0.045 }));
        poles.push(poleGeometry([x + 0.05, H.eave - 0.05, -inner.z + 0.15], [x + 0.22, 0.42, -inner.z + 0.95], 0.05));
        continue;
      }
      poles.push(poleGeometry(start, end, 0.06, { radiusEnd: 0.05 }));
    }
  }
  // Ridge pole and two tie beams.
  poles.push(poleGeometry([-H.halfX - 0.2, H.ridge - 0.02, 0], [H.halfX + 0.2, H.ridge - 0.02, 0], 0.075));
  for (const x of [-0.9, 1.95]) {
    poles.push(poleGeometry([x, H.eave - 0.05, -inner.z - 0.1], [x, H.eave - 0.05, inner.z + 0.1], 0.06));
  }
  return mergeList(poles.map(geometry => geometry.toNonIndexed()));
}

function SandDrift({ material, position, rx, rz, height, yaw = 0, seed = 1 }) {
  const geometry = useDisposable(() => moundGeometry({ rx, rz, height, seed, sink: 0.12, tile: 1.6 }), [rx, rz, height, seed]);
  return <mesh geometry={geometry} material={material} position={position} rotation={[0, yaw, 0]} receiveShadow />;
}

function DoorLeaf({ materials }) {
  // A door of three boards on two battens, hung on rope hinges from the east
  // jamb and swung out against the wall.
  return (
    <group position={[H.door.x + H.door.width / 2 + 0.02, 0.06, H.halfZ - 0.02]} rotation={[0, 1.85, 0]}>
      {[0, 1, 2].map(i => (
        <Beam key={i} size={[0.29, 1.74, 0.035]} material={materials.driftwood} tile={1.3} position={[-0.16 - i * 0.3, 0.88, 0]} rotation={[0, 0, (hash(i, 3) - 0.5) * 0.02]} />
      ))}
      {[0.38, 1.42].map(y => (
        <Beam key={y} size={[0.86, 0.11, 0.03]} material={materials.shipPlank} tile={1.2} position={[-0.46, y, -0.032]} />
      ))}
      {[0.4, 1.4].map(y => (
        <mesh key={y} material={materials.rope} position={[0.02, y, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.04, 0.012, 5, 10]} />
        </mesh>
      ))}
    </group>
  );
}

export function WhalersHutBuilding({ materials, variant = 'exterior', groundAt = null }) {
  const exterior = variant === 'exterior';
  const stone = useDisposable(() => buildStone(exterior ? 0.32 : 0.1), [exterior]);
  const walls = useDisposable(() => buildWalls(), []);
  const roof = useDisposable(() => {
    const { sound, tarred } = buildRoofBoards(0.3);
    return { sound: mergeList(sound), tarred: mergeList(tarred) };
  }, []);
  const rafters = useDisposable(() => buildRafters(), []);

  const frontZ = plankLineZ;
  return (
    <group>
      <mesh geometry={stone} material={materials.stone} castShadow receiveShadow name="WhalersHut_Stone" />
      {walls.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={i === 1 ? materials.shipPlank : materials.driftwood} castShadow receiveShadow />
      ))}
      <StaticBatch name="WhalersHut_Frame">
        {/* Wall plates and corner posts carry the roof on the stone. */}
        {[-1, 1].map(side => (
          <Beam key={`plate-${side}`} size={[H.halfX * 2 - 0.1, 0.12, 0.14]} material={materials.timber} position={[0, H.eave + 0.02, side * (plankLineZ - 0.06)]} />
        ))}
        {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => (
          <Beam key={`post-${sx}-${sz}`} size={[0.13, H.eave - H.stoneHeight + 0.1, 0.13]} material={materials.timber} position={[sx * (plankLineX - 0.08), (H.eave + H.stoneHeight) / 2, sz * (plankLineZ - 0.08)]} />
        ))}
        {/* Door frame: jambs, and a lintel from a ship's beam with its trenails still in. */}
        {[-1, 1].map(side => (
          <Beam key={`jamb-${side}`} size={[0.12, H.door.height + 0.05, 0.16]} material={materials.shipPlank} position={[H.door.x + side * (H.door.width / 2 + 0.06), H.door.height / 2 - 0.02, H.halfZ - H.wall / 2]} />
        ))}
        <Beam size={[H.door.width + 0.5, 0.16, H.wall + 0.06]} material={materials.shipPlank} position={[H.door.x, H.door.height + 0.08, H.halfZ - H.wall / 2]} />
        <Beam size={[H.door.width + 0.1, 0.06, H.wall]} material={materials.driftwood} position={[H.door.x, 0.02, H.halfZ - H.wall / 2]} />
        {/* Window: a frame, and a sailcloth flap rolled up and tied. */}
        <Beam size={[H.window.width + 0.14, 0.07, 0.12]} material={materials.timber} position={[H.window.x, H.window.bottom - 0.03, frontZ]} />
        <Beam size={[H.window.width + 0.14, 0.07, 0.12]} material={materials.timber} position={[H.window.x, H.window.top + 0.03, frontZ]} />
        <Cyl r={0.06} h={H.window.width + 0.1} segments={8} material={materials.sailcloth} position={[H.window.x, H.window.top + 0.12, frontZ + 0.08]} rotation={[0, 0, Math.PI / 2]} />
        {[-1, 1].map(side => (
          <Cyl key={side} r={0.008} h={0.2} segments={4} material={materials.twine} position={[H.window.x + side * 0.22, H.window.top + 0.1, frontZ + 0.1]} />
        ))}
      </StaticBatch>
      <DoorLeaf materials={materials} />
      <group name="HutCeiling">
        <mesh geometry={roof.sound} material={materials.shipPlank} castShadow receiveShadow name="HutCeiling_RoofBoards" />
        <mesh geometry={roof.tarred} material={materials.tarredPlank} castShadow receiveShadow name="HutCeiling_RoofTar" />
        <mesh geometry={rafters} material={materials.pole} castShadow receiveShadow name="HutCeiling_Rafters" />
        <RoofPatches materials={materials} />
      </group>
      <ExteriorDressing materials={materials} />
      {groundAt && <WhalersHutYard materials={materials} groundAt={groundAt} />}
    </group>
  );
}

// Tarred sailcloth over the worst of the front slope, roped down to stones.
function RoofPatches({ materials }) {
  const pitch = Math.atan(slope);
  const patches = [
    { x: 0.9, along: 1.25, w: 2.3, l: 1.6, side: 1 },
    { x: -2.4, along: 0.9, w: 1.4, l: 1.3, side: 1 },
    { x: 2.6, along: 1.6, w: 1.6, l: 1.5, side: -1 },
  ];
  return (
    <group name="HutCeiling_Patches">
      {patches.map((p, i) => {
        const y = H.ridge + 0.075 - p.along * Math.sin(pitch);
        const z = p.side * p.along * Math.cos(pitch);
        return (
          <group key={i} position={[p.x, y, z]} rotation={[p.side * pitch, (hash(i, 2) - 0.5) * 0.1, 0]}>
            <mesh material={materials.sailcloth} castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[p.w, p.l, 4, 4]} />
            </mesh>
            {/* Weight stones on the cloth's lower corners. */}
            {[-1, 1].map(s => (
              <mesh key={s} material={materials.rubble} position={[s * (p.w / 2 - 0.15), 0.06, p.side * (p.l / 2 - 0.15)]} scale={[0.14, 0.08, 0.11]} castShadow>
                <icosahedronGeometry args={[1, 0]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

// Outside: sand banked against the weather walls, roof boards that slid off
// the fallen corner, and a rain cask under the eave.
function ExteriorDressing({ materials }) {
  return (
    <group>
      <SandDrift material={materials.sand} position={[-H.halfX - 0.5, 0, -0.5]} rx={1.3} rz={2.9} height={0.55} seed={3} />
      <SandDrift material={materials.sand} position={[-1.2, 0, -H.halfZ - 0.55]} rx={3.0} rz={1.0} height={0.42} seed={5} />
      <SandDrift material={materials.sand} position={[H.halfX + 0.3, 0, -1.4]} rx={0.8} rz={1.3} height={0.22} seed={7} />
      <StaticBatch name="WhalersHut_Outside">
        {[0, 1, 2].map(i => (
          <group key={i} position={[-H.halfX - 0.4 - i * 0.25, 0.08 + i * 0.03, -H.halfZ + 0.2 + i * 0.4]} rotation={[0.1 * i, 0.4 + i * 0.5, 0.25]}>
            <Beam size={[0.26, 0.03, 2.1 - i * 0.4]} material={materials.shipPlank} tile={1.4} />
          </group>
        ))}
        <group position={[H.halfX - 0.7, 0, H.halfZ + 0.55]}>
          <Block size={[0.5, 0.06, 0.5]} material={materials.driftwood} position={[0, 0.03, 0]} />
        </group>
        <Rope points={[[H.window.x - 0.3, H.eave + 0.05, H.halfZ + 0.3], [H.window.x - 0.5, 0.15, H.halfZ + 0.9]]} radius={0.01} sag={0.05} material={materials.rope} />
      </StaticBatch>
    </group>
  );
}

export const WHALERS_HUT_FLOOR = inner;
