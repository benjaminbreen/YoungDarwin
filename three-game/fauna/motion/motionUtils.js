import * as THREE from 'three';
import { terrainHeight } from '../../world/terrain';
import { getEcology } from '../../world/ecology';

// Small, allocation-free helpers shared by every fauna archetype. Anything
// that needs per-actor state lives in motionContext.js instead.

const ecologyForageTargetCache = new Map();
const FORAGE_EXCLUDED_PATTERN = /cactus|opuntia|manzanillo|mangrove|palo-santo|scalesia|sicyos|delilia|lecocarpus|resurrection|fern/i;

function forageTargetHeight(layerLabel, item) {
  const scale = Number(item?.scale ?? item?.size) || 1;
  if (/grass/i.test(layerLabel)) return 0.12 + scale * 0.16;
  if (/sesuvium|carpet|ground/i.test(layerLabel)) return 0.1 + scale * 0.12;
  if (/cotton/i.test(layerLabel)) return 0.32 + scale * 0.34;
  if (/croton|saltbush|shrub|castela|darwiniothamnus/i.test(layerLabel)) return 0.24 + scale * 0.32;
  if (/crop|garden/i.test(layerLabel)) return 0.18 + scale * 0.24;
  return 0.18 + scale * 0.25;
}

export function ecologyForageTargets(zoneId) {
  if (ecologyForageTargetCache.has(zoneId)) return ecologyForageTargetCache.get(zoneId);
  const ecology = getEcology(zoneId);
  const targets = [];
  const collections = [
    ['flora', ecology?.flora || []],
    ['proceduralFlora', ecology?.proceduralFlora || []],
    ['interactiveFlora', ecology?.interactiveFlora || []],
    ['dryGrassPatches', ecology?.dryGrassPatches || []],
    ['crops', ecology?.crops || []],
  ];
  for (const [collectionName, layers] of collections) {
    for (const layer of layers) {
      const layerLabel = `${collectionName}:${layer?.id || ''}:${layer?.label || ''}:${layer?.speciesId || ''}:${layer?.path || ''}`;
      if (FORAGE_EXCLUDED_PATTERN.test(layerLabel)) continue;
      const items = layer?.items || layer?.sites || [];
      // Grass fields can contain thousands of blades. A stable sample is dense
      // enough for browsing while keeping target selection cheap for herds.
      const stride = collectionName === 'dryGrassPatches' ? Math.max(1, Math.floor(items.length / 260)) : 1;
      for (let index = 0; index < items.length; index += stride) {
        const item = items[index];
        if (!Number.isFinite(item?.x) || !Number.isFinite(item?.z)) continue;
        const groundY = Number.isFinite(item.y) ? item.y : terrainHeight(item.x, item.z, zoneId);
        targets.push({
          id: item.id || `${layer?.id || collectionName}-${index}`,
          layerId: layer?.id || collectionName,
          kind: collectionName === 'dryGrassPatches' ? 'grass' : 'plant',
          x: item.x,
          y: groundY,
          z: item.z,
          perchY: groundY + forageTargetHeight(layerLabel, item),
        });
      }
    }
  }
  ecologyForageTargetCache.set(zoneId, targets);
  return targets;
}

export function clampOffset(offset, habitat, target = new THREE.Vector2()) {
  const radiusX = Math.max(0.05, habitat.radiusX || 0.4);
  const radiusZ = Math.max(0.05, habitat.radiusZ || 0.2);
  const normalizedX = offset.x / radiusX;
  const normalizedY = offset.y / radiusZ;
  const lengthSq = normalizedX * normalizedX + normalizedY * normalizedY;
  if (lengthSq <= 1) return target.copy(offset);
  const scale = 1 / Math.sqrt(lengthSq);
  return target.set(normalizedX * radiusX * scale, normalizedY * radiusZ * scale);
}

export function yawFromXZ(direction) {
  return Math.atan2(direction.x, direction.y);
}

export function seededUnit(value) {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function moveTowardOffset(current, target, maxDistance, out) {
  out.copy(target).sub(current);
  const distance = out.length();
  if (distance <= maxDistance || distance <= 0.0001) return out.copy(target);
  return out.multiplyScalar(maxDistance / distance).add(current);
}

export function easeInOut(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function animationRequest(clip, timeScale = 1, fade = null) {
  if (!clip) return null;
  return { clip, timeScale, fade };
}

export function chooseProfileClip(seed, primary, variants, t, salt = 0) {
  const options = [];
  if (primary) options.push(primary);
  if (Array.isArray(variants)) {
    for (const clip of variants) {
      if (clip && !options.includes(clip)) options.push(clip);
    }
  } else if (variants && !options.includes(variants)) {
    options.push(variants);
  }
  if (!options.length) return null;
  if (options.length === 1) return options[0];
  const index = Math.floor(seededUnit(seed * (2101 + salt) + Math.floor(t * 0.19) * (37 + salt)) * options.length);
  return options[Math.min(options.length - 1, index)];
}

// Habitat ellipse scaled for flee/forage leashes, falling back to the
// profile's authored radii when the spawn record does not override them.
export function scaledHabitat(habitat, profile, scale = 1) {
  return {
    radiusX: (habitat.radiusX || profile.habitatRadiusX || 1) * scale,
    radiusZ: (habitat.radiusZ || profile.habitatRadiusZ || 1) * scale,
  };
}
