'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { GABRIEL_CAVE_MOUTH_ZONE_ID as ZONE } from '../../blueprints/gabrielCave';
import { apronSurfaceY } from '../../InteriorExteriorApron';
import { getInteriorDefinition } from '../../interiorRegistry';
import { makeBoulderGeometry } from '../CaveShell';
import { ceilingAt, wallAnchor, yawFacing } from './anchors';
import { CavePlants } from './CavePlants';
import { Ball, Beam, Block, Cask, Cyl, hash, Lantern, Rope, ropePoint, StaticBatch, useGround } from './primitives';
import { Drips, useWaterMaterial, WaterSurface } from './Water';

// The mouth gallery: the breastwork Gabriel watches the clearing from, the
// breakdown blocks inside the entrance, his firewood and rain cask, the shell
// alarm cord, and the lantern that marks the fork.

const boulders = [makeBoulderGeometry(2, 2), makeBoulderGeometry(9, 2), makeBoulderGeometry(19, 1), makeBoulderGeometry(23, 1)];

const BARREL = [3.55, -2.2];

function Breastwork({ ground, rock }) {
  // Dry-stone courses along the 'lookout-parapet' collider: big footing
  // stones, smaller packed stones above, flat capstones worn by elbows.
  const stones = useMemo(() => {
    const list = [];
    const yaw = 0.06;
    const cx = -2.05;
    const cz = 3.5;
    const courses = [
      { y: 0.2, size: 0.3, faces: 2 },
      { y: 0.52, size: 0.24, faces: 2 },
      { y: 0.8, size: 0.2, faces: 2 },
      { y: 1.0, size: 0.26, faces: 1, cap: true },
    ];
    let index = 0;
    courses.forEach((course, c) => {
      let along = -1.95 + hash(c, 9) * 0.2;
      while (along < 1.9) {
        index += 1;
        const width = course.size * (0.9 + hash(index, 1) * 1.1);
        const centre = along + width / 2;
        for (let f = 0; f < course.faces; f += 1) {
          const side = course.faces === 1 ? 0 : (f === 0 ? -0.18 : 0.18);
          const jitter = (hash(index * 3 + f, 2) - 0.5) * 0.08;
          list.push({
            x: cx + Math.cos(yaw) * centre + Math.sin(yaw) * (side + jitter),
            z: cz - Math.sin(yaw) * centre + Math.cos(yaw) * (side + jitter),
            y: course.y + (hash(index, 4 + f) - 0.5) * 0.06,
            sx: width * 0.6,
            sy: course.cap ? course.size * 0.32 : course.size * (0.7 + hash(index, 6 + f) * 0.35),
            sz: course.cap ? 0.34 : course.size * (0.75 + hash(index, 8 + f) * 0.3),
            yaw: yaw + (hash(index, 3 + f) - 0.5) * 0.7,
            roll: (hash(index, 10 + f) - 0.5) * 0.25,
            g: (index + f) % 4,
          });
        }
        along += width * (0.92 + hash(index, 11) * 0.12);
      }
    });
    return list;
  }, []);
  return stones.map((stone, i) => (
    <mesh
      key={i}
      geometry={boulders[stone.g]}
      material={rock}
      position={[stone.x, ground(stone.x, stone.z) + stone.y, stone.z]}
      rotation={[stone.roll, stone.yaw, stone.roll * 0.5]}
      scale={[stone.sx, stone.sy, stone.sz]}
      castShadow
      receiveShadow
    />
  ));
}

