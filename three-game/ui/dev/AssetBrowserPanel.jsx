'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ExpeditionPanel, GOLD_BUTTON, GOLD_LABEL } from '../expedition/ExpeditionPanel';
import { generatedTreeBrowserAssets } from '../../world/generatedTreePresets';
import { ECOLOGY_ZONE_IDS } from '../../world/ecology';
import { buildEcologyFloraAssetCatalog } from '../../world/ecology/floraAssetCatalog';
import { DARWINIOTHAMNUS_SPECIES } from '../../world/ecology/floraSpecies';
import { getThreeIslandLocation } from '../../data';
import { useThreeGameStore } from '../../store';

// Dev-only asset browser (toggle with the 0 key): inspect active ecology GLBs,
// generated trees, and unplaced candidates in an interactive turntable.

const CANDIDATE_GLB_ASSETS = [
  { id: 'grass-1', label: 'Grass Patch 1 (new)', path: '/assets/models/nature/runtime-grass-patch-1.glb' },
  { id: 'grass-2', label: 'Grass Patch 2 (new)', path: '/assets/models/nature/runtime-grass-patch-2.glb' },
  { id: 'grass-3', label: 'Grass Patch 3 (new)', path: '/assets/models/nature/runtime-grass-patch-3.glb' },
  { id: 'opuntia', label: 'Opuntia study sheet — split before use', path: '/assets/models/nature/runtime-opuntia.glb' },
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
  { id: 'castela-glb', label: 'Galapagos Bitterbush (Castela galapageia)', path: '/assets/models/nature/runtime-palo-santo.glb' },
  { id: 'saltgrass', label: 'Seashore Dropseed (Sporobolus virginicus)', path: '/assets/models/nature/runtime-saltgrass.glb' },
  { id: 'sesuvium', label: 'Galápagos carpetweed / Sesuvium', path: '/assets/models/nature/runtime-sesuvium.glb' },
  { id: 'driftwood', label: 'Bleached Driftwood', path: '/assets/models/nature/runtime-driftwood.glb' },
  { id: 'lava-scree', label: 'Lava Scree Field', path: '/assets/models/nature/runtime-lava-scree.glb' },
  { id: 'mangrove-tree', label: 'Red Mangrove (Rhizophora mangle)', path: '/assets/models/nature/runtime-mangrove-tree.glb' },
  { id: 'cur-dry-grass', label: 'Current: Dry Grass', path: '/assets/models/nature/runtime-animated-dry-grass.glb' },
];

const RUNTIME_FLORA_LABELS = {
  'runtime-animated-dry-grass.glb': 'Dry grass patch',
  'runtime-candelabra-cactus.glb': 'Candelabra cactus',
  'runtime-croton.glb': 'Chala / Croton scouleri',
  'runtime-darwiniothamnus.glb': DARWINIOTHAMNUS_SPECIES.label,
  'runtime-driftwood.glb': 'Bleached driftwood',
  'runtime-galapagos-bushes.glb': 'Galápagos bush collection — split before use',
  'runtime-galapagos-cotton.glb': 'Galápagos cotton',
  'runtime-galapagos-fern.glb': 'Floreana resurrection fern / Pleopeltis polypodioides',
  'runtime-ground-plants.glb': 'Highland ground plants',
  'runtime-mangrove-lowpoly.glb': 'Low-poly coastal mangrove',
  'runtime-mangrove-tree.glb': 'Red mangrove / Rhizophora mangle',
  'runtime-manzanillo.glb': 'Manzanillo / poison apple',
  'runtime-big-opuntia.glb': 'Mature Floreana prickly pear / Opuntia megasperma',
  'runtime-opuntia.glb': 'Opuntia study sheet — split before use',
  'runtime-palo-santo.glb': 'Galapagos bitterbush / Castela galapageia',
  'runtime-purple-shrub.glb': 'Floreana highland flowering shrub — identity unresolved',
  'runtime-saltbush-1.glb': 'Monte salado / saltbush 1',
  'runtime-saltbush-2.glb': 'Monte salado / saltbush 2',
  'runtime-saltbush-3.glb': 'Monte salado / saltbush 3',
  'runtime-saltgrass.glb': 'Seashore dropseed / Sporobolus virginicus',
  'runtime-scalesia-pedunculata-tree.glb': 'Scalesia pedunculata tree',
  'runtime-scalesia-pedunculata.glb': 'Scalesia pedunculata collection — split before use',
  'runtime-scalesia.glb': 'Scalesia villosa',
  'runtime-sesuvium.glb': 'Galápagos carpetweed / Sesuvium',
};

function pathFilename(path) {
  return path?.split('/').pop() || '';
}

