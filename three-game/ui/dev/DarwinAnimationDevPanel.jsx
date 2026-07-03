'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DEFAULT_PLAYER_MODEL_ASSET_ID, modelAssets } from '../../modelAssets';
import { ExpeditionPanel, GOLD_BUTTON, GOLD_LABEL } from '../expedition/ExpeditionPanel';

const DARWIN_LABELS = {
  darwin: 'Darwin 1',
  darwinCandidate2: 'Candidate 2',
  darwinTripo: 'Tripo',
  darwin4: 'Darwin 4',
  darwin5: 'Darwin 5 (default)',
};

const DARWIN_MODELS = Object.entries(modelAssets)
  .filter(([id, asset]) => id.startsWith('darwin') && asset.enabled)
  .map(([id]) => ({ id, label: DARWIN_LABELS[id] || id }));

const GAMEPLAY_ANIMATIONS = [
  'idle',
  'idleFidget',
  'walk',
  'walkBackwards',
  'walkStrafeLeft',
  'walkStrafeRight',
  'walkCarry',
  'holdIdle',
  'holdWalk',
  'walkRifle',
  'run',
  'jog',
  'runRifle',
  'runToStop',
  'runUpStairs',
  'startWalking',
  'stopWalking',
  'standingJump',
  'standingJumpShort',
  'standingJumpHigh',
  'standingJumpHold',
  'runningJump',
  'runningJumpHold',
  'jump',
  'jumpTakeoff',
  'jumpFromWall',
  'fallingIdle',
  'fallingIntoPool',
  'fallingToRoll',
  'fallingToLanding',
  'landing',
  'runningLanding',
  'hardLanding',
  'runToDive',
  'crouchIdle',
  'crouchWalk',
  'crouchRun',
  'crouchSneakLeft',
  'crouchSneakRight',
  'standToCrouch',
  'crouchToStand',
  'climb',
  'sprintToWallClimb',
  'climbingUpWall',
  'climbingDownWall',
  'wallRun',
  'teeter',
  'trip',
  'stumble',
  'hitReaction',
  'bigHitFall',
  'shoulderHitAndFall',
  'gettingUp',
  'fallingForwardDeath',
  'gather',
  'pickUp',
  'torchIdle',
  'torchWalk',
  'torchRun',
  'torchCrouchIdle',
  'torchCrouchWalk',
  'torchStandToCrouch',
  'torchCrouchToStand',
  'torchTurnLeft90',
  'torchTurnRight90',
  'torchCrouchTurnLeft90',
  'torchCrouchTurnRight90',
  'torchEquip',
  'torchMeleeAttack',
  'torchInspectForward',
  'kneelInspect',
  'standingInspectDownward',
  'lookAround',
  'lookAroundShort',
  'point',
  'write',
  'swingHammer',
  'swingNet',
  'aim',
  'rifleIdle',
  'rifleEquip',
  'rifleUnequip',
  'rifleKneelIdle',
  'rifleCrouchWalk',
  'rifleKneelToStand',
  'rifleCrouchWalkToIdle',
  'fireRifle',
  'wadeWalk',
  'swim',
  'treadWater',
  'swimToEdge',
  'injuredIdle',
  'injuredHurtingIdle',
  'injuredStumbleIdle',
  'injuredWalk',
  'injuredRun',
  'injuredStandingJump',
  'injuredRunJump',
  'turnLeft',
  'turnRight',
  'turnLeft90',
  'turnRight90',
  'runningTurn180',
  'walkingTurn180',
];

