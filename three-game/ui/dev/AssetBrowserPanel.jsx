'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ExpeditionPanel, GOLD_BUTTON, GOLD_LABEL } from '../expedition/ExpeditionPanel';

// Dev-only asset browser (toggle with the 0 key): preview candidate GLBs in an
// interactive turntable before committing them to the world. Drag to orbit,
// scroll to zoom.

const BROWSER_ASSETS = [
  { id: 'grass-1', label: 'Grass Patch 1 (new)', path: '/assets/models/nature/runtime-grass-patch-1.glb' },
  { id: 'grass-2', label: 'Grass Patch 2 (new)', path: '/assets/models/nature/runtime-grass-patch-2.glb' },
  { id: 'grass-3', label: 'Grass Patch 3 (new)', path: '/assets/models/nature/runtime-grass-patch-3.glb' },
  { id: 'opuntia', label: 'Opuntia / Prickly Pear (new)', path: '/assets/models/nature/runtime-opuntia.glb' },
  { id: 'ground-plants', label: 'Ground Plants (new)', path: '/assets/models/nature/runtime-ground-plants.glb' },
  // Northern Shore flora set — named for the species Darwin would have met on
  // Floreana's arid coastal zone in 1835.
  { id: 'saltbush-1', label: 'Monte Salado / Saltbush 1 (Cryptocarpus)', path: '/assets/models/nature/runtime-saltbush-1.glb' },
  { id: 'saltbush-2', label: 'Monte Salado / Saltbush 2 (Cryptocarpus)', path: '/assets/models/nature/runtime-saltbush-2.glb' },
  { id: 'saltbush-3', label: 'Monte Salado / Saltbush 3 (large)', path: '/assets/models/nature/runtime-saltbush-3.glb' },
  { id: 'croton', label: 'Chala / Croton scouleri', path: '/assets/models/nature/runtime-croton.glb' },
  { id: 'scalesia', label: 'Scalesia villosa (Floreana endemic)', path: '/assets/models/nature/runtime-scalesia.glb' },
  { id: 'palo-santo', label: 'Palo Santo (Bursera graveolens)', path: '/assets/models/nature/runtime-palo-santo.glb' },
  { id: 'saltgrass', label: 'Saltgrass (Distichlis spicata)', path: '/assets/models/nature/runtime-saltgrass.glb' },
  { id: 'morning-glory', label: 'Beach Morning Glory (Ipomoea pes-caprae)', path: '/assets/models/nature/runtime-morning-glory.glb' },
  { id: 'sesuvium', label: 'Galapagos Carpetweed (Sesuvium)', path: '/assets/models/nature/runtime-sesuvium.glb' },
  { id: 'driftwood', label: 'Bleached Driftwood', path: '/assets/models/nature/runtime-driftwood.glb' },
  { id: 'lava-scree', label: 'Lava Scree Field', path: '/assets/models/nature/runtime-lava-scree.glb' },
  { id: 'drybrush', label: 'Dry Wrack & Brush Field', path: '/assets/models/nature/runtime-drybrush.glb' },
  { id: 'cur-dry-grass', label: 'Current: Dry Grass', path: '/assets/models/nature/runtime-animated-dry-grass.glb' },
  { id: 'cur-shrub', label: 'Current: Shrub', path: '/assets/models/nature/runtime-plant-shrub.glb' },
  { id: 'cur-small-shrub', label: 'Current: Small Shrub', path: '/assets/models/nature/runtime-small-shrub.glb' },
  { id: 'cur-flat-cactus', label: 'Current: Flat Cactus', path: '/assets/models/nature/runtime-flat-cactus.glb' },
];

function PreviewModel({ path }) {
  const { scene } = useGLTF(path);
  // Normalize whatever scale the source file uses to a ~2 unit display size,
  // grounded at the origin.
  const cloned = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = 2 / maxDim;
    const center = box.getCenter(new THREE.Vector3());
    const group = new THREE.Group();
    group.add(clone);
    clone.position.sub(center);
    clone.position.y += size.y / 2;
    group.scale.setScalar(s);
    return group;
  }, [scene]);
  return <primitive object={cloned} />;
}

export function AssetBrowserPanel({ open, onClose }) {
  const [index, setIndex] = useState(0);
  if (!open) return null;
  const asset = BROWSER_ASSETS[index];

  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <ExpeditionPanel className="w-[min(58rem,calc(100vw-2rem))]" innerClassName="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className={GOLD_LABEL}>Asset Browser (dev)</div>
            <div className="font-expedition text-lg font-semibold text-expedition-parchment">{asset.label}</div>
            <div className="font-mono text-[10px] text-expedition-faded">{asset.path}</div>
          </div>
          <button type="button" onClick={onClose} className={GOLD_BUTTON}>Close (0)</button>
        </div>
        <div className="grid grid-cols-[14rem_1fr] gap-3">
          <div className="grid max-h-[26rem] content-start gap-1 overflow-auto pr-1">
            {BROWSER_ASSETS.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(i)}
                className={`rounded-sm border px-2.5 py-1.5 text-left font-expedition text-[12.5px] transition ${
                  i === index
                    ? 'border-expedition-gold bg-expedition-gold/15 text-expedition-goldbright'
                    : 'border-expedition-brass/40 bg-black/20 text-expedition-parchment hover:border-expedition-gold/70'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="relative h-[26rem] overflow-hidden rounded-sm border border-expedition-brass/60 bg-[#1c2226]">
            <Canvas camera={{ position: [2.2, 1.6, 2.6], fov: 45 }} dpr={[1, 1.5]}>
              <color attach="background" args={['#1c2226']} />
              <hemisphereLight args={['#cfe2ee', '#8a7a5a', 0.9]} />
              <directionalLight position={[4, 6, 3]} intensity={2.2} color="#ffe9c4" />
              <directionalLight position={[-5, 3, -4]} intensity={0.6} color="#9ec8e8" />
              <Suspense fallback={null}>
                <PreviewModel key={asset.id} path={asset.path} />
              </Suspense>
              <gridHelper args={[10, 20, '#4a5258', '#2c3338']} />
              <OrbitControls makeDefault enableDamping />
            </Canvas>
            <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center font-expedition text-[10.5px] italic text-expedition-faded">
              drag to orbit &middot; scroll to zoom
            </div>
          </div>
        </div>
      </ExpeditionPanel>
    </div>
  );
}