function fallbackAssetLabel(path) {
  return pathFilename(path)
    .replace(/\.glb$/i, '')
    .replace(/^runtime-/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function runtimeAssetLabel(path) {
  return RUNTIME_FLORA_LABELS[pathFilename(path)] || fallbackAssetLabel(path);
}

function zoneLabel(zoneId) {
  return getThreeIslandLocation(zoneId)?.name || zoneId.replaceAll('_', ' ');
}

function formatScaleRange(range) {
  if (!range) return null;
  const format = value => Number(value.toFixed(value < 0.1 ? 3 : 2)).toString();
  return range[0] === range[1]
    ? `${format(range[0])}×`
    : `${format(range[0])}–${format(range[1])}×`;
}

function PreviewModel({ path, variantMode = null }) {
  const { scene } = useGLTF(path);
  // Normalize whatever scale the source file uses to a ~2 unit display size,
  // grounded at the origin.
  const cloned = useMemo(() => {
    const clone = scene.clone(true);
    if (variantMode === 'mesh') {
      clone.updateMatrixWorld(true);
      const meshes = [];
      clone.traverse(object => {
        if (!object.isMesh) return;
        const mesh = new THREE.Mesh(object.geometry, object.material);
        mesh.applyMatrix4(object.matrixWorld);
        meshes.push(mesh);
      });
      const grid = new THREE.Group();
      const columns = Math.ceil(Math.sqrt(meshes.length));
      const rows = Math.ceil(meshes.length / columns);
      meshes.forEach((mesh, index) => {
        mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        mesh.position.x -= center.x;
        mesh.position.y -= box.min.y;
        mesh.position.z -= center.z;
        const column = index % columns;
        const row = Math.floor(index / columns);
        mesh.position.x += (column - (columns - 1) / 2) * 0.9;
        mesh.position.z += (row - (rows - 1) / 2) * 0.9;
        grid.add(mesh);
      });
      return normalizeObject(grid);
    }
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
  }, [scene, variantMode]);
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

function AssetBrowserContent({ onClose }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const initialZoneIds = ECOLOGY_ZONE_IDS.includes(currentZoneId) ? [currentZoneId] : [];
  const [catalog, setCatalog] = useState(() => buildEcologyFloraAssetCatalog(initialZoneIds));
  const [indexing, setIndexing] = useState(initialZoneIds.length < ECOLOGY_ZONE_IDS.length);
  const [zoneFilter, setZoneFilter] = useState(initialZoneIds[0] || 'all');
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('assetSearch') || '';
  });
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const buildFullCatalog = () => {
      const next = buildEcologyFloraAssetCatalog();
      if (cancelled) return;
      setCatalog(next);
      setIndexing(false);
    };
    let idleHandle = null;
    let timerHandle = null;
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(buildFullCatalog, { timeout: 250 });
    } else {
      timerHandle = window.setTimeout(buildFullCatalog, 0);
    }
    return () => {
      cancelled = true;
      if (idleHandle != null) window.cancelIdleCallback(idleHandle);
      if (timerHandle != null) window.clearTimeout(timerHandle);
    };
  }, []);

  const browserAssets = useMemo(() => {
    const runtimeAssets = catalog.assets.map(asset => ({
      ...asset,
      label: runtimeAssetLabel(asset.path),
    }));
    const activePaths = new Set(runtimeAssets.map(asset => asset.path));
    const candidateAssets = CANDIDATE_GLB_ASSETS
      .filter(asset => !activePaths.has(asset.path))
      .map(asset => ({ ...asset, kind: 'glb', source: 'candidate', zones: [], usages: [] }));
    const treeAssets = generatedTreeBrowserAssets.map(asset => {
      const usages = catalog.generatedTrees.filter(usage => usage.variants === asset.variants);
      return {
        ...asset,
        source: usages.length ? 'runtime' : 'candidate',
        zones: Array.from(new Set(usages.map(usage => usage.zoneId))),
        usages,
      };
    });
    return [...runtimeAssets, ...treeAssets, ...candidateAssets].sort((a, b) => {
      const rankA = a.source === 'runtime' ? 0 : 1;
      const rankB = b.source === 'runtime' ? 0 : 1;
      return rankA - rankB || a.label.localeCompare(b.label);
    });
  }, [catalog]);

  const zoneOptions = useMemo(() => Array.from(new Set(
    browserAssets.flatMap(asset => asset.zones || []),
  )).sort((a, b) => zoneLabel(a).localeCompare(zoneLabel(b))), [browserAssets]);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return browserAssets.filter(asset => {
      if (zoneFilter !== 'all' && !asset.zones?.includes(zoneFilter)) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        asset.label,
        asset.path,
        asset.note,
        asset.source,
        ...(asset.zones || []).map(zoneLabel),
        ...(asset.usages || []).map(usage => usage.layerId),
      ].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [browserAssets, query, zoneFilter]);

  const asset = filteredAssets.find(item => item.id === selectedId) || filteredAssets[0] || null;
  const visibleUsages = (asset?.usages || []).filter(
    usage => zoneFilter === 'all' || usage.zoneId === zoneFilter,
  );

  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <ExpeditionPanel variant="modal" className="w-[min(70rem,calc(100vw-2rem))]" innerClassName="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={GOLD_LABEL}>Flora Asset Browser (dev)</div>
            <div className="truncate font-expedition text-lg font-semibold text-expedition-parchment">
              {asset?.label || 'No matching flora assets'}
            </div>
            <div className="truncate font-mono text-[10px] text-expedition-faded">
              {asset?.path || asset?.note || 'Try another region or clear the search.'}
            </div>
          </div>
          <button type="button" onClick={onClose} className={GOLD_BUTTON}>Close (0)</button>
        </div>
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_15rem_auto] gap-2">
          <input
            type="search"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setSelectedId(null);
            }}
            onKeyDown={event => event.stopPropagation()}
            placeholder="Search species, asset path, or ecology layer…"
            className="min-w-0 rounded-sm border border-expedition-brass/50 bg-black/25 px-2.5 py-1.5 font-expedition text-xs text-expedition-parchment outline-none placeholder:text-expedition-faded/70 focus:border-expedition-gold"
          />
          <select
            value={zoneFilter}
            onChange={event => {
              setZoneFilter(event.target.value);
              setSelectedId(null);
            }}
            className="rounded-sm border border-expedition-brass/50 bg-[#171d24] px-2.5 py-1.5 font-expedition text-xs text-expedition-parchment outline-none focus:border-expedition-gold"
          >
            <option value="all">All regions + candidates</option>
            {zoneOptions.map(zoneId => (
              <option key={zoneId} value={zoneId}>{zoneLabel(zoneId)}</option>
            ))}
          </select>
          <div className="self-center whitespace-nowrap text-right font-mono text-[10px] text-expedition-faded">
            {filteredAssets.length} assets{indexing ? ' · indexing…' : ''}
          </div>
        </div>
        <div className="grid grid-cols-[19rem_1fr] gap-3">
          <div className="grid max-h-[30rem] content-start gap-1 overflow-auto pr-1">
            {filteredAssets.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`rounded-sm border px-2.5 py-1.5 text-left transition ${
                  item.id === asset?.id
                    ? 'border-expedition-gold bg-expedition-gold/15 text-expedition-goldbright'
                    : 'border-expedition-brass/40 bg-black/20 text-expedition-parchment hover:border-expedition-gold/70'
                }`}
              >
                <span className="block font-expedition text-[12.5px]">{item.label}</span>
                <span className="block truncate font-mono text-[9px] uppercase tracking-wide text-expedition-faded">
                  {item.source === 'runtime'
                    ? `${item.zones.length} region${item.zones.length === 1 ? '' : 's'} · in use`
                    : 'candidate / comparison'}
                </span>
              </button>
            ))}
          </div>
          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-sm border border-expedition-brass/60 bg-[#1c2226]">
            <div className="relative h-[24rem] min-h-0">
              {asset ? (
                <Canvas camera={{ position: [2.2, 1.6, 2.6], fov: 45 }} dpr={[1, 1.5]}>
                  <color attach="background" args={['#1c2226']} />
                  <hemisphereLight args={['#cfe2ee', '#8a7a5a', 0.9]} />
                  <directionalLight position={[4, 6, 3]} intensity={2.2} color="#ffe9c4" />
                  <directionalLight position={[-5, 3, -4]} intensity={0.6} color="#9ec8e8" />
                  <Suspense fallback={null}>
                    {asset.kind === 'ez-tree'
                      ? <PreviewEzTree key={asset.id} variants={asset.variants} />
                      : <PreviewModel key={asset.id} path={asset.path} variantMode={asset.variantMode} />}
                  </Suspense>
                  <gridHelper args={[10, 20, '#4a5258', '#2c3338']} />
                  <OrbitControls makeDefault enableDamping />
                </Canvas>
              ) : null}
              <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center font-expedition text-[10.5px] italic text-expedition-faded">
                {asset?.variantMode === 'mesh'
                  ? '9 source variants · comparison grid only · world placement is procedural'
                  : 'drag to orbit · scroll to zoom · preview normalized to compare form'}
              </div>
            </div>
            <div className="max-h-24 overflow-auto border-t border-expedition-brass/35 bg-black/20 px-3 py-2 font-mono text-[9.5px] text-expedition-faded">
              {asset?.source === 'runtime' ? (
                visibleUsages.map(usage => (
                  <div key={`${usage.zoneId}:${usage.layerId}`} className="mb-0.5 last:mb-0">
                    <span className="text-expedition-parchment">{zoneLabel(usage.zoneId)}</span>
                    {' · '}{usage.layerId}{usage.itemCount ? ` · ${usage.itemCount} instances` : ''}
                    {usage.scaleRange ? ` · ${formatScaleRange(usage.scaleRange)} layer scale` : ''}
                    {usage.placementStats?.generatedPatchCount
                      ? ` · ${usage.placementStats.generatedPatchCount} patches`
                      : ''}
                    {usage.procedural ? ' · procedural overlay' : ''}
                  </div>
                ))
              ) : (
                <div>{asset?.note || 'Available for comparison; not placed by a registered ecology layer.'}</div>
              )}
            </div>
          </div>
        </div>
      </ExpeditionPanel>
    </div>
  );
}

export function AssetBrowserPanel({ open, onClose }) {
  if (!open) return null;
  return <AssetBrowserContent onClose={onClose} />;
}
