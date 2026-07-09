'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { DEFAULT_PLAYER_MODEL_ASSET_ID } from '../../modelAssets';
import { ModelAsset } from '../assets/ModelAsset';
import { PLAYER, SPRINT, SWIM } from './playerConfig';
import { attachToBone } from './handAttachment';
import { calibratedStrideTimeScale } from './gaitProfiles';
import { darwin5ClipDuration } from './darwin5AnimationManifest.mjs';
import { SHOTGUN } from '../../shooting/shotgunConfig';
import { shotgunAimState } from '../../shooting/aimState';

const RIGHT_HAND = /righthand$/i;
const LEFT_HAND = /lefthand$/i;
const LEFT_INDEX_FINGER = /lefthandindex2$/i;

const LAMP_MODEL_PATH = '/assets/models/oil-lamp.glb';
// Tunables — the lamp mesh's grip pose may need adjusting in-game.
const LAMP_TARGET_HEIGHT = 0.26;   // desired world height of the lamp, metres
const LAMP_LOCAL_OFFSET = [0.04, 0.02, 0.0]; // hand-local position, world metres
const LAMP_LIGHT_COLOR = '#ffb867';
const LAMP_LIGHT_INTENSITY = 2.5;  // at deep night (was 6.0 — blew out the body at point-blank range)
const LAMP_LIGHT_DISTANCE = 8.0;
const LAMP_ATTACHMENT = {
  default: {
    position: LAMP_LOCAL_OFFSET,
  },
  // Darwin4's idle hand hangs naturally open; put the lantern's bail just below
  // the fingers instead of clipping the wrist/cuff.
  darwin4: {
    bone: LEFT_INDEX_FINGER,
    position: [0.0, -0.018, 0.0],
  },
};

const BUTTERFLY_NET_VISUAL = 'butterflyNet';
const SNARE_COIL_VISUAL = 'snareCoil';
const BUTTERFLY_NET_SEGMENTS = 20;
const BUTTERFLY_NET_RINGS = 7;
const BUTTERFLY_NET_WORLD_DOWN = new THREE.Vector3(0, -1, 0);
const BUTTERFLY_NET_HOOP_CENTER_Z = -0.94;
const BUTTERFLY_NET_HOOP_RADIUS_X = 0.118;
const BUTTERFLY_NET_HOOP_RADIUS_Z = 0.162;
// Pole tools are authored with their shaft along local -Z. Darwin5's held-tool
// idle wrist points downward, so body-orient them: keep the right hand as the
// pivot, align the shaft to body-local +Z, and roll the hoop plane upright.
const DARWIN5_POLE_BODY_CARRY_EULER = [-0.18, Math.PI, Math.PI / 2];
const DARWIN5_POLE_GRIP_OFFSET = [0.0, 0.014, -0.015];
const DARWIN5_SNARE_COIL_GRIP_OFFSET = [0.018, 0.052, -0.016];
const DARWIN5_SNARE_COIL_GRIP_EULER = [0, 0.32, 0];
const SNARE_NOOSE_POINTS = Object.freeze([
  new THREE.Vector3(0.006, -0.018, 0),
  new THREE.Vector3(0.064, -0.13, 0.018),
  new THREE.Vector3(0.035, -0.285, 0.006),
  new THREE.Vector3(-0.055, -0.18, -0.014),
  new THREE.Vector3(-0.018, -0.04, -0.004),
]);

function createNetAlphaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let offset = -128; offset <= 256; offset += 18) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + 128, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(offset, 128);
    ctx.lineTo(offset + 128, 0);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.8, 2.2);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createButterflyNetVisual() {
  const group = new THREE.Group();
  group.name = 'proceduralButterflyNet';
  const disposables = [];

  const handleMaterial = new THREE.MeshStandardMaterial({
    color: '#8f6b43',
    roughness: 0.82,
    metalness: 0.02,
  });
  const wrapMaterial = new THREE.MeshStandardMaterial({
    color: '#5f4b32',
    roughness: 0.9,
  });
  const hoopMaterial = new THREE.MeshStandardMaterial({
    color: '#d8ccb0',
    roughness: 0.7,
    metalness: 0.08,
  });
  const alphaMap = createNetAlphaTexture();
  const netMaterial = new THREE.MeshStandardMaterial({
    color: '#d8d2bd',
    alphaMap,
    alphaTest: 0.42,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  disposables.push(handleMaterial, wrapMaterial, hoopMaterial, alphaMap, netMaterial);

  const handleGeometry = new THREE.CylinderGeometry(0.011, 0.013, 0.78, 10);
  handleGeometry.rotateX(Math.PI / 2);
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  handle.name = 'butterflyNetHandle';
  handle.position.z = -0.39;
  handle.castShadow = true;
  group.add(handle);
  disposables.push(handleGeometry);

  const gripGeometry = new THREE.CylinderGeometry(0.017, 0.016, 0.16, 10);
  gripGeometry.rotateX(Math.PI / 2);
  const grip = new THREE.Mesh(gripGeometry, wrapMaterial);
  grip.name = 'butterflyNetGrip';
  grip.position.z = -0.075;
  grip.castShadow = true;
  group.add(grip);
  disposables.push(gripGeometry);

  const collarGeometry = new THREE.CylinderGeometry(0.018, 0.015, 0.055, 12);
  collarGeometry.rotateX(Math.PI / 2);
  const collar = new THREE.Mesh(collarGeometry, hoopMaterial);
  collar.name = 'butterflyNetCollar';
  collar.position.z = -0.765;
  collar.castShadow = true;
  group.add(collar);
  disposables.push(collarGeometry);

  const hoopGeometry = new THREE.TorusGeometry(0.145, 0.0065, 8, 40);
  const hoop = new THREE.Mesh(hoopGeometry, hoopMaterial);
  hoop.name = 'butterflyNetHoop';
  hoop.position.z = BUTTERFLY_NET_HOOP_CENTER_Z;
  hoop.rotation.x = Math.PI / 2;
  hoop.scale.set(0.82, 1.12, 1);
  hoop.castShadow = true;
  group.add(hoop);
  disposables.push(hoopGeometry);

  const vertexCount = BUTTERFLY_NET_SEGMENTS * BUTTERFLY_NET_RINGS;
  const basePositions = new Float32Array(vertexCount * 3);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = [];
  for (let ring = 0; ring < BUTTERFLY_NET_RINGS; ring += 1) {
    const t = ring / (BUTTERFLY_NET_RINGS - 1);
    const radiusX = THREE.MathUtils.lerp(BUTTERFLY_NET_HOOP_RADIUS_X, 0.026, t);
    const radiusZ = THREE.MathUtils.lerp(BUTTERFLY_NET_HOOP_RADIUS_Z, 0.032, t);
    const normalPocket = -0.04 * Math.sin(t * Math.PI);
    const rimPull = 0.045 * t * t;
    for (let seg = 0; seg < BUTTERFLY_NET_SEGMENTS; seg += 1) {
      const theta = (seg / BUTTERFLY_NET_SEGMENTS) * Math.PI * 2;
      const idx = ring * BUTTERFLY_NET_SEGMENTS + seg;
      const p = idx * 3;
      const u = idx * 2;
      basePositions[p] = Math.cos(theta) * radiusX;
      basePositions[p + 1] = normalPocket;
      basePositions[p + 2] = BUTTERFLY_NET_HOOP_CENTER_Z + Math.sin(theta) * radiusZ + rimPull;
      positions[p] = basePositions[p];
      positions[p + 1] = basePositions[p + 1];
      positions[p + 2] = basePositions[p + 2];
      uvs[u] = seg / BUTTERFLY_NET_SEGMENTS;
      uvs[u + 1] = t;
    }
  }
  for (let ring = 0; ring < BUTTERFLY_NET_RINGS - 1; ring += 1) {
    for (let seg = 0; seg < BUTTERFLY_NET_SEGMENTS; seg += 1) {
      const a = ring * BUTTERFLY_NET_SEGMENTS + seg;
      const b = ring * BUTTERFLY_NET_SEGMENTS + ((seg + 1) % BUTTERFLY_NET_SEGMENTS);
      const c = (ring + 1) * BUTTERFLY_NET_SEGMENTS + seg;
      const d = (ring + 1) * BUTTERFLY_NET_SEGMENTS + ((seg + 1) % BUTTERFLY_NET_SEGMENTS);
      indices.push(a, c, b, b, c, d);
    }
  }
  const bagGeometry = new THREE.BufferGeometry();
  bagGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  bagGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  bagGeometry.setIndex(indices);
  bagGeometry.computeVertexNormals();
  const bag = new THREE.Mesh(bagGeometry, netMaterial);
  bag.name = 'butterflyNetSoftBag';
  bag.castShadow = false;
  bag.receiveShadow = false;
  group.add(bag);
  disposables.push(bagGeometry);

  return {
    object: group,
    bag,
    basePositions,
    gravityLocal: new THREE.Vector3(0, -1, 0),
    worldQuaternion: new THREE.Quaternion(),
    worldInverseQuaternion: new THREE.Quaternion(),
    worldPosition: new THREE.Vector3(),
    previousWorldPosition: new THREE.Vector3(),
    worldDelta: new THREE.Vector3(),
    dragLocal: new THREE.Vector3(),
    dragTargetLocal: new THREE.Vector3(),
    hasPreviousWorldPosition: false,
    lastUpdateTime: null,
    phase: Math.random() * Math.PI * 2,
    dispose: () => disposables.forEach(item => item.dispose?.()),
  };
}

function createSnareCoilVisual() {
  const group = new THREE.Group();
  group.name = 'proceduralSnareCoil';
  const disposables = [];
  const twineMaterial = new THREE.MeshStandardMaterial({
    color: '#b08a55',
    roughness: 0.94,
    metalness: 0.02,
  });
  const darkTwineMaterial = new THREE.MeshStandardMaterial({
    color: '#6f5433',
    roughness: 0.96,
    metalness: 0.01,
  });
  const waxMaterial = new THREE.MeshStandardMaterial({
    color: '#d1b56e',
    roughness: 0.72,
    metalness: 0.05,
  });
  const pegMaterial = new THREE.MeshStandardMaterial({
    color: '#5f3f22',
    roughness: 0.9,
  });
  disposables.push(twineMaterial, darkTwineMaterial, waxMaterial, pegMaterial);

  for (let index = 0; index < 3; index += 1) {
    const coilGeometry = new THREE.TorusGeometry(0.038 + index * 0.006, 0.005, 8, 40);
    const coil = new THREE.Mesh(coilGeometry, twineMaterial);
    coil.name = `snareCoilLoop${index + 1}`;
    coil.rotation.z = -0.18 + index * 0.12;
    coil.scale.set(0.78, 1.14, 1);
    coil.position.set(0.004 * (index - 1), -0.064 - index * 0.004, -0.012 + index * 0.012);
    coil.castShadow = true;
    group.add(coil);
    disposables.push(coilGeometry);
  }

  const leadGeometry = new THREE.CylinderGeometry(0.006, 0.006, 1, 8);
  const lead = new THREE.Mesh(leadGeometry, twineMaterial);
  lead.name = 'snareCoilLead';
  lead.castShadow = true;
  group.add(lead);
  disposables.push(leadGeometry);

  const nooseCurve = new THREE.CatmullRomCurve3(SNARE_NOOSE_POINTS.map(point => point.clone()), true);
  const nooseGeometry = new THREE.TubeGeometry(nooseCurve, 32, 0.0045, 6, true);
  const noose = new THREE.Mesh(nooseGeometry, twineMaterial);
  noose.name = 'snareCoilLooseNoose';
  noose.castShadow = true;
  group.add(noose);
  disposables.push(nooseGeometry);

  const knotGeometry = new THREE.SphereGeometry(0.017, 10, 7);
  const knot = new THREE.Mesh(knotGeometry, darkTwineMaterial);
  knot.name = 'snareCoilRunningKnot';
  knot.position.set(0.09, 0.012, -0.025);
  knot.scale.set(1.2, 0.82, 0.95);
  knot.castShadow = true;
  group.add(knot);
  disposables.push(knotGeometry);

  for (let index = 0; index < 3; index += 1) {
    const bindingGeometry = new THREE.CylinderGeometry(0.0065, 0.0065, 0.072, 8);
    bindingGeometry.rotateZ(Math.PI / 2);
    const binding = new THREE.Mesh(bindingGeometry, waxMaterial);
    binding.name = `snareCoilWaxBinding${index + 1}`;
    binding.position.set(-0.018 + index * 0.018, -0.034, -0.012 + index * 0.006);
    binding.rotation.y = 0.18;
    binding.rotation.z = 0.34;
    binding.castShadow = true;
    group.add(binding);
    disposables.push(bindingGeometry);
  }

  const pegGeometry = new THREE.CylinderGeometry(0.008, 0.011, 0.15, 8);
  pegGeometry.rotateX(Math.PI / 2);
  const peg = new THREE.Mesh(pegGeometry, pegMaterial);
  peg.name = 'snareCoilPeg';
  peg.position.set(-0.05, -0.08, -0.03);
  peg.rotation.y = 0.28;
  peg.rotation.z = -0.32;
  peg.castShadow = true;
  group.add(peg);
  disposables.push(pegGeometry);

  const pegTipGeometry = new THREE.ConeGeometry(0.011, 0.034, 8);
  pegTipGeometry.rotateX(-Math.PI / 2);
  const pegTip = new THREE.Mesh(pegTipGeometry, pegMaterial);
  pegTip.name = 'snareCoilPegPoint';
  pegTip.position.set(-0.072, -0.12, -0.082);
  pegTip.rotation.y = 0.28;
  pegTip.rotation.z = -0.32;
  pegTip.castShadow = true;
  group.add(pegTip);
  disposables.push(pegTipGeometry);

  return {
    object: group,
    lead,
    noose,
    knot,
    nooseCurve,
    noosePoints: SNARE_NOOSE_POINTS.map(point => point.clone()),
    gravityLocal: new THREE.Vector3(0, -1, 0),
    worldQuaternion: new THREE.Quaternion(),
    worldInverseQuaternion: new THREE.Quaternion(),
    leadStart: new THREE.Vector3(0.004, -0.024, -0.002),
    leadEnd: new THREE.Vector3(0.006, -0.018, 0),
    dispose: () => disposables.forEach(item => item.dispose?.()),
  };
}

function orientCylinderBetween(mesh, start, end) {
  if (!mesh) return;
  const midpoint = mesh.position;
  midpoint.copy(start).add(end).multiplyScalar(0.5);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  mesh.scale.set(1, Math.max(0.0001, length), 1);
  if (length > 1e-5) {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }
}

function updateSnareCoilVisual(visual, { time, walking, running }) {
  const object = visual?.object;
  if (!object || !visual.noose || !visual.nooseCurve) return;
  object.updateWorldMatrix(true, false);
  object.getWorldQuaternion(visual.worldQuaternion);
  visual.worldInverseQuaternion.copy(visual.worldQuaternion).invert();
  visual.gravityLocal.copy(BUTTERFLY_NET_WORLD_DOWN).applyQuaternion(visual.worldInverseQuaternion).normalize();
  const gravity = visual.gravityLocal;
  const moving = walking || running;
  const bob = Math.sin(time * (moving ? 5.8 : 2.1) + visual.leadEnd.x * 11) * (moving ? 0.014 : 0.005);
  const points = visual.nooseCurve.points;
  for (let index = 0; index < points.length; index += 1) {
    const base = visual.noosePoints[index];
    const free = index === 0 ? 0.06 : index === points.length - 1 ? 0.14 : 1;
    const sag = (0.045 + Math.sin(index * 1.7 + time * 1.2) * 0.006) * free;
    points[index].set(
      base.x + gravity.x * sag,
      base.y + gravity.y * sag + bob * free,
      base.z + gravity.z * sag,
    );
  }
  const previousGeometry = visual.noose.geometry;
  const nextGeometry = new THREE.TubeGeometry(visual.nooseCurve, 32, 0.0045, 6, true);
  visual.noose.geometry = nextGeometry;
  previousGeometry?.dispose?.();

  const knotPoint = points[0];
  if (visual.knot) {
    visual.knot.position.copy(knotPoint);
    visual.knot.position.addScaledVector(gravity, 0.018);
  }
  const leadEnd = visual.leadEnd.copy(knotPoint).addScaledVector(gravity, 0.012);
  orientCylinderBetween(visual.lead, visual.leadStart, leadEnd);
}

function updateButterflyNetVisual(visual, { time, walking, running, action }) {
  const attr = visual?.bag?.geometry?.attributes?.position;
  if (!attr) return;
  const object = visual.object;
  const previousTime = visual.lastUpdateTime;
  const rawDeltaTime = typeof previousTime === 'number' ? time - previousTime : 0;
  const deltaTime = THREE.MathUtils.clamp(rawDeltaTime || 1 / 60, 1 / 120, 1 / 30);
  visual.lastUpdateTime = time;
  const moving = walking || running;
  const swinging = action === 'butterflyNetSwing' || action === 'swingNet';
  if (object) {
    object.updateWorldMatrix(true, false);
    object.getWorldQuaternion(visual.worldQuaternion);
    visual.worldInverseQuaternion.copy(visual.worldQuaternion).invert();
    visual.gravityLocal.copy(BUTTERFLY_NET_WORLD_DOWN).applyQuaternion(visual.worldInverseQuaternion).normalize();
    object.getWorldPosition(visual.worldPosition);
    if (visual.hasPreviousWorldPosition && rawDeltaTime > 0 && rawDeltaTime < 0.2) {
      visual.worldDelta
        .subVectors(visual.worldPosition, visual.previousWorldPosition)
        .multiplyScalar(-1 / deltaTime);
      visual.dragTargetLocal.copy(visual.worldDelta).applyQuaternion(visual.worldInverseQuaternion);
      visual.dragTargetLocal.multiplyScalar(swinging ? 0.16 : moving ? 0.045 : 0.018);
      const maxDrag = swinging ? 0.24 : moving ? 0.085 : 0.035;
      if (visual.dragTargetLocal.lengthSq() > maxDrag * maxDrag) {
        visual.dragTargetLocal.setLength(maxDrag);
      }
    } else {
      visual.dragTargetLocal.set(0, 0, 0);
    }
    visual.previousWorldPosition.copy(visual.worldPosition);
    visual.hasPreviousWorldPosition = true;
  } else {
    visual.gravityLocal.set(0, -1, 0);
    visual.dragTargetLocal.set(0, 0, 0);
    visual.hasPreviousWorldPosition = false;
  }
  const dragResponse = 1 - Math.exp(-(swinging ? 18 : 8) * deltaTime);
  visual.dragLocal.lerp(visual.dragTargetLocal, dragResponse);
  const gravity = visual.gravityLocal;
  const drag = visual.dragLocal;
  const stride = running ? 9.4 : walking ? 6.2 : 2.2;
  const sway = running ? 0.034 : walking ? 0.023 : 0.009;
  const ripple = swinging ? 0.035 : 0.012;
  const sagDepth = swinging ? 0.22 : moving ? 0.26 : 0.31;
  const positions = attr.array;
  for (let idx = 0; idx < BUTTERFLY_NET_SEGMENTS * BUTTERFLY_NET_RINGS; idx += 1) {
    const ring = Math.floor(idx / BUTTERFLY_NET_SEGMENTS);
    const seg = idx % BUTTERFLY_NET_SEGMENTS;
    const t = ring / (BUTTERFLY_NET_RINGS - 1);
    const p = idx * 3;
    const theta = (seg / BUTTERFLY_NET_SEGMENTS) * Math.PI * 2;
    const loose = Math.pow(t, 1.35);
    const gravitySag = sagDepth * Math.pow(t, 1.48);
    const windTrail = Math.pow(t, 1.18);
    const wave = Math.sin(time * stride + visual.phase + ring * 0.85 + seg * 0.22);
    const cross = Math.cos(time * (moving ? 4.4 : 1.6) + visual.phase + ring * 0.55);
    positions[p] = visual.basePositions[p]
      + gravity.x * gravitySag
      + drag.x * windTrail
      + cross * sway * loose
      + Math.cos(theta) * wave * ripple * loose * 0.22;
    positions[p + 1] = visual.basePositions[p + 1]
      + gravity.y * gravitySag
      + drag.y * windTrail
      - loose * (moving ? 0.02 : 0.012)
      + wave * ripple * loose * 0.45;
    positions[p + 2] = visual.basePositions[p + 2]
      + gravity.z * gravitySag
      + drag.z * windTrail
      + wave * ripple * loose;
  }
  attr.needsUpdate = true;
  visual.bag.geometry.computeVertexNormals();
}

// Held-tool props. Placeholder GLBs live under /assets/models/tools/ — swap in
// finished models by replacing the file at the same path.
const HAND_TOOLS = [
  {
    toolId: 'shotgun',
    path: '/assets/models/tools/shotgun.glb',
    scale: 1,
    position: [0, 0, 0],
    euler: [0, 0, 0],
    hand: 'right',
    orient: 'body',
    modelOverrides: {
      darwin5: {
        position: [0.0, -0.012, -0.015],
        // twoHand: the barrel is procedurally aimed from the right-hand grip
        // toward the left hand every frame, so the gun lies across both
        // palms in every carry/walk/run clip instead of relying on one
        // hand-tuned euler. The euler is a post-alignment trim (roll etc.).
        euler: [0, 0, 0],
        orient: 'twoHand',
      },
    },
  },
  {
    toolId: 'insect_net',
    path: '/assets/models/tools/net.glb',
    visual: BUTTERFLY_NET_VISUAL,
    scale: 1,
    position: [0.0, -0.012, -0.015],
    euler: [0, 0, -Math.PI / 2],
    hand: 'right',
    orient: 'hand',
    modelOverrides: {
      darwin5: {
        bone: RIGHT_HAND,
        position: DARWIN5_POLE_GRIP_OFFSET,
        euler: DARWIN5_POLE_BODY_CARRY_EULER,
        orient: 'body',
      },
    },
  },
  {
    toolId: 'snare',
    path: '/assets/models/tools/snare.glb',
    visual: SNARE_COIL_VISUAL,
    scale: 1,
    position: [0.018, 0.052, -0.016],
    euler: DARWIN5_SNARE_COIL_GRIP_EULER,
    hand: 'right',
    orient: 'hanging',
    modelOverrides: {
      darwin5: {
        bone: RIGHT_HAND,
        position: DARWIN5_SNARE_COIL_GRIP_OFFSET,
        euler: DARWIN5_SNARE_COIL_GRIP_EULER,
        orient: 'hanging',
      },
    },
  },
  { toolId: 'hammer',     path: '/assets/models/tools/hammer.glb',  scale: 1, position: [0.0, -0.012, -0.015], euler: [0, 0, -Math.PI / 2], hand: 'right', orient: 'hand' },
];

const PLAYER_MODEL_CYCLE = Array.from(new Set([
  DEFAULT_PLAYER_MODEL_ASSET_ID,
  'darwin4',
  'darwin',
  'darwinCandidate2',
  'darwin5',
]));

function darwin5StandingJumpRequest(charge, jumpPhase) {
  const charged = charge >= 0.35;
  return {
    clip: 'standingJump',
    fade: jumpPhase === 'takeoff' ? 0.04 : 0.02,
    // The source clip is a full 1.93s Mixamo jump cycle, while normal game
    // airtime is much shorter. Play only the takeoff/air pose window and let
    // the landing resolver handle impact procedurally.
    timeScale: THREE.MathUtils.lerp(1.55, 1.28, charge),
    maxTime: charged ? 1.28 : 0.92,
  };
}

const DARWIN5_FALL_IDLE_MIN_DISTANCE = 1.35;
const DARWIN5_FALL_IDLE_MIN_DESCENT_SPEED = -1.05;

function jumpHoldClipForMotion(motion, fade = 0.05) {
  return motion.jumpWasRunning
    ? { clip: 'runningJumpHold', fade }
    : { clip: 'standingJumpHold', fade };
}

function darwin5UncontrolledFallClip(motion) {
  const groundDistance = motion.groundDistance ?? 0;
  const verticalSpeed = motion.verticalSpeed ?? 0;
  if (
    verticalSpeed < DARWIN5_FALL_IDLE_MIN_DESCENT_SPEED
    && groundDistance > DARWIN5_FALL_IDLE_MIN_DISTANCE
  ) {
    return { clip: 'fallingIdle', fade: 0.1 };
  }
  return jumpHoldClipForMotion(motion, 0.08);
}

function darwin5TorchActionClip(action, crouching) {
  if (action === 'turnLeft90') return crouching ? 'torchCrouchTurnLeft90' : 'torchTurnLeft90';
  if (action === 'turnRight90') return crouching ? 'torchCrouchTurnRight90' : 'torchTurnRight90';
  if (action === 'standToCrouch') return 'torchStandToCrouch';
  if (action === 'crouchToStand') return 'torchCrouchToStand';
  if (action === 'swingHammer' || action === 'heavyToolSwing') return 'heavyToolSwing';
  if (action === 'swingNet' || action === 'butterflyNetSwing') return 'butterflyNetSwing';
  if (action === 'kneelInspect') return 'kneelInspect';
  if (action === 'gather') return 'gather';
  if (action === 'standingInspectDownward') return 'standingInspectDownward';
  if (action === 'changeItem') return 'torchEquip';
  return null;
}

function darwin5HeldToolActionClip(action) {
  if (action === 'swingNet' || action === 'butterflyNetSwing') return 'butterflyNetSwing';
  if (action === 'swingHammer' || action === 'swingTool' || action === 'heavyToolSwing') return 'heavyToolSwing';
  return null;
}

function darwin5RifleActionClip(action) {
  if (action === 'standToCover' || action === 'standToCrouch') return 'rifleCrouchWalkToIdle';
  if (action === 'coverToStand' || action === 'crouchToStand') return 'rifleKneelToStand';
  if (action === 'changeItem') return 'rifleEquip';
  return null;
}

function darwin5AdaptedActionClip(action) {
  if (action === 'climbWaistHeight') return { clip: 'climbWaistHeight', timeScale: 1.65, fade: 0.05 };
  if (action === 'climbHeadHeight') return { clip: 'climbHeadHeight', timeScale: 1.45, fade: 0.05 };
  if (action === 'fallingToRoll') return { clip: 'fallingToRoll', timeScale: 1.2, fade: 0.05 };
  if (action === 'swingNet' || action === 'butterflyNetSwing') return 'butterflyNetSwing';
  if (action === 'swingHammer' || action === 'heavyToolSwing') return 'heavyToolSwing';
  if (action === 'kneelInspect') return 'kneelInspect';
  if (action === 'lookAround' || action === 'lookAroundShort') return action;
  if (action === 'fidgetStand' || action === 'neckStretch' || action === 'armStretch'
    || action === 'neutralIdle' || action === 'happyIdle' || action === 'inspectNearbyIdle') return action;
  if (action === 'write') return 'write';
  if (action === 'gather' || action === 'gatherGround' || action === 'gatherChestHeight') return action;
  if (action === 'pushLow') return { clip: 'pushLow', timeScale: 1.35, fade: 0.05 };
  if (action === 'pushMedium') return { clip: 'pushMedium', timeScale: 1.45, fade: 0.05 };
  if (action === 'pushHeavy') return { clip: 'pushHeavy', timeScale: 1.6, fade: 0.05 };
  if (action === 'pushStart' || action === 'pushStop') return action;
  if (action === 'standingInspectDownward') return 'standingInspectDownward';
  if (action === 'point') return 'point';
  if (action === 'vault') return 'vault';
  if (action === 'shoulderHitAndFall') return 'shoulderHitAndFall';
  if (action === 'hitReaction') return 'hitReaction';
  if (action === 'stumble') return 'stumble';
  if (action === 'trip') return 'trip';
  if (action === 'gettingUp') return 'gettingUp';
  if (action === 'runningSlide') return 'runningSlide';
  if (action === 'dodgeRoll' || action === 'standToRoll') return 'fallingToRoll';
  return null;
}

// 1 at deep night, 0 in full day, ramping across dawn/dusk.
function lampNightFactor(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7 && h <= 18) return 0;
  if (h > 18 && h < 20) return (h - 18) / 2;   // dusk ramp up
  if (h > 5 && h < 7) return (7 - h) / 2;       // dawn ramp down
  return 1;                                       // 20:00–05:00
}

// Attaches the oil lamp + a warm flickering point light to Darwin's left hand,
// visible only at night. Scale is normalised against the bone's world scale so
// the lamp is a predictable size regardless of how the rig was exported.
function HandLamp({ scene, modelAssetId }) {
  const { scene: lampSource } = useGLTF(LAMP_MODEL_PATH);
  const groupRef = useRef(null);
  const lightRef = useRef(null);
  const flameMatsRef = useRef([]);
  const boneQuat = useMemo(() => new THREE.Quaternion(), []);
  const swingQuat = useMemo(() => new THREE.Quaternion(), []);
  const swingAxis = useMemo(() => new THREE.Vector3(1, 0, 0), []);

  useEffect(() => {
    if (!scene || !lampSource) return undefined;
    const attachment = LAMP_ATTACHMENT[modelAssetId] || LAMP_ATTACHMENT.default;
    const lamp = lampSource.clone(true);
    const box = new THREE.Box3().setFromObject(lamp);
    const nativeHeight = Math.max(1e-3, box.max.y - box.min.y);
    // The Sketchfab lamp's origin is near the base, so putting the object
    // directly on the hand makes it look strapped to the wrist. Move the object
    // so its top handle/bail is the attachment point; the lamp body then hangs.
    lamp.position.y = -box.max.y;

    const flameMats = [];
    lamp.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.userData.noTint = true; // exclude from the damage-flash recolour
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const isFlame = /flame/i.test(obj.name) || mats.some(m => /phong7|phong5/i.test(m?.name || ''));
      mats.forEach(material => {
        if (!material) return;
        material.toneMapped = false;
        if (isFlame && material.emissive) {
          material.emissive.set('#ffae54');
          material.emissiveIntensity = 2.4;
          flameMats.push(material);
        }
      });
    });
    flameMatsRef.current = flameMats;

    const handle = attachToBone(scene, attachment.bone || LEFT_HAND, lamp, {
      worldScale: LAMP_TARGET_HEIGHT / nativeHeight,
      position: attachment.position,
    });
    if (!handle) return undefined;
    handle.group.name = 'darwinHandLamp';
    handle.group.visible = false;

    // decay 1.4 (not the physical 2): the flame sits ~0.3 m from the torso, so
    // inverse-square falloff slammed the near body to clipping while the far side
    // crushed to black. A softer decay flattens that near-field gradient.
    const light = new THREE.PointLight(LAMP_LIGHT_COLOR, 0, LAMP_LIGHT_DISTANCE, 1.4);
    light.castShadow = false;
    // Sit the light at the flame, in lamp-native units (group scale handles the rest).
    light.position.set(0, nativeHeight * 0.55 - box.max.y, 0);
    handle.group.add(light);

    groupRef.current = handle.group;
    lightRef.current = light;

    return () => {
      handle.dispose();
      groupRef.current = null;
      lightRef.current = null;
      flameMatsRef.current = [];
    };
  }, [scene, lampSource, modelAssetId]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const state = useThreeGameStore.getState();
    const hour = state.timeOfDay ?? 12;
    const night = lampNightFactor(hour);
    const leftHandToolActive = HAND_TOOLS.some(tool => tool.hand === 'left' && tool.toolId === state.activeToolId);
    if (night <= 0.02 || leftHandToolActive) {
      if (group.visible) group.visible = false;
      if (lightRef.current) lightRef.current.intensity = 0;
      return;
    }
    group.visible = true;
    const t = clock.elapsedTime;
    // Keep the lamp world-upright (a hanging lantern stays vertical via gravity),
    // with a gentle pendulum sway so it reads as carried rather than welded on.
    const bone = group.parent;
    if (bone) {
      bone.getWorldQuaternion(boneQuat);
      swingQuat.setFromAxisAngle(swingAxis, Math.sin(t * 1.7) * 0.06);
      group.quaternion.copy(boneQuat).invert().multiply(swingQuat);
    }
    const flicker = 0.82 + 0.12 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 24.7 + 1.3);
    if (lightRef.current) lightRef.current.intensity = night * LAMP_LIGHT_INTENSITY * flicker;
    for (let i = 0; i < flameMatsRef.current.length; i += 1) {
      flameMatsRef.current[i].emissiveIntensity = night * (1.6 + 0.6 * flicker);
    }
  });

  return null;
}

