'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import {
  getRegionTerrainConfig,
  terrainColor,
  terrainHeight,
} from '../../world/terrain';
import { getBorderVistas } from '../../world/vistas';
import { useThreeGameStore } from '../../store';

const EDGE_AXES = {
  north: { along: [1, 0], outward: [0, -1] },
  south: { along: [1, 0], outward: [0, 1] },
  east: { along: [0, 1], outward: [1, 0] },
  west: { along: [0, 1], outward: [-1, 0] },
  northeast: { along: [1, 1], outward: [1, -1] },
  northwest: { along: [1, -1], outward: [-1, -1] },
  southeast: { along: [1, -1], outward: [1, 1] },
  southwest: { along: [1, 1], outward: [-1, 1] },
};

const ATMOSPHERE = new THREE.Color('#b9d7de');

function normalize2([x, z]) {
  const length = Math.hypot(x, z) || 1;
  return [x / length, z / length];
}

function edgeOrigin(config, edge) {
  const halfW = config.width / 2;
  const halfD = config.depth / 2;
  if (edge.includes('north') && edge.includes('east')) return [halfW, -halfD];
  if (edge.includes('north') && edge.includes('west')) return [-halfW, -halfD];
  if (edge.includes('south') && edge.includes('east')) return [halfW, halfD];
  if (edge.includes('south') && edge.includes('west')) return [-halfW, halfD];
  if (edge === 'north') return [0, -halfD];
  if (edge === 'south') return [0, halfD];
  if (edge === 'east') return [halfW, 0];
  return [-halfW, 0];
}

function axisLength(config, edge) {
  if (edge.length > 5) return Math.min(config.width, config.depth) * 1.05;
  return edge === 'north' || edge === 'south' ? config.width : config.depth;
}

function worldPoint(origin, along, outward, alongDistance, outwardDistance) {
  return [
    origin[0] + along[0] * alongDistance + outward[0] * outwardDistance,
    origin[1] + along[1] * alongDistance + outward[1] * outwardDistance,
  ];
}

function clampToRegionEdge(config, x, z) {
  return [
    THREE.MathUtils.clamp(x, -config.width / 2, config.width / 2),
    THREE.MathUtils.clamp(z, -config.depth / 2, config.depth / 2),
  ];
}

function smoothNoise(x, z, seed = 0) {
  return Math.sin(x * 0.071 + seed * 1.7) * 0.55
    + Math.sin(z * 0.083 - seed * 2.1) * 0.45
    + Math.sin((x + z) * 0.034 + seed) * 0.35;
}

function bandAt(vista, distance) {
  return vista.bands?.find(band => distance >= band.from && distance <= band.to)
    || vista.bands?.[vista.bands.length - 1]
    || vista.bands?.[0]
    || null;
}

function profileHeight(vista, x, z, distance, t) {
  const band = bandAt(vista, distance);
  if (!band) return -0.9;
  const bandT = THREE.MathUtils.clamp((distance - band.from) / Math.max(0.001, band.to - band.from), 0, 1);
  const base = THREE.MathUtils.lerp(band.nearY, band.farY, bandT);
  const relief = smoothNoise(x, z, vista.seed || 0) * (0.18 + t * 0.42);
  return base + relief;
}

function profileColor(vista, distance, t, sideFade) {
  const band = bandAt(vista, distance);
  if (!band) return ATMOSPHERE.clone();
  const bandT = THREE.MathUtils.clamp((distance - band.from) / Math.max(0.001, band.to - band.from), 0, 1);
  const color = new THREE.Color(band.colors[0]).lerp(new THREE.Color(band.colors[1] || band.colors[0]), bandT);
  color.lerp(ATMOSPHERE, t * 0.42 + sideFade * 0.24);
  return color;
}

