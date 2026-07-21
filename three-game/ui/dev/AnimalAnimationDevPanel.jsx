'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { modelAssets } from '../../modelAssets';
import { wildlifeCatalog } from '../../wildlife/wildlifeCatalog';
import { createReptileAnimator } from '../../wildlife/reptiles/reptileGaitRuntime';
import { createLavaLizardRig, LAVA_LIZARD_GAIT } from '../../wildlife/reptiles/lavaLizardModel';
import { ProceduralFinchPlayer } from '../../components/player/ProceduralFinchPlayer';
import { ExpeditionPanel, GOLD_BUTTON, GOLD_LABEL } from '../expedition/ExpeditionPanel';

const DIRECT_ANIMAL_ASSETS = {
  reefFish: {
    id: 'reefFish',
    label: 'Reef Fish',
    path: '/assets/models/animals/runtime/reef-fish.glb',
    runtimePath: '/assets/models/animals/runtime/reef-fish.glb',
    contactAsset: '/assets/models/animals/runtime/reef-fish.glb',
    source: 'Ecology swimmer',
  },
  clownfish: {
    id: 'clownfish',
    label: 'Clownfish',
    path: '/assets/models/animals/runtime/clownfish.glb',
    runtimePath: '/assets/models/animals/runtime/clownfish.glb',
    contactAsset: '/assets/models/animals/runtime/clownfish.glb',
    source: 'Ecology swimmer',
  },
  mantaRayRuntime: {
    id: 'mantaRayRuntime',
    label: 'Manta Ray',
    path: '/assets/models/animals/runtime/manta-ray.glb',
    runtimePath: '/assets/models/animals/runtime/manta-ray.glb',
    contactAsset: '/assets/models/animals/runtime/manta-ray.glb',
    source: 'Ecology swimmer',
  },
};

// Hand-authored procedural rigs have no GLB or clips; their "clips" are
// behavior modes fed straight into the reptile animator, so the lab previews
// exactly what ships in-game (plus lab-shortened display/bask timers so you
// never wait long for a push-up).
const PROC_LAB_GAIT = {
  ...LAVA_LIZARD_GAIT,
  pushup: { minGap: 1.6, maxGap: 3.2 },
  bask: { after: 1.6 },
  tongueMin: 1.2,
  tongueMax: 3.2,
  tailFlickMin: 3,
  tailFlickMax: 7,
};

const PROC_MODES = [
  'idle',
  'walk',
  'sprint',
  'push-up display',
  'tongue & blinks',
  'freeze & cock',
  'bask',
  'carried',
  'downed',
];

const PROCEDURAL_BIRD_MODES = [
  'idle display',
  'forage',
  'walk',
  'run',
  'flight',
];

function procModeInputs(mode, t) {
  switch (mode) {
    case 'walk': return { speed: 0.38, playerDist: 8 };
    case 'sprint': return { speed: 2.5, playerDist: 8 };
    case 'push-up display': return { speed: 0, playerDist: 2.4, observer: true };
    case 'tongue & blinks': return { speed: 0, playerDist: 2.6, observer: true };
    case 'freeze & cock': {
      // Loop a short sprint into a dead stop so the head-cock retriggers.
      const cycle = t % 3.6;
      return cycle < 1.15
        ? { speed: 2.5, playerDist: 5 }
        : { speed: 0, playerDist: 3, observer: true };
    }
    case 'bask': return { speed: 0, playerDist: 12 };
    case 'carried': return { speed: 0, playerDist: 0.8, held: true };
    case 'downed': return { speed: 0, playerDist: 2, downed: true };
    default: return { speed: 0, playerDist: 7 };
  }
}

