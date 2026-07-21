'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useEcologyDebugState } from '../../../world/ecology/ecologyDebugRuntime';

const REJECTION_COLORS = Object.freeze({
  water: '#3297c9',
  moisture: '#725ab7',
  salinity: '#64abc1',
  slope: '#d98942',
  rockiness: '#8a765c',
  canopy: '#335f45',
  exposure: '#d4b45a',
  disturbance: '#bd5e4c',
  'path or worked ground': '#d45c42',
  'placement mask': '#d45c42',
  'structure clearance': '#b9463d',
  'specimen clearance': '#c16a42',
  'arrival sightline': '#cf8750',
  'authored cohort clearance': '#d2a84e',
  'map edge': '#7a6c61',
  'unwalkable terrain': '#76505b',
  'region exclusion': '#d14f77',
  'development map': '#734c81',
  'non-terrestrial map': '#44627c',
});

function sampleColor(sample) {
  if (!sample.accepted) {
    return new THREE.Color(REJECTION_COLORS[sample.rejectionReason] || '#8d4752');
  }
  return new THREE.Color('#d6a83d').lerp(new THREE.Color('#4cdb72'), sample.score);
}

function InstancedSampleDiscs({ samples }) {
  const buffers = useMemo(() => {
    const positions = new Float32Array(samples.length * 3);
    const colors = new Float32Array(samples.length * 3);
    samples.forEach((sample, index) => {
      positions[index * 3] = sample.x;
      positions[index * 3 + 1] = sample.y + 0.3;
      positions[index * 3 + 2] = sample.z;
      sampleColor(sample).toArray(colors, index * 3);
    });
    return { positions, colors };
  }, [samples]);

  if (!samples.length) return null;
  return (
    <points renderOrder={20} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[buffers.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={8}
        sizeAttenuation={false}
        vertexColors
        transparent
        opacity={0.82}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

function InstancedGeneratedMarkers({ points }) {
  const positions = useMemo(() => new Float32Array(points.flatMap(point => [
    point.x,
    (point.y || 0) + 0.9,
    point.z,
  ])), [points]);

  if (!points.length) return null;
  return (
    <points renderOrder={22} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#fff0a1" size={16} sizeAttenuation={false} depthTest={false} toneMapped={false} />
    </points>
  );
}

function PatchCenter({ patch }) {
  return (
    <group position={[patch.x, (patch.y || 0) + 0.15, patch.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={21}>
        <ringGeometry args={[0.7, 0.94, 24]} />
        <meshBasicMaterial color="#f4c95f" transparent opacity={0.9} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.55, 0]} renderOrder={21}>
        <cylinderGeometry args={[0.025, 0.025, 1.1, 6]} />
        <meshBasicMaterial color="#f4c95f" depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function EcologyHabitatDebugLayer({ ecology }) {
  const { enabled, speciesId } = useEcologyDebugState();
  const diagnostic = useMemo(() => (
    ecology?.proceduralFloraDiagnostics?.find(item => item?.speciesId === speciesId) || null
  ), [ecology, speciesId]);
  const generatedPoints = useMemo(() => [
    ...(ecology?.proceduralFlora || [])
      .filter(layer => layer.speciesId === speciesId)
      .flatMap(layer => layer.items || []),
    ...(ecology?.interactiveFlora || [])
      .filter(layer => layer.speciesId === speciesId)
      .flatMap(layer => layer.sites || []),
  ], [ecology, speciesId]);
  const patchCenters = diagnostic?.placementStats?.patchCenters || [];

  useEffect(() => {
    window.__darwinEcologyHabitatDebug = {
      enabled,
      speciesId,
      zoneId: ecology?.zoneId || null,
      sampleCount: diagnostic?.samples?.length || 0,
      generatedCount: generatedPoints.length,
      patchCount: patchCenters.length,
    };
  }, [diagnostic, ecology?.zoneId, enabled, generatedPoints.length, patchCenters.length, speciesId]);

  if (!enabled || !diagnostic) return null;
  return (
    <group name={`ecology-habitat-debug:${speciesId}`}>
      <InstancedSampleDiscs samples={diagnostic.samples || []} />
      <InstancedGeneratedMarkers points={generatedPoints} />
      {patchCenters.map(patch => (
        <PatchCenter key={patch.patchIndex} patch={patch} />
      ))}
    </group>
  );
}
