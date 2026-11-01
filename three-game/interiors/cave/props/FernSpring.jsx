'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  GABRIEL_CAVE_SPRING_ZONE_ID as ZONE,
  GABRIEL_SPRING_POOL as POOL,
  GABRIEL_SPRING_ROPE as ROPE,
  GABRIEL_SPRING_SKYLIGHT as SKY,
} from '../../blueprints/gabrielCave';
import { makeBoulderGeometry } from '../CaveShell';
import { ceilingAt, floorAt, wallAnchor, yawFacing } from './anchors';
import { CavePlants } from './CavePlants';
import { Ball, Beam, Block, Candle, Cask, Cyl, hash, Rope, StaticBatch, useGround } from './primitives';
import { Drips, useWaterMaterial, WaterSurface } from './Water';

// The fern spring: a high chamber whose roof has fallen in. Daylight comes
// through the skylight onto the pool, the fallen blocks and the ferns; roots
// from the forest above hang down through the hole. Gabriel's cistern cask
// and washing stone sit at the dry edge.

// Fallen roof blocks, mossed on top because they sit in the light.
function mossyBoulder(seed) {
  const geometry = makeBoulderGeometry(seed, 2);
  const normal = geometry.attributes.normal;
  const data = geometry.attributes.caveData;
  for (let i = 0; i < data.count; i += 1) {
    const up = Math.max(0, normal.getY(i));
    data.setY(i, 0.35 + (1 - up) * 0.3);
    data.setW(i, Math.min(1.2, up * 1.4));
  }
  return geometry;
}

const MOSSY = [mossyBoulder(29), mossyBoulder(31), mossyBoulder(37)];
const PLAIN = [makeBoulderGeometry(41, 1), makeBoulderGeometry(43, 1)];

const FALLEN_BLOCKS = [
  { x: -0.4, z: -3.9, s: [0.95, 0.6, 0.8], yaw: 0.4, sink: 0.32, g: 0 },
  { x: 2.9, z: -3.2, s: [0.75, 0.55, 0.85], yaw: 1.3, sink: 0.38, g: 1 },
  { x: 3.6, z: -0.9, s: [0.55, 0.45, 0.6], yaw: 2.1, sink: 0.3, g: 2 },
  { x: -1.0, z: -1.0, s: [0.48, 0.32, 0.4], yaw: 0.9, sink: 0.2, g: 1 },
  { x: 0.8, z: -4.6, s: [0.6, 0.4, 0.5], yaw: 2.8, sink: 0.25, g: 2 },
  { x: 2.2, z: -1.6, s: [0.32, 0.24, 0.3], yaw: 0.2, sink: 0.14, g: 0 },
];