const PROCEDURAL_ANIMALS = [
  {
    id: 'mediumGroundFinchProcedural',
    kind: 'procedural',
    proceduralType: 'bird',
    variant: 'mediumGround',
    label: 'New Medium Ground Finch',
    source: 'Hand-authored procedural bird rig',
    path: 'three-game/components/player/ProceduralFinchPlayer.jsx',
    modes: PROCEDURAL_BIRD_MODES,
  },
  {
    id: 'floreanaMockingbirdProcedural',
    kind: 'procedural',
    proceduralType: 'bird',
    variant: 'floreanaMockingbird',
    label: 'New Floreana Mockingbird',
    source: 'Hand-authored procedural bird rig',
    path: 'three-game/components/player/ProceduralFinchPlayer.jsx',
    modes: PROCEDURAL_BIRD_MODES,
  },
  {
    id: 'lavaLizardProceduralMale',
    kind: 'procedural',
    label: 'New Floreana Lava Lizard ♂',
    source: 'Hand-authored procedural rig',
    path: 'three-game/wildlife/reptiles/lavaLizardModel.js',
    modes: PROC_MODES,
    createRig: () => createLavaLizardRig('male'),
  },
  {
    id: 'lavaLizardProceduralFemale',
    kind: 'procedural',
    label: 'New Floreana Lava Lizard ♀',
    source: 'Hand-authored procedural rig',
    path: 'three-game/wildlife/reptiles/lavaLizardModel.js',
    modes: PROC_MODES,
    createRig: () => createLavaLizardRig('female'),
  },
];

const wildlifeLabelsByAsset = Object.values(wildlifeCatalog).reduce((labels, entry) => {
  if (entry.assetId && entry.englishName && !labels[entry.assetId]) labels[entry.assetId] = entry.englishName;
  return labels;
}, {});

const MODEL_ANIMAL_LABELS = {
  tripoTortoiseRigged: 'Playable Tortoise',
  crab: 'Sally Lightfoot Crab',
  marineIguana: 'Marine Iguana',
  lavalizard: 'Floreana Lava Lizard',
  mediumGroundFinch: 'Medium Ground Finch',
  floreanaGiantTortoise: 'Floreana Giant Tortoise',
  galapagosPenguin: 'Galapagos Penguin',
  flightlessCormorant: 'Flightless Cormorant',
  frigatebird: 'Magnificent Frigatebird',
  blueFootedBooby: 'Blue-footed Booby',
  galapagosDoveRigged: 'Galapagos Dove',
  greenTurtle: 'Green Turtle',
  animatedLowPolyFish: 'Low-poly Reef Fish',
  seaLion: 'Sea Lion',
  flamingoAnimated: 'American Flamingo',
  seagull: 'Seagull',
  hermitCrab: 'Hermit Crab',
};

const MODEL_ANIMAL_SOURCES = {
  tripoTortoiseRigged: 'Playable animal',
};

const PREFERRED_MODEL_ANIMAL_IDS = [
  'tripoTortoiseRigged',
  'crab',
  'marineIguana',
  'lavalizard',
  'mediumGroundFinch',
  'floreanaGiantTortoise',
  'galapagosPenguin',
  'flightlessCormorant',
  'frigatebird',
  'blueFootedBooby',
  'galapagosDoveRigged',
  'greenTurtle',
  'animatedLowPolyFish',
  'seaLion',
  'flamingoAnimated',
  'seagull',
  'hermitCrab',
];

const MODEL_ANIMAL_IDS = Array.from(new Set([
  ...PREFERRED_MODEL_ANIMAL_IDS,
  ...Object.values(wildlifeCatalog).map(entry => entry.assetId).filter(Boolean),
]));

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
      if (!asset?.path) return null;
      return {
        id,
        label: MODEL_ANIMAL_LABELS[id] || wildlifeLabelsByAsset[id] || titleCaseId(id),
        path: assetLoadUrl(asset),
        runtimePath: asset.path,
        contactAsset: id,
        source: MODEL_ANIMAL_SOURCES[id] || (asset.enabled ? 'Model manifest' : 'Model manifest (disabled)'),
        asset,
      };
    })
    .filter(Boolean);
  return [...PROCEDURAL_ANIMALS, ...manifestAnimals, ...Object.values(DIRECT_ANIMAL_ASSETS)];
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
      if (asset?.doubleSide) next.side = THREE.DoubleSide;
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