const PREVIEW_CLIP_FALLBACKS = {
  lookAround: 'idle',
  lookAroundShort: 'idle',
  fallingIdle: 'fall',
  sprintToWallClimb: 'climbingUpWall',
  vault: 'climbingUpWall',
  runningSlide: 'fallingToRoll',
  dodgeRoll: 'fallingToRoll',
  standToRoll: 'fallingToRoll',
  hitReaction: 'teeter',
  stumble: 'teeter',
  shoulderHitAndFall: 'bigHitFall',
  gettingUp: 'rifleKneelToStand',
  walkBackwards: 'walk',
  walkStrafeLeft: 'walk',
  walkStrafeRight: 'walk',
  runStrafeLeft: 'run',
  runStrafeRight: 'run',
  crouchWalk: 'torchCrouchWalk',
  crouchRun: 'torchCrouchWalk',
  crouchSneakLeft: 'torchCrouchWalk',
  crouchSneakRight: 'torchCrouchWalk',
  wadeWalk: 'tiredWalk',
  swingHammer: 'torchMeleeAttack',
  swingNet: 'torchMeleeAttack',
  gather: 'torchInspectForward',
  kneelInspect: 'torchInspectForward',
  standingInspectDownward: 'torchInspectForward',
  write: 'torchInspectForward',
  point: 'torchInspectForward',
  runToDive: 'fallingToRoll',
  rifleEquip: 'changeItem',
  rifleUnequip: 'changeItem',
  rifleKneelIdle: 'crouchRifle',
  rifleCrouchWalk: 'crouchRifle',
  rifleKneelToStand: 'coverToStand',
  rifleCrouchWalkToIdle: 'standToCover',
};

function assetLoadUrl(asset) {
  if (!asset?.cacheKey) return asset?.path;
  return `${asset.path}?v=${encodeURIComponent(asset.cacheKey)}`;
}

function normalizeObject(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.55 / maxDim;
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  object.position.y += size.y / 2;
  object.scale.setScalar(scale);
  return object;
}

function preparePreviewScene(source, asset) {
  const clone = normalizeObject(cloneSkeleton(source));
  clone.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const prepared = materials.map(material => {
      if (!material) return;
      const next = material.clone();
      if ('metalness' in next) next.metalness = Math.min(next.metalness || 0, 0.02);
      if ('roughness' in next) next.roughness = Math.max(next.roughness || 0, 0.72);
      if (next.color) next.color.lerp(new THREE.Color('#f1dfbd'), asset.materialLift || 0.1);
      next.toneMapped = false;
      next.needsUpdate = true;
      return next;
    });
    object.material = Array.isArray(object.material) ? prepared : prepared[0];
  });
  return clone;
}

