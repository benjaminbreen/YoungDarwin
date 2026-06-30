'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyboardControls, Stats, useProgress } from '@react-three/drei';
import { EffectComposer, Bloom, BrightnessContrast, HueSaturation, N8AO, SMAA, Vignette } from '@react-three/postprocessing';
import { ACESFilmicToneMapping, SRGBColorSpace, Texture, Vector3 } from 'three';
import { ThreeScene } from './components/ThreeScene';
import { UnderwaterPostEffect } from './components/scene/UnderwaterPostEffect';
import { ThreeHUD } from './ui/ThreeHUD';
import { AssetBrowserPanel } from './ui/dev/AssetBrowserPanel';
import { AnimalAnimationDevPanel } from './ui/dev/AnimalAnimationDevPanel';
import { DarwinAnimationDevPanel } from './ui/dev/DarwinAnimationDevPanel';
import { LaunchOverlay } from './ui/LaunchOverlay';
import { useThreeGameStore } from './store';
import { isOvercastWeather, weatherSkyTint } from './world/weatherStates';
import { WATER_LEVEL } from './world/water';

const KEYBOARD_MAP = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'dodge', keys: ['KeyB'] },
  { name: 'interact', keys: ['KeyE'] },
  { name: 'useTool', keys: ['KeyJ'] },
  { name: 'camera', keys: ['KeyM'] },
  { name: 'recenterCamera', keys: ['Tab'] },
  { name: 'rotateLeft', keys: ['KeyZ'] },
  { name: 'rotateRight', keys: ['KeyX'] },
  { name: 'crouch', keys: ['KeyC'] },
  { name: 'sit', keys: ['KeyK'] },
  { name: 'rest', keys: ['KeyR'] },
  { name: 'pray', keys: ['KeyP'] },
  { name: 'rifle', keys: ['KeyF'] },
  { name: 'fireRifle', keys: [] },
  { name: 'hammer', keys: ['KeyH'] },
  { name: 'net', keys: ['KeyN'] },
  { name: 'gather', keys: ['KeyG'] },
  { name: 'write', keys: ['KeyY'] },
  { name: 'inspect', keys: ['KeyI'] },
  { name: 'climb', keys: ['KeyQ', 'KeyV'] },
  { name: 'lookAround', keys: ['KeyL'] },
  { name: 'point', keys: ['KeyO'] },
  { name: 'trip', keys: ['KeyT'] },
  { name: 'teeter', keys: ['KeyU'] },
  { name: 'tool1', keys: ['Digit1'] },
  { name: 'tool2', keys: ['Digit2'] },
  { name: 'tool3', keys: ['Digit3'] },
  { name: 'tool4', keys: ['Digit4'] },
  { name: 'tool5', keys: ['Digit5'] },
  { name: 'tool6', keys: ['Digit6'] },
];

const GAME_MINUTES_PER_REAL_SECOND = 10 / 60;

// SMAAPreset.ULTRA from the 'postprocessing' package. That package is only a
// transitive dep (not re-exported by @react-three/postprocessing), so we inline
// its stable enum value rather than import from a non-direct dependency.
const SMAA_PRESET_ULTRA = 3;

const DEFAULT_PERF_SETTINGS = {
  quality: 'performance',
  waterQuality: 'performance',
  dprMode: 'default',
  msaaSamples: 0,
  postprocessing: true,
  ao: false,
  stats: false,
  shadows: true,
  water: true,
  reflections: false,
  terrain: true,
  landmarks: false,
  atmosphere: true,
  worldDetails: true,
  beagle: true,
  specimens: true,
  syms: true,
  physicsObstacles: true,
  physicsProps: true,
  waterSplashes: true,
  weatherFX: true,
  splatBackdrop: true,
  solarScreenGlare: true,
  solarLensGhosts: true,
  solarSunHalo: true,
  solarSceneFlares: true,
  solarSunFacingGrade: true,
  physicsDebug: false,
  preserveDrawingBuffer: false,
  // Swap world vegetation/terrain from MeshStandard (PBR) to matte MeshPhong —
  // same matte look, far cheaper per fragment. foliageDrawScale trims vegetation
  // draw distance to cut overdraw. Both default to the 'performance' tier.
  cheapMaterials: true,
  foliageDrawScale: 0.85,
};

const QUALITY_PRESETS = {
  performance: {
    // DPR is the master fillrate lever: 1.5x renders 2.25x the pixels of 1x, and
    // every full-screen pass (post chain, water, terrain, sky) pays for all of
    // them. On integrated/laptop GPUs that's the dominant cost, so the
    // performance tier uses a modest 1.25x cap: SMAA cleans polygon edges, but
    // Darwin's face/buttons and thin vegetation need a little real sample
    // coverage to avoid crunchy subpixel breakup.
    dprMode: '1.25x',
    msaaSamples: 0,
    ao: false,
    reflections: false,
    waterQuality: 'performance',
    cheapMaterials: true,
    foliageDrawScale: 0.85,
  },
  cinematic: {
    dprMode: 'default',
    msaaSamples: 2,
    ao: true,
    reflections: true,
    waterQuality: 'cinematic',
    cheapMaterials: false,
    foliageDrawScale: 1,
  },
};

const BOOT_LOADER_STABLE_MS = 900;
const BOOT_MIN_LOADING_MS = 1400;
const DEFERRED_CONTENT_DELAY_MS = 700;
const SCENE_COST_BUCKET_LIMIT = 40;

function getInitialPerfSettings() {
  return { ...DEFAULT_PERF_SETTINGS, ...QUALITY_PRESETS[DEFAULT_PERF_SETTINGS.quality] };
}

