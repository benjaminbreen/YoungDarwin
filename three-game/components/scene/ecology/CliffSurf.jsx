'use client';

import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../../store';
import { skyState } from '../../../world/celestial';
import { WATER_LEVEL } from '../../../world/water';
import { weatherEnv } from '../../../world/weatherEnvRuntime';

const FOAM_DAY = new THREE.Color('#edf8f3');
const FOAM_NIGHT = new THREE.Color('#728b9d');
const WATER_DAY = new THREE.Color('#2b8da6');
const WATER_NIGHT = new THREE.Color('#102b3c');
const WATER_STORM = new THREE.Color('#315e70');

function setAnchorAttributes(geometry, values) {
  const positions = [];
  const centers = [];
  const tangents = [];
  const normals = [];
  const phases = [];
  const strengths = [];
  const widths = [];
  const heights = [];
  const tones = [];
  const indices = [];
  // Extra subdivisions keep the low crest round when it is seen end-on.
  // (The first pass used six vertices across each impact and exposed the
  // silhouette of the individual cards.)
  const alongSegments = 10;
  const verticalSegments = 4;

  values.forEach((anchor, anchorIndex) => {
    const base = positions.length / 3;
    for (let row = 0; row <= verticalSegments; row += 1) {
      const v = row / verticalSegments;
      for (let column = 0; column <= alongSegments; column += 1) {
        const u = column / alongSegments * 2 - 1;
        positions.push(u, v, 0);
        centers.push(anchor.x, WATER_LEVEL, anchor.z);
        tangents.push(anchor.tangentX, anchor.tangentZ);
        normals.push(anchor.normalX, anchor.normalZ);
        phases.push(anchor.phase);
        strengths.push(anchor.strength);
        widths.push(anchor.width);
        heights.push(anchor.height);
        tones.push(anchor.tone ?? anchorIndex / Math.max(1, values.length - 1));
      }
    }
    const rowWidth = alongSegments + 1;
    for (let row = 0; row < verticalSegments; row += 1) {
      for (let column = 0; column < alongSegments; column += 1) {
        const a = base + row * rowWidth + column;
        const b = a + 1;
        const c = a + rowWidth;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  });

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 3));
  geometry.setAttribute('aTangent', new THREE.Float32BufferAttribute(tangents, 2));
  geometry.setAttribute('aNormal', new THREE.Float32BufferAttribute(normals, 2));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute('aStrength', new THREE.Float32BufferAttribute(strengths, 1));
  geometry.setAttribute('aWidth', new THREE.Float32BufferAttribute(widths, 1));
  geometry.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1));
  geometry.setAttribute('aTone', new THREE.Float32BufferAttribute(tones, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createAnchorGeometry(anchors) {
  return setAnchorAttributes(new THREE.BufferGeometry(), anchors);
}

function createSprayGeometry(anchors, countPerAnchor, salt = 0) {
  const positions = [];
  const centers = [];
  const tangents = [];
  const normals = [];
  const phases = [];
  const strengths = [];
  const widths = [];
  const seeds = [];
  const random = (anchorIndex, particleIndex, channel) => {
    const raw = Math.sin(
      (anchorIndex + 1) * 71.39
      + (particleIndex + 1) * 19.17
      + channel * 113.71
      + salt * 31.91,
    ) * 43758.5453;
    return raw - Math.floor(raw);
  };
  anchors.forEach((anchor, anchorIndex) => {
    for (let index = 0; index < countPerAnchor; index += 1) {
      positions.push(0, 0, 0);
      centers.push(anchor.x, WATER_LEVEL, anchor.z);
      tangents.push(anchor.tangentX, anchor.tangentZ);
      normals.push(anchor.normalX, anchor.normalZ);
      phases.push(anchor.phase);
      strengths.push(anchor.strength);
      widths.push(anchor.width);
      seeds.push(
        random(anchorIndex, index, 0),
        random(anchorIndex, index, 1),
        random(anchorIndex, index, 2),
        random(anchorIndex, index, 3),
      );
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 3));
  geometry.setAttribute('aTangent', new THREE.Float32BufferAttribute(tangents, 2));
  geometry.setAttribute('aNormal', new THREE.Float32BufferAttribute(normals, 2));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute('aStrength', new THREE.Float32BufferAttribute(strengths, 1));
  geometry.setAttribute('aWidth', new THREE.Float32BufferAttribute(widths, 1));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 4));
  geometry.computeBoundingSphere();
  return geometry;
}

const COMMON_UNIFORMS = profile => ({
  uTime: { value: 0 },
  uPeriod: { value: profile.period },
  uApproach: { value: profile.approachDistance },
  uWaterLevel: { value: WATER_LEVEL },
  uDaylight: { value: 1 },
  uStorm: { value: 0 },
  uFoam: { value: FOAM_DAY.clone() },
  uWater: { value: WATER_DAY.clone() },
});

function createBreakerMaterial(profile) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
    uniforms: COMMON_UNIFORMS(profile),
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uPeriod;
      uniform float uApproach;
      uniform float uWaterLevel;
      attribute vec3 aCenter;
      attribute vec2 aTangent;
      attribute vec2 aNormal;
      attribute float aPhase;
      attribute float aStrength;
      attribute float aWidth;
      attribute float aHeight;
      attribute float aTone;
      varying vec3 vWorld;
      varying vec2 vLocal;
      varying float vAlpha;
      varying float vFoam;
      varying float vImpact;

      float easeOut(float x) {
        float q = clamp(x, 0.0, 1.0);
        return 1.0 - (1.0 - q) * (1.0 - q);
      }

      void main() {
        float cycle = fract(uTime / uPeriod + aPhase);
        float travel = clamp(cycle / 0.5, 0.0, 1.0);
        float arrival = smoothstep(0.41, 0.54, cycle);
        float impact = arrival * (1.0 - smoothstep(0.76, 0.94, cycle));
        float approachVisibility = 1.0 - smoothstep(0.5, 0.58, cycle);
        float edge = 1.0 - smoothstep(0.76, 1.0, abs(position.x));
        float crestRoll = pow(sin(clamp(travel, 0.0, 1.0) * 3.14159265), 0.72);
        float setPulse = 0.86 + 0.14 * sin(floor(uTime / uPeriod) * 2.17 + aTone * 8.4);

        vec3 approaching = aCenter;
        approaching.xz += aTangent * position.x * aWidth * 0.52;
        approaching.xz += aNormal * mix(uApproach, 0.18, easeOut(travel));
        float approachHeight = aStrength * setPulse * (0.22 + crestRoll * 1.12);
        approaching.y = uWaterLevel + position.y * approachHeight;
        approaching.xz += aNormal * sin(position.y * 3.14159265) * crestRoll * 0.72;
        approaching.y -= pow(abs(position.x), 2.2) * approachHeight * 0.22;
        approaching.y += sin(position.x * 9.7 + aTone * 19.0) * 0.055 * position.y;

        vec3 crashing = aCenter;
        crashing.xz += aTangent * position.x * aWidth * 0.55;
        // The resolved water body remains a low curling lip. Tall impact
        // volume comes from spray particles; extending this mesh several
        // metres up the wall exposes its tessellated cards at close range.
        float wallHeight = min(0.92, 0.38 + aHeight * aStrength * 0.105) * setPulse;
        crashing.y = uWaterLevel + pow(position.y, 0.72) * wallHeight;
        crashing.xz += aNormal * (
          0.04
          + sin(position.y * 3.14159265) * (0.24 + impact * 0.34)
          + pow(position.y, 3.0) * impact * 0.16
        );
        crashing.y -= pow(abs(position.x), 2.5) * wallHeight * 0.2;
        crashing.y += sin(position.x * 11.0 + aTone * 17.0) * 0.07 * position.y;

        vec3 world = mix(approaching, crashing, arrival);
        vWorld = world;
        vLocal = position.xy;
        vImpact = impact;
        vAlpha = edge * max(approachVisibility * (0.58 + crestRoll * 0.42), impact);
        vAlpha *= 0.72 + aStrength * 0.18;
        vFoam = clamp(
          smoothstep(0.64, 0.92, position.y)
          + impact * smoothstep(0.48, 0.86, position.y) * 0.22,
          0.0,
          1.0
        );
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uDaylight;
      uniform float uStorm;
      uniform vec3 uFoam;
      uniform vec3 uWater;
      varying vec3 vWorld;
      varying vec2 vLocal;
      varying float vAlpha;
      varying float vFoam;
      varying float vImpact;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float coarse = noise(vWorld.xz * 0.52 + vec2(uTime * 0.16, -uTime * 0.11));
        float fine = noise(vWorld.xz * 1.85 + vWorld.y * 0.7 + vec2(-uTime * 0.31, uTime * 0.24));
        float torn = smoothstep(0.18, 0.88, coarse * 0.62 + fine * 0.38);
        float lip = smoothstep(0.63, 0.96, vLocal.y);
        float foam = clamp(max(vFoam * torn, lip * (0.34 + fine * 0.46)), 0.0, 1.0);
        float edgeFade = 1.0 - smoothstep(0.72, 1.0, abs(vLocal.x));
        float ragged = smoothstep(0.36, 0.76, coarse * 0.56 + fine * 0.44);
        // This is intentionally only a torn crest, never an opaque water
        // wall. The displaced ocean surface supplies the body of the wave.
        float foamAlpha = foam * (0.16 + ragged * 0.3);
        float alpha = vAlpha * edgeFade * foamAlpha;
        alpha *= mix(0.76, 1.0, uDaylight) * (0.92 + uStorm * 0.1);
        if (alpha < 0.035) discard;
        vec3 crestColor = mix(uWater * vec3(0.72, 0.94, 1.02), uFoam, 0.7 + foam * 0.3);
        crestColor = mix(crestColor, uFoam, vImpact * fine * 0.12);
        gl_FragColor = vec4(crestColor, min(alpha, 0.46));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createBaseFoamMaterial(profile) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
    uniforms: COMMON_UNIFORMS(profile),
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uPeriod;
      uniform float uWaterLevel;
      attribute vec3 aCenter;
      attribute vec2 aTangent;
      attribute vec2 aNormal;
      attribute float aPhase;
      attribute float aStrength;
      attribute float aWidth;
      attribute float aTone;
      varying vec3 vWorld;
      varying vec2 vLocal;
      varying float vAlpha;

      void main() {
        float cycle = fract(uTime / uPeriod + aPhase);
        float impact = smoothstep(0.44, 0.56, cycle) * (1.0 - smoothstep(0.9, 1.0, cycle));
        float retreat = smoothstep(0.62, 0.84, cycle);
        vec3 world = aCenter;
        world.xz += aTangent * position.x * aWidth * 0.58;
        world.xz += aNormal * (0.12 + position.y * mix(5.8, 3.6, retreat));
        world.y = uWaterLevel + 0.07 + sin(position.x * 5.4 + aTone * 8.0 + uTime * 1.6) * 0.025;
        vWorld = world;
        vLocal = position.xy;
        vAlpha = impact * aStrength * (1.0 - smoothstep(0.72, 1.0, abs(position.x)));
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uDaylight;
      uniform vec3 uFoam;
      uniform vec3 uWater;
      varying vec3 vWorld;
      varying vec2 vLocal;
      varying float vAlpha;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(157.31, 113.97))) * 43137.71);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float a = noise(vWorld.xz * 0.68 + vec2(uTime * 0.09, -uTime * 0.07));
        float b = noise(vWorld.xz * 2.1 + vec2(-uTime * 0.19, uTime * 0.13));
        float cells = smoothstep(0.34, 0.76, a * 0.62 + b * 0.38);
        float outerFade = smoothstep(1.0, 0.66, vLocal.y);
        float alpha = vAlpha * outerFade * cells * mix(0.62, 0.92, uDaylight);
        if (alpha < 0.018) discard;
        vec3 color = mix(uWater, uFoam, 0.74 + b * 0.26);
        gl_FragColor = vec4(color, min(alpha, 0.82));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createRunoffMaterial(profile) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: COMMON_UNIFORMS(profile),
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uPeriod;
      uniform float uWaterLevel;
      attribute vec3 aCenter;
      attribute vec2 aTangent;
      attribute vec2 aNormal;
      attribute float aPhase;
      attribute float aStrength;
      attribute float aWidth;
      attribute float aHeight;
      attribute float aTone;
      varying vec3 vWorld;
      varying vec2 vLocal;
      varying float vWet;
      varying float vTone;

      void main() {
        float cycle = fract(uTime / uPeriod + aPhase);
        float wet = smoothstep(0.52, 0.65, cycle) * (1.0 - smoothstep(0.94, 1.0, cycle));
        vec3 world = aCenter;
        world.xz += aTangent * position.x * aWidth * 0.48;
        world.xz -= aNormal * 0.035;
        world.y = uWaterLevel + pow(position.y, 0.92) * aHeight * aStrength * 0.92;
        vWorld = world;
        vLocal = position.xy;
        vWet = wet * (1.0 - smoothstep(0.76, 1.0, abs(position.x)));
        vTone = aTone;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uDaylight;
      uniform vec3 uFoam;
      varying vec3 vWorld;
      varying vec2 vLocal;
      varying float vWet;
      varying float vTone;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(91.7, 287.1))) * 43758.5453);
      }

      void main() {
        float streak = hash(vec2(floor((vLocal.x + 1.0) * 17.0 + vTone * 13.0), floor(vLocal.y * 12.0)));
        float channel = smoothstep(0.54, 0.88, streak);
        float falloff = (1.0 - smoothstep(0.74, 1.0, vLocal.y)) * 0.3 + 0.7;
        float rivulet = smoothstep(0.73, 0.93, channel);
        float alpha = vWet * falloff * (0.018 + rivulet * 0.065) * mix(0.68, 1.0, uDaylight);
        if (alpha < 0.012) discard;
        vec3 darkWet = vec3(0.035, 0.075, 0.085);
        vec3 color = mix(darkWet, uFoam, rivulet * 0.32);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createSprayMaterial(profile, mist = false) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    uniforms: {
      ...COMMON_UNIFORMS(profile),
      uSprayMultiplier: { value: profile.sprayMultiplier || 1 },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uPeriod;
      uniform float uWaterLevel;
      uniform float uSprayMultiplier;
      attribute vec3 aCenter;
      attribute vec2 aTangent;
      attribute vec2 aNormal;
      attribute float aPhase;
      attribute float aStrength;
      attribute float aWidth;
      attribute vec4 aSeed;
      varying float vAlpha;
      varying float vSparkle;

      float impactHash(vec2 p) {
        return fract(sin(dot(p, vec2(157.31, 113.97))) * 43137.71);
      }

      float impactNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(impactHash(i), impactHash(i + vec2(1.0, 0.0)), u.x),
                   mix(impactHash(i + vec2(0.0, 1.0)), impactHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        // Match Water.jsx's marching breaker field. The old emitter used its
        // own 7-8 second loop, so spray often erupted with no wave beneath it.
        const vec2 SWELL_DIRECTION = vec2(0.86024, 0.50979);
        const float IMPACT_SHORE_DISTANCE = 0.46;
        float alongCrest = dot(aCenter.xz, vec2(-SWELL_DIRECTION.y, SWELL_DIRECTION.x));
        float waveCoordinate = IMPACT_SHORE_DISTANCE / 10.0 + uTime * 0.085
          + impactNoise(aCenter.xz * 0.05) * 0.45;
        waveCoordinate += sin(alongCrest * 0.28 + uTime * 0.21) * 0.045;
        waveCoordinate += (impactNoise(vec2(
          alongCrest * 0.12 - uTime * 0.035,
          IMPACT_SHORE_DISTANCE * 0.08
        )) - 0.5) * 0.16;
        float waveId = floor(waveCoordinate);
        float cycle = fract(waveCoordinate);
        float setStrength = 0.5 + 0.5 * impactNoise(vec2(
          waveId * 3.7,
          (aCenter.x + aCenter.z) * 0.025 + waveId
        ));
        setStrength *= 0.82 + 0.18 * sin(
          uTime * 0.43 + waveId * 2.17 + alongCrest * 0.035
        );
        float delay = aSeed.w * ${mist ? '0.052' : '0.038'};
        float localAge = cycle - delay;
        float duration = ${mist ? '0.34' : '0.18'};
        float lifeGate = step(0.0, localAge) * (1.0 - step(duration, localAge));
        float seconds = max(0.0, localAge) * uPeriod;
        float side = (aSeed.x * 2.0 - 1.0) * aWidth * ${mist ? '0.48' : '0.54'};
        float tangentialSpeed = (aSeed.y * 2.0 - 1.0) * ${mist ? '0.5' : '1.65'};
        float impactEnergy = aStrength * mix(0.68, 1.0, setStrength);
        float outwardSpeed = mix(${mist ? '0.32' : '1.2'}, ${mist ? '1.15' : '3.9'}, aSeed.z) * impactEnergy;
        float upwardSpeed = mix(${mist ? '1.1' : '5.6'}, ${mist ? '2.8' : '9.6'}, aSeed.y) * impactEnergy * uSprayMultiplier;
        vec3 world = aCenter;
        world.xz += aTangent * (side + tangentialSpeed * seconds);
        world.xz += aNormal * (${mist ? '0.4' : '0.18'} + outwardSpeed * seconds);
        world.y = uWaterLevel + ${mist ? '0.65' : '0.18'} + upwardSpeed * seconds;
        world.y -= ${mist ? '0.85' : '4.75'} * seconds * seconds;
        float life = clamp(localAge / duration, 0.0, 1.0);
        float burst = (1.0 - smoothstep(0.0, 0.18, life)) * smoothstep(0.0, 0.045, life);
        vAlpha = lifeGate * max(burst, pow(1.0 - life, ${mist ? '1.1' : '1.7'}) * 0.58)
          * (0.56 + aSeed.z * 0.44) * mix(0.58, 1.0, setStrength);
        vSparkle = aSeed.x;
        vec4 view = viewMatrix * vec4(world, 1.0);
        float baseSize = mix(${mist ? '28.0' : '6.0'}, ${mist ? '68.0' : '17.0'}, aSeed.z);
        gl_PointSize = clamp(baseSize * (${mist ? '20.0' : '32.0'} / max(3.0, -view.z)), 1.0, ${mist ? '64.0' : '22.0'}) * sqrt(vAlpha);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uDaylight;
      uniform vec3 uFoam;
      uniform vec3 uWater;
      varying float vAlpha;
      varying float vSparkle;

      void main() {
        vec2 q = gl_PointCoord - 0.5;
        // Impact droplets read as short vertical streaks; mist remains soft
        // and round. Both are camera-facing particles, never large polygons.
        vec2 shaped = vec2(q.x * ${mist ? '1.0' : '2.25'}, q.y * ${mist ? '1.0' : '0.72'});
        float radial = length(shaped);
        float soft = 1.0 - smoothstep(${mist ? '0.08, 0.5' : '0.12, 0.48'}, radial);
        float turbulent = 0.72 + 0.28 * sin((q.x + q.y) * 19.0 + vSparkle * 11.0);
        float alpha = vAlpha * soft * turbulent * ${mist ? '0.16' : '0.7'};
        if (alpha < 0.008) discard;
        vec3 color = mix(uWater, uFoam, ${mist ? '0.72' : '0.82'} + vSparkle * ${mist ? '0.12' : '0.18'});
        color *= mix(0.62, 1.05, uDaylight);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function updateMaterialLook(material, time, daylight, storm) {
  const uniforms = material.uniforms;
  uniforms.uTime.value = time;
  uniforms.uDaylight.value = daylight;
  uniforms.uStorm.value = storm;
  uniforms.uFoam.value.copy(FOAM_NIGHT).lerp(FOAM_DAY, daylight);
  uniforms.uWater.value
    .copy(WATER_NIGHT)
    .lerp(WATER_DAY, daylight)
    .lerp(WATER_STORM, storm * (0.25 + daylight * 0.55));
}

export function CliffSurf({ profile }) {
  const sprayGeometry = useMemo(
    () => createSprayGeometry(profile.anchors, profile.sprayCount || 76, 3.1),
    [profile],
  );
  const mistGeometry = useMemo(
    () => createSprayGeometry(profile.anchors, profile.mistCount || 22, 8.4),
    [profile],
  );
  const sprayMaterial = useMemo(() => createSprayMaterial(profile, false), [profile]);
  const mistMaterial = useMemo(() => createSprayMaterial(profile, true), [profile]);

  useFrame(({ clock }) => {
    const store = useThreeGameStore.getState();
    const sky = skyState(store.timeOfDay, store.day || 1);
    const daylight = sky.daylight;
    const storm = THREE.MathUtils.clamp(
      weatherEnv.overcast * 0.5 + weatherEnv.rainIntensity * 0.5,
      0,
      1,
    );
    updateMaterialLook(sprayMaterial, clock.elapsedTime, daylight, storm);
    updateMaterialLook(mistMaterial, clock.elapsedTime, daylight, storm);
  });

  useEffect(() => () => {
    sprayGeometry.dispose();
    mistGeometry.dispose();
    sprayMaterial.dispose();
    mistMaterial.dispose();
  }, [
    mistGeometry,
    mistMaterial,
    sprayGeometry,
    sprayMaterial,
  ]);

  return (
    <group userData={{
      noReflect: true,
      renderSource: `cliff-surf:${profile.id}`,
      renderLabel: profile.id,
      renderKind: 'cliff-surf',
      renderPath: null,
    }}>
      <points geometry={mistGeometry} material={mistMaterial} renderOrder={3} frustumCulled={false} />
      <points geometry={sprayGeometry} material={sprayMaterial} renderOrder={4} frustumCulled={false} />
    </group>
  );
}
