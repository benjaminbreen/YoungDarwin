'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { meshCaveField } from './caveMesher';
import { createCaveRockMaterial, disposeCaveRockMaterial } from './caveMaterial';
import { caveAuthoredFloor, caveCeilingHeight, caveMovementHeight, caveWalkDistance, getCaveRuntime } from './caveRuntime';
import { valueNoise3 } from './caveField';

const meshCache = new Map();

function getCaveMesh(zoneId) {
  if (meshCache.has(zoneId)) return meshCache.get(zoneId);
  const runtime = getCaveRuntime(zoneId);
  if (!runtime) return null;
  const mesh = meshCaveField(runtime.field);
  meshCache.set(zoneId, mesh);
  return mesh;
}

function makeGeometry(mesh, index) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
  geometry.setAttribute('caveData', new THREE.BufferAttribute(mesh.caveData, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function hash(index, salt) {
  const s = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// A lumpy basalt boulder: icosphere displaced by value noise, flattened at
// its base. Vertex `caveData` keeps the rock shader's occlusion meaningful.
export function makeBoulderGeometry(seed = 1, detail = 2) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const n = valueNoise3(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6 - seed, seed) * 0.42
      + valueNoise3(v.x * 4.1, v.y * 4.1 + seed, v.z * 4.1, seed + 3) * 0.14;
    v.multiplyScalar(0.78 + n);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.25;
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  const count = position.count;
  const colors = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const y = position.getY(i);
    const shade = 0.36 + valueNoise3(position.getX(i) * 3, y * 3, position.getZ(i) * 3, seed + 9) * 0.1;
    colors[i * 3] = shade * 1.04;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade * 0.95;
    data[i * 4] = THREE.MathUtils.clamp(0.55 + (y + 0.35) * 0.4, 0.4, 1);
    data[i * 4 + 1] = 0;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 0;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('caveData', new THREE.BufferAttribute(data, 4));
  return geometry;
}

// Lava stalactites ("lavacicles"): drips of remelted roof that froze as the
// tube drained. Small and dense, they make the roof read as a lava tube.
function useLavacicles(zoneId, spec) {
  return useMemo(() => {
    const placements = [];
    const { min, max } = spec.grid;
    let index = 0;
    for (let x = min[0] + 1; x < max[0] - 1; x += 0.7) {
      for (let z = min[2] + 1; z < max[2] - 1; z += 0.7) {
        index += 1;
        const jx = x + (hash(index, 1) - 0.5) * 0.6;
        const jz = z + (hash(index, 2) - 0.5) * 0.6;
        if (caveWalkDistance(spec, jx, jz) > -0.6) continue;
        const cluster = valueNoise3(jx * 0.35, 0, jz * 0.35, 191);
        if (hash(index, 3) > cluster * 0.85 - 0.12) continue;
        const ceiling = caveCeilingHeight(zoneId, jx, jz);
        const floor = caveMovementHeight(zoneId, jx, jz);
        if (ceiling - floor < 2.6) continue;
        if ((spec.skylights || []).some(sky => Math.hypot(jx - sky.x, jz - sky.z) < sky.r + 1.2)) continue;
        const length = 0.05 + hash(index, 4) ** 2.5 * 0.22;
        placements.push({ x: jx, y: ceiling + 0.04, z: jz, length, width: 0.012 + hash(index, 5) * 0.022, tilt: hash(index, 6) });
      }
    }
    return placements;
  }, [spec, zoneId]);
}

function Lavacicles({ zoneId, spec, material }) {
  const placements = useLavacicles(zoneId, spec);
  const geometry = useMemo(() => {
    const cone = new THREE.ConeGeometry(1, 1, 5, 1, true);
    cone.rotateX(Math.PI);
    cone.translate(0, -0.5, 0);
    const count = cone.attributes.position.count;
    const colors = new Float32Array(count * 3).fill(0.46);
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      data[i * 4] = 0.7;
      data[i * 4 + 1] = 0.35;
    }
    cone.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    cone.setAttribute('caveData', new THREE.BufferAttribute(data, 4));
    return cone;
  }, []);
  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    placements.forEach((item, i) => {
      euler.set((item.tilt - 0.5) * 0.25, item.tilt * 6.28, (item.tilt - 0.5) * 0.2);
      quaternion.setFromEuler(euler);
      matrix.compose(
        new THREE.Vector3(item.x, item.y, item.z),
        quaternion,
        new THREE.Vector3(item.width, item.length, item.width),
      );
      instanced.setMatrixAt(i, matrix);
    });
    instanced.count = placements.length;
    instanced.name = 'CaveCeiling_Lavacicles';
    instanced.castShadow = false;
    instanced.receiveShadow = true;
    instanced.computeBoundingSphere();
    return instanced;
  }, [geometry, material, placements]);
  useEffect(() => () => {
    geometry.dispose();
    mesh.dispose();
  }, [geometry, mesh]);
  return <primitive object={mesh} />;
}

