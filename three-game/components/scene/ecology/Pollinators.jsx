'use client';

// Ambient pollinators: the Galapagos carpenter bee (Xylocopa darwini, the
// glossy blue-black female), the Galapagos sulphur butterfly (Phoebis sennae
// marcellina), and the Galapagos gulf fritillary (Agraulis vanillae
// galapagensis, the silver-spotted flambeau). Pure ecology dressing — none is
// a collectable specimen, so they live here rather than through SpecimenActor.
//
// Performance shape: one instanced body mesh + one instanced wing mesh per
// species, plus a tiny sparkle-points pass for the bees (7 draw calls for the
// whole system). All flight simulation is a handful of trig ops per insect
// per frame. Insects re-anchor near the player as they walk so the world
// always has a few in view, and all species stand down in rain and at night;
// each has its own cloud tolerance (fritillary strictest, sulphur loosest).

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getRuntimePlayerPose, useThreeGameStore } from '../../../store';
import { terrainBiomeAt, terrainHeight } from '../../../world/terrain';
import { WATER_LEVEL } from '../../../world/water';
import { skyState, sunDirection } from '../../../world/celestial';
import { weatherEnv } from '../../../world/weatherEnvRuntime';

const BEE_COUNT = 4;
const SULPHUR_COUNT = 5;
const FRITILLARY_COUNT = 4;
const ROAM_RADIUS = 20;
const REHOME_DISTANCE = 26;
const PLACEMENT_ATTEMPTS = 5;

const _bodyPos = new THREE.Vector3();
const _bodyQuat = new THREE.Quaternion();
const _bodyEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _bodyScale = new THREE.Vector3();
const _bodyMatrix = new THREE.Matrix4();
const _wingMatrix = new THREE.Matrix4();
const _wingLocal = new THREE.Matrix4();
const _wingPos = new THREE.Vector3();
const _wingQuat = new THREE.Quaternion();
const _wingEuler = new THREE.Euler(0, 0, 0, 'XYZ');
const _wingScale = new THREE.Vector3();

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

// Both species work the vegetated ground: scrub and grass first, beach
// margins second. Bare lava and open sand only get the occasional passer-by.
function pollinatorBiomeWeight(biome) {
  if (biome === 'dry-scrub' || biome === 'palo-santo' || biome === 'salt-scrub') return 1;
  if (biome === 'grass' || biome === 'saltgrass' || biome === 'trail') return 0.9;
  if (biome === 'sesuvium-flat' || biome === 'wet-mud') return 0.6;
  if (biome === 'green-beach' || biome === 'olivine-trail') return 0.5;
  if (biome === 'white-sand' || biome === 'sand' || biome === 'green-sand') return 0.2;
  if (biome === 'black-lava' || biome === 'wet-basalt' || biome === 'ash-slope' || biome === 'tuff-ridge') return 0.12;
  return 0.3;
}

// The gulf fritillary works the greener, moister ground — grass, sesuvium,
// the vegetated margins — where its passionflower hosts and nectar grow.
// Dry coastal scrub belongs to the sulphur.
function fritillaryBiomeWeight(biome) {
  if (biome === 'grass' || biome === 'saltgrass') return 1;
  if (biome === 'sesuvium-flat' || biome === 'wet-mud') return 0.9;
  if (biome === 'palo-santo' || biome === 'trail') return 0.6;
  if (biome === 'dry-scrub' || biome === 'salt-scrub') return 0.5;
  if (biome === 'green-beach' || biome === 'olivine-trail') return 0.4;
  if (biome === 'white-sand' || biome === 'sand') return 0.1;
  if (biome === 'black-lava' || biome === 'wet-basalt' || biome === 'ash-slope' || biome === 'tuff-ridge') return 0.08;
  return 0.3;
}

// Flight/perch character per butterfly species. The sulphur is the loose,
// drunken flutterer of the arid lowlands; the fritillary is a sun-demanding
// speedster with long sails and open-winged basking.
const BUTTERFLY_SPECIES = {
  sulphur: {
    overcastFactor: 0.5, // tolerates light cloud
    cruiseBase: 0.32,
    cruiseVar: 0.18,
    glideSpeed: 0.55,
    flapBase: 3.4,
    flapVar: 0.7,
    burstFlap: 6,
    wander: 0.55,
    beatKick: 0.65,
    glideThreshold: 0.93,
    glideFold: 0.4,
    glideAmp: 0.12,
    flightFold: 0.16,
    flapAmp: 0.92,
    perchFoldBase: 1.38, // perches with wings closed upright...
    perchPump: -0.5, // ...pumping open occasionally
    perchMinWeight: 0.3,
    hatChance: 0.45,
    bob: 0.02,
    biomeWeight: pollinatorBiomeWeight,
  },
  fritillary: {
    overcastFactor: 0.85, // strict sun-lover: grounded under cloud
    cruiseBase: 0.5,
    cruiseVar: 0.2,
    glideSpeed: 0.78,
    flapBase: 4.3,
    flapVar: 0.6,
    burstFlap: 7,
    wander: 0.35, // faster and more direct than the sulphur
    beatKick: 0.35,
    glideThreshold: 0.86, // sails often and long
    glideFold: 0.3,
    glideAmp: 0.1,
    flightFold: 0.14,
    flapAmp: 0.82,
    perchFoldBase: 0.12, // basks with wings open flat...
    perchPump: 0.55, // ...closing partway in slow pulses
    perchMinWeight: 0.4,
    hatChance: 0.7,
    bob: 0.016,
    biomeWeight: fritillaryBiomeWeight,
  },
};

