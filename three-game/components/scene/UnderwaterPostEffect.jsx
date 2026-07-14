'use client';

import React, { forwardRef, useEffect, useMemo } from 'react';
import { Color, Uniform } from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';

const UNDERWATER_FRAGMENT = /* glsl */`
  uniform float amount;
  uniform float clarity;
  uniform float skyDepth;
  uniform vec3 shallowTint;
  uniform vec3 deepTint;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    if (amount <= 0.001) {
      outputColor = inputColor;
      return;
    }

    float viewZ = -getViewZ(depth);
    if (depth >= 0.9999) viewZ = skyDepth;
    float distanceFog = clamp(1.0 - exp(-viewZ / max(1.0, clarity)), 0.0, 1.0);
    float nearFog = clamp(1.0 - exp(-viewZ / 9.0), 0.0, 1.0);

    vec3 tint = mix(shallowTint, deepTint, smoothstep(6.0, 58.0, viewZ));
    vec3 absorbed = inputColor.rgb * vec3(0.70, 0.90, 1.02);
    absorbed.r *= mix(0.92, 0.42, distanceFog);
    absorbed.g *= mix(1.0, 0.72, distanceFog * 0.55);

    float shimmer = noise(uv * vec2(42.0, 26.0) + vec2(time * 0.055, -time * 0.043));
    float surfaceRay = smoothstep(0.62, 1.0, uv.y) * smoothstep(0.35, 1.0, nearFog);
    vec3 rayTint = vec3(0.58, 0.92, 1.0) * (0.028 + shimmer * 0.026) * surfaceRay;

    vec3 fogged = mix(absorbed, tint, distanceFog * 0.82);
    fogged += rayTint;
    fogged = mix(fogged, fogged * vec3(0.84, 0.98, 1.08), smoothstep(0.35, 1.0, amount) * 0.18);
    outputColor = vec4(mix(inputColor.rgb, fogged, amount), inputColor.a);
  }
`;

class UnderwaterDepthEffectImpl extends Effect {
  constructor({
    amount = 0,
    clarity = 34,
    skyDepth = 115,
    shallowTint = new Color('#53c8d6'),
    deepTint = new Color('#083c61'),
  } = {}) {
    super('UnderwaterDepthEffect', UNDERWATER_FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['amount', new Uniform(amount)],
        ['clarity', new Uniform(clarity)],
        ['skyDepth', new Uniform(skyDepth)],
        ['shallowTint', new Uniform(shallowTint)],
        ['deepTint', new Uniform(deepTint)],
      ]),
    });
  }

  setAmount(value) {
    this.uniforms.get('amount').value = value;
  }

  setClarity(value) {
    this.uniforms.get('clarity').value = value;
  }

  setTints(shallowTint, deepTint) {
    this.uniforms.get('shallowTint').value.copy(shallowTint);
    this.uniforms.get('deepTint').value.copy(deepTint);
  }
}

export const UnderwaterPostEffect = forwardRef(function UnderwaterPostEffect({
  amount = 0,
  clarity = 34,
}, ref) {
  const effect = useMemo(() => new UnderwaterDepthEffectImpl(), []);

  useEffect(() => {
    effect.setAmount(amount);
  }, [amount, effect]);

  useEffect(() => {
    effect.setClarity(clarity);
  }, [clarity, effect]);

  useEffect(() => () => effect.dispose(), [effect]);

  return <primitive ref={ref} object={effect} dispose={null} />;
});
