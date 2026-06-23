'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ExpeditionPanel, GOLD_BUTTON, GOLD_LABEL } from '../expedition/ExpeditionPanel';
import { generatedTreeBrowserAssets } from '../../world/generatedTreePresets';

// Dev-only asset browser (toggle with the 0 key): preview candidate GLBs in an
// interactive turntable before committing them to the world. Drag to orbit,
// scroll to zoom.

const BROWSER_ASSETS = [
  { id: 'grass-1', label: 'Grass Patch 1 (new)', path: '/assets/models/nature/runtime-grass-patch-1.glb' },
  { id: 'grass-2', label: 'Grass Patch 2 (new)', path: '/assets/models/nature/runtime-grass-patch-2.glb' },
  { id: 'grass-3', label: 'Grass Patch 3 (new)', path: '/assets/models/nature/runtime-grass-patch-3.glb' },
  { id: 'opuntia', label: 'Opuntia / Prickly Pear (new)', path: '/assets/models/nature/runtime-opuntia.glb' },
  { id: 'candelabra-cactus', label: 'Candelabra Cactus (new)', path: '/assets/models/nature/runtime-candelabra-cactus.glb' },
  { id: 'ground-plants', label: 'Ground Plants (new)', path: '/assets/models/nature/runtime-ground-plants.glb' },
  // Northern Shore flora set — named for the species Darwin would have met on
  // Floreana's arid coastal zone in 1835.
  { id: 'saltbush-1', label: 'Monte Salado / Saltbush 1 (Cryptocarpus)', path: '/assets/models/nature/runtime-saltbush-1.glb' },
  { id: 'saltbush-2', label: 'Monte Salado / Saltbush 2 (Cryptocarpus)', path: '/assets/models/nature/runtime-saltbush-2.glb' },
  { id: 'saltbush-3', label: 'Monte Salado / Saltbush 3 (large)', path: '/assets/models/nature/runtime-saltbush-3.glb' },
  { id: 'croton', label: 'Chala / Croton scouleri', path: '/assets/models/nature/runtime-croton.glb' },
  { id: 'scalesia', label: 'Scalesia villosa (Floreana endemic)', path: '/assets/models/nature/runtime-scalesia.glb' },
  { id: 'scalesia-pedunculata-tree', label: 'Scalesia pedunculata tree (new)', path: '/assets/models/nature/runtime-scalesia-pedunculata-tree.glb' },
  { id: 'palo-santo', label: 'Palo Santo (Bursera graveolens)', path: '/assets/models/nature/runtime-palo-santo.glb' },
  { id: 'saltgrass', label: 'Saltgrass (Distichlis spicata)', path: '/assets/models/nature/runtime-saltgrass.glb' },
  { id: 'morning-glory', label: 'Beach Morning Glory (Ipomoea pes-caprae)', path: '/assets/models/nature/runtime-morning-glory.glb' },
  { id: 'sesuvium', label: 'Galapagos Carpetweed (Sesuvium)', path: '/assets/models/nature/runtime-sesuvium.glb' },
  { id: 'driftwood', label: 'Bleached Driftwood', path: '/assets/models/nature/runtime-driftwood.glb' },
  { id: 'lava-scree', label: 'Lava Scree Field', path: '/assets/models/nature/runtime-lava-scree.glb' },
  { id: 'drybrush', label: 'Dry Wrack & Brush Field', path: '/assets/models/nature/runtime-drybrush.glb' },
  { id: 'mangrove-tree', label: 'Mangrove Tree (new)', path: '/assets/models/nature/runtime-mangrove-tree.glb' },
  { id: 'cur-dry-grass', label: 'Current: Dry Grass', path: '/assets/models/nature/runtime-animated-dry-grass.glb' },
  { id: 'cur-shrub', label: 'Current: Shrub', path: '/assets/models/nature/runtime-plant-shrub.glb' },
  { id: 'cur-small-shrub', label: 'Current: Small Shrub', path: '/assets/models/nature/runtime-small-shrub.glb' },
  { id: 'cur-flat-cactus', label: 'Current: Flat Cactus', path: '/assets/models/nature/runtime-flat-cactus.glb' },
  ...generatedTreeBrowserAssets,
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

function applyTreeOptions(tree, variant, index) {
  const usingPreset = Boolean(variant.basePreset);
  if (usingPreset && typeof tree.loadPreset === 'function') tree.loadPreset(variant.basePreset);
  const options = tree.options;
  const set = (target, key, value, fallback) => {
    if (value !== undefined) target[key] = value;
    else if (!usingPreset && fallback !== undefined) target[key] = fallback;
  };
  set(options, 'seed', variant.seed, 9000 + index * 97);
  set(options, 'type', variant.type, 'deciduous');
  set(options.bark, 'type', variant.barkType, 'oak');
  set(options.bark, 'tint', variant.barkTint, 0x7d6a4d);
  set(options.bark, 'flatShading', variant.flatShading, true);
  set(options.bark, 'textured', variant.textured, false);
  set(options.branch, 'levels', variant.levels, 2);
  set(options.branch.angle, 1, variant.angle1, 58);
  set(options.branch.angle, 2, variant.angle2, 46);
  set(options.branch.children, 0, variant.children0, 5);
  set(options.branch.children, 1, variant.children1, 3);
  set(options.branch.force.direction, 'x', variant.forceX, 0.18);
  set(options.branch.force.direction, 'y', variant.forceY, 0.7);
  set(options.branch.force.direction, 'z', variant.forceZ, 0.06);
  set(options.branch.force, 'strength', variant.forceStrength, 0.018);
  set(options.branch.gnarliness, 0, variant.gnarliness0, 0.22);
  set(options.branch.gnarliness, 1, variant.gnarliness1, 0.34);
  set(options.branch.gnarliness, 2, variant.gnarliness2, 0.24);
  set(options.branch.length, 0, variant.trunkLength, 4.7);
  set(options.branch.length, 1, variant.branchLength1, 2.6);
  set(options.branch.length, 2, variant.branchLength2, 1.35);
  set(options.branch.radius, 0, variant.trunkRadius, 0.22);
  set(options.branch.radius, 1, variant.branchRadius1, 0.1);
  set(options.branch.radius, 2, variant.branchRadius2, 0.045);
  set(options.branch.sections, 0, variant.sections0, 5);
  set(options.branch.sections, 1, variant.sections1, 4);
  set(options.branch.sections, 2, variant.sections2, 3);
  set(options.branch.segments, 0, variant.segments0, 5);
  set(options.branch.segments, 1, variant.segments1, 4);
  set(options.branch.segments, 2, variant.segments2, 3);
  set(options.branch.start, 1, variant.start1, 0.24);
  set(options.branch.start, 2, variant.start2, 0.18);
  set(options.branch.taper, 0, variant.taper0, 0.78);
  set(options.branch.taper, 1, variant.taper1, 0.7);
  set(options.branch.taper, 2, variant.taper2, 0.7);
  set(options.branch.twist, 0, variant.twist0, 0.12);
  set(options.branch.twist, 1, variant.twist1, 0.18);
  set(options.leaves, 'type', variant.leafType, 'oak');
  set(options.leaves, 'billboard', variant.billboard, 'double');
  set(options.leaves, 'angle', variant.leafAngle, 24);
  set(options.leaves, 'count', variant.leafCount, 42);
  set(options.leaves, 'start', variant.leafStart, 0.12);
  set(options.leaves, 'size', variant.leafSize, 0.46);
  set(options.leaves, 'sizeVariance', variant.leafSizeVariance, 0.45);
  set(options.leaves, 'tint', variant.leafTint, 0x88935e);
  set(options.leaves, 'alphaTest', variant.alphaTest, 0.42);
}

function normalizeObject(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2 / maxDim;
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  object.position.y += size.y / 2;
  object.scale.setScalar(scale);
  return object;
}

function PreviewEzTree({ variants }) {
  const [ezTree, setEzTree] = useState(null);
  useEffect(() => {
    let active = true;
    import('@dgreenheck/ez-tree').then(module => {
      if (active) setEzTree(module);
    });
    return () => {
      active = false;
    };
  }, []);

  const group = useMemo(() => {
    if (!ezTree) return null;
    const root = new THREE.Group();
    variants.forEach((variant, index) => {
      const tree = new ezTree.Tree();
      applyTreeOptions(tree, variant, index);
      tree.generate();
      tree.traverse(object => {
        if (!object.isMesh) return;
        object.material = object.material.clone();
        const isLeaf = object.name?.toLowerCase().includes('leaves') || object === tree.leavesMesh;
        object.material.color = new THREE.Color(isLeaf ? variant.leafColor || '#899260' : variant.barkColor || '#7b684f');
        if (isLeaf) {
          object.material.side = THREE.DoubleSide;
          object.material.transparent = true;
          object.material.alphaTest = variant.alphaTest ?? 0.42;
          if (object.material.emissive) object.material.emissive = new THREE.Color(variant.leafColor || '#899260').multiplyScalar(0.08);
        } else {
          object.material.map = null;
          object.material.alphaMap = null;
        }
      });
      const x = variants.length === 1 ? 0 : (index - (variants.length - 1) / 2) * 1.65;
      tree.position.set(x, 0, 0);
      root.add(tree);
    });
    return normalizeObject(root);
  }, [ezTree, variants]);

  if (!group) return null;
  return <primitive object={group} />;
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
            <div className="font-mono text-[10px] text-expedition-faded">{asset.path || asset.note}</div>
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
                {asset.kind === 'ez-tree'
                  ? <PreviewEzTree key={asset.id} variants={asset.variants} />
                  : <PreviewModel key={asset.id} path={asset.path} />}
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
