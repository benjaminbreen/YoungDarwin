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

export function applyFoliageMotion(material, geometry, { wind = 0.5, bend = 1 } = {}) {
  geometry.computeBoundingBox();
  const refHeight = Math.max(0.2, geometry.boundingBox.max.y);
  material.onBeforeCompile = shader => {
    shader.uniforms.uFoliageTime = foliageUniforms.uFoliageTime;
    shader.uniforms.uFoliagePlayer = foliageUniforms.uFoliagePlayer;
    shader.uniforms.uWindDir = foliageUniforms.uWindDir;
    shader.uniforms.uWindAmp = { value: 0.055 * wind };
    shader.uniforms.uBendAmp = { value: 0.55 * bend };
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
        uniform float uRefHeight;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 fmPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fmPosition = instanceMatrix * fmPosition;
        #endif
        vec4 fmWorld = modelMatrix * fmPosition;
        // Height weight: roots planted, tips free. Quadratic for a stiff base.
        float fmW = clamp(transformed.y / uRefHeight, 0.0, 1.0);
        fmW *= fmW;
        // --- Wind: two crossed sines + slow gust, phased by world position --
        float fmPhase = fmWorld.x * 0.38 + fmWorld.z * 0.29;
        float fmGust = sin(uFoliageTime * 0.31 + fmPhase * 0.21) * 0.5 + 0.5;
        float fmSway = sin(uFoliageTime * 1.6 + fmPhase) * 0.6
          + sin(uFoliageTime * 2.7 + fmPhase * 1.7) * 0.25;
        fmWorld.xz += uWindDir * fmSway * uWindAmp * (0.45 + fmGust) * fmW;
        // --- Player bend: push tips radially away, slight crouch ------------
        vec2 fmAway = fmWorld.xz - uFoliagePlayer.xz;
        float fmDist = length(fmAway);
        float fmPush = smoothstep(1.25, 0.15, fmDist) * uBendAmp * fmW;
        if (fmPush > 0.0001 && fmDist > 0.0001) {
          fmWorld.xz += (fmAway / fmDist) * fmPush;
          fmWorld.y -= fmPush * 0.35;
        }
        vec4 mvPosition = viewMatrix * fmWorld;
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  // Distinct programs per (wind, bend, refHeight) bucket.
  material.customProgramCacheKey = () => `foliage-motion|${wind}|${bend}|${refHeight.toFixed(2)}`;
  material.needsUpdate = true;
  return material;
}
