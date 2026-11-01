import { createPeriodMaterial } from './periodMaterials';

// Shared salt-weathered timber. Repeat values are authored density trims; the
// material's base tile is 0.9 metres and its grain runs along texture u.
export function createTimberMaterial({
  tint = '#9a9186',
  repeat = [0.85, 0.85],
  offset = [0, 0],
  rotation = 0,
  normalScale = 0.7,
  roughness = 1.0,
} = {}) {
  return createPeriodMaterial('weatheredWood', {
    color: tint, repeat: repeat.map(value => value / 0.9), offset, rotation,
    normalScale, roughness,
  });
}