function Woodpile({ materials, ...props }) {
  // Split palo santo and scalesia, stacked lengthwise along z.
  const logs = [];
  let index = 0;
  for (let row = 0; row < 5; row += 1) {
    const count = 6 - row;
    for (let i = 0; i < count; i += 1) {
      index += 1;
      const r = 0.06 + hash(index, 1) * 0.03;
      logs.push({ x: -0.42 + row * 0.08 + i * 0.165, y: 0.07 + row * 0.15, z: (hash(index, 2) - 0.5) * 0.15, r, length: 1.25 + hash(index, 3) * 0.35, pale: hash(index, 4) > 0.55 });
    }
  }
  return (
    <group {...props}>
      {logs.map((log, i) => (
        <group key={i} position={[log.x, log.y, log.z]} rotation={[Math.PI / 2, 0, (hash(i, 5) - 0.5) * 0.12]}>
          <Cyl r={log.r} h={log.length} segments={7} material={log.pale ? materials.timberRound : materials.bark} />
          <Cyl r={log.r * 0.92} h={log.length + 0.01} segments={7} material={materials.logEnd} />
        </group>
      ))}
      {/* Kindling in a split-cane basket. */}
      <Cyl rTop={0.2} rBottom={0.16} h={0.3} segments={12} material={materials.straw} position={[0.2, 0.15, 1.0]} open />
      {Array.from({ length: 8 }, (_, i) => (
        <Cyl key={i} r={0.012} h={0.42} segments={4} material={materials.bark} position={[0.2 + (hash(i, 7) - 0.5) * 0.18, 0.3, 1.0 + (hash(i, 8) - 0.5) * 0.18]} rotation={[(hash(i, 9) - 0.5) * 0.5, 0, (hash(i, 10) - 0.5) * 0.5]} />
      ))}
      <Block size={[0.16, 0.12, 0.06]} material={materials.iron} position={[0.7, 0.05, 0.6]} rotation={[0, 0.4, 0.2]} />
      <Cyl r={0.018} h={0.7} segments={6} material={materials.timberRound} position={[0.72, 0.36, 0.6]} rotation={[0.1, 0, 0.18]} />
    </group>
  );
}

function GoatSkull({ materials, ...props }) {
  const horn = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      // Sweeps back and out like a feral billy's.
      points.push(new THREE.Vector3(t * 0.08, Math.sin(t * 1.4) * 0.18, -t * 0.26 - t * t * 0.08));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 16, 0.028, 6, false);
    const position = geometry.attributes.position;
    // Taper toward the tip.
    for (let i = 0; i < position.count; i += 1) {
      const segment = Math.floor(i / 7) / 16;
      const point = curve.getPoint(Math.min(1, segment));
      const v = new THREE.Vector3().fromBufferAttribute(position, i).sub(point).multiplyScalar(1 - segment * 0.8).add(point);
      position.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  return (
    <group {...props}>
      <Ball r={0.09} material={materials.bone} scale={[0.85, 0.8, 1.1]} position={[0, 0.08, 0]} />
      <mesh material={materials.bone} position={[0, 0.05, 0.14]} rotation={[Math.PI / 2 + 0.35, 0, 0]} scale={[1, 1, 0.75]} castShadow>
        <cylinderGeometry args={[0.04, 0.065, 0.2, 8]} />
      </mesh>
      {[-1, 1].map(side => (
        <group key={side}>
          <Ball r={0.022} material={materials.charcoal} position={[side * 0.06, 0.1, 0.06]} />
          <mesh geometry={horn} material={materials.horn} position={[side * 0.04, 0.14, 0.02]} scale={[side, 1, 1]} castShadow />
        </group>
      ))}
      <Block size={[0.07, 0.02, 0.12]} material={materials.bone} position={[0, 0.0, 0.12]} />
    </group>
  );
}

// Rocky Clearing seen through the mouth: scrub, ferns and basalt rubble set
// down on the exterior apron so the view out is not bare ground.
const OUTSIDE_KINDS = ['scalesiavillosa', 'crotonscouleri', 'galapagoscotton', 'dryGrassPatch', 'dryGrassPatch', 'resurrectionfern', 'darwiniothamnusShrub'];
const OUTSIDE_SCALES = { scalesiavillosa: 1.3, crotonscouleri: 1.4, galapagoscotton: 1.2, dryGrassPatch: 2.0, resurrectionfern: 1.5, darwiniothamnusShrub: 1.3 };

function buildOutsideDressing() {
  const apron = getInteriorDefinition(ZONE)?.exteriorApron;
  const plants = [];
  const rocks = [];
  if (!apron) return { plants, rocks };
  for (let i = 0; i < 120; i += 1) {
    const x = -18 + hash(i, 61) * 36;
    const z = 13.4 + hash(i, 62) ** 1.2 * 26;
    // Keep the path out of the mouth clear.
    if (Math.abs(x - 0.4) < 2.2 + (z - 13) * 0.08) continue;
    const y = apronSurfaceY(apron, x, z);
    if (hash(i, 63) < 0.3) {
      rocks.push({ x, y, z, s: 0.25 + hash(i, 64) ** 2 * 0.9, yaw: hash(i, 65) * 6.28, g: i % 4 });
      continue;
    }
    const assetId = OUTSIDE_KINDS[i % OUTSIDE_KINDS.length];
    plants.push({ assetId, x, z, y, yaw: hash(i, 66) * 6.28, scale: (OUTSIDE_SCALES[assetId] || 1) * (0.7 + hash(i, 67) * 0.6) });
  }
  return { plants, rocks };
}