// Live procedural rig preview: same rig + animator as the in-game specimen,
// walking in place, with a synthetic "observer" standing in for Darwin so the
// look-at, push-up, and tongue behaviors fire on demand.
function ProceduralReptilePreview({ animal, mode, paused, timeScale }) {
  const rig = useMemo(() => animal.createRig(), [animal]);
  const animator = useMemo(
    () => createReptileAnimator({ nodes: rig.nodes, config: PROC_LAB_GAIT, seed: `lab-${animal.id}` }),
    [animal.id, rig],
  );
  const clockRef = useRef(0);
  const observer = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (paused) return;
    const dt = Math.min(delta, 0.05) * timeScale;
    if (dt <= 0) return;
    clockRef.current += dt;
    const t = clockRef.current;
    const inputs = procModeInputs(mode, t);
    const playerLocal = inputs.observer
      ? observer.set(Math.sin(t * 0.35) * 1.8, 1.25, -2.3)
      : null;
    animator.update({
      dt,
      time: t,
      speed: inputs.speed || 0,
      playerLocal,
      playerDist: inputs.playerDist ?? 8,
      daylight: 0.95,
      rain: 0,
      downed: Boolean(inputs.downed),
      held: Boolean(inputs.held),
    });
  });

  // Match the GLB previews' normalization (~2.35 max dimension on the grid).
  return (
    <group position={[0, 0.03, 0]} scale={5.2}>
      <primitive object={rig.group} />
    </group>
  );
}

