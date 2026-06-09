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
  keyDay: new THREE.Color('#ffe6b8'),     // warm tropical sunlight (was near-white)
  keyGolden: new THREE.Color('#ff9b4d'),
  hemiSkyNight: new THREE.Color('#0b1a33'),
  hemiSkyDay: new THREE.Color('#cfe6ee'),  // sky fill: less blue, so shadows aren't cold
  hemiGroundNight: new THREE.Color('#0a0d12'),
  hemiGroundDay: new THREE.Color('#b08a58'), // warmer ground bounce (sand/rock)
  ambNight: new THREE.Color('#2a3a5c'),
  ambDay: new THREE.Color('#f2e9d6'),      // warm ambient (was cool blue-white)
  fogNight: new THREE.Color('#0c1830'),
  fogDay: new THREE.Color('#7fc4f2'),
  fogGolden: new THREE.Color('#d9a878'),
};

// Reusable scratch objects — no per-frame allocation in the render loop.
const _sun = new THREE.Vector3();
const _moon = new THREE.Vector3();
const _color = new THREE.Color();
const _sunColor = new THREE.Color();
const _glowColor = new THREE.Color();
const _sunDay = new THREE.Color('#ffd48a');    // midday sun — warm amber
const _sunGolden = new THREE.Color('#ff8a3c'); // low sun — deep warm orange
const _screenSun = new THREE.Vector3();
const _flareWorld = new THREE.Vector3();
const _flareNdc = new THREE.Vector3();

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
  const rayleighBase = T.rayleigh ?? 3.0;   // deeper tropical blue that resists blowing out near the sun
  const turbidityBase = T.turbidity ?? 0.32; // very low haze: the sky shader must not wash the dome white
  // Exposure floor/gain tuned for ACESFilmicToneMapping (needs more input than
  // the old Neutral curve to land the same midtone).
  const expBase = T.expBase ?? 0.46;
  const expGain = T.expGain ?? 0.07;
  const groupRef = useRef(null);
  const skyRef = useRef(null);
  const keyLightRef = useRef(null);
  const ambientRef = useRef(null);
  const hemiRef = useRef(null);
  const moonRef = useRef(null);
  const moonGlowRef = useRef(null);
  const sunRef = useRef(null);
  const sunGlowRef = useRef(null);
  const lensFlareRefs = useRef([]);
  const moonDiscTexture = useMemo(() => crateredMoonTexture(), []);
  const moonGlowTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(214, 227, 255, 0.25)'],
    [0.35, 'rgba(182, 202, 240, 0.10)'],
    [1.0, 'rgba(182, 202, 240, 0)'],
  ]), []);
  // Warm sun disc: bright but contained. Keep the core below pure white so
  // bloom does not wash the entire morning sky into a flat white field.
  const sunDiscTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(255, 238, 190, 0.96)'],
    [0.32, 'rgba(255, 204, 112, 0.9)'],
    [0.62, 'rgba(255, 151, 58, 0.55)'],
    [0.84, 'rgba(233, 103, 36, 0.2)'],
    [1.0, 'rgba(255, 145, 65, 0)'],
  ], 512), []);
  // Radiant corona: warm, soft, and deliberately low opacity so the sky keeps
  // color around the sun.
  const sunGlowTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(255, 206, 112, 0.52)'],
    [0.16, 'rgba(255, 178, 76, 0.34)'],
    [0.38, 'rgba(238, 126, 48, 0.15)'],
    [0.72, 'rgba(216, 88, 36, 0.035)'],
    [1.0, 'rgba(255, 118, 50, 0)'],
  ], 512), []);
  const lensFlareTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(255, 216, 128, 0.5)'],
    [0.24, 'rgba(255, 151, 69, 0.22)'],
    [0.56, 'rgba(255, 105, 62, 0.06)'],
    [1.0, 'rgba(255, 105, 62, 0)'],
  ], 192), []);

  // Smoothed game hour so the sky visibly drifts between discrete store updates.
  const hourRef = useRef(null);
  const nightRef = useRef(0); // shared with StarField without React re-renders

  // Shadow camera follows the player: a tight frustum that tracks the
  // character keeps shadow texels small (crisp edges) no matter where they
  // roam, instead of one blurry map stretched over the whole zone.
  const shadowTarget = useMemo(() => new THREE.Object3D(), []);

  const weather = useThreeGameStore(state => state.weather);
  const overcast = weather === 'cloudy' || weather === 'misty' ? 1 : 0;

  useLayoutEffect(() => () => {
    moonDiscTexture.dispose();
    moonGlowTexture.dispose();
    sunDiscTexture.dispose();
    sunGlowTexture.dispose();
    lensFlareTexture.dispose();
  }, [moonDiscTexture, moonGlowTexture, sunDiscTexture, sunGlowTexture, lensFlareTexture]);

  // Keep the drei Sky sized inside the far plane and let terrain depth-occlude it.
  useLayoutEffect(() => {
    if (skyRef.current) {
      const mat = skyRef.current.material;
      mat.depthWrite = false;
      mat.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <tonemapping_fragment>',
          /* glsl */`
            float rawLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            float hotSkyMask = smoothstep(0.58, 1.05, rawLuma);
            vec3 containedBrightSky = mix(vec3(0.46, 0.76, 0.96), vec3(0.78, 0.88, 0.96), smoothstep(0.58, 1.0, gl_FragColor.g));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, containedBrightSky, hotSkyMask * 0.82);
            gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(0.82, 0.92, 1.0));
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
      u.turbidity.value = turbidityBase + golden * 0.45 + overcast * 2.3;
      u.rayleigh.value = rayleighBase + golden * 0.18;
      // Lower Mie -> a much smaller, dimmer white scattering halo around the sun
      // so the sky stays blue and the disc reads against it (our sprite + bloom
      // supply the actual glow now).
      u.mieCoefficient.value = 0.00006 + golden * 0.00045;
      u.mieDirectionalG.value = 0.58 - golden * 0.08;
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

    if (sunRef.current) {
      // Fade the disc in just above the horizon; warm and swell it at low sun.
      const sunUp = THREE.MathUtils.clamp((s.elevation + 0.04) / 0.12, 0, 1) * (1 - overcast * 0.7);
      // Disc stays mostly white-hot; the warm orange lives in the corona.
      _sunColor.copy(_sunDay).lerp(_sunGolden, golden * 0.55);
      _glowColor.copy(_sunDay).lerp(_sunGolden, Math.min(1, golden * 1.15));
      const swell = 1 + golden * 0.55; // a bigger, softer setting/rising sun
      sunRef.current.position.copy(_sun).multiplyScalar(BODY_DISTANCE);
      sunRef.current.quaternion.copy(camera.quaternion);
      sunRef.current.visible = sunUp > 0.01;
      sunRef.current.scale.set(5.1 * swell, 5.1 * swell, 1);
      sunRef.current.material.color.copy(_sunColor);
      sunRef.current.material.opacity = sunUp * (0.82 + golden * 0.1);
      if (sunGlowRef.current) {
        sunGlowRef.current.position.copy(sunRef.current.position);
        sunGlowRef.current.quaternion.copy(camera.quaternion);
        sunGlowRef.current.visible = sunRef.current.visible;
        // A contained corona; bloom supplies the wide radiance, so keep this
        // tight enough that it doesn't paint a white field over the blue sky.
        sunGlowRef.current.scale.set(22 * swell, 22 * swell, 1);
        sunGlowRef.current.material.color.copy(_glowColor);
        sunGlowRef.current.material.opacity = sunUp * (0.28 + golden * 0.18);
      }
      _screenSun.copy(sunRef.current.position).add(camera.position).project(camera);
      const flareVisible = sunUp > 0.08 && _screenSun.z > -1 && _screenSun.z < 1 && Math.abs(_screenSun.x) < 1.25 && Math.abs(_screenSun.y) < 1.25;
      const flareSpecs = [
        [0.62, 3.8, 0.15, '#ffc66c'],
        [0.24, 1.35, 0.22, '#ff9a4a'],
        [-0.22, 2.1, 0.11, '#ffe0a0'],
        [-0.48, 4.6, 0.07, '#ff7d45'],
      ];
      lensFlareRefs.current.forEach((flare, index) => {
        if (!flare) return;
        const spec = flareSpecs[index];
        flare.visible = flareVisible;
        if (!flareVisible || !spec) return;
        _flareNdc.set(_screenSun.x * spec[0], _screenSun.y * spec[0], 0.18);
        _flareWorld.copy(_flareNdc).unproject(camera).sub(camera.position);
        flare.position.copy(_flareWorld);
        flare.quaternion.copy(camera.quaternion);
        flare.scale.setScalar(spec[1] * swell);
        flare.material.opacity = sunUp * spec[2] * (1 - overcast * 0.75);
        flare.material.color.set(spec[3]);
      });
    }

    // --- lighting rig --------------------------------------------------------
    if (keyLightRef.current) {
      const key = keyLightRef.current;
      // Light comes *from* the higher of the two bodies (sun by day, moon by night).
      const fromMoon = s.elevation < -0.04;
      const pose = store.playerPose?.position || { x: 0, y: 0, z: 0 };
      shadowTarget.position.set(pose.x, pose.y, pose.z);
      key.target = shadowTarget;
      key.position.copy(fromMoon ? _moon : _sun).multiplyScalar(100).add(shadowTarget.position);
      _color.copy(C.keyNight).lerp(C.keyDay, daylight);
      _color.lerp(C.keyGolden, golden * 0.95);
      key.color.copy(_color);
      const moonlight = fromMoon ? 0.16 * (0.4 + 0.6 * s.moon_phase.fraction) : 0;
      key.intensity = 0.22 + daylight * 2.95 * (1 - overcast * 0.4) + moonlight;
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
    gl.toneMappingExposure = expBase + daylight * expGain + golden * 0.025;
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} args={['#bfe3ff', '#9a7a52', 1.0]} />
      <ambientLight ref={ambientRef} intensity={0.4} />
      <directionalLight
        ref={keyLightRef}
        position={[0, 100, 0]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00012}
        shadow-normalBias={0.02}
        shadow-camera-near={40}
        shadow-camera-far={170}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      <primitive object={shadowTarget} />
      <group ref={groupRef}>
        <Sky ref={skyRef} distance={SKY_DISTANCE} />
        <TropicalBlueSkyDome nightRef={nightRef} />
        <RealisticCloudLayer nightRef={nightRef} />
        {/* Sun: warm billboarded disc behind a broad additive halo. */}
        <sprite ref={sunGlowRef} renderOrder={-8} scale={[30, 30, 1]}>
          <spriteMaterial map={sunGlowTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} fog={false} />
        </sprite>
        <sprite ref={sunRef} renderOrder={-7} scale={[8, 8, 1]}>
          <spriteMaterial map={sunDiscTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.NormalBlending} fog={false} />
        </sprite>
        {[0, 1, 2, 3].map(index => (
          <sprite
            key={`lens-flare-${index}`}
            ref={node => { lensFlareRefs.current[index] = node; }}
            renderOrder={-6}
            scale={[1, 1, 1]}
            visible={false}
          >
            <spriteMaterial map={lensFlareTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} fog={false} />
          </sprite>
        ))}
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