function settingsFromUrlSearch(search) {
  const params = new URLSearchParams(search);
  const quality = params.get('quality') === 'cinematic' ? 'cinematic' : 'performance';
  const base = { ...DEFAULT_PERF_SETTINGS, ...QUALITY_PRESETS[quality], quality };
  const postprocessing = params.has('post')
    || params.has('postprocessing')
    || (
      base.postprocessing
      && !params.has('noPost')
      && !params.has('noPostprocessing')
    );
  const parsedMsaa = Number(params.get('msaa'));
  const hasExplicitMsaa = params.has('msaa');
  const msaaSamples = hasExplicitMsaa && Number.isFinite(parsedMsaa)
    ? (parsedMsaa <= 0 ? 0 : parsedMsaa >= 3 ? 4 : 2)
    : base.msaaSamples;
  const ao = (params.has('ao') || params.has('AO')) && !params.has('noAO')
    ? true
    : base.ao && !params.has('noAO');
  const reflections = (params.has('reflections') || params.has('reflection')) && !params.has('noReflections')
    ? true
    : base.reflections && !params.has('noReflections');
  return {
    quality,
    waterQuality: params.get('waterQuality') === 'cinematic' ? 'cinematic' : base.waterQuality,
    dprMode: params.get('dpr') || base.dprMode,
    msaaSamples,
    postprocessing,
    ao,
    stats: false,
    shadows: !params.has('noShadows'),
    water: !params.has('noWater'),
    reflections,
    terrain: !params.has('noTerrain'),
    landmarks: params.has('landmarks') && !params.has('noLandmarks'),
    atmosphere: !params.has('noAtmosphere'),
    worldDetails: !params.has('noDetails'),
    beagle: !params.has('noBeagle'),
    specimens: !params.has('noSpecimens'),
    syms: !params.has('noSyms'),
    physicsObstacles: !params.has('noPhysicsObstacles'),
    physicsProps: !params.has('noPhysicsProps'),
    waterSplashes: !params.has('noWaterSplashes'),
    weatherFX: !params.has('noWeather'),
    splatBackdrop: !params.has('noSplatBackdrop'),
    solarScreenGlare: !params.has('noSolarScreenGlare'),
    solarLensGhosts: !params.has('noSolarLensGhosts'),
    solarSunHalo: !params.has('noSolarSunHalo'),
    solarSceneFlares: !params.has('noSolarSceneFlares'),
    solarSunFacingGrade: !params.has('noSolarSunFacingGrade'),
    physicsDebug: params.has('physicsDebug'),
    preserveDrawingBuffer: params.has('preserveDrawingBuffer'),
    cheapMaterials: params.has('cheapMaterials')
      ? true
      : base.cheapMaterials && !params.has('noCheapMaterials'),
    foliageDrawScale: params.has('foliageDrawScale') && Number.isFinite(Number(params.get('foliageDrawScale')))
      ? Number(params.get('foliageDrawScale'))
      : base.foliageDrawScale,
  };
}

function dprForMode(mode) {
  if (mode === '1x') return [1, 1];
  if (mode === '1.25x') return [1, 1.25];
  if (mode === '1.5x') return [1, 1.5];
  if (mode === '2x') return [1, 2]; // full native res — sharpest, heaviest
  // Default uses a modest supersample cap. Thin vegetation is dominated by
  // subpixel coverage, so 1x + screen AA still shimmers while moving.
  return [1, 1.25];
}

function geometryTriangleCount(geometry) {
  if (!geometry) return 0;
  if (geometry.index?.count) return Math.floor(geometry.index.count / 3);
  const position = geometry.attributes?.position;
  return position?.count ? Math.floor(position.count / 3) : 0;
}

function materialDrawCallCount(geometry, material) {
  if (!geometry || !material) return 0;
  if (Array.isArray(material)) return Math.max(1, geometry.groups?.length || material.length);
  return Math.max(1, geometry.groups?.length || 1);
}

function renderSourceFor(object) {
  let current = object;
  while (current) {
    const data = current.userData || {};
    if (data.renderSource || data.renderLabel || data.renderPath) {
      const key = data.renderSource || data.renderPath || data.renderLabel;
      return {
        key,
        label: data.renderLabel || key,
        kind: data.renderKind || 'tagged',
        path: data.renderPath || null,
      };
    }
    current = current.parent;
  }
  const fallback = object.name || object.parent?.name || object.type || 'unlabeled';
  return {
    key: `unlabeled:${fallback}`,
    label: fallback,
    kind: 'unlabeled',
    path: null,
  };
}

function addSceneCostBucket(buckets, object, cost) {
  if (!buckets) return;
  const source = renderSourceFor(object);
  let bucket = buckets.get(source.key);
  if (!bucket) {
    bucket = {
      key: source.key,
      label: source.label,
      kind: source.kind,
      path: source.path,
      drawCalls: 0,
      triangles: 0,
      meshes: 0,
      skinnedMeshes: 0,
      instancedMeshes: 0,
      instances: 0,
      points: 0,
      lines: 0,
      shadowCasters: 0,
      shadowReceivers: 0,
      uncullable: 0,
    };
    buckets.set(source.key, bucket);
  }
  bucket.drawCalls += cost.drawCalls || 0;
  bucket.triangles += cost.triangles || 0;
  bucket.points += cost.points || 0;
  bucket.lines += cost.lines || 0;
  bucket.meshes += cost.meshes || 0;
  bucket.skinnedMeshes += cost.skinnedMeshes || 0;
  bucket.instancedMeshes += cost.instancedMeshes || 0;
  bucket.instances += cost.instances || 0;
  if (object.castShadow) bucket.shadowCasters += 1;
  if (object.receiveShadow) bucket.shadowReceivers += 1;
  if (object.frustumCulled === false) bucket.uncullable += 1;
}

function rankedSceneCostBuckets(buckets, sortKey) {
  if (!buckets) return undefined;
  return Array.from(buckets.values())
    .sort((a, b) => (b[sortKey] - a[sortKey]) || (b.drawCalls - a.drawCalls) || (b.triangles - a.triangles))
    .slice(0, SCENE_COST_BUCKET_LIMIT)
    .map(bucket => ({
      ...bucket,
      drawCalls: Number(bucket.drawCalls.toFixed(3)),
      triangles: Math.round(bucket.triangles),
    }));
}

function collectSceneRenderStats(root, options = {}) {
  const buckets = options.includeCosts ? new Map() : null;
  const stats = {
    sceneDrawCalls: 0,
    sceneTriangles: 0,
    sceneMeshes: 0,
    sceneSkinnedMeshes: 0,
    sceneInstancedMeshes: 0,
    sceneInstances: 0,
    scenePoints: 0,
    sceneLines: 0,
    sceneObjects: 0,
    sceneChildren: root?.children?.length || 0,
    sceneVisibleObjects: 0,
    sceneRootChildren: (root?.children || []).slice(0, 24).map(child => ({
      name: child.name || child.type || 'Object3D',
      type: child.type,
      visible: child.visible !== false,
      mesh: Boolean(child.isMesh || child.isSkinnedMesh || child.isInstancedMesh),
      children: child.children?.length || 0,
    })),
  };

  function visit(object, parentVisible = true) {
    stats.sceneObjects += 1;
    const visible = parentVisible && object.visible !== false;
    if (visible) {
      stats.sceneVisibleObjects += 1;
      if (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh) {
        const instanceCount = object.isInstancedMesh ? Math.max(0, object.count || 0) : 1;
        const drawCalls = materialDrawCallCount(object.geometry, object.material);
        const triangles = geometryTriangleCount(object.geometry) * instanceCount;
        stats.sceneDrawCalls += drawCalls;
        stats.sceneTriangles += triangles;
        stats.sceneMeshes += 1;
        if (object.isSkinnedMesh) stats.sceneSkinnedMeshes += 1;
        if (object.isInstancedMesh) {
          stats.sceneInstancedMeshes += 1;
          stats.sceneInstances += instanceCount;
        }
        addSceneCostBucket(buckets, object, {
          drawCalls,
          triangles,
          meshes: 1,
          skinnedMeshes: object.isSkinnedMesh ? 1 : 0,
          instancedMeshes: object.isInstancedMesh ? 1 : 0,
          instances: object.isInstancedMesh ? instanceCount : 0,
        });
      } else if (object.isPoints) {
        const points = object.geometry?.attributes?.position?.count || 0;
        const drawCalls = materialDrawCallCount(object.geometry, object.material);
        stats.scenePoints += points;
        stats.sceneDrawCalls += drawCalls;
        addSceneCostBucket(buckets, object, { drawCalls, points });
      } else if (object.isLine || object.isLineSegments) {
        const lines = object.geometry?.attributes?.position?.count || 0;
        const drawCalls = materialDrawCallCount(object.geometry, object.material);
        stats.sceneLines += lines;
        stats.sceneDrawCalls += drawCalls;
        addSceneCostBucket(buckets, object, { drawCalls, lines });
      }
    }
    for (const child of object.children || []) visit(child, visible);
  }

  visit(root);
  if (buckets) {
    stats.sceneCostBuckets = rankedSceneCostBuckets(buckets, 'triangles');
    stats.sceneCostDrawCallBuckets = rankedSceneCostBuckets(buckets, 'drawCalls');
    stats.sceneCostUncullableBuckets = rankedSceneCostBuckets(buckets, 'uncullable');
  }
  return stats;
}

