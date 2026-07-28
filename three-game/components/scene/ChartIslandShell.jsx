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
import { vistaAtmosphereUniforms } from '../../world/vistas/vistaAtmosphere';

const SHELL_MATERIALS = new Set();

function createShellMaterial() {
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
    shader.uniforms.uShellHorizonColor = vistaAtmosphereUniforms.uVistaHorizonColor;
    material.userData.shellUniforms = shader.uniforms;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aShellDepth;
        attribute float aShellLand;
        uniform float uShellRelief;
        uniform float uShellVertical;
        uniform float uShellRadiusScale;
        varying float vShellDepth;
        varying float vShellLand;
        varying vec3 vShellWorldPosition;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vShellDepth = aShellDepth;
        vShellLand = aShellLand;
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
        uniform vec3 uShellHorizonColor;
        varying float vShellDepth;
        varying float vShellLand;
        varying vec3 vShellWorldPosition;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `// The shared Water surface already owns open ocean. Drawing the shell's
        // below-water sea through it made a second, ruler-straight horizon.
        if (vShellLand < 0.08) discard;
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
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'chart-island-shell-basic-v3-land-only';
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
  const material = useMemo(() => createShellMaterial(), []);
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
