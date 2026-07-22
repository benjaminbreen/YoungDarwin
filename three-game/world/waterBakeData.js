import * as THREE from 'three';
import { getRegionMap } from '../../game-core/regionMaps';
import { terrainHeight } from './terrain';
import { standingWaterSuppressionMaskAt } from './standingWaterRendering';
import { WATER_LEVEL } from './water';
import { getRuntimeObstacles, obstacleBaseY, obstacleTopY } from './obstacles';
import {
  WATER_BAKE_SIZE,
  WATER_CONTACT_RESOLUTION,
  WATER_RIPPLE_NORMAL_SIZE,
} from './waterTextureManifest';

const HMIN = -6;
const HSPAN = 9;
const SHORE_DIST_RANGE = 60;
const WATER_CONTACT_DISTANCE_RANGE = 3.2;

function regionWaterPlayableSize(zoneId) {
  const region = getRegionMap(zoneId);
  const terrain = region?.terrain || {};
  return {
    width: Math.min(WATER_BAKE_SIZE, terrain.width || WATER_BAKE_SIZE),
    depth: Math.min(WATER_BAKE_SIZE, terrain.depth || WATER_BAKE_SIZE),
  };
}

function rippleNormalHeight(u, v) {
  const waves = [
    [1, 2, 0.42, 0],
    [2, -1, 0.32, 1.7],
    [3, 4, 0.18, 3.1],
    [-4, 3, 0.16, 4.4],
    [6, 1, 0.1, 2.2],
    [5, -6, 0.08, 5.3],
    [9, 4, 0.045, 0.9],
    [-7, 10, 0.036, 3.8],
  ];
  let height = 0;
  for (let index = 0; index < waves.length; index += 1) {
    const [kx, ky, amplitude, phase] = waves[index];
    height += Math.sin(Math.PI * 2 * (kx * u + ky * v) + phase) * amplitude;
  }
  return height;
}