// Attaches a held-tool GLB to Darwin's right hand and shows it only while that
// tool is the active one. Hand-oriented props inherit the animated grip pose;
// body-oriented props remain supported for future coarse world-facing tools.
function HandProp({ scene, config, modelAssetId, motionRef }) {
  const resolvedConfig = useMemo(() => {
    const override = config.modelOverrides?.[modelAssetId];
    return override ? { ...config, ...override } : config;
  }, [config, modelAssetId]);
  const { scene: source } = useGLTF(resolvedConfig.path);
  const groupRef = useRef(null);
  const visualRef = useRef(null);
  const offHandBoneRef = useRef(null);
  const boneQuat = useMemo(() => new THREE.Quaternion(), []);
  const bodyQuat = useMemo(() => new THREE.Quaternion(), []);
  const aimQuat = useMemo(() => new THREE.Quaternion(), []);
  const aimDir = useMemo(() => new THREE.Vector3(), []);
  const aimForward = useMemo(() => new THREE.Vector3(), []);
  const aimRight = useMemo(() => new THREE.Vector3(), []);
  const gripPos = useMemo(() => new THREE.Vector3(), []);
  const offHandPos = useMemo(() => new THREE.Vector3(), []);
  const localShaftAxis = useMemo(() => new THREE.Vector3(0, 0, -1), []);
  const tweakQuat = useMemo(() => new THREE.Quaternion(), []);
  const tweakEuler = useMemo(() => new THREE.Euler(), []);

  useEffect(() => {
    if (!scene || !source) return undefined;
    let customVisual = null;
    const object = resolvedConfig.visual === BUTTERFLY_NET_VISUAL
      ? (customVisual = createButterflyNetVisual()).object
      : resolvedConfig.visual === SNARE_COIL_VISUAL
        ? (customVisual = createSnareCoilVisual()).object
        : source.clone(true);
    object.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.userData.noTint = true;
    });
    if (resolvedConfig.objectPosition) {
      object.position.set(
        resolvedConfig.objectPosition[0] || 0,
        resolvedConfig.objectPosition[1] || 0,
        resolvedConfig.objectPosition[2] || 0,
      );
    }
    if (resolvedConfig.objectEuler) {
      object.rotation.set(
        resolvedConfig.objectEuler[0] || 0,
        resolvedConfig.objectEuler[1] || 0,
        resolvedConfig.objectEuler[2] || 0,
      );
    }
    const handRegex = resolvedConfig.bone || (resolvedConfig.hand === 'left' ? LEFT_HAND : RIGHT_HAND);
    const handle = attachToBone(scene, handRegex, object, {
      worldScale: resolvedConfig.scale,
      position: resolvedConfig.position,
    });
    if (!handle) return undefined;
    // twoHand orientation needs the off hand to aim the shaft at.
    if (resolvedConfig.orient === 'twoHand') {
      const offRegex = resolvedConfig.hand === 'left' ? RIGHT_HAND : LEFT_HAND;
      let offBone = null;
      scene.traverse(node => {
        if (!offBone && node.isBone && offRegex.test(node.name)) offBone = node;
      });
      offHandBoneRef.current = offBone;
    }
    handle.group.name = `darwinTool:${resolvedConfig.toolId}`;
    handle.group.visible = false;
    tweakEuler.set(resolvedConfig.euler[0], resolvedConfig.euler[1], resolvedConfig.euler[2]);
    tweakQuat.setFromEuler(tweakEuler);
    groupRef.current = handle.group;
    visualRef.current = customVisual;
    return () => {
      handle.dispose();
      customVisual?.dispose?.();
      groupRef.current = null;
      visualRef.current = null;
    };
  }, [scene, source, resolvedConfig, tweakEuler, tweakQuat]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const storeState = useThreeGameStore.getState();
    const visible = storeState.activeToolId === resolvedConfig.toolId;
    if (group.visible !== visible) group.visible = visible;
    if (!visible) return;
    const bone = group.parent;
    if (!bone) return;
    // While aiming, the shotgun ignores the hand pose and points along the
    // live 3D fire direction (barrel = local -Z in the tool GLB), so the gun
    // always agrees with the crosshair — including skyward shots — no matter
    // what the current animation does with the wrist.
    if (resolvedConfig.toolId === 'shotgun' && shotgunAimState.active && motionRef?.current?.aiming) {
      bone.getWorldQuaternion(boneQuat);
      aimDir.set(shotgunAimState.dirX, shotgunAimState.dirY, shotgunAimState.dirZ);
      if (aimDir.lengthSq() < 1e-4) aimDir.set(0, 0, -1);
      aimDir.normalize();
      aimQuat.setFromUnitVectors(localShaftAxis, aimDir);
      group.quaternion.copy(boneQuat).invert().multiply(aimQuat);
      return;
    }
    if (resolvedConfig.orient === 'twoHand') {
      // Carry pose: lay the shaft from the gripping hand toward the off
      // hand, so the gun sits across both palms in every clip (idle, walk,
      // run) without per-clip euler tuning.
      const offBone = offHandBoneRef.current;
      bone.getWorldQuaternion(boneQuat);
      if (offBone) {
        bone.getWorldPosition(gripPos);
        offBone.getWorldPosition(offHandPos);
        aimDir.copy(offHandPos).sub(gripPos);
        if (aimDir.lengthSq() > 1e-6) {
          aimDir.normalize();
          aimQuat.setFromUnitVectors(localShaftAxis, aimDir).multiply(tweakQuat);
          group.quaternion.copy(boneQuat).invert().multiply(aimQuat);
          return;
        }
      }
      group.quaternion.copy(boneQuat).invert().multiply(tweakQuat);
    } else if (resolvedConfig.orient === 'hand') {
      group.quaternion.copy(tweakQuat);
    } else {
      bone.getWorldQuaternion(boneQuat);
      if (resolvedConfig.orient === 'hanging') {
        group.quaternion.copy(boneQuat).invert().multiply(tweakQuat);
      } else if (resolvedConfig.orient === 'facing') {
        const facing = storeState.playerPose?.facing;
        aimForward.set(facing?.x || 0, 0, facing?.z || -1);
        if (aimForward.lengthSq() < 1e-4) aimForward.set(0, 0, -1);
        aimForward.normalize();
        aimRight.set(-aimForward.z, 0, aimForward.x).normalize();
        aimDir
          .copy(aimForward)
          .addScaledVector(aimRight, resolvedConfig.aimSide ?? 0)
          .setY(resolvedConfig.aimElevation ?? 0.35)
          .normalize();
        aimQuat.setFromUnitVectors(localShaftAxis, aimDir).multiply(tweakQuat);
        group.quaternion.copy(boneQuat).invert().multiply(aimQuat);
      } else {
        scene.getWorldQuaternion(bodyQuat);
        // Cancel the bone's world rotation, re-apply the body's, then the tweak.
        group.quaternion.copy(boneQuat).invert().multiply(bodyQuat).multiply(tweakQuat);
      }
    }
    if (visualRef.current) {
      const visualState = {
        time: clock.elapsedTime,
        walking: Boolean(motionRef?.current?.walking),
        running: Boolean(motionRef?.current?.running),
        action: motionRef?.current?.action || null,
      };
      if (resolvedConfig.visual === BUTTERFLY_NET_VISUAL) {
        updateButterflyNetVisual(visualRef.current, visualState);
      } else if (resolvedConfig.visual === SNARE_COIL_VISUAL) {
        updateSnareCoilVisual(visualRef.current, visualState);
      }
    }
  });

  return null;
}

