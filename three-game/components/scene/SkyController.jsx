'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { skyState, shortestHourDelta, smoothstep } from '../../world/celestial';

// Apparent distance of the celestial bodies. Kept well inside the camera far
// plane (180) since the whole rig follows the camera, so it never clips.
const SKY_DISTANCE = 170;
const BODY_DISTANCE = 150;
const STAR_RADIUS = 162;
const STAR_COUNT = 1400;

// Colour stops we lerp between, authored once. Cool, dim night → neutral-warm
// day, with a golden-hour push layered on top at the horizon.
const C = {
  keyNight: new THREE.Color('#41618f'),
  keyDay: new THREE.Color('#fff4e0'),
  keyGolden: new THREE.Color('#ff9b4d'),
  hemiSkyNight: new THREE.Color('#0b1a33'),
  hemiSkyDay: new THREE.Color('#bfe3ff'),
  hemiGroundNight: new THREE.Color('#0a0d12'),
  hemiGroundDay: new THREE.Color('#9a7a52'),
  ambNight: new THREE.Color('#2a3a5c'),
  ambDay: new THREE.Color('#dfe9ff'),
  fogNight: new THREE.Color('#0c1830'),
  fogDay: new THREE.Color('#7fc4f2'),
  fogGolden: new THREE.Color('#d9a878'),
};

// Reusable scratch objects — no per-frame allocation in the render loop.
const _sun = new THREE.Vector3();
const _moon = new THREE.Vector3();
const _color = new THREE.Color();

