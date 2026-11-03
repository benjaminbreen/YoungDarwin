import * as THREE from 'three';
import {
  resolveStandardFootPathSplatTexture,
  standardFootPathSplatGLSL,
  standardFootPathSplatUniforms,
} from '../../paths/standardPath';
import {
  FLOREANA_PBR_TEXTURES,
  disposePackedPbrTerrainSet,
  loadPackedPbrTerrainSet,
} from '../materials/pbrTerrainTextures';
import {
  bindWhiteSandBeachUniforms,
  loadWhiteSandBeachLayer,
  WHITE_SAND_BEACH_GLSL,
} from '../materials/whiteSandBeachLayer';
import {
  POST_OFFICE_BAY_ARROYO,
  POST_OFFICE_BAY_LOOKOUT,
  POST_OFFICE_BAY_PATH_POINTS,
} from './terrain';

// The path network continues through the carry strips at the south/east map
// edges. At ~33cm/texel this is still enough for a two-metre footpath; the
// height grew with the inland valley, the texel size did not.
export const POST_OFFICE_PATH_SPLAT_BOUNDS = {
  originX: -84,
  originZ: -66,
  width: 168,
  depth: 186,
  size: 560,
};

// The dry wash, as GLSL segment constants so the bed can carry its cobbles
// without another texture.
function arroyoSegmentsGLSL() {
  const lines = [];
  for (let i = 0; i < POST_OFFICE_BAY_ARROYO.length - 1; i += 1) {
    const [ax, az] = POST_OFFICE_BAY_ARROYO[i];
    const [bx, bz] = POST_OFFICE_BAY_ARROYO[i + 1];
    lines.push(`d = min(d, pobSegmentDistance(p, vec2(${f(ax)}, ${f(az)}), vec2(${f(bx)}, ${f(bz)})));`);
  }
  return lines.join('\n          ');
}

const POST_OFFICE_TEXTURE_BASE = '/assets/textures/world/floreana-pbr/post-office-bay';
const POST_OFFICE_LAYERS = {
  ground: {
    ...FLOREANA_PBR_TEXTURES.sandyTuff,
    nrh: `${POST_OFFICE_TEXTURE_BASE}/sandy-tuff_nrh-512-lossless-v1.webp`,
  },
  sand: {
    ...FLOREANA_PBR_TEXTURES.galapagosSand,
    albedo: `${POST_OFFICE_TEXTURE_BASE}/galapagos-sand_albedo-lossless-v1.webp`,
    nrh: `${POST_OFFICE_TEXTURE_BASE}/galapagos-sand_nrh-512-lossless-v1.webp`,
  },
  basalt: FLOREANA_PBR_TEXTURES.darkBasaltGravel,
  cinder: FLOREANA_PBR_TEXTURES.redCinderDirt,
};

function f(value) {
  return Number(value).toFixed(3);
}

