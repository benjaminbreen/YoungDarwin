'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { weatherEnv } from '../../../world/weatherEnvRuntime';

// Overcast dome: a camera-following sky sphere whose fbm cloud field is
// planar-projected onto the view direction, so cover reaches all the way down
// to the horizon — the band players actually look at. Near the horizon the
// pattern compresses into solid murk (exactly what a real overcast does
// through distance haze), so no blue gap can survive a closed sky. Coverage
// (overcast) carves or closes the field; rain flattens it dark. One draw call.
const DOME_RADIUS = 164;

const _lightColor = new THREE.Color();
const _darkColor = new THREE.Color();
const _white = new THREE.Color('#ffffff');

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
      uRain: { value: 0 },
      uWind: { value: new THREE.Vector2(1, 0) },
      uLight: { value: new THREE.Color('#f3f6f7') },
      uDark: { value: new THREE.Color('#5d6a74') },
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
      uniform float uRain;
      uniform vec2 uWind;
      uniform vec3 uLight;
      uniform vec3 uDark;

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
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.04 + vec2(13.7, 7.3);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        if (uCover < 0.015) discard;
        vec3 dir = normalize(vWorldDir);
        // Cut just below the horizon line; terrain/sea owns everything lower.
        float aboveHorizon = smoothstep(-0.08, 0.02, dir.y);
        if (aboveHorizon < 0.01) discard;

        // Project the cloud field onto a virtual ceiling plane: overhead the
        // pattern is broad; toward the horizon it compresses naturally, like
        // a real cloud base receding into the distance.
        vec2 drift = uWind * uTime * 0.014;
        vec2 p = dir.xz / (max(dir.y, 0.0) + 0.18);
        p = p * 1.35 + drift;
        float shape = fbm(p);
        float detail = fbm(p * 3.1 - drift * 0.7);
        float field = shape + detail * 0.28;

        // Coverage moves the carve threshold: scattered holes at low cover,
        // an unbroken ceiling when storm-dark.
        float threshold = mix(0.74, 0.1, uCover);
        float deck = smoothstep(threshold, threshold + 0.3, field);

        // Horizon murk: where the projection degenerates, overcast reads as
        // a solid grey band of distance haze. This is what guarantees zero
        // blue sky at eye level on a closed day.
        float murk = (1.0 - smoothstep(0.04, 0.38, dir.y)) * smoothstep(0.18, 0.6, uCover);
        float coverage = max(deck, murk);

        float density = smoothstep(threshold, threshold + 0.55, field);
        float darkening = max(density * (0.55 + uRain * 0.45), murk * (0.3 + uRain * 0.3));
        vec3 color = mix(uLight, uDark, darkening);

        float alpha = coverage * (0.55 + uCover * 0.45) * aboveHorizon;
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
    mesh.visible = weatherEnv.overcast > 0.02;
    if (!mesh.visible) return;
    mesh.position.copy(camera.position);
    const u = material.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uCover.value = weatherEnv.overcast;
    u.uRain.value = weatherEnv.rainIntensity;
    u.uWind.value.set(
      weatherEnv.windX * weatherEnv.cloudDriftSpeed,
      weatherEnv.windZ * weatherEnv.cloudDriftSpeed
    );
    // Tint from the live fog color so the deck inherits day/night and
    // golden-hour for free; rain pulls the light stop toward storm slate.
    if (scene.fog) {
      _lightColor.copy(scene.fog.color).lerp(_white, 0.45);
      _darkColor.copy(scene.fog.color).multiplyScalar(0.42);
      u.uDark.value.copy(_darkColor);
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
