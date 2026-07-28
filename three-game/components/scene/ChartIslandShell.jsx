'use client';

import React, {
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { skyState } from '../../world/celestial';
import { WATER_LEVEL } from '../../world/terrain';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import {
  CHART_SHELL_VARIANTS,
  getChartIslandShellGeometry,
} from '../../world/vistas/chartIslandShell';
import {
  distanceSceneryRuntime,
  getDistanceSceneryRevision,
  subscribeDistanceScenery,
} from '../../world/vistas/distanceSceneryRuntime';
import { terrainSeamUniforms } from '../../world/vistas/terrainSeamDevRuntime';
import { vistaAtmosphereUniforms } from '../../world/vistas/vistaAtmosphere';

const SHELL_MATERIALS = new Set();

function createShellMaterial(horizonOnly) {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: false,
    side: THREE.FrontSide,
    depthWrite: true,
    transparent: false,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uShellRelief = { value: distanceSceneryRuntime.shellRelief };
    shader.uniforms.uShellVertical = { value: distanceSceneryRuntime.shellVertical };
    shader.uniforms.uShellRadiusScale = { value: distanceSceneryRuntime.shellRadiusScale };
    shader.uniforms.uShellHaze = {
      value: new THREE.Vector4(
        distanceSceneryRuntime.shellHazeStart,
        distanceSceneryRuntime.shellHazeEnd,
        distanceSceneryRuntime.shellHazeStrength,
        distanceSceneryRuntime.shellSaturation,
      ),
    };
    shader.uniforms.uShellContrast = { value: distanceSceneryRuntime.shellContrast };
    shader.uniforms.uShellLight = { value: 1 };
    shader.uniforms.uShellHorizonOnly = { value: horizonOnly ? 1 : 0 };
    shader.uniforms.uShellHorizonColor = vistaAtmosphereUniforms.uVistaHorizonColor;
    shader.uniforms.uApronShellSeam = terrainSeamUniforms.uApronShellSeam;
    shader.uniforms.uApronShellTexture = terrainSeamUniforms.uApronShellTexture;
    shader.uniforms.uApronShellGrade = terrainSeamUniforms.uApronShellGrade;
    material.userData.shellUniforms = shader.uniforms;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aShellDepth;
        attribute float aShellLand;
        attribute float aShellHandoff;
        attribute vec3 aShellSeamColor;
        uniform float uShellRelief;
        uniform float uShellVertical;
        uniform float uShellRadiusScale;
        varying float vShellDepth;
        varying float vShellLand;
        varying float vShellHandoff;
        varying vec3 vShellSeamColor;
        varying vec3 vShellWorldPosition;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vShellDepth = aShellDepth;
        vShellLand = aShellLand;
        vShellHandoff = aShellHandoff;
        vShellSeamColor = aShellSeamColor;
        float shellOuter = smoothstep(0.06, 0.34, aShellDepth);
        transformed.xz *= mix(1.0, uShellRadiusScale, shellOuter);
        float shellY = ${WATER_LEVEL.toFixed(3)}
          + (transformed.y - ${WATER_LEVEL.toFixed(3)}) * uShellRelief
          + uShellVertical;
        transformed.y = mix(transformed.y, shellY, shellOuter);
        vShellWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec4 uShellHaze;
        uniform float uShellContrast;
        uniform float uShellLight;
        uniform float uShellHorizonOnly;
        uniform vec3 uShellHorizonColor;
        uniform vec4 uApronShellSeam;
        uniform vec4 uApronShellTexture;
        uniform vec4 uApronShellGrade;
        varying float vShellDepth;
        varying float vShellLand;
        varying float vShellHandoff;
        varying vec3 vShellSeamColor;
        varying vec3 vShellWorldPosition;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `// The shared Water surface already owns open ocean. Drawing the shell's
        // below-water sea through it made a second, ruler-straight horizon.
        if (vShellLand < 0.08) discard;

        vec2 shellNoisePosition = vShellWorldPosition.xz
          * max(0.001, uApronShellTexture.x);
        vec2 shellCell = floor(shellNoisePosition);
        vec2 shellLocal = fract(shellNoisePosition);
        vec2 shellEase = shellLocal * shellLocal * (3.0 - 2.0 * shellLocal);
        float shellNoiseA = fract(
          sin(dot(shellCell, vec2(127.1, 311.7))) * 43758.5453123
        );
        float shellNoiseB = fract(
          sin(dot(shellCell + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453123
        );
        float shellNoiseC = fract(
          sin(dot(shellCell + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453123
        );
        float shellNoiseD = fract(
          sin(dot(shellCell + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453123
        );
        float shellCoarseNoise = mix(
          mix(shellNoiseA, shellNoiseB, shellEase.x),
          mix(shellNoiseC, shellNoiseD, shellEase.x),
          shellEase.y
        );
        float shellFineNoise = sin(
          vShellWorldPosition.x * uApronShellTexture.x * 9.1
          + vShellWorldPosition.z * uApronShellTexture.x * 5.7
        ) * 0.5 + 0.5;
        float shellSeamNoise = shellCoarseNoise * 0.72 + shellFineNoise * 0.28;
        // The connected apron owns the hybrid mode's near field. Its former
        // submerged shell underlap remained depth-visible from high cameras as
        // irregular gray puddles, so remove that surface until the shell's
        // authored far-distance handoff has genuinely begun.
        float shellClipWander = (shellSeamNoise - 0.5) * 0.025;
        if (
          uShellHorizonOnly > 0.5
          && uApronShellTexture.w > 0.0
          && vShellHandoff + shellClipWander <= uApronShellTexture.w
        ) {
          discard;
        }
        float shellWarpedHandoff = vShellHandoff
          + (shellSeamNoise - 0.5) * 2.0 * max(0.0, uApronShellSeam.z);
        float shellFeatherStart = min(
          uApronShellSeam.x,
          uApronShellSeam.y - 0.01
        );
        float shellFeatherEnd = max(
          uApronShellSeam.x + 0.01,
          uApronShellSeam.y
        );
        float shellHandoff = smoothstep(
          shellFeatherStart,
          shellFeatherEnd,
          shellWarpedHandoff
        );
        shellHandoff = mix(
          shellHandoff,
          shellHandoff * shellHandoff,
          clamp(uApronShellSeam.w, 0.0, 1.0)
        );
        shellHandoff = pow(
          max(0.0001, shellHandoff),
          clamp(uApronShellGrade.w, 0.2, 5.0)
        );
        gl_FragColor.rgb = mix(vShellSeamColor, gl_FragColor.rgb, shellHandoff);

        float shellTextureStrength = max(0.0, uApronShellTexture.y);
        vec3 shellCool = vec3(0.96, 0.985, 1.015);
        vec3 shellWarm = vec3(1.045, 1.015, 0.94);
        vec3 shellTextureTint = mix(
          shellCool,
          shellWarm,
          smoothstep(0.24, 0.76, shellCoarseNoise)
        );
        gl_FragColor.rgb *= mix(
          vec3(1.0),
          shellTextureTint,
          0.13 * shellTextureStrength
        );
        gl_FragColor.rgb *= 1.0
          + (shellSeamNoise - 0.5) * 0.095 * shellTextureStrength;

        float shellGradeLuma = dot(
          gl_FragColor.rgb,
          vec3(0.2126, 0.7152, 0.0722)
        );
        gl_FragColor.rgb = mix(
          vec3(shellGradeLuma),
          gl_FragColor.rgb,
          clamp(uApronShellGrade.y, 0.0, 2.5)
        );
        vec3 shellCoolGrade = vec3(0.78, 0.91, 1.22);
        vec3 shellWarmGrade = vec3(1.24, 1.035, 0.76);
        vec3 shellTemperature = uApronShellGrade.z < 0.0
          ? shellCoolGrade
          : shellWarmGrade;
        gl_FragColor.rgb *= mix(
          vec3(1.0),
          shellTemperature,
          min(1.0, abs(uApronShellGrade.z)) * 0.5
        );
        gl_FragColor.rgb *= max(0.0, uApronShellGrade.x);

        float shellLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        gl_FragColor.rgb *= uShellLight;
        gl_FragColor.rgb = mix(vec3(shellLuma), gl_FragColor.rgb, max(0.0, uShellHaze.w));
        gl_FragColor.rgb = (gl_FragColor.rgb - vec3(0.5)) * uShellContrast + vec3(0.5);
        float shellMottle = sin(vShellWorldPosition.x * 0.037 + vShellWorldPosition.z * 0.021)
          + sin(vShellWorldPosition.x * 0.013 - vShellWorldPosition.z * 0.043);
        gl_FragColor.rgb *= 1.0 + shellMottle * 0.018;
        float shellDistance = length(vShellWorldPosition - cameraPosition);
        float shellAir = smoothstep(
          min(uShellHaze.x, uShellHaze.y - 1.0),
          max(uShellHaze.x + 1.0, uShellHaze.y),
          shellDistance
        ) * clamp(uShellHaze.z, 0.0, 1.0);
        shellAir *= smoothstep(0.01, 0.28, vShellDepth);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uShellHorizonColor, shellAir);
        if (uApronShellTexture.z > 0.5) {
          gl_FragColor.rgb = vec3(0.05, 0.82, 0.94);
        }
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => (
    `chart-island-shell-basic-v5-near-cutout-${horizonOnly ? 'horizon' : 'full'}`
  );
  material.dithering = true;
  material.needsUpdate = true;
  SHELL_MATERIALS.add(material);
  return material;
}

function ShellUniformDriver() {
  useFrame(() => {
    const store = useThreeGameStore.getState();
    const sky = skyState(store.timeOfDay, store.day || 1);
    const shellLight = THREE.MathUtils.clamp(
      0.16
      + sky.daylight * (0.8 - weatherEnv.lightDim * 0.25)
      + sky.moonlight * 0.14,
      0.14,
      1,
    );
    for (const material of SHELL_MATERIALS) {
      const uniforms = material.userData.shellUniforms;
      if (!uniforms) continue;
      uniforms.uShellRelief.value = distanceSceneryRuntime.shellRelief;
      uniforms.uShellVertical.value = distanceSceneryRuntime.shellVertical;
      uniforms.uShellRadiusScale.value = distanceSceneryRuntime.shellRadiusScale;
      uniforms.uShellHaze.value.set(
        distanceSceneryRuntime.shellHazeStart,
        distanceSceneryRuntime.shellHazeEnd,
        distanceSceneryRuntime.shellHazeStrength,
        distanceSceneryRuntime.shellSaturation,
      );
      uniforms.uShellContrast.value = distanceSceneryRuntime.shellContrast;
      uniforms.uShellLight.value = shellLight;
      material.wireframe = distanceSceneryRuntime.shellWireframe;
    }
  });
  return null;
}

export function ChartIslandShell({ regionId }) {
  useSyncExternalStore(
    subscribeDistanceScenery,
    getDistanceSceneryRevision,
    getDistanceSceneryRevision,
  );
  const mode = distanceSceneryRuntime.mode;
  const variant = mode === 'hybrid'
    ? CHART_SHELL_VARIANTS.horizon
    : CHART_SHELL_VARIANTS.full;
  const geometry = useMemo(
    () => getChartIslandShellGeometry(regionId, variant),
    [regionId, variant],
  );
  const material = useMemo(
    () => createShellMaterial(variant === CHART_SHELL_VARIANTS.horizon),
    [variant],
  );
  useEffect(() => () => {
    SHELL_MATERIALS.delete(material);
    material.dispose();
  }, [material]);

  if (
    !geometry
    || mode === 'layered'
    || !distanceSceneryRuntime.shellVisible
  ) {
    return null;
  }
  return (
    <group name="chart-island-shell">
      <ShellUniformDriver />
      <mesh
        geometry={geometry}
        material={material}
        receiveShadow={false}
        castShadow={false}
        frustumCulled
        userData={{
          renderSource: `chart-island-shell:${regionId}`,
          renderLabel: `${regionId} ${variant} chart island shell`,
          renderKind: 'chart-island-shell',
          renderPath: '/assets/generated/island-shell/mask.json',
          shellVariant: variant,
        }}
      />
    </group>
  );
}
