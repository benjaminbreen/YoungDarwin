import * as THREE from 'three';
import { weatherEnv } from '../../../world/weatherEnvRuntime';
import { resolveFoliagePush } from '../../../world/ecology/foliagePushProfiles';

// Vertex-shader foliage motion: steady wind sway plus a dynamic push away from
// the player. All foliage materials share ONE uniforms object, so the whole
// system costs a handful of uniform updates per frame and a few ALU per vertex
// — no per-plant CPU work, no extra draw calls.
//
// Displacement is weighted by each vertex's height above the plant base
// (geometry is ground-origin after the ground-pivot pass), so roots stay
// planted while tips move. Player contact is evaluated once from the plant
// root rather than independently from every vertex; otherwise broad shrubs
// expand into a radial ring when the player walks through their canopy.
//
// --- The push spring -------------------------------------------------------
// The push used to be a static field: bend = f(distance to a lagged player).
// That reads as mush, because a plant's whole character is in its transient —
// how hard it gives when you shove into it and how it comes back when you
// leave. A real spring needs per-plant state, which we cannot afford across
// tens of thousands of instances.
//
// Instead we keep THREE lagged copies of Darwin's position, chained so each
// trails the one before it, and take a weighted difference of the same field
// sampled at all three:
//
//     load = A * f(fast) - B * f(mid) + C * f(slow),   A - B + C = 1
//
// That difference is a discrete approximation of a damped oscillator's impulse
// response, evaluated per plant from shared uniforms. Because A - B + C = 1, a
// sustained lean settles at exactly the authored deflection; the spread between
// taps is what overshoots on contact and swings back through upright on
// release. Speed dependence falls out for free — walking fast separates the
// taps, creeping collapses them onto each other.
//
// Per-species character (how far it bends, how much it rings, how much the
// tips whip) comes from `foliagePushProfiles.js`.

// Chained lag rates, in 1/s. The spread between them IS the spring: too close
// together and the weighted difference collapses to the static field again
// (26/10.5/4.8 gave grass only a 1.17x contact peak), too far apart and the
// steady lean stops converging while you stand in the plant.
const TAP_RATES = [30, 6.5, 2.6];
const TELEPORT_DISTANCE = 12;
const LEAD_TRACK_RATE = 12;
const SPEED_TRACK_RATE = 9;
// Walk is ~4.45 m/s and run ~7.45 m/s in this project's units, so a brisk walk
// already reads as most of the available push.
const FULL_PUSH_SPEED = 6;

export const foliageUniforms = {
  uFoliageTime: { value: 0 },
  // Three chained lags of the player position. Tap 0 tracks the body almost
  // exactly; taps 1 and 2 trail it. Their difference is the spring.
  uFoliagePush0: { value: new THREE.Vector3(0, -999, 0) },
  uFoliagePush1: { value: new THREE.Vector3(0, -999, 0) },
  uFoliagePush2: { value: new THREE.Vector3(0, -999, 0) },
  // xy: smoothed travel direction, z: 0..1 speed ramp. Plants get dragged
  // downrange as you brush past instead of only shoved radially outward.
  uFoliageLead: { value: new THREE.Vector3(0, 0, 0) },
  // Live wind, shared with rain, clouds, grass, and Darwin's hair. This used
  // to be a hardcoded constant pointing roughly opposite the prevailing
  // trades, so every shrub on the island swayed against the weather.
  uWindDir: { value: new THREE.Vector2(weatherEnv.windX, weatherEnv.windZ) },
  // Global "how hard is it blowing" multiplier, including the shared gust
  // surge. Per-material `uWindAmp` stays the authored per-species amplitude.
  uWindGain: { value: 1 },
};

const _target = new THREE.Vector3();
const _leadDir = new THREE.Vector2(0, 0);
let _speed01 = 0;
let _seeded = false;

function approach(current, target, rate, dt) {
  current.lerp(target, 1 - Math.exp(-dt * rate));
}