function postOfficeFragmentCommon() {
  return /* glsl */`
        uniform vec3 uPobRimColor;
        uniform float uPobRimIntensity;
        uniform sampler2D uPobGroundAlbedo;
        uniform sampler2D uPobGroundNrh;
        uniform sampler2D uPobSandAlbedo;
        uniform sampler2D uPobSandNrh;
        uniform sampler2D uPobBasaltAlbedo;
        uniform sampler2D uPobBasaltNrh;
        uniform sampler2D uPobCinderAlbedo;
        uniform sampler2D uPobCinderNrh;
        varying vec3 vPostOfficeWorld;
        varying float vPostOfficeSlope;
        ${standardFootPathSplatGLSL({
          functionName: 'pobPathSplat',
          textureUniform: 'uPobPathSplat',
          boundsUniform: 'uPobPathSplatBounds',
        })}
        ${WHITE_SAND_BEACH_GLSL}

        float pobHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float pobNoise(vec2 p) {
          vec2 cell = floor(p);
          vec2 local = fract(p);
          vec2 blend = local * local * (3.0 - 2.0 * local);
          return mix(
            mix(pobHash(cell), pobHash(cell + vec2(1.0, 0.0)), blend.x),
            mix(pobHash(cell + vec2(0.0, 1.0)), pobHash(cell + vec2(1.0, 1.0)), blend.x),
            blend.y
          );
        }
        float pobMacroNoise(vec2 p) {
          // Two octaves are enough to suppress obvious tiling. The previous
          // material evaluated several five-octave FBMs in every PBR stage.
          return pobNoise(p) * 0.68 + pobNoise(p * 2.03 + vec2(4.7, -3.1)) * 0.32;
        }
        float pobLandingCoastZ(float x) {
          // Matches the authored landing shoreline closely enough for the
          // material bands to follow the water instead of forming an ellipse.
          if (x <= 2.5) return mix(1.7, 2.7, clamp((x + 9.0) / 11.5, 0.0, 1.0));
          if (x <= 12.5) return mix(2.7, 1.6, clamp((x - 2.5) / 10.0, 0.0, 1.0));
          if (x <= 21.5) return mix(1.6, -1.4, clamp((x - 12.5) / 9.0, 0.0, 1.0));
          return mix(-1.4, -5.6, clamp((x - 21.5) / 9.0, 0.0, 1.0));
        }
        float pobLandingMask(vec2 p) {
          float alongshore = 1.0 - smoothstep(12.0, 20.0, abs(p.x - 11.0));
          float shoreDistance = p.y - pobLandingCoastZ(p.x);
          float seaward = smoothstep(-10.0, -5.5, shoreDistance);
          float inland = 1.0 - smoothstep(11.0, 18.0, shoreDistance);
          return clamp(alongshore * seaward * inland, 0.0, 1.0);
        }
        float pobSandbarWhiteRimMask(vec2 p, float height) {
          // Isolate the low sandbar inside the cove, then select its exposed
          // shoreline elevations so the warm tan centre remains visible.
          vec2 sandbar = (p - vec2(-2.0, -19.0)) / vec2(19.0, 7.6);
          float region = 1.0 - smoothstep(0.78, 1.16, length(sandbar));
          float aboveWater = smoothstep(-0.82, -0.34, height);
          float upperFade = 1.0 - smoothstep(0.42, 1.18, height);
          return clamp(region * aboveWater * upperFade, 0.0, 1.0);
        }
        float pobWhiteSandMask(vec2 p, float height) {
          float landing = pobLandingMask(p);
          float sandbarRim = pobSandbarWhiteRimMask(p, height);
          return clamp(max(landing, sandbarRim), 0.0, 1.0);
        }
        float pobBeachMask(vec2 p) {
          float centralLanding = pobLandingMask(p);
          // Pale coastal material continues through the west/east carry bands
          // toward Northwest Reef and Northern Shore instead of ending in the
          // generic inland ground at the map boundary.
          // Only along the coast: inland the same edges are the lava tongue
          // and the knoll's flank, not a shore.
          float westContinuation = 1.0 - smoothstep(-48.0, -31.0, p.x);
          float eastContinuation = smoothstep(31.0, 48.0, p.x);
          float coastal = 1.0 - smoothstep(16.0, 30.0, p.y);
          float edgeBeach = max(westContinuation, eastContinuation) * 0.94 * coastal;
          return clamp(max(centralLanding, edgeBeach), 0.0, 1.0);
        }
        float pobSegmentDistance(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
          return length(p - (a + ab * t));
        }
        // Inland valley masks; mirror postOfficeArroyoInfo, postOfficeWestLavaMask
        // and postOfficeLookoutMask in terrain.js.
        float pobInlandMask(vec2 p) {
          return smoothstep(30.0, 46.0, p.y);
        }
        float pobArroyoBed(vec2 p) {
          if (p.y < 30.0 || p.y > 90.0 || p.x < 4.0 || p.x > 30.0) return 0.0;
          float d = 1.0e4;
          ${arroyoSegmentsGLSL()}
          float depth = smoothstep(36.0, 52.0, p.y) * (1.0 - smoothstep(73.0, 84.0, p.y));
          float bedHalf = 2.1 + sin(p.y * 0.37) * 0.35;
          return (1.0 - smoothstep(bedHalf * 0.55, bedHalf + 1.4, d)) * min(1.0, depth * 2.5);
        }
        float pobWestLava(vec2 p) {
          return smoothstep(38.0, 50.0, -p.x + sin(p.y * 0.09) * 3.2) * smoothstep(26.0, 40.0, p.y);
        }
        float pobKnoll(vec2 p) {
          vec2 q = (p - vec2(${f(POST_OFFICE_BAY_LOOKOUT.x)}, ${f(POST_OFFICE_BAY_LOOKOUT.z)}))
            / vec2(${f(POST_OFFICE_BAY_LOOKOUT.radiusX)}, ${f(POST_OFFICE_BAY_LOOKOUT.radiusZ)});
          return max(0.0, 1.0 - length(q));
        }
        float pobClearingMask(vec2 p) {
          return 1.0 - smoothstep(2.45, 4.8, length(p - vec2(0.0, 8.5)));
        }
        // Damp sand near the waterline. The upper edge reaches further up the
        // beach than the strict tide height and is broken by a long noise
        // wobble, because a wet band that ends on a perfectly level contour
        // reads as a drawn line rather than as the reach of the last wave.
        float pobWetMask(float height, vec2 p) {
          // Waves run the visible waterline well above WATER_LEVEL, so the
          // band stays fully damp to -0.45 and fades out above the old tide
          // mark; anything lower than that is under the swash and never seen.
          float wobble = (pobNoise(p * 0.09 + vec2(3.7, -6.2)) - 0.5) * 0.3;
          float exposedWet = (1.0 - smoothstep(-0.3, 0.38 + wobble, height)) * step(-0.9, height);
          float submergedWet = (1.0 - smoothstep(-1.42, -0.86, height)) * step(height, -0.9);
          return clamp(max(exposedWet, submergedWet), 0.0, 1.0);
        }
        // The swash strip: the bottom of the damp band, where the last wave
        // left a film of water that has not yet drained. Saturated sand is
        // glassy, so it mirrors the sky instead of scattering it.
        float pobSwashMask(float height, vec2 p) {
          float wobble = (pobNoise(p * 0.13 + vec2(-4.1, 2.6)) - 0.5) * 0.12;
          return (1.0 - smoothstep(-0.66, -0.4 + wobble, height)) * step(-0.9, height);
        }
        float pobSubmergedMask(float height) {
          return 1.0 - smoothstep(-1.42, -0.84, height);
        }
        vec2 pobNormalSlope(vec4 nrh, float strength) {
          vec2 xy = nrh.rg * 2.0 - 1.0;
          float z = sqrt(max(1.0 - min(dot(xy, xy), 0.98), 0.02));
          return (xy / max(z, 0.18)) * strength;
        }
        void pobUvs(
          vec2 p,
          out vec2 groundUv,
          out vec2 sandUv,
          out vec2 basaltUv,
          out vec2 cinderUv
        ) {
          // Detail tiling rides the shared terrain-look panel so the grain can
          // be judged at playing distance instead of guessed from a constant.
          float pobTiling = clamp(uTerrainGradeShape.w, 0.25, 4.0);
          groundUv = p * (${f(POST_OFFICE_LAYERS.ground.scale)} * pobTiling) + vec2(-0.23, 0.29);
          sandUv = p * (${f(POST_OFFICE_LAYERS.sand.scale)} * pobTiling) + vec2(0.13, -0.19);
          basaltUv = p * (${f(POST_OFFICE_LAYERS.basalt.scale)} * pobTiling) + vec2(-0.27, 0.31);
          // Cinder is granular and does not need the old per-fragment path
          // frame calculation; world-space UVs remove all route-segment math.
          cinderUv = p * (${f(POST_OFFICE_LAYERS.cinder.scale)} * pobTiling) + vec2(-0.11, -0.37);
        }
        vec4 pobLayerWeights(vec2 p, float height, float slope) {
          vec4 path = pobPathSplat(p);
          float dry = smoothstep(-1.02, -0.54, height);
          float clearing = pobClearingMask(p);
          float beach = pobBeachMask(p);

          // The red-cinder PBR family is already resident for the paths. Reuse
          // it for intermittent oxidized soil on rises, driven by the cheap
          // interpolated geometric slope rather than another texture lookup.
          float rise = smoothstep(0.075, 0.265, slope);
          float exposureNoise = pobMacroNoise(p * 0.055 + vec2(9.3, -4.1));
          float exposedEarth = rise
            * mix(0.48, 1.0, smoothstep(0.24, 0.78, exposureNoise))
            * (1.0 - beach * 0.94)
            * dry
            * 0.48;
          float authoredCinder = max(path.r * 0.74, clearing * 0.6) * dry;
          // The knoll is a weathered tuff/scoria cone: oxidised red-brown
          // showing through on its upper slopes and round the summit hollow.
          float knoll = smoothstep(0.32, 0.86, pobKnoll(p))
            * mix(0.55, 1.0, smoothstep(0.3, 0.7, exposureNoise));
          float cinder = clamp(max(max(authoredCinder, exposedEarth), knoll * 0.7), 0.0, 0.72);

          float shoreBasalt = (1.0 - smoothstep(-0.72, 1.35, height)) * (1.0 - beach * 0.9);
          float westFront = -13.0 + sin(p.y * 0.105 - 0.4) * 4.2;
          float westernLava = 1.0 - smoothstep(westFront - 10.0, westFront + 8.0, p.x);
          float fractured = smoothstep(0.58, 0.78, pobNoise(p * 0.13 + vec2(5.2, -8.1)));
          // Inland the soil turns stonier and greyer: the aa tongue on the
          // west, cobbles in the wash bed, and loose basalt scattered through
          // the scrub floor.
          float inland = pobInlandMask(p);
          float stony = smoothstep(0.46, 0.74, pobNoise(p * 0.21 + vec2(-6.3, 2.9)));
          float inlandBasalt = inland * max(
            max(pobWestLava(p) * 0.84, pobArroyoBed(p) * 0.8),
            stony * 0.48 + 0.12
          );
          westernLava *= 1.0 - inland;
          float basalt = clamp(
            shoreBasalt * 0.64 + westernLava * 0.58 + fractured * 0.13 + path.b * 0.08 + inlandBasalt,
            0.0,
            0.86
          ) * (1.0 - cinder * 0.88) * (1.0 - beach * 0.82);

          float sand = beach * (1.0 - basalt * 0.84) * (1.0 - cinder * 0.92);
          float ground = max(0.0, 1.0 - sand - basalt - cinder);
          vec4 weights = vec4(ground, sand, basalt, cinder);
          return weights / max(dot(weights, vec4(1.0)), 0.0001);
        }`;
}

