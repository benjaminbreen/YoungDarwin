'use client';

import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Uniform } from 'three';
import { BlendFunction, Effect } from 'postprocessing';
import { getRuntimePlayerMotion } from '../../store';

// An RGB render cannot contain ultraviolet reflectance, so this is deliberately
// an interpretive spectral grade rather than a claim to reconstruct an animal's
// private color experience. It preserves luminance while separating chromatic
// signals that a playable-mode profile asks the player to attend to.
const ANIMAL_VISION_FRAGMENT = /* glsl */`
  uniform float amount;
  uniform float chromaExpansion;
  uniform float warmSeparation;
  uniform float leafSeparation;
  uniform float shortwaveProxy;
  uniform float peripheralShift;
  uniform float forageAura;

  vec3 forageAuraSignal(const in vec2 auraUv) {
    vec3 auraSource = max(texture2D(inputBuffer, auraUv).rgb, vec3(0.0));
    float auraBrightness = max(auraSource.r, max(auraSource.g, auraSource.b));
    float magentaSignal = smoothstep(
      0.08,
      0.42,
      auraSource.r - auraSource.g * 0.72
    ) * smoothstep(0.10, 0.56, auraSource.b);
    float goldSignal = smoothstep(
      0.04,
      0.38,
      min(auraSource.r, auraSource.g * 1.08) - auraSource.b * 0.68
    );
    float brightSignal = smoothstep(0.34, 0.88, auraBrightness);
    return (
      magentaSignal * vec3(1.0, 0.12, 0.62)
      + goldSignal * vec3(1.0, 0.62, 0.10)
    ) * brightSignal;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (amount <= 0.0001) {
      outputColor = inputColor;
      return;
    }

    const vec3 lumaWeights = vec3(0.2126, 0.7152, 0.0722);
    vec3 source = max(inputColor.rgb, vec3(0.0));
    float luma = dot(source, lumaWeights);
    vec3 separated = source + (source - vec3(luma)) * chromaExpansion;

    float redSignal = smoothstep(
      0.025,
      0.34,
      source.r - max(source.g, source.b)
    );
    float yellowSignal = smoothstep(
      0.018,
      0.27,
      min(source.r, source.g) - source.b
    ) * smoothstep(0.08, 0.62, luma);
    float leafSignal = smoothstep(
      0.012,
      0.25,
      source.g - max(source.r * 0.78, source.b * 0.92)
    ) * smoothstep(0.035, 0.58, luma);

    // This violet response is only a visual proxy for extra short-wave
    // discrimination. Bright sky is gated out so it does not become a purple
    // wash, and no claim is made that RGB blue reconstructs ultraviolet.
    float shortwaveSignal = smoothstep(
      0.025,
      0.25,
      source.b - max(source.r * 0.92, source.g * 0.98)
    ) * smoothstep(0.035, 0.42, luma)
      * (1.0 - smoothstep(0.62, 0.94, luma));

    vec3 accent =
      redSignal * vec3(1.0, -0.13, -0.22) * warmSeparation
      + yellowSignal * vec3(0.72, 0.54, -0.42) * warmSeparation
      + leafSignal * vec3(-0.22, 0.75, -0.14) * leafSeparation
      + shortwaveSignal * vec3(0.38, -0.22, 0.82) * shortwaveProxy;

    // A colored peripheral lift helps the wide, low camera read as a different
    // sensory field without obscuring the focal center or any HUD.
    float radialDistance = length((uv - vec2(0.5)) * vec2(1.08, 0.92));
    float peripheralWeight = smoothstep(0.28, 0.72, radialDistance);
    accent += peripheralWeight
      * vec3(0.34, -0.12, 0.52)
      * peripheralShift
      * (0.38 + shortwaveSignal * 0.62);

    // Diffuse high-value forage colors into the surrounding air. Sampling
    // three widening rings produces a soft aura rather than recoloring the
    // blade surface itself; the following bloom pass feathers it further.
    vec2 auraStep = texelSize;
    vec3 forageGlow = vec3(0.0);
    forageGlow += forageAuraSignal(uv + vec2(auraStep.x * 5.0, 0.0)) * 0.20;
    forageGlow += forageAuraSignal(uv - vec2(auraStep.x * 5.0, 0.0)) * 0.20;
    forageGlow += forageAuraSignal(uv + vec2(0.0, auraStep.y * 5.0)) * 0.20;
    forageGlow += forageAuraSignal(uv - vec2(0.0, auraStep.y * 5.0)) * 0.20;
    forageGlow += forageAuraSignal(uv + auraStep * vec2(11.0, 11.0)) * 0.13;
    forageGlow += forageAuraSignal(uv + auraStep * vec2(-11.0, 11.0)) * 0.13;
    forageGlow += forageAuraSignal(uv + auraStep * vec2(11.0, -11.0)) * 0.13;
    forageGlow += forageAuraSignal(uv - auraStep * vec2(11.0, 11.0)) * 0.13;
    forageGlow += forageAuraSignal(uv + vec2(auraStep.x * 25.0, 0.0)) * 0.08;
    forageGlow += forageAuraSignal(uv - vec2(auraStep.x * 25.0, 0.0)) * 0.08;
    forageGlow += forageAuraSignal(uv + vec2(0.0, auraStep.y * 25.0)) * 0.08;
    forageGlow += forageAuraSignal(uv - vec2(0.0, auraStep.y * 25.0)) * 0.08;
    accent += forageGlow * forageAura;

    // Retain scene structure while allowing an emphatically non-human color
    // relationship. The grade is intentionally more theatrical than literal.
    accent -= vec3(dot(accent, lumaWeights) * 0.74);
    vec3 graded = max(separated + accent, vec3(0.0));
    outputColor = vec4(mix(source, graded, amount), inputColor.a);
  }
`;

