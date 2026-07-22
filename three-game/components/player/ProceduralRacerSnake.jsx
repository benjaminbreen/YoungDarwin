'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const RINGS = 46;
const SIDES = 12;
const BODY_LENGTH = 1.46;

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function snakeRadius(u) {
  const tail = Math.pow(smoothstep(0, 0.17, u), 0.72);
  const neck = THREE.MathUtils.lerp(1, 0.84, smoothstep(0.82, 1, u));
  return 0.052 * tail * neck + 0.0025;
}

function createBodyGeometry() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(RINGS * SIDES * 3);
  const uvs = new Float32Array(RINGS * SIDES * 2);
  const indices = [];
  for (let ring = 0; ring < RINGS; ring += 1) {
    const u = ring / (RINGS - 1);
    for (let side = 0; side < SIDES; side += 1) {
      const index = ring * SIDES + side;
      uvs[index * 2] = u;
      uvs[index * 2 + 1] = side / SIDES;
      if (ring >= RINGS - 1) continue;
      const nextSide = (side + 1) % SIDES;
      const a = index;
      const b = ring * SIDES + nextSide;
      const c = (ring + 1) * SIDES + side;
      const d = (ring + 1) * SIDES + nextSide;
      indices.push(a, c, b, b, c, d);
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.4);
  return geometry;
}

function createRacerTexture() {
  const width = 384;
  const height = 72;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    const bellyDistance = Math.min(Math.abs(v - 0.75), 1 - Math.abs(v - 0.75));
    const dorsalDistance = Math.min(Math.abs(v - 0.25), 1 - Math.abs(v - 0.25));
    const belly = 1 - smoothstep(0.08, 0.28, bellyDistance);
    const dorsal = 1 - smoothstep(0.05, 0.25, dorsalDistance);
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const saddleWave = Math.pow(Math.max(0, Math.cos(u * Math.PI * 25 + Math.sin(u * 31) * 0.42)), 8);
      const twinBand = Math.max(
        Math.exp(-Math.pow((v - 0.17) / 0.052, 2)),
        Math.exp(-Math.pow((v - 0.33) / 0.052, 2)),
      );
      const mottling = ((x * 37 + y * 83 + ((x * y) % 29)) % 101) / 101;
      const spot = Math.max(saddleWave * dorsal * 0.86, twinBand * (0.35 + saddleWave * 0.52));
      let r = THREE.MathUtils.lerp(92, 164, belly);
      let g = THREE.MathUtils.lerp(74, 139, belly);
      let b = THREE.MathUtils.lerp(51, 94, belly);
      const ochre = Math.max(0, Math.sin(u * Math.PI * 17 + v * 13)) * dorsal * 0.12;
      r += ochre * 56;
      g += ochre * 38;
      b += ochre * 12;
      const darken = spot * 46 + (mottling > 0.9 ? 18 : mottling * 4);
      const scaleHeight = racerScaleHeight(x, y, width, height);
      const scaleSeam = 1 - smoothstep(0.08, 0.34, scaleHeight);
      const scaleRelief = (scaleHeight - 0.42) * 7 - scaleSeam * 3.5;
      const index = (y * width + x) * 4;
      data[index] = THREE.MathUtils.clamp(r - darken + scaleRelief, 0, 255);
      data[index + 1] = THREE.MathUtils.clamp(g - darken * 0.92 + scaleRelief * 0.82, 0, 255);
      data[index + 2] = THREE.MathUtils.clamp(b - darken * 0.72 + scaleRelief * 0.56, 0, 255);
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function racerScaleHeight(x, y, width, height) {
  const cellWidth = 12;
  const cellHeight = 9;
  const wrappedY = ((y % height) + height) % height;
  const row = Math.floor(wrappedY / cellHeight);
  const stagger = row % 2 === 0 ? 0 : cellWidth * 0.5;
  const localX = ((((x + stagger) % cellWidth) + cellWidth) % cellWidth) / cellWidth - 0.5;
  const localY = (wrappedY % cellHeight) / cellHeight - 0.5;
  // Overlapping, slightly elongated diamonds read as tiny keeled scales once
  // light moves across the body, without changing the snake's silhouette.
  const diamond = Math.max(0, 1 - Math.abs(localX) * 1.42 - Math.abs(localY) * 1.78);
  const dome = smoothstep(0, 0.78, diamond);
  const trailingKeel = Math.exp(-Math.pow(localX / 0.09, 2))
    * smoothstep(-0.46, 0.28, localY)
    * (1 - smoothstep(0.28, 0.5, localY));
  return THREE.MathUtils.clamp(dome * 0.72 + trailingKeel * 0.24, 0, 1);
}

function createRacerSurfaceMaps() {
  const width = 384;
  const height = 72;
  const normalData = new Uint8Array(width * height * 4);
  const roughnessData = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = racerScaleHeight(x - 1, y, width, height);
      const right = racerScaleHeight(x + 1, y, width, height);
      const down = racerScaleHeight(x, y - 1, width, height);
      const up = racerScaleHeight(x, y + 1, width, height);
      const heightHere = racerScaleHeight(x, y, width, height);
      const nx = THREE.MathUtils.clamp((left - right) * 1.75, -1, 1);
      const ny = THREE.MathUtils.clamp((down - up) * 1.55, -1, 1);
      const index = (y * width + x) * 4;
      normalData[index] = Math.round(128 + nx * 108);
      normalData[index + 1] = Math.round(128 + ny * 108);
      normalData[index + 2] = 238;
      normalData[index + 3] = 255;
      // Scale crowns are satiny; their seams stay dry and dark. That small
      // roughness difference is what breaks a broad highlight into a shimmer.
      const roughness = Math.round(THREE.MathUtils.lerp(228, 162, heightHere));
      roughnessData[index] = roughness;
      roughnessData[index + 1] = roughness;
      roughnessData[index + 2] = roughness;
      roughnessData[index + 3] = 255;
    }
  }
  const prepare = texture => {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  };
  return {
    normal: prepare(new THREE.DataTexture(normalData, width, height, THREE.RGBAFormat)),
    roughness: prepare(new THREE.DataTexture(roughnessData, width, height, THREE.RGBAFormat)),
  };
}

