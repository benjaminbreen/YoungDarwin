'use client';

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { floorAt } from './anchors';
import { woodBoxGeometry } from './caveMaterials';

// Small building blocks for the cave's furnishings. Props are authored as
// ordinary JSX and then flattened by <StaticBatch> into one mesh per
// material, so a chamber full of hand-placed objects costs a handful of draw
// calls.

export function hash(index, salt = 0) {
  const s = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function useGround(zoneId) {
  return useMemo(() => (x, z) => floorAt(zoneId, x, z), [zoneId]);
}

// A timber member: box with world-scaled grain.
export function Beam({ size, material, tile = 0.9, ...props }) {
  const geometry = woodBoxGeometry(size[0], size[1], size[2], tile);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow {...props} />;
}

export function Block({ size, material, ...props }) {
  return (
    <mesh material={material} castShadow receiveShadow {...props}>
      <boxGeometry args={size} />
    </mesh>
  );
}

export function Cyl({ r = 0.05, rTop, rBottom, h = 1, segments = 10, material, open = false, ...props }) {
  return (
    <mesh material={material} castShadow receiveShadow {...props}>
      <cylinderGeometry args={[rTop ?? r, rBottom ?? r, h, segments, 1, open]} />
    </mesh>
  );
}

export function Ball({ r = 0.1, material, segments = 10, ...props }) {
  return (
    <mesh material={material} castShadow receiveShadow {...props}>
      <sphereGeometry args={[r, segments, Math.max(6, Math.round(segments * 0.7))]} />
    </mesh>
  );
}

// Lathe from a radius profile [[r, y], ...].
const latheCache = new Map();
export function latheGeometry(profile, segments = 16) {
  const key = `${segments}:${profile.map(p => p.join(',')).join(';')}`;
  if (latheCache.has(key)) return latheCache.get(key);
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  latheCache.set(key, geometry);
  return geometry;
}

export function Lathe({ profile, segments = 16, material, ...props }) {
  return <mesh geometry={latheGeometry(profile, segments)} material={material} castShadow receiveShadow {...props} />;
}

// A ship's cask: bulged staves with iron hoops. `open` leaves the head off.
export function Cask({ height = 0.9, radius = 0.32, material, hoop, headMaterial, open = false, ...props }) {
  const bulge = radius;
  const end = radius * 0.84;
  const profile = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 8; i += 1) {
      const t = i / 8;
      points.push([end + (bulge - end) * Math.sin(t * Math.PI), t * height]);
    }
    return points;
  }, [bulge, end, height]);
  return (
    <group {...props}>
      <Lathe profile={profile} segments={18} material={material} />
      {!open && <Cyl r={end * 0.98} h={0.02} segments={18} material={headMaterial || material} position={[0, height - 0.03, 0]} />}
      {open && <Cyl r={end * 0.98} h={0.02} segments={18} material={headMaterial || material} position={[0, 0.04, 0]} />}
      {[0.08, 0.3, 0.7, 0.92].map(t => {
        const r = end + (bulge - end) * Math.sin(t * Math.PI) + 0.006;
        return (
          <mesh key={t} position={[0, t * height, 0]} rotation={[Math.PI / 2, 0, 0]} material={hoop} castShadow>
            <torusGeometry args={[r, 0.011, 4, 22]} />
          </mesh>
        );
      })}
    </group>
  );
}

// A rope or cord hung between points with catenary-ish sag.
export function ropeGeometry(points, { radius = 0.012, sag = 0.12, segments = 18, radial = 4 } = {}) {
  const vectors = [];
  for (let p = 0; p < points.length - 1; p += 1) {
    const a = new THREE.Vector3(...points[p]);
    const b = new THREE.Vector3(...points[p + 1]);
    const span = a.distanceTo(b);
    for (let i = 0; i < segments; i += 1) {
      const t = i / segments;
      const v = a.clone().lerp(b, t);
      v.y -= Math.sin(t * Math.PI) * sag * span;
      vectors.push(v);
    }
  }
  vectors.push(new THREE.Vector3(...points[points.length - 1]));
  const curve = new THREE.CatmullRomCurve3(vectors);
  return new THREE.TubeGeometry(curve, Math.max(8, vectors.length * 2), radius, radial, false);
}

