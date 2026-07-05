'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const LEG_CONFIGS = [
  { key: 'front-left', side: -1, fore: true, x: -0.48, z: 0.48, phase: 0 },
  { key: 'rear-right', side: 1, fore: false, x: 0.5, z: -0.46, phase: 0 },
  { key: 'front-right', side: 1, fore: true, x: 0.48, z: 0.48, phase: Math.PI },
  { key: 'rear-left', side: -1, fore: false, x: -0.5, z: -0.46, phase: Math.PI },
];

const RING_COUNT = 52;
const RADIAL_SEGMENTS = 144;

function damp(current, target, lambda, delta) {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

function smoothPulse(value, start, peak, end) {
  if (value <= start || value >= end) return 0;
  if (value < peak) return THREE.MathUtils.smoothstep(value, start, peak);
  return 1 - THREE.MathUtils.smoothstep(value, peak, end);
}

function pseudoRandom(index) {
  const x = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function makeCanvasTexture(size, draw, colorSpace = THREE.SRGBColorSpace) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createShellAlbedoTexture() {
  return makeCanvasTexture(768, (ctx, size) => {
    const gradient = ctx.createRadialGradient(size * 0.5, size * 0.48, size * 0.05, size * 0.5, size * 0.52, size * 0.58);
    gradient.addColorStop(0, '#887f62');
    gradient.addColorStop(0.46, '#5c5944');
    gradient.addColorStop(1, '#2f2e26');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 3200; i += 1) {
      const x = pseudoRandom(i) * size;
      const y = pseudoRandom(i + 19) * size;
      const alpha = 0.025 + pseudoRandom(i + 47) * 0.075;
      const radius = 1.2 + pseudoRandom(i + 83) * 2.8;
      ctx.fillStyle = pseudoRandom(i + 7) > 0.52
        ? `rgba(186,166,105,${alpha})`
        : `rgba(32,30,24,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.5, radius, pseudoRandom(i + 3) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const lines = [
      [[0.5, 0.08], [0.47, 0.29], [0.5, 0.5], [0.48, 0.72], [0.5, 0.93]],
      [[0.26, 0.16], [0.38, 0.33], [0.31, 0.52], [0.38, 0.72], [0.28, 0.88]],
      [[0.74, 0.16], [0.62, 0.33], [0.69, 0.52], [0.62, 0.72], [0.72, 0.88]],
      [[0.15, 0.42], [0.34, 0.42], [0.5, 0.5], [0.66, 0.42], [0.85, 0.42]],
      [[0.18, 0.66], [0.35, 0.61], [0.5, 0.72], [0.65, 0.61], [0.82, 0.66]],
      [[0.21, 0.24], [0.37, 0.3], [0.5, 0.2], [0.63, 0.3], [0.79, 0.24]],
    ];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    lines.forEach((points, index) => {
      ctx.strokeStyle = index < 3 ? 'rgba(35,33,27,0.78)' : 'rgba(47,44,34,0.58)';
      ctx.lineWidth = index < 3 ? size * 0.011 : size * 0.008;
      ctx.beginPath();
      points.forEach(([x, y], pIndex) => {
        if (pIndex === 0) ctx.moveTo(x * size, y * size);
        else ctx.lineTo(x * size, y * size);
      });
      ctx.stroke();
      ctx.strokeStyle = 'rgba(195,173,114,0.16)';
      ctx.lineWidth = size * 0.003;
      ctx.stroke();
    });

    ctx.strokeStyle = 'rgba(23,22,18,0.32)';
    ctx.lineWidth = size * 0.0035;
    for (let i = 0; i < 130; i += 1) {
      const x = pseudoRandom(i + 500) * size;
      const y = pseudoRandom(i + 620) * size;
      const len = 18 + pseudoRandom(i + 710) * 54;
      const angle = pseudoRandom(i + 830) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(angle + 0.4) * len * 0.45,
        y + Math.sin(angle + 0.4) * len * 0.45,
        x + Math.cos(angle) * len,
        y + Math.sin(angle) * len,
      );
      ctx.stroke();
    }
  });
}

function createShellBumpTexture() {
  return makeCanvasTexture(768, (ctx, size) => {
    ctx.fillStyle = '#777';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4200; i += 1) {
      const v = 104 + Math.floor(pseudoRandom(i + 2000) * 64);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(pseudoRandom(i) * size, pseudoRandom(i + 31) * size, 1.4, 1.4);
    }
    ctx.strokeStyle = '#d7d7d7';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.009;
    [
      [[0.5, 0.08], [0.47, 0.29], [0.5, 0.5], [0.48, 0.72], [0.5, 0.93]],
      [[0.26, 0.16], [0.38, 0.33], [0.31, 0.52], [0.38, 0.72], [0.28, 0.88]],
      [[0.74, 0.16], [0.62, 0.33], [0.69, 0.52], [0.62, 0.72], [0.72, 0.88]],
      [[0.15, 0.42], [0.34, 0.42], [0.5, 0.5], [0.66, 0.42], [0.85, 0.42]],
      [[0.18, 0.66], [0.35, 0.61], [0.5, 0.72], [0.65, 0.61], [0.82, 0.66]],
      [[0.21, 0.24], [0.37, 0.3], [0.5, 0.2], [0.63, 0.3], [0.79, 0.24]],
    ].forEach(points => {
      ctx.beginPath();
      points.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x * size, y * size);
        else ctx.lineTo(x * size, y * size);
      });
      ctx.stroke();
    });
  }, THREE.NoColorSpace);
}

function createSkinTexture() {
  return makeCanvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#756f5a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2200; i += 1) {
      const x = pseudoRandom(i + 4000) * size;
      const y = pseudoRandom(i + 4100) * size;
      const r = 1.4 + pseudoRandom(i + 4200) * 3.8;
      const alpha = 0.04 + pseudoRandom(i + 4300) * 0.1;
      ctx.fillStyle = pseudoRandom(i + 4400) > 0.46
        ? `rgba(173,161,124,${alpha})`
        : `rgba(48,44,34,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.25, r, pseudoRandom(i + 4500) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(50,46,34,0.24)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 190; i += 1) {
      const x = pseudoRandom(i + 5000) * size;
      const y = pseudoRandom(i + 5100) * size;
      const len = 14 + pseudoRandom(i + 5200) * 36;
      const angle = pseudoRandom(i + 5300) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(angle + 0.6) * len * 0.4,
        y + Math.sin(angle + 0.6) * len * 0.4,
        x + Math.cos(angle) * len,
        y + Math.sin(angle) * len,
      );
      ctx.stroke();
    }
  });
}

function createSkinBumpTexture() {
  return makeCanvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i += 1) {
      const v = 95 + Math.floor(pseudoRandom(i + 6000) * 80);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.ellipse(
        pseudoRandom(i + 6100) * size,
        pseudoRandom(i + 6200) * size,
        1 + pseudoRandom(i + 6300) * 2,
        0.8 + pseudoRandom(i + 6400) * 1.8,
        pseudoRandom(i + 6500) * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }, THREE.NoColorSpace);
}

function createShellGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let rIndex = 0; rIndex <= RING_COUNT; rIndex += 1) {
    const r = rIndex / RING_COUNT;
    for (let seg = 0; seg <= RADIAL_SEGMENTS; seg += 1) {
      const theta = (seg / RADIAL_SEGMENTS) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const front = THREE.MathUtils.smoothstep(sin, 0.22, 0.95);
      const rear = THREE.MathUtils.smoothstep(-sin, 0.26, 0.95);
      const sidePinch = 1 - Math.abs(cos) * front * 0.08;
      const halfWidth = 0.66 * sidePinch * (1 + rear * 0.035);
      const halfLength = 0.94 * (1 - front * 0.035 + rear * 0.015);
      const x = cos * r * halfWidth;
      const z = sin * r * halfLength;
      const dome = Math.pow(Math.max(0, 1 - Math.pow(r, 2.05)), 0.52) * 0.66;
      const shoulderCrown = Math.exp(-((r - 0.38) * (r - 0.38)) / 0.12) * 0.055;
      const saddleRise = front * (0.055 + (1 - Math.abs(cos)) * 0.055) * Math.pow(r, 0.72);
      const rearFall = rear * 0.025 * r;
      const edgeDrop = THREE.MathUtils.smoothstep(r, 0.84, 1) * 0.045;
      const y = 0.3 + dome + shoulderCrown + saddleRise - rearFall - edgeDrop;
      positions.push(x, y, z);
      normals.push(0, 1, 0);
      uvs.push((cos * r + 1) * 0.5, 1 - (sin * r + 1) * 0.5);
    }
  }

  const row = RADIAL_SEGMENTS + 1;
  for (let rIndex = 0; rIndex < RING_COUNT; rIndex += 1) {
    for (let seg = 0; seg < RADIAL_SEGMENTS; seg += 1) {
      const a = rIndex * row + seg;
      const b = a + 1;
      const c = (rIndex + 1) * row + seg;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createFootGeometry({ fore }) {
  const direction = fore ? 1 : -1;
  const ringCount = 18;
  const segmentCount = 56;
  const halfWidth = fore ? 0.17 : 0.145;
  const halfLength = fore ? 0.265 : 0.22;
  const height = fore ? 0.145 : 0.125;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let rIndex = 0; rIndex <= ringCount; rIndex += 1) {
    const r = rIndex / ringCount;
    for (let seg = 0; seg <= segmentCount; seg += 1) {
      const theta = (seg / segmentCount) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const forward = direction * sin;
      const toe = THREE.MathUtils.smoothstep(forward, 0.18, 0.92);
      const heel = THREE.MathUtils.smoothstep(-forward, 0.22, 0.92);
      const side = Math.abs(cos);
      const toeSquareness = toe * Math.pow(side, 2.4) * 0.22;
      const width = halfWidth * (1 + toe * 0.24 - heel * 0.1 - side * toe * 0.04);
      const length = halfLength * (1 + toe * 0.08 - heel * 0.05);
      const x = cos * r * width * (1 - toeSquareness);
      const z = direction * (forward * r * length + toe * r * 0.028 - heel * r * 0.018);
      const dome = Math.pow(Math.max(0, 1 - Math.pow(r, 1.75)), 0.55) * height;
      const sideDrop = THREE.MathUtils.smoothstep(r, 0.76, 1) * 0.042;
      const toeKnuckle = toe * Math.exp(-((r - 0.74) * (r - 0.74)) / 0.026) * (fore ? 0.026 : 0.018);
      const heelFlatten = heel * r * 0.014;
      const crease = Math.sin(theta * 5 + (fore ? 0.2 : 1.1)) * Math.pow(r, 1.5) * 0.004;
      const y = -0.074 + dome - sideDrop + toeKnuckle - heelFlatten + crease;
      positions.push(x, y, z);
      uvs.push((cos * r + 1) * 0.5, (sin * r + 1) * 0.5);
    }
  }

  const row = segmentCount + 1;
  for (let rIndex = 0; rIndex < ringCount; rIndex += 1) {
    for (let seg = 0; seg < segmentCount; seg += 1) {
      const a = rIndex * row + seg;
      const b = a + 1;
      const c = (rIndex + 1) * row + seg;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const bottomCenterIndex = positions.length / 3;
  positions.push(0, -0.084, direction * -0.01);
  uvs.push(0.5, 0.5);
  const perimeterStart = ringCount * row;
  for (let seg = 0; seg < segmentCount; seg += 1) {
    const a = perimeterStart + seg;
    const b = perimeterStart + seg + 1;
    indices.push(bottomCenterIndex, a, b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLowerLegGeometry({ fore }) {
  const ringCount = 20;
  const segmentCount = 40;
  const height = fore ? 0.42 : 0.38;
  const topY = height * 0.5;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let yIndex = 0; yIndex <= ringCount; yIndex += 1) {
    const v = yIndex / ringCount;
    const bottom = THREE.MathUtils.smoothstep(v, 0.34, 1);
    const knee = Math.sin(v * Math.PI);
    const y = topY - v * height;
    for (let seg = 0; seg <= segmentCount; seg += 1) {
      const theta = (seg / segmentCount) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const front = Math.max(0, sin);
      const rear = Math.max(0, -sin);
      const side = Math.abs(cos);
      const rx = (fore ? 0.09 : 0.081) + bottom * (fore ? 0.045 : 0.032) + knee * 0.012;
      const rz = (fore ? 0.104 : 0.094) + bottom * (fore ? 0.034 : 0.025) + front * bottom * 0.012 - rear * bottom * 0.006;
      const wrinkle = Math.sin(theta * 6 + v * 5.2) * Math.sin(v * Math.PI) * 0.006;
      const flatFront = front * bottom * side * 0.012;
      positions.push(
        cos * (rx + wrinkle) * (1 - flatFront),
        y + Math.sin(theta * 3.5) * knee * 0.003,
        sin * (rz + wrinkle * 0.7),
      );
      uvs.push(seg / segmentCount, v);
    }
  }

  const row = segmentCount + 1;
  for (let yIndex = 0; yIndex < ringCount; yIndex += 1) {
    for (let seg = 0; seg < segmentCount; seg += 1) {
      const a = yIndex * row + seg;
      const b = a + 1;
      const c = (yIndex + 1) * row + seg;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const topCenterIndex = positions.length / 3;
  positions.push(0, topY, 0);
  uvs.push(0.5, 0);
  for (let seg = 0; seg < segmentCount; seg += 1) {
    indices.push(topCenterIndex, seg + 1, seg);
  }

  const bottomCenterIndex = positions.length / 3;
  positions.push(0, topY - height, 0);
  uvs.push(0.5, 1);
  const bottomStart = ringCount * row;
  for (let seg = 0; seg < segmentCount; seg += 1) {
    indices.push(bottomCenterIndex, bottomStart + seg, bottomStart + seg + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLegRefs() {
  return LEG_CONFIGS.map(() => ({
    pivot: React.createRef(),
    shoulder: React.createRef(),
    upper: React.createRef(),
    lower: React.createRef(),
    foot: React.createRef(),
  }));
}

function SeedPebble({ position, scale, material }) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={[0.12, 0.4, -0.18]} scale={scale} material={material}>
      <dodecahedronGeometry args={[1, 1]} />
    </mesh>
  );
}

function ScaleNodule({ position, scale, material, rotation = [0.1, 0.25, -0.12] }) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation} scale={scale} material={material}>
      <dodecahedronGeometry args={[1, 1]} />
    </mesh>
  );
}

function NeckWrinkles({ material }) {
  return [0.025, 0.095, 0.165, 0.235, 0.305, 0.375].map((z, index) => (
    <mesh
      key={`neck-wrinkle-${index}`}
      castShadow
      receiveShadow
      position={[0, -0.006 - index * 0.002, z]}
      scale={[1, 0.68 + index * 0.018, 1]}
      material={material}
    >
      <torusGeometry args={[0.079 + index * 0.003, 0.0038, 8, 42]} />
    </mesh>
  ));
}

function ShinScaleNodules({ config, material }) {
  const direction = config.fore ? 1 : -1;
  const rows = config.fore
    ? [
      { y: 0.045, z: 0.112, width: 0.07, count: 2, size: 0.018 },
      { y: -0.025, z: 0.118, width: 0.098, count: 3, size: 0.017 },
      { y: -0.095, z: 0.098, width: 0.078, count: 2, size: 0.016 },
    ]
    : [
      { y: 0.035, z: 0.088, width: 0.064, count: 2, size: 0.016 },
      { y: -0.04, z: 0.092, width: 0.078, count: 2, size: 0.015 },
    ];

  return (
    <group>
      {rows.flatMap((row, rowIndex) => Array.from({ length: row.count }, (_, index) => {
        const t = row.count === 1 ? 0.5 : index / (row.count - 1);
        const stagger = (rowIndex % 2 === 0 ? 0.5 : -0.5) * row.size * 0.28;
        const x = THREE.MathUtils.lerp(-row.width * 0.5, row.width * 0.5, t) + stagger;
        return (
          <ScaleNodule
            key={`${config.key}-shin-scale-${rowIndex}-${index}`}
            position={[x, row.y, direction * row.z]}
            rotation={[0.18, config.side * 0.22, config.side * -0.08]}
            scale={[row.size * 1.08, row.size * 0.5, row.size * 0.82]}
            material={material}
          />
        );
      }))}
      {[-0.06, 0.02].map((y, index) => (
        <ScaleNodule
          key={`${config.key}-outer-scale-${index}`}
          position={[config.side * 0.097, y, direction * (0.02 + index * 0.018)]}
          rotation={[0.04, config.side * 0.72, config.side * 0.12]}
          scale={[0.016, 0.01, 0.014]}
          material={material}
        />
      ))}
    </group>
  );
}

function FootScaleNodules({ config, material }) {
  const direction = config.fore ? 1 : -1;
  const rows = config.fore
    ? [
      { z: 0.148, width: 0.14, count: 4, size: 0.015 },
      { z: 0.073, width: 0.095, count: 3, size: 0.014 },
    ]
    : [
      { z: 0.118, width: 0.105, count: 3, size: 0.014 },
    ];

  return rows.flatMap((row, rowIndex) => Array.from({ length: row.count }, (_, index) => {
    const t = row.count === 1 ? 0.5 : index / (row.count - 1);
    const x = THREE.MathUtils.lerp(-row.width * 0.5, row.width * 0.5, t);
    return (
      <ScaleNodule
        key={`${config.key}-foot-scale-${rowIndex}-${index}`}
        position={[x, 0.058 - rowIndex * 0.005, direction * row.z]}
        rotation={[0.08, config.side * 0.18, config.side * -0.05]}
        scale={[row.size * 1.08, row.size * 0.42, row.size * 0.86]}
        material={material}
      />
    );
  }));
}

function TortoiseToeKnuckles({ config, materials }) {
  const direction = config.fore ? 1 : -1;
  const offsets = config.fore ? [-0.112, -0.056, 0, 0.056, 0.112] : [-0.074, -0.025, 0.025, 0.074];
  const maxOffset = config.fore ? 0.112 : 0.074;
  return offsets.map((offset, index) => {
    const outer = Math.abs(offset) / maxOffset;
    const toeScale = config.fore
      ? [0.034 - outer * 0.004, 0.021, 0.046 - outer * 0.004]
      : [0.028 - outer * 0.003, 0.018, 0.038 - outer * 0.003];
    return (
      <group
        key={`${config.key}-toe-${index}`}
        position={[
          offset,
          0.026 - outer * 0.004,
          direction * ((config.fore ? 0.19 : 0.151) - outer * 0.012),
        ]}
      >
        <mesh castShadow receiveShadow scale={toeScale} material={materials.skinDark}>
          <sphereGeometry args={[1, 22, 10]} />
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[0, -0.048, direction * (config.fore ? 0.06 : 0.052)]}
          rotation={[direction > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0]}
          material={materials.claw}
        >
          <coneGeometry args={[config.fore ? 0.013 : 0.011, config.fore ? 0.052 : 0.044, 12]} />
        </mesh>
      </group>
    );
  });
}

function TortoiseClaws({ config, material }) {
  const direction = config.fore ? 1 : -1;
  const offsets = config.fore ? [-0.105, -0.052, 0, 0.052, 0.105] : [-0.075, -0.025, 0.025, 0.075];
  return offsets.map((offset, index) => (
    <mesh
      key={`${config.key}-claw-${index}`}
      castShadow
      receiveShadow
      position={[offset, -0.012, direction * (config.fore ? 0.255 : 0.205)]}
      rotation={[direction > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0]}
      material={material}
    >
      <coneGeometry args={[config.fore ? 0.018 : 0.016, config.fore ? 0.068 : 0.058, 12]} />
    </mesh>
  ));
}

function TortoiseLeg({ refs, config, materials, geometries }) {
  const footZ = config.fore ? 0.12 : -0.1;
  const footGeometry = config.fore ? geometries.frontFoot : geometries.rearFoot;
  const lowerLegGeometry = config.fore ? geometries.frontLowerLeg : geometries.rearLowerLeg;
  return (
    <group ref={refs.pivot} position={[config.x, 0.27, config.z]}>
      <mesh ref={refs.shoulder} castShadow receiveShadow position={[0, 0.018, 0]} scale={[0.178, 0.145, 0.205]} material={materials.skinDark}>
        <sphereGeometry args={[1, 28, 16]} />
      </mesh>
      <group ref={refs.upper} position={[0, -0.06, 0]} rotation={[0, 0, config.side * 0.34]}>
        <mesh castShadow receiveShadow scale={[0.13, 0.235, 0.152]} material={materials.skin}>
          <capsuleGeometry args={[1, 0.86, 14, 28]} />
        </mesh>
      </group>
      <group ref={refs.lower} position={[config.side * 0.02, -0.22, footZ * 0.42]} rotation={[0.12, 0, config.side * 0.14]}>
        <mesh castShadow receiveShadow geometry={lowerLegGeometry} material={materials.skin} />
        <ShinScaleNodules config={config} material={materials.scaleNodule} />
      </group>
      <group ref={refs.foot} position={[0, -0.34, footZ]} rotation={[0.08, 0, config.side * 0.05]}>
        <mesh castShadow receiveShadow geometry={footGeometry} material={materials.skinDark} />
        <FootScaleNodules config={config} material={materials.scaleNodule} />
        <TortoiseToeKnuckles config={config} materials={materials} />
      </group>
    </group>
  );
}

export function ProceduralTortoisePlayer({ motionRef }) {
  const rootRef = useRef(null);
  const shellRef = useRef(null);
  const bodyRef = useRef(null);
  const plastronRef = useRef(null);
  const neckRef = useRef(null);
  const headRef = useRef(null);
  const jawRef = useRef(null);
  const leftEyeRef = useRef(null);
  const rightEyeRef = useRef(null);
  const leftLidRef = useRef(null);
  const rightLidRef = useRef(null);
  const throatRef = useRef(null);
  const tailRef = useRef(null);
  const droppingRef = useRef(null);
  const legRefs = useMemo(createLegRefs, []);
  const blendRef = useRef({
    walk: 0,
    sleep: 0,
    eat: 0,
    defecate: 0,
    idleShift: 0,
  });

  const geometry = useMemo(() => ({
    shell: createShellGeometry(),
    frontFoot: createFootGeometry({ fore: true }),
    rearFoot: createFootGeometry({ fore: false }),
    frontLowerLeg: createLowerLegGeometry({ fore: true }),
    rearLowerLeg: createLowerLegGeometry({ fore: false }),
  }), []);

  const textures = useMemo(() => ({
    shellAlbedo: createShellAlbedoTexture(),
    shellBump: createShellBumpTexture(),
    skinAlbedo: createSkinTexture(),
    skinBump: createSkinBumpTexture(),
  }), []);

  const materials = useMemo(() => ({
	    shell: new THREE.MeshPhysicalMaterial({
	      map: textures.shellAlbedo,
	      bumpMap: textures.shellBump,
	      bumpScale: 0.038,
	      color: '#b9aa7d',
	      roughness: 0.61,
	      metalness: 0,
	      clearcoat: 0.3,
	      clearcoatRoughness: 0.8,
	      envMapIntensity: 0.4,
	    }),
	    shellEdge: new THREE.MeshPhysicalMaterial({
	      color: '#28271f',
	      roughness: 0.72,
	      metalness: 0,
	      clearcoat: 0.18,
	      clearcoatRoughness: 0.84,
	      envMapIntensity: 0.25,
	    }),
    skin: new THREE.MeshStandardMaterial({
	      map: textures.skinAlbedo,
	      bumpMap: textures.skinBump,
	      bumpScale: 0.029,
	      color: '#968c6b',
	      roughness: 0.86,
	      metalness: 0,
	      envMapIntensity: 0.18,
	    }),
	    skinDark: new THREE.MeshStandardMaterial({
	      map: textures.skinAlbedo,
	      bumpMap: textures.skinBump,
	      bumpScale: 0.024,
	      color: '#5f5741',
	      roughness: 0.9,
	      metalness: 0,
	      envMapIntensity: 0.12,
	    }),
	    skinLight: new THREE.MeshStandardMaterial({
	      map: textures.skinAlbedo,
	      bumpMap: textures.skinBump,
	      bumpScale: 0.018,
	      color: '#aca07a',
	      roughness: 0.84,
	      metalness: 0,
	      envMapIntensity: 0.15,
	    }),
	    scaleNodule: new THREE.MeshStandardMaterial({
	      color: '#4e4635',
	      roughness: 0.92,
	      metalness: 0,
	      envMapIntensity: 0.05,
	    }),
	    plastron: new THREE.MeshStandardMaterial({
	      color: '#a99870',
	      roughness: 0.74,
	      metalness: 0,
	      envMapIntensity: 0.18,
	    }),
    eye: new THREE.MeshPhysicalMaterial({
      color: '#050403',
      roughness: 0.22,
      clearcoat: 0.75,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.58,
    }),
    eyeGlint: new THREE.MeshBasicMaterial({ color: '#fff2bf' }),
	    claw: new THREE.MeshStandardMaterial({
	      color: '#1c1914',
	      roughness: 0.54,
	      metalness: 0.02,
	      envMapIntensity: 0.18,
	    }),
	    beak: new THREE.MeshStandardMaterial({
	      color: '#28231b',
	      roughness: 0.68,
	      metalness: 0,
	      envMapIntensity: 0.16,
	    }),
    dropping: new THREE.MeshStandardMaterial({
      color: '#2e2518',
      roughness: 0.96,
      metalness: 0,
    }),
  }), [textures]);

  useFrame(({ clock }, delta) => {
    const root = rootRef.current;
    const shell = shellRef.current;
    const body = bodyRef.current;
    const plastron = plastronRef.current;
    const neck = neckRef.current;
    const head = headRef.current;
    const jaw = jawRef.current;
    const throat = throatRef.current;
    const tail = tailRef.current;
    const dropping = droppingRef.current;
    if (!root || !shell || !body || !neck || !head || !tail) return;

    const motion = motionRef.current || {};
    const now = clock.elapsedTime;
    const speed = Math.max(0, motion.speed || 0);
    const action = motion.action || null;
    const sleeping = action === 'animalSleep' || motion.lying;
    const eating = action === 'animalEat';
    const defecating = action === 'animalDefecate';
    const speedT = THREE.MathUtils.clamp(speed / 0.86, 0, 1.25);
    const moving = speed > 0.035 && !sleeping && !eating && !defecating;
    const actionStart = motion.actionStartedAt || now;
    const actionEnd = motion.actionUntil || now;
    const actionDuration = Math.max(0.001, actionEnd - actionStart);
    const actionT = THREE.MathUtils.clamp((performance.now() / 1000 - actionStart) / actionDuration, 0, 1);
    const blends = blendRef.current;
    blends.walk = damp(blends.walk, moving ? 1 : 0, 4.5, delta);
    blends.sleep = damp(blends.sleep, sleeping ? 1 : 0, 2.8, delta);
    blends.eat = damp(blends.eat, eating ? 1 : 0, 5.5, delta);
    blends.defecate = damp(blends.defecate, defecating ? 1 : 0, 6, delta);
    blends.idleShift = damp(blends.idleShift, !moving && !sleeping && !eating && !defecating ? 1 : 0, 1.8, delta);

    const strideRate = 1.42 + speedT * 1.35;
    const stride = now * strideRate;
    const shellSway = Math.sin(stride) * blends.walk;
    const shellLift = Math.abs(Math.sin(stride)) * blends.walk;
    const breathing = Math.sin(now * 1.15) * 0.5 + 0.5;
    const idleLook = Math.sin(now * 0.42) * blends.idleShift;
    const idleNod = Math.sin(now * 0.31 + 0.6) * blends.idleShift;
    const chew = Math.max(0, Math.sin(now * 7.8)) * blends.eat;
    const blinkWindow = (now + Math.sin(now * 0.17) * 0.9) % 5.7;
    const blink = Math.max(blends.sleep, blinkWindow > 5.42 ? Math.sin(((blinkWindow - 5.42) / 0.28) * Math.PI) : 0);
    const tailLift = smoothPulse(actionT, 0.08, 0.42, 0.9) * blends.defecate;

    root.position.y = damp(root.position.y, blends.sleep * -0.065 + shellLift * 0.022 + chew * 0.008, 7, delta);
    root.scale.y = damp(root.scale.y, 1 - blends.sleep * 0.08 + breathing * 0.01, 5, delta);
    root.rotation.x = damp(root.rotation.x, blends.eat * 0.035 + blends.defecate * -0.025, 5, delta);

    shell.position.y = damp(shell.position.y, 0.02 - blends.sleep * 0.035 + shellLift * 0.012, 6, delta);
    shell.rotation.x = damp(shell.rotation.x, blends.eat * -0.08 + blends.sleep * 0.035 + blends.defecate * -0.03 + shellSway * 0.018, 8, delta);
    shell.rotation.z = damp(shell.rotation.z, shellSway * 0.035, 8, delta);
    shell.scale.set(
      damp(shell.scale.x, 1 + breathing * 0.006, 5, delta),
      damp(shell.scale.y, 1 + breathing * 0.012 - blends.sleep * 0.035, 5, delta),
      damp(shell.scale.z, 1 + breathing * 0.004, 5, delta),
    );

    body.position.y = damp(body.position.y, 0.3 - blends.sleep * 0.045, 6, delta);
    body.rotation.x = damp(body.rotation.x, blends.eat * -0.04 + shellSway * 0.012, 7, delta);
    if (plastron) {
      plastron.position.y = damp(plastron.position.y, 0.245 - blends.sleep * 0.035, 6, delta);
    }

    neck.position.y = damp(neck.position.y, 0.395 - blends.sleep * 0.105 - blends.eat * 0.065, 6, delta);
    neck.position.z = damp(neck.position.z, 0.51 - blends.sleep * 0.14 + blends.eat * 0.14, 6, delta);
    neck.rotation.x = damp(neck.rotation.x, blends.eat * 0.62 + blends.sleep * -0.18 + idleNod * 0.045, 7, delta);
    neck.rotation.y = damp(neck.rotation.y, idleLook * 0.28, 3.2, delta);
    neck.scale.z = damp(neck.scale.z, 1 + blends.eat * 0.22 - blends.sleep * 0.2, 5, delta);

    head.position.y = damp(head.position.y, 0.025 - blends.eat * 0.032 - blends.sleep * 0.035, 7, delta);
    head.position.z = damp(head.position.z, 0.48 + blends.eat * 0.055 - blends.sleep * 0.13, 7, delta);
    head.rotation.x = damp(head.rotation.x, blends.eat * 0.16 - chew * 0.035 + blends.sleep * 0.08 + idleNod * 0.035, 8, delta);
    head.rotation.y = damp(head.rotation.y, idleLook * 0.18, 4, delta);
    head.rotation.z = damp(head.rotation.z, shellSway * -0.02, 7, delta);

    if (jaw) {
      jaw.rotation.x = damp(jaw.rotation.x, chew * 0.42 + blends.eat * 0.08, 12, delta);
    }
    if (throat) {
      const throatPulse = 1 + breathing * 0.035 + chew * 0.06;
      throat.scale.set(
        damp(throat.scale.x, 0.095 * throatPulse, 8, delta),
        damp(throat.scale.y, 0.067 * throatPulse, 8, delta),
        damp(throat.scale.z, 0.075 * throatPulse, 8, delta),
      );
    }

    [leftEyeRef.current, rightEyeRef.current].forEach(eye => {
      if (!eye) return;
      eye.scale.y = damp(eye.scale.y, 0.02 * Math.max(0.12, 1 - blink * 0.9), 18, delta);
    });
    [leftLidRef.current, rightLidRef.current].forEach(lid => {
      if (!lid) return;
      lid.visible = blink > 0.04;
      lid.scale.y = damp(lid.scale.y, 0.008 + blink * 0.022, 18, delta);
    });

    tail.position.y = damp(tail.position.y, 0.28 - blends.sleep * 0.06 + tailLift * 0.035, 8, delta);
    tail.rotation.x = damp(tail.rotation.x, blends.sleep * -0.25 + tailLift * 0.95, 7, delta);
    tail.rotation.z = damp(tail.rotation.z, shellSway * -0.025, 7, delta);

    legRefs.forEach((refs, index) => {
      const config = LEG_CONFIGS[index];
      const pivot = refs.pivot.current;
      const shoulder = refs.shoulder.current;
      const upper = refs.upper.current;
      const lower = refs.lower.current;
      const foot = refs.foot.current;
      if (!pivot || !upper || !lower || !foot) return;

      const phase = stride + config.phase;
      const sin = Math.sin(phase);
      const cos = Math.cos(phase);
      const lift = Math.max(0, sin) * blends.walk;
      const plant = Math.max(0, -sin) * blends.walk;
      const foreSign = config.fore ? 1 : -1;
      const retract = blends.sleep;
      const grazeBrace = blends.eat * (config.fore ? 1 : 0.25);
      const defecateBrace = blends.defecate * (config.fore ? 0.25 : 1);

      pivot.position.x = damp(pivot.position.x, config.x * (1 - retract * 0.16), 8, delta);
      pivot.position.y = damp(pivot.position.y, 0.27 - retract * 0.04 + lift * 0.028, 8, delta);
      pivot.position.z = damp(
        pivot.position.z,
        config.z + retract * (config.fore ? -0.12 : 0.12) + grazeBrace * (config.fore ? 0.035 : -0.02),
        8,
        delta,
      );
      pivot.rotation.x = damp(
        pivot.rotation.x,
        blends.walk * sin * (config.fore ? 0.22 : 0.18)
          + retract * (config.fore ? 0.46 : -0.32)
          + grazeBrace * -0.1
          + defecateBrace * (config.fore ? -0.06 : 0.18),
        9,
        delta,
      );
      pivot.rotation.z = damp(
        pivot.rotation.z,
        config.side * (0.18 + retract * 0.42 + plant * 0.045 - lift * 0.035),
        9,
        delta,
      );

      if (shoulder) {
        shoulder.scale.set(
          damp(shoulder.scale.x, 0.178 + plant * 0.012, 9, delta),
          damp(shoulder.scale.y, 0.145 - lift * 0.008, 9, delta),
          damp(shoulder.scale.z, 0.205 + plant * 0.014, 9, delta),
        );
      }
      upper.rotation.x = damp(upper.rotation.x, foreSign * (0.06 + cos * 0.11 * blends.walk) - retract * 0.16, 9, delta);
      upper.rotation.z = damp(upper.rotation.z, config.side * (0.34 + plant * 0.08 + retract * 0.2), 9, delta);
      lower.rotation.x = damp(lower.rotation.x, -foreSign * (0.1 + lift * 0.32) + retract * 0.28, 9, delta);
      lower.rotation.z = damp(lower.rotation.z, config.side * (0.14 + lift * 0.07), 9, delta);
      foot.position.y = damp(foot.position.y, -0.34 + lift * 0.075 - retract * 0.02, 12, delta);
      foot.position.z = damp(
        foot.position.z,
        (config.fore ? 0.12 : -0.1) + blends.walk * cos * (0.07 + speedT * 0.035),
        11,
        delta,
      );
      foot.rotation.x = damp(foot.rotation.x, 0.08 - lift * 0.22 + plant * 0.055, 12, delta);
      foot.rotation.z = damp(foot.rotation.z, config.side * (0.05 + plant * 0.035), 12, delta);
    });

    if (dropping) {
      const visible = defecating && actionT > 0.28 && actionT < 0.96;
      dropping.visible = visible;
      if (visible) {
        const grow = THREE.MathUtils.smoothstep(actionT, 0.28, 0.58);
        dropping.position.y = THREE.MathUtils.lerp(0.035, 0.065, grow);
        dropping.scale.setScalar(THREE.MathUtils.lerp(0.1, 1, grow));
        dropping.rotation.y = now * 0.7;
      }
    }
  });

  return (
    <group ref={rootRef} scale={[1.08, 1.08, 1.08]}>
      <group ref={shellRef}>
        <mesh castShadow receiveShadow geometry={geometry.shell} material={materials.shell} />
        <mesh castShadow receiveShadow position={[0, 0.275, -0.02]} rotation={[Math.PI / 2, 0, 0]} scale={[0.66, 0.94, 1]} material={materials.shellEdge}>
          <torusGeometry args={[1, 0.035, 14, 144]} />
        </mesh>
      </group>

      <mesh ref={bodyRef} castShadow receiveShadow position={[0, 0.29, 0.04]} scale={[0.56, 0.18, 0.76]} material={materials.skin}>
        <sphereGeometry args={[1, 48, 24]} />
      </mesh>
      <mesh ref={plastronRef} castShadow receiveShadow position={[0, 0.235, 0.06]} scale={[0.45, 0.05, 0.64]} material={materials.plastron}>
        <sphereGeometry args={[1, 36, 14]} />
      </mesh>

      {LEG_CONFIGS.map((config, index) => (
        <TortoiseLeg key={config.key} refs={legRefs[index]} config={config} materials={materials} geometries={geometry} />
      ))}

      <group ref={neckRef} position={[0, 0.395, 0.51]}>
        <mesh castShadow receiveShadow position={[0, -0.006, 0.22]} rotation={[Math.PI / 2, 0, 0]} scale={[0.073, 0.165, 0.073]} material={materials.skin}>
          <capsuleGeometry args={[1, 0.72, 16, 32]} />
        </mesh>
        <NeckWrinkles material={materials.skinDark} />
        <group ref={headRef} position={[0, 0.025, 0.48]}>
          <mesh castShadow receiveShadow scale={[0.155, 0.108, 0.18]} material={materials.skin}>
            <sphereGeometry args={[1, 42, 22]} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.016, -0.048]} scale={[0.132, 0.052, 0.1]} material={materials.skinDark}>
            <sphereGeometry args={[1, 28, 12]} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, -0.012, 0.112]} scale={[0.118, 0.047, 0.084]} material={materials.skinLight}>
            <sphereGeometry args={[1, 30, 12]} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, -0.028, 0.18]} scale={[0.076, 0.027, 0.045]} material={materials.beak}>
            <sphereGeometry args={[1, 18, 8]} />
          </mesh>
          <mesh ref={jawRef} castShadow receiveShadow position={[0, -0.061, 0.112]} scale={[0.106, 0.03, 0.071]} material={materials.skinDark}>
            <sphereGeometry args={[1, 24, 10]} />
          </mesh>
          <mesh ref={throatRef} castShadow receiveShadow position={[0, -0.082, 0.006]} scale={[0.095, 0.067, 0.075]} material={materials.skinLight}>
            <sphereGeometry args={[1, 20, 12]} />
          </mesh>
          {[-1, 1].map(side => (
            <group key={`eye-${side}`} position={[side * 0.097, 0.033, 0.078]}>
              <mesh castShadow receiveShadow position={[side * -0.004, 0.016, -0.01]} rotation={[0.08, side * 0.22, side * 0.08]} scale={[0.035, 0.011, 0.024]} material={materials.skinDark}>
                <sphereGeometry args={[1, 16, 8]} />
              </mesh>
              <mesh ref={side < 0 ? leftEyeRef : rightEyeRef} scale={[0.02, 0.02, 0.014]} material={materials.eye}>
                <sphereGeometry args={[1, 18, 10]} />
              </mesh>
              <mesh position={[side * 0.004, 0.005, 0.009]} scale={[0.0045, 0.0045, 0.003]} material={materials.eyeGlint}>
                <sphereGeometry args={[1, 10, 6]} />
              </mesh>
              <mesh ref={side < 0 ? leftLidRef : rightLidRef} visible={false} position={[0, 0.002, 0.003]} scale={[0.026, 0.03, 0.015]} material={materials.skinDark}>
                <sphereGeometry args={[1, 16, 8]} />
              </mesh>
            </group>
          ))}
          {[-1, 1].map(side => (
            <mesh key={`nostril-${side}`} position={[side * 0.038, -0.01, 0.181]} scale={[0.008, 0.0045, 0.005]} material={materials.claw}>
              <sphereGeometry args={[1, 10, 6]} />
            </mesh>
          ))}
        </group>
      </group>

      <group ref={tailRef} position={[0, 0.28, -0.69]}>
        <mesh castShadow receiveShadow position={[0, 0, -0.12]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.07, 0.07, 0.17]} material={materials.skinDark}>
          <coneGeometry args={[1, 1, 18]} />
        </mesh>
      </group>

      <group ref={droppingRef} position={[0, 0.04, -0.98]} visible={false}>
        <SeedPebble position={[-0.04, 0.025, 0.02]} scale={[0.09, 0.065, 0.075]} material={materials.dropping} />
        <SeedPebble position={[0.055, 0.02, -0.035]} scale={[0.075, 0.055, 0.065]} material={materials.dropping} />
        <SeedPebble position={[0.01, 0.035, 0.065]} scale={[0.065, 0.05, 0.055]} material={materials.dropping} />
      </group>
    </group>
  );
}