// Above this path-relative ground pitch (+ ascending, - descending) the
// locomotion reads as taking the steps rather than a flat walk. Pitch is
// grade*uphillDot, so 0.45 ~ heading fairly directly up a >=25deg slope.
// Conservative so ordinary inclines still use walk/run; tune if it misfires.
const STAIR_PITCH = 0.45;

function ProceduralNaturalistModel({ motionRef }) {
  const group = useRef(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const running = motionRef.current.running;
    const airborne = motionRef.current.airborne;
    const stride = running ? 10 : 6;
    group.current.children.forEach((child, index) => {
      if (child.userData.limb) {
        child.rotation.x = Math.sin(t * stride + index) * (running ? 0.65 : 0.38);
      }
    });
    group.current.position.y = airborne ? 0.08 : Math.abs(Math.sin(t * stride)) * (running ? 0.055 : 0.025);
  });

  return (
    <group ref={group}>
      <mesh castShadow position={[0, 1.65, 0]}>
        <sphereGeometry args={[0.28, 18, 18]} />
        <meshToonMaterial color="#d0a070" />
      </mesh>
      <mesh castShadow position={[0, 2.0, 0]} rotation={[0.05, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.43, 0.16, 20]} />
        <meshToonMaterial color="#b58b46" />
      </mesh>
      <mesh castShadow position={[0, 1.08, 0]}>
        <capsuleGeometry args={[0.3, 0.85, 6, 12]} />
        <meshToonMaterial color="#4a3527" />
      </mesh>
      <mesh userData={{ limb: true }} castShadow position={[-0.26, 0.54, 0]}>
        <capsuleGeometry args={[0.08, 0.75, 4, 8]} />
        <meshToonMaterial color="#2b2520" />
      </mesh>
      <mesh userData={{ limb: true }} castShadow position={[0.26, 0.54, 0]}>
        <capsuleGeometry args={[0.08, 0.75, 4, 8]} />
        <meshToonMaterial color="#2b2520" />
      </mesh>
      <mesh userData={{ limb: true }} castShadow position={[-0.42, 1.15, 0]}>
        <capsuleGeometry args={[0.055, 0.62, 4, 8]} />
        <meshToonMaterial color="#6d5941" />
      </mesh>
      <mesh userData={{ limb: true }} castShadow position={[0.42, 1.15, 0]}>
        <capsuleGeometry args={[0.055, 0.62, 4, 8]} />
        <meshToonMaterial color="#6d5941" />
      </mesh>
      <mesh castShadow position={[-0.38, 1.02, -0.14]} rotation={[0, 0.2, 0.16]}>
        <boxGeometry args={[0.36, 0.42, 0.16]} />
        <meshToonMaterial color="#8a5d30" />
      </mesh>
    </group>
  );
}

