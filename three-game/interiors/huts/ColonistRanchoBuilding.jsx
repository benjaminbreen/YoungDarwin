'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { COLONIST_RANCHO as R } from '../blueprints/colonistRancho';
import { Beam, Cyl, hash, Rope, StaticBatch } from '../cave/props/primitives';
import { mergeAll, projectUVs, poleGeometry, roofSlabGeometry, stoneWallGeometry } from './hutGeometry';
import { HangingProduce, Hammock } from './hutProps';
import { RanchoGarden } from './RanchoGarden';
import { useDisposable } from './useDisposable';

// The colonist's rancho as a building: bajareque walls on a stone sill, a
// hipped grass roof drawn down over a veranda, rafters and cane lath open
// to the room below. The gap between wall-top and thatch is left open, as
// it is in such houses: the hearth smoke leaves that way.

const innerX = R.halfX - R.wall;
const innerZ = R.halfZ - R.wall;
const frontEave = { y: 1.95, z: R.halfZ + R.veranda };
const backEave = { y: 2.05, z: -(R.halfZ + R.overhang) };
const sideX = R.halfX + R.overhang;

function frontSlopeY(z) {
  return R.ridge - (R.ridge - frontEave.y) * (z / frontEave.z);
}

function backSlopeY(z) {
  return R.ridge - (R.ridge - backEave.y) * (z / backEave.z);
}

export function ranchoRoofUnderside(x, z) {
  // Height of the thatch underside above (x, z), for hanging things from it.
  const slope = z >= 0 ? frontSlopeY(z) : backSlopeY(z);
  const hipRun = Math.max(0, Math.abs(x) - R.ridgeHalf) / (sideX - R.ridgeHalf);
  return slope - hipRun * 0.6 - 0.32;
}

function buildSill() {
  const w = 0.16;
  const points = [
    [-R.halfX + w, -R.halfZ + w],
    [R.halfX - w, -R.halfZ + w],
    [R.halfX - w, R.halfZ - w],
    [-R.halfX + w, R.halfZ - w],
  ];
  const eastEnd = R.halfX - w;
  return stoneWallGeometry(points, {
    height: R.sill + 0.12,
    thickness: 0.34,
    course: 0.2,
    seed: 87,
    closed: true,
    sink: 0.12,
    openings: [{ segment: 2, from: eastEnd - (R.door.x + R.door.width / 2), to: eastEnd - (R.door.x - R.door.width / 2) }],
    tone: [0.72, 0.68, 0.62],
  });
}

// Daub wall panels between the posts, cut around the door and window.
function buildWalls() {
  const parts = [];
  const y0 = R.sill;
  const y1 = R.wallTop;
  const t = R.wall;
  const add = (cx, cy, cz, sx, sy, sz) => {
    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    geometry.translate(cx, cy, cz);
    // Wall material has horizontal cane under vertical stakes: never apply
    // plankBox's longest-axis grain rotation to narrow daub panels. Project
    // after translation so the detail continues across door/window cuts.
    projectUVs(geometry, 1.8);
    parts.push(geometry.toNonIndexed());
    geometry.dispose();
  };
  const h = y1 - y0;
  const cy = (y0 + y1) / 2;
  // Back wall, whole.
  add(0, cy, -R.halfZ + t / 2, R.halfX * 2 - 0.1, h, t);
  // West wall, whole.
  add(-R.halfX + t / 2, cy, 0, t, h, R.halfZ * 2 - 0.1);
  // East wall with the window.
  const wz0 = R.window.z - R.window.width / 2;
  const wz1 = R.window.z + R.window.width / 2;
  add(R.halfX - t / 2, cy, (-R.halfZ + wz0) / 2, t, h, wz0 + R.halfZ);
  add(R.halfX - t / 2, cy, (R.halfZ + wz1) / 2, t, h, R.halfZ - wz1);
  add(R.halfX - t / 2, (y0 + R.window.bottom) / 2, R.window.z, t, R.window.bottom - y0, R.window.width);
  add(R.halfX - t / 2, (R.window.top + y1) / 2, R.window.z, t, y1 - R.window.top, R.window.width);
  // Front wall with the door.
  const dx0 = R.door.x - R.door.width / 2;
  const dx1 = R.door.x + R.door.width / 2;
  add((-R.halfX + dx0) / 2, cy, R.halfZ - t / 2, dx0 + R.halfX, h, t);
  add((R.halfX + dx1) / 2, cy, R.halfZ - t / 2, R.halfX - dx1, h, t);
  add(R.door.x, (R.door.height + y1) / 2, R.halfZ - t / 2, R.door.width, y1 - R.door.height, t);
  return mergeAll(parts);
}

