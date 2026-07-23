'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function seeded(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function canvasTexture(size, paint, colorSpace = THREE.SRGBColorSpace) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  paint(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createPaintedCuticleTexture() {
  return canvasTexture(512, (context, size) => {
    const gradient = context.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#171916');
    gradient.addColorStop(0.5, '#302b20');
    gradient.addColorStop(1, '#111310');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    context.lineCap = 'round';
    for (let band = 0; band < 8; band += 1) {
      const y = (0.08 + band * 0.125) * size;
      context.strokeStyle = band % 3 === 1 ? '#c84a31' : '#d7bc3b';
      context.lineWidth = size * (band % 3 === 1 ? 0.018 : 0.024);
      context.beginPath();
      context.moveTo(-size * 0.08, y + Math.sin(band) * size * 0.04);
      context.bezierCurveTo(size * 0.24, y - size * 0.09, size * 0.68, y + size * 0.1, size * 1.08, y - size * 0.03);
      context.stroke();
    }

    for (let i = 0; i < 900; i += 1) {
      const x = seeded(i, 2) * size;
      const y = seeded(i, 7) * size;
      const radius = 0.7 + seeded(i, 11) * 2.1;
      context.fillStyle = seeded(i, 17) > 0.65
        ? `rgba(255,224,103,${0.035 + seeded(i, 19) * 0.09})`
        : `rgba(0,0,0,${0.025 + seeded(i, 23) * 0.09})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  });
}

function createCuticleBumpTexture() {
  return canvasTexture(256, (context, size) => {
    context.fillStyle = '#777777';
    context.fillRect(0, 0, size, size);
    for (let i = 0; i < 1500; i += 1) {
      const value = 92 + Math.floor(seeded(i, 31) * 94);
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.beginPath();
      context.arc(seeded(i, 37) * size, seeded(i, 41) * size, 0.5 + seeded(i, 43) * 1.6, 0, Math.PI * 2);
      context.fill();
    }
  }, THREE.NoColorSpace);
}

function createWingTexture() {
  return canvasTexture(512, (context, size) => {
    context.clearRect(0, 0, size, size);
    const gradient = context.createLinearGradient(0, size, size, 0);
    gradient.addColorStop(0, 'rgba(63,50,32,0.92)');
    gradient.addColorStop(0.5, 'rgba(98,77,48,0.72)');
    gradient.addColorStop(1, 'rgba(36,32,25,0.34)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    context.strokeStyle = 'rgba(28,25,18,0.88)';
    context.lineWidth = 4;
    for (let i = 0; i < 12; i += 1) {
      const y = size * (0.08 + i * 0.075);
      context.beginPath();
      context.moveTo(0, size * 0.82);
      context.quadraticCurveTo(size * 0.38, y + Math.sin(i) * 24, size, y);
      context.stroke();
    }
    context.lineWidth = 2.2;
    for (let i = 0; i < 17; i += 1) {
      const x = size * (i / 16);
      context.beginPath();
      context.moveTo(x, size);
      context.lineTo(Math.min(size, x + size * 0.16), 0);
      context.stroke();
    }
    for (let i = 0; i < 34; i += 1) {
      const x = seeded(i, 53) * size;
      const y = seeded(i, 59) * size;
      context.fillStyle = seeded(i, 61) > 0.58 ? 'rgba(239,208,73,0.72)' : 'rgba(227,89,52,0.58)';
      context.beginPath();
      context.ellipse(x, y, 4 + seeded(i, 67) * 8, 2 + seeded(i, 71) * 5, seeded(i, 73) * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
  });
}

function wingGeometry(side) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    side * 0.08, 0.015, -1.02,
    side * 0.43, -0.02, -0.9,
    side * 0.34, -0.01, -0.14,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 1,
    1, 0,
    0.78, 0.08,
    0.08, 0.83,
  ], 2));
  geometry.setIndex(side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

function Segment({ from, to, radius, material, radialSegments = 8 }) {
  const { midpoint, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    return {
      midpoint: start.clone().add(end).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
      length: direction.length(),
    };
  }, [from, to]);
  return (
    <mesh position={midpoint} quaternion={quaternion} material={material} castShadow>
      <cylinderGeometry args={[radius * 0.72, radius, length, radialSegments]} />
    </mesh>
  );
}

function Antenna({ side, material, rootRef }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.13, 0.02, 0.18),
    new THREE.Vector3(side * 0.2, 0.09, 0.37),
    new THREE.Vector3(side * 0.28, 0.12, 0.62),
    new THREE.Vector3(side * 0.34, 0.08, 0.84),
  ]), [side]);
  return (
    <group ref={rootRef}>
      <mesh material={material}>
        <tubeGeometry args={[curve, 18, 0.012, 6, false]} />
      </mesh>
    </group>
  );
}

function LocustLeg({ side, pair, materials, upperRef = null, lowerRef = null }) {
  const front = pair === 'front';
  const middle = pair === 'middle';
  if (!front && !middle) {
    return (
      <group>
        <group ref={upperRef}>
          <Segment from={[side * 0.24, 0.16, -0.25]} to={[side * 0.54, 0.28, -0.6]} radius={0.052} material={materials.coral} radialSegments={10} />
          <mesh position={[side * 0.42, 0.23, -0.46]} rotation={[0.38, 0, side * 0.68]} scale={[0.062, 0.2, 0.066]} material={materials.yellow} castShadow>
            <capsuleGeometry args={[1, 0.75, 8, 12]} />
          </mesh>
        </group>
        <group ref={lowerRef}>
          <Segment from={[side * 0.54, 0.28, -0.6]} to={[side * 0.5, 0.01, -0.03]} radius={0.035} material={materials.dark} />
          <Segment from={[side * 0.5, 0.01, -0.03]} to={[side * 0.65, -0.02, 0.08]} radius={0.018} material={materials.yellow} />
        </group>
      </group>
    );
  }
  const z = front ? 0.3 : -0.02;
  const reach = front ? 0.36 : 0.43;
  return (
    <group>
      <Segment from={[side * 0.2, 0.13, z]} to={[side * reach, 0.02, z + (front ? 0.16 : 0.04)]} radius={0.028} material={materials.yellow} />
      <Segment from={[side * reach, 0.02, z + (front ? 0.16 : 0.04)]} to={[side * (reach + 0.12), -0.03, z + (front ? 0.33 : 0.12)]} radius={0.018} material={materials.dark} />
    </group>
  );
}

export function PaintedLocustShape({ motionRef }) {
  const rootRef = useRef(null);
  const bodyRef = useRef(null);
  const leftWingRef = useRef(null);
  const rightWingRef = useRef(null);
  const leftAntennaRef = useRef(null);
  const rightAntennaRef = useRef(null);
  const leftHindUpperRef = useRef(null);
  const rightHindUpperRef = useRef(null);
  const leftHindLowerRef = useRef(null);
  const rightHindLowerRef = useRef(null);
  const blendRef = useRef(0);

  const textures = useMemo(() => ({
    cuticle: createPaintedCuticleTexture(),
    bump: createCuticleBumpTexture(),
    wing: createWingTexture(),
  }), []);
  const materials = useMemo(() => ({
    painted: new THREE.MeshPhysicalMaterial({ map: textures.cuticle, bumpMap: textures.bump, bumpScale: 0.035, color: '#d8c686', roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.34, envMapIntensity: 0.72 }),
    dark: new THREE.MeshPhysicalMaterial({ color: '#171914', roughness: 0.4, clearcoat: 0.52, clearcoatRoughness: 0.28, envMapIntensity: 0.82 }),
    yellow: new THREE.MeshPhysicalMaterial({ color: '#d2b638', emissive: '#4d3803', emissiveIntensity: 0.07, roughness: 0.46, clearcoat: 0.36, clearcoatRoughness: 0.32 }),
    coral: new THREE.MeshPhysicalMaterial({ color: '#c94a31', emissive: '#3d0e08', emissiveIntensity: 0.08, roughness: 0.43, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    eye: new THREE.MeshPhysicalMaterial({ color: '#17120b', roughness: 0.19, clearcoat: 0.78, clearcoatRoughness: 0.14, envMapIntensity: 1.12 }),
    glint: new THREE.MeshBasicMaterial({ color: '#fff8c5' }),
    wing: new THREE.MeshPhysicalMaterial({ map: textures.wing, color: '#d7c19a', transparent: true, opacity: 0.76, alphaTest: 0.04, side: THREE.DoubleSide, depthWrite: false, roughness: 0.48, clearcoat: 0.2 }),
  }), [textures]);
  const wings = useMemo(() => ({ left: wingGeometry(-1), right: wingGeometry(1) }), []);

  useEffect(() => () => {
    Object.values(textures).forEach(texture => texture?.dispose());
    Object.values(materials).forEach(material => material.dispose());
    wings.left.dispose();
    wings.right.dispose();
  }, [materials, textures, wings]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const motion = motionRef?.current || {};
    const hopping = motion.action === 'locustHop' || motion.flying;
    blendRef.current = THREE.MathUtils.damp(blendRef.current, hopping ? 1 : 0, 13, delta);
    const hop = blendRef.current;
    const progress = Number.isFinite(motion.hopProgress) ? motion.hopProgress : (t * 2.6) % 1;
    const crouch = hopping ? Math.max(0, 1 - progress * 7) : 0;
    const wingFlash = hopping ? Math.sin(Math.PI * progress) : 0;
    const settle = hopping ? Math.max(0, (progress - 0.82) / 0.18) : 0;

    if (rootRef.current) {
      rootRef.current.position.y = Math.sin(t * 1.9) * 0.006 - crouch * 0.075 + settle * 0.018;
      rootRef.current.rotation.x = -wingFlash * 0.08 + settle * 0.05;
      rootRef.current.rotation.z = Math.sin(t * 0.67) * 0.012;
    }
    if (bodyRef.current) bodyRef.current.scale.y = 1 + Math.sin(t * 2.1) * 0.015 - crouch * 0.06;
    if (leftWingRef.current && rightWingRef.current) {
      leftWingRef.current.rotation.z = -0.1 - wingFlash * 0.72;
      rightWingRef.current.rotation.z = 0.1 + wingFlash * 0.72;
      leftWingRef.current.rotation.x = wingFlash * 0.16;
      rightWingRef.current.rotation.x = wingFlash * 0.16;
    }
    const antennaSweep = Math.sin(t * 1.7) * 0.12 + Math.sin(t * 0.43) * 0.08;
    if (leftAntennaRef.current) leftAntennaRef.current.rotation.y = antennaSweep - wingFlash * 0.08;
    if (rightAntennaRef.current) rightAntennaRef.current.rotation.y = -antennaSweep + wingFlash * 0.08;
    const hindFold = crouch * 0.68 - wingFlash * 0.32;
    if (leftHindUpperRef.current) leftHindUpperRef.current.rotation.x = hindFold;
    if (rightHindUpperRef.current) rightHindUpperRef.current.rotation.x = hindFold;
    if (leftHindLowerRef.current) leftHindLowerRef.current.rotation.x = -hindFold * 0.82;
    if (rightHindLowerRef.current) rightHindLowerRef.current.rotation.x = -hindFold * 0.82;
  });

  return (
    <group ref={rootRef} position={[0, 0.05, 0]}>
      <group ref={bodyRef}>
        <mesh position={[0, 0.17, -0.25]} rotation={[Math.PI / 2, 0, 0]} scale={[0.17, 0.54, 0.15]} material={materials.painted} castShadow receiveShadow>
          <capsuleGeometry args={[1, 1.2, 12, 24]} />
        </mesh>
        <mesh position={[0, 0.22, 0.25]} rotation={[Math.PI / 2, 0, 0]} scale={[0.21, 0.31, 0.18]} material={materials.painted} castShadow>
          <capsuleGeometry args={[1, 0.4, 12, 24]} />
        </mesh>
        <mesh position={[0, 0.22, 0.58]} scale={[0.17, 0.145, 0.19]} material={materials.painted} castShadow>
          <sphereGeometry args={[1, 24, 16]} />
        </mesh>
        <mesh position={[0, 0.255, 0.68]} rotation={[0, 0, Math.PI / 2]} scale={[0.026, 0.15, 0.02]} material={materials.yellow}>
          <capsuleGeometry args={[1, 0.45, 8, 14]} />
        </mesh>
        {[-1, 1].map(side => (
          <group key={`eye-${side}`}>
            <mesh position={[side * 0.162, 0.275, 0.605]} scale={[0.044, 0.064, 0.036]} material={materials.eye} castShadow>
              <sphereGeometry args={[1, 20, 14]} />
            </mesh>
            <mesh position={[side * 0.172, 0.298, 0.63]} scale={0.007} material={materials.glint}>
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.205, 0.75]} scale={[0.05, 0.026, 0.04]} material={materials.dark} castShadow>
          <sphereGeometry args={[1, 16, 10]} />
        </mesh>
        <mesh position={[0, 0.35, 0.22]} rotation={[0, 0, Math.PI / 2]} scale={[0.034, 0.25, 0.025]} material={materials.yellow}>
          <capsuleGeometry args={[1, 0.8, 8, 16]} />
        </mesh>
      </group>

      <group ref={leftWingRef} position={[0, 0.38, 0.25]}>
        <mesh geometry={wings.left} material={materials.wing} castShadow />
      </group>
      <group ref={rightWingRef} position={[0, 0.385, 0.25]}>
        <mesh geometry={wings.right} material={materials.wing} castShadow />
      </group>
      <Segment from={[-0.03, 0.405, 0.18]} to={[-0.06, 0.42, -0.68]} radius={0.012} material={materials.coral} />
      <Segment from={[0.03, 0.405, 0.18]} to={[0.06, 0.42, -0.68]} radius={0.012} material={materials.coral} />

      <Antenna side={-1} material={materials.dark} rootRef={leftAntennaRef} />
      <Antenna side={1} material={materials.dark} rootRef={rightAntennaRef} />
      {[-1, 1].map(side => (
        <React.Fragment key={`legs-${side}`}>
          <LocustLeg side={side} pair="front" materials={materials} />
          <LocustLeg side={side} pair="middle" materials={materials} />
          <LocustLeg
            side={side}
            pair="hind"
            materials={materials}
            upperRef={side < 0 ? leftHindUpperRef : rightHindUpperRef}
            lowerRef={side < 0 ? leftHindLowerRef : rightHindLowerRef}
          />
        </React.Fragment>
      ))}
    </group>
  );
}