// Biome-weighted point near the player: rejection-sample a few times, then
// take whatever came up so the system degrades to "fewer, wider-ranging
// insects" on barren ground instead of piling up at the accept threshold.
function samplePollinatorAnchor(center, seed, zoneId, minRadius = 3, weightFn = pollinatorBiomeWeight) {
  let x = center.x;
  let z = center.z;
  let ground = center.y;
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
    const s = seed + attempt * 71.7;
    const angle = seededUnit(s) * Math.PI * 2;
    const radius = minRadius + Math.sqrt(seededUnit(s + 4.1)) * (ROAM_RADIUS - minRadius);
    x = center.x + Math.cos(angle) * radius;
    z = center.z + Math.sin(angle) * radius;
    ground = terrainHeight(x, z, zoneId);
    if (ground < WATER_LEVEL + 0.05) continue;
    const biome = terrainBiomeAt(x, z, ground, zoneId);
    if (seededUnit(s + 8.2) <= weightFn(biome)) break;
  }
  return { x, z, ground };
}

function beeGeometries() {
  // Chunky three-lobe body: head, furred thorax, long shining abdomen. The
  // real bee is ~2.5cm; this one is a touch larger so it reads at play
  // distance without becoming a prop.
  const head = new THREE.SphereGeometry(1, 9, 7);
  head.scale(0.006, 0.0055, 0.006);
  head.translate(0, 0.0005, 0.0185);
  const thorax = new THREE.SphereGeometry(1, 10, 8);
  thorax.scale(0.0115, 0.0105, 0.0125);
  thorax.translate(0, 0.001, 0.006);
  const abdomen = new THREE.SphereGeometry(1, 10, 8);
  abdomen.scale(0.0125, 0.011, 0.0175);
  abdomen.translate(0, 0, -0.0125);
  const body = mergeGeometries([head, thorax, abdomen], false);
  head.dispose();
  thorax.dispose();
  abdomen.dispose();

  // Wing ellipse hinged at x=0, extending +x, lying flat (XZ) with the body
  // forward along +z. Left wings reuse it via a mirrored instance matrix.
  const wing = new THREE.CircleGeometry(1, 10);
  wing.translate(1.02, 0, 0);
  wing.scale(0.0135, 0.0052, 1);
  wing.rotateX(-Math.PI / 2);
  return { body, wing };
}

function finishWingGeometry(shape, spanScale, chordScale) {
  const geo = new THREE.ShapeGeometry(shape, 7);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(
      i,
      (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x),
      (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y),
    );
  }
  uv.needsUpdate = true;
  geo.scale(spanScale, chordScale, 1);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function sulphurWingShape() {
  // Sulphur silhouette in XY: hinge along the y axis, span +x, head at -y.
  // Forewing point, shallow notch, rounded hindwing lobe.
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.36);
  shape.quadraticCurveTo(0.52, -0.55, 1.0, -0.3);
  shape.quadraticCurveTo(0.97, -0.02, 0.7, 0.14);
  shape.quadraticCurveTo(0.72, 0.42, 0.36, 0.54);
  shape.quadraticCurveTo(0.1, 0.52, 0, 0.34);
  shape.lineTo(0, -0.36);
  // Span 5.2cm per wing (slightly heroic), chord 4.6cm, flat in XZ,
  // forward +z to match the body frame.
  return finishWingGeometry(shape, 0.052, 0.046);
}

function fritillaryWingShape() {
  // Gulf fritillary: long, narrow, pointed forewing raked forward, deeper
  // notch, compact rounded hindwing.
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.32);
  shape.quadraticCurveTo(0.58, -0.6, 1.0, -0.44);
  shape.quadraticCurveTo(0.98, -0.16, 0.64, 0.04);
  shape.quadraticCurveTo(0.7, 0.32, 0.4, 0.48);
  shape.quadraticCurveTo(0.12, 0.48, 0, 0.3);
  shape.lineTo(0, -0.32);
  return finishWingGeometry(shape, 0.049, 0.042);
}