function PerformanceSampler({ enabled, includeCosts = false, onSample }) {
  const { gl, scene } = useThree();
  const samples = useRef({
    frames: 0,
    elapsed: 0,
    lastPublish: 0,
    sceneElapsed: Infinity,
    sceneStats: null,
    sceneStatsIncludeCosts: null,
    fps: 0,
  });

  useFrame((_, delta) => {
    if (!enabled) return;
    const state = samples.current;
    state.frames += 1;
    state.elapsed += delta;
    state.lastPublish += delta;
    state.sceneElapsed += delta;
    if (state.lastPublish < 0.25) return;

    state.fps = state.frames / Math.max(0.001, state.elapsed);
    const info = gl.info;
    const sceneStatsInterval = includeCosts ? 1.25 : 0.75;
    if (
      !state.sceneStats
      || state.sceneStatsIncludeCosts !== includeCosts
      || state.sceneElapsed >= sceneStatsInterval
    ) {
      state.sceneStats = collectSceneRenderStats(scene, { includeCosts });
      state.sceneStatsIncludeCosts = includeCosts;
      state.sceneElapsed = 0;
    }
    onSample({
      fps: state.fps,
      frameMs: 1000 / Math.max(1, state.fps),
      rawCalls: info.render.calls,
      rawTriangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixelRatio: gl.getPixelRatio(),
      ...state.sceneStats,
    });
    state.frames = 0;
    state.elapsed = 0;
    state.lastPublish = 0;
  });

  return null;
}

// Adaptive resolution. The configured DPR cap (1.5x on the default tier) is the
// single biggest GPU cost — fillrate scales with pixel count, so 1.5x is 2.25x
// the pixels of 1x. This watches the live frame rate and steps the pixel ratio
// down a fixed ladder when the game sustains a low frame rate, then eases it
// back up once there's headroom again. setDpr (not gl.setPixelRatio) is used so
// the post-processing composer resizes its targets too. Runs every frame
// independent of the perf panel.
const ADAPTIVE_DPR_FLOOR_FPS = 25;      // sustained fps below this -> drop a rung
const ADAPTIVE_DPR_CEIL_FPS = 50;       // sustained fps above this -> restore a rung
const ADAPTIVE_DPR_WINDOW_S = 1.0;      // averaging window per decision
const ADAPTIVE_DPR_UPSCALE_WINDOWS = 2; // consecutive good windows before restoring
const ADAPTIVE_DPR_COOLDOWN_S = 2.0;    // settle time after a change / scene ready

function buildDprLadder(maxDpr) {
  const rungs = [];
  for (const candidate of [2, 1.5, 1.25, 1]) {
    if (candidate <= maxDpr + 1e-3) rungs.push(candidate);
  }
  if (!rungs.length || rungs[0] < maxDpr - 1e-3) rungs.unshift(maxDpr);
  return rungs.filter((value, i) => i === 0 || value < rungs[i - 1] - 1e-3);
}

function AdaptiveResolution({ enabled, maxDpr }) {
  const setDpr = useThree(state => state.setDpr);
  const gl = useThree(state => state.gl);
  const state = useRef({
    ladder: [maxDpr],
    level: 0, // index into ladder; 0 = sharpest (configured cap)
    frames: 0,
    elapsed: 0,
    cooldown: ADAPTIVE_DPR_COOLDOWN_S,
    goodWindows: 0,
    deviceDpr: 1,
  });

  // Rebuild the ladder and snap back to the top rung whenever the configured cap
  // changes (e.g. the user picks a different quality in the perf panel), so the
  // controller never fights the new baseline R3F just applied from the prop.
  useEffect(() => {
    const s = state.current;
    s.ladder = buildDprLadder(maxDpr);
    s.level = 0;
    s.frames = 0;
    s.elapsed = 0;
    s.cooldown = ADAPTIVE_DPR_COOLDOWN_S;
    s.goodWindows = 0;
    s.deviceDpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  }, [maxDpr]);

  useFrame((_, delta) => {
    const s = state.current;
    // Hold (and keep the window clean) until the scene is ready, then for a
    // short grace period — boot/asset-streaming hitches must not downscale.
    if (!enabled) {
      s.frames = 0;
      s.elapsed = 0;
      s.cooldown = ADAPTIVE_DPR_COOLDOWN_S;
      return;
    }
    if (s.ladder.length < 2) return; // nothing to adapt (1x display or 1x cap)
    if (s.cooldown > 0) {
      s.cooldown -= delta;
      s.frames = 0;
      s.elapsed = 0;
      return;
    }
    s.frames += 1;
    s.elapsed += delta;
    if (s.elapsed < ADAPTIVE_DPR_WINDOW_S) return;

    const fps = s.frames / s.elapsed;
    s.frames = 0;
    s.elapsed = 0;

    if (fps < ADAPTIVE_DPR_FLOOR_FPS && s.level < s.ladder.length - 1) {
      s.level += 1;
      s.goodWindows = 0;
      applyAdaptiveDpr(s, setDpr, gl);
    } else if (fps > ADAPTIVE_DPR_CEIL_FPS && s.level > 0) {
      s.goodWindows += 1;
      if (s.goodWindows >= ADAPTIVE_DPR_UPSCALE_WINDOWS) {
        s.level -= 1;
        s.goodWindows = 0;
        applyAdaptiveDpr(s, setDpr, gl);
      }
    } else {
      s.goodWindows = 0;
    }
  });

  return null;
}

function applyAdaptiveDpr(s, setDpr, gl) {
  const applied = Math.min(s.deviceDpr, s.ladder[s.level]);
  s.cooldown = ADAPTIVE_DPR_COOLDOWN_S;
  if (typeof window !== 'undefined') window.__adaptiveDpr = applied;
  if (Math.abs(gl.getPixelRatio() - applied) < 1e-3) return; // already there
  setDpr(applied);
}

