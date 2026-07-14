import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

const sourceDir = path.resolve('assets-src/nature/mangrove-tree-source');
const sourcePath = path.join(sourceDir, 'mangrovetree.3ds');
const outputPath = path.resolve('public/assets/models/nature/runtime-mangrove-tree.glb');
const targetHeight = 12.65;

globalThis.FileReader = class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    }).catch((error) => {
      this.error = error;
      this.onerror?.(error);
    });
  }
};

THREE.TextureLoader.prototype.load = function loadTextureStub(url) {
  const texture = new THREE.Texture();
  texture.name = path.basename(String(url));
  return texture;
};

function triangleCount(geometry) {
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  return geometry.index ? geometry.index.count / 3 : position.count / 3;
}

function compactGeometry(input, targetTriangles) {
  const geometry = input.clone();
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('uv2');
  geometry.deleteAttribute('color');
  geometry.deleteAttribute('skinIndex');
  geometry.deleteAttribute('skinWeight');
  geometry.computeVertexNormals();

  const triangles = triangleCount(geometry);
  if (triangles <= targetTriangles) return geometry;

  const positionCount = geometry.getAttribute('position')?.count ?? 0;
  const targetVertices = Math.max(targetTriangles * 2, 24);
  const removeCount = Math.max(0, Math.floor(positionCount - targetVertices));
  if (removeCount < 1) return geometry;

  const modifier = new SimplifyModifier();
  const simplified = modifier.modify(geometry, removeCount);
  simplified.computeVertexNormals();
  return simplified;
}

function makeLeafMaterial() {
  return new THREE.MeshStandardMaterial({
    name: 'mangrove_leaves_stylized',
    color: new THREE.Color('#526f36'),
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

function makeTrunkMaterial() {
  return new THREE.MeshStandardMaterial({
    name: 'mangrove_trunk_stylized',
    color: new THREE.Color('#4b3f31'),
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

const leafMaterial = makeLeafMaterial();
const trunkMaterial = makeTrunkMaterial();
const data = fs.readFileSync(sourcePath);
const loader = new TDSLoader();
const source = loader.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), `${sourceDir}/`);
const result = new THREE.Group();
result.name = 'runtime_mangrove_tree';

let sourceTriangles = 0;
let outputTriangles = 0;
source.traverse((object) => {
  if (!object.isMesh) return;
  const isLeaf = object.name.toLowerCase().includes('leaves');
  const sourceTriCount = triangleCount(object.geometry);
  sourceTriangles += sourceTriCount;
  if (!isLeaf) return;
  const target = 260;
  const mesh = new THREE.Mesh(
    compactGeometry(object.geometry, target),
    leafMaterial,
  );
  mesh.name = object.name;
  mesh.position.copy(object.position);
  mesh.rotation.copy(object.rotation);
  mesh.scale.copy(object.scale).multiplyScalar(0.92);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  outputTriangles += triangleCount(mesh.geometry);
  result.add(mesh);
});

function makeBranch(name, radiusTop, radiusBottom, length, start, direction) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 7, 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, trunkMaterial);
  mesh.name = name;
  const dir = direction.clone().normalize();
  const center = start.clone().addScaledVector(dir, length * 0.5);
  mesh.position.copy(center);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  outputTriangles += triangleCount(geometry);
  result.add(mesh);
}

const trunkBase = new THREE.Vector3(0, -1.68, 0);
makeBranch('authored_mangrove_trunk_main', 0.2, 0.36, 2.95, trunkBase, new THREE.Vector3(0.1, 1, -0.04));
makeBranch('authored_mangrove_trunk_split_left', 0.12, 0.22, 1.95, new THREE.Vector3(0.12, 1.1, -0.05), new THREE.Vector3(-0.5, 0.95, 0.18));
makeBranch('authored_mangrove_trunk_split_right', 0.12, 0.22, 2.15, new THREE.Vector3(0.1, 1.15, -0.03), new THREE.Vector3(0.48, 1.0, -0.1));
makeBranch('authored_mangrove_trunk_rear', 0.1, 0.18, 1.7, new THREE.Vector3(0.02, 1.5, -0.08), new THREE.Vector3(-0.04, 0.95, -0.52));
makeBranch('authored_mangrove_root_front_left', 0.07, 0.14, 1.6, trunkBase, new THREE.Vector3(-0.82, -0.16, 0.45));
makeBranch('authored_mangrove_root_front_right', 0.07, 0.14, 1.55, trunkBase, new THREE.Vector3(0.78, -0.12, 0.52));
makeBranch('authored_mangrove_root_rear_left', 0.06, 0.13, 1.45, trunkBase, new THREE.Vector3(-0.62, -0.08, -0.7));
makeBranch('authored_mangrove_root_rear_right', 0.06, 0.13, 1.5, trunkBase, new THREE.Vector3(0.68, -0.1, -0.64));
makeBranch('authored_mangrove_stilt_root_a', 0.055, 0.1, 1.9, new THREE.Vector3(-0.35, 0.65, 0.16), new THREE.Vector3(-0.42, -0.75, 0.5));
makeBranch('authored_mangrove_stilt_root_b', 0.055, 0.1, 1.85, new THREE.Vector3(0.34, 0.68, 0.04), new THREE.Vector3(0.48, -0.76, 0.38));
makeBranch('authored_mangrove_stilt_root_c', 0.045, 0.085, 1.7, new THREE.Vector3(0.08, 0.92, -0.22), new THREE.Vector3(0.24, -0.68, -0.58));

const box = new THREE.Box3().setFromObject(result);
const size = box.getSize(new THREE.Vector3());
const scale = targetHeight / Math.max(size.y, 0.0001);
result.scale.setScalar(scale);
result.updateMatrixWorld(true);

const normalizedBox = new THREE.Box3().setFromObject(result);
result.position.y -= normalizedBox.min.y;
result.position.x -= (normalizedBox.min.x + normalizedBox.max.x) * 0.5;
result.position.z -= (normalizedBox.min.z + normalizedBox.max.z) * 0.5;
result.updateMatrixWorld(true);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(result, {
  binary: true,
  trs: false,
  onlyVisible: true,
});

fs.writeFileSync(outputPath, Buffer.from(glb));
const finalBox = new THREE.Box3().setFromObject(result);
console.log(JSON.stringify({
  outputPath,
  sourceTriangles,
  outputTriangles,
  finalSize: finalBox.getSize(new THREE.Vector3()).toArray().map((value) => Number(value.toFixed(3))),
}, null, 2));
