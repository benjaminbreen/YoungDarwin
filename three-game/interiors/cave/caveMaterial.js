import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  loadPackedPbrTerrainSet,
} from '../../world/regions/materials/pbrTerrainTextures';

// Triplanar lava-tube rock. Walls and roof take weathered highland basalt on
// all three axes; up-facing floor takes dark basalt gravel from above. Baked
// vertex data from caveMesher.js drives occlusion, seep wetness, hearth soot
// and the moss that grows only where daylight reaches.
//
// Texture sets are the same packed NRH sets the outdoor terrain uses (R/G
// tangent normal, B roughness, A height), so the cave shares the island's
// basalt rather than introducing a new rock.

const ROCK_GLSL = /* glsl */`
uniform sampler2D uCaveWallAlbedo;
uniform sampler2D uCaveWallNrh;
uniform sampler2D uCaveFloorAlbedo;
uniform sampler2D uCaveFloorNrh;
uniform float uCaveWallScale;
uniform float uCaveFloorScale;
uniform float uCaveNormalStrength;
uniform vec3 uCaveMossColor;
uniform vec3 uCaveSootColor;
uniform float uCaveTime;
varying vec3 vCaveWorldPos;
varying vec3 vCaveWorldNormal;
varying vec4 vCaveData;

float caveHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float caveNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(caveHash(i), caveHash(i + vec2(1.0, 0.0)), u.x),
    mix(caveHash(i + vec2(0.0, 1.0)), caveHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 caveTriplanarWeights(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  return w / max(dot(w, vec3(1.0)), 0.0001);
}

vec2 caveUnpackNormal(vec4 nrh) {
  return (nrh.rg * 2.0 - 1.0) * uCaveNormalStrength;
}

vec3 caveTangentNormal(vec2 xy) {
  return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
}
`;

