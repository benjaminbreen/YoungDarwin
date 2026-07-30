'use client';

import dynamic from 'next/dynamic';
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyboardControls, Stats, useProgress } from '@react-three/drei';
import { EffectComposer, EffectComposerContext, Bloom, DepthOfField, N8AO, SMAA } from '@react-three/postprocessing';
import { BrightnessContrastEffect, HueSaturationEffect, VignetteEffect } from 'postprocessing';
import { ACESFilmicToneMapping, HalfFloatType, MathUtils, PCFShadowMap, SRGBColorSpace, Texture, UnsignedByteType, Vector3 } from 'three';
import { clampFrameDelta } from './frameTiming';
import {
  isPerfCaptureRecording,
  notePerfAdaptiveDprState,
  notePerfEvent,
  notePerfSample,
  subscribePerfRuntime,
} from './perfCapture';
import {
  readQualityPreference,
  resolveQualityPreference,
  writeQualityPreference,
} from './qualityPreference';
import { clearSessionSnapshot } from './sessionSave';
import { isExpeditionPaused, isGameplayInputBlocked } from './input/typingMode';
import { ThreeScene } from './components/ThreeScene';
import { UnderwaterPostEffect } from './components/scene/UnderwaterPostEffect';
import { HeatHazePostEffect } from './components/scene/HeatHazePostEffect';
import { AnimalVisionPostEffect } from './components/scene/AnimalVisionPostEffect';
import { ThreeHUD } from './ui/ThreeHUD';
import { ZoneTransitionOverlay } from './ui/ZoneTransitionOverlay';
import { INITIAL_LAUNCH_PROGRESS, LaunchOverlay } from './ui/LaunchOverlay';
import { IslandSoundscape } from './audio/IslandSoundscape';
import {
  activatePostOfficeBayAudio,
  preloadSoundscapeEffects,
  startLaunchAmbientPrelude,
} from './audio/audioRuntime';
import { ThreeE2EFrameSignal, ThreeE2EHarness } from './e2e/ThreeE2EHarness';
import { useThreeGameStore } from './store';
import { getPlayableMode } from './playable/playableModes';
import { isOvercastWeather, weatherProfile, weatherSkyTint } from './world/weatherStates';
import { skyState } from './world/celestial';
import { weatherEnv } from './world/weatherEnvRuntime';
import { computeColorGrade } from './world/colorGrade';
import { WATER_LEVEL } from './world/water';
import { CLOUD_SHADE_DEFAULTS, cloudShadeTuning, fogAtmosphereUniforms } from './world/fogAtmosphere'; // patches the shared fog chunks; must run before first shader compile
import {
  getSolarLookRevision,
  setSolarLookTuning,
  SOLAR_LOOK_DEFAULTS,
  solarLookTuning,
  subscribeSolarLook,
} from './world/solarLook';
import { setCoverageAASupport } from './components/assets/materialStability';
import {
  getPostGradeRevision,
  POST_GRADE_DEFAULTS,
  postGradeTuning,
  setPostGradeTuning,
  subscribePostGrade,
} from './world/postGrade';
import {
  preloadModelAssets,
  SceneEnvironment,
} from './components/assets/ModelAsset';
import { getSpecimenPreloadAssetId } from './components/world/SpecimenActor';
import { getThreeSpecimens } from './data';
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
import { prefetchStartupContentAssets } from './world/startupPrefetch';
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
import {
  CENTRAL_PEAK_DEV_DEFAULTS,
  centralPeakDev,
  centralPeakDevDiffSource,
  getCentralPeakDevRevision,
  resetCentralPeakDev,
  setCentralPeakDev,
  subscribeCentralPeakDev,
} from './world/vistas/centralPeakDevRuntime';
import {
  getCentralPeakView,
  resolveCentralPeakAppearance,
} from './world/vistas/centralPeak';
import {
  DISTANCE_SCENERY_SHELL_DEFAULTS,
  distanceSceneryRuntime,
  getDistanceSceneryRevision,
  resetDistanceSceneryShellTuning,
  setDistanceSceneryMode,
  setDistanceSceneryShellTuning,
  subscribeDistanceScenery,
} from './world/vistas/distanceSceneryRuntime';

const DEV_TOOLS_ENABLED = process.env.NODE_ENV !== 'production';
const AssetBrowserPanel = dynamic(
  () => import('./ui/dev/AssetBrowserPanel').then(module => module.AssetBrowserPanel),
  { ssr: false },
);
const EcologyDebugHud = dynamic(
  () => import('./ui/dev/EcologyDebugHud').then(module => module.EcologyDebugHud),
  { ssr: false },
);
const PerfMonitorSection = dynamic(
  () => import('./ui/dev/PerfMonitorSection').then(module => module.PerfMonitorSection),
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
const TerrainSeamDevPanel = dynamic(
  () => import('./ui/dev/TerrainSeamDevPanel').then(module => module.TerrainSeamDevPanel),
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
const LAUNCH_MENU_STATES = new Set(['menu', 'character', 'settings', 'controls', 'about', 'load']);

const DEFAULT_PERF_SETTINGS = {
  quality: 'performance',
  waterQuality: 'polished',
  // Mirrors QUALITY_PRESETS.performance (the default tier) so any fallback path
  // that reads these base values lands on the same image as the shipped preset.
  // Native-resolution default since the 2026-07-30 capture proved the scene
  // draw-call bound (resolution near-free), with the adaptive ladder as the
  // safety net on fillrate-bound machines.
  dprMode: '2x',
  // The adaptive-DPR controller stays on for players; the perf panel toggle
  // exists so measurements can pin resolution while isolating another cost.
  adaptiveDpr: true,
  msaaSamples: 2,
  postprocessing: true,
  contextAntialias: true,
  stats: false,
  shadows: true,
  shadowQuality: 'standard',
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
  // Keep scene flare sprites available; their shipped intensity is now
  // restrained by solarLookTuning rather than disabling the system.
  solarSceneFlares: true,
  solarSunFacingGrade: true,
  physicsDebug: false,
  preserveDrawingBuffer: false,
  // N8AO measured as the single most expensive composer pass (2026-07 Safari
  // pass: enabling it cost ~5-10 fps there). Off by default on every tier; the
  // perf panel toggle re-enables it live.
  ao: false,
  // Composer render targets default to 8-bit (UnsignedByteType). Half-float
  // targets double post-chain bandwidth, which WebKit/Metal pays for far more
  // dearly than Chrome; only the cinematic tier keeps HDR buffers.
  postHalfFloat: false,
  reflections: true,
  // Swap instanced vegetation (GLB layers, ez-trees, border vistas) from
  // MeshStandard (PBR) to matte MeshPhong — same matte look, far cheaper per
  // fragment. Terrain does NOT participate (its material cache is keyed by
  // region only). foliageDrawScale trims vegetation draw distance to cut
  // overdraw. Both default to the 'performance' tier.
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
    postHalfFloat: false,
    reflections: false,
    waterQuality: 'performance',
    waterSplashes: true,
    weatherFX: true,
    splatBackdrop: true,
    solarScreenGlare: true,
    solarLensGhosts: false,
    solarSunHalo: true,
    solarSceneFlares: true,
    cheapMaterials: true,
    foliageDrawScale: 0.75,
    terrainSegmentCap: 160,
  },
  performance: {
    // Full native resolution. The 2026-07-30 Post Office Bay capture proved
    // this scene CPU/draw-call bound, not fillrate bound: the adaptive-DPR
    // controller measured a resolution drop to 0.75x gaining zero fps (its
    // fillBound=false verdict), and 2x was screenshot-confirmed near-free on
    // the reference Mac. Machines that ARE fillrate-bound are protected by
    // the adaptive ladder, which steps down only when a drop actually helps.
    dprMode: '2x',
    // 2x MSAA on top of SMAA — the multisampled composer target is what gives
    // cutout foliage alpha-to-coverage real samples to work with.
    msaaSamples: 2,
    postprocessing: true,
    contextAntialias: true,
    // The shadow pass is a second draw of every caster, so map size and
    // refresh cadence are the biggest draw-call lever after the main pass.
    // 'ultra' (formerly 12k, every-frame refresh) roughly doubled per-frame
    // draw calls; 'standard' (4096, throttled) plus real PCF filtering reads
    // nearly as well and leaves 'ultra' as the cinematic/opt-in tier.
    shadowQuality: 'standard',
    // N8AO grounds props and vegetation nicely, but the 2026-07 Safari perf
    // pass measured it as the most expensive composer pass by far. Default off
    // on every tier; re-enable live from the perf panel.
    ao: false,
    postHalfFloat: false,
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
    solarSceneFlares: true,
    cheapMaterials: true,
    foliageDrawScale: 0.85,
    terrainSegmentCap: 200,
  },
  cinematic: {
    // Must not sit below the performance tier's native-res default ('default'
    // mode caps at 1.25x); the richest tier gets full resolution too.
    dprMode: '2x',
    msaaSamples: 2,
    postprocessing: true,
    contextAntialias: true,
    shadowQuality: 'ultra',
    ao: false,
    // Cinematic keeps HDR (half-float) composer buffers so bloom/grade banding
    // stays clean on the tier that promises the richest image.
    postHalfFloat: true,
    reflections: true,
    waterQuality: 'cinematic',
    waterSplashes: true,
    weatherFX: true,
    splatBackdrop: true,
    solarScreenGlare: true,
    solarLensGhosts: true,
    solarSunHalo: true,
    solarSceneFlares: true,
    cheapMaterials: false,
    foliageDrawScale: 1,
    terrainSegmentCap: null,
  },
};

const BOOT_LOADER_STABLE_MS = 350;
const BOOT_MIN_LOADING_MS = 1000;
const SCREENSHOT_MIN_LOADING_MS = 5200;
const OPENING_DURATION_MS = 6200;
const LAUNCH_OVERLAY_FADE_MS = 720;
const LAUNCH_COMPLETION_HOLD_MS = 420;
const HISTORICAL_PROLOGUE_SPLASH_MIN_MS = 3000;
const HISTORICAL_PROLOGUE_SPLASH_COMPLETE_HOLD_MS = 550;
const HISTORICAL_PROLOGUE_ACCEPT_HOLD_MS = 80;
const HISTORICAL_PROLOGUE_EXIT_MS = 2300;
const BOOT_DEGRADED_READY_TIMEOUT_MS = 10000;
const OPENING_ENSEMBLE_READY_TIMEOUT_MS = 6500;
const HUD_POST_REVEAL_QUIET_MS = 320;
const STARTUP_FULL_CONTENT_PHASE = 6;
const TRANSITION_REVEAL_CONTENT_PHASE = STARTUP_FULL_CONTENT_PHASE;
// Terrain, vistas, authored ecology, movement collision, and Darwin establish a
// playable opening. Asset-heavy props, specimens, the Beagle, and NPCs stream
// after this boundary so one slow optional GLB cannot strand the launch veil.
const STARTUP_OPENING_CONTENT_PHASE = 3;
// The ladder both launch paths climb. Mounting one content family per
// painted/idle window keeps React commits, Rapier collider construction,
// instance matrix fills, and shader discovery off the same animation frame.
//
// Travel walks it as fast as idle windows allow once the chart is opaque;
// startup spreads the tail across idle frames after the veil exits. The decimal
// stages exist because families four and five are the expensive ones — props,
// plant fields, structures, the Beagle, and every specimen actor — and landing
// them as two integer commits cost roughly 700 ms and 600 ms of frozen frames.
const CONTENT_MOUNT_STEPS = Object.freeze([
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
const INTRO_LOADING_STEPS = Object.freeze([1, ...CONTENT_MOUNT_STEPS]);
const INTRO_LOADING_PHASE_TIMINGS_MS = Object.freeze(
  INTRO_LOADING_STEPS.map((_, index) => Math.round(index * 155)),
);
const STARTUP_STREAM_FIRST_STEP_MS = 180;
const STARTUP_STREAM_STEP_MS = 380;
const STARTUP_STREAM_IDLE_TIMEOUT_MS = 650;
const STARTUP_STREAM_FRAME_BUDGET_MS = 28;
// The deadline is a degraded fallback, not the normal transition clock. Full
// destination content now mounts and compiles beneath the opaque chart first.
const TRANSITION_READY_DEADLINE_MS = 8000;
const TRANSITION_COMPILE_TIMEOUT_MS = 1500;
const TRANSITION_OPTIONAL_LOADER_GRACE_MS = 900;
const SCENE_COST_BUCKET_LIMIT = 40;
const SHADOW_QUALITY_MODES = ['low', 'standard', 'high', 'ultra'];
const OPENING_RENDER_DPR = [1, 1];
// three r182 dropped PCFSoftShadowMap from the shader define table, so
// requesting it silently compiles unfiltered BASIC (1-tap) shadows.
// PCFShadowMap is the filtered path and the only mode honoring shadow.radius.
// Stable object identity so R3F's per-render configure stays idempotent.
const SHADOW_MAP_CONFIG = Object.freeze({ enabled: true, type: PCFShadowMap });

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
  const postHalfFloat = settingEnabled(params, base.postHalfFloat, ['hdrPost'], ['noHdrPost']);
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
    postHalfFloat,
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
    adaptiveDpr: !params.has('noAdaptiveDpr'),
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
    worstFrameMs: 0,
    worstFrameRawMs: 0,
    framesOver32Ms: 0,
    framesOver50Ms: 0,
  });

  useFrame((_, delta) => {
    if (!enabled) return;
    const state = samples.current;
    state.frames += 1;
    state.elapsed += delta;
    state.lastPublish += delta;
    state.sceneElapsed += delta;
    // Per-window spike tracking: the published average conceals exactly the
    // single-frame stalls the perf capture exists to expose. Clamp one frame at
    // 250ms so a tab-restore mega-delta cannot dominate a whole capture.
    const frameMs = Math.min(delta * 1000, 250);
    state.worstFrameMs = Math.max(state.worstFrameMs, frameMs);
    state.worstFrameRawMs = Math.max(state.worstFrameRawMs, delta * 1000);
    if (frameMs > 32) state.framesOver32Ms += 1;
    if (frameMs > 50) state.framesOver50Ms += 1;
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
      worstFrameMs: state.worstFrameMs,
      worstFrameRawMs: state.worstFrameRawMs,
      framesOver32Ms: state.framesOver32Ms,
      framesOver50Ms: state.framesOver50Ms,
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
    state.worstFrameMs = 0;
    state.worstFrameRawMs = 0;
    state.framesOver32Ms = 0;
    state.framesOver50Ms = 0;
  });

  return null;
}

