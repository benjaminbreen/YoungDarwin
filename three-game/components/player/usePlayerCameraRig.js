'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { CAMERA, SWIM_POLISH } from './playerConfig';
import { WATER_LEVEL } from '../../world/water';

const UP = new THREE.Vector3(0, 1, 0);

function dampAngle(current, target, lambda, delta) {
  const wrapped = current + Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return THREE.MathUtils.damp(current, wrapped, lambda, delta);
}

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
  const swimCameraRef = useRef(0);
  // Flight chase camera yields to manual orbiting: dragging suspends the
  // auto-align for a grace period; Tab (recenter) hands control back.
  const manualOrbitUntilRef = useRef(0);
  const manualOrbitBlendRef = useRef(0);
  const openingCameraActiveRef = useRef(false);
  const openingCameraRuntimeRef = useRef({
    sequenceId: null,
    startedAt: 0,
    initialized: false,
    finalPivot: new THREE.Vector3(),
    finalEye: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
  });
  // Aim mode: cursor drives Darwin's facing instead of the camera. While
  // aimActiveRef is true, left-drag no longer rotates the camera (the cursor
  // aims) and a left-click bumps firePulseRef so the controller can fire.
  const pointerNdcRef = useRef(new THREE.Vector2(0, 0));
  const aimActiveRef = useRef(false);
  const firePulseRef = useRef(0);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const aimPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const aimHit = useMemo(() => new THREE.Vector3(), []);
  const aimDir = useMemo(() => new THREE.Vector3(), []);
  const scratch = useMemo(() => ({
    panRight: new THREE.Vector3(),
    panVertical: new THREE.Vector3(),
    recenterForward: new THREE.Vector3(),
    cameraAnchor: new THREE.Vector3(),
    desired: new THREE.Vector3(),
    cameraShake: new THREE.Vector3(),
    statusPivot: new THREE.Vector3(),
    statusForward: new THREE.Vector3(),
    statusRight: new THREE.Vector3(),
    chest: new THREE.Vector3(),
    statusEye: new THREE.Vector3(),
    worldDirection: new THREE.Vector3(),
    eyeForward: new THREE.Vector3(),
    top: new THREE.Vector3(),
    cameraForward: new THREE.Vector3(),
    cameraRight: new THREE.Vector3(),
    rawPivot: new THREE.Vector3(),
    shoulderEye: new THREE.Vector3(),
    droppingEye: new THREE.Vector3(),
    droppingLook: new THREE.Vector3(),
    droppingForward: new THREE.Vector3(),
    droppingRight: new THREE.Vector3(),
    introStartTarget: new THREE.Vector3(),
    introStartEye: new THREE.Vector3(),
    introFinalPivot: new THREE.Vector3(),
    introFinalEye: new THREE.Vector3(),
    introEye: new THREE.Vector3(),
    introLookTarget: new THREE.Vector3(),
    introForward: new THREE.Vector3(),
    introRight: new THREE.Vector3(),
  }), []);

  const updatePointerNdc = useCallback(event => {
    const rect = gl.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerNdcRef.current.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
  }, [gl]);

  // Raycast the cursor onto a horizontal plane at chest height and return the
  // normalized horizontal direction from `origin` to that point (or null).
  const getAimDirection = useCallback(origin => {
    raycaster.setFromCamera(pointerNdcRef.current, camera);
    aimPlane.constant = -(origin.y + 1.1);
    if (!raycaster.ray.intersectPlane(aimPlane, aimHit)) return null;
    aimDir.set(aimHit.x - origin.x, 0, aimHit.z - origin.z);
    if (aimDir.lengthSq() < 1e-4) return null;
    return aimDir.normalize();
  }, [camera, raycaster, aimPlane, aimHit, aimDir]);

  const cameraTargets = useMemo(() => ({
    shoulder: new THREE.Vector3(1.05, 2.35, 3.75),
    first: new THREE.Vector3(0, 1.72, 0.16),
    top: new THREE.Vector3(0, 20, 0.1),
  }), []);

  useEffect(() => {
    const element = gl.domElement;
    const onPointerDown = event => {
      if (openingCameraActiveRef.current) {
        updatePointerNdc(event);
        return;
      }
      // Aiming: a left-click fires the rifle instead of starting a camera drag.
      if (aimActiveRef.current && event.button === 0) {
        updatePointerNdc(event);
        firePulseRef.current += 1;
        return;
      }
      if (event.button !== 0 && event.button !== 1) return;
      draggingRef.current = true;
      panningRef.current = event.button === 1 || event.shiftKey;
      lastPointerXRef.current = event.clientX;
      lastPointerYRef.current = event.clientY;
      element.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = event => {
      updatePointerNdc(event);
      if (openingCameraActiveRef.current) return;
      if (!draggingRef.current) return;
      const dx = event.clientX - lastPointerXRef.current;
      const dy = event.clientY - lastPointerYRef.current;
      lastPointerXRef.current = event.clientX;
      lastPointerYRef.current = event.clientY;
      if (panningRef.current || event.shiftKey) {
        const dist = THREE.MathUtils.clamp(zoomRef.current, 4, 14);
        const right = scratch.panRight.set(1, 0, 0).applyAxisAngle(UP, yawRef.current);
        panOffsetRef.current
          .add(right.multiplyScalar(-dx * CAMERA.panSpeed * dist))
          .add(scratch.panVertical.set(0, dy * CAMERA.panSpeed * dist, 0));
        if (panOffsetRef.current.length() > CAMERA.maxPan) panOffsetRef.current.setLength(CAMERA.maxPan);
      } else if (!aimActiveRef.current) {
        // While aiming the cursor controls Darwin's facing, not the camera.
        yawRef.current -= dx * CAMERA.rotateSpeed;
        pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - dy * CAMERA.pitchSpeed, CAMERA.minPitch, CAMERA.maxPitch);
        manualOrbitUntilRef.current = performance.now() / 1000 + 3.2;
      }
    };
    const stopDrag = event => {
      draggingRef.current = false;
      panningRef.current = false;
      if (event?.pointerId !== undefined) element.releasePointerCapture?.(event.pointerId);
    };
    const onWheel = event => {
      event.preventDefault();
      if (openingCameraActiveRef.current) return;
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
  }, [gl, scratch, updatePointerNdc]);

  const resetCameraForSpawn = useCallback(groundY => {
    cameraFollowYRef.current = groundY;
    statusLookRef.current = null;
    shoulderPivotRef.current = null;
  }, []);

  const recenterCamera = useCallback((facing, options = {}) => {
    const forward = scratch.recenterForward.set(facing?.x || 0, 0, facing?.z || -1);
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
    forward.normalize();
    // behind: chase-view convention (camera look direction = facing), used by
    // flight so Tab snaps to directly behind the bird.
    yawRef.current = options.behind
      ? Math.atan2(-forward.x, -forward.z)
      : Math.atan2(forward.x, forward.z);
    manualOrbitUntilRef.current = 0;
    panOffsetRef.current.set(0, 0, 0);
    shoulderPivotRef.current = null;
  }, [scratch]);

  const updateCamera = useCallback(({
    playerPosition,
    facing,
    collisionAdapter,
    wasAirborne,
    cameraImpulse,
    viewMode,
    openingCamera = null,
    finchDroppingCamera = null,
    swimming = false,
    wadeDepth = 0,
    flying = false,
    flightSpeedT = 0,
    cameraProfile = null,
    now,
    delta,
  }) => {
    const openingCameraActive = Boolean(openingCamera?.active);
    openingCameraActiveRef.current = openingCameraActive;
    if (!openingCameraActive) {
      openingCameraRuntimeRef.current.sequenceId = null;
      openingCameraRuntimeRef.current.startedAt = 0;
      openingCameraRuntimeRef.current.initialized = false;
    }
    const swimTarget = swimming ? 1 : THREE.MathUtils.smoothstep(wadeDepth, 0.45, 1.15) * 0.18;
    swimCameraRef.current = THREE.MathUtils.damp(
      swimCameraRef.current,
      swimTarget,
      swimTarget > swimCameraRef.current ? 4.8 : 3.2,
      delta,
    );
    const swimCamera = swimCameraRef.current;
    const terrainCameraY = collisionAdapter.terrainHeight(playerPosition.x, playerPosition.z) + 0.04;
    const lowTraversalLift = Math.max(0, playerPosition.y - terrainCameraY);
    const cameraTargetY = lowTraversalLift > 0.05 && lowTraversalLift < 0.85 && !wasAirborne
      ? terrainCameraY
      : playerPosition.y;
    cameraFollowYRef.current = cameraFollowYRef.current === null
      ? cameraTargetY
      : THREE.MathUtils.damp(cameraFollowYRef.current, cameraTargetY, 7, delta);
    const cameraAnchor = scratch.cameraAnchor.copy(playerPosition);
    cameraAnchor.y = cameraFollowYRef.current;
    const flightCamera = flying ? cameraProfile?.flight : null;
    const manualOrbitActive = now < manualOrbitUntilRef.current;
    manualOrbitBlendRef.current = THREE.MathUtils.damp(
      manualOrbitBlendRef.current,
      flightCamera && manualOrbitActive ? 1 : 0,
      5,
      delta,
    );
    const manualOrbitBlend = flightCamera ? manualOrbitBlendRef.current : 0;
    // While auto-align owns the flight camera, keep the manual pitch synced
    // to the flight pitch so starting a drag never snaps the view.
    if (flightCamera?.pitch != null && manualOrbitBlend < 0.02) {
      pitchRef.current = THREE.MathUtils.clamp(flightCamera.pitch, CAMERA.minPitch, CAMERA.maxPitch);
    }
    if (flightCamera?.autoAlign && facing && manualOrbitBlend < 0.98) {
      const flightForward = scratch.recenterForward.set(facing.x || 0, 0, facing.z || -1);
      if (flightForward.lengthSq() > 0.0001) {
        flightForward.normalize();
        // Chase view: cameraForward below is the camera's LOOK direction, so
        // matching it to the bird's facing puts the camera behind the bird
        // (atan2(f.x, f.z) would park it in front, staring at the beak).
        yawRef.current = dampAngle(
          yawRef.current,
          Math.atan2(-flightForward.x, -flightForward.z),
          (flightCamera.alignDamping ?? 4) * (1 - manualOrbitBlend),
          delta,
        );
      }
    }

    const offset = cameraTargets[viewMode] || cameraTargets.shoulder;
    const desired = scratch.desired.copy(offset).applyAxisAngle(UP, yawRef.current).add(cameraAnchor);
    const impulseProgress = THREE.MathUtils.clamp((now - cameraImpulse.startedAt) / Math.max(0.01, cameraImpulse.duration), 0, 1);
    const impulseFade = Math.sin(impulseProgress * Math.PI) * cameraImpulse.intensity;
    const cameraShake = scratch.cameraShake;
    if (impulseFade > 0.001) {
      cameraShake.set(
        Math.sin(now * 43.7 + cameraImpulse.seed) * 0.035 * impulseFade,
        Math.sin(now * 51.1 + cameraImpulse.seed * 2.3) * 0.025 * impulseFade,
        Math.cos(now * 39.3 + cameraImpulse.seed * 1.7) * 0.03 * impulseFade,
      );
    } else {
      cameraShake.set(0, 0, 0);
    }
    const rigStoreState = useThreeGameStore.getState();
    const statusViewOpen = rigStoreState.statusViewOpen;
    const examineSession = rigStoreState.examineSession?.focus ? rigStoreState.examineSession : null;
    if (openingCameraActive && !statusViewOpen && !examineSession) {
      const sequenceId = openingCamera.sequenceId || 'opening-camera';
      if (openingCameraRuntimeRef.current.sequenceId !== sequenceId) {
        openingCameraRuntimeRef.current.sequenceId = sequenceId;
        openingCameraRuntimeRef.current.startedAt = now;
        openingCameraRuntimeRef.current.initialized = false;
      }
      const duration = Math.max(0.1, openingCamera.duration || 4.2);
      const rawProgress = THREE.MathUtils.clamp((now - openingCameraRuntimeRef.current.startedAt) / duration, 0, 1);
      const descentProgress = THREE.MathUtils.smoothstep(rawProgress, 0.12, 1);
      const flyT = descentProgress * descentProgress * descentProgress * (descentProgress * (descentProgress * 6 - 15) + 10);
      const orbitT = THREE.MathUtils.smoothstep(rawProgress, 0.08, 0.9);
      const targetT = THREE.MathUtils.smoothstep(rawProgress, 0.06, 0.78);
      const introForward = scratch.introForward.set(0, 0, -1).applyAxisAngle(UP, yawRef.current);
      const introRight = scratch.introRight.set(1, 0, 0).applyAxisAngle(UP, yawRef.current);
      const currentFinalPivot = scratch.introFinalPivot
        .copy(cameraAnchor)
        .add(scratch.panVertical.set(0, 1.22, 0))
        .add(panOffsetRef.current);
      const cameraDistance = THREE.MathUtils.clamp(zoomRef.current, CAMERA.minZoom, CAMERA.maxZoom);
      const zoomT = THREE.MathUtils.smoothstep(cameraDistance, CAMERA.minZoom, CAMERA.maxZoom);
      const side = THREE.MathUtils.lerp(0.6, 1.5, zoomT);
      const pitch = THREE.MathUtils.clamp(pitchRef.current, CAMERA.minPitch, CAMERA.maxPitch);
      const horiz = Math.cos(pitch) * cameraDistance;
      const vert = Math.sin(pitch) * cameraDistance;
      const currentFinalEye = scratch.introFinalEye
        .copy(currentFinalPivot)
        .addScaledVector(introForward, -horiz)
        .addScaledVector(introRight, side)
        .add(scratch.panVertical.set(0, vert, 0));
      const currentStartTarget = scratch.introStartTarget
        .copy(currentFinalPivot)
        .addScaledVector(introForward, 9.5)
        .addScaledVector(introRight, -7.2);
      const runtime = openingCameraRuntimeRef.current;
      if (!runtime.initialized) {
        runtime.finalPivot.copy(currentFinalPivot);
        runtime.finalEye.copy(currentFinalEye);
        runtime.startTarget.copy(currentStartTarget);
        runtime.initialized = true;
      }
      const finalPivot = runtime.finalPivot;
      const finalEye = runtime.finalEye;
      const startTarget = runtime.startTarget;
      const orbitTarget = scratch.introLookTarget
        .copy(startTarget)
        .lerp(finalPivot, targetT);
      const finalOffsetX = finalEye.x - finalPivot.x;
      const finalOffsetZ = finalEye.z - finalPivot.z;
      const finalHorizontalRadius = Math.max(0.1, Math.hypot(finalOffsetX, finalOffsetZ));
      const finalAngle = Math.atan2(finalOffsetZ, finalOffsetX);
      const orbitAngle = finalAngle - (1 - orbitT) * 1.42 + Math.sin(orbitT * Math.PI) * 0.12;
      const orbitRadius = THREE.MathUtils.lerp(10.5, finalHorizontalRadius, flyT);
      const orbitHeight = THREE.MathUtils.lerp(92, finalEye.y - finalPivot.y, flyT);
      const eye = scratch.introEye.set(
        orbitTarget.x + Math.cos(orbitAngle) * orbitRadius,
        orbitTarget.y + orbitHeight + Math.sin(flyT * Math.PI) * 2.8,
        orbitTarget.z + Math.sin(orbitAngle) * orbitRadius,
      );
      const lookTarget = scratch.introLookTarget
        .copy(orbitTarget);
      lookTarget.y = THREE.MathUtils.lerp(orbitTarget.y, finalPivot.y + 0.18, THREE.MathUtils.smoothstep(rawProgress, 0.58, 1));
      camera.position.copy(eye).addScaledVector(cameraShake, rawProgress);
      camera.lookAt(lookTarget);
      if (!shoulderPivotRef.current) {
        shoulderPivotRef.current = finalPivot.clone();
      } else {
        shoulderPivotRef.current.copy(finalPivot);
      }
      statusLookRef.current = null;
      return;
    }
    const pivotY = cameraProfile?.pivotY ?? 1.22;
    const statusPivot = scratch.statusPivot.copy(cameraAnchor).add(scratch.panVertical.set(0, pivotY, 0)).add(panOffsetRef.current);
    if (examineSession) {
      // Diegetic examine shot: dolly in between Darwin and the subject and
      // frame the subject by its bulk (frameHint), with a very slow orbital
      // drift so the held pose still feels alive. Shares statusLookRef with
      // the status view so open/close easing behaves identically.
      const focus = examineSession.focus;
      const hint = examineSession.frameHint || { height: 0.8, radius: 0.6 };
      const centerY = focus.y + Math.max(0.22, hint.height * 0.55);
      let dirX = playerPosition.x - focus.x;
      let dirZ = playerPosition.z - focus.z;
      const dirLength = Math.hypot(dirX, dirZ);
      if (dirLength < 0.001) {
        dirX = 0;
        dirZ = 1;
      } else {
        dirX /= dirLength;
        dirZ /= dirLength;
      }
      const drift = Math.sin(now * 0.14) * 0.16;
      const driftCos = Math.cos(drift);
      const driftSin = Math.sin(drift);
      const orbitX = dirX * driftCos - dirZ * driftSin;
      const orbitZ = dirX * driftSin + dirZ * driftCos;
      const distance = Math.max(1.15, hint.radius * 2.7);
      if (!statusLookRef.current) {
        statusLookRef.current = camera.position.clone()
          .add(camera.getWorldDirection(scratch.worldDirection).multiplyScalar(6));
      }
      const ease = 1 - Math.exp(-2.4 * delta);
      const eye = scratch.statusEye.set(
        focus.x + orbitX * distance,
        centerY + Math.max(0.12, hint.radius * 0.3),
        focus.z + orbitZ * distance,
      );
      camera.position.lerp(eye, ease);
      statusLookRef.current.lerp(scratch.chest.set(focus.x, centerY, focus.z), ease);
      camera.lookAt(statusLookRef.current);
    } else if (statusViewOpen) {
      const statusFrame = cameraProfile?.status || {};
      const forward = scratch.statusForward.set(facing.x, 0, facing.z);
      if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
      forward.normalize();
      const right = scratch.statusRight.set(forward.z, 0, -forward.x);
      const chest = scratch.chest.copy(playerPosition).add(scratch.panVertical.set(0, statusFrame.lookY ?? 1.5, 0));
      if (!statusLookRef.current) {
        statusLookRef.current = camera.position.clone()
          .add(camera.getWorldDirection(scratch.worldDirection).multiplyScalar(6));
      }
      const ease = 1 - Math.exp(-2.4 * delta);
      const eye = scratch.statusEye.copy(chest)
        .add(forward.multiplyScalar(statusFrame.distance ?? 1.15))
        .add(right.multiplyScalar(statusFrame.side ?? 0.18))
        .add(scratch.panVertical.set(0, statusFrame.eyeY ?? 0.05, 0));
      camera.position.lerp(eye, ease);
      statusLookRef.current.lerp(chest, ease);
      camera.lookAt(statusLookRef.current);
    } else if (viewMode === 'first') {
      // Eye sits slightly forward of head center so the camera never ends up
      // inside the skull geometry; vertical motion is snapped, not lerped,
      // because positional lag is what caused the camera to fall behind into
      // the model while moving.
      const eyeForward = scratch.eyeForward.set(0, 0, -0.22).applyAxisAngle(UP, yawRef.current);
      desired.copy(playerPosition).add(scratch.panVertical.set(0, cameraProfile?.firstPersonEyeY ?? 1.66, 0)).add(eyeForward);
      camera.position.copy(desired);
      const lookPitch = THREE.MathUtils.clamp((CAMERA.defaultPitch - pitchRef.current) * 1.5, -1.3, 1.3);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(lookPitch, yawRef.current, 0);
    } else if (viewMode === 'top') {
      const height = THREE.MathUtils.clamp(zoomRef.current * 4.2, 10, 85);
      const top = scratch.top.copy(cameraAnchor).add(scratch.panVertical.set(0, height, 0));
      camera.position.lerp(top.add(cameraShake), 1 - Math.exp(-8 * delta));
      // Fixed straight-down orientation: lookAt near the vertical pole made
      // the camera roll unpredictably as its position lagged the player.
      camera.rotation.order = 'YXZ';
      camera.rotation.set(-Math.PI / 2, yawRef.current, 0);
    } else {
      const cameraForward = scratch.cameraForward.set(0, 0, -1).applyAxisAngle(UP, yawRef.current);
      const cameraRight = scratch.cameraRight.set(1, 0, 0).applyAxisAngle(UP, yawRef.current);
      const swimDistanceBias = SWIM_POLISH.enabled ? swimCamera * SWIM_POLISH.cameraDistanceBias : swimCamera;
      const swimSideBias = SWIM_POLISH.enabled ? swimCamera * SWIM_POLISH.cameraSideBias : swimCamera;
      const profileMinDistance = cameraProfile?.minDistance ?? CAMERA.minZoom;
      const profileMaxDistance = cameraProfile?.maxDistance ?? CAMERA.maxZoom;
      // In flight the camera distance grows with airspeed so speed reads as
      // wider framing rather than ground rushing past a fixed camera.
      const flightDistance = flightCamera?.distance
        ? flightCamera.distance + (flightCamera.speedDistance ?? 0) * THREE.MathUtils.clamp(flightSpeedT, 0, 1)
        : null;
      const profileZoom = flightDistance
        ? flightDistance
        : THREE.MathUtils.clamp(zoomRef.current, profileMinDistance, profileMaxDistance);
      const cameraDistance = flightDistance
        ? flightDistance
        : THREE.MathUtils.lerp(
          profileZoom,
          THREE.MathUtils.clamp(
            profileZoom,
            SWIM_POLISH.enabled ? SWIM_POLISH.cameraDistanceMin : 3.7,
            SWIM_POLISH.enabled ? SWIM_POLISH.cameraDistanceMax : 5.4,
          ),
          swimDistanceBias,
        );
      const zoomT = THREE.MathUtils.smoothstep(cameraDistance, CAMERA.minZoom, CAMERA.maxZoom);
      const side = flightCamera?.side ?? THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.6, 1.5, zoomT), 0.72, swimSideBias);
      const pitchA = THREE.MathUtils.clamp(pitchRef.current, CAMERA.minPitch, CAMERA.maxPitch);
      const swimPitchBias = SWIM_POLISH.enabled ? SWIM_POLISH.cameraPitchBias : 0.92;
      const effectivePitch = flightCamera?.pitch != null
        ? THREE.MathUtils.lerp(flightCamera.pitch, pitchA, manualOrbitBlend)
        : THREE.MathUtils.lerp(pitchA, -0.12, swimCamera * swimPitchBias);
      // Smooth the pivot itself: looking straight at the raw player position
      // transmits every small physics/animation displacement to the camera,
      // which reads as jitter when running.
      const rawPivot = scratch.rawPivot.copy(cameraAnchor).add(scratch.panVertical.set(0, flightCamera?.pivotY ?? pivotY, 0)).add(panOffsetRef.current);
      if (swimCamera > 0.001) {
        rawPivot.y = THREE.MathUtils.lerp(
          rawPivot.y,
          WATER_LEVEL - (SWIM_POLISH.enabled ? SWIM_POLISH.cameraPivotBelowSurface : 0.28),
          swimCamera,
        );
      }
      if (!shoulderPivotRef.current || shoulderPivotRef.current.distanceToSquared(rawPivot) > 36) {
        shoulderPivotRef.current = rawPivot.clone();
      }
      const pivot = shoulderPivotRef.current;
      pivot.x = THREE.MathUtils.damp(pivot.x, rawPivot.x, 9, delta);
      pivot.y = THREE.MathUtils.damp(pivot.y, rawPivot.y, 9, delta);
      pivot.z = THREE.MathUtils.damp(pivot.z, rawPivot.z, 9, delta);
      const horiz = Math.cos(effectivePitch) * cameraDistance;
      const vert = Math.sin(effectivePitch) * cameraDistance;
      const eye = scratch.shoulderEye.copy(pivot)
        .add(cameraForward.multiplyScalar(-horiz))
        .add(cameraRight.multiplyScalar(side))
        .add(scratch.panVertical.set(0, vert, 0));
      let lookTarget = pivot;
      if (flightCamera && finchDroppingCamera && now < finchDroppingCamera.until) {
        const sinceDrop = Math.max(0, now - (finchDroppingCamera.startedAt || now));
        const remaining = Math.max(0, finchDroppingCamera.until - now);
        const dropBlend = Math.min(
          THREE.MathUtils.smoothstep(sinceDrop, 0, 0.38),
          THREE.MathUtils.smoothstep(remaining, 0, 0.72),
        );
        if (dropBlend > 0.001) {
          const dropForward = scratch.droppingForward.set(facing?.x || 0, 0, facing?.z || -1);
          if (dropForward.lengthSq() < 0.0001) dropForward.set(0, 0, -1);
          dropForward.normalize();
          const dropRight = scratch.droppingRight.set(dropForward.z, 0, -dropForward.x);
          const lookX = playerPosition.x + dropForward.x * 1.45;
          const lookZ = playerPosition.z + dropForward.z * 1.45;
          const lookY = collisionAdapter.terrainHeight(lookX, lookZ) + 0.06;
          const dropLook = scratch.droppingLook.set(lookX, lookY, lookZ);
          const dropEye = scratch.droppingEye.copy(playerPosition)
            .addScaledVector(dropForward, -0.36)
            .addScaledVector(dropRight, 0.16)
            .add(scratch.panVertical.set(0, 3.35 + THREE.MathUtils.clamp(flightSpeedT, 0, 1) * 0.65, 0));
          eye.lerp(dropEye, dropBlend);
          lookTarget = dropLook.lerp(pivot, 1 - dropBlend);
        }
      }
      camera.position.lerp(eye.add(cameraShake), 1 - Math.exp(-(flightCamera?.positionDamping ?? 6.5) * delta));
      camera.lookAt(lookTarget);
    }
    if (!statusViewOpen && !examineSession && statusLookRef.current) {
      const ease = 1 - Math.exp(-3.2 * delta);
      statusLookRef.current.lerp(statusPivot, ease);
      camera.lookAt(statusLookRef.current);
      if (statusLookRef.current.distanceToSquared(statusPivot) < 0.02) statusLookRef.current = null;
    }
  }, [camera, cameraTargets, scratch]);

  return {
    yawRef,
    pitchRef,
    zoomRef,
    panOffsetRef,
    pointerNdcRef,
    aimActiveRef,
    firePulseRef,
    getAimDirection,
    resetCameraForSpawn,
    recenterCamera,
    updateCamera,
  };
}
