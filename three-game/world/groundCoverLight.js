import * as THREE from 'three';
import { fogAtmosphereUniforms } from './fogAtmosphere';

// Shared day/weather light tint for the hand-written ground-cover shaders
// (dense grass, stylized meadows, hybrid grass tufts). Those materials are
// fully unlit — their authored color ramps are painted for clear noon — so
// without this they held noon-green at dusk while the terrain around them
// went dark. One writer (SkyController, alongside the fog/cloud-shade drive)
// mutates the single shared uniform value; every field references it.
//
// The curve is deliberately anchored to identity at clear noon so the
// authored ramps keep their exact daytime look; everything here only
// *removes* light. Tuning constants below are first-pass values — judge them
// at dusk and under overcast, not at noon (noon is identity by construction).
export const groundCoverLightUniforms = {
  uGroundCoverTint: { value: new THREE.Color(1, 1, 1) },
};

// The uniform set a ground-cover ShaderMaterial needs to participate in the
// scene's shared fog/cloud-shadow system (its shaders include the patched
// fog chunks) plus the shared tint above. fogColor/fogDensity/fogNear/fogFar
// are fresh per-material objects because three's fog refresh writes into
// them each render; the atmosphere extras and the tint are the shared
// single-writer values, passed by reference.
export function groundCoverFogUniforms() {
  return {
    fogColor: { value: new THREE.Color('#cfe6f4') },
    fogDensity: { value: 0.012 },
    fogNear: { value: 30 },
    fogFar: { value: 200 },
    uFogSunDir: fogAtmosphereUniforms.uFogSunDir,
    uFogSunColor: fogAtmosphereUniforms.uFogSunColor,
    uFogAtmo: fogAtmosphereUniforms.uFogAtmo,
    uCloudShade: fogAtmosphereUniforms.uCloudShade,
    uCloudShade2: fogAtmosphereUniforms.uCloudShade2,
    uGroundCoverTint: groundCoverLightUniforms.uGroundCoverTint,
  };
}

// Moonlit floor: grass at night reads as cool blue-grey, not black — the
// terrain keeps a similar readable floor under its own night lighting.
const NIGHT_TINT = { r: 0.16, g: 0.2, b: 0.3 };
// Golden hour warms the tips more than it warms the ground.
const GOLDEN_TINT = { r: 1.07, g: 0.97, b: 0.84 };
// Closed sky: dimmer and slightly cool, matching the key-light response.
const OVERCAST_TINT = { r: 0.8, g: 0.84, b: 0.87 };

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Called by SkyController each outdoor frame with values it already computed.
export function driveGroundCoverLight({ daylight = 1, golden = 0, overcast = 0, rain = 0 } = {}) {
  const tint = groundCoverLightUniforms.uGroundCoverTint.value;
  let r = lerp(NIGHT_TINT.r, 1, daylight);
  let g = lerp(NIGHT_TINT.g, 1, daylight);
  let b = lerp(NIGHT_TINT.b, 1, daylight);
  const goldenAmount = golden * daylight * 0.8;
  r *= lerp(1, GOLDEN_TINT.r, goldenAmount);
  g *= lerp(1, GOLDEN_TINT.g, goldenAmount);
  b *= lerp(1, GOLDEN_TINT.b, goldenAmount);
  r *= lerp(1, OVERCAST_TINT.r, overcast);
  g *= lerp(1, OVERCAST_TINT.g, overcast);
  b *= lerp(1, OVERCAST_TINT.b, overcast);
  const rainDim = 1 - rain * 0.12;
  tint.setRGB(r * rainDim, g * rainDim, b * rainDim);
}
