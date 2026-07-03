import * as THREE from 'three';
import { emitPropEvent } from '../../physics/props/propEvents';
import { terrainBiomeAt } from '../../world/terrain';
import { WATER_LEVEL } from '../../world/water';
import { ACTION_DURATION, PLAYER } from './playerConfig';
import { arcadeLandingMomentum } from './arcadeLocomotion';

export function updatePlayerJumpInputAndGravity({
  keys,
  touch,
  stateRef,
  spawnDrop,
  velocity,
  group,
  facing,
  wasAirborne,
  jumpState,
  jumpCharge,
  pendingStandingJump,
  swimState,
  lastGroundedAt,
  jumpBufferedUntil,
  lastButtons,
  collisionAdapter,
  footstepDustTriggerRef,
  frameScratch,
  currentZoneId,
  moving,
  running,
  grounded,
  rawRunSpeed,
  rawInputDirection,
  delta,
  now,
}) {
  const jumpHeld = Boolean(keys.jump || touch.jump);
  const jumpJustPressed = jumpHeld && !lastButtons.current.jump;
  const canStartJumpInput = !stateRef.current.crouching
    && !stateRef.current.aiming
    && !stateRef.current.action
    && spawnDrop.current.phase === 'complete'
    && now >= stateRef.current.lockMovementUntil
    && jumpState.current.phase !== 'takeoff'
    && (grounded || now - lastGroundedAt.current <= PLAYER.coyoteTime);

  const launchJump = (launchRunning, chargeAmount = 0) => {
    const charge = THREE.MathUtils.clamp(chargeAmount, 0, 1);
    velocity.current.y = PLAYER.jumpVelocity
      + (launchRunning ? PLAYER.runningJumpVerticalBonus : PLAYER.chargedJumpBonus * charge);
    if (moving || launchRunning) {
      const horizontal = frameScratch.launchHorizontal.set(velocity.current.x, 0, velocity.current.z);
      const launchDirection = moving
        ? frameScratch.launchDirection.copy(rawInputDirection).normalize()
        : frameScratch.launchDirection.copy(facing.current).normalize();
      const minLaunchSpeed = launchRunning ? rawRunSpeed * 0.78 : PLAYER.walkSpeed * 0.52;
      if (horizontal.length() < minLaunchSpeed) {
        horizontal.copy(launchDirection).setLength(minLaunchSpeed);
        velocity.current.x = horizontal.x;
        velocity.current.z = horizontal.z;
      }
    }
    jumpCharge.current.active = false;
    jumpCharge.current.amount = 0;
    pendingStandingJump.current.active = false;
    lastGroundedAt.current = -10;
    jumpBufferedUntil.current = -10;
    jumpState.current = {
      phase: 'takeoff',
      takeoffUntil: now + ACTION_DURATION.jumpTakeoff * (0.52 + charge * 0.18),
      wasRunning: launchRunning,
      fromPlayerJump: true,
      chargeAmount: charge,
      launchedAt: now,
      launchY: group.current.position.y,
      launchX: group.current.position.x,
      launchZ: group.current.position.z,
    };
    stateRef.current.jumpCharging = false;
    stateRef.current.jumpPhase = 'takeoff';
    stateRef.current.jumpWasRunning = launchRunning;
    stateRef.current.jumpChargeAmount = charge;
    const launchGround = collisionAdapter.groundInfo(group.current.position);
    stateRef.current.jumpFromHeight = Number.isFinite(launchGround.terrainY)
      && launchGround.y - launchGround.terrainY > 0.85;
    wasAirborne.current = true;

    const launchHorizontalSpeed = Math.hypot(velocity.current.x, velocity.current.z);
    const takeoffDirection = frameScratch.launchDirection.set(velocity.current.x, 0, velocity.current.z);
    if (takeoffDirection.lengthSq() > 0.001) takeoffDirection.normalize();
    else takeoffDirection.copy(facing.current);
    footstepDustTriggerRef.current?.({
      kind: 'takeoff',
      intensity: THREE.MathUtils.clamp(0.48 + launchHorizontalSpeed / 13 + charge * 0.32 + (launchRunning ? 0.18 : 0), 0.46, 1),
      biome: terrainBiomeAt(group.current.position.x, group.current.position.z, group.current.position.y, currentZoneId),
      direction: { x: takeoffDirection.x, y: 0, z: takeoffDirection.z },
      horizontalSpeed: launchHorizontalSpeed,
      radiusScale: launchRunning ? 1.05 : 0.82,
    });
  };

  if (jumpJustPressed && !canStartJumpInput) {
    jumpBufferedUntil.current = now + PLAYER.jumpBufferTime;
  }
  if ((jumpJustPressed || now <= jumpBufferedUntil.current) && canStartJumpInput && !swimState.current.active) {
    const launchRunning = moving || running || Math.hypot(velocity.current.x, velocity.current.z) > PLAYER.walkSpeed * 1.05;
    if (launchRunning) {
      launchJump(true, 0);
    } else {
      pendingStandingJump.current = { active: true, startedAt: now };
      jumpCharge.current = { active: false, startedAt: now, wasRunning: false, amount: 0 };
    }
  }

  stateRef.current.jumpCharging = false;
  if (pendingStandingJump.current.active) {
    const stillCanResolveStandingJump = !stateRef.current.crouching
      && !stateRef.current.aiming
      && !stateRef.current.action
      && spawnDrop.current.phase === 'complete'
      && now >= stateRef.current.lockMovementUntil
      && grounded
      && jumpState.current.phase !== 'takeoff';
    if (!stillCanResolveStandingJump) {
      pendingStandingJump.current.active = false;
      jumpCharge.current = { active: false, startedAt: 0, wasRunning: false, amount: 0 };
    } else if (!jumpHeld) {
      launchJump(false, jumpCharge.current.active ? jumpCharge.current.amount : 0);
    } else {
      const heldFor = now - pendingStandingJump.current.startedAt;
      if (heldFor >= PLAYER.jumpChargeStartDelay) {
        const rawCharge = (heldFor - PLAYER.jumpChargeStartDelay) / PLAYER.jumpChargeMaxDuration;
        const chargeAmount = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(rawCharge, 0, 1), 0, 1);
        jumpCharge.current.active = true;
        jumpCharge.current.startedAt = pendingStandingJump.current.startedAt;
        jumpCharge.current.wasRunning = false;
        jumpCharge.current.amount = chargeAmount;
        stateRef.current.jumpCharging = true;
        stateRef.current.jumpPhase = 'charging';
        stateRef.current.jumpWasRunning = false;
        stateRef.current.jumpChargeAmount = chargeAmount;
        velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, PLAYER.groundDeceleration, delta);
        velocity.current.z = THREE.MathUtils.damp(velocity.current.z, 0, PLAYER.groundDeceleration, delta);
      }
    }
  }

  lastButtons.current.jump = jumpHeld;
  if (!jumpCharge.current.active && grounded && jumpState.current.phase !== 'takeoff' && velocity.current.y < 0) {
    velocity.current.y = 0;
  }
  if (!jumpCharge.current.active) {
    const gravityScale = velocity.current.y < 0
      ? PLAYER.fallGravityMultiplier
      : (!jumpHeld && velocity.current.y > 0 ? PLAYER.jumpReleaseGravityMultiplier : 1);
    velocity.current.y -= PLAYER.gravity * gravityScale * delta;
  } else {
    velocity.current.y = 0;
  }
}

