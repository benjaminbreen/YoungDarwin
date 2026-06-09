'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { getRegionMap } from '../../../game-core/regionMaps';
import { terrainHeight } from '../../world/terrain';
import { sunDirection, skyState } from '../../world/celestial';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const WATER_LEVEL = -0.9;     // world Y of the calm surface (matches terrain refs)
const WATER_SIZE = 150;       // side length of the detailed (Gerstner) water plane
const WATER_SEGMENTS = 144;   // tessellation for the wave displacement
const BAKE_RES = 512;         // seafloor depth-texture resolution
// Height range packed into the depth texture's red byte: [HMIN, HMIN + HSPAN].
const HMIN = -6.0;
const HSPAN = 9.0;

// Bake the seafloor height under the water plane into a texture so the shader
// can read water depth per-pixel (shallow -> turquoise + transparent, deep ->
// blue + opaque) without a runtime depth prepass. Height is packed into R as
// (h - HMIN) / HSPAN so it survives an 8-bit channel; the shader unpacks it.
function bakeSeafloorTexture(zoneId) {
  const data = new Uint8Array(BAKE_RES * BAKE_RES * 4);
  for (let j = 0; j < BAKE_RES; j += 1) {
    for (let i = 0; i < BAKE_RES; i += 1) {
      const x = (i / (BAKE_RES - 1) - 0.5) * WATER_SIZE;
      const z = (j / (BAKE_RES - 1) - 0.5) * WATER_SIZE;
      const h = terrainHeight(x, z, zoneId);
      const packed = Math.round(THREE.MathUtils.clamp((h - HMIN) / HSPAN, 0, 1) * 255);
      const idx = (j * BAKE_RES + i) * 4;
      data[idx] = packed;
      data[idx + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, BAKE_RES, BAKE_RES, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

// Gerstner wave bank — a few crossing swells for a calm tropical bay. Shared by
// the vertex shader (displacement + analytic normal). Keep amplitudes small so
// the surface rolls gently rather than churning.
// Written for GLSL ES 1.00 (three's default ShaderMaterial) -> no array
// constructors / dynamic indexing; waves are accumulated by explicit calls.
const WAVE_GLSL = /* glsl */`
  const float STEEPNESS = 0.55;
  const float WAVE_SPEED = 1.0;
  const float WAVE_COUNT = 4.0;

  void addWave(vec2 pos, float t, vec2 d, float amp, float wl, inout vec3 disp, inout vec3 n) {
    vec2 dir = normalize(d);
    float w = 6.28318530718 / wl;
    float phase = w * dot(dir, pos) + t * WAVE_SPEED * sqrt(9.8 * w);
    float c = cos(phase);
    float s = sin(phase);
    float q = STEEPNESS / (w * amp * WAVE_COUNT + 1e-4);
    disp.x += q * amp * dir.x * c;
    disp.z += q * amp * dir.y * c;
    disp.y += amp * s;
    float wa = w * amp;
    n.x += dir.x * wa * c;
    n.z += dir.y * wa * c;
    n.y += q * wa * s;
  }

  // Returns displacement; writes the surface normal. The atten arg scales
  // amplitude (used to calm waves in the shallows so they don't clip the bed).
  vec3 gerstner(vec2 pos, float t, float atten, out vec3 normal) {
    vec3 disp = vec3(0.0);
    vec3 n = vec3(0.0, 0.0, 0.0);
    addWave(pos, t, vec2( 0.86,  0.51), 0.075, 13.0, disp, n);
    addWave(pos, t, vec2(-0.62,  0.78), 0.050,  8.5, disp, n);
    addWave(pos, t, vec2( 0.34, -0.94), 0.034,  5.5, disp, n);
    addWave(pos, t, vec2( 0.98,  0.17), 0.022,  3.7, disp, n);
    // Calm the swell in the shallows (atten -> 0): flatten both the
    // displacement and the surface normal back toward a still surface.
    disp *= atten;
    normal = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(-n.x, 1.0 - n.y, -n.z), atten));
    return disp;
  }
`;

function createStylizedWaterMaterial(seafloorTexture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSeafloor: { value: seafloorTexture },
      uWaterLevel: { value: WATER_LEVEL },
      uSize: { value: WATER_SIZE },
      // Tropical colour is sand seen through water: light seabed, dimmed and
      // tinted by depth (Beer-Lambert), plus the water's own scattered colour.
      // Cool, near-white seabed + an electric-cyan scatter -> blue shallows
      // (not green), and red+green absorbed with depth keep it electric.
      uSand: { value: new THREE.Color('#aed6e2') },      // light airy cyan seabed (pale shallows)
      uScatter: { value: new THREE.Color('#3fa4cf') },   // muted cerulean (not neon)
      uAbsorb: { value: new THREE.Vector3(0.34, 0.26, 0.13) }, // gentle -> wide, smooth shallow->deep ramp
      uDeep: { value: new THREE.Color('#3a90bd') },      // soft ocean blue, close in value to the shallows
      uFoam: { value: new THREE.Color('#f4ffff') },
      uSky: { value: new THREE.Color('#bfe6ff') },        // zenith reflection tint
      uSkyHorizon: { value: new THREE.Color('#eaf6ff') }, // bright horizon reflection
      // Aerial perspective: distant water desaturates toward this pale sky haze.
      uHaze: { value: new THREE.Color('#cfe6f4') },
      uHazeNear: { value: 38 },
      uHazeFar: { value: 120 },
      uSun: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
      uSunColor: { value: new THREE.Color('#fff3da') },
      uDaylight: { value: 1 },
      // Planar reflection (filled each frame when reflections are enabled).
      uReflection: { value: null },
      uReflMatrix: { value: new THREE.Matrix4() },
      uHasReflection: { value: 0 },
    },
    vertexShader: /* glsl */`
      ${WAVE_GLSL}
      uniform float uTime;
      uniform sampler2D uSeafloor;
      uniform float uWaterLevel;
      uniform float uSize;
      uniform mat4 uReflMatrix;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vDepth;
      varying float vCrest;
      varying vec4 vReflCoord;

      float seafloorAt(vec2 wxz) {
        vec2 uv = wxz / uSize + 0.5;
        float packed = texture2D(uSeafloor, uv).r;
        return packed * ${HSPAN.toFixed(1)} + (${HMIN.toFixed(1)});
      }

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        float floorH = seafloorAt(world.xz);
        float depth = uWaterLevel - floorH;
        vDepth = depth;
        // Calm the waves where it's shallow so crests don't punch through sand.
        float atten = smoothstep(0.05, 1.4, depth);
        vec3 normal;
        vec3 disp = gerstner(world.xz, uTime, atten, normal);
        world.xyz += disp;
        vCrest = disp.y;
        vWorld = world.xyz;
        vNormal = normal;
        // Projective coords for sampling the planar reflection texture.
        vReflCoord = uReflMatrix * vec4(world.xyz, 1.0);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uSand;
      uniform vec3 uScatter;
      uniform vec3 uAbsorb;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      uniform vec3 uSky;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSun;
      uniform vec3 uSunColor;
      uniform float uDaylight;
      uniform float uSize;
      uniform sampler2D uSeafloor;
      uniform float uWaterLevel;
      uniform sampler2D uReflection;
      uniform float uHasReflection;
      uniform vec3 uHaze;
      uniform float uHazeNear;
      uniform float uHazeFar;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vDepth;
      varying float vCrest;
      varying vec4 vReflCoord;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.3))) * 19341.13); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      // Water depth sampled directly from the baked seafloor (used to find the
      // shoreline by its gradient, independent of view angle).
      float depthAt(vec2 wxz) {
        vec2 uv = wxz / uSize + 0.5;
        return uWaterLevel - (texture2D(uSeafloor, uv).r * ${HSPAN.toFixed(1)} + (${HMIN.toFixed(1)}));
      }

      void main() {
        vec3 normal = normalize(vNormal);

        // --- fine detail ripples: perturb the normal for sparkle ---------------
        vec2 rp = vWorld.xz * 0.7 + vec2(uTime * 0.06, -uTime * 0.05);
        float e = 0.12;
        float r0 = noise(rp);
        float rx = noise(rp + vec2(e, 0.0)) - r0;
        float rz = noise(rp + vec2(0.0, e)) - r0;
        normal = normalize(normal + vec3(-rx, 0.0, -rz) * 1.4);

        vec3 viewDir = normalize(cameraPosition - vWorld);

        // --- per-fragment water depth (smooth; no mesh-grid faceting) ----------
        float dRaw = depthAt(vWorld.xz);   // signed: <0 just inland of the waterline
        float depth = max(0.0, dRaw);

        // --- tropical colour: light sand seen through water --------------------
        // Beer-Lambert: the seabed is dimmed/tinted by depth (red absorbed
        // first), and the water's own scattered teal accumulates with depth.
        vec3 absorb = exp(-uAbsorb * depth);
        vec3 color = uSand * absorb + uScatter * (1.0 - absorb);
        // Ease into the open-ocean blue gradually (wide range) so there is no
        // abrupt band where the shelf drops off.
        color = mix(color, uDeep, smoothstep(1.5, 16.0, depth));
        float shallowFactor = absorb.r;    // ~1 at the shore, -> 0 with depth

        // Transparent right at the waterline (wet sand shows), quickly opaque so
        // the dark volcanic seabed doesn't muddy the turquoise beyond.
        float alpha = smoothstep(0.0, 0.22, depth) * 0.92;

        // --- caustics: dancing light net over the shallow seabed ---------------
        vec2 cuv = vWorld.xz * 0.55;
        float ca = noise(cuv + vec2(uTime * 0.05, uTime * 0.04));
        float cb = noise(cuv * 1.3 - vec2(uTime * 0.06, uTime * 0.035));
        float caustic = pow(1.0 - abs(ca - cb), 5.0);
        color += uSunColor * caustic * shallowFactor * uDaylight * 0.18;

        // --- reflection: real planar reflection if available, else sky tint ----
        vec3 refl = reflect(-viewDir, normal);
        vec3 skyRefl = mix(uSkyHorizon, uSky, clamp(refl.y * 1.4, 0.0, 1.0));
        vec3 reflColor = skyRefl;
        if (uHasReflection > 0.5 && vReflCoord.w > 0.0) {
          // Perspective divide + small ripple distortion from the surface normal.
          vec2 ruv = vReflCoord.xy / vReflCoord.w + normal.xz * 0.03;
          // Only trust the capture inside the frame; fade to sky toward the
          // edges so grazing-angle foreground water can't smear into blocks.
          vec2 edge = smoothstep(0.0, 0.08, ruv) * smoothstep(1.0, 0.92, ruv);
          float valid = edge.x * edge.y;
          // Mild clamp so a blown-out sky/sun can't bloom into white ovals.
          vec3 planar = min(texture2D(uReflection, clamp(ruv, 0.0, 1.0)).rgb, vec3(0.92));
          reflColor = mix(skyRefl, mix(planar, skyRefl, 0.14), valid);
        }
        // Reflectance has a base floor so even top-down water mirrors the sky and
        // ship, not only at grazing angles. Open water mirrors more than shallows.
        float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);
        float reflectance = mix(0.10, 1.0, fres);
        float reflStrength = mix(0.62, 0.26, shallowFactor);
        color = mix(color, reflColor, reflectance * reflStrength);
        alpha = max(alpha, fres * 0.9);

        // --- sun glitter: tight sparkle, not a broad glare patch ---------------
        vec3 hv = normalize(uSun + viewDir);
        float spec = pow(max(dot(normal, hv), 0.0), 240.0) * uDaylight;
        color += uSunColor * spec * 0.7;

        // --- foam: thin crisp lip at the true waterline + breaking crests ------
        // Shoreline = shallow depth over a steep seabed; a broad flat shelf
        // (low gradient) gets no foam, so there are no big blobs.
        float grad = length(vec2(dRaw - depthAt(vWorld.xz + vec2(0.5, 0.0)),
                                 dRaw - depthAt(vWorld.xz + vec2(0.0, 0.5)))) / 0.5;
        float shoreBand = smoothstep(0.32, 0.0, dRaw) * smoothstep(0.1, 0.45, grad);
        float lace = noise(vWorld.xz * 3.6 - vec2(uTime * 0.5, uTime * 0.35));
        float shoreFoam = shoreBand * smoothstep(0.3, 0.75, lace);
        // Crest foam only where waves actually break in the shallows.
        float breakZone = smoothstep(1.6, 0.5, depth);
        float crestFoam = smoothstep(0.09, 0.2, vCrest) * breakZone * smoothstep(0.5, 0.9, lace) * 0.5;
        float foam = clamp(max(shoreFoam, crestFoam), 0.0, 1.0);
        color = mix(color, uFoam, foam);
        alpha = max(alpha, foam * 0.95);

        // --- atmospheric haze: distant water desaturates & lightens into sky ----
        float camDist = length(vWorld.xz - cameraPosition.xz);
        float haze = smoothstep(uHazeNear, uHazeFar, camDist);
        color = mix(color, uHaze, haze * 0.95);

        // --- fade the plane edge into the open-ocean disc beyond ----------------
        float rim = uSize * 0.5;
        float edge = 1.0 - smoothstep(rim - 14.0, rim - 2.0, length(vWorld.xz));
        alpha *= edge;

        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// Large camera-following disc beneath the detailed water: the apparently
// infinite open ocean. Coloured to match the detailed water's deep blue and
// faded into the time-of-day sky at the horizon, so there is no visible edge.
function createDeepOceanMaterial() {
  return new THREE.ShaderMaterial({
    fog: false,
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      shallow: { value: new THREE.Color('#3a90bd') },
      deep: { value: new THREE.Color('#2f80ad') },
      fogColor: { value: new THREE.Color('#cfe6f4') },
      fogNear: { value: 64 },
      fogFar: { value: 150 },
      camPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 shallow;
      uniform vec3 deep;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      uniform vec3 camPos;
      varying vec3 vWorld;

      void main() {
        float fromCentre = length(vWorld.xz);
        float depthMix = smoothstep(70.0, 150.0, fromCentre);
        vec3 color = mix(shallow, deep, depthMix);
        float shimmer = sin(vWorld.x * 0.06 + time * 0.4) * cos(vWorld.z * 0.05 - time * 0.32);
        color += shimmer * 0.015;
        float fromCam = length(vWorld.xz - camPos.xz);
        float fog = smoothstep(fogNear, fogFar, fromCam);
        color = mix(color, fogColor, fog);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

// --- planar reflection (mirror camera + render target) ---------------------
// Adapted from THREE.Reflector: reflect the camera across the water plane,
// render the scene into a texture, and hand back a world->uv matrix. Kept as
// module scratch so the per-frame render allocates nothing.
const REFLECT_CLIP_BIAS = 0.06;
const _reflNormal = new THREE.Vector3(0, 1, 0);
const _reflWorldPos = new THREE.Vector3(0, WATER_LEVEL, 0);
const _camWorldPos = new THREE.Vector3();
const _rotMat = new THREE.Matrix4();
const _lookAt = new THREE.Vector3();
const _target = new THREE.Vector3();
const _viewVec = new THREE.Vector3();
const _reflPlane = new THREE.Plane();
const _clipPlane = new THREE.Vector4();
const _qv = new THREE.Vector4();
const _virtualCam = new THREE.PerspectiveCamera();

function renderReflection(gl, scene, camera, rt, hidden, outMatrix) {
  _camWorldPos.setFromMatrixPosition(camera.matrixWorld);
  _viewVec.subVectors(_reflWorldPos, _camWorldPos);
  if (_viewVec.dot(_reflNormal) > 0) return false; // camera below the surface

  _viewVec.reflect(_reflNormal).negate().add(_reflWorldPos);

  _rotMat.extractRotation(camera.matrixWorld);
  _lookAt.set(0, 0, -1).applyMatrix4(_rotMat).add(_camWorldPos);
  _target.subVectors(_reflWorldPos, _lookAt).reflect(_reflNormal).negate().add(_reflWorldPos);

  _virtualCam.position.copy(_viewVec);
  _virtualCam.up.set(0, 1, 0).applyMatrix4(_rotMat).reflect(_reflNormal);
  _virtualCam.lookAt(_target);
  _virtualCam.near = camera.near;
  _virtualCam.far = camera.far;
  _virtualCam.fov = camera.fov;
  _virtualCam.aspect = camera.aspect;
  _virtualCam.updateMatrixWorld();
  _virtualCam.projectionMatrix.copy(camera.projectionMatrix);

  // World -> reflection-texture UV matrix (uses the clean projection).
  outMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  outMatrix.multiply(_virtualCam.projectionMatrix);
  outMatrix.multiply(_virtualCam.matrixWorldInverse);

  // Oblique near-plane clip so geometry below the water isn't reflected.
  _reflPlane.setFromNormalAndCoplanarPoint(_reflNormal, _reflWorldPos);
  _reflPlane.applyMatrix4(_virtualCam.matrixWorldInverse);
  _clipPlane.set(_reflPlane.normal.x, _reflPlane.normal.y, _reflPlane.normal.z, _reflPlane.constant);
  const p = _virtualCam.projectionMatrix;
  _qv.x = (Math.sign(_clipPlane.x) + p.elements[8]) / p.elements[0];
  _qv.y = (Math.sign(_clipPlane.y) + p.elements[9]) / p.elements[5];
  _qv.z = -1.0;
  _qv.w = (1.0 + p.elements[10]) / p.elements[14];
  _clipPlane.multiplyScalar(2.0 / _clipPlane.dot(_qv));
  p.elements[2] = _clipPlane.x;
  p.elements[6] = _clipPlane.y;
  p.elements[10] = _clipPlane.z + 1.0 - REFLECT_CLIP_BIAS;
  p.elements[14] = _clipPlane.w;

  for (let i = 0; i < hidden.length; i += 1) { if (hidden[i]) hidden[i].visible = false; }
  const prevRT = gl.getRenderTarget();
  const prevShadowAuto = gl.shadowMap.autoUpdate;
  gl.shadowMap.autoUpdate = false;
  gl.setRenderTarget(rt);
  gl.clear();
  gl.render(scene, _virtualCam);
  gl.setRenderTarget(prevRT);
  gl.shadowMap.autoUpdate = prevShadowAuto;
  for (let i = 0; i < hidden.length; i += 1) { if (hidden[i]) hidden[i].visible = true; }
  return true;
}

export function Water({ reflections = true }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const { scene, gl } = useThree();

  const seafloor = useMemo(() => bakeSeafloorTexture(currentZoneId), [currentZoneId]);
  const waterMaterial = useMemo(() => createStylizedWaterMaterial(seafloor), [seafloor]);
  const deepMaterial = useMemo(() => createDeepOceanMaterial(), []);

  const waterGeometry = useMemo(
    () => new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGMENTS, WATER_SEGMENTS),
    [],
  );

  const reflectionRT = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1024, 1024, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }, []);

  const deepRef = useRef(null);
  const waterRef = useRef(null);
  const _sun = useMemo(() => new THREE.Vector3(), []);
  const _white = useMemo(() => new THREE.Color('#ffffff'), []);

  useFrame(({ clock, camera }) => {
    const waterMesh = waterRef.current;
    if (!waterMesh) return; // no water in this zone -> skip everything

    const store = useThreeGameStore.getState();
    const t = clock.elapsedTime;
    const time = ((store.timeOfDay % 24) + 24) % 24;
    const sun = sunDirection(time);
    _sun.set(sun[0], sun[1], sun[2]);

    const wu = waterMaterial.uniforms;
    wu.uTime.value = t;
    wu.uSun.value.copy(_sun);
    wu.uDaylight.value = skyState(time, store.day || 1).daylight;
    if (scene.fog) {
      wu.uSky.value.copy(scene.fog.color);
      // Horizon reflection reads a touch brighter than the zenith sky tint
      // (kept well short of white so it can't bloom into glare ovals).
      wu.uSkyHorizon.value.copy(scene.fog.color).lerp(_white, 0.18);
      // Pale haze that distant water (and the horizon disc) dissolves into, so
      // the seam between sea and sky softens instead of banding.
      wu.uHaze.value.copy(scene.fog.color).lerp(_white, 0.42);
    }

    const disc = deepRef.current;
    if (disc) {
      disc.position.x = camera.position.x;
      disc.position.z = camera.position.z;
      const du = deepMaterial.uniforms;
      du.time.value = t;
      du.camPos.value.copy(camera.position);
      // Match the disc's horizon haze to the detailed water's so they melt
      // into the same sky tone with no band between them.
      if (scene.fog) du.fogColor.value.copy(wu.uHaze.value);
    }

    // Planar reflection pass (hide our own water so it isn't captured).
    if (reflections) {
      const ok = renderReflection(gl, scene, camera, reflectionRT, [waterMesh, disc], wu.uReflMatrix.value);
      wu.uReflection.value = ok ? reflectionRT.texture : null;
      wu.uHasReflection.value = ok ? 1 : 0;
    } else {
      wu.uHasReflection.value = 0;
    }
  });

  useEffect(() => {
    return () => {
      waterGeometry.dispose();
      waterMaterial.dispose();
      seafloor.dispose();
      deepMaterial.dispose();
      reflectionRT.dispose();
    };
  }, [waterGeometry, waterMaterial, seafloor, deepMaterial, reflectionRT]);

  const regionType = getRegionMap(currentZoneId).type;
  if (['beagle', 'interior', 'office', 'governorslibrary', 'governorshouse', 'cave'].includes(regionType)) return null;

  return (
    <group>
      <mesh ref={deepRef} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL - 0.08, 0]} material={deepMaterial} renderOrder={-4} frustumCulled={false}>
        <circleGeometry args={[160, 64]} />
      </mesh>
      <mesh ref={waterRef} geometry={waterGeometry} material={waterMaterial} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL, 0]} renderOrder={-2} frustumCulled={false} />
    </group>
  );
}
