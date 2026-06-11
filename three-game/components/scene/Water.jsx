'use client';

import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { getRegionMap } from '../../../game-core/regionMaps';
import { terrainHeight } from '../../world/terrain';
import { sunDirection, skyState } from '../../world/celestial';
import { WATER_LEVEL } from '../../world/water';

// ---------------------------------------------------------------------------
// Stylized tropical water.
//
// The clear-shallows look is built on three pillars:
//   1. A baked seafloor depth texture (cheaper than a GPU depth pre-pass and
//      readable in the vertex stage) drives colour, fade, foam and swash.
//   2. Screen-space refraction: just before the water draws, the framebuffer
//      (everything already rendered behind it — seabed, coral, fish) is
//      grabbed with one copyFramebufferToTexture, then re-sampled with
//      normal-distorted UVs and Beer-Lambert tinting. The bottom visibly
//      wobbles through the surface instead of being hidden by alpha.
//   3. Per-pixel normals: vertices carry only the (3-wave) Gerstner
//      displacement for silhouette; the shading normal is re-evaluated
//      analytically per fragment plus scrolling detail ripples, so the
//      surface is glassy at any tessellation (no faceted diamonds).
// Caustics live in the terrain shader (light belongs on the sand, not on the
// surface) — see injectSeabedCaustics in Terrain.jsx.
// ---------------------------------------------------------------------------

// Tunables
const WATER_SIZE = 150;       // side length of the detailed water plane
const WATER_SEGMENTS = 96;    // vertex displacement only -> modest mesh is enough
const BAKE_RES = 512;         // seafloor depth-texture resolution
const REFLECTION_RES = 448;   // planar mirror is a garnish now, not the core look
const REFLECTION_INTERVAL = 3; // re-render the mirror every Nth frame
// Height range packed into the depth texture's red byte: [HMIN, HMIN + HSPAN].
const HMIN = -6.0;
const HSPAN = 9.0;

// Bake the seafloor height under the water plane into a texture so the shader
// can read water depth per-pixel without a runtime depth prepass.
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

