'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Lightweight ambient birds for distant circling wildlife. These stay
// procedural rather than GLB-based so every authored ecology map can keep cheap
// always-on movement, while the closer hero birds use FlyingModelFlock.

const TWO_PI = Math.PI * 2;
const DEFAULT_ALTITUDE_LIFT = 14;
const FLAP_CADENCE_SCALE = 1.3;

const SPECIES_PROFILES = {
  frigatebird: {
    material: 'dark',
    shape: 'soarer',
    scale: 0.78,
    flapRate: 0.55,
    flapAmplitude: 0.34,
    glideBias: 0.78,
    altitudeLift: DEFAULT_ALTITUDE_LIFT,
    wingDihedral: 0.13,
    wingSweep: 0.04,
    bank: 0.46,
    pitch: 0.06,
    tailFork: 1,
  },
  gull: {
    material: 'gull',
    shape: 'coastal',
    scale: 0.54,
    flapRate: 0.82,
    flapAmplitude: 0.42,
    glideBias: 0.55,
    altitudeLift: DEFAULT_ALTITUDE_LIFT + 2,
    wingDihedral: 0.1,
    wingSweep: 0.02,
    bank: 0.34,
    pitch: 0.045,
    tailFork: 0.2,
  },
  booby: {
    material: 'blueGrey',
    shape: 'coastal',
    scale: 0.62,
    flapRate: 0.68,
    flapAmplitude: 0.38,
    glideBias: 0.64,
    altitudeLift: DEFAULT_ALTITUDE_LIFT + 1,
    wingDihedral: 0.11,
    wingSweep: 0.03,
    bank: 0.4,
    pitch: 0.05,
    tailFork: 0.1,
  },
};

function birdProfile(spec, index = 0) {
  const raw = String(spec?.species || spec?.kind || spec?.type || spec?.variant || '').toLowerCase();
  const size = String(spec?.size || '').toLowerCase();
  if (!raw) {
    return (size.includes('small') || index % 3 === 1)
      ? SPECIES_PROFILES.gull
      : SPECIES_PROFILES.frigatebird;
  }
  if (raw.includes('gull')) return SPECIES_PROFILES.gull;
  if (raw.includes('booby')) return SPECIES_PROFILES.booby;
  if (raw.includes('coastal') || raw.includes('small') || size.includes('small')) return SPECIES_PROFILES.gull;
  return SPECIES_PROFILES.frigatebird;
}

function birdBodyGeometry(shape = 'soarer') {
  const geo = new THREE.BufferGeometry();
  const coastal = shape === 'coastal';
  const headZ = coastal ? 0.36 : 0.48;
  const body = coastal
    ? [
      0, 0.04, 0.36, -0.11, 0.0, 0.02, 0.11, 0.0, 0.02,
      0, 0.04, 0.36, 0.11, 0.0, 0.02, 0, -0.045, -0.02,
      0, 0.04, 0.36, 0, -0.045, -0.02, -0.11, 0.0, 0.02,
      -0.11, 0.0, 0.02, 0, -0.045, -0.02, 0, 0.005, -0.34,
      0.11, 0.0, 0.02, 0, 0.005, -0.34, 0, -0.045, -0.02,
      -0.11, 0.0, 0.02, 0, 0.005, -0.34, 0.11, 0.0, 0.02,
    ]
    : [
      // low tapered body, local +Z is forward
      0, 0.035, 0.48, -0.08, 0.0, 0.04, 0.08, 0.0, 0.04,
      0, 0.035, 0.48, 0.08, 0.0, 0.04, 0, -0.04, 0.0,
      0, 0.035, 0.48, 0, -0.04, 0.0, -0.08, 0.0, 0.04,
      -0.08, 0.0, 0.04, 0, -0.04, 0.0, 0, 0.005, -0.45,
      0.08, 0.0, 0.04, 0, 0.005, -0.45, 0, -0.04, 0.0,
      -0.08, 0.0, 0.04, 0, 0.005, -0.45, 0.08, 0.0, 0.04,
    ];
  const beakBase = headZ + 0.045;
  const beakTip = headZ + (coastal ? 0.2 : 0.19);
  body.push(
    // A tiny tetrahedral bill is enough to keep the head/body silhouette
    // directional when the bird is banked against a bright sky.
    -0.035, 0.06, beakBase, 0.035, 0.06, beakBase, 0, 0.045, beakTip,
    0.035, 0.06, beakBase, 0, 0.005, beakBase, 0, 0.045, beakTip,
    0, 0.005, beakBase, -0.035, 0.06, beakBase, 0, 0.045, beakTip,
  );
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(body), 3));
  geo.computeVertexNormals();
  return geo;
}