function postOfficeColorFragment() {
  return /* glsl */`
        vec2 pobPosition = vPostOfficeWorld.xz;
        float pobHeight = vPostOfficeWorld.y;
        vec2 pobGroundUv;
        vec2 pobSandUv;
        vec2 pobBasaltUv;
        vec2 pobCinderUv;
        pobUvs(pobPosition, pobGroundUv, pobSandUv, pobBasaltUv, pobCinderUv);
        vec4 pobWeights = pobLayerWeights(pobPosition, pobHeight, vPostOfficeSlope);

        // Albedos upload as sRGB textures and sample in linear space. Applying
        // a second pow/decode here was one reason the former shader looked dull.
        vec3 pobGround = texture2D(uPobGroundAlbedo, pobGroundUv).rgb * vec3(0.96, 0.91, 0.82);
        float pobSandVariation = pobMacroNoise(pobPosition * 0.075 + vec2(-2.0, 8.0));
        vec3 pobSand = texture2D(uPobSandAlbedo, pobSandUv).rgb
          * vec3(1.08, 1.02, 0.9)
          * mix(0.955, 1.045, pobSandVariation);
        vec3 pobBasalt = texture2D(uPobBasaltAlbedo, pobBasaltUv).rgb * vec3(0.84, 0.82, 0.76);
        vec3 pobCinderSource = texture2D(uPobCinderAlbedo, pobCinderUv).rgb;
        float pobCinderLuma = dot(pobCinderSource, vec3(0.2126, 0.7152, 0.0722));
        vec3 pobCinder = mix(pobCinderSource, vec3(pobCinderLuma), 0.26) * vec3(0.84, 0.72, 0.58);

        vec3 pobSurface = pobGround * pobWeights.x
          + pobSand * pobWeights.y
          + pobBasalt * pobWeights.z
          + pobCinder * pobWeights.w;
        // Macro breakup at two wavelengths.
        //
        // A single ~24m octave at +/-8% brightness was invisible on open sand:
        // at this key, a pure value multiply that small disappears into tone
        // mapping, and the dunes in the landing shot are wider than one
        // wavelength anyway, so the whole foreground came out as one flat tan
        // sheet. The broad octave (~77m) gives structure at the scale of a
        // dune, and the tint tilt does the work the brightness could not:
        // patches lean either shell-pale or iron-warm, and a hue difference
        // survives bright light where a value difference does not.
        //
        // Both are value noise — hashes and mixes, no new texture samplers.
        // The renderer is fill/bandwidth-bound with ALU to spare, so this is
        // the cheap direction to buy detail in (see docs/perf-lab.md).
        // Strength rides the shared terrain-look panel (world/terrainLook.js),
        // so the amount of breakup can be judged live against the rest of the
        // map instead of guessed in source.
        float pobMacroAmount = clamp(uTerrainGradeExtra.x, 0.0, 3.0);
        float pobMacro = pobMacroNoise(pobPosition * 0.042 + vec2(7.0, -5.0));
        float pobMacroBroad = pobNoise(pobPosition * 0.013 + vec2(-11.0, 4.0));
        float pobMacroMix = pobMacro * 0.55 + pobMacroBroad * 0.45;
        pobSurface *= mix(1.0, mix(0.88, 1.11, pobMacroMix), pobMacroAmount);
        pobSurface *= mix(
          vec3(1.0),
          mix(
            vec3(0.982, 0.992, 1.022),
            vec3(1.032, 1.002, 0.952),
            smoothstep(0.25, 0.75, pobMacroBroad)
          ),
          pobMacroAmount
        );
        float pobInlandLitter = smoothstep(5.0, 30.0, pobPosition.y)
          * smoothstep(0.34, 0.74, pobNoise(pobPosition * 0.07 + vec2(-3.0, 6.0)));
        pobSurface *= mix(vec3(1.0), vec3(0.88, 0.91, 0.74), pobInlandLitter * 0.15);
        // Behind the beach the pale coastal tuff gives way to the valley's
        // grey-brown stony soil and the duff of leaf litter under the scrub.
        float pobValley = pobInlandMask(pobPosition);
        float pobDuff = smoothstep(0.3, 0.8, pobNoise(pobPosition * 0.11 + vec2(4.2, 1.7)));
        vec3 pobValleySoil = mix(vec3(0.8, 0.76, 0.7), vec3(0.68, 0.63, 0.55), pobDuff);
        float pobValleyLuma = dot(pobSurface, vec3(0.2126, 0.7152, 0.0722));
        pobSurface = mix(pobSurface, mix(pobSurface, vec3(pobValleyLuma), 0.28) * pobValleySoil, pobValley);

        // Northwest Reef's baked shell sand covers the enlarged landing beach
        // and the sandbar's low perimeter. Both masks feather into the tan PBR
        // sand underneath rather than replacing the full landform.
        float pobWhiteSand = pobWhiteSandMask(pobPosition, pobHeight);
        vec3 pobWhiteSandColor = whiteSandBeachColor(pobPosition)
          * vec3(1.035, 1.0, 0.93)
          * mix(0.975, 1.025, pobSandVariation);
        // Retain a little of the warm Galapagos sand below even at the mask's
        // centre; its contribution increases naturally through feathered edges.
        pobSurface = mix(pobSurface, pobWhiteSandColor, pobWhiteSand * 0.9);

        // Water in the pores darkens sand and deepens its colour rather than
        // greying it: raising albedo to a power drops the light channels less
        // than the dark ones, so the warm hue saturates as it darkens.
        float pobWet = pobWetMask(pobHeight, pobPosition);
        float pobSwash = pobSwashMask(pobHeight, pobPosition);
        vec3 pobWetSand = pow(pobSurface, vec3(1.7)) * vec3(0.6, 0.58, 0.56);
        pobSurface = mix(pobSurface, pobWetSand, pobWet);
        pobSurface *= 1.0 - pobSwash * 0.16;
        float pobSubmerged = pobSubmergedMask(pobHeight);
        float pobDepth = clamp((-0.9 - pobHeight) / 2.7, 0.0, 1.0);
        vec3 pobSeabed = mix(vec3(0.055, 0.10, 0.10), vec3(0.18, 0.34, 0.31), pobDepth);
        pobSurface = mix(pobSurface, pobSeabed, pobSubmerged * 0.64);

        // Preserve a restrained amount of the authored biome tint while the
        // packed materials provide the actual grain and mineral response.
        vec3 pobAuthoredTint = clamp(diffuseColor.rgb * 1.2, vec3(0.72), vec3(1.16));
        pobSurface *= mix(vec3(1.0), pobAuthoredTint, 0.1);
        diffuseColor.rgb = clamp(pobSurface, 0.0, 1.0);`;
}