// Shared wave bank: three crossing swells for a calm tropical bay. The vertex
// stage uses the displacement; the fragment stage re-evaluates the analytic
// normal per pixel. Written for GLSL ES 1.00 (no array constructors).
const WAVE_GLSL = /* glsl */`
  const float STEEPNESS = 0.52;
  const float WAVE_COUNT = 3.0;

  void addWave(vec2 pos, float t, vec2 d, float amp, float wl, inout vec3 disp, inout vec3 n) {
    vec2 dir = normalize(d);
    float w = 6.28318530718 / wl;
    float phase = w * dot(dir, pos) + t * sqrt(9.8 * w);
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

  // Returns displacement; writes the analytic surface normal. atten scales
  // amplitude so the swell calms (but never dies) over the shallows.
  vec3 gerstner(vec2 pos, float t, float atten, out vec3 normal) {
    vec3 disp = vec3(0.0);
    vec3 n = vec3(0.0, 0.0, 0.0);
    addWave(pos, t, vec2( 0.86,  0.51), 0.07, 13.0, disp, n);
    addWave(pos, t, vec2(-0.62,  0.78), 0.045, 8.5, disp, n);
    addWave(pos, t, vec2( 0.34, -0.94), 0.028, 5.0, disp, n);
    disp *= atten;
    normal = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(-n.x, 1.0 - n.y, -n.z), atten));
    return disp;
  }

  // Swell attenuation over the shallows: gentle ramp (a steep one shows the
  // vertex grid), with a floor so the surface keeps rolling at the shore.
  float swellAtten(float depth) {
    return smoothstep(0.0, 0.3, depth) * (0.35 + 0.65 * smoothstep(0.35, 1.6, depth));
  }

  // Rhythmic swash: the waterline rides up and down the beach face in sync
  // with the terrain shader's foam band (same clock, same 0.8976 rad/s cycle).
  float swashLift(vec2 wxz, float t, float depthRaw) {
    float cyc = sin(t * 0.8976) * 0.5 + 0.5;
    float lift = ((cyc - 0.5) * 1.7 + sin(wxz.x * 0.17 + t * 0.45) * 0.3) * 0.115;
    return lift * smoothstep(1.3, 0.05, max(depthRaw, 0.0));
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
      // Fallback painted colour (used until the first refraction grab lands).
      uSand: { value: new THREE.Color('#aed6e2') },
      // Water body: luminous tropical scatter + absorption per channel
      // (red dies first), eased into open-ocean blue with depth.
      uScatter: { value: new THREE.Color('#41c0d8') },
      uAbsorb: { value: new THREE.Vector3(0.42, 0.20, 0.10) },
      uDeep: { value: new THREE.Color('#3a90bd') },
      uFoam: { value: new THREE.Color('#f4ffff') },
      uSky: { value: new THREE.Color('#bfe6ff') },
      uSkyHorizon: { value: new THREE.Color('#eaf6ff') },
      uHaze: { value: new THREE.Color('#cfe6f4') },
      uHazeNear: { value: 38 },
      uHazeFar: { value: 120 },
      uSun: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
      uSunColor: { value: new THREE.Color('#fff3da') },
      uDaylight: { value: 1 },
      // Screen-space refraction grab (copied from the framebuffer just before
      // the water draws each frame).
      uRefraction: { value: null },
      uHasRefraction: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      // Planar reflection (filled when reflections are enabled).
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
        vec3 normal; // unused: shading normal is per-pixel in the fragment
        vec3 disp = gerstner(world.xz, uTime, swellAtten(depth), normal);
        world.xyz += disp;
        world.y += swashLift(world.xz, uTime, depth);
        vCrest = disp.y;
        vWorld = world.xyz;
        vReflCoord = uReflMatrix * vec4(world.xyz, 1.0);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      ${WAVE_GLSL}
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
      uniform sampler2D uRefraction;
      uniform float uHasRefraction;
      uniform vec2 uResolution;
      uniform sampler2D uReflection;
      uniform float uHasReflection;
      uniform vec3 uHaze;
      uniform float uHazeNear;
      uniform float uHazeFar;
      varying vec3 vWorld;
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

      float depthAt(vec2 wxz) {
        vec2 uv = wxz / uSize + 0.5;
        return uWaterLevel - (texture2D(uSeafloor, uv).r * ${HSPAN.toFixed(1)} + (${HMIN.toFixed(1)}));
      }

      void main() {
        // --- per-pixel surface normal: analytic swell + scrolling ripples ----
        float dRaw = depthAt(vWorld.xz);   // signed: <0 just inland of the line
        float dEff = dRaw + swashLift(vWorld.xz, uTime, dRaw);
        float depth = max(0.0, dEff);

        vec3 normal;
        gerstner(vWorld.xz, uTime, swellAtten(max(dRaw, 0.0)), normal);
        vec2 rp = vWorld.xz * 0.7 + vec2(uTime * 0.06, -uTime * 0.05);
        float e = 0.12;
        float r0 = noise(rp);
        float rx = noise(rp + vec2(e, 0.0)) - r0;
        float rz = noise(rp + vec2(0.0, e)) - r0;
        vec2 rp2 = vWorld.xz * 2.3 - vec2(uTime * 0.045, uTime * 0.07);
        float s0 = noise(rp2);
        float sx = noise(rp2 + vec2(e, 0.0)) - s0;
        float sz = noise(rp2 + vec2(0.0, e)) - s0;
        normal = normalize(normal + vec3(-(rx + sx * 0.45), 0.0, -(rz + sz * 0.45)) * 1.25);

        vec3 viewDir = normalize(cameraPosition - vWorld);

        // --- the water body: refracted scene, absorbed and scattered ---------
        float shallowFactor = exp(-depth * 0.30); // ~1 at the shore, 0 deep
        vec3 color;
        if (uHasRefraction > 0.5) {
          // Distort harder where the water is deeper; nearly straight at the
          // swash line so the beach doesn't smear.
          vec2 screenUV = gl_FragCoord.xy / uResolution;
          float distort = 0.012 + min(depth, 2.5) * 0.022;
          vec2 ruv = clamp(screenUV + normal.xz * distort, vec2(0.001), vec2(0.999));
          vec3 grab = texture2D(uRefraction, ruv).rgb;
          // The grab is tone-mapped sRGB; approximate decode + a small lift to
          // compensate for the second tone-mapping pass on the way out.
          grab = pow(grab, vec3(2.0)) * 1.22;
          vec3 bed = grab * exp(-uAbsorb * (depth * 1.05 + 0.1));
          color = bed + uScatter * (1.0 - exp(-depth * 0.36)) * 0.55;
        } else {
          vec3 absorb = exp(-uAbsorb * depth);
          color = uSand * absorb + uScatter * (1.0 - absorb);
        }
        // Ease into open-ocean blue past the drop-off.
        color = mix(color, uDeep, smoothstep(2.8, 14.0, depth));

        // Opaque body (it *shows* the refracted scene), feathered to nothing
        // exactly at the moving waterline.
        float alpha = smoothstep(0.0, 0.06, dEff) * 0.985;

        // --- reflection: a garnish on top of the clear body -------------------
        vec3 refl = reflect(-viewDir, normal);
        vec3 skyRefl = mix(uSkyHorizon, uSky, clamp(refl.y * 1.4, 0.0, 1.0));
        vec3 reflColor = skyRefl;
        if (uHasReflection > 0.5 && vReflCoord.w > 0.0) {
          vec2 mruv = vReflCoord.xy / vReflCoord.w + normal.xz * 0.03;
          vec2 edge = smoothstep(0.0, 0.08, mruv) * smoothstep(1.0, 0.92, mruv);
          float valid = edge.x * edge.y;
          vec3 planar = min(texture2D(uReflection, clamp(mruv, 0.0, 1.0)).rgb, vec3(0.92));
          reflColor = mix(skyRefl, mix(planar, skyRefl, 0.14), valid);
        }
        // Restrained fresnel: stylized lagoons keep the bottom visible far
        // beyond what physics says, so the mirror never takes over.
        float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);
        float reflectance = mix(0.06, 0.55, fres);
        float reflStrength = mix(0.55, 0.12, shallowFactor);
        color = mix(color, reflColor, reflectance * reflStrength);

        // --- sun glitter: tight sparkle ---------------------------------------
        vec3 hv = normalize(uSun + viewDir);
        float spec = pow(max(dot(normal, hv), 0.0), 240.0) * uDaylight;
        color += uSunColor * spec * 0.7;

        // --- foam: crisp lip at the moving waterline + breaking crests --------
        float grad = length(vec2(dRaw - depthAt(vWorld.xz + vec2(0.5, 0.0)),
                                 dRaw - depthAt(vWorld.xz + vec2(0.0, 0.5)))) / 0.5;
        float shoreBand = smoothstep(0.32, 0.0, dEff) * smoothstep(0.1, 0.45, grad);
        float lace = noise(vWorld.xz * 3.6 - vec2(uTime * 0.5, uTime * 0.35));
        float shoreFoam = shoreBand * smoothstep(0.3, 0.75, lace);
        shoreFoam = max(shoreFoam, smoothstep(0.09, 0.015, abs(dEff - 0.04)) * smoothstep(0.05, 0.4, grad) * 0.85);
        float breakZone = smoothstep(1.6, 0.5, depth);
        float crestFoam = smoothstep(0.085, 0.18, vCrest) * breakZone * smoothstep(0.5, 0.9, lace) * 0.5;
        float foam = clamp(max(shoreFoam, crestFoam), 0.0, 1.0);
        color = mix(color, uFoam, foam);
        alpha = max(alpha, foam * 0.95);

        // --- atmospheric haze --------------------------------------------------
        float camDist = length(vWorld.xz - cameraPosition.xz);
        float haze = smoothstep(uHazeNear, uHazeFar, camDist);
        color = mix(color, uHaze, haze * 0.95);

        // --- fade the plane edge into the open-ocean disc beyond ----------------
        float rim = uSize * 0.5;
        float edgeFade = 1.0 - smoothstep(rim - 14.0, rim - 2.0, length(vWorld.xz));
        alpha *= edgeFade;

        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// Large camera-following disc beneath the detailed water: the apparently
// infinite open ocean, faded into the sky at the horizon.
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
  // Objects flagged noReflect (scatter foliage, swimmers, splash sprites) are
  // invisible in a rippled mirror anyway — skipping them cuts most of the
  // reflection pass's geometry cost.
  _noReflect.length = 0;
  scene.traverse(object => {
    if (object.visible && object.userData.noReflect) {
      object.visible = false;
      _noReflect.push(object);
    }
  });
  const prevRT = gl.getRenderTarget();
  const prevShadowAuto = gl.shadowMap.autoUpdate;
  gl.shadowMap.autoUpdate = false;
  gl.setRenderTarget(rt);
  gl.clear();
  gl.render(scene, _virtualCam);
  gl.setRenderTarget(prevRT);
  gl.shadowMap.autoUpdate = prevShadowAuto;
  for (let i = 0; i < hidden.length; i += 1) { if (hidden[i]) hidden[i].visible = true; }
  for (let i = 0; i < _noReflect.length; i += 1) _noReflect[i].visible = true;
  return true;
}

const _noReflect = [];
const _drawSize = new THREE.Vector2();

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
    const rt = new THREE.WebGLRenderTarget(REFLECTION_RES, REFLECTION_RES, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }, []);

  const deepRef = useRef(null);
  const waterRef = useRef(null);
  const reflectionFrame = useRef(0);
  const grabRef = useRef(null); // FramebufferTexture for the refraction grab
  const _sun = useMemo(() => new THREE.Vector3(), []);
  const _white = useMemo(() => new THREE.Color('#ffffff'), []);

  // Refraction grab: runs in the middle of the render, right before the water
  // mesh draws (transparent pass, after all opaque geometry). One framebuffer
  // copy — no scene re-render.
  const handleBeforeRender = useCallback(renderer => {
    // Skip when rendering into an offscreen target (the planar mirror pass):
    // the grab must come from the main framebuffer only.
    if (renderer.getRenderTarget() !== null) return;
    renderer.getDrawingBufferSize(_drawSize);
    let grab = grabRef.current;
    if (!grab || grab.image.width !== _drawSize.x || grab.image.height !== _drawSize.y) {
      grab?.dispose();
      grab = new THREE.FramebufferTexture(_drawSize.x, _drawSize.y);
      grab.minFilter = THREE.LinearFilter;
      grab.magFilter = THREE.LinearFilter;
      grabRef.current = grab;
    }
    renderer.copyFramebufferToTexture(grab);
    const wu = waterMaterial.uniforms;
    wu.uRefraction.value = grab;
    wu.uHasRefraction.value = 1;
    wu.uResolution.value.copy(_drawSize);
  }, [waterMaterial]);

  const bindWaterMesh = useCallback(mesh => {
    waterRef.current = mesh;
    if (mesh) mesh.onBeforeRender = handleBeforeRender;
  }, [handleBeforeRender]);

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
      wu.uSkyHorizon.value.copy(scene.fog.color).lerp(_white, 0.18);
      wu.uHaze.value.copy(scene.fog.color).lerp(_white, 0.42);
    }

    const disc = deepRef.current;
    if (disc) {
      disc.position.x = camera.position.x;
      disc.position.z = camera.position.z;
      const du = deepMaterial.uniforms;
      du.time.value = t;
      du.camPos.value.copy(camera.position);
      if (scene.fog) du.fogColor.value.copy(wu.uHaze.value);
    }

    // Planar reflection pass (hide our own water so it isn't captured). The
    // mirror is a garnish on top of the refracted body now, so a few-frames-
    // stale capture at moderate resolution is invisible.
    if (reflections) {
      reflectionFrame.current = (reflectionFrame.current + 1) % REFLECTION_INTERVAL;
      if (reflectionFrame.current === 0 || !wu.uReflection.value) {
        const ok = renderReflection(gl, scene, camera, reflectionRT, [waterMesh, disc], wu.uReflMatrix.value);
        wu.uReflection.value = ok ? reflectionRT.texture : null;
        wu.uHasReflection.value = ok ? 1 : 0;
      }
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
      grabRef.current?.dispose();
      grabRef.current = null;
    };
  }, [waterGeometry, waterMaterial, seafloor, deepMaterial, reflectionRT]);

  const regionType = getRegionMap(currentZoneId).type;
  if (['beagle', 'interior', 'office', 'governorslibrary', 'governorshouse', 'cave'].includes(regionType)) return null;

  return (
    <group>
      <mesh ref={deepRef} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL - 0.08, 0]} material={deepMaterial} renderOrder={-4} frustumCulled={false}>
        <circleGeometry args={[160, 64]} />
      </mesh>
      <mesh ref={bindWaterMesh} geometry={waterGeometry} material={waterMaterial} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL, 0]} renderOrder={-2} frustumCulled={false} />
    </group>
  );
}
