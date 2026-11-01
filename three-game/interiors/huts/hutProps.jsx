'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Beam, Cyl, hash, Lathe, FabricBundle } from '../cave/props/primitives';
import { mergeAll, poleGeometry, seeded } from './hutGeometry';
import { plantainGeometry } from './hutFlora';
import { useDisposable } from './useDisposable';

// Small props shared by the whalers' hut and the rancho.

// A hammock slung between two points: a cloth bed that sags in a catenary
// and curls up at its edges, gathered into cords at each end.
function hammockGeometry(from, to, { sag = 0.5, width = 0.72, segments = 20, across = 8, panel = false } = {}) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const along = b.clone().sub(a);
  const length = along.length();
  along.normalize();
  const side = new THREE.Vector3(-along.z, 0, along.x).normalize();
  const gather = 0.16;
  const positions = [];
  const uvs = [];
  const point = (i, j) => {
    const t = i / segments;
    const s = j / across - 0.5;
    // Gathered ends: the bed narrows to the cords.
    const spread = Math.sin(Math.min(1, Math.max(0, (t - gather) / (1 - gather * 2))) * Math.PI) ** 0.6;
    const p = a.clone().addScaledVector(along, length * t);
    p.y -= sag * 4 * t * (1 - t);
    p.addScaledVector(side, s * width * spread);
    // Edges ride up: the bed is a shallow trough.
    p.y += (s * s * 4) * 0.1 * spread;
    return [p, panel ? [t, s + 0.5] : [t * length, (s + 0.5) * width]];
  };
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < across; j += 1) {
      const quad = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        positions.push(quad[k][0].x, quad[k][0].y, quad[k][0].z);
        uvs.push(quad[k][1][0], quad[k][1][1]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function Hammock({ materials, from, to, sag = 0.5, cloth = 'redWool' }) {
  const material = materials[cloth] || materials.redWool;
  const panel = material.userData?.periodSurface?.uvMode === 'panel';
  const bed = useDisposable(() => hammockGeometry(from, to, { sag, panel }), [from[0], from[1], from[2], to[0], to[1], to[2], sag, panel]);
  const cords = useDisposable(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const parts = [];
    for (const [end, sign] of [[a, 1], [b, -1]]) {
      const ring = end.clone().addScaledVector(dir, sign * 0.06);
      for (let k = -2; k <= 2; k += 1) {
        const target = end.clone().addScaledVector(dir, sign * a.distanceTo(b) * 0.16).addScaledVector(side, k * 0.08);
        target.y -= sag * 4 * 0.16 * 0.84;
        parts.push(poleGeometry(ring.toArray(), target.toArray(), 0.006, { radial: 3 }).toNonIndexed());
      }
    }
    return mergeAll(parts);
  }, [from[0], from[1], from[2], to[0], to[1], to[2], sag]);
  return (
    <group>
      <mesh geometry={bed} material={material} castShadow receiveShadow />
      <mesh geometry={cords} material={materials.twine} />
    </group>
  );
}

// Maize hung by its pulled-back husks; a plantain bunch on its stalk.
function maizeBunchGeometry(seed, count) {
  const rand = seeded(seed);
  const ears = [];
  const husks = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.5;
    const tilt = 0.12 + rand() * 0.18;
    const length = 0.17 + rand() * 0.06;
    const top = new THREE.Vector3(Math.cos(a) * 0.03, -0.05, Math.sin(a) * 0.03);
    const bottom = top.clone().add(new THREE.Vector3(Math.cos(a) * Math.sin(tilt) * length, -Math.cos(tilt) * length, Math.sin(a) * Math.sin(tilt) * length));
    ears.push(poleGeometry(top.toArray(), bottom.toArray(), 0.026, { radiusEnd: 0.018, radial: 7 }).toNonIndexed());
    // Husks folded up over the string.
    for (let h = 0; h < 3; h += 1) {
      const ha = a + (h - 1) * 0.7;
      husks.push(poleGeometry(top.toArray(), [top.x + Math.cos(ha) * 0.06, 0.05 + rand() * 0.04, top.z + Math.sin(ha) * 0.06], 0.012, { radiusEnd: 0.003, radial: 3 }).toNonIndexed());
    }
  }
  return { ears: mergeAll(ears), husks: mergeAll(husks) };
}

function MaizeBunch({ materials, seed, count, ...props }) {
  const geometry = useDisposable(() => maizeBunchGeometry(seed, count), [seed, count]);
  return (
    <group {...props}>
      <mesh geometry={geometry.ears} material={materials.maizeKernel} castShadow />
      <mesh geometry={geometry.husks} material={materials.maizeHusk} />
    </group>
  );
}