function radialTexture(stops, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(stop => gradient.addColorStop(stop[0], stop[1]));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function crateredMoonTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const disc = ctx.createRadialGradient(size * 0.42, size * 0.34, 0, size / 2, size / 2, size * 0.36);
  disc.addColorStop(0, 'rgba(247, 250, 255, 1)');
  disc.addColorStop(0.58, 'rgba(218, 228, 242, 0.98)');
  disc.addColorStop(0.86, 'rgba(170, 186, 207, 0.85)');
  disc.addColorStop(1, 'rgba(170, 186, 207, 0)');
  ctx.fillStyle = disc;
  ctx.fillRect(0, 0, size, size);

  const craters = [
    [0.38, 0.42, 0.055, 0.17],
    [0.58, 0.34, 0.04, 0.13],
    [0.53, 0.58, 0.07, 0.12],
    [0.34, 0.61, 0.032, 0.11],
    [0.65, 0.49, 0.026, 0.10],
    [0.45, 0.27, 0.024, 0.09],
  ];
  craters.forEach(([x, y, r, a]) => {
    const g = ctx.createRadialGradient(size * x, size * y, 0, size * x, size * y, size * r);
    g.addColorStop(0, `rgba(78, 95, 122, ${a})`);
    g.addColorStop(0.55, `rgba(108, 124, 150, ${a * 0.45})`);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size * x, size * y, size * r, 0, Math.PI * 2);
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function StarField({ nightRef }) {
  const pointsRef = useRef(null);
  const { gl } = useThree();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const phases = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i += 1) {
      // Even distribution over the upper hemisphere-biased sphere.
      const u = (i * 2.399963229728653) % (Math.PI * 2); // golden-angle spiral
      const cosT = 1 - 2 * ((i + 0.5) / STAR_COUNT);
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      positions[i * 3] = STAR_RADIUS * sinT * Math.cos(u);
      positions[i * 3 + 1] = STAR_RADIUS * Math.abs(cosT) * 0.85 + 8; // bias upward
      positions[i * 3 + 2] = STAR_RADIUS * sinT * Math.sin(u);
      sizes[i] = 0.7 + ((i * 13) % 7) / 7 * 2.0;
      phases[i] = ((i * 7) % 101) / 101;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    return geo;
  }, []);

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTwinkle;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vTwinkle = 0.55 + 0.45 * sin(uTime * 1.6 + aPhase * 6.2831853);
        gl_PointSize = aSize * uPixelRatio * (260.0 / max(1.0, -mv.z));
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying float vTwinkle;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        if (d > 0.25) discard;
        float a = smoothstep(0.25, 0.0, d) * vTwinkle * uOpacity;
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.9), a);
      }
    `,
  }), []);

  useLayoutEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    const night = nightRef.current;
    material.uniforms.uOpacity.value = night * 0.95;
    if (pointsRef.current) pointsRef.current.visible = night > 0.01;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={-6} />;
}

function TropicalBlueSkyDome({ nightRef }) {
  const meshRef = useRef(null);

  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uNight: { value: 0 },
      uOvercast: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vWorldDir;
      uniform float uNight;
      uniform float uOvercast;
      void main() {
        float up = clamp(vWorldDir.y * 0.5 + 0.5, 0.0, 1.0);
        float dome = smoothstep(0.48, 0.88, up);
        float horizon = smoothstep(0.30, 0.55, up);
        vec3 horizonBlue = vec3(0.34, 0.78, 1.0);
        vec3 zenithBlue = vec3(0.015, 0.30, 0.86);
        vec3 color = mix(horizonBlue, zenithBlue, dome);
        float alpha = mix(0.22, 0.58, dome) * horizon;
        alpha *= (1.0 - uNight) * (1.0 - uOvercast * 0.72);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  useLayoutEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    material.uniforms.uNight.value = nightRef.current;
    const store = useThreeGameStore.getState();
    material.uniforms.uOvercast.value = store.weather === 'cloudy' || store.weather === 'misty' ? 1 : 0;
    if (meshRef.current) meshRef.current.visible = nightRef.current < 0.92;
  });

  return (
    <mesh ref={meshRef} renderOrder={-9} frustumCulled={false}>
      <sphereGeometry args={[SKY_DISTANCE - 2, 48, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function RealisticCloudLayer({ nightRef }) {
  const groupRef = useRef(null);
  const { camera } = useThree();

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uOpacity: { value: 0.72 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      uniform float uNight;
      uniform float uOpacity;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.03 + vec2(17.2, 9.4);
          a *= 0.52;
        }
        return v;
      }

      void main() {
        vec2 uv = vUv;
        vec2 centered = uv - 0.5;
        centered.x *= 1.75;
        float body = 1.0 - smoothstep(0.18, 0.58, length(centered));
        float wisps = fbm(uv * vec2(5.0, 2.2) + vec2(uTime * 0.012, 0.0));
        float detail = fbm(uv * vec2(13.0, 5.0) - vec2(uTime * 0.018, 0.0));
        float cloud = body * smoothstep(0.38, 0.78, wisps + detail * 0.45);
        cloud *= smoothstep(0.02, 0.18, uv.y) * smoothstep(0.02, 0.16, 1.0 - uv.y);
        vec3 base = mix(vec3(0.72, 0.79, 0.82), vec3(1.0), smoothstep(0.35, 0.95, uv.y + detail * 0.35));
        vec3 shade = mix(vec3(0.58, 0.65, 0.66), base, smoothstep(0.25, 0.85, wisps));
        float alpha = cloud * uOpacity * (1.0 - uNight * 0.86);
        gl_FragColor = vec4(shade, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  useLayoutEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uNight.value = nightRef.current;
    if (groupRef.current) {
      groupRef.current.children.forEach(child => child.quaternion.copy(camera.quaternion));
    }
  });

  const clouds = [
    [-78, 38, -118, 38, 12, -0.08],
    [-30, 45, -134, 54, 15, 0.05],
    [36, 42, -126, 46, 13, -0.03],
    [88, 35, -110, 34, 10, 0.08],
    [-96, 31, -76, 30, 9, 0.02],
  ];

  return (
    <group ref={groupRef} renderOrder={-8}>
      {clouds.map((c, i) => (
        <mesh key={i} position={[c[0], c[1], c[2]]} rotation={[0, 0, c[5]]} frustumCulled={false}>
          <planeGeometry args={[c[3], c[4], 1, 1]} />
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

export function SkyController({ stars = true, tuning = null }) {
  const { scene, gl, camera } = useThree();
  // Defaults tuned for NeutralToneMapping. Drei/Three Sky is HDR, so it still
  // needs tone mapping, but ACES pushes bright tropical blue toward white.
  const T = tuning || {};
  const rayleighBase = T.rayleigh ?? 2.6;   // clean tropical blue without blowing out the dome
  const turbidityBase = T.turbidity ?? 1.15; // low haze; Post Office Bay should read clear, not milky
  const expBase = T.expBase ?? 0.42;
  const expGain = T.expGain ?? 0.10;
  const groupRef = useRef(null);
  const skyRef = useRef(null);
  const keyLightRef = useRef(null);
  const ambientRef = useRef(null);
  const hemiRef = useRef(null);
  const moonRef = useRef(null);
  const moonGlowRef = useRef(null);
  const moonDiscTexture = useMemo(() => crateredMoonTexture(), []);
  const moonGlowTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(214, 227, 255, 0.25)'],
    [0.35, 'rgba(182, 202, 240, 0.10)'],
    [1.0, 'rgba(182, 202, 240, 0)'],
  ]), []);

  // Smoothed game hour so the sky visibly drifts between discrete store updates.
  const hourRef = useRef(null);
  const nightRef = useRef(0); // shared with StarField without React re-renders

  const weather = useThreeGameStore(state => state.weather);
  const overcast = weather === 'cloudy' || weather === 'misty' ? 1 : 0;

  useLayoutEffect(() => () => {
    moonDiscTexture.dispose();
    moonGlowTexture.dispose();
  }, [moonDiscTexture, moonGlowTexture]);

  // Keep the drei Sky sized inside the far plane and let terrain depth-occlude it.
  useLayoutEffect(() => {
    if (skyRef.current) {
      const mat = skyRef.current.material;
      mat.depthWrite = false;
      mat.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <tonemapping_fragment>',
          /* glsl */`
            float skyBlueSignal = gl_FragColor.b - max(gl_FragColor.r, gl_FragColor.g) * 0.72;
            float skyBlueMask = smoothstep(0.015, 0.24, skyBlueSignal);
            float skyLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 saturatedSky = mix(vec3(skyLuma), gl_FragColor.rgb, 1.45);
            vec3 deeperSky = vec3(gl_FragColor.r * 0.82, gl_FragColor.g * 0.95, gl_FragColor.b * 1.16);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, saturatedSky, skyBlueMask * 0.55);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, deeperSky, skyBlueMask * 0.45);
            #include <tonemapping_fragment>
          `
        );
      };
      mat.customProgramCacheKey = () => 'floreana-sky-blue-grade-v1';
      mat.needsUpdate = true;
      skyRef.current.renderOrder = -10;
    }
  }, []);

  useFrame((_, delta) => {
    const store = useThreeGameStore.getState();
    const targetHour = ((store.timeOfDay % 24) + 24) % 24;
    if (hourRef.current == null) hourRef.current = targetHour;
    // Ease toward the target along the short arc of the 24h clock.
    const step = Math.min(1, delta * 0.8);
    hourRef.current += shortestHourDelta(hourRef.current, targetHour) * step;
    hourRef.current = ((hourRef.current % 24) + 24) % 24;

    const s = skyState(hourRef.current, store.day || 1);
    nightRef.current = s.night;
    const { daylight, golden, night } = s;

    _sun.set(s.sun[0], s.sun[1], s.sun[2]);
    _moon.set(s.moon[0], s.moon[1], s.moon[2]);

    // Rig follows the camera so bodies feel infinitely far and never clip.
    if (groupRef.current) groupRef.current.position.copy(camera.position);

    // --- drei Sky shader uniforms -------------------------------------------
    if (skyRef.current) {
      const u = skyRef.current.material.uniforms;
      u.sunPosition.value.copy(_sun);
      u.turbidity.value = turbidityBase + golden * 2.4 + overcast * 4.0;
      u.rayleigh.value = rayleighBase + golden * 0.7;
      u.mieCoefficient.value = 0.0015 + golden * 0.012;
      u.mieDirectionalG.value = 0.76 - golden * 0.16;
    }

    // --- celestial bodies ----------------------------------------------------
    if (moonRef.current) {
      moonRef.current.position.copy(_moon).multiplyScalar(BODY_DISTANCE);
      moonRef.current.quaternion.copy(camera.quaternion);
      const moonVis = night * (0.35 + 0.65 * s.moon_phase.fraction);
      moonRef.current.visible = moonVis > 0.02;
      moonRef.current.material.opacity = Math.min(1, moonVis + 0.2);
      if (moonGlowRef.current) {
        moonGlowRef.current.position.copy(moonRef.current.position);
        moonGlowRef.current.quaternion.copy(camera.quaternion);
        moonGlowRef.current.visible = moonRef.current.visible;
        moonGlowRef.current.material.opacity = 0.22 * moonVis;
      }
    }

    // --- lighting rig --------------------------------------------------------
    if (keyLightRef.current) {
      const key = keyLightRef.current;
      // Light comes *from* the higher of the two bodies (sun by day, moon by night).
      const fromMoon = s.elevation < -0.04;
      key.position.copy(fromMoon ? _moon : _sun).multiplyScalar(100);
      _color.copy(C.keyNight).lerp(C.keyDay, daylight);
      _color.lerp(C.keyGolden, golden * 0.85);
      key.color.copy(_color);
      const moonlight = fromMoon ? 0.16 * (0.4 + 0.6 * s.moon_phase.fraction) : 0;
      key.intensity = 0.2 + daylight * 2.5 * (1 - overcast * 0.4) + moonlight;
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(C.hemiSkyNight).lerp(C.hemiSkyDay, daylight);
      hemiRef.current.groundColor.copy(C.hemiGroundNight).lerp(C.hemiGroundDay, daylight);
      hemiRef.current.intensity = 0.4 + daylight * 1.7 + overcast * 0.2;
    }
    if (ambientRef.current) {
      ambientRef.current.color.copy(C.ambNight).lerp(C.ambDay, daylight);
      // Keep a soft moonlit floor at night so the world stays readable.
      ambientRef.current.intensity = 0.22 + daylight * 0.34;
    }

    // --- fog + background + exposure -----------------------------------------
    _color.copy(C.fogNight).lerp(C.fogDay, daylight).lerp(C.fogGolden, golden * 0.7);
    if (scene.fog) scene.fog.color.copy(_color);
    if (scene.background && scene.background.isColor) scene.background.copy(_color);
    gl.toneMappingExposure = expBase + daylight * expGain + golden * 0.06;
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} args={['#bfe3ff', '#9a7a52', 1.0]} />
      <ambientLight ref={ambientRef} intensity={0.4} />
      <directionalLight ref={keyLightRef} position={[0, 100, 0]} intensity={1.4} />
      <group ref={groupRef}>
        <Sky ref={skyRef} distance={SKY_DISTANCE} />
        <TropicalBlueSkyDome nightRef={nightRef} />
        <RealisticCloudLayer nightRef={nightRef} />
        {/* Moon: cooler, smaller billboarded disc + soft halo. */}
        <sprite ref={moonRef} renderOrder={-7} scale={[7, 7, 1]}>
          <spriteMaterial map={moonDiscTexture} color="#dfe8f4" transparent opacity={0} depthWrite={false} depthTest={false} fog={false} />
        </sprite>
        <sprite ref={moonGlowRef} renderOrder={-7} scale={[22, 22, 1]}>
          <spriteMaterial map={moonGlowTexture} color="#cdd8f0" transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} fog={false} />
        </sprite>
        {stars && <StarField nightRef={nightRef} />}
      </group>
    </>
  );
}
