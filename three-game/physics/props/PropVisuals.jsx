'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { StaticGLB } from '../../components/assets/StaticGLB';
import { getModelAsset } from '../../modelAssets';
import { useThreeGameStore } from '../../store';
import { skyState } from '../../world/celestial';
import { createTimberMaterial } from '../../world/regions/materials/timberMaterial';
import { weatherEnv } from '../../world/weatherEnvRuntime';

function useDisposableMaterial(factory) {
  const material = useMemo(factory, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function useSingleMaterialGeometry(factory) {
  const geometry = useMemo(() => {
    const result = factory();
    // Three renders BufferGeometry groups as separate draw calls even when a
    // mesh uses one material. These procedural props never need material
    // groups, so strip them at creation time.
    result.clearGroups();
    return result;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export const PROP_PALETTE = {
  barrelWood: '#8a5a31',
  barrelBand: '#2c2a25',
  barrelEnd: '#6f4325',
  crateWood: '#7c5632',
  crateSlat: '#4e3420',
  stone: '#31332d',
};

function BarrelVisual() {
  const wood = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.barrelWood, roughness: 0.86, metalness: 0.02 }));
  const band = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.barrelBand, roughness: 0.72, metalness: 0.18 }));
  const end = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.barrelEnd, roughness: 0.9, metalness: 0.01 }));
  const bodyGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.48, 0.48, 0.9, 14, 1));
  const bandGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.505, 0.505, 0.055, 14, 1, true));
  const endGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.43, 0.43, 0.035, 14));

  return (
    <group>
      <mesh castShadow receiveShadow material={wood} geometry={bodyGeometry} />
      {[-0.34, 0, 0.34].map(y => (
        <mesh key={y} castShadow receiveShadow position={[0, y, 0]} material={band} geometry={bandGeometry} />
      ))}
      {[-0.47, 0.47].map(y => (
        <mesh key={y} castShadow receiveShadow position={[0, y, 0]} material={end} geometry={endGeometry} />
      ))}
    </group>
  );
}

function CrateVisual() {
  const wood = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.crateWood, roughness: 0.88, metalness: 0.01 }));
  const slat = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.crateSlat, roughness: 0.9, metalness: 0.01 }));
  const bodyGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.96, 0.84, 0.96));
  const sideSlatGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.055, 0.92, 1.04));
  const frontSlatGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(1.04, 0.92, 0.055));
  const topSlatGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(1.06, 0.055, 1.06));

  return (
    <group>
      <mesh castShadow receiveShadow material={wood} geometry={bodyGeometry} />
      {[[-0.51, 0, 0], [0.51, 0, 0], [0, 0, -0.51], [0, 0, 0.51]].map(([x, y, z], index) => (
        <mesh key={index} castShadow receiveShadow position={[x, y, z]} material={slat} geometry={x ? sideSlatGeometry : frontSlatGeometry} />
      ))}
      <mesh castShadow receiveShadow position={[0, 0.47, 0]} material={slat} geometry={topSlatGeometry} />
    </group>
  );
}

function StoneVisual() {
  const material = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    color: PROP_PALETTE.stone,
    roughness: 0.93,
    metalness: 0.02,
    flatShading: true,
  }));
  const geometry = useSingleMaterialGeometry(() => new THREE.DodecahedronGeometry(0.42, 0));
  return (
    <mesh castShadow receiveShadow material={material} geometry={geometry} scale={[1.12, 0.78, 0.95]} />
  );
}

function ToothVisual() {
  const ivory = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#e7dcc2', roughness: 0.55, metalness: 0.02 }));
  const scrimshaw = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#4a3f33', roughness: 0.7, metalness: 0 }));
  const bodyGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.045, 0.1, 0.26, 10));
  const tipGeometry = useSingleMaterialGeometry(() => new THREE.SphereGeometry(0.045, 10, 8));
  const baseGeometry = useSingleMaterialGeometry(() => new THREE.SphereGeometry(0.1, 10, 8));
  const etchGeometry = useSingleMaterialGeometry(() => new THREE.TorusGeometry(0.085, 0.006, 6, 14));
  return (
    <group rotation={[0, 0, 1.25]}>
      <mesh castShadow receiveShadow material={ivory} geometry={bodyGeometry} />
      <mesh castShadow receiveShadow position={[0, 0.13, 0]} material={ivory} geometry={tipGeometry} />
      <mesh castShadow receiveShadow position={[0, -0.13, 0]} material={ivory} geometry={baseGeometry} scale={[1, 0.7, 1]} />
      {/* the whaler's etched banding */}
      <mesh material={scrimshaw} geometry={etchGeometry} position={[0, -0.06, 0]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function BookVisual() {
  const leather = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#4c3623', roughness: 0.85, metalness: 0.01 }));
  const pages = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#c9bd9c', roughness: 0.95, metalness: 0 }));
  const coverGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.32, 0.09, 0.24));
  const pageGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.295, 0.06, 0.215));
  return (
    <group>
      <mesh castShadow receiveShadow material={leather} geometry={coverGeometry} />
      <mesh castShadow receiveShadow position={[0.012, 0, 0]} material={pages} geometry={pageGeometry} />
    </group>
  );
}

