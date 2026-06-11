'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { CAMERA } from './playerConfig';

const UP = new THREE.Vector3(0, 1, 0);

export function usePlayerCameraRig() {
  const { camera, gl } = useThree();
  const yawRef = useRef(0);
  const pitchRef = useRef(CAMERA.defaultPitch);
  const zoomRef = useRef(CAMERA.defaultZoom);
  const draggingRef = useRef(false);
  const panningRef = useRef(false);
  const panOffsetRef = useRef(new THREE.Vector3());
  const lastPointerXRef = useRef(0);
  const lastPointerYRef = useRef(0);
  const cameraFollowYRef = useRef(null);
  const statusLookRef = useRef(null);
  const shoulderPivotRef = useRef(null);

  const cameraTargets = useMemo(() => ({
    shoulder: new THREE.Vector3(1.05, 2.35, 3.75),
    first: new THREE.Vector3(0, 1.72, 0.16),
    top: new THREE.Vector3(0, 20, 0.1),
  }), []);

  useEffect(() => {
    const element = gl.domElement;
    const onPointerDown = event => {
      if (event.button !== 0 && event.button !== 1) return;
      draggingRef.current = true;
      panningRef.current = event.button === 1 || event.shiftKey;
      lastPointerXRef.current = event.clientX;
      lastPointerYRef.current = event.clientY;
      element.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = event => {
      if (!draggingRef.current) return;
      const dx = event.clientX - lastPointerXRef.current;
      const dy = event.clientY - lastPointerYRef.current;
      lastPointerXRef.current = event.clientX;
      lastPointerYRef.current = event.clientY;
      if (panningRef.current || event.shiftKey) {
        const dist = THREE.MathUtils.clamp(zoomRef.current, 4, 14);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, yawRef.current);
        panOffsetRef.current
          .add(right.multiplyScalar(-dx * CAMERA.panSpeed * dist))
          .add(new THREE.Vector3(0, dy * CAMERA.panSpeed * dist, 0));
        if (panOffsetRef.current.length() > CAMERA.maxPan) panOffsetRef.current.setLength(CAMERA.maxPan);
      } else {
        yawRef.current -= dx * CAMERA.rotateSpeed;
        pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - dy * CAMERA.pitchSpeed, CAMERA.minPitch, CAMERA.maxPitch);
      }
    };
    const stopDrag = event => {
      draggingRef.current = false;
      panningRef.current = false;
      if (event?.pointerId !== undefined) element.releasePointerCapture?.(event.pointerId);
    };
    const onWheel = event => {
      event.preventDefault();
      const normalizedDelta = Math.sign(event.deltaY) * Math.min(1.8, Math.abs(event.deltaY) / 80);
      zoomRef.current = THREE.MathUtils.clamp(zoomRef.current + normalizedDelta * 0.9, CAMERA.minZoom, CAMERA.maxZoom);
    };
    element.style.cursor = 'grab';
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', stopDrag);
    element.addEventListener('pointercancel', stopDrag);
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', stopDrag);
      element.removeEventListener('pointercancel', stopDrag);
      element.removeEventListener('wheel', onWheel);
      element.style.cursor = '';
      element.style.touchAction = '';
    };
  }, [gl]);

  const resetCameraForSpawn = useCallback(groundY => {
    cameraFollowYRef.current = groundY;
    statusLookRef.current = null;
    shoulderPivotRef.current = null;
  }, []);

  const updateCamera = useCallback(({
    playerPosition,
    facing,
    collisionAdapter,
    wasAirborne,
    cameraImpulse,
    viewMode,
    now,
    delta,
  }) => {
    const terrainCameraY = collisionAdapter.terrainHeight(playerPosition.x, playerPosition.z) + 0.04;
    const lowTraversalLift = Math.max(0, playerPosition.y - terrainCameraY);
    const cameraTargetY = lowTraversalLift > 0.05 && lowTraversalLift < 0.85 && !wasAirborne
      ? terrainCameraY
      : playerPosition.y;
    cameraFollowYRef.current = cameraFollowYRef.current === null
      ? cameraTargetY
      : THREE.MathUtils.damp(cameraFollowYRef.current, cameraTargetY, 7, delta);
    const cameraAnchor = playerPosition.clone();
    cameraAnchor.y = cameraFollowYRef.current;

    const offset = cameraTargets[viewMode] || cameraTargets.shoulder;
    const desired = offset.clone().applyAxisAngle(UP, yawRef.current).add(cameraAnchor);
    const impulseProgress = THREE.MathUtils.clamp((now - cameraImpulse.startedAt) / Math.max(0.01, cameraImpulse.duration), 0, 1);
    const impulseFade = Math.sin(impulseProgress * Math.PI) * cameraImpulse.intensity;
    const cameraShake = impulseFade > 0.001
      ? new THREE.Vector3(
          Math.sin(now * 43.7 + cameraImpulse.seed) * 0.035 * impulseFade,
          Math.sin(now * 51.1 + cameraImpulse.seed * 2.3) * 0.025 * impulseFade,
          Math.cos(now * 39.3 + cameraImpulse.seed * 1.7) * 0.03 * impulseFade,
        )
      : new THREE.Vector3();
    const statusViewOpen = useThreeGameStore.getState().statusViewOpen;
    const statusPivot = cameraAnchor.clone().add(new THREE.Vector3(0, 1.22, 0)).add(panOffsetRef.current);
    if (statusViewOpen) {
      const forward = new THREE.Vector3(facing.x, 0, facing.z);
      if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
      forward.normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const chest = playerPosition.clone().add(new THREE.Vector3(0, 1.5, 0));
      if (!statusLookRef.current) {
        statusLookRef.current = camera.position.clone()
          .add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(6));
      }
      const ease = 1 - Math.exp(-2.4 * delta);
      const eye = chest.clone()
        .add(forward.clone().multiplyScalar(1.15))
        .add(right.multiplyScalar(0.18))
        .add(new THREE.Vector3(0, 0.05, 0));
      camera.position.lerp(eye, ease);
      statusLookRef.current.lerp(chest, ease);
      camera.lookAt(statusLookRef.current);
    } else if (viewMode === 'first') {
      // Eye sits slightly forward of head center so the camera never ends up
      // inside the skull geometry; vertical motion is snapped, not lerped,
      // because positional lag is what caused the camera to fall behind into
      // the model while moving.
      const eyeForward = new THREE.Vector3(0, 0, -0.22).applyAxisAngle(UP, yawRef.current);
      desired.copy(playerPosition).add(new THREE.Vector3(0, 1.66, 0)).add(eyeForward);
      camera.position.copy(desired);
      const lookPitch = THREE.MathUtils.clamp((CAMERA.defaultPitch - pitchRef.current) * 1.5, -1.3, 1.3);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(lookPitch, yawRef.current, 0);
    } else if (viewMode === 'top') {
      const height = THREE.MathUtils.clamp(zoomRef.current * 4.2, 10, 85);
      const top = cameraAnchor.clone().add(new THREE.Vector3(0, height, 0));
      camera.position.lerp(top.add(cameraShake), 1 - Math.exp(-8 * delta));
      // Fixed straight-down orientation: lookAt near the vertical pole made
      // the camera roll unpredictably as its position lagged the player.
      camera.rotation.order = 'YXZ';
      camera.rotation.set(-Math.PI / 2, yawRef.current, 0);
    } else {
      const cameraForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, yawRef.current);
      const cameraRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, yawRef.current);
      const cameraDistance = zoomRef.current;
      const zoomT = THREE.MathUtils.smoothstep(cameraDistance, CAMERA.minZoom, CAMERA.maxZoom);
      const side = THREE.MathUtils.lerp(0.6, 1.5, zoomT);
      const pitchA = THREE.MathUtils.clamp(pitchRef.current, CAMERA.minPitch, CAMERA.maxPitch);
      // Smooth the pivot itself: looking straight at the raw player position
      // transmits every small physics/animation displacement to the camera,
      // which reads as jitter when running.
      const rawPivot = cameraAnchor.clone().add(new THREE.Vector3(0, 1.22, 0)).add(panOffsetRef.current);
      if (!shoulderPivotRef.current || shoulderPivotRef.current.distanceToSquared(rawPivot) > 36) {
        shoulderPivotRef.current = rawPivot.clone();
      }
      const pivot = shoulderPivotRef.current;
      pivot.x = THREE.MathUtils.damp(pivot.x, rawPivot.x, 9, delta);
      pivot.y = THREE.MathUtils.damp(pivot.y, rawPivot.y, 9, delta);
      pivot.z = THREE.MathUtils.damp(pivot.z, rawPivot.z, 9, delta);
      const horiz = Math.cos(pitchA) * cameraDistance;
      const vert = Math.sin(pitchA) * cameraDistance;
      const eye = pivot.clone()
        .add(cameraForward.clone().multiplyScalar(-horiz))
        .add(cameraRight.multiplyScalar(side))
        .add(new THREE.Vector3(0, vert, 0));
      camera.position.lerp(eye.add(cameraShake), 1 - Math.exp(-6.5 * delta));
      camera.lookAt(pivot);
    }
    if (!statusViewOpen && statusLookRef.current) {
      const ease = 1 - Math.exp(-3.2 * delta);
      statusLookRef.current.lerp(statusPivot, ease);
      camera.lookAt(statusLookRef.current);
      if (statusLookRef.current.distanceToSquared(statusPivot) < 0.02) statusLookRef.current = null;
    }
  }, [camera, cameraTargets]);

  return {
    yawRef,
    pitchRef,
    zoomRef,
    panOffsetRef,
    resetCameraForSpawn,
    updateCamera,
  };
}
