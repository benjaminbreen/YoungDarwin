// Ground footprints: what the soil looks like where a plant or rock stands.
//
// Every region's terrain shader layers its litter, duff and gravel by noise
// and authored masks, so the ground under a palo santo was the same bright
// sand as open ground three metres away, and boulders read as set down on
// the surface rather than bedded into it. This module rasterises the region's
// actual plants and rocks into one small RGB mask, and the shared terrain
// chain (components/scene/Terrain.jsx) reads it once per fragment:
//
//   R  canopy  — soft disc under trees, shrubs and cacti: leaf duff, shade,
//                less sky light. Overlapping canopies screen together, so a
//                thicket reads darker than a lone bush.
//   G  collar  — a ring of finer, darker grit banked against each rock.
//   B  base    — the tight packed-soil patch around a trunk or stem.
//
// Positions come from the same ecology definitions and runtime obstacles the
// renderers draw from, so the mask cannot drift from the props above it.
// Cost at runtime is one sampler and one texture fetch; the raster itself is
// built once per ecology object on the main thread (a few ms).

import * as THREE from 'three';
import { classifyFoliagePushProfile } from './ecology/foliagePushProfiles';
import { isLooseRock } from './looseRocks';
import { getRuntimeObstacles } from './obstacles';

// Metres per texel. Fine enough that a 0.6 m saltbush still gets a soft
// disc; capped so the largest regions stay at or under 512².
const TEXEL_METRES = 0.35;
const MAX_TEXELS = 512;
const MARGIN_METRES = 4;

// Half-width of each runtime GLB at scale 1, measured from the baked scene
// bounds (node transforms included). Item scale multiplies these. Models not
// listed fall back to their push-profile default below.
const GLB_HALF_WIDTH = {
  'runtime-candelabra-cactus.glb': 0.32,
  'runtime-croton.glb': 1.52,
  'runtime-darwiniothamnus.glb': 0.36,
  'runtime-galapagos-cotton.glb': 0.5,
  'runtime-galapagos-fern.glb': 0.26,
  'runtime-jasminocereus-1.glb': 0.31,
  'runtime-jasminocereus-2.glb': 0.26,
  'runtime-mangrove-lowpoly.glb': 1.02,
  'runtime-mangrove-tree.glb': 5.5,
  'runtime-manzanillo.glb': 3.49,
  'runtime-opuntia.glb': 1.25,
  'runtime-big-opuntia.glb': 0.55,
  'runtime-palo-santo.glb': 3.32,
  'runtime-purple-shrub.glb': 0.52,
  'runtime-saltbush-1.glb': 0.72,
  'runtime-saltbush-2.glb': 0.71,
  'runtime-saltbush-3.glb': 2.69,
  'runtime-scalesia-pedunculata-tree.glb': 2.56,
  'runtime-scalesia.glb': 1.24,
  'runtime-sesuvium.glb': 0.23,
};

// Per push profile: fallback half-width at scale 1, how strongly the canopy
// marks the ground, and the plausible radius range in metres (guards against
// models whose source units differ from their item scale convention).
const PROFILE_FOOTPRINT = {
  tree: { halfWidth: 2.4, strength: 1, min: 1.2, max: 5.5 },
  sapling: { halfWidth: 1.2, strength: 0.8, min: 0.7, max: 3 },
  woodyShrub: { halfWidth: 0.9, strength: 0.85, min: 0.5, max: 3.2 },
  shrub: { halfWidth: 0.8, strength: 0.75, min: 0.45, max: 3 },
  succulent: { halfWidth: 0.6, strength: 0.55, min: 0.35, max: 2.4 },
  herb: { halfWidth: 0.4, strength: 0.35, min: 0.25, max: 1.2 },
};

// Interactive (physics) flora carries a runtime id instead of a GLB path.
const INTERACTIVE_FOOTPRINT = {
  'palo-santo': { radius: 2.6, strength: 1 },
  'prickly-pear': { radius: 1.2, strength: 0.6 },
  'lava-cactus': { radius: 0.55, strength: 0.4 },
  'delilia-inelegans': { radius: 0.45, strength: 0.3 },
  'lecocarpus-pinnatifidus': { radius: 0.55, strength: 0.35 },
  'sicyos-villosus': { radius: 0.6, strength: 0.3 },
};

