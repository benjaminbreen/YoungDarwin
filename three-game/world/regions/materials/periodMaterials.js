import * as THREE from 'three';
import { loadRepeatingTerrainTexture } from './pbrTerrainTextures';

const BASE = '/assets/textures/interiors/period-kit';
const surface = (file, tileMetres, normalStrength, fallback, uvMode = 'metres') => ({
  albedo: `${BASE}/${file}-albedo.webp`,
  normal: `${BASE}/${file}-normal.webp`,
  roughness: `${BASE}/${file}-roughness.webp`,
  tileMetres, normalStrength, fallback, uvMode,
});

// Nominal physical scales match the source/bake report. Panel surfaces occupy
// one authored UV square; repeating material surfaces use metre-based UVs.
export const PERIOD_SURFACES = {
  weatheredWood: surface('weathered-wood', 0.9, 0.65, '#8d8579'),
  endGrain: surface('end-grain', 0.5, 0.5, '#9e907a', 'panel'),
  canvas: surface('canvas', 0.2, 0.45, '#a59a82'),
  patchedCanvas: surface('patched-canvas', 1.6, 0.6, '#b8ab8f', 'panel'),
  linen: surface('linen', 0.15, 0.4, '#d3c6aa'),
  wool: surface('wool', 0.18, 0.4, '#85827a'),
  sacking: surface('sacking', 0.25, 0.55, '#a28d65'),
  leather: surface('leather', 0.25, 0.45, '#795034'),
};

export function loadPeriodSurface(key, { repeat, rotation = 0, offset = [0, 0] } = {}) {
  const config = PERIOD_SURFACES[key];
  if (!config) throw new Error(`Unknown period surface: ${key}`);
  const maps = {
    map: loadRepeatingTerrainTexture(config.albedo, { fallback: config.fallback, colorSpace: THREE.SRGBColorSpace }),
    normalMap: loadRepeatingTerrainTexture(config.normal, { fallback: [128, 128, 255, 255] }),
    roughnessMap: loadRepeatingTerrainTexture(config.roughness, { fallback: [230, 230, 230, 255] }),
  };
  const tiles = repeat || (config.uvMode === 'panel' ? [1, 1] : [1 / config.tileMetres, 1 / config.tileMetres]);
  for (const texture of Object.values(maps)) {
    texture.repeat.set(...tiles);
    texture.offset.set(...offset);
    texture.center.set(0.5, 0.5);
    texture.rotation = rotation;
    if (config.uvMode === 'panel') texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  }
  // Non-enumerable so callers can spread only Three material parameters and
  // enumerate owned texture handles for disposal without including metadata.
  Object.defineProperty(maps, 'periodSurface', { value: { key, ...config, rotation } });
  return maps;
}

export function createPeriodMaterial(key, {
  color = '#ffffff', normalScale, name = `Period:${key}`,
  repeat, rotation = 0, offset, ...properties
} = {}) {
  const maps = loadPeriodSurface(key, { repeat, rotation, offset });
  const strength = normalScale ?? maps.periodSurface.normalStrength;
  const material = new THREE.MeshStandardMaterial({
    ...maps, name, color, roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(strength, strength), ...properties,
  });
  material.userData.periodSurface = maps.periodSurface;
  material.addEventListener('dispose', () => Object.values(maps).forEach(texture => texture.dispose()));
  return material;
}