export function NaturalistModel({ motionRef, health, fatigue, inventoryCount, grounding = null }) {
  const [modelAssetId, setModelAssetId] = useState(DEFAULT_PLAYER_MODEL_ASSET_ID);
  const [damageFlash, setDamageFlash] = useState(0);
  const [modelScene, setModelScene] = useState(null);
  const previousHealth = useRef(health);
  const damageFlashRef = useRef({ startedAt: -10, duration: 0.58 });
  const statusRef = useRef({ health, fatigue, inventoryCount });

  useEffect(() => {
    if (health < previousHealth.current - 0.01) {
      damageFlashRef.current = { startedAt: null, duration: 0.58 };
      setDamageFlash(1);
    }
    previousHealth.current = health;
    statusRef.current.health = health;
    statusRef.current.fatigue = fatigue;
    statusRef.current.inventoryCount = inventoryCount;
  }, [health, fatigue, inventoryCount]);

  useEffect(() => {
    if (motionRef?.current) motionRef.current.modelAssetId = modelAssetId;
    if (typeof window === 'undefined') return undefined;
    window.__darwinPlayerModel = modelAssetId;
    // Hotkey 9 cycles the stable player models for A/B comparison. The Tripo
    // candidate stays in the manifest for dev inspection, but is excluded here
    // because its texture pass is not production-ready.
    const cycle = PLAYER_MODEL_CYCLE;
    const onKeyDown = (event) => {
      if (event.code !== 'Digit9' && event.key !== '9') return;
      if (event.repeat) return;
      setModelAssetId(current => {
        const idx = cycle.indexOf(current);
        const next = cycle[(idx + 1) % cycle.length];
        window.__darwinPlayerModel = next;
        if (motionRef?.current) motionRef.current.modelAssetId = next;
        return next;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modelAssetId, motionRef]);

  useFrame(({ clock }) => {
    if (damageFlashRef.current.startedAt === null) {
      damageFlashRef.current.startedAt = clock.elapsedTime;
    }
    const elapsed = clock.elapsedTime - damageFlashRef.current.startedAt;
    if (elapsed < 0 || elapsed > damageFlashRef.current.duration) {
      if (damageFlash !== 0) setDamageFlash(0);
      return;
    }
    const t = THREE.MathUtils.clamp(elapsed / damageFlashRef.current.duration, 0, 1);
    const next = Math.pow(1 - t, 1.75);
    if (Math.abs(next - damageFlash) > 0.025) setDamageFlash(next);
  });

  // Upper-body aim layer: forward aim-walk has its own full-body clip
  // (aimWalk), so the masked overlay only covers strafes and backpedal,
  // holding the shouldered aimIdle pose over those leg cycles.
  const selectAimOverlay = useCallback(() => {
    const m = motionRef.current;
    const lateral = m.strafeLeft || m.strafeRight || m.movingBackward;
    return {
      clip: 'aimIdle',
      active: Boolean(
        m.aiming
        && lateral
        && !m.action
        && !m.crouching
        && !m.airborne
        && !m.swimming
        && useThreeGameStore.getState().activeToolId === 'shotgun',
      ),
    };
  }, [motionRef]);

  const selectAnimation = useCallback(() => {
    const status = statusRef.current;
    const speed = motionRef.current.speed || 0;
    const walkScale = THREE.MathUtils.clamp(speed / PLAYER.walkSpeed, 0.72, 1.24);
    const runScale = THREE.MathUtils.clamp(speed / PLAYER.runSpeed, 0.78, 1.28);
    const tiredRunScale = THREE.MathUtils.clamp(speed / Math.max(PLAYER.walkSpeed, PLAYER.runSpeed * 0.74), 0.72, 1.18);
    const stride = (clip, scale) => calibratedStrideTimeScale(modelAssetId, clip, scale);
    const gameState = useThreeGameStore.getState();
    const toolId = gameState.activeToolId;
    const holdingTool = toolId === 'insect_net' || toolId === 'snare' || toolId === 'hammer';
    const hasRifle = toolId === 'shotgun';
    const carryingObject = Boolean(gameState.carriedObjectId);
    const lampMode = modelAssetId === 'darwin5' && !hasRifle && lampNightFactor(gameState.timeOfDay ?? 12) > 0.02;
    const heldToolMode = modelAssetId === 'darwin5' && holdingTool;
    const torchMode = modelAssetId === 'darwin5' && !hasRifle && !heldToolMode && lampMode;
    const groundPitch = motionRef.current.groundPitch || 0;
    if (status.health <= 0) return 'fallingForwardDeath';
    if (motionRef.current.action) {
      if (modelAssetId === 'darwin5' && hasRifle) {
        const rifleAction = darwin5RifleActionClip(motionRef.current.action, motionRef.current.crouching);
        if (rifleAction) return rifleAction;
      }
      if (heldToolMode) {
        const heldToolAction = darwin5HeldToolActionClip(motionRef.current.action);
        if (heldToolAction) return heldToolAction;
      }
      if (torchMode) {
        const torchAction = darwin5TorchActionClip(motionRef.current.action, motionRef.current.crouching);
        if (torchAction) return torchAction;
      }
      if (modelAssetId === 'darwin5') {
        // Tall climbs: sync the clip speed to the controller's height-scaled
        // action span so hand/foot placement tracks short and tall faces alike
        // instead of playing the wall mantle at one fixed rate.
        const climbAction = motionRef.current.action;
        if (climbAction === 'climbingUpWall' || climbAction === 'climb' || climbAction === 'sprintToWallClimb') {
          const actionSpan = Math.max(0.45, (motionRef.current.actionUntil || 0) - (motionRef.current.actionStartedAt || 0));
          const climbClipDuration = darwin5ClipDuration(climbAction) || 2.0;
          return {
            clip: climbAction,
            timeScale: THREE.MathUtils.clamp(climbClipDuration / actionSpan, 0.95, 1.7),
            fade: 0.06,
          };
        }
        const adaptedAction = darwin5AdaptedActionClip(motionRef.current.action);
        if (adaptedAction) return adaptedAction;
      }
      // The source firing animation is a multi-shot loop; cap it to a single
      // trigger pull so one click reads as one report.
      if (motionRef.current.action === 'fireRifle') {
        return { clip: 'fireRifle', fade: 0.05, timeScale: 1.12, maxTime: SHOTGUN.fireClipMaxTime };
      }
      return motionRef.current.action;
    }
    if (motionRef.current.lying && !motionRef.current.walking && !motionRef.current.running) return 'layingIdle';
    if (motionRef.current.sitting && !motionRef.current.walking && !motionRef.current.running) return 'sitIdle';
    if (motionRef.current.swimming) {
      const sprinting = motionRef.current.swimSprinting && speed > SWIM.speed * 1.05;
      const strokeScale = sprinting
        ? THREE.MathUtils.clamp(speed / SWIM.sprintSpeed, 0.9, 1.35)
        : THREE.MathUtils.clamp(speed / SWIM.speed, 0.85, 1.3);
      return speed > 0.7
        ? { clip: sprinting ? 'swimFast' : 'swim', fade: sprinting ? 0.14 : 0.24, timeScale: strokeScale }
        : { clip: 'treadWater', fade: 0.28 };
    }
    const injured = status.health < 45;
    const badlyInjured = status.health < 30;
    if (motionRef.current.jumpCharging) return { clip: torchMode ? 'torchCrouchIdle' : 'crouchIdle', fade: 0.08, timeScale: 0.72 };
    const jumpPhase = motionRef.current.jumpPhase;
    const activePlayerJump = jumpPhase === 'takeoff' || jumpPhase === 'airborne' || jumpPhase === 'prelanding';
    const nearGround = Math.abs(motionRef.current.groundDistance ?? Infinity) <= PLAYER.groundSnapDistance * 1.15;
    if (motionRef.current.airborne && activePlayerJump) {
      const charge = THREE.MathUtils.clamp(motionRef.current.jumpChargeAmount || 0, 0, 1);
      const standingJumpScale = THREE.MathUtils.lerp(1.0, 0.76, charge);
      const runningJumpScale = THREE.MathUtils.lerp(0.95, 0.72, charge);
      const shortStandingJump = !motionRef.current.jumpWasRunning && charge < 0.15;
      if (modelAssetId === 'darwin5' && motionRef.current.jumpWaterEntryIntent === 'dive' && !injured) {
        return { clip: 'dive', fade: jumpPhase === 'takeoff' ? 0.04 : 0.08, timeScale: 1 };
      }
      const useDarwin5FullStandingJump = modelAssetId === 'darwin5' && !motionRef.current.jumpWasRunning;
      if (useDarwin5FullStandingJump) {
        return darwin5StandingJumpRequest(charge, jumpPhase);
      }
      if (jumpPhase === 'takeoff') {
        if (injured) return motionRef.current.jumpWasRunning ? 'injuredRunJump' : 'injuredStandingJump';
        if (motionRef.current.jumpFromHeight) return { clip: 'jumpFromWall', fade: 0.05, timeScale: 1.05 };
        return motionRef.current.jumpWasRunning
          ? { clip: 'runningJump', fade: 0.05, timeScale: runningJumpScale }
          : { clip: 'standingJump', fade: 0.05, timeScale: standingJumpScale };
      }
      if (jumpPhase === 'airborne' || jumpPhase === 'prelanding') {
        if (injured) return motionRef.current.jumpWasRunning ? 'injuredRunJump' : 'injuredStandingJump';
        if (shortStandingJump) return { clip: 'standingJump', fade: 0.05, timeScale: 0.92, maxTime: 0.58 };
        return jumpHoldClipForMotion(motionRef.current, 0.05);
      }
      return jumpHoldClipForMotion(motionRef.current, 0.05);
    }
    if (motionRef.current.airborne && !nearGround) {
      if (modelAssetId === 'darwin5') return darwin5UncontrolledFallClip(motionRef.current);
      return jumpHoldClipForMotion(motionRef.current, 0.08);
    }
    // Aiming: facing is locked to the cursor, so strafe/backpedal flags are
    // velocity-relative. Priority strafe -> backpedal -> run -> walk -> aim idle.
    if (motionRef.current.aiming) {
      if (motionRef.current.crouching) {
        if (modelAssetId === 'darwin5') {
          if (motionRef.current.walking || motionRef.current.crouchRunning) {
            const crouchScale = motionRef.current.crouchRunning
              ? THREE.MathUtils.clamp(speed / (PLAYER.walkSpeed * 0.92), 0.88, 1.35)
              : Math.max(0.7, walkScale * 0.85);
            return { clip: 'rifleCrouchWalk', timeScale: stride('walkRifle', crouchScale) };
          }
          return 'rifleKneelIdle';
        }
        return 'crouchRifle';
      }
      if (motionRef.current.strafeLeft) {
        return speed > PLAYER.walkSpeed * 1.15
          ? { clip: 'runStrafeLeft', timeScale: stride('run', runScale) }
          : { clip: 'walkStrafeLeft', timeScale: stride('walk', walkScale) };
      }
      if (motionRef.current.strafeRight) {
        return speed > PLAYER.walkSpeed * 1.15
          ? { clip: 'runStrafeRight', timeScale: stride('run', runScale) }
          : { clip: 'walkStrafeRight', timeScale: stride('walk', walkScale) };
      }
      if (motionRef.current.movingBackward) {
        if (injured) return { clip: 'injuredWalkBackwards', timeScale: stride('walk', Math.max(0.62, walkScale * 0.88)) };
        if (modelAssetId === 'darwin5' && speed > PLAYER.walkSpeed * 1.15) {
          return { clip: 'runBackwards', timeScale: stride('runBackwards', runScale) };
        }
        return { clip: 'walkBackwards', timeScale: stride('walk', walkScale) };
      }
      // Shouldered-aim locomotion: running reuses the carry run (runRifle is
      // already a gun-up pose), walking uses the dedicated aim walk, and
      // standing still holds the shouldered aim idle.
      if (motionRef.current.running) return { clip: 'runRifle', timeScale: stride('run', runScale) };
      if (modelAssetId === 'darwin5') {
        if (motionRef.current.walking) return { clip: 'aimWalk', timeScale: stride('walk', walkScale) };
        return 'aimIdle';
      }
      if (motionRef.current.walking) return { clip: 'walkRifle', timeScale: stride('walkRifle', walkScale) };
      return 'aim';
    }
    if (motionRef.current.crouching && modelAssetId === 'darwin5' && lampMode && (motionRef.current.walking || motionRef.current.crouchRunning)) {
      const crouchScale = motionRef.current.crouchRunning
        ? THREE.MathUtils.clamp(speed / (PLAYER.walkSpeed * 0.92), 0.88, 1.35)
        : Math.max(0.7, walkScale * 0.85);
      return { clip: 'torchCrouchWalk', timeScale: stride('torchWalk', crouchScale) };
    }
    if (motionRef.current.crouching && modelAssetId === 'darwin5' && lampMode) return 'torchCrouchIdle';
    if (motionRef.current.crouching && motionRef.current.strafeLeft) return { clip: 'crouchSneakLeft', timeScale: Math.max(0.72, walkScale * 0.9) };
    if (motionRef.current.crouching && motionRef.current.strafeRight) return { clip: 'crouchSneakRight', timeScale: Math.max(0.72, walkScale * 0.9) };
    if (motionRef.current.crouching && motionRef.current.crouchRunning) {
      return { clip: 'crouchRun', timeScale: THREE.MathUtils.clamp(speed / (PLAYER.walkSpeed * 0.95), 0.75, 1.2) };
    }
    if (motionRef.current.crouching && motionRef.current.walking) return { clip: 'crouchWalk', timeScale: stride('walk', Math.max(0.7, walkScale * 0.85)) };
    if (motionRef.current.crouching) return 'crouchIdle';
    if (!motionRef.current.airborne && (motionRef.current.wadeDepth || 0) > 0.42
      && (motionRef.current.walking || motionRef.current.running)) {
      // Thigh-deep water: heavy wading gait regardless of run intent.
      return { clip: 'wadeWalk', fade: 0.2, timeScale: stride('walk', THREE.MathUtils.clamp(speed / PLAYER.walkSpeed, 0.7, 1.15)) };
    }
    // Backpedalling: play a reversed-facing gait instead of the forward cycle
    // so Darwin doesn't moonwalk when moving away from the camera.
    if (motionRef.current.movingBackward && (motionRef.current.walking || motionRef.current.running)) {
      if (badlyInjured) return { clip: 'injuredRunBackwards', timeScale: stride('run', Math.max(0.7, tiredRunScale * 0.9)) };
      if (injured) return { clip: 'injuredWalkBackwards', timeScale: stride('walk', Math.max(0.62, walkScale * 0.88)) };
      if (modelAssetId === 'darwin5') {
        // Veering while backpedalling gets the authored backward-turn cycles.
        const turnRate = motionRef.current.turnRate || 0;
        if (Math.abs(turnRate) > 0.9 && speed > PLAYER.walkSpeed * 0.5) {
          return {
            clip: turnRate > 0 ? 'backwardTurnLeft' : 'backwardTurnRight',
            timeScale: stride('walkBackwards', walkScale),
          };
        }
        if (motionRef.current.running && speed > PLAYER.walkSpeed * 1.1) {
          return motionRef.current.tiredRun
            ? { clip: 'jogBackwards', timeScale: stride('jogBackwards', Math.max(0.72, tiredRunScale * 0.9)) }
            : { clip: 'runBackwards', timeScale: stride('runBackwards', runScale) };
        }
      }
      return { clip: 'walkBackwards', timeScale: stride('walk', walkScale) };
    }
    if (badlyInjured && motionRef.current.running) return { clip: 'injuredRun', timeScale: stride('run', Math.max(0.7, tiredRunScale * 0.92)) };
    if (injured && motionRef.current.walking) {
      if (modelAssetId === 'darwin5' && status.health < 24) {
        return { clip: 'injuredWalk', timeScale: stride('tiredWalk', Math.max(0.58, walkScale * 0.82)) };
      }
      if (modelAssetId === 'darwin5' && status.health < 34) {
        return { clip: 'injuredWalk', timeScale: stride('tiredWalk', Math.max(0.6, walkScale * 0.84)) };
      }
      return { clip: 'injuredWalk', timeScale: stride('tiredWalk', Math.max(0.62, walkScale * 0.88)) };
    }
    // Rifle equipped but not aiming: carried low, normal locomotion with rifle.
    if (hasRifle) {
      if (motionRef.current.running) return { clip: 'runRifle', timeScale: stride('run', runScale) };
      if (motionRef.current.walking) return { clip: 'walkRifle', timeScale: stride('walkRifle', walkScale) };
    }
    if (heldToolMode) {
      if (modelAssetId === 'darwin5') {
        if (motionRef.current.running) return { clip: 'holdToolRun', timeScale: stride('holdToolRun', runScale) };
        if (motionRef.current.walking) return { clip: 'holdToolWalk', timeScale: stride('holdToolWalk', Math.max(0.7, walkScale)) };
      }
      if (motionRef.current.running) return { clip: 'holdToolRun', timeScale: stride('run', runScale) };
      if (motionRef.current.walking) return { clip: 'holdToolWalk', timeScale: stride('holdToolWalk', walkScale) };
    }
    if (torchMode) {
      if (motionRef.current.running) return { clip: 'torchRun', timeScale: stride('run', runScale) };
      if (motionRef.current.walking) return { clip: 'torchWalk', timeScale: stride('torchWalk', walkScale) };
    }
    // Carrying a handheld tool (net/snare/hammer): held walk, paralleling the rifle set.
    if (holdingTool && (motionRef.current.walking || motionRef.current.running)) {
      return { clip: 'holdWalk', timeScale: stride('holdWalk', Math.max(0.7, walkScale)) };
    }
    if (motionRef.current.running) {
      if (groundPitch > STAIR_PITCH) return { clip: 'runUpStairs', timeScale: stride('run', runScale) };
      if (motionRef.current.tiredRun || status.fatigue >= PLAYER.tiredRunFatigue) return { clip: 'jog', timeScale: stride('jog', tiredRunScale) };
      if (modelAssetId === 'darwin5') {
        // Ankle-to-knee water: high-stepping splash run (wadeWalk owns >0.42).
        if ((motionRef.current.wadeDepth || 0) > 0.16) {
          return { clip: 'grassRun', timeScale: stride('grassRun', runScale) };
        }
        if (motionRef.current.sprinting) {
          return {
            clip: 'sprint',
            timeScale: stride('sprint', THREE.MathUtils.clamp(speed / (PLAYER.runSpeed * SPRINT.speedScale), 0.85, 1.18)),
          };
        }
      }
      return { clip: 'run', timeScale: stride('run', runScale) };
    }
    if (motionRef.current.walking) {
      if (groundPitch > STAIR_PITCH) return { clip: 'walkUpStairs', timeScale: stride('walk', walkScale) };
      if (groundPitch < -STAIR_PITCH) return { clip: 'descendStairs', timeScale: stride('walk', walkScale) };
      if (carryingObject) return { clip: 'walkCarry', timeScale: stride('walkCarry', Math.max(0.68, walkScale * 0.92)) };
      if (motionRef.current.tiredRun || status.fatigue >= PLAYER.tiredRunFatigue) return { clip: 'tiredWalk', timeScale: stride('tiredWalk', Math.max(0.66, walkScale * 0.92)) };
      return { clip: 'walk', timeScale: stride('walk', walkScale) };
    }
    if (badlyInjured) return status.fatigue >= 82 ? 'injuredStumbleIdle' : 'injuredHurtingIdle';
    if (injured) return 'injuredIdle';
    if (hasRifle) return 'rifleIdle';
    if (carryingObject) return 'holdIdle';
    if (torchMode) return 'torchIdle';
    if (heldToolMode) return 'holdToolIdle';
    if (holdingTool) return 'holdIdle';
    if (modelAssetId === 'darwin5') {
      // Conditional base idles, most urgent first: exhausted, catching his
      // breath after a sprint, then the bored long-wait idle. The ready-stance
      // idle stays the default.
      if (status.fatigue >= 82) return 'tiredIdle';
      if (motionRef.current.winded) return 'windedIdle';
      if (motionRef.current.longIdle) return 'boredIdle';
      return 'idle';
    }
    if (status.fatigue >= 82) return 'exhaustedIdle';
    return 'idle';
  }, [modelAssetId, motionRef]);

  return (
    <>
      <ModelAsset
        key={modelAssetId}
        id={modelAssetId}
        animationSelector={selectAnimation}
        overlaySelector={selectAimOverlay}
        damageFlash={damageFlash}
        reflect
        onSceneReady={setModelScene}
        grounding={grounding}
        fallback={<ProceduralNaturalistModel motionRef={motionRef} />}
      />
      {modelScene && <HandLamp scene={modelScene} modelAssetId={modelAssetId} />}
      {modelScene && HAND_TOOLS.map(tool => (
        <HandProp key={tool.toolId} scene={modelScene} config={tool} modelAssetId={modelAssetId} motionRef={motionRef} />
      ))}
    </>
  );
}

useGLTF.preload(LAMP_MODEL_PATH);
HAND_TOOLS.forEach(tool => useGLTF.preload(tool.path));