function birdArmGeometry(side = 1, shape = 'soarer') {
  const geo = new THREE.BufferGeometry();
  const s = side >= 0 ? 1 : -1;
  const coastal = shape === 'coastal';
  const vertices = coastal
    ? new Float32Array([
      s * 0.04, 0, 0.14, s * 0.24, 0.012, 0.22, s * 0.08, 0, -0.12,
      s * 0.24, 0.012, 0.22, s * 0.22, 0, -0.17, s * 0.08, 0, -0.12,
      s * 0.24, 0.012, 0.22, s * 0.43, 0.006, 0.1, s * 0.22, 0, -0.17,
      s * 0.43, 0.006, 0.1, s * 0.43, 0, -0.06, s * 0.22, 0, -0.17,
    ])
    : new Float32Array([
      s * 0.04, 0, 0.15, s * 0.29, 0.012, 0.24, s * 0.08, 0, -0.15,
      s * 0.29, 0.012, 0.24, s * 0.3, 0, -0.2, s * 0.08, 0, -0.15,
      s * 0.29, 0.012, 0.24, s * 0.55, 0.006, 0.11, s * 0.3, 0, -0.2,
      s * 0.55, 0.006, 0.11, s * 0.55, 0, -0.05, s * 0.3, 0, -0.2,
    ]);
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  return geo;
}

function birdHandGeometry(side = 1, shape = 'soarer') {
  const geo = new THREE.BufferGeometry();
  const s = side >= 0 ? 1 : -1;
  const coastal = shape === 'coastal';
  const vertices = coastal
    ? new Float32Array([
      0, 0.006, 0.08, s * 0.23, 0.009, 0.055, 0, 0, -0.09,
      s * 0.23, 0.009, 0.055, s * 0.15, 0, -0.14, 0, 0, -0.09,
      s * 0.23, 0.009, 0.055, s * 0.43, 0, -0.025, s * 0.15, 0, -0.14,
      s * 0.43, 0, -0.025, s * 0.34, 0, -0.18, s * 0.15, 0, -0.14,
    ])
    : new Float32Array([
      0, 0.006, 0.08, s * 0.3, 0.009, 0.045, 0, 0, -0.09,
      s * 0.3, 0.009, 0.045, s * 0.2, 0, -0.15, 0, 0, -0.09,
      s * 0.3, 0.009, 0.045, s * 0.55, 0, -0.035, s * 0.2, 0, -0.15,
      s * 0.55, 0, -0.035, s * 0.44, 0, -0.19, s * 0.2, 0, -0.15,
    ]);
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  return geo;
}

function birdTailGeometry(side = 1, shape = 'soarer') {
  const geo = new THREE.BufferGeometry();
  const s = side >= 0 ? 1 : -1;
  const coastal = shape === 'coastal';
  const vertices = coastal
    ? new Float32Array([
      0, 0, -0.25,
      s * 0.12, 0, -0.46,
      s * 0.02, 0, -0.32,
    ])
    : new Float32Array([
      0, 0, -0.3,
      s * 0.14, 0, -0.6,
      s * 0.03, 0, -0.38,
    ]);
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  return geo;
}

function birdHeadGeometry() {
  return new THREE.IcosahedronGeometry(0.07, 0);
}

function makeMaterials(color) {
  const base = { side: THREE.DoubleSide, fog: true, depthWrite: true };
  const makeSet = ({ body, head = body, wing, primary, tail }) => ({
    body: new THREE.MeshBasicMaterial({ ...base, color: body }),
    head: new THREE.MeshBasicMaterial({ ...base, color: head }),
    wing: new THREE.MeshBasicMaterial({ ...base, color: wing }),
    primary: new THREE.MeshBasicMaterial({ ...base, color: primary }),
    tail: new THREE.MeshBasicMaterial({ ...base, color: tail }),
  });
  return {
    dark: makeSet({
      body: color,
      head: '#312d20',
      wing: '#30363a',
      primary: '#20262a',
      tail: '#11100d',
    }),
    gull: makeSet({
      body: '#8a897c',
      head: '#b6ae91',
      wing: '#8e918a',
      primary: '#4d5658',
      tail: '#272a27',
    }),
    blueGrey: makeSet({
      body: '#50666c',
      head: '#7f8e8d',
      wing: '#53686d',
      primary: '#344149',
      tail: '#1b2328',
    }),
  };
}