// Breakdown: loose blocks fallen from the roof, gathered against the walls
// where nobody has cleared them.
function Breakdown({ zoneId, spec, material }) {
  const geometries = useMemo(() => [makeBoulderGeometry(3, 1), makeBoulderGeometry(7, 1), makeBoulderGeometry(11, 1)], []);
  const meshes = useMemo(() => {
    const groups = geometries.map(() => []);
    const { min, max } = spec.grid;
    let index = 0;
    for (let x = min[0] + 1; x < max[0] - 1; x += 0.55) {
      for (let z = min[2] + 1; z < max[2] - 1; z += 0.55) {
        index += 1;
        const jx = x + (hash(index, 11) - 0.5) * 0.5;
        const jz = z + (hash(index, 12) - 0.5) * 0.5;
        const d = caveWalkDistance(spec, jx, jz);
        // A band hugging the wall, just inside and outside the walkable edge.
        if (d < -0.75 || d > 0.35) continue;
        if (hash(index, 13) > 0.55) continue;
        const size = 0.08 + hash(index, 14) ** 2.2 * (d > -0.2 ? 0.42 : 0.18);
        const y = caveMovementHeight(zoneId, jx, jz);
        // Near the wall the floor grid blends toward the wall top; only keep
        // blocks that would actually rest on the floor.
        if (y > caveAuthoredFloor(zoneId, jx, jz) + 0.25) continue;
        groups[index % groups.length].push({ x: jx, y: Math.min(y, caveMovementHeight(zoneId, jx - 0.3, jz)) + size * 0.2, z: jz, size, yaw: hash(index, 15) * 6.28 });
      }
    }
    return groups.map((placements, g) => {
      const instanced = new THREE.InstancedMesh(geometries[g], material, Math.max(1, placements.length));
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      placements.forEach((item, i) => {
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.yaw);
        matrix.compose(new THREE.Vector3(item.x, item.y, item.z), quaternion, new THREE.Vector3(item.size * 1.2, item.size * 0.8, item.size));
        instanced.setMatrixAt(i, matrix);
      });
      instanced.count = placements.length;
      instanced.name = `CaveBreakdown_${g}`;
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      instanced.computeBoundingSphere();
      return instanced;
    });
  }, [geometries, material, spec, zoneId]);
  useEffect(() => () => {
    geometries.forEach(geometry => geometry.dispose());
    meshes.forEach(mesh => mesh.dispose());
  }, [geometries, meshes]);
  return (
    <>
      {meshes.map(mesh => <primitive key={mesh.name} object={mesh} />)}
    </>
  );
}

export function useCaveRockMaterial() {
  const material = useMemo(() => createCaveRockMaterial(), []);
  useEffect(() => () => disposeCaveRockMaterial(material), [material]);
  return material;
}

export function CaveShell({ zoneId, material }) {
  const runtime = getCaveRuntime(zoneId);
  const mesh = getCaveMesh(zoneId);
  const geometries = useMemo(() => {
    if (!mesh) return null;
    return {
      shell: makeGeometry(mesh, mesh.shellIndices),
      ceiling: makeGeometry(mesh, mesh.ceilingIndices),
    };
  }, [mesh]);
  useEffect(() => () => {
    geometries?.shell.dispose();
    geometries?.ceiling.dispose();
  }, [geometries]);
  if (!runtime || !geometries) return null;
  return (
    <group name="CaveRock">
      <mesh
        name="CaveShell"
        geometry={geometries.shell}
        material={material}
        castShadow
        receiveShadow
        frustumCulled={false}
        userData={{ renderSource: `cave-shell:${zoneId}`, renderKind: 'interior-shell' }}
      />
      <mesh
        name="CaveCeiling"
        geometry={geometries.ceiling}
        material={material}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <Lavacicles zoneId={zoneId} spec={runtime.spec} material={material} />
      <Breakdown zoneId={zoneId} spec={runtime.spec} material={material} />
    </group>
  );
}