function DarwinPreview({ modelId, selectedClip, paused, timeScale, onAnimations }) {
  const asset = modelAssets[modelId];
  const sourceAsset = asset.animationSource ? modelAssets[asset.animationSource] : null;
  const assetUrl = assetLoadUrl(asset);
  const sourceUrl = assetLoadUrl(sourceAsset) || assetUrl;
  const { scene, animations: ownAnimations } = useGLTF(assetUrl);
  const { animations: sourceAnimations } = useGLTF(sourceUrl);
  const model = useMemo(() => preparePreviewScene(scene, asset), [asset, scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const active = useRef(null);

  const animations = useMemo(() => {
    if (!sourceAsset || sourceAnimations === ownAnimations) return ownAnimations;
    const have = new Set(ownAnimations.map(clip => clip.name));
    const positionScale = (sourceAsset.scale || 1) / (asset.scale || 1);
    const borrowed = sourceAnimations
      .filter(clip => !have.has(clip.name))
      .map(clip => {
        const copy = clip.clone();
        if (positionScale !== 1) {
          copy.tracks.forEach(track => {
            if (!track.name.endsWith('.position')) return;
            const values = track.values.slice();
            for (let i = 0; i < values.length; i += 1) values[i] *= positionScale;
            track.values = values;
          });
        }
        return copy;
      });
    return borrowed.length ? ownAnimations.concat(borrowed) : ownAnimations;
  }, [asset.scale, ownAnimations, sourceAnimations, sourceAsset]);
  const animationNames = useMemo(() => animations.map(clip => clip.name).sort((a, b) => a.localeCompare(b)), [animations]);
  const clipMap = useMemo(() => new Map(animations.map(clip => [clip.name, clip])), [animations]);

  useEffect(() => {
    onAnimations(modelId, animationNames);
  }, [animationNames, modelId, onAnimations]);

  useEffect(() => {
    const fallbackClip = PREVIEW_CLIP_FALLBACKS[selectedClip];
    const clip = clipMap.get(selectedClip) || clipMap.get(fallbackClip) || clipMap.get('idle') || animations[0];
    if (!clip) return undefined;
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

function PreviewPane({ model, selectedClip, paused, timeScale, onAnimations }) {
  const asset = modelAssets[model.id];
  return (
    <div className="min-h-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div>
          <div className="font-expedition text-sm font-semibold text-expedition-parchment">{model.label}</div>
          <div className="font-mono text-[10px] text-expedition-faded">{asset.path}</div>
        </div>
        <div className="rounded border border-expedition-brass/40 px-2 py-1 font-mono text-[10px] text-expedition-faded">
          {selectedClip}
        </div>
      </div>
      <div className="h-[24rem] overflow-hidden rounded-sm border border-expedition-brass/60 bg-[#20262a]">
        <Canvas camera={{ position: [2.1, 1.65, 3.1], fov: 42 }} dpr={[1, 1.5]} shadows>
          <color attach="background" args={['#20262a']} />
          <hemisphereLight args={['#d6e9f4', '#7f6d54', 1.0]} />
          <directionalLight castShadow position={[4, 7, 4]} intensity={2.4} color="#ffe7bf" />
          <directionalLight position={[-5, 2.4, -4]} intensity={0.75} color="#9fc9ec" />
          <Suspense fallback={null}>
            <DarwinPreview
              modelId={model.id}
              selectedClip={selectedClip}
              paused={paused}
              timeScale={timeScale}
              onAnimations={onAnimations}
            />
          </Suspense>
          <gridHelper args={[8, 16, '#586168', '#343c42']} />
          <OrbitControls makeDefault enableDamping target={[0, 1.15, 0]} />
        </Canvas>
      </div>
    </div>
  );
}

function ModelSelect({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 font-expedition text-xs text-expedition-faded">
      {label}
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="rounded-sm border border-expedition-brass/50 bg-[#151918] px-2 py-1 font-expedition text-xs text-expedition-parchment outline-none focus:border-expedition-gold"
      >
        {DARWIN_MODELS.map(model => (
          <option key={model.id} value={model.id}>{model.label}</option>
        ))}
      </select>
    </label>
  );
}

function ClipAvailability({ label, status }) {
  const className = status === 'direct'
    ? 'text-emerald-200'
    : (status === 'fallback' ? 'text-amber-200' : 'text-red-200/70');
  return <span className={`font-mono text-[10px] ${className}`}>{label}</span>;
}

function AnimationButton({ name, selected, leftStatus, rightStatus, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-sm border px-2 py-1.5 text-left font-expedition text-[12px] transition ${
        selected
          ? 'border-expedition-gold bg-expedition-gold/15 text-expedition-goldbright'
          : 'border-expedition-brass/35 bg-black/20 text-expedition-parchment hover:border-expedition-gold/70'
      }`}
    >
      <span className="truncate">{name}</span>
      <ClipAvailability label="L" status={leftStatus} />
      <ClipAvailability label="R" status={rightStatus} />
    </button>
  );
}

function clipAvailability(clipSet, clipName) {
  if (clipSet.has(clipName)) return 'direct';
  const fallback = PREVIEW_CLIP_FALLBACKS[clipName];
  if (fallback && clipSet.has(fallback)) return 'fallback';
  return 'missing';
}

export function DarwinAnimationDevPanel({ open, onClose }) {
  const [selectedClip, setSelectedClip] = useState('idle');
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [leftModelId, setLeftModelId] = useState(DEFAULT_PLAYER_MODEL_ASSET_ID);
  const [rightModelId, setRightModelId] = useState(modelAssets.darwin4?.enabled ? 'darwin4' : 'darwinCandidate2');
  const [animationMap, setAnimationMap] = useState({});

  const onAnimations = React.useCallback((modelId, names) => {
    setAnimationMap(current => {
      const previous = current[modelId] || [];
      if (previous.length === names.length && previous.every((name, index) => name === names[index])) return current;
      return { ...current, [modelId]: names };
    });
  }, []);

  const leftModel = useMemo(() => DARWIN_MODELS.find(model => model.id === leftModelId) || DARWIN_MODELS[0], [leftModelId]);
  const rightModel = useMemo(() => DARWIN_MODELS.find(model => model.id === rightModelId) || DARWIN_MODELS[1] || DARWIN_MODELS[0], [rightModelId]);
  const leftSet = useMemo(() => new Set(animationMap[leftModel.id] || []), [animationMap, leftModel.id]);
  const rightSet = useMemo(() => new Set(animationMap[rightModel.id] || []), [animationMap, rightModel.id]);
  const gameplay = useMemo(() => Array.from(new Set(GAMEPLAY_ANIMATIONS)).sort((a, b) => a.localeCompare(b)), []);
  const extras = useMemo(() => (
    Array.from(new Set(Object.values(animationMap).flat()))
      .filter(name => !gameplay.includes(name))
      .sort((a, b) => a.localeCompare(b))
  ), [animationMap, gameplay]);

  if (!open) return null;

  const renderList = names => names.map(name => (
    <AnimationButton
      key={name}
      name={name}
      selected={name === selectedClip}
      leftStatus={clipAvailability(leftSet, name)}
      rightStatus={clipAvailability(rightSet, name)}
      onClick={() => setSelectedClip(name)}
    />
  ));

  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] bg-black/58 p-3 backdrop-blur-sm">
      <ExpeditionPanel variant="modal" className="mx-auto flex h-full max-w-[92rem] flex-col" innerClassName="flex h-full flex-col p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className={GOLD_LABEL}>Darwin Animation Lab</div>
            <div className="font-expedition text-lg font-semibold text-expedition-parchment">{selectedClip}</div>
            <div className="font-expedition text-xs text-expedition-faded">L/R markers: green = exact clip, amber = adapted fallback, red = idle fallback.</div>
          </div>
          <div className="flex items-center gap-2">
            <ModelSelect label="Left" value={leftModel.id} onChange={setLeftModelId} />
            <ModelSelect label="Right" value={rightModel.id} onChange={setRightModelId} />
            <button type="button" onClick={() => setPaused(value => !value)} className={GOLD_BUTTON}>{paused ? 'Play' : 'Pause'}</button>
            <label className="flex items-center gap-2 font-expedition text-xs text-expedition-faded">
              Speed
              <input
                type="range"
                min="0.25"
                max="1.5"
                step="0.05"
                value={timeScale}
                onChange={event => setTimeScale(Number(event.target.value))}
                className="w-28 accent-amber-200"
              />
              <span className="w-9 font-mono">{timeScale.toFixed(2)}</span>
            </label>
            <button type="button" onClick={onClose} className={GOLD_BUTTON}>Close (8)</button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[20rem_1fr] gap-3">
          <div className="min-h-0 overflow-auto pr-1">
            <div className="mb-2 flex items-center justify-between border-b border-expedition-brass/50 pb-1">
              <span className={GOLD_LABEL}>Gameplay</span>
              <span className="font-mono text-[10px] text-expedition-faded">{gameplay.length}</span>
            </div>
            <div className="mb-4 grid gap-1">{renderList(gameplay)}</div>
            <div className="mb-2 flex items-center justify-between border-b border-expedition-brass/50 pb-1">
              <span className={GOLD_LABEL}>GLB Extras</span>
              <span className="font-mono text-[10px] text-expedition-faded">{extras.length}</span>
            </div>
            <div className="grid gap-1">{renderList(extras)}</div>
          </div>
          <div className="grid min-h-0 grid-cols-2 gap-3">
            {[leftModel, rightModel].map((model, index) => (
              <PreviewPane
                key={`${index}-${model.id}`}
                model={model}
                selectedClip={selectedClip}
                paused={paused}
                timeScale={timeScale}
                onAnimations={onAnimations}
              />
            ))}
          </div>
        </div>
      </ExpeditionPanel>
    </div>
  );
}