export function Rope({ points, radius, sag, material, ...props }) {
  const geometry = useMemo(() => ropeGeometry(points, { radius, sag }), [points, radius, sag]);
  return <mesh geometry={geometry} material={material} castShadow {...props} />;
}

// Sag position along a rope segment, so things can be hung from it.
export function ropePoint(a, b, t, sag = 0.12) {
  const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag * span,
    a[2] + (b[2] - a[2]) * t,
  ];
}

// A tallow candle with a drip-run base and a lamp-flame tip the interior rig
// drives. The flame stays out of the static batch.
export function Candle({ height = 0.16, radius = 0.022, materials, holder = 'tin', ...props }) {
  return (
    <group {...props}>
      {holder === 'tin' && (
        <>
          <Cyl rTop={0.06} rBottom={0.065} h={0.012} segments={14} material={materials.tin} position={[0, 0.006, 0]} />
          <Cyl r={0.03} h={0.03} segments={10} material={materials.tin} position={[0, 0.025, 0]} />
        </>
      )}
      {holder === 'stone' && <Ball r={0.07} material={materials.ash} scale={[1, 0.35, 1]} position={[0, 0.012, 0]} />}
      <Cyl rTop={radius * 0.92} rBottom={radius} h={height} segments={8} material={materials.tallow} position={[0, 0.02 + height / 2, 0]} />
      <Ball r={radius * 1.25} material={materials.tallow} scale={[1, 0.5, 1]} position={[0, 0.03, 0]} />
      <Flame position={[0, 0.02 + height + 0.028, 0]} material={materials.flame} scale={0.8} />
    </group>
  );
}

const flameGeometry = (() => {
  const geometry = new THREE.SphereGeometry(1, 10, 8);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const taper = y > 0 ? 1 - y * 0.82 : 1;
    position.setXYZ(i, position.getX(i) * 0.36 * taper, y, position.getZ(i) * 0.36 * taper);
  }
  geometry.computeVertexNormals();
  return geometry;
})();

export function Flame({ material, scale = 1, ...props }) {
  return (
    <mesh
      geometry={flameGeometry}
      material={material}
      scale={[0.035 * scale, 0.035 * scale, 0.035 * scale]}
      userData={{ noBatch: true }}
      {...props}
    />
  );
}

// A salvaged ship's lantern: tin frame, horn panes, ring handle.
export function Lantern({ materials, size = 1, lit = true, ...props }) {
  const s = size;
  return (
    <group {...props}>
      <Cyl r={0.085 * s} h={0.018 * s} segments={8} material={materials.tin} position={[0, 0.009 * s, 0]} />
      {[0, 1, 2, 3, 4, 5].map(i => {
        const a = (i / 6) * Math.PI * 2;
        return <Block key={i} size={[0.012 * s, 0.2 * s, 0.012 * s]} material={materials.iron} position={[Math.cos(a) * 0.075 * s, 0.11 * s, Math.sin(a) * 0.075 * s]} />;
      })}
      <mesh material={materials.hornPane} position={[0, 0.11 * s, 0]} userData={{ noBatch: true }} renderOrder={2}>
        <cylinderGeometry args={[0.072 * s, 0.072 * s, 0.19 * s, 6, 1, true]} />
      </mesh>
      <Cyl rTop={0.02 * s} rBottom={0.09 * s} h={0.07 * s} segments={8} material={materials.tin} position={[0, 0.245 * s, 0]} />
      <mesh material={materials.iron} position={[0, 0.31 * s, 0]} castShadow>
        <torusGeometry args={[0.035 * s, 0.006 * s, 4, 12]} />
      </mesh>
      <Cyl r={0.018 * s} h={0.05 * s} segments={8} material={materials.tallow} position={[0, 0.045 * s, 0]} />
      {lit && <Flame material={materials.flame} position={[0, 0.1 * s, 0]} scale={0.9 * s} />}
    </group>
  );
}