function makeApronGeometry(regionId, config, vista) {
  const axes = EDGE_AXES[vista.edge];
  if (!axes || vista.render === false) return null;

  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const origin = edgeOrigin(config, vista.edge);
  const width = axisLength(config, vista.edge) * (vista.apronWidthScale || 1.75);
  const depth = vista.apronDepth || 86;
  const cols = vista.edge.length > 5 ? 18 : 24;
  const rows = 16;
  const positions = [];
  const colors = [];
  const indices = [];

  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const distance = t * depth;
    const seamBlend = THREE.MathUtils.smoothstep(t, 0.0, 0.22);
    for (let col = 0; col <= cols; col += 1) {
      const u = col / cols;
      const side = Math.abs(u - 0.5) * 2;
      const sideFade = THREE.MathUtils.smoothstep(side, 0.72, 1.0);
      const alongDistance = (u - 0.5) * width;
      const [x, z] = worldPoint(origin, along, outward, alongDistance, distance);
      const [edgeX, edgeZ] = clampToRegionEdge(config, x, z);
      const edgeY = terrainHeight(edgeX, edgeZ, regionId);
      const targetY = profileHeight(vista, x, z, distance, t);
      const y = THREE.MathUtils.lerp(edgeY - sideFade * 0.8, targetY, seamBlend);

      const edgeColor = terrainColor(edgeX, edgeZ, edgeY, regionId);
      const targetColor = profileColor(vista, distance, t, sideFade);
      const color = edgeColor.lerp(targetColor, seamBlend);
      if (t > 0.86) color.lerp(ATMOSPHERE, THREE.MathUtils.smoothstep(t, 0.86, 1.0) * 0.45);

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
  }

  const stride = cols + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * stride + col;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function seededUnit(seed, index, salt = 0) {
  const n = Math.sin((seed + index * 19.19 + salt * 7.7) * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

function markerItems(config, vista, marker) {
  const axes = EDGE_AXES[vista.edge];
  if (!axes) return [];
  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const origin = edgeOrigin(config, vista.edge);
  const width = axisLength(config, vista.edge) * (vista.apronWidthScale || 1.75) * 0.72;
  const [near, far] = marker.at;
  return Array.from({ length: marker.count }, (_, index) => {
    const u = seededUnit(marker.seed, index, 1) - 0.5;
    const distance = near + seededUnit(marker.seed, index, 2) * (far - near);
    const [x, z] = worldPoint(origin, along, outward, u * width, distance);
    const y = profileHeight(vista, x, z, distance, distance / (vista.apronDepth || 86));
    const scale = marker.scale[0] + seededUnit(marker.seed, index, 3) * (marker.scale[1] - marker.scale[0]);
    return {
      id: `${marker.kind}-${index}`,
      position: [x, y + (marker.kind === 'rock' ? 0.06 : 0.28), z],
      scale,
      yaw: seededUnit(marker.seed, index, 5) * Math.PI * 2,
    };
  });
}

function VistaMarkers({ config, vista, marker }) {
  const items = useMemo(() => markerItems(config, vista, marker), [config, vista, marker]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: marker.color,
    roughness: 0.96,
    metalness: 0,
    fog: true,
  }), [marker.color]);
  if (!items.length) return null;
  return (
    <group>
      {items.map(item => (
        <mesh
          key={item.id}
          position={item.position}
          rotation={[0, item.yaw, 0]}
          scale={[item.scale, item.scale * (marker.kind === 'rock' ? 0.42 : 0.82), item.scale]}
          material={material}
          castShadow={false}
          receiveShadow={false}
        >
          {marker.kind === 'rock'
            ? <dodecahedronGeometry args={[1, 0]} />
            : <coneGeometry args={[0.5, 1.2, 5]} />}
        </mesh>
      ))}
    </group>
  );
}

function BorderVista({ regionId, config, vista }) {
  const geometry = useMemo(() => makeApronGeometry(regionId, config, vista), [regionId, config, vista]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    fog: true,
  }), []);
  if (!geometry) return null;
  return (
    <group name={`border-apron-${vista.toRegionId}`}>
      <mesh geometry={geometry} material={material} receiveShadow={false} castShadow={false} />
      {vista.markers?.map((marker, index) => (
        <VistaMarkers key={`marker-${index}`} config={config} vista={vista} marker={marker} />
      ))}
    </group>
  );
}

export function BorderVistas() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const { config, vistas } = useMemo(() => ({
    config: getRegionTerrainConfig(currentZoneId),
    vistas: getBorderVistas(currentZoneId),
  }), [currentZoneId]);

  if (!vistas.length) return null;
  return (
    <group name="border-terrain-aprons">
      {vistas.map(vista => (
        <BorderVista key={vista.id} regionId={currentZoneId} config={config} vista={vista} />
      ))}
    </group>
  );
}
