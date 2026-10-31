'use client';

import React, { useMemo } from 'react';
import { useThreeGameStore } from '../../store';
import { catalogToInspectable } from '../../world/inspectables';
import { Beam, Cask, Cyl, hash, Lathe, StaticBatch } from '../cave/props/primitives';
import { mergeAll, moundGeometry, poleGeometry, seeded } from './hutGeometry';
import { deadStalksGeometry, tomatoPlantGeometry } from './hutFlora';
import { useDisposable } from './useDisposable';

// The yard beside the whalers' hut: four driftwood-edged seedbeds (two with
// stunted tomatoes, one of dead stalks, one bare), a stick fence half down,
// a cracked try-pot set up to catch rain, and the carapaces of tortoises
// eaten ashore. Positions are in the hut's local frame (door wall = +z).

export const WHALERS_YARD = {
  garden: { x: -7.6, z: -0.6, yaw: 0.06 },
  tryPot: { x: 5.0, z: 2.2 },
  carapaces: { x: 4.75, z: -1.3 },
};

const BEDS = [
  { x: -1.35, z: -0.85, kind: 'tomato', seed: 3 },
  { x: 1.35, z: -0.85, kind: 'tomato', seed: 5 },
  { x: -1.35, z: 0.85, kind: 'dead', seed: 7 },
  { x: 1.35, z: 0.85, kind: 'bare', seed: 9 },
];
const BED = { w: 2.3, d: 1.0 };

function inspect(catalogId, sourceId) {
  return event => {
    event.stopPropagation();
    useThreeGameStore.getState().setInspectedObject?.(catalogToInspectable(catalogId, event.point, { sourceId }));
  };
}

function Seedbed({ materials, bed, ground }) {
  const soil = useDisposable(() => moundGeometry({ rx: BED.w / 2 - 0.05, rz: BED.d / 2 - 0.05, height: 0.16, flat: 0.55, seed: bed.seed, sink: 0.02, rings: 6, sectors: 20 }), [bed.seed]);
  const plants = useMemo(() => {
    if (bed.kind === 'bare') return [];
    const rand = seeded(bed.seed + 1);
    const list = [];
    for (let row = 0; row < 2; row += 1) {
      for (let i = 0; i < 4; i += 1) {
        if (rand() < 0.25) continue;
        list.push({
          x: -0.8 + i * 0.53 + (rand() - 0.5) * 0.12,
          z: (row - 0.5) * 0.45 + (rand() - 0.5) * 0.08,
          seed: bed.seed * 31 + row * 7 + i,
          scale: 0.7 + rand() * 0.5,
          yaw: rand() * Math.PI * 2,
        });
      }
    }
    return list;
  }, [bed.kind, bed.seed]);
  return (
    <group position={[bed.x, ground, bed.z]}>
      <mesh geometry={soil} material={materials.loam} receiveShadow />
      {/* Driftwood edging, one board sprung loose. */}
      {[-1, 1].map(s => (
        <Beam key={`l${s}`} size={[BED.w, 0.16, 0.05]} material={materials.driftwood} tile={1.4} position={[0, 0.05, s * BED.d / 2]} rotation={[s * 0.08, 0, 0]} />
      ))}
      <Beam size={[0.05, 0.16, BED.d]} material={materials.driftwood} tile={1.4} position={[-BED.w / 2, 0.05, 0]} />
      <Beam size={[0.05, 0.14, BED.d * 0.9]} material={materials.driftwood} tile={1.4} position={[BED.w / 2 + 0.12, 0.03, 0.05]} rotation={[0, 0.35, 1.2]} />
      {plants.map(plant => (
        <PlantInBed key={plant.seed} materials={materials} plant={plant} kind={bed.kind} />
      ))}
    </group>
  );
}

