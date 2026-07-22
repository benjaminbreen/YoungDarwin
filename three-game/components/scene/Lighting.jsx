'use client';

import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { lightingDebugEnabled } from '../../runtimeDebug';
import { skyState } from '../../world/celestial';
import { computeOutdoorLightRig } from '../../world/outdoorLighting';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { terrainColor } from '../../world/terrain';
import { setPlayerEnvBounce } from '../assets/ModelAsset';

const CLEAR_FILL = new THREE.Color('#8fcfff');
const OVERCAST_FILL = new THREE.Color('#c9d5dc');
const GOLDEN_FILL = new THREE.Color('#ffe0af');
const WARM_FILL = new THREE.Color('#f7ead4');
const SAND_FILL = new THREE.Color('#ffd9ae');
const _fillColor = new THREE.Color();
const _warmColor = new THREE.Color();
const _forward = new THREE.Vector3();
const _terrainBounceHsl = { h: 0, s: 0, l: 0 };
const TERRAIN_BOUNCE_SAMPLE_SECONDS = 0.1;
const TERRAIN_BOUNCE_RESPONSE = 3.5;

export function Lighting() {
  const fillRef = useRef(null);
  const pointRef = useRef(null);
  const { camera } = useThree();
  const debugEnabled = useRef(lightingDebugEnabled());
  const terrainBounceColor = useRef(new THREE.Color(SAND_FILL));
  const terrainBounceTarget = useRef(new THREE.Color(SAND_FILL));
  const terrainBounceStrength = useRef(1);
  const terrainBounceStrengthTarget = useRef(1);
  const terrainSampleClock = useRef(TERRAIN_BOUNCE_SAMPLE_SECONDS);

  // Ambient, hemisphere and the sun-tracking key light are owned by
  // <SkyController>, which drives them from the time of day. This component
  // keeps only the local fill: a soft sky-bounce directional and the warm
  // point light near the player, using the same outdoor lighting model so
  // shadows remain readable without flattening the whole scene.
  useFrame((_, delta) => {
    const store = useThreeGameStore.getState();
    const sky = skyState(store.timeOfDay, store.day || 1);
    const underwaterAmount = THREE.MathUtils.clamp(store.underwaterCamera?.amount || 0, 0, 1);
    const pose = getRuntimePlayerPose()?.position || store.playerPose?.position || { x: 0, y: 0, z: 0 };
    terrainSampleClock.current += delta;
    if (terrainSampleClock.current >= TERRAIN_BOUNCE_SAMPLE_SECONDS) {
      const sampledGround = terrainColor(pose.x, pose.z, pose.y, store.currentZoneId);
      sampledGround.getHSL(_terrainBounceHsl);
      // Preserve the local ground hue while compressing saturation and
      // separating reflected-light brightness from raw albedo. Dark basalt
      // therefore casts a cooler, weaker lift without turning the player black;
      // pale sand stays warm and comparatively strong.
      terrainBounceTarget.current.setHSL(
        _terrainBounceHsl.h,
        THREE.MathUtils.clamp(_terrainBounceHsl.s * 0.78, 0.08, 0.42),
        THREE.MathUtils.clamp(0.67 + (_terrainBounceHsl.l - 0.4) * 0.2, 0.61, 0.76),
      );
      terrainBounceStrengthTarget.current = THREE.MathUtils.clamp(
        0.55 + _terrainBounceHsl.l * 0.9,
        0.62,
        1.05,
      );
      terrainSampleClock.current = 0;
    }
    const bounceBlend = 1 - Math.exp(-TERRAIN_BOUNCE_RESPONSE * Math.min(delta, 0.1));
    terrainBounceColor.current.lerp(terrainBounceTarget.current, bounceBlend);
    terrainBounceStrength.current = THREE.MathUtils.damp(
      terrainBounceStrength.current,
      terrainBounceStrengthTarget.current,
      TERRAIN_BOUNCE_RESPONSE,
      delta,
    );
    const lightRig = computeOutdoorLightRig({
      daylight: sky.daylight,
      golden: sky.golden,
      elevation: sky.elevation,
      overcast: weatherEnv.overcast,
      mist: weatherEnv.mistAmount,
      rain: weatherEnv.rainIntensity,
      lightDim: weatherEnv.lightDim,
      moonFraction: sky.moonlight,
      underwaterAmount,
    });

    if (fillRef.current) {
      const skyFillScale = THREE.MathUtils.clamp(
        0.76
          + lightRig.weatherSoftness * 0.28
          + sky.golden * 0.08
          - lightRig.hardSun * 0.08,
        0.68,
        1.05,
      );
      _fillColor
        .copy(CLEAR_FILL)
        .lerp(OVERCAST_FILL, THREE.MathUtils.clamp(weatherEnv.overcast * 0.82 + weatherEnv.mistAmount * 0.36, 0, 1))
        .lerp(GOLDEN_FILL, sky.golden * 0.34);
      fillRef.current.color.copy(_fillColor);
      fillRef.current.intensity = lightRig.fillIntensity * skyFillScale;
    }

    if (pointRef.current) {
      // Clear hard sun means *more* bounce onto the player (bright sunlit
      // ground all around), not less — so unlike the sky fill, hardSun does
      // not subtract here.
      const playerFillScale = THREE.MathUtils.clamp(
        0.28
          + lightRig.weatherSoftness * 0.54
          + sky.golden * 0.24
          + (1 - sky.daylight) * 0.44,
        0.22,
        0.92,
      );
      // Sunlit-ground bounce onto the player's shadow side. The rig's warm
      // fill is tuned in pre-physical-falloff units and vanishes after the
      // 1/d² attenuation (~9x at this offset), so the bounce is an explicit
      // additive term in candela-scale units. groundBounce (not hardSun) so
      // the bounce also ramps through mid-morning/afternoon sun.
      // Preserve a warm player lift on bright beaches without projecting a
      // visibly overexposed pool onto pale terrain around Darwin.
      const sandBounce = lightRig.groundBounce
        * 1.45
        * terrainBounceStrength.current
        * (1 - underwaterAmount);
      camera.getWorldDirection(_forward);
      _forward.y = 0;
      if (_forward.lengthSq() > 0.0001) _forward.normalize();
      else _forward.set(0, 0, -1);
      pointRef.current.position.set(
        pose.x - _forward.x * 2.6,
        pose.y + 2.25,
        pose.z - _forward.z * 2.6
      );
      _warmColor
        .copy(WARM_FILL)
        .lerp(terrainBounceColor.current, 0.5 + lightRig.hardSun * 0.24)
        .lerp(GOLDEN_FILL, sky.golden * 0.28);
      pointRef.current.color.copy(_warmColor);
      pointRef.current.intensity = lightRig.localWarmFillIntensity * playerFillScale + sandBounce;
      pointRef.current.distance = 6.5;
    }

    // The character IBL sheen/ambient tracks the same sand-bounce physics: more
    // clear sun on bright ground, more ambient light on shadow sides.
    setPlayerEnvBounce(
      lightRig.groundBounce * terrainBounceStrength.current * (1 - underwaterAmount),
    );

    if (debugEnabled.current && typeof window !== 'undefined') {
      window.__darwinLightingDebug = {
        ...(window.__darwinLightingDebug || {}),
        fillIntensity: Number((fillRef.current?.intensity || 0).toFixed(3)),
        localWarmFillIntensity: Number((pointRef.current?.intensity || 0).toFixed(3)),
        terrainBounceColor: `#${terrainBounceColor.current.getHexString()}`,
        terrainBounceStrength: Number(terrainBounceStrength.current.toFixed(3)),
      };
    }
  });

  return (
    <>
      <directionalLight
        ref={fillRef}
        position={[7, 6, -8]}
        intensity={0.62}
        color="#9ed7ff"
      />
      <pointLight ref={pointRef} position={[0, 2.6, -3.2]} intensity={0.34} distance={6.5} color="#fff3cf" />
    </>
  );
}
