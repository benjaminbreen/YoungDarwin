import {
  disposePackedPbrTerrainSet,
  FLOREANA_PBR_TEXTURES,
  loadPackedPbrTerrainSet,
} from './pbrTerrainTextures';

// Shared pale shell-sand layer for authored beaches. Region materials retain
// ownership of coastline, wetness, submerged-shelf, and biome masks; this
// module owns only the reusable dry-sand color, roughness, and normal response.
export function loadWhiteSandBeachLayer({
  texture = FLOREANA_PBR_TEXTURES.whiteSandBeach,
} = {}) {
  const textures = loadPackedPbrTerrainSet(texture);
  return {
    config: texture,
    textures,
    dispose: () => disposePackedPbrTerrainSet(textures),
  };
}

export function bindWhiteSandBeachUniforms(shader, layer) {
  shader.uniforms.uWhiteSandBeachAlbedo = { value: layer.textures.albedo };
  shader.uniforms.uWhiteSandBeachNrh = { value: layer.textures.nrh };
  shader.uniforms.uWhiteSandBeachScale = { value: layer.config.scale };
  shader.uniforms.uWhiteSandBeachNormalStrength = { value: layer.config.normalStrength };
  shader.uniforms.uWhiteSandBeachRoughnessMin = { value: layer.config.roughnessMin };
  shader.uniforms.uWhiteSandBeachRoughnessMax = { value: layer.config.roughnessMax };
}

// One albedo lookup for color and one packed NRH lookup in each relevant
// standard-material stage. Color variation is baked into the albedo, so beach
// materials do not need per-fragment FBM or duplicate rotated texture samples.
export const WHITE_SAND_BEACH_GLSL = /* glsl */`
        uniform sampler2D uWhiteSandBeachAlbedo;
        uniform sampler2D uWhiteSandBeachNrh;
        uniform float uWhiteSandBeachScale;
        uniform float uWhiteSandBeachNormalStrength;
        uniform float uWhiteSandBeachRoughnessMin;
        uniform float uWhiteSandBeachRoughnessMax;

        vec2 whiteSandBeachUv(vec2 worldPosition) {
          return worldPosition * uWhiteSandBeachScale + vec2(0.17, -0.09);
        }

        vec3 whiteSandBeachColor(vec2 worldPosition) {
          return texture2D(uWhiteSandBeachAlbedo, whiteSandBeachUv(worldPosition)).rgb;
        }

        float whiteSandBeachHeight(vec2 worldPosition) {
          return texture2D(uWhiteSandBeachNrh, whiteSandBeachUv(worldPosition)).a;
        }

        float whiteSandBeachRoughness(vec2 worldPosition) {
          float packedRoughness = texture2D(
            uWhiteSandBeachNrh,
            whiteSandBeachUv(worldPosition)
          ).b;
          return mix(
            uWhiteSandBeachRoughnessMin,
            uWhiteSandBeachRoughnessMax,
            packedRoughness
          );
        }

        vec2 whiteSandBeachNormalSlope(vec2 worldPosition) {
          vec2 packedNormal = texture2D(
            uWhiteSandBeachNrh,
            whiteSandBeachUv(worldPosition)
          ).rg * 2.0 - 1.0;
          float normalZ = sqrt(max(1.0 - min(dot(packedNormal, packedNormal), 0.98), 0.02));
          return (packedNormal / max(normalZ, 0.18)) * uWhiteSandBeachNormalStrength;
        }
`;
