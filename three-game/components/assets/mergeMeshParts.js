import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural props and fauna are authored as many small meshes, and three
// issues one draw call per mesh (twice when it casts a shadow). These helpers
// collapse a subtree to one mesh per material without changing how its owner
// authors or animates it: the original meshes stay in the graph, hidden, so
// refs, raycasts and animation code keep working on them.
//
// mergeStaticParts: parts never move relative to `root`. Plain merged meshes.
// mergeRigidParts: parts move (legs, jaws, lids). Each original mesh becomes a
// bone of one shared skeleton and the merged mesh is rigidly skinned to it, so
// whatever the animation writes to a part's transform still moves its slice.
//
// A subtree under a node with `userData.keepSeparate` is left alone (contents
// that toggle visibility, glass that sorts on its own).

const _rootInverse = new THREE.Matrix4();
const _local = new THREE.Matrix4();

function collectParts(root) {
  const parts = [];
  const walk = object => {
    if (object !== root && object.userData.keepSeparate) return;
    if (object.isMesh && !object.isSkinnedMesh && !object.isInstancedMesh && !Array.isArray(object.material)) {
      parts.push(object);
    }
    object.children.forEach(walk);
  };
  walk(root);
  return parts;
}

// mergeGeometries wants identical attribute sets and consistent indexing.
// Keep the attributes every part has, and index the ones that are not.
function normalizeForMerge(geometries) {
  const names = Object.keys(geometries[0].attributes)
    .filter(name => geometries.every(geometry => geometry.attributes[name]));
  return geometries.map(geometry => {
    const clone = new THREE.BufferGeometry();
    for (const name of names) clone.setAttribute(name, geometry.attributes[name].clone());
    const count = geometry.attributes.position.count;
    clone.setIndex(geometry.index
      ? geometry.index.clone()
      : Array.from({ length: count }, (_, index) => index));
    return clone;
  });
}

function groupParts(parts) {
  const groups = new Map();
  for (const part of parts) {
    const key = `${part.material.uuid}:${part.receiveShadow ? 1 : 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(part);
  }
  // A lone part gains nothing from merging.
  return [...groups.values()].filter(group => group.length > 1);
}

function hideParts(parts) {
  for (const part of parts) {
    part.visible = false;
    part.userData.mergedAway = true;
  }
}

function makeRestore(root, merged, parts, extraDispose = null) {
  return () => {
    for (const mesh of merged) {
      root.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const part of parts) {
      part.visible = true;
      delete part.userData.mergedAway;
    }
    extraDispose?.();
  };
}

function applyShadowFlags(mesh, group) {
  mesh.castShadow = group.some(part => part.castShadow);
  mesh.receiveShadow = group[0].receiveShadow;
  mesh.raycast = () => {};
}

export function mergeStaticParts(root) {
  if (!root) return () => {};
  root.updateMatrixWorld(true);
  _rootInverse.copy(root.matrixWorld).invert();
  const merged = [];
  const hidden = [];
  for (const group of groupParts(collectParts(root))) {
    const geometries = normalizeForMerge(group.map(part => part.geometry));
    geometries.forEach((geometry, index) => {
      geometry.applyMatrix4(_local.multiplyMatrices(_rootInverse, group[index].matrixWorld));
    });
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(entry => entry.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, group[0].material);
    applyShadowFlags(mesh, group);
    mesh.name = `merged:${group[0].material.name || group[0].material.type}`;
    root.add(mesh);
    merged.push(mesh);
    hidden.push(...group);
  }
  hideParts(hidden);
  return makeRestore(root, merged, hidden);
}

export function mergeRigidParts(root, { boundsPadding = 1.6 } = {}) {
  if (!root) return () => {};
  root.updateMatrixWorld(true);
  _rootInverse.copy(root.matrixWorld).invert();
  const groups = groupParts(collectParts(root));
  if (!groups.length) return () => {};
  // One skeleton for the whole model: three refreshes it once per frame no
  // matter how many merged meshes share it. The bones are the original part
  // meshes; Skeleton only reads their matrixWorld, which three keeps current
  // for hidden objects too.
  const bones = groups.flat();
  const skeleton = new THREE.Skeleton(bones);
  const merged = [];
  let boneIndex = 0;
  for (const group of groups) {
    const geometries = normalizeForMerge(group.map(part => part.geometry));
    geometries.forEach((geometry, index) => {
      geometry.applyMatrix4(_local.multiplyMatrices(_rootInverse, group[index].matrixWorld));
      const count = geometry.attributes.position.count;
      const skinIndex = new Uint16Array(count * 4).fill(0);
      const skinWeight = new Float32Array(count * 4).fill(0);
      for (let vertex = 0; vertex < count; vertex += 1) {
        skinIndex[vertex * 4] = boneIndex + index;
        skinWeight[vertex * 4] = 1;
      }
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    });
    boneIndex += group.length;
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(entry => entry.dispose());
    if (!geometry) continue;
    const mesh = new THREE.SkinnedMesh(geometry, group[0].material);
    applyShadowFlags(mesh, group);
    mesh.name = `merged:${group[0].material.name || group[0].material.type}`;
    // The bind-pose bounds, padded for limbs and tails swinging past them.
    // Leaving boundingSphere null would make three skin every vertex on the
    // CPU to compute it.
    geometry.computeBoundingSphere();
    mesh.boundingSphere = geometry.boundingSphere.clone();
    mesh.boundingSphere.radius *= boundsPadding;
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, mesh.matrixWorld);
    merged.push(mesh);
  }
  hideParts(bones);
  return makeRestore(root, merged, bones, () => skeleton.dispose());
}
