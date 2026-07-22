'use client';

import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Uniform } from 'three';
import { BlendFunction, Effect } from 'postprocessing';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { skyState } from '../../world/celestial';
import { terrainBiomeAt, terrainHeight } from '../../world/terrain';
import { weatherEnv } from '../../world/weatherEnvRuntime';

const HEAT_SAMPLE_OFFSETS = Object.freeze([
  [0, 0],
  [3.5, 0],
  [-3.5, 0],
  [0, 3.5],
  [0, -3.5],
]);

const HEAT_HAZE_FRAGMENT = /* glsl */`
  uniform float strength;

  float hazeHash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float hazeNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 blend = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hazeHash(cell), hazeHash(cell + vec2(1.0, 0.0)), blend.x),
      mix(hazeHash(cell + vec2(0.0, 1.0)), hazeHash(cell + vec2(1.0, 1.0)), blend.x),
      blend.y
    );
  }

  void mainUv(inout vec2 uv) {
    if (strength <= 0.000001) return;
    // Keep the distortion over the ground and low horizon. The upper sky is
    // stable, so the result reads as hot air rising off lava rather than a
    // full-screen underwater wobble.
    float groundBand = smoothstep(0.035, 0.18, uv.y)
      * (1.0 - smoothstep(0.73, 0.92, uv.y));
    float broad = hazeNoise(uv * vec2(17.0, 10.0) + vec2(time * 0.04, -time * 0.12));
    float fine = hazeNoise(uv * vec2(43.0, 24.0) + vec2(-time * 0.075, -time * 0.24));
    float rising = sin(uv.y * 92.0 - time * 1.15 + broad * 4.2);
    vec2 bend = vec2(
      (broad - 0.5) * 1.25 + rising * 0.22,
      (fine - 0.5) * 0.42
    );
    uv += bend * strength * groundBand;
  }
`;

function heatBiomeWeight(biome) {
  const name = String(biome || '').toLowerCase();
  if (/wet|water|pool|lagoon|swim/.test(name)) return 0;
  if (/black.lava|lava.shelf|dry.basalt|wave.cut.basalt|landing.basalt/.test(name)) return 1;
  if (/red.cinder|scoria|ash.slope/.test(name)) return 0.76;
  if (/black.sand|black.dune|ash.beach/.test(name)) return 0.48;
  if (/tuff/.test(name)) return 0.32;
  return 0;
}

class HeatHazeEffectImpl extends Effect {
  constructor() {
    super('HeatHazeEffect', HEAT_HAZE_FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['strength', new Uniform(0)],
      ]),
    });
  }

  setStrength(value) {
    this.uniforms.get('strength').value = value;
  }
}

export const HeatHazePostEffect = forwardRef(function HeatHazePostEffect({
  enabled = true,
  underwaterAmount = 0,
}, ref) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const effect = useMemo(() => new HeatHazeEffectImpl(), []);
  const sampledWeight = useRef(0);
  const sampleCooldown = useRef(0);
  const liveStrength = useRef(0);

  useFrame((_, delta) => {
    sampleCooldown.current -= delta;
    if (sampleCooldown.current <= 0) {
      sampleCooldown.current = 0.2;
      const pose = getRuntimePlayerPose();
      const x = Number(pose.position?.x) || 0;
      const z = Number(pose.position?.z) || 0;
      let total = 0;
      HEAT_SAMPLE_OFFSETS.forEach(([dx, dz]) => {
        const y = terrainHeight(x + dx, z + dz, currentZoneId);
        total += heatBiomeWeight(terrainBiomeAt(x + dx, z + dz, y, currentZoneId));
      });
      sampledWeight.current = total / HEAT_SAMPLE_OFFSETS.length;
    }

    const store = useThreeGameStore.getState();
    const sky = skyState(store.timeOfDay ?? 12, store.day || 1);
    const sunGate = MathUtils.smoothstep(sky.solarAltitude, 18, 42);
    const weatherGate = Math.max(0, 1 - weatherEnv.overcast * 0.92)
      * Math.max(0, 1 - weatherEnv.rainIntensity * 1.2)
      * Math.max(0, 1 - weatherEnv.mistAmount * 0.9);
    const waterGate = 1 - MathUtils.clamp(underwaterAmount, 0, 1);
    const target = enabled
      ? sampledWeight.current * sunGate * weatherGate * waterGate * 0.00155
      : 0;
    liveStrength.current = MathUtils.damp(liveStrength.current, target, 2.4, delta);
    effect.setStrength(liveStrength.current);
  });

  useEffect(() => () => effect.dispose(), [effect]);

  return <primitive ref={ref} object={effect} dispose={null} />;
});
