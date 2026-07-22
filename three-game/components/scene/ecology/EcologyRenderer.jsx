'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { GLTFLoader } from 'three-stdlib';
import { peek } from 'suspend-react';
import { getRuntimePlayerPose } from '../../../store';
import { getModelAsset } from '../../../modelAssets';
import { getWildlifeAssetId } from '../../../wildlife/wildlifeCatalog';
import { updateFoliageUniforms } from './foliageMotion';
import { InstancedGLBLayer } from './InstancedGLBLayer';
import { InstancedEzTreeLayer } from './InstancedEzTreeLayer';
import { RockField } from './RockField';
import { Footprints } from './Footprints';
import { RockSplashes } from './RockSplashes';
import { CliffSurf } from './CliffSurf';
import { BirdFlock } from './BirdFlock';
import { FlyingModelFlock } from './FlyingModelFlock';
import { ReefSwimmers } from './ReefSwimmers';
import { StaticGLB } from '../../assets/StaticGLB';
import { inspectableTypeForEcologyLayer } from '../../../world/inspectables';
import { terrainHeight } from '../../../world/terrain';
import { CanopySilhouetteLayer } from './CanopySilhouetteLayer';
import { DenseGrassField } from './DenseGrassField';
import { HybridGrassTuftField } from './HybridGrassTuftField';
import { StylizedMeadowField } from './StylizedMeadowField';
import { DryGrassPatchField } from './DryGrassPatchField';
import { SurfaceLitterField } from './SurfaceLitterField';
import { CollectibleBeachFindsLayer } from './CollectibleBeachFindsLayer';
import { AmbientWildlifeLayer } from './AmbientWildlifeLayer';
import { CropFieldLayer } from './CropFieldLayer';
import { StandingWaterSurface } from './StandingWaterSurface';
import { CaveEntrance } from './CaveEntrance';
import { VolcanicFormationField } from './VolcanicFormationField';
import { EcologyHabitatDebugLayer } from './EcologyHabitatDebugLayer';
import { MatureCactusImpactLayer } from './MatureCactusImpactLayer';
import { matureCactusProfileForPath } from '../../../world/ecology/matureCactusInteractions';

// Generic renderer for a zone ecology definition (see
// three-game/world/ecology/). Everything repeated is instanced; one-off props
// fall back to StaticGLB.

// Drives the shared wind/bend uniforms for every foliage material at once.
function FoliageMotionDriver() {
  useFrame(({ clock }, delta) => {
    const pose = getRuntimePlayerPose();
    updateFoliageUniforms(clock.elapsedTime, pose?.position, delta);
  });
  return null;
}