const NON_PLANT = /driftwood|coral|barnacle|algae|wrack|shell|grass|sedge|fence|barrel|scree/;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function finitePosition(item) {
  const x = Number(item?.x ?? item?.position?.[0]);
  const z = Number(item?.z ?? item?.position?.[2]);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function glbName(path) {
  return typeof path === 'string' ? path.split('/').pop().replace(/[?#].*$/, '') : '';
}

function collectFloraLayer(layer, out) {
  if (!Array.isArray(layer?.items)) return;
  const descriptor = `${layer.id || ''} ${layer.path || ''} ${layer.label || ''}`.toLowerCase();
  if (NON_PLANT.test(descriptor)) return;
  const profileName = classifyFoliagePushProfile(layer);
  const profile = PROFILE_FOOTPRINT[profileName];
  if (!profile) return;
  const halfWidth = GLB_HALF_WIDTH[glbName(layer.path)] ?? profile.halfWidth;
  for (const item of layer.items) {
    const position = finitePosition(item);
    if (!position) continue;
    const scale = typeof item.scale === 'number' ? item.scale : 1;
    const widthScale = Math.max(item.widthScale || 1, item.depthScale || 1);
    out.canopies.push({
      ...position,
      radius: clamp(halfWidth * scale * widthScale, profile.min, profile.max),
      strength: profile.strength,
    });
  }
}

function collectGeneratedTrees(layer, out) {
  for (const item of layer?.items || []) {
    const position = finitePosition(item);
    if (!position) continue;
    out.canopies.push({
      ...position,
      radius: clamp(4.2 * (item.scale || 1), 1.6, 6),
      strength: 1,
    });
  }
}

function collectInteractiveFlora(layer, out) {
  const footprint = INTERACTIVE_FOOTPRINT[layer?.runtime];
  if (!footprint) return;
  for (const site of layer.sites || []) {
    const position = finitePosition(site);
    if (!position) continue;
    out.canopies.push({ ...position, radius: footprint.radius, strength: footprint.strength });
  }
}

function collectRock(rock, out) {
  const position = finitePosition(rock);
  if (!position) return;
  const radiusX = Number(rock.radiusX) || Number(rock.scale) || 0.5;
  const radiusZ = Number(rock.radiusZ) || radiusX;
  out.rocks.push({ ...position, radiusX, radiusZ, yaw: Number(rock.yaw) || 0 });
}

export function collectGroundFootprints(ecology, zoneId = ecology?.zoneId) {
  const out = { canopies: [], rocks: [] };
  if (!ecology) return out;
  for (const layer of ecology.flora || []) collectFloraLayer(layer, out);
  for (const layer of ecology.proceduralFlora || []) collectFloraLayer(layer, out);
  for (const layer of ecology.generatedTrees || []) collectGeneratedTrees(layer, out);
  for (const layer of ecology.interactiveFlora || []) collectInteractiveFlora(layer, out);
  // A loose rock is a live rigid body (physics/props/LooseRocks.jsx): a collar
  // baked where it lay would stay behind once Darwin pushes it away, so it
  // only gets the dynamic contact shadow that follows the body.
  for (const rock of ecology.rocks || []) {
    if (!isLooseRock(rock, zoneId)) collectRock(rock, out);
  }

  // Authored obstacles: hero boulders and the few hand-placed trees. Their
  // collider radius is the trunk or rock footprint, not the crown.
  const seenRocks = new Set((ecology.rocks || []).map(rock => rock.id));
  for (const obstacle of zoneId ? getRuntimeObstacles(zoneId) : []) {
    if (!Number.isFinite(obstacle.x) || !Number.isFinite(obstacle.z)) continue;
    const radius = Number(obstacle.radius) || 0;
    if (obstacle.kind === 'tree') {
      out.canopies.push({ x: obstacle.x, z: obstacle.z, radius: clamp(radius * 4, 1.8, 5), strength: 1 });
    } else if ((obstacle.kind === 'boulder' || obstacle.kind === 'rock') && radius > 0) {
      if (obstacle.sourceRock && seenRocks.has(obstacle.sourceRock.id)) continue;
      out.rocks.push({ x: obstacle.x, z: obstacle.z, radiusX: radius, radiusZ: radius, yaw: 0 });
    }
  }
  return out;
}

function footprintBounds({ canopies, rocks }) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const extend = (x, z, reach) => {
    minX = Math.min(minX, x - reach);
    maxX = Math.max(maxX, x + reach);
    minZ = Math.min(minZ, z - reach);
    maxZ = Math.max(maxZ, z + reach);
  };
  canopies.forEach(item => extend(item.x, item.z, item.radius * 1.3));
  rocks.forEach(item => extend(item.x, item.z, Math.max(item.radiusX, item.radiusZ) * 2.2));
  if (!Number.isFinite(minX)) return null;
  return {
    minX: minX - MARGIN_METRES,
    minZ: minZ - MARGIN_METRES,
    maxX: maxX + MARGIN_METRES,
    maxZ: maxZ + MARGIN_METRES,
  };
}

// Returns { data: Uint8Array RGBA, width, height, bounds } or null when the
// region has nothing standing on its ground.
export function rasterizeGroundFootprints(footprints) {
  const bounds = footprintBounds(footprints);
  if (!bounds) return null;
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const texel = Math.max(TEXEL_METRES, spanX / MAX_TEXELS, spanZ / MAX_TEXELS);
  const width = Math.max(4, Math.ceil(spanX / texel));
  const height = Math.max(4, Math.ceil(spanZ / texel));
  const canopy = new Float32Array(width * height);
  const collar = new Float32Array(width * height);
  const base = new Float32Array(width * height);

  // Texel centre for column/row, and the column/row window covering a reach.
  const worldX = column => bounds.minX + (column + 0.5) * texel;
  const worldZ = row => bounds.minZ + (row + 0.5) * texel;
  const forEachTexel = (x, z, reach, visit) => {
    const c0 = Math.max(0, Math.floor((x - reach - bounds.minX) / texel));
    const c1 = Math.min(width - 1, Math.ceil((x + reach - bounds.minX) / texel));
    const r0 = Math.max(0, Math.floor((z - reach - bounds.minZ) / texel));
    const r1 = Math.min(height - 1, Math.ceil((z + reach - bounds.minZ) / texel));
    for (let row = r0; row <= r1; row += 1) {
      const dz = worldZ(row) - z;
      for (let column = c0; column <= c1; column += 1) {
        visit(row * width + column, worldX(column) - x, dz);
      }
    }
  };

  for (const item of footprints.canopies) {
    const outer = item.radius * 1.2;
    // Packed soil around the stem: a third of the crown, kept within the
    // range a trunk flare or cactus pad base plausibly disturbs.
    const core = clamp(item.radius * 0.32, 0.22, 1.1);
    forEachTexel(item.x, item.z, outer, (index, dx, dz) => {
      const distance = Math.hypot(dx, dz);
      const shade = (1 - smoothstep(item.radius * 0.2, outer, distance)) * item.strength;
      if (shade > 0) canopy[index] = canopy[index] + shade - canopy[index] * shade;
      const flare = (1 - smoothstep(core * 0.35, core, distance)) * item.strength;
      if (flare > base[index]) base[index] = flare;
    });
  }

  for (const rock of footprints.rocks) {
    const reachRadius = Math.max(rock.radiusX, rock.radiusZ);
    // Wider skirts on bigger rocks, but never a moat.
    const skirt = clamp(0.3 + reachRadius * 0.45, 0.35, 1.5);
    const cos = Math.cos(rock.yaw);
    const sin = Math.sin(rock.yaw);
    forEachTexel(rock.x, rock.z, reachRadius + skirt, (index, dx, dz) => {
      // Into the rock's local frame (three.js Y rotation), then the elliptical
      // distance to its rim in metres along that direction.
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const planar = Math.hypot(lx, lz);
      const normalized = Math.hypot(lx / rock.radiusX, lz / rock.radiusZ);
      const rimDistance = normalized > 1e-4 ? planar * (1 - 1 / normalized) : -1;
      const value = 1 - smoothstep(0, skirt, rimDistance);
      if (value > collar[index]) collar[index] = value;
    });
  }

  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = Math.round(clamp(canopy[index], 0, 1) * 255);
    data[index * 4 + 1] = Math.round(clamp(collar[index], 0, 1) * 255);
    data[index * 4 + 2] = Math.round(clamp(base[index], 0, 1) * 255);
    data[index * 4 + 3] = 255;
  }
  // The grid rounds up to whole texels, so report the extent it actually
  // covers; the shader maps world xz to UV with these bounds.
  return {
    data,
    width,
    height,
    bounds: { ...bounds, maxX: bounds.minX + width * texel, maxZ: bounds.minZ + height * texel },
  };
}

// --- runtime registry -------------------------------------------------------

const EMPTY_BOUNDS = new THREE.Vector4(0, 0, 0, 0);
let emptyTexture = null;
const byZone = new Map();
const builtFor = new WeakMap();

function getEmptyTexture() {
  if (!emptyTexture) {
    emptyTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    emptyTexture.needsUpdate = true;
  }
  return emptyTexture;
}

// Builds (once per ecology object) and registers the mask for its zone.
export function publishGroundFootprints(ecology) {
  if (!ecology?.zoneId || typeof document === 'undefined') return;
  if (builtFor.has(ecology)) {
    byZone.set(ecology.zoneId, builtFor.get(ecology));
    return;
  }
  const raster = rasterizeGroundFootprints(collectGroundFootprints(ecology));
  let entry = null;
  if (raster) {
    const texture = new THREE.DataTexture(raster.data, raster.width, raster.height, THREE.RGBAFormat);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const { minX, minZ, maxX, maxZ } = raster.bounds;
    entry = {
      texture,
      bounds: new THREE.Vector4(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ)),
    };
  }
  const previous = byZone.get(ecology.zoneId);
  if (previous?.texture && previous !== entry) previous.texture.dispose();
  builtFor.set(ecology, entry);
  byZone.set(ecology.zoneId, entry);
}

// What the terrain shader should sample for this zone right now. Zones with
// no mask get a 1x1 black texture and zero bounds, which the shader skips.
export function getGroundFootprintMap(zoneId) {
  const entry = byZone.get(zoneId);
  return entry
    ? { texture: entry.texture, bounds: entry.bounds }
    : { texture: getEmptyTexture(), bounds: EMPTY_BOUNDS };
}