function ShellFragmentVisual() {
  const charred = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    color: '#241f1a',
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
    side: THREE.DoubleSide,
  }));
  const geometry = useSingleMaterialGeometry(
    () => new THREE.SphereGeometry(0.24, 10, 7, 0, Math.PI * 1.3, 0, Math.PI * 0.52),
  );
  return (
    <mesh castShadow receiveShadow material={charred} geometry={geometry} rotation={[Math.PI, 0.4, 0.15]} position={[0, 0.02, 0]} scale={[1, 0.72, 1]} />
  );
}

function JugVisual() {
  const clay = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#8a6a4b', roughness: 0.78, metalness: 0.01 }));
  const glaze = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#5b4530', roughness: 0.5, metalness: 0.04 }));
  const bodyGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.13, 0.17, 0.36, 12));
  const shoulderGeometry = useSingleMaterialGeometry(() => new THREE.SphereGeometry(0.135, 12, 8));
  const neckGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.05, 0.07, 0.1, 10));
  return (
    <group>
      <mesh castShadow receiveShadow material={clay} geometry={bodyGeometry} position={[0, -0.04, 0]} />
      <mesh castShadow receiveShadow material={glaze} geometry={shoulderGeometry} position={[0, 0.15, 0]} scale={[1.02, 0.6, 1.02]} />
      <mesh castShadow receiveShadow material={glaze} geometry={neckGeometry} position={[0, 0.23, 0]} />
    </group>
  );
}

function LooseBoardVisual() {
  const wood = useDisposableMaterial(() => createTimberMaterial({
    tint: '#9b9080',
    repeat: [0.7, 0.24],
    normalScale: 0.85,
  }));
  const geometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(1.7, 0.07, 0.32));
  return <mesh castShadow receiveShadow material={wood} geometry={geometry} />;
}

function CabinChairVisual() {
  const wood = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#5a321c', roughness: 0.76 }));
  const seat = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.82, 0.12, 0.78));
  const leg = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.1, 0.72, 0.1));
  const rail = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.72, 0.1, 0.1));
  return (
    <group>
      <mesh castShadow receiveShadow geometry={seat} material={wood} position={[0, -0.18, 0]} />
      {[[-0.32, -0.55, -0.28], [0.32, -0.55, -0.28], [-0.32, -0.55, 0.28], [0.32, -0.55, 0.28]].map((position, index) => (
        <mesh key={index} castShadow receiveShadow geometry={leg} material={wood} position={position} />
      ))}
      <mesh castShadow receiveShadow geometry={leg} material={wood} position={[-0.32, 0.22, 0.3]} scale={[1, 1.35, 1]} />
      <mesh castShadow receiveShadow geometry={leg} material={wood} position={[0.32, 0.22, 0.3]} scale={[1, 1.35, 1]} />
      {[0.03, 0.3, 0.57].map(y => <mesh key={y} castShadow geometry={rail} material={wood} position={[0, y, 0.3]} />)}
    </group>
  );
}

function CabinStoolVisual() {
  const wood = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#704727', roughness: 0.82 }));
  const canvas = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#b6aa88', roughness: 0.94 }));
  const seat = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.64, 0.1, 0.55));
  const leg = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.09, 0.72, 0.09));
  return (
    <group>
      <mesh castShadow receiveShadow material={canvas} geometry={seat} position={[0, 0.31, 0]} />
      <mesh castShadow receiveShadow material={wood} geometry={leg} rotation={[0, 0, 0.38]} position={[-0.12, -0.04, 0]} />
      <mesh castShadow receiveShadow material={wood} geometry={leg} rotation={[0, 0, -0.38]} position={[0.12, -0.04, 0]} />
    </group>
  );
}

