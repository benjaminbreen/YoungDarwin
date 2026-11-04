import * as THREE from 'three';
import { WATER_LEVEL } from '../../terrainShared';
import { DEW_GLSL, dewUniforms } from '../../dewRuntime';
import { FLOREANA_PBR_TEXTURES, loadPackedPbrTerrainSet, disposePackedPbrTerrainSet } from './pbrTerrainTextures';

const VARYINGS = /* glsl */`
  varying vec3 vRockMetricPosition;
  varying vec3 vRockMetricNormal;
  varying mat3 vRockOrientation;
  varying float vRockDust;
  varying vec3 vRockWorld;
`;

// Project in metre-scaled object space, so neither sphere poles nor elongated
// instance scales stretch the surface. Keeping the frame on the object also
// keeps the texture attached when a boulder moves or is hammer-carved.
export function createTriplanarRockMaterial(profile, dust = null) {
  const packed = loadPackedPbrTerrainSet(FLOREANA_PBR_TEXTURES[profile.textureKey]);
  const material = new THREE.MeshStandardMaterial({
    map: packed.albedo,
    vertexColors: true,
    color: profile.tint || '#ffffff',
    roughness: profile.roughness,
    metalness: 0,
    flatShading: profile.flatShading ?? true,
  });
  material.name = `TriplanarRock:${profile.textureKey}`;
  material.userData.pbrTextures = packed;
  material.addEventListener('dispose', () => disposePackedPbrTerrainSet(packed));
  material.onBeforeCompile = shader => {
    shader.uniforms.uRockNrh = { value: packed.nrh };
    shader.uniforms.uRockDustColor = { value: new THREE.Color(dust?.color || '#ffffff') };
    shader.uniforms.uRockDustStrength = { value: dust?.color ? dust.strength ?? 0.4 : 0 };
    shader.uniforms.uDew = dewUniforms.uDew;
    shader.uniforms.uDewSun = dewUniforms.uDewSun;
    shader.uniforms.uDewSunColor = dewUniforms.uDewSunColor;
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VARYINGS}`)
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        mat3 rockTransform = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          rockTransform = rockTransform * mat3(instanceMatrix);
        #endif
        vec3 rockMetricScale = max(vec3(length(rockTransform[0]), length(rockTransform[1]), length(rockTransform[2])), vec3(0.0001));
        vRockMetricPosition = transformed * rockMetricScale;
        vRockMetricNormal = normalize(objectNormal / rockMetricScale);
        vRockOrientation = mat3(rockTransform[0] / rockMetricScale.x, rockTransform[1] / rockMetricScale.y, rockTransform[2] / rockMetricScale.z);
        vRockDust = 1.0 - smoothstep(-0.92, -0.18, position.y);
        vec4 rockWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          rockWorld = instanceMatrix * rockWorld;
        #endif
        vRockWorld = (modelMatrix * rockWorld).xyz;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        ${VARYINGS}
        uniform sampler2D uRockNrh;
        uniform vec3 uRockDustColor;
        uniform float uRockDustStrength;
        ${DEW_GLSL}
        vec3 rockBlend;
        vec3 rockFacing;
        vec2 rockUvX;
        vec2 rockUvY;
        vec2 rockUvZ;
        vec4 rockDataX;
        vec4 rockDataY;
        vec4 rockDataZ;
        // Splash zone: stone below the reach of the swash and spray is wet,
        // darker and glassier, and dries out over a ragged tide line.
        float rockWetness() {
          float h = vRockWorld.y - ${WATER_LEVEL.toFixed(2)};
          float ragged = sin(vRockWorld.x * 1.7 + vRockWorld.z * 1.3) * 0.08
            + sin(vRockWorld.z * 4.1 - vRockWorld.x * 2.9) * 0.04;
          return 1.0 - smoothstep(0.35, 0.95 + ragged, h);
        }
        vec2 rockSlope(vec4 dataValue) {
          vec2 xy = dataValue.rg * 2.0 - 1.0;
          return xy / sqrt(max(1.0 - min(dot(xy, xy), 0.98), 0.02));
        }
      `)
      .replace('#include <map_fragment>', /* glsl */`
        vec3 rockN = normalize(vRockMetricNormal);
        rockBlend = pow(abs(rockN), vec3(4.0));
        rockBlend /= max(dot(rockBlend, vec3(1.0)), 0.0001);
        rockFacing = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), rockN));
        vec3 rockP = vRockMetricPosition * ${(profile.textureScale ?? 0.8).toFixed(4)};
        rockUvX = vec2(-rockP.z * rockFacing.x, rockP.y);
        rockUvY = vec2(rockP.x, -rockP.z * rockFacing.y);
        rockUvZ = vec2(rockP.x * rockFacing.z, rockP.y);
        diffuseColor.rgb *= texture2D(map, rockUvX).rgb * rockBlend.x
          + texture2D(map, rockUvY).rgb * rockBlend.y
          + texture2D(map, rockUvZ).rgb * rockBlend.z;
        rockDataX = texture2D(uRockNrh, rockUvX);
        rockDataY = texture2D(uRockNrh, rockUvY);
        rockDataZ = texture2D(uRockNrh, rockUvZ);
      `)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        ${profile.albedoScale !== undefined ? `diffuseColor.rgb *= ${profile.albedoScale.toFixed(3)};` : ''}
        float rockWet = rockWetness();
        diffuseColor.rgb = mix(diffuseColor.rgb, uRockDustColor, vRockDust * uRockDustStrength * (1.0 - rockWet));
        diffuseColor.rgb *= 1.0 - rockWet * 0.45;
      `)
      .replace('#include <roughnessmap_fragment>', profile.roughnessMode === 'multiply'
        // Roughness map applied as three's roughnessMap does (a multiply), so
        // the map's glossy texels stay glossy: the moving glints of fresh lava.
        ? /* glsl */`
        float roughnessFactor = ${profile.roughness.toFixed(3)}
          * dot(vec3(rockDataX.b, rockDataY.b, rockDataZ.b), rockBlend);
        roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.12), rockWetness());
        roughnessFactor *= 1.0 - uDew * 0.3;
      `
        : /* glsl */`
        float roughnessFactor = mix(${(profile.roughness - 0.12).toFixed(3)}, ${Math.min(0.995, profile.roughness + 0.04).toFixed(3)},
          dot(vec3(rockDataX.b, rockDataY.b, rockDataZ.b), rockBlend));
        roughnessFactor = mix(roughnessFactor, 0.2, rockWetness());
        roughnessFactor *= 1.0 - uDew * 0.3;
      `)
      .replace('#include <opaque_fragment>', /* glsl */`
        // Dawn dew beads on the upper faces (world/dewRuntime.js).
        if (uDew > 0.001) {
          vec3 rockDewNormal = inverseTransformDirection(normal, viewMatrix);
          outgoingLight += dewGlints(vRockWorld, rockDewNormal, 0.1, 30.0)
            * smoothstep(0.2, 0.7, rockDewNormal.y);
        }
        #include <opaque_fragment>
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        vec2 rockSx = rockSlope(rockDataX);
        vec2 rockSy = rockSlope(rockDataY);
        vec2 rockSz = rockSlope(rockDataZ);
        vec3 rockDetail = vec3(0.0, rockSx.y, -rockSx.x * rockFacing.x) * rockBlend.x
          + vec3(rockSy.x, 0.0, -rockSy.y * rockFacing.y) * rockBlend.y
          + vec3(rockSz.x * rockFacing.z, rockSz.y, 0.0) * rockBlend.z;
        vec3 rockBase = normalize(vRockMetricNormal);
        rockDetail -= rockBase * dot(rockDetail, rockBase);
        normal = normalize(normal + mat3(viewMatrix) * vRockOrientation * rockDetail * ${profile.normalScale.toFixed(3)});
      `);
  };
  material.customProgramCacheKey = () => `triplanar-rock-v3-wet-dew:${profile.textureKey}:${profile.textureScale ?? 0.8}:${profile.normalScale}:${profile.roughness}:${profile.albedoScale ?? 1}:${profile.roughnessMode ?? 'band'}`;
  return material;
}