function sulphurWingTexture() {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = ctx.createRadialGradient(size * 0.22, size * 0.5, size * 0.05, size * 0.4, size * 0.5, size * 0.95);
  base.addColorStop(0, '#fbe98a');
  base.addColorStop(0.55, '#f4d64f');
  base.addColorStop(1, '#e0b52f');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Faint veins fanning out from the hinge.
  ctx.strokeStyle = 'rgba(150, 108, 30, 0.14)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(2, size * 0.5);
    ctx.quadraticCurveTo(size * 0.55, size * (0.14 + i * 0.14), size * 0.99, size * (0.06 + i * 0.17));
    ctx.stroke();
  }
  // Dusky outer margin at the wingtip (span = +u).
  const margin = ctx.createLinearGradient(size * 0.74, 0, size, 0);
  margin.addColorStop(0, 'rgba(122, 84, 26, 0)');
  margin.addColorStop(1, 'rgba(104, 68, 22, 0.55)');
  ctx.fillStyle = margin;
  ctx.fillRect(size * 0.74, 0, size * 0.26, size);
  // Discal spot.
  ctx.fillStyle = 'rgba(168, 116, 34, 0.7)';
  ctx.beginPath();
  ctx.ellipse(size * 0.46, size * 0.4, size * 0.035, size * 0.028, 0.3, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

// Flame-orange field, black veining and margin, and the signature molten
// silver spangles. The spots are duplicated onto an emissive map so they
// keep a metallic gleam in any light and catch the bloom pass in full sun.
function fritillaryWingTextures() {
  if (typeof document === 'undefined') return { map: null, emissiveMap: null };
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = ctx.createRadialGradient(size * 0.18, size * 0.5, size * 0.04, size * 0.42, size * 0.5, size * 0.98);
  base.addColorStop(0, '#f59a3a');
  base.addColorStop(0.5, '#ea7c1f');
  base.addColorStop(1, '#c85a10');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Black veins radiating from the hinge.
  ctx.strokeStyle = 'rgba(38, 22, 8, 0.5)';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.moveTo(2, size * 0.5);
    ctx.quadraticCurveTo(size * 0.5, size * (0.08 + i * 0.13), size * 0.99, size * (0.02 + i * 0.16));
    ctx.stroke();
  }
  // Solid dark outer margin with pale flecks along the forewing edge.
  const margin = ctx.createLinearGradient(size * 0.78, 0, size, 0);
  margin.addColorStop(0, 'rgba(40, 24, 8, 0)');
  margin.addColorStop(1, 'rgba(30, 18, 6, 0.85)');
  ctx.fillStyle = margin;
  ctx.fillRect(size * 0.78, 0, size * 0.22, size);
  // Scattered black spots on the disc.
  ctx.fillStyle = 'rgba(30, 18, 6, 0.8)';
  const spotSeeds = [[0.34, 0.22], [0.5, 0.34], [0.3, 0.52], [0.46, 0.6], [0.6, 0.18]];
  for (const [sx, sy] of spotSeeds) {
    ctx.beginPath();
    ctx.arc(size * sx, size * sy, size * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  // Silver spangles clustered toward the hindwing (v ~ rear half): pale
  // cores with a dark keyline, like drops of mercury set into the orange.
  const spangles = [
    [0.24, 0.72, 0.05, 0.03], [0.42, 0.78, 0.055, 0.032], [0.6, 0.72, 0.05, 0.03],
    [0.34, 0.62, 0.04, 0.026], [0.54, 0.6, 0.042, 0.026], [0.72, 0.62, 0.038, 0.024],
  ];
  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = emissiveCanvas.height = size;
  const ectx = emissiveCanvas.getContext('2d');
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, size, size);
  for (const [sx, sy, rx, ry] of spangles) {
    ctx.strokeStyle = 'rgba(30, 18, 6, 0.85)';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#e9eff5';
    ctx.beginPath();
    ctx.ellipse(size * sx, size * sy, size * rx, size * ry, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ectx.fillStyle = '#cfd9e4';
    ectx.beginPath();
    ectx.ellipse(size * sx, size * sy, size * rx * 0.8, size * ry * 0.8, -0.25, 0, Math.PI * 2);
    ectx.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 2;
  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

function createBeeState(index) {
  return {
    seed: index * 57.31 + 9.7,
    pos: new THREE.Vector3(0, -100, 0),
    home: new THREE.Vector3(0, -100, 0),
    hoverTarget: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    bank: 0,
    phase: 'hover', // hover | dart | descend | perch
    timer: 1 + index * 0.6,
    hoverShift: 0,
    flapPhase: index * 2.1,
    perchPoint: new THREE.Vector3(),
    restBlend: 0,
    placed: false,
  };
}

function createButterflyState(index, species, speciesIndex) {
  return {
    species,
    speciesIndex,
    seed: index * 83.17 + 4.3,
    pos: new THREE.Vector3(0, -100, 0),
    heading: index * 1.3,
    speed: 0.6,
    bank: 0,
    pitch: -0.15,
    altitude: 0.8,
    phase: 'fly', // fly | descend | perched | takeoff
    timer: 6 + index * 2.4,
    perchPoint: new THREE.Vector3(),
    perchMode: 'ground', // ground | darwin
    flapPhase: index * 1.7,
    flapFreq: 5,
    fold: 0.12, // current wing base angle
    glide: 0,
    burst: 0,
    beatKick: 0,
    lastBeat: 0,
    placed: false,
  };
}

export function Pollinators({ enabled = true }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const beeBodyRef = useRef(null);
  const beeWingRef = useRef(null);
  const beeGlintRef = useRef(null);
  const flyBodyRef = useRef(null);
  const flyWingRef = useRef(null);
  const fritBodyRef = useRef(null);
  const fritWingRef = useRef(null);
  const bees = useRef(Array.from({ length: BEE_COUNT }, (_, i) => createBeeState(i)));
  const flies = useRef([
    ...Array.from({ length: SULPHUR_COUNT }, (_, i) => createButterflyState(i, 'sulphur', i)),
    ...Array.from({ length: FRITILLARY_COUNT }, (_, i) => createButterflyState(SULPHUR_COUNT + i, 'fritillary', i)),
  ]);
  const beeGate = useRef(0);
  const flyGate = useRef(0);
  const fritGate = useRef(0);
  const centerScratch = useRef(new THREE.Vector3());
  const lastPlayerPos = useRef(new THREE.Vector3(Infinity, 0, Infinity));
  const playerStillTime = useRef(0);

  const assets = useMemo(() => {
    const bee = beeGeometries();
    const flyWing = sulphurWingShape();
    const fritWing = fritillaryWingShape();
    const flyBody = new THREE.SphereGeometry(1, 8, 6);
    flyBody.scale(0.0035, 0.0038, 0.017);
    const wingTexture = sulphurWingTexture();
    const fritTextures = fritillaryWingTextures();
    // Matte blue-black body — the real bee's blue lives in the wings, so the
    // body keeps only a whisper of emissive to survive distance dimming.
    const beeBodyMat = new THREE.MeshStandardMaterial({
      color: '#121219',
      roughness: 0.38,
      metalness: 0.35,
      emissive: '#0f2148',
      emissiveIntensity: 0.14,
    });
    const beeWingMat = new THREE.MeshPhysicalMaterial({
      color: '#35497d',
      transparent: true,
      opacity: 0.58,
      roughness: 0.16,
      metalness: 0.85,
      iridescence: 1,
      iridescenceIOR: 1.9,
      emissive: '#1c3576',
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const flyBodyMat = new THREE.MeshStandardMaterial({
      color: '#3d3423',
      roughness: 0.9,
      metalness: 0,
    });
    const flyWingMat = new THREE.MeshStandardMaterial({
      map: wingTexture || undefined,
      color: '#ffffff',
      roughness: 0.85,
      metalness: 0,
      emissive: '#57470f',
      emissiveIntensity: 0.32,
      side: THREE.DoubleSide,
    });
    const fritWingMat = new THREE.MeshStandardMaterial({
      map: fritTextures.map || undefined,
      color: '#ffffff',
      roughness: 0.7,
      metalness: 0,
      // The silver spangles live on the emissive map, so they gleam from any
      // angle and cross the bloom threshold in strong light.
      emissiveMap: fritTextures.emissiveMap || undefined,
      emissive: '#b8c6d6',
      emissiveIntensity: 0.85,
      side: THREE.DoubleSide,
    });
    // One camera-facing sparkle per bee: a half-vector glint against the live
    // sun (same trick as the terrain GroundSparkles) that flickers with the
    // wingbeat, so a flying bee throws little blue-white flashes.
    const glintGeo = new THREE.BufferGeometry();
    const glintPositions = new Float32Array(BEE_COUNT * 3);
    const glintSeeds = new Float32Array(BEE_COUNT);
    for (let i = 0; i < BEE_COUNT; i += 1) {
      glintPositions[i * 3 + 1] = -100;
      glintSeeds[i] = i * 19.73 + 7.7;
    }
    glintGeo.setAttribute('position', new THREE.BufferAttribute(glintPositions, 3));
    glintGeo.setAttribute('aSeed', new THREE.BufferAttribute(glintSeeds, 1));
    const glintMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
        uGate: { value: 0 },
        uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime;
        uniform vec3 uSun;
        uniform float uGate;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vBright;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vec3 viewDir = normalize(cameraPosition - position);
          vec3 hv = normalize(normalize(uSun) + viewDir);
          vec3 facet = normalize(vec3(sin(aSeed) * 0.22, 1.0, cos(aSeed) * 0.22));
          float glint = pow(max(dot(facet, hv), 0.0), 24.0);
          float flick = 0.5 + 0.5 * sin(uTime * (26.0 + fract(aSeed * 0.31) * 12.0) + aSeed);
          float intensity = glint * flick * uGate;
          vAlpha = clamp(intensity * 1.7, 0.0, 1.0);
          vBright = 1.1 + intensity * 1.8;
          float perspective = clamp(160.0 / max(1.0, -mvPosition.z), 10.0, 110.0);
          gl_PointSize = (0.018 + glint * 0.03) * perspective * uPixelRatio;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */`
        varying float vAlpha;
        varying float vBright;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float core = smoothstep(0.32, 0.03, d);
          float star = max(
            smoothstep(0.5, 0.0, abs(c.x)) * smoothstep(0.1, 0.0, abs(c.y)),
            smoothstep(0.5, 0.0, abs(c.y)) * smoothstep(0.1, 0.0, abs(c.x))
          ) * 0.5;
          float a = (core + star) * vAlpha;
          if (a < 0.006) discard;
          gl_FragColor = vec4(vec3(0.78, 0.88, 1.18) * vBright, a);
        }
      `,
    });
    return {
      bee, flyWing, fritWing, flyBody, wingTexture, fritTextures,
      beeBodyMat, beeWingMat, flyBodyMat, flyWingMat, fritWingMat,
      glintGeo, glintMat, glintPositions,
    };
  }, []);

  useEffect(() => () => {
    assets.bee.body.dispose();
    assets.bee.wing.dispose();
    assets.flyWing.dispose();
    assets.fritWing.dispose();
    assets.flyBody.dispose();
    assets.wingTexture?.dispose?.();
    assets.fritTextures.map?.dispose?.();
    assets.fritTextures.emissiveMap?.dispose?.();
    assets.beeBodyMat.dispose();
    assets.beeWingMat.dispose();
    assets.flyBodyMat.dispose();
    assets.flyWingMat.dispose();
    assets.fritWingMat.dispose();
    assets.glintGeo.dispose();
    assets.glintMat.dispose();
  }, [assets]);

  useEffect(() => {
    bees.current.forEach(bee => { bee.placed = false; });
    flies.current.forEach(fly => { fly.placed = false; });
  }, [currentZoneId]);

  function writeInsect({ bodyMesh, wingMesh, index, pos, yaw, pitch, bank, scale, flapAngle, sweepYaw, wingLift, wingForward }) {
    _bodyPos.copy(pos);
    _bodyEuler.set(pitch, yaw, bank);
    _bodyQuat.setFromEuler(_bodyEuler);
    _bodyScale.setScalar(Math.max(scale, 0.0001));
    _bodyMatrix.compose(_bodyPos, _bodyQuat, _bodyScale);
    bodyMesh.setMatrixAt(index, _bodyMatrix);
    for (let side = 0; side < 2; side += 1) {
      const sign = side === 0 ? 1 : -1;
      _wingPos.set(0, wingLift, wingForward);
      _wingEuler.set(0, sweepYaw * sign, flapAngle * sign);
      _wingQuat.setFromEuler(_wingEuler);
      _wingScale.set(sign, 1, 1);
      _wingLocal.compose(_wingPos, _wingQuat, _wingScale);
      _wingMatrix.multiplyMatrices(_bodyMatrix, _wingLocal);
      wingMesh.setMatrixAt(index * 2 + side, _wingMatrix);
    }
  }

  useFrame(({ clock, camera }, delta) => {
    const dt = Math.min(delta, 0.05);
    const { timeOfDay, day } = useThreeGameStore.getState();
    const sky = skyState(timeOfDay ?? 12, day || 1);
    const dry = Math.max(0, 1 - weatherEnv.rainIntensity);
    // Carpenter bees want real sun; sulphurs stay out under light cloud;
    // fritillaries are the strictest sun-lovers and ground under overcast.
    const beeTarget = enabled ? sky.daylight * dry * Math.max(0, 1 - weatherEnv.overcast * 0.75) : 0;
    const flyTarget = enabled
      ? sky.daylight * dry * Math.max(0, 1 - weatherEnv.overcast * BUTTERFLY_SPECIES.sulphur.overcastFactor)
      : 0;
    const fritTarget = enabled
      ? sky.daylight * dry * Math.max(0, 1 - weatherEnv.overcast * BUTTERFLY_SPECIES.fritillary.overcastFactor)
      : 0;
    beeGate.current = THREE.MathUtils.damp(beeGate.current, beeTarget, 2.2, dt);
    flyGate.current = THREE.MathUtils.damp(flyGate.current, flyTarget, 2.2, dt);
    fritGate.current = THREE.MathUtils.damp(fritGate.current, fritTarget, 2.2, dt);

    const beeVisible = beeGate.current > 0.02;
    const flyVisible = flyGate.current > 0.02;
    const fritVisible = fritGate.current > 0.02;
    if (beeBodyRef.current) beeBodyRef.current.visible = beeVisible;
    if (beeWingRef.current) beeWingRef.current.visible = beeVisible;
    if (beeGlintRef.current) beeGlintRef.current.visible = beeVisible;
    if (flyBodyRef.current) flyBodyRef.current.visible = flyVisible;
    if (flyWingRef.current) flyWingRef.current.visible = flyVisible;
    if (fritBodyRef.current) fritBodyRef.current.visible = fritVisible;
    if (fritWingRef.current) fritWingRef.current.visible = fritVisible;
    if (!beeVisible && !flyVisible && !fritVisible) return;

    const pose = getRuntimePlayerPose();
    const player = pose.position || { x: camera.position.x, y: 0, z: camera.position.z };
    const center = centerScratch.current.set(player.x, player.y || 0, player.z);
    const t = clock.elapsedTime;

    // Stillness tracking for the hat-perch moment: a butterfly will only
    // consider landing on Darwin after he has been standing quietly a while.
    const moved = Number.isFinite(lastPlayerPos.current.x)
      ? Math.hypot(center.x - lastPlayerPos.current.x, center.z - lastPlayerPos.current.z)
      : 0;
    const playerSpeed = moved / Math.max(dt, 0.001);
    lastPlayerPos.current.copy(center);
    playerStillTime.current = playerSpeed < 0.12 ? playerStillTime.current + dt : 0;

    if (beeVisible && beeBodyRef.current && beeWingRef.current) {
      for (let i = 0; i < BEE_COUNT; i += 1) {
        const bee = bees.current[i];
        const rehomeSq = (bee.pos.x - center.x) ** 2 + (bee.pos.z - center.z) ** 2;
        if (!bee.placed || rehomeSq > REHOME_DISTANCE * REHOME_DISTANCE) {
          const anchor = samplePollinatorAnchor(center, bee.seed + t, currentZoneId, 5);
          bee.home.set(anchor.x, anchor.ground + 0.5 + seededUnit(bee.seed + 3.3) * 1.1, anchor.z);
          bee.pos.copy(bee.home);
          bee.hoverTarget.copy(bee.home);
          bee.phase = 'hover';
          bee.timer = 1 + seededUnit(bee.seed + 5.5) * 2;
          bee.placed = true;
        }

        bee.timer -= dt;
        if (bee.phase === 'hover') {
          // Micro-drift of the hover point every ~0.9s, on top of a light
          // tremor — hanging in the air, never quite still, but readable.
          const shiftIndex = Math.floor(t * 1.1 + bee.seed);
          if (shiftIndex !== bee.hoverShift) {
            bee.hoverShift = shiftIndex;
            bee.hoverTarget.set(
              bee.home.x + (seededUnit(shiftIndex + bee.seed) - 0.5) * 0.9,
              bee.home.y + (seededUnit(shiftIndex + bee.seed + 2.2) - 0.5) * 0.4,
              bee.home.z + (seededUnit(shiftIndex + bee.seed + 4.4) - 0.5) * 0.9,
            );
          }
          bee.pos.x = THREE.MathUtils.damp(bee.pos.x, bee.hoverTarget.x, 3.2, dt) + Math.sin(t * 9 + bee.seed) * 0.005;
          bee.pos.y = THREE.MathUtils.damp(bee.pos.y, bee.hoverTarget.y, 3.2, dt) + Math.sin(t * 12 + bee.seed * 2) * 0.004;
          bee.pos.z = THREE.MathUtils.damp(bee.pos.z, bee.hoverTarget.z, 3.2, dt) + Math.cos(t * 8 + bee.seed) * 0.005;
          const wantYaw = Math.atan2(bee.hoverTarget.x - bee.pos.x, bee.hoverTarget.z - bee.pos.z);
          bee.yaw += Math.sin(wantYaw - bee.yaw) * Math.min(1, dt * 4);
          bee.bank = THREE.MathUtils.damp(bee.bank, 0, 6, dt);
          if (bee.timer <= 0) {
            if (seededUnit(bee.seed + t * 3.1) < 0.4) {
              // Settle onto a leaf/stem below-ish: carpenter bees spend real
              // time parked on vegetation, and a still bee is a visible bee.
              const ground = terrainHeight(bee.pos.x, bee.pos.z, currentZoneId);
              bee.perchPoint.set(
                bee.pos.x + (seededUnit(bee.seed + t) - 0.5) * 0.6,
                Math.max(ground, WATER_LEVEL) + 0.12 + seededUnit(bee.seed + t + 1.7) * 0.45,
                bee.pos.z + (seededUnit(bee.seed + t + 3.4) - 0.5) * 0.6,
              );
              bee.phase = 'descend';
            } else {
              const anchor = samplePollinatorAnchor(center, bee.seed + t * 7.7, currentZoneId, 3);
              bee.home.set(anchor.x, anchor.ground + 0.45 + seededUnit(bee.seed + t) * 1.2, anchor.z);
              bee.phase = 'dart';
            }
          }
        } else if (bee.phase === 'descend') {
          bee.pos.x = THREE.MathUtils.damp(bee.pos.x, bee.perchPoint.x, 2.6, dt);
          bee.pos.y = THREE.MathUtils.damp(bee.pos.y, bee.perchPoint.y, 2.6, dt);
          bee.pos.z = THREE.MathUtils.damp(bee.pos.z, bee.perchPoint.z, 2.6, dt);
          bee.bank = THREE.MathUtils.damp(bee.bank, 0, 6, dt);
          if (Math.abs(bee.pos.y - bee.perchPoint.y) < 0.04) {
            bee.phase = 'perch';
            bee.timer = 1.8 + seededUnit(bee.seed + t) * 3.4;
          }
        } else if (bee.phase === 'perch') {
          // Motionless on the plant, wings folded flat along the back.
          bee.bank = THREE.MathUtils.damp(bee.bank, 0, 6, dt);
          if (bee.timer <= 0) {
            bee.phase = 'hover';
            bee.timer = 1.6 + seededUnit(bee.seed + t) * 2.4;
            bee.home.set(bee.pos.x, bee.pos.y + 0.5, bee.pos.z);
            bee.hoverTarget.copy(bee.home);
          }
        } else {
          // Dart: a brisk, slightly banked line to the next patch — quick
          // enough to feel purposeful, slow enough for the eye to follow.
          const dx = bee.home.x - bee.pos.x;
          const dy = bee.home.y - bee.pos.y;
          const dz = bee.home.z - bee.pos.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist < 0.2) {
            bee.phase = 'hover';
            bee.timer = 2 + seededUnit(bee.seed + t) * 3;
            bee.hoverTarget.copy(bee.home);
          } else {
            const speed = Math.min(2.2, 0.7 + dist * 0.85);
            const step = Math.min(dist, speed * dt);
            bee.pos.x += (dx / dist) * step;
            bee.pos.y += (dy / dist) * step;
            bee.pos.z += (dz / dist) * step;
            const wantYaw = Math.atan2(dx, dz);
            const turn = Math.sin(wantYaw - bee.yaw);
            bee.yaw += turn * Math.min(1, dt * 6);
            bee.bank = THREE.MathUtils.damp(bee.bank, -turn * 0.5, 8, dt);
          }
        }

        // Personal space: a close player rouses hovering or perched bees.
        const px = bee.pos.x - center.x;
        const pz = bee.pos.z - center.z;
        const playerDistSq = px * px + pz * pz;
        if (playerDistSq < 1.7 * 1.7 && (bee.phase === 'hover' || bee.phase === 'perch')) {
          const away = Math.atan2(px, pz);
          bee.home.set(
            bee.pos.x + Math.sin(away) * 4,
            bee.pos.y + 0.6,
            bee.pos.z + Math.cos(away) * 4,
          );
          bee.phase = 'dart';
        }

        if (bee.phase !== 'perch' && bee.phase !== 'descend') {
          const ground = terrainHeight(bee.pos.x, bee.pos.z, currentZoneId);
          bee.pos.y = Math.max(bee.pos.y, Math.max(ground, WATER_LEVEL) + 0.18);
        }

        bee.restBlend = THREE.MathUtils.damp(bee.restBlend, bee.phase === 'perch' ? 1 : 0, 7, dt);
        bee.flapPhase += dt * Math.PI * 2 * (bee.phase === 'dart' ? 27 : 21) * (1 - bee.restBlend * 0.98);
        const flap = THREE.MathUtils.lerp(Math.sin(bee.flapPhase) * 0.85 + 0.18, 0.05, bee.restBlend);
        // Feed the sparkle point riding just above the thorax; perched bees
        // stop flashing (flick gate) but still catch the odd static glint.
        assets.glintPositions[i * 3] = bee.pos.x;
        assets.glintPositions[i * 3 + 1] = bee.pos.y + 0.012;
        assets.glintPositions[i * 3 + 2] = bee.pos.z;
        writeInsect({
          bodyMesh: beeBodyRef.current,
          wingMesh: beeWingRef.current,
          index: i,
          pos: bee.pos,
          yaw: bee.yaw,
          pitch: bee.phase === 'dart' ? 0.24 : 0.05,
          bank: bee.bank,
          scale: beeGate.current,
          flapAngle: flap,
          sweepYaw: 0.5,
          wingLift: 0.008,
          wingForward: 0.008,
        });
      }
      beeBodyRef.current.instanceMatrix.needsUpdate = true;
      beeWingRef.current.instanceMatrix.needsUpdate = true;
      assets.glintGeo.attributes.position.needsUpdate = true;
      assets.glintMat.uniforms.uTime.value = t;
      assets.glintMat.uniforms.uGate.value = beeGate.current;
      const sun = sunDirection(timeOfDay ?? 12);
      assets.glintMat.uniforms.uSun.value.set(sun[0], sun[1], sun[2]);
    }

    if ((flyVisible || fritVisible) && flyBodyRef.current && flyWingRef.current && fritBodyRef.current && fritWingRef.current) {
      for (let i = 0; i < flies.current.length; i += 1) {
        const fly = flies.current[i];
        const sp = BUTTERFLY_SPECIES[fly.species];
        const gate = fly.species === 'fritillary' ? fritGate.current : flyGate.current;
        if (gate <= 0.02) continue;
        const bodyMesh = fly.species === 'fritillary' ? fritBodyRef.current : flyBodyRef.current;
        const wingMesh = fly.species === 'fritillary' ? fritWingRef.current : flyWingRef.current;
        const rehomeSq = (fly.pos.x - center.x) ** 2 + (fly.pos.z - center.z) ** 2;
        if (!fly.placed || rehomeSq > REHOME_DISTANCE * REHOME_DISTANCE) {
          const anchor = samplePollinatorAnchor(center, fly.seed + t, currentZoneId, 4, sp.biomeWeight);
          fly.pos.set(anchor.x, anchor.ground + 0.5 + seededUnit(fly.seed + 2.8) * 0.9, anchor.z);
          fly.altitude = fly.pos.y;
          fly.heading = seededUnit(fly.seed + t) * Math.PI * 2;
          fly.phase = 'fly';
          fly.timer = 6 + seededUnit(fly.seed + 6.1) * 10;
          fly.placed = true;
        }

        fly.timer -= dt;
        fly.burst = Math.max(0, fly.burst - dt);

        if (fly.phase === 'perched') {
          // Basking: wings folded upright, breathing slightly, with a slow
          // pump open-and-close every couple of seconds.
          const pump = Math.pow(Math.max(0, Math.sin(t * 0.9 + fly.seed)), 6);
          fly.fold = THREE.MathUtils.damp(fly.fold, sp.perchFoldBase + pump * sp.perchPump, 5, dt);
          fly.pitch = THREE.MathUtils.damp(fly.pitch, -0.05, 4, dt);
          fly.bank = THREE.MathUtils.damp(fly.bank, 0, 4, dt);
          const px = fly.pos.x - center.x;
          const pz = fly.pos.z - center.z;
          let startle;
          if (fly.perchMode === 'darwin') {
            // Riding on Darwin's head: stay glued to him, leave when he moves.
            const crownGround = terrainHeight(center.x, center.z, currentZoneId);
            fly.pos.set(fly.perchPoint.x + center.x, crownGround + fly.perchPoint.y, fly.perchPoint.z + center.z);
            startle = playerSpeed > 0.3;
          } else {
            startle = px * px + pz * pz < 1.6 * 1.6;
          }
          if (fly.timer <= 0 || startle) {
            fly.phase = 'takeoff';
            fly.timer = 0.7;
            fly.burst = startle ? 1 : 0.5;
            fly.altitude = fly.pos.y;
            fly.perchMode = 'ground';
            if (startle) fly.heading = Math.atan2(px, pz);
          }
        } else {
          // Airborne (fly / descend / takeoff): fluttering random walk.
          // Sulphurs throw a little steering kick on each downstroke — that
          // per-beat zigzag is what makes the flight read as butterfly.
          fly.flapFreq = fly.phase === 'takeoff' || fly.burst > 0
            ? sp.burstFlap
            : sp.flapBase + Math.sin(t * 0.37 + fly.seed) * sp.flapVar;
          if (fly.glide > 0) {
            fly.glide -= dt;
            fly.flapFreq = 0.6;
          } else if (fly.phase === 'fly' && seededUnit(Math.floor(t * 0.5) + fly.seed) > sp.glideThreshold) {
            fly.glide = 0.5 + seededUnit(fly.seed + t) * 0.4;
          }
          fly.flapPhase += dt * Math.PI * 2 * fly.flapFreq;
          const beat = Math.floor(fly.flapPhase / (Math.PI * 2));
          if (beat !== fly.lastBeat) {
            fly.lastBeat = beat;
            fly.beatKick = (seededUnit(beat + fly.seed) - 0.5) * sp.beatKick;
          }
          const wander = Math.sin(t * 0.53 + fly.seed) + Math.sin(t * 1.31 + fly.seed * 2.3) * 0.5;
          let turnRate = wander * sp.wander + fly.beatKick;
          // Keep them loosely orbiting the player without homing behavior.
          const px = fly.pos.x - center.x;
          const pz = fly.pos.z - center.z;
          const playerDist = Math.hypot(px, pz);
          if (playerDist > ROAM_RADIUS) {
            const homeYaw = Math.atan2(-px, -pz);
            turnRate += Math.sin(homeYaw - fly.heading) * 2.2;
          } else if (playerDist < 1.1 && fly.burst <= 0) {
            fly.burst = 1.2;
            fly.heading = Math.atan2(px, pz);
          }
          fly.heading += turnRate * dt;

          fly.speed = THREE.MathUtils.damp(
            fly.speed,
            (fly.glide > 0 ? sp.glideSpeed : sp.cruiseBase + seededUnit(Math.floor(t) + fly.seed) * sp.cruiseVar) + fly.burst * 0.5,
            3,
            dt,
          );
          fly.pos.x += Math.sin(fly.heading) * fly.speed * dt;
          fly.pos.z += Math.cos(fly.heading) * fly.speed * dt;

          const ground = terrainHeight(fly.pos.x, fly.pos.z, currentZoneId);
          const floor = Math.max(ground, WATER_LEVEL);
          if (fly.phase === 'descend') {
            let tx = fly.perchPoint.x;
            let ty = fly.perchPoint.y;
            let tz = fly.perchPoint.z;
            if (fly.perchMode === 'darwin') {
              // perchPoint holds an offset from the player while targeting
              // Darwin, so a last-second shuffle doesn't strand the landing.
              const crownGround = terrainHeight(center.x, center.z, currentZoneId);
              tx = center.x + fly.perchPoint.x;
              ty = crownGround + fly.perchPoint.y;
              tz = center.z + fly.perchPoint.z;
              if (playerSpeed > 0.3) {
                fly.phase = 'fly';
                fly.perchMode = 'ground';
                fly.timer = 5;
              }
            }
            fly.pos.x = THREE.MathUtils.damp(fly.pos.x, tx, 2.2, dt);
            fly.pos.y = THREE.MathUtils.damp(fly.pos.y, ty, 2.2, dt);
            fly.pos.z = THREE.MathUtils.damp(fly.pos.z, tz, 2.2, dt);
            fly.speed = 0.12;
            if (fly.phase === 'descend' && Math.abs(fly.pos.y - ty) < 0.05 && Math.hypot(fly.pos.x - tx, fly.pos.z - tz) < 0.08) {
              fly.phase = 'perched';
              fly.timer = 2.5 + seededUnit(fly.seed + t) * 3.5;
              fly.pos.set(tx, ty, tz);
            }
          } else {
            const bobTarget = floor
              + 0.4 + (Math.sin(t * 0.21 + fly.seed) * 0.5 + 0.5) * 0.95
              + (fly.phase === 'takeoff' ? 0.4 : 0);
            fly.altitude = THREE.MathUtils.damp(fly.altitude, bobTarget, 1.6, dt);
            fly.pos.y = fly.altitude + Math.sin(fly.flapPhase) * sp.bob;
            fly.pos.y = Math.max(fly.pos.y, floor + 0.12);
            if (fly.phase === 'takeoff' && fly.timer <= 0) {
              fly.phase = 'fly';
              fly.timer = 7 + seededUnit(fly.seed + t) * 11;
            }
            // Time to land? Prefer a still Darwin standing nearby; otherwise
            // settle on grass tips, shrub tops, or rocks — never over water.
            if (fly.phase === 'fly' && fly.timer <= 0) {
              const hatReady = playerStillTime.current > 5
                && playerDist < 6
                && seededUnit(fly.seed + Math.floor(t)) > sp.hatChance;
              if (hatReady) {
                // Darwin is bare-headed: settle into his hair at the crown.
                fly.perchMode = 'darwin';
                fly.perchPoint.set(
                  (seededUnit(fly.seed + t) - 0.5) * 0.08,
                  1.7 + seededUnit(fly.seed + t + 2.2) * 0.04,
                  (seededUnit(fly.seed + t + 4.4) - 0.5) * 0.08,
                );
                fly.phase = 'descend';
              } else if (ground > WATER_LEVEL + 0.1) {
                const biome = terrainBiomeAt(fly.pos.x, fly.pos.z, ground, currentZoneId);
                if (sp.biomeWeight(biome) >= sp.perchMinWeight) {
                  fly.perchMode = 'ground';
                  fly.perchPoint.set(
                    fly.pos.x,
                    ground + 0.03 + seededUnit(fly.seed + t + 5.1) * 0.5,
                    fly.pos.z,
                  );
                  fly.phase = 'descend';
                } else {
                  fly.timer = 2.5;
                }
              } else {
                fly.timer = 2.5;
              }
            }
          }

          const flapWave = Math.sin(fly.flapPhase);
          fly.fold = THREE.MathUtils.damp(
            fly.fold,
            fly.glide > 0 ? sp.glideFold : sp.flightFold,
            6,
            dt,
          );
          fly.bank = THREE.MathUtils.damp(fly.bank, -turnRate * 0.3, 5, dt);
          fly.pitch = THREE.MathUtils.damp(fly.pitch, -0.16 - flapWave * 0.05, 6, dt);
        }

        const flapAngle = fly.phase === 'perched'
          ? fly.fold
          : fly.fold + Math.sin(fly.flapPhase) * (fly.glide > 0 ? sp.glideAmp : sp.flapAmp);
        writeInsect({
          bodyMesh,
          wingMesh,
          index: fly.speciesIndex,
          pos: fly.pos,
          yaw: fly.heading,
          pitch: fly.pitch,
          bank: fly.bank,
          scale: gate,
          flapAngle,
          sweepYaw: 0,
          wingLift: 0.003,
          wingForward: 0,
        });
      }
      flyBodyRef.current.instanceMatrix.needsUpdate = true;
      flyWingRef.current.instanceMatrix.needsUpdate = true;
      fritBodyRef.current.instanceMatrix.needsUpdate = true;
      fritWingRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group userData={{ renderSource: 'pollinators', renderLabel: 'Carpenter bees, sulphur and fritillary butterflies', renderKind: 'ambient-microfauna', noReflect: true }}>
      <instancedMesh
        ref={beeBodyRef}
        args={[assets.bee.body, assets.beeBodyMat, BEE_COUNT]}
        frustumCulled={false}
        visible={false}
      />
      <instancedMesh
        ref={beeWingRef}
        args={[assets.bee.wing, assets.beeWingMat, BEE_COUNT * 2]}
        frustumCulled={false}
        visible={false}
      />
      <points
        ref={beeGlintRef}
        geometry={assets.glintGeo}
        material={assets.glintMat}
        frustumCulled={false}
        visible={false}
        renderOrder={2}
      />
      <instancedMesh
        ref={flyBodyRef}
        args={[assets.flyBody, assets.flyBodyMat, SULPHUR_COUNT]}
        frustumCulled={false}
        visible={false}
      />
      <instancedMesh
        ref={flyWingRef}
        args={[assets.flyWing, assets.flyWingMat, SULPHUR_COUNT * 2]}
        frustumCulled={false}
        visible={false}
      />
      <instancedMesh
        ref={fritBodyRef}
        args={[assets.flyBody, assets.flyBodyMat, FRITILLARY_COUNT]}
        frustumCulled={false}
        visible={false}
      />
      <instancedMesh
        ref={fritWingRef}
        args={[assets.fritWing, assets.fritWingMat, FRITILLARY_COUNT * 2]}
        frustumCulled={false}
        visible={false}
      />
    </group>
  );
}