function ProceduralBirdPreview({ animal, mode, paused, timeScale }) {
  const motionRef = useRef({});
  useFrame(({ clock }) => {
    const flight = mode === 'flight';
    const speed = mode === 'walk' ? 0.34 : mode === 'run' ? 1.65 : flight ? 3 : 0;
    motionRef.current = {
      speed,
      flying: flight,
      flightPhase: flight ? 'cruise' : null,
      flightFlap: flight && Math.sin(clock.elapsedTime * 0.75) > -0.2,
      action: mode === 'forage' ? 'animalEat' : null,
      timeScale: paused ? 0 : timeScale,
    };
  });

  return (
    <group position={[0, 0.5, 0]} scale={5.2}>
      <ProceduralFinchPlayer motionRef={motionRef} variant={animal.variant} />
    </group>
  );
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

function recommendedContactView(animal, clip) {
  const key = `${animal?.id || ''} ${animal?.label || ''} ${clip || ''}`.toLowerCase();
  if (/(turninplace|turn|pivot)/.test(key)) return 'top';
  if (/(fish|manta|turtle|sea lion|swim|walk|run|reverse|startwalk|stopwalk|browse|drink|mudstep|slide|crawl|waddle|scuttle)/.test(key)) return 'side';
  if (/(strafe|symmetry)/.test(key)) return 'front';
  return 'threeQuarter';
}

function recommendedMotionTrail(animal, clip) {
  const key = `${animal?.id || ''} ${clip || ''}`.toLowerCase();
  return /(walk|run|reverse|turn|mudstep|swim|crawl|waddle|scuttle|slide)/.test(key);
}

function recommendedIncline(animal, clip) {
  const key = `${animal?.id || ''} ${clip || ''}`.toLowerCase();
  return /tripo.*slopebrace|slopebrace/.test(key);
}

export function AnimalAnimationDevPanel({ open, onClose }) {
  const [selectedAnimalId, setSelectedAnimalId] = useState(
    modelAssets.tripoTortoiseRigged?.enabled ? 'tripoTortoiseRigged' : (modelAssets.flightlessCormorant?.enabled ? 'flightlessCormorant' : ANIMAL_ENTRIES[0]?.id),
  );
  const [selectedClip, setSelectedClip] = useState('walk');
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [animationMap, setAnimationMap] = useState({});
  const [contactView, setContactView] = useState('threeQuarter');
  const [contactMotionTrail, setContactMotionTrail] = useState(false);
  const [contactIncline, setContactIncline] = useState(false);
  const [contactSheet, setContactSheet] = useState({ status: 'idle' });

  const onAnimations = React.useCallback((animalId, names) => {
    setAnimationMap(current => {
      const previous = current[animalId] || [];
      if (previous.length === names.length && previous.every((name, index) => name === names[index])) return current;
      return { ...current, [animalId]: names };
    });
  }, []);

  // Procedural rigs have no GLB to probe; their behavior modes stand in as
  // the clip list.
  useEffect(() => {
    for (const animal of PROCEDURAL_ANIMALS) onAnimations(animal.id, animal.modes);
  }, [onAnimations]);

  const selectedAnimal = useMemo(
    () => ANIMAL_ENTRIES.find(animal => animal.id === selectedAnimalId) || ANIMAL_ENTRIES[0],
    [selectedAnimalId],
  );
  const clips = useMemo(
    () => animationMap[selectedAnimal?.id] || [],
    [animationMap, selectedAnimal?.id],
  );

  useEffect(() => {
    if (!clips.length) return;
    if (!clips.includes(selectedClip)) setSelectedClip(clips.includes('walk') ? 'walk' : clips[0]);
  }, [clips, selectedClip]);

  useEffect(() => {
    setContactView(recommendedContactView(selectedAnimal, selectedClip));
    setContactMotionTrail(recommendedMotionTrail(selectedAnimal, selectedClip));
    setContactIncline(recommendedIncline(selectedAnimal, selectedClip));
    setContactSheet({ status: 'idle' });
  }, [selectedAnimal, selectedClip]);

  const requestContactSheet = React.useCallback(async payload => {
    if (!selectedAnimal || !selectedClip) return;
    setContactSheet({ status: 'running', message: 'Rendering Blender contact sheet...' });
    try {
      const response = await fetch('/api/animation-contact-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: selectedAnimal.contactAsset || selectedAnimal.runtimePath || selectedAnimal.path?.split('?')[0],
          outputId: selectedAnimal.id,
          ...payload,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const detail = data.stderr || data.error || `Request failed with ${response.status}`;
        throw new Error(detail);
      }
      setContactSheet({
        status: 'success',
        sheet: data.sheet,
        overview: data.overview,
        directory: data.directory,
        message: `Saved ${data.sheet || data.overview || data.directory}`,
      });
    } catch (error) {
      setContactSheet({
        status: 'error',
        message: error.message || 'Failed to generate contact sheet.',
      });
    }
  }, [selectedAnimal, selectedClip]);

  const generateContactSheet = React.useCallback(() => requestContactSheet({
    clip: selectedClip,
    view: contactView,
    frames: 12,
    size: 360,
    ground: true,
    motionTrail: contactMotionTrail,
    incline: contactIncline ? 12 : 0,
    overview: false,
  }), [contactIncline, contactMotionTrail, contactView, requestContactSheet, selectedClip]);

  const generateOverview = React.useCallback(() => requestContactSheet({
    clip: 'all',
    preset: 'quick',
    views: ['threeQuarter'],
    frames: 3,
    size: 220,
    ground: true,
    overview: true,
    yesAll: true,
  }), [requestContactSheet]);

  if (!open || !selectedAnimal) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] bg-black/58 p-3 backdrop-blur-sm">
      <ExpeditionPanel variant="modal" className="mx-auto flex h-full max-w-[82rem] flex-col" innerClassName="flex h-full flex-col p-4">
        <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
          <Canvas frameloop="demand" camera={{ position: [0, 0, 1] }}>
            <Suspense fallback={null}>
              {ANIMAL_ENTRIES.filter(animal => animal.kind !== 'procedural').map(animal => (
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
              {selectedAnimal.kind === 'procedural'
                ? `${clips.length} live behavior modes — procedural rig, ${selectedAnimal.path}`
                : clips.length
                  ? `${clips.length} embedded clip${clips.length === 1 ? '' : 's'} in ${selectedAnimal.path}`
                  : `No embedded animation clips found in ${selectedAnimal.path}`}
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
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="flex items-center gap-2 font-expedition text-[11px] uppercase tracking-[0.18em] text-expedition-faded">
                  Sheet
                  <select
                    value={contactView}
                    onChange={event => setContactView(event.target.value)}
                    className="rounded-sm border border-expedition-brass/50 bg-black/40 px-2 py-1 font-mono text-[11px] normal-case tracking-normal text-expedition-parchment outline-none"
                  >
                    <option value="side">side</option>
                    <option value="threeQuarter">three-quarter</option>
                    <option value="front">front</option>
                    <option value="back">back</option>
                    <option value="top">top</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 font-expedition text-[11px] uppercase tracking-[0.16em] text-expedition-faded">
                  <input
                    type="checkbox"
                    checked={contactMotionTrail}
                    onChange={event => setContactMotionTrail(event.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-200"
                  />
                  trail
                </label>
                <label className="flex items-center gap-1.5 font-expedition text-[11px] uppercase tracking-[0.16em] text-expedition-faded">
                  <input
                    type="checkbox"
                    checked={contactIncline}
                    onChange={event => setContactIncline(event.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-200"
                  />
                  incline
                </label>
                <button
                  type="button"
                  onClick={generateContactSheet}
                  disabled={!selectedClip || !clips.length || contactSheet.status === 'running' || selectedAnimal.kind === 'procedural'}
                  title={selectedAnimal.kind === 'procedural' ? 'Procedural rig — no GLB for Blender; screenshot the viewport instead' : undefined}
                  className={`${GOLD_BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {contactSheet.status === 'running' ? 'Rendering...' : 'Generate Contact Sheet'}
                </button>
                <button
                  type="button"
                  onClick={generateOverview}
                  disabled={!clips.length || contactSheet.status === 'running' || selectedAnimal.kind === 'procedural'}
                  title={selectedAnimal.kind === 'procedural' ? 'Procedural rig — no GLB for Blender; screenshot the viewport instead' : undefined}
                  className={`${GOLD_BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Overview
                </button>
              </div>
            </div>
            {contactSheet.status !== 'idle' && (
              <div className={`mb-2 rounded-sm border px-2 py-1 font-mono text-[10px] ${
                contactSheet.status === 'success'
                  ? 'border-emerald-300/40 bg-emerald-950/25 text-emerald-100'
                  : contactSheet.status === 'error'
                    ? 'border-red-300/40 bg-red-950/25 text-red-100'
                    : 'border-expedition-brass/40 bg-black/25 text-expedition-faded'
              }`}>
                {contactSheet.message}
              </div>
            )}
            <div className="h-[32rem] overflow-hidden rounded-sm border border-expedition-brass/60 bg-[#20262a]">
              <Canvas camera={{ position: [2.3, 1.45, 3.0], fov: 42 }} dpr={[1, 1.5]} shadows>
                <color attach="background" args={['#20262a']} />
                <hemisphereLight args={['#d6e9f4', '#6f634f', 1.0]} />
                <directionalLight castShadow position={[4, 7, 4]} intensity={2.4} color="#ffe7bf" />
                <directionalLight position={[-5, 2.4, -4]} intensity={0.75} color="#9fc9ec" />
                <Suspense fallback={null}>
                  {selectedAnimal.kind === 'procedural' ? (
                    selectedAnimal.proceduralType === 'bird' ? (
                      <ProceduralBirdPreview
                        key={selectedAnimal.id}
                        animal={selectedAnimal}
                        mode={selectedClip}
                        paused={paused}
                        timeScale={timeScale}
                      />
                    ) : (
                      <ProceduralReptilePreview
                        key={selectedAnimal.id}
                        animal={selectedAnimal}
                        mode={selectedClip}
                        paused={paused}
                        timeScale={timeScale}
                      />
                    )
                  ) : (
                    <AnimalPreview
                      key={selectedAnimal.id}
                      animal={selectedAnimal}
                      selectedClip={selectedClip}
                      paused={paused}
                      timeScale={timeScale}
                      onAnimations={onAnimations}
                    />
                  )}
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
