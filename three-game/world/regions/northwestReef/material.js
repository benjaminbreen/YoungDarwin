import * as THREE from 'three';
import {
  disposePackedPbrTerrainSet,
  FLOREANA_PBR_TEXTURES,
  loadPackedPbrTerrainSet,
} from '../materials/pbrTerrainTextures';
import {
  bindWhiteSandBeachUniforms,
  loadWhiteSandBeachLayer,
  WHITE_SAND_BEACH_GLSL,
} from '../materials/whiteSandBeachLayer';

// Northwest Reef keeps its authored coastline/islet/outcrop masks, but uses the
// shared baked white-sand layer for color and PBR detail. The remaining region
// shader is deliberately analytic: no per-fragment FBM, duplicate rotated
// samples, or derivative-built procedural normals.
export function createNorthwestReefTerrainMaterial() {
  const tuffConfig = FLOREANA_PBR_TEXTURES.sandyTuff;
  const tuffTextures = loadPackedPbrTerrainSet(tuffConfig);
  const whiteSand = loadWhiteSandBeachLayer();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    disposePackedPbrTerrainSet(tuffTextures);
    whiteSand.dispose();
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = { value: new THREE.Color('#f6e3ae') };
    shader.uniforms.rimIntensity = { value: 0.04 };
    shader.uniforms.uNwrTuffAlbedo = { value: tuffTextures.albedo };
    shader.uniforms.uNwrTuffNrh = { value: tuffTextures.nrh };
    shader.uniforms.uNwrTuffScale = { value: tuffConfig.scale };
    shader.uniforms.uNwrTuffNormalStrength = { value: tuffConfig.normalStrength };
    shader.uniforms.uNwrTuffRoughnessMix = { value: tuffConfig.roughnessMix };
    bindWhiteSandBeachUniforms(shader, whiteSand);
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 rimColor;
        uniform float rimIntensity;
        uniform sampler2D uNwrTuffAlbedo;
        uniform sampler2D uNwrTuffNrh;
        uniform float uNwrTuffScale;
        uniform float uNwrTuffNormalStrength;
        uniform float uNwrTuffRoughnessMix;
        varying vec3 vTerrainWorld;
        ${WHITE_SAND_BEACH_GLSL}

        vec2 nwrTuffUv(vec2 worldPosition) {
          return worldPosition * uNwrTuffScale + vec2(0.17, -0.09);
        }

        vec3 nwrTuffColor(vec2 worldPosition) {
          return texture2D(uNwrTuffAlbedo, nwrTuffUv(worldPosition)).rgb;
        }

        float nwrTuffRoughness(vec2 worldPosition) {
          float packedRoughness = texture2D(uNwrTuffNrh, nwrTuffUv(worldPosition)).b;
          return clamp(packedRoughness, 0.58, 0.98);
        }

        vec2 nwrTuffNormalSlope(vec2 worldPosition) {
          vec2 packedNormal = texture2D(
            uNwrTuffNrh,
            nwrTuffUv(worldPosition)
          ).rg * 2.0 - 1.0;
          float normalZ = sqrt(max(1.0 - min(dot(packedNormal, packedNormal), 0.98), 0.02));
          return (packedNormal / max(normalZ, 0.18)) * uNwrTuffNormalStrength;
        }

        float nwrCoastZ(float x) {
          float bend = smoothstep(34.0, 54.0, -x);
          return 6.0
            + sin(x * 0.058 + 0.8) * 3.4
            + sin(x * 0.026 + 2.1) * 2.0
            + bend * 26.0;
        }

        float nwrIslet(vec2 worldPosition) {
          vec2 offset = worldPosition - vec2(-6.0, -27.0);
          float angle = atan(offset.y, offset.x);
          float wobble = 1.0
            + sin(angle * 3.0 + 1.7) * 0.2
            + sin(angle * 5.0 - 0.6) * 0.13;
          return length(offset / (vec2(7.0, 5.4) * wobble));
        }

        float nwrGarden(vec2 worldPosition) {
          float first = exp(-dot(
            worldPosition - vec2(16.0, -10.0),
            worldPosition - vec2(16.0, -10.0)
          ) / 35.28);
          float second = exp(-dot(
            worldPosition - vec2(30.0, -16.0),
            worldPosition - vec2(30.0, -16.0)
          ) / 35.28);
          float third = exp(-dot(
            worldPosition - vec2(-28.0, -13.0),
            worldPosition - vec2(-28.0, -13.0)
          ) / 35.28);
          return max(first, max(second, third));
        }

        float nwrOutcrop(vec2 worldPosition) {
          float east = exp(-(
            pow((worldPosition.x - 40.0) / 8.5, 2.0)
            + pow((worldPosition.y - 11.0) / 7.5, 2.0)
          ));
          float back = exp(-(
            pow((worldPosition.x + 32.0) / 7.5, 2.0)
            + pow((worldPosition.y - 28.0) / 7.0, 2.0)
          ));
          float middle = exp(-(
            pow((worldPosition.x - 6.0) / 5.0, 2.0)
            + pow((worldPosition.y - 35.0) / 5.5, 2.0)
          ));
          return max(east, max(back, middle));
        }

        float nwrBeachDistance(vec2 worldPosition) {
          return worldPosition.y - nwrCoastZ(worldPosition.x) + 6.35;
        }

        float nwrMainWhiteBeach(vec2 worldPosition) {
          float beachDistance = nwrBeachDistance(worldPosition);
          return smoothstep(-1.4, 2.0, beachDistance)
            * (1.0 - smoothstep(28.0, 44.0, beachDistance));
        }

        float nwrWhiteBeachMask(vec2 worldPosition, float height) {
          float isletDistance = nwrIslet(worldPosition);
          float shore = nwrMainWhiteBeach(worldPosition);
          float islet = (1.0 - smoothstep(0.82, 1.18, isletDistance))
            * smoothstep(-0.35, 0.08, height);
          float outcrop = smoothstep(0.3, 0.55, nwrOutcrop(worldPosition));
          return clamp(max(shore, islet) * (1.0 - outcrop), 0.0, 1.0);
        }

        float nwrSurfaceVariation(vec2 worldPosition) {
          float broad = sin(dot(worldPosition, vec2(0.071, 0.043)) + 1.7);
          float crossed = sin(dot(worldPosition, vec2(-0.037, 0.089)) - 0.8);
          return clamp(0.5 + broad * 0.18 + crossed * 0.1, 0.0, 1.0);
        }

        float nwrDryTuffMask(float height, float basalt, float submerged) {
          float aboveWater = smoothstep(-0.36, 0.08, height);
          return clamp((1.0 - submerged) * aboveWater * (1.0 - basalt), 0.0, 1.0);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 nwrPosition = vTerrainWorld.xz;
        float nwrHeight = vTerrainWorld.y;
        float nwrCoastDistance = nwrPosition.y - nwrCoastZ(nwrPosition.x);
        float nwrBeach = nwrBeachDistance(nwrPosition);
        float nwrIsletDistance = nwrIslet(nwrPosition);
        float nwrVariation = nwrSurfaceVariation(nwrPosition);
        float nwrOutcropMask = smoothstep(0.3, 0.55, nwrOutcrop(nwrPosition));
        float nwrWhiteMask = nwrWhiteBeachMask(nwrPosition, nwrHeight);

        vec3 nwrTuff = nwrTuffColor(nwrPosition) * vec3(1.08, 1.04, 0.94);
        vec3 nwrDrySand = mix(
          vec3(0.46, 0.44, 0.35),
          nwrTuff,
          0.72
        ) * mix(0.94, 1.03, nwrVariation);
        vec3 nwrWhiteSand = whiteSandBeachColor(nwrPosition)
          * mix(0.965, 1.035, nwrVariation);
        vec3 nwrColor = mix(nwrDrySand, nwrWhiteSand, nwrWhiteMask);

        // The water material supplies foam and glints. Terrain only darkens the
        // saturated edge and provides a restrained turquoise shelf underneath.
        float nwrSubmerged = 1.0 - smoothstep(-1.08, -0.84, nwrHeight);
        float nwrDepth = clamp((-0.45 - nwrHeight) / 1.55, 0.0, 1.0);
        vec3 nwrWetPearl = nwrWhiteSand * mix(
          vec3(0.55, 0.59, 0.61),
          vec3(0.7, 0.72, 0.7),
          nwrVariation
        );
        vec3 nwrShallowTeal = mix(
          vec3(0.32, 0.57, 0.58),
          vec3(0.46, 0.69, 0.65),
          nwrVariation
        );
        vec3 nwrDeeperTeal = mix(
          vec3(0.22, 0.5, 0.55),
          vec3(0.35, 0.64, 0.6),
          nwrVariation
        );
        vec3 nwrSeabed = mix(nwrWetPearl, nwrShallowTeal, smoothstep(0.08, 0.34, nwrDepth));
        nwrSeabed = mix(nwrSeabed, nwrDeeperTeal, smoothstep(0.42, 1.0, nwrDepth));

        float nwrCoralBand = smoothstep(1.1, 1.4, nwrIsletDistance)
          * (1.0 - smoothstep(1.85, 2.3, nwrIsletDistance));
        float nwrCoralZone = clamp(
          max(nwrCoralBand * (0.48 + nwrVariation * 0.34), nwrGarden(nwrPosition)),
          0.0,
          1.0
        );
        vec3 nwrCoral = mix(
          vec3(0.57, 0.43, 0.39),
          vec3(0.68, 0.57, 0.45),
          nwrVariation
        );
        nwrSeabed = mix(nwrSeabed, nwrCoral, nwrCoralZone * nwrSubmerged * 0.48);
        nwrColor = mix(nwrColor, nwrSeabed, nwrSubmerged);

        vec3 nwrBasalt = mix(
          vec3(0.075, 0.072, 0.066),
          vec3(0.21, 0.195, 0.165),
          nwrVariation
        );
        nwrColor = mix(nwrColor, nwrBasalt, nwrOutcropMask);

        float nwrWet = (1.0 - smoothstep(0.15, 2.35, nwrBeach))
          * step(0.0, nwrBeach)
          * nwrMainWhiteBeach(nwrPosition)
          * (1.0 - nwrOutcropMask);
        nwrColor = mix(
          nwrColor,
          nwrColor * vec3(0.61, 0.63, 0.63),
          clamp(nwrWet, 0.0, 1.0) * 0.42
        );

        // Preserve the authored vertex tint on tuff while the reusable layer
        // fully owns the pale beach color.
        float nwrMaterialCoverage = mix(0.9, 1.0, nwrWhiteMask);
        diffuseColor.rgb = mix(diffuseColor.rgb, nwrColor, nwrMaterialCoverage);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec2 nwrRoughPosition = vTerrainWorld.xz;
        float nwrRoughHeight = vTerrainWorld.y;
        float nwrRoughSubmerged = 1.0 - smoothstep(-1.08, -0.84, nwrRoughHeight);
        float nwrRoughBasalt = smoothstep(0.3, 0.55, nwrOutcrop(nwrRoughPosition));
        float nwrRoughWhiteMask = nwrWhiteBeachMask(nwrRoughPosition, nwrRoughHeight);
        float nwrRoughTuffMask = nwrDryTuffMask(
          nwrRoughHeight,
          nwrRoughBasalt,
          nwrRoughSubmerged
        ) * (1.0 - nwrRoughWhiteMask);
        roughnessFactor = mix(
          roughnessFactor,
          nwrTuffRoughness(nwrRoughPosition),
          nwrRoughTuffMask * uNwrTuffRoughnessMix
        );
        roughnessFactor = mix(
          roughnessFactor,
          whiteSandBeachRoughness(nwrRoughPosition),
          nwrRoughWhiteMask * 0.86
        );`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec2 nwrNormalPosition = vTerrainWorld.xz;
        float nwrNormalHeight = vTerrainWorld.y;
        float nwrNormalSubmerged = 1.0 - smoothstep(-1.08, -0.84, nwrNormalHeight);
        float nwrNormalBasalt = smoothstep(0.3, 0.55, nwrOutcrop(nwrNormalPosition));
        float nwrNormalWhiteMask = nwrWhiteBeachMask(nwrNormalPosition, nwrNormalHeight);
        float nwrNormalTuffMask = nwrDryTuffMask(
          nwrNormalHeight,
          nwrNormalBasalt,
          nwrNormalSubmerged
        ) * (1.0 - nwrNormalWhiteMask);
        vec2 nwrMappedSlope = whiteSandBeachNormalSlope(nwrNormalPosition)
          * nwrNormalWhiteMask * 0.68;
        nwrMappedSlope += nwrTuffNormalSlope(nwrNormalPosition)
          * nwrNormalTuffMask * 0.86;

        vec3 nwrWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 nwrWorldX = normalize(
          vec3(1.0, 0.0, 0.0) - nwrWorldNormal * nwrWorldNormal.x
        );
        vec3 nwrWorldZ = normalize(cross(nwrWorldX, nwrWorldNormal));
        vec3 nwrMappedWorldNormal = normalize(
          nwrWorldNormal
          + nwrWorldX * nwrMappedSlope.x
          + nwrWorldZ * nwrMappedSlope.y
        );
        normal = normalize(mat3(viewMatrix) * nwrMappedWorldNormal);`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(
          1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))),
          2.6
        );
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };

  material.customProgramCacheKey = () => 'northwest-reef-white-sand-beach-v2';
  material.needsUpdate = true;
  return material;
}
