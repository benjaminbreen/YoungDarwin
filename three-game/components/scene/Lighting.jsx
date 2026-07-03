'use client';

import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { skyState } from '../../world/celestial';
import { computeOutdoorLightRig } from '../../world/outdoorLighting';
import { weatherEnv } from '../../world/weatherEnvRuntime';

const CLEAR_FILL = new THREE.Color('#8fcfff');
const OVERCAST_FILL = new THREE.Color('#c9d5dc');
const GOLDEN_FILL = new THREE.Color('#ffe0af');
const WARM_FILL = new THREE.Color('#f7ead4');
const SAND_FILL = new THREE.Color('#ffd9ae');
const _fillColor = new THREE.Color();
const _warmColor = new THREE.Color();
const _forward = new THREE.Vector3();

export function Lighting() {
  const fillRef = useRef(null);
  const pointRef = useRef(null);
  const { camera } = useThree();

  // Ambient, hemisphere and the sun-tracking key light are owned by
  // <SkyController>, which drives them from the time of day. This component
  // keeps only the local fill: a soft sky-bounce directional and the warm
  // point light near the player, using the same outdoor lighting model so
  // shadows remain readable without flattening the whole scene.
  useFrame(() => {
    const store = useThreeGameStore.getState();
    const sky = skyState(store.timeOfDay, store.day || 1);
    const underwaterAmount = THREE.MathUtils.clamp(store.underwaterCamera?.amount || 0, 0, 1);
    const lightRig = computeOutdoorLightRig({
      daylight: sky.daylight,
      golden: sky.golden,
      elevation: sky.elevation,
      overcast: weatherEnv.overcast,
      mist: weatherEnv.mistAmount,
      rain: weatherEnv.rainIntensity,
      lightDim: weatherEnv.lightDim,
      moonFraction: sky.moon_phase.fraction,
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
      // additive term in candela-scale units.
      const sandBounce = lightRig.hardSun * 1.6 * (1 - underwaterAmount);
      const pose = store.playerPose?.position || { x: 0, y: 0, z: 0 };
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
        .lerp(SAND_FILL, lightRig.hardSun * 0.55)
        .lerp(GOLDEN_FILL, sky.golden * 0.28);
      pointRef.current.color.copy(_warmColor);
      pointRef.current.intensity = lightRig.localWarmFillIntensity * playerFillScale + sandBounce;
      pointRef.current.distance = 6.5;
    }

    if (typeof window !== 'undefined') {
      window.__darwinLightingDebug = {
        ...(window.__darwinLightingDebug || {}),
        fillIntensity: Number((fillRef.current?.intensity || 0).toFixed(3)),
        localWarmFillIntensity: Number((pointRef.current?.intensity || 0).toFixed(3)),
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
