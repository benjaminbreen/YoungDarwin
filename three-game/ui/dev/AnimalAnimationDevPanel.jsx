'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { modelAssets } from '../../modelAssets';
import { ExpeditionPanel, GOLD_BUTTON, GOLD_LABEL } from '../expedition/ExpeditionPanel';

const DIRECT_ANIMAL_ASSETS = {
  reefFish: {
    id: 'reefFish',
    label: 'Reef Fish',
    path: '/assets/models/animals/runtime/reef-fish.glb',
    source: 'Ecology swimmer',
  },
  clownfish: {
    id: 'clownfish',
    label: 'Clownfish',
    path: '/assets/models/animals/runtime/clownfish.glb',
    source: 'Ecology swimmer',
  },
  mantaRayRuntime: {
    id: 'mantaRayRuntime',
    label: 'Manta Ray',
    path: '/assets/models/animals/runtime/manta-ray.glb',
    source: 'Ecology swimmer',
  },
};

const MODEL_ANIMAL_LABELS = {
  crab: 'Sally Lightfoot Crab',
  marineIguana: 'Marine Iguana',
  lavalizard: 'Floreana Lava Lizard',
  mediumGroundFinch: 'Medium Ground Finch',
  floreanaGiantTortoise: 'Floreana Giant Tortoise',
  galapagosPenguin: 'Galapagos Penguin',
  flightlessCormorant: 'Flightless Cormorant',
  greenTurtle: 'Green Turtle',
  seaLion: 'Sea Lion',
};

const MODEL_ANIMAL_IDS = [
  'crab',
  'marineIguana',
  'lavalizard',
  'mediumGroundFinch',
  'floreanaGiantTortoise',
  'galapagosPenguin',
  'flightlessCormorant',
  'greenTurtle',
  'seaLion',
];

function assetLoadUrl(asset) {
  if (!asset?.cacheKey) return asset?.path;
  return `${asset.path}?v=${encodeURIComponent(asset.cacheKey)}`;
}

function titleCaseId(id) {
  return String(id || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function animalEntries() {
  const manifestAnimals = MODEL_ANIMAL_IDS
    .map(id => {
      const asset = modelAssets[id];
      if (!asset?.enabled || !asset.path) return null;
      return {
        id,
        label: MODEL_ANIMAL_LABELS[id] || titleCaseId(id),
        path: assetLoadUrl(asset),
        source: 'Model manifest',
        asset,
      };
    })
    .filter(Boolean);
  return [...manifestAnimals, ...Object.values(DIRECT_ANIMAL_ASSETS)];
}

const ANIMAL_ENTRIES = animalEntries();

function normalizePreviewObject(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  object.position.sub(center);
  object.position.y += size.y / 2;
  object.scale.setScalar(2.35 / maxDim);
  return object;
}

function preparePreviewScene(source, asset) {
  const clone = normalizePreviewObject(cloneSkeleton(source));
  clone.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const prepared = materials.map(material => {
      if (!material) return material;
      const next = material.clone();
      if ('metalness' in next) next.metalness = Math.min(next.metalness || 0, 0.02);
      if ('roughness' in next) next.roughness = Math.max(next.roughness || 0, 0.76);
      if (next.color && asset?.materialLift) next.color.lerp(new THREE.Color('#f1dfbd'), asset.materialLift);
      next.toneMapped = false;
      next.needsUpdate = true;
      return next;
    });
    object.material = Array.isArray(object.material) ? prepared : prepared[0];
  });
  return clone;
}

