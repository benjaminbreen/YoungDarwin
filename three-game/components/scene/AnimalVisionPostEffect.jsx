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
  uniform float panoramicWarp;
  uniform float lateralField;
  uniform float overlapCue;
  uniform float avianSky;
  uniform float highlightSpectra;

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
    // Feed the wide camera through a restrained barrel warp. Straight lines
    // bow at the sides and more of the lateral scene remains perceptually
    // important than in an ordinary rectilinear human camera.
    vec4 perceivedInput = inputColor;
    if (panoramicWarp > 0.0001) {
      vec2 panoramaPoint = uv - vec2(0.5);
      float panoramaRadius = dot(
        panoramaPoint * vec2(1.22, 0.94),
        panoramaPoint * vec2(1.22, 0.94)
      );
      vec2 panoramaUv = vec2(0.5)
        + panoramaPoint * (1.0 - panoramicWarp * panoramaRadius);
      panoramaUv = clamp(panoramaUv, vec2(0.001), vec2(0.999));
      perceivedInput = texture2D(inputBuffer, panoramaUv);
    }
    vec3 source = max(perceivedInput.rgb, vec3(0.0));
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

    // Birds divide the visible spectrum with four single-cone classes and
    // colored oil droplets. RGB cannot reproduce that basis, but a clean
    // blue/cyan-versus-warm separation makes short-wave-rich air and water
    // feel distinct without recoloring the whole island or adding blur.
    float cyanAirSignal = smoothstep(
      0.012,
      0.24,
      max(source.b, source.g * 0.9) - source.r
    ) * smoothstep(0.08, 0.84, luma);
    accent += cyanAirSignal
      * vec3(-0.18, 0.16, 0.54)
      * avianSky;

    // Bright colored details get a small prism-like separation. This keeps
    // flowers, seeds, plumage, and water glints lively while neutral terrain
    // remains neutral, and costs no neighboring texture samples.
    float sourceMax = max(source.r, max(source.g, source.b));
    float sourceMin = min(source.r, min(source.g, source.b));
    float coloredHighlight = smoothstep(0.34, 0.86, luma)
      * smoothstep(0.045, 0.3, sourceMax - sourceMin);
    float highlightShortwave = smoothstep(
      -0.05,
      0.2,
      source.b - (source.r + source.g) * 0.5
    );
    vec3 highlightDirection = mix(
      vec3(0.62, 0.28, -0.34),
      vec3(0.3, -0.12, 0.78),
      highlightShortwave
    );
    accent += coloredHighlight * highlightDirection * highlightSpectra;

    // Diffuse high-value forage colors into the surrounding air. Sampling
    // three widening rings produces a soft aura rather than recoloring the
    // blade surface itself; the following bloom pass feathers it further.
    vec3 forageGlow = vec3(0.0);
    if (forageAura > 0.0001) {
      vec2 auraStep = texelSize;
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
    }
    accent += forageGlow * forageAura;

    // Two overlapping lateral fields make the geometry explicit. The broad
    // outer zones receive slightly different opponent-color weighting while
    // the smaller shared center stays clearer. Soft internal arcs suggest the
    // two fields without turning the view into hard-edged binocular goggles.
    vec2 leftFieldPoint = (uv - vec2(0.24, 0.5)) / vec2(0.48, 0.64);
    vec2 rightFieldPoint = (uv - vec2(0.76, 0.5)) / vec2(0.48, 0.64);
    float leftFieldRadius = length(leftFieldPoint);
    float rightFieldRadius = length(rightFieldPoint);
    float leftField = 1.0 - smoothstep(0.88, 1.05, leftFieldRadius);
    float rightField = 1.0 - smoothstep(0.88, 1.05, rightFieldRadius);
    float sharedField = min(leftField, rightField);
    float leftOnly = max(0.0, leftField - rightField);
    float rightOnly = max(0.0, rightField - leftField);
    accent += leftOnly * vec3(0.10, -0.025, 0.18) * lateralField;
    accent += rightOnly * vec3(0.18, 0.035, -0.08) * lateralField;

    float leftArc = smoothstep(0.76, 0.86, leftFieldRadius)
      * (1.0 - smoothstep(0.86, 0.96, leftFieldRadius));
    float rightArc = smoothstep(0.76, 0.86, rightFieldRadius)
      * (1.0 - smoothstep(0.86, 0.96, rightFieldRadius));
    accent += leftArc * vec3(0.08, 0.015, 0.14) * lateralField * 0.16;
    accent += rightArc * vec3(0.14, 0.045, -0.035) * lateralField * 0.16;

    // Retain scene structure while allowing an emphatically non-human color
    // relationship. The grade is intentionally more theatrical than literal.
    accent -= vec3(dot(accent, lumaWeights) * 0.74);
    vec3 graded = max(separated + accent, vec3(0.0));
    graded *= 1.0 + sharedField * overlapCue * 0.025;

    // The union of the two fields creates a curved panoramic silhouette at
    // the extreme corners. Keep it translucent so peripheral motion remains
    // visible rather than hiding useful gameplay information.
    float fieldCoverage = max(leftField, rightField);
    vec3 fieldEdgeColor = mix(
      vec3(0.055, 0.035, 0.075),
      vec3(0.16, 0.09, 0.14),
      uv.x
    );
    vec3 perceived = mix(source, graded, amount);
    vec3 fieldPerceived = mix(
      fieldEdgeColor,
      perceived,
      mix(0.42, 1.0, fieldCoverage)
    );
    perceived = mix(
      perceived,
      fieldPerceived,
      clamp(lateralField, 0.0, 1.0) * amount
    );
    outputColor = vec4(perceived, perceivedInput.a);
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
        ['panoramicWarp', new Uniform(0)],
        ['lateralField', new Uniform(0)],
        ['overlapCue', new Uniform(0)],
        ['avianSky', new Uniform(0)],
        ['highlightSpectra', new Uniform(0)],
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
    this.uniforms.get('panoramicWarp').value = Math.max(0, Number(profile?.panoramicWarp) || 0);
    this.uniforms.get('lateralField').value = Math.max(0, Number(profile?.lateralField) || 0) * visibleIntensity;
    this.uniforms.get('overlapCue').value = Math.max(0, Number(profile?.overlapCue) || 0);
    this.uniforms.get('avianSky').value = Math.max(0, Number(profile?.avianSky) || 0) * visibleIntensity;
    this.uniforms.get('highlightSpectra').value = Math.max(0, Number(profile?.highlightSpectra) || 0) * visibleIntensity;
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
    const restingPulse = Math.sin(clock.elapsedTime * 0.72)
      * Math.max(0, Number(profile?.stillnessBreathing) || 0)
      * stillnessRef.current;
    const intensity = 1
      + adaptationPulse * Math.max(0, Number(profile?.adaptationBoost) || 0)
      + stillnessRef.current * Math.max(0, Number(profile?.stillnessBoost) || 0)
      + restingPulse;
    effect.applyProfile(profile, suppression, intensity);
  });

  useEffect(() => () => effect.dispose(), [effect]);

  return <primitive ref={ref} object={effect} dispose={null} />;
});