export function resolvePlayerLanding({
  group,
  velocity,
  facing,
  stateRef,
  wasAirborne,
  jumpState,
  characterController,
  characterMove,
  frameScratch,
  terrainFeedback,
  arcadeLocomotion,
  landingDustTriggerRef,
  cameraImpulse,
  currentZoneId,
  moving,
  running,
  grounded,
  groundDistance,
  nextGroundY,
  queueMovementCost,
  startAction,
  durationFor,
  delta,
  now,
}) {
  const belowTerrainFloor = groundDistance < -PLAYER.groundContactEpsilon
    && (velocity.current.y <= 0 || groundDistance < -PLAYER.groundSnapDistance);
  const canResolveGroundContact = velocity.current.y <= 0 && jumpState.current.phase !== 'takeoff';
  const terrainContact = canResolveGroundContact && groundDistance <= PLAYER.groundContactEpsilon;
  const terrainSnapContact = velocity.current.y <= 0
    && jumpState.current.phase !== 'takeoff'
    && groundDistance <= PLAYER.groundSnapDistance;
  const rapierContact = canResolveGroundContact && characterMove.grounded && Math.abs(groundDistance) <= PLAYER.groundSnapDistance;
  const landed = terrainContact || terrainSnapContact || rapierContact || belowTerrainFloor;

  if (landed) {
    const falling = wasAirborne.current ? Math.abs(velocity.current.y) : 0;
    const intentionalPlayerJump = wasAirborne.current && jumpState.current.fromPlayerJump;
    const landedJumpWasRunning = jumpState.current.wasRunning;
    const landedJumpCharge = jumpState.current.chargeAmount || 0;
    const standingPlayerJump = intentionalPlayerJump && !landedJumpWasRunning;
    const landedJumpTravelDistance = wasAirborne.current
      ? Math.hypot(
        group.current.position.x - (Number.isFinite(jumpState.current.launchX) ? jumpState.current.launchX : group.current.position.x),
        group.current.position.z - (Number.isFinite(jumpState.current.launchZ) ? jumpState.current.launchZ : group.current.position.z),
      )
      : 0;
    const landedAirTime = wasAirborne.current && jumpState.current.launchedAt > 0
      ? now - jumpState.current.launchedAt
      : 0;
    const ordinaryStandingJumpLanding = standingPlayerJump && falling < 9.5;

    if (groundDistance <= PLAYER.groundSnapDistance || belowTerrainFloor) {
      group.current.position.y = nextGroundY;
      characterController.sync(group.current.position);
    }
    velocity.current.y = 0;
    if (wasAirborne.current) {
      jumpState.current = {
        phase: 'grounded',
        takeoffUntil: 0,
        wasRunning: false,
        fromPlayerJump: false,
        chargeAmount: 0,
        launchedAt: -10,
        launchY: group.current.position.y,
        launchX: group.current.position.x,
        launchZ: group.current.position.z,
      };
      stateRef.current.jumpPhase = 'landing';
    }

    const landingSpeed = Math.hypot(velocity.current.x, velocity.current.z);
    if (wasAirborne.current && (falling > 0.35 || intentionalPlayerJump)) {
      const landingBiome = terrainBiomeAt(group.current.position.x, group.current.position.z, group.current.position.y, currentZoneId);
      const landingArcade = arcadeLandingMomentum({
        state: arcadeLocomotion.current,
        velocity: velocity.current,
        facing: facing.current,
        falling,
        landingSpeed,
        downhillDot: terrainFeedback.current.downhillDot,
        slopeGrade: terrainFeedback.current.grade,
        biome: landingBiome,
      });
      const dustIntensity = THREE.MathUtils.clamp(
        0.44 + falling / 12 + landingSpeed / 11 + landedJumpTravelDistance / 13 + landedJumpCharge * 0.18 + landingArcade.dustBonus,
        0.48,
        0.95,
      );
      if (group.current.position.y < WATER_LEVEL + 0.02) {
        const splashPosition = { x: group.current.position.x, y: WATER_LEVEL, z: group.current.position.z };
        emitPropEvent('water-ripple', {
          position: splashPosition,
          intensity: Math.min(1, dustIntensity + 0.12),
        });
        emitPropEvent('water-splash', {
          position: splashPosition,
          intensity: Math.min(1, dustIntensity + 0.2),
        });
      } else {
        const landingDirection = frameScratch.launchDirection.set(velocity.current.x, 0, velocity.current.z);
        if (landingDirection.lengthSq() > 0.001) landingDirection.normalize();
        else landingDirection.copy(facing.current);
        landingDustTriggerRef.current?.({
          kind: intentionalPlayerJump ? 'landing-jump' : 'landing',
          intensity: dustIntensity,
          biome: landingBiome,
          direction: { x: landingDirection.x, y: 0, z: landingDirection.z },
          fallSpeed: falling,
          horizontalSpeed: landingSpeed,
          travelDistance: landedJumpTravelDistance,
          airTime: landedAirTime,
          charge: landedJumpCharge,
          radiusScale: THREE.MathUtils.clamp(0.92 + landedJumpTravelDistance / 16 + landedJumpCharge * 0.16, 0.9, 1.42),
        });
      }
      if (falling > 7.2) {
        cameraImpulse.current = {
          startedAt: now,
          intensity: THREE.MathUtils.clamp(falling / 26 + landingSpeed / 30, 0.18, 0.68),
          duration: 0.34,
          seed: cameraImpulse.current.seed + 1,
        };
      }
    }

    if (intentionalPlayerJump && falling > 19.5 && !stateRef.current.action) {
      startAction('shoulderHitAndFall', ACTION_DURATION.shoulderHitAndFall, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
    } else if (intentionalPlayerJump && falling > 16.5 && !stateRef.current.action) {
      startAction('hardLanding', ACTION_DURATION.hardLanding, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
    } else if (falling > 13.5 && !stateRef.current.action) {
      startAction('shoulderHitAndFall', ACTION_DURATION.shoulderHitAndFall, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
    } else if (falling > 9.5 && landingSpeed > 3.6 && !stateRef.current.action) {
      const rollDirection = frameScratch.landingRollDirection.set(velocity.current.x, 0, velocity.current.z);
      if (rollDirection.lengthSq() < 0.0001) rollDirection.copy(facing.current);
      rollDirection.setY(0).normalize();
      const rollDuration = durationFor('fallingToRoll');
      startAction('fallingToRoll', rollDuration, { lockMovement: 0.5 });
      stateRef.current.rollMotion = {
        start: group.current.position.clone(),
        direction: rollDirection.clone(),
        distance: THREE.MathUtils.clamp(landingSpeed * 0.34, 1.25, 2.65),
        duration: Math.min(rollDuration, 1.05),
        startedAt: now,
        targetYaw: Math.atan2(rollDirection.x, rollDirection.z),
        exitSpeed: Math.min(landingSpeed * 0.62, PLAYER.runSpeed * 0.78),
      };
    } else if (falling > 9.5 && !stateRef.current.action) {
      startAction('hardLanding', ACTION_DURATION.hardLanding, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
    } else if (!intentionalPlayerJump && falling > 6.8 && !stateRef.current.action) {
      startAction('bigJumpDown', durationFor('bigJumpDown'), { lockMovement: 0.38 });
    } else if (!intentionalPlayerJump && falling > 3.8 && !stateRef.current.action) {
      startAction('jumpDown', durationFor('jumpDown'), { lockMovement: 0.28 });
    } else if (!ordinaryStandingJumpLanding && falling > 2.4 && landingSpeed > PLAYER.walkSpeed * 1.1 && !stateRef.current.action) {
      startAction('runningLanding', ACTION_DURATION.runningLanding, { lockMovement: false });
    } else if (!ordinaryStandingJumpLanding && falling > 2.4 && !stateRef.current.action) {
      startAction('landing', ACTION_DURATION.landing, { lockMovement: false });
    }
    if (moving || running || falling > 0.5) {
      queueMovementCost({ running, walking: moving && !running, airborne: false, falling, flush: falling > 0.5 }, delta, now);
    }
  } else if (moving || !grounded) {
    if (jumpState.current.phase === 'takeoff' && now >= jumpState.current.takeoffUntil) {
      jumpState.current.phase = 'airborne';
      stateRef.current.jumpPhase = 'airborne';
    }
    if (jumpState.current.phase !== 'takeoff' && velocity.current.y < -1.2 && groundDistance < 1.35) {
      stateRef.current.jumpPhase = 'prelanding';
    } else if (jumpState.current.phase !== 'takeoff') {
      stateRef.current.jumpPhase = 'airborne';
    }
    queueMovementCost({ running, walking: moving && !running, airborne: !grounded, falling: 0 }, delta, now);
  }

  wasAirborne.current = (
    !landed
    && (jumpState.current.phase === 'takeoff' || velocity.current.y > 0 || (!grounded && !characterMove.grounded))
  );

  return { landed };
}