function PlantInBed({ materials, plant, kind }) {
  const geometry = useDisposable(
    () => (kind === 'tomato'
      ? tomatoPlantGeometry(plant.seed, { height: 0.38, fruit: 7, vigour: 0.85 })
      : { stalks: deadStalksGeometry(plant.seed, { count: 5, height: 0.42 }) }),
    [kind, plant.seed],
  );
  return (
    <group position={[plant.x, 0.12, plant.z]} rotation={[0, plant.yaw, 0]} scale={plant.scale}>
      {kind === 'tomato' ? (
        <>
          <mesh geometry={geometry.stems} material={materials.leaf} castShadow />
          <mesh geometry={geometry.leaves} material={materials.leaf} castShadow />
          <mesh geometry={geometry.fruit} material={materials.tomatoFruit} />
        </>
      ) : (
        <mesh geometry={geometry.stalks} material={materials.leafDry} castShadow />
      )}
    </group>
  );
}

// A fence of driftwood stakes and two rails, half of it down.
function Fence({ materials, groundAt, origin, yaw }) {
  const geometry = useDisposable(() => {
    const rand = seeded(61);
    const halfW = 3.4;
    const halfD = 2.3;
    const corners = [[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]];
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const local = (x, z) => [origin.x + x * cos + z * sin, origin.z - x * sin + z * cos];
    const parts = [];
    for (let s = 0; s < 4; s += 1) {
      const [ax, az] = corners[s];
      const [bx, bz] = corners[(s + 1) % 4];
      const length = Math.hypot(bx - ax, bz - az);
      const count = Math.round(length / 0.75);
      let previous = null;
      for (let i = 0; i <= count; i += 1) {
        const t = i / count;
        // Leave a gate gap on the side toward the hut.
        if (s === 1 && t > 0.35 && t < 0.62) { previous = null; continue; }
        const [x, z] = local(ax + (bx - ax) * t, az + (bz - az) * t);
        const y = groundAt(x, z);
        const down = (s === 3 && t > 0.2) || rand() < 0.12;
        const height = 0.85 + rand() * 0.3;
        const top = down
          ? [x + (rand() - 0.5) * 0.9, y + 0.05, z + (rand() - 0.5) * 0.9]
          : [x + (rand() - 0.5) * 0.08, y + height, z + (rand() - 0.5) * 0.08];
        parts.push(poleGeometry([x, y - 0.15, z], top, 0.035, { radiusEnd: 0.025, radial: 5 }).toNonIndexed());
        if (previous && !down && !previous.down) {
          for (const h of [0.35, 0.7]) {
            if (rand() < 0.2) continue;
            parts.push(poleGeometry(
              [previous.x, previous.y + h * previous.height, previous.z],
              [x, y + h * height, z],
              0.02,
              { radial: 4 },
            ).toNonIndexed());
          }
        }
        previous = { x, y, z, height, down };
      }
    }
    return mergeAll(parts);
  }, [groundAt, origin.x, origin.z, yaw]);
  return <mesh geometry={geometry} material={materials.driftwood} castShadow receiveShadow />;
}

// A try-pot: the iron cauldron in which blubber was boiled down to oil,
// cracked, half-sunk, and full of rainwater.
function TryPot({ materials, ground }) {
  const profile = useMemo(() => {
    const list = [];
    for (let i = 0; i <= 10; i += 1) {
      const a = (i / 10) * Math.PI / 2;
      list.push([Math.sin(a) * 0.62 + 0.001, -Math.cos(a) * 0.5 + 0.5]);
    }
    list.push([0.68, 0.52], [0.66, 0.56]);
    return list;
  }, []);
  return (
    <group position={[WHALERS_YARD.tryPot.x, ground - 0.18, WHALERS_YARD.tryPot.z]} rotation={[0.08, 0.4, -0.05]} onClick={inspect('try_pot', 'whalers-hut-try-pot')}>
      <Lathe profile={profile} segments={22} material={materials.rustDark} />
      <mesh material={materials.rust} position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.66, 0.035, 6, 24]} />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.6, 22]} />
        <meshStandardMaterial color="#1c2624" roughness={0.06} metalness={0.1} />
      </mesh>
      {/* The crack, and a crust of rust weeping from it. */}
      <Beam size={[0.03, 0.34, 0.03]} material={materials.rust} position={[0.6, 0.28, 0.12]} rotation={[0, 0, 0.3]} />
    </group>
  );
}

