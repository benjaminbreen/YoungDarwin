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
import { examineOrbitActive } from '../../examine/examinables';
import { sunDirection } from '../../world/celestial';
import {
  consumeExamineCameraDirective,
  consumeExamineCameraImpulse,
  consumeExamineStrike,
} from '../../examine/examineCameraDirectives';
import { emitPropEvent } from '../../physics/props/propEvents';
import { cameraFocusPoint } from '../../camera/focusPoint';
import { CAMERA_DEV_DEFAULTS, cameraDev } from '../../camera/cameraDevRuntime';

const CAMERA_DEV_INITIAL_HERO_DISTANCE = CAMERA_DEV_DEFAULTS.heroDistance;
const TWO_PI = Math.PI * 2;

// Metre-denominated camera knobs are authored for Darwin. Scaling them by the
// embodiment's pivot height is what stops a tortoise inheriting a man's dolly
// distance and head bob.
// Cursor-steering response: nothing inside the dead centre, then a squared ramp
// to full rate at the screen edge, so small corrections stay gentle.
function cursorRate(axis, deadzone) {
  const magnitude = Math.abs(axis);
  if (magnitude <= deadzone) return 0;
  const t = (magnitude - deadzone) / (1 - deadzone);
  return Math.sign(axis) * t * t;
}

function embodimentScale(cameraProfile) {
  const pivotY = cameraProfile?.pivotY;
  if (!Number.isFinite(pivotY) || pivotY <= 0) return 1;
  return THREE.MathUtils.clamp(pivotY / 1.22, 0.3, 2.2);
}
import { shotgunAimState } from '../../shooting/aimState';
import { SHOTGUN } from '../../shooting/shotgunConfig';
import { getPlayerPreferences } from '../../playerPreferences';

const UP = new THREE.Vector3(0, 1, 0);

// How far above the drawn terrain the chase camera is allowed to sit. Tuned for
// Darwin's scale; the animal profiles override it via `camera.collision
// .groundClearance` because a clearance sized for a man reads as a crane shot
// from a finch. Large enough to cover the near clip plane plus the gap between
// the drawn mesh and the smoothed movement surface.
const CAMERA_GROUND_CLEARANCE = 0.38;

function dampAngle(current, target, lambda, delta) {
  const wrapped = current + Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return THREE.MathUtils.damp(current, wrapped, lambda, delta);
}

function smootherStep01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

const OPENING_SHOT = Object.freeze({
  // Start close enough to read the landing place, then follow a single long
  // descending arc whose quintic ease gives both the reveal and shoulder
  // handoff room to breathe.
  startHeight: 62,
  startRadius: 36,
  rotation: Math.PI * 0.6,
  surveyForward: 6.5,
  surveySide: -3.5,
  aerialFov: 51,
  motionDelay: 0.055,
});

