'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { getModelAsset, modelAssets } from '../../modelAssets';
import { modelAnimationDebugEnabled } from '../../runtimeDebug';
import { useThreeGameStore } from '../../store';
import { skyState } from '../../world/celestial';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { worldTime } from '../../world/worldTime';
import { applyFoliageMotion } from '../scene/ecology/foliageMotion';
import {
  darwin5ClipFallback,
  darwin5ClipSettings,
  darwin5TransitionFade,
} from '../player/darwin5AnimationManifest.mjs';
import { createFootContactRig } from '../player/footContactRig';
import { getFootContactProfile } from '../player/gaitProfiles';
import { createLazyAnimationActions } from './lazyAnimationActions';

const DEFAULT_IMPORTED_SHADOW_CASTERS = new Set([
  'darwin',
  'darwinCandidate2',
  'darwinTripo',
  'darwin4',
  'darwin5',
  'syms',
]);

// Only player variants must keep their mixers frame-accurate at every camera
// distance. Companions such as Syms can retain character shadows and generous
// culling while still benefiting from the world-actor animation LOD.
const ALWAYS_ANIMATED_CHARACTER_ASSETS = new Set([
  'darwin',
  'darwinCandidate2',
  'darwinTripo',
  'darwin4',
  'darwin5',
]);

function importedAssetCastsShadow(assetId, asset) {
  if (asset.castShadow !== undefined) return Boolean(asset.castShadow);
  return DEFAULT_IMPORTED_SHADOW_CASTERS.has(asset.playerProfile || assetId);
}

function normalizeImportedMaterials(scene, asset, motion = null) {
  if (!asset.normalizeMaterials) return;
  scene.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material) return;
      material.side = asset.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
      material.toneMapped = false;
      if (asset.forceOpaque) {
        material.transparent = false;
        material.opacity = 1;
        material.alphaMap = null;
        material.alphaTest = 0;
        material.depthWrite = true;
        material.depthTest = true;
      }
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

// Skinned meshes only get a bind-pose bounding sphere, but animation can carry
// vertices well outside it (a raised arm, a jump). Pad once per geometry (the
// SkeletonUtils clone shares the BufferGeometry across instances, so the flag
// dedupes correctly) so culling doesn't pop meshes off mid-animation.
function ensurePaddedSkinnedBounds(mesh) {
  const geometry = mesh.geometry;
  if (!geometry || geometry.userData.__paddedForSkinning) return;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  if (!geometry.boundingSphere) return;
  geometry.boundingSphere.radius = geometry.boundingSphere.radius * 1.6 + 0.4;
  geometry.userData.__paddedForSkinning = true;
}