function SeaChestVisual() {
  const wood = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#5a3922', roughness: 0.83 }));
  const iron = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#2a2925', roughness: 0.62, metalness: 0.35 }));
  const body = useSingleMaterialGeometry(() => new THREE.BoxGeometry(1.38, 0.74, 0.86));
  const lid = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.43, 0.43, 1.38, 12, 1, false, 0, Math.PI));
  const band = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.08, 0.82, 0.92));
  return (
    <group>
      <mesh castShadow receiveShadow material={wood} geometry={body} position={[0, -0.06, 0]} />
      <mesh castShadow receiveShadow material={wood} geometry={lid} rotation={[0, 0, Math.PI / 2]} position={[0, 0.32, 0]} />
      {[-0.47, 0.47].map(x => <mesh key={x} castShadow material={iron} geometry={band} position={[x, 0, 0]} />)}
      <mesh castShadow material={iron} geometry={band} position={[0, 0, -0.45]} scale={[1.4, 0.28, 0.5]} />
    </group>
  );
}

function CabinBucketVisual() {
  const wood = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#765035', roughness: 0.88 }));
  const iron = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#35332e', roughness: 0.58, metalness: 0.42 }));
  const body = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.3, 0.24, 0.56, 14, 1, true));
  const base = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.24, 0.24, 0.05, 14));
  const band = useSingleMaterialGeometry(() => new THREE.TorusGeometry(0.285, 0.018, 6, 16));
  const handle = useSingleMaterialGeometry(() => new THREE.TorusGeometry(0.34, 0.018, 6, 18, Math.PI));
  return (
    <group>
      <mesh castShadow receiveShadow material={wood} geometry={body} />
      <mesh castShadow receiveShadow material={wood} geometry={base} position={[0, -0.28, 0]} />
      {[-0.19, 0.2].map(y => <mesh key={y} castShadow material={iron} geometry={band} rotation={[Math.PI / 2, 0, 0]} position={[0, y, 0]} />)}
      <mesh castShadow material={iron} geometry={handle} rotation={[0, 0, Math.PI / 2]} position={[0, 0.22, 0]} />
    </group>
  );
}

function RolledChartVisual() {
  const paper = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#d3c49d', roughness: 0.96 }));
  const tie = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#76543a', roughness: 0.86 }));
  const roll = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.07, 0.07, 0.75, 14));
  const band = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.076, 0.076, 0.045, 14, 1, true));
  return (
    <group>
      <mesh castShadow receiveShadow material={paper} geometry={roll} />
      <mesh castShadow material={tie} geometry={band} />
    </group>
  );
}

function ChartWeightVisual() {
  const brass = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#9e7b35', roughness: 0.42, metalness: 0.64 }));
  const base = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.13, 0.15, 0.12, 14));
  const knob = useSingleMaterialGeometry(() => new THREE.SphereGeometry(0.055, 10, 8));
  return <group><mesh castShadow material={brass} geometry={base} /><mesh castShadow material={brass} geometry={knob} position={[0, 0.09, 0]} /></group>;
}

function CabinMugVisual() {
  const tin = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#85877f', roughness: 0.58, metalness: 0.46 }));
  const cup = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.1, 0.09, 0.23, 14, 1, true));
  const base = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.09, 0.09, 0.025, 14));
  const handle = useSingleMaterialGeometry(() => new THREE.TorusGeometry(0.075, 0.018, 6, 12, Math.PI * 1.55));
  return <group><mesh castShadow material={tin} geometry={cup} /><mesh castShadow material={tin} geometry={base} position={[0, -0.115, 0]} /><mesh castShadow material={tin} geometry={handle} rotation={[Math.PI / 2, 0, 0]} position={[0.1, 0, 0]} /></group>;
}

function CandlestickVisual() {
  const brass = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#a88642', roughness: 0.4, metalness: 0.62 }));
  const wax = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#d9cfaa', roughness: 0.92 }));
  const base = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.14, 0.16, 0.06, 14));
  const stem = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.035, 0.055, 0.28, 12));
  const candle = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.035, 0.038, 0.17, 12));
  return <group><mesh castShadow material={brass} geometry={base} position={[0, -0.21, 0]} /><mesh castShadow material={brass} geometry={stem} position={[0, -0.04, 0]} /><mesh castShadow material={wax} geometry={candle} position={[0, 0.18, 0]} /></group>;
}

