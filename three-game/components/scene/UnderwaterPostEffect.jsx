'use client';

import React, { forwardRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Uniform, Vector2, Vector3, Vector4 } from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { waterDev } from '../../world/waterDevRuntime';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { stirUnderwaterClarity } from '../../world/seaState';
import { skyState } from '../../world/celestial';
import { WATER_LEVEL } from '../../world/water';
import { useThreeGameStore } from '../../store';

const UNDERWATER_FRAGMENT = /* glsl */`
  uniform float amount;
  uniform float clarity;
  uniform float skyDepth;
  uniform vec3 shallowTint;
  uniform vec3 deepTint;
  uniform vec2 sunScreen;
  uniform float sunUp;
  uniform float screenAspect;
  uniform float camDepth;
  uniform vec4 shaftTune;   // (strength, reach, depthDim, depthRange)
  uniform vec4 moteTune;    // (density, size, drift, unused)
  uniform vec3 camDrift;

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

  // One layer of suspended particulate: a jittered grid of motes, each
  // wandering inside its own cell. The grid is offset by the camera so the
  // field parallaxes instead of sitting on the lens.
  float moteLayer(vec2 p, float t, float size, float density) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float h = hash21(cell);
    if (h > density) return 0.0;
    vec2 centre = vec2(0.5)
      + 0.34 * vec2(sin(t * (0.5 + h) + h * 24.0), cos(t * (0.37 + h * 0.6) + h * 11.0));
    float d = length(f - centre);
    return smoothstep(size, size * 0.15, d) * (0.45 + h * 0.55);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    if (amount <= 0.001) {
      outputColor = inputColor;
      return;
    }

    float range = max(1.0, clarity);
    float viewZ = -getViewZ(depth);
    // The sky is only reachable through Snell's window, so its water path is a
    // couple of metres, not the far plane. Feeding it the real depth would fog
    // the window flat and undo the one bright thing in an underwater frame.
    if (depth >= 0.9999) viewZ = skyDepth;
    float distanceFog = clamp(1.0 - exp(-viewZ / range), 0.0, 1.0);
    float nearFog = clamp(1.0 - exp(-viewZ / (range * 0.6)), 0.0, 1.0);

    vec3 tint = mix(shallowTint, deepTint, smoothstep(range * 0.25, range * 2.4, viewZ));
    vec3 absorbed = inputColor.rgb * vec3(0.70, 0.90, 1.02);
    absorbed.r *= mix(0.92, 0.42, distanceFog);
    absorbed.g *= mix(1.0, 0.72, distanceFog * 0.55);

    vec3 fogged = mix(absorbed, tint, distanceFog * 0.82);

    // Light falls off with how deep you are, not only with how far you look.
    // Without this the whole water column renders at one brightness, which is
    // why an underwater frame reads as a flat tint rather than as a volume.
    float depthFade = clamp(camDepth / max(0.5, shaftTune.w), 0.0, 1.0);
    fogged *= mix(1.0, mix(1.0, 0.28, shaftTune.z), depthFade);
    fogged = mix(fogged, fogged * deepTint * 2.0, depthFade * shaftTune.z * 0.35);

    // Sun shafts, anchored where the sun actually is on screen: they swing as
    // you turn instead of always hanging off the top of the frame.
    vec2 toSun = uv - sunScreen;
    toSun.x *= screenAspect;
    float sunDist = length(toSun);
    float ang = atan(toSun.y, toSun.x);
    float streak = noise(vec2(ang * 5.5, time * 0.05)) * 0.62
      + noise(vec2(ang * 16.0, time * 0.085)) * 0.38;
    streak = smoothstep(0.44, 0.92, streak);
    float reach = mix(0.3, 1.5, shaftTune.y);
    float shaftFall = exp(-sunDist / reach) * smoothstep(0.015, 0.22, sunDist);
    vec3 rayTint = vec3(0.58, 0.92, 1.0) * streak * shaftFall
      * shaftTune.x * sunUp * (1.0 - depthFade * 0.55) * (0.35 + nearFog * 0.65);
    fogged += rayTint;

    // Suspended particulate. Two layers at different scales so the field has
    // depth; both ride the camera so they parallax rather than smear.
    if (moteTune.x > 0.001) {
      vec2 base = vec2(uv.x * screenAspect, uv.y);
      float moteSize = mix(0.06, 0.3, moteTune.y);
      float near = moteLayer(base * 34.0 + camDrift.xz * 0.55 + vec2(0.0, camDrift.y * 0.6),
        time * moteTune.z, moteSize, moteTune.x * 0.09);
      float far = moteLayer(base * 74.0 - camDrift.xz * 0.25 + vec2(31.0, camDrift.y * 0.25),
        time * moteTune.z * 0.7, moteSize * 0.8, moteTune.x * 0.14);
      float lit = (near + far * 0.55) * smoothstep(0.04, 0.45, distanceFog);
      fogged += vec3(0.78, 0.92, 0.96) * lit * 0.16 * (1.0 - depthFade * 0.4);
    }

    fogged = mix(fogged, fogged * vec3(0.84, 0.98, 1.08), smoothstep(0.35, 1.0, amount) * 0.18);
    outputColor = vec4(mix(inputColor.rgb, fogged, amount), inputColor.a);
  }
`;

