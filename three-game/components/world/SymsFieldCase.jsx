'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  SYMS_FIELD_CASE_ID,
  SYMS_FIELD_CASE_PROMPT_MODE,
} from '../../npcs/symsActivityPlan';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { emitPropEvent, onPropEvent } from '../../physics/props/propEvents';

const INTERACTION_DISTANCE = 2.35;
const PROMPT_POLL_SECONDS = 0.12;
const OPEN_ANGLE = -1.72;

function useDisposableGeometry(factory) {
  const geometry = useMemo(factory, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function useDisposableMaterial(factory) {
  const material = useMemo(factory, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function makeCanvasTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const hash = (x * 37 + y * 61 + ((x * y) % 29) * 7) % 23;
      const weave = ((x % 4 === 0) ? 7 : 0) + ((y % 5 === 0) ? 5 : 0);
      const lowerStain = Math.max(0, y - 45) * 0.48;
      data[index] = Math.max(0, 139 + hash - weave - lowerStain);
      data[index + 1] = Math.max(0, 98 + hash * 0.62 - weave - lowerStain);
      data[index + 2] = Math.max(0, 55 + hash * 0.32 - weave - lowerStain * 0.7);
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.4, 2.2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeBuckleGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.085, -0.07);
  shape.lineTo(0.085, -0.07);
  shape.lineTo(0.085, 0.07);
  shape.lineTo(-0.085, 0.07);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.052, -0.038);
  hole.lineTo(-0.052, 0.038);
  hole.lineTo(0.052, 0.038);
  hole.lineTo(0.052, -0.038);
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape, 1);
}

function applyDirectSpecularGlint(material) {
  const uniforms = {
    color: { value: new THREE.Color('#ffd878') },
    specularBoost: { value: 6.4 },
    bloomStrength: { value: 1.5 },
    threshold: { value: 0.012 },
    thresholdEnd: { value: 0.12 },
  };
  material.onBeforeCompile = shader => {
    shader.uniforms.uCaseGlintColor = uniforms.color;
    shader.uniforms.uCaseGlintSpecularBoost = uniforms.specularBoost;
    shader.uniforms.uCaseGlintBloomStrength = uniforms.bloomStrength;
    shader.uniforms.uCaseGlintThreshold = uniforms.threshold;
    shader.uniforms.uCaseGlintThresholdEnd = uniforms.thresholdEnd;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec3 uCaseGlintColor;
uniform float uCaseGlintSpecularBoost;
uniform float uCaseGlintBloomStrength;
uniform float uCaseGlintThreshold;
uniform float uCaseGlintThresholdEnd;
void main() {`,
      )
      .replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
  float caseDirectSpecular = dot(reflectedLight.directSpecular, vec3(0.2126, 0.7152, 0.0722));
  float caseGlint = smoothstep(
    uCaseGlintThreshold,
    max(uCaseGlintThreshold + 0.0001, uCaseGlintThresholdEnd),
    caseDirectSpecular
  );
  caseGlint = pow(clamp(caseGlint, 0.0, 1.0), 2.1);
  outgoingLight += reflectedLight.directSpecular * uCaseGlintSpecularBoost;
  outgoingLight += uCaseGlintColor * caseGlint * uCaseGlintBloomStrength;`,
      );
  };
  material.customProgramCacheKey = () => 'syms-case-brass-glint-v1';
  return material;
}