function buildRoof() {
  const ridgeL = [-R.ridgeHalf, R.ridge, 0];
  const ridgeR = [R.ridgeHalf, R.ridge, 0];
  const frontL = [-sideX, frontEave.y, frontEave.z];
  const frontR = [sideX, frontEave.y, frontEave.z];
  const backL = [-sideX, backEave.y, backEave.z];
  const backR = [sideX, backEave.y, backEave.z];
  const slabs = [
    roofSlabGeometry([ridgeL, ridgeR, frontR, frontL], { thickness: 0.32, segU: 18, segV: 12, seed: 3, lump: 0.06, ragged: 0.14 }),
    roofSlabGeometry([ridgeR, ridgeL, backL, backR], { thickness: 0.32, segU: 18, segV: 9, seed: 5, lump: 0.06, ragged: 0.14 }),
    roofSlabGeometry([ridgeL, ridgeL, backL, frontL], { thickness: 0.32, segU: 14, segV: 8, seed: 7, lump: 0.06, ragged: 0.14 }),
    roofSlabGeometry([ridgeR, ridgeR, frontR, backR], { thickness: 0.32, segU: 14, segV: 8, seed: 9, lump: 0.06, ragged: 0.14 }),
  ];
  return {
    top: mergeAll(slabs.map(s => s.top)),
    under: mergeAll(slabs.map(s => s.under)),
    edge: mergeAll(slabs.map(s => s.edge)),
  };
}

// Rafters, hip rafters, cane lath, wall plates and the veranda frame.
function buildFrame() {
  const poles = [];
  const drop = 0.34;
  for (let x = -R.ridgeHalf; x <= R.ridgeHalf + 0.01; x += 0.58) {
    poles.push(poleGeometry([x, R.ridge - drop, 0], [x, frontEave.y - drop + 0.1, frontEave.z - 0.1], 0.045, { radiusEnd: 0.038 }));
    poles.push(poleGeometry([x, R.ridge - drop, 0], [x, backEave.y - drop + 0.1, backEave.z + 0.1], 0.045, { radiusEnd: 0.038 }));
  }
  for (const sx of [-1, 1]) {
    const ridgeEnd = [sx * R.ridgeHalf, R.ridge - drop, 0];
    poles.push(poleGeometry(ridgeEnd, [sx * (sideX - 0.15), frontEave.y - drop + 0.1, frontEave.z - 0.15], 0.05));
    poles.push(poleGeometry(ridgeEnd, [sx * (sideX - 0.15), backEave.y - drop + 0.1, backEave.z + 0.15], 0.05));
    // Jack rafters on the hip ends.
    for (const zz of [-1.4, 0, 1.4]) {
      const y = zz >= 0 ? frontSlopeY(zz) : backSlopeY(zz);
      poles.push(poleGeometry([sx * R.ridgeHalf, y - drop - 0.05, zz * 0.3], [sx * (sideX - 0.2), y - drop - 0.55, zz], 0.035));
    }
  }
  poles.push(poleGeometry([-R.ridgeHalf - 0.25, R.ridge - drop + 0.05, 0], [R.ridgeHalf + 0.25, R.ridge - drop + 0.05, 0], 0.07));
  // Wall plates on top of the daub.
  for (const sz of [-1, 1]) {
    poles.push(poleGeometry([-R.halfX - 0.15, R.wallTop + 0.04, sz * (R.halfZ - R.wall / 2)], [R.halfX + 0.15, R.wallTop + 0.04, sz * (R.halfZ - R.wall / 2)], 0.065));
  }
  for (const sx of [-1, 1]) {
    poles.push(poleGeometry([sx * (R.halfX - R.wall / 2), R.wallTop + 0.1, -R.halfZ - 0.15], [sx * (R.halfX - R.wall / 2), R.wallTop + 0.1, R.halfZ + 0.15], 0.06));
  }
  // Tie beams across the room.
  for (const x of [-1.15, 1.15]) {
    poles.push(poleGeometry([x, R.wallTop + 0.16, -R.halfZ], [x, R.wallTop + 0.16, R.halfZ], 0.06));
  }
  // Corner and door posts.
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    poles.push(poleGeometry([x * (R.halfX - 0.1), -0.1, z * (R.halfZ - 0.1)], [x * (R.halfX - 0.1), R.wallTop + 0.12, z * (R.halfZ - 0.1)], 0.075));
  }
  for (const side of [-1, 1]) {
    poles.push(poleGeometry([R.door.x + side * (R.door.width / 2 + 0.05), 0, R.halfZ - R.wall / 2], [R.door.x + side * (R.door.width / 2 + 0.05), R.door.height + 0.06, R.halfZ - R.wall / 2], 0.05));
  }
  // Veranda: forked posts and a front plate.
  const vz = frontEave.z - 0.42;
  const postY = frontSlopeY(vz) - drop - 0.06;
  for (const x of [-2.75, -0.35, 2.75]) {
    poles.push(poleGeometry([x, -0.15, vz], [x, postY, vz], 0.07, { radiusEnd: 0.06 }));
    poles.push(poleGeometry([x, postY - 0.25, vz], [x - 0.12, postY + 0.05, vz], 0.03));
    poles.push(poleGeometry([x, postY - 0.25, vz], [x + 0.12, postY + 0.05, vz], 0.03));
  }
  poles.push(poleGeometry([-sideX + 0.2, postY, vz], [sideX - 0.2, postY, vz], 0.06));
  const frame = mergeAll(poles.map(geometry => geometry.toNonIndexed()));
  // Cane lath: thin battens across the rafters on both long slopes.
  const lath = [];
  for (let k = 1; k <= 7; k += 1) {
    const t = k / 8;
    const zf = frontEave.z * t;
    const zb = backEave.z * t;
    const half = R.ridgeHalf + (sideX - R.ridgeHalf) * t - 0.1;
    lath.push(poleGeometry([-half, frontSlopeY(zf) - drop + 0.06, zf], [half, frontSlopeY(zf) - drop + 0.06, zf], 0.016, { radial: 4 }).toNonIndexed());
    lath.push(poleGeometry([-half, backSlopeY(zb) - drop + 0.06, zb], [half, backSlopeY(zb) - drop + 0.06, zb], 0.016, { radial: 4 }).toNonIndexed());
  }
  return { frame, lath: mergeAll(lath) };
}

