'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { weatherEnv } from '../../../world/weatherEnvRuntime';
import { skyState } from '../../../world/celestial';
import { useThreeGameStore } from '../../../store';

// The whole sky's cloud range in one camera-following dome (one draw call).
// The fbm field is planar-projected onto the view direction — broad overhead,
// compressing naturally toward the horizon — and read by two regimes:
//
//  - fair-weather cumulus (weatherEnv.cumulus): detached trade-wind puffs
//    carved by a high threshold, domain-warped into cauliflower billows and
//    lit directionally — a cheap gradient probe toward the sun brightens the
//    sun-facing rims (silver lining) and shades the cores/undersides. A
//    low-frequency macro-mass field (weatherEnv.cumulusClump) clusters the
//    puffs into a few big fused clouds with clean blue between, and
//    weatherEnv.cumulusScale sizes individual puffs per weather state.
//  - the overcast deck (weatherEnv.overcast): coverage closes the field into
//    a ceiling, and near the horizon the projection degenerates into solid
//    grey murk, guaranteeing no blue gap survives a closed sky. Rain flattens
//    it dark. This regime's look is unchanged from the original deck.
const DOME_RADIUS = 164;

const _lightColor = new THREE.Color();
const _shadeColor = new THREE.Color();
const _darkColor = new THREE.Color();
const _sunTint = new THREE.Color();
const _white = new THREE.Color('#ffffff');
const _cumulusShade = new THREE.Color('#8ba0b5'); // cool blue-grey underside
const _nightCloudLight = new THREE.Color('#183052');
const _nightCloudShade = new THREE.Color('#0a1830');
const _nightCloudDark = new THREE.Color('#030918');
const _sunWarm = new THREE.Color('#fff2d9');
const _sunGolden = new THREE.Color('#ff9b55');
const _dramaDawnWarm = new THREE.Color('#ffb14f');
const _dramaDuskWarm = new THREE.Color('#ff7d47');
const _dramaDawnRose = new THREE.Color('#ff91b3');
const _dramaDuskRose = new THREE.Color('#ee6385');
const _dramaWarm = new THREE.Color();
const _dramaRose = new THREE.Color();