function prepareImportedScene(scene, assetId, asset, shadowOverrides = null) {
  const castShadow = shadowOverrides?.castShadow ?? importedAssetCastsShadow(assetId, asset);
  const receiveShadow = shadowOverrides?.receiveShadow ?? (asset.receiveShadow === true);
  const cullStaticMeshes = asset.frustumCulled !== false;
  // Skinned fauna/specimens cull by default now (opt out per-asset if a model
  // needs to stay always-drawn). The player/companion stay uncensored: they
  // sit close to camera anyway, so there's little to gain, and it keeps them
  // clear of any shadow-camera edge cases around the stabilized shadow anchor.
  const cullSkinnedMeshes = asset.frustumCulled !== false;
  const isCharacterAsset = DEFAULT_IMPORTED_SHADOW_CASTERS.has(asset.playerProfile || assetId);
  scene.traverse(object => {
    if (!object.isMesh) return;
    if (object.isSkinnedMesh) ensurePaddedSkinnedBounds(object);
    object.frustumCulled = isCharacterAsset ? false : (object.isSkinnedMesh ? cullSkinnedMeshes : cullStaticMeshes);
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
      uTop: { value: new THREE.Color('#a3bcd8') },     // cool skylight
      uHorizon: { value: new THREE.Color('#dccfb2') },  // neutral-warm horizon
      uBottom: { value: new THREE.Color('#a68a64') },   // sunlit-sand ground bounce
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
  scene.userData.skyGradientMaterial = mat;
  return scene;
}

// Materials using the player envMap register here so the per-frame lighting rig
// (Lighting.jsx) can scale their IBL with the sand-bounce channel: clear sun on
// bright ground means more ambient on shadow sides. Holding the references is
// fine — useGLTF caches these materials for the session anyway.
const envBounceMaterials = new Set();
const ENV_BOUNCE_MIN_SCALE = 0.7;
const ENV_BOUNCE_GAIN = 0.9;
let lastEnvBounce = 0;
export function setPlayerEnvBounce(bounce) {
  const b = Math.max(0, Math.min(1, bounce || 0));
  if (Math.abs(b - lastEnvBounce) < 0.004) return;
  lastEnvBounce = b;
  envBounceMaterials.forEach(material => {
    material.envMapIntensity = material.userData.envBaseIntensity * (ENV_BOUNCE_MIN_SCALE + b * ENV_BOUNCE_GAIN);
  });
}

const ENVIRONMENT_REFRESH_SECONDS = 2.5;
const ENVIRONMENT_CHANGE_THRESHOLD = 0.06;
const ENV_CLEAR_TOP = new THREE.Color('#a3bcd8');
const ENV_CLEAR_HORIZON = new THREE.Color('#dccfb2');
const ENV_CLEAR_GROUND = new THREE.Color('#a68a64');
const ENV_CLOSED_TOP = new THREE.Color('#9aa6ad');
const ENV_CLOSED_HORIZON = new THREE.Color('#b8bbb4');
const ENV_CLOSED_GROUND = new THREE.Color('#6f746c');
const ENV_NIGHT_TOP = new THREE.Color('#263752');
const ENV_NIGHT_HORIZON = new THREE.Color('#1d2a40');
const ENV_NIGHT_GROUND = new THREE.Color('#242b34');
const ENV_GOLDEN_HORIZON = new THREE.Color('#e2b37c');

function environmentPalette(timeOfDay, day) {
  const sky = skyState(timeOfDay, day || 1);
  const closure = THREE.MathUtils.clamp(
    weatherEnv.overcast * 0.8 + weatherEnv.mistAmount * 0.32 + weatherEnv.rainIntensity * 0.2,
    0,
    1,
  );
  const night = sky.night;
  const daylight = sky.daylight;
  const top = ENV_CLEAR_TOP.clone().lerp(ENV_CLOSED_TOP, closure).lerp(ENV_NIGHT_TOP, night);
  const horizon = ENV_CLEAR_HORIZON.clone()
    .lerp(ENV_CLOSED_HORIZON, closure)
    .lerp(ENV_GOLDEN_HORIZON, sky.golden * (1 - closure) * 0.5)
    .lerp(ENV_NIGHT_HORIZON, night);
  const ground = ENV_CLEAR_GROUND.clone()
    .lerp(ENV_CLOSED_GROUND, closure)
    .lerp(ENV_NIGHT_GROUND, night);
  // Keep the environment deliberately secondary to direct lighting. In a
  // storm it darkens with the cloud deck instead of continuing to reflect a
  // clear studio sky from wet rock and wood.
  const intensity = THREE.MathUtils.lerp(0.1, 0.25, daylight)
    * (1 - closure * 0.34)
    * (1 - weatherEnv.lightDim * 0.18);
  return { top, horizon, ground, intensity };
}

function paletteDistance(a, b) {
  if (typeof a?.top?.distanceTo !== 'function' || typeof a?.horizon?.distanceTo !== 'function' || typeof a?.ground?.distanceTo !== 'function') return Infinity;
  if (typeof b?.top?.distanceTo !== 'function' || typeof b?.horizon?.distanceTo !== 'function' || typeof b?.ground?.distanceTo !== 'function') return Infinity;
  return Math.max(
    a.top.distanceTo(b.top),
    a.horizon.distanceTo(b.horizon),
    a.ground.distanceTo(b.ground),
  );
}

function disposeEnvironmentScene(scene) {
  scene?.traverse(object => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
    object.material?.dispose?.();
  });
}

// Scene-wide IBL from the same PMREM gradient the player materials use. The
// source palette follows the time of day and smoothed weather, but PMREM is
// regenerated only after a meaningful change and at a low cadence. Materials
// with an explicit envMap (the player pipeline) are swapped at the same time.
export function SceneEnvironment({ intensity = 0.25 }) {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const environmentRef = useRef(null);
  const refreshClock = useRef(ENVIRONMENT_REFRESH_SECONDS);
  const lastPalette = useRef(null);

  useEffect(() => {
    const sourceScene = buildSkyGradientEnvScene();
    const pmrem = new THREE.PMREMGenerator(gl);
    environmentRef.current = { sourceScene, pmrem };
    return () => {
      if (scene.environment === cachedPlayerEnv) scene.environment = null;
      environmentRef.current = null;
      pmrem.dispose();
      disposeEnvironmentScene(sourceScene);
    };
  }, [gl, scene]);

  useFrame((_, delta) => {
    const state = environmentRef.current;
    if (!state) return;
    const store = useThreeGameStore.getState();
    const target = environmentPalette(store.timeOfDay, store.day);
    scene.environmentIntensity = target.intensity * (intensity / 0.25);
    refreshClock.current += delta;
    const due = refreshClock.current >= ENVIRONMENT_REFRESH_SECONDS;
    if (!due || (lastPalette.current && paletteDistance(lastPalette.current, target) < ENVIRONMENT_CHANGE_THRESHOLD)) return;

    const material = state.sourceScene.userData.skyGradientMaterial;
    material.uniforms.uTop.value.copy(target.top);
    material.uniforms.uHorizon.value.copy(target.horizon);
    material.uniforms.uBottom.value.copy(target.ground);
    const nextTarget = state.pmrem.fromScene(state.sourceScene, 0.04, 0.1, 100, { size: 128 });
    replacePlayerEnvironment(nextTarget);
    scene.environment = cachedPlayerEnv;
    lastPalette.current = target;
    refreshClock.current = 0;
  });

  return null;
}

let cachedPlayerEnv = null;
let cachedPlayerEnvTarget = null;

function replacePlayerEnvironment(target) {
  const previous = cachedPlayerEnvTarget;
  cachedPlayerEnvTarget = target;
  cachedPlayerEnv = target.texture;
  envBounceMaterials.forEach(material => {
    if (!material || material.userData?.envBaseIntensity == null) return;
    material.envMap = cachedPlayerEnv;
    material.envMapIntensity = material.userData.envBaseIntensity * (ENV_BOUNCE_MIN_SCALE + lastEnvBounce * ENV_BOUNCE_GAIN);
    material.needsUpdate = true;
  });
  if (previous && previous !== target) previous.dispose();
}

function getPlayerEnvMap(renderer) {
  if (cachedPlayerEnv) return cachedPlayerEnv;
  if (!renderer) return null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = buildSkyGradientEnvScene();
  const target = pmrem.fromScene(envScene, 0.04);
  replacePlayerEnvironment(target);
  pmrem.dispose();
  disposeEnvironmentScene(envScene);
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
    if (!object.isMesh || object.userData.noPlayerMaterialUpgrade) return;
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
        material.userData.envBaseIntensity = cfg.envMapIntensity;
        material.envMapIntensity = cfg.envMapIntensity * (ENV_BOUNCE_MIN_SCALE + lastEnvBounce * ENV_BOUNCE_GAIN);
        envBounceMaterials.add(material);
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

function applyEyeGlossUpgrade(scene) {
  scene.traverse(object => {
    if (!object.isMesh || !object.userData.eyeGloss) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material) return;
      if ('metalness' in material) material.metalness = 0;
      if ('roughnessMap' in material) material.roughnessMap = null;
      if ('roughness' in material) material.roughness = 0.26;
      if ('normalMap' in material) material.normalMap = null;
      if ('clearcoat' in material) material.clearcoat = 0.22;
      if ('clearcoatRoughness' in material) material.clearcoatRoughness = 0.14;
      if ('envMapIntensity' in material) {
        material.userData.envBaseIntensity = 0.38;
        material.envMapIntensity = 0.38 * (ENV_BOUNCE_MIN_SCALE + lastEnvBounce * ENV_BOUNCE_GAIN);
      }
      material.needsUpdate = true;
    });
  });
}

function applyDirectSpecularGlint(material, config) {
  if (!config || material.userData.directSpecularGlintApplied) return;
  const uniforms = {
    color: { value: new THREE.Color(config.color || '#fff0b0') },
    specularBoost: { value: config.specularBoost ?? 5.0 },
    bloomStrength: { value: config.bloomStrength ?? 1.0 },
    threshold: { value: config.threshold ?? 0.015 },
    thresholdEnd: { value: config.thresholdEnd ?? 0.14 },
    focus: { value: config.focus ?? 1.8 },
  };
  const previousHook = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousHook) previousHook(shader, renderer);
    shader.uniforms.uRegionGlintColor = uniforms.color;
    shader.uniforms.uRegionGlintSpecularBoost = uniforms.specularBoost;
    shader.uniforms.uRegionGlintBloomStrength = uniforms.bloomStrength;
    shader.uniforms.uRegionGlintThreshold = uniforms.threshold;
    shader.uniforms.uRegionGlintThresholdEnd = uniforms.thresholdEnd;
    shader.uniforms.uRegionGlintFocus = uniforms.focus;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec3 uRegionGlintColor;
uniform float uRegionGlintSpecularBoost;
uniform float uRegionGlintBloomStrength;
uniform float uRegionGlintThreshold;
uniform float uRegionGlintThresholdEnd;
uniform float uRegionGlintFocus;
void main() {`,
      )
      .replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
  // Preserve the standard material's real light direction, view response, and
  // shadowing, then concentrate only its hottest direct-specular values into
  // an HDR brass flash. The ordinary highlight gets a broad boost; the narrow
  // core crosses the scene bloom threshold instead of making the button glow.
  float regionDirectSpecular = dot(
    reflectedLight.directSpecular,
    vec3(0.2126, 0.7152, 0.0722)
  );
  float regionGlint = smoothstep(
    uRegionGlintThreshold,
    max(uRegionGlintThreshold + 0.0001, uRegionGlintThresholdEnd),
    regionDirectSpecular
  );
  regionGlint = pow(clamp(regionGlint, 0.0, 1.0), uRegionGlintFocus);
  outgoingLight += reflectedLight.directSpecular * uRegionGlintSpecularBoost;
  outgoingLight += uRegionGlintColor * regionGlint * uRegionGlintBloomStrength;`,
      );
  };
  material.userData.directSpecularGlintApplied = true;
  material.userData.directSpecularGlintUniforms = uniforms;
}