function ExpeditionClock() {
  const elapsed = useRef(0);
  const advanceTime = useThreeGameStore(state => state.advanceTime);
  const statusViewOpen = useThreeGameStore(state => state.statusViewOpen);

  useFrame((_, delta) => {
    if (statusViewOpen) {
      // Status view freezes expedition time; drop accumulated real time so the
      // clock doesn't lurch forward on close.
      elapsed.current = 0;
      return;
    }
    elapsed.current += delta;
    if (elapsed.current < 1) return;
    const wholeSeconds = Math.floor(elapsed.current);
    elapsed.current -= wholeSeconds;
    advanceTime(wholeSeconds * GAME_MINUTES_PER_REAL_SECOND);
  });

  return null;
}

function InspectionAnchorProjector() {
  const { camera, size } = useThree();
  const inspectedObject = useThreeGameStore(state => state.inspectedObject);
  const setInspectedScreenPosition = useThreeGameStore(state => state.setInspectedScreenPosition);
  const projected = useRef(new Vector3());
  const last = useRef({ key: null, x: -9999, y: -9999, visible: false });

  useFrame(() => {
    const world = inspectedObject?.worldPosition;
    if (!world) return;
    projected.current.set(world.x, world.y, world.z).project(camera);
    const visible = projected.current.z > -1 && projected.current.z < 1;
    const x = (projected.current.x * 0.5 + 0.5) * size.width;
    const y = (-projected.current.y * 0.5 + 0.5) * size.height;
    const key = `${inspectedObject.openedAt || inspectedObject.id}:${size.width}:${size.height}`;
    if (
      last.current.key === key
      && Math.abs(last.current.x - x) < 0.75
      && Math.abs(last.current.y - y) < 0.75
      && last.current.visible === visible
    ) return;
    last.current = { key, x, y, visible };
    setInspectedScreenPosition({ x, y, visible, width: size.width, height: size.height });
  });

  return null;
}

function SceneReadySignal({ loadingReady, startedAtRef, minElapsedMs = 0, onReady }) {
  const readyFrames = useRef(0);

  useFrame(() => {
    const waitedLongEnough = !startedAtRef || performance.now() - startedAtRef.current >= minElapsedMs;
    if (!loadingReady || !waitedLongEnough) {
      readyFrames.current = 0;
      return;
    }
    readyFrames.current += 1;
    if (readyFrames.current === 4) onReady();
  });

  return null;
}

// Selective bloom so the sun (and bright speculars) genuinely radiate. A high
// luminance threshold keeps the sky/terrain crisp and only blooms near-white
// highlights, which is why the sun core is pushed white-hot in SkyController.
// N8AO grounds rocks/characters with contact shading; runs half-res to stay
// cheap and can be disabled independently of the rest of the stack.
function PostFX({ enabled, ao, multisampling = 2, underwaterAmount = 0 }) {
  if (!enabled) return null;
  const underwater = Math.min(1, Math.max(0, underwaterAmount));
  return (
    // SMAA cleans polygon edges, but vegetation shimmer needs actual sample
    // coverage before post-processing. Keep this configurable in the perf UI.
    <EffectComposer multisampling={multisampling}>
      <SMAA preset={SMAA_PRESET_ULTRA} />
      {ao && (
        <N8AO
          halfRes
          depthAwareUpsampling
          aoRadius={1.6}
          distanceFalloff={1.2}
          intensity={2.4}
          aoSamples={4}
          denoiseSamples={4}
          denoiseRadius={12}
        />
      )}
      <UnderwaterPostEffect amount={underwater} clarity={34 - underwater * 8} />
      <Bloom
        intensity={0.29 * (1 - underwater * 0.58)}
        luminanceThreshold={0.955}
        luminanceSmoothing={0.08}
        mipmapBlur
        radius={0.3}
      />
      {/* Gentle grade: ACES leaves the midtones a touch flat — a small
          saturation/contrast lift makes the turquoise and sand read without
          touching any material. Merges into the existing effect pass. */}
      <HueSaturation saturation={0.08} />
      <BrightnessContrast contrast={0.05} />
      <Vignette eskil={false} offset={0.26} darkness={0.42} />
    </EffectComposer>
  );
}

function UnderwaterCameraTracker({ onChange }) {
  const camera = useThree(state => state.camera);
  const setUnderwaterCamera = useThreeGameStore(state => state.setUnderwaterCamera);
  const lastAmount = useRef(-1);

  useFrame(() => {
    const amount = Math.min(1, Math.max(0, (WATER_LEVEL - camera.position.y + 0.08) / 1.65));
    if (Math.abs(amount - lastAmount.current) < 0.025) return;
    lastAmount.current = amount;
    onChange(amount);
    setUnderwaterCamera({ amount, cameraY: camera.position.y });
  });

  useEffect(() => () => {
    onChange(0);
    setUnderwaterCamera({ amount: 0, cameraY: camera.position.y });
  }, [camera, onChange, setUnderwaterCamera]);

  return null;
}

function CinematicScreenGrade({ enabled, weather }) {
  if (!enabled) return null;
  const dampenedSun = isOvercastWeather(weather);
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          opacity: dampenedSun ? 0.03 : 0.04,
          background: dampenedSun
            ? 'linear-gradient(180deg, rgba(152, 210, 226, 0.16), rgba(232, 212, 166, 0.055) 62%, rgba(89, 135, 116, 0.04))'
            : 'linear-gradient(180deg, rgba(112, 190, 232, 0.14), rgba(234, 202, 132, 0.07) 52%, rgba(222, 152, 92, 0.045))',
          mixBlendMode: 'soft-light',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: dampenedSun
            ? 'radial-gradient(circle at 50% 42%, transparent 55%, rgba(16, 24, 21, 0.09) 100%)'
            : 'radial-gradient(circle at 50% 42%, transparent 52%, rgba(18, 24, 20, 0.13) 100%)',
          mixBlendMode: 'multiply',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'radial-gradient(circle at 25% 35%, rgba(255,255,255,0.55) 0 1px, transparent 1.3px), radial-gradient(circle at 75% 65%, rgba(0,0,0,0.38) 0 1px, transparent 1.4px)',
          backgroundPosition: '0 0, 6px 8px',
          backgroundSize: '13px 13px, 17px 17px',
          mixBlendMode: 'soft-light',
        }}
      />
    </div>
  );
}