function PlantainBunch({ materials, seed, ...props }) {
  // Hands of plantains spiral down the stalk; each finger curves up and out
  // from it, tips toward the sky, as they grow.
  const geometry = useDisposable(() => {
    const rand = seeded(seed);
    const fingers = [];
    const hands = 5;
    for (let h = 0; h < hands; h += 1) {
      const per = 10 - Math.floor(h / 2);
      const size = 1 - h * 0.08;
      for (let f = 0; f < per; f += 1) {
        const a = (f / per) * Math.PI * 2 + h * 0.9 + rand() * 0.2;
        const length = (0.13 + rand() * 0.03) * size;
        const finger = new THREE.CylinderGeometry(0.014, 0.024, length, 6, 3);
        // Bend the finger: tip leans out further than the base.
        const position = finger.attributes.position;
        for (let i = 0; i < position.count; i += 1) {
          const t = position.getY(i) / length + 0.5;
          position.setX(i, position.getX(i) + t * t * 0.035);
        }
        finger.translate(0, length / 2, 0);
        finger.rotateZ(-0.32);
        finger.rotateY(-a);
        finger.translate(Math.cos(a) * 0.035, -0.08 - h * 0.085, Math.sin(a) * 0.035);
        fingers.push(finger.toNonIndexed());
        finger.dispose();
      }
    }
    return {
      fingers: mergeAll(fingers),
      stalk: poleGeometry([0, 0.05, 0], [0, -0.08 - hands * 0.085 - 0.05, 0], 0.022, { radial: 5 }),
    };
  }, [seed]);
  return (
    <group {...props}>
      <mesh geometry={geometry.stalk} material={materials.bananaStem} />
      <mesh geometry={geometry.fingers} material={materials.plantain} castShadow />
    </group>
  );
}

export function HangingProduce({ materials, items }) {
  return items.map((item, i) => (
    <group key={i}>
      <Cyl r={0.006} h={0.12} segments={3} material={materials.twine} position={[item.position[0], item.position[1] - 0.04, item.position[2]]} />
      {item.kind === 'maize'
        ? <MaizeBunch materials={materials} seed={item.seed} count={item.count || 8} position={[item.position[0], item.position[1] - 0.1, item.position[2]]} />
        : <PlantainBunch materials={materials} seed={item.seed} position={[item.position[0], item.position[1] - 0.1, item.position[2]]} />}
    </group>
  ));
}

// A plantain plant standing in the garden.
export function Plantain({ materials, seed, height = 2.6, bunch = false, ...props }) {
  const geometry = useDisposable(() => plantainGeometry(seed, { height, bunch, leaves: 9 + (seed % 3), dead: 3 }), [seed, height, bunch]);
  return (
    <group {...props}>
      <mesh geometry={geometry.stem} material={materials.bananaStem} castShadow receiveShadow />
      <mesh geometry={geometry.green} material={materials.bananaLeaf} castShadow receiveShadow />
      <mesh geometry={geometry.dry} material={materials.leafDry} castShadow />
      {geometry.fruit && <mesh geometry={geometry.fruit} material={materials.plantain} castShadow />}
      {geometry.bell && <mesh geometry={geometry.bell} material={materials.clayDark} castShadow />}
    </group>
  );
}

// A tortoise carapace, dome up or rolled on its back.
export function Carapace({ materials, size = 0.42, flipped = false, ...props }) {
  return (
    <group {...props}>
      <group rotation={[flipped ? Math.PI : 0, 0, 0]}>
        <mesh material={materials.carapace} scale={[size * 1.15, size * 0.72, size]} castShadow receiveShadow>
          <sphereGeometry args={[1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh material={materials.plastron} rotation={[-Math.PI / 2, 0, 0]} scale={[size * 1.1, size * 0.95, 1]}>
          <ringGeometry args={[0.9, 1, 18]} />
        </mesh>
      </group>
    </group>
  );
}

// Staves from broken casks, heaped, with their hoops.
export function StavePile({ materials, seed = 1, ...props }) {
  const staves = useMemo(() => {
    const rand = seeded(seed);
    return Array.from({ length: 14 }, (_, i) => ({
      x: (rand() - 0.5) * 0.6,
      y: 0.03 + Math.floor(i / 5) * 0.06 + rand() * 0.03,
      z: (rand() - 0.5) * 0.4,
      yaw: rand() * Math.PI,
      roll: (rand() - 0.5) * 0.5,
      length: 0.7 + rand() * 0.2,
    }));
  }, [seed]);
  return (
    <group {...props}>
      {staves.map((s, i) => (
        <Beam key={i} size={[0.085, 0.022, s.length]} material={materials.crateWood} tile={1.0} position={[s.x, s.y, s.z]} rotation={[0.05, s.yaw, s.roll]} />
      ))}
      {[0, 1, 2].map(i => (
        <mesh key={`h${i}`} material={materials.rust} position={[0.45 - i * 0.12, 0.25 + i * 0.03, 0.3]} rotation={[0.3 + hash(i, 2) * 0.6, hash(i, 3), 0.2]}>
          <torusGeometry args={[0.3, 0.012, 4, 22]} />
        </mesh>
      ))}
    </group>
  );
}

// A coil of whale line on the floor: flat spiral turns stacked a few deep.
export function CoiledLine({ materials, radius = 0.32, turns = 9, ...props }) {
  const geometry = useDisposable(() => {
    const points = [];
    for (let i = 0; i <= turns * 24; i += 1) {
      const t = i / 24;
      const layer = Math.floor(t / 3);
      const r = radius - (t % 3) * 0.04 + layer * 0.01;
      const a = t * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * r, 0.02 + layer * 0.035, Math.sin(a) * r));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), turns * 24, 0.016, 5, false);
  }, [radius, turns]);
  return <mesh geometry={geometry} material={materials.manila} castShadow receiveShadow {...props} />;
}