export function usePlayerCameraRig() {
  const { camera, gl } = useThree();
  const yawRef = useRef(0);
  const pitchRef = useRef(CAMERA.defaultPitch);
  const zoomRef = useRef(CAMERA.defaultZoom);
  // Hero owns its dolly distance in metres rather than sharing the one wheel
  // value with shoulder/overhead/ADS. One shared value forced hero to rescale
  // a 2.8-22 range into a 2m band, so the wheel barely did anything.
  const heroZoomRef = useRef(CAMERA_DEV_INITIAL_HERO_DISTANCE);
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
    directive: null,
    impulse: 0,
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
    initialized: false,
    startPivot: new THREE.Vector3(),
    finalPivot: new THREE.Vector3(),
    finalEye: new THREE.Vector3(),
  });
  // Aim (ADS) mode: the mouse drives camera yaw AND pitch under pointer lock
  // (touch drags do the same without lock), Darwin's facing chases the
  // camera, the crosshair sits at screen center, and a left-click bumps
  // firePulseRef so the controller can fire. While aimActiveRef is true the
  // ordinary click-drag orbit is superseded.
  const pointerNdcRef = useRef(new THREE.Vector2(0, 0));
  // First-person cursor steering only runs while the pointer is actually over
  // the canvas; a cursor parked on the HUD or off-window must not keep turning
  // the head.
  const pointerInsideRef = useRef(false);
  const aimActiveRef = useRef(false);
  const wasAimingRef = useRef(false);
  const adsBlendRef = useRef(0);
  const sprintBlendRef = useRef(0);
  // First-person head bob: a phase that only advances while he is actually
  // walking, and an amplitude that fades in and out so stopping does not cut
  // the bob off mid-step.
  const bobPhaseRef = useRef(0);
  const bobAmpRef = useRef(0);
  // Smoothed occlusion distance, so the chase camera returns from behind a
  // boulder at its own pace instead of the boulder's.
  const occlusionRef = useRef(null);
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
    flightLook: new THREE.Vector3(),
    flightLookForward: new THREE.Vector3(),
    introFinalPivot: new THREE.Vector3(),
    introFinalEye: new THREE.Vector3(),
    introOrbitCenter: new THREE.Vector3(),
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
    const rawX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const rawY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    // Clamped: a captured pointer keeps reporting positions far outside the
    // canvas, and first-person cursor steering squares this value — an
    // unclamped -3 would spin the view at twenty times the intended rate the
    // moment the drag ended. The raw value decides whether the pointer counts
    // as over the canvas at all, which pointerenter alone gets wrong when the
    // cursor is already inside as the scene mounts.
    pointerInsideRef.current = Math.abs(rawX) <= 1 && Math.abs(rawY) <= 1;
    pointerNdcRef.current.set(
      THREE.MathUtils.clamp(rawX, -1, 1),
      THREE.MathUtils.clamp(rawY, -1, 1),
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
    // Aiming honours the same comfort preferences as free look — a player who
    // needs inverted Y needs it down the sights too.
    const aimLook = (dx, dy, speed) => {
      const look = getPlayerPreferences();
      const scaled = speed * look.lookSensitivity;
      yawRef.current -= dx * scaled;
      const pitchDelta = dy * scaled * (look.invertY ? -1 : 1);
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current + pitchDelta, ads.minPitch, ads.maxPitch);
    };
    const onPointerDown = event => {
      if (openingCameraActiveRef.current) {
        updatePointerNdc(event);
        return;
      }
      const examineSession = useThreeGameStore.getState().examineSession;
      if (examineOrbitActive(examineSession)) {
        if (event.button !== 0) return;
        draggingRef.current = true;
        panningRef.current = false;
        dragPointerTypeRef.current = event.pointerType || 'mouse';
        lastPointerXRef.current = event.clientX;
        lastPointerYRef.current = event.clientY;
        examineOrbitRef.current.manualUntil = performance.now() / 1000 + 6;
        examineOrbitRef.current.directive = null;
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
      if (examineOrbitActive(examineSession)) {
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
        const look = getPlayerPreferences();
        const pitchDelta = dy * CAMERA.pitchSpeed * cameraDev.dragPitchScale * look.lookSensitivity * (look.invertY ? -1 : 1);
        yawRef.current -= dx * CAMERA.rotateSpeed * cameraDev.dragRotateScale * look.lookSensitivity;
        pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - pitchDelta, CAMERA.minPitch, CAMERA.maxPitch);
        manualOrbitUntilRef.current = performance.now() / 1000 + cameraDev.manualHold;
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
      if (examineOrbitActive(examineSession)) {
        // A procedure move may park the zoom below the manual floor (macro
        // texture inspection); let the wheel back out of it continuously
        // instead of snapping up to the floor on the first notch.
        examineOrbitRef.current.zoom = THREE.MathUtils.clamp(
          examineOrbitRef.current.zoom + normalizedDelta * 0.1,
          Math.min(0.72, examineOrbitRef.current.zoom),
          1.7,
        );
        examineOrbitRef.current.manualUntil = performance.now() / 1000 + 6;
        examineOrbitRef.current.directive = null;
        return;
      }
      if (examineSession) return;
      const wheelViewMode = useThreeGameStore.getState().viewMode;
      // Hero dollies in metres on its own value; every other mode shares the
      // historical zoom scalar (which ADS and the opening shot also read).
      if (wheelViewMode === 'hero') {
        heroZoomRef.current = THREE.MathUtils.clamp(
          heroZoomRef.current + normalizedDelta * cameraDev.heroZoomStep,
          cameraDev.heroMinDistance,
          cameraDev.heroMaxDistance,
        );
        return;
      }
      const maxZoom = wheelViewMode === 'top' ? CAMERA.topMaxZoom : CAMERA.maxZoom;
      zoomRef.current = THREE.MathUtils.clamp(
        zoomRef.current + normalizedDelta * 0.9,
        CAMERA.minZoom,
        maxZoom,
      );
    };
    // Right mouse is the aim button; the browser menu would swallow it.
    const onContextMenu = event => event.preventDefault();
    const onPointerEnter = () => { pointerInsideRef.current = true; };
    const onPointerLeave = () => { pointerInsideRef.current = false; };
    element.style.cursor = 'grab';
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerenter', onPointerEnter);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', stopDrag);
    element.addEventListener('pointercancel', stopDrag);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('contextmenu', onContextMenu);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerenter', onPointerEnter);
      element.removeEventListener('pointerleave', onPointerLeave);
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

  const resetCameraForSpawn = useCallback((groundY, cameraFacing = null) => {
    cameraFollowYRef.current = groundY;
    statusLookRef.current = null;
    shoulderPivotRef.current = null;
    // A spawn teleports the camera, so anything carrying state about where it
    // just was has to go with it: a stale occlusion distance holds the new
    // camera pulled in for a second, and a stale bob phase starts the new scene
    // mid-step.
    occlusionRef.current = null;
    bobPhaseRef.current = 0;
    bobAmpRef.current = 0;
    if (cameraFacing) {
      const forward = scratch.recenterForward.set(cameraFacing.x || 0, 0, cameraFacing.z || -1);
      if (forward.lengthSq() > 0.0001) {
        forward.normalize();
        yawRef.current = Math.atan2(-forward.x, -forward.z);
      }
      panOffsetRef.current.set(0, 0, 0);
    }
  }, [scratch]);

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
      // FOV is part of the embodied camera profile, not a permanent mutation
      // of the shared Three camera. Resetting it here also restores Darwin's
      // ordinary lens after leaving an animal mode.
      baseFovRef.current = Number.isFinite(cameraProfile?.fov)
        ? cameraProfile.fov
        : 50;
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
      // Hero's dolly stays in authored (Darwin-sized) metres; the embodiment
      // scale is applied where the distance is used, so the wheel's clamp band
      // is the same number the panel shows whichever body is worn.
      heroZoomRef.current = cameraDev.heroDistance;
      occlusionRef.current = null;
    }
    const embodiment = embodimentScale(cameraProfile);
    // Keep yaw in ±π. It only ever accumulates, and cursor steering can spin
    // continuously — a session that ends up thousands of radians out is the
    // same orientation with visibly less precision left in it. Every consumer
    // either wraps its own error (dampAngle, the flight align) or goes through
    // lookAt, so the wrap is invisible.
    if (yawRef.current > Math.PI || yawRef.current < -Math.PI) {
      yawRef.current = Math.atan2(Math.sin(yawRef.current), Math.cos(yawRef.current));
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
    // A truthy `focus` is not enough: anything without three finite coordinates
    // makes every camera position below NaN, and a NaN camera propagates to the
    // glare overlay and the player body before anything reports it.
    const examineFocus = cameraFocusPoint(rigStoreState.examineSession?.focus);
    const examineSession = examineFocus ? rigStoreState.examineSession : null;
    const bookFocus = cameraFocusPoint(rigStoreState.readableBookSession?.focus);
    const readableBookSession = bookFocus
      ? {
          focus: bookFocus,
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
        openingCameraRuntimeRef.current.initialized = false;
      }
      const runtime = openingCameraRuntimeRef.current;
      const duration = Math.max(1, openingCamera.duration || 5);
      const progress = THREE.MathUtils.clamp((now - runtime.startedAt) / duration, 0, 1);
      const introForward = scratch.introForward.set(0, 0, -1).applyAxisAngle(UP, yawRef.current);
      const introRight = scratch.introRight.set(1, 0, 0).applyAxisAngle(UP, yawRef.current);
      const currentFinalPivot = scratch.introFinalPivot
        .set(playerPosition.x, terrainCameraY + 1.22, playerPosition.z)
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
      if (!runtime.initialized) {
        runtime.startPivot
          .copy(playerPosition)
          .add(scratch.panVertical.set(0, 1.05, 0));
        runtime.finalPivot.copy(currentFinalPivot);
        runtime.finalEye.copy(currentFinalEye);
        runtime.initialized = true;
      }
      const finalPivot = runtime.finalPivot;
      const finalEye = runtime.finalEye;
      const finalOffsetX = finalEye.x - finalPivot.x;
      const finalOffsetZ = finalEye.z - finalPivot.z;
      const finalAngle = Math.atan2(finalOffsetZ, finalOffsetX);
      const motionProgress = THREE.MathUtils.clamp(
        (progress - OPENING_SHOT.motionDelay) / (1 - OPENING_SHOT.motionDelay),
        0,
        1,
      );
      // One continuous eased spiral owns the complete shot. The old path
      // stopped at a low intermediate orbit and used a second, late blend for
      // the shoulder handoff; compressing that distance into the final second
      // was the visible end lurch.
      const pathT = smootherStep01(motionProgress);
      const orbitAngle = THREE.MathUtils.lerp(
        finalAngle - OPENING_SHOT.rotation,
        finalAngle,
        pathT,
      );
      const finalRadius = Math.max(0.01, Math.hypot(finalOffsetX, finalOffsetZ));
      const orbitRadius = THREE.MathUtils.lerp(OPENING_SHOT.startRadius, finalRadius, pathT);
      const finalHeight = finalEye.y - finalPivot.y;
      const orbitHeight = THREE.MathUtils.lerp(OPENING_SHOT.startHeight, finalHeight, pathT);
      const orbitCenter = scratch.introOrbitCenter
        .copy(runtime.startPivot)
        .addScaledVector(introForward, OPENING_SHOT.surveyForward * (1 - pathT))
        .addScaledVector(introRight, OPENING_SHOT.surveySide * (1 - pathT))
        .lerp(finalPivot, pathT);
      const eye = scratch.introEye.set(
        orbitCenter.x + Math.cos(orbitAngle) * orbitRadius,
        orbitCenter.y + orbitHeight,
        orbitCenter.z + Math.sin(orbitAngle) * orbitRadius,
      );
      const lookTarget = scratch.introLookTarget.copy(orbitCenter);
      camera.position.copy(eye).addScaledVector(cameraShake, pathT);
      camera.lookAt(lookTarget);
      camera.rotation.z += Math.sin(pathT * Math.PI) * 0.007;
      const finalFov = baseFovRef.current ?? 50;
      const openingFov = THREE.MathUtils.lerp(
        OPENING_SHOT.aerialFov,
        finalFov,
        pathT,
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
    if (examineOrbitActive(examineSession)) {
      // A live, subject-owned inspection orbit. Runtime pose data is kept out
      // of React so the camera can follow a moving/falling actor without a
      // stale one-time focus snapshot. The framing distance is derived from
      // both vertical and horizontal FOV, which keeps the whole specimen in
      // view on narrow portrait screens as well as desktop. Ambient field
      // targets and items have no runtime pose or rendered bounds; they fall
      // back to their session focus and authored frame hint and orbit the
      // same way.
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
        orbit.directive = null;
        orbit.impulse = 0;
      }
      const requestedDirective = consumeExamineCameraDirective();
      if (requestedDirective && !draggingRef.current) {
        let yawTarget = Number.isFinite(requestedDirective.yawDelta)
          ? orbit.yaw + requestedDirective.yawDelta
          : null;
        if (requestedDirective.faceSun) {
          // Swing toward the sun-lit face so a texture macro lands on legible
          // surface, capped so the move never disorients by circling the
          // subject. At night keep the plain yawDelta.
          const sun = sunDirection(examineSession.timeOfDay, examineSession.day);
          if (sun[1] > 0.08) {
            const sunYaw = Math.atan2(sun[0], sun[2]);
            const wrapped = Math.atan2(Math.sin(sunYaw - orbit.yaw), Math.cos(sunYaw - orbit.yaw));
            yawTarget = orbit.yaw + THREE.MathUtils.clamp(wrapped, -1.2, 1.2);
          }
        }
        orbit.directive = {
          zoom: Number.isFinite(requestedDirective.zoom) ? requestedDirective.zoom : null,
          pitch: Number.isFinite(requestedDirective.pitch)
            ? THREE.MathUtils.clamp(requestedDirective.pitch, -0.85, 1.32)
            : null,
          yawTarget,
        };
        // Hold the idle drift at the new framing; a drag or wheel cancels
        // both the move and the hold through the input handlers above.
        orbit.manualUntil = now + (requestedDirective.holdSeconds || 4);
      }
      orbit.impulse = Math.max(orbit.impulse || 0, consumeExamineCameraImpulse());
      if (orbit.directive) {
        const directiveEase = 1 - Math.exp(-2.6 * delta);
        const move = orbit.directive;
        let remaining = 0;
        if (move.zoom !== null) {
          orbit.zoom += (move.zoom - orbit.zoom) * directiveEase;
          remaining = Math.max(remaining, Math.abs(move.zoom - orbit.zoom));
        }
        if (move.pitch !== null) {
          orbit.pitch += (move.pitch - orbit.pitch) * directiveEase;
          remaining = Math.max(remaining, Math.abs(move.pitch - orbit.pitch));
        }
        if (move.yawTarget !== null) {
          orbit.yaw += (move.yawTarget - orbit.yaw) * directiveEase;
          remaining = Math.max(remaining, Math.abs(move.yawTarget - orbit.yaw));
        }
        if (remaining < 0.004) orbit.directive = null;
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
      // The zoom floor is the subject's own bulk: a procedure macro (or any
      // future zoom source) must stop at the surface, not dolly through a
      // boulder and frame whatever stood behind it.
      const minSurfaceDistance = Math.max(0.16, halfWidth * 1.15 + 0.1);
      const distance = THREE.MathUtils.clamp(fitDistance * orbit.zoom, minSurfaceDistance, 14);
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
      const strike = consumeExamineStrike();
      if (strike) {
        // Place the burst on the camera-facing surface (subject center pushed
        // out along the eye ray by the framing radius); at the center itself
        // it would spawn inside the mesh and never be seen.
        const toEye = scratch.worldDirection.copy(eye).sub(center).normalize();
        emitPropEvent('prop-struck', {
          dustCount: 12,
          sparkCount: 3,
          ...strike,
          position: {
            x: center.x + toEye.x * halfWidth * 0.92,
            y: center.y + toEye.y * halfWidth * 0.92,
            z: center.z + toEye.z * halfWidth * 0.92,
          },
          impactDir: { x: toEye.x, y: 0.2, z: toEye.z },
        });
      }
      // Strike nudge: a small decaying wobble when a surface test lands.
      // Distance-scaled so a macro shot and a boulder-wide shot read alike.
      if (orbit.impulse > 0.001) {
        const wobble = Math.sin(orbit.impulse * 24) * orbit.impulse * orbit.impulse;
        const shakeAmp = Math.min(0.05, 0.014 * distance);
        eye.y += wobble * shakeAmp;
        eye.x += Math.cos(orbit.impulse * 31) * orbit.impulse * shakeAmp * 0.5 * Math.cos(orbit.yaw);
        eye.z -= Math.cos(orbit.impulse * 31) * orbit.impulse * shakeAmp * 0.5 * Math.sin(orbit.yaw);
        orbit.impulse = Math.max(0, orbit.impulse - delta * 2.6);
      }
      // Compact portrait puts the notebook in a bottom sheet; center the
      // subject in the visible band above it, not the canvas the sheet hides.
      // The sheet's height is measured from the rendered notebook so a
      // stylesheet change cannot silently desync the framing; the constants
      // only cover the frame before the overlay mounts. Lowering the look
      // target by sheetRatio of the frustum half-height raises the subject
      // by half the sheet's screen share.
      if (!orbit.notebookEl || !orbit.notebookEl.isConnected) {
        orbit.notebookEl = typeof document !== 'undefined'
          ? document.querySelector('[data-examine-notebook]')
          : null;
      }
      const notebookRect = orbit.notebookEl?.getBoundingClientRect() || null;
      const measuredSheet = notebookRect && notebookRect.width >= viewportWidth * 0.9
        ? THREE.MathUtils.clamp((viewportHeight - notebookRect.top) / Math.max(1, viewportHeight), 0, 0.7)
        : 0;
      const sheetRatio = sideNotebookLayout ? 0 : measuredSheet || (viewportWidth <= 520 ? 0.56 : 0.52);
      const verticalBias = distance * Math.tan(verticalFov / 2) * sheetRatio;
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
      // Negated deliberately: `NaN < 0.001` is false, so the original spelling
      // let a non-finite direction fall through to the divide below.
      if (!(dirLength > 0.001)) {
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
      // Cursor steering: the pointer's distance from screen centre turns the
      // head at a rate, with a dead middle so the frame stays clickable and no
      // pointer lock is needed. Squared falloff keeps small corrections gentle
      // and the screen edge fast.
      if (cameraDev.fpCursorLook > 0.5 && !aiming && !draggingRef.current && pointerInsideRef.current) {
        const dead = THREE.MathUtils.clamp(cameraDev.fpCursorDeadzone, 0, 0.95);
        const look = getPlayerPreferences();
        const speed = cameraDev.fpCursorSpeed * look.lookSensitivity * delta;
        yawRef.current -= cursorRate(pointerNdcRef.current.x, dead) * speed;
        // pitchRef is an orbit pitch: larger looks DOWN (see lookPitch below),
        // so a cursor above centre has to decrease it.
        const pitchSign = look.invertY ? 1 : -1;
        pitchRef.current = THREE.MathUtils.clamp(
          pitchRef.current
            + cursorRate(pointerNdcRef.current.y, dead) * speed * cameraDev.fpCursorPitch * pitchSign,
          CAMERA.minPitch,
          CAMERA.maxPitch,
        );
      }
      // Eye sits slightly forward of head center so the camera never ends up
      // inside the skull geometry; vertical motion is snapped, not lerped,
      // because positional lag is what caused the camera to fall behind into
      // the model while moving.
      const eyeForward = scratch.eyeForward.set(0, 0, -cameraDev.fpEyeForward * embodiment)
        .applyAxisAngle(UP, yawRef.current);
      desired.copy(playerPosition)
        .add(scratch.panVertical.set(0, cameraProfile?.firstPersonEyeY ?? 1.66, 0))
        .add(eyeForward);
      // Head bob. The phase advances only while he is on his feet and moving,
      // and the amplitude fades, so stopping settles the head instead of
      // cutting the cycle off mid-step. Vertical runs at twice the stride rate
      // against lateral and roll at once — that ratio is what reads as walking
      // rather than as a shaken camera.
      const gaitT = (wasAirborne || swimming) ? 0 : THREE.MathUtils.clamp(moveSpeedT, 0, 1);
      bobAmpRef.current = THREE.MathUtils.damp(bobAmpRef.current, gaitT, 6, delta);
      bobPhaseRef.current = (bobPhaseRef.current + delta * TWO_PI * cameraDev.fpBobStride * gaitT) % TWO_PI;
      const bobAmp = bobAmpRef.current * (1 + sprintBlendRef.current * 0.35) * embodiment;
      const bobPhase = bobPhaseRef.current;
      const bobY = Math.sin(bobPhase * 2) * cameraDev.fpBobVertical * bobAmp;
      const bobSide = Math.sin(bobPhase) * cameraDev.fpBobLateral * bobAmp;
      // Standing still the head keeps a slow breath, so a held first-person
      // frame is never perfectly dead.
      const breathe = Math.sin(now * 1.6) * cameraDev.fpBreathe * (1 - bobAmpRef.current) * embodiment;
      const bobRight = scratch.cameraRight.set(1, 0, 0).applyAxisAngle(UP, yawRef.current);
      desired.addScaledVector(bobRight, bobSide);
      // Impacts duck the head; recoil throws the muzzle up instead. Both ride
      // the impulse envelope the chase camera already shakes on, so neither
      // needs its own timer.
      const recoilImpulse = cameraImpulse.kind === 'recoil';
      const impactFade = recoilImpulse ? 0 : impulseFade;
      const recoilFade = recoilImpulse ? impulseFade : 0;
      desired.y += bobY + breathe - impactFade * cameraDev.fpLandingDip * embodiment;
      // Swimming, the eye belongs at the waterline rather than a head's height
      // above a body that is floating in it.
      if (swimCamera > 0.001) {
        desired.y = THREE.MathUtils.lerp(
          desired.y,
          WATER_LEVEL + cameraDev.fpSwimEyeAbove,
          swimCamera,
        );
      }
      camera.position.copy(desired);
      const pitchLimit = Math.max(0.2, cameraDev.fpPitchLimit);
      // The recoil kick is deliberately a view offset, not a write to pitchRef:
      // the muzzle rises and settles on its own without the shot permanently
      // moving where the player was aiming.
      const lookPitch = THREE.MathUtils.clamp(
        (CAMERA.defaultPitch - pitchRef.current) * cameraDev.fpPitchScale
          + recoilFade * cameraDev.fpRecoilKick,
        -pitchLimit,
        pitchLimit,
      );
      const lookRoll = skidRollRef.current * cameraDev.fpRollScale
        + Math.sin(bobPhase) * cameraDev.fpBobRoll * bobAmp;
      camera.rotation.order = 'YXZ';
      if (cameraDev.fpYawDamping > 0.01) {
        camera.rotation.set(
          dampAngle(camera.rotation.x, lookPitch, cameraDev.fpYawDamping, delta),
          dampAngle(camera.rotation.y, yawRef.current, cameraDev.fpYawDamping, delta),
          lookRoll,
        );
      } else {
        camera.rotation.set(lookPitch, yawRef.current, lookRoll);
      }
    } else if (viewMode === 'top') {
      const height = cameraProfile?.topHeight
        ?? THREE.MathUtils.clamp(zoomRef.current * cameraDev.topHeightScale, 10, CAMERA.topMaxHeight);
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
        if (followT > cameraDev.heroFollowGate && fx * fx + fz * fz > 0.0001) {
          const targetYaw = Math.atan2(-fx, -fz);
          const yawError = Math.atan2(Math.sin(targetYaw - yawRef.current), Math.cos(targetYaw - yawRef.current));
          // Deadzone plus a soft knee: small steering corrections move the
          // camera not at all, a real turn moves it at full rate, and nothing
          // in between changes abruptly.
          const dead = cameraDev.heroFollowDeadzone;
          const authority = THREE.MathUtils.smoothstep(
            Math.abs(yawError),
            dead,
            dead + Math.max(0.02, cameraDev.heroFollowKnee),
          );
          // And ease follow back in after a manual drag expires, so releasing
          // the mouse does not hand the camera straight to a full-rate swing.
          const resume = cameraDev.heroFollowResume > 0.01
            ? THREE.MathUtils.smoothstep(now - manualOrbitUntilRef.current, 0, cameraDev.heroFollowResume)
            : 1;
          const followRate = (cameraDev.heroFollowBase
            + followT * cameraDev.heroFollowSpeed
            + sprintBlendRef.current * cameraDev.heroFollowSprint) * authority * resume;
          yawRef.current += yawError * (1 - Math.exp(-followRate * delta));
          // Pitch settles toward the hero default while moving, so a glance
          // at the sky or the ground recovers on its own once he runs.
          // Pitch rides the same resume ramp as yaw: a deliberate tilt should
          // not start unwinding at full rate the instant the hold expires.
          pitchRef.current = THREE.MathUtils.damp(
            pitchRef.current,
            cameraDev.heroPitchTarget,
            followT * cameraDev.heroPitchSettle * resume,
            delta,
          );
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
        frameDistance = (THREE.MathUtils.clamp(
          heroZoomRef.current,
          cameraDev.heroMinDistance,
          cameraDev.heroMaxDistance,
        ) + sprintBlendRef.current * cameraDev.heroSprintPull) * embodiment
          + swimDistanceBias * 0.6;
        frameSide = cameraDev.heroSide * embodiment;
        effectivePitch = THREE.MathUtils.lerp(
          THREE.MathUtils.clamp(
            pitchA * cameraDev.heroPitchScale + cameraDev.heroPitchOffset,
            cameraDev.heroPitchMin,
            cameraDev.heroPitchMax,
          ),
          -0.12,
          swimCamera * swimPitchBias,
        );
      }
      // Smooth the pivot itself: looking straight at the raw player position
      // transmits every small physics/animation displacement to the camera,
      // which reads as jitter when running.
      const rawPivot = scratch.rawPivot.copy(cameraAnchor).add(scratch.panVertical.set(0, flightCamera?.pivotY ?? pivotY, 0)).add(panOffsetRef.current);
      if (heroMode) {
        rawPivot.y += (cameraDev.heroPivotLift + sprintBlendRef.current * cameraDev.heroSprintLift) * embodiment;
        // Lead the subject: push the look pivot along his facing with speed, so
        // a run frames the ground he is about to cross rather than the ground
        // behind him. Speed-gated, and smoothed by the pivot damping below.
        if (facing && cameraDev.heroLookAhead > 0.001) {
          const leadX = facing.x;
          const leadZ = facing.z;
          const leadLength = Math.hypot(leadX, leadZ);
          if (leadLength > 0.0001) {
            const lead = cameraDev.heroLookAhead * THREE.MathUtils.clamp(moveSpeedT, 0, 1) * embodiment;
            rawPivot.x += (leadX / leadLength) * lead;
            rawPivot.z += (leadZ / leadLength) * lead;
          }
        }
      }
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
      const pivotDamp = heroMode ? cameraDev.heroPivotDamping : cameraDev.shoulderPivotDamping;
      // Vertical gets its own, softer rate. Broken ground moves the player up
      // and down constantly; a camera that tracks that exactly bounces.
      const pivotDampY = heroMode ? cameraDev.heroPivotDampingY : cameraDev.shoulderPivotDampingY;
      pivot.x = THREE.MathUtils.damp(pivot.x, rawPivot.x, pivotDamp, delta);
      pivot.y = THREE.MathUtils.damp(pivot.y, rawPivot.y, pivotDampY, delta);
      pivot.z = THREE.MathUtils.damp(pivot.z, rawPivot.z, pivotDamp, delta);
      const horiz = Math.cos(effectivePitch) * frameDistance;
      const vert = Math.sin(effectivePitch) * frameDistance;
      const eye = scratch.shoulderEye.copy(pivot)
        .add(cameraForward.multiplyScalar(-horiz))
        .add(cameraRight.multiplyScalar(frameSide))
        .add(scratch.panVertical.set(0, vert, 0));
      let lookTarget = pivot;
      if (flightCamera?.lookAhead && facing) {
        const flightLookForward = scratch.flightLookForward.set(
          facing.x || 0,
          0,
          facing.z || -1,
        );
        if (flightLookForward.lengthSq() > 0.0001) {
          flightLookForward.normalize();
          const lookAhead = flightCamera.lookAhead
            + (flightCamera.speedLookAhead ?? 0) * THREE.MathUtils.clamp(flightSpeedT, 0, 1);
          // Keep the bird in the lower part of the composition and expose
          // upcoming perches/terrain. The eye stays attached to the bird; only
          // its point of attention travels forward.
          lookTarget = scratch.flightLook
            .copy(pivot)
            .addScaledVector(flightLookForward, lookAhead);
        }
      }
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
      let positionDamping = flightCamera?.positionDamping
        ?? (heroMode ? cameraDev.heroPositionDamping : cameraDev.shoulderPositionDamping);
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
      // Terrain clamp, run before the obstacle test below so the ray is cast at
      // the eye's final height. cameraDistanceLimit only ray-tests box
      // obstacles — it never consults the heightfield — so on open ground the
      // chase camera sank through hillsides whenever the player walked downslope
      // or pitched the view down. Lifting the eye is enough: lookTarget stays on
      // the pivot, so the framing rises instead of swinging around the player.
      const groundClearance = cameraCollision?.groundClearance ?? CAMERA_GROUND_CLEARANCE;
      if (groundClearance > 0 && collisionAdapter.visualTerrainHeight) {
        const eyeGroundY = collisionAdapter.visualTerrainHeight(eye.x, eye.z) + groundClearance;
        if (eye.y < eyeGroundY) {
          eye.y = eyeGroundY;
          // Match the obstacle path: a clamped eye must chase its target
          // quickly or the camera lags visibly behind a downhill sprint.
          positionDamping = Math.max(positionDamping, 12);
        }
      }
      if (cameraCollision?.enabled && collisionAdapter.cameraDistanceLimit) {
        const limitedDistance = collisionAdapter.cameraDistanceLimit(pivot, eye, cameraCollision);
        const requestedDistance = eye.distanceTo(pivot);
        const allowed = Math.min(limitedDistance, requestedDistance);
        // Asymmetric: duck in at the speed the obstacle demands, come back out
        // slowly. Equal rates make the return read as the world shoving the
        // camera, and a rock clipped in passing snaps the whole frame.
        if (occlusionRef.current === null) {
          occlusionRef.current = allowed;
        } else {
          occlusionRef.current = THREE.MathUtils.damp(
            occlusionRef.current,
            allowed,
            allowed < occlusionRef.current ? cameraDev.occlusionPullIn : cameraDev.occlusionReturn,
            delta,
          );
        }
        const occluded = Math.min(occlusionRef.current, requestedDistance);
        if (occluded < requestedDistance - 0.001) {
          eye.sub(pivot).setLength(occluded).add(pivot);
          positionDamping = Math.max(positionDamping, 12);
        }
      } else {
        occlusionRef.current = null;
      }
      camera.position.lerp(eye.add(cameraShake), 1 - Math.exp(-positionDamping * delta));
      camera.lookAt(lookTarget);
      if (Math.abs(skidRollRef.current) > 0.0005) camera.rotateZ(skidRollRef.current);
    }
    if (!statusViewOpen && !focusSession && statusLookRef.current) {
      if (viewMode === 'first' || viewMode === 'top') {
        // These two set an exact rotation of their own. Easing a lookAt on top
        // of it fights them, and in first person the eye sits on the pivot
        // being looked at, so the direction is degenerate — closing the journal
        // threw the view somewhere arbitrary for a second.
        statusLookRef.current = null;
      } else {
        const ease = 1 - Math.exp(-3.2 * delta);
        statusLookRef.current.lerp(statusPivot, ease);
        camera.lookAt(statusLookRef.current);
        if (statusLookRef.current.distanceToSquared(statusPivot) < 0.02) statusLookRef.current = null;
      }
    }
    // ADS field-of-view tighten (wins over the sprint widen), plus the
    // crosshair ray for the resolver.
    if (baseFovRef.current === null) baseFovRef.current = camera.fov;
    const surgeAge = now - sprintSurgeAtRef.current;
    const surgePop = surgeAge >= 0 && surgeAge < SPRINT.surgeDuration
      ? Math.sin((surgeAge / SPRINT.surgeDuration) * Math.PI) * SPRINT.surgeFov
      : 0;
    const embodiedFov = flightCamera
      ? (flightCamera.fov ?? baseFovRef.current)
        + (flightCamera.speedFovBonus ?? 0) * THREE.MathUtils.clamp(flightSpeedT, 0, 1)
      : baseFovRef.current;
    // First person wants a wider lens than a chase view at the same number:
    // the same FOV that frames a body well is claustrophobic behind the eyes.
    const firstPersonFov = viewMode === 'first' && !flightCamera && !statusViewOpen && !focusSession
      ? cameraDev.fpFovBonus
      : 0;
    const targetFov = THREE.MathUtils.lerp(embodiedFov, SHOTGUN.ads.fov, adsBlendRef.current)
      + (sprintBlendRef.current * SPRINT.fovBonus + surgePop + firstPersonFov) * (1 - adsBlendRef.current);
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