function applyScaleGlint(material) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
  // Let only the tightest normal-mapped scale highlights cross into HDR. The
  // world bloom pass catches these pinpricks; the animal itself never glows.
  float racerSpecular = dot(reflectedLight.directSpecular, vec3(0.2126, 0.7152, 0.0722));
  float racerGlint = pow(smoothstep(0.025, 0.14, racerSpecular), 2.7);
  outgoingLight += reflectedLight.directSpecular * racerGlint * 0.8;
  outgoingLight += vec3(0.54, 0.36, 0.16) * racerGlint * 0.12;`,
    );
  };
  material.customProgramCacheKey = () => 'floreana-racer-scale-glint-v1';
  return material;
}

function coilPose(target, u, time, headLift = 0) {
  const angle = (u * 1.48 + 0.08) * Math.PI * 2;
  const radius = 0.32 - u * 0.062 + Math.sin(u * Math.PI) * 0.018;
  target.set(
    Math.cos(angle) * radius,
    snakeRadius(u) + Math.sin(time * 0.72 + u * 5.4) * 0.0025 + smoothstep(0.76, 1, u) * headLift,
    Math.sin(angle) * radius,
  );
  return target;
}

function longPose(target, u, time, {
  amplitude = 0.12,
  speed = 1,
  raise = 0,
  strike = 0,
  limp = false,
} = {}) {
  const wave = limp
    ? Math.sin(u * Math.PI * 2.2 + 0.3) * 0.055
    : Math.sin(u * Math.PI * 5.2 - time * 6.4 * speed) * amplitude
      + Math.sin(u * Math.PI * 2.1 - time * 2.4 * speed + 0.8) * amplitude * 0.24;
  const front = smoothstep(0.67, 1, u);
  target.set(
    wave * THREE.MathUtils.lerp(1, 0.54, front),
    snakeRadius(u) + front * raise + Math.sin(time * 1.4 + u * 4) * (limp ? 0 : 0.0018),
    (u - 0.5) * BODY_LENGTH + strike * front * front * 0.43,
  );
  return target;
}

function poseForAction(target, action, u, time, actionElapsed) {
  if (action === 'baskCoil' || action === 'shelterStill') {
    return coilPose(target, u, time, action === 'shelterStill' ? 0.012 : 0.032);
  }
  if (action === 'tongueTaste') return coilPose(target, u, time, 0.09);
  if (action === 'alertS') {
    return longPose(target, u, time, { amplitude: 0.105, speed: 0.3, raise: 0.27 });
  }
  if (action === 'preyStrike') {
    const strike = Math.sin(Math.min(1, actionElapsed / 0.58) * Math.PI);
    return longPose(target, u, time, { amplitude: 0.085, speed: 0.45, raise: 0.18, strike });
  }
  if (action === 'creviceRetreat') {
    return longPose(target, u, time, { amplitude: 0.155, speed: 1.55, raise: 0.012 });
  }
  if (action === 'carried') {
    longPose(target, u, time, { amplitude: 0.085, speed: 0.22, raise: 0.02 });
    target.y += Math.sin(u * Math.PI) * 0.12 - 0.045;
    return target;
  }
  if (action === 'downed' || action === 'animalSleep') {
    return longPose(target, u, time, { amplitude: 0.035, speed: 0, limp: true });
  }
  return longPose(target, u, time, { amplitude: 0.12, speed: 0.9, raise: 0.008 });
}

function RacerEye({ side, materials }) {
  return (
    <group position={[side * 0.058, 0.025, 0.047]} rotation={[0, side * 0.42, 0]}>
      <mesh scale={[0.018, 0.018, 0.01]}>
        <sphereGeometry args={[1, 14, 10]} />
        <primitive object={materials.iris} attach="material" />
      </mesh>
      <mesh position={[0, 0, 0.008]} scale={[0.005, 0.013, 0.005]}>
        <sphereGeometry args={[1, 10, 8]} />
        <primitive object={materials.pupil} attach="material" />
      </mesh>
      <mesh position={[side * -0.003, 0.006, 0.013]} scale={[0.0032, 0.0032, 0.002]}>
        <sphereGeometry args={[1, 8, 6]} />
        <primitive object={materials.shine} attach="material" />
      </mesh>
    </group>
  );
}

export function ProceduralRacerSnake({ motionRef }) {
  const bodyMesh = useRef(null);
  const head = useRef(null);
  const tongue = useRef(null);
  const elapsed = useRef(0);
  const actionState = useRef({ current: 'baskCoil', previous: 'baskCoil', changedAt: 0 });
  const geometry = useMemo(createBodyGeometry, []);
  const texture = useMemo(createRacerTexture, []);
  const surfaceMaps = useMemo(createRacerSurfaceMaps, []);
  const materials = useMemo(() => ({
    body: applyScaleGlint(new THREE.MeshPhysicalMaterial({
      map: texture,
      normalMap: surfaceMaps.normal,
      normalScale: new THREE.Vector2(0.34, 0.28),
      roughnessMap: surfaceMaps.roughness,
      roughness: 0.94,
      metalness: 0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.42,
      sheen: 0.1,
      sheenColor: new THREE.Color('#b97835'),
      sheenRoughness: 0.62,
      iridescence: 0.02,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [95, 155],
      specularIntensity: 0.58,
      specularColor: new THREE.Color('#f0cf92'),
      envMapIntensity: 0.82,
    })),
    head: new THREE.MeshPhysicalMaterial({
      color: '#70593d',
      roughness: 0.68,
      clearcoat: 0.16,
      clearcoatRoughness: 0.4,
      specularIntensity: 0.54,
      specularColor: new THREE.Color('#e6c58a'),
    }),
    crown: new THREE.MeshPhysicalMaterial({
      color: '#46382a',
      roughness: 0.78,
      clearcoat: 0.12,
      clearcoatRoughness: 0.42,
    }),
    belly: new THREE.MeshPhysicalMaterial({
      color: '#b39a6b',
      roughness: 0.74,
      clearcoat: 0.1,
      clearcoatRoughness: 0.46,
    }),
    iris: new THREE.MeshPhysicalMaterial({
      color: '#c9a64c',
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color('#5a3c09'),
      emissiveIntensity: 0.16,
    }),
    pupil: new THREE.MeshPhysicalMaterial({ color: '#090806', roughness: 0.12, clearcoat: 0.8 }),
    shine: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.82, 0.92), toneMapped: false }),
    tongue: new THREE.MeshPhysicalMaterial({ color: '#711832', roughness: 0.36, clearcoat: 0.68, clearcoatRoughness: 0.18 }),
  }), [surfaceMaps, texture]);
  const working = useMemo(() => ({
    centers: Array.from({ length: RINGS }, () => new THREE.Vector3()),
    previousCenters: Array.from({ length: RINGS }, () => new THREE.Vector3()),
    current: new THREE.Vector3(),
    previous: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    side: new THREE.Vector3(),
    ringUp: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
  }), []);

  useEffect(() => () => {
    geometry.dispose();
    texture.dispose();
    surfaceMaps.normal.dispose();
    surfaceMaps.roughness.dispose();
    Object.values(materials).forEach(material => material.dispose());
  }, [geometry, materials, surfaceMaps, texture]);

  useFrame((_, delta) => {
    const motion = motionRef?.current || {};
    const timeScale = Number.isFinite(motion.timeScale) ? motion.timeScale : 1;
    elapsed.current += Math.min(delta, 0.05) * Math.max(0, timeScale);
    const t = elapsed.current;
    const requestedAction = motion.action || (motion.speed > 0.7 ? 'creviceRetreat' : motion.speed > 0.02 ? 'groundSlither' : 'baskCoil');
    if (requestedAction !== actionState.current.current) {
      actionState.current.previous = actionState.current.current;
      actionState.current.current = requestedAction;
      actionState.current.changedAt = t;
    }
    const actionElapsed = t - actionState.current.changedAt;
    const blendRaw = THREE.MathUtils.clamp(actionElapsed / 0.32, 0, 1);
    const blend = blendRaw * blendRaw * (3 - 2 * blendRaw);
    for (let ring = 0; ring < RINGS; ring += 1) {
      const u = ring / (RINGS - 1);
      poseForAction(working.previous, actionState.current.previous, u, t, actionElapsed);
      poseForAction(working.current, actionState.current.current, u, t, actionElapsed);
      working.centers[ring].lerpVectors(working.previous, working.current, blend);
    }

    const positionAttribute = geometry.getAttribute('position');
    for (let ring = 0; ring < RINGS; ring += 1) {
      const center = working.centers[ring];
      const before = working.centers[Math.max(0, ring - 1)];
      const after = working.centers[Math.min(RINGS - 1, ring + 1)];
      working.tangent.copy(after).sub(before).normalize();
      working.side.crossVectors(working.tangent, working.up);
      if (working.side.lengthSq() < 0.0001) working.side.set(1, 0, 0);
      else working.side.normalize();
      working.ringUp.crossVectors(working.side, working.tangent).normalize();
      const radius = snakeRadius(ring / (RINGS - 1));
      for (let sideIndex = 0; sideIndex < SIDES; sideIndex += 1) {
        const angle = (sideIndex / SIDES) * Math.PI * 2;
        const cos = Math.cos(angle) * radius;
        const sin = Math.sin(angle) * radius;
        const vertex = ring * SIDES + sideIndex;
        positionAttribute.setXYZ(
          vertex,
          center.x + working.side.x * cos + working.ringUp.x * sin,
          center.y + working.side.y * cos + working.ringUp.y * sin,
          center.z + working.side.z * cos + working.ringUp.z * sin,
        );
      }
    }
    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.getAttribute('normal').needsUpdate = true;

    if (head.current) {
      const end = working.centers[RINGS - 1];
      const before = working.centers[RINGS - 3];
      working.tangent.copy(end).sub(before).normalize();
      head.current.position.copy(end);
      head.current.rotation.y = Math.atan2(working.tangent.x, working.tangent.z);
      head.current.rotation.x = -Math.atan2(
        working.tangent.y,
        Math.max(0.001, Math.hypot(working.tangent.x, working.tangent.z)),
      );
      head.current.rotation.z = Math.sin(t * 0.85) * (requestedAction === 'tongueTaste' ? 0.045 : 0.012);
      const breath = 1 + Math.sin(t * 1.7) * 0.012;
      head.current.scale.set(breath, breath, breath);
    }
    if (tongue.current) {
      const tasting = requestedAction === 'tongueTaste' || requestedAction === 'alertS';
      const frequency = tasting ? 4.8 : 2.4;
      const flick = Math.pow(Math.max(0, Math.sin(t * frequency + 0.8)), tasting ? 10 : 18);
      tongue.current.visible = flick > 0.025;
      tongue.current.scale.z = 0.08 + flick * 1.05;
      tongue.current.rotation.z = Math.sin(t * 7.1) * 0.035 * flick;
    }
    if (bodyMesh.current) bodyMesh.current.scale.y = 1 + Math.sin(t * 1.25) * 0.008;
  });

  return (
    <group position={[0, 0.008, 0]}>
      <mesh ref={bodyMesh} geometry={geometry} material={materials.body} castShadow receiveShadow frustumCulled={false} />
      <group ref={head}>
        <mesh castShadow receiveShadow scale={[0.078, 0.057, 0.118]}>
          <sphereGeometry args={[1, 22, 16]} />
          <primitive object={materials.head} attach="material" />
        </mesh>
        <mesh castShadow position={[0, 0.022, -0.004]} scale={[0.066, 0.031, 0.105]}>
          <sphereGeometry args={[1, 18, 12]} />
          <primitive object={materials.crown} attach="material" />
        </mesh>
        <mesh castShadow position={[0, -0.021, 0.026]} scale={[0.066, 0.027, 0.094]}>
          <sphereGeometry args={[1, 18, 12]} />
          <primitive object={materials.belly} attach="material" />
        </mesh>
        <mesh castShadow position={[0, -0.004, 0.086]} scale={[0.068, 0.042, 0.066]}>
          <sphereGeometry args={[1, 18, 12]} />
          <primitive object={materials.head} attach="material" />
        </mesh>
        <RacerEye side={-1} materials={materials} />
        <RacerEye side={1} materials={materials} />
        {[-1, 1].map(side => (
          <mesh key={`nostril-${side}`} position={[side * 0.026, 0.006, 0.145]} scale={[0.0033, 0.0025, 0.002]}>
            <sphereGeometry args={[1, 7, 5]} />
            <primitive object={materials.pupil} attach="material" />
          </mesh>
        ))}
        <group ref={tongue} position={[0, -0.013, 0.135]} visible={false}>
          <mesh position={[0, 0, 0.062]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0028, 0.0045, 0.124, 5]} />
            <primitive object={materials.tongue} attach="material" />
          </mesh>
          {[-1, 1].map(side => (
            <mesh key={`fork-${side}`} position={[side * 0.013, 0, 0.132]} rotation={[Math.PI / 2, 0, side * -0.33]}>
              <cylinderGeometry args={[0.0013, 0.0024, 0.058, 5]} />
              <primitive object={materials.tongue} attach="material" />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