function applyMaterialRegionUpgrade(scene, asset) {
  const regions = asset.materialRegionUpgrade;
  if (!regions) return;
  scene.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material || material.userData.materialRegionUpgradeApplied) return;
      const name = String(material.name || '').toLowerCase();
      const entry = Object.values(regions).find(region =>
        (region.materialNames || []).some(candidate => name.startsWith(String(candidate).toLowerCase())),
      );
      if (!entry) return;
      if ('metalness' in material && entry.metalness !== undefined) {
        material.metalness = entry.metalness;
      }
      if ('roughnessMap' in material && entry.useRoughnessMap === false) {
        material.roughnessMap = null;
      }
      if ('map' in material && entry.useAlbedoMap === false) {
        material.map = null;
      }
      if ('roughness' in material && entry.roughness !== undefined) {
        material.roughness = entry.roughness;
      }
      if (material.normalMap && entry.normalScale !== undefined) {
        material.normalScale = new THREE.Vector2(entry.normalScale, entry.normalScale);
      }
      if ('normalMap' in material && entry.useNormalMap === false) {
        material.normalMap = null;
      }
      if (material.color && entry.colorBlend) {
        material.color.lerp(new THREE.Color(entry.colorBlend), entry.colorBlendAmount ?? 0.12);
      }
      if (material.color && entry.colorScale !== undefined) {
        material.color.multiplyScalar(entry.colorScale);
      }
      if ('specularIntensity' in material && entry.specularIntensity !== undefined) {
        material.specularIntensity = entry.specularIntensity;
      }
      if ('anisotropy' in material && entry.anisotropy !== undefined) {
        material.anisotropy = entry.anisotropy;
      }
      if ('anisotropyRotation' in material && entry.anisotropyRotation !== undefined) {
        material.anisotropyRotation = entry.anisotropyRotation;
      }
      if ('clearcoat' in material && entry.clearcoat !== undefined) {
        material.clearcoat = entry.clearcoat;
      }
      if ('clearcoatRoughness' in material && entry.clearcoatRoughness !== undefined) {
        material.clearcoatRoughness = entry.clearcoatRoughness;
      }
      if ('envMapIntensity' in material && entry.envMapIntensity !== undefined) {
        material.userData.envBaseIntensity = entry.envMapIntensity;
        material.envMapIntensity = entry.envMapIntensity
          * (ENV_BOUNCE_MIN_SCALE + lastEnvBounce * ENV_BOUNCE_GAIN);
      }
      if (entry.directSpecularGlint) {
        applyDirectSpecularGlint(material, entry.directSpecularGlint);
      }
      if (typeof window !== 'undefined' && entry.anisotropy !== undefined) {
        window.__darwinHairMaterialDebug = {
          material: material.name,
          type: material.type,
          isMeshPhysicalMaterial: material.isMeshPhysicalMaterial === true,
          roughness: material.roughness,
          normalScale: material.normalScale?.x ?? null,
          specularIntensity: material.specularIntensity ?? null,
          anisotropy: material.anisotropy ?? null,
          anisotropyRotation: material.anisotropyRotation ?? null,
          envMapIntensity: material.envMapIntensity ?? null,
        };
      }
      material.userData.materialRegionUpgradeApplied = true;
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
  'dive',
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
  'climbWaistHeight',
  'climbHeadHeight',
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
  'heavyToolSwing',
  'torchMeleeAttack',
  'gather',
  'gatherGround',
  'gatherChestHeight',
  'butterflyNetSwing',
  'pushStart',
  'pushStop',
  'startWalk',
  'stopWalk',
  'alert',
  'peekOut',
  'withdraw',
  'reEmerge',
  'drink',
  'browseHigh',
  'browseLow',
  'mudStep',
  'torchInspectForward',
  'write',
  'kneelInspect',
  'standingInspectDownward',
  'lookAround',
  'lookAroundShort',
  'fidgetStand',
  'neckStretch',
  'armStretch',
  'neutralIdle',
  'happyIdle',
  'inspectNearbyIdle',
  'pickUp',
  'point',
  'pray',
  'hide',
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
  sprint: { loop: true, fade: 0.16 },
  grassRun: { loop: true, fade: 0.14 },
  runBackwards: { loop: true, fade: 0.14 },
  jogBackwards: { loop: true, fade: 0.14 },
  backwardTurnLeft: { loop: true, fade: 0.14 },
  backwardTurnRight: { loop: true, fade: 0.14 },
  windedIdle: { loop: true, fade: 0.28 },
  boredIdle: { loop: true, fade: 0.34 },
  tiredIdle: { loop: true, fade: 0.3 },
  jog: { loop: true, fade: 0.14 },
  startWalk: { fade: 0.08 },
  stopWalk: { fade: 0.1 },
  turnInPlace: { loop: true, fade: 0.12 },
  reverse: { loop: true, fade: 0.16 },
  alert: { fade: 0.12 },
  peekOut: { fade: 0.14 },
  withdraw: { fade: 0.08 },
  reEmerge: { fade: 0.12 },
  drink: { fade: 0.16 },
  browseHigh: { fade: 0.16 },
  browseLow: { fade: 0.16 },
  mudStep: { fade: 0.1 },
  slopeBrace: { loop: true, fade: 0.14 },
  idleLook: { loop: true, fade: 0.24 },
  idleStretch: { loop: true, fade: 0.24 },
  idleHalfTuck: { loop: true, fade: 0.24 },
  injuredWalk: { loop: true, fade: 0.16 },
  injuredRun: { loop: true, fade: 0.14 },
  crouchWalk: { loop: true, fade: 0.16 },
  crouchRun: { loop: true, fade: 0.14 },
  runStrafeLeft: { loop: true, fade: 0.12 },
  runStrafeRight: { loop: true, fade: 0.12 },
  walkStrafeLeft: { loop: true, fade: 0.14 },
  walkStrafeRight: { loop: true, fade: 0.14 },
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
  dive: { fade: 0.05 },
  runToDive: { fade: 0.05 },
  swimFast: { loop: true, fade: 0.14 },
  fallingToLanding: { fade: 0.05 },
  sprintToWallClimb: { fade: 0.06 },
  climbingUpWall: { fade: 0.06 },
  climbingDownWall: { fade: 0.08 },
  runningTurnLeft: { fade: 0.05 },
  runningTurnRight: { fade: 0.05 },
  wallRun: { fade: 0.06 },
  standToSit: { fade: 0.12 },
  pushLow: { loop: true, fade: 0.08 },
  pushMedium: { loop: true, fade: 0.08 },
  pushHeavy: { loop: true, fade: 0.08 },
};

