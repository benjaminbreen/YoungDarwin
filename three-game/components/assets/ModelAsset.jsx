'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getModelAsset, modelAssets } from '../../modelAssets';
import { applyFoliageMotion } from '../scene/ecology/foliageMotion';

const DEFAULT_IMPORTED_SHADOW_CASTERS = new Set([
  'darwin',
  'darwinCandidate2',
  'darwinTripo',
  'darwin4',
  'darwin5',
  'syms',
]);

function importedAssetCastsShadow(assetId, asset) {
  if (asset.castShadow !== undefined) return Boolean(asset.castShadow);
  return DEFAULT_IMPORTED_SHADOW_CASTERS.has(assetId);
}

function normalizeImportedMaterials(scene, asset, motion = null) {
  if (!asset.normalizeMaterials) return;
  scene.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material) return;
      material.side = THREE.FrontSide;
      material.toneMapped = false;
      if ('metalness' in material) material.metalness = Math.min(material.metalness || 0, 0.02);
      if ('roughness' in material) material.roughness = Math.max(material.roughness || 0, 0.72);
      if (material.color) {
        material.color.lerp(new THREE.Color('#f1dfbd'), asset.materialLift || 0.18);
      }
      if (material.emissive) {
        material.emissive.set(asset.materialEmissive || '#241c12');
        material.emissiveIntensity = asset.materialEmissiveIntensity ?? 0.22;
      }
      if (motion) applyFoliageMotion(material, object.geometry, motion);
      material.needsUpdate = true;
    });
  });
}

function prepareImportedScene(scene, assetId, asset) {
  const castShadow = importedAssetCastsShadow(assetId, asset);
  const receiveShadow = asset.receiveShadow === true;
  const cullStaticMeshes = asset.frustumCulled !== false;
  const cullSkinnedMeshes = asset.frustumCulled === true;
  const isCharacterAsset = DEFAULT_IMPORTED_SHADOW_CASTERS.has(assetId);
  scene.traverse(object => {
    if (!object.isMesh) return;
    object.frustumCulled = (object.isSkinnedMesh || isCharacterAsset) ? cullSkinnedMeshes : cullStaticMeshes;
    object.castShadow = castShadow;
    object.receiveShadow = receiveShadow;
  });
  return scene;
}

function applyDamageFlash(scene, strength = 0) {
  const amount = THREE.MathUtils.clamp(strength, 0, 1);
  const flashColor = new THREE.Color('#ff3b2f');
  scene.traverse(object => {
    if (!object.isMesh || object.userData.noTint) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material) return;
      if (!material.userData.damageFlashBase) {
        material.userData.damageFlashBase = {
          color: material.color?.clone?.() || null,
          emissive: material.emissive?.clone?.() || null,
          emissiveIntensity: material.emissiveIntensity ?? 0,
        };
      }
      const base = material.userData.damageFlashBase;
      if (material.color && base.color) {
        material.color.copy(base.color).lerp(flashColor, amount * 0.78);
      }
      if (material.emissive) {
        material.emissive.copy(base.emissive || new THREE.Color('#000000')).lerp(flashColor, amount * 0.68);
        material.emissiveIntensity = base.emissiveIntensity + amount * 0.92;
      }
      material.needsUpdate = true;
    });
  });
}

// A soft sky-gradient image-based light, built once. Player materials sample it
// for a Fresnel-weighted grazing sheen so wool/cotton/leather pick up ambient
// specular instead of rendering as dead-matte "velvet" — the scene has no other
// envMap. Cool skylight up top + a warm ground bounce below reads like the open
// island rather than a flat white studio (the look RoomEnvironment gave). The
// PointLight-driven scene tone still dominates; this only seasons the spec.
function buildSkyGradientEnvScene() {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color('#90a6c2') },     // cool skylight
      uHorizon: { value: new THREE.Color('#ccbfa6') },  // neutral-warm horizon
      uBottom: { value: new THREE.Color('#4a4136') },   // dim warm ground bounce
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
      void main() {
        float h = vDir.y;
        vec3 col = h >= 0.0
          ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.6))
          : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.5));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
  return scene;
}