// Roots of the forest above, hanging through the skylight.
function rootGeometry() {
  const geometries = [];
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2 + hash(i, 1) * 0.4;
    const rimR = SKY.r * (0.75 + hash(i, 2) * 0.25);
    const x0 = SKY.x + Math.cos(a) * rimR;
    const z0 = SKY.z + Math.sin(a) * rimR;
    const top = SKY.from + 2.2;
    const length = 1.6 + hash(i, 3) * 2.6;
    const points = [];
    for (let k = 0; k <= 6; k += 1) {
      const t = k / 6;
      points.push(new THREE.Vector3(
        x0 - Math.cos(a) * t * 0.35 + Math.sin(t * 5 + i) * 0.06,
        top - t * length,
        z0 - Math.sin(a) * t * 0.35 + Math.cos(t * 4 + i) * 0.06,
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const radius = 0.012 + hash(i, 4) * 0.02;
    const tube = new THREE.TubeGeometry(curve, 14, radius, 5, false);
    // Taper toward the tip.
    const position = tube.attributes.position;
    const v = new THREE.Vector3();
    for (let p = 0; p < position.count; p += 1) {
      const ring = Math.floor(p / 6) / 14;
      const center = curve.getPoint(Math.min(1, ring));
      v.fromBufferAttribute(position, p).sub(center).multiplyScalar(1 - ring * 0.85).add(center);
      position.setXYZ(p, v.x, v.y, v.z);
    }
    tube.computeVertexNormals();
    tube.deleteAttribute('uv');
    geometries.push(tube);
  }
  return geometries;
}

function Roots({ material }) {
  const geometries = useMemo(() => rootGeometry(), []);
  useEffect(() => () => geometries.forEach(geometry => geometry.dispose()), [geometries]);
  return geometries.map((geometry, i) => <mesh key={i} geometry={geometry} material={material} castShadow />);
}

function Shirt({ materials, ...props }) {
  // A linen shirt spread to dry, sleeves hanging over the stone's edge, the
  // patches outnumbering the cloth.
  return (
    <group {...props}>
      <Beam size={[0.5, 0.012, 0.56]} material={materials.linen} tile={0.3} />
      <Beam size={[0.2, 0.02, 0.05]} material={materials.linen} tile={0.3} position={[0, 0.006, 0.29]} />
      {[-1, 1].map(side => (
        <group key={side} position={[side * 0.25, 0, 0.18]} rotation={[0, 0, side * -0.75]}>
          <Beam size={[0.32, 0.012, 0.14]} material={materials.linen} tile={0.3} position={[side * 0.16, 0, 0]} />
        </group>
      ))}
      <group position={[0, 0, -0.28]} rotation={[0.8, 0, 0]}>
        <Beam size={[0.48, 0.012, 0.2]} material={materials.linen} tile={0.3} position={[0, 0, -0.1]} />
      </group>
      {[[-0.12, 0.08, 0.14, 0.12, 'sacking'], [0.14, -0.15, 0.12, 0.16, 'wool'], [0.04, 0.2, 0.09, 0.09, 'paperOld'], [-0.17, -0.18, 0.1, 0.12, 'sacking']].map(([x, z, w, d, key], i) => (
        <Block key={i} size={[w, 0.003, d]} material={materials[key]} position={[x, 0.008, z]} rotation={[0, hash(i, 1) * 0.4, 0]} />
      ))}
    </group>
  );
}

export function FernSpring({ materials, rock }) {
  const ground = useGround(ZONE);
  const drips = useMemo(() => {
    const list = [];
    for (let i = 0; i < 7; i += 1) {
      const a = hash(i, 11) * Math.PI * 2;
      const r = Math.min(SKY.r * 0.92, 0.6 + hash(i, 12) * 1.7);
      const x = POOL.x + Math.cos(a) * r * 0.9;
      const z = POOL.z + Math.sin(a) * r * 0.65;
      // Drips from the skylight lip fall the full height; others from the roof.
      const top = Math.min(ceilingAt(ZONE, x, z), SKY.from + 0.4) - 0.04;
      list.push({ x, z, top, bottom: POOL.surfaceY, period: 1.6 + hash(i, 13) * 3.2, offset: hash(i, 14), strength: 0.8 + hash(i, 15) * 0.4 });
    }
    return list;
  }, []);
  const poolWater = useWaterMaterial({ color: '#0f1a18', opacity: 0.62, drips });
  const cistern = [4.3, 2.7];
  const cisternBase = ground(cistern[0], cistern[1]);
  const cache = useMemo(() => wallAnchor(ZONE, -4.6, 1.1, -3.8, [-0.78, -0.62]), []);
  const plants = useMemo(() => {
    const list = [];
    // Ferns crowd the lit rim of the pool and the tops of the fallen blocks.
    for (let i = 0; i < 22; i += 1) {
      const a = (i / 22) * Math.PI * 2 + hash(i, 21) * 0.25;
      const r = 1.05 + hash(i, 22) * 0.55;
      const x = POOL.x + Math.cos(a) * POOL.rx * r * 0.95;
      const z = POOL.z + Math.sin(a) * POOL.rz * r;
      // Stay out of Gabriel's working edge by the washing stone.
      if (Math.hypot(x + 1.9, z - 0.9) < 1.1) continue;
      list.push({ assetId: 'resurrectionfern', x, z, yaw: hash(i, 23) * 6.28, scale: 0.8 + hash(i, 24) * 0.9 });
    }
    for (const block of FALLEN_BLOCKS.slice(0, 3)) {
      const y = floorAt(ZONE, block.x, block.z) - block.sink + block.s[1] * 0.78;
      list.push({ assetId: 'resurrectionfern', x: block.x + 0.1, z: block.z - 0.05, y, yaw: block.yaw, scale: 0.7 });
    }
    return list;
  }, []);
  return (
    <>
      <StaticBatch name="FernSpringFurnishings">
        {FALLEN_BLOCKS.map((block, i) => (
          <mesh
            key={i}
            geometry={MOSSY[block.g]}
            material={rock}
            position={[block.x, floorAt(ZONE, block.x, block.z) - block.sink + block.s[1] * 0.35, block.z]}
            rotation={[hash(i, 1) * 0.3, block.yaw, hash(i, 2) * 0.2]}
            scale={block.s}
            castShadow
            receiveShadow
          />
        ))}
        {/* The washing stone at the water's edge, with the shirt on it. */}
        <mesh geometry={PLAIN[0]} material={rock} position={[-1.9, ground(-1.9, 0.9) + 0.12, 0.9]} rotation={[0, 0.3, 0]} scale={[0.72, 0.36, 0.5]} castShadow receiveShadow />
        <Shirt materials={materials} position={[-1.9, ground(-1.9, 0.9) + 0.12 + 0.36 * 0.8, 0.9]} rotation={[0.03, 0.3, -0.02]} />
        {/* Cistern cask, lidded, with a split-cane gutter from a wall seep. */}
        <Cask height={1.04} radius={0.46} material={materials.crateWood} hoop={materials.iron} position={[cistern[0], cisternBase, cistern[1]]} />
        <Cyl r={0.4} h={0.03} segments={18} material={materials.timber} position={[cistern[0], cisternBase + 1.05, cistern[1]]} />
        <group position={[cistern[0] + 0.55, cisternBase + 1.25, cistern[1] - 0.15]} rotation={[0, -0.25, 0.22]}>
          <mesh material={materials.timberRound} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 1.3, 8, 1, true, 0, Math.PI]} />
          </mesh>
        </group>
        {/* The cache: a loose block not quite flush with the wall. */}
        {cache && (
          <group position={cache.position} rotation={[0, yawFacing(cache.normal), 0]}>
            <mesh geometry={PLAIN[1]} material={rock} position={[0.02, 0, 0.02]} rotation={[0.2, 0.3, 0.1]} scale={[0.26, 0.2, 0.18]} castShadow receiveShadow />
            <Ball r={0.03} material={materials.oilcloth} scale={[1.6, 0.6, 1]} position={[0.2, -0.16, 0.05]} />
          </group>
        )}
        <Roots material={materials.bark} />
        {/* The knotted rope down from the highland stake, its tail coiled. */}
        <Rope points={[[ROPE.rim[0], SKY.from + 2.4, ROPE.rim[1]], [ROPE.rim[0] - 0.1, SKY.from - 0.2, ROPE.rim[1] - 0.05], [ROPE.foot[0], ground(ROPE.foot[0], ROPE.foot[1]) + 0.3, ROPE.foot[1]]]} sag={0} radius={0.022} material={materials.rope} />
        {[0.9, 1.5, 2.1, 2.7, 3.3, 3.9].map(height => (
          <Ball key={height} r={0.045} material={materials.rope} scale={[1, 1.3, 1]} position={[ROPE.rim[0] - 0.1 + (ROPE.foot[0] - ROPE.rim[0] + 0.1) * (1 - height / (SKY.from - 0.2)), ground(ROPE.foot[0], ROPE.foot[1]) + height, ROPE.rim[1] - 0.05 + (ROPE.foot[1] - ROPE.rim[1] + 0.05) * (1 - height / (SKY.from - 0.2))]} />
        ))}
        {[0, 1, 2].map(turn => (
          <mesh key={turn} material={materials.rope} position={[ROPE.foot[0] - 0.15, ground(ROPE.foot[0], ROPE.foot[1]) + 0.025 + turn * 0.035, ROPE.foot[1] - 0.1]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.2 - turn * 0.035, 0.02, 5, 18]} />
          </mesh>
        ))}
      </StaticBatch>
      <WaterSurface outline={POOL.outline} y={POOL.surfaceY} material={poolWater} grow={0.4} name="Spring_PoolWater" />
      <Drips drips={drips} waterMaterials={[poolWater]} />
      <Candle materials={materials} position={[cistern[0] - 0.12, cisternBase + 1.065, cistern[1] - 0.1]} />
      <CavePlants zoneId={ZONE} placements={plants} />
    </>
  );
}