function SolarScreenGlare({ enabled, wash = true, lensGhostsEnabled = true, suppression = 0 }) {
  const glare = useThreeGameStore(state => state.solarGlare);
  if (!enabled || (!wash && !lensGhostsEnabled)) return null;
  const strength = Math.min(1, Math.max(0, glare?.strength || 0)) * (1 - Math.min(1, Math.max(0, suppression)));

  const x = Math.max(-18, Math.min(118, (glare.x ?? 0.5) * 100));
  const y = Math.max(-18, Math.min(118, (glare.y ?? 0.42) * 100));
  const directness = Math.min(1, Math.max(0, glare.directness || 0));
  const warmth = Math.min(1, Math.max(0, glare.warmth ?? 0.5));
  const screenStrength = Math.min(1, strength * (1.08 + directness * 0.55));
  const lemon = Math.round(228 + warmth * 18);
  const heat = Math.round(146 + warmth * 42);
  const coreAlpha = 0.07 * screenStrength + 0.08 * screenStrength * directness;
  const washAlpha = screenStrength * (0.055 + directness * 0.058);
  const streakAlpha = screenStrength * (0.2 + directness * 0.26);
  const veilAlpha = screenStrength * (0.04 + directness * 0.045);
  const horizonHold = screenStrength * (0.055 + directness * 0.05);
  const transition = 'opacity 140ms linear';
  const axisX = 50 - x;
  const axisY = 50 - y;
  const axisLength = Math.hypot(axisX, axisY);
  const lensAxisX = axisLength > 4 ? axisX / axisLength : -0.78;
  const lensAxisY = axisLength > 4 ? axisY / axisLength : 0.34;
  const offAxis = Math.min(1, axisLength / 58);
  const lensAlpha = screenStrength * (0.34 + directness * 0.28 + offAxis * 0.24);
  const clampPct = value => Math.max(-18, Math.min(118, value));
  const lensGhosts = [
    { d: 18, size: 5.4, alpha: 0.34, tint: '255,248,204', ring: false },
    { d: 33, size: 8.8, alpha: 0.26, tint: '255,214,124', ring: true },
    { d: 51, size: 4.4, alpha: 0.3, tint: '172,220,255', ring: false },
    { d: 68, size: 12.5, alpha: 0.18, tint: '255,172,116', ring: true },
    { d: 86, size: 5.8, alpha: 0.18, tint: '210,244,255', ring: false },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {wash && (
        <div
          className="absolute inset-0"
          style={{
            opacity: strength > 0.004 ? 1 : 0,
            background: `radial-gradient(circle at ${x}% ${y}%, transparent 0%, transparent 2.1%, rgba(255,255,250,${coreAlpha}) 5%, rgba(255,${lemon},${heat},${0.07 * screenStrength}) 13%, rgba(255,218,128,${0.032 * screenStrength}) 28%, transparent 54%)`,
            mixBlendMode: 'screen',
            transition,
          }}
        />
      )}
      {lensGhostsEnabled && lensGhosts.map((ghost, index) => {
        const gx = clampPct(x + lensAxisX * ghost.d);
        const gy = clampPct(y + lensAxisY * ghost.d);
        const opacity = lensAlpha * ghost.alpha;
        const background = ghost.ring
          ? `radial-gradient(circle, transparent 0%, transparent 42%, rgba(${ghost.tint},0.62) 48%, rgba(255,255,245,0.34) 53%, rgba(${ghost.tint},0.12) 61%, transparent 72%)`
          : `radial-gradient(circle, rgba(255,255,246,0.66) 0%, rgba(${ghost.tint},0.34) 18%, rgba(${ghost.tint},0.12) 38%, transparent 68%)`;
        return (
          <div
            key={`solar-lens-ghost-${index}`}
            className="absolute rounded-full"
            style={{
              left: `${gx}%`,
              top: `${gy}%`,
              width: `${ghost.size}vmin`,
              height: `${ghost.size}vmin`,
              opacity,
              transform: `translate(-50%, -50%) scaleX(${ghost.ring ? 1.16 : 1})`,
              background,
              filter: `blur(${ghost.ring ? 0.45 : 0.65}px) saturate(1.14)`,
              mixBlendMode: 'screen',
              transition,
            }}
          />
        );
      })}
      {lensGhostsEnabled && (
        <div
          className="absolute"
          style={{
            left: `${clampPct(x + lensAxisX * 9)}%`,
            top: `${clampPct(y + lensAxisY * 9)}%`,
            width: `${18 + directness * 10}vmin`,
            height: `${18 + directness * 10}vmin`,
            opacity: lensAlpha * (0.1 + directness * 0.12),
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, transparent 0%, transparent 47%, rgba(255,248,204,0.34) 50%, rgba(255,220,136,0.14) 58%, transparent 68%)',
            filter: 'blur(0.7px)',
            mixBlendMode: 'screen',
            transition,
          }}
        />
      )}
      {wash && (
        <>
          <div
            className="absolute inset-0"
            style={{
              opacity: washAlpha,
              background: `radial-gradient(circle at ${x}% ${y}%, transparent 0%, rgba(255,253,230,0.58) 7%, rgba(255,235,150,0.18) 27%, rgba(184,218,255,0.055) 48%, transparent 70%), linear-gradient(180deg, rgba(145,200,235,0.065), rgba(255,229,150,0.12) 52%, transparent 76%)`,
              mixBlendMode: 'soft-light',
              WebkitMaskImage: 'linear-gradient(180deg, black 0%, black 56%, rgba(0,0,0,0.55) 74%, rgba(0,0,0,0.18) 100%)',
              maskImage: 'linear-gradient(180deg, black 0%, black 56%, rgba(0,0,0,0.55) 74%, rgba(0,0,0,0.18) 100%)',
              transition,
            }}
          />
          <div
            className="absolute left-0 right-0"
            style={{
              top: `${y}%`,
              height: `${10 + directness * 12}vh`,
              transform: 'translateY(-50%)',
              opacity: streakAlpha,
              background: `radial-gradient(ellipse at ${x}% 50%, rgba(255,255,238,0.82), rgba(255,235,156,0.32) 12%, rgba(186,216,255,0.11) 30%, transparent 62%)`,
              filter: `blur(${3 + directness * 5}px)`,
              mixBlendMode: 'screen',
              transition,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              opacity: veilAlpha,
              background: `linear-gradient(${92 + (x - 50) * 0.16}deg, transparent 0%, rgba(255,252,224,0.23) 42%, rgba(255,222,132,0.14) 50%, transparent 68%)`,
              mixBlendMode: 'screen',
              transition,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              opacity: horizonHold,
              background: 'linear-gradient(180deg, transparent 0%, transparent 58%, rgba(68,58,44,0.08) 84%, rgba(30,26,22,0.18) 100%)',
              mixBlendMode: 'multiply',
              transition,
            }}
          />
        </>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-amber-100/60">{label}</div>
      <div className="font-mono text-sm text-amber-50">{value}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/15 px-2 py-1.5 text-xs">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="h-4 w-4 accent-amber-200"
      />
    </label>
  );
}

function SolarDiagnostics({ settings, set }) {
  const solarGlare = useThreeGameStore(state => state.solarGlare);
  return (
    <div className="mb-3 rounded border border-amber-100/15 bg-black/15 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-100/75">Solar Diagnostics</h3>
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${solarGlare?.visible ? 'bg-amber-200/20 text-amber-100' : 'bg-white/10 text-amber-100/60'}`}>
          {solarGlare?.visible ? 'active' : 'quiet'}
        </span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <Metric label="Glare" value={solarGlare?.strength !== undefined ? solarGlare.strength.toFixed(2) : '--'} />
        <Metric label="Raw" value={solarGlare?.rawStrength !== undefined ? solarGlare.rawStrength.toFixed(2) : '--'} />
        <Metric label="Head-on" value={solarGlare?.directness !== undefined ? solarGlare.directness.toFixed(2) : '--'} />
        <Metric label="Viewport" value={solarGlare?.viewportPresence !== undefined ? solarGlare.viewportPresence.toFixed(2) : '--'} />
        <Metric label="Center" value={solarGlare?.centerResponse !== undefined ? solarGlare.centerResponse.toFixed(2) : '--'} />
        <Metric label="Sun XY" value={solarGlare?.x !== undefined ? `${solarGlare.x.toFixed(2)},${solarGlare.y.toFixed(2)}` : '--'} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Toggle label="Sun Screen Wash" checked={settings.solarScreenGlare !== false} onChange={value => set({ solarScreenGlare: value })} />
        <Toggle label="DOM Lens Ghosts" checked={settings.solarLensGhosts !== false} onChange={value => set({ solarLensGhosts: value })} />
        <Toggle label="Sun Halo/Veil" checked={settings.solarSunHalo !== false} onChange={value => set({ solarSunHalo: value })} />
        <Toggle label="Scene Sun Flares" checked={settings.solarSceneFlares !== false} onChange={value => set({ solarSceneFlares: value })} />
        <Toggle label="Sun Fog/Exposure" checked={settings.solarSunFacingGrade !== false} onChange={value => set({ solarSunFacingGrade: value })} />
      </div>
    </div>
  );
}

function PerformancePanel({ open, settings, metrics, physicsDebug, onChange, onClose }) {
  if (!open) return null;
  const set = patch => onChange(current => ({ ...current, ...patch }));
  const setQuality = quality => onChange(current => ({
    ...current,
    ...(QUALITY_PRESETS[quality] || QUALITY_PRESETS.performance),
    quality,
  }));
  return (
    <section className="pointer-events-auto fixed right-3 top-3 z-50 max-h-[calc(100dvh-1.5rem)] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-md border border-amber-100/25 bg-stone-950/88 p-3 text-amber-50 shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide">Performance</h2>
        <button type="button" onClick={onClose} className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/10">Close</button>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        <Metric label="FPS" value={metrics.fps ? Math.round(metrics.fps) : '--'} />
        <Metric label="Frame" value={metrics.frameMs ? `${metrics.frameMs.toFixed(1)}ms` : '--'} />
        <Metric label="DPR" value={metrics.pixelRatio ? metrics.pixelRatio.toFixed(2) : '--'} />
        <Metric label="Calls" value={metrics.sceneDrawCalls ?? '--'} />
        <Metric label="Tris" value={metrics.sceneTriangles ? `${Math.round(metrics.sceneTriangles / 1000)}k` : '0'} />
        <Metric label="Textures" value={metrics.textures ?? '--'} />
        <Metric label="Geoms" value={metrics.geometries ?? '--'} />
        <Metric label="Meshes" value={metrics.sceneMeshes ?? '--'} />
        <Metric label="Instances" value={metrics.sceneInstances ? `${Math.round(metrics.sceneInstances / 1000)}k` : '0'} />
        <Metric label="Raw calls" value={metrics.rawCalls ?? '--'} />
      </div>
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="text-amber-100/70">Quality</span>
        {['performance', 'cinematic'].map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => setQuality(mode)}
            className={`rounded border px-2 py-1 ${settings.quality === mode ? 'border-amber-200 bg-amber-200 text-stone-950' : 'border-white/10 bg-black/15 hover:bg-white/10'}`}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="text-amber-100/70">DPR</span>
        {['default', '1x', '1.25x', '1.5x', '2x'].map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => set({ dprMode: mode })}
            className={`rounded border px-2 py-1 ${settings.dprMode === mode ? 'border-amber-200 bg-amber-200 text-stone-950' : 'border-white/10 bg-black/15 hover:bg-white/10'}`}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="text-amber-100/70">MSAA</span>
        {[0, 2, 4].map(samples => (
          <button
            key={samples}
            type="button"
            onClick={() => set({ msaaSamples: samples })}
            className={`rounded border px-2 py-1 ${settings.msaaSamples === samples ? 'border-amber-200 bg-amber-200 text-stone-950' : 'border-white/10 bg-black/15 hover:bg-white/10'}`}
          >
            {samples}x
          </button>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="text-amber-100/70">Water</span>
        {['performance', 'cinematic'].map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => set({ waterQuality: mode })}
            className={`rounded border px-2 py-1 ${settings.waterQuality === mode ? 'border-amber-200 bg-amber-200 text-stone-950' : 'border-white/10 bg-black/15 hover:bg-white/10'}`}
          >
            {mode}
          </button>
        ))}
      </div>
      <SolarDiagnostics settings={settings} set={set} />
      <div className="grid grid-cols-2 gap-1.5">
        <Toggle label="Post FX" checked={settings.postprocessing} onChange={value => set({ postprocessing: value })} />
        <Toggle label="Ambient Occl." checked={settings.ao} onChange={value => set({ ao: value })} />
        <Toggle label="Fast Shading" checked={settings.cheapMaterials !== false} onChange={value => set({ cheapMaterials: value, foliageDrawScale: value ? 0.85 : 1 })} />
        <Toggle label="Stats" checked={settings.stats} onChange={value => set({ stats: value })} />
        <Toggle label="Shadows" checked={settings.shadows} onChange={value => set({ shadows: value })} />
        <Toggle label="Water" checked={settings.water} onChange={value => set({ water: value })} />
        <Toggle label="Reflections" checked={settings.reflections} onChange={value => set({ reflections: value })} />
        <Toggle label="Terrain" checked={settings.terrain} onChange={value => set({ terrain: value })} />
        <Toggle label="Landmarks" checked={settings.landmarks} onChange={value => set({ landmarks: value })} />
        <Toggle label="Atmosphere" checked={settings.atmosphere} onChange={value => set({ atmosphere: value })} />
        <Toggle label="World Details" checked={settings.worldDetails} onChange={value => set({ worldDetails: value })} />
        <Toggle label="Beagle" checked={settings.beagle} onChange={value => set({ beagle: value })} />
        <Toggle label="Specimens" checked={settings.specimens} onChange={value => set({ specimens: value })} />
        <Toggle label="Syms" checked={settings.syms} onChange={value => set({ syms: value })} />
        <Toggle label="Phys Obstacles" checked={settings.physicsObstacles} onChange={value => set({ physicsObstacles: value })} />
        <Toggle label="Phys Props" checked={settings.physicsProps} onChange={value => set({ physicsProps: value })} />
        <Toggle label="Water Splashes" checked={settings.waterSplashes} onChange={value => set({ waterSplashes: value })} />
        <Toggle label="Weather FX" checked={settings.weatherFX} onChange={value => set({ weatherFX: value })} />
        <Toggle label="Splat Backdrop" checked={settings.splatBackdrop} onChange={value => set({ splatBackdrop: value })} />
        <Toggle label="Physics Debug" checked={settings.physicsDebug} onChange={value => set({ physicsDebug: value })} />
      </div>
      {physicsDebug && (
        <div className="mt-3 grid grid-cols-2 gap-1.5 rounded border border-white/10 bg-black/15 p-2 text-xs">
          <span className="text-amber-100/70">Ground</span>
          <span className="font-mono">{physicsDebug.groundSource}</span>
          <span className="text-amber-100/70">State</span>
          <span className="font-mono">{physicsDebug.grounded ? 'grounded' : 'airborne'}</span>
          <span className="text-amber-100/70">Jump</span>
          <span className="font-mono">{physicsDebug.jumpPhase || 'grounded'}</span>
          <span className="text-amber-100/70">Charge</span>
          <span className="font-mono">
            {physicsDebug.jumpChargeAmount !== undefined ? `${Math.round(physicsDebug.jumpChargeAmount * 100)}%` : '--'}
          </span>
          <span className="text-amber-100/70">Vy</span>
          <span className="font-mono">{physicsDebug.velocityY !== undefined ? physicsDebug.velocityY.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Ground gap</span>
          <span className="font-mono">{physicsDebug.groundDistance !== undefined ? physicsDebug.groundDistance.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Coyote</span>
          <span className="font-mono">{physicsDebug.coyoteAvailable ? 'yes' : 'no'}</span>
          <span className="text-amber-100/70">Buffer</span>
          <span className="font-mono">{physicsDebug.jumpBuffered ? 'yes' : 'no'}</span>
          <span className="text-amber-100/70">Slope</span>
          <span className="font-mono">{physicsDebug.slopeGrade !== undefined ? physicsDebug.slopeGrade.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Uphill</span>
          <span className="font-mono">{physicsDebug.uphillDot !== undefined ? physicsDebug.uphillDot.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Speed</span>
          <span className="font-mono">{physicsDebug.speedScale !== undefined ? physicsDebug.speedScale.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Fidget</span>
          <span className="font-mono">{physicsDebug.idleFidgetIn !== null && physicsDebug.idleFidgetIn !== undefined ? `${physicsDebug.idleFidgetIn.toFixed(1)}s` : '--'}</span>
          <span className="text-amber-100/70">Carry</span>
          <span className="font-mono">{physicsDebug.inventoryCount ?? 0}</span>
          <span className="text-amber-100/70">Injured</span>
          <span className="font-mono">{physicsDebug.injuredGait ? 'yes' : 'no'}</span>
          <span className="text-amber-100/70">Jog</span>
          <span className="font-mono">{physicsDebug.tiredRun ? 'yes' : 'no'}</span>
          <span className="text-amber-100/70">Run scale</span>
          <span className="font-mono">{physicsDebug.fatigueRunScale !== undefined ? physicsDebug.fatigueRunScale.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Y</span>
          <span className="font-mono">{physicsDebug.playerY.toFixed(2)} / {physicsDebug.groundY.toFixed(2)}</span>
          <span className="text-amber-100/70">T/R Y</span>
          <span className="font-mono">
            {physicsDebug.terrainY !== undefined ? physicsDebug.terrainY.toFixed(2) : '--'}
            {' / '}
            {physicsDebug.physicsY !== null && physicsDebug.physicsY !== undefined ? physicsDebug.physicsY.toFixed(2) : '--'}
          </span>
          <span className="text-amber-100/70">Colliders</span>
          <span className="font-mono">{physicsDebug.obstacleCount}</span>
          <span className="text-amber-100/70">Spawn</span>
          <span className="font-mono">{physicsDebug.spawnPhase || 'complete'}</span>
          <span className="text-amber-100/70">Controller</span>
          <span className="font-mono">{physicsDebug.controller || '--'}</span>
          <span className="text-amber-100/70">Hits</span>
          <span className="font-mono">{physicsDebug.controllerHits ?? 0}</span>
          <span className="text-amber-100/70">Move</span>
          <span className="font-mono">{physicsDebug.computedMove || '--'}</span>
        </div>
      )}
      <p className="mt-3 text-[11px] text-amber-100/65">Press ` to toggle this panel.</p>
    </section>
  );
}

export default function ThreeDarwinGame() {
  const [launchState, setLaunchState] = useState('menu');
  const [sceneReady, setSceneReady] = useState(false);
  const [loadersStable, setLoadersStable] = useState(false);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const [deferredContentReady, setDeferredContentReady] = useState(false);
  const [showPerf, setShowPerf] = useState(false);
  const [showAssetBrowser, setShowAssetBrowser] = useState(false);
  const [showAnimalAnimationLab, setShowAnimalAnimationLab] = useState(false);
  const [showDarwinAnimationLab, setShowDarwinAnimationLab] = useState(false);
  const [perfProbe, setPerfProbe] = useState(false);
  const [costProbe, setCostProbe] = useState(false);
  const [perfSettings, setPerfSettings] = useState(getInitialPerfSettings);
  const [metrics, setMetrics] = useState({});
  const [underwaterAmount, setUnderwaterAmount] = useState(0);
  const assetProgress = useProgress();
  const bootStartedAt = useRef(0);
  const loaderQuietSince = useRef(0);
  const weather = useThreeGameStore(state => state.weather);
  const physicsDebug = useThreeGameStore(state => state.physicsDebug);
  const dpr = useMemo(() => dprForMode(perfSettings.dprMode), [perfSettings.dprMode]);
  const sky = useMemo(() => weatherSkyTint(weather), [weather]);
  const gameStarted = launchState !== 'menu';
  const showLaunchOverlay = launchState === 'menu' || !sceneReady;
  const handleUnderwaterChange = useCallback(amount => {
    setUnderwaterAmount(amount);
  }, []);

  // Mirror the material-quality knobs into the store so the scene's
  // material-building components (terrain, flora, trees) can react to them
  // without prop-threading through every layer.
  useEffect(() => {
    useThreeGameStore.getState().setGraphicsQuality({
      cheapMaterials: perfSettings.cheapMaterials !== false,
      foliageDrawScale: perfSettings.foliageDrawScale ?? 1,
    });
  }, [perfSettings.cheapMaterials, perfSettings.foliageDrawScale]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPerfSettings(settingsFromUrlSearch(window.location.search));
    setPerfProbe(params.has('perfProbe') || params.has('costProbe'));
    setCostProbe(params.has('costProbe'));
    const zoneParam = params.get('zone');
    if (zoneParam) useThreeGameStore.getState().beginZoneTransition(zoneParam, {});
    const setShortcutModifierActive = active => {
      window.__darwinShortcutModifierActive = active;
    };
    const onKeyDown = event => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      setShortcutModifierActive(event.metaKey || event.ctrlKey);
      if (event.code === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        return;
      }
      if (event.code === 'Digit0') {
        event.preventDefault();
        setShowAssetBrowser(value => !value);
        return;
      }
      if (event.code === 'Digit7') {
        event.preventDefault();
        setShowAnimalAnimationLab(value => !value);
        return;
      }
      if (event.code === 'Digit8') {
        event.preventDefault();
        setShowDarwinAnimationLab(value => !value);
        return;
      }
      if (event.code !== 'Backquote') return;
      event.preventDefault();
      setShowPerf(value => !value);
    };
    const onKeyUp = event => {
      setShortcutModifierActive(event.metaKey || event.ctrlKey);
    };
    const clearShortcutModifier = () => setShortcutModifierActive(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearShortcutModifier);
    document.addEventListener('visibilitychange', clearShortcutModifier);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearShortcutModifier);
      document.removeEventListener('visibilitychange', clearShortcutModifier);
      clearShortcutModifier();
    };
  }, []);

  useEffect(() => {
    if (!gameStarted || sceneReady) return undefined;
    const tick = () => {
      const now = performance.now();
      const elapsed = now - bootStartedAt.current;
      const rawProgress = Math.max(0, Math.min(100, assetProgress.progress || 0));
      const loaderBusy = assetProgress.active || rawProgress < 100;

      if (loaderBusy) {
        loaderQuietSince.current = 0;
        setLoadersStable(false);
      } else {
        if (!loaderQuietSince.current) loaderQuietSince.current = now;
        const quietFor = now - loaderQuietSince.current;
        setLoadersStable(quietFor >= BOOT_LOADER_STABLE_MS && elapsed >= BOOT_MIN_LOADING_MS);
      }

      const elapsedEase = Math.min(1, elapsed / 9000);
      const assetTarget = loaderBusy
        ? 14 + rawProgress * 0.62
        : 88 + Math.min(8, ((loaderQuietSince.current ? now - loaderQuietSince.current : 0) / BOOT_LOADER_STABLE_MS) * 8);
      const target = Math.min(sceneReady ? 100 : 98, Math.max(14 + elapsedEase * 28, assetTarget));
      setDisplayedProgress(current => Math.max(current, current + (target - current) * 0.12));
    };

    const handle = window.setInterval(tick, 80);
    tick();
    return () => window.clearInterval(handle);
  }, [assetProgress.active, assetProgress.progress, gameStarted, sceneReady]);

  const beginNewExpedition = () => {
    bootStartedAt.current = performance.now();
    loaderQuietSince.current = 0;
    setDisplayedProgress(0);
    setLoadersStable(false);
    setSceneReady(false);
    setDeferredContentReady(false);
    setLaunchState('loading');
  };

  const markSceneReady = () => {
    setSceneReady(true);
    setDisplayedProgress(100);
    setLaunchState('playing');
  };

  useEffect(() => {
    if (!sceneReady) return undefined;
    const handle = window.setTimeout(() => {
      setDeferredContentReady(true);
    }, DEFERRED_CONTENT_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [sceneReady]);

  return (
    <main className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-stone-950 text-amber-50">
      <KeyboardControls map={KEYBOARD_MAP}>
        {gameStarted && (
          <Canvas
            className="absolute inset-0 h-full w-full"
            shadows={perfSettings.shadows}
            dpr={dpr}
            camera={{ position: [0, 2.6, 4.8], fov: 50, near: 0.1, far: 180 }}
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
              preserveDrawingBuffer: perfSettings.preserveDrawingBuffer,
              toneMapping: ACESFilmicToneMapping,
              outputColorSpace: SRGBColorSpace,
            }}
            onCreated={({ gl }) => {
              // Sharp ground/foliage textures at glancing angles, ~free on any
              // GPU this game targets. Set before the GLBs stream in so every
              // texture picks it up.
              Texture.DEFAULT_ANISOTROPY = Math.min(8, gl.capabilities.getMaxAnisotropy());
            }}
          >
            <color attach="background" args={[sky]} />
            {/* Exponential-squared fog: the WeatherDirector drives density per
                frame (sunny haze through thick garúa); SkyController keeps
                owning its color. Density 0.012 ≈ the old linear 32..108 reach. */}
            <fogExp2 attach="fog" args={[sky, 0.012]} />
            <Suspense fallback={null}>
              <ThreeScene perfSettings={perfSettings} deferredContentReady={deferredContentReady} />
              <SceneReadySignal
                loadingReady={gameStarted}
                startedAtRef={bootStartedAt}
                minElapsedMs={BOOT_MIN_LOADING_MS}
                onReady={markSceneReady}
              />
            </Suspense>
            <PostFX
              enabled={perfSettings.postprocessing}
              ao={perfSettings.ao}
              multisampling={perfSettings.msaaSamples ?? DEFAULT_PERF_SETTINGS.msaaSamples}
              underwaterAmount={underwaterAmount}
            />
            <AdaptiveResolution enabled={sceneReady} maxDpr={dpr[1]} />
            <UnderwaterCameraTracker onChange={handleUnderwaterChange} />
            <ExpeditionClock />
            <InspectionAnchorProjector />
            <PerformanceSampler
              enabled={showPerf || perfProbe}
              includeCosts={costProbe}
              onSample={sample => {
                if (typeof window !== 'undefined') {
                  window.__threePerfSample = sample;
                  if (costProbe) {
                    window.__threeSceneCost = {
                      byTriangles: sample.sceneCostBuckets || [],
                      byDrawCalls: sample.sceneCostDrawCallBuckets || [],
                      byUncullable: sample.sceneCostUncullableBuckets || [],
                      totals: {
                        drawCalls: sample.sceneDrawCalls,
                        triangles: sample.sceneTriangles,
                        meshes: sample.sceneMeshes,
                        skinnedMeshes: sample.sceneSkinnedMeshes,
                        instancedMeshes: sample.sceneInstancedMeshes,
                        instances: sample.sceneInstances,
                        visibleObjects: sample.sceneVisibleObjects,
                      },
                    };
                  }
                }
                if (showPerf) setMetrics(sample);
              }}
            />
            {showPerf && perfSettings.stats && <Stats />}
          </Canvas>
        )}
        {gameStarted && <CinematicScreenGrade enabled={perfSettings.postprocessing} weather={weather} />}
        {gameStarted && (
          <SolarScreenGlare
            enabled={perfSettings.solarScreenGlare !== false || perfSettings.solarLensGhosts !== false}
            wash={perfSettings.solarScreenGlare !== false}
            lensGhostsEnabled={perfSettings.solarLensGhosts !== false}
            suppression={underwaterAmount}
          />
        )}
        {gameStarted && !showLaunchOverlay && <ThreeHUD onTogglePerf={() => setShowPerf(value => !value)} />}
        {gameStarted && !showLaunchOverlay && <AssetBrowserPanel open={showAssetBrowser} onClose={() => setShowAssetBrowser(false)} />}
        {gameStarted && !showLaunchOverlay && (
          <AnimalAnimationDevPanel open={showAnimalAnimationLab} onClose={() => setShowAnimalAnimationLab(false)} />
        )}
        {gameStarted && !showLaunchOverlay && (
          <DarwinAnimationDevPanel open={showDarwinAnimationLab} onClose={() => setShowDarwinAnimationLab(false)} />
        )}
        <PerformancePanel
          open={gameStarted && !showLaunchOverlay && showPerf}
          settings={perfSettings}
          metrics={metrics}
          physicsDebug={physicsDebug}
          onChange={setPerfSettings}
          onClose={() => setShowPerf(false)}
        />
        {showLaunchOverlay && (
          <LaunchOverlay
            mode={launchState === 'menu' ? 'menu' : 'loading'}
            progress={displayedProgress}
            onNewExpedition={beginNewExpedition}
          />
        )}
      </KeyboardControls>
    </main>
  );
}