function postOfficeRoughnessFragment() {
  return /* glsl */`
        vec2 pobRoughPosition = vPostOfficeWorld.xz;
        float pobRoughHeight = vPostOfficeWorld.y;
        vec2 pobRoughGroundUv;
        vec2 pobRoughSandUv;
        vec2 pobRoughBasaltUv;
        vec2 pobRoughCinderUv;
        pobUvs(
          pobRoughPosition,
          pobRoughGroundUv,
          pobRoughSandUv,
          pobRoughBasaltUv,
          pobRoughCinderUv
        );
        vec4 pobRoughWeights = pobLayerWeights(
          pobRoughPosition,
          pobRoughHeight,
          vPostOfficeSlope
        );
        float pobGroundRoughness = mix(0.84, 0.97, texture2D(uPobGroundNrh, pobRoughGroundUv).b);
        float pobSandRoughness = mix(0.82, 0.98, texture2D(uPobSandNrh, pobRoughSandUv).b);
        float pobBasaltRoughness = mix(0.7, 0.93, texture2D(uPobBasaltNrh, pobRoughBasaltUv).b);
        float pobCinderRoughness = mix(0.82, 0.96, texture2D(uPobCinderNrh, pobRoughCinderUv).b);
        float pobMappedRoughness = dot(
          pobRoughWeights,
          vec4(pobGroundRoughness, pobSandRoughness, pobBasaltRoughness, pobCinderRoughness)
        );
        float pobRoughWhiteSand = pobWhiteSandMask(pobRoughPosition, pobRoughHeight);
        pobMappedRoughness = mix(
          pobMappedRoughness,
          whiteSandBeachRoughness(pobRoughPosition),
          pobRoughWhiteSand
        );
        float pobRoughWet = pobWetMask(pobRoughHeight, pobRoughPosition);
        pobMappedRoughness = mix(pobMappedRoughness, max(0.36, pobMappedRoughness - 0.45), pobRoughWet);
        pobMappedRoughness = mix(pobMappedRoughness, 0.1, pobSwashMask(pobRoughHeight, pobRoughPosition));
        pobMappedRoughness = mix(pobMappedRoughness, 0.68, pobSubmergedMask(pobRoughHeight) * 0.72);
        roughnessFactor = mix(roughnessFactor, pobMappedRoughness, 0.95);`;
}

