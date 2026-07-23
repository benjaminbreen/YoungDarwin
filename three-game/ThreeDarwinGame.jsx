'use client';

import dynamic from 'next/dynamic';
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyboardControls, Stats, useProgress } from '@react-three/drei';
import { EffectComposer, EffectComposerContext, Bloom, DepthOfField, N8AO, SMAA } from '@react-three/postprocessing';
import { BrightnessContrastEffect, HueSaturationEffect, VignetteEffect } from 'postprocessing';
import { ACESFilmicToneMapping, MathUtils, PCFSoftShadowMap, SRGBColorSpace, Texture, Vector3 } from 'three';
import { ThreeScene } from './components/ThreeScene';
import { UnderwaterPostEffect } from './components/scene/UnderwaterPostEffect';
import { HeatHazePostEffect } from './components/scene/HeatHazePostEffect';
import { AnimalVisionPostEffect } from './components/scene/AnimalVisionPostEffect';
import { ThreeHUD } from './ui/ThreeHUD';
import { ZoneTransitionOverlay } from './ui/ZoneTransitionOverlay';
import { LaunchOverlay } from './ui/LaunchOverlay';
import { IslandSoundscape } from './audio/IslandSoundscape';
import {
  activatePostOfficeBayAudio,
  preloadSoundscapeEffects,
} from './audio/audioRuntime';
import { ThreeE2EFrameSignal, ThreeE2EHarness } from './e2e/ThreeE2EHarness';
import { useThreeGameStore } from './store';
import { getPlayableMode } from './playable/playableModes';
import { isOvercastWeather, weatherProfile, weatherSkyTint } from './world/weatherStates';
import { skyState } from './world/celestial';
import { weatherEnv } from './world/weatherEnvRuntime';
import { computeColorGrade } from './world/colorGrade';
import { WATER_LEVEL } from './world/water';
import { cloudShadeTuning, fogAtmosphereUniforms } from './world/fogAtmosphere'; // patches the shared fog chunks; must run before first shader compile
import { solarLookTuning } from './world/solarLook';
import { setCoverageAASupport } from './components/assets/materialStability';
import { SceneEnvironment } from './components/assets/ModelAsset';
import { getInteriorDefinition } from './interiors/interiorRegistry';
import { getRegionMap } from '../game-core/regionMaps';
import {
  getSpecimenRuntimeBounds,
  getSpecimenRuntimePoses,
  resolveSpecimenFrameHint,
} from './world/specimenRuntime';
import {
  examinationDepthOfFieldActive,
  postprocessingComposerActive,
} from './examine/examinationPostFx';
import { terrainHeight } from './world/terrain';
import {
  prefetchEcologyAssets,
  setEcologyAssetPrefetchPaused,
} from './components/scene/ecology/EcologyRenderer';
import { prepareTerrainResource, terrainResourceIsReady } from './world/terrainResource';
import {
  prepareRegionEcologyResource,
  regionEcologyResourceIsReady,
} from './world/ecology/ecologyResource';
import {
  borderVistaResourceIsReady,
  prepareBorderVistaResource,
} from './world/vistas/borderVistaResource';
import { prefetchRegionTerrainTextures } from './world/terrainPrefetch';
import {
  prepareWaterTextureResource,
  waterTextureResourceIsReady,
} from './world/waterTextureResource';
import {
  waterBakeResolutionForQuality,
  waterContactResolutionForQuality,
  regionTypeRendersDetailedWater,
} from './world/waterTextureManifest';
import { prefetchIslandMapImage } from './ui/expedition/map/islandLocations';
import {
  setEcologyDebugEnabled,
  setEcologyDebugSpecies,
  toggleEcologyDebug,
} from './world/ecology/ecologyDebugRuntime';
import { MultiplayerProvider } from './multiplayer/MultiplayerContext';
import { MultiplayerHud } from './multiplayer/MultiplayerHud';

const DEV_TOOLS_ENABLED = process.env.NODE_ENV !== 'production';
const AssetBrowserPanel = dynamic(
  () => import('./ui/dev/AssetBrowserPanel').then(module => module.AssetBrowserPanel),
  { ssr: false },
);
const EcologyDebugHud = dynamic(
  () => import('./ui/dev/EcologyDebugHud').then(module => module.EcologyDebugHud),
  { ssr: false },
);
const AnimalAnimationDevPanel = dynamic(
  () => import('./ui/dev/AnimalAnimationDevPanel').then(module => module.AnimalAnimationDevPanel),
  { ssr: false },
);
const DarwinAnimationDevPanel = dynamic(
  () => import('./ui/dev/DarwinAnimationDevPanel').then(module => module.DarwinAnimationDevPanel),
  { ssr: false },
);
const MapGeographyDevPanel = dynamic(
  () => import('./ui/dev/MapGeographyDevPanel').then(module => module.MapGeographyDevPanel),
  { ssr: false },
);
const WaterDevPanel = dynamic(
  () => import('./ui/dev/WaterDevPanel').then(module => module.WaterDevPanel),
  { ssr: false },
);
const AudioDebugPanel = dynamic(
  () => import('./ui/dev/AudioDebugPanel').then(module => module.AudioDebugPanel),
  { ssr: false },
);

const KEYBOARD_MAP = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'dodge', keys: ['KeyB'] },
  { name: 'interact', keys: ['KeyE'] },
  { name: 'examine', keys: ['Enter', 'NumpadEnter'] },
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
  // H is reserved by the polished desktop HUD for hiding/showing interface
  // chrome. Hammering remains available through slot 4 + the J tool action.
  { name: 'hammer', keys: [] },
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
const LEGACY_KEYBOARD_MAP = KEYBOARD_MAP.map(binding => (
  binding.name === 'hammer' ? { ...binding, keys: ['KeyH'] } : binding
));

const GAME_MINUTES_PER_REAL_SECOND = 10 / 60;

// SMAAPreset.ULTRA from the 'postprocessing' package. That package is only a
// transitive dep (not re-exported by @react-three/postprocessing), so we inline
// its stable enum value rather than import from a non-direct dependency.
const SMAA_PRESET_ULTRA = 3;
const WATER_QUALITY_MODES = ['performance', 'polished', 'cinematic'];
const SETTLED_ASSET_PROGRESS = Object.freeze({
  active: false,
  progress: 100,
  total: 0,
});
const AUDIO_PREFERENCE_KEY = 'darwin-soundscape-enabled';
const LAUNCH_MENU_STATES = new Set(['menu', 'character', 'settings', 'about']);

const DEFAULT_PERF_SETTINGS = {
  quality: 'performance',
  waterQuality: 'polished',
  dprMode: 'default',
  msaaSamples: 0,
  postprocessing: true,
  contextAntialias: true,
  stats: false,
  shadows: true,
  shadowQuality: 'high',
  water: true,
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
  // Ghost-flare sprites read as overdone against the boosted sun optics
  // (2026-07 screenshot pass); the halo/corona family carries the look now.
  solarSceneFlares: false,
  solarSunFacingGrade: true,
  physicsDebug: false,
  preserveDrawingBuffer: false,
  ao: true,
  reflections: true,
  // Swap world vegetation/terrain from MeshStandard (PBR) to matte MeshPhong —
  // same matte look, far cheaper per fragment. foliageDrawScale trims vegetation
  // draw distance to cut overdraw. Both default to the 'performance' tier.
  cheapMaterials: true,
  foliageDrawScale: 0.85,
  terrainSegmentCap: 200,
};

const QUALITY_PRESETS = {
  // Mobile is a *slight* step down from performance, not a scorched-earth tier:
  // dropping to 1x DPR with no AA of any kind read as pixelated/jagged, and the
  // 'low' shadow tier's 12–24Hz refresh made shadows visibly ghost behind the
  // player. Keep SMAA + the performance-tier DPR; save cost on reflections,
  // shadow map size, foliage draw distance, and terrain density instead.
  mobile: {
    dprMode: '1.25x',
    msaaSamples: 0,
    postprocessing: true,
    contextAntialias: true,
    shadowQuality: 'standard',
    ao: false,
    reflections: false,
    waterQuality: 'performance',
    waterSplashes: true,
    weatherFX: true,
    splatBackdrop: true,
    solarScreenGlare: true,
    solarLensGhosts: false,
    solarSunHalo: true,
    solarSceneFlares: false,
    cheapMaterials: true,
    foliageDrawScale: 0.75,
    terrainSegmentCap: 160,
  },
  performance: {
    // DPR is the master fillrate lever: 1.5x renders 2.25x the pixels of 1x, and
    // every full-screen pass (post chain, water, terrain, sky) pays for all of
    // them. On integrated/laptop GPUs that's the dominant cost, so the
    // performance tier uses a modest 1.25x cap: SMAA cleans polygon edges, but
    // Darwin's face/buttons and thin vegetation need a little real sample
    // coverage to avoid crunchy subpixel breakup.
    dprMode: '1.25x',
    // SMAA handles the direct polygon edges without paying for a multisampled
    // full-resolution composer target on integrated GPUs.
    msaaSamples: 0,
    postprocessing: true,
    contextAntialias: true,
    shadowQuality: 'high',
    // N8AO grounds props and vegetation enough to be worth its cost even on
    // the default tier (2026-07 screenshot pass); only mobile leaves it off.
    ao: true,
    // Planar reflection measured as near-free at this tier and the water
    // reads dramatically better with it — only mobile leaves it off.
    reflections: true,
    waterQuality: 'performance',
    waterSplashes: true,
    weatherFX: true,
    splatBackdrop: true,
    solarScreenGlare: true,
    solarLensGhosts: true,
    solarSunHalo: true,
    solarSceneFlares: false,
    cheapMaterials: true,
    foliageDrawScale: 0.85,
    terrainSegmentCap: 200,
  },
  cinematic: {
    dprMode: 'default',
    msaaSamples: 2,
    postprocessing: true,
    contextAntialias: true,
    shadowQuality: 'high',
    ao: true,
    reflections: true,
    waterQuality: 'cinematic',
    waterSplashes: true,
    weatherFX: true,
    splatBackdrop: true,
    solarScreenGlare: true,
    solarLensGhosts: true,
    solarSunHalo: true,
    solarSceneFlares: false,
    cheapMaterials: false,
    foliageDrawScale: 1,
    terrainSegmentCap: null,
  },
};