let cachedPlayerEnv = null;
function getPlayerEnvMap(renderer) {
  if (cachedPlayerEnv) return cachedPlayerEnv;
  if (!renderer) return null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = buildSkyGradientEnvScene();
  cachedPlayerEnv = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  envScene.traverse(obj => {
    if (!obj.isMesh) return;
    obj.geometry.dispose();
    obj.material.dispose();
  });
  return cachedPlayerEnv;
}

// Sidecar textures (roughness/normal/enhanced-albedo) loaded by URL, cached per
// session. Configured to match how GLTFLoader imports the baseColor map so they
// align on the same UVs: flipY=false (glTF convention). Data maps (roughness,
// normal) are linear (NoColorSpace); an albedo override is sRGB. The image fills
// in async; onLoad bumps needsUpdate to upload it.
const playerDataTextures = new Map();
function getPlayerDataTexture(url, srgb = false) {
  const key = (srgb ? 's:' : 'd:') + url;
  let tex = playerDataTextures.get(key);
  if (tex) return tex;
  tex = new THREE.TextureLoader().load(url, t => { t.needsUpdate = true; });
  tex.flipY = false;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  playerDataTextures.set(key, tex);
  return tex;
}

// Player-only material polish: a warm fresnel rim added to emissive (so it
// glows on silhouette edges regardless of scene lighting), an optional
// roughness override, and an optional subtle envMap sheen (envMapIntensity).
// Layered on top of normalizeImportedMaterials; gated by asset.materialUpgrade
// so NPCs/foliage are untouched. Idempotent per material.
function applyPlayerMaterialUpgrade(scene, asset, renderer) {
  const cfg = asset.materialUpgrade;
  if (!cfg) return;
  const rimColor = new THREE.Color(cfg.rimColor || '#ffdca8');
  const rimPower = cfg.rimPower ?? 3.0;
  const rimIntensity = cfg.rimIntensity ?? 0.6;
  const envMap = cfg.envMapIntensity ? getPlayerEnvMap(renderer) : null;
  const roughMap = cfg.roughnessMapUrl ? getPlayerDataTexture(cfg.roughnessMapUrl) : null;
  const albedoMap = cfg.albedoMapUrl ? getPlayerDataTexture(cfg.albedoMapUrl, true) : null;
  const normalMap = cfg.normalMapUrl ? getPlayerDataTexture(cfg.normalMapUrl) : null;
  scene.traverse(object => {
    if (!object.isMesh || object.userData.noTint) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material || material.userData.playerUpgradeApplied) return;
      // A sidecar roughness map drives roughness absolutely (factor = 1, the map
      // bakes per-material values); otherwise fall back to the scalar override.
      if (roughMap && 'roughnessMap' in material) {
        material.roughnessMap = roughMap;
        material.roughness = 1.0;
      } else if (cfg.roughness !== undefined && 'roughness' in material) {
        material.roughness = cfg.roughness;
      }
      // Optional enhanced-albedo swap + a gentle derived micro-detail normal map
      // (the model ships albedo-only; this adds tactile surface relief).
      if (albedoMap && 'map' in material) material.map = albedoMap;
      if (normalMap && 'normalMap' in material) {
        material.normalMap = normalMap;
        const ns = cfg.normalScale ?? 0.5;
        material.normalScale = new THREE.Vector2(ns, ns);
      }
      if (envMap && 'envMap' in material) {
        material.envMap = envMap;
        material.envMapIntensity = cfg.envMapIntensity;
      }
      // Opt-in tonemapping (normalize sets it false for the cel look). true runs
      // the player through the same ACES curve as the world so he sits *in* the
      // scene instead of on top of it — at the cost of softening the emissive rim.
      if (cfg.toneMapped !== undefined) material.toneMapped = cfg.toneMapped;
      const prevHook = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        if (prevHook) prevHook(shader, renderer);
        shader.uniforms.uRimColor = { value: rimColor };
        shader.uniforms.uRimPower = { value: rimPower };
        shader.uniforms.uRimIntensity = { value: rimIntensity };
        shader.fragmentShader = shader.fragmentShader
          .replace(
            'void main() {',
            'uniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimIntensity;\nvoid main() {',
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
  {
    float rimDot = 1.0 - clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 );
    totalEmissiveRadiance += uRimColor * pow( rimDot, uRimPower ) * uRimIntensity;
  }`,
          );
      };
      material.userData.playerUpgradeApplied = true;
      material.needsUpdate = true;
    });
  });
}

function normalizeClipName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function assetLoadUrl(asset) {
  if (!asset?.cacheKey) return asset?.path;
  return `${asset.path}?v=${encodeURIComponent(asset.cacheKey)}`;
}

const ONE_SHOT_CLIPS = new Set([
  'startWalking',
  'stopWalking',
  'idleFidget',
  'standToCrouch',
  'crouchToStand',
  'torchStandToCrouch',
  'torchCrouchToStand',
  'standToCover',
  'coverToStand',
  'turnLeft90',
  'turnRight90',
  'torchTurnLeft90',
  'torchTurnRight90',
  'torchCrouchTurnLeft90',
  'torchCrouchTurnRight90',
  'runToStop',
  'runningTurnLeft',
  'runningTurnRight',
  'standingJump',
  'standingJumpShort',
  'standingJumpHigh',
  'runningJump',
  'jumpTakeoff',
  'jump',
  'runJump',
  'climbJump',
  'sprintToWallClimb',
  'climbingUpWall',
  'highJump',
  'vault',
  'runningSlide',
  'fallingIntoPool',
  'jumpFromWall',
  'swimToEdge',
  'stumble',
  'runningTurn180',
  'walkingTurn180',
  'dodgeRoll',
  'standToRoll',
  'fallingToRoll',
  'runToDive',
  'fallingToLanding',
  'landing',
  'runningLanding',
  'hardLanding',
  'land',
  'jumpDown',
  'bigJumpDown',
  'jumpDownHandhold',
  'climb',
  'climbingDownWall',
  'wallRun',
  'standToSit',
  'lyingDown',
  'turnLeft',
  'turnRight',
  'teeter',
  'trip',
  'gettingUp',
  'hitReaction',
  'bigHitFall',
  'shoulderHitAndFall',
  'fallingForwardDeath',
  'changeItem',
  'torchEquip',
  'rifleEquip',
  'rifleUnequip',
  'rifleKneelToStand',
  'rifleCrouchWalkToIdle',
  'fireRifle',
  'swingHammer',
  'swingNet',
  'swingTool',
  'torchMeleeAttack',
  'gather',
  'torchInspectForward',
  'write',
  'kneelInspect',
  'standingInspectDownward',
  'lookAround',
  'lookAroundShort',
  'pickUp',
  'point',
  'pray',
  'injuredStandingJump',
  'injuredRunJump',
  'injuredTurnLeft',
  'injuredTurnRight',
  'injuredWalkLeftTurn',
  'injuredWalkRightTurn',
  'injuredRunLeftTurn',
  'injuredRunRightTurn',
].map(normalizeClipName));

const CLIP_SETTINGS = {
  jumpLoop: { loop: true, fade: 0.06 },
  standingJumpHold: { loop: true, fade: 0.05 },
  runningJumpHold: { loop: true, fade: 0.05 },
  fallingIdle: { loop: true, fade: 0.08 },
  idle: { loop: true, fade: 0.22 },
  exhaustedIdle: { loop: true, fade: 0.24 },
  injuredIdle: { loop: true, fade: 0.22 },
  injuredHurtingIdle: { loop: true, fade: 0.2 },
  injuredStumbleIdle: { loop: true, fade: 0.18 },
  injuredWaveIdle: { loop: true, fade: 0.18 },
  walk: { loop: true, fade: 0.14 },
  run: { loop: true, fade: 0.12 },
  jog: { loop: true, fade: 0.14 },
  injuredWalk: { loop: true, fade: 0.16 },
  injuredRun: { loop: true, fade: 0.14 },
  crouchWalk: { loop: true, fade: 0.16 },
  crouchRun: { loop: true, fade: 0.14 },
  runStrafeLeft: { loop: true, fade: 0.12 },
  runStrafeRight: { loop: true, fade: 0.12 },
  crouchIdle: { loop: true, fade: 0.18 },
  torchIdle: { loop: true, fade: 0.2 },
  torchWalk: { loop: true, fade: 0.14 },
  torchRun: { loop: true, fade: 0.12 },
  torchCrouchIdle: { loop: true, fade: 0.18 },
  torchCrouchWalk: { loop: true, fade: 0.16 },
  crouchSneakLeft: { loop: true, fade: 0.14 },
  crouchSneakRight: { loop: true, fade: 0.14 },
  holdIdle: { loop: true, fade: 0.2 },
  holdWalk: { loop: true, fade: 0.14 },
  walkCarry: { loop: true, fade: 0.16 },
  aim: { loop: true, fade: 0.18 },
  walkRifle: { loop: true, fade: 0.14 },
  runRifle: { loop: true, fade: 0.12 },
  rifleIdle: { loop: true, fade: 0.2 },
  rifleKneelIdle: { loop: true, fade: 0.18 },
  rifleCrouchWalk: { loop: true, fade: 0.16 },
  layingIdle: { loop: true, fade: 0.3 },
  lyingDown: { fade: 0.18 },
  swingTool: { fade: 0.08 },
  tiredWalk: { loop: true, fade: 0.16 },
  walkBackwards: { loop: true, fade: 0.14 },
  injuredWalkBackwards: { loop: true, fade: 0.16 },
  injuredRunBackwards: { loop: true, fade: 0.14 },
  walkUpStairs: { loop: true, fade: 0.16 },
  runUpStairs: { loop: true, fade: 0.14 },
  descendStairs: { loop: true, fade: 0.16 },
  ascendStairs: { loop: true, fade: 0.16 },
  sitIdle: { loop: true, fade: 0.3 },
  landing: { fade: 0.05 },
  runningLanding: { fade: 0.05 },
  hardLanding: { fade: 0.06 },
  runToDive: { fade: 0.05 },
  fallingToLanding: { fade: 0.05 },
  sprintToWallClimb: { fade: 0.06 },
  climbingUpWall: { fade: 0.06 },
  climbingDownWall: { fade: 0.08 },
  runningTurnLeft: { fade: 0.05 },
  runningTurnRight: { fade: 0.05 },
  wallRun: { fade: 0.06 },
  standToSit: { fade: 0.12 },
};

const CLIP_FALLBACKS = {
  lookAround: 'idle',
  lookAroundShort: 'idle',
  fallingIdle: 'fall',
  sprintToWallClimb: 'climbingUpWall',
  vault: 'climbingUpWall',
  runningSlide: 'fallingToRoll',
  fallingIntoPool: 'fallingToRoll',
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
  swingTool: 'torchMeleeAttack',
  runningTurnLeft: 'runningTurn180',
  runningTurnRight: 'runningTurn180',
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

const FOOT_PLANT_MAX_UP = 0.075;
const FOOT_PLANT_MAX_DOWN = -0.045;
const FOOT_PLANT_MAX_SPEED = 2.1;
const FOOT_PLANT_BONE = {
  left: /leftfoot$/i,
  right: /rightfoot$/i,
};

function isOneShotClip(name) {
  return ONE_SHOT_CLIPS.has(normalizeClipName(name));
}

function settingsForClip(name) {
  return CLIP_SETTINGS[name] || CLIP_SETTINGS[normalizeClipName(name)] || {};
}

function fadeForTransition(fromName, toName) {
  const to = normalizeClipName(toName);
  const from = normalizeClipName(fromName);
  const settings = settingsForClip(toName);
  if (settings.fade !== undefined) return settings.fade;
  if (to.includes('jump') || to.includes('land')) return 0.08;
  if (from.includes('jump') && (to.includes('landing') || to === 'land')) return 0.06;
  if (to === 'startwalking' || to === 'stopwalking' || to === 'runtostop') return 0.12;
  if (to.includes('run') || to.includes('walk') || from.includes('run') || from.includes('walk')) return 0.16;
  if (isOneShotClip(toName)) return 0.1;
  return 0.2;
}

function normalizeAnimationRequest(request) {
  if (!request) return null;
  if (typeof request === 'string') return { clip: request, timeScale: 1, fade: null, maxTime: null };
  return {
    clip: request.clip || request.name,
    timeScale: request.timeScale ?? 1,
    fade: request.fade ?? null,
    maxTime: request.maxTime ?? null,
  };
}

function modelBoundsDebugEnabled() {
  if (typeof window === 'undefined') return false;
  return window.__enableModelBoundsDebug === true
    || new URLSearchParams(window.location.search).has('modelBoundsDebug');
}

function GLBPrimitive({
  assetId,
  asset,
  animationSelector = null,
  motion = null,
  damageFlash = 0,
  reflect = false,
  onSceneReady = null,
  grounding = null,
}) {
  const group = useRef(null);
  const gl = useThree(state => state.gl);
  const activeAction = useRef(null);
  const activeRequest = useRef(null);
  const animationSelectorRef = useRef(animationSelector);
  const warnedMissing = useRef(new Set());
  const lastBoundsDebugAt = useRef(0);
  const footPlant = useRef({
    left: { bone: null, offset: 0, correction: new THREE.Vector3() },
    right: { bone: null, offset: 0, correction: new THREE.Vector3() },
  });
  const assetUrl = assetLoadUrl(asset);
  const { scene, animations: ownAnimations } = useGLTF(assetUrl);
  // Optional: borrow clips this rig lacks from another asset's GLB. Requires an
  // identical (same-named) skeleton — clips bind to bones by name. The source
  // load is unconditional (falls back to this asset's own path, which is cached
  // and free) so hook order stays stable.
  const sourceAsset = asset.animationSource ? getModelAsset(asset.animationSource) : null;
  const { animations: sourceAnimations } = useGLTF(assetLoadUrl(sourceAsset) || assetUrl);
  const animations = useMemo(() => {
    if (!sourceAsset || sourceAnimations === ownAnimations) return ownAnimations;
    const have = new Set(ownAnimations.map(clip => normalizeClipName(clip.name)));
    // Native rig sizes differ; group scale compensates, so the inverse ratio of
    // group scales is the native-size ratio. Rotation tracks are scale-invariant
    // — only position tracks (chiefly the Hips root bob/height) need rescaling.
    const positionScale = (sourceAsset.scale || 1) / (asset.scale || 1);
    const ported = [];
    sourceAnimations.forEach(clip => {
      if (have.has(normalizeClipName(clip.name))) return;
      const copy = clip.clone();
      if (positionScale !== 1) {
        copy.tracks.forEach(track => {
          if (!track.name.endsWith('.position')) return;
          // slice() yields an independent buffer so the cached source clip is
          // never mutated (the shallow-clone-corruption trap).
          const values = track.values.slice();
          for (let i = 0; i < values.length; i += 1) values[i] *= positionScale;
          track.values = values;
        });
      }
      ported.push(copy);
    });
    return ported.length ? ownAnimations.concat(ported) : ownAnimations;
  }, [ownAnimations, sourceAnimations, sourceAsset, asset.scale]);
  const importedScene = useMemo(() => prepareImportedScene(scene, assetId, asset), [scene, assetId, asset]);
  const mixer = useMemo(() => new THREE.AnimationMixer(importedScene), [importedScene]);
  const debugBounds = useMemo(() => new THREE.Box3(), []);
  const debugSize = useMemo(() => new THREE.Vector3(), []);
  const debugCenter = useMemo(() => new THREE.Vector3(), []);
  const actions = useMemo(() => {
    const result = {};
    animations.forEach(clip => {
      result[clip.name] = mixer.clipAction(clip, importedScene);
    });
    return result;
  }, [animations, importedScene, mixer]);
  const actionLookup = useMemo(() => {
    const lookup = new Map();
    Object.entries(actions).forEach(([key, action]) => {
      if (!action) return;
      const clipName = action.getClip()?.name || key;
      lookup.set(key, action);
      lookup.set(clipName, action);
      lookup.set(normalizeClipName(key), action);
      lookup.set(normalizeClipName(clipName), action);
    });
    return lookup;
  }, [actions]);
  const positionAnimatedBones = useMemo(() => {
    const result = new Set();
    animations.forEach(clip => {
      clip.tracks.forEach(track => {
        if (!track.name.endsWith('.position')) return;
        const [targetName] = track.name.split('.');
        if (targetName) result.add(normalizeClipName(targetName));
      });
    });
    return result;
  }, [animations]);
  const footPlantTemps = useMemo(() => ({
    world: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    local: new THREE.Vector3(),
    targetLocal: new THREE.Vector3(),
    localDelta: new THREE.Vector3(),
  }), []);
  const renderUserData = useMemo(() => ({
    ...(reflect ? { reflect: true } : {}),
    renderSource: `model:${assetId}`,
    renderLabel: `Model: ${assetId}`,
    renderKind: 'model-asset',
    renderPath: asset.path || null,
  }), [asset.path, assetId, reflect]);

  const getAction = useCallback((name) => {
    if (!name) return null;
    return actionLookup.get(name) || actionLookup.get(normalizeClipName(name)) || null;
  }, [actionLookup]);

  const publishAnimationDebug = useCallback((requested, action, metadata = {}) => {
    if (typeof window === 'undefined') return;
    const debugPayload = {
      assetId,
      requested,
      active: action?.getClip?.()?.name || null,
      timeScale: action?.getEffectiveTimeScale?.() ?? null,
      weight: action?.getEffectiveWeight?.() ?? null,
      ...metadata,
      available: Object.keys(actions),
    };
    window.__modelAnimationDebug = {
      ...(window.__modelAnimationDebug || {}),
      [assetId]: debugPayload,
    };
    if (String(assetId).startsWith('darwin')) {
      window.__darwinAnimationDebug = debugPayload;
    }
  }, [actions, assetId]);

  const playAnimation = useCallback((request) => {
    const normalized = normalizeAnimationRequest(request);
    const requestedClip = normalized?.clip;
    const fade = normalized?.fade ?? null;
    const timeScale = THREE.MathUtils.clamp(normalized?.timeScale ?? 1, 0.35, 1.8);
    const maxTime = Number.isFinite(normalized?.maxTime) ? Math.max(0, normalized.maxTime) : null;
    const fallbackClip = CLIP_FALLBACKS[requestedClip] || CLIP_FALLBACKS[normalizeClipName(requestedClip)];
    const next = getAction(requestedClip) || getAction(fallbackClip);
    const resolvedClip = next?.getClip?.()?.name || requestedClip;
    if (!next) {
      if (requestedClip && !warnedMissing.current.has(requestedClip)) {
        warnedMissing.current.add(requestedClip);
        console.warn(`Missing GLB animation clip: ${requestedClip}`, Object.keys(actions));
      }
      publishAnimationDebug(requestedClip, activeAction.current, { missing: true });
      return false;
    }
    if (next === activeAction.current && requestedClip === activeRequest.current) {
      next.setEffectiveTimeScale(timeScale);
      if (maxTime !== null && next.time >= maxTime) {
        next.time = maxTime;
        next.paused = true;
      } else {
        next.paused = false;
      }
      publishAnimationDebug(requestedClip, next, { held: true, maxTime });
      return true;
    }
    const previous = activeAction.current;
    const previousName = previous?.getClip?.()?.name || activeRequest.current;
    const transitionFade = fade ?? fadeForTransition(previousName, resolvedClip);
    const clipSettings = settingsForClip(resolvedClip);
    const oneShot = clipSettings.loop === true ? false : isOneShotClip(resolvedClip);
    next.enabled = true;
    next.paused = false;
    next.clampWhenFinished = oneShot;
    next.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
    next.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1);
    if (previous && previous !== next) {
      previous.crossFadeTo(next, transitionFade, false);
    } else {
      next.fadeIn(transitionFade);
    }
    next.play();
    activeAction.current = next;
    activeRequest.current = requestedClip;
    publishAnimationDebug(requestedClip, next, { fade: transitionFade, oneShot });
    return true;
  }, [actions, getAction, publishAnimationDebug]);

  useEffect(() => {
    normalizeImportedMaterials(importedScene, asset, motion);
  }, [asset, importedScene, motion]);

  useEffect(() => {
    const next = {
      left: { bone: null, offset: 0, correction: new THREE.Vector3() },
      right: { bone: null, offset: 0, correction: new THREE.Vector3() },
    };
    importedScene.traverse(object => {
      if (!object.isBone) return;
      if (FOOT_PLANT_BONE.left.test(object.name)) next.left.bone = object;
      if (FOOT_PLANT_BONE.right.test(object.name)) next.right.bone = object;
    });
    footPlant.current = next;
  }, [importedScene]);

  // Runs after normalize so the rim/roughness override sits on top of the cel
  // pipeline. No-op unless the asset opts in via materialUpgrade (player only).
  useEffect(() => {
    applyPlayerMaterialUpgrade(importedScene, asset, gl);
  }, [asset, importedScene, gl]);

  useEffect(() => {
    applyDamageFlash(importedScene, damageFlash);
  }, [damageFlash, importedScene]);

  // Expose the loaded, skinned scene so callers can attach props to bones
  // (e.g. the night lamp on Darwin's hand).
  useEffect(() => {
    onSceneReady?.(importedScene);
    return () => onSceneReady?.(null);
  }, [importedScene, onSceneReady]);

  useEffect(() => {
    animationSelectorRef.current = animationSelector;
  }, [animationSelector]);

  useEffect(() => {
    const first = getAction('idle') ? 'idle' : animations[0]?.name;
    const selector = animationSelectorRef.current;
    const initial = selector ? selector() : first;
    Object.values(actions).forEach(item => item?.stop());
    playAnimation(initial || { clip: first, fade: 0.15 });
    return () => {
      Object.values(actions).forEach(item => item?.stop());
      activeAction.current = null;
      activeRequest.current = null;
    };
  }, [actions, animations, getAction, playAnimation]);

  const applyFootPlanting = useCallback((delta) => {
    const motionState = grounding?.motionRef?.current;
    const adapter = grounding?.collisionAdapter;
    const enabled = asset.footPlanting === true;
    const canPlant = Boolean(
      enabled && adapter
      && motionState
      && !motionState.airborne
      && !motionState.swimming
      && !motionState.crouching
      && !motionState.action
      && !motionState.jumpCharging
      && Math.abs(motionState.groundDistance ?? 0) <= 0.2
      && (motionState.speed || 0) <= FOOT_PLANT_MAX_SPEED,
    );
    const speedStrength = 1 - THREE.MathUtils.clamp((motionState?.speed || 0) / FOOT_PLANT_MAX_SPEED, 0, 1);
    const strength = canPlant ? speedStrength : 0;
    Object.entries(footPlant.current).forEach(([side, entry]) => {
      const bone = entry.bone;
      if (!bone?.parent) return;
      const boneHasPositionTrack = positionAnimatedBones.has(normalizeClipName(bone.name));
      if (!boneHasPositionTrack && entry.correction.lengthSq() > 0) {
        bone.position.sub(entry.correction);
        entry.correction.set(0, 0, 0);
      }
      let targetOffset = 0;
      if (strength > 0) {
        bone.getWorldPosition(footPlantTemps.world);
        const ground = adapter.groundInfo(footPlantTemps.world, { supportRadius: 0.06 });
        targetOffset = THREE.MathUtils.clamp(
          (ground.y - footPlantTemps.world.y) * strength,
          FOOT_PLANT_MAX_DOWN,
          FOOT_PLANT_MAX_UP,
        );
      }
      entry.offset = THREE.MathUtils.damp(entry.offset, targetOffset, 14, delta);
      if (Math.abs(entry.offset) < 0.0005) return;
      bone.getWorldPosition(footPlantTemps.world);
      footPlantTemps.targetWorld.copy(footPlantTemps.world).y += entry.offset;
      bone.parent.worldToLocal(footPlantTemps.local.copy(footPlantTemps.world));
      bone.parent.worldToLocal(footPlantTemps.targetLocal.copy(footPlantTemps.targetWorld));
      footPlantTemps.localDelta.copy(footPlantTemps.targetLocal).sub(footPlantTemps.local);
      bone.position.add(footPlantTemps.localDelta);
      entry.correction.copy(footPlantTemps.localDelta);
      if (typeof window !== 'undefined' && assetId === 'darwin5') {
        window.__darwinFootPlantDebug = {
          ...(window.__darwinFootPlantDebug || {}),
          [side]: entry.offset,
        };
      }
    });
  }, [asset.footPlanting, assetId, footPlantTemps, grounding, positionAnimatedBones]);

  useFrame((frameState, delta) => {
    if (!animations.length) return;
    mixer.update(delta);
    applyFootPlanting(delta);
    if ((assetId === 'darwin' || assetId === 'syms') && modelBoundsDebugEnabled()) {
      const elapsed = frameState.clock.elapsedTime;
      if (group.current && elapsed - lastBoundsDebugAt.current >= 0.3) {
        lastBoundsDebugAt.current = elapsed;
        debugBounds.setFromObject(group.current);
        debugBounds.getSize(debugSize);
        debugBounds.getCenter(debugCenter);
        window.__modelBoundsDebug = {
          ...(window.__modelBoundsDebug || {}),
          [assetId]: {
            height: debugSize.y,
            width: debugSize.x,
            depth: debugSize.z,
            center: [debugCenter.x, debugCenter.y, debugCenter.z],
            minY: debugBounds.min.y,
            maxY: debugBounds.max.y,
          },
        };
      }
    }
    const selector = animationSelectorRef.current;
    if (!selector) return;
    const nextClip = selector();
    if (!nextClip) return;
    playAnimation(nextClip);
  });

  return (
    <group
      ref={group}
      scale={asset.scale || 1}
      rotation={asset.rotation || [0, 0, 0]}
      position={[0, asset.yOffset || 0, 0]}
      userData={renderUserData}
    >
      <primitive object={importedScene} />
    </group>
  );
}

export function ModelAsset({
  id,
  fallback = null,
  animationSelector = null,
  motion = null,
  damageFlash = 0,
  reflect = false,
  onSceneReady = null,
  grounding = null,
}) {
  const asset = getModelAsset(id);
  if (!asset?.enabled) return fallback;

  return (
    <Suspense fallback={fallback}>
      <GLBPrimitive
        assetId={id}
        asset={asset}
        animationSelector={animationSelector}
        motion={motion}
        damageFlash={damageFlash}
        reflect={reflect}
        onSceneReady={onSceneReady}
        grounding={grounding}
      />
    </Suspense>
  );
}

// Eager-preload only explicit boot-critical assets. Zone-specific GLBs load
// behind their Suspense fallbacks after the first playable frame.
Object.values(modelAssets)
  .filter(asset => asset.enabled && asset.preload === true)
  .forEach(asset => {
    useGLTF.preload(assetLoadUrl(asset));
  });