function CaneDoor({ materials }) {
  // A door of cane on a pole frame, hung on rawhide and pushed open inward.
  return (
    <group position={[R.door.x - R.door.width / 2 + 0.02, R.sill * 0.2, R.halfZ - R.wall]} rotation={[0, -1.25, 0]}>
      <mesh material={materials.cane} position={[R.door.width / 2 - 0.02, R.door.height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[R.door.width - 0.06, R.door.height - 0.1, 0.03]} />
      </mesh>
      {[0.3, R.door.height - 0.35].map(y => (
        <Cyl key={y} r={0.022} h={R.door.width - 0.04} segments={5} material={materials.pole} position={[R.door.width / 2, y, 0.03]} rotation={[0, 0, Math.PI / 2]} />
      ))}
    </group>
  );
}

function WindowShutter({ materials }) {
  // Cane shutter hinged at the top, propped open on a forked stick.
  const x = R.halfX + 0.02;
  return (
    <group position={[x, R.window.top + 0.04, R.window.z]}>
      <group rotation={[0, 0, -0.95]}>
        <mesh material={materials.cane} position={[0.02, -(R.window.top - R.window.bottom) / 2 - 0.04, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <boxGeometry args={[R.window.width + 0.1, R.window.top - R.window.bottom + 0.08, 0.025]} />
        </mesh>
      </group>
      <Cyl r={0.015} h={0.78} segments={5} material={materials.pole} position={[0.3, -0.38, 0]} rotation={[0, 0, 0.62]} />
    </group>
  );
}

export function ColonistRanchoBuilding({ materials, groundAt = null }) {
  const sill = useDisposable(() => buildSill(), []);
  const walls = useDisposable(() => buildWalls(), []);
  const roof = useDisposable(() => buildRoof(), []);
  const frame = useDisposable(() => buildFrame(), []);
  return (
    <group>
      <mesh geometry={sill} material={materials.stone} castShadow receiveShadow name="Rancho_Sill" />
      <mesh geometry={walls} material={materials.daub} castShadow receiveShadow name="Rancho_Walls" />
      <group name="RanchoCeiling">
        <mesh geometry={roof.top} material={materials.thatch} castShadow receiveShadow name="RanchoCeiling_Thatch" />
        <mesh geometry={roof.under} material={materials.thatchUnder} receiveShadow name="RanchoCeiling_ThatchUnder" />
        <mesh geometry={roof.edge} material={materials.thatch} castShadow name="RanchoCeiling_ThatchEdge" />
        <mesh geometry={frame.lath} material={materials.cane} name="RanchoCeiling_Lath" />
      </group>
      <mesh geometry={frame.frame} material={materials.pole} castShadow receiveShadow name="Rancho_Frame" />
      <CaneDoor materials={materials} />
      <WindowShutter materials={materials} />
      <RidgeCross materials={materials} />
      <RanchoVeranda materials={materials} groundAt={groundAt} />
      {groundAt && <RanchoGarden materials={materials} groundAt={groundAt} />}
    </group>
  );
}

// A small cross of two sticks bound on the ridge, as on houses across the
// Ecuadorian highlands and coast.
function RidgeCross({ materials }) {
  return (
    <group name="RanchoCeiling_Cross" position={[0, R.ridge + 0.12, 0]}>
      <Cyl r={0.022} h={0.6} segments={5} material={materials.pole} position={[0, 0.3, 0]} />
      <Cyl r={0.018} h={0.34} segments={5} material={materials.pole} position={[0, 0.42, 0]} rotation={[0, 0, Math.PI / 2]} />
    </group>
  );
}

// Veranda life: a hammock, maize and a plantain bunch hung from the plate,
// firewood stacked under the eave, a water jar by the door.
function RanchoVeranda({ materials, groundAt }) {
  const vz = frontEave.z - 0.42;
  const plateY = frontSlopeY(vz) - 0.4;
  const produce = useMemo(() => [
    { kind: 'maize', position: [1.5, plateY - 0.05, vz], count: 9, seed: 3 },
    { kind: 'maize', position: [2.15, plateY - 0.05, vz], count: 7, seed: 5 },
    { kind: 'plantain', position: [-1.6, plateY - 0.05, vz], seed: 7 },
  ], [plateY, vz]);
  const ground = groundAt ? groundAt : () => 0;
  return (
    <group>
      <Hammock materials={materials} from={[-2.7, 1.45, vz]} to={[-0.4, 1.45, vz - 0.05]} sag={0.55} />
      <HangingProduce materials={materials} items={produce} />
      <StaticBatch name="Rancho_Veranda">
        {/* Firewood stacked against the south wall under the hip. */}
        {Array.from({ length: 16 }, (_, i) => {
          const row = Math.floor(i / 6);
          const k = i % 6;
          return (
            <Cyl
              key={i}
              r={0.055 + hash(i, 3) * 0.02}
              h={0.9}
              segments={6}
              material={materials.pole}
              position={[-R.halfX - 0.28 - row * 0.02, ground(-R.halfX - 0.3, 0) + 0.06 + row * 0.11, -1.2 + k * 0.14 + row * 0.07]}
              rotation={[Math.PI / 2, 0, 0]}
            />
          );
        })}
        <Beam size={[0.55, 0.12, 1.2]} material={materials.driftwood} position={[R.door.x + 1.5, ground(R.door.x + 1.5, R.halfZ + 0.6) + 0.06, R.halfZ + 0.6]} rotation={[0, 0.1, 0]} />
        <mesh material={materials.clay} position={[R.door.x - 1.0, ground(R.door.x - 1.0, R.halfZ + 0.4) + 0.33, R.halfZ + 0.4]} castShadow>
          <sphereGeometry args={[0.3, 14, 10]} />
        </mesh>
        <mesh material={materials.clayDark} position={[R.door.x - 1.0, ground(R.door.x - 1.0, R.halfZ + 0.4) + 0.62, R.halfZ + 0.4]}>
          <cylinderGeometry args={[0.12, 0.16, 0.08, 12]} />
        </mesh>
        {/* A step stone at the door. */}
        <mesh material={materials.stone} position={[R.door.x, ground(R.door.x, R.halfZ + 0.35) + 0.04, R.halfZ + 0.35]} scale={[0.5, 0.14, 0.3]} castShadow receiveShadow>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      </StaticBatch>
      <Rope points={[[2.75, plateY + 0.2, vz], [2.4, 0.2, vz + 0.6]]} radius={0.008} sag={0.03} material={materials.twine} />
    </group>
  );
}

export const RANCHO_FLOOR = { x: innerX, z: innerZ };