export function updateFoliageUniforms(elapsedTime, playerPosition, delta, intendedVelocity = null) {
  foliageUniforms.uFoliageTime.value = elapsedTime;
  foliageUniforms.uWindDir.value.set(weatherEnv.windX, weatherEnv.windZ);
  foliageUniforms.uWindGain.value = weatherEnv.foliageWindGain;
  if (!playerPosition) return;

  const dt = Math.min(0.05, Math.max(1 / 240, delta || 0.016));
  const tap0 = foliageUniforms.uFoliagePush0.value;
  const tap1 = foliageUniforms.uFoliagePush1.value;
  const tap2 = foliageUniforms.uFoliagePush2.value;
  _target.set(playerPosition.x || 0, playerPosition.y || 0, playerPosition.z || 0);

  // A zone change or respawn must not drag the trailing taps across the map,
  // which would bend a corridor of plants that were never touched.
  if (!_seeded || _target.distanceTo(tap0) > TELEPORT_DISTANCE) {
    tap0.copy(_target);
    tap1.copy(_target);
    tap2.copy(_target);
    _seeded = true;
  } else {
    approach(tap0, _target, TAP_RATES[0], dt);
    approach(tap1, tap0, TAP_RATES[1], dt);
    approach(tap2, tap1, TAP_RATES[2], dt);
  }

  // Intended velocity, not measured: leaning into a shrub that a fixed collider
  // has already stopped you against must still count as a push.
  const vx = Number(intendedVelocity?.x) || 0;
  const vz = Number(intendedVelocity?.z) || 0;
  const speed = Math.hypot(vx, vz);
  const speedTrack = 1 - Math.exp(-dt * SPEED_TRACK_RATE);
  _speed01 += (Math.min(1, speed / FULL_PUSH_SPEED) - _speed01) * speedTrack;
  if (speed > 0.05) {
    // Keep the last heading when he stops rather than snapping the drag
    // direction to zero; the speed ramp is what fades the effect out.
    const leadTrack = 1 - Math.exp(-dt * LEAD_TRACK_RATE);
    _leadDir.x += (vx / speed - _leadDir.x) * leadTrack;
    _leadDir.y += (vz / speed - _leadDir.y) * leadTrack;
    const length = Math.hypot(_leadDir.x, _leadDir.y);
    if (length > 0.0001) {
      _leadDir.x /= length;
      _leadDir.y /= length;
    }
  }
  foliageUniforms.uFoliageLead.value.set(_leadDir.x, _leadDir.y, _speed01);
}