function postOfficeNormalFragment() {
  return /* glsl */`
        vec2 pobNormalPosition = vPostOfficeWorld.xz;
        float pobNormalHeight = vPostOfficeWorld.y;
        vec2 pobNormalGroundUv;
        vec2 pobNormalSandUv;
        vec2 pobNormalBasaltUv;
        vec2 pobNormalCinderUv;
        pobUvs(
          pobNormalPosition,
          pobNormalGroundUv,
          pobNormalSandUv,
          pobNormalBasaltUv,
          pobNormalCinderUv
        );
        vec4 pobNormalWeights = pobLayerWeights(
          pobNormalPosition,
          pobNormalHeight,
          vPostOfficeSlope
        );
        vec2 pobGroundSlope = pobNormalSlope(
          texture2D(uPobGroundNrh, pobNormalGroundUv),
          ${f(POST_OFFICE_LAYERS.ground.normalStrength)}
        );
        vec2 pobSandSlope = pobNormalSlope(
          texture2D(uPobSandNrh, pobNormalSandUv),
          ${f(POST_OFFICE_LAYERS.sand.normalStrength)}
        );
        vec2 pobBasaltSlope = pobNormalSlope(
          texture2D(uPobBasaltNrh, pobNormalBasaltUv),
          ${f(POST_OFFICE_LAYERS.basalt.normalStrength)}
        );
        vec2 pobCinderSlope = pobNormalSlope(
          texture2D(uPobCinderNrh, pobNormalCinderUv),
          ${f(POST_OFFICE_LAYERS.cinder.normalStrength)}
        );
        vec2 pobMappedSlope = pobGroundSlope * pobNormalWeights.x
          + pobSandSlope * pobNormalWeights.y
          + pobBasaltSlope * pobNormalWeights.z
          + pobCinderSlope * pobNormalWeights.w;
        float pobNormalWhiteSand = pobWhiteSandMask(pobNormalPosition, pobNormalHeight);
        pobMappedSlope = mix(
          pobMappedSlope,
          whiteSandBeachNormalSlope(pobNormalPosition),
          pobNormalWhiteSand
        );
        pobMappedSlope *= mix(1.0, 0.72, pobWetMask(pobNormalHeight, pobNormalPosition));
        pobMappedSlope *= mix(1.0, 0.3, pobSwashMask(pobNormalHeight, pobNormalPosition));

        vec3 pobWorldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 pobWorldX = normalize(vec3(1.0, 0.0, 0.0) - pobWorldNormal * pobWorldNormal.x);
        vec3 pobWorldZ = normalize(cross(pobWorldX, pobWorldNormal));
        vec3 pobMappedWorldNormal = normalize(
          pobWorldNormal + pobWorldX * pobMappedSlope.x + pobWorldZ * pobMappedSlope.y
        );
        normal = normalize(mat3(viewMatrix) * pobMappedWorldNormal);`;
}

