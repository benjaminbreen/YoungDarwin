import * as THREE from 'three';

// Vertex-shader foliage motion: steady wind sway plus dynamic bend away from
// the player, with spring-back. All foliage materials share ONE uniforms
// object, so the whole system costs two uniform updates per frame and a few
// ALU per vertex — no per-plant CPU work, no extra draw calls.
//
// Displacement is weighted by each vertex's height above the plant base
// (geometry is ground-origin after the ground-pivot pass), so roots stay
// planted while tips move.

export const foliageUniforms = {
  uFoliageTime: { value: 0 },
  // Smoothed player position; the lag is what makes plants ease back upright
  // after Darwin passes instead of snapping.
  uFoliagePlayer: { value: new THREE.Vector3(0, -999, 0) },
  uWindDir: { value: new THREE.Vector2(0.82, 0.57) },
};

const _target = new THREE.Vector3();

export function updateFoliageUniforms(elapsedTime, playerPosition, delta) {
  foliageUniforms.uFoliageTime.value = elapsedTime;
  if (playerPosition) {
    _target.set(playerPosition.x || 0, playerPosition.y || 0, playerPosition.z || 0);
    // Critically-damped-ish ease: fast enough to track walking, slow enough
    // to read as springy recovery.
    const t = 1 - Math.exp(-(delta || 0.016) * 7.5);
    foliageUniforms.uFoliagePlayer.value.lerp(_target, t);
  }
}

export function applyFoliageMotion(material, geometry, { wind = 0.5, bend = 1, bendRadius = 2.25 } = {}) {
  geometry.computeBoundingBox();
  const baseY = geometry.boundingBox.min.y;
  const refHeight = Math.max(0.2, geometry.boundingBox.max.y - geometry.boundingBox.min.y);
  material.onBeforeCompile = shader => {
    shader.uniforms.uFoliageTime = foliageUniforms.uFoliageTime;
    shader.uniforms.uFoliagePlayer = foliageUniforms.uFoliagePlayer;
    shader.uniforms.uWindDir = foliageUniforms.uWindDir;
    shader.uniforms.uWindAmp = { value: 0.14 * wind };
    shader.uniforms.uBendAmp = { value: 1.15 * bend };
    shader.uniforms.uBendRadius = { value: bendRadius };
    shader.uniforms.uBaseY = { value: baseY };
    shader.uniforms.uRefHeight = { value: refHeight };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFoliageTime;
        uniform vec3 uFoliagePlayer;
        uniform vec2 uWindDir;
        uniform float uWindAmp;
        uniform float uBendAmp;
        uniform float uBendRadius;
        uniform float uBaseY;
        uniform float uRefHeight;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 fmPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fmPosition = instanceMatrix * fmPosition;
        #endif
        vec4 fmWorld = modelMatrix * fmPosition;
        // Height weight: roots planted, tips free. Use geometry bounds so
        // centered GLBs and ground-origin GLBs both move correctly.
        float fmW = clamp((transformed.y - uBaseY) / uRefHeight, 0.0, 1.0);
        fmW = pow(fmW, 1.35);
        float fmTipW = pow(fmW, 1.75);
        // --- Wind: two crossed sines + slow gust, phased by world position --
        float fmPhase = fmWorld.x * 0.38 + fmWorld.z * 0.29;
        float fmGust = sin(uFoliageTime * 0.31 + fmPhase * 0.21) * 0.5 + 0.5;
        float fmSway = sin(uFoliageTime * 1.6 + fmPhase) * 0.6
          + sin(uFoliageTime * 2.7 + fmPhase * 1.7) * 0.28
          + sin(uFoliageTime * 4.3 + fmWorld.x * 0.91) * 0.14;
        vec2 fmCrossWind = vec2(-uWindDir.y, uWindDir.x);
        fmWorld.xz += uWindDir * fmSway * uWindAmp * (0.7 + fmGust) * fmW;
        fmWorld.xz += fmCrossWind * sin(uFoliageTime * 2.15 + fmPhase * 1.3) * uWindAmp * 0.32 * fmTipW;
        // --- Player bend: push tips radially away, slight crouch ------------
        vec2 fmAway = fmWorld.xz - uFoliagePlayer.xz;
        float fmDist = length(fmAway);
        float fmPush = smoothstep(uBendRadius, 0.12, fmDist) * uBendAmp * fmW;
        fmPush = min(fmPush, uBendRadius * 0.42);
        if (fmPush > 0.0001 && fmDist > 0.0001) {
          fmWorld.xz += (fmAway / fmDist) * fmPush;
          fmWorld.y -= fmPush * 0.35;
        }
        vec4 mvPosition = viewMatrix * fmWorld;
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  // Distinct programs per (wind, bend, refHeight) bucket.
  material.customProgramCacheKey = () => `foliage-motion|${wind}|${bend}|${bendRadius}|${baseY.toFixed(2)}|${refHeight.toFixed(2)}`;
  material.needsUpdate = true;
  return material;
}
