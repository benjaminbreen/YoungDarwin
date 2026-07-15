'use client';

import React, { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../../world/regions/materials/pbrTerrainTextures';

function configureTexture(texture, repeat) {
  if (!texture) return;
  texture.repeat.set(repeat, repeat);
}

function makeBasaltGeometry() {
  const geometry = new THREE.IcosahedronGeometry(0.78, 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const vertex = new THREE.Vector3();
  const color = new THREE.Color();
  const weathered = new THREE.Color('#9a7a5b');

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const broadChip = Math.sin(vertex.x * 7.1 + vertex.y * 4.7 - vertex.z * 5.9);
    const fineChip = Math.cos(vertex.x * 15.3 - vertex.y * 9.2 + vertex.z * 12.4);
    vertex.multiplyScalar(1 + broadChip * 0.085 + fineChip * 0.025);

    // Keep the exposure low and grounded while preserving a few broad cooling
    // planes. Surface identity now comes entirely from PBR maps, not decals.
    vertex.y = Math.max(vertex.y, -0.5);
    if (vertex.x > 0.43) vertex.x = 0.43 + (vertex.x - 0.43) * 0.18;
    if (vertex.y > 0.58) vertex.y = 0.58 + (vertex.y - 0.58) * 0.22;
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);

    const warmWeathering = THREE.MathUtils.clamp(
      0.05 + broadChip * 0.025 + (vertex.y < -0.08 ? 0.05 : 0),
      0.01,
      0.12,
    );
    color.set('#eeeae0').lerp(weathered, warmWeathering);
    const shade = THREE.MathUtils.clamp(0.94 + fineChip * 0.025, 0.88, 0.99);
    colors[index * 3] = color.r * shade;
    colors[index * 3 + 1] = color.g * shade;
    colors[index * 3 + 2] = color.b * shade;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeMappedMaterial(textures, {
  normalStrength,
  roughness,
  color = '#ffffff',
} = {}) {
  return new THREE.MeshStandardMaterial({
    map: textures.albedo,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    roughnessMap: textures.roughness,
    vertexColors: true,
    color,
    roughness,
    metalness: 0,
    flatShading: true,
  });
}

export function BasaltSpecimenShape() {
  const olivineTextures = useMemo(() => {
    const textures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.galapagosOlivineBasalt);
    configureTexture(textures.albedo, 1.08);
    configureTexture(textures.normal, 1.08);
    configureTexture(textures.roughness, 1.08);
    return textures;
  }, []);
  const darkBasaltTextures = useMemo(() => {
    const textures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.darkBasaltGravel);
    configureTexture(textures.albedo, 1.45);
    configureTexture(textures.normal, 1.65);
    configureTexture(textures.roughness, 1.45);
    return textures;
  }, []);
  const geometry = useMemo(() => makeBasaltGeometry(), []);
  const olivineMaterial = useMemo(() => makeMappedMaterial(olivineTextures, {
    normalStrength: 0.54,
    roughness: 0.82,
  }), [olivineTextures]);
  const darkBasaltMaterial = useMemo(() => makeMappedMaterial(darkBasaltTextures, {
    normalStrength: 0.38,
    roughness: 0.91,
    color: '#c2beb2',
  }), [darkBasaltTextures]);

  useLayoutEffect(() => () => {
    geometry.dispose();
    olivineMaterial.dispose();
    darkBasaltMaterial.dispose();
    disposePbrTerrainSet(olivineTextures);
    disposePbrTerrainSet(darkBasaltTextures);
  }, [darkBasaltMaterial, darkBasaltTextures, geometry, olivineMaterial, olivineTextures]);

  return (
    <group>
      <mesh
        geometry={geometry}
        material={olivineMaterial}
        position={[0.08, 0.33, 0]}
        scale={[0.84, 0.61, 0.74]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={geometry}
        material={darkBasaltMaterial}
        position={[-0.38, 0.22, 0.1]}
        rotation={[0.06, 0.7, 0.08]}
        scale={[0.43, 0.35, 0.48]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={geometry}
        material={olivineMaterial}
        position={[0.37, 0.105, -0.48]}
        rotation={[0.35, -0.5, 0.58]}
        scale={[0.16, 0.13, 0.19]}
        castShadow
        receiveShadow
      />
    </group>
  );
}