function CandlestickFlame({ offsetY = 0 }) {
  const lightRef = useRef(null);
  const flameRef = useRef(null);
  const phaseOffset = useMemo(() => Math.random() * Math.PI * 2, []);
  const flame = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    color: '#ffd186',
    emissive: '#ff6d1f',
    emissiveIntensity: 2.4,
    roughness: 0.28,
    metalness: 0,
    toneMapped: true,
  }));
  const flameGeometry = useSingleMaterialGeometry(() => new THREE.SphereGeometry(0.034, 12, 8));

  useFrame(({ clock }) => {
    const light = lightRef.current;
    const flameMesh = flameRef.current;
    if (!light || !flameMesh) return;
    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const daylightHouse = store.currentZoneId === 'LAWSON_HOUSE';
    const darkness = THREE.MathUtils.clamp(
      celestial.night + weatherEnv.lightDim * 0.2 + weatherEnv.rainIntensity * 0.08,
      0,
      1,
    );
    const activation = THREE.MathUtils.smoothstep(darkness, 0.08, 0.92);
    const phase = clock.elapsedTime * 13.4 + phaseOffset;
    const flicker = 0.96 + Math.sin(phase) * 0.026 + Math.sin(phase * 1.87) * 0.014;
    light.intensity = THREE.MathUtils.lerp(daylightHouse ? 0.005 : 0.14, 3.25, activation) * flicker;
    flame.emissiveIntensity = THREE.MathUtils.lerp(daylightHouse ? 0.035 : 2.45, 4.4, activation) * flicker;
    flameMesh.visible = !daylightHouse || activation > 0.075;
    flameMesh.scale.set(0.74, 1.28 + Math.sin(phase * 0.83) * 0.06, 0.74);
  });

  return (
    <group position={[0, offsetY + 0.275, 0]}>
      <mesh ref={flameRef} material={flame} geometry={flameGeometry} />
      <pointLight
        ref={lightRef}
        position={[0, 0.025, 0]}
        color="#ff9a48"
        intensity={0.14}
        distance={2.5}
        decay={2}
      />
    </group>
  );
}

export function PropVisual({ visual, assetId, offsetY = 0 }) {
  const asset = assetId ? getModelAsset(assetId) : null;
  if (asset?.enabled !== false && asset?.path) {
    return (
      <group>
        <StaticGLB
          path={asset.path}
          position={[0, (asset.yOffset || 0) + offsetY, 0]}
          rotation={asset.rotation || [0, 0, 0]}
          scale={asset.scale || 1}
          castShadow
          receiveShadow
          preserveMaterials={asset.preserveMaterials === true}
          sourceId={`physics-prop-visual:${assetId}`}
          sourceLabel={assetId}
          sourceKind="physics-prop-visual"
        />
        {visual === 'cabinCandlestick' && (
          <CandlestickFlame offsetY={(asset.yOffset || 0) + offsetY + 0.435} />
        )}
      </group>
    );
  }
  if (visual === 'crate') return <CrateVisual />;
  if (visual === 'stone') return <StoneVisual />;
  if (visual === 'tooth') return <ToothVisual />;
  if (visual === 'book') return <BookVisual />;
  if (visual === 'shellFragment') return <ShellFragmentVisual />;
  if (visual === 'jug') return <JugVisual />;
  if (visual === 'looseBoard') return <LooseBoardVisual />;
  if (visual === 'cabinChair') return <CabinChairVisual />;
  if (visual === 'cabinStool') return <CabinStoolVisual />;
  if (visual === 'cabinSeaChest') return <SeaChestVisual />;
  if (visual === 'cabinBucket') return <CabinBucketVisual />;
  if (visual === 'rolledChart') return <RolledChartVisual />;
  if (visual === 'chartWeight') return <ChartWeightVisual />;
  if (visual === 'cabinMug') return <CabinMugVisual />;
  if (visual === 'cabinCandlestick') return <group><CandlestickVisual /><CandlestickFlame offsetY={offsetY} /></group>;
  return <BarrelVisual />;
}

export function HighlightRing({ visible }) {
  const material = useDisposableMaterial(() => new THREE.MeshBasicMaterial({
    color: '#f8df8a',
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  }));
  const geometry = useSingleMaterialGeometry(() => new THREE.RingGeometry(0.72, 0.88, 48));

  return (
    <mesh visible={visible} position={[0, -0.44, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material} geometry={geometry} renderOrder={6} />
  );
}