export function MouthGallery({ materials, rock }) {
  const ground = useGround(ZONE);
  const layout = useMemo(() => {
    // The alarm cord: wall to wall across the tube at shin height.
    const cordY = 0.32;
    const west = wallAnchor(ZONE, 0.2, cordY + 0.1, 7.6, [-1, 0]);
    const east = wallAnchor(ZONE, 0.2, cordY + 0.1, 7.6, [1, 0]);
    const skull = wallAnchor(ZONE, 3.6, 1.35, 2.4, [1, 0.1]);
    const barrelCeiling = ceilingAt(ZONE, BARREL[0], BARREL[1]);
    return { west, east, skull, barrelCeiling };
  }, []);
  const cord = useMemo(() => {
    if (!layout.west || !layout.east) return null;
    const a = [layout.west.position[0] + 0.05, layout.west.position[1] - 0.1, layout.west.position[2]];
    const b = [layout.east.position[0] - 0.05, layout.east.position[1] - 0.1, layout.east.position[2]];
    return { a, b };
  }, [layout]);

  const barrelBase = ground(BARREL[0], BARREL[1]);
  const barrelWaterY = barrelBase + 0.62;
  const drips = useMemo(() => [
    { x: BARREL[0] + 0.05, z: BARREL[1] - 0.04, top: layout.barrelCeiling - 0.03, bottom: barrelWaterY, period: 2.7, offset: 0, strength: 1 },
  ], [barrelWaterY, layout.barrelCeiling]);
  const caskWater = useWaterMaterial({ color: '#141b1a', opacity: 0.86, drips });
  const caskOutline = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return [BARREL[0] + Math.cos(a) * 0.29, BARREL[1] + Math.sin(a) * 0.29];
  }), []);

  const plants = useMemo(() => [
    { assetId: 'resurrectionfern', x: -3.9, z: 11.8, yaw: 0.4, scale: 1.2 },
    { assetId: 'resurrectionfern', x: -3.4, z: 12.3, yaw: 2.2, scale: 0.9 },
    { assetId: 'resurrectionfern', x: 4.1, z: 11.6, yaw: 1.1, scale: 1.1 },
    { assetId: 'resurrectionfern', x: 3.6, z: 12.4, yaw: 4.0, scale: 1.3 },
    { assetId: 'resurrectionfern', x: -1.6, z: 11.2, yaw: 3.0, scale: 0.7 },
    { assetId: 'resurrectionfern', x: 2.2, z: 10.8, yaw: 5.1, scale: 0.75 },
    { assetId: 'dryGrassPatch', x: -2.6, z: 12.4, yaw: 0.3, scale: 1.4 },
    { assetId: 'dryGrassPatch', x: 1.6, z: 12.6, yaw: 1.9, scale: 1.2 },
    { assetId: 'dryGrassPatch', x: 0.2, z: 12.1, yaw: 4.4, scale: 1.0 },
  ], []);

  const outside = useMemo(() => buildOutsideDressing(), []);

  const lanternPost = [0.25, -6.45];
  const postBase = ground(lanternPost[0], lanternPost[1]);
  return (
    <>
      <StaticBatch name="MouthGalleryFurnishings">
        <Breastwork ground={ground} rock={rock} />
        {/* Breakdown blocks within the 'breakdown-west/east' colliders. */}
        <mesh geometry={boulders[0]} material={rock} position={[-2.7, ground(-2.7, 10.3) + 0.3, 10.3]} rotation={[0.1, 0.4, 0.05]} scale={[0.95, 0.9, 0.78]} castShadow receiveShadow />
        <mesh geometry={boulders[1]} material={rock} position={[3.3, ground(3.3, 9.9) + 0.2, 9.9]} rotation={[0, -0.3, -0.08]} scale={[0.72, 0.68, 0.62]} castShadow receiveShadow />
        <mesh geometry={boulders[2]} material={rock} position={[-1.9, ground(-1.9, 9.3) + 0.08, 9.3]} rotation={[0, 1.2, 0]} scale={[0.3, 0.25, 0.28]} castShadow receiveShadow />
        <mesh geometry={boulders[3]} material={rock} position={[2.5, ground(2.5, 10.9) + 0.06, 10.9]} rotation={[0, 2.2, 0]} scale={[0.26, 0.2, 0.3]} castShadow receiveShadow />
        <Woodpile materials={materials} position={[-4.75, ground(-4.75, 6.5), 6.5]} rotation={[0, 0.12, 0]} />
        {/* Ship's cask under the seep, with a tin cup on a nail. */}
        <Cask height={0.9} radius={0.33} material={materials.crateWood} hoop={materials.iron} open position={[BARREL[0], barrelBase, BARREL[1]]} />
        <group position={[BARREL[0] + 0.3, barrelBase + 0.82, BARREL[1] + 0.06]}>
          <Cyl r={0.004} h={0.06} segments={4} material={materials.iron} rotation={[0, 0, Math.PI / 2]} />
          <Cyl rTop={0.04} rBottom={0.034} h={0.08} segments={12} material={materials.tin} position={[0.05, -0.06, 0]} open />
          <mesh material={materials.tin} position={[0.012, -0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.02, 0.004, 4, 10, Math.PI]} />
          </mesh>
        </group>
        {/* The shell alarm cord. */}
        {cord && <Rope points={[cord.a, cord.b]} sag={0.03} radius={0.006} material={materials.twine} />}
        {cord && Array.from({ length: 11 }, (_, i) => {
          const t = (i + 0.5) / 11;
          const p = ropePoint(cord.a, cord.b, t, 0.03);
          return (
            <group key={i} position={[p[0], p[1] - 0.06, p[2]]} rotation={[hash(i, 1) * 0.6, hash(i, 2) * 6, hash(i, 3) * 0.4]}>
              <Cyl r={0.002} h={0.05} segments={3} material={materials.twine} position={[0, 0.03, 0]} />
              <mesh material={materials.shell} castShadow>
                <coneGeometry args={[0.035, 0.022, 9]} />
              </mesh>
            </group>
          );
        })}
        {/* Lantern post at the fork: a staff in a cairn with an arm. */}
        <group position={[lanternPost[0] - 0.35, postBase, lanternPost[1]]}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <mesh key={i} geometry={boulders[i % 4]} material={rock} position={[Math.cos(i) * 0.18, 0.08 + (i > 3 ? 0.14 : 0), Math.sin(i) * 0.18]} scale={[0.14, 0.11, 0.12]} castShadow receiveShadow />
          ))}
          <Cyl r={0.035} rTop={0.028} h={2.6} segments={7} material={materials.timberRound} position={[0, 1.3, 0]} />
          <Beam size={[0.5, 0.05, 0.05]} material={materials.timber} position={[0.2, 2.5, 0]} />
          <Cyl r={0.004} h={0.17} segments={3} material={materials.iron} position={[0.35, 2.4, 0]} />
        </group>
        {/* Goat skull on its ledge, facing the entrance. */}
        {layout.skull && (
          <group position={layout.skull.position} rotation={[0, yawFacing(layout.skull.normal), 0]}>
            <mesh geometry={boulders[2]} material={rock} position={[0, -0.06, 0.08]} scale={[0.32, 0.08, 0.2]} castShadow receiveShadow />
            <GoatSkull materials={materials} position={[0, 0.0, 0.14]} rotation={[0, Math.PI / 2 - 0.2, 0]} />
          </group>
        )}
        {outside.rocks.map((rock_, i) => (
          <mesh key={`out${i}`} geometry={boulders[rock_.g]} material={rock} position={[rock_.x, rock_.y + rock_.s * 0.2, rock_.z]} rotation={[0, rock_.yaw, 0]} scale={[rock_.s * 1.2, rock_.s * 0.8, rock_.s]} castShadow receiveShadow />
        ))}
        {/* Scattered bones and a broken crock near the woodpile. */}
        <Cyl r={0.012} h={0.2} segments={5} material={materials.bone} position={[-3.8, ground(-3.8, 5.3) + 0.012, 5.3]} rotation={[Math.PI / 2, 0.8, 0]} />
        <Block size={[0.12, 0.05, 0.08]} material={materials.clay} position={[-4.1, ground(-4.1, 4.8) + 0.02, 4.8]} rotation={[0.3, 0.5, 0.2]} />
      </StaticBatch>
      <WaterSurface outline={caskOutline} y={barrelWaterY} material={caskWater} grow={0} name="Mouth_CaskWater" />
      <Drips drips={drips} waterMaterials={[caskWater]} />
      <Lantern materials={materials} position={[lanternPost[0], postBase + 2.08, lanternPost[1]]} />
      <CavePlants zoneId={ZONE} placements={plants} />
      <CavePlants zoneId={ZONE} placements={outside.plants} />
    </>
  );
}