export function createCaveRockMaterial({ wallKey = 'weatheredHighlandBasalt', floorKey = 'darkBasaltGravel' } = {}) {
  const wall = loadPackedPbrTerrainSet(FLOREANA_PBR_TEXTURES[wallKey]);
  const floor = loadPackedPbrTerrainSet(FLOREANA_PBR_TEXTURES[floorKey]);
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
  });
  material.name = 'CaveRock';
  const uniforms = {
    uCaveWallAlbedo: { value: wall.albedo },
    uCaveWallNrh: { value: wall.nrh },
    uCaveFloorAlbedo: { value: floor.albedo },
    uCaveFloorNrh: { value: floor.nrh },
    uCaveWallScale: { value: 0.42 },
    uCaveFloorScale: { value: 0.5 },
    uCaveNormalStrength: { value: 1.15 },
    uCaveMossColor: { value: new THREE.Color('#34421f') },
    uCaveSootColor: { value: new THREE.Color('#0d0b0a') },
    uCaveTime: { value: 0 },
  };
  material.userData.caveUniforms = uniforms;
  material.userData.caveTextures = [wall.albedo, wall.nrh, floor.albedo, floor.nrh];
  material.customProgramCacheKey = () => 'cave-rock-v1';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 caveData;
        varying vec3 vCaveWorldPos;
        varying vec3 vCaveWorldNormal;
        varying vec4 vCaveData;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 caveWorld = vec4(transformed, 1.0);
        vec3 caveObjectNormal = objectNormal;
        #ifdef USE_INSTANCING
          caveWorld = instanceMatrix * caveWorld;
          caveObjectNormal = mat3(instanceMatrix) * caveObjectNormal;
        #endif
        vCaveWorldPos = (modelMatrix * caveWorld).xyz;
        vCaveWorldNormal = normalize(mat3(modelMatrix) * caveObjectNormal);
        vCaveData = caveData;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ROCK_GLSL}`)
      .replace(
        '#include <map_fragment>',
        `
        vec3 caveN = normalize(vCaveWorldNormal);
        vec3 caveW = caveTriplanarWeights(caveN);
        vec2 uvX = vCaveWorldPos.zy * uCaveWallScale;
        vec2 uvY = vCaveWorldPos.xz * uCaveWallScale;
        vec2 uvZ = vCaveWorldPos.xy * uCaveWallScale;
        vec4 wallNrhX = texture2D(uCaveWallNrh, uvX);
        vec4 wallNrhY = texture2D(uCaveWallNrh, uvY);
        vec4 wallNrhZ = texture2D(uCaveWallNrh, uvZ);
        vec3 wallAlbedo = texture2D(uCaveWallAlbedo, uvX).rgb * caveW.x
          + texture2D(uCaveWallAlbedo, uvY).rgb * caveW.y
          + texture2D(uCaveWallAlbedo, uvZ).rgb * caveW.z;
        float wallHeight = wallNrhX.a * caveW.x + wallNrhY.a * caveW.y + wallNrhZ.a * caveW.z;
        float wallRough = wallNrhX.b * caveW.x + wallNrhY.b * caveW.y + wallNrhZ.b * caveW.z;

        vec2 floorUv = vCaveWorldPos.xz * uCaveFloorScale;
        vec4 floorNrh = texture2D(uCaveFloorNrh, floorUv);
        vec3 floorAlbedo = texture2D(uCaveFloorAlbedo, floorUv).rgb;
        // Gravel collects only on near-level ground, and breaks up against the
        // walls by height so the transition reads as rubble, not a decal line.
        float floorMask = smoothstep(0.62, 0.9, caveN.y + (floorNrh.a - wallHeight) * 0.35);

        vec3 rockAlbedo = mix(wallAlbedo, floorAlbedo * vec3(0.92, 0.9, 0.88), floorMask);
        float rockRough = mix(wallRough, floorNrh.b, floorMask);
        float rockHeight = mix(wallHeight, floorNrh.a, floorMask);

        float caveAO = vCaveData.x;
        float caveWet = vCaveData.y;
        float caveSoot = vCaveData.z;
        float caveMoss = vCaveData.w;

        diffuseColor.rgb = diffuse * vColor * rockAlbedo * 1.65;

        // Moss: patchy, prefers recesses and up-facing ledges, never on soot.
        float mossPattern = caveNoise(vCaveWorldPos.xz * 2.7 + vCaveWorldPos.y * 1.3)
          * 0.6 + caveNoise(vCaveWorldPos.zy * 6.1) * 0.4;
        float mossDetail = caveNoise(vCaveWorldPos.xz * 9.0 + vCaveWorldPos.y * 4.0);
        float moss = smoothstep(0.5, 0.86, caveMoss * (0.45 + mossPattern * 0.75) + (1.0 - rockHeight) * 0.3 * caveMoss)
          * smoothstep(0.25, 0.6, mossDetail + caveMoss * 0.3)
          * (1.0 - caveSoot);
        vec3 mossTint = mix(uCaveMossColor, uCaveMossColor * vec3(1.45, 1.3, 0.75), mossPattern * mossDetail);
        diffuseColor.rgb = mix(diffuseColor.rgb, mossTint * (0.7 + rockAlbedo * 0.6), moss * 0.78);

        // Soot blackens from the plume's core outward.
        diffuseColor.rgb = mix(diffuseColor.rgb, uCaveSootColor, smoothstep(0.08, 0.9, caveSoot) * 0.92);

        // Water darkens porous rock; pores fill first (low height).
        float wetness = clamp(caveWet * (1.25 - rockHeight * 0.5), 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.48, wetness);
        `,
      )
      // Vertex colour is folded in above, before moss and soot.
      .replace('#include <color_fragment>', '')
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = clamp(mix(0.62 + rockRough * 0.38, 0.16, wetness * 0.9), 0.08, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.97, smoothstep(0.2, 0.8, caveSoot) * 0.7);
        roughnessFactor = mix(roughnessFactor, 0.85, moss * 0.6);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
        {
          vec2 nX = caveUnpackNormal(wallNrhX);
          vec2 nY = caveUnpackNormal(mix(wallNrhY, floorNrh, floorMask));
          vec2 nZ = caveUnpackNormal(wallNrhZ);
          // Whiteout-blended triplanar normals (Golus).
          vec3 tX = vec3(nX + caveN.zy, abs(caveTangentNormal(nX).z) * caveN.x);
          vec3 tY = vec3(nY + caveN.xz, abs(caveTangentNormal(nY).z) * caveN.y);
          vec3 tZ = vec3(nZ + caveN.xy, abs(caveTangentNormal(nZ).z) * caveN.z);
          vec3 worldBumped = normalize(tX.zyx * caveW.x + tY.xzy * caveW.y + tZ.xyz * caveW.z);
          // Standing water smooths the surface it fills.
          worldBumped = normalize(mix(worldBumped, caveN, wetness * 0.55));
          normal = normalize((viewMatrix * vec4(worldBumped, 0.0)).xyz);
        }
        `,
      )
      .replace(
        '#include <aomap_fragment>',
        `
        {
          float ao = caveAO * caveAO;
          reflectedLight.indirectDiffuse *= ao;
          reflectedLight.indirectSpecular *= ao;
          reflectedLight.directDiffuse *= mix(1.0, caveAO, 0.55);
          reflectedLight.directSpecular *= mix(1.0, caveAO, 0.4);
        }
        `,
      );
  };
  return material;
}

export function disposeCaveRockMaterial(material) {
  for (const texture of material?.userData?.caveTextures || []) texture?.dispose?.();
  material?.dispose?.();
}