function transitionPercentile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))];
}

function loadingManagerIsBusy(progressState) {
  const total = Number(progressState?.total || 0);
  const loaded = Number(progressState?.loaded || 0);
  const progress = Number(progressState?.progress);
  // Three's LoadingManager can retain `active: true` after an optional asset
  // errors, and may briefly report loaded > total with progress = NaN. At that
  // point every tracked request has reached a terminal state; authored
  // fallbacks should render instead of trapping the launch overlay forever.
  if (total > 0 && loaded >= total) return false;
  return Boolean(progressState?.active)
    || (total > 0 && (!Number.isFinite(progress) || progress < 100));
}

// The opening used to have no repeatable performance evidence, so a smooth
// average after landing could hide multi-second stalls inside the fly-in. This
// records only the visible shot and separately reports the covered load time.
function OpeningPerformanceProbe({
  enabled,
  active,
  sequenceId,
  loadStartedAt,
  contentPhase,
}) {
  const activeRef = useRef(null);

  useEffect(() => {
    if (!enabled || !active || !sequenceId) return undefined;
    const startedAt = performance.now();
    const sample = {
      id: sequenceId,
      loadDurationMs: loadStartedAt ? Math.max(0, startedAt - loadStartedAt) : 0,
      startedAt,
      durationMs: 0,
      events: [{ name: 'visible-start', atMs: 0, detail: null }],
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
      sample.events.push({ name, atMs: performance.now() - startedAt, detail });
    };
    const tick = now => {
      if (previousFrameAt != null) {
        const delta = now - previousFrameAt;
        sample.frameDeltas.push(delta);
        sample.frameCount += 1;
        sample.worstFrameMs = Math.max(sample.worstFrameMs, delta);
        if (delta > 32) sample.framesOver32Ms += 1;
        if (delta > 50) sample.framesOver50Ms += 1;
      }
      previousFrameAt = now;
      frameHandle = window.requestAnimationFrame(tick);
    };
    activeRef.current = { sample, record };
    window.__threeOpeningPerf = sample;
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
      const history = window.__threeOpeningPerfHistory || [];
      window.__threeOpeningPerfHistory = [...history.slice(-19), sample];
      activeRef.current = null;
    };
  }, [active, enabled, loadStartedAt, sequenceId]);

  useEffect(() => {
    if (!active) return;
    activeRef.current?.record(`content:${contentPhase}`);
  }, [active, contentPhase]);

  return null;
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
// The target band is a playable 25-35 fps, not 60: dropping resolution to chase
// a number the scene cannot reach just makes it blurry for nothing. The old 25
// fps floor sat at the very bottom of that band, so a session hovering at 26
// never got help; 30 keeps the middle of the band defended.
const ADAPTIVE_DPR_FLOOR_FPS = 30;      // sustained fps below this -> drop a rung
const ADAPTIVE_DPR_CEIL_FPS = 42;       // sustained fps above this -> restore a rung
const ADAPTIVE_DPR_WINDOW_S = 1.0;      // averaging window per decision
const ADAPTIVE_DPR_UPSCALE_WINDOWS = 3; // consecutive good windows before restoring
const ADAPTIVE_DPR_COOLDOWN_S = 2.0;    // settle time after a change / scene ready
// A rung must earn its blur. When the scene is draw-call or CPU bound, shrinking
// the framebuffer changes nothing, and the old controller would happily walk all
// the way to the bottom of the ladder for zero fps while making the image soft.
// Require a measurable gain from the previous drop or give the pixels back and
// stop adapting for this scene.
const ADAPTIVE_DPR_MIN_GAIN_FPS = 2.5;

function buildDprLadder(maxDpr) {
  const rungs = [];
  // Sub-1x rungs matter most on the tiers that already cap at 1.25x: without
  // them the ladder held only two steps and the controller ran out of room
  // before it could recover a frame budget.
  for (const candidate of [2, 1.5, 1.25, 1, 0.85, 0.75]) {
    if (candidate <= maxDpr + 1e-3) rungs.push(candidate);
  }
  if (!rungs.length || rungs[0] < maxDpr - 1e-3) rungs.unshift(maxDpr);
  return rungs.filter((value, i) => i === 0 || value < rungs[i - 1] - 1e-3);
}

function AdaptiveResolution({ enabled, maxDpr, onApplied = null }) {
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
    fpsBeforeDrop: 0,
    fillBound: true,
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
    s.fpsBeforeDrop = 0;
    s.fillBound = true;
    onApplied?.(null);
  }, [maxDpr, onApplied]);

  useEffect(() => {
    if (!enabled) onApplied?.(null);
  }, [enabled, onApplied]);

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
    // Published (not notified) every window so captures and the Monitor tab can
    // report why the ladder is or isn't moving.
    notePerfAdaptiveDprState({
      dpr: Math.min(s.deviceDpr, s.ladder[s.level]),
      level: s.level,
      ladder: s.ladder,
      fillBound: s.fillBound,
      windowFps: Math.round(fps * 10) / 10,
    });

    // Judge the previous drop before considering another one. No gain means the
    // frame cost lives on the CPU or in draw-call count, where framebuffer size
    // is irrelevant — hand the resolution back and leave it alone.
    if (s.fpsBeforeDrop) {
      const gained = fps - s.fpsBeforeDrop;
      s.fpsBeforeDrop = 0;
      if (gained < ADAPTIVE_DPR_MIN_GAIN_FPS) {
        s.fillBound = false;
        notePerfEvent('adaptive-dpr-verdict', {
          fillBound: false,
          gainedFps: Math.round(gained * 10) / 10,
        });
        if (s.level > 0) {
          s.level -= 1;
          applyAdaptiveDpr(s, setDpr, gl, onApplied);
        }
        return;
      }
    }

    if (fps < ADAPTIVE_DPR_FLOOR_FPS && s.level < s.ladder.length - 1 && s.fillBound) {
      s.level += 1;
      s.goodWindows = 0;
      s.fpsBeforeDrop = fps;
      applyAdaptiveDpr(s, setDpr, gl, onApplied);
    } else if (fps > ADAPTIVE_DPR_CEIL_FPS && s.level > 0) {
      s.goodWindows += 1;
      if (s.goodWindows >= ADAPTIVE_DPR_UPSCALE_WINDOWS) {
        s.level -= 1;
        s.goodWindows = 0;
        applyAdaptiveDpr(s, setDpr, gl, onApplied);
      }
    } else {
      s.goodWindows = 0;
    }
  });

  return null;
}

function applyAdaptiveDpr(s, setDpr, gl, onApplied = null) {
  const applied = Math.min(s.deviceDpr, s.ladder[s.level]);
  s.cooldown = ADAPTIVE_DPR_COOLDOWN_S;
  if (typeof window !== 'undefined') window.__adaptiveDpr = applied;
  // Lift the applied value into the parent's Canvas dpr prop. Without this,
  // R3F's per-render configure() compares the live pixel ratio against the
  // configured cap and snaps every adaptive step back on the next parent
  // re-render — with the perf panel open (4Hz metrics renders) the controller
  // could never hold a reduced resolution at all.
  onApplied?.(applied);
  if (Math.abs(gl.getPixelRatio() - applied) < 1e-3) return; // already there
  notePerfEvent('adaptive-dpr', { dpr: applied });
  setDpr(applied);
}