// A whaling iron: barbed two-flued head on a long iron shank, socketed onto
// a wooden pole. Or, with `lance`, the leaf-bladed killing lance.
export function WhalingIron({ materials, lance = false, ...props }) {
  const head = useMemo(() => (lance
    ? [[0, 0], [0.03, 0.03], [0.04, 0.09], [0.0, 0.17]]
    : [[0, 0], [0.012, 0.0], [0.07, 0.07], [0.02, 0.05], [0.0, 0.12]]), [lance]);
  return (
    <group {...props}>
      <Cyl r={0.022} rTop={0.02} h={1.7} segments={7} material={materials.pole} position={[0, 0.85, 0]} />
      <Cyl r={0.011} h={lance ? 1.2 : 0.75} segments={6} material={materials.rust} position={[0, 1.7 + (lance ? 0.6 : 0.375), 0]} />
      <Lathe profile={head} segments={lance ? 8 : 2} material={materials.rustDark} position={[0, 1.7 + (lance ? 1.2 : 0.75), 0]} />
    </group>
  );
}

// A tin lantern, cold, on a hook.
export function TinLantern({ materials, ...props }) {
  return (
    <group {...props}>
      <Cyl r={0.08} h={0.2} segments={8} material={materials.tin} position={[0, -0.12, 0]} open />
      <mesh material={materials.tin} position={[0, -0.005, 0]}>
        <coneGeometry args={[0.09, 0.1, 8]} />
      </mesh>
      <mesh material={materials.tin} position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.03, 0.006, 4, 10]} />
      </mesh>
      <Cyl r={0.06} h={0.012} segments={8} material={materials.rust} position={[0, -0.22, 0]} />
    </group>
  );
}

export function Bottle({ materials, height = 0.28, ...props }) {
  const profile = useMemo(() => [[0.001, 0], [0.045, 0.0], [0.05, 0.02], [0.05, height * 0.6], [0.02, height * 0.8], [0.016, height], [0.019, height + 0.01]], [height]);
  return <Lathe profile={profile} segments={10} material={materials.bottleGlass} {...props} />;
}

export function Gourd({ materials, size = 0.12, ...props }) {
  return (
    <group {...props}>
      <mesh material={materials.gourd} scale={[size, size * 0.9, size]} position={[0, size * 0.85, 0]} castShadow>
        <sphereGeometry args={[1, 12, 9]} />
      </mesh>
      <mesh material={materials.gourd} scale={[size * 0.6, size * 0.6, size * 0.6]} position={[0, size * 1.95, 0]} castShadow>
        <sphereGeometry args={[1, 10, 7]} />
      </mesh>
    </group>
  );
}

export function Sack({ materials, size = [0.42, 0.55, 0.36], tied = true, ...props }) {
  return (
    <group {...props}>
      <FabricBundle material={materials.sacking} radii={[size[0] / 2, size[1] / 2, size[2] / 2]} position={[0, size[1] * 0.45, 0]} />
      {tied && <Cyl r={0.05} rTop={0.02} h={0.12} segments={6} material={materials.sacking} position={[0, size[1] * 0.92, 0]} />}
    </group>
  );
}

export function Basket({ materials, radius = 0.2, height = 0.18, fill = null, ...props }) {
  return (
    <group {...props}>
      <Cyl r={radius} rBottom={radius * 0.8} h={height} segments={12} material={materials.cane} position={[0, height / 2, 0]} open />
      <Cyl r={radius * 0.8} h={0.01} segments={12} material={materials.cane} position={[0, 0.006, 0]} />
      {fill && (
        <mesh material={materials[fill]} position={[0, height * 0.8, 0]} scale={[radius * 0.92, height * 0.3, radius * 0.92]}>
          <sphereGeometry args={[1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      )}
    </group>
  );
}
