'use client';

import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { skyState } from '../world/celestial';
import { terrainRenderSample } from '../world/terrain';
import { weatherEnv } from '../world/weatherEnvRuntime';
import { useThreeGameStore } from '../store';

function smoothstep(value, edge0, edge1) {
  return THREE.MathUtils.smoothstep(value, edge0, edge1);
}

function sourcePoint(localX, localZ, apron) {
  const yaw = apron.worldYaw || 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: apron.sourceAnchor[0] + localX * cos + localZ * sin,
    z: apron.sourceAnchor[1] - localX * sin + localZ * cos,
  };
}

function createApronGeometry(apron) {
  const bounds = apron.bounds;
  const segmentsX = apron.segmentsX || 52;
  const segmentsZ = apron.segmentsZ || 48;
  const sourceRegionId = apron.sourceRegionId;
  const anchorSample = terrainRenderSample(
    apron.sourceAnchor[0],
    apron.sourceAnchor[1],
    sourceRegionId,
  );
  const positions = [];
  const colors = [];
  const indices = [];
  const mistColor = new THREE.Color(apron.mistColor || '#93a18e');
  const color = new THREE.Color();

  for (let iz = 0; iz <= segmentsZ; iz += 1) {
    const zMix = iz / segmentsZ;
    const localZ = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, zMix);
    for (let ix = 0; ix <= segmentsX; ix += 1) {
      const xMix = ix / segmentsX;
      const localX = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, xMix);
      const source = sourcePoint(localX, localZ, apron);
      const sample = terrainRenderSample(source.x, source.z, sourceRegionId);
      const houseEdgeDistance = Math.max(
        Math.abs(localX) - (apron.houseHalfWidth || 10.5),
        Math.abs(localZ) - (apron.houseHalfDepth || 8.5),
        0,
      );
      const reliefBlend = smoothstep(
        houseEdgeDistance,
        apron.reliefStart ?? 1.4,
        apron.reliefFull ?? 12,
      );
      const localY = (apron.baseY ?? -0.12)
        + (sample.height - anchorSample.height) * (apron.reliefScale ?? 0.28) * reliefBlend;
      positions.push(localX, localY, localZ);

      const distance = Math.hypot(localX, Math.max(0, localZ - (apron.houseHalfDepth || 8.5)));
      const mist = smoothstep(distance, apron.mistStart ?? 18, apron.mistEnd ?? 44);
      color.copy(sample.color)
        .multiplyScalar(apron.colorLift ?? 1.08)
        .lerp(mistColor, mist * (apron.mistColorMix ?? 0.76));
      colors.push(color.r, color.g, color.b);
    }
  }

  const row = segmentsX + 1;
  for (let iz = 0; iz < segmentsZ; iz += 1) {
    for (let ix = 0; ix < segmentsX; ix += 1) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createApronMaterial(apron) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uInteriorApronFill = { value: 0.2 };
    shader.uniforms.uInteriorApronMist = { value: new THREE.Color(apron.mistColor || '#93a18e') };
    shader.uniforms.uInteriorApronMistStrength = { value: 0.35 };
    material.userData.shader = shader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uInteriorApronFill;
        uniform vec3 uInteriorApronMist;
        uniform float uInteriorApronMistStrength;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight += diffuseColor.rgb * uInteriorApronFill;
        outgoingLight = mix(outgoingLight, uInteriorApronMist, uInteriorApronMistStrength * 0.08);
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'interior-exterior-apron-v1';
  return material;
}

export function InteriorExteriorApron({ apron }) {
  const geometry = useMemo(() => createApronGeometry(apron), [apron]);
  const material = useMemo(() => createApronMaterial(apron), [apron]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(() => {
    const shader = material.userData.shader;
    if (!shader?.uniforms) return;
    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const weatherSoftness = THREE.MathUtils.clamp(
      weatherEnv.overcast * 0.72 + weatherEnv.mistAmount * 0.48 + weatherEnv.rainIntensity * 0.58,
      0,
      1,
    );
    shader.uniforms.uInteriorApronFill.value = celestial.daylight
      * (apron.dayFill ?? 0.46)
      * (1 - weatherEnv.lightDim * 0.22)
      + celestial.night * (apron.nightFill ?? 0.035);
    shader.uniforms.uInteriorApronMistStrength.value = THREE.MathUtils.clamp(
      (apron.baseMist ?? 0.28) + weatherSoftness * (apron.weatherMist ?? 0.56),
      0,
      1,
    );
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      receiveShadow
      castShadow={false}
      frustumCulled={false}
      renderOrder={-2}
      userData={{
        renderSource: `interior-exterior-apron:${apron.sourceRegionId}`,
        renderLabel: 'Lawson house highland exterior apron',
        renderKind: 'interior-exterior-terrain',
      }}
    />
  );
}