// Writes a resume snapshot when meaningful progress changes rather than on a
// timer, so a reload or crash costs at most the current walk between events. The
// snapshot itself is cheap (ids, counters, journal text — no world state).
function useSessionAutosave(active) {
  const day = useThreeGameStore(state => state.day);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const collectedCount = useThreeGameStore(state => state.collectedSpecimenIds.length);
  const documentedCount = useThreeGameStore(state => state.documentedSpecimenIds.length);
  const journalCount = useThreeGameStore(state => state.journal.length);
  const questComplete = useThreeGameStore(state => state.questComplete);
  const playableModeId = useThreeGameStore(state => state.playableModeId);

  useEffect(() => {
    if (!active) return;
    useThreeGameStore.getState().saveSession();
  }, [
    active,
    collectedCount,
    currentZoneId,
    day,
    documentedCount,
    journalCount,
    playableModeId,
    questComplete,
  ]);

  // Also capture the clock/fatigue drift when the player leaves the page, so
  // "Continue" resumes near where they actually stopped.
  //
  // Deliberately no save in the effect cleanup: teardown also runs right after
  // resetExpedition (returning to the main menu, starting a new expedition),
  // which would overwrite a good save with freshly-reset state.
  useEffect(() => {
    if (!active) return undefined;
    const save = () => useThreeGameStore.getState().saveSession();
    const onVisibilityChange = () => { if (document.hidden) save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active]);
}

function ExpeditionClock() {
  const elapsed = useRef(0);
  const advanceTime = useThreeGameStore(state => state.advanceTime);
  const statusViewOpen = useThreeGameStore(state => state.statusViewOpen);
  const examineOpen = useThreeGameStore(state => Boolean(state.examineSession));
  const readableBookOpen = useThreeGameStore(state => Boolean(state.readableBookSession));

  // Hidden tabs stop painting, so the frame that arrives when the player comes
  // back carries the whole absence as one delta. Drop the accumulator on
  // hide/show rather than letting the clock swallow it — otherwise stepping away
  // for half an hour advanced the expedition by roughly five in-game hours.
  useEffect(() => {
    const onVisibilityChange = () => { elapsed.current = 0; };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useFrame((_, delta) => {
    if (statusViewOpen || examineOpen || readableBookOpen || isExpeditionPaused() || document.hidden) {
      // Status/examine views and the pause menu freeze expedition time; drop
      // accumulated real time so the clock doesn't lurch forward on close.
      elapsed.current = 0;
      return;
    }
    // Clamped: a long stall must cost at most one frame of expedition time.
    elapsed.current += clampFrameDelta(delta);
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
  verifyOpeningActors = false,
  onReady,
}) {
  const { gl, scene, camera } = useThree();
  const activeSequenceRef = useRef(null);
  const quietSinceRef = useRef(0);
  const stableFramesRef = useRef(0);
  const announcedSequenceRef = useRef(null);
  const compiledSequenceRef = useRef(null);
  const compilingSequenceRef = useRef(null);

  useFrame((_, delta) => {
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
      compiledSequenceRef.current = null;
      compilingSequenceRef.current = null;
    }
    if (!contentReady) return;

    const zoneId = useThreeGameStore.getState().currentZoneId;
    if (!terrainResourceIsReady(zoneId, segmentCap)) {
      quietSinceRef.current = 0;
      stableFramesRef.current = 0;
      return;
    }

    if (verifyOpeningActors) {
      let symsActorCount = 0;
      let symsVisualCount = 0;
      let specimenActorCount = 0;
      let specimenVisualCount = 0;
      let importedModelCount = 0;
      scene.traverse(object => {
        if (object.visible === false) return;
        if (object.userData?.renderSource === 'npc:syms') {
          symsActorCount += 1;
          object.traverse(descendant => {
            const kind = descendant.userData?.renderKind;
            if (
              descendant.visible !== false
              && (kind === 'model-asset' || kind === 'npc-visual-fallback')
            ) symsVisualCount += 1;
          });
        }
        if (object.userData?.renderKind === 'specimen-actor') {
          specimenActorCount += 1;
          object.traverse(descendant => {
            const kind = descendant.userData?.renderKind;
            if (
              descendant.visible !== false
              && (kind === 'model-asset' || kind === 'specimen-visual')
            ) specimenVisualCount += 1;
          });
        }
        if (String(object.userData?.renderSource || '').startsWith('model:')) importedModelCount += 1;
      });
      const state = useThreeGameStore.getState();
      const expectsSyms = state.symsZoneId === zoneId;
      const collectedActors = new Set(state.collectedSpecimenActorIds || []);
      const expectedSpecimenCount = getThreeSpecimens(zoneId).filter(specimen => {
        const actorId = specimen.instanceId || specimen.id;
        return actorId !== state.playableHiddenActorId && !collectedActors.has(actorId);
      }).length;
      const expectsSpecimens = expectedSpecimenCount > 0;
      if (
        (expectsSyms && (symsActorCount === 0 || symsVisualCount === 0))
        || (
          expectsSpecimens
          && (
            specimenActorCount < expectedSpecimenCount
            || specimenVisualCount < expectedSpecimenCount
          )
        )
      ) {
        quietSinceRef.current = 0;
        stableFramesRef.current = 0;
        return;
      }
      if (typeof window !== 'undefined') {
        window.__threeOpeningEnsemble = {
          zoneId,
          expectsSyms,
          expectsSpecimens,
          expectedSpecimenCount,
          symsActorCount,
          symsVisualCount,
          specimenActorCount,
          specimenVisualCount,
          importedModelCount,
          contentReady: true,
        };
      }
    }

    // Read loader state imperatively. Subscribing this R3F component lets a
    // render-time texture request schedule a React update in another render.
    const assetProgress = useProgress.getState();
    const loaderBusy = loadingManagerIsBusy(assetProgress);
    if (loaderBusy) {
      quietSinceRef.current = 0;
      stableFramesRef.current = 0;
      return;
    }

    const now = performance.now();
    if (!quietSinceRef.current) quietSinceRef.current = now;
    if (now - quietSinceRef.current < 300) return;

    // Compile the opening scene while the overlay is still opaque. The travel
    // path has always done this before a reveal; without it every material in
    // the landing shot compiled on its first draw, which put the stall inside
    // the cinematic instead of behind the curtain. Bounded like the transition
    // compile so an unusual WebGL driver cannot strand the launch.
    if (compiledSequenceRef.current !== sequenceId) {
      if (compilingSequenceRef.current !== sequenceId) {
        compilingSequenceRef.current = sequenceId;
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
            // The renderer surfaces shader errors itself. Launch must still
            // settle onto authored fallbacks on unusual drivers.
          })
          .then(() => {
            if (compileTimeoutId != null) window.clearTimeout(compileTimeoutId);
            compiledSequenceRef.current = sequenceId;
            if (compilingSequenceRef.current === sequenceId) compilingSequenceRef.current = null;
          });
      }
      return;
    }

    if (delta * 1000 > STARTUP_STREAM_FRAME_BUDGET_MS) {
      stableFramesRef.current = 0;
      return;
    }
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
  const compiledAtRef = useRef(0);
  const compilingIdRef = useRef(null);
  const quietSinceRef = useRef(0);
  const stableFramesRef = useRef(0);
  const resourceStableFramesRef = useRef(0);
  const activeIdRef = useRef(null);
  const readyTimeoutRef = useRef(null);
  const readyQueuedIdRef = useRef(null);
  const blockerRef = useRef(null);

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
          blockerRef.current = null;
          compiledAtRef.current = 0;
          return;
        }
        if (activeIdRef.current !== active.id) {
          activeIdRef.current = active.id;
          quietSinceRef.current = 0;
          stableFramesRef.current = 0;
          resourceStableFramesRef.current = 0;
          compiledAtRef.current = 0;
        }
        // Compilation is a polish step, not a gate that may permanently strand
        // the player. This also covers a failed terrain promise or a loader that
        // never reports its final progress event on a particular WebGL driver.
        if (active.committedAt && Date.now() - active.committedAt >= TRANSITION_READY_DEADLINE_MS) {
          queueReady(active.id);
          return;
        }
        if (!terrainResourceIsReady(active.zoneId, segmentCap)) {
          if (blockerRef.current !== 'terrain') {
            blockerRef.current = 'terrain';
            window.__recordThreeTransitionEvent?.('ready-wait:terrain');
          }
          resourceStableFramesRef.current = 0;
          return;
        }
        const waterResource = waterResourceDescriptor(active.zoneId, waterQuality);
        const borderReady = borderVistaResourceIsReady(active.zoneId);
        const ecologyReady = regionEcologyResourceIsReady(active.zoneId);
        const waterReady = waterResource.skip || waterTextureResourceIsReady(
            active.zoneId,
            waterResource.bakeRes,
            waterResource.options,
          );
        if (contentPhase < TRANSITION_REVEAL_CONTENT_PHASE
          || !borderReady
          || !ecologyReady
          || !waterReady) {
          const blocker = contentPhase < TRANSITION_REVEAL_CONTENT_PHASE
            ? `content:${contentPhase}`
            : !borderReady
              ? 'border'
              : !ecologyReady
                ? 'ecology'
                : 'water';
          if (blockerRef.current !== blocker) {
            blockerRef.current = blocker;
            window.__recordThreeTransitionEvent?.(`ready-wait:${blocker}`);
          }
          resourceStableFramesRef.current = 0;
          return;
        }
        // Let Suspense commit the terrain/physics consumers after the worker's
        // promise resolves before compiling the destination scene.
        resourceStableFramesRef.current += 1;
        if (resourceStableFramesRef.current < 3) return;
        if (compiledIdRef.current !== active.id) {
          if (blockerRef.current !== 'compile') {
            blockerRef.current = 'compile';
            window.__recordThreeTransitionEvent?.('ready-wait:compile');
          }
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
                  compiledAtRef.current = performance.now();
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
        const loaderBusy = loadingManagerIsBusy(assetProgress);
        const optionalLoaderGraceElapsed = compiledAtRef.current > 0
          && performance.now() - compiledAtRef.current >= TRANSITION_OPTIONAL_LOADER_GRACE_MS;
        if ((loaderBusy && !optionalLoaderGraceElapsed) || compiledIdRef.current !== active.id) {
          if (blockerRef.current !== 'loader') {
            blockerRef.current = 'loader';
            window.__recordThreeTransitionEvent?.('ready-wait:loader');
          }
          quietSinceRef.current = 0;
          stableFramesRef.current = 0;
          return;
        }
        if (blockerRef.current !== 'settle') {
          blockerRef.current = 'settle';
          window.__recordThreeTransitionEvent?.('ready-wait:settle');
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
      const t = MathUtils.smootherstep(Math.min(1, elapsed / 950), 0, 1);
      targetPosition.current.copy(departurePositionRef.current)
        .addScaledVector(departureDirectionRef.current, -8.5 * t);
      targetPosition.current.y += 12 * t;
      camera.position.copy(targetPosition.current);
      const pose = state.playerPose?.position || { x: 0, y: 0, z: 0 };
      lookTarget.current.set(pose.x || 0, (pose.y || 0) + 1.1, pose.z || 0);
      camera.lookAt(lookTarget.current);
      camera.fov = departureFovRef.current + 3.8 * t;
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
      arrivalPositionRef.current.set(px, Math.max(py + 24, targetPosition.current.y + 12), pz)
        .addScaledVector(direction.current, 14);
      const previousPosition = camera.position.clone();
      camera.position.copy(arrivalPositionRef.current);
      lookTarget.current.set(px, py + 1.1, pz);
      camera.lookAt(lookTarget.current);
      arrivalQuaternionRef.current.copy(camera.quaternion);
      camera.position.copy(previousPosition);
    }
    const arrivalStartedAt = active.arrivingAt || active.readyAt || active.phaseStartedAt || Date.now();
    const elapsed = Math.max(0, Date.now() - arrivalStartedAt);
    const t = MathUtils.smootherstep(Math.min(1, elapsed / 1200), 0, 1);
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
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const destinationId = transitionDestinationId || edgeDestinationId;
  useEffect(() => {
    setEcologyAssetPrefetchPaused(Boolean(transitionDestinationId));
    return () => setEcologyAssetPrefetchPaused(false);
  }, [transitionDestinationId]);
  // Warm the current zone's late-mounting content families (physics props,
  // specimens, the Beagle hull, Syms) on the serialized pump. At launch this
  // runs during the aerial cinematic — the job startupPrefetch.js was written
  // for; after travel it is a cheap no-op safety net (the pump dedupes).
  useEffect(() => {
    if (currentZoneId) prefetchStartupContentAssets(currentZoneId);
  }, [currentZoneId]);
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
    // Queue the destination's props/specimens/ship/NPC GLBs alongside its
    // ecology, so arrival mounts read from a warm cache instead of parsing
    // mid-transition.
    prefetchStartupContentAssets(destinationId);
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

// Mounts one content family per separated idle window, committing each value in
// `steps` in order. React commit, Rapier collider construction, instance matrix
// fills, and shader discovery each get their own frame instead of converging on
// one. `timings` are cumulative offsets from the start of the sequence; a
// shorter array repeats its final interval.
function scheduleStagedContentPhases({ steps, timings, commitPhase, idleTimeoutMs = 420 }) {
  let cancelled = false;
  let timeoutHandle = null;
  let idleHandle = null;
  let frameHandle = null;
  const startedAt = performance.now();

  const targetForStep = index => {
    if (!timings.length) return 0;
    if (index < timings.length) return timings[index];
    // Repeat the final interval for any step the caller did not time.
    const last = timings[timings.length - 1];
    const stride = timings.length > 1 ? last - timings[timings.length - 2] : 0;
    return last + stride * (index - timings.length + 1);
  };

  const schedule = index => {
    if (cancelled || index >= steps.length) return;
    // Anchored to the start of the sequence, not to the previous commit. A step
    // that overruns its window then eats into the next delay instead of pushing
    // the whole tail of the ladder past the end of the cinematic — which is how
    // eleven 380 ms stages turned into fourteen seconds of mounting.
    const delay = Math.max(0, targetForStep(index) - (performance.now() - startedAt));
    timeoutHandle = window.setTimeout(() => {
      timeoutHandle = null;
      const commit = () => {
        idleHandle = null;
        if (cancelled) return;
        commitPhase(steps[index]);
        frameHandle = window.requestAnimationFrame(() => {
          frameHandle = window.requestAnimationFrame(() => {
            frameHandle = null;
            schedule(index + 1);
          });
        });
      };
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(commit, { timeout: idleTimeoutMs });
      } else {
        commit();
      }
    }, delay);
  };

  schedule(0);
  return () => {
    cancelled = true;
    if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
    if (idleHandle != null) window.cancelIdleCallback?.(idleHandle);
    if (frameHandle != null) window.cancelAnimationFrame(frameHandle);
  };
}

function recordLaunchHandoffEvent(label, detail = null) {
  if (typeof window === 'undefined') return;
  const now = performance.now();
  const existing = window.__threeLaunchHandoff;
  const state = existing && Array.isArray(existing.events)
    ? existing
    : { startedAt: now, events: [] };
  state.events.push({
    label,
    at: now,
    elapsedMs: Math.max(0, now - state.startedAt),
    ...(detail ? { detail } : null),
  });
  state.lastEvent = label;
  window.__threeLaunchHandoff = state;
  try {
    performance.mark(`three:launch-handoff:${label}`);
  } catch {
    // User-agent mark limits or an unusual label must never affect launch.
  }
}

// Selective bloom so the sun (and bright speculars) genuinely radiate. A high
// luminance threshold keeps the sky/terrain crisp and only blooms near-white
// highlights, which is why the sun core is pushed white-hot in SkyController.
// N8AO grounds rocks/characters with contact shading; runs half-res to stay
// cheap and can be disabled independently of the rest of the stack.

// How far in front of the subject's centre the plane of focus sits, as a
// fraction of its radius: roughly the front third of the bulk.
const NEAR_SURFACE_FOCUS_BIAS = 0.55;

// The sharp band has to be at least as deep as the subject, or its own far
// side falls out of focus. Shared by the initial prop and the frame loop so a
// re-memo of the effect cannot snap focusRange back to a stale authored value.
function subjectFocusRange(radius) {
  return MathUtils.clamp((Number(radius) || 0.6) * 1.05, 0.22, 1.8);
}

function ExaminationDepthOfField() {
  const session = useThreeGameStore(state => state.examineSession);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const effectRef = useRef(null);
  const target = useMemo(() => new Vector3(), []);
  const center = useMemo(() => new Vector3(), []);
  const cameraWorld = useMemo(() => new Vector3(), []);
  const active = examinationDepthOfFieldActive(session);
  const authoredHint = session?.frameHint || { height: 0.8, radius: 0.6 };
  const initialFocusRange = subjectFocusRange(authoredHint.radius);

  const setFocusCenter = (focus, hint) => {
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
    center.set(focus.x, focusY + centerOffset, focus.z);
  };

  if (active) {
    setFocusCenter(session.focus, resolveSpecimenFrameHint(authoredHint, null));
    target.copy(center);
  }

  useFrame(state => {
    if (!active) return;
    const liveFocus = getSpecimenRuntimePoses(currentZoneId)?.get(session.actorId);
    const focus = liveFocus || session.focus;
    if (!focus) return;
    const renderedBounds = getSpecimenRuntimeBounds(currentZoneId)?.get(session.actorId);
    const hint = resolveSpecimenFrameHint(authoredHint, renderedBounds);
    setFocusCenter(focus, hint);
    // The circle-of-confusion pass measures RADIAL view distance, so the sharp
    // band is a shell centred on the focus point. Aiming it at the subject's
    // axis therefore puts the surface the player actually looks at a full
    // radius inside the near-blur field and lands the sharp shell on the
    // ground behind the subject. Pull the focus point forward along the live
    // camera ray instead — derived from the camera rather than from either
    // camera branch's own framing math, so specimen orbits and the ambient
    // dolly both stay in focus.
    const subjectRadius = MathUtils.clamp(hint.radius || 0.6, 0.05, 2.5);
    state.camera.getWorldPosition(cameraWorld);
    const centerDistance = cameraWorld.distanceTo(center);
    const focusDistance = Math.max(0.12, centerDistance - subjectRadius * NEAR_SURFACE_FOCUS_BIAS);
    target.copy(cameraWorld).lerp(center, focusDistance / Math.max(1e-4, centerDistance));
    effectRef.current?.target?.copy(target);
    if (effectRef.current?.cocMaterial) {
      effectRef.current.cocMaterial.focusRange = subjectFocusRange(subjectRadius);
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

// Far-field softening: a lens's-eye treatment of distance.
//
// Distant landform is low-frequency by nature, but it is DRAWN with hard
// polygon silhouettes, per-vertex colour steps and layer seams — high-frequency
// edges on low-frequency content, which is exactly the combination that reads
// as "glitchy" at range. Building geometry fine enough to survive being sharp
// at 300 m is not affordable; resolving it softly, the way a real lens does, is
// nearly free and is what the eye expects from distance anyway.
//
// Deliberately NOT a portrait-mode look: focus sits a few metres from the
// camera with a very long range, so the circle of confusion is ~0 across the
// whole playable area and only climbs past ~150 m. The foreground never
// softens. Bokeh passes run at a third resolution — the content being blurred
// has no detail to lose, so the downsample IS most of the blur, which is what
// makes this cheap rather than a luxury.
function DistanceSoftening({ enabled }) {
  useSyncExternalStore(
    subscribeCentralPeakDev,
    getCentralPeakDevRevision,
    getCentralPeakDevRevision,
  );
  useSyncExternalStore(
    subscribeDistanceScenery,
    getDistanceSceneryRevision,
    getDistanceSceneryRevision,
  );
  const effectRef = useRef(null);
  useFrame(() => {
    const material = effectRef.current?.cocMaterial;
    if (!material) return;
    material.focusDistance = centralPeakDev.softeningFocus;
    material.focusRange = centralPeakDev.softeningRange;
    if (effectRef.current.bokehScale !== centralPeakDev.softeningBokeh) {
      effectRef.current.bokehScale = centralPeakDev.softeningBokeh;
    }
  });
  if (
    !enabled
    || !centralPeakDev.distanceSoftening
    || distanceSceneryRuntime.mode === 'shell'
  ) return null;
  return (
    <DepthOfField
      ref={effectRef}
      worldFocusDistance={centralPeakDev.softeningFocus}
      worldFocusRange={centralPeakDev.softeningRange}
      bokehScale={centralPeakDev.softeningBokeh}
      resolutionScale={centralPeakDev.softeningResolution}
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

function PostFX({ enabled, ao, halfFloat = false, multisampling = 2, underwaterAmount = 0 }) {
  // Re-render when the dev panel drags a bloom/vignette knob, so the Bloom
  // element picks up the new values (the vignette reads them per frame).
  useSyncExternalStore(subscribePostGrade, getPostGradeRevision, getPostGradeRevision);
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
    gradeFx.vignette.darkness = grade.vignetteDarkness * postGradeTuning.vignetteStrength;
    gradeFx.vignette.offset = postGradeTuning.vignetteOffset;
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
  // 0.76 was authored against 8-bit composer buffers, where the library tags
  // the input sRGB — an effective linear threshold of ~0.53. Half-float
  // buffers are linear, so the same number reserved bloom for values so hot
  // that the HDR tier (the one promising the richest image) barely bloomed
  // at all. 0.55 linear matches the 8-bit tier's effective cut.
  const bloomThreshold = interiorFx
    ? MathUtils.lerp(
      interiorFx.bloomNightThreshold ?? 0.58,
      interiorDayBloomThreshold,
      interiorDaylight,
    )
    : (halfFloat ? 0.55 : 0.76);
  return (
    // SMAA cleans polygon edges, but vegetation shimmer needs actual sample
    // coverage before post-processing. Keep this configurable in the perf UI.
    // frameBufferType: the library defaults to HalfFloatType (RGBA16F), which
    // doubles the bandwidth of every full-screen pass — Safari/Metal pays that
    // far more dearly than Chrome. 8-bit is the default; cinematic opts back
    // into HDR buffers via postHalfFloat.
    <EffectComposer
      multisampling={composerMultisampling}
      frameBufferType={halfFloat ? HalfFloatType : UnsignedByteType}
    >
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
      {/* Only when nothing is being examined — two DoF passes would fight over
          the same circle-of-confusion buffer and double the cost. */}
      {!examinationDepthOfFieldActive(examineSession)
        && <DistanceSoftening enabled={enabled && !interiorDefinition} />}
      {/* Threshold sits just under the ACES shoulder so deliberate HDR
          customers — sun core, lantern flame, water glints pushed past 1.0,
          moon glitter, ground/mote sparkles — glow softly, while sky/sand/
          foliage stay crisp. */}
      {enabled && (
        <Bloom
          intensity={bloomIntensity * postGradeTuning.bloomIntensityScale * (1 - underwater * 0.58)}
          luminanceThreshold={MathUtils.clamp(bloomThreshold + postGradeTuning.bloomThresholdShift, 0, 1)}
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
    // Math.min/max pass NaN straight through, and the change test below compares
    // false for NaN, so a non-finite camera used to publish NaN to the store and
    // to the glare overlay's inline opacity. Hold the last good value instead.
    if (!Number.isFinite(amount)) return;
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
      {/* The DOM radial vignette that used to sit here stacked a second
          multiply on top of the composer's VignetteEffect. One vignette, one
          owner: the composer effect (dev-tunable via the Vignette sliders in
          the perf panel) is the only one now. */}
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
  useSyncExternalStore(
    subscribeSolarLook,
    getSolarLookRevision,
    getSolarLookRevision,
  );
  const glare = useThreeGameStore(state => state.solarGlare);
  if (!enabled || (!wash && !lensGhostsEnabled)) return null;
  // Every alpha below derives from these two, and Math.min/max do not filter NaN
  // — one bad input became `opacity: NaN` on nine layers at once.
  const safeSuppression = Number.isFinite(suppression) ? suppression : 0;
  const safeGlareStrength = Number.isFinite(glare?.strength) ? glare.strength : 0;
  const strength = Math.min(1, Math.max(0, safeGlareStrength)) * (1 - Math.min(1, Math.max(0, safeSuppression)));

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

// One line per knob that differs from its baked default, in paste-into-chat
// form. Sections share it so any tuned section can hand Claude exact values.
function tuningDiffSource(tuning, defaults) {
  return Object.keys(defaults)
    .filter(key => tuning[key] !== defaults[key])
    .map(key => `  ${key}: ${typeof tuning[key] === 'number' ? Number(tuning[key].toFixed(4)) : tuning[key]},`)
    .join('\n');
}

function CopyTuningButton({ pairs }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);
  const source = pairs
    .map(([tuning, defaults]) => tuningDiffSource(tuning, defaults))
    .filter(Boolean)
    .join('\n');
  return (
    <button
      type="button"
      disabled={!source}
      onClick={() => {
        navigator.clipboard?.writeText(source);
        setCopied(true);
      }}
      className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] hover:bg-white/15 disabled:opacity-35"
    >
      {copied ? 'copied' : 'copy values'}
    </button>
  );
}

function SolarDiagnostics({ settings, set }) {
  const solarGlare = useThreeGameStore(state => state.solarGlare);
  useSyncExternalStore(
    subscribeSolarLook,
    getSolarLookRevision,
    getSolarLookRevision,
  );
  useSyncExternalStore(subscribePostGrade, getPostGradeRevision, getPostGradeRevision);
  return (
    <div className="mb-3 rounded border border-amber-100/15 bg-black/15 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-100/75">Solar Diagnostics</h3>
        <div className="flex items-center gap-1">
          <CopyTuningButton pairs={[[solarLookTuning, SOLAR_LOOK_DEFAULTS], [postGradeTuning, POST_GRADE_DEFAULTS]]} />
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${solarGlare?.visible ? 'bg-amber-200/20 text-amber-100' : 'bg-white/10 text-amber-100/60'}`}>
            {solarGlare?.visible ? 'active' : 'quiet'}
          </span>
        </div>
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
        <DevSlider label="Golden hour" value={solarLookTuning.goldenBoost} min={0} max={1.8} step={0.05} format={v => `${v.toFixed(2)}x`} onChange={value => setSolarLookTuning({ goldenBoost: value })} />
        <DevSlider label="Sun optics" value={solarLookTuning.opticsIntensity} min={0} max={2.5} step={0.05} format={v => `${v.toFixed(2)}x`} onChange={value => setSolarLookTuning({ opticsIntensity: value })} />
        <DevSlider label="Screen glare" value={solarLookTuning.glareIntensity} min={0} max={2.5} step={0.05} format={v => `${v.toFixed(2)}x`} onChange={value => setSolarLookTuning({ glareIntensity: value })} />
        <DevSlider label="Exposure" value={solarLookTuning.exposureScale} min={0.7} max={1.3} step={0.01} format={v => `${v.toFixed(2)}x`} onChange={value => setSolarLookTuning({ exposureScale: value })} />
      </div>
      {/* Composer grade: bloom + the (single) vignette. Threshold shift is
          additive on the computed per-context threshold; strength scales the
          live time-of-day vignette darkness (0 = off). */}
      <div className="mt-1.5 grid grid-cols-1 gap-1.5">
        <DevSlider label="Bloom strength" value={postGradeTuning.bloomIntensityScale} min={0} max={2.5} step={0.05} format={v => `${v.toFixed(2)}x`} onChange={value => setPostGradeTuning({ bloomIntensityScale: value })} />
        <DevSlider label="Bloom threshold" value={postGradeTuning.bloomThresholdShift} min={-0.3} max={0.3} step={0.01} format={v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`} onChange={value => setPostGradeTuning({ bloomThresholdShift: value })} />
        <DevSlider label="Vignette" value={postGradeTuning.vignetteStrength} min={0} max={2} step={0.05} format={v => `${v.toFixed(2)}x`} onChange={value => setPostGradeTuning({ vignetteStrength: value })} />
        <DevSlider label="Vignette reach" value={postGradeTuning.vignetteOffset} min={0} max={0.8} step={0.02} format={v => v.toFixed(2)} onChange={value => setPostGradeTuning({ vignetteOffset: value })} />
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

function CentralPeakDiagnostics() {
  const [, setRevision] = useState(0);
  const [copied, setCopied] = useState(false);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  useEffect(() => subscribeCentralPeakDev(() => setRevision(value => value + 1)), []);
  useEffect(() => subscribeDistanceScenery(() => setRevision(value => value + 1)), []);
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);
  const set = patch => {
    setCopied(false);
    setCentralPeakDev(patch);
  };
  const view = getCentralPeakView(currentZoneId);
  const appearance = resolveCentralPeakAppearance(view, centralPeakDev);
  const dirty = Object.keys(CENTRAL_PEAK_DEV_DEFAULTS)
    .some(key => centralPeakDev[key] !== CENTRAL_PEAK_DEV_DEFAULTS[key]);
  const shellDirty = Object.keys(DISTANCE_SCENERY_SHELL_DEFAULTS)
    .some(key => (
      distanceSceneryRuntime[key] !== DISTANCE_SCENERY_SHELL_DEFAULTS[key]
    ));
  const shellSet = patch => setDistanceSceneryShellTuning(patch);
  return (
    <div className="mb-3 rounded border border-amber-100/15 bg-black/15 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-100/75">Island Distance Scenery</h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              const source = centralPeakDevDiffSource();
              navigator.clipboard?.writeText(source);
              setCopied(true);
            }}
            disabled={!dirty}
            className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] hover:bg-white/15 disabled:opacity-35"
          >
            {copied ? 'copied' : 'copy values'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (distanceSceneryRuntime.mode !== 'layered') resetDistanceSceneryShellTuning();
              else resetCentralPeakDev();
            }}
            className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] hover:bg-white/15"
          >
            {(distanceSceneryRuntime.mode !== 'layered' ? shellDirty : dirty) ? 'reset' : 'defaults'}
          </button>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1 rounded border border-amber-100/15 bg-black/20 p-1">
        {[
          ['layered', 'Apron only'],
          ['shell', 'Chart shell'],
          ['hybrid', 'Combined'],
        ].map(([mode, label]) => {
          const active = distanceSceneryRuntime.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setDistanceSceneryMode(mode)}
              className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                active
                  ? 'bg-amber-200/25 text-amber-50 ring-1 ring-amber-100/35'
                  : 'text-amber-100/50 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mb-2 text-[10px] leading-snug text-amber-100/55">
        Switches instantly without moving the player or camera. Apron only uses the tuned
        direct-neighbor apron and Cerro Pajas backdrop. Chart shell isolates a full chart-derived
        continuation. Combined keeps the apron close and uses only the shell&apos;s far horizon.
        The URL records the choice for repeatable screenshots.
      </p>
      {distanceSceneryRuntime.mode !== 'layered' && (
        <div className="mb-2 rounded border border-emerald-200/20 bg-emerald-300/5 p-1.5">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-100/75">
            {distanceSceneryRuntime.mode === 'hybrid'
              ? 'Combined · active'
              : 'Chart shell · active'}
          </div>
          <p className="mb-1.5 text-[10px] leading-snug text-amber-100/45">
            {distanceSceneryRuntime.mode === 'hybrid'
              ? 'The tuned apron owns the near transition; a sunken underlap brings the chart shell up only for the far horizon.'
              : 'A single 360° surface owns the full off-map continuation. Sea is geometry below the shared water plane; land/creek/water exits follow the route graph.'}
          </p>
          <div className="mb-1.5">
            <Toggle label="Shell visible" checked={distanceSceneryRuntime.shellVisible} onChange={value => shellSet({ shellVisible: value })} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <DevSlider label="Relief" value={distanceSceneryRuntime.shellRelief} min={0.35} max={1.8} step={0.05} format={value => `${value.toFixed(2)}×`} onChange={value => shellSet({ shellRelief: value })} />
            <DevSlider label="Vertical" value={distanceSceneryRuntime.shellVertical} min={-6} max={8} step={0.25} format={value => `${value.toFixed(2)} m`} onChange={value => shellSet({ shellVertical: value })} />
            <DevSlider label="Radial scale" value={distanceSceneryRuntime.shellRadiusScale} min={0.7} max={1.4} step={0.02} format={value => `${value.toFixed(2)}×`} onChange={value => shellSet({ shellRadiusScale: value })} />
            <DevSlider label="Haze starts" value={distanceSceneryRuntime.shellHazeStart} min={50} max={300} step={5} format={value => `${value.toFixed(0)} m`} onChange={value => shellSet({ shellHazeStart: value })} />
            <DevSlider label="Haze full" value={distanceSceneryRuntime.shellHazeEnd} min={180} max={700} step={10} format={value => `${value.toFixed(0)} m`} onChange={value => shellSet({ shellHazeEnd: value })} />
            <DevSlider label="Haze strength" value={distanceSceneryRuntime.shellHazeStrength} min={0} max={1} step={0.02} format={value => value.toFixed(2)} onChange={value => shellSet({ shellHazeStrength: value })} />
            <DevSlider label="Saturation" value={distanceSceneryRuntime.shellSaturation} min={0} max={1.4} step={0.02} format={value => value.toFixed(2)} onChange={value => shellSet({ shellSaturation: value })} />
            <DevSlider label="Contrast" value={distanceSceneryRuntime.shellContrast} min={0.5} max={1.5} step={0.02} format={value => value.toFixed(2)} onChange={value => shellSet({ shellContrast: value })} />
          </div>
          <div className="mt-1.5">
            <Toggle label="Debug wireframe" checked={distanceSceneryRuntime.shellWireframe} onChange={value => shellSet({ shellWireframe: value })} />
          </div>
        </div>
      )}
      <div className="mb-2 rounded border border-sky-200/25 bg-sky-300/5 p-1.5">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-sky-100/75">Aerial perspective (all layers)</div>
        <p className="mb-1.5 text-[10px] leading-snug text-amber-100/45">
          One haze curve by true camera distance shared by the direct apron and central backdrop.
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          <DevSlider
            label="Scene fog reach"
            value={centralPeakDev.aerialPerspective}
            min={0}
            max={1}
            step={0.02}
            format={value => (value <= 0.001 ? 'scene fog' : `${Math.round(value * 100)}%`)}
            onChange={value => set({ aerialPerspective: value })}
          />
          <DevSlider label="Air clear to" value={centralPeakDev.vistaAirStart} min={0} max={160} step={5} format={value => `${value.toFixed(0)} m`} onChange={value => set({ vistaAirStart: value })} />
          <DevSlider label="Air scale" value={centralPeakDev.vistaAirScale} min={40} max={600} step={5} format={value => `${value.toFixed(0)} m`} onChange={value => set({ vistaAirScale: value })} />
          <DevSlider label="Air curve" value={centralPeakDev.vistaAirCurve} min={0.6} max={3} step={0.05} format={value => value.toFixed(2)} onChange={value => set({ vistaAirCurve: value })} />
          <DevSlider label="Air max" value={centralPeakDev.vistaAirMax} min={0} max={1} step={0.02} format={value => (value <= 0.001 ? 'off' : value.toFixed(2))} onChange={value => set({ vistaAirMax: value })} />
        </div>
        <p className="mt-2 mb-1.5 text-[10px] leading-snug text-amber-100/45">
          Sky match runs <em>after</em> scene fog. Fog colour is graded and luminance-clamped for
          local mist, while the sky dome paints a brighter horizon band — so fully hazed land lands
          on a different colour from the sky right behind it, and that edge is what reads as a
          cut-out plate. Set to 0 for the old behaviour.
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          <DevSlider label="Sky match" value={centralPeakDev.vistaSkyMatch} min={0} max={1} step={0.02} format={value => (value <= 0.001 ? 'off' : value.toFixed(2))} onChange={value => set({ vistaSkyMatch: value })} />
          <DevSlider label="Sky match full at" value={centralPeakDev.vistaSkyFull} min={60} max={600} step={10} format={value => `${value.toFixed(0)} m`} onChange={value => set({ vistaSkyFull: value })} />
          <DevSlider label="Horizon vs fog" value={centralPeakDev.vistaSkyBlend} min={0} max={1} step={0.02} format={value => value.toFixed(2)} onChange={value => set({ vistaSkyBlend: value })} />
          <DevSlider label="Horizon lift" value={centralPeakDev.vistaSkyLift} min={0.6} max={1.6} step={0.02} format={value => `${value.toFixed(2)}×`} onChange={value => set({ vistaSkyLift: value })} />
        </div>
        <p className="mt-2 mb-1.5 text-[10px] leading-snug text-amber-100/45">
          What distance does to the surface before haze is mixed over it. Haze alone can only make a
          ridge more or less visible; saturation and contrast are what make it read as a hard
          silhouette or a soft wash.
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          <DevSlider label="Saturation kept" value={centralPeakDev.vistaSaturation} min={0} max={1} step={0.02} format={value => value.toFixed(2)} onChange={value => set({ vistaSaturation: value })} />
          <DevSlider label="Contrast" value={centralPeakDev.vistaContrast} min={0.5} max={1.5} step={0.02} format={value => `${value.toFixed(2)}×`} onChange={value => set({ vistaContrast: value })} />
          <DevSlider label="Surface grain" value={centralPeakDev.vistaGrain} min={0} max={2} step={0.05} format={value => `${value.toFixed(2)}×`} onChange={value => set({ vistaGrain: value })} />
        </div>
        <p className="mt-2 mb-1.5 text-[10px] leading-snug text-amber-100/45">
          Valley haze pools low and thins toward ridgelines. It feathers the hard line where a
          distant layer meets the ground in front of it — the starkest edge in the frame, since
          detail, value and colour all change at once across it.
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          <DevSlider label="Valley haze" value={centralPeakDev.vistaValleyHaze} min={0} max={1} step={0.02} format={value => (value <= 0.001 ? 'off' : value.toFixed(2))} onChange={value => set({ vistaValleyHaze: value })} />
          <DevSlider label="Valley depth" value={centralPeakDev.vistaValleyHeight} min={4} max={80} step={2} format={value => `${value.toFixed(0)} m`} onChange={value => set({ vistaValleyHeight: value })} />
        </div>
        <p className="mt-2 mb-1.5 text-[10px] leading-snug text-amber-100/45">
          Distance softening resolves the far field the way a lens does, dissolving aliased
          ridgelines and layer seams into organic shapes. Focus sits metres from the camera with a
          very long range, so the playable area never softens. Bokeh runs at a third resolution —
          distant content has no detail to lose, so the downsample is most of the blur.
        </p>
        <div className="mb-1.5">
          <Toggle label="Distance softening" checked={centralPeakDev.distanceSoftening} onChange={value => set({ distanceSoftening: value })} />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <DevSlider label="Sharp out to" value={centralPeakDev.softeningRange} min={80} max={900} step={10} format={value => `${value.toFixed(0)} m`} onChange={value => set({ softeningRange: value })} />
          <DevSlider label="Softness" value={centralPeakDev.softeningBokeh} min={0.4} max={6} step={0.1} format={value => value.toFixed(1)} onChange={value => set({ softeningBokeh: value })} />
          <DevSlider label="Blur resolution" value={centralPeakDev.softeningResolution} min={0.2} max={1} step={0.05} format={value => `${Math.round(value * 100)}%`} onChange={value => set({ softeningResolution: value })} />
        </div>
        <div className="mt-1.5">
          <Toggle label="Debug: tint layers" checked={centralPeakDev.debugLayerTint} onChange={value => set({ debugLayerTint: value })} />
          <p className="mt-1 text-[10px] leading-snug text-amber-100/45">
            Tints the direct apron red so its handoff to local terrain can be inspected.
          </p>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <Metric label="Map distance" value={view ? `${view.distanceKm.toFixed(2)} km` : '--'} />
        <Metric label="Bearing" value={view ? `${view.bearingDegrees.toFixed(1)}°` : '--'} />
        <Metric label="Geo haze" value={appearance ? appearance.geographicHaze.toFixed(2) : '--'} />
      </div>
      <div className="mb-2">
        <Toggle label="Visible" checked={centralPeakDev.visible} onChange={value => set({ visible: value })} />
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        <DevSlider label="Width" value={centralPeakDev.widthScale} min={0.5} max={2} step={0.05} format={value => `${value.toFixed(2)}×`} onChange={value => set({ widthScale: value })} />
        <DevSlider label="Height" value={centralPeakDev.heightScale} min={0.35} max={2} step={0.05} format={value => `${value.toFixed(2)}×`} onChange={value => set({ heightScale: value })} />
        <DevSlider label="Vertical" value={centralPeakDev.verticalOffset} min={-12} max={14} step={0.5} format={value => `${value.toFixed(1)} m`} onChange={value => set({ verticalOffset: value })} />
        <DevSlider label="Near contrast" value={centralPeakDev.nearContrast} min={0.05} max={0.6} step={0.01} format={value => value.toFixed(2)} onChange={value => set({ nearContrast: value })} />
        <DevSlider label="Far contrast" value={centralPeakDev.farContrast} min={0} max={0.35} step={0.01} format={value => value.toFixed(2)} onChange={value => set({ farContrast: value })} />
        <DevSlider label="Clear through" value={centralPeakDev.hazeNearKm} min={0} max={3} step={0.1} format={value => `${value.toFixed(1)} km`} onChange={value => set({ hazeNearKm: value })} />
        <DevSlider label="Hazy by" value={centralPeakDev.hazeFarKm} min={3} max={9} step={0.1} format={value => `${value.toFixed(1)} km`} onChange={value => set({ hazeFarKm: value })} />
        <DevSlider label="Weather haze" value={centralPeakDev.weatherHaze} min={0} max={1.2} step={0.02} format={value => value.toFixed(2)} onChange={value => set({ weatherHaze: value })} />
        <DevSlider label="Base dissolve" value={centralPeakDev.baseDissolve} min={0.2} max={0.9} step={0.02} format={value => value.toFixed(2)} onChange={value => set({ baseDissolve: value })} />
        <DevSlider label="Ridge softness" value={centralPeakDev.ridgeSoftness} min={0} max={4} step={0.25} format={value => `${value.toFixed(2)} px`} onChange={value => set({ ridgeSoftness: value })} />
      </div>
      <div className="my-2 border-t border-amber-100/10 pt-2">
        <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-100/65">Neighbor Terrain Apron</h4>
        <p className="mb-2 text-[10px] leading-snug text-amber-100/45">
          The connected, low-detail continuation of each directly adjacent map. It shares the local terrain edge but has no collision or shadows.
        </p>
        <div className="mb-1.5">
          <Toggle label="Visible" checked={centralPeakDev.neighborApronVisible} onChange={value => set({ neighborApronVisible: value })} />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <DevSlider label="Relief" value={centralPeakDev.neighborApronRelief} min={0.35} max={1.8} step={0.05} format={value => `${value.toFixed(2)}×`} onChange={value => set({ neighborApronRelief: value })} />
          <DevSlider label="Vertical" value={centralPeakDev.neighborApronVertical} min={-3} max={4} step={0.1} format={value => `${value.toFixed(1)} m`} onChange={value => set({ neighborApronVertical: value })} />
          <DevSlider label="Haze onset" value={centralPeakDev.neighborApronHazeStart} min={0} max={0.9} step={0.02} format={value => `${Math.round(value * 100)}%`} onChange={value => set({ neighborApronHazeStart: value })} />
          <DevSlider label="Near haze" value={centralPeakDev.neighborApronNearHaze} min={0} max={1} step={0.02} format={value => value.toFixed(2)} onChange={value => set({ neighborApronNearHaze: value })} />
          <DevSlider label="Far haze" value={centralPeakDev.neighborApronFarHaze} min={0} max={2} step={0.05} format={value => value.toFixed(2)} onChange={value => set({ neighborApronFarHaze: value })} />
          <DevSlider label="Distance softness" value={centralPeakDev.neighborApronSoftFocus} min={0} max={1.5} step={0.05} format={value => value.toFixed(2)} onChange={value => set({ neighborApronSoftFocus: value })} />
        </div>
      </div>
    </div>
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
        <div className="flex items-center gap-1">
          <CopyTuningButton pairs={[[cloudShadeTuning, CLOUD_SHADE_DEFAULTS]]} />
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${applied > 0.005 ? 'bg-amber-200/20 text-amber-100' : 'bg-white/10 text-amber-100/60'}`}>
            {applied > 0.005 ? `applied ${applied.toFixed(2)}` : 'quiet'}
          </span>
        </div>
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

const PERF_PANEL_TABS = [
  ['monitor', 'Monitor'],
  ['quality', 'Quality'],
  ['systems', 'Systems'],
  ['visuals', 'Visuals'],
  ['physics', 'Physics'],
];

function PerfOptionRow({ label, options, value, format, onSelect }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-amber-100/70">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => (
          <button
            key={String(option)}
            type="button"
            onClick={() => onSelect(option)}
            className={`rounded border px-2 py-1 ${value === option ? 'border-amber-200 bg-amber-200 text-stone-950' : 'border-white/10 bg-black/15 hover:bg-white/10'}`}
          >
            {format ? format(option) : String(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

// Live per-source cost attribution (the ?costProbe data, now toggleable from
// the panel). Collection walks the whole scene graph every ~1.25s, so it stays
// an explicit opt-in rather than part of the always-on sampler.
function SceneCostBreakdown({ enabled, onEnabledChange, metrics }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);
  const byDrawCalls = metrics.sceneCostDrawCallBuckets || [];
  const byTriangles = metrics.sceneCostBuckets || [];
  return (
    <div className="mt-3 rounded border border-amber-100/15 bg-black/15 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-100/75">Scene Cost Breakdown</h3>
        {enabled && byDrawCalls.length > 0 && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(JSON.stringify({ byDrawCalls, byTriangles }, null, 2));
              setCopied(true);
            }}
            className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] hover:bg-white/15"
          >
            {copied ? 'copied' : 'copy JSON'}
          </button>
        )}
      </div>
      <Toggle label="Collect per-source costs (slower)" checked={enabled} onChange={onEnabledChange} />
      {enabled && byDrawCalls.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-2">
          {[
            ['Top draw calls', byDrawCalls, bucket => bucket.drawCalls],
            ['Top triangles', byTriangles, bucket => `${Math.round(bucket.triangles / 1000)}k`],
          ].map(([title, buckets, valueFor]) => (
            <div key={title}>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-100/60">{title}</div>
              <div className="grid grid-cols-1 gap-0.5">
                {buckets.slice(0, 8).map(bucket => (
                  <div key={bucket.key} className="flex items-center justify-between gap-2 rounded bg-black/20 px-1.5 py-0.5 text-[10px]">
                    <span className="truncate text-amber-100/80">{bucket.label}</span>
                    <span className="shrink-0 font-mono text-amber-100/70">{valueFor(bucket)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {enabled && !byDrawCalls.length && (
        <p className="mt-1.5 text-[10px] leading-snug text-amber-100/45">Collecting… the next sample lands within ~1.5s.</p>
      )}
    </div>
  );
}

function PerformancePanel({
  open,
  settings,
  metrics,
  physicsDebug,
  costProbe,
  onCostProbeChange,
  onChange,
  onClose,
}) {
  const [tab, setTab] = useState('monitor');
  if (!open) return null;
  // Every change is also dropped on the perf-capture timeline, so an exported
  // JSON can attribute a frame-time step to the exact knob that moved.
  const set = patch => {
    notePerfEvent('setting', patch);
    onChange(current => ({ ...current, ...patch }));
  };
  const setQuality = quality => {
    notePerfEvent('quality-preset', { quality });
    onChange(current => ({
      ...current,
      ...(QUALITY_PRESETS[quality] || QUALITY_PRESETS.performance),
      quality,
    }));
  };
  return (
    <section className="pointer-events-auto fixed right-3 top-3 z-50 max-h-[calc(100dvh-1.5rem)] w-[min(26rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-md border border-amber-100/25 bg-stone-950/88 p-3 text-amber-50 shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide">Performance</h2>
        <button type="button" onClick={onClose} className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/10">Close</button>
      </div>
      <div className="mb-3 grid grid-cols-5 gap-1 rounded border border-amber-100/15 bg-black/20 p-1">
        {PERF_PANEL_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide ${tab === id ? 'bg-amber-200/25 text-amber-50 ring-1 ring-amber-100/35' : 'text-amber-100/50 hover:bg-white/10'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'monitor' && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            <Metric label="FPS" value={metrics.fps ? Math.round(metrics.fps) : '--'} />
            <Metric label="Frame" value={metrics.frameMs ? `${metrics.frameMs.toFixed(1)}ms` : '--'} />
            <Metric label="Worst" value={metrics.worstFrameMs ? `${metrics.worstFrameMs.toFixed(0)}ms` : '--'} />
            <Metric label="DPR" value={metrics.pixelRatio ? metrics.pixelRatio.toFixed(2) : '--'} />
            <Metric label="Calls" value={metrics.sceneDrawCalls ?? '--'} />
            <Metric label="Tris" value={metrics.sceneTriangles ? `${Math.round(metrics.sceneTriangles / 1000)}k` : '0'} />
            <Metric label="Textures" value={metrics.textures ?? '--'} />
            <Metric label="Geoms" value={metrics.geometries ?? '--'} />
            <Metric label="Meshes" value={metrics.sceneMeshes ?? '--'} />
            <Metric label="Instances" value={metrics.sceneInstances ? `${Math.round(metrics.sceneInstances / 1000)}k` : '0'} />
            <Metric label="Raw calls" value={metrics.rawCalls ?? '--'} />
            <Metric label="Skinned" value={metrics.sceneSkinnedMeshes ?? '--'} />
          </div>
          <PerfMonitorSection settings={settings} />
        </>
      )}
      {tab === 'quality' && (
        <>
          <PerfOptionRow
            label="Quality"
            options={['mobile', 'performance', 'cinematic']}
            value={settings.quality}
            onSelect={setQuality}
          />
          <PerfOptionRow
            label="DPR"
            options={['default', '1x', '1.25x', '1.5x', '2x']}
            value={settings.dprMode}
            onSelect={mode => set({ dprMode: mode })}
          />
          <PerfOptionRow
            label="MSAA"
            options={[0, 2, 4]}
            value={settings.msaaSamples}
            format={samples => `${samples}x`}
            onSelect={samples => set({ msaaSamples: samples })}
          />
          <PerfOptionRow
            label="Water"
            options={WATER_QUALITY_MODES}
            value={settings.waterQuality}
            onSelect={mode => set({ waterQuality: mode })}
          />
          <PerfOptionRow
            label="Shadows"
            options={SHADOW_QUALITY_MODES}
            value={normalizeShadowQuality(settings.shadowQuality)}
            format={mode => (mode === 'ultra' ? 'very high' : mode)}
            onSelect={mode => set({ shadowQuality: mode })}
          />
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            <Toggle label="Post FX" checked={settings.postprocessing} onChange={value => set({ postprocessing: value })} />
            <Toggle label="16-bit Post" checked={settings.postHalfFloat === true} onChange={value => set({ postHalfFloat: value })} />
            <Toggle label="Ambient Occl." checked={settings.ao} onChange={value => set({ ao: value })} />
            <Toggle label="Fast Shading" checked={settings.cheapMaterials !== false} onChange={value => set({ cheapMaterials: value, foliageDrawScale: value ? 0.85 : 1 })} />
            <Toggle label="Shadows" checked={settings.shadows} onChange={value => set({ shadows: value })} />
            <Toggle label="Reflections" checked={settings.reflections} onChange={value => set({ reflections: value })} />
            <Toggle label="Adaptive DPR" checked={settings.adaptiveDpr !== false} onChange={value => set({ adaptiveDpr: value })} />
            <Toggle label="Stats" checked={settings.stats} onChange={value => set({ stats: value })} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <DevSlider
              label="Foliage draw distance"
              value={settings.foliageDrawScale ?? 1}
              min={0.5}
              max={1.15}
              step={0.05}
              format={value => `${Math.round(value * 100)}%`}
              onChange={value => set({ foliageDrawScale: value })}
            />
            {/* Authored terrain is 188 segments globally, so only caps BELOW
                188 change the resource key (the presets' 200 was a no-op). */}
            <Toggle label="Cap terrain density" checked={settings.terrainSegmentCap != null && settings.terrainSegmentCap < 188} onChange={value => set({ terrainSegmentCap: value ? 160 : null })} />
            {settings.terrainSegmentCap != null && settings.terrainSegmentCap < 188 && (
              <DevSlider
                label="Terrain segments"
                value={settings.terrainSegmentCap}
                min={64}
                max={184}
                step={8}
                format={value => `${value} (authored 188)`}
                onChange={value => set({ terrainSegmentCap: value })}
              />
            )}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-amber-100/45">
            Adaptive DPR steps resolution down under sustained low fps and back up with headroom.
            Turn it off to pin resolution while measuring another cost, or the ladder will mask the
            change you are testing.
          </p>
        </>
      )}
      {tab === 'visuals' && (
        <>
          <SolarDiagnostics settings={settings} set={set} />
          <CentralPeakDiagnostics />
          <CloudShadeDiagnostics />
        </>
      )}
      {tab === 'systems' && (
        <>
          <p className="mb-2 text-[10px] leading-snug text-amber-100/45">
            Isolation toggles: bisect a frame-time problem by switching whole systems off while
            watching the Monitor chart respond.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <Toggle label="Water" checked={settings.water} onChange={value => set({ water: value })} />
            <Toggle label="Terrain" checked={settings.terrain} onChange={value => set({ terrain: value })} />
            <Toggle label="Landmarks (POB only)" checked={settings.landmarks} onChange={value => set({ landmarks: value })} />
            <Toggle label="Atmosphere" checked={settings.atmosphere} onChange={value => set({ atmosphere: value })} />
            <Toggle label="World Details" checked={settings.worldDetails} onChange={value => set({ worldDetails: value })} />
            <Toggle label="Beagle" checked={settings.beagle} onChange={value => set({ beagle: value })} />
            <Toggle label="Specimens" checked={settings.specimens} onChange={value => set({ specimens: value })} />
            <Toggle label="Syms" checked={settings.syms} onChange={value => set({ syms: value })} />
            <Toggle label="Phys Obstacles" checked={settings.physicsObstacles} onChange={value => set({ physicsObstacles: value })} />
            <Toggle label="Phys Props" checked={settings.physicsProps} onChange={value => set({ physicsProps: value })} />
            <Toggle label="Water Splashes" checked={settings.waterSplashes} onChange={value => set({ waterSplashes: value })} />
            <Toggle label="Weather FX" checked={settings.weatherFX} onChange={value => set({ weatherFX: value })} />
            {/* splatBackdrop deliberately has no toggle: its only consumer is
                an unimplemented stub (OptionalSplatBackdrop returns null), so
                a switch here would be a lie. Re-add when the splat renderer
                lands. */}
          </div>
          <SceneCostBreakdown enabled={costProbe} onEnabledChange={onCostProbeChange} metrics={metrics} />
        </>
      )}
      {tab === 'physics' && (
        <>
          <div className="mb-2">
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
          {!physicsDebug && (
            <p className="text-[10px] leading-snug text-amber-100/45">
              Enable Physics Debug to stream the live controller readout here.
            </p>
          )}
        </>
      )}
      <p className="mt-3 text-[11px] text-amber-100/65">Press ` to toggle this panel.</p>
    </section>
  );
}

export default function ThreeDarwinGame({
  initialModeId = null,
  multiplayerSession = null,
  resumeSnapshot = null,
  openJournalOnLaunch = false,
  onExitToMenu = null,
}) {
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
  const [displayedProgress, setDisplayedProgress] = useState(
    initialModeId ? INITIAL_LAUNCH_PROGRESS : 0,
  );
  const [startupContentPhase, setStartupContentPhase] = useState(0);
  const [transitionContentPhase, setTransitionContentPhase] = useState(STARTUP_FULL_CONTENT_PHASE);
  const [openingIntroStartedAt, setOpeningIntroStartedAt] = useState(0);
  const [openingEnsembleReady, setOpeningEnsembleReady] = useState(false);
  const [playerAnimationBanksReady, setPlayerAnimationBanksReady] = useState(false);
  const [playerVisualReady, setPlayerVisualReady] = useState(false);
  const [launchOverlayDeparting, setLaunchOverlayDeparting] = useState(false);
  const [launchOverlayDismissed, setLaunchOverlayDismissed] = useState(false);
  const [hudEntranceComplete, setHudEntranceComplete] = useState(false);
  const [launchRevealSettled, setLaunchRevealSettled] = useState(false);
  const [historicalPrologueVisible, setHistoricalPrologueVisible] = useState(false);
  const [historicalPrologueAccepted, setHistoricalPrologueAccepted] = useState(false);
  const [historicalPrologueSkipRequested, setHistoricalPrologueSkipRequested] = useState(false);
  const [showPerf, setShowPerf] = useState(false);
  const [showAssetBrowser, setShowAssetBrowser] = useState(false);
  const [showAnimalAnimationLab, setShowAnimalAnimationLab] = useState(false);
  const [showDarwinAnimationLab, setShowDarwinAnimationLab] = useState(false);
  const [showMapGeographyDev, setShowMapGeographyDev] = useState(false);
  const [showTerrainSeamLab, setShowTerrainSeamLab] = useState(false);
  const [showAudioDebug, setShowAudioDebug] = useState(false);
  const [perfProbe, setPerfProbe] = useState(false);
  const [costProbe, setCostProbe] = useState(false);
  const [e2eMode, setE2EMode] = useState(false);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [skipOpeningIntro, setSkipOpeningIntro] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  // Player-facing quality choice ('auto' plus the three preset tiers). Read from
  // storage in the URL/settings effect below so server and first client render
  // agree. Owned here so the pause menu and the launch menu stay in sync.
  const [qualityPreference, setQualityPreference] = useState('auto');
  // A resumed session skips the arrival cinematic — the player has already seen
  // it, and the opening shot is written as a first landing.
  const [resumedFromSave, setResumedFromSave] = useState(false);
  const [perfSettings, setPerfSettings] = useState(getInitialPerfSettings);
  const [metrics, setMetrics] = useState({});
  // Keeps the sampler running while a perf capture is recording even if the
  // panel itself is closed, so a capture can cover uninterrupted gameplay. The
  // snapshot is a boolean, so 4Hz sample notifications cause no re-renders.
  const perfCaptureRecording = useSyncExternalStore(
    subscribePerfRuntime,
    isPerfCaptureRecording,
    () => false,
  );
  // Non-null while AdaptiveResolution holds a reduced (or restored) rung; the
  // Canvas dpr prop pins to it so parent re-renders can't undo the step.
  const [adaptiveDprApplied, setAdaptiveDprApplied] = useState(null);
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
  const launchHeavyWorkAllowedRef = useRef(true);
  const openingPreloadKeyRef = useRef(null);
  const openingEnsembleReportedRef = useRef(false);
  const hudEntranceReportedRef = useRef(false);
  const weather = useThreeGameStore(state => state.weather);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  // Zone arrivals are the single most useful annotation on a perf capture:
  // most frame-time cliffs correlate with what just streamed in.
  useEffect(() => {
    if (currentZoneId) notePerfEvent('zone', { zoneId: currentZoneId });
  }, [currentZoneId]);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const physicsDebug = useThreeGameStore(state => state.physicsDebug);
  const transition = useThreeGameStore(state => state.transition);
  const gameStarted = initialModeReady && !LAUNCH_MENU_STATES.has(launchState);
  const automationReadyMode = e2eMode || screenshotMode;
  const openingIntroActive = launchState === 'intro';
  // Terrain, DPR, postprocessing, and water targets stay on their final
  // configuration from the first covered frame. Swapping these after reveal
  // can suspend the root scene and expose the canvas clear color.
  const launchPrologueEligible = !skipOpeningIntro
    && !resumedFromSave
    && ['darwin', 'finch', 'tortoise'].includes(playableModeId);
  // Aerial framing exposes much more water and terrain than ordinary play.
  // Keep the scene-doubling reflection pass, adaptive DPR, and shadow refreshes
  // quiet until the HUD's last entrance transition has painted. Restoring the
  // selected quality on the same frame as the UI reveal was another source of
  // visible hitching even when all network requests were already cached.
  const openingRenderBudgetActive = gameStarted && !launchRevealSettled;
  const transitionRenderBudgetActive = Boolean(transition);
  const transitionReflectionPaused = Boolean(
    transition && transition.phase !== 'settling',
  );
  const scenePerfSettings = useMemo(
    () => ({
      ...perfSettings,
      ...(openingRenderBudgetActive ? { reflections: false } : null),
      shadowUpdatesPaused: openingRenderBudgetActive || transitionRenderBudgetActive,
      reflectionUpdatesPaused: openingRenderBudgetActive || transitionReflectionPaused,
    }),
    [
      openingRenderBudgetActive,
      perfSettings,
      transitionReflectionPaused,
      transitionRenderBudgetActive,
    ],
  );
  const configuredDpr = useMemo(() => dprForMode(perfSettings.dprMode), [perfSettings.dprMode]);
  // When the adaptive controller has stepped resolution, pin the Canvas dpr
  // prop to exactly that value so R3F's per-render configure() re-asserts the
  // adaptive choice instead of reverting to the configured cap.
  const renderDpr = useMemo(() => {
    if (openingRenderBudgetActive) return OPENING_RENDER_DPR;
    if (adaptiveDprApplied != null) return [adaptiveDprApplied, adaptiveDprApplied];
    return configuredDpr;
  }, [adaptiveDprApplied, configuredDpr, openingRenderBudgetActive]);
  const sky = useMemo(() => weatherSkyTint(weather), [weather]);
  const showLaunchOverlay = LAUNCH_MENU_STATES.has(launchState)
    || !sceneReady
    || !launchOverlayDismissed;
  const runtimeAudioEnabled = audioEnabled && !e2eMode && !screenshotMode;
  const gameUiVisible = gameStarted && !showLaunchOverlay && !openingIntroActive;
  const gameUiMounted = gameStarted && sceneReady;
  // Automation lanes must not leave a save behind that changes the next run.
  useSessionAutosave(gameStarted && sceneReady && !e2eMode && !screenshotMode);
  const transitionMountingDestination = Boolean(
    transition
    && transition.phase !== 'departing'
    && transition.phase !== 'chart'
  );
  const transitionCanvasPaused = Boolean(
    transition
    && (
      transition.phase === 'chart'
      || (transition.phase === 'mounting' && transitionContentPhase < STARTUP_FULL_CONTENT_PHASE)
    )
  );
  // The library is a full-screen opaque reader, so every frame drawn behind it
  // is spent on pixels nobody sees — and it was competing with pdf.js for the
  // main thread, which is what made page turns feel sticky. The delay lets the
  // book-focus camera move finish under the panel's fade-in before the freeze.
  const libraryOpen = useThreeGameStore(state => Boolean(state.readableBookSession));
  const [libraryCanvasPaused, setLibraryCanvasPaused] = useState(false);
  useEffect(() => {
    if (!libraryOpen) {
      setLibraryCanvasPaused(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setLibraryCanvasPaused(true), 420);
    return () => window.clearTimeout(timer);
  }, [libraryOpen]);
  const canvasPaused = transitionCanvasPaused || libraryCanvasPaused;
  const activeContentPhase = transitionMountingDestination
    ? transitionContentPhase
    : startupContentPhase;
  // Captures intentionally wait for the fully settled scene. Real players and
  // functional smoke unlock at the essential phase-three boundary; smoke tests
  // that need late actors can request phase six explicitly after gameplay starts.
  const loadingContentTarget = screenshotMode
    ? STARTUP_FULL_CONTENT_PHASE
    : STARTUP_OPENING_CONTENT_PHASE;
  useEffect(() => {
    if (!DEV_TOOLS_ENABLED) return undefined;
    window.__threeLaunchDebug = {
      launchState,
      sceneReady,
      loadersStable,
      playerVisualReady,
      playerAnimationBanksReady,
      startupContentPhase,
      historicalPrologueVisible,
      historicalPrologueAccepted,
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
    historicalPrologueAccepted,
    historicalPrologueVisible,
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
    // Restore before setPlayableMode: restoreSession replaces the whole state
    // object, and setPlayableMode then resolves the toolbar/spawn for the
    // restored region. A snapshot that fails validation falls through to a
    // normal fresh start rather than half-applying.
    const restored = resumeSnapshot
      ? useThreeGameStore.getState().restoreSession(resumeSnapshot)
      : false;
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
    window.__threeLaunchHandoff = {
      startedAt: bootStartedAt.current,
      events: [],
    };
    recordLaunchHandoffEvent('expedition-start', {
      modeId: initialModeId,
      resumed: restored,
    });
    setInitialModeReady(true);
    if (restored) setResumedFromSave(true);
  }, [initialModeId, multiplayerSession, resumeSnapshot]);

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
      if (cancelled || index >= CONTENT_MOUNT_STEPS.length) return;
      const phase = CONTENT_MOUNT_STEPS[index];
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
    if (DEV_TOOLS_ENABLED && params.has('terrainSeams')) {
      setShowTerrainSeamLab(true);
    }
    if (DEV_TOOLS_ENABLED && params.has('ecologyDebug')) {
      const requestedSpecies = params.get('ecologyDebug');
      if (requestedSpecies && requestedSpecies !== '1') setEcologyDebugSpecies(requestedSpecies);
      setEcologyDebugEnabled(true);
    }
    // A stored player choice stands in for device detection. An explicit
    // `?quality=` in the URL still wins inside settingsFromUrlSearch.
    const storedQuality = readQualityPreference();
    setQualityPreference(storedQuality);
    setPerfSettings(settingsFromUrlSearch(
      window.location.search,
      resolveQualityPreference(storedQuality, recommendedQualityFromDevice()),
    ));
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
      // Tab recenters the camera during play, so swallow the browser's focus
      // move — but only while gameplay actually owns the keyboard and focus is
      // still on the page body/canvas. Once a modal is open or the player has
      // focused a HUD control, Tab must traverse the interface normally;
      // blanket-preventing it made the whole game unreachable by keyboard.
      if (event.code === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const focusedInterface = event.target instanceof Element
          && event.target !== document.body
          && event.target.closest('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!isGameplayInputBlocked() && !focusedInterface) {
          event.preventDefault();
        }
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
      if (event.repeat) return;
      if (event.shiftKey) {
        setShowTerrainSeamLab(value => !value);
      } else {
        setShowPerf(value => !value);
      }
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
      const loaderBusy = loadingManagerIsBusy(assetProgress);

      if (loaderBusy) {
        loaderQuietSince.current = 0;
        setLoadersStable(false);
      } else {
        if (!loaderQuietSince.current) loaderQuietSince.current = now;
        const quietFor = now - loaderQuietSince.current;
        setLoadersStable(quietFor >= BOOT_LOADER_STABLE_MS && elapsed >= BOOT_MIN_LOADING_MS);
      }

      const progressTime = Math.min(1, elapsed / 2200);
      const elapsedEase = progressTime * progressTime * (3 - 2 * progressTime);
      const assetTarget = loaderBusy
        ? 14 + rawProgress * 0.62
        : 88 + Math.min(8, ((loaderQuietSince.current ? now - loaderQuietSince.current : 0) / BOOT_LOADER_STABLE_MS) * 8);
      // The splash owns a short, legible presentation beat even though the
      // historical prologue continues covering real scene work. Its bar should
      // therefore complete deliberately instead of freezing in the seventies
      // when the prologue arrives.
      const presentationTarget = INITIAL_LAUNCH_PROGRESS
        + (100 - INITIAL_LAUNCH_PROGRESS) * elapsedEase;
      const target = Math.min(100, Math.max(presentationTarget, assetTarget));
      setDisplayedProgress(current => {
        const smoothing = target >= 99.99 ? 0.38 : 0.18;
        const next = Math.max(current, current + (target - current) * smoothing);
        return target >= 99.99 && 100 - next < 0.12 ? 100 : next;
      });
    };

    const handle = window.setInterval(tick, 80);
    tick();
    return () => window.clearInterval(handle);
  }, [
    assetProgress.active,
    assetProgress.loaded,
    assetProgress.progress,
    assetProgress.total,
    gameStarted,
    sceneReady,
  ]);

  useEffect(() => {
    if (
      !gameStarted
      || launchState !== 'loading'
      || sceneReady
      || playableModeId !== 'darwin'
      || !runtimeAudioEnabled
    ) return undefined;

    let cancelled = false;
    void activatePostOfficeBayAudio({ preloadEffects: false }).then(running => {
      if (!cancelled && running) startLaunchAmbientPrelude();
    });
    return () => {
      cancelled = true;
    };
  }, [
    gameStarted,
    launchState,
    playableModeId,
    runtimeAudioEnabled,
    sceneReady,
  ]);

  const openCharacterSelect = () => {
    setLaunchState('character');
  };

  const beginNewExpedition = (modeId = 'darwin', { reset = false } = {}) => {
    if (runtimeAudioEnabled) {
      void activatePostOfficeBayAudio({ preloadEffects: false });
    }
    if (reset) {
      // A deliberate new expedition supersedes the old resume point; leaving it
      // in storage would let a reload drop the player back into the old run.
      clearSessionSnapshot();
      setResumedFromSave(false);
      useThreeGameStore.getState().resetExpedition();
    }
    useThreeGameStore.getState().setPlayableMode(modeId);
    bootStartedAt.current = performance.now();
    loaderQuietSince.current = 0;
    setDisplayedProgress(INITIAL_LAUNCH_PROGRESS);
    setLoadersStable(false);
    setSceneReady(false);
    setStartupContentPhase(0);
    setOpeningIntroStartedAt(0);
    setOpeningEnsembleReady(false);
    setHistoricalPrologueVisible(false);
    setHistoricalPrologueAccepted(false);
    setHistoricalPrologueSkipRequested(false);
    setPlayerAnimationBanksReady(false);
    // A restart keeps the already-committed Darwin instance mounted; a fresh
    // launch must wait for its first real model-scene commit.
    if (!gameStarted) setPlayerVisualReady(false);
    setLaunchOverlayDeparting(false);
    setLaunchOverlayDismissed(false);
    setHudEntranceComplete(false);
    setLaunchRevealSettled(false);
    launchHeavyWorkAllowedRef.current = true;
    openingPreloadKeyRef.current = null;
    openingEnsembleReportedRef.current = false;
    hudEntranceReportedRef.current = false;
    if (typeof window !== 'undefined') {
      window.__threeLaunchHandoff = {
        startedAt: performance.now(),
        events: [],
      };
      recordLaunchHandoffEvent('expedition-start', { modeId });
    }
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

  // Applies a player-chosen quality tier live. Rebuilt through
  // settingsFromUrlSearch with `quality` overridden so every other URL toggle
  // (?noWater, ?shadowQuality=…) is preserved, and so an explicit choice wins
  // over a `?quality=` left in the address bar.
  const handleQualityPreferenceChange = useCallback(choice => {
    const preference = writeQualityPreference(choice);
    setQualityPreference(preference);
    const resolved = resolveQualityPreference(preference, recommendedQualityFromDevice());
    const params = new URLSearchParams(window.location.search);
    params.set('quality', resolved);
    setPerfSettings(settingsFromUrlSearch(`?${params.toString()}`, resolved));
  }, []);

  const restartExpedition = () => {
    beginNewExpedition('darwin', { reset: true });
  };

  const returnToMainMenu = () => {
    // Capture the resume point before the reset wipes it, so leaving to the menu
    // does not throw the session away.
    useThreeGameStore.getState().saveSession();
    if (onExitToMenu) {
      // Hand back to the launch shell so the player gets the real menu, which
      // re-reads the save and can offer Continue. The in-runtime menu below is
      // the fallback for hosts that do not provide an exit path.
      useThreeGameStore.getState().resetExpedition();
      onExitToMenu();
      return;
    }
    useThreeGameStore.getState().resetExpedition();
    loaderQuietSince.current = 0;
    setDisplayedProgress(0);
    setLoadersStable(false);
    setSceneReady(false);
    setStartupContentPhase(0);
    setOpeningIntroStartedAt(0);
    setOpeningEnsembleReady(false);
    setHistoricalPrologueVisible(false);
    setHistoricalPrologueAccepted(false);
    setHistoricalPrologueSkipRequested(false);
    setPlayerAnimationBanksReady(false);
    setPlayerVisualReady(false);
    setLaunchOverlayDeparting(false);
    setLaunchOverlayDismissed(false);
    setHudEntranceComplete(false);
    setLaunchRevealSettled(false);
    launchHeavyWorkAllowedRef.current = true;
    openingPreloadKeyRef.current = null;
    openingEnsembleReportedRef.current = false;
    hudEntranceReportedRef.current = false;
    setLaunchState('menu');
  };

  const markSceneReady = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    // A resumed session is not a first landing, so the arrival cinematic is
    // skipped along with the usual automation/query-flag skips.
    const skipIntro = skipOpeningIntro || resumedFromSave || skipOpeningIntroFromParams(params);
    setSceneReady(true);
    setDisplayedProgress(100);
    recordLaunchHandoffEvent('essential-scene-ready');
    if (skipIntro) {
      setOpeningIntroStartedAt(0);
      setLaunchState('playing');
    } else {
      // Hold on the composed gameplay camera while the mode-specific prologue
      // appears over it. Accepting the prologue lifts the veil into play.
      setOpeningIntroStartedAt(0);
      setLaunchState('intro');
    }
  }, [resumedFromSave, skipOpeningIntro]);

  const markOpeningEnsembleReady = useCallback(() => {
    if (openingEnsembleReportedRef.current) return;
    openingEnsembleReportedRef.current = true;
    setOpeningEnsembleReady(true);
    recordLaunchHandoffEvent('opening-ensemble-ready');
  }, []);

  const markHudEntranceComplete = useCallback(() => {
    if (hudEntranceReportedRef.current) return;
    hudEntranceReportedRef.current = true;
    setHudEntranceComplete(true);
    recordLaunchHandoffEvent('hud-entrance-complete');
  }, []);

  const recordHudEntranceStage = useCallback(stage => {
    if (stage > 0) recordLaunchHandoffEvent(`hud-stage-${stage}`);
  }, []);

  const commitHistoricalPrologueAcceptance = useCallback(() => {
    launchHeavyWorkAllowedRef.current = false;
    recordLaunchHandoffEvent('prologue-accepted');
    setHistoricalPrologueAccepted(true);
  }, []);

  const acceptHistoricalPrologue = useCallback(() => {
    if (!sceneReady || !openingEnsembleReady) return;
    commitHistoricalPrologueAcceptance();
  }, [commitHistoricalPrologueAcceptance, openingEnsembleReady, sceneReady]);

  const skipHistoricalPrologue = useCallback(() => {
    setHistoricalPrologueSkipRequested(true);
    recordLaunchHandoffEvent('prologue-skip-requested');
    if (sceneReady && openingEnsembleReady) commitHistoricalPrologueAcceptance();
  }, [commitHistoricalPrologueAcceptance, openingEnsembleReady, sceneReady]);

  useEffect(() => {
    if (!automationReadyMode || !gameStarted || sceneReady) return undefined;
    const handle = window.setInterval(() => {
      const startedAt = bootStartedAt.current || performance.now();
      const minimumWait = screenshotMode && !e2eMode
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

  // Normal readiness still waits for the critical loader set to become quiet,
  // the player GLB/banks to commit, terrain to settle, and the opening shaders
  // to compile. This deadline is the failure path: procedural/player fallbacks
  // and the phase-three scene are already playable, so an optional request that
  // is slow or never resolves must not leave the prologue veil up forever.
  useEffect(() => {
    if (
      automationReadyMode
      || !gameStarted
      || sceneReady
      || launchState !== 'loading'
    ) return undefined;
    const startedAt = bootStartedAt.current || performance.now();
    const wait = Math.max(
      0,
      BOOT_DEGRADED_READY_TIMEOUT_MS - (performance.now() - startedAt),
    );
    const handle = window.setTimeout(() => {
      if (startupContentPhase < loadingContentTarget) return;
      if (!document.querySelector('canvas')) return;
      markSceneReady();
    }, wait);
    return () => window.clearTimeout(handle);
  }, [
    automationReadyMode,
    gameStarted,
    launchState,
    loadingContentTarget,
    markSceneReady,
    sceneReady,
    startupContentPhase,
  ]);

  // The splash remains fully visible through a real 100% bar and a short
  // completion hold. The prologue then becomes useful cover for the expensive
  // tail of scene preparation without making the opening bar look abandoned.
  useEffect(() => {
    if (!gameStarted || !launchPrologueEligible || historicalPrologueVisible) return undefined;
    if (displayedProgress < 100) return undefined;
    const elapsed = performance.now() - (bootStartedAt.current || performance.now());
    const timer = window.setTimeout(() => setHistoricalPrologueVisible(true),
      Math.max(0, HISTORICAL_PROLOGUE_SPLASH_MIN_MS - elapsed)
        + HISTORICAL_PROLOGUE_SPLASH_COMPLETE_HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [
    displayedProgress,
    gameStarted,
    historicalPrologueVisible,
    launchPrologueEligible,
  ]);

  useEffect(() => {
    if (
      !sceneReady
      || !openingEnsembleReady
      || !historicalPrologueSkipRequested
      || historicalPrologueAccepted
    ) return;
    commitHistoricalPrologueAcceptance();
  }, [
    commitHistoricalPrologueAcceptance,
    historicalPrologueAccepted,
    historicalPrologueSkipRequested,
    openingEnsembleReady,
    sceneReady,
  ]);

  useEffect(() => {
    if (!sceneReady || !launchPrologueEligible || openingEnsembleReady) return undefined;
    const handle = window.setTimeout(() => {
      openingEnsembleReportedRef.current = true;
      recordLaunchHandoffEvent('opening-ensemble-degraded-ready');
      setOpeningEnsembleReady(true);
    }, OPENING_ENSEMBLE_READY_TIMEOUT_MS);
    return () => window.clearTimeout(handle);
  }, [launchPrologueEligible, openingEnsembleReady, sceneReady]);

  useEffect(() => {
    if (
      !sceneReady
      || launchOverlayDismissed
      || (launchPrologueEligible && !historicalPrologueAccepted)
    ) return undefined;
    const completionHold = historicalPrologueAccepted
      ? HISTORICAL_PROLOGUE_ACCEPT_HOLD_MS
      : LAUNCH_COMPLETION_HOLD_MS;
    const departHandle = window.setTimeout(() => {
      launchHeavyWorkAllowedRef.current = false;
      recordLaunchHandoffEvent('overlay-departing');
      setLaunchOverlayDeparting(true);
    }, completionHold);
    const exitDuration = historicalPrologueAccepted
      ? HISTORICAL_PROLOGUE_EXIT_MS
      : LAUNCH_OVERLAY_FADE_MS;
    const dismissHandle = window.setTimeout(() => {
      if (openingIntroActive && historicalPrologueAccepted) {
        // The historical page now lifts directly onto the composed gameplay
        // camera. Keeping that view still makes the translucent reveal feel
        // continuous and avoids following it with a redundant aerial fly-in.
        setLaunchState('playing');
      } else if (openingIntroActive) {
        setOpeningIntroStartedAt(performance.now());
      }
      recordLaunchHandoffEvent('overlay-dismissed');
      setLaunchOverlayDismissed(true);
    }, completionHold + exitDuration);
    return () => {
      window.clearTimeout(departHandle);
      window.clearTimeout(dismissHandle);
    };
  }, [
    historicalPrologueAccepted,
    launchOverlayDismissed,
    openingIntroActive,
    launchPrologueEligible,
    sceneReady,
  ]);

  useEffect(() => {
    if (!gameStarted || launchState !== 'loading') return undefined;

    // Mount exactly one content group per idle window while the loading overlay
    // is still opaque. This lets GLB parsing, texture uploads, Rapier setup, and
    // shader discovery settle before the curtain/camera sequence begins.
    return scheduleStagedContentPhases({
      steps: INTRO_LOADING_STEPS.filter(phase => phase <= loadingContentTarget),
      timings: INTRO_LOADING_PHASE_TIMINGS_MS,
      idleTimeoutMs: 140,
      commitPhase: phase => setStartupContentPhase(current => Math.max(current, phase)),
    });
  }, [gameStarted, launchState, loadingContentTarget]);

  // Start current-zone actor requests one at a time once the essential
  // phase-three scene is stable. The historical prologue supplies several
  // seconds of opaque cover; skip-intro launches use the same reveal guard to
  // pause this queue until the HUD has finished.
  useEffect(() => {
    if (!gameStarted || !sceneReady) return undefined;
    const preloadKey = `${bootStartedAt.current}:${currentZoneId}`;
    if (openingPreloadKeyRef.current === preloadKey) return undefined;
    openingPreloadKeyRef.current = preloadKey;
    let cancelled = false;
    let idleHandle = null;
    let timeoutHandle = null;
    const specimenAssetIds = getThreeSpecimens(currentZoneId)
      .map(getSpecimenPreloadAssetId)
      .filter(Boolean);
    const ids = Array.from(new Set(['syms', ...specimenAssetIds]));
    let index = 0;

    const scheduleNext = delay => {
      if (cancelled || index >= ids.length) return;
      timeoutHandle = window.setTimeout(() => {
        timeoutHandle = null;
        if (cancelled) return;
        if (typeof window.requestIdleCallback === 'function') {
          idleHandle = window.requestIdleCallback(beginPreload, { timeout: 800 });
        } else {
          beginPreload();
        }
      }, delay);
    };
    const beginPreload = () => {
      idleHandle = null;
      if (cancelled) return;
      if (!launchHeavyWorkAllowedRef.current) {
        scheduleNext(90);
        return;
      }
      const id = ids[index];
      preloadModelAssets([id]);
      index += 1;
      recordLaunchHandoffEvent('opening-asset-preload', { zoneId: currentZoneId, id });
      scheduleNext(280);
    };
    scheduleNext(0);
    return () => {
      cancelled = true;
      if (idleHandle != null) window.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
    };
  }, [currentZoneId, gameStarted, sceneReady]);

  // Mount one remaining content family per bounded idle window. The scheduler
  // pauses while the launch veil and HUD reveal are animating, then resumes
  // with requestIdleCallback timeouts so a continuously-rendering WebGL page
  // can never starve the specimen/NPC phases.
  useEffect(() => {
    if (!gameStarted || !sceneReady) return undefined;
    const revealProtected = historicalPrologueAccepted
      || launchOverlayDeparting
      || launchOverlayDismissed;
    if (revealProtected && !launchRevealSettled) return undefined;
    const steps = CONTENT_MOUNT_STEPS.filter(
      phase => phase > Math.max(loadingContentTarget, startupContentPhase),
    );
    if (!steps.length) return undefined;
    return scheduleStagedContentPhases({
      steps,
      timings: steps.map(
        (_, index) => STARTUP_STREAM_FIRST_STEP_MS + index * STARTUP_STREAM_STEP_MS,
      ),
      idleTimeoutMs: STARTUP_STREAM_IDLE_TIMEOUT_MS,
      commitPhase: phase => {
        recordLaunchHandoffEvent(`content-phase-${phase}`);
        setStartupContentPhase(current => Math.max(current, phase));
      },
    });
  }, [
    gameStarted,
    historicalPrologueAccepted,
    launchOverlayDeparting,
    launchOverlayDismissed,
    launchRevealSettled,
    loadingContentTarget,
    sceneReady,
  ]);

  useEffect(() => {
    if (!hudEntranceComplete || launchRevealSettled) return undefined;
    const handle = window.setTimeout(() => {
      launchHeavyWorkAllowedRef.current = true;
      setLaunchRevealSettled(true);
      recordLaunchHandoffEvent('launch-reveal-settled');
    }, HUD_POST_REVEAL_QUIET_MS);
    return () => window.clearTimeout(handle);
  }, [hudEntranceComplete, launchRevealSettled]);

  useEffect(() => {
    if (!runtimeAudioEnabled || launchState !== 'playing' || !launchRevealSettled) return undefined;
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
  }, [launchRevealSettled, launchState, runtimeAudioEnabled]);

  return (
    <MultiplayerProvider session={multiplayerSession}>
    <main className="three-game-shell fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-stone-950 text-amber-50">
      <OpeningPerformanceProbe
        enabled={DEV_TOOLS_ENABLED || perfProbe}
        active={(
          (openingIntroActive && openingIntroStartedAt > 0)
          || historicalPrologueAccepted
          || launchOverlayDeparting
          || launchOverlayDismissed
        ) && !launchRevealSettled}
        sequenceId={bootStartedAt.current || openingIntroStartedAt}
        loadStartedAt={bootStartedAt.current}
        contentPhase={startupContentPhase}
      />
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
            frameloop={canvasPaused ? 'never' : 'always'}
            /* Always-on object form, for two reasons: (a) a boolean makes R3F
               re-assert PCFSoftShadowMap on every parent re-render, clobbering
               the PCFShadowMap set in onCreated (see comment there); (b) the
               perf-panel Shadows toggle works by un-setting castShadow on the
               sun light, which triggers the material recompile that flipping
               shadowMap.enabled never does. */
            shadows={SHADOW_MAP_CONFIG}
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
              // three r182 dropped PCFSoftShadowMap from the shader define
              // table, so requesting it silently compiles unfiltered BASIC
              // (1-tap) shadows. PCFShadowMap is the filtered path (Vogel-disk
              // 5-sample hardware PCF) and the only mode that honors
              // shadow.radius, which the weather-driven softness in
              // outdoorLighting.js depends on.
              gl.shadowMap.type = PCFShadowMap;
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
                actorMotionPaused={!gameUiVisible || Boolean(transition)}
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
            <OpeningVisualReadySignal
              active={gameStarted
                && sceneReady
                && !openingEnsembleReady}
              sequenceId={`opening-ensemble:${bootStartedAt.current || 'opening-load'}`}
              contentReady={startupContentPhase >= STARTUP_FULL_CONTENT_PHASE}
              segmentCap={scenePerfSettings.terrainSegmentCap}
              verifyOpeningActors
              onReady={markOpeningEnsembleReady}
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
              halfFloat={scenePerfSettings.postHalfFloat === true}
              multisampling={scenePerfSettings.msaaSamples ?? DEFAULT_PERF_SETTINGS.msaaSamples}
              underwaterAmount={underwaterAmount}
            />
            <AdaptiveResolution
              enabled={sceneReady
                && launchRevealSettled
                && !openingIntroActive
                && startupContentPhase >= STARTUP_FULL_CONTENT_PHASE
                && perfSettings.adaptiveDpr !== false}
              maxDpr={configuredDpr[1]}
              onApplied={setAdaptiveDprApplied}
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
              enabled={showPerf || perfProbe || perfCaptureRecording}
              includeCosts={costProbe}
              onSample={sample => {
                notePerfSample(sample);
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
          active={openingIntroActive && !historicalPrologueVisible}
          sequenceId={openingIntroStartedAt}
        />
        <OpeningCinematicVeil
          active={openingIntroActive}
          sequenceId={openingIntroStartedAt}
          durationMs={OPENING_DURATION_MS}
        />
        {gameStarted && <ZoneTransitionOverlay />}
        {gameUiMounted && (
          <ThreeHUD
            onTogglePerf={() => setShowPerf(value => !value)}
            onRestartExpedition={restartExpedition}
            onReturnToMainMenu={returnToMainMenu}
            audioEnabled={audioEnabled}
            onAudioEnabledChange={handleAudioEnabledChange}
            quality={qualityPreference}
            onQualityChange={handleQualityPreferenceChange}
            openJournalOnLaunch={openJournalOnLaunch}
            entranceActive={gameUiVisible}
            onEntranceStageChange={recordHudEntranceStage}
            onEntranceComplete={markHudEntranceComplete}
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
        {DEV_TOOLS_ENABLED && gameUiVisible && (
          <TerrainSeamDevPanel open={showTerrainSeamLab} onClose={() => setShowTerrainSeamLab(false)} />
        )}
        {DEV_TOOLS_ENABLED && gameUiVisible && <WaterDevPanel />}
        {gameUiVisible && <AudioDebugPanel open={showAudioDebug} onClose={closeAudioDebug} />}
        {DEV_TOOLS_ENABLED && (
          <PerformancePanel
            open={gameUiVisible && showPerf}
            settings={perfSettings}
            metrics={metrics}
            physicsDebug={physicsDebug}
            costProbe={costProbe}
            onCostProbeChange={setCostProbe}
            onChange={setPerfSettings}
            onClose={() => setShowPerf(false)}
          />
        )}
        {showLaunchOverlay && (
          <LaunchOverlay
            mode={LAUNCH_MENU_STATES.has(launchState) ? launchState : 'loading'}
            departing={gameStarted && launchOverlayDeparting}
            blackout={launchPrologueEligible && historicalPrologueVisible}
            historicalPrologue={{
              active: launchPrologueEligible && historicalPrologueVisible,
              modeId: playableModeId,
              sceneReady: sceneReady && openingEnsembleReady,
              departing: gameStarted && launchOverlayDeparting,
              skipRequested: historicalPrologueSkipRequested,
              onBeginExploring: acceptHistoricalPrologue,
              onSkip: skipHistoricalPrologue,
            }}
            progress={displayedProgress}
            selectedModeId={initialModeId || playableModeId}
            onNewExpedition={openCharacterSelect}
            onModeSelect={beginNewExpedition}
            onBack={() => setLaunchState('menu')}
            onSettings={() => setLaunchState('settings')}
            onControls={() => setLaunchState('controls')}
            onAbout={() => setLaunchState('about')}
            audioEnabled={audioEnabled}
            onAudioEnabledChange={handleAudioEnabledChange}
            quality={qualityPreference}
            onQualityChange={handleQualityPreferenceChange}
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