export function buildRippleNormalBytes(size = WATER_RIPPLE_NORMAL_SIZE) {
  const data = new Uint8Array(size * size * 4);
  const sample = (x, y) => rippleNormalHeight(
    ((x % size) + size) % size / size,
    ((y % size) + size) % size / size,
  );
  const normalStrength = 3.35;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * normalStrength;
      const dz = (sample(x, y + 1) - sample(x, y - 1)) * normalStrength;
      const invLen = 1 / Math.hypot(dx, dz, 1);
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((-dz * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  return data;
}

export function buildSeafloorBytes(zoneId, bakeRes) {
  const playable = regionWaterPlayableSize(zoneId);
  const heights = new Float32Array(bakeRes * bakeRes);
  for (let j = 0; j < bakeRes; j += 1) {
    for (let i = 0; i < bakeRes; i += 1) {
      const x = (i / (bakeRes - 1) - 0.5) * WATER_BAKE_SIZE;
      const z = (j / (bakeRes - 1) - 0.5) * WATER_BAKE_SIZE;
      heights[j * bakeRes + i] = terrainHeight(x, z, zoneId);
    }
  }

  const far = 1e9;
  const dist = new Float32Array(bakeRes * bakeRes).fill(far);
  const wet = index => heights[index] < WATER_LEVEL;
  for (let j = 0; j < bakeRes; j += 1) {
    for (let i = 0; i < bakeRes; i += 1) {
      const index = j * bakeRes + i;
      if (!wet(index)) {
        dist[index] = 0;
        continue;
      }
      const adjacentLand = (i > 0 && !wet(index - 1))
        || (i < bakeRes - 1 && !wet(index + 1))
        || (j > 0 && !wet(index - bakeRes))
        || (j < bakeRes - 1 && !wet(index + bakeRes));
      if (adjacentLand) dist[index] = 0.5;
    }
  }

  const diagonal = Math.SQRT2;
  for (let j = 0; j < bakeRes; j += 1) {
    for (let i = 0; i < bakeRes; i += 1) {
      const index = j * bakeRes + i;
      if (i > 0) dist[index] = Math.min(dist[index], dist[index - 1] + 1);
      if (j > 0) {
        dist[index] = Math.min(dist[index], dist[index - bakeRes] + 1);
        if (i > 0) dist[index] = Math.min(dist[index], dist[index - bakeRes - 1] + diagonal);
        if (i < bakeRes - 1) dist[index] = Math.min(dist[index], dist[index - bakeRes + 1] + diagonal);
      }
    }
  }
  for (let j = bakeRes - 1; j >= 0; j -= 1) {
    for (let i = bakeRes - 1; i >= 0; i -= 1) {
      const index = j * bakeRes + i;
      if (i < bakeRes - 1) dist[index] = Math.min(dist[index], dist[index + 1] + 1);
      if (j < bakeRes - 1) {
        dist[index] = Math.min(dist[index], dist[index + bakeRes] + 1);
        if (i < bakeRes - 1) dist[index] = Math.min(dist[index], dist[index + bakeRes + 1] + diagonal);
        if (i > 0) dist[index] = Math.min(dist[index], dist[index + bakeRes - 1] + diagonal);
      }
    }
  }

  const cellSize = WATER_BAKE_SIZE / (bakeRes - 1);
  const data = new Uint8Array(bakeRes * bakeRes * 4);
  const heightAt = (i, j) => heights[
    THREE.MathUtils.clamp(j, 0, bakeRes - 1) * bakeRes
    + THREE.MathUtils.clamp(i, 0, bakeRes - 1)
  ];
  for (let index = 0; index < bakeRes * bakeRes; index += 1) {
    const i = index % bakeRes;
    const j = Math.floor(index / bakeRes);
    const sx = (heightAt(i + 1, j) - heightAt(i - 1, j)) / (cellSize * 2);
    const sz = (heightAt(i, j + 1) - heightAt(i, j - 1)) / (cellSize * 2);
    const softShore = 1 - THREE.MathUtils.smoothstep(Math.hypot(sx, sz), 0.035, 0.22);
    const x = (i / (bakeRes - 1) - 0.5) * WATER_BAKE_SIZE;
    const z = (j / (bakeRes - 1) - 0.5) * WATER_BAKE_SIZE;
    const edgeInside = Math.min(
      playable.width * 0.5 - Math.abs(x),
      playable.depth * 0.5 - Math.abs(z),
    );
    const playableFade = THREE.MathUtils.smoothstep(edgeInside, -7, 22);
    const packedHeight = Math.round(THREE.MathUtils.clamp((heights[index] - HMIN) / HSPAN, 0, 1) * 255);
    const metres = Math.min(dist[index] * cellSize, SHORE_DIST_RANGE);
    data[index * 4] = packedHeight;
    data[index * 4 + 1] = Math.round((metres / SHORE_DIST_RANGE) * 255);
    data[index * 4 + 2] = Math.round(THREE.MathUtils.clamp(softShore, 0, 1) * 255);
    data[index * 4 + 3] = Math.round(THREE.MathUtils.clamp(playableFade, 0, 1) * 255);
  }
  return data;
}

export function buildStandingWaterMaskBytes(zoneId, bakeRes) {
  const data = new Uint8Array(bakeRes * bakeRes * 4);
  for (let j = 0; j < bakeRes; j += 1) {
    for (let i = 0; i < bakeRes; i += 1) {
      const x = (i / (bakeRes - 1) - 0.5) * WATER_BAKE_SIZE;
      const z = (j / (bakeRes - 1) - 0.5) * WATER_BAKE_SIZE;
      const index = (j * bakeRes + i) * 4;
      data[index] = Math.round(standingWaterSuppressionMaskAt(x, z, zoneId) * 255);
      data[index + 3] = 255;
    }
  }
  return data;
}

export function buildWaterContactBytes(zoneId, bakeRes = WATER_CONTACT_RESOLUTION) {
  const pixelCount = bakeRes * bakeRes;
  const bestDistance = new Float32Array(pixelCount);
  bestDistance.fill(Infinity);
  const signedDistance = new Float32Array(pixelCount);
  const normalX = new Float32Array(pixelCount);
  const normalZ = new Float32Array(pixelCount);
  const strength = new Float32Array(pixelCount);
  const cellSize = WATER_BAKE_SIZE / (bakeRes - 1);
  const surfaceObstacles = getRuntimeObstacles(zoneId).filter(obstacle => {
    if (!['rock', 'boulder'].includes(obstacle.kind)) return false;
    const base = obstacleBaseY(obstacle);
    const bottom = base + (obstacle.colliderBottom ?? 0);
    const top = obstacleTopY(obstacle);
    return base < WATER_LEVEL + 0.3
      && bottom < WATER_LEVEL + 0.2
      && top > WATER_LEVEL - 0.75
      && obstacle.radius > 0.18;
  });

  for (const obstacle of surfaceObstacles) {
    const base = obstacleBaseY(obstacle);
    const top = obstacleTopY(obstacle);
    const surfaceStrength = THREE.MathUtils.smoothstep(top, WATER_LEVEL - 0.75, WATER_LEVEL + 0.05)
      * (1 - THREE.MathUtils.smoothstep(base, WATER_LEVEL - 0.02, WATER_LEVEL + 0.3));
    if (surfaceStrength <= 0.01) continue;
    const radius = Math.max(0.18, obstacle.radius);
    const reach = radius + WATER_CONTACT_DISTANCE_RANGE;
    const minI = THREE.MathUtils.clamp(Math.floor(((obstacle.x - reach) / WATER_BAKE_SIZE + 0.5) * (bakeRes - 1)), 0, bakeRes - 1);
    const maxI = THREE.MathUtils.clamp(Math.ceil(((obstacle.x + reach) / WATER_BAKE_SIZE + 0.5) * (bakeRes - 1)), 0, bakeRes - 1);
    const minJ = THREE.MathUtils.clamp(Math.floor(((obstacle.z - reach) / WATER_BAKE_SIZE + 0.5) * (bakeRes - 1)), 0, bakeRes - 1);
    const maxJ = THREE.MathUtils.clamp(Math.ceil(((obstacle.z + reach) / WATER_BAKE_SIZE + 0.5) * (bakeRes - 1)), 0, bakeRes - 1);
    for (let j = minJ; j <= maxJ; j += 1) {
      const z = (j / (bakeRes - 1) - 0.5) * WATER_BAKE_SIZE;
      for (let i = minI; i <= maxI; i += 1) {
        const x = (i / (bakeRes - 1) - 0.5) * WATER_BAKE_SIZE;
        const dx = x - obstacle.x;
        const dz = z - obstacle.z;
        const centreDistance = Math.hypot(dx, dz);
        const edgeDistance = centreDistance - radius;
        if (Math.abs(edgeDistance) > WATER_CONTACT_DISTANCE_RANGE) continue;
        const index = j * bakeRes + i;
        if (Math.abs(edgeDistance) >= bestDistance[index]) continue;
        bestDistance[index] = Math.abs(edgeDistance);
        signedDistance[index] = edgeDistance;
        const inverseLength = 1 / Math.max(centreDistance, cellSize * 0.25);
        normalX[index] = dx * inverseLength;
        normalZ[index] = dz * inverseLength;
        strength[index] = surfaceStrength;
      }
    }
  }

  const data = new Uint8Array(pixelCount * 4);
  for (let index = 0; index < pixelCount; index += 1) {
    if (strength[index] <= 0) {
      data[index * 4] = 128;
      data[index * 4 + 1] = 128;
      data[index * 4 + 2] = 128;
      continue;
    }
    data[index * 4] = Math.round(THREE.MathUtils.clamp(
      signedDistance[index] / (WATER_CONTACT_DISTANCE_RANGE * 2) + 0.5,
      0,
      1,
    ) * 255);
    data[index * 4 + 1] = Math.round((normalX[index] * 0.5 + 0.5) * 255);
    data[index * 4 + 2] = Math.round((normalZ[index] * 0.5 + 0.5) * 255);
    data[index * 4 + 3] = Math.round(THREE.MathUtils.clamp(strength[index], 0, 1) * 255);
  }
  return data;
}