export function applyFoliageMotion(material, geometry, motion = {}, descriptor = {}) {
  const {
    wind = 0.5,
    bend = 1,
    bendRadius = 2.25,
  } = motion;
  const push = resolveFoliagePush(motion, descriptor);

  geometry.computeBoundingBox();
  const baseY = geometry.boundingBox.min.y;
  const refHeight = Math.max(0.2, geometry.boundingBox.max.y - geometry.boundingBox.min.y);
  const rootCenter = new THREE.Vector3(
    (geometry.boundingBox.min.x + geometry.boundingBox.max.x) * 0.5,
    baseY,
    (geometry.boundingBox.min.z + geometry.boundingBox.max.z) * 0.5,
  );
  material.onBeforeCompile = shader => {
    shader.uniforms.uFoliageTime = foliageUniforms.uFoliageTime;
    shader.uniforms.uFoliagePush0 = foliageUniforms.uFoliagePush0;
    shader.uniforms.uFoliagePush1 = foliageUniforms.uFoliagePush1;
    shader.uniforms.uFoliagePush2 = foliageUniforms.uFoliagePush2;
    shader.uniforms.uFoliageLead = foliageUniforms.uFoliageLead;
    shader.uniforms.uWindDir = foliageUniforms.uWindDir;
    shader.uniforms.uWindGain = foliageUniforms.uWindGain;
    shader.uniforms.uWindAmp = { value: 0.14 * wind };
    shader.uniforms.uBendAmp = { value: push.amp };
    shader.uniforms.uBendRadius = { value: bendRadius };
    shader.uniforms.uBaseY = { value: baseY };
    shader.uniforms.uRefHeight = { value: refHeight };
    shader.uniforms.uRootCenter = { value: rootCenter };
    shader.uniforms.uBendDown = { value: push.bendDown };
    shader.uniforms.uMaxBendHeightRatio = { value: push.maxBendHeightRatio };
    shader.uniforms.uPushSpring = { value: new THREE.Vector3(...push.spring) };
    shader.uniforms.uPushTiming = { value: new THREE.Vector2(...push.timing) };
    shader.uniforms.uPushDrag = { value: push.drag };
    shader.uniforms.uTipWhip = { value: push.tipWhip };
    shader.uniforms.uPushRecoil = { value: push.recoilRatio };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFoliageTime;
        uniform vec3 uFoliagePush0;
        uniform vec3 uFoliagePush1;
        uniform vec3 uFoliagePush2;
        uniform vec3 uFoliageLead;
        uniform vec2 uWindDir;
        uniform float uWindGain;
        uniform float uWindAmp;
        uniform float uBendAmp;
        uniform float uBendRadius;
        uniform float uBaseY;
        uniform float uRefHeight;
        uniform vec3 uRootCenter;
        uniform float uBendDown;
        uniform float uMaxBendHeightRatio;
        uniform vec3 uPushSpring;
        uniform vec2 uPushTiming;
        uniform float uPushDrag;
        uniform float uTipWhip;
        uniform float uPushRecoil;

        // Smooth saturation. A hard min() clips the spring's overshoot flat,
        // which is exactly the part that reads as give; this stays linear for
        // light contact and asymptotes at the species' real deflection limit.
        //
        // The rebound gets a tighter ceiling than the push. Both directions
        // saturate, but a plant that swung back toward you as far as you had
        // just shoved it read like it was striking at you rather than
        // recovering — real vegetation returns past upright by a fraction of
        // its deflection and settles.
        float fmSoftClamp(float value, float limit, float recoilRatio) {
          float bound = mix(limit * recoilRatio, limit, step(0.0, value));
          return bound * value * inversesqrt(bound * bound + value * value + 1e-5);
        }`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 fmPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fmPosition = instanceMatrix * fmPosition;
        #endif
        vec4 fmWorld = modelMatrix * fmPosition;
        vec4 fmRootPosition = vec4(uRootCenter, 1.0);
        vec3 fmWorldUp = modelMatrix[1].xyz;
        #ifdef USE_INSTANCING
          fmRootPosition = instanceMatrix * fmRootPosition;
          fmWorldUp = mat3(modelMatrix) * instanceMatrix[1].xyz;
        #endif
        vec3 fmRootWorld = (modelMatrix * fmRootPosition).xyz;
        float fmWorldHeight = max(0.2, uRefHeight * length(fmWorldUp));
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
        vec2 fmWind = normalize(uWindDir + vec2(0.0001));
        vec2 fmCrossWind = vec2(-fmWind.y, fmWind.x);
        // Steady downwind lean: real wind holds foliage bent over rather than
        // only oscillating about upright. Referenced off the calm baseline
        // (gain 1) so a still day looks exactly as authored, and it grows with
        // the shared gust so surges push the canopy over as one.
        float fmLean = max(0.0, uWindGain - 1.0);
        fmWorld.xz += fmWind * fmLean * uWindAmp * 1.1 * (0.65 + fmGust * 0.35) * fmW;
        fmWorld.xz += fmWind * fmSway * uWindAmp * (0.7 + fmGust) * uWindGain * fmW;
        fmWorld.xz += fmCrossWind * sin(uFoliageTime * 2.15 + fmPhase * 1.3) * uWindAmp * 0.32 * uWindGain * fmTipW;
        // --- Player push: one spring, sampled from three lagged positions ---
        // Every vertex shares this direction and load. Height weighting above
        // supplies the bend without pulling opposite canopy edges apart.
        float fmRadius = max(uBendRadius, 0.05);
        vec2 fmAway = fmRootWorld.xz - uFoliagePush0.xz;
        float fmDist = length(fmAway);
        float fmF0 = 1.0 - smoothstep(0.12, fmRadius, fmDist);
        float fmF1 = 1.0 - smoothstep(0.12, fmRadius, length(fmRootWorld.xz - uFoliagePush1.xz));
        float fmF2 = 1.0 - smoothstep(0.12, fmRadius, length(fmRootWorld.xz - uFoliagePush2.xz));
        // Per-species timing: soft plants read the snappiest taps, woody ones
        // slide toward the slower pair so they answer sluggishly.
        float fmFast = mix(fmF0, fmF1, uPushTiming.x);
        float fmMid = mix(fmF1, fmF2, uPushTiming.y);
        // Vertical gate: walking a ledge above a shrub, or clearing it in a
        // jump, must not bend it. The push position is Darwin's feet, so a
        // plant rooted up to about his own height above him still catches his
        // chest. Soft edges, so stepping up or landing reads continuously.
        float fmBelow = smoothstep(1.9, 0.6, fmRootWorld.y - uFoliagePush0.y);
        float fmAbove = smoothstep(0.75, 0.0, uFoliagePush0.y - (fmRootWorld.y + fmWorldHeight));
        float fmGate = fmBelow * fmAbove;
        float fmLoad = (uPushSpring.x * fmFast - uPushSpring.y * fmMid + uPushSpring.z * fmF2) * fmGate;
        // Direction: radial away from the body, dragged toward his heading as
        // he picks up speed, so brushing past sweeps a plant downrange rather
        // than shoving it sideways.
        vec2 fmRadial = fmDist > 0.0001 ? fmAway / fmDist : vec2(1.0, 0.0);
        vec2 fmDir = normalize(mix(fmRadial, uFoliageLead.xy, uPushDrag * uFoliageLead.z) + fmRadial * 0.001);
        // Speed matters: creeping into a bush leans it, striding into it
        // shoves it. Pressed against a plant at a standstill it holds at
        // 0.62 rather than dropping to nothing, because his body is still
        // occupying that space.
        float fmSpeedGain = 0.62 + 0.72 * uFoliageLead.z;
        float fmCap = min(fmRadius * 0.55, fmWorldHeight * uMaxBendHeightRatio);
        float fmAmp = uBendAmp * fmWorldHeight;
        float fmPush = fmSoftClamp(fmLoad * fmAmp * fmSpeedGain * fmW, fmCap, uPushRecoil);
        // Tips carry the transient on their own budget: a trunk that barely
        // moves still throws its crown around when you shoulder it.
        float fmWhip = fmSoftClamp(
          (fmLoad - fmF2 * fmGate) * fmAmp * uTipWhip * fmSpeedGain * fmTipW,
          fmCap * 0.9,
          uPushRecoil
        );
        // One final ceiling on the sum. Each term saturates on its own budget,
        // so without this a whippy profile could travel nearly twice the tip
        // distance its growth form allows — and that limit is the whole point
        // of the profile. Tip whip buys defined headroom here, not a second
        // unbounded allowance.
        float fmTotal = fmSoftClamp(
          fmPush + fmWhip,
          fmCap * (1.0 + uTipWhip * 0.5 * fmTipW),
          uPushRecoil
        );
        fmWorld.xz += fmDir * fmTotal;
        fmWorld.y -= max(fmTotal, 0.0) * uBendDown;
        vec4 mvPosition = viewMatrix * fmWorld;
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  // Distinct programs per (wind, push profile, geometry bounds) bucket.
  material.customProgramCacheKey = () => [
    'foliage-motion',
    wind,
    bend,
    bendRadius,
    push.name,
    push.amp.toFixed(3),
    push.maxBendHeightRatio.toFixed(3),
    push.bendDown.toFixed(3),
    push.drag.toFixed(2),
    push.tipWhip.toFixed(2),
    push.recoilRatio.toFixed(2),
    baseY.toFixed(2),
    refHeight.toFixed(2),
  ].join('|');
  material.needsUpdate = true;
  return material;
}