class UnderwaterDepthEffectImpl extends Effect {
  constructor({
    amount = 0,
    clarity = 12,
    skyDepth = 10,
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
        ['sunScreen', new Uniform(new Vector2(0.5, 0.9))],
        ['sunUp', new Uniform(0)],
        ['screenAspect', new Uniform(1.6)],
        ['camDepth', new Uniform(0)],
        ['shaftTune', new Uniform(new Vector4(0.5, 0.5, 0.55, 9))],
        ['moteTune', new Uniform(new Vector4(0.6, 0.35, 0.6, 0))],
        ['camDrift', new Uniform(new Vector3())],
      ]),
    });
  }

  setAmount(value) {
    this.uniforms.get('amount').value = value;
  }

  setClarity(value, skyDepth) {
    this.uniforms.get('clarity').value = value;
    this.uniforms.get('skyDepth').value = skyDepth;
  }

  setTints(shallowTint, deepTint) {
    this.uniforms.get('shallowTint').value.copy(shallowTint);
    this.uniforms.get('deepTint').value.copy(deepTint);
  }

  setView({ sunScreen, sunUp, aspect, camDepth, camDrift }) {
    this.uniforms.get('sunScreen').value.copy(sunScreen);
    this.uniforms.get('sunUp').value = sunUp;
    this.uniforms.get('screenAspect').value = aspect;
    this.uniforms.get('camDepth').value = camDepth;
    this.uniforms.get('camDrift').value.copy(camDrift);
  }

  setTuning({ shaft, shaftLength, depthDim, depthRange, motes, moteSize, moteDrift }) {
    this.uniforms.get('shaftTune').value.set(shaft, shaftLength, depthDim, depthRange);
    this.uniforms.get('moteTune').value.set(motes, moteSize, moteDrift, 0);
  }
}

// Motes and the sun-shaft anchor ride the camera's world position. Wrapping it
// keeps hash precision usable far from the origin; the wrap is a whole number
// of mote cells at every layer scale, so crossing it does not pop.
const DRIFT_WRAP = 40;

function wrapDrift(value) {
  return ((value % DRIFT_WRAP) + DRIFT_WRAP) % DRIFT_WRAP;
}

const _sun = new Vector3();
const _forward = new Vector3();
const _sunPoint = new Vector3();
const _sunScreen = new Vector2();
const _drift = new Vector3();

export const UnderwaterPostEffect = forwardRef(function UnderwaterPostEffect({
  amount = 0,
}, ref) {
  const effect = useMemo(() => new UnderwaterDepthEffectImpl(), []);

  useEffect(() => {
    effect.setAmount(amount);
  }, [amount, effect]);

  // Read per frame rather than as props: the ?waterdev panel drags these and
  // the composer does not re-render on a knob change.
  useFrame(({ camera }) => {
    effect.setClarity(
      stirUnderwaterClarity(waterDev.uwClarity, {
        rain: weatherEnv.rainIntensity,
        overcast: weatherEnv.overcast,
      }),
      waterDev.uwSkyDepth,
    );
    effect.setTuning({
      shaft: waterDev.uwShaft,
      shaftLength: waterDev.uwShaftLength,
      depthDim: waterDev.uwDepthDim,
      depthRange: waterDev.uwDepthRange,
      motes: waterDev.uwMotes,
      moteSize: waterDev.uwMoteSize,
      moteDrift: waterDev.uwMoteDrift,
    });

    const store = useThreeGameStore.getState();
    const sky = skyState(((store.timeOfDay % 24) + 24) % 24, store.day || 1);
    _sun.set(sky.sun[0], sky.sun[1], sky.sun[2]);
    // Where the sun sits on screen. project() mirrors points behind the camera
    // into the frame, so a sun at your back would otherwise cast shafts from
    // the wrong side; the forward test kills it instead.
    camera.getWorldDirection(_forward);
    const facing = _forward.dot(_sun);
    _sunPoint.copy(camera.position).addScaledVector(_sun, 900).project(camera);
    _sunScreen.set(_sunPoint.x * 0.5 + 0.5, _sunPoint.y * 0.5 + 0.5);
    _drift.set(
      wrapDrift(camera.position.x),
      wrapDrift(camera.position.y),
      wrapDrift(camera.position.z),
    );
    effect.setView({
      sunScreen: _sunScreen,
      sunUp: Math.max(0, Math.min(1, sky.daylight)) * Math.max(0, facing),
      aspect: camera.aspect || 1.6,
      camDepth: Math.max(0, WATER_LEVEL - camera.position.y),
      camDrift: _drift,
    });
  });

  useEffect(() => () => effect.dispose(), [effect]);

  return <primitive ref={ref} object={effect} dispose={null} />;
});