function resolvePath(spec, profile, index, t) {
  const mode = spec.path || spec.motion || 'thermalCircle';
  const speed = spec.speed ?? 0.075;
  const travelDirection = Math.sign(speed || 1);
  const phase = spec.phase ?? 0;
  const radiusX = spec.radiusX ?? spec.radius ?? 22;
  const radiusZ = spec.radiusZ ?? spec.radius ?? radiusX * 0.66;
  const cx = spec.cx ?? 0;
  const cz = spec.cz ?? 0;
  const altitudeLift = spec.altitudeLift ?? (spec.noAltitudeLift ? 0 : profile.altitudeLift ?? DEFAULT_ALTITUDE_LIFT);
  const heightJitter = spec.heightJitter ?? ((index % 3) - 1) * 1.35;
  const baseHeight = (spec.height ?? 18) + altitudeLift + heightJitter;
  const a = t * speed + phase;
  const wind = Math.sin(t * 0.13 + phase * 1.7);
  const wobble = Math.sin(t * 0.21 + phase) * 0.08;

  if (mode === 'figureEight' || mode === 'lazyFigureEight') {
    const x = cx + Math.sin(a) * radiusX;
    const z = cz + Math.sin(a * 2 + phase * 0.4) * radiusZ * 0.58;
    const dx = Math.cos(a) * radiusX * travelDirection;
    const dz = Math.cos(a * 2 + phase * 0.4) * 2 * radiusZ * 0.58 * travelDirection;
    return {
      x,
      z,
      dx,
      dz,
      y: baseHeight + Math.sin(t * 0.24 + phase) * (spec.floatAmount ?? 1.2) + wind * 0.45,
      phase: a,
    };
  }

  const radiusPulse = 1 + Math.sin(t * 0.17 + phase * 0.9) * 0.045;
  const x = cx + Math.cos(a + wobble) * radiusX * radiusPulse;
  const z = cz + Math.sin(a + wobble) * radiusZ * (1 + wind * 0.035);
  const dx = -Math.sin(a + wobble) * radiusX * radiusPulse * travelDirection;
  const dz = Math.cos(a + wobble) * radiusZ * (1 + wind * 0.035) * travelDirection;
  return {
    x,
    z,
    dx,
    dz,
    y: baseHeight + Math.sin(t * 0.27 + phase) * (spec.floatAmount ?? 1.25) + wind * 0.5,
    phase: a,
  };
}

function cacheParts(bird) {
  if (!bird.userData.parts) {
    bird.userData.parts = {
      body: bird.getObjectByName('body'),
      leftWing: bird.getObjectByName('left-wing'),
      rightWing: bird.getObjectByName('right-wing'),
      leftHand: bird.getObjectByName('left-hand'),
      rightHand: bird.getObjectByName('right-hand'),
      leftTail: bird.getObjectByName('left-tail'),
      rightTail: bird.getObjectByName('right-tail'),
    };
  }
  return bird.userData.parts;
}