function CollectingCaseVisual({ contentsRef, lidRef, onToggle, worldRootRef }) {
  const canvasTexture = useMemo(makeCanvasTexture, []);
  useEffect(() => () => canvasTexture.dispose(), [canvasTexture]);
  const canvas = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    map: canvasTexture,
    color: '#c6a47b',
    roughness: 0.96,
    metalness: 0,
  }));
  const leather = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    color: '#4d2f1d',
    roughness: 0.79,
    metalness: 0.01,
  }));
  const brass = useDisposableMaterial(() => applyDirectSpecularGlint(new THREE.MeshPhysicalMaterial({
    color: '#c79835',
    roughness: 0.18,
    metalness: 0.96,
    clearcoat: 0.42,
    clearcoatRoughness: 0.12,
    envMapIntensity: 2.1,
  })));
  const labelPaper = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    color: '#cfc29f',
    roughness: 0.97,
    metalness: 0,
  }));
  const ink = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    color: '#342b24',
    roughness: 0.94,
    metalness: 0,
  }));
  const interior = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    color: '#37291f',
    roughness: 0.94,
    metalness: 0,
  }));
  const bottleGlass = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    color: '#465744',
    roughness: 0.36,
    metalness: 0.04,
  }));

  const body = useDisposableGeometry(() => new RoundedBoxGeometry(1.18, 0.44, 0.6, 3, 0.075));
  const lid = useDisposableGeometry(() => new RoundedBoxGeometry(1.2, 0.1, 0.6, 2, 0.045));
  const sidePatch = useDisposableGeometry(() => new RoundedBoxGeometry(0.075, 0.34, 0.54, 2, 0.025));
  const frontStrap = useDisposableGeometry(() => new RoundedBoxGeometry(0.1, 0.42, 0.035, 2, 0.018));
  const lidStrap = useDisposableGeometry(() => new RoundedBoxGeometry(0.1, 0.035, 0.58, 2, 0.015));
  const buckle = useDisposableGeometry(makeBuckleGeometry);
  const tag = useDisposableGeometry(() => new RoundedBoxGeometry(0.25, 0.13, 0.018, 2, 0.012));
  const inkLine = useDisposableGeometry(() => new THREE.BoxGeometry(0.16, 0.008, 0.006));
  const caseLining = useDisposableGeometry(() => new RoundedBoxGeometry(1.04, 0.035, 0.46, 2, 0.035));
  const paperPacket = useDisposableGeometry(() => new RoundedBoxGeometry(0.31, 0.045, 0.22, 2, 0.018));
  const pillBox = useDisposableGeometry(() => new THREE.CylinderGeometry(0.082, 0.082, 0.055, 12));
  const bottle = useDisposableGeometry(() => new THREE.CylinderGeometry(0.045, 0.065, 0.29, 10));
  const clothBundle = useDisposableGeometry(() => new RoundedBoxGeometry(0.3, 0.11, 0.2, 2, 0.04));
  const handle = useDisposableGeometry(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.18, 0, 0),
      new THREE.Vector3(-0.14, -0.1, 0.055),
      new THREE.Vector3(0, -0.145, 0.075),
      new THREE.Vector3(0.14, -0.1, 0.055),
      new THREE.Vector3(0.18, 0, 0),
    ], false, 'centripetal', 0.35);
    return new THREE.TubeGeometry(curve, 18, 0.024, 7, false);
  });

  return (
    <group ref={worldRootRef} onClick={onToggle}>
      <mesh castShadow receiveShadow geometry={body} material={canvas} position={[0, 0.25, 0]} />
      <mesh receiveShadow geometry={caseLining} material={interior} position={[0, 0.478, 0]} />
      {[-0.58, 0.58].map(x => (
        <mesh key={`side-${x}`} castShadow receiveShadow geometry={sidePatch} material={leather} position={[x, 0.25, 0]} />
      ))}
      {[-0.29, 0.29].map(x => (
        <React.Fragment key={`closure-${x}`}>
          <mesh castShadow geometry={frontStrap} material={leather} position={[x, 0.25, 0.315]} />
          <mesh castShadow geometry={buckle} material={brass} position={[x, 0.285, 0.338]} />
        </React.Fragment>
      ))}
      <mesh castShadow geometry={handle} material={leather} position={[0, 0.29, 0.335]} />

      {/* Contents stay inert and are revealed only by the authored lid motion. */}
      <group ref={contentsRef} visible={false}>
        <mesh castShadow geometry={paperPacket} material={labelPaper} position={[-0.31, 0.515, 0.08]} rotation={[0, 0.18, 0]} />
        <mesh castShadow geometry={paperPacket} material={labelPaper} position={[-0.24, 0.54, 0.02]} rotation={[0, -0.08, 0.03]} scale={[0.82, 1, 0.86]} />
        <mesh castShadow geometry={pillBox} material={labelPaper} position={[0.08, 0.515, 0.08]} />
        <mesh castShadow geometry={pillBox} material={leather} position={[0.25, 0.515, 0.1]} scale={[0.82, 0.85, 0.82]} />
        <mesh castShadow geometry={bottle} material={bottleGlass} position={[0.37, 0.55, -0.08]} rotation={[0, 0, Math.PI / 2]} />
        <mesh castShadow geometry={clothBundle} material={canvas} position={[0.03, 0.535, -0.12]} rotation={[0, -0.22, 0]} />
      </group>

      <group ref={lidRef} position={[0, 0.49, -0.3]}>
        <mesh castShadow receiveShadow geometry={lid} material={canvas} position={[0, 0.02, 0.3]} />
        {[-0.29, 0.29].map(x => (
          <mesh key={`lid-strap-${x}`} castShadow geometry={lidStrap} material={leather} position={[x, 0.082, 0.3]} />
        ))}
        <group position={[0.05, 0.085, 0.32]} rotation={[-Math.PI / 2, 0, -0.045]}>
          <mesh geometry={tag} material={labelPaper} />
          <mesh geometry={inkLine} material={ink} position={[-0.012, 0.023, 0.013]} />
          <mesh geometry={inkLine} material={ink} position={[0.018, -0.018, 0.013]} scale={[0.7, 1, 1]} />
        </group>
      </group>
    </group>
  );
}