const CLIP_FALLBACKS = {
  lookAround: 'idle',
  lookAroundShort: 'lookAround',
  fidgetStand: 'lookAroundShort',
  neckStretch: 'lookAroundShort',
  armStretch: 'lookAroundShort',
  neutralIdle: 'idle',
  happyIdle: 'lookAroundShort',
  inspectNearbyIdle: 'lookAroundShort',
  windedIdle: 'idle',
  boredIdle: 'idle',
  tiredIdle: 'exhaustedIdle',
  sprint: 'run',
  grassRun: 'run',
  runBackwards: 'walkBackwards',
  jogBackwards: 'walkBackwards',
  backwardTurnLeft: 'walkBackwards',
  backwardTurnRight: 'walkBackwards',
  fallingIdle: 'fall',
  sprintToWallClimb: 'climbingUpWall',
  vault: 'climbingUpWall',
  runningSlide: 'fallingToRoll',
  fallingIntoPool: 'fallingToRoll',
  dodgeRoll: 'fallingToRoll',
  standToRoll: 'fallingToRoll',
  hitReaction: 'teeter',
  stumble: 'teeter',
  trip: 'fallingToRoll',
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
  butterflyNetSwing: 'swingTool',
  runningTurnLeft: 'runningTurn180',
  runningTurnRight: 'runningTurn180',
  gather: 'torchInspectForward',
  gatherGround: 'gather',
  gatherChestHeight: 'gatherGround',
  pushStart: 'pushMedium',
  pushLow: 'pushMedium',
  pushMedium: 'gather',
  pushHeavy: 'pushMedium',
  pushStop: 'pushMedium',
  kneelInspect: 'torchInspectForward',
  standingInspectDownward: 'torchInspectForward',
  write: 'torchInspectForward',
  point: 'torchInspectForward',
  dive: 'runToDive',
  runToDive: 'fallingToRoll',
  swimFast: 'swim',
  rifleEquip: 'changeItem',
  rifleUnequip: 'changeItem',
  rifleKneelIdle: 'crouchRifle',
  rifleCrouchWalk: 'crouchRifle',
  rifleKneelToStand: 'coverToStand',
  rifleCrouchWalkToIdle: 'standToCover',
};

function isOneShotClip(name) {
  return ONE_SHOT_CLIPS.has(normalizeClipName(name));
}

// Looping gait cycles that should stay foot-phase-aligned across crossfades.
// Without this, every walk<->run/strafe/carry switch restarts the new cycle at
// time 0 and blends two mismatched leg phases — the classic scissoring seam.
const GAIT_CLIP_RE = /walk|run|jog|sprint|strafe|backward|wade/i;

function isGaitLoopClip(name) {
  return Boolean(name) && GAIT_CLIP_RE.test(name) && !isOneShotClip(name);
}

// Start `next` at the gait phase `previous` is currently in. Where both clips
// have authored foot-contact profiles, align on the left-foot contact point so
// opposite-footed cycles (e.g. walk -> walkBackwards) still land in step.
function syncGaitPhase(previous, next, assetId, resolvedClip) {
  const prevClip = previous?.getClip?.();
  const nextClip = next?.getClip?.();
  const prevDuration = prevClip?.duration || 0;
  const nextDuration = nextClip?.duration || 0;
  if (prevDuration < 0.05 || nextDuration < 0.05) return;
  const prevPhase = (((previous.time || 0) / prevDuration) % 1 + 1) % 1;
  const prevProfile = getFootContactProfile(assetId, prevClip.name);
  const nextProfile = getFootContactProfile(assetId, resolvedClip);
  const phase = prevProfile && nextProfile
    ? ((prevPhase - prevProfile.left + nextProfile.left) % 1 + 1) % 1
    : prevPhase;
  next.time = phase * nextDuration;
}

// Bones the additive breathing layer may touch: torso, shoulders, neck, head.
// Arms/hands stay untouched so it can never fight tool grips or aim poses.
const ADDITIVE_BREATHING_BONE_RE = /spine|neck|head|shoulder/i;

function settingsForClip(name, assetId = null) {
  const base = CLIP_SETTINGS[name] || CLIP_SETTINGS[normalizeClipName(name)] || {};
  const profileId = getModelAsset(assetId)?.animationProfile || assetId;
  if (profileId !== 'darwin5') return base;
  const darwin5Settings = darwin5ClipSettings(name);
  return Object.keys(darwin5Settings).length ? { ...base, ...darwin5Settings } : base;
}

