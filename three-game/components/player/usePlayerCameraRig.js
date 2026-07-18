'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { CAMERA, SPRINT, SWIM_POLISH } from './playerConfig';
import { WATER_LEVEL } from '../../world/water';
import {
  getSpecimenRuntimeBounds,
  getSpecimenRuntimePoses,
  resolveSpecimenFrameHint,
} from '../../world/specimenRuntime';
import { shotgunAimState } from '../../shooting/aimState';
import { SHOTGUN } from '../../shooting/shotgunConfig';

const UP = new THREE.Vector3(0, 1, 0);

function dampAngle(current, target, lambda, delta) {
  const wrapped = current + Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return THREE.MathUtils.damp(current, wrapped, lambda, delta);
}

function smootherStep01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function usePlayerCameraRig() {
  const { camera, gl } = useThree();
  const yawRef = useRef(0);
  const pitchRef = useRef(CAMERA.defaultPitch);
  const zoomRef = useRef(CAMERA.defaultZoom);
  const cameraProfileRef = useRef(null);
  const draggingRef = useRef(false);
  const panningRef = useRef(false);
  const panOffsetRef = useRef(new THREE.Vector3());
  const lastPointerXRef = useRef(0);
  const lastPointerYRef = useRef(0);
  const cameraFollowYRef = useRef(null);
  const statusLookRef = useRef(null);
  const examineOrbitRef = useRef({
    sessionKey: null,
    yaw: 0,
    pitch: 0.18,
    zoom: 1,
    manualUntil: 0,
    openingYawPending: false,
  });
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
    descentStartedAt: 0,
    initialized: false,
    finalPivot: new THREE.Vector3(),
    finalEye: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
  });
  // Aim (ADS) mode: the mouse drives camera yaw AND pitch under pointer lock
  // (touch drags do the same without lock), Darwin's facing chases the
  // camera, the crosshair sits at screen center, and a left-click bumps
  // firePulseRef so the controller can fire. While aimActiveRef is true the
  // ordinary click-drag orbit is superseded.
  const pointerNdcRef = useRef(new THREE.Vector2(0, 0));
  const aimActiveRef = useRef(false);
  const wasAimingRef = useRef(false);
  const adsBlendRef = useRef(0);
  const sprintBlendRef = useRef(0);
  const sprintSurgeAtRef = useRef(-10);
  const prevSprintTRef = useRef(0);
  const skidRollRef = useRef(0);
  const baseFovRef = useRef(null);
  const firePulseRef = useRef(0);
  const dragPointerTypeRef = useRef('mouse');
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
    adsDir: new THREE.Vector3(),
    adsPivot: new THREE.Vector3(),
    adsEye: new THREE.Vector3(),
    adsLook: new THREE.Vector3(),
    adsLookBlend: new THREE.Vector3(),
    examineFocus: new THREE.Vector3(),
    examineEye: new THREE.Vector3(),
    examineLook: new THREE.Vector3(),
    examineRight: new THREE.Vector3(),
  }), []);

  const updatePointerNdc = useCallback(event => {
    const rect = gl.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerNdcRef.current.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
  }, [gl]);

  // Camera-relative aim solution: the fire direction comes from the camera's
  // yaw + pitch (crosshair at screen center), so Darwin turns with the
  // camera. Publishes the full 3D direction to shotgunAimState and returns
  // the normalized horizontal facing for the body.
  const getAimDirection = useCallback(() => {
    const yaw = yawRef.current;
    const ads = SHOTGUN.ads;
    const pitch = THREE.MathUtils.clamp(pitchRef.current, ads.minPitch, ads.maxPitch);
    const cosP = Math.cos(pitch);
    shotgunAimState.dirX = -Math.sin(yaw) * cosP;
    shotgunAimState.dirY = -Math.sin(pitch);
    shotgunAimState.dirZ = -Math.cos(yaw) * cosP;
    aimDir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    return aimDir;
  }, [aimDir]);

  const cameraTargets = useMemo(() => ({
    shoulder: new THREE.Vector3(1.05, 2.35, 3.75),
    first: new THREE.Vector3(0, 1.72, 0.16),
    top: new THREE.Vector3(0, 20, 0.1),
  }), []);

  useEffect(() => {
    const element = gl.domElement;
    const ads = SHOTGUN.ads;
    const aimLook = (dx, dy, speed) => {
      yawRef.current -= dx * speed;
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current + dy * speed, ads.minPitch, ads.maxPitch);
    };
    const onPointerDown = event => {
      if (openingCameraActiveRef.current) {
        updatePointerNdc(event);
        return;
      }
      const examineSession = useThreeGameStore.getState().examineSession;
      if (examineSession?.kind === 'specimen') {
        if (event.button !== 0) return;
        draggingRef.current = true;
        panningRef.current = false;
        dragPointerTypeRef.current = event.pointerType || 'mouse';
        lastPointerXRef.current = event.clientX;
        lastPointerYRef.current = event.clientY;
        examineOrbitRef.current.manualUntil = performance.now() / 1000 + 6;
        element.setPointerCapture?.(event.pointerId);
        element.style.cursor = 'grabbing';
        return;
      }
      if (examineSession) return;
      // Right mouse held = momentary aim intent (shooter convention). The
      // equipment state only honors it while the shotgun is equipped. Capture
      // the pointer so the release is seen even if it happens off-canvas.
      if (event.button === 2) {
        shotgunAimState.holdIntent = true;
        element.setPointerCapture?.(event.pointerId);
        return;
      }
      if (aimActiveRef.current && event.button === 0) {
        updatePointerNdc(event);
        if (event.pointerType === 'touch') {
          // Touch never fires from a screen tap (the Fire button does); a
          // drag pans the aim instead.
          draggingRef.current = true;
          panningRef.current = false;
          dragPointerTypeRef.current = 'touch';
          lastPointerXRef.current = event.clientX;
          lastPointerYRef.current = event.clientY;
          element.setPointerCapture?.(event.pointerId);
          return;
        }
        firePulseRef.current += 1;
        return;
      }
      if (event.button !== 0 && event.button !== 1) return;
      draggingRef.current = true;
      panningRef.current = event.button === 1 || event.shiftKey;
      dragPointerTypeRef.current = event.pointerType || 'mouse';
      lastPointerXRef.current = event.clientX;
      lastPointerYRef.current = event.clientY;
      element.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = event => {
      updatePointerNdc(event);
      if (openingCameraActiveRef.current) return;
      const examineSession = useThreeGameStore.getState().examineSession;
      if (examineSession?.kind === 'specimen') {
        if (!draggingRef.current) return;
        const dx = event.clientX - lastPointerXRef.current;
        const dy = event.clientY - lastPointerYRef.current;
        lastPointerXRef.current = event.clientX;
        lastPointerYRef.current = event.clientY;
        const speed = dragPointerTypeRef.current === 'touch' ? 0.006 : 0.0045;
        const verticalSpeed = speed * 1.35;
        examineOrbitRef.current.yaw -= dx * speed;
        examineOrbitRef.current.pitch = THREE.MathUtils.clamp(
          examineOrbitRef.current.pitch - dy * verticalSpeed,
          -0.85,
          1.32,
        );
        examineOrbitRef.current.manualUntil = performance.now() / 1000 + 6;
        return;
      }
      if (examineSession) return;
      // Pointer-locked mouse look while aiming: deltas rotate the camera and
      // therefore the crosshair. No drag required — the click means "fire".
      // Slide up = aim up (positive pitch looks down, so movementY feeds in
      // directly).
      if (aimActiveRef.current && document.pointerLockElement === element) {
        aimLook(event.movementX || 0, event.movementY || 0, ads.lookSpeed);
        return;
      }
      if (!draggingRef.current) return;
      const dx = event.clientX - lastPointerXRef.current;
      const dy = event.clientY - lastPointerYRef.current;
      lastPointerXRef.current = event.clientX;
      lastPointerYRef.current = event.clientY;
      if (aimActiveRef.current) {
        // Unlocked aim drag (touch, or mouse if pointer lock was refused).
        aimLook(dx, dy, dragPointerTypeRef.current === 'touch' ? ads.touchLookSpeed : ads.lookSpeed * 1.2);
        return;
      }
      if (panningRef.current || event.shiftKey) {
        const dist = THREE.MathUtils.clamp(zoomRef.current, 4, 14);
        const right = scratch.panRight.set(1, 0, 0).applyAxisAngle(UP, yawRef.current);
        panOffsetRef.current
          .add(right.multiplyScalar(-dx * CAMERA.panSpeed * dist))
          .add(scratch.panVertical.set(0, dy * CAMERA.panSpeed * dist, 0));
        if (panOffsetRef.current.length() > CAMERA.maxPan) panOffsetRef.current.setLength(CAMERA.maxPan);
      } else {
        yawRef.current -= dx * CAMERA.rotateSpeed;
        pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - dy * CAMERA.pitchSpeed, CAMERA.minPitch, CAMERA.maxPitch);
        manualOrbitUntilRef.current = performance.now() / 1000 + 3.2;
      }
    };
    const stopDrag = event => {
      if (event?.button === 2) shotgunAimState.holdIntent = false;
      draggingRef.current = false;
      panningRef.current = false;
      element.style.cursor = 'grab';
      if (event?.pointerId !== undefined) element.releasePointerCapture?.(event.pointerId);
    };
    const onWheel = event => {
      event.preventDefault();
      if (openingCameraActiveRef.current) return;
      const normalizedDelta = Math.sign(event.deltaY) * Math.min(1.8, Math.abs(event.deltaY) / 80);
      const examineSession = useThreeGameStore.getState().examineSession;
      if (examineSession?.kind === 'specimen') {
        examineOrbitRef.current.zoom = THREE.MathUtils.clamp(
          examineOrbitRef.current.zoom + normalizedDelta * 0.1,
          0.72,
          1.7,
        );
        examineOrbitRef.current.manualUntil = performance.now() / 1000 + 6;
        return;
      }
      if (examineSession) return;
      const maxZoom = useThreeGameStore.getState().viewMode === 'top'
        ? CAMERA.topMaxZoom
        : CAMERA.maxZoom;
      zoomRef.current = THREE.MathUtils.clamp(
        zoomRef.current + normalizedDelta * 0.9,
        CAMERA.minZoom,
        maxZoom,
      );
    };
    // Right mouse is the aim button; the browser menu would swallow it.
    const onContextMenu = event => event.preventDefault();
    element.style.cursor = 'grab';
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', stopDrag);
    element.addEventListener('pointercancel', stopDrag);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('contextmenu', onContextMenu);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', stopDrag);
      element.removeEventListener('pointercancel', stopDrag);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('contextmenu', onContextMenu);
      element.style.cursor = '';
      element.style.touchAction = '';
      shotgunAimState.holdIntent = false;
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
    sprintT = 0,
    skidRoll = 0,
    moveSpeedT = 0,
    cameraProfile = null,
    now,
    delta,
  }) => {
    if (cameraProfileRef.current !== cameraProfile) {
      cameraProfileRef.current = cameraProfile;
      if (Number.isFinite(cameraProfile?.defaultDistance)) {
        zoomRef.current = THREE.MathUtils.clamp(
          cameraProfile.defaultDistance,
          cameraProfile.minDistance ?? CAMERA.minZoom,
          cameraProfile.maxDistance ?? CAMERA.maxZoom,
        );
      }
      if (Number.isFinite(cameraProfile?.defaultPitch)) {
        pitchRef.current = THREE.MathUtils.clamp(cameraProfile.defaultPitch, CAMERA.minPitch, CAMERA.maxPitch);
      }
    }
    // Sprint FOV widen eases in over ~0.4s and back out a touch quicker.
    sprintBlendRef.current = THREE.MathUtils.damp(
      sprintBlendRef.current,
      THREE.MathUtils.clamp(sprintT, 0, 1),
      sprintT > sprintBlendRef.current ? 4.5 : 6,
      delta,
    );
    // Surge: catch the moment the sprint tier engages for a one-shot FOV pop.
    if (sprintT > 0.5 && prevSprintTRef.current <= 0.05) sprintSurgeAtRef.current = now;
    prevSprintTRef.current = sprintT;
    // Skid roll: lean the frame into hard turns, damped so it breathes.
    skidRollRef.current = THREE.MathUtils.damp(
      skidRollRef.current,
      THREE.MathUtils.clamp(skidRoll, -1, 1) * 0.045,
      8,
      delta,
    );
    const openingCameraActive = Boolean(openingCamera?.active);
    openingCameraActiveRef.current = openingCameraActive;
    if (!openingCameraActive) {
      openingCameraRuntimeRef.current.sequenceId = null;
      openingCameraRuntimeRef.current.startedAt = 0;
      openingCameraRuntimeRef.current.descentStartedAt = 0;
      openingCameraRuntimeRef.current.initialized = false;
    }
    // Aim-mode transitions own the pointer: entering ADS captures the mouse
    // (called within the activation window of the key/click that started the
    // aim, so the browser allows it; touch refuses quietly), leaving releases
    // it. Esc drops the lock without leaving aim — drag-aim still works.
    const aiming = aimActiveRef.current;
    if (aiming !== wasAimingRef.current && typeof document !== 'undefined') {
      wasAimingRef.current = aiming;
      if (aiming) {
        try {
          const lockRequest = gl.domElement.requestPointerLock?.();
          lockRequest?.catch?.(() => {});
        } catch { /* pointer lock unavailable (touch/iframe) — drag-aim instead */ }
      } else if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock?.();
      }
    }
    // Ease the orbit pitch back into its normal band after aiming skyward.
    if (!aiming) {
      const settled = THREE.MathUtils.clamp(pitchRef.current, CAMERA.minPitch, CAMERA.maxPitch);
      if (settled !== pitchRef.current) {
        pitchRef.current = THREE.MathUtils.damp(pitchRef.current, settled, 7, delta);
      }
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
    const readableBookSession = rigStoreState.readableBookSession?.focus
      ? {
          focus: rigStoreState.readableBookSession.focus,
          frameHint: { height: 0.2, radius: 0.34 },
        }
      : null;
    const focusSession = examineSession || readableBookSession;
    adsBlendRef.current = THREE.MathUtils.damp(
      adsBlendRef.current,
      aiming && !flying && !statusViewOpen && !focusSession && viewMode !== 'top' ? 1 : 0,
      9,
      delta,
    );
    if (openingCameraActive && !statusViewOpen && !focusSession) {
      const sequenceId = openingCamera.sequenceId || 'opening-camera';
      if (openingCameraRuntimeRef.current.sequenceId !== sequenceId) {
        openingCameraRuntimeRef.current.sequenceId = sequenceId;
        openingCameraRuntimeRef.current.startedAt = now;
        openingCameraRuntimeRef.current.descentStartedAt = 0;
        openingCameraRuntimeRef.current.initialized = false;
      }
      const runtime = openingCameraRuntimeRef.current;
      const minAerialDuration = Math.max(0.5, openingCamera.minAerialDuration || 3.8);
      const maxAerialDuration = Math.max(minAerialDuration, openingCamera.maxAerialDuration || 6.5);
      const descentDuration = Math.max(0.5, openingCamera.descentDuration || 5);
      const aerialElapsed = Math.max(0, now - runtime.startedAt);
      if (
        !runtime.descentStartedAt
        && (
          (openingCamera.visualReady && aerialElapsed >= minAerialDuration)
          || aerialElapsed >= maxAerialDuration
        )
      ) {
        runtime.descentStartedAt = now;
      }
      const descentProgress = runtime.descentStartedAt
        ? THREE.MathUtils.clamp((now - runtime.descentStartedAt) / descentDuration, 0, 1)
        : 0;
      const flyT = smootherStep01(descentProgress);
      const surveyT = smootherStep01(aerialElapsed / maxAerialDuration);
      const targetT = THREE.MathUtils.lerp(
        surveyT * 0.26,
        1,
        smootherStep01(THREE.MathUtils.smoothstep(descentProgress, 0.03, 0.9)),
      );
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
      // A slow lateral drift gives the high survey real parallax without
      // making the island hard to read. It resolves completely before the
      // playable-camera handoff, so there is no final-frame correction.
      orbitTarget.addScaledVector(
        introRight,
        Math.sin(surveyT * Math.PI * 1.15) * 0.9 * (1 - flyT),
      );
      const finalOffsetX = finalEye.x - finalPivot.x;
      const finalOffsetZ = finalEye.z - finalPivot.z;
      const finalHorizontalRadius = Math.max(0.1, Math.hypot(finalOffsetX, finalOffsetZ));
      const finalAngle = Math.atan2(finalOffsetZ, finalOffsetX);
      const surveyAngle = finalAngle - 1.02 + surveyT * 0.38;
      const orbitAngle = THREE.MathUtils.lerp(surveyAngle, finalAngle, flyT)
        + Math.sin(flyT * Math.PI) * 0.045;
      const surveyRadius = THREE.MathUtils.lerp(18.5, 15.4, surveyT);
      const orbitRadius = THREE.MathUtils.lerp(surveyRadius, finalHorizontalRadius, flyT);
      const surveyHeight = THREE.MathUtils.lerp(106, 92, surveyT);
      const orbitHeight = THREE.MathUtils.lerp(surveyHeight, finalEye.y - finalPivot.y, flyT);
      const eye = scratch.introEye.set(
        orbitTarget.x + Math.cos(orbitAngle) * orbitRadius,
        orbitTarget.y + orbitHeight + Math.sin(flyT * Math.PI) * 3.2,
        orbitTarget.z + Math.sin(orbitAngle) * orbitRadius,
      );
      const lookTarget = scratch.introLookTarget
        .copy(orbitTarget);
      lookTarget.y = THREE.MathUtils.lerp(
        orbitTarget.y,
        finalPivot.y + 0.18,
        THREE.MathUtils.smoothstep(descentProgress, 0.58, 1),
      );
      camera.position.copy(eye).addScaledVector(cameraShake, descentProgress);
      camera.lookAt(lookTarget);
      camera.rotation.z += Math.sin(surveyT * Math.PI * 1.35) * 0.006 * (1 - flyT);
      const finalFov = baseFovRef.current ?? 50;
      const openingFov = THREE.MathUtils.lerp(
        46,
        finalFov,
        smootherStep01(THREE.MathUtils.smoothstep(descentProgress, 0.32, 1)),
      );
      if (Math.abs(camera.fov - openingFov) > 0.01) {
        camera.fov = openingFov;
        camera.updateProjectionMatrix();
      }
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
    if (examineSession?.kind === 'specimen') {
      // A live, subject-owned inspection orbit. Runtime pose data is kept out
      // of React so the camera can follow a moving/falling actor without a
      // stale one-time focus snapshot. The framing distance is derived from
      // both vertical and horizontal FOV, which keeps the whole specimen in
      // view on narrow portrait screens as well as desktop.
      const liveFocus = getSpecimenRuntimePoses(rigStoreState.currentZoneId)?.get(examineSession.actorId);
      const focus = liveFocus || examineSession.focus;
      const focusTerrainY = collisionAdapter.terrainHeight(focus.x, focus.z);
      const focusY = Math.max(
        Number.isFinite(focus.y) ? focus.y : focusTerrainY,
        Number.isFinite(focusTerrainY) ? focusTerrainY + 0.04 : focus.y,
      );
      const authoredHint = examineSession.frameHint || { height: 0.8, radius: 0.6 };
      const renderedBounds = getSpecimenRuntimeBounds(rigStoreState.currentZoneId)?.get(examineSession.actorId);
      const hint = resolveSpecimenFrameHint(authoredHint, renderedBounds);
      const centerOffset = Number.isFinite(hint.centerY)
        ? hint.centerY
        : hint.closeup
          ? Math.max(0.015, hint.height * 0.5)
          : Math.max(0.12, hint.height * 0.52);
      const center = scratch.examineFocus.set(
        focus.x,
        focusY + centerOffset,
        focus.z,
      );
      const sessionKey = `${rigStoreState.currentZoneId}:${examineSession.actorId}:${examineSession.openedAt || 0}`;
      const orbit = examineOrbitRef.current;
      if (orbit.sessionKey !== sessionKey) {
        // Start from the player's side of the subject. The gameplay camera can
        // still be easing from a zone transition when examination opens; using
        // that stale world position can place the first orbit under terrain.
        let openingDx = playerPosition.x - center.x;
        let openingDz = playerPosition.z - center.z;
        if (Math.hypot(openingDx, openingDz) <= 0.05) {
          openingDx = camera.position.x - center.x;
          openingDz = camera.position.z - center.z;
        }
        orbit.sessionKey = sessionKey;
        orbit.yaw = Math.atan2(openingDx, openingDz);
        // Begin level with the specimen. Vertical drag can then deliberately
        // reveal its upper or lower surfaces instead of imposing a top-down
        // field-camera angle on every subject.
        orbit.pitch = 0.015;
        orbit.zoom = 1;
        orbit.manualUntil = now + 1.8;
        orbit.openingYawPending = true;
      }
      if (!draggingRef.current && now >= orbit.manualUntil) {
        orbit.yaw += delta * 0.045;
      }

      const verticalFov = THREE.MathUtils.degToRad(camera.fov || 50);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.25, camera.aspect || 1));
      const halfWidth = Math.max(0.025, hint.radius || 0.6);
      const halfHeight = Math.max(0.025, (hint.height || 0.8) * 0.54);
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
      const compactExamineLayout = viewportWidth < 1024;
      const shortLandscapeLayout = compactExamineLayout
        && viewportWidth > viewportHeight
        && viewportHeight <= 600;
      const sideNotebookLayout = !compactExamineLayout || shortLandscapeLayout;
      const notebookRatio = shortLandscapeLayout
        ? 0.52
        : sideNotebookLayout
          ? Math.min(472, Math.max(390, viewportWidth * 0.3)) / Math.max(1, viewportWidth)
          : 0;
      // Desktop reserves roughly a third of the screen for the notebook;
      // compact portrait layouts reserve the lower half. Increase the fit
      // distance so the complete subject remains inside the visible stage,
      // not merely inside the full canvas behind the UI.
      const frameMultiplier = shortLandscapeLayout ? 2.35 : sideNotebookLayout ? 1.55 : 2.65;
      const fitDistance = Math.max(
        halfWidth / Math.max(0.08, Math.tan(horizontalFov / 2)),
        halfHeight / Math.max(0.08, Math.tan(verticalFov / 2)),
      ) * frameMultiplier;
      const distance = THREE.MathUtils.clamp(fitDistance * orbit.zoom, 0.16, 14);
      const groundClearance = THREE.MathUtils.clamp(halfHeight * 0.55, 0.055, 0.34);
      if (orbit.openingYawPending) {
        const preferredYaw = orbit.yaw;
        const desiredEyeY = center.y + Math.sin(orbit.pitch) * distance;
        const yawOffsets = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI];
        let bestYaw = preferredYaw;
        let bestScore = Number.POSITIVE_INFINITY;
        yawOffsets.forEach(offset => {
          const candidateYaw = preferredYaw + offset;
          const candidateX = center.x + Math.sin(candidateYaw) * distance;
          const candidateZ = center.z + Math.cos(candidateYaw) * distance;
          const candidateGroundY = collisionAdapter.terrainHeight(candidateX, candidateZ);
          const forcedLift = Math.max(0, candidateGroundY + groundClearance - desiredEyeY);
          const score = forcedLift * 12 + Math.abs(offset) * 0.12;
          if (score < bestScore) {
            bestScore = score;
            bestYaw = candidateYaw;
          }
        });
        orbit.yaw = bestYaw;
        orbit.openingYawPending = false;
      }
      const horizontalDistance = Math.cos(orbit.pitch) * distance;
      const eye = scratch.examineEye.set(
        center.x + Math.sin(orbit.yaw) * horizontalDistance,
        center.y + Math.sin(orbit.pitch) * distance,
        center.z + Math.cos(orbit.yaw) * horizontalDistance,
      );
      // Low subjects should never push the inspection camera under a beach or
      // hillside as the automatic orbit crosses the uphill side.
      const eyeGroundY = collisionAdapter.terrainHeight(eye.x, eye.z);
      eye.y = Math.max(eye.y, eyeGroundY + groundClearance, focusY + groundClearance);
      const verticalBias = distance * (sideNotebookLayout ? 0 : 0.08);
      const horizontalBias = sideNotebookLayout
        // Place the subject at the center of the visible stage rather than
        // the center of the full canvas hidden beneath the notebook.
        ? distance * Math.tan(horizontalFov / 2) * notebookRatio
        : 0;
      const right = scratch.examineRight.set(Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw));
      const look = scratch.examineLook
        .copy(center)
        .addScaledVector(right, horizontalBias);
      look.y = center.y - verticalBias;
      if (!statusLookRef.current) {
        statusLookRef.current = camera.position.clone()
          .add(camera.getWorldDirection(scratch.worldDirection).multiplyScalar(6));
      }
      const ease = 1 - Math.exp(-3.2 * delta);
      camera.position.lerp(eye, ease);
      statusLookRef.current.lerp(look, ease);
      camera.lookAt(statusLookRef.current);
    } else if (focusSession) {
      // Diegetic examine shot: dolly in between Darwin and the subject and
      // frame the subject by its bulk (frameHint), with a very slow orbital
      // drift so the held pose still feels alive. Shares statusLookRef with
      // the status view so open/close easing behaves identically.
      const focus = focusSession.focus;
      const hint = focusSession.frameHint || { height: 0.8, radius: 0.6 };
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
      const height = cameraProfile?.topHeight
        ?? THREE.MathUtils.clamp(zoomRef.current * 4.2, 10, CAMERA.topMaxHeight);
      const top = scratch.top.copy(cameraAnchor).add(scratch.panVertical.set(0, height, 0));
      camera.position.lerp(top.add(cameraShake), 1 - Math.exp(-8 * delta));
      // Fixed straight-down orientation: lookAt near the vertical pole made
      // the camera roll unpredictably as its position lagged the player.
      camera.rotation.order = 'YXZ';
      camera.rotation.set(-Math.PI / 2, yawRef.current, 0);
    } else {
      // Hero view auto-follow: the camera lazily swings around behind Darwin
      // as he moves, harder the faster he goes, so steering never needs a
      // manual orbit. A recent drag (manualOrbitUntilRef) or aiming wins, and
      // standing still frees the camera entirely for framing shots.
      if (viewMode === 'hero' && !flightCamera && !aiming && now >= manualOrbitUntilRef.current && facing) {
        const followT = THREE.MathUtils.clamp(moveSpeedT, 0, 1);
        const fx = facing.x;
        const fz = facing.z;
        if (followT > 0.04 && fx * fx + fz * fz > 0.0001) {
          const targetYaw = Math.atan2(-fx, -fz);
          const yawError = Math.atan2(Math.sin(targetYaw - yawRef.current), Math.cos(targetYaw - yawRef.current));
          const followRate = 1.2 + followT * 2.2 + sprintBlendRef.current * 0.8;
          yawRef.current += yawError * (1 - Math.exp(-followRate * delta));
          // Pitch settles toward the hero default while moving, so a glance
          // at the sky or the ground recovers on its own once he runs.
          pitchRef.current = THREE.MathUtils.damp(pitchRef.current, 0.3, followT, delta);
        }
      }
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
      const side = flightCamera?.side
        ?? cameraProfile?.side
        ?? THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.6, 1.5, zoomT), 0.72, swimSideBias);
      const pitchA = THREE.MathUtils.clamp(pitchRef.current, CAMERA.minPitch, CAMERA.maxPitch);
      const swimPitchBias = SWIM_POLISH.enabled ? SWIM_POLISH.cameraPitchBias : 0.92;
      let effectivePitch = flightCamera?.pitch != null
        ? THREE.MathUtils.lerp(flightCamera.pitch, pitchA, manualOrbitBlend)
        : THREE.MathUtils.lerp(pitchA, -0.12, swimCamera * swimPitchBias);
      // Hero view: tight over-the-right-shoulder action framing. Narrow zoom
      // band, chest-high pivot, shallower default pitch, snappier follow, and
      // a slight pull-back as sprint spools so speed reads in the framing.
      const heroMode = viewMode === 'hero' && !flightCamera;
      let frameDistance = cameraDistance;
      let frameSide = side;
      if (heroMode) {
        frameDistance = THREE.MathUtils.clamp(zoomRef.current * 0.55, 2.3, 4.4)
          + sprintBlendRef.current * 0.55
          + swimDistanceBias * 0.6;
        frameSide = 0.5;
        effectivePitch = THREE.MathUtils.lerp(
          THREE.MathUtils.clamp(pitchA * 0.82 - 0.02, -0.36, 1.0),
          -0.12,
          swimCamera * swimPitchBias,
        );
      }
      // Smooth the pivot itself: looking straight at the raw player position
      // transmits every small physics/animation displacement to the camera,
      // which reads as jitter when running.
      const rawPivot = scratch.rawPivot.copy(cameraAnchor).add(scratch.panVertical.set(0, flightCamera?.pivotY ?? pivotY, 0)).add(panOffsetRef.current);
      if (heroMode) rawPivot.y += 0.2;
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
      const pivotDamp = heroMode ? 13 : 9;
      pivot.x = THREE.MathUtils.damp(pivot.x, rawPivot.x, pivotDamp, delta);
      pivot.y = THREE.MathUtils.damp(pivot.y, rawPivot.y, pivotDamp, delta);
      pivot.z = THREE.MathUtils.damp(pivot.z, rawPivot.z, pivotDamp, delta);
      const horiz = Math.cos(effectivePitch) * frameDistance;
      const vert = Math.sin(effectivePitch) * frameDistance;
      const eye = scratch.shoulderEye.copy(pivot)
        .add(cameraForward.multiplyScalar(-horiz))
        .add(cameraRight.multiplyScalar(frameSide))
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
      const adsBlend = adsBlendRef.current;
      let positionDamping = flightCamera?.positionDamping ?? (heroMode ? 12 : 6.5);
      if (adsBlend > 0.001) {
        // Over-the-shoulder aim framing: close, offset to the right, pitched
        // with the aim. Deterministic from yaw/pitch, so a high damping keeps
        // mouse-look crisp without jitter.
        const ads = SHOTGUN.ads;
        const yaw = yawRef.current;
        const aimPitch = THREE.MathUtils.clamp(pitchRef.current, ads.minPitch, ads.maxPitch);
        const cosP = Math.cos(aimPitch);
        const dir3 = scratch.adsDir.set(-Math.sin(yaw) * cosP, -Math.sin(aimPitch), -Math.cos(yaw) * cosP);
        const adsPivot = scratch.adsPivot.copy(playerPosition);
        adsPivot.y += ads.shoulderUp;
        adsPivot.x += Math.cos(yaw) * ads.shoulderSide;
        adsPivot.z += -Math.sin(yaw) * ads.shoulderSide;
        // The wheel/two-finger zoom still works while aiming: it scales the
        // over-the-shoulder distance within a sane band.
        const adsZoom = THREE.MathUtils.clamp(zoomRef.current / CAMERA.defaultZoom, 0.6, 2.6);
        const adsEye = scratch.adsEye.copy(adsPivot).addScaledVector(dir3, -ads.shoulderBack * adsZoom);
        // Keep the aim camera out of the ground when pitching up steeply.
        const groundBelowEye = collisionAdapter.terrainHeight(adsEye.x, adsEye.z) + 0.32;
        if (adsEye.y < groundBelowEye) adsEye.y = groundBelowEye;
        eye.lerp(adsEye, adsBlend);
        const adsLook = scratch.adsLook.copy(adsPivot).addScaledVector(dir3, 16);
        lookTarget = scratch.adsLookBlend.copy(lookTarget).lerp(adsLook, adsBlend);
        positionDamping = THREE.MathUtils.lerp(positionDamping, 20, adsBlend);
      }
      const cameraCollision = cameraProfile?.collision;
      if (cameraCollision?.enabled && collisionAdapter.cameraDistanceLimit) {
        const limitedDistance = collisionAdapter.cameraDistanceLimit(pivot, eye, cameraCollision);
        const requestedDistance = eye.distanceTo(pivot);
        if (limitedDistance < requestedDistance - 0.001) {
          eye.sub(pivot).setLength(limitedDistance).add(pivot);
          positionDamping = Math.max(positionDamping, 12);
        }
      }
      camera.position.lerp(eye.add(cameraShake), 1 - Math.exp(-positionDamping * delta));
      camera.lookAt(lookTarget);
      if (Math.abs(skidRollRef.current) > 0.0005) camera.rotateZ(skidRollRef.current);
    }
    if (!statusViewOpen && !focusSession && statusLookRef.current) {
      const ease = 1 - Math.exp(-3.2 * delta);
      statusLookRef.current.lerp(statusPivot, ease);
      camera.lookAt(statusLookRef.current);
      if (statusLookRef.current.distanceToSquared(statusPivot) < 0.02) statusLookRef.current = null;
    }
    // ADS field-of-view tighten (wins over the sprint widen), plus the
    // crosshair ray for the resolver.
    if (baseFovRef.current === null) baseFovRef.current = camera.fov;
    const surgeAge = now - sprintSurgeAtRef.current;
    const surgePop = surgeAge >= 0 && surgeAge < SPRINT.surgeDuration
      ? Math.sin((surgeAge / SPRINT.surgeDuration) * Math.PI) * SPRINT.surgeFov
      : 0;
    const targetFov = THREE.MathUtils.lerp(baseFovRef.current, SHOTGUN.ads.fov, adsBlendRef.current)
      + (sprintBlendRef.current * SPRINT.fovBonus + surgePop) * (1 - adsBlendRef.current);
    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
    if (aiming) {
      camera.getWorldDirection(scratch.worldDirection);
      shotgunAimState.camX = camera.position.x;
      shotgunAimState.camY = camera.position.y;
      shotgunAimState.camZ = camera.position.z;
      shotgunAimState.camDirX = scratch.worldDirection.x;
      shotgunAimState.camDirY = scratch.worldDirection.y;
      shotgunAimState.camDirZ = scratch.worldDirection.z;
    }
  }, [camera, cameraTargets, gl, scratch]);

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
