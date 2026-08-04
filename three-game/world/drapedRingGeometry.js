import * as THREE from 'three';
import { terrainHeight } from './terrain';

const TAU = Math.PI * 2;
const PROJECTION_MATRIX = new THREE.Matrix4();
const PROJECTION_INVERSE = new THREE.Matrix4();
const PROJECTION_POINT = new THREE.Vector3();

// Flat annulus in the XZ plane, outer radius 1, with enough rings and segments
// for `projectDrapedGeometry` to bend it over a slope without visible faceting.
export function createDrapedRingGeometry({
  innerRadius = 0.44,
  segments = 96,
  radialSteps = 5,
} = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let ring = 0; ring <= radialSteps; ring += 1) {
    const radius = THREE.MathUtils.lerp(innerRadius, 1, ring / radialSteps);
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * TAU;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      positions.push(x, 0, z);
      uvs.push(0.5 + x * 0.5, 0.5 + z * 0.5);
    }
  }

  for (let ring = 0; ring < radialSteps; ring += 1) {
    const current = ring * segments;
    const next = (ring + 1) * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const following = (segment + 1) % segments;
      // Winding faces upward so the ring is visible from gameplay.
      indices.push(
        current + segment,
        current + following,
        next + segment,
        current + following,
        next + following,
        next + segment,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingSphere();
  return geometry;
}

// Lifts every vertex to the terrain under it, in world space, then writes the
// result back as local Y. Meshes using this want frustumCulled={false}: the
// bounding sphere is computed from the flat geometry.
export function projectDrapedGeometry(mesh, zoneId, lift = 0.035) {
  const position = mesh?.geometry?.attributes?.position;
  if (!mesh || !position) return;
  mesh.updateWorldMatrix(true, false);
  PROJECTION_MATRIX.copy(mesh.matrixWorld);
  PROJECTION_INVERSE.copy(mesh.matrixWorld).invert();

  for (let index = 0; index < position.count; index += 1) {
    PROJECTION_POINT
      .set(position.getX(index), 0, position.getZ(index))
      .applyMatrix4(PROJECTION_MATRIX);
    PROJECTION_POINT.y = terrainHeight(PROJECTION_POINT.x, PROJECTION_POINT.z, zoneId) + lift;
    PROJECTION_POINT.applyMatrix4(PROJECTION_INVERSE);
    position.setY(index, PROJECTION_POINT.y);
  }
  position.needsUpdate = true;
}