export function SymsFieldCaseVisual({ propId = SYMS_FIELD_CASE_ID }) {
  const lidRef = useRef(null);
  const contentsRef = useRef(null);
  const worldRootRef = useRef(null);
  const worldPositionRef = useRef(new THREE.Vector3());
  const promptPollRef = useRef(-10);
  const openAmountRef = useRef(0);
  const [open, setOpen] = useState(false);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const toggle = useCallback(event => {
    if (event?.id && event.id !== propId) return;
    event?.stopPropagation?.();
    const next = !open;
    setOpen(next);
    const worldPosition = worldRootRef.current
      ? worldRootRef.current.getWorldPosition(worldPositionRef.current)
      : null;
    emitPropEvent('container-foley', {
      kind: next ? 'chest-open' : 'chest-close',
      propId,
      position: worldPosition ? { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z } : null,
    });
  }, [open, propId]);

  useEffect(() => onPropEvent('toggle-syms-field-case', toggle), [toggle]);

  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.id === propId) setCarryPrompt(null);
  }, [propId, setCarryPrompt]);

  useFrame(({ clock }, delta) => {
    const elapsed = clock.elapsedTime;
    openAmountRef.current = THREE.MathUtils.damp(
      openAmountRef.current,
      open ? 1 : 0,
      open ? 6.2 : 7.4,
      Math.min(delta, 0.05),
    );
    if (lidRef.current) lidRef.current.rotation.x = OPEN_ANGLE * openAmountRef.current;
    if (contentsRef.current) contentsRef.current.visible = openAmountRef.current > 0.06;

    if (elapsed - promptPollRef.current < PROMPT_POLL_SECONDS) return;
    promptPollRef.current = elapsed;
    const root = worldRootRef.current;
    if (!root) return;
    root.getWorldPosition(worldPositionRef.current);
    const player = getRuntimePlayerPose()?.position || { x: 0, z: 0 };
    const distance = Math.hypot(
      (player.x || 0) - worldPositionRef.current.x,
      (player.z || 0) - worldPositionRef.current.z,
    );
    const state = useThreeGameStore.getState();
    const activePrompt = state.carryPrompt;
    const ownsPrompt = activePrompt?.id === propId;
    if (distance <= INTERACTION_DISTANCE
      && (!activePrompt || ownsPrompt || distance < (activePrompt.distance ?? Infinity))) {
      setCarryPrompt({
        id: propId,
        label: 'Covington’s collecting case',
        mode: SYMS_FIELD_CASE_PROMPT_MODE,
        distance,
        text: `Press E to ${open ? 'close' : 'open'} collecting case`,
      });
    } else if (ownsPrompt) {
      setCarryPrompt(null);
    }
  });

  return <CollectingCaseVisual contentsRef={contentsRef} lidRef={lidRef} onToggle={toggle} worldRootRef={worldRootRef} />;
}