const GLB_PATH_RE = /\.(?:glb|gltf)(?:[?#].*)?$/i;
const ecologyPreloadQueue = [];
const queuedEcologyPreloads = new Set();
let ecologyPreloadHandle = null;
let ecologyPrefetchPaused = false;
let ecologyPreloadInFlightPath = null;
const EMPTY_LAYER_PLAN = {
  flora: [],
  proceduralFlora: [],
  denseGrass: [],
  hybridGrassTufts: [],
  stylizedMeadows: [],
  dryGrassPatches: [],
  surfaceLitter: [],
  collectibleBeachFinds: [],
  ambientWildlife: [],
  flyingModels: [],
  lagoonSurfaces: [],
  generatedTrees: [],
  props: [],
  rocks: [],
  volcanicFormations: [],
  caveEntrances: [],
  canopySilhouettes: [],
  crops: [],
};
const EMPTY_PROP_PLAN = { instancedGroups: [], staticProps: [] };

function drawDistanceFor(item, fallback = 95) {
  const value = item.maxVisibleDistance ?? item.drawDistance;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// A prop can be instanced only if it has no per-object behaviour that the
// instanced path can't express: interactive (crab) props, bobbing props, props
// tilted off the Y axis, or non-uniform scales all stay as individual StaticGLBs.
function propIsInstanceable(prop) {
  if (!prop.path || prop.id?.startsWith('crab-') || prop.bob) return false;
  if (typeof prop.scale !== 'number') return false;
  const rot = prop.rotation || [0, 0, 0];
  return Math.abs(rot[0] || 0) < 1e-3 && Math.abs(rot[2] || 0) < 1e-3;
}

// Map a prop onto the flora-style item shape InstancedGLBLayer consumes,
// resolving `terrainY` up front (the instanced layer doesn't know about it).
function propToItem(prop, zoneId) {
  const [px, py = 0, pz] = prop.position;
  return {
    id: prop.id,
    x: px,
    y: prop.terrainY ? terrainHeight(px, pz, zoneId) + (py || 0) : py,
    z: pz,
    yaw: (prop.rotation && prop.rotation[1]) || 0,
    scale: prop.scale,
    grade: 0,
  };
}

// Species with real vertical silhouettes default to casting into the small
// player-following shadow map; ground carpets and tufts stay contact-shadow
// only. A layer spec can still force either way with an explicit castShadow.
const TALL_SILHOUETTE_GLB = /runtime-(?:candelabra-cactus|opuntia|palo-santo|scalesia[a-z-]*|mangrove-tree|mangrove-lowpoly|manzanillo|darwiniothamnus)\.glb$/;

function floraCastsShadow(layer) {
  if (layer.castShadow != null) return layer.castShadow === true;
  return TALL_SILHOUETTE_GLB.test(layer.path || '');
}

// Split props into instanced groups (≥2 sharing a GLB path) and individual
// StaticGLBs (one-offs + anything not instanceable). Repeated trail markers /
// driftwood collapse from N draw calls to ~1-2 per shared GLB.
function planProps(props, zoneId) {
  const byPath = new Map();
  const staticProps = [];
  props.forEach(prop => {
    if (!propIsInstanceable(prop)) {
      staticProps.push(prop);
      return;
    }
    const key = [
      prop.path,
      prop.castShadow === true ? 'casts' : 'no-cast',
      prop.receiveShadow === true ? 'receives' : 'no-receive',
    ].join('|');
    const bucket = byPath.get(key);
    if (bucket) bucket.push(prop);
    else byPath.set(key, [prop]);
  });
  const instancedGroups = [];
  byPath.forEach(group => {
    if (group.length < 2) {
      staticProps.push(...group);
      return;
    }
    instancedGroups.push({
      path: group[0].path,
      items: group.map(prop => propToItem(prop, zoneId)),
      castShadow: group.some(prop => prop.castShadow === true),
      receiveShadow: group.some(prop => prop.receiveShadow === true),
      maxVisibleDistance: Math.max(...group.map(prop => drawDistanceFor(prop, 85))),
    });
  });
  return { instancedGroups, staticProps };
}

function OptionalSplatBackdrop({ backdrop, enabled }) {
  // Hook point for a future GaussianSplats3D/Drei implementation. The first
  // Cormorant Bay pass must stay beautiful without this asset or dependency.
  if (!enabled || !backdrop?.path) return null;
  return null;
}

function assetPreloadPath(asset) {
  if (!asset?.enabled || !asset.path) return null;
  return asset.cacheKey ? `${asset.path}?v=${encodeURIComponent(asset.cacheKey)}` : asset.path;
}

function scheduleEcologyPreloadPump() {
  if (ecologyPreloadHandle != null
    || ecologyPreloadInFlightPath
    || ecologyPrefetchPaused
    || !ecologyPreloadQueue.length) return;
  const run = () => {
    ecologyPreloadHandle = null;
    if (ecologyPrefetchPaused) return;
    const path = ecologyPreloadQueue.shift();
    if (!path) return;
    ecologyPreloadInFlightPath = path;
    useGLTF.preload(path);
    const startedAt = performance.now();
    const waitForParsedAsset = () => {
      // useGLTF/useLoader cache entries are keyed by the loader class and URL.
      // Do not begin the next parse until this one is actually available; a
      // fixed launch interval still lets several network requests complete and
      // converge on the main thread in the same frame.
      const parsed = peek([GLTFLoader, path]);
      if (parsed || performance.now() - startedAt >= 12000) {
        ecologyPreloadInFlightPath = null;
        ecologyPreloadHandle = window.setTimeout(() => {
          ecologyPreloadHandle = null;
          scheduleEcologyPreloadPump();
        }, 120);
        return;
      }
      ecologyPreloadHandle = window.setTimeout(waitForParsedAsset, 80);
    };
    ecologyPreloadHandle = window.setTimeout(waitForParsedAsset, 80);
  };
  if (typeof window.requestIdleCallback === 'function') {
    ecologyPreloadHandle = window.requestIdleCallback(run, { timeout: 500 });
  } else {
    ecologyPreloadHandle = window.setTimeout(run, 0);
  }
}

function preloadGLBPath(path) {
  if (typeof window === 'undefined' || typeof path !== 'string' || !GLB_PATH_RE.test(path)) return;
  if (queuedEcologyPreloads.has(path)) return;
  queuedEcologyPreloads.add(path);
  ecologyPreloadQueue.push(path);
  scheduleEcologyPreloadPump();
}

function preloadModelAsset(assetId) {
  const path = assetPreloadPath(getModelAsset(assetId));
  if (path) preloadGLBPath(path);
}

function shouldPrefetchAsset(item, ecology) {
  if (!item || item.prefetch === false) return false;
  return !ecology.stream || item.prefetch === true;
}

export function prefetchEcologyAssets(ecology) {
  if (!ecology) return;
  const preloadLayerPath = item => {
    if (shouldPrefetchAsset(item, ecology)) preloadGLBPath(item.path);
  };
  ecology.flora?.forEach(preloadLayerPath);
  ecology.proceduralFlora?.forEach(preloadLayerPath);
  ecology.dryGrassPatches?.forEach(preloadLayerPath);
  ecology.props?.forEach(preloadLayerPath);
  ecology.collectibleBeachFinds?.forEach(layer => {
    if (!shouldPrefetchAsset(layer, ecology)) return;
    layer.items?.forEach(item => preloadGLBPath(item.path));
  });
  ecology.swimmers?.schools?.forEach(preloadLayerPath);
  ecology.swimmers?.cruisers?.forEach(preloadLayerPath);
  ecology.flyingModels?.forEach(item => {
    if (shouldPrefetchAsset(item, ecology) && item.assetId) preloadModelAsset(item.assetId);
  });
  ecology.ambientWildlife?.forEach(layer => {
    if (!shouldPrefetchAsset(layer, ecology)) return;
    layer.items?.forEach(item => preloadModelAsset(getWildlifeAssetId(item.speciesId || item.species || item.specimenId || item.id)));
  });
}

export function setEcologyAssetPrefetchPaused(paused) {
  ecologyPrefetchPaused = paused === true;
  if (!ecologyPrefetchPaused) scheduleEcologyPreloadPump();
}

export function EcologyRenderer({ ecology, settings = {}, preparationPhase = 6 }) {
  const [streamTier, setStreamTier] = useState(0);

  useEffect(() => {
    setStreamTier(0);
    if (!ecology?.stream) return undefined;
    const schedule = ecology.streamSchedule || [700, 1800, 3200];
    const handles = schedule.map((delay, index) => setTimeout(() => {
      setStreamTier(index + 1);
    }, delay));
    return () => handles.forEach(handle => clearTimeout(handle));
  }, [ecology]);

  const visibleLayers = useMemo(() => {
    if (!ecology) return EMPTY_LAYER_PLAN;
    const tierVisible = item => !ecology.stream || (item.loadTier ?? 1) <= streamTier;
    const preparationVisible = phase => preparationPhase >= phase;
    const floraLayers = ecology.flora || [];
    const earlyFloraCount = Math.ceil(floraLayers.length * 0.5);
    return {
      flora: floraLayers.filter((item, index) => (
        tierVisible(item) && preparationVisible(index < earlyFloraCount ? 5 : 6)
      )),
      proceduralFlora: (ecology.proceduralFlora || []).filter(item => tierVisible(item) && preparationVisible(6)),
      denseGrass: (ecology.denseGrass || []).filter(item => tierVisible(item) && preparationVisible(4)),
      hybridGrassTufts: (ecology.hybridGrassTufts || []).filter(item => tierVisible(item) && preparationVisible(4)),
      stylizedMeadows: (ecology.stylizedMeadows || []).filter(item => tierVisible(item) && preparationVisible(4)),
      dryGrassPatches: (ecology.dryGrassPatches || []).filter(item => tierVisible(item) && preparationVisible(4)),
      surfaceLitter: (ecology.surfaceLitter || []).filter(item => tierVisible(item) && preparationVisible(3)),
      collectibleBeachFinds: (ecology.collectibleBeachFinds || []).filter(item => tierVisible(item) && preparationVisible(6)),
      ambientWildlife: (ecology.ambientWildlife || ecology.wildlife || []).filter(item => tierVisible(item) && preparationVisible(6)),
      flyingModels: (ecology.flyingModels || []).filter(item => tierVisible(item) && preparationVisible(6)),
      lagoonSurfaces: (ecology.lagoonSurfaces || []).filter(item => tierVisible(item) && preparationVisible(3)),
      generatedTrees: (ecology.generatedTrees || []).filter(item => tierVisible(item) && preparationVisible(5)),
      props: (ecology.props || []).filter(item => tierVisible(item) && preparationVisible(5)),
      rocks: (ecology.rocks || []).filter(item => tierVisible(item) && preparationVisible(3)),
      volcanicFormations: (ecology.volcanicFormations || []).filter(item => tierVisible(item) && preparationVisible(3)),
      caveEntrances: (ecology.caveEntrances || []).filter(item => tierVisible(item) && preparationVisible(3)),
      canopySilhouettes: (ecology.canopySilhouettes || []).filter(item => tierVisible(item) && preparationVisible(3)),
      crops: (ecology.crops || []).filter(item => tierVisible(item) && preparationVisible(5)),
    };
  }, [ecology, preparationPhase, streamTier]);
  const propPlan = useMemo(() => (
    ecology ? planProps(visibleLayers.props, ecology.zoneId) : EMPTY_PROP_PLAN
  ), [ecology, visibleLayers.props]);
  const matureCactusLayers = useMemo(() => (
    [...visibleLayers.flora, ...visibleLayers.proceduralFlora]
      .filter(layer => matureCactusProfileForPath(layer.path))
  ), [visibleLayers.flora, visibleLayers.proceduralFlora]);

  if (!ecology) return null;
  const {
    flora,
    proceduralFlora,
    denseGrass,
    hybridGrassTufts,
    stylizedMeadows,
    dryGrassPatches,
    surfaceLitter,
    collectibleBeachFinds,
    ambientWildlife,
    flyingModels,
    lagoonSurfaces,
    generatedTrees,
    rocks,
    volcanicFormations,
    caveEntrances,
    canopySilhouettes,
    crops,
  } = visibleLayers;
  const { instancedGroups: instancedProps, staticProps } = propPlan;
  return (
    <group>
      <FoliageMotionDriver />
      <MatureCactusImpactLayer
        layers={matureCactusLayers}
        zoneId={ecology.zoneId}
        enabled={settings.physicsProps !== false}
      />
      {rocks.length > 0 && (
        <RockField
          rocks={rocks}
          sourceId={`ecology:${ecology.zoneId}:rocks`}
          sourceLabel={`${ecology.zoneId} rocks`}
        />
      )}
      {volcanicFormations.map(layer => (
        <VolcanicFormationField
          key={layer.id}
          layer={layer}
          zoneId={layer.zoneId || ecology.zoneId}
        />
      ))}
      {caveEntrances.map(feature => (
        <CaveEntrance key={feature.id} feature={feature} zoneId={ecology.zoneId} />
      ))}
      {canopySilhouettes.map(layer => (
        <CanopySilhouetteLayer
          key={layer.id}
          items={layer.items}
          sourceId={`ecology:${ecology.zoneId}:${layer.id}`}
          sourceLabel={layer.id}
        />
      ))}
      <OptionalSplatBackdrop backdrop={ecology.splatBackdrop} enabled={settings.splatBackdrop !== false} />
      {lagoonSurfaces.map(surface => (
        <StandingWaterSurface key={surface.id} surface={surface} />
      ))}
      {denseGrass.map(layer => (
        <DenseGrassField key={layer.id} layer={layer} zoneId={layer.zoneId || ecology.zoneId} />
      ))}
      {hybridGrassTufts.map(layer => (
        <HybridGrassTuftField key={layer.id} layer={layer} zoneId={layer.zoneId || ecology.zoneId} />
      ))}
      {stylizedMeadows.map(layer => (
        <StylizedMeadowField key={layer.id} layer={layer} zoneId={layer.zoneId || ecology.zoneId} />
      ))}
      {dryGrassPatches.map(layer => (
        <Suspense key={layer.id} fallback={null}>
          <DryGrassPatchField
            layer={layer}
            zoneId={layer.zoneId || ecology.zoneId}
            castShadow={layer.castShadow === true}
            receiveShadow={layer.receiveShadow !== false}
            inspectableType={inspectableTypeForEcologyLayer(layer.id) || 'dry_grass'}
          />
        </Suspense>
      ))}
      {surfaceLitter.map(layer => (
        <SurfaceLitterField key={layer.id} layer={layer} zoneId={layer.zoneId || ecology.zoneId} />
      ))}
      {collectibleBeachFinds.map(layer => (
        <CollectibleBeachFindsLayer key={layer.id} layer={{ ...layer, zoneId: layer.zoneId || ecology.zoneId }} />
      ))}
      {ambientWildlife.map(layer => (
        <AmbientWildlifeLayer key={layer.id} layer={{ ...layer, zoneId: layer.zoneId || ecology.zoneId }} />
      ))}
      {crops.map(layer => (
        <CropFieldLayer key={layer.id} layer={layer} zoneId={layer.zoneId || ecology.zoneId} />
      ))}
      {[...flora, ...proceduralFlora].map(layer => (
        <Suspense key={layer.id} fallback={null}>
          <InstancedGLBLayer
            path={layer.path}
            items={layer.items}
            sink={layer.sink || 0}
            ySquash={layer.ySquash || 1}
            tint={layer.tint || null}
            tintStrength={layer.tintStrength || 0}
            motion={layer.motion || null}
            castShadow={floraCastsShadow(layer)}
            receiveShadow={layer.receiveShadow !== false}
            maxVisibleDistance={drawDistanceFor(layer)}
            sourceId={`ecology:${ecology.zoneId}:${layer.id}`}
            sourceLabel={layer.label || layer.id}
            sourceKind={layer.procedural ? 'ecology-procedural-flora' : 'ecology-flora'}
            inspectableType={inspectableTypeForEcologyLayer(layer.id)}
            variantMode={layer.variantMode || null}
            impactReaction={settings.physicsProps !== false
              && !!matureCactusProfileForPath(layer.path)}
          />
        </Suspense>
      ))}
      {generatedTrees.map(layer => (
        <Suspense key={layer.id} fallback={null}>
          <InstancedEzTreeLayer
            items={layer.items}
            variants={layer.variants}
            sink={layer.sink || 0}
            motion={layer.motion || null}
            castShadow={layer.castShadow !== false}
            receiveShadow={layer.receiveShadow !== false}
            maxVisibleDistance={drawDistanceFor(layer, 115)}
            sourceId={`ecology:${ecology.zoneId}:${layer.id}`}
            sourceLabel={layer.id}
            sourceKind="ecology-generated-trees"
            inspectableType={inspectableTypeForEcologyLayer(layer.id)}
          />
        </Suspense>
      ))}
      {instancedProps.map(group => (
        <Suspense key={`prop-layer:${group.path}`} fallback={null}>
          <InstancedGLBLayer
            path={group.path}
            items={group.items}
            castShadow={group.castShadow}
            receiveShadow={group.receiveShadow}
            maxVisibleDistance={group.maxVisibleDistance}
            sourceId={`ecology:${ecology.zoneId}:props:${group.path.split('/').pop()}`}
            sourceLabel={group.path.split('/').pop()}
            sourceKind="ecology-prop"
          />
        </Suspense>
      ))}
      {staticProps.map(prop => (
        <Suspense key={prop.id} fallback={null}>
          <StaticGLB
            path={prop.path}
            position={prop.terrainY
              ? [
                prop.position[0],
                terrainHeight(prop.position[0], prop.position[2], ecology.zoneId) + (prop.position[1] || 0),
                prop.position[2],
              ]
              : prop.position}
            rotation={prop.rotation}
            scale={prop.scale}
            castShadow={prop.castShadow === true}
            receiveShadow={prop.receiveShadow === true}
            maxVisibleDistance={drawDistanceFor(prop, 85)}
            sourceId={`ecology:${ecology.zoneId}:${prop.id}`}
            sourceLabel={prop.id}
            sourceKind="ecology-prop"
            inspectableType={prop.id?.startsWith('crab-') ? 'crab_prop' : null}
          />
        </Suspense>
      ))}
      {ecology.splashes?.anchors?.length > 0 && (
        <RockSplashes anchors={ecology.splashes.anchors} period={ecology.splashes.period} />
      )}
      {ecology.cliffSurf?.anchors?.length > 0 && (
        <CliffSurf profile={ecology.cliffSurf} />
      )}
      {ecology.birds?.length > 0 && <BirdFlock birds={ecology.birds} />}
      {flyingModels.map(layer => (
        <FlyingModelFlock key={layer.id} birds={layer.items || []} />
      ))}
      {ecology.swimmers && <ReefSwimmers swimmers={ecology.swimmers} />}
      {ecology.footprintBiomes?.length > 0 && (
        <Footprints zoneId={ecology.zoneId} />
      )}
      <EcologyHabitatDebugLayer ecology={ecology} />
    </group>
  );
}
