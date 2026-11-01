'use client';

import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Uniform } from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { useThreeGameStore } from '../../store';
import { exhaustionAmount } from '../../world/exhaustionLook';

// The world drains to a dim grey and only its edges keep any colour: a red
// rim on silhouettes, ridgelines and cloud margins, faintly pulsing like a
// heartbeat. The look came from a shadow-diff debug render that Ben liked.
//
// Rims come from screen-space derivatives rather than neighbouring texture
// reads, so the effect merges into the existing EffectPass (no convolution
// attribute, no extra pass) and costs a handful of ALU ops per pixel. On
// geometry they follow jumps in log depth — silhouettes, ridgelines, the
// horizon — because luminance edges also fire on every grain of the sand
// textures and speckled the whole ground red. Sky has no depth, so there
// luminance edges draw the cloud margins. At strength 0 the input passes
// through unchanged.
const EXHAUSTION_FRAGMENT = /* glsl */`
  uniform float strength;
  uniform float pulse;

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    float luma = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    float sky = step(0.9999, depth);
    float logDepth = log(max(sky > 0.5 ? 4000.0 : -getViewZ(depth), 0.05));
    // Derivatives must run in uniform control flow, so they are taken before
    // the early-out below. 2x2-quad derivatives: coarse, which suits a rim.
    float depthEdge = length(vec2(dFdx(logDepth), dFdy(logDepth)));
    float lumaEdge = length(vec2(dFdx(luma), dFdy(luma)));
    if (strength <= 0.0001) {
      outputColor = inputColor;
      return;
    }
    float rim = max(
      smoothstep(0.06, 0.22, depthEdge),
      sky * smoothstep(0.012, 0.05, lumaEdge)
    );
    vec3 grey = vec3(luma * 0.52);
    float beat = 1.0 - pulse * 0.22 + pulse * 0.22 * (0.5 + 0.5 * sin(time * 2.6));
    vec3 drained = mix(grey, vec3(1.0, 0.16, 0.13) * max(luma * 1.6, 0.5), rim * 0.85 * beat);
    outputColor = vec4(mix(inputColor.rgb, drained, strength), inputColor.a);
  }
`;

class ExhaustionEffectImpl extends Effect {
  constructor() {
    super('ExhaustionEffect', EXHAUSTION_FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['strength', new Uniform(0)],
        ['pulse', new Uniform(0)],
      ]),
    });
  }

  setStrength(value, pulse) {
    this.uniforms.get('strength').value = value;
    this.uniforms.get('pulse').value = pulse;
  }
}

export const ExhaustionPostEffect = forwardRef(function ExhaustionPostEffect({ enabled = true }, ref) {
  const effect = useMemo(() => new ExhaustionEffectImpl(), []);
  const live = useRef(0);

  useFrame((_, delta) => {
    const { health, fatigue } = useThreeGameStore.getState();
    const target = enabled ? exhaustionAmount(health, fatigue) : 0;
    // Slow in both directions: it should creep over the player, and recovery
    // should read as the world coming back rather than a switch flipping.
    live.current = MathUtils.damp(live.current, target, 0.9, delta);
    if (live.current < 0.0005 && target === 0) live.current = 0;
    // The heartbeat belongs to injury, not tiredness.
    const pulse = MathUtils.clamp(exhaustionAmount(health, 0) / Math.max(target, 0.0001), 0, 1);
    effect.setStrength(live.current, target > 0 ? pulse : 0);
  });

  useEffect(() => () => effect.dispose(), [effect]);

  return <primitive ref={ref} object={effect} dispose={null} />;
});
