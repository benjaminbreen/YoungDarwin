import * as THREE from 'three';
import { FLOREANA_PBR_TEXTURES, loadPackedPbrTerrainSet, disposePackedPbrTerrainSet } from './pbrTerrainTextures';

const VARYINGS = /* glsl */`
  varying vec3 vRockMetricPosition;
  varying vec3 vRockMetricNormal;
  varying mat3 vRockOrientation;
  varying float vRockDust;
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
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        ${VARYINGS}
        uniform sampler2D uRockNrh;
        uniform vec3 uRockDustColor;
        uniform float uRockDustStrength;
        vec3 rockBlend;
        vec3 rockFacing;
        vec2 rockUvX;
        vec2 rockUvY;
        vec2 rockUvZ;
        vec4 rockDataX;
        vec4 rockDataY;
        vec4 rockDataZ;
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
        diffuseColor.rgb = mix(diffuseColor.rgb, uRockDustColor, vRockDust * uRockDustStrength);
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        float roughnessFactor = mix(${(profile.roughness - 0.12).toFixed(3)}, ${Math.min(0.995, profile.roughness + 0.04).toFixed(3)},
          dot(vec3(rockDataX.b, rockDataY.b, rockDataZ.b), rockBlend));
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
  material.customProgramCacheKey = () => `triplanar-rock-v1:${profile.textureKey}:${profile.textureScale ?? 0.8}:${profile.normalScale}:${profile.roughness}`;
  return material;
}