const BOOT_LOADER_STABLE_MS = 350;
const BOOT_MIN_LOADING_MS = 1000;
const SCREENSHOT_MIN_LOADING_MS = 5200;
const OPENING_DURATION_MS = 7200;
const LAUNCH_OVERLAY_FADE_MS = 600;
const STARTUP_FULL_CONTENT_PHASE = 6;
const TRANSITION_REVEAL_CONTENT_PHASE = 5;
// Terrain, vistas, authored ecology, and Darwin establish the opening shot.
// Asset-heavy props, specimens, and NPCs must not gate launch: a slow or
// unresolved optional GLB otherwise strands the progress display at 97–98%.
const STARTUP_OPENING_CONTENT_PHASE = 3;
const INTRO_LOADING_PHASE_TIMINGS_MS = [0, 180, 420, 570, 940, 1370];
// Once the cinematic has handed off, fill in optional content during separated
// idle windows rather than asking React/Rapier/GLTF to mount it during the shot.
const INTRO_REVEAL_PHASE_TIMINGS_MS = [250, 1100, 2400];
// Destination resources are already preparing while the player approaches an
// edge. Once the chart is opaque, mount one content family per painted/idle
// window so React, Rapier, instance matrices, and shader discovery cannot all
// consume the same animation frame.
const TRANSITION_MOUNT_STEPS = Object.freeze([
  2,
  3,
  3.2,
  3.4,
  3.6,
  3.8,
  4,
  4.25,
  4.5,
  5,
  5.2,
  5.4,
  5.6,
  6,
]);
// The deadline is a degraded fallback, not the normal transition clock. Full
// destination content now mounts and compiles beneath the opaque chart first.
const TRANSITION_READY_DEADLINE_MS = 6500;
const TRANSITION_COMPILE_TIMEOUT_MS = 1200;
const SCENE_COST_BUCKET_LIMIT = 40;
const SHADOW_QUALITY_MODES = ['low', 'standard', 'high', 'ultra'];
const OPENING_RENDER_DPR = [1, 1];

function normalizeShadowQuality(value, fallback = 'high') {
  const mode = String(value || '').toLowerCase();
  return SHADOW_QUALITY_MODES.includes(mode) ? mode : fallback;
}

function normalizeWaterQuality(value, fallback = 'polished') {
  const mode = String(value || '').toLowerCase();
  return WATER_QUALITY_MODES.includes(mode) ? mode : fallback;
}

function getInitialPerfSettings() {
  return {
    ...DEFAULT_PERF_SETTINGS,
    ...QUALITY_PRESETS[DEFAULT_PERF_SETTINGS.quality],
    // Desktop's automatic launch uses the performance scene preset but the
    // polished water tier. Explicit quality selections still own their water
    // choice below, and constrained mobile devices retain performance water.
    waterQuality: DEFAULT_PERF_SETTINGS.waterQuality,
  };
}

function recommendedQualityFromDevice() {
  if (typeof window === 'undefined') return 'performance';
  const memory = Number(window.navigator?.deviceMemory);
  const cores = Number(window.navigator?.hardwareConcurrency);
  const compactTouch = window.matchMedia?.('(pointer: coarse)').matches
    && Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight) <= 1024;
  const constrainedMemory = Number.isFinite(memory) && memory > 0 && memory <= 4;
  const constrainedCpu = Number.isFinite(cores) && cores > 0 && cores <= 4;
  return compactTouch || constrainedMemory || constrainedCpu ? 'mobile' : 'performance';
}

function settingEnabled(params, baseValue, enabledNames, disabledNames) {
  if (enabledNames.some(name => params.has(name))) return true;
  return baseValue !== false && !disabledNames.some(name => params.has(name));
}

function settingsFromUrlSearch(search, automaticQuality = 'performance') {
  const params = new URLSearchParams(search);
  const requestedQuality = String(params.get('quality') || '').toLowerCase();
  const quality = requestedQuality === 'low'
    ? 'mobile'
    : Object.prototype.hasOwnProperty.call(QUALITY_PRESETS, requestedQuality)
      ? requestedQuality
      : automaticQuality;
  const base = { ...DEFAULT_PERF_SETTINGS, ...QUALITY_PRESETS[quality], quality };
  const defaultWaterQuality = requestedQuality
    ? base.waterQuality
    : quality === 'mobile'
      ? QUALITY_PRESETS.mobile.waterQuality
      : DEFAULT_PERF_SETTINGS.waterQuality;
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
  const terrainSegmentsParam = String(params.get('terrainSegments') || '').toLowerCase();
  const parsedTerrainSegments = Number(terrainSegmentsParam);
  const terrainSegmentCap = terrainSegmentsParam === 'authored' || terrainSegmentsParam === 'full'
    ? null
    : params.has('terrainSegments') && Number.isFinite(parsedTerrainSegments)
      ? MathUtils.clamp(Math.floor(parsedTerrainSegments), 64, 512)
      : base.terrainSegmentCap;
  return {
    quality,
    waterQuality: normalizeWaterQuality(params.get('waterQuality'), defaultWaterQuality),
    shadowQuality: normalizeShadowQuality(params.get('shadowQuality'), base.shadowQuality),
    dprMode: params.get('dpr') || base.dprMode,
    msaaSamples,
    postprocessing,
    ao,
    stats: false,
    contextAntialias: base.contextAntialias !== false,
    shadows: settingEnabled(params, base.shadows, ['shadows'], ['noShadows']),
    water: settingEnabled(params, base.water, ['water'], ['noWater']),
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
    waterSplashes: settingEnabled(params, base.waterSplashes, ['waterSplashes'], ['noWaterSplashes']),
    weatherFX: settingEnabled(params, base.weatherFX, ['weather', 'weatherFX'], ['noWeather']),
    splatBackdrop: settingEnabled(params, base.splatBackdrop, ['splatBackdrop'], ['noSplatBackdrop']),
    solarScreenGlare: settingEnabled(params, base.solarScreenGlare, ['solarScreenGlare'], ['noSolarScreenGlare']),
    solarLensGhosts: settingEnabled(params, base.solarLensGhosts, ['solarLensGhosts'], ['noSolarLensGhosts']),
    solarSunHalo: settingEnabled(params, base.solarSunHalo, ['solarSunHalo'], ['noSolarSunHalo']),
    solarSceneFlares: settingEnabled(params, base.solarSceneFlares, ['solarSceneFlares'], ['noSolarSceneFlares']),
    solarSunFacingGrade: settingEnabled(params, base.solarSunFacingGrade, ['solarSunFacingGrade'], ['noSolarSunFacingGrade']),
    physicsDebug: params.has('physicsDebug'),
    preserveDrawingBuffer: params.has('preserveDrawingBuffer'),
    cheapMaterials: params.has('cheapMaterials')
      ? true
      : base.cheapMaterials && !params.has('noCheapMaterials'),
    foliageDrawScale: params.has('foliageDrawScale') && Number.isFinite(Number(params.get('foliageDrawScale')))
      ? Number(params.get('foliageDrawScale'))
      : base.foliageDrawScale,
    terrainSegmentCap,
  };
}

function urlFlagEnabled(params, name) {
  if (!params.has(name)) return false;
  const value = String(params.get(name) || '').trim().toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off' && value !== 'no';
}

function e2eModeFromParams(params) {
  return params.has('e2e') || params.get('testMode') === 'e2e';
}

function screenshotModeFromParams(params) {
  return urlFlagEnabled(params, 'screenshot') || params.get('testMode') === 'screenshot';
}

function skipOpeningIntroFromParams(params) {
  if (params.has('skipIntro')) return urlFlagEnabled(params, 'skipIntro');
  return Boolean(
    e2eModeFromParams(params)
    || screenshotModeFromParams(params)
  );
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

function transitionPercentile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))];
}

