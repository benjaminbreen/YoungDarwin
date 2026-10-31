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
  FUMAROLES,
  KIPUKA,
  OLIVINE_POCKET,
  SCORIA_FIELD,
  SOUTHERN_VOLCANIC_PATH_POINTS,
  SPATTER_CONE,
} from './path';

export const SOUTHERN_VOLCANIC_SPLAT_BOUNDS = {
  originX: -56,
  originZ: -52,
  width: 112,
  depth: 104,
  size: 512,
};

const f = value => Number(value).toFixed(3);
const v2 = (x, z) => `vec2(${f(x)}, ${f(z)})`;

// Four packed layers: fresh dark pāhoehoe, its older weathered skin, red
// scoria from the cone, and green olivine sand in the scoured pocket. The
// sulphur crust round the vents and the kīpuka soil are tints over those,
// since neither has a photographed surface of its own.
const SV_COMMON = /* glsl */`
        uniform sampler2D uSvDarkAlbedo;
        uniform sampler2D uSvDarkNrh;
        uniform sampler2D uSvWeatheredAlbedo;
        uniform sampler2D uSvWeatheredNrh;
        uniform sampler2D uSvScoriaAlbedo;
        uniform sampler2D uSvScoriaNrh;
        uniform sampler2D uSvOlivineAlbedo;
        uniform sampler2D uSvOlivineNrh;
        varying vec3 vSvWorld;

        ${standardFootPathSplatGLSL({
          functionName: 'svPathSplat',
          textureUniform: 'uSvPathSplat',
          boundsUniform: 'uSvPathSplatBounds',
        })}

        float svHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float svNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 q = fract(p);
          vec2 u = q * q * (3.0 - 2.0 * q);
          return mix(
            mix(svHash(i), svHash(i + vec2(1.0, 0.0)), u.x),
            mix(svHash(i + vec2(0.0, 1.0)), svHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float svFbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int octave = 0; octave < 4; octave++) {
            value += svNoise(p) * amplitude;
            p = mat2(1.72, -0.91, 0.91, 1.72) * p + vec2(4.2, -3.1);
            amplitude *= 0.52;
          }
          return value;
        }
        vec2 svRotate(vec2 p, float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return mat2(c, -s, s, c) * p;
        }
        float svEllipse(vec2 p, vec2 center, vec2 radius, float inner, float outer) {
          return 1.0 - smoothstep(inner, outer, length((p - center) / radius));
        }
        float svConeBody(vec2 p) {
          float n = length(p - ${v2(SPATTER_CONE.x, SPATTER_CONE.z)}) / ${f(SPATTER_CONE.radius)};
          return pow(1.0 - smoothstep(0.2, 1.05, n), 1.4);
        }
        float svConeApron(vec2 p) {
          float n = length(p - ${v2(SPATTER_CONE.x, SPATTER_CONE.z)}) / ${f(SPATTER_CONE.radius)};
          return 1.0 - smoothstep(0.7, 1.8, n);
        }
        float svScoria(vec2 p) {
          float field = svEllipse(p, ${v2(SCORIA_FIELD.x, SCORIA_FIELD.z)}, ${v2(SCORIA_FIELD.rx, SCORIA_FIELD.rz)}, 0.1, 1.05) * 0.95;
          float breakup = mix(0.74, 1.1, svFbm(p * 0.3 + vec2(-5.0, 7.0)));
          return clamp(max(field, max(svConeApron(p) * 0.78, svConeBody(p))) * breakup, 0.0, 1.0);
        }
        float svSulphur(vec2 p) {
          float mask = 0.0;
          // Warp the distance so each stain spreads along cracks and lobes
          // instead of lying round the vent as a disc.
          vec2 warp = vec2(svFbm(p * 0.62 + vec2(3.0, 1.0)), svFbm(p * 0.62 + vec2(-6.0, 4.0))) - 0.5;
          p += warp * 3.2;
${FUMAROLES.map(vent => `          mask = max(mask, (1.0 - smoothstep(0.3, ${f(1.5 + vent.strength * 1.1)}, length(p - ${v2(vent.x, vent.z)}))) * ${f(0.55 + vent.strength * 0.45)});`).join('\n')}
          float fringe = svFbm(p * 0.9 + vec2(11.0, -2.0));
          float seams = 1.0 - smoothstep(0.02, 0.12, abs(svFbm(p * 0.45 + vec2(-2.0, 5.0)) - 0.5));
          return clamp(mask * (0.4 + fringe * 0.7 + seams * 0.35), 0.0, 1.0);
        }
        float svOlivine(vec2 p) {
          float pocket = svEllipse(p, ${v2(OLIVINE_POCKET.x, OLIVINE_POCKET.z)}, ${v2(OLIVINE_POCKET.rx, OLIVINE_POCKET.rz)}, 0.15, 1.0);
          float streaks = svFbm(vec2(p.x * 0.5, p.y * 0.8) + vec2(2.0, -4.0));
          return clamp(pocket * (0.82 + streaks * 0.36), 0.0, 1.0);
        }
        float svKipuka(vec2 p) {
          float island = svEllipse(p, ${v2(KIPUKA.x, KIPUKA.z)}, ${v2(KIPUKA.rx, KIPUKA.rz)}, 0.25, 1.08);
          return clamp(island * mix(0.78, 1.18, svFbm(p * 0.12 + vec2(8.0, -3.0))), 0.0, 1.0);
        }
        float svFlowAge(vec2 p) {
          float broad = svFbm(p * 0.07 + vec2(-4.0, 9.0));
          float oldSkin = smoothstep(0.44, 0.78, svFbm(svRotate(p, 0.28) * 0.05 + vec2(8.0, -6.0)));
          return clamp(0.1 + broad * 0.2 + oldSkin * 0.2 + svKipuka(p) * 0.5, 0.0, 0.72);
        }
        float svCrackMask(vec2 p) {
          float contourA = abs(svFbm(p * 0.25 + vec2(2.0, -7.0)) - 0.5);
          float contourB = abs(svFbm(svRotate(p, 0.68) * 0.2 + vec2(-5.0, 3.0)) - 0.48);
          return max(1.0 - smoothstep(0.024, 0.08, contourA), (1.0 - smoothstep(0.018, 0.062, contourB)) * 0.62);
        }
        // Ropy pāhoehoe: fine folds across the flow, bending round the toes.
        float svRopes(vec2 p) {
          float angle = mix(0.18 + p.y * 0.004, -0.12 + p.x * 0.003, smoothstep(-14.0, 6.0, p.x));
          vec2 q = svRotate(p, angle);
          float bend = sin(q.x * 0.55) * 0.9 + (svFbm(p * 0.3) - 0.5) * 2.4;
          return 0.5 + 0.5 * sin((q.y + bend) * 4.6);
        }
        vec4 svLayerWeights(vec2 p) {
          vec4 path = svPathSplat(p);
          float olivine = svOlivine(p) * 0.92;
          float scoria = svScoria(p) * 0.62 * (1.0 - olivine);
          float weathered = svFlowAge(p) * (1.0 - scoria * 0.5) * (1.0 - olivine);
          weathered = clamp(weathered + path.r * 0.1 + path.a * 0.05, 0.0, 0.8);
          float dark = max(0.0, 1.0 - weathered - scoria - olivine);
          vec4 weights = vec4(dark, weathered, scoria, olivine);
          return weights / max(dot(weights, vec4(1.0)), 0.0001);
        }
        vec3 svAlbedoPair(sampler2D textureMap, vec2 uv, float angle, float secondaryScale) {
          vec2 warp = vec2(
            svNoise(uv * 0.12 + vec2(6.0, -4.0)),
            svNoise(uv * 0.12 + vec2(-3.0, 8.0))
          ) - 0.5;
          vec2 primaryUv = uv + warp * 0.28;
          vec2 secondaryUv = svRotate(uv + warp * 0.17, angle) * secondaryScale + vec2(0.31, -0.19);
          float broadMix = svNoise(uv * 0.34 + vec2(angle * 1.7, secondaryScale * 2.3));
          return mix(texture2D(textureMap, primaryUv).rgb, texture2D(textureMap, secondaryUv).rgb, 0.16 + broadMix * 0.28);
        }
        vec2 svPackedNormalSlope(vec4 nrh, float strength) {
          vec2 xy = nrh.rg * 2.0 - 1.0;
          float z = sqrt(max(1.0 - min(dot(xy, xy), 0.98), 0.02));
          return (xy / max(z, 0.18)) * strength;
        }
`;