class AnimalVisionEffectImpl extends Effect {
  constructor() {
    super('AnimalVisionEffect', ANIMAL_VISION_FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['amount', new Uniform(0)],
        ['chromaExpansion', new Uniform(0)],
        ['warmSeparation', new Uniform(0)],
        ['leafSeparation', new Uniform(0)],
        ['shortwaveProxy', new Uniform(0)],
        ['peripheralShift', new Uniform(0)],
        ['forageAura', new Uniform(0)],
      ]),
    });
  }

  applyProfile(profile, suppression = 0, intensity = 1) {
    const visibleAmount = Math.max(0, Math.min(1, Number(profile?.amount) || 0))
      * (1 - Math.max(0, Math.min(1, Number(suppression) || 0)));
    const visibleIntensity = Math.max(0, Math.min(2.75, Number(intensity) || 0));
    this.uniforms.get('amount').value = visibleAmount;
    this.uniforms.get('chromaExpansion').value = Math.max(0, Number(profile?.chromaExpansion) || 0) * visibleIntensity;
    this.uniforms.get('warmSeparation').value = Math.max(0, Number(profile?.warmSeparation) || 0) * visibleIntensity;
    this.uniforms.get('leafSeparation').value = Math.max(0, Number(profile?.leafSeparation) || 0) * visibleIntensity;
    this.uniforms.get('shortwaveProxy').value = Math.max(0, Number(profile?.shortwaveProxy) || 0) * visibleIntensity;
    this.uniforms.get('peripheralShift').value = Math.max(0, Number(profile?.peripheralShift) || 0) * visibleIntensity;
    this.uniforms.get('forageAura').value = Math.max(0, Number(profile?.forageAura) || 0) * visibleIntensity;
  }
}

export const AnimalVisionPostEffect = forwardRef(function AnimalVisionPostEffect({
  profile,
  suppression = 0,
}, ref) {
  const effect = useMemo(() => new AnimalVisionEffectImpl(), []);
  const elapsedRef = useRef(0);
  const stillnessRef = useRef(0);

  useEffect(() => {
    elapsedRef.current = 0;
    stillnessRef.current = 0;
    effect.applyProfile(profile, suppression);
  }, [effect, profile, suppression]);

  useFrame(({ clock }, delta) => {
    elapsedRef.current += delta;
    const motion = getRuntimePlayerMotion()?.intendedPlanarVelocity;
    const speed = Math.hypot(Number(motion?.x) || 0, Number(motion?.z) || 0);
    const stillnessTarget = 1 - MathUtils.smoothstep(speed, 0.04, 0.48);
    stillnessRef.current = MathUtils.damp(stillnessRef.current, stillnessTarget, 2.1, delta);

    const adaptationDuration = Math.max(0.1, Number(profile?.adaptationDuration) || 2.8);
    const adaptationT = MathUtils.clamp(elapsedRef.current / adaptationDuration, 0, 1);
    const adaptationEnvelope = (1 - adaptationT) ** 2;
    const adaptationPulse = adaptationEnvelope
      * (0.72 + Math.sin(adaptationT * Math.PI * 3) * 0.28);
    const restingPulse = Math.sin(clock.elapsedTime * 0.72) * 0.035 * stillnessRef.current;
    const intensity = 1
      + adaptationPulse * Math.max(0, Number(profile?.adaptationBoost) || 0)
      + stillnessRef.current * Math.max(0, Number(profile?.stillnessBoost) || 0)
      + restingPulse;
    effect.applyProfile(profile, suppression, intensity);
  });

  useEffect(() => () => effect.dispose(), [effect]);

  return <primitive ref={ref} object={effect} dispose={null} />;
});