export function createPostOfficeBayTerrainMaterial() {
  const pathSplatTexture = resolveStandardFootPathSplatTexture({
    bake: 'post-office-bay',
    pathPoints: POST_OFFICE_BAY_PATH_POINTS,
    bounds: POST_OFFICE_PATH_SPLAT_BOUNDS,
    size: POST_OFFICE_PATH_SPLAT_BOUNDS.size,
    minimumWidth: 1.68,
  });
  const layers = Object.fromEntries(
    Object.entries(POST_OFFICE_LAYERS).map(([name, config]) => [name, loadPackedPbrTerrainSet(config)]),
  );
  const whiteSand = loadWhiteSandBeachLayer();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    pathSplatTexture.dispose();
    Object.values(layers).forEach(disposePackedPbrTerrainSet);
    whiteSand.dispose();
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplatTexture, {
      bounds: POST_OFFICE_PATH_SPLAT_BOUNDS,
      textureUniform: 'uPobPathSplat',
      boundsUniform: 'uPobPathSplatBounds',
    }));
    shader.uniforms.uPobRimColor = { value: new THREE.Color('#b9aa81') };
    shader.uniforms.uPobRimIntensity = { value: 0.025 };
    for (const [name, layer] of Object.entries(layers)) {
      const title = name[0].toUpperCase() + name.slice(1);
      shader.uniforms[`uPob${title}Albedo`] = { value: layer.albedo };
      shader.uniforms[`uPob${title}Nrh`] = { value: layer.nrh };
    }
    bindWhiteSandBeachUniforms(shader, whiteSand);
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPostOfficeWorld;
        varying float vPostOfficeSlope;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vPostOfficeSlope = 1.0 - clamp(abs(objectNormal.y), 0.0, 1.0);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPostOfficeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${postOfficeFragmentCommon()}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${postOfficeColorFragment()}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
${postOfficeRoughnessFragment()}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
${postOfficeNormalFragment()}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float pobSlopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += uPobRimColor * pobSlopeRim * uPobRimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'post-office-bay-inland-valley-v6';
  material.needsUpdate = true;
  return material;
}