function AnimalPreview({ animal, selectedClip, paused, timeScale, onAnimations }) {
  const { scene, animations } = useGLTF(animal.path);
  const model = useMemo(() => preparePreviewScene(scene, animal.asset), [animal.asset, scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const active = useRef(null);
  const animationNames = useMemo(() => animations.map(clip => clip.name).sort((a, b) => a.localeCompare(b)), [animations]);
  const clipMap = useMemo(() => new Map(animations.map(clip => [clip.name, clip])), [animations]);

  useEffect(() => {
    onAnimations(animal.id, animationNames);
  }, [animal.id, animationNames, onAnimations]);

  useEffect(() => {
    const clip = clipMap.get(selectedClip) || animations[0];
    if (!clip) {
      active.current = null;
      return undefined;
    }
    const action = mixer.clipAction(clip);
    if (active.current && active.current !== action) active.current.fadeOut(0.12);
    action.reset();
    action.enabled = true;
    action.paused = paused;
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.fadeIn(0.12).play();
    active.current = action;
    return () => {
      action.fadeOut(0.08);
    };
  }, [animations, clipMap, mixer, paused, selectedClip, timeScale]);

  useEffect(() => {
    if (active.current) active.current.paused = paused;
  }, [paused]);

  useEffect(() => {
    if (active.current) active.current.setEffectiveTimeScale(timeScale);
  }, [timeScale]);

  useFrame((_, delta) => {
    mixer.update(delta);
  });

  return <primitive object={model} />;
}

function AnimalButton({ animal, selected, clips, onClick }) {
  const count = clips?.length || 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm border px-2 py-2 text-left font-expedition transition ${
        selected
          ? 'border-expedition-gold bg-expedition-gold/15 text-expedition-goldbright'
          : 'border-expedition-brass/35 bg-black/20 text-expedition-parchment hover:border-expedition-gold/70'
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold">{animal.label}</span>
        <span className="block truncate font-mono text-[10px] text-expedition-faded">{animal.source}</span>
      </span>
      <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${
        count ? 'border-emerald-300/50 text-emerald-200' : 'border-red-300/40 text-red-200/75'
      }`}>
        {count}
      </span>
    </button>
  );
}

function AnimationProbe({ animal, onAnimations }) {
  const { animations } = useGLTF(animal.path);
  const animationNames = useMemo(() => animations.map(clip => clip.name).sort((a, b) => a.localeCompare(b)), [animations]);

  useEffect(() => {
    onAnimations(animal.id, animationNames);
  }, [animal.id, animationNames, onAnimations]);

  return null;
}

function ClipButton({ name, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm border px-2 py-1.5 text-left font-expedition text-[12px] transition ${
        selected
          ? 'border-expedition-gold bg-expedition-gold/15 text-expedition-goldbright'
          : 'border-expedition-brass/35 bg-black/20 text-expedition-parchment hover:border-expedition-gold/70'
      }`}
    >
      {name}
    </button>
  );
}

export function AnimalAnimationDevPanel({ open, onClose }) {
  const [selectedAnimalId, setSelectedAnimalId] = useState(
    modelAssets.flightlessCormorant?.enabled ? 'flightlessCormorant' : ANIMAL_ENTRIES[0]?.id,
  );
  const [selectedClip, setSelectedClip] = useState('walk');
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [animationMap, setAnimationMap] = useState({});

  const onAnimations = React.useCallback((animalId, names) => {
    setAnimationMap(current => {
      const previous = current[animalId] || [];
      if (previous.length === names.length && previous.every((name, index) => name === names[index])) return current;
      return { ...current, [animalId]: names };
    });
  }, []);

  const selectedAnimal = useMemo(
    () => ANIMAL_ENTRIES.find(animal => animal.id === selectedAnimalId) || ANIMAL_ENTRIES[0],
    [selectedAnimalId],
  );
  const clips = animationMap[selectedAnimal?.id] || [];

  useEffect(() => {
    if (!clips.length) return;
    if (!clips.includes(selectedClip)) setSelectedClip(clips.includes('walk') ? 'walk' : clips[0]);
  }, [clips, selectedClip]);

  if (!open || !selectedAnimal) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] bg-black/58 p-3 backdrop-blur-sm">
      <ExpeditionPanel className="mx-auto flex h-full max-w-[82rem] flex-col" innerClassName="flex h-full flex-col p-4">
        <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
          <Canvas frameloop="demand" camera={{ position: [0, 0, 1] }}>
            <Suspense fallback={null}>
              {ANIMAL_ENTRIES.map(animal => (
                <AnimationProbe key={`probe-${animal.id}`} animal={animal} onAnimations={onAnimations} />
              ))}
            </Suspense>
          </Canvas>
        </div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className={GOLD_LABEL}>Animal Animation Lab</div>
            <div className="font-expedition text-lg font-semibold text-expedition-parchment">{selectedAnimal.label}</div>
            <div className="font-expedition text-xs text-expedition-faded">
              {clips.length ? `${clips.length} embedded clip${clips.length === 1 ? '' : 's'} in ${selectedAnimal.path}` : `No embedded animation clips found in ${selectedAnimal.path}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPaused(value => !value)} className={GOLD_BUTTON}>{paused ? 'Play' : 'Pause'}</button>
            <label className="flex items-center gap-2 font-expedition text-xs text-expedition-faded">
              Speed
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.05"
                value={timeScale}
                onChange={event => setTimeScale(Number(event.target.value))}
                className="w-28 accent-amber-200"
              />
              <span className="w-9 font-mono">{timeScale.toFixed(2)}</span>
            </label>
            <button type="button" onClick={onClose} className={GOLD_BUTTON}>Close (7)</button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[18rem_16rem_1fr] gap-3">
          <div className="min-h-0 overflow-auto pr-1">
            <div className="mb-2 flex items-center justify-between border-b border-expedition-brass/50 pb-1">
              <span className={GOLD_LABEL}>Animals</span>
              <span className="font-mono text-[10px] text-expedition-faded">{ANIMAL_ENTRIES.length}</span>
            </div>
            <div className="grid gap-1">
              {ANIMAL_ENTRIES.map(animal => (
                <AnimalButton
                  key={animal.id}
                  animal={animal}
                  selected={animal.id === selectedAnimal.id}
                  clips={animationMap[animal.id]}
                  onClick={() => {
                    setSelectedAnimalId(animal.id);
                    const names = animationMap[animal.id] || [];
                    setSelectedClip(names.includes('walk') ? 'walk' : names[0] || '');
                  }}
                />
              ))}
            </div>
          </div>
          <div className="min-h-0 overflow-auto pr-1">
            <div className="mb-2 flex items-center justify-between border-b border-expedition-brass/50 pb-1">
              <span className={GOLD_LABEL}>Clips</span>
              <span className="font-mono text-[10px] text-expedition-faded">{clips.length}</span>
            </div>
            {clips.length ? (
              <div className="grid gap-1">
                {clips.map(name => (
                  <ClipButton
                    key={name}
                    name={name}
                    selected={name === selectedClip}
                    onClick={() => setSelectedClip(name)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-sm border border-red-300/30 bg-red-950/20 px-3 py-2 font-expedition text-xs text-red-100/80">
                This animal GLB is static. It can still be reviewed here, but there is no clip for the mixer to play.
              </div>
            )}
          </div>
          <div className="min-h-0">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div>
                <div className="font-expedition text-sm font-semibold text-expedition-parchment">{selectedClip || 'static preview'}</div>
                <div className="font-mono text-[10px] text-expedition-faded">{selectedAnimal.path}</div>
              </div>
            </div>
            <div className="h-[32rem] overflow-hidden rounded-sm border border-expedition-brass/60 bg-[#20262a]">
              <Canvas camera={{ position: [2.3, 1.45, 3.0], fov: 42 }} dpr={[1, 1.5]} shadows>
                <color attach="background" args={['#20262a']} />
                <hemisphereLight args={['#d6e9f4', '#6f634f', 1.0]} />
                <directionalLight castShadow position={[4, 7, 4]} intensity={2.4} color="#ffe7bf" />
                <directionalLight position={[-5, 2.4, -4]} intensity={0.75} color="#9fc9ec" />
                <Suspense fallback={null}>
                  <AnimalPreview
                    key={selectedAnimal.id}
                    animal={selectedAnimal}
                    selectedClip={selectedClip}
                    paused={paused}
                    timeScale={timeScale}
                    onAnimations={onAnimations}
                  />
                </Suspense>
                <gridHelper args={[8, 16, '#586168', '#343c42']} />
                <OrbitControls makeDefault enableDamping target={[0, 1.0, 0]} />
              </Canvas>
            </div>
          </div>
        </div>
      </ExpeditionPanel>
    </div>
  );
}