function Carapaces({ materials, groundAt, origin }) {
  const shells = useMemo(() => {
    const rand = seeded(71);
    return Array.from({ length: 6 }, (_, i) => {
      const x = origin.x + (rand() - 0.5) * 1.3;
      const z = origin.z + (rand() - 0.5) * 1.0;
      const stack = i >= 4 ? 1 : 0;
      return { x, z, y: groundAt(x, z) + stack * 0.24, s: 0.36 + rand() * 0.14, yaw: rand() * 6.28, tilt: (rand() - 0.5) * (stack ? 0.6 : 1.4), flip: rand() < 0.3 };
    });
  }, [groundAt, origin.x, origin.z]);
  return (
    <group onClick={inspect('tortoise_carapace', 'whalers-hut-carapaces')}>
      {shells.map((shell, i) => (
        <group key={i} position={[shell.x, shell.y, shell.z]} rotation={[shell.flip ? Math.PI + shell.tilt * 0.3 : shell.tilt * 0.2, shell.yaw, shell.tilt]}>
          <mesh material={materials.carapace} scale={[shell.s * 1.15, shell.s * 0.72, shell.s]} castShadow receiveShadow>
            <sphereGeometry args={[1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={materials.plastron} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[shell.s * 1.1, shell.s * 0.95, 1]}>
            <ringGeometry args={[0.92, 1, 16]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function WhalersHutYard({ materials, groundAt }) {
  const garden = WHALERS_YARD.garden;
  const gardenGround = groundAt(garden.x, garden.z);
  return (
    <group>
      <group position={[garden.x, 0, garden.z]} rotation={[0, garden.yaw, 0]} onClick={inspect('galapagos_tomato', 'whalers-hut-seedbeds')}>
        {BEDS.map(bed => (
          <Seedbed key={bed.seed} materials={materials} bed={bed} ground={gardenGround} />
        ))}
      </group>
      <Fence materials={materials} groundAt={groundAt} origin={garden} yaw={garden.yaw} />
      <StaticBatch name="WhalersYard_Tools">
        {/* A spade with a broken handle left in the bare bed, and a cask split along a stave. */}
        <group position={[garden.x + 1.5, gardenGround + 0.1, garden.z + 0.95]} rotation={[0.35, 0.4, 0.15]}>
          <Beam size={[0.2, 0.28, 0.015]} material={materials.rust} position={[0, 0.02, 0]} />
          <Cyl r={0.018} h={0.55} segments={6} material={materials.driftwood} position={[0, 0.42, 0]} />
        </group>
        <Cask height={0.82} radius={0.3} material={materials.crateWood} hoop={materials.rust} position={[garden.x + 3.7, groundAt(garden.x + 3.7, garden.z - 2.0), garden.z - 2.0]} rotation={[0, 0.7, 0]} />
        <Beam size={[0.09, 0.8, 0.02]} material={materials.crateWood} position={[garden.x + 3.4, groundAt(garden.x + 3.4, garden.z - 1.6) + 0.04, garden.z - 1.6]} rotation={[Math.PI / 2 - 0.1, 0.8, 0]} />
        {[0, 1, 2].map(i => (
          <mesh key={i} material={materials.rust} position={[garden.x + 3.1 + i * 0.25, groundAt(garden.x + 3.1, garden.z - 2.4) + 0.02, garden.z - 2.4 - hash(i, 3) * 0.2]} rotation={[Math.PI / 2 + hash(i, 1) * 0.3, 0, 0]}>
            <torusGeometry args={[0.31, 0.012, 4, 20]} />
          </mesh>
        ))}
      </StaticBatch>
      <TryPot materials={materials} ground={groundAt(WHALERS_YARD.tryPot.x, WHALERS_YARD.tryPot.z)} />
      <Carapaces materials={materials} groundAt={groundAt} origin={WHALERS_YARD.carapaces} />
    </group>
  );
}

