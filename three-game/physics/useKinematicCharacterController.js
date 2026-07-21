'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export const CHARACTER_CONTROLLER_CONFIG = {
  radius: 0.36,
  halfHeight: 0.72,
  centerY: 1.08,
  contactOffset: 0.045,
  autostepHeight: 0.32,
  autostepWidth: 0.34,
  snapToGround: 0.46,
  maxSlopeClimbDegrees: 42,
  minSlopeSlideDegrees: 50,
};

function vecToThree(vector) {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

function normalizeCollision(rawCollision) {
  if (!rawCollision) return null;
  const rigidBody = rawCollision.collider?.parent?.() || null;
  return {
    normal: vecToThree(rawCollision.normal1),
    translationDeltaApplied: vecToThree(rawCollision.translationDeltaApplied),
    translationDeltaRemaining: vecToThree(rawCollision.translationDeltaRemaining),
    witness1: vecToThree(rawCollision.witness1),
    witness2: vecToThree(rawCollision.witness2),
    toi: rawCollision.toi,
    collider: rawCollision.collider,
    rigidBody,
    userData: rigidBody?.userData || rawCollision.collider?.userData || null,
  };
}

export function useKinematicCharacterController(rapierContext, bodyRef, colliderRef) {
  const world = rapierContext?.world;
  const state = useRef({
    ready: false,
    controller: null,
    lastCollision: null,
  });

  useEffect(() => {
    if (!world) return undefined;

    const controller = world.createCharacterController(CHARACTER_CONTROLLER_CONFIG.contactOffset);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setSlideEnabled(true);
    controller.enableAutostep(
      CHARACTER_CONTROLLER_CONFIG.autostepHeight,
      CHARACTER_CONTROLLER_CONFIG.autostepWidth,
      false,
    );
    controller.enableSnapToGround(CHARACTER_CONTROLLER_CONFIG.snapToGround);
    controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(CHARACTER_CONTROLLER_CONFIG.maxSlopeClimbDegrees));
    controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(CHARACTER_CONTROLLER_CONFIG.minSlopeSlideDegrees));
    // Dynamic props are pushed explicitly from the controller's computed
    // contacts. Rapier's automatic character impulse is intentionally off:
    // one global character mass cannot make a loose bottle and a loaded
    // barrel both feel plausible, and its impulse lands before prop caps.
    controller.setApplyImpulsesToDynamicBodies(false);

    state.current = {
      ready: true,
      controller,
      lastCollision: null,
    };

    return () => {
      state.current.ready = false;
      try {
        if (controller) world.removeCharacterController(controller);
      } finally {
        state.current = {
          ready: false,
          controller: null,
          lastCollision: null,
        };
      }
    };
  }, [world]);

  const ready = useCallback(() => state.current.ready, []);

  const sync = useCallback(position => {
      const current = state.current;
      const body = bodyRef.current;
      if (!current.ready || !body) return;
      body.setTranslation(position, true);
      body.setNextKinematicTranslation(position);
  }, [bodyRef]);

  const move = useCallback((position, desiredDelta) => {
      const current = state.current;
      const body = bodyRef.current;
      const collider = colliderRef.current;
      if (!current.ready || !body || !collider) {
        return {
          movement: desiredDelta.clone(),
          grounded: false,
          collisions: 0,
          collision: null,
          collisionDetails: [],
          source: 'manual-fallback',
        };
      }

      body.setTranslation(position, true);
      current.controller.computeColliderMovement(collider, desiredDelta);
      const movement = vecToThree(current.controller.computedMovement());
      const next = position.clone().add(movement);
      body.setNextKinematicTranslation(next);

      const collisions = current.controller.numComputedCollisions();
      const collisionDetails = [];
      for (let index = 0; index < collisions; index += 1) {
        const collision = normalizeCollision(current.controller.computedCollision(index));
        if (collision) collisionDetails.push(collision);
      }
      const collision = collisionDetails[0] || null;
      current.lastCollision = collision;

      return {
        movement,
        grounded: current.controller.computedGrounded(),
        collisions,
        collision,
        collisionDetails,
        source: 'rapier-character',
      };
  }, [bodyRef, colliderRef]);

  return useMemo(() => ({
    ready,
    sync,
    move,
  }), [move, ready, sync]);
}