export function BirdFlock({ birds, color = '#24231c', scale = 1.55 }) {
  const groupRef = useRef(null);
  const geometries = useMemo(() => ({
    soarer: {
      body: birdBodyGeometry('soarer'),
      head: birdHeadGeometry(),
      leftArm: birdArmGeometry(1, 'soarer'),
      rightArm: birdArmGeometry(-1, 'soarer'),
      leftHand: birdHandGeometry(1, 'soarer'),
      rightHand: birdHandGeometry(-1, 'soarer'),
      leftHandOffset: [0.55, 0, 0.03],
      rightHandOffset: [-0.55, 0, 0.03],
      leftTail: birdTailGeometry(1, 'soarer'),
      rightTail: birdTailGeometry(-1, 'soarer'),
      headZ: 0.48,
    },
    coastal: {
      body: birdBodyGeometry('coastal'),
      head: birdHeadGeometry(),
      leftArm: birdArmGeometry(1, 'coastal'),
      rightArm: birdArmGeometry(-1, 'coastal'),
      leftHand: birdHandGeometry(1, 'coastal'),
      rightHand: birdHandGeometry(-1, 'coastal'),
      leftHandOffset: [0.43, 0, 0.02],
      rightHandOffset: [-0.43, 0, 0.02],
      leftTail: birdTailGeometry(1, 'coastal'),
      rightTail: birdTailGeometry(-1, 'coastal'),
      headZ: 0.36,
    },
  }), []);
  const materials = useMemo(() => makeMaterials(color), [color]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const group = groupRef.current;
    if (!group) return;
    group.children.forEach((bird, index) => {
      const spec = birds[index];
      if (!spec) return;
      const profile = birdProfile(spec, index);
      const path = resolvePath(spec, profile, index, t);
      const tangentLength = Math.hypot(path.dx, path.dz) || 1;
      const tangentX = path.dx / tangentLength;
      const tangentZ = path.dz / tangentLength;
      const yaw = Math.atan2(tangentX, tangentZ) + (spec.yawOffset ?? 0);
      const turnSign = Math.sign((spec.speed ?? 0.075) || 1);
      const glideWave = Math.sin(t * 0.22 + (spec.phase ?? 0) * 2.4);
      const powerThreshold = profile.glideBias * 2 - 1;
      const powerBlend = THREE.MathUtils.smoothstep(
        glideWave,
        powerThreshold - 0.1,
        powerThreshold + 0.14,
      );
      const gliding = powerBlend < 0.14;
      const flapRate = (spec.flapRate ?? profile.flapRate) * FLAP_CADENCE_SCALE;
      const flapPhase = t * flapRate * TWO_PI + (spec.phase ?? 0) * 2.1;
      const flapEnvelope = 0.025 + powerBlend * 0.975;
      // A warped sine makes the power stroke faster than the recovery. The
      // hand trails the shoulder, then folds rearward on the upstroke; that
      // articulated wrist is the strongest bird (rather than bat) cue here.
      const strokeWave = phase => Math.sin(phase + 0.42 * Math.sin(phase));
      const shoulderStroke = strokeWave(flapPhase);
      const handStroke = strokeWave(flapPhase - 0.48);
      const flapAmplitude = spec.flapAmplitude ?? profile.flapAmplitude;
      const flap = shoulderStroke * flapAmplitude * flapEnvelope;
      const handFlap = handStroke * flapAmplitude * flapEnvelope;
      const downstroke = Math.max(0, -shoulderStroke) * powerBlend;
      const recoveryFlex = Math.max(0, shoulderStroke) * powerBlend;
      const glideLift = gliding ? 0.08 + Math.sin(t * 0.48 + (spec.phase ?? 0)) * 0.025 : 0;
      const bank = -turnSign * (spec.bankAmount ?? profile.bank) + Math.sin(path.phase * 0.7) * 0.08;
      const pitch = Math.sin(path.phase * 0.5) * (spec.pitchAmount ?? profile.pitch) - glideLift;
      const parts = cacheParts(bird);

      bird.position.set(path.x, path.y, path.z);
      bird.rotation.set(pitch, yaw, bank);

      if (parts.leftWing && parts.rightWing) {
        const dihedral = spec.wingDihedral ?? profile.wingDihedral;
        const sweep = spec.wingSweep ?? profile.wingSweep;
        const strokeSweep = strokeWave(flapPhase - 0.18) * flapAmplitude * flapEnvelope * 0.18;
        parts.leftWing.rotation.set(-downstroke * 0.06, sweep + strokeSweep, dihedral + flap);
        parts.rightWing.rotation.set(-downstroke * 0.06, -sweep - strokeSweep, -dihedral - flap);
        if (parts.leftHand && parts.rightHand) {
          const glideWristBreak = gliding ? 0.1 : 0;
          const wristFold = recoveryFlex * 0.52;
          const relativeFlap = (handFlap - flap) * 0.9 - glideWristBreak;
          const featherWash = (-downstroke * 0.12 + recoveryFlex * 0.04) * flapEnvelope;
          parts.leftHand.rotation.set(featherWash, wristFold, relativeFlap);
          parts.rightHand.rotation.set(featherWash, -wristFold, -relativeFlap);
        }
      }
      if (parts.leftTail && parts.rightTail) {
        const fork = spec.tailFork ?? profile.tailFork;
        parts.leftTail.rotation.z = 0.08 + fork * 0.12;
        parts.rightTail.rotation.z = -0.08 - fork * 0.12;
      }
      if (parts.body) {
        parts.body.position.y = downstroke * 0.018;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {birds.map((spec, index) => {
        const profile = birdProfile(spec, index);
        const materialSet = materials[profile.material] || materials.dark;
        const geometrySet = geometries[profile.shape] || geometries.soarer;
        const scaleJitter = 0.92 + ((index * 37) % 13) / 100;
        const birdScale = spec.scale ?? scale * profile.scale * scaleJitter;
        return (
          <group key={spec.id || index} scale={birdScale}>
            <group name="body">
              <mesh geometry={geometrySet.body} material={materialSet.body} />
              <mesh
                geometry={geometrySet.head}
                material={materialSet.head}
                position={[0, 0.052, geometrySet.headZ]}
                scale={profile.shape === 'coastal' ? [1.12, 0.86, 0.92] : [0.9, 0.78, 1.08]}
              />
            </group>
            <group name="left-wing">
              <mesh geometry={geometrySet.leftArm} material={materialSet.wing} />
              <group name="left-hand" position={geometrySet.leftHandOffset}>
                <mesh geometry={geometrySet.leftHand} material={materialSet.primary} />
              </group>
            </group>
            <group name="right-wing">
              <mesh geometry={geometrySet.rightArm} material={materialSet.wing} />
              <group name="right-hand" position={geometrySet.rightHandOffset}>
                <mesh geometry={geometrySet.rightHand} material={materialSet.primary} />
              </group>
            </group>
            <mesh name="left-tail" geometry={geometrySet.leftTail} material={materialSet.tail} />
            <mesh name="right-tail" geometry={geometrySet.rightTail} material={materialSet.tail} />
          </group>
        );
      })}
    </group>
  );
}
