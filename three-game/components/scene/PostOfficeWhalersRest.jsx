'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { terrainHeight } from '../../world/terrain';
import { POST_OFFICE_BAY_WHALERS_REST } from '../../world/regions/postOfficeBay/terrain';
import { catalogToInspectable } from '../../world/inspectables';
import { useThreeGameStore } from '../../store';

function inspect(catalogId, sourceId) {
  return event => {
    event.stopPropagation();
    useThreeGameStore.getState().setInspectedObject?.(catalogToInspectable(catalogId, event.point, { sourceId }));
  };
}

// Where the whalers' tortoise parties rested on the haul down to the boats: a
// ring of hearth stones on the levelled ground beside the track, and the shells
// of animals that were cooked here rather than carried. By 1835 the Floreana
// tortoise had been hunted nearly out of the lowlands; the shells are older
// than the scrub that has grown up round them.
const REST_SHELLS = [
  // [dx, dz, size, yaw, roll, bleach]
  [1.7, 0.6, 0.42, 0.4, 0.12, 0.92],
  [2.4, -1.1, 0.37, 2.1, -0.22, 1.0],
  [-1.6, 1.5, 0.45, 4.2, 0.3, 0.85],
  [0.6, 2.4, 0.33, 1.2, 2.9, 0.96],
  [-2.3, -0.9, 0.39, 5.4, -0.08, 0.9],
];
const REST_HEARTH_STONES = 9;

// Sun-bleached scutes: pale plates with grey-brown growth rings and seams,
// drawn once into a small canvas (the same hexagon layout as the whalers'
// hut carapaces, in the colours of shells left out for years).
function bleachedScuteTexture() {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6f6656';
  ctx.fillRect(0, 0, size, size);
  const cells = 3;
  const step = size / cells;
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells + 1; i += 1) {
      const cx = (i + (j % 2) * 0.5) * step;
      const cy = (j + 0.5) * step;
      for (let r = step * 0.47; r > 3; r -= 3.2) {
        const t = r / (step * 0.47);
        const tone = 168 + (1 - t) * 48 + Math.sin(i * 7.1 + j * 3.3 + r) * 8;
        ctx.fillStyle = `rgb(${tone + 6},${tone},${tone - 18})`;
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r * 0.9;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

export function PostOfficeWhalersRest() {
  const rest = POST_OFFICE_BAY_WHALERS_REST;
  const scutes = useMemo(() => bleachedScuteTexture(), []);
  useEffect(() => () => scutes?.dispose(), [scutes]);
  const materials = useMemo(() => ({
    shell: new THREE.MeshStandardMaterial({ color: '#d2c8b0', map: scutes, roughness: 0.84 }),
    shellAged: new THREE.MeshStandardMaterial({ color: '#a89d84', map: scutes, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: '#a8997a', roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: '#3d3a35', roughness: 0.95, flatShading: true }),
    ash: new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 1, transparent: true, opacity: 0.86, depthWrite: false }),
    charred: new THREE.MeshStandardMaterial({ color: '#2e2620', roughness: 0.95, flatShading: true }),
  }), [scutes]);
  useEffect(() => () => Object.values(materials).forEach(material => material.dispose()), [materials]);
  const hearth = { x: rest.x - 0.4, z: rest.z - 0.2 };
  const hearthY = terrainHeight(hearth.x, hearth.z);
  const stones = useMemo(() => Array.from({ length: REST_HEARTH_STONES }, (_, i) => {
    const angle = (i / REST_HEARTH_STONES) * Math.PI * 2 + Math.sin(i * 3.1) * 0.18;
    const reach = 0.62 + Math.sin(i * 1.7) * 0.06;
    const x = hearth.x + Math.cos(angle) * reach;
    const z = hearth.z + Math.sin(angle) * reach;
    return { x, z, y: terrainHeight(x, z), s: 0.13 + ((i * 37) % 7) * 0.012, yaw: i * 1.3 };
  }), [hearth.x, hearth.z]);
  return (
    <group>
      <group onClick={inspect('charred_tortoise_shell', 'post-office-whalers-rest-hearth')}>
        <mesh position={[hearth.x, hearthY + 0.025, hearth.z]} rotation-x={-Math.PI / 2} material={materials.ash} receiveShadow>
          <circleGeometry args={[0.55, 20]} />
        </mesh>
        {stones.map((stone, i) => (
          <mesh key={i} position={[stone.x, stone.y + stone.s * 0.45, stone.z]} rotation={[0.3, stone.yaw, 0.2]} scale={[stone.s * 1.3, stone.s, stone.s * 1.1]} material={materials.stone} castShadow receiveShadow>
            <dodecahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
        {/* A carapace plate burnt through, half in the ashes. */}
        <mesh position={[hearth.x + 0.12, hearthY + 0.05, hearth.z - 0.08]} rotation={[0.5, 0.8, 0.25]} scale={[0.26, 0.07, 0.2]} material={materials.charred} castShadow>
          <sphereGeometry args={[1, 7, 4, 0, Math.PI * 1.3, 0, Math.PI / 2]} />
        </mesh>
      </group>
      <group onClick={inspect('tortoise_carapace', 'post-office-whalers-rest-carapaces')}>
        {REST_SHELLS.map(([dx, dz, size, yaw, roll, bleach], i) => {
          const x = hearth.x + dx;
          const z = hearth.z + dz;
          const upturned = Math.abs(roll) > 1.5;
          return (
            <group key={i} position={[x, terrainHeight(x, z) + (upturned ? size * 0.68 : 0.01), z]} rotation={[upturned ? 0 : roll * 0.4, yaw, roll]}>
              <mesh material={bleach > 0.9 ? materials.shell : materials.shellAged} scale={[size * 1.15, size * 0.66, size]} castShadow receiveShadow>
                <sphereGeometry args={[1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              </mesh>
              <mesh material={materials.rim} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[size * 1.1, size * 0.95, 1]}>
                <ringGeometry args={[0.9, 1, 16]} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}
