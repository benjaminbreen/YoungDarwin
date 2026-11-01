'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  SYMS_FIELD_CASE_ID,
  SYMS_FIELD_CASE_PROMPT_MODE,
} from '../../npcs/symsActivityPlan';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { emitPropEvent, onPropEvent } from '../../physics/props/propEvents';
import { mergeStaticParts } from '../assets/mergeMeshParts';

import { createPeriodMaterial } from '../../world/regions/materials/periodMaterials';
import { metricBoxUvs } from '../../world/regions/materials/periodMaterialUvs';
import { useDeferredDisposal } from '../assets/useDeferredDisposal';

const INTERACTION_DISTANCE = 2.35;
const PROMPT_POLL_SECONDS = 0.12;
const OPEN_ANGLE = -1.72;

// Local y = 0 is the underside of the skids, so the prop's visualOffsetY is
// simply -(collider half height) and the case cannot drift off the ground.
// Anything moved here must stay inside CASE_HEIGHT or it pokes through the
// collider; propTypes.symsCollectingCase depends on both numbers.
const SKID_TOP = 0.06;
const WELL_FLOOR = 0.34;
const BODY_TOP = 0.48;
const LID_PIVOT_Z = -0.31;

function useDisposableGeometry(factory) {
  const geometry = useMemo(factory, []); // eslint-disable-line react-hooks/exhaustive-deps
  useDeferredDisposal(geometry, disposeGeometry);
  return geometry;
}

function useDisposableMaterial(factory) {
  const material = useMemo(factory, []); // eslint-disable-line react-hooks/exhaustive-deps
  useDeferredDisposal(material, disposeMaterial);
  return material;
}

const disposeGeometry = geometry => geometry.dispose();
const disposeMaterial = material => material.dispose();
const caseBox = (...args) => metricBoxUvs(new RoundedBoxGeometry(...args));

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
  // Extruded rather than flat: a plane buckle reads as a painted yellow square
  // from any angle off head-on, which is most of them.
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -0.011);
  return geometry;
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

