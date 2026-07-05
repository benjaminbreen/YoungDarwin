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
    // Keep dynamic props pushable, but use a lower effective character mass;
    // PhysicsProp applies the authored speed/launch caps after contact.
    controller.setApplyImpulsesToDynamicBodies(true);
    controller.setCharacterMass(42);

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
          source: 'manual-fallback',
        };
      }

      body.setTranslation(position, true);
      current.controller.computeColliderMovement(collider, desiredDelta);
      const movement = vecToThree(current.controller.computedMovement());
      const next = position.clone().add(movement);
      body.setNextKinematicTranslation(next);

      const collisions = current.controller.numComputedCollisions();
      let collision = null;
      if (collisions > 0) {
        const rawCollision = current.controller.computedCollision(0);
        if (rawCollision) {
          collision = {
            normal: vecToThree(rawCollision.normal1),
            translationDeltaApplied: vecToThree(rawCollision.translationDeltaApplied),
            translationDeltaRemaining: vecToThree(rawCollision.translationDeltaRemaining),
            toi: rawCollision.toi,
            collider: rawCollision.collider,
          };
        }
      }
      current.lastCollision = collision;

      return {
        movement,
        grounded: current.controller.computedGrounded(),
        collisions,
        collision,
        source: 'rapier-character',
      };
  }, [bodyRef, colliderRef]);

  return useMemo(() => ({
    ready,
    sync,
    move,
  }), [move, ready, sync]);
}
