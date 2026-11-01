'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  GABRIEL_CAVE_SEA_ZONE_ID as ZONE,
  GABRIEL_SEA_KEGS as KEGS,
  GABRIEL_SEA_TIDE_POOL as POOL,
} from '../../blueprints/gabrielCave';
import { getInteriorDefinition } from '../../interiorRegistry';
import { WATER_LEVEL } from '../../../world/terrainShared';
import { terrainRenderSample } from '../../../world/terrain';
import { makeBoulderGeometry } from '../CaveShell';
import { wallAnchor, yawFacing } from './anchors';
import { Beam, Block, Candle, Cask, hash, Lantern, StaticBatch, useGround } from './primitives';
import { useWaterMaterial, WaterSurface } from './Water';

// The sea gallery: eleven water kegs in a row on the landing, a twelfth set
// apart on its side, a ship's rope ladder coiled for carrying, a slate of
// tide reckonings, the dark lantern that looks down the tube to the sea, and
// the side branch where the tide comes up into the rock. Collision for the
// kegs and the ladder is in the blueprint's fixedColliders.

const SHORE_STONES = [makeBoulderGeometry(53, 1), makeBoulderGeometry(59, 2)];
const NO_DRIPS = [];

function useChalk() {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#dedbd0', roughness: 1, metalness: 0, name: 'SeaChalk' }), []);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

// Cold horn for the dark lantern: nobody has lit it since it was last used.
function useColdHorn() {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ name: 'SeaLanternHornCold', color: '#7d6a4c', roughness: 0.7, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function KegRow({ materials, chalk, ground }) {
  // Two ranks inside the 'water-kegs' collider (1.3 × 2.9), heads chalked.
  const kegs = useMemo(() => {
    const list = [];
    for (let i = 0; i < 6; i += 1) list.push([-0.3, -1.2 + i * 0.48]);
    for (let i = 0; i < 5; i += 1) list.push([0.32, -0.96 + i * 0.48]);
    return list;
  }, []);
  const cos = Math.cos(KEGS.yaw);
  const sin = Math.sin(KEGS.yaw);
  return kegs.map(([lx, lz], i) => {
    const x = KEGS.x + lx * cos + lz * sin;
    const z = KEGS.z - lx * sin + lz * cos;
    const base = ground(x, z);
    return (
      <group key={i} position={[x, base, z]} rotation={[0, KEGS.yaw + hash(i, 3) * 0.5, 0]}>
        <Cask height={0.62} radius={0.235} material={materials.crateWood} hoop={materials.iron} />
        {/* Initials chalked on the head. */}
        <Block size={[0.11, 0.004, 0.035]} material={chalk} position={[-0.03, 0.605, -0.02]} rotation={[0, 0.2, 0]} />
        <Block size={[0.08, 0.004, 0.03]} material={chalk} position={[0.05, 0.605, 0.04]} rotation={[0, -0.3, 0]} />
      </group>
    );
  });
}

function RopeLadder({ materials, ground }) {
  // Coiled tarred rope with oak rungs stacked through the coil.
  const x = 2.3;
  const z = -0.9;
  const base = ground(x, z);
  return (
    <group position={[x, base, z]}>
      {[0, 1, 2, 3, 4].map(turn => (
        <mesh key={turn} material={materials.rope} position={[0, 0.03 + turn * 0.045, 0]} rotation={[-Math.PI / 2, 0, turn * 0.4]} castShadow>
          <torusGeometry args={[0.36 - turn * 0.012, 0.022, 5, 22]} />
        </mesh>
      ))}
      {[-0.12, 0, 0.12].map((offset, i) => (
        <Beam key={i} size={[0.78, 0.035, 0.05]} material={materials.timber} tile={0.4} position={[0, 0.24 + i * 0.04, offset]} rotation={[0, 0.1 * i, 0]} />
      ))}
    </group>
  );
}

function useSeaPlane() {
  // The cove beyond the mouth, at sea level as the exterior apron maps it.
  return useMemo(() => {
    const apron = getInteriorDefinition(ZONE)?.exteriorApron;
    if (!apron) return null;
    const anchor = terrainRenderSample(apron.sourceAnchor[0], apron.sourceAnchor[1], apron.sourceRegionId);
    return (apron.baseY ?? -0.12) + (WATER_LEVEL - anchor.height) * (apron.reliefScale ?? 0.28);
  }, []);
}

export function SeaGallery({ materials, rock }) {
  const ground = useGround(ZONE);
  const chalk = useChalk();
  const coldHorn = useColdHorn();
  const lanternMaterials = useMemo(() => ({ ...materials, hornPane: coldHorn }), [coldHorn, materials]);
  const tideWater = useWaterMaterial({ color: '#0c1d1f', opacity: 0.74, drips: NO_DRIPS });
  const seaWater = useWaterMaterial({ color: '#3d5f66', opacity: 0.9, drips: NO_DRIPS });
  const seaY = useSeaPlane();
  const slate = useMemo(() => wallAnchor(ZONE, 3.0, 1.2, -4.3, [0.25, -1]), []);
  const niche = useMemo(() => wallAnchor(ZONE, 0.6, 1.15, 4.4, [1, 0]), []);
  // Short chalk strokes in rows, read from across the landing as writing.
  const slateWriting = useMemo(() => {
    const strokes = [];
    for (let row = 0; row < 7; row += 1) {
      let x = -0.25 + (row === 0 ? 0.12 : 0);
      const end = row === 0 ? 0.05 : 0.2 + hash(row, 7) * 0.06;
      let k = 0;
      while (x < end) {
        const w = 0.02 + hash(row * 13 + k, 8) * 0.05;
        strokes.push({ x: x + w / 2, y: 0.17 - row * 0.05, w, tilt: (hash(row * 13 + k, 9) - 0.5) * 0.25 });
        x += w + 0.012 + hash(row * 13 + k, 10) * 0.02;
        k += 1;
      }
    }
    return strokes;
  }, []);
  const twelfth = [-0.9, -0.2];
  const ledge = [2.85, -3.85];
  const ledgeTop = ground(ledge[0], ledge[1]) + 0.4;
  const twelfthBase = ground(twelfth[0], twelfth[1]);
  // Shore wrack on the rim of the tide branch: a line of stones and weed.
  const wrack = useMemo(() => {
    const list = [];
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2 + hash(i, 41) * 0.3;
      const x = POOL.x + Math.cos(a) * 2.35;
      const z = POOL.z + Math.sin(a) * 1.65;
      list.push({ x, z, s: 0.12 + hash(i, 42) * 0.18, yaw: hash(i, 43) * 6.28, g: i % 2 });
    }
    return list;
  }, []);
  return (
    <>
      <StaticBatch name="SeaGalleryFurnishings">
        <KegRow materials={materials} chalk={chalk} ground={ground} />
        {/* The twelfth keg, apart, on its side, the initials scored out. */}
        <group position={[twelfth[0], twelfthBase + 0.235, twelfth[1]]} rotation={[0, 0.6, Math.PI / 2]}>
          <group position={[0, -0.31, 0]}>
            <Cask height={0.62} radius={0.235} material={materials.crateWood} hoop={materials.iron} />
          </group>
        </group>
        <RopeLadder materials={materials} ground={ground} />
        {slate && (
          <group position={slate.position} rotation={[0, yawFacing(slate.normal), 0]}>
            {/* Propped, leaning back against the rock. */}
            <group position={[0, 0, 0.12]} rotation={[-0.16, 0, 0.03]}>
              <Block size={[0.62, 0.44, 0.03]} material={materials.slate} />
              {slateWriting.map((stroke, i) => (
                <Block key={i} size={[stroke.w, 0.007, 0.003]} material={chalk} position={[stroke.x, stroke.y, 0.017]} rotation={[0, 0, stroke.tilt]} />
              ))}
            </group>
          </group>
        )}
        {/* A stone under the slate, with a candle stub on it. */}
        <mesh geometry={SHORE_STONES[1]} material={rock} position={[ledge[0], ledgeTop - 0.22, ledge[1]]} scale={[0.34, 0.24, 0.3]} castShadow receiveShadow />
        {wrack.map((stone, i) => (
          <mesh
            key={i}
            geometry={SHORE_STONES[stone.g]}
            material={rock}
            position={[stone.x, POOL.surfaceY + 0.05, stone.z]}
            rotation={[0, stone.yaw, 0]}
            scale={[stone.s * 1.4, stone.s, stone.s * 1.1]}
            castShadow
            receiveShadow
          />
        ))}
      </StaticBatch>
      {niche && (
        <Lantern
          materials={lanternMaterials}
          lit={false}
          size={1.2}
          position={[niche.position[0] + niche.normal[0] * 0.12, niche.position[1] - 0.12, niche.position[2] + niche.normal[2] * 0.12]}
        />
      )}
      <Candle materials={materials} position={[ledge[0], ledgeTop, ledge[1]]} />
      <WaterSurface outline={POOL.outline} y={POOL.surfaceY} material={tideWater} grow={0.4} name="Sea_TidePool" />
      {seaY !== null && (
        <mesh material={seaWater} position={[0, seaY, 70]} rotation={[-Math.PI / 2, 0, 0]} name="Sea_CoveBeyondMouth">
          <planeGeometry args={[160, 110]} />
        </mesh>
      )}
    </>
  );
}