function CollectingCaseVisual({ contentsRef, lidRef, onToggle, worldRootRef, offsetY = 0 }) {
  const canvas = useDisposableMaterial(() => createPeriodMaterial('canvas', { color: '#d4c1a2', name: 'CaseCanvas' }));
  const canvasLid = useDisposableMaterial(() => createPeriodMaterial('canvas', { color: '#c5b08f', name: 'CaseCanvasLid' }));
  const leather = useDisposableMaterial(() => createPeriodMaterial('leather', { color: '#e4d1b5', name: 'CaseLeather' }));
  const darkLeather = useDisposableMaterial(() => createPeriodMaterial('leather', { color: '#a88d73', name: 'CaseLeatherDark' }));
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

  const skid = useDisposableGeometry(() => caseBox(1.12, SKID_TOP, 0.1, 2, 0.02));
  const body = useDisposableGeometry(() => caseBox(1.18, WELL_FLOOR - SKID_TOP, 0.6, 3, 0.055));
  const wellWallLong = useDisposableGeometry(() => caseBox(1.18, BODY_TOP - WELL_FLOOR, 0.06, 2, 0.02));
  const wellWallEnd = useDisposableGeometry(() => caseBox(0.06, BODY_TOP - WELL_FLOOR, 0.6, 2, 0.02));
  const lid = useDisposableGeometry(() => caseBox(1.2, 0.1, 0.62, 2, 0.042));
  const sidePatch = useDisposableGeometry(() => caseBox(0.075, 0.3, 0.54, 2, 0.025));
  const cornerCap = useDisposableGeometry(() => caseBox(0.12, 0.13, 0.12, 2, 0.03));
  const edgeBand = useDisposableGeometry(() => caseBox(1.19, 0.045, 0.045, 2, 0.018));
  const frontStrap = useDisposableGeometry(() => caseBox(0.1, 0.4, 0.035, 2, 0.018));
  const lidStrap = useDisposableGeometry(() => caseBox(0.1, 0.035, 0.6, 2, 0.015));
  const buckle = useDisposableGeometry(makeBuckleGeometry);
  const hinge = useDisposableGeometry(() => caseBox(0.11, 0.025, 0.13, 2, 0.01));
  const plaque = useDisposableGeometry(() => caseBox(0.2, 0.012, 0.09, 2, 0.006));
  const tag = useDisposableGeometry(() => caseBox(0.25, 0.13, 0.018, 2, 0.012));
  const inkLine = useDisposableGeometry(() => new THREE.BoxGeometry(0.16, 0.008, 0.006));
  const caseLining = useDisposableGeometry(() => caseBox(1.06, 0.025, 0.48, 2, 0.02));
  const divider = useDisposableGeometry(() => new THREE.BoxGeometry(0.016, 0.1, 0.48));
  const paperPacket = useDisposableGeometry(() => caseBox(0.29, 0.05, 0.21, 2, 0.016));
  const pillBox = useDisposableGeometry(() => new THREE.CylinderGeometry(0.078, 0.078, 0.075, 12));
  const bottle = useDisposableGeometry(() => new THREE.CylinderGeometry(0.048, 0.058, 0.24, 10));
  const clothBundle = useDisposableGeometry(() => caseBox(0.28, 0.1, 0.19, 2, 0.038));
  const handle = useDisposableGeometry(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.18, 0, 0),
      new THREE.Vector3(-0.14, -0.1, 0.055),
      new THREE.Vector3(0, -0.145, 0.075),
      new THREE.Vector3(0.14, -0.1, 0.055),
      new THREE.Vector3(0.18, 0, 0),
    ], false, 'centripetal', 0.35);
    const geometry = new THREE.TubeGeometry(curve, 18, 0.024, 7, false);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * curve.getLength(), uv.getY(i) * 2 * Math.PI * 0.024);
    return geometry;
  });

  const bodyCentre = (SKID_TOP + WELL_FLOOR) * 0.5;
  const wellCentre = (WELL_FLOOR + BODY_TOP) * 0.5;

  // ~32 visible parts collapse to one draw per material: the body as one
  // static set, the lid as another that still swings on its pivot. The hidden
  // contents stay separate so they can be revealed.
  useLayoutEffect(() => {
    const restoreLid = mergeStaticParts(lidRef.current);
    const restoreBody = mergeStaticParts(worldRootRef.current);
    return () => {
      restoreBody();
      restoreLid();
    };
  }, [contentsRef, lidRef, worldRootRef]);

  return (
    <group ref={worldRootRef} position={[0, offsetY, 0]} onClick={onToggle}>
      {/* Skids: a chest of this weight sits on runners, and they also give the
          silhouette a shadow line where it meets the sand. */}
      {[-0.2, 0.2].map(z => (
        <mesh key={`skid-${z}`} castShadow receiveShadow geometry={skid} material={darkLeather} position={[0, SKID_TOP * 0.5, z]} />
      ))}
      <mesh castShadow receiveShadow geometry={body} material={canvas} position={[0, bodyCentre, 0]} />

      {/* Open well: four walls above the solid body so the contents read as
          packed inside rather than balanced on a lid. */}
      {[-0.27, 0.27].map(z => (
        <mesh key={`well-long-${z}`} castShadow receiveShadow geometry={wellWallLong} material={canvas} position={[0, wellCentre, z]} />
      ))}
      {[-0.56, 0.56].map(x => (
        <mesh key={`well-end-${x}`} castShadow receiveShadow geometry={wellWallEnd} material={canvas} position={[x, wellCentre, 0]} />
      ))}
      <mesh receiveShadow geometry={caseLining} material={interior} position={[0, WELL_FLOOR + 0.012, 0]} />

      {[-0.585, 0.585].map(x => (
        <mesh key={`side-${x}`} castShadow receiveShadow geometry={sidePatch} material={leather} position={[x, bodyCentre + 0.02, 0]} />
      ))}
      {[-0.545, 0.545].flatMap(x => [-0.245, 0.245].map(z => (
        <mesh key={`cap-${x}-${z}`} castShadow receiveShadow geometry={cornerCap} material={darkLeather} position={[x, BODY_TOP - 0.05, z]} />
      )))}
      {[-0.28, 0.28].map(z => (
        <mesh key={`band-${z}`} castShadow receiveShadow geometry={edgeBand} material={darkLeather} position={[0, SKID_TOP + 0.03, z]} />
      ))}
      {[-0.29, 0.29].map(x => (
        <React.Fragment key={`closure-${x}`}>
          <mesh castShadow geometry={frontStrap} material={leather} position={[x, bodyCentre + 0.06, 0.315]} />
          <mesh castShadow geometry={buckle} material={brass} position={[x, bodyCentre + 0.06, 0.338]} />
        </React.Fragment>
      ))}
      <mesh castShadow geometry={handle} material={leather} position={[0, BODY_TOP - 0.03, 0.325]} />
      {[-1, 1].map(side => (
        <mesh
          key={`end-handle-${side}`}
          castShadow
          geometry={handle}
          material={leather}
          position={[side * 0.625, BODY_TOP - 0.06, 0]}
          rotation={[0, side * Math.PI * 0.5, 0]}
          scale={[0.62, 0.9, 0.9]}
        />
      ))}

      {/* Contents stay inert and are revealed only by the authored lid motion. */}
      <group ref={contentsRef} visible={false} userData={{ keepSeparate: true }}>
        {[-0.19, 0.19].map(x => (
          <mesh key={`divider-${x}`} geometry={divider} material={interior} position={[x, WELL_FLOOR + 0.05, 0]} />
        ))}
        <mesh castShadow geometry={paperPacket} material={labelPaper} position={[-0.35, WELL_FLOOR + 0.05, 0.07]} rotation={[0, 0.16, 0]} />
        <mesh castShadow geometry={paperPacket} material={labelPaper} position={[-0.31, WELL_FLOOR + 0.095, 0.01]} rotation={[0, -0.09, 0.02]} scale={[0.84, 0.9, 0.88]} />
        <mesh castShadow geometry={pillBox} material={labelPaper} position={[-0.06, WELL_FLOOR + 0.038, 0.09]} />
        <mesh castShadow geometry={pillBox} material={darkLeather} position={[0.08, WELL_FLOOR + 0.038, -0.09]} scale={[0.82, 0.9, 0.82]} />
        <mesh castShadow geometry={clothBundle} material={canvas} position={[0.02, WELL_FLOOR + 0.05, 0.06]} rotation={[0, -0.2, 0]} />
        {[-0.08, 0.03, 0.14].map((z, index) => (
          <mesh
            key={`bottle-${z}`}
            castShadow
            geometry={bottle}
            material={bottleGlass}
            position={[0.4 + (index % 2) * 0.02, WELL_FLOOR + 0.05, z]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.9, 0.86, 0.9]}
          />
        ))}
      </group>

      <group ref={lidRef} position={[0, BODY_TOP + 0.005, LID_PIVOT_Z]} userData={{ keepSeparate: true }}>
        <mesh castShadow receiveShadow geometry={lid} material={canvasLid} position={[0, 0.05, 0.31]} />
        {[-0.29, 0.29].map(x => (
          <mesh key={`lid-strap-${x}`} castShadow geometry={lidStrap} material={leather} position={[x, 0.104, 0.31]} />
        ))}
        {[-0.36, 0.36].map(x => (
          <mesh key={`hinge-${x}`} castShadow geometry={hinge} material={brass} position={[x, 0.052, 0.045]} />
        ))}
        <mesh castShadow geometry={plaque} material={brass} position={[0, 0.106, 0.31]} />
        {/* The label hangs under the lid, so it faces the player once open. */}
        <group position={[0.05, -0.008, 0.34]} rotation={[-Math.PI / 2, 0, -0.045]}>
          <mesh geometry={tag} material={labelPaper} />
          <mesh geometry={inkLine} material={ink} position={[-0.012, 0.023, -0.013]} />
          <mesh geometry={inkLine} material={ink} position={[0.018, -0.018, -0.013]} scale={[0.7, 1, 1]} />
        </group>
      </group>
    </group>
  );
}

export function SymsFieldCaseVisual({ propId = SYMS_FIELD_CASE_ID, offsetY = 0 }) {
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

  return (
    <CollectingCaseVisual
      contentsRef={contentsRef}
      lidRef={lidRef}
      onToggle={toggle}
      worldRootRef={worldRootRef}
      offsetY={offsetY}
    />
  );
}
