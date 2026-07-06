'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { StaticGLB } from '../assets/StaticGLB';
import { useThreeGameStore } from '../../store';
import { POOP_Y, SHIP_SCALE, STERN, WAIST_Y } from '../../world/regions/beagleDeck/hull';

// Walkable HMS Beagle for the BEAGLE deck region. The terrain heightfield is
// the deck itself; this renders the ship GLB that wraps it, plus the animated
// white ensign and masthead commissioning pennant.

function makeEnsignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const white = '#efe9d8';
  const red = '#a63a2c';
  const blue = '#33405f';
  ctx.fillStyle = white;
  ctx.fillRect(0, 0, 256, 128);
  // St George's cross over the whole field
  ctx.fillStyle = red;
  ctx.fillRect(0, 56, 256, 16);
  ctx.fillRect(120, 0, 16, 128);
  // Union canton, simplified
  ctx.fillStyle = blue;
  ctx.fillRect(0, 0, 120, 56);
  ctx.strokeStyle = white;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(120, 56);
  ctx.moveTo(120, 0); ctx.lineTo(0, 56);
  ctx.stroke();
  ctx.strokeStyle = red;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(120, 56);
  ctx.moveTo(120, 0); ctx.lineTo(0, 56);
  ctx.stroke();
  ctx.strokeStyle = white;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(60, 0); ctx.lineTo(60, 56);
  ctx.moveTo(0, 28); ctx.lineTo(120, 28);
  ctx.stroke();
  ctx.strokeStyle = red;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(60, 0); ctx.lineTo(60, 56);
  ctx.moveTo(0, 28); ctx.lineTo(120, 28);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makePennantTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efe9d8';
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = '#a63a2c';
  ctx.fillRect(0, 12, 30, 8);
  ctx.fillRect(11, 0, 8, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Cloth wave: pinned at the hoist (uv.x = 0), amplitude grows toward the fly.
function clothMaterial(map, taper = 0) {
  const material = new THREE.MeshStandardMaterial({
    map,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uClothTime = { value: 0 };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uClothTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float fly = uv.x;
          ${taper ? `transformed.y *= (1.0 - fly * ${taper.toFixed(2)});` : ''}
          float wave = sin(fly * 6.5 - uClothTime * 2.7) * 0.085
            + sin(fly * 12.5 - uClothTime * 4.3) * 0.03;
          transformed.z += wave * fly;
          transformed.y += (sin(fly * 4.5 - uClothTime * 2.1) * 0.035) * fly;
        }`,
      );
  };
  material.customProgramCacheKey = () => `beagle-cloth-${taper.toFixed(2)}`;
  return material;
}

function Cloth({ position, rotation, width, height, map, taper = 0, speed = 1 }) {
  const material = useMemo(() => clothMaterial(map, taper), [map, taper]);
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(width, height, 36, 6);
    geo.translate(width / 2, 0, 0); // hoist at origin
    return geo;
  }, [width, height]);
  useFrame(({ clock }) => {
    const shader = material.userData.shader;
    if (shader?.uniforms?.uClothTime) shader.uniforms.uClothTime.value = clock.elapsedTime * speed;
  });
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} />;
}

function shipUnits(value) {
  return value * SHIP_SCALE;
}

export function HmsBeagleDeck() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const ensign = useMemo(makeEnsignTexture, []);
  const pennant = useMemo(makePennantTexture, []);
  if (currentZoneId !== 'BEAGLE') return null;
  return (
    <group userData={{
      renderSource: 'ship:beagle-deck',
      renderLabel: 'HMS Beagle walkable deck',
      renderKind: 'ship',
    }}>
      <StaticGLB
        path="/assets/models/ships/hms-beagle-deck.glb"
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        scale={SHIP_SCALE}
        doubleSide
        castShadow
        receiveShadow
        sourceId="ship:beagle-deck"
        sourceLabel="Beagle deck GLB"
        sourceKind="ship"
      />
      {/* white ensign on the stern staff (staff rakes aft; hang from near the truck) */}
      <Cloth
        position={[STERN - shipUnits(0.72), POOP_Y + shipUnits(4.05), 0]}
        rotation={[0, 0, -0.06]}
        width={-shipUnits(1.55)}
        height={shipUnits(0.78)}
        map={ensign}
        speed={1}
      />
      {/* commissioning pennant at the main truck */}
      <Cloth
        position={[-shipUnits(2.2), WAIST_Y + shipUnits(23.1), 0]}
        rotation={[0, 0, -0.03]}
        width={-shipUnits(6.2)}
        height={shipUnits(0.22)}
        map={pennant}
        taper={0.9}
        speed={0.7}
      />
    </group>
  );
}