// Short averages conceal the exact failure mode this transition needs to
// prevent: one long main-thread task freezing an otherwise GPU-composited map
// pan. This probe records every rAF interval plus phase/content milestones and
// exposes the latest sample to the transition smoke test and dev console.
function TransitionPerformanceProbe({ enabled, transition, contentPhase }) {
  const activeRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    window.__threeActiveContentPhase = contentPhase;
    return () => {
      delete window.__threeActiveContentPhase;
    };
  }, [contentPhase, enabled]);

  useEffect(() => {
    if (!enabled || !transition?.id) return undefined;
    const startedAt = performance.now();
    const sample = {
      id: transition.id,
      fromZoneId: transition.fromZoneId,
      zoneId: transition.zoneId,
      source: transition.source,
      startedAt,
      durationMs: 0,
      events: [],
      frameDeltas: [],
      frameCount: 0,
      worstFrameMs: 0,
      p95FrameMs: 0,
      framesOver32Ms: 0,
      framesOver50Ms: 0,
      longTasks: [],
      complete: false,
    };
    let frameHandle = null;
    let previousFrameAt = null;
    let observer = null;
    const record = (name, detail = null) => {
      const atMs = performance.now() - startedAt;
      sample.events.push({ name, atMs, detail });
      try {
        performance.mark(`three-transition:${transition.id}:${name}`);
      } catch {
        // User agents may reject unusually long mark names; metrics still live
        // in the exposed sample.
      }
    };
    const tick = now => {
      if (previousFrameAt == null) {
        previousFrameAt = now;
        frameHandle = window.requestAnimationFrame(tick);
        return;
      }
      const delta = now - previousFrameAt;
      previousFrameAt = now;
      sample.frameDeltas.push(delta);
      sample.frameCount += 1;
      sample.worstFrameMs = Math.max(sample.worstFrameMs, delta);
      if (delta > 32) sample.framesOver32Ms += 1;
      if (delta > 50) sample.framesOver50Ms += 1;
      frameHandle = window.requestAnimationFrame(tick);
    };
    const globalRecorder = (name, detail) => record(name, detail);
    activeRef.current = { sample, record };
    window.__threeTransitionPerf = sample;
    window.__recordThreeTransitionEvent = globalRecorder;
    record('start');
    frameHandle = window.requestAnimationFrame(tick);
    if (typeof PerformanceObserver === 'function') {
      try {
        observer = new PerformanceObserver(list => {
          list.getEntries().forEach(entry => {
            sample.longTasks.push({
              atMs: entry.startTime - startedAt,
              durationMs: entry.duration,
            });
          });
        });
        observer.observe({ type: 'longtask', buffered: false });
      } catch {
        observer = null;
      }
    }
    return () => {
      if (frameHandle != null) window.cancelAnimationFrame(frameHandle);
      observer?.disconnect?.();
      sample.durationMs = performance.now() - startedAt;
      sample.p95FrameMs = transitionPercentile(sample.frameDeltas, 0.95);
      sample.complete = true;
      record('complete');
      const history = window.__threeTransitionPerfHistory || [];
      window.__threeTransitionPerfHistory = [...history.slice(-19), sample];
      if (window.__recordThreeTransitionEvent === globalRecorder) {
        delete window.__recordThreeTransitionEvent;
      }
      activeRef.current = null;
    };
  }, [
    enabled,
    transition?.fromZoneId,
    transition?.id,
    transition?.source,
    transition?.zoneId,
  ]);

  useEffect(() => {
    if (!transition?.phase) return;
    activeRef.current?.record(`phase:${transition.phase}`);
  }, [transition?.phase]);

  useEffect(() => {
    if (!transition?.id) return;
    activeRef.current?.record(`content-phase:${contentPhase}`);
  }, [contentPhase, transition?.id]);

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
  const examineOpen = useThreeGameStore(state => Boolean(state.examineSession));
  const readableBookOpen = useThreeGameStore(state => Boolean(state.readableBookSession));

  useFrame((_, delta) => {
    if (statusViewOpen || examineOpen || readableBookOpen) {
      // Status/examine views freeze expedition time; drop accumulated real
      // time so the clock doesn't lurch forward on close.
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

function OpeningVisualReadySignal({
  active,
  sequenceId,
  contentReady,
  segmentCap,
  onReady,
}) {
  const activeSequenceRef = useRef(null);
  const quietSinceRef = useRef(0);
  const stableFramesRef = useRef(0);
  const announcedSequenceRef = useRef(null);

  useFrame(() => {
    if (!active || !sequenceId) {
      activeSequenceRef.current = null;
      quietSinceRef.current = 0;
      stableFramesRef.current = 0;
      return;
    }
    if (activeSequenceRef.current !== sequenceId) {
      activeSequenceRef.current = sequenceId;
      quietSinceRef.current = 0;
      stableFramesRef.current = 0;
      announcedSequenceRef.current = null;
    }
    if (!contentReady) return;

    const zoneId = useThreeGameStore.getState().currentZoneId;
    if (!terrainResourceIsReady(zoneId, segmentCap)) {
      quietSinceRef.current = 0;
      stableFramesRef.current = 0;
      return;
    }

    // Read loader state imperatively. Subscribing this R3F component lets a
    // render-time texture request schedule a React update in another render.
    const assetProgress = useProgress.getState();
    const knownTotal = Number(assetProgress.total || 0);
    const loaderBusy = assetProgress.active
      || (knownTotal > 0 && Number(assetProgress.progress || 0) < 100);
    if (loaderBusy) {
      quietSinceRef.current = 0;
      stableFramesRef.current = 0;
      return;
    }

    const now = performance.now();
    if (!quietSinceRef.current) quietSinceRef.current = now;
    if (now - quietSinceRef.current < 300) return;

    stableFramesRef.current += 1;
    if (stableFramesRef.current < 3 || announcedSequenceRef.current === sequenceId) return;
    announcedSequenceRef.current = sequenceId;
    onReady();
  });

  return null;
}

function ZoneTransitionReadySignal({ segmentCap, contentPhase, transition, waterQuality }) {
  const { gl, scene, camera } = useThree();
  const compiledIdRef = useRef(null);
  const compilingIdRef = useRef(null);
  const quietSinceRef = useRef(0);
  const stableFramesRef = useRef(0);
  const resourceStableFramesRef = useRef(0);
  const activeIdRef = useRef(null);
  const readyTimeoutRef = useRef(null);
  const readyQueuedIdRef = useRef(null);

  useEffect(() => () => {
    if (readyTimeoutRef.current != null) window.clearTimeout(readyTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!transition?.id || transition.phase !== 'mounting' || !transition.committedAt) return undefined;
    const wait = Math.max(0, TRANSITION_READY_DEADLINE_MS - (Date.now() - transition.committedAt));
    const timer = window.setTimeout(() => {
      const current = useThreeGameStore.getState();
      if (current.transition?.id !== transition.id || current.transition.phase !== 'mounting') return;
      current.setZoneTransitionPhase('ready', transition.id);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [transition?.committedAt, transition?.id, transition?.phase]);

  // Zustand updates are normally safe from a frame callback, but this signal
  // can coincide with React committing destination Suspense children. Deferring
  // one task keeps the transition update outside another component's render.
  const queueReady = transitionId => {
    if (readyQueuedIdRef.current === transitionId) return;
    readyQueuedIdRef.current = transitionId;
    readyTimeoutRef.current = window.setTimeout(() => {
      readyTimeoutRef.current = null;
      readyQueuedIdRef.current = null;
      const current = useThreeGameStore.getState();
      if (current.transition?.id !== transitionId || current.transition.phase !== 'mounting') return;
      current.setZoneTransitionPhase('ready', transitionId);
    }, 0);
  };

  useEffect(() => {
    let frameHandle = null;
    let cancelled = false;
    const tick = () => {
      try {
        const state = useThreeGameStore.getState();
        const active = state.transition;
        if (!active || active.phase !== 'mounting' || state.currentZoneId !== active.zoneId) {
          quietSinceRef.current = 0;
          stableFramesRef.current = 0;
          resourceStableFramesRef.current = 0;
          activeIdRef.current = null;
          return;
        }
        if (activeIdRef.current !== active.id) {
          activeIdRef.current = active.id;
          quietSinceRef.current = 0;
          stableFramesRef.current = 0;
          resourceStableFramesRef.current = 0;
        }
        // Compilation is a polish step, not a gate that may permanently strand
        // the player. This also covers a failed terrain promise or a loader that
        // never reports its final progress event on a particular WebGL driver.
        if (active.committedAt && Date.now() - active.committedAt >= TRANSITION_READY_DEADLINE_MS) {
          queueReady(active.id);
          return;
        }
        if (!terrainResourceIsReady(active.zoneId, segmentCap)) {
          resourceStableFramesRef.current = 0;
          return;
        }
        const waterResource = waterResourceDescriptor(active.zoneId, waterQuality);
        if (contentPhase < TRANSITION_REVEAL_CONTENT_PHASE
          || !borderVistaResourceIsReady(active.zoneId)
          || !regionEcologyResourceIsReady(active.zoneId)
          || (!waterResource.skip && !waterTextureResourceIsReady(
            active.zoneId,
            waterResource.bakeRes,
            waterResource.options,
          ))) {
          resourceStableFramesRef.current = 0;
          return;
        }
        // Let Suspense commit the terrain/physics consumers after the worker's
        // promise resolves before compiling the destination scene.
        resourceStableFramesRef.current += 1;
        if (resourceStableFramesRef.current < 3) return;
        if (compiledIdRef.current !== active.id) {
          if (compilingIdRef.current !== active.id) {
            const transitionId = active.id;
            compilingIdRef.current = transitionId;
            let compileTimeoutId = null;
            Promise.resolve()
              .then(() => Promise.race([
                typeof gl.compileAsync === 'function'
                  ? gl.compileAsync(scene, camera)
                  : Promise.resolve(gl.compile(scene, camera)),
                new Promise(resolve => {
                  compileTimeoutId = window.setTimeout(resolve, TRANSITION_COMPILE_TIMEOUT_MS);
                }),
              ]))
              .catch(() => {
                // The renderer will surface shader errors. Readiness must still
                // settle onto authored fallbacks on unusual WebGL drivers.
              })
              .then(() => {
                if (compileTimeoutId != null) window.clearTimeout(compileTimeoutId);
                if (useThreeGameStore.getState().transition?.id === transitionId) {
                  compiledIdRef.current = transitionId;
                }
                if (compilingIdRef.current === transitionId) compilingIdRef.current = null;
              });
          }
          return;
        }
        // Read the loader store without subscribing this component. Texture
        // loaders may start synchronously while destination actors render; a
        // subscription here can cause a cross-component React update.
        const assetProgress = useProgress.getState();
        const knownTotal = Number(assetProgress.total || 0);
        const loaderBusy = assetProgress.active
          || (knownTotal > 0 && Number(assetProgress.progress || 0) < 100);
        if (loaderBusy || compiledIdRef.current !== active.id) {
          quietSinceRef.current = 0;
          stableFramesRef.current = 0;
          return;
        }
        const now = performance.now();
        if (!quietSinceRef.current) quietSinceRef.current = now;
        if (now - quietSinceRef.current < 220) return;
        stableFramesRef.current += 1;
        if (stableFramesRef.current < 3) return;
        stableFramesRef.current = 0;
        queueReady(active.id);
      } finally {
        if (!cancelled) frameHandle = window.requestAnimationFrame(tick);
      }
    };
    frameHandle = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (frameHandle != null) window.cancelAnimationFrame(frameHandle);
    };
  }, [
    camera,
    contentPhase,
    gl,
    scene,
    segmentCap,
    transition?.id,
    transition?.phase,
    waterQuality,
  ]);

  return null;
}

function TravelCameraRig() {
  const { camera } = useThree();
  const sequenceRef = useRef(null);
  const departurePositionRef = useRef(new Vector3());
  const departureDirectionRef = useRef(new Vector3());
  const departureFovRef = useRef(camera.fov);
  const arrivalPositionRef = useRef(new Vector3());
  const arrivalQuaternionRef = useRef(camera.quaternion.clone());
  const arrivalIdRef = useRef(null);
  const targetPosition = useRef(new Vector3());
  const targetQuaternion = useRef(camera.quaternion.clone());
  const lookTarget = useRef(new Vector3());
  const direction = useRef(new Vector3());

  useFrame(() => {
    const state = useThreeGameStore.getState();
    const active = state.transition;
    if (!active || active.mode === 'threshold') {
      sequenceRef.current = null;
      arrivalIdRef.current = null;
      return;
    }

    if (sequenceRef.current !== active.id) {
      sequenceRef.current = active.id;
      departurePositionRef.current.copy(camera.position);
      camera.getWorldDirection(departureDirectionRef.current);
      departureFovRef.current = camera.fov;
      arrivalIdRef.current = null;
    }

    if (active.phase === 'departing') {
      const elapsed = Math.max(0, Date.now() - active.startedAt);
      const t = MathUtils.smoothstep(Math.min(1, elapsed / 1000), 0, 1);
      targetPosition.current.copy(departurePositionRef.current)
        .addScaledVector(departureDirectionRef.current, -7 * t);
      targetPosition.current.y += 10 * t;
      camera.position.copy(targetPosition.current);
      const pose = state.playerPose?.position || { x: 0, y: 0, z: 0 };
      lookTarget.current.set(pose.x || 0, (pose.y || 0) + 1.1, pose.z || 0);
      camera.lookAt(lookTarget.current);
      camera.fov = departureFovRef.current + 3.2 * t;
      camera.updateProjectionMatrix();
      return;
    }

    if (active.phase !== 'arriving' && active.phase !== 'settling') return;
    // PlayerController has already written the exact selected-view pose this
    // frame. Capture it as the handoff target, then apply the cinematic override
    // afterward so release at t=1 cannot snap between camera modes.
    targetPosition.current.copy(camera.position);
    targetQuaternion.current.copy(camera.quaternion);
    if (arrivalIdRef.current !== active.id) {
      arrivalIdRef.current = active.id;
      const pose = state.playerPose?.position || { x: 0, y: 0, z: 0 };
      const px = pose.x || 0;
      const py = pose.y || 0;
      const pz = pose.z || 0;
      direction.current.set(targetPosition.current.x - px, 0, targetPosition.current.z - pz);
      if (direction.current.lengthSq() < 0.01) direction.current.set(0, 0, 1);
      direction.current.normalize();
      arrivalPositionRef.current.set(px, Math.max(py + 20, targetPosition.current.y + 9), pz)
        .addScaledVector(direction.current, 12);
      const previousPosition = camera.position.clone();
      camera.position.copy(arrivalPositionRef.current);
      lookTarget.current.set(px, py + 1.1, pz);
      camera.lookAt(lookTarget.current);
      arrivalQuaternionRef.current.copy(camera.quaternion);
      camera.position.copy(previousPosition);
    }
    const arrivalStartedAt = active.arrivingAt || active.readyAt || active.phaseStartedAt || Date.now();
    const elapsed = Math.max(0, Date.now() - arrivalStartedAt);
    const t = MathUtils.smoothstep(Math.min(1, elapsed / 1050), 0, 1);
    camera.position.copy(arrivalPositionRef.current).lerp(targetPosition.current, t);
    camera.quaternion.copy(arrivalQuaternionRef.current).slerp(targetQuaternion.current, t);
  });

  return null;
}

function waterResourceDescriptor(zoneId, quality) {
  const openOceanOnly = Boolean(getInteriorDefinition(zoneId));
  const detailedSurface = regionTypeRendersDetailedWater(getRegionMap(zoneId).type);
  return {
    skip: !openOceanOnly && !detailedSurface,
    bakeRes: waterBakeResolutionForQuality(quality),
    options: {
      contactRes: waterContactResolutionForQuality(quality),
      openOceanOnly,
    },
  };
}

function DestinationIntentPrefetch({ segmentCap, waterQuality }) {
  const edgeDestinationId = useThreeGameStore(state => state.edgePrompt?.toRegionId || null);
  const transitionDestinationId = useThreeGameStore(state => state.transition?.zoneId || null);
  const destinationId = transitionDestinationId || edgeDestinationId;
  useEffect(() => {
    setEcologyAssetPrefetchPaused(Boolean(transitionDestinationId));
    return () => setEcologyAssetPrefetchPaused(false);
  }, [transitionDestinationId]);
  useEffect(() => {
    if (!destinationId) return;
    prefetchIslandMapImage();
    prefetchRegionTerrainTextures(destinationId);
    const waterResource = waterResourceDescriptor(destinationId, waterQuality);
    if (!waterResource.skip) {
      prepareWaterTextureResource(destinationId, waterResource.bakeRes, waterResource.options);
    }
    prepareTerrainResource(destinationId, segmentCap);
    prepareBorderVistaResource(destinationId);
    prepareRegionEcologyResource(destinationId).then(resource => {
      const destination = resource.definitions.find(definition => definition.zoneId === destinationId);
      prefetchEcologyAssets(destination?.ecology);
    });
  }, [destinationId, segmentCap, waterQuality]);
  return null;
}

function describeWebGLRenderer(renderer) {
  const context = renderer.getContext();
  const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
  const vendor = debugInfo
    ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    : context.getParameter(context.VENDOR);
  const name = debugInfo
    ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : context.getParameter(context.RENDERER);
  const software = /swiftshader|llvmpipe|software rasterizer/i.test(`${vendor} ${name}`);
  return {
    vendor: vendor || null,
    name: name || null,
    webgl2: renderer.capabilities.isWebGL2,
    software,
  };
}

function OpeningIntroCompletion({
  active,
  sequenceId,
  durationMs,
  onComplete,
}) {
  const state = useRef({
    sequenceId: null,
    startedAt: 0,
    completed: false,
  });

  useFrame(() => {
    if (!active) {
      state.current.sequenceId = null;
      state.current.startedAt = 0;
      state.current.completed = false;
      return;
    }

    const now = performance.now();
    if (state.current.sequenceId !== sequenceId) {
      state.current.sequenceId = sequenceId;
      state.current.startedAt = now;
      state.current.completed = false;
    }

    if (state.current.completed) return;
    if (now - state.current.startedAt >= durationMs) {
      state.current.completed = true;
      onComplete();
    }
  });

  return null;
}

// Selective bloom so the sun (and bright speculars) genuinely radiate. A high
// luminance threshold keeps the sky/terrain crisp and only blooms near-white
// highlights, which is why the sun core is pushed white-hot in SkyController.
// N8AO grounds rocks/characters with contact shading; runs half-res to stay
// cheap and can be disabled independently of the rest of the stack.
function ExaminationDepthOfField() {
  const session = useThreeGameStore(state => state.examineSession);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const effectRef = useRef(null);
  const target = useMemo(() => new Vector3(), []);
  const active = examinationDepthOfFieldActive(session);
  const authoredHint = session?.frameHint || { height: 0.8, radius: 0.6 };
  const initialFocusRange = MathUtils.clamp((authoredHint.radius || 0.6) * 0.65, 0.08, 1.05);

  const setFocusTarget = (focus, hint) => {
    const groundY = terrainHeight(focus.x, focus.z, currentZoneId);
    const focusY = Math.max(
      Number.isFinite(focus.y) ? focus.y : groundY,
      Number.isFinite(groundY) ? groundY + 0.04 : focus.y,
    );
    const centerOffset = Number.isFinite(hint.centerY)
      ? hint.centerY
      : hint.closeup
        ? Math.max(0.015, hint.height * 0.5)
        : Math.max(0.12, hint.height * 0.52);
    target.set(focus.x, focusY + centerOffset, focus.z);
  };

  if (active) {
    setFocusTarget(session.focus, resolveSpecimenFrameHint(authoredHint, null));
  }

  useFrame(() => {
    if (!active) return;
    const liveFocus = getSpecimenRuntimePoses(currentZoneId)?.get(session.actorId);
    const focus = liveFocus || session.focus;
    if (!focus) return;
    const renderedBounds = getSpecimenRuntimeBounds(currentZoneId)?.get(session.actorId);
    const hint = resolveSpecimenFrameHint(authoredHint, renderedBounds);
    setFocusTarget(focus, hint);
    effectRef.current?.target?.copy(target);
    if (effectRef.current?.cocMaterial) {
      const subjectRadius = renderedBounds?.radius || hint.radius || 0.6;
      effectRef.current.cocMaterial.focusRange = MathUtils.clamp(subjectRadius * 0.58, 0.08, 1.05);
    }
  });

  if (!active) return null;
  return (
    <DepthOfField
      ref={effectRef}
      target={target}
      focusRange={initialFocusRange}
      bokehScale={3.8}
      resolutionScale={0.5}
    />
  );
}

// @react-three/postprocessing 3.x only re-runs its composer.setSize effect on
// CSS-size changes; AdaptiveResolution's setDpr changes the drawing-buffer
// size without it, so half-res passes (N8AO) keep stale depth targets and the
// AO term drifts off the geometry (ghost silhouettes beside the player).
// Re-issue setSize whenever the effective DPR changes — postprocessing reads
// the live drawing-buffer size inside setSize, so this re-syncs every pass.
function ComposerDprSync() {
  const { composer } = React.useContext(EffectComposerContext);
  const size = useThree(state => state.size);
  const dpr = useThree(state => state.viewport.dpr);
  useEffect(() => {
    composer?.setSize(size.width, size.height);
  }, [composer, size, dpr]);
  return null;
}

function PostFX({ enabled, ao, multisampling = 2, underwaterAmount = 0 }) {
  const examineSession = useThreeGameStore(state => state.examineSession);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const expeditionDay = useThreeGameStore(state => state.day);
  const weather = useThreeGameStore(state => state.weather);
  const interiorDefinition = getInteriorDefinition(currentZoneId);
  const interiorFx = interiorDefinition?.lighting?.postprocessing;
  const visionProfile = getPlayableMode(playableModeId).vision || null;
  // The grade effects are instantiated directly, NOT via the
  // @react-three/postprocessing wrappers: those wrappers JSON.stringify their
  // props as a memo key, so anything non-serializable (a ref prop — React 19
  // forwards refs as plain props — holding the effect with its circular r3f
  // instance graph) crashes the render. Direct instances also let the frame
  // loop below write to them without refs.
  const gradeFx = useMemo(() => ({
    hueSat: new HueSaturationEffect({ saturation: 0.08 }),
    contrast: new BrightnessContrastEffect({ contrast: 0.05 }),
    vignette: new VignetteEffect({ eskil: false, offset: 0.26, darkness: 0.42 }),
  }), []);
  useEffect(() => () => {
    gradeFx.hueSat.dispose();
    gradeFx.contrast.dispose();
    gradeFx.vignette.dispose();
  }, [gradeFx]);
  const gradeRef = useRef(null);
  // Live grade: drives the effects with time-of-day/weather every frame (see
  // colorGrade.js). Damped so a time jump (sleeping, debug skips) glides
  // instead of popping.
  useFrame((_, delta) => {
    const store = useThreeGameStore.getState();
    const time = ((store.timeOfDay % 24) + 24) % 24;
    const s = skyState(time, store.day || 1);
    const target = computeColorGrade({
      daylight: s.daylight,
      golden: s.golden,
      night: s.night,
      overcast: weatherEnv.overcast,
      mist: weatherEnv.mistAmount,
      underwaterAmount: store.underwaterCamera?.amount || 0,
    });
    const grade = gradeRef.current || (gradeRef.current = { ...target });
    grade.saturation = MathUtils.damp(grade.saturation, target.saturation, 2.5, delta);
    grade.contrast = MathUtils.damp(grade.contrast, target.contrast, 2.5, delta);
    grade.vignetteDarkness = MathUtils.damp(grade.vignetteDarkness, target.vignetteDarkness, 2.5, delta);
    gradeFx.hueSat.saturation = grade.saturation;
    gradeFx.contrast.contrast = grade.contrast;
    gradeFx.vignette.darkness = grade.vignetteDarkness;
  });
  if (!postprocessingComposerActive(enabled, examineSession)) return null;
  const underwater = Math.min(1, Math.max(0, underwaterAmount));
  // The examination focus treatment is part of the field-work interface, not
  // the general scene-effects preset. When general Post FX is disabled, mount
  // the lightest possible composer containing only depth of field.
  const composerMultisampling = enabled ? (interiorFx?.multisampling ?? multisampling) : 0;
  const interiorDaylight = interiorFx ? skyState(timeOfDay, expeditionDay || 1).daylight : 1;
  const interiorWeatherProfile = interiorFx ? weatherProfile(weather) : null;
  const interiorCloudBloom = interiorFx
    ? MathUtils.clamp(
      (interiorWeatherProfile?.overcast ?? 0)
      + (interiorWeatherProfile?.mist ?? 0) * 0.18,
      0,
      1,
    )
    : 0;
  const interiorDayBloomIntensity = interiorFx
    ? MathUtils.lerp(
      interiorFx.bloomDayIntensity ?? 0.62,
      interiorFx.bloomOvercastDayIntensity ?? interiorFx.bloomDayIntensity ?? 0.62,
      interiorCloudBloom,
    )
    : 0.52;
  const interiorDayBloomThreshold = interiorFx
    ? MathUtils.lerp(
      interiorFx.bloomDayThreshold ?? 0.58,
      interiorFx.bloomOvercastDayThreshold ?? interiorFx.bloomDayThreshold ?? 0.58,
      interiorCloudBloom,
    )
    : 0.76;
  const bloomIntensity = interiorFx
    ? MathUtils.lerp(
      interiorFx.bloomNightIntensity ?? 0.62,
      interiorDayBloomIntensity,
      interiorDaylight,
    )
    : 0.52;
  const bloomThreshold = interiorFx
    ? MathUtils.lerp(
      interiorFx.bloomNightThreshold ?? 0.58,
      interiorDayBloomThreshold,
      interiorDaylight,
    )
    : 0.76;
  return (
    // SMAA cleans polygon edges, but vegetation shimmer needs actual sample
    // coverage before post-processing. Keep this configurable in the perf UI.
    <EffectComposer multisampling={composerMultisampling}>
      <ComposerDprSync />
      {enabled && <SMAA preset={SMAA_PRESET_ULTRA} />}
      {enabled && ao && (
        <N8AO
          halfRes={!interiorFx?.aoFullResolution}
          depthAwareUpsampling
          aoRadius={interiorFx?.aoRadius ?? 1.6}
          distanceFalloff={interiorFx?.aoDistanceFalloff ?? 1.2}
          intensity={interiorFx?.aoIntensity ?? 2.4}
          aoSamples={4}
          denoiseSamples={4}
          denoiseRadius={interiorFx?.aoDenoiseRadius ?? 12}
        />
      )}
      {enabled && <HeatHazePostEffect enabled={!interiorDefinition} underwaterAmount={underwater} />}
      {enabled && <UnderwaterPostEffect amount={underwater} clarity={34 - underwater * 8} />}
      <ExaminationDepthOfField />
      {/* Threshold sits just under the ACES shoulder so deliberate HDR
          customers — sun core, lantern flame, water glints pushed past 1.0,
          moon glitter, ground/mote sparkles — glow softly, while sky/sand/
          foliage stay crisp. */}
      {enabled && (
        <Bloom
          intensity={bloomIntensity * (1 - underwater * 0.58)}
          luminanceThreshold={bloomThreshold}
          luminanceSmoothing={interiorFx?.bloomSmoothing ?? 0.18}
          mipmapBlur
          radius={interiorFx?.bloomRadius ?? 0.4}
        />
      )}
      {/* Gentle grade: ACES leaves the midtones a touch flat — a small
          saturation/contrast lift makes the turquoise and sand read without
          touching any material. Merges into the existing effect pass. */}
      {enabled && <primitive object={gradeFx.hueSat} />}
      {enabled && <primitive object={gradeFx.contrast} />}
      {enabled && visionProfile?.effect && (
        <AnimalVisionPostEffect
          profile={visionProfile}
          suppression={underwater * 0.85}
        />
      )}
      {/* Some animal profiles perceive bright ecological signals as a soft
          field around the source. This second bloom intentionally runs after
          the spectral transform; the ordinary world bloom above remains
          unchanged for Darwin and finch. */}
      {enabled && visionProfile?.perceptualBloom && (
        <Bloom
          intensity={visionProfile.perceptualBloom.intensity ?? 0.6}
          luminanceThreshold={visionProfile.perceptualBloom.threshold ?? 0.5}
          luminanceSmoothing={visionProfile.perceptualBloom.smoothing ?? 0.5}
          mipmapBlur
          radius={visionProfile.perceptualBloom.radius ?? 0.7}
        />
      )}
      {enabled && <primitive object={gradeFx.vignette} />}
    </EffectComposer>
  );
}

function UnderwaterCameraTracker({ onChange }) {
  const camera = useThree(state => state.camera);
  const setUnderwaterCamera = useThreeGameStore(state => state.setUnderwaterCamera);
  const lastAmount = useRef(-1);

  useFrame(() => {
    const belowSurface = WATER_LEVEL - camera.position.y;
    const raw = Math.min(1, Math.max(0, (belowSurface + 0.03) / 0.95));
    const amount = raw * raw * (3 - raw * 2);
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

function OpeningBlackFade({ active, sequenceId }) {
  if (!active) return null;
  const revealing = Boolean(sequenceId);
  return (
    <div
      key={revealing ? sequenceId : 'opening-black-hold'}
      className={`opening-black-fade${revealing ? ' opening-black-fade-reveal' : ''}`}
      aria-hidden="true"
    />
  );
}

function OpeningCinematicVeil({ active, sequenceId, durationMs }) {
  if (!active || !sequenceId) return null;
  return (
    <div
      key={sequenceId}
      className="opening-cinematic-veil"
      style={{ '--opening-cinematic-duration': `${durationMs}ms` }}
      aria-hidden="true"
    />
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
  const screenStrength = Math.min(1, strength * (0.92 + directness * 0.48));
  const lemon = Math.round(228 + warmth * 18);
  const heat = Math.round(146 + warmth * 42);
  const coreAlpha = 0.052 * screenStrength + 0.068 * screenStrength * directness;
  const washAlpha = screenStrength * (0.04 + directness * 0.05);
  const streakAlpha = screenStrength * (0.16 + directness * 0.22);
  const veilAlpha = screenStrength * (0.03 + directness * 0.038);
  const horizonHold = screenStrength * (0.045 + directness * 0.04);
  const transition = 'opacity 140ms linear';
  const axisX = 50 - x;
  const axisY = 50 - y;
  const axisLength = Math.hypot(axisX, axisY);
  const lensAxisX = axisLength > 4 ? axisX / axisLength : -0.78;
  const lensAxisY = axisLength > 4 ? axisY / axisLength : 0.34;
  const offAxis = Math.min(1, axisLength / 58);
  const lensAlpha = screenStrength * (0.2 + directness * 0.18 + offAxis * 0.14);
  const clampPct = value => Math.max(-18, Math.min(118, value));
  const lensGhosts = [
    { d: 18, size: 4.6, alpha: 0.16, tint: '255,226,150', ring: true },
    { d: 33, size: 8.8, alpha: 0.19, tint: '255,214,124', ring: true },
    { d: 51, size: 3.8, alpha: 0.16, tint: '172,220,255', ring: false },
    { d: 68, size: 12.5, alpha: 0.18, tint: '255,172,116', ring: true },
    { d: 86, size: 5.8, alpha: 0.12, tint: '210,244,255', ring: false },
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
          : `radial-gradient(circle, rgba(255,255,246,0.34) 0%, rgba(${ghost.tint},0.2) 20%, rgba(${ghost.tint},0.08) 42%, transparent 70%)`;
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
  // Sliders mutate the shared solar tuning directly (SkyController reads it
  // every frame); local state only re-renders the panel.
  const [, setRevision] = useState(0);
  const setLook = patch => {
    Object.assign(solarLookTuning, patch);
    setRevision(value => value + 1);
  };
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
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <Toggle label="Sun Screen Wash" checked={settings.solarScreenGlare !== false} onChange={value => set({ solarScreenGlare: value })} />
        <Toggle label="DOM Lens Ghosts" checked={settings.solarLensGhosts !== false} onChange={value => set({ solarLensGhosts: value })} />
        <Toggle label="Sun Halo/Veil" checked={settings.solarSunHalo !== false} onChange={value => set({ solarSunHalo: value })} />
        <Toggle label="Scene Sun Flares" checked={settings.solarSceneFlares !== false} onChange={value => set({ solarSceneFlares: value })} />
        <Toggle label="Sun Fog/Exposure" checked={settings.solarSunFacingGrade !== false} onChange={value => set({ solarSunFacingGrade: value })} />
      </div>
      {/* These affect sun-on-screen optics; face the sun to judge them. */}
      <div className="grid grid-cols-1 gap-1.5">
        <DevSlider label="Golden hour" value={solarLookTuning.goldenBoost} min={0} max={1.8} step={0.05} format={v => `${v.toFixed(2)}x`} onChange={value => setLook({ goldenBoost: value })} />
        <DevSlider label="Sun optics" value={solarLookTuning.opticsIntensity} min={0} max={2.5} step={0.05} format={v => `${v.toFixed(2)}x`} onChange={value => setLook({ opticsIntensity: value })} />
        <DevSlider label="Screen glare" value={solarLookTuning.glareIntensity} min={0} max={2.5} step={0.05} format={v => `${v.toFixed(2)}x`} onChange={value => setLook({ glareIntensity: value })} />
        <DevSlider label="Exposure" value={solarLookTuning.exposureScale} min={0.7} max={1.3} step={0.01} format={v => `${v.toFixed(2)}x`} onChange={value => setLook({ exposureScale: value })} />
      </div>
    </div>
  );
}

function DevSlider({ label, value, min, max, step, format, onChange }) {
  return (
    <label className="block rounded border border-white/10 bg-black/15 px-2 py-1.5 text-xs">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="font-mono text-amber-100/80">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="mt-1 w-full accent-amber-200"
      />
    </label>
  );
}

function CloudShadeDiagnostics() {
  // Sliders mutate the shared tuning object directly (the sky drive reads it
  // every frame); local state only exists to re-render the panel.
  const [, setRevision] = useState(0);
  const [applied, setApplied] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setApplied(fogAtmosphereUniforms.uCloudShade.value.x), 400);
    return () => clearInterval(id);
  }, []);
  const set = patch => {
    Object.assign(cloudShadeTuning, patch);
    setRevision(value => value + 1);
  };
  return (
    <div className="mb-3 rounded border border-amber-100/15 bg-black/15 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-100/75">Cloud Shadows</h3>
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${applied > 0.005 ? 'bg-amber-200/20 text-amber-100' : 'bg-white/10 text-amber-100/60'}`}>
          {applied > 0.005 ? `applied ${applied.toFixed(2)}` : 'quiet'}
        </span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <Metric label="Cumulus" value={weatherEnv.cumulus.toFixed(2)} />
        <Metric label="Overcast" value={weatherEnv.overcast.toFixed(2)} />
        <Metric label="Mist" value={weatherEnv.mistAmount.toFixed(2)} />
      </div>
      <div className="mb-1.5">
        <Toggle
          label="Force visible (ignore weather)"
          checked={cloudShadeTuning.forceOn}
          onChange={value => set({ forceOn: value })}
        />
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        <DevSlider label="Strength" value={cloudShadeTuning.maxStrength} min={0} max={0.6} step={0.01} format={v => v.toFixed(2)} onChange={value => set({ maxStrength: value })} />
        <DevSlider label="Feature size" value={cloudShadeTuning.featureMeters} min={24} max={220} step={2} format={v => `${v}m`} onChange={value => set({ featureMeters: value })} />
        <DevSlider label="Coverage bias" value={cloudShadeTuning.coverageBias} min={-0.2} max={0.3} step={0.01} format={v => v.toFixed(2)} onChange={value => set({ coverageBias: value })} />
        <DevSlider label="Edge softness" value={cloudShadeTuning.softness} min={0.04} max={0.4} step={0.01} format={v => v.toFixed(2)} onChange={value => set({ softness: value })} />
        <DevSlider label="Drift speed" value={cloudShadeTuning.driftMps} min={0} max={30} step={0.5} format={v => `${v} m/s`} onChange={value => set({ driftMps: value })} />
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
        {['mobile', 'performance', 'cinematic'].map(mode => (
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
        {WATER_QUALITY_MODES.map(mode => (
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
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="text-amber-100/70">Shadows</span>
        {SHADOW_QUALITY_MODES.map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => set({ shadowQuality: mode })}
            className={`rounded border px-2 py-1 ${normalizeShadowQuality(settings.shadowQuality) === mode ? 'border-amber-200 bg-amber-200 text-stone-950' : 'border-white/10 bg-black/15 hover:bg-white/10'}`}
          >
            {mode === 'ultra' ? 'very high' : mode}
          </button>
        ))}
      </div>
      <SolarDiagnostics settings={settings} set={set} />
      <CloudShadeDiagnostics />
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

export default function ThreeDarwinGame({ initialModeId = null, multiplayerSession = null }) {
  const [keyboardMap] = useState(() => {
    if (typeof window === 'undefined') return KEYBOARD_MAP;
    const requestedHud = new URLSearchParams(window.location.search).get('hud');
    const legacyHud = requestedHud === 'legacy'
      || (requestedHud !== 'polished' && process.env.NEXT_PUBLIC_THREE_HUD_LAYOUT === 'legacy');
    return legacyHud ? LEGACY_KEYBOARD_MAP : KEYBOARD_MAP;
  });
  const [launchState, setLaunchState] = useState(initialModeId ? 'loading' : 'menu');
  const [initialModeReady, setInitialModeReady] = useState(!initialModeId);
  const [sceneReady, setSceneReady] = useState(false);
  const [loadersStable, setLoadersStable] = useState(false);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const [startupContentPhase, setStartupContentPhase] = useState(0);
  const [transitionContentPhase, setTransitionContentPhase] = useState(STARTUP_FULL_CONTENT_PHASE);
  const [openingIntroStartedAt, setOpeningIntroStartedAt] = useState(0);
  const [playerAnimationBanksReady, setPlayerAnimationBanksReady] = useState(false);
  const [playerVisualReady, setPlayerVisualReady] = useState(false);
  const [launchOverlayDismissed, setLaunchOverlayDismissed] = useState(false);
  const [showPerf, setShowPerf] = useState(false);
  const [showAssetBrowser, setShowAssetBrowser] = useState(false);
  const [showAnimalAnimationLab, setShowAnimalAnimationLab] = useState(false);
  const [showDarwinAnimationLab, setShowDarwinAnimationLab] = useState(false);
  const [showMapGeographyDev, setShowMapGeographyDev] = useState(false);
  const [showAudioDebug, setShowAudioDebug] = useState(false);
  const [perfProbe, setPerfProbe] = useState(false);
  const [costProbe, setCostProbe] = useState(false);
  const [e2eMode, setE2EMode] = useState(false);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [skipOpeningIntro, setSkipOpeningIntro] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [perfSettings, setPerfSettings] = useState(getInitialPerfSettings);
  const [metrics, setMetrics] = useState({});
  const [underwaterAmount, setUnderwaterAmount] = useState(0);
  const [rendererInfo, setRendererInfo] = useState(null);
  const closeAudioDebug = useCallback(() => setShowAudioDebug(false), []);
  // Loading progress only drives the launch overlay. Once the initial scene is
  // ready, keep this subscriber's snapshot stable so render-time texture starts
  // in newly mounted regions cannot schedule a parent React update.
  const assetProgress = useProgress(state => (
    sceneReady ? SETTLED_ASSET_PROGRESS : state
  ));
  const bootStartedAt = useRef(0);
  const loaderQuietSince = useRef(0);
  const initialModeAppliedRef = useRef(false);
  const weather = useThreeGameStore(state => state.weather);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const physicsDebug = useThreeGameStore(state => state.physicsDebug);
  const transition = useThreeGameStore(state => state.transition);
  const gameStarted = initialModeReady && !LAUNCH_MENU_STATES.has(launchState);
  const automationReadyMode = e2eMode || screenshotMode;
  const openingIntroActive = launchState === 'intro';
  // Terrain, DPR, postprocessing, and water targets stay on their final
  // configuration from the first covered frame. Swapping these after reveal
  // can suspend the root scene and expose the canvas clear color.
  const openingIntroEligible = getPlayableMode(playableModeId).kind === 'human' && !skipOpeningIntro;
  // Aerial framing exposes much more water and terrain than ordinary play.
  // Keep the fly-in at native DPR and skip its otherwise scene-doubling planar
  // reflection pass; normal quality returns once the camera is stationary.
  const openingRenderBudgetActive = openingIntroEligible && launchState !== 'playing';
  const scenePerfSettings = useMemo(
    () => openingRenderBudgetActive
      ? { ...perfSettings, reflections: false }
      : perfSettings,
    [openingRenderBudgetActive, perfSettings],
  );
  const configuredDpr = useMemo(() => dprForMode(perfSettings.dprMode), [perfSettings.dprMode]);
  const renderDpr = openingRenderBudgetActive ? OPENING_RENDER_DPR : configuredDpr;
  const sky = useMemo(() => weatherSkyTint(weather), [weather]);
  const showLaunchOverlay = LAUNCH_MENU_STATES.has(launchState)
    || !sceneReady
    || !launchOverlayDismissed;
  const runtimeAudioEnabled = audioEnabled && !e2eMode && !screenshotMode;
  const gameUiVisible = gameStarted && !showLaunchOverlay && !openingIntroActive;
  const transitionMountingDestination = Boolean(
    transition
    && transition.phase !== 'departing'
    && transition.phase !== 'chart'
  );
  const transitionCanvasPaused = Boolean(
    transition
    && (transition.phase === 'chart'
      || transition.phase === 'mounting')
  );
  const activeContentPhase = transitionMountingDestination
    ? transitionContentPhase
    : startupContentPhase;
  const loadingContentTarget = STARTUP_OPENING_CONTENT_PHASE;
  useEffect(() => {
    if (!DEV_TOOLS_ENABLED) return undefined;
    window.__threeLaunchDebug = {
      launchState,
      sceneReady,
      loadersStable,
      playerVisualReady,
      playerAnimationBanksReady,
      startupContentPhase,
      loadingContentTarget,
      displayedProgress,
      assets: {
        active: Boolean(assetProgress.active),
        progress: Number(assetProgress.progress || 0),
        loaded: Number(assetProgress.loaded || 0),
        total: Number(assetProgress.total || 0),
        item: assetProgress.item || null,
        errors: assetProgress.errors || [],
      },
    };
    return undefined;
  }, [
    assetProgress.active,
    assetProgress.errors,
    assetProgress.item,
    assetProgress.loaded,
    assetProgress.progress,
    assetProgress.total,
    displayedProgress,
    launchState,
    loadersStable,
    loadingContentTarget,
    playerAnimationBanksReady,
    playerVisualReady,
    sceneReady,
    startupContentPhase,
  ]);
  const openingCamera = useMemo(() => ({
    active: openingIntroActive && openingIntroStartedAt > 0,
    sequenceId: openingIntroStartedAt,
    duration: OPENING_DURATION_MS / 1000,
  }), [openingIntroActive, openingIntroStartedAt]);
  const handleUnderwaterChange = useCallback(amount => {
    setUnderwaterAmount(amount);
  }, []);
  const markPlayerAnimationBanksReady = useCallback(() => {
    setPlayerAnimationBanksReady(true);
  }, []);
  const markPlayerVisualReady = useCallback(() => {
    setPlayerVisualReady(true);
  }, []);
  useLayoutEffect(() => {
    if (!initialModeId || initialModeAppliedRef.current) return;
    initialModeAppliedRef.current = true;
    useThreeGameStore.getState().setPlayableMode(initialModeId);
    if (multiplayerSession) {
      useThreeGameStore.setState(state => ({
        currentZoneId: 'POST_OFFICE_BAY',
        playerSpawnId: null,
        ...(initialModeId === 'tortoise' ? {
          // The authored single-player tortoise begins far across the bay.
          // Multiplayer starts both roles within readable interaction range
          // while retaining the authored actor ID that all clients hide.
          playableSpawnPoint: { x: 4.5, y: 0, z: 7.5 },
          minimapPlayerPose: { x: 4.5, z: 7.5, heading: 180, zoneId: 'POST_OFFICE_BAY' },
        } : {
          playableSpawnPoint: { x: 0, y: 0, z: 7.5 },
          playableHiddenActorId: null,
          minimapPlayerPose: { x: 0, z: 7.5, heading: 0, zoneId: 'POST_OFFICE_BAY' },
        }),
      }));
    }
    bootStartedAt.current = performance.now();
    loaderQuietSince.current = 0;
    setInitialModeReady(true);
  }, [initialModeId, multiplayerSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const explicitlyMuted = params.get('audio') === '0' || params.has('muteAudio');
    let storedPreference = null;
    try {
      storedPreference = window.localStorage?.getItem(AUDIO_PREFERENCE_KEY);
    } catch {
      // Storage may be unavailable in a private context; audio still works for
      // this session and remains under the visible launch-menu control.
    }
    setAudioEnabled(!explicitlyMuted && storedPreference !== 'off');
  }, []);

  // Mirror the material-quality knobs into the store so the scene's
  // material-building components (terrain, flora, trees) can react to them
  // without prop-threading through every layer.
  useEffect(() => {
    useThreeGameStore.getState().setGraphicsQuality({
      cheapMaterials: scenePerfSettings.cheapMaterials !== false,
      foliageDrawScale: scenePerfSettings.foliageDrawScale ?? 1,
    });
  }, [scenePerfSettings.cheapMaterials, scenePerfSettings.foliageDrawScale]);

  useEffect(() => {
    if (!transition?.id) {
      setTransitionContentPhase(STARTUP_FULL_CONTENT_PHASE);
      return;
    }
    // Reset during the departure/chart phase so the destination's first render
    // can never accidentally inherit phase 6 from the previous region.
    setTransitionContentPhase(1);
  }, [transition?.id]);

  useEffect(() => {
    if (!transition?.id || !transition.committedAt) return undefined;
    let cancelled = false;
    let timeoutHandle = null;
    let idleHandle = null;
    let frameHandle = null;

    const schedulePhase = index => {
      if (cancelled || index >= TRANSITION_MOUNT_STEPS.length) return;
      const phase = TRANSITION_MOUNT_STEPS[index];
      const delay = 0;
      timeoutHandle = window.setTimeout(() => {
        timeoutHandle = null;
        const commitPhase = () => {
          idleHandle = null;
          if (cancelled) return;
          setTransitionContentPhase(current => Math.max(current, phase));
          frameHandle = window.requestAnimationFrame(() => {
            frameHandle = window.requestAnimationFrame(() => {
              frameHandle = null;
              schedulePhase(index + 1);
            });
          });
        };
        if (typeof window.requestIdleCallback === 'function') {
          idleHandle = window.requestIdleCallback(commitPhase, { timeout: 180 });
        } else {
          commitPhase();
        }
      }, delay);
    };

    schedulePhase(0);
    return () => {
      cancelled = true;
      if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
      if (idleHandle != null) window.cancelIdleCallback?.(idleHandle);
      if (frameHandle != null) window.cancelAnimationFrame(frameHandle);
    };
  }, [transition?.committedAt, transition?.id]);

  // Cutout foliage may only use alpha-to-coverage when real MSAA samples back
  // the buffer it draws into: the composer target when postprocessing is on,
  // the canvas context (antialias: true) when it's off. Applies to materials
  // stabilized after this runs — which is all of them, since GLBs stream in
  // once the Canvas mounts.
  useEffect(() => {
    setCoverageAASupport(
      scenePerfSettings.postprocessing
        ? (scenePerfSettings.msaaSamples ?? 0) > 0
        : scenePerfSettings.contextAntialias !== false,
    );
  }, [scenePerfSettings.contextAntialias, scenePerfSettings.postprocessing, scenePerfSettings.msaaSamples]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextE2EMode = e2eModeFromParams(params);
    const nextScreenshotMode = screenshotModeFromParams(params);
    setE2EMode(nextE2EMode);
    setScreenshotMode(nextScreenshotMode);
    setSkipOpeningIntro(skipOpeningIntroFromParams(params));
    if (DEV_TOOLS_ENABLED && params.has('mapDev')) {
      setShowMapGeographyDev(true);
    }
    if (DEV_TOOLS_ENABLED && params.has('assetBrowser')) {
      setShowAssetBrowser(true);
    }
    if (DEV_TOOLS_ENABLED && params.has('animalAnimationLab')) {
      setShowAnimalAnimationLab(true);
    }
    if (DEV_TOOLS_ENABLED && params.has('ecologyDebug')) {
      const requestedSpecies = params.get('ecologyDebug');
      if (requestedSpecies && requestedSpecies !== '1') setEcologyDebugSpecies(requestedSpecies);
      setEcologyDebugEnabled(true);
    }
    setPerfSettings(settingsFromUrlSearch(window.location.search, recommendedQualityFromDevice()));
    setPerfProbe(DEV_TOOLS_ENABLED && (params.has('perfProbe') || params.has('costProbe')));
    setCostProbe(DEV_TOOLS_ENABLED && params.has('costProbe'));
    const zoneParam = params.get('zone');
    if (zoneParam) {
      const store = useThreeGameStore.getState();
      store.beginZoneTransition(zoneParam, {});
      if (nextScreenshotMode || nextE2EMode) useThreeGameStore.getState().completeZoneTransition();
    }
    if ((nextScreenshotMode || nextE2EMode) && params.has('time')) {
      const requestedTime = Number(params.get('time'));
      if (Number.isFinite(requestedTime)) useThreeGameStore.getState().setTimeOfDay(requestedTime);
    }
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
      if (event.code === 'Digit0' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (!event.repeat) setShowAudioDebug(value => !value);
        return;
      }
      if (event.code === 'Digit0' && DEV_TOOLS_ENABLED) {
        event.preventDefault();
        setShowAssetBrowser(value => !value);
        return;
      }
      if (event.code === 'Digit6' && DEV_TOOLS_ENABLED) {
        event.preventDefault();
        setShowMapGeographyDev(value => !value);
        return;
      }
      if (event.code === 'Digit7' && DEV_TOOLS_ENABLED) {
        event.preventDefault();
        setShowAnimalAnimationLab(value => !value);
        return;
      }
      if (event.code === 'Digit8' && DEV_TOOLS_ENABLED) {
        event.preventDefault();
        setShowDarwinAnimationLab(value => !value);
        return;
      }
      if (
        event.code === 'Digit9'
        && DEV_TOOLS_ENABLED
        && !event.shiftKey
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
      ) {
        event.preventDefault();
        toggleEcologyDebug();
        return;
      }
      if (event.code !== 'Backquote' || !DEV_TOOLS_ENABLED) return;
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
      const knownAssetTotal = Number(assetProgress.total || 0);
      const loaderBusy = assetProgress.active || (knownAssetTotal > 0 && rawProgress < 100);

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
  }, [assetProgress.active, assetProgress.progress, assetProgress.total, gameStarted, sceneReady]);

  const openCharacterSelect = () => {
    setLaunchState('character');
  };

  const beginNewExpedition = (modeId = 'darwin', { reset = false } = {}) => {
    if (runtimeAudioEnabled) {
      void activatePostOfficeBayAudio({ preloadEffects: false });
    }
    if (reset) useThreeGameStore.getState().resetExpedition();
    useThreeGameStore.getState().setPlayableMode(modeId);
    bootStartedAt.current = performance.now();
    loaderQuietSince.current = 0;
    setDisplayedProgress(0);
    setLoadersStable(false);
    setSceneReady(false);
    setStartupContentPhase(0);
    setOpeningIntroStartedAt(0);
    setPlayerAnimationBanksReady(false);
    // A restart keeps the already-committed Darwin instance mounted; a fresh
    // launch must wait for its first real model-scene commit.
    if (!gameStarted) setPlayerVisualReady(false);
    setLaunchOverlayDismissed(false);
    setLaunchState('loading');
  };

  const handleAudioEnabledChange = enabled => {
    const next = Boolean(enabled);
    setAudioEnabled(next);
    try {
      window.localStorage?.setItem(AUDIO_PREFERENCE_KEY, next ? 'on' : 'off');
    } catch {
      // A blocked preference store should not block the audio control itself.
    }
    if (next && !e2eMode && !screenshotMode) {
      void activatePostOfficeBayAudio({ preloadEffects: false });
    }
  };

  const restartExpedition = () => {
    beginNewExpedition('darwin', { reset: true });
  };

  const returnToMainMenu = () => {
    useThreeGameStore.getState().resetExpedition();
    loaderQuietSince.current = 0;
    setDisplayedProgress(0);
    setLoadersStable(false);
    setSceneReady(false);
    setStartupContentPhase(0);
    setOpeningIntroStartedAt(0);
    setPlayerAnimationBanksReady(false);
    setPlayerVisualReady(false);
    setLaunchOverlayDismissed(false);
    setLaunchState('menu');
  };

  const markSceneReady = useCallback(() => {
    const mode = getPlayableMode(useThreeGameStore.getState().playableModeId);
    const params = new URLSearchParams(window.location.search);
    const skipIntro = skipOpeningIntro || skipOpeningIntroFromParams(params);
    setSceneReady(true);
    setDisplayedProgress(100);
    if (mode.kind === 'animal' || skipIntro) {
      setOpeningIntroStartedAt(0);
      setLaunchState('playing');
    } else {
      // The sequence begins only after the launch overlay is gone. Starting it
      // beneath that fade would discard part of the composed camera shot.
      setOpeningIntroStartedAt(0);
      setLaunchState('intro');
    }
  }, [skipOpeningIntro]);

  useEffect(() => {
    if (!automationReadyMode || !gameStarted || sceneReady) return undefined;
    const handle = window.setInterval(() => {
      const startedAt = bootStartedAt.current || performance.now();
      const minimumWait = e2eMode
        ? 20000
        : screenshotMode
          ? SCREENSHOT_MIN_LOADING_MS
          : Math.max(BOOT_MIN_LOADING_MS, 2500);
      const waitedLongEnough = performance.now() - startedAt >= minimumWait;
      const stagedContentReady = startupContentPhase >= loadingContentTarget
        && (playableModeId !== 'darwin' || playerVisualReady)
        && (playableModeId !== 'darwin' || playerAnimationBanksReady);
      if (waitedLongEnough && stagedContentReady && document.querySelector('canvas')) markSceneReady();
    }, 250);
    return () => window.clearInterval(handle);
  }, [
    automationReadyMode,
    e2eMode,
    gameStarted,
    loadingContentTarget,
    markSceneReady,
    playableModeId,
    playerAnimationBanksReady,
    playerVisualReady,
    sceneReady,
    screenshotMode,
    startupContentPhase,
  ]);

  useEffect(() => {
    if (!sceneReady || launchOverlayDismissed) return undefined;
    const handle = window.setTimeout(() => {
      if (openingIntroActive) setOpeningIntroStartedAt(performance.now());
      setLaunchOverlayDismissed(true);
    }, openingIntroActive ? LAUNCH_OVERLAY_FADE_MS : 500);
    return () => window.clearTimeout(handle);
  }, [launchOverlayDismissed, openingIntroActive, sceneReady]);

  useEffect(() => {
    if (!gameStarted || launchState !== 'loading') return undefined;

    // Mount exactly one content group per idle window while the loading overlay
    // is still opaque. This lets GLB parsing, texture uploads, Rapier setup, and
    // shader discovery settle before the curtain/camera sequence begins.
    let cancelled = false;
    let timeoutHandle = null;
    let idleHandle = null;
    let frameHandle = null;

    const schedulePhase = index => {
      if (cancelled || index >= loadingContentTarget) return;
      const previousDelay = index === 0 ? 0 : INTRO_LOADING_PHASE_TIMINGS_MS[index - 1];
      const delay = INTRO_LOADING_PHASE_TIMINGS_MS[index] - previousDelay;
      timeoutHandle = window.setTimeout(() => {
        timeoutHandle = null;
        const commitPhase = () => {
          idleHandle = null;
          if (cancelled) return;
          setStartupContentPhase(current => Math.max(current, index + 1));
          frameHandle = window.requestAnimationFrame(() => {
            frameHandle = window.requestAnimationFrame(() => {
              frameHandle = null;
              schedulePhase(index + 1);
            });
          });
        };
        if (typeof window.requestIdleCallback === 'function') {
          idleHandle = window.requestIdleCallback(commitPhase, { timeout: 420 });
        } else {
          commitPhase();
        }
      }, delay);
    };

    schedulePhase(0);
    return () => {
      cancelled = true;
      if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
      if (idleHandle != null) window.cancelIdleCallback?.(idleHandle);
      if (frameHandle != null) window.cancelAnimationFrame(frameHandle);
    };
  }, [gameStarted, launchState, loadingContentTarget]);

  useEffect(() => {
    if (!gameStarted || !launchOverlayDismissed) return undefined;
    if (loadingContentTarget >= STARTUP_FULL_CONTENT_PHASE) return undefined;
    if (launchState !== 'playing') return undefined;

    let cancelled = false;
    let timeoutHandle = null;
    let idleHandle = null;
    let frameHandle = null;

    const schedulePhase = index => {
      if (cancelled || index >= STARTUP_FULL_CONTENT_PHASE) return;
      const timingIndex = index - STARTUP_OPENING_CONTENT_PHASE;
      const previousDelay = timingIndex === 0 ? 0 : INTRO_REVEAL_PHASE_TIMINGS_MS[timingIndex - 1];
      const delay = INTRO_REVEAL_PHASE_TIMINGS_MS[timingIndex] - previousDelay;
      timeoutHandle = window.setTimeout(() => {
        timeoutHandle = null;
        const commitPhase = () => {
          idleHandle = null;
          if (cancelled) return;
          setStartupContentPhase(current => Math.max(current, index + 1));
          frameHandle = window.requestAnimationFrame(() => {
            frameHandle = window.requestAnimationFrame(() => {
              frameHandle = null;
              schedulePhase(index + 1);
            });
          });
        };
        if (typeof window.requestIdleCallback === 'function') {
          idleHandle = window.requestIdleCallback(commitPhase, { timeout: 420 });
        } else {
          commitPhase();
        }
      }, delay);
    };

    schedulePhase(STARTUP_OPENING_CONTENT_PHASE);
    return () => {
      cancelled = true;
      if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
      if (idleHandle != null) window.cancelIdleCallback?.(idleHandle);
      if (frameHandle != null) window.cancelAnimationFrame(frameHandle);
    };
  }, [gameStarted, launchOverlayDismissed, launchState, loadingContentTarget]);

  useEffect(() => {
    if (!runtimeAudioEnabled || launchState !== 'playing') return undefined;
    let cancelled = false;
    let idleHandle = null;
    let timeoutHandle = null;
    const beginPreload = () => {
      idleHandle = null;
      timeoutHandle = null;
      if (!cancelled) void preloadSoundscapeEffects();
    };
    // Give the camera handoff and first HUD paint a quiet window before
    // warming effect banks that are not needed for the opening ambience.
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(beginPreload, { timeout: 2200 });
    } else {
      timeoutHandle = window.setTimeout(beginPreload, 900);
    }
    return () => {
      cancelled = true;
      if (idleHandle != null) window.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
    };
  }, [launchState, runtimeAudioEnabled]);

  return (
    <MultiplayerProvider session={multiplayerSession}>
    <main className="three-game-shell fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-stone-950 text-amber-50">
      <TransitionPerformanceProbe
        enabled={DEV_TOOLS_ENABLED || perfProbe || e2eMode}
        transition={transition}
        contentPhase={activeContentPhase}
      />
      {gameStarted && (
        <DestinationIntentPrefetch
          segmentCap={scenePerfSettings.terrainSegmentCap}
          waterQuality={scenePerfSettings.waterQuality || 'polished'}
        />
      )}
      <KeyboardControls map={keyboardMap}>
        {gameStarted && (
          <IslandSoundscape
            // Bring the island in by ear as the painted splash begins to
            // dissolve. The ambient mixer already uses a slow gain ramp, so
            // this leads the first visible world frame without an audio pop.
            active={sceneReady}
            enabled={runtimeAudioEnabled}
          />
        )}
        {gameStarted && (
          /* Distant landform sectors flare beyond 400 m at their corners. A
             shorter far plane intersects them as the camera turns and changes
             the apparent mountain silhouette. */
          <Canvas
            className="absolute inset-0 h-full w-full"
            frameloop={transitionCanvasPaused ? 'never' : 'always'}
            shadows={scenePerfSettings.shadows}
            dpr={renderDpr}
            camera={{ position: [0, 2.6, 4.8], fov: 50, near: 0.1, far: 560 }}
            gl={{
              // With postprocessing on, the scene renders into the
              // EffectComposer's buffer, so a multisampled default framebuffer
              // is pure memory/resolve waste — composer `multisampling` (the
              // msaaSamples setting) is what provides real sample coverage.
              // Context AA only matters on the direct-to-canvas path (?noPost).
              antialias: scenePerfSettings.contextAntialias !== false && !scenePerfSettings.postprocessing,
              powerPreference: 'high-performance',
              preserveDrawingBuffer: scenePerfSettings.preserveDrawingBuffer,
              toneMapping: ACESFilmicToneMapping,
              outputColorSpace: SRGBColorSpace,
            }}
            onCreated={({ gl }) => {
              // Sharp ground/foliage textures at glancing angles, ~free on any
              // GPU this game targets. Set before the GLBs stream in so every
              // texture picks it up.
              Texture.DEFAULT_ANISOTROPY = Math.min(8, gl.capabilities.getMaxAnisotropy());
              gl.shadowMap.type = PCFSoftShadowMap;
              setRendererInfo(describeWebGLRenderer(gl));
            }}
          >
            <color attach="background" args={[sky]} />
            {/* Exponential-squared fog: the WeatherDirector drives density per
                frame (sunny haze through thick garúa); SkyController keeps
                owning its color. Density 0.012 ≈ the old linear 32..108 reach. */}
            <fogExp2 attach="fog" args={[sky, 0.012]} />
            <SceneEnvironment />
            <Suspense fallback={null}>
              <ThreeScene
                perfSettings={scenePerfSettings}
                contentPhase={activeContentPhase}
                openingCamera={openingCamera}
                inputLocked={openingIntroActive || Boolean(transition)}
                onPlayerAnimationBanksReady={markPlayerAnimationBanksReady}
                onPlayerVisualReady={markPlayerVisualReady}
              />
            </Suspense>
            <OpeningVisualReadySignal
              active={gameStarted && launchState === 'loading'}
              sequenceId={bootStartedAt.current || 'opening-load'}
              contentReady={loadersStable
                && startupContentPhase >= loadingContentTarget
                && (playableModeId !== 'darwin' || playerVisualReady)
                && (playableModeId !== 'darwin' || playerAnimationBanksReady)}
              segmentCap={scenePerfSettings.terrainSegmentCap}
              onReady={markSceneReady}
            />
            <ZoneTransitionReadySignal
              segmentCap={scenePerfSettings.terrainSegmentCap}
              contentPhase={activeContentPhase}
              transition={transition}
              waterQuality={scenePerfSettings.waterQuality || 'polished'}
            />
            <ThreeE2EFrameSignal enabled={automationReadyMode} />
            <TravelCameraRig />
            <PostFX
              enabled={scenePerfSettings.postprocessing}
              ao={scenePerfSettings.ao}
              multisampling={scenePerfSettings.msaaSamples ?? DEFAULT_PERF_SETTINGS.msaaSamples}
              underwaterAmount={underwaterAmount}
            />
            <AdaptiveResolution
              enabled={sceneReady && !openingIntroActive && startupContentPhase >= STARTUP_FULL_CONTENT_PHASE}
              maxDpr={configuredDpr[1]}
            />
            <OpeningIntroCompletion
              active={openingIntroActive}
              sequenceId={openingIntroStartedAt}
              durationMs={OPENING_DURATION_MS}
              onComplete={() => setLaunchState('playing')}
            />
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
            {DEV_TOOLS_ENABLED && showPerf && perfSettings.stats && <Stats />}
          </Canvas>
        )}
        {gameStarted && <CinematicScreenGrade enabled={scenePerfSettings.postprocessing} weather={weather} />}
        {gameStarted && (
          <SolarScreenGlare
            enabled={scenePerfSettings.solarScreenGlare !== false || scenePerfSettings.solarLensGhosts !== false}
            wash={scenePerfSettings.solarScreenGlare !== false}
            lensGhostsEnabled={scenePerfSettings.solarLensGhosts !== false}
            suppression={openingIntroActive ? 1 : underwaterAmount}
          />
        )}
        <OpeningBlackFade
          active={openingIntroActive}
          sequenceId={openingIntroStartedAt}
        />
        <OpeningCinematicVeil
          active={openingIntroActive}
          sequenceId={openingIntroStartedAt}
          durationMs={OPENING_DURATION_MS}
        />
        {gameStarted && <ZoneTransitionOverlay />}
        {gameUiVisible && (
          <ThreeHUD
            onTogglePerf={() => setShowPerf(value => !value)}
            onRestartExpedition={restartExpedition}
            onReturnToMainMenu={returnToMainMenu}
            audioEnabled={audioEnabled}
            onAudioEnabledChange={handleAudioEnabledChange}
          />
        )}
        {gameUiVisible && multiplayerSession && <MultiplayerHud />}
        {DEV_TOOLS_ENABLED && gameUiVisible && <AssetBrowserPanel open={showAssetBrowser} onClose={() => setShowAssetBrowser(false)} />}
        {DEV_TOOLS_ENABLED && gameUiVisible && <EcologyDebugHud />}
        {DEV_TOOLS_ENABLED && gameUiVisible && (
          <AnimalAnimationDevPanel open={showAnimalAnimationLab} onClose={() => setShowAnimalAnimationLab(false)} />
        )}
        {DEV_TOOLS_ENABLED && gameUiVisible && (
          <DarwinAnimationDevPanel open={showDarwinAnimationLab} onClose={() => setShowDarwinAnimationLab(false)} />
        )}
        {DEV_TOOLS_ENABLED && gameUiVisible && (
          <MapGeographyDevPanel open={showMapGeographyDev} onClose={() => setShowMapGeographyDev(false)} />
        )}
        {DEV_TOOLS_ENABLED && gameUiVisible && <WaterDevPanel />}
        {gameUiVisible && <AudioDebugPanel open={showAudioDebug} onClose={closeAudioDebug} />}
        {DEV_TOOLS_ENABLED && (
          <PerformancePanel
            open={gameUiVisible && showPerf}
            settings={perfSettings}
            metrics={metrics}
            physicsDebug={physicsDebug}
            onChange={setPerfSettings}
            onClose={() => setShowPerf(false)}
          />
        )}
        {showLaunchOverlay && (
          <LaunchOverlay
            mode={LAUNCH_MENU_STATES.has(launchState) ? launchState : 'loading'}
            departing={gameStarted && sceneReady}
            blackout={openingIntroEligible && (
              (launchState === 'loading' && displayedProgress >= 60)
              || sceneReady
            )}
            progress={displayedProgress}
            selectedModeId={initialModeId || playableModeId}
            onNewExpedition={openCharacterSelect}
            onModeSelect={beginNewExpedition}
            onBack={() => setLaunchState('menu')}
            onSettings={() => setLaunchState('settings')}
            onAbout={() => setLaunchState('about')}
            audioEnabled={audioEnabled}
            onAudioEnabledChange={handleAudioEnabledChange}
          />
        )}
        <ThreeE2EHarness
          activeContentPhase={activeContentPhase}
          contentTarget={transition ? STARTUP_FULL_CONTENT_PHASE : loadingContentTarget}
          renderer={rendererInfo}
          gameStarted={gameStarted}
          sceneReady={sceneReady}
          launchOverlayDismissed={launchOverlayDismissed}
          playerVisualReady={playerVisualReady}
          playerAnimationBanksReady={playerAnimationBanksReady}
          loadersStable={loadersStable}
          terrainSegmentCap={scenePerfSettings.terrainSegmentCap}
          waterEnabled={scenePerfSettings.water !== false}
          waterQuality={scenePerfSettings.waterQuality || 'polished'}
          worldDetailsEnabled={scenePerfSettings.worldDetails !== false}
        />
      </KeyboardControls>
    </main>
    </MultiplayerProvider>
  );
}