function fadeForTransition(fromName, toName, assetId = null) {
  const profileId = getModelAsset(assetId)?.animationProfile || assetId;
  if (profileId === 'darwin5') {
    const darwin5Fade = darwin5TransitionFade(fromName, toName);
    if (Number.isFinite(darwin5Fade)) return darwin5Fade;
  }
  const to = normalizeClipName(toName);
  const from = normalizeClipName(fromName);
  const settings = settingsForClip(toName, assetId);
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

// Animation LOD: within ANIM_LOD_NEAR, update every frame; between NEAR and
// FAR, update every other frame (delta doubled to keep clip timing correct);
// beyond FAR, skip the mixer entirely — nobody is close enough to notice a
// frozen pose. Keeps skinning/mixer cost off distant fauna and specimens.
const ANIM_LOD_NEAR_SQ = 20 * 20;
const ANIM_LOD_FAR_SQ = 45 * 45;
const NO_ANIMATION_BANKS = Object.freeze([]);

// Bones the aim overlay owns: torso, arms, head — never hips or legs, so the
// locomotion clip keeps walking underneath the shouldered pose.
const OVERLAY_UPPER_BODY_RE = /spine|neck|head|shoulder|clavicle|arm|hand/i;

function AnimationBankLoader({ bank, onLoad }) {
  const { animations } = useGLTF(assetLoadUrl(bank));
  useEffect(() => {
    onLoad(bank.id, animations);
  }, [animations, bank.id, onLoad]);
  return null;
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
  timeScaled = false,
  overlaySelector = null,
  castShadow = null,
  receiveShadow = null,
  animationBankPhase = Number.POSITIVE_INFINITY,
  onAnimationBanksReady = null,
}) {
  const group = useRef(null);
  const gl = useThree(state => state.gl);
  const activeAction = useRef(null);
  const activeRequest = useRef(null);
  const animationSelectorRef = useRef(animationSelector);
  const overlaySelectorRef = useRef(overlaySelector);
  const overlayStateRef = useRef({ action: null, clip: null, weight: 0 });
  const additiveBreathingRef = useRef(null);
  const warnedMissing = useRef(new Set());
  const lastBoundsDebugAt = useRef(0);
  const animLodSkipParity = useRef(false);
  const animationProfileId = asset.animationProfile || assetId;
  const bypassAnimationLod = ALWAYS_ANIMATED_CHARACTER_ASSETS.has(asset.playerProfile || assetId);
  const assetUrl = assetLoadUrl(asset);
  const { scene, animations: ownAnimations } = useGLTF(assetUrl);
  const animationBanks = asset.animationBanks || NO_ANIMATION_BANKS;
  const [bankAnimations, setBankAnimations] = useState(NO_ANIMATION_BANKS);
  const [animationBanksReady, setAnimationBanksReady] = useState(animationBanks.length === 0);
  const loadedAnimationBanksRef = useRef(new Map());
  const handleAnimationBankLoad = useCallback((bankId, clips) => {
    if (loadedAnimationBanksRef.current.has(bankId)) return;
    loadedAnimationBanksRef.current.set(bankId, clips || []);
    setBankAnimations(animationBanks.flatMap(bank => (
      loadedAnimationBanksRef.current.get(bank.id) || []
    )));
    if (loadedAnimationBanksRef.current.size === animationBanks.length) {
      setAnimationBanksReady(true);
    }
  }, [animationBanks]);
  const activeAnimationBanks = useMemo(() => animationBanks.filter(bank => (
    animationBankPhase >= (bank.phase ?? 0)
  )), [animationBankPhase, animationBanks]);

  useEffect(() => {
    if (animationBanksReady) onAnimationBanksReady?.();
  }, [animationBanksReady, onAnimationBanksReady]);

  const nativeAnimations = useMemo(() => (
    bankAnimations?.length ? ownAnimations.concat(bankAnimations) : ownAnimations
  ), [bankAnimations, ownAnimations]);
  // Optional: borrow clips this rig lacks from another asset's GLB. Requires an
  // identical (same-named) skeleton — clips bind to bones by name. The source
  // load is unconditional (falls back to this asset's own path, which is cached
  // and free) so hook order stays stable.
  const sourceAsset = asset.animationSource ? getModelAsset(asset.animationSource) : null;
  const { animations: sourceAnimations } = useGLTF(assetLoadUrl(sourceAsset) || assetUrl);
  const animations = useMemo(() => {
    if (!sourceAsset || sourceAnimations === ownAnimations) return nativeAnimations;
    const have = new Set(nativeAnimations.map(clip => normalizeClipName(clip.name)));
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
    return ported.length ? nativeAnimations.concat(ported) : nativeAnimations;
  }, [nativeAnimations, ownAnimations, sourceAnimations, sourceAsset, asset.scale]);
  const importedScene = useMemo(() => {
    const cloned = cloneSkeleton(scene);
    return prepareImportedScene(cloned, assetId, asset, { castShadow, receiveShadow });
  }, [scene, assetId, asset, castShadow, receiveShadow]);
  const mixer = useMemo(() => new THREE.AnimationMixer(importedScene), [importedScene]);
  const blinkTargets = useMemo(() => {
    const morphName = asset.blinkMorph?.name;
    if (!morphName) return [];
    const result = [];
    importedScene.traverse(object => {
      const index = object.morphTargetDictionary?.[morphName];
      if (!Number.isInteger(index) || !object.morphTargetInfluences) return;
      result.push({ object, index });
    });
    return result;
  }, [asset.blinkMorph, importedScene]);
  const hairMotionTargets = useMemo(() => {
    const config = asset.secondaryHairMotion;
    if (!config) return [];
    const result = [];
    importedScene.traverse(object => {
      if (!object.morphTargetDictionary || !object.morphTargetInfluences) return;
      const isHairLock = object.userData?.hairLock === true
        || object.name.startsWith('Darwin5_HairLock_');
      if (!isHairLock) return;
      const indices = {
        positive: object.morphTargetDictionary[config.positiveName || 'HairSwayPositive'],
        negative: object.morphTargetDictionary[config.negativeName || 'HairSwayNegative'],
        lift: object.morphTargetDictionary[config.liftName || 'HairLift'],
        drop: object.morphTargetDictionary[config.dropName || 'HairDrop'],
      };
      if (!Object.values(indices).some(Number.isInteger)) return;
      result.push({
        object,
        indices,
        phase: Number(object.userData?.hairLockPhase) || result.length * 1.9,
      });
    });
    return result;
  }, [asset.secondaryHairMotion, importedScene]);
  const blinkStateRef = useRef({
    nextAt: null,
    startedAt: null,
    doublePending: false,
    durationScale: 1,
    blinkCount: 0,
    value: 0,
  });
  const hairMotionStateRef = useRef({ locks: [], wasAirborne: null });
  const hairWorldQuaternionRef = useRef(new THREE.Quaternion());
  const hairWorldRightRef = useRef(new THREE.Vector3(1, 0, 0));
  // Second mixer for the masked upper-body overlay (aiming while moving).
  // It updates after the main mixer each frame, so the bones its filtered
  // clip animates overwrite the locomotion pose — a cheap bone mask.
  const overlayMixer = useMemo(() => new THREE.AnimationMixer(importedScene), [importedScene]);
  const debugBounds = useMemo(() => new THREE.Box3(), []);
  const debugSize = useMemo(() => new THREE.Vector3(), []);
  const debugCenter = useMemo(() => new THREE.Vector3(), []);
  const animLodWorldPos = useMemo(() => new THREE.Vector3(), []);
  const lazyActions = useMemo(() => createLazyAnimationActions({
    animations: [],
    mixer,
    root: importedScene,
    normalizeClipName,
  }), [importedScene, mixer]);
  // Always-on additive breathing layer (player only, via asset.additiveBreathing).
  // The clip is filtered to torso/neck rotation tracks and converted to an
  // additive delta against its own first frame, so at low weight it reads as
  // subtle chest/shoulder motion under any full-body state.
  const additiveBreathingSource = useMemo(() => {
    const cfg = asset.additiveBreathing;
    if (!cfg?.clip) return null;
    const normalized = normalizeClipName(cfg.clip);
    return animations.find(clip => (
      clip.name === cfg.clip || normalizeClipName(clip.name) === normalized
    )) || null;
  }, [animations, asset.additiveBreathing]);
  const additiveBreathingClip = useMemo(() => {
    if (!additiveBreathingSource) return null;
    const tracks = additiveBreathingSource.tracks
      .filter(track => ADDITIVE_BREATHING_BONE_RE.test(track.name.split('.')[0]) && track.name.endsWith('.quaternion'))
      .map(track => track.clone());
    if (!tracks.length) return null;
    const clip = new THREE.AnimationClip(
      `${additiveBreathingSource.name}.additive`,
      additiveBreathingSource.duration,
      tracks,
    );
    THREE.AnimationUtils.makeClipAdditive(clip);
    return clip;
  }, [additiveBreathingSource]);
  const footContactRig = useMemo(() => createFootContactRig({
    assetId: animationProfileId,
    asset,
    scene: importedScene,
    groupRef: group,
    grounding,
  }), [animationProfileId, asset, importedScene, grounding]);
  const renderUserData = useMemo(() => ({
    ...(reflect ? { reflect: true } : {}),
    renderSource: `model:${assetId}`,
    renderLabel: `Model: ${assetId}`,
    renderKind: 'model-asset',
    renderPath: asset.path || null,
  }), [asset.path, assetId, reflect]);

  const getAction = useCallback((name) => {
    return lazyActions.get(name);
  }, [lazyActions]);

  const animationDebugEnabled = useMemo(modelAnimationDebugEnabled, []);
  const lastHeldAnimationDebugAt = useRef(-Infinity);
  const publishAnimationDebug = useCallback((requested, action, metadata = {}) => {
    if (!animationDebugEnabled || typeof window === 'undefined') return;
    const debugPayload = {
      assetId,
      requested,
      active: action?.getClip?.()?.name || null,
      timeScale: action?.getEffectiveTimeScale?.() ?? null,
      weight: action?.getEffectiveWeight?.() ?? null,
      ...metadata,
      available: lazyActions.availableNames,
      loadedActions: lazyActions.size,
    };
    window.__modelAnimationDebug = {
      ...(window.__modelAnimationDebug || {}),
      [assetId]: debugPayload,
    };
    if (String(assetId).startsWith('darwin')) {
      window.__darwinAnimationDebug = debugPayload;
    }
  }, [animationDebugEnabled, assetId, lazyActions]);

  const playAnimation = useCallback((request) => {
    const normalized = normalizeAnimationRequest(request);
    const requestedClip = normalized?.clip;
    const fade = normalized?.fade ?? null;
    const timeScale = THREE.MathUtils.clamp(normalized?.timeScale ?? 1, 0.35, 1.8);
    const maxTime = Number.isFinite(normalized?.maxTime) ? Math.max(0, normalized.maxTime) : null;
    const fallbackClip = animationProfileId === 'darwin5'
      ? (darwin5ClipFallback(requestedClip) || CLIP_FALLBACKS[requestedClip] || CLIP_FALLBACKS[normalizeClipName(requestedClip)])
      : (CLIP_FALLBACKS[requestedClip] || CLIP_FALLBACKS[normalizeClipName(requestedClip)]);
    const requestedAction = getAction(requestedClip) || getAction(fallbackClip);
    // A model switch remounts the boot GLB before its deferred animation banks
    // resolve. Preserve a natural idle during that brief gap instead of
    // reporting a known bank clip (for example `gather`) as genuinely missing.
    // Keep the active request as the idle clip so the requested bank action can
    // replace it on the next selector tick as soon as the bank arrives.
    const waitingForAnimationBank = !requestedAction
      && animationBanks.length > 0
      && !animationBanksReady;
    const next = requestedAction || (waitingForAnimationBank ? getAction('idle') : null);
    const resolvedClip = next?.getClip?.()?.name || requestedClip;
    const activeRequestClip = waitingForAnimationBank ? resolvedClip : requestedClip;
    if (!next) {
      if (requestedClip && !warnedMissing.current.has(requestedClip)) {
        warnedMissing.current.add(requestedClip);
        console.warn(`Missing GLB animation clip: ${requestedClip}`, lazyActions.availableNames);
      }
      publishAnimationDebug(requestedClip, activeAction.current, { missing: true });
      return false;
    }
    if (next === activeAction.current && activeRequestClip === activeRequest.current) {
      next.setEffectiveTimeScale(timeScale);
      if (maxTime !== null && next.time >= maxTime) {
        next.time = maxTime;
        next.paused = true;
      } else {
        next.paused = false;
      }
      if (animationDebugEnabled) {
        const now = performance.now();
        if (now - lastHeldAnimationDebugAt.current >= 250) {
          lastHeldAnimationDebugAt.current = now;
          publishAnimationDebug(requestedClip, next, { held: true, maxTime });
        }
      }
      return true;
    }
    const previous = activeAction.current;
    const previousName = previous?.getClip?.()?.name || activeRequest.current;
    const transitionFade = fade ?? fadeForTransition(previousName, resolvedClip, animationProfileId);
    const clipSettings = settingsForClip(resolvedClip, animationProfileId);
    const oneShot = clipSettings.loop === true ? false : isOneShotClip(resolvedClip);
    next.enabled = true;
    next.paused = false;
    next.clampWhenFinished = oneShot;
    next.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
    next.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1);
    if (previous && previous !== next) {
      if (!oneShot && isGaitLoopClip(resolvedClip) && isGaitLoopClip(previousName)) {
        syncGaitPhase(previous, next, animationProfileId, resolvedClip);
      }
      previous.crossFadeTo(next, transitionFade, false);
    } else {
      next.fadeIn(transitionFade);
    }
    next.play();
    activeAction.current = next;
    activeRequest.current = activeRequestClip;
    publishAnimationDebug(requestedClip, next, {
      fade: transitionFade,
      oneShot,
      waitingForAnimationBank,
    });
    return true;
  }, [
    animationBanks.length,
    animationBanksReady,
    animationDebugEnabled,
    animationProfileId,
    getAction,
    lazyActions,
    publishAnimationDebug,
  ]);

  useEffect(() => {
    normalizeImportedMaterials(importedScene, asset, motion);
  }, [asset, importedScene, motion]);

  // Runs after normalize so the rim/roughness override sits on top of the cel
  // pipeline. No-op unless the asset opts in via materialUpgrade (player only).
  useEffect(() => {
    applyPlayerMaterialUpgrade(importedScene, asset, gl);
    applyMaterialRegionUpgrade(importedScene, asset);
    applyEyeGlossUpgrade(importedScene);
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
    overlaySelectorRef.current = overlaySelector;
  }, [overlaySelector]);

  // Mixer mutation belongs in a committed effect. Creating an action from
  // useMemo can leak a half-registered action when React abandons or repeats a
  // render (notably during Fast Refresh and deferred bank commits).
  useEffect(() => {
    if (!additiveBreathingClip) {
      additiveBreathingRef.current = null;
      return undefined;
    }
    const action = mixer.clipAction(additiveBreathingClip, importedScene);
    action.setLoop(THREE.LoopRepeat, Infinity);
    const state = { action, clip: additiveBreathingClip, weight: 0 };
    additiveBreathingRef.current = state;
    return () => {
      if (additiveBreathingRef.current === state) additiveBreathingRef.current = null;
      action.stop();
      mixer.uncacheAction(additiveBreathingClip, importedScene);
    };
  }, [additiveBreathingClip, importedScene, mixer]);

  // Lazily builds (and caches on the state ref) an upper-body-only sub-clip
  // action for the requested clip name.
  const getOverlayAction = useCallback(clipName => {
    const state = overlayStateRef.current;
    if (state.clip === clipName && state.action) return state.action;
    const normalized = normalizeClipName(clipName);
    const source = animations.find(clip => clip.name === clipName || normalizeClipName(clip.name) === normalized);
    if (!source) return null;
    const tracks = source.tracks.filter(track => OVERLAY_UPPER_BODY_RE.test(track.name.split('.')[0]));
    if (!tracks.length) return null;
    if (state.action) {
      const previousAction = state.action;
      const previousClip = previousAction.getClip();
      previousAction.stop();
      overlayMixer.uncacheAction(previousClip, importedScene);
      state.action = null;
      state.clip = null;
    }
    const subClip = new THREE.AnimationClip(`${source.name}.upperBody`, source.duration, tracks);
    const action = overlayMixer.clipAction(subClip, importedScene);
    action.setLoop(THREE.LoopRepeat, Infinity);
    state.action = action;
    state.clip = clipName;
    return action;
  }, [animations, importedScene, overlayMixer]);

  useEffect(() => {
    lazyActions.add(animations);
    // Bank arrivals extend the registry but must not restart or invalidate the
    // action currently playing from the boot GLB.
    if (activeAction.current) return;
    const first = lazyActions.has('idle') ? 'idle' : animations[0]?.name;
    const selector = animationSelectorRef.current;
    const initial = selector ? selector() : first;
    playAnimation(initial || { clip: first, fade: 0.15 });
  }, [animations, lazyActions, playAnimation]);

  useEffect(() => () => {
    const overlayState = overlayStateRef.current;
    if (overlayState.action) {
      const overlayClip = overlayState.action.getClip();
      overlayState.action.stop();
      overlayMixer.uncacheAction(overlayClip, importedScene);
    }
    overlayState.action = null;
    overlayState.clip = null;
    overlayState.weight = 0;
    overlayMixer.stopAllAction();
    overlayMixer.uncacheRoot(importedScene);
  }, [importedScene, overlayMixer]);

  useEffect(() => () => {
    // The registry and mixer are torn down only with the cloned model root.
    // Deferred banks merely add clips and never touch mixer cache ownership.
    mixer.stopAllAction();
    lazyActions.dispose();
    mixer.uncacheRoot(importedScene);
    activeAction.current = null;
    activeRequest.current = null;
  }, [importedScene, lazyActions, mixer]);

  useEffect(() => () => footContactRig.dispose(), [footContactRig]);

  useEffect(() => {
    const state = blinkStateRef.current;
    state.nextAt = null;
    state.startedAt = null;
    state.doublePending = false;
    state.durationScale = 1;
    state.blinkCount = 0;
    state.value = 0;
    blinkTargets.forEach(({ object, index }) => {
      object.morphTargetInfluences[index] = 0;
    });
    return () => {
      blinkTargets.forEach(({ object, index }) => {
        object.morphTargetInfluences[index] = 0;
      });
    };
  }, [blinkTargets]);

  useEffect(() => {
    const resetInfluences = () => {
      hairMotionTargets.forEach(({ object, indices }) => {
        Object.values(indices).forEach(index => {
          if (Number.isInteger(index)) object.morphTargetInfluences[index] = 0;
        });
      });
    };
    hairMotionStateRef.current = {
      locks: hairMotionTargets.map(() => ({
        sway: 0,
        swayVelocity: 0,
        lift: 0,
        liftVelocity: 0,
      })),
      wasAirborne: null,
    };
    resetInfluences();
    return resetInfluences;
  }, [hairMotionTargets]);

  useFrame((frameState, delta) => {
    const blinkCfg = asset.blinkMorph;
    if (blinkCfg && blinkTargets.length) {
      const now = frameState.clock.elapsedTime;
      const state = blinkStateRef.current;
      const minInterval = blinkCfg.minInterval ?? 2.8;
      const maxInterval = Math.max(minInterval, blinkCfg.maxInterval ?? 6.4);
      const blinkOverride = typeof window !== 'undefined' ? window.__darwinBlinkOverride : null;
      const forceClosed = typeof window !== 'undefined' && (
        blinkOverride === 'closed'
        || window.__darwinBlinkHold === true
        || new URLSearchParams(window.location.search).get('blink') === 'closed'
      );
      const forceOpen = blinkOverride === 'open';
      let value = forceClosed ? 1 : 0;
      if (!forceClosed && !forceOpen) {
        if (state.nextAt === null) {
          state.nextAt = now + THREE.MathUtils.lerp(minInterval, maxInterval, Math.random());
        }
        if (state.startedAt === null && now >= state.nextAt) {
          const durationVariation = THREE.MathUtils.clamp(blinkCfg.durationVariation ?? 0.1, 0, 0.35);
          state.startedAt = now;
          state.durationScale = THREE.MathUtils.lerp(
            1 - durationVariation,
            1 + durationVariation,
            Math.random(),
          );
          state.blinkCount += 1;
        }
        if (state.startedAt !== null) {
          const closeDuration = Math.max(0.01, blinkCfg.closeDuration ?? 0.12) * state.durationScale;
          const holdDuration = Math.max(0, blinkCfg.holdDuration ?? 0.07) * state.durationScale;
          const openDuration = Math.max(0.01, blinkCfg.openDuration ?? 0.21) * state.durationScale;
          const totalDuration = closeDuration + holdDuration + openDuration;
          const elapsed = now - state.startedAt;
          if (elapsed < closeDuration) {
            const t = THREE.MathUtils.clamp(elapsed / closeDuration, 0, 1);
            value = t * t * (3 - 2 * t);
          } else if (elapsed < closeDuration + holdDuration) {
            value = 1;
          } else if (elapsed < totalDuration) {
            const t = THREE.MathUtils.clamp(
              (elapsed - closeDuration - holdDuration) / openDuration,
              0,
              1,
            );
            value = 1 - t * t * (3 - 2 * t);
          } else {
            state.startedAt = null;
            value = 0;
            if (state.doublePending) {
              state.doublePending = false;
              state.nextAt = now + THREE.MathUtils.lerp(minInterval, maxInterval, Math.random());
            } else if (Math.random() < (blinkCfg.doubleBlinkChance ?? 0.12)) {
              state.doublePending = true;
              state.nextAt = now + (blinkCfg.doubleBlinkDelay ?? 0.19);
            } else {
              state.nextAt = now + THREE.MathUtils.lerp(minInterval, maxInterval, Math.random());
            }
          }
        }
      }
      state.value = value;
      blinkTargets.forEach(({ object, index }) => {
        object.morphTargetInfluences[index] = value;
      });
      if (typeof window !== 'undefined') {
        window.__darwinBlinkDebug = {
          assetId,
          targetCount: blinkTargets.length,
          value,
          forceClosed,
          forceOpen,
          nextAt: state.nextAt,
          durationScale: state.durationScale,
          blinkCount: state.blinkCount,
        };
      }
    }
    const hairCfg = asset.secondaryHairMotion;
    if (hairCfg && hairMotionTargets.length) {
      const now = frameState.clock.elapsedTime;
      const dt = THREE.MathUtils.clamp(delta, 0, 0.05);
      const motionState = grounding?.motionRef?.current;
      const airborne = Boolean(motionState?.airborne);
      const state = hairMotionStateRef.current;
      if (state.wasAirborne === null) state.wasAirborne = airborne;
      const tookOff = airborne && state.wasAirborne === false;
      const landed = !airborne && state.wasAirborne === true;
      state.wasAirborne = airborne;

      const windLength = Math.hypot(weatherEnv.windX, weatherEnv.windZ) || 1;
      let crosswind = weatherEnv.windX / windLength;
      if (group.current) {
        group.current.getWorldQuaternion(hairWorldQuaternionRef.current);
        hairWorldRightRef.current
          .set(1, 0, 0)
          .applyQuaternion(hairWorldQuaternionRef.current);
        crosswind = (
          weatherEnv.windX * hairWorldRightRef.current.x
          + weatherEnv.windZ * hairWorldRightRef.current.z
        ) / windLength;
      }
      const windStrength = THREE.MathUtils.clamp(
        weatherEnv.windSpeed / Math.max(0.01, hairCfg.fullWindSpeed ?? 1),
        0,
        1,
      );
      const speed = Math.max(0, motionState?.speed || 0);
      const speedStrength = THREE.MathUtils.clamp(
        speed / Math.max(0.01, hairCfg.runSpeedReference ?? 4.8),
        0,
        1,
      );
      const running = Boolean(motionState?.running);
      const walking = Boolean(motionState?.walking);
      const locomotionStrength = running
        ? (hairCfg.runAmplitude ?? 0.78) * Math.max(0.45, speedStrength)
        : walking
          ? (hairCfg.walkAmplitude ?? 0.42) * Math.max(0.38, speedStrength)
          : 0;
      const cadence = running ? 10.2 : 6.8;
      const strideWave = Math.sin(now * cadence);
      const verticalSpeed = motionState?.verticalSpeed || 0;

      state.locks.forEach(lock => {
        if (tookOff) lock.liftVelocity -= hairCfg.takeoffImpulse ?? 3.8;
        if (landed) lock.liftVelocity -= hairCfg.landingImpulse ?? 5.5;
      });

      hairMotionTargets.forEach((target, targetIndex) => {
        const lock = state.locks[targetIndex];
        if (!lock) return;
        const windWave = Math.sin(now * (hairCfg.windFrequency ?? 3.2) + target.phase);
        const rustleFrequency = hairCfg.windRustleFrequency ?? 6.4;
        const rustleWave = Math.sin(now * rustleFrequency + target.phase)
          + Math.sin(now * rustleFrequency * 1.73 + target.phase * 1.61) * 0.42;
        const directionalWind = crosswind
          * windStrength
          * (hairCfg.windAmplitude ?? 1)
          * (0.58 + windWave * 0.42);
        const windRustle = rustleWave
          * windStrength
          * (hairCfg.windRustleAmplitude ?? 1.5)
          * (0.68 + Math.abs(crosswind) * 0.32);
        const windTarget = directionalWind + windRustle;
        const locomotionTarget = strideWave
          * locomotionStrength
          * (0.88 + Math.sin(target.phase) * 0.08);
        const targetSway = THREE.MathUtils.clamp(
          windTarget + locomotionTarget,
          -(hairCfg.maxSwayInfluence ?? 0.85),
          hairCfg.maxSwayInfluence ?? 0.85,
        );
        const inertialLift = airborne
          ? THREE.MathUtils.clamp(
            -verticalSpeed * (hairCfg.airborneLiftResponse ?? 0.075),
            -(hairCfg.maxAirborneLift ?? 0.42),
            hairCfg.maxAirborneLift ?? 0.42,
          )
          : strideWave * locomotionStrength * (hairCfg.strideLiftScale ?? 0.38);
        const movementSweep = speedStrength * (
          running
            ? hairCfg.runSweepLift ?? 0.2
            : walking
              ? hairCfg.walkSweepLift ?? 0.08
              : 0
        );
        const windLift = windStrength
          * (hairCfg.windLiftAmplitude ?? 0.38)
          * (0.72 + Math.sin(now * 1.7 + target.phase) * 0.28);
        const targetLift = THREE.MathUtils.clamp(
          inertialLift + movementSweep + windLift,
          -(hairCfg.maxLiftInfluence ?? 0.8),
          hairCfg.maxLiftInfluence ?? 0.8,
        );

        lock.swayVelocity += (
          (targetSway - lock.sway) * (hairCfg.swayStiffness ?? 78)
          - lock.swayVelocity * (hairCfg.swayDamping ?? 11.5)
        ) * dt;
        lock.sway += lock.swayVelocity * dt;
        lock.sway = THREE.MathUtils.clamp(
          lock.sway,
          -(hairCfg.maxSwayInfluence ?? 0.85),
          hairCfg.maxSwayInfluence ?? 0.85,
        );
        lock.liftVelocity += (
          (targetLift - lock.lift) * (hairCfg.liftStiffness ?? 65)
          - lock.liftVelocity * (hairCfg.liftDamping ?? 10.5)
        ) * dt;
        lock.lift += lock.liftVelocity * dt;
        lock.lift = THREE.MathUtils.clamp(
          lock.lift,
          -(hairCfg.maxLiftInfluence ?? 0.8),
          hairCfg.maxLiftInfluence ?? 0.8,
        );

        const { object, indices } = target;
        if (Number.isInteger(indices.positive)) {
          object.morphTargetInfluences[indices.positive] = Math.max(0, lock.sway);
        }
        if (Number.isInteger(indices.negative)) {
          object.morphTargetInfluences[indices.negative] = Math.max(0, -lock.sway);
        }
        if (Number.isInteger(indices.lift)) {
          object.morphTargetInfluences[indices.lift] = Math.max(0, lock.lift);
        }
        if (Number.isInteger(indices.drop)) {
          object.morphTargetInfluences[indices.drop] = Math.max(0, -lock.lift);
        }
      });
      if (typeof window !== 'undefined') {
        window.__darwinHairDebug = {
          assetId,
          targetCount: hairMotionTargets.length,
          airborne,
          crosswind,
          windStrength,
          speedStrength,
          walking,
          running,
          verticalSpeed,
          locks: state.locks.map(lock => ({
            sway: lock.sway,
            swayVelocity: lock.swayVelocity,
            lift: lock.lift,
            liftVelocity: lock.liftVelocity,
          })),
        };
      }
    }
    if (!animations.length || !group.current) return;
    let mixerDelta = delta;
    if (!bypassAnimationLod) {
      group.current.getWorldPosition(animLodWorldPos);
      const distanceSq = frameState.camera.position.distanceToSquared(animLodWorldPos);
      if (distanceSq > ANIM_LOD_FAR_SQ) {
        return;
      }
      if (distanceSq > ANIM_LOD_NEAR_SQ) {
        animLodSkipParity.current = !animLodSkipParity.current;
        if (animLodSkipParity.current) return;
        mixerDelta = delta * 2;
      }
    }
    // Fauna and other world actors follow the world clock so bullet time
    // slows their wingbeats/gaits along with their motion.
    if (timeScaled) mixerDelta *= worldTime.scale;
    const additiveBreathing = additiveBreathingRef.current;
    if (additiveBreathing) {
      const motionState = grounding?.motionRef?.current;
      let targetWeight = 0.55;
      let breathScale = 1;
      if (motionState) {
        if (motionState.aiming || motionState.action || motionState.swimming) targetWeight = 0;
        else if (motionState.airborne) targetWeight = 0.1;
        else if (motionState.running) targetWeight = 0.15;
        else if (motionState.walking) targetWeight = 0.3;
        // Winded after a sprint: breathe visibly harder and faster.
        if (motionState.winded && !motionState.action && !motionState.aiming) {
          targetWeight = Math.max(targetWeight, 1.0);
          breathScale = 1.5;
        }
      }
      additiveBreathing.weight = THREE.MathUtils.damp(additiveBreathing.weight, targetWeight, 3.5, delta);
      const breathing = additiveBreathing.action;
      if (additiveBreathing.weight > 0.01) {
        if (!breathing.isRunning()) breathing.play();
        breathing.setEffectiveWeight(additiveBreathing.weight);
        breathing.setEffectiveTimeScale(breathScale);
      } else if (breathing.isRunning()) {
        breathing.stop();
      }
    }
    mixer.update(mixerDelta);
    // Masked overlay (e.g. shouldered-aim upper body over walk cycles).
    const overlayRequest = overlaySelectorRef.current ? overlaySelectorRef.current() : null;
    const overlayState = overlayStateRef.current;
    const overlayTarget = overlayRequest?.active && overlayRequest.clip ? 1 : 0;
    overlayState.weight = THREE.MathUtils.damp(overlayState.weight, overlayTarget, 12, delta);
    if (overlayState.weight > 0.02) {
      // Fade out the currently playing overlay before changing clips. Selectors
      // provide an inactive fallback clip, which should not replace a carry or
      // aim pose while its remaining weight is still being blended away.
      const overlayClip = overlayRequest?.active ? overlayRequest.clip : overlayState.clip;
      const overlayAction = getOverlayAction(overlayClip);
      if (overlayAction) {
        if (!overlayAction.isRunning()) overlayAction.reset().play();
        overlayAction.setEffectiveWeight(overlayState.weight);
        overlayMixer.update(mixerDelta);
      }
    } else if (overlayState.action?.isRunning()) {
      overlayState.action.stop();
    }
    footContactRig.update(mixerDelta, activeAction.current, activeRequest.current);
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
    <>
      {activeAnimationBanks.map(bank => (
        <Suspense key={bank.id} fallback={null}>
          <AnimationBankLoader bank={bank} onLoad={handleAnimationBankLoad} />
        </Suspense>
      ))}
      <group
        ref={group}
        scale={asset.scale || 1}
        rotation={asset.rotation || [0, 0, 0]}
        position={[0, asset.yOffset || 0, 0]}
        userData={renderUserData}
      >
        <primitive object={importedScene} />
      </group>
    </>
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
  timeScaled = false,
  overlaySelector = null,
  castShadow = null,
  receiveShadow = null,
  animationBankPhase = Number.POSITIVE_INFINITY,
  onAnimationBanksReady = null,
}) {
  const asset = getModelAsset(id);
  if (!asset?.enabled) return fallback;

  return (
    <Suspense fallback={fallback}>
      <GLBPrimitive
        key={id}
        assetId={id}
        asset={asset}
        animationSelector={animationSelector}
        motion={motion}
        damageFlash={damageFlash}
        reflect={reflect}
        onSceneReady={onSceneReady}
        grounding={grounding}
        timeScaled={timeScaled}
        overlaySelector={overlaySelector}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
        animationBankPhase={animationBankPhase}
        onAnimationBanksReady={onAnimationBanksReady}
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
