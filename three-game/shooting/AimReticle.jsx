'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { shotgunAimState } from './aimState';

const COLD_COLOR = new THREE.Color('#e8dcb8');
const HOT_COLOR = new THREE.Color('#ffd36a');
const FORWARD = new THREE.Vector3(0, 0, 1);

// Diegetic hit marker: a small ring pasted onto whatever surface the
// crosshair ray strikes — terrain slope, boulder flank, tree trunk, water —
// oriented to the surface normal so it hugs the geometry instead of floating
// as a flat disc. It warms toward gold and tightens when a specimen sits
// inside the spread cone, and dims to a slow pulse while the barrels are
// being reloaded. The screen-center crosshair lives in the HUD; this marker
// confirms the world-space landing point.
export default function AimReticle() {
  const groupRef = useRef(null);
  const warmthRef = useRef(0);
  const normal = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#e8dcb8',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);
  const dotMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#e8dcb8',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);

  useEffect(() => () => {
    ringMaterial.dispose();
    dotMaterial.dispose();
  }, [dotMaterial, ringMaterial]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (!shotgunAimState.active || !shotgunAimState.hitValid || !shotgunAimState.hitKind) {
      group.visible = false;
      return;
    }
    group.visible = true;
    normal.set(
      shotgunAimState.hitNormalX,
      shotgunAimState.hitNormalY,
      shotgunAimState.hitNormalZ,
    );
    if (normal.lengthSq() < 1e-4) normal.set(0, 1, 0);
    normal.normalize();
    group.position.set(
      shotgunAimState.hitX + normal.x * 0.045,
      shotgunAimState.hitY + normal.y * 0.045,
      shotgunAimState.hitZ + normal.z * 0.045,
    );
    quat.setFromUnitVectors(FORWARD, normal);
    group.quaternion.copy(quat);
    // Scale with distance so the marker stays legible far away.
    const distanceScale = THREE.MathUtils.clamp(0.7 + shotgunAimState.hitDistance * 0.035, 0.7, 2.0);

    const t = state.clock.elapsedTime;
    const now = (globalThis.performance?.now?.() ?? Date.now()) / 1000;
    const reloading = shotgunAimState.reloadingUntil > now;
    const warmth = THREE.MathUtils.damp(
      warmthRef.current,
      shotgunAimState.onTarget ? THREE.MathUtils.clamp(shotgunAimState.targetScore, 0.35, 1) : 0,
      10,
      delta,
    );
    warmthRef.current = warmth;

    ringMaterial.color.lerpColors(COLD_COLOR, HOT_COLOR, warmth);
    dotMaterial.color.copy(ringMaterial.color);
    if (reloading) {
      const pulse = 0.16 + Math.sin(t * 5.2) * 0.06;
      ringMaterial.opacity = pulse;
      dotMaterial.opacity = pulse * 0.7;
      group.scale.setScalar(distanceScale * 1.12);
      return;
    }
    // Breathe when idle; tighten when a target is in the cone.
    const breathe = 1 + Math.sin(t * 2.6) * 0.035;
    group.scale.setScalar(distanceScale * THREE.MathUtils.lerp(breathe, 0.82, warmth));
    ringMaterial.opacity = 0.5 + warmth * 0.4;
    dotMaterial.opacity = 0.36 + warmth * 0.54;
  });

  return (
    <group
      ref={groupRef}
      visible={false}
      userData={{ renderSource: 'shotgun-aim-reticle', renderLabel: 'Shotgun aim hit marker', renderKind: 'transient-fx' }}
    >
      <mesh material={ringMaterial} renderOrder={7}>
        <ringGeometry args={[0.16, 0.2, 40]} />
      </mesh>
      <mesh material={dotMaterial} renderOrder={7}>
        <circleGeometry args={[0.028, 12]} />
      </mesh>
    </group>
  );
}