const T = FLOREANA_PBR_TEXTURES;
const UV = /* glsl */`
        vec2 svDarkUv = svP * ${f(T.darkBasaltGravel.scale)} + vec2(0.17, -0.31);
        vec2 svWeatheredUv = svRotate(svP, -0.19) * ${f(T.weatheredHighlandBasalt.scale)} + vec2(-0.23, 0.11);
        vec2 svScoriaUv = svRotate(svP, 0.34) * ${f(T.oxidizedScoriaceousBasalt.scale)} + vec2(0.29, 0.37);
        vec2 svOlivineUv = svRotate(svP, 0.61) * ${f(T.olivineBeach.scale)} + vec2(-0.41, 0.13);
        vec4 svWeights = svLayerWeights(svP);`;

export function createSouthernVolcanicTerrainMaterial() {
  const dark = loadPackedPbrTerrainSet(T.darkBasaltGravel);
  const weathered = loadPackedPbrTerrainSet(T.weatheredHighlandBasalt);
  const scoria = loadPackedPbrTerrainSet(T.oxidizedScoriaceousBasalt);
  const olivine = loadPackedPbrTerrainSet(T.olivineBeach);
  const pathSplat = resolveStandardFootPathSplatTexture({
    bake: 'southern-volcanic',
    pathPoints: SOUTHERN_VOLCANIC_PATH_POINTS,
    bounds: SOUTHERN_VOLCANIC_SPLAT_BOUNDS,
    size: SOUTHERN_VOLCANIC_SPLAT_BOUNDS.size,
    minimumWidth: 1.2,
  });
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
  });
  material.envMapIntensity = 0.5;

  material.addEventListener('dispose', () => {
    pathSplat.dispose();
    disposePackedPbrTerrainSet(dark);
    disposePackedPbrTerrainSet(weathered);
    disposePackedPbrTerrainSet(scoria);
    disposePackedPbrTerrainSet(olivine);
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplat, {
      bounds: SOUTHERN_VOLCANIC_SPLAT_BOUNDS,
      textureUniform: 'uSvPathSplat',
      boundsUniform: 'uSvPathSplatBounds',
    }));
    shader.uniforms.uSvDarkAlbedo = { value: dark.albedo };
    shader.uniforms.uSvDarkNrh = { value: dark.nrh };
    shader.uniforms.uSvWeatheredAlbedo = { value: weathered.albedo };
    shader.uniforms.uSvWeatheredNrh = { value: weathered.nrh };
    shader.uniforms.uSvScoriaAlbedo = { value: scoria.albedo };
    shader.uniforms.uSvScoriaNrh = { value: scoria.nrh };
    shader.uniforms.uSvOlivineAlbedo = { value: olivine.albedo };
    shader.uniforms.uSvOlivineNrh = { value: olivine.nrh };
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSvWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${SV_COMMON}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 svP = vSvWorld.xz;
${UV}
        vec4 svDarkSurface = texture2D(uSvDarkNrh, svDarkUv);
        vec4 svWeatheredSurface = texture2D(uSvWeatheredNrh, svWeatheredUv);
        vec4 svScoriaSurface = texture2D(uSvScoriaNrh, svScoriaUv);
        vec4 svOlivineSurface = texture2D(uSvOlivineNrh, svOlivineUv);
        vec3 svDark = svAlbedoPair(uSvDarkAlbedo, svDarkUv, 0.73, 0.55) * vec3(0.66, 0.65, 0.61);
        vec3 svWeathered = svAlbedoPair(uSvWeatheredAlbedo, svWeatheredUv, -0.61, 0.57) * vec3(0.74, 0.7, 0.62);
        vec3 svScoriaRaw = svAlbedoPair(uSvScoriaAlbedo, svScoriaUv, 0.52, 0.56) * vec3(0.62, 0.46, 0.36);
        vec3 svScoriaColor = mix(svDark, svScoriaRaw, 0.78);
        vec3 svOlivineColor = svAlbedoPair(uSvOlivineAlbedo, svOlivineUv, 0.4, 0.6) * vec3(0.66, 0.7, 0.5);
        vec3 svColor = svDark * svWeights.x + svWeathered * svWeights.y + svScoriaColor * svWeights.z + svOlivineColor * svWeights.w;
        float svRelief = dot(svWeights, vec4(svDarkSurface.a, svWeatheredSurface.a, svScoriaSurface.a, svOlivineSurface.a));
        svColor *= mix(0.9, 1.07, smoothstep(0.08, 0.9, svRelief));
        // Ropes catch the light along their crests, sheen-glazed where fresh.
        float svFresh = (svWeights.x + svWeights.y * 0.45) * (1.0 - svScoria(svP)) * (1.0 - svKipuka(svP));
        float svRope = svRopes(svP);
        svColor *= mix(1.0, mix(0.7, 1.22, svRope), svFresh * 0.75);
        // Kīpuka soil: windblown ash gone brown under the scrub.
        float svKip = svKipuka(svP);
        vec3 svSoil = mix(vec3(0.27, 0.21, 0.15), vec3(0.37, 0.3, 0.21), svFbm(svP * 0.55 + vec2(3.0, 1.0)));
        svColor = mix(svColor, svSoil * mix(0.85, 1.1, svRelief), svKip * 0.62);
        // Sulphur: pale yellow crust and white bleaching round each vent,
        // grading out through ochre staining into the black rock.
        float svSul = svSulphur(svP);
        float svSulGrain = svFbm(svP * 2.6 + vec2(-7.0, 2.0));
        vec3 svSulCrust = mix(vec3(0.56, 0.5, 0.22), vec3(0.7, 0.68, 0.52), smoothstep(0.55, 0.8, svSulGrain));
        vec3 svOchre = vec3(0.36, 0.27, 0.15);
        svColor = mix(svColor, svOchre * mix(0.8, 1.1, svRelief), smoothstep(0.08, 0.5, svSul) * 0.42);
        svColor = mix(svColor, svSulCrust * mix(0.82, 1.06, svRelief), smoothstep(0.55, 0.95, svSul + (svSulGrain - 0.5) * 0.8) * 0.8);
        vec4 svPath = svPathSplat(svP);
        vec3 svTrailDust = mix(vec3(0.19, 0.16, 0.13), vec3(0.29, 0.24, 0.19), svFbm(svP * 0.46 + vec2(9.0, -4.0)));
        svColor = mix(svColor, svTrailDust * mix(0.85, 1.1, svRelief), clamp(svPath.r * 0.2 + svPath.g * 0.1, 0.0, 0.28));
        float svMacro = svFbm(svP * 0.04 + vec2(7.0, -5.0));
        float svFine = svFbm(svP * 0.7 + vec2(-3.0, 11.0));
        float svCracks = svCrackMask(svP) * (1.0 - svKip * 0.7);
        svColor *= mix(0.76, 1.08, svMacro);
        svColor *= mix(0.965, 1.03, svFine);
        svColor *= 1.0 - svCracks * 0.13;
        vec3 svVertexGuide = clamp(diffuseColor.rgb * 1.2, vec3(0.74), vec3(1.12));
        svColor *= mix(vec3(1.0), svVertexGuide, 0.1);
        diffuseColor.rgb = clamp(svColor, 0.0, 1.0);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        {
          vec2 svP = vSvWorld.xz;
${UV}
          float svDarkRough = mix(0.62, 0.9, texture2D(uSvDarkNrh, svDarkUv).b);
          float svWeatheredRough = mix(0.86, 0.98, texture2D(uSvWeatheredNrh, svWeatheredUv).b);
          float svScoriaRough = mix(0.9, 0.995, texture2D(uSvScoriaNrh, svScoriaUv).b);
          float svOlivineRough = mix(0.8, 0.95, texture2D(uSvOlivineNrh, svOlivineUv).b);
          float svMapped = dot(svWeights, vec4(svDarkRough, svWeatheredRough, svScoriaRough, svOlivineRough));
          // Fresh glassy rinds on the ropes are a little glossier.
          svMapped -= svRopes(svP) * svWeights.x * 0.08;
          svMapped = mix(svMapped, 0.97, svPathSplat(svP).r * 0.35 + svKipuka(svP) * 0.4);
          roughnessFactor = mix(roughnessFactor, svMapped, 0.96);
        }`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        {
          vec2 svP = vSvWorld.xz;
${UV}
          vec2 svSlope = svPackedNormalSlope(texture2D(uSvDarkNrh, svDarkUv), 0.7) * svWeights.x
            + svPackedNormalSlope(texture2D(uSvWeatheredNrh, svWeatheredUv), 0.92) * svWeights.y
            + svPackedNormalSlope(texture2D(uSvScoriaNrh, svScoriaUv), 0.84) * svWeights.z
            + svPackedNormalSlope(texture2D(uSvOlivineNrh, svOlivineUv), 0.6) * svWeights.w;
          vec3 svWorldNormal = inverseTransformDirection(normal, viewMatrix);
          vec3 svWorldX = normalize(vec3(1.0, 0.0, 0.0) - svWorldNormal * svWorldNormal.x);
          vec3 svWorldZ = normalize(cross(svWorldX, svWorldNormal));
          vec3 svMappedNormal = normalize(svWorldNormal + svWorldX * svSlope.x + svWorldZ * svSlope.y);
          normal = normalize(mat3(viewMatrix) * svMappedNormal);
        }`,
      );
  };

  material.customProgramCacheKey = () => 'southern-volcanic-packed-pbr-v3';
  material.needsUpdate = true;
  return material;
}