// A bundle of printed pamphlets tied with tarred twine and wrapped in oilcloth.
export function Bundle({ size = [0.32, 0.16, 0.24], materials, wrapped = true, ...props }) {
  return (
    <group {...props}>
      <Block size={size} material={wrapped ? materials.oilcloth : materials.sheetEdge} />
      <Block size={[size[0] + 0.006, size[1] + 0.006, 0.012]} material={materials.twine} />
      <Block size={[0.012, size[1] + 0.006, size[2] + 0.006]} material={materials.twine} />
    </group>
  );
}

// A stack of paper sheets, each a little askew.
export function SheetStack({ count = 8, size = [0.42, 0.32], materials, seed = 1, printed = false, ...props }) {
  return (
    <group {...props}>
      <Block size={[size[0], count * 0.004, size[1]]} material={materials.sheetEdge} position={[0, count * 0.002, 0]} />
      {Array.from({ length: Math.min(4, count) }, (_, i) => (
        <mesh
          key={i}
          material={printed && i === Math.min(4, count) - 1 ? materials.sheetPrinted : materials.paper}
          position={[(hash(seed, i) - 0.5) * 0.03, count * 0.004 + i * 0.0015 + 0.001, (hash(seed, i + 7) - 0.5) * 0.03]}
          rotation={[-Math.PI / 2, 0, (hash(seed, i + 3) - 0.5) * 0.12]}
          receiveShadow
        >
          <planeGeometry args={size} />
        </mesh>
      ))}
    </group>
  );
}

// Flatten every static mesh under this group into one mesh per material.
// Meshes flagged userData.noBatch (flames, translucent panes) and anything in
// a <group userData={{ noBatch: true }}> stay as they are.
export function StaticBatch({ children, name = 'CaveFurnishings', castShadow = true }) {
  const sourceRef = useRef(null);
  const [batched, setBatched] = useState(null);
  useLayoutEffect(() => {
    const root = sourceRef.current;
    if (!root) return undefined;
    root.updateWorldMatrix(true, true);
    const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups = new Map();
    const keep = [];
    root.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh) return;
      let skip = false;
      for (let node = object; node && node !== root; node = node.parent) {
        if (node.userData?.noBatch) skip = true;
      }
      if (skip || Array.isArray(object.material)) {
        keep.push(object);
        return;
      }
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld);
      const source = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', source.attributes.position);
      if (!source.attributes.normal) source.computeVertexNormals();
      geometry.setAttribute('normal', source.attributes.normal);
      geometry.setAttribute('uv', source.attributes.uv || new THREE.BufferAttribute(new Float32Array(source.attributes.position.count * 2), 2));
      // The rock shader reads vertex colour and baked cave data; keep them
      // for stones so they shade like the shell they sit on.
      if (object.material.userData?.caveUniforms) {
        const count = source.attributes.position.count;
        geometry.setAttribute('color', source.attributes.color || new THREE.BufferAttribute(new Float32Array(count * 3).fill(0.4), 3));
        geometry.setAttribute('caveData', source.attributes.caveData || new THREE.BufferAttribute(Float32Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 0.8 : 0)), 4));
      }
      geometry.applyMatrix4(matrix);
      const key = object.material.uuid;
      if (!groups.has(key)) groups.set(key, { material: object.material, geometries: [], castShadow: object.castShadow });
      groups.get(key).geometries.push(geometry);
      source.dispose();
    });
    const meshes = [];
    for (const { material, geometries, castShadow: casts } of groups.values()) {
      const merged = mergeGeometries(geometries, false);
      geometries.forEach(geometry => geometry.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${name}_${material.name || 'mat'}`;
      mesh.castShadow = castShadow && casts;
      mesh.receiveShadow = true;
      meshes.push(mesh);
    }
    // Hide what was merged; leave the unbatched meshes visible in place.
    root.traverse(object => {
      if (object.isMesh && !keep.includes(object)) object.visible = false;
    });
    setBatched(meshes);
    return () => {
      meshes.forEach(mesh => mesh.geometry.dispose());
    };
  }, [name, castShadow]);
  return (
    <group name={name}>
      <group ref={sourceRef}>{children}</group>
      {batched?.map(mesh => <primitive key={mesh.uuid} object={mesh} />)}
    </group>
  );
}