export function CloudDeck() {
  const { camera, scene } = useThree();
  const meshRef = useRef(null);

  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uCover: { value: 0 },
      uCumulus: { value: 0 },
      uClump: { value: 0.5 },
      uPuffScale: { value: 0.9 },
      uRain: { value: 0 },
      uDaylight: { value: 1 },
      uWind: { value: new THREE.Vector2(1, 0) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uLight: { value: new THREE.Color('#f3f6f7') },
      uShade: { value: new THREE.Color('#93a5b5') },
      uDark: { value: new THREE.Color('#5d6a74') },
      uSunTint: { value: new THREE.Color('#fff2d9') },
      uSolarDrama: { value: 0 },
      uDramaWarm: { value: new THREE.Color('#ff9b55') },
      uDramaRose: { value: new THREE.Color('#ef86a5') },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDir = worldPosition.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vWorldDir;
      uniform float uTime;
      uniform float uCover;
      uniform float uCumulus;
      uniform float uClump;
      uniform float uPuffScale;
      uniform float uRain;
      uniform float uDaylight;
      uniform vec2 uWind;
      uniform vec3 uSunDir;
      uniform vec3 uLight;
      uniform vec3 uShade;
      uniform vec3 uDark;
      uniform vec3 uSunTint;
      uniform float uSolarDrama;
      uniform vec3 uDramaWarm;
      uniform vec3 uDramaRose;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm5(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.04 + vec2(13.7, 7.3);
          a *= 0.5;
        }
        return v;
      }
      // Cheap variant for the warp and lighting probes, where fine octaves
      // would be invisible anyway.
      float fbm3(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
          v += a * noise(p);
          p = p * 2.04 + vec2(13.7, 7.3);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        if (max(uCover, uCumulus) < 0.015) discard;
        vec3 dir = normalize(vWorldDir);
        // Cut just below the horizon line; terrain/sea owns everything lower.
        float aboveHorizon = smoothstep(-0.08, 0.02, dir.y);
        if (aboveHorizon < 0.01) discard;

        // Project the cloud field onto a virtual ceiling plane: overhead the
        // pattern is broad; toward the horizon it compresses naturally, like
        // a real cloud base receding into the distance.
        vec2 drift = uWind * uTime * 0.014;
        vec2 p = dir.xz / (max(dir.y, 0.0) + 0.18);
        // Per-state puff sizing (fair weather only): the closed deck keeps
        // the original frequency, so its look never changes with uPuffScale.
        float puffFreq = mix(uPuffScale, 1.0, smoothstep(0.15, 0.45, uCover));
        p = p * 1.35 * puffFreq + drift;

        // Domain warp: billowing cauliflower lobes instead of uniform noise.
        vec2 warp = vec2(fbm3(p * 0.62 + 19.1), fbm3(p * 0.62 - 7.7)) - 0.5;
        vec2 q = p + warp * 1.15;

        float shape = fbm5(q);
        float detail = fbm5(q * 3.1 - drift * 0.7);
        float field = shape + detail * 0.28;

        // Macro mass: a very low-frequency field clusters the puffs. Where
        // mass runs high the carve threshold drops and neighbouring puffs
        // fuse into one big cloud; in the gaps it rises and the sky opens to
        // clean blue. uClump = 0 recovers the even confetti field.
        float mass = fbm3(p * 0.14 + vec2(31.7, -11.3));
        float massBias = (mass - 0.44) * 2.2 * uClump;

        // --- Fair-weather cumulus: high threshold keeps clouds detached,
        // the short ramp gives crisp sunlit edges eroded ragged by detail.
        float cumulusThreshold = clamp(mix(0.86, 0.52, uCumulus) - massBias * 0.3, 0.2, 0.95);
        float puff = smoothstep(cumulusThreshold, cumulusThreshold + 0.16, field);
        float interior = smoothstep(cumulusThreshold + 0.06, cumulusThreshold + 0.5, field);

        // --- Overcast deck: coverage moves the carve threshold; horizon murk
        // reads as solid distance haze so a closed sky has zero blue gap.
        float deckThreshold = mix(0.74, 0.1, uCover);
        float deck = smoothstep(deckThreshold, deckThreshold + 0.3, field) * smoothstep(0.04, 0.3, uCover);
        float murk = (1.0 - smoothstep(0.04, 0.38, dir.y)) * smoothstep(0.18, 0.6, uCover);

        float coverage = max(max(puff, deck), murk);
        if (coverage < 0.01) discard;

        // --- Directional sun light: probe the field a step toward the sun in
        // plane space. Where it thins sunward, light pours through the rim;
        // where it thickens, we're looking at shaded core and underside. Low
        // sun exaggerates the lateral gradient (long dawn/dusk modelling).
        vec2 sunPlane = normalize(uSunDir.xz + vec2(0.0001, 0.0));
        float lateral = 1.0 - clamp(uSunDir.y, 0.0, 1.0);
        vec2 lightStep = sunPlane * mix(0.2, 0.5, lateral);
        float fieldHere = fbm3(q);
        float sunFacing = clamp((fieldHere - fbm3(q + lightStep)) * 3.4 + 0.42, 0.0, 1.0);

        // Volume modelling belongs to the puff regime; it fades out as the
        // deck closes so the original overcast grading is untouched.
        float fairWeather = 1.0 - smoothstep(0.3, 0.55, uCover);
        // Stronger interior falloff models volume: cores and bellies stay in
        // shadow so only the sun-facing tops carry the full light stop.
        float lit = clamp(0.16 + sunFacing * 0.92 * (1.0 - interior * mix(0.55, 0.72, fairWeather)), 0.0, 1.0);
        vec3 color = mix(uShade, uLight, lit);
        // Flat cumulus bases: probe a step toward the zenith in plane space —
        // where the mass continues upward we are looking at the belly of a
        // taller cloud, so pull it down toward shade.
        vec2 zenithStep = -normalize(dir.xz + vec2(0.0001, 0.0)) * 0.3;
        float belly = clamp((fbm3(q + zenithStep) - fieldHere) * 2.6, 0.0, 1.0) * interior;
        color = mix(color, uShade * 0.8, belly * 0.45 * uDaylight * fairWeather);
        // Overhead we mostly see undersides; deepen interiors looking up.
        float overhead = smoothstep(0.35, 0.8, dir.y);
        color = mix(color, uShade, overhead * interior * 0.28 * fairWeather);
        // Silver lining on the lit rim only; fades with daylight. The rim is
        // allowed past 1.0 on purpose — it is the one part of a cloud that
        // should catch bloom.
        float rim = pow(sunFacing, 3.0) * (1.0 - interior) * uDaylight;
        color += uSunTint * rim * 0.32;
        // Forward scatter: thin cloud near the sun disc glows when backlit.
        float towardSun = pow(max(dot(dir, uSunDir), 0.0), 6.0);
        color += uSunTint * towardSun * (1.0 - interior) * 0.18 * uDaylight;
        // Distance desaturation: the horizon band sinks into the sea haze.
        float hazeBand = 1.0 - smoothstep(0.02, 0.3, dir.y);
        color = mix(color, uLight, hazeBand * 0.45 * uDaylight);
        // Rare dramatic clear dawns/dusks: low cloud rims go coral and
        // thicker bellies pick up rose, but only while the sun is low.
        float lowSkyDrama = uSolarDrama * (1.0 - smoothstep(0.28, 0.82, dir.y));
        float warmRim = lowSkyDrama * (rim * 0.95 + towardSun * (1.0 - interior) * 0.26);
        float roseBody = lowSkyDrama * interior * (0.18 + hazeBand * 0.2);
        color = mix(color, uDramaWarm, warmRim * 0.46);
        color = mix(color, uDramaRose, roseBody * 0.22);

        // Overcast/storm darkening takes over as the deck closes (original
        // deck grading, gated on cover so fair days never see it).
        float overDensity = smoothstep(deckThreshold, deckThreshold + 0.55, field);
        float darkening = max(overDensity * (0.55 + uRain * 0.45), murk * (0.3 + uRain * 0.3))
          * smoothstep(0.1, 0.5, uCover);
        color = mix(color, uDark, clamp(darkening, 0.0, 1.0));

        // Interiors of big fused masses read denser than their lacy edges.
        float alpha = max(
          puff * min(0.66 + uCumulus * 0.26 + interior * 0.12, 1.0),
          max(deck, murk) * (0.55 + uCover * 0.45)
        ) * aboveHorizon;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  useLayoutEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.visible = weatherEnv.overcast > 0.02 || weatherEnv.cumulus > 0.02;
    if (!mesh.visible) return;
    mesh.position.copy(camera.position);
    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const solarDrama = Math.max(celestial.dawnDrama || 0, celestial.duskDrama || 0)
      * (1 - weatherEnv.overcast * 0.86)
      * (1 - weatherEnv.mistAmount * 0.45)
      * (1 - weatherEnv.rainIntensity * 0.62);
    const duskSide = (celestial.duskDrama || 0) > (celestial.dawnDrama || 0) ? 1 : 0;
    const u = material.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uCover.value = weatherEnv.overcast;
    u.uCumulus.value = weatherEnv.cumulus;
    u.uClump.value = weatherEnv.cumulusClump;
    u.uPuffScale.value = weatherEnv.cumulusScale;
    u.uRain.value = weatherEnv.rainIntensity;
    u.uDaylight.value = celestial.daylight;
    u.uSunDir.value.set(celestial.sun[0], celestial.sun[1], celestial.sun[2]);
    u.uWind.value.set(
      weatherEnv.windX * weatherEnv.cloudDriftSpeed,
      weatherEnv.windZ * weatherEnv.cloudDriftSpeed
    );
    // Tint from the live fog color so the clouds inherit day/night and
    // golden-hour for free; rain pulls the light stop toward storm slate.
    if (scene.fog) {
      const night = celestial.night;
      // White cloud tops require daylight, but hold the light stop shy of
      // pure white: contrast against the shaded bellies does the drama, and
      // only the additive sun rim is allowed to cross into bloom.
      _lightColor
        .copy(scene.fog.color)
        .lerp(_white, (0.3 + celestial.daylight * 0.28) * (1 - night))
        .lerp(_nightCloudLight, night * 0.82);
      _shadeColor.copy(scene.fog.color).lerp(_cumulusShade, 0.55)
        .multiplyScalar(0.55 + celestial.daylight * 0.25)
        .lerp(_nightCloudShade, night);
      _darkColor.copy(scene.fog.color).multiplyScalar(0.42)
        .lerp(_nightCloudDark, night);
      _sunTint.copy(_sunWarm).lerp(_sunGolden, celestial.golden)
        .multiplyScalar(celestial.daylight);
      _dramaWarm.copy(_dramaDawnWarm).lerp(_dramaDuskWarm, duskSide);
      _dramaRose.copy(_dramaDawnRose).lerp(_dramaDuskRose, duskSide);
      u.uDark.value.copy(_darkColor);
      u.uShade.value.copy(_shadeColor);
      u.uSunTint.value.copy(_sunTint);
      u.uSolarDrama.value = solarDrama;
      u.uDramaWarm.value.copy(_dramaWarm);
      u.uDramaRose.value.copy(_dramaRose);
      u.uLight.value.copy(_lightColor).lerp(_darkColor, weatherEnv.rainIntensity * 0.3);
    }
  });

  return (
    <mesh ref={meshRef} renderOrder={-7} frustumCulled={false}>
      <sphereGeometry args={[DOME_RADIUS, 48, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
