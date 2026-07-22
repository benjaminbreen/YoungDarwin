import * as THREE from 'three';
import { emitPropEvent } from '../../physics/props/propEvents';
import { terrainBiomeAt } from '../../world/terrain';
import { WATER_LEVEL } from '../../world/water';
import { ACTION_DURATION, PLAYER, SWIM } from './playerConfig';
import { arcadeLandingMomentum } from './arcadeLocomotion';
import { triggerHitstop } from '../../world/worldTime';

const WATER_JUMP_PREDICT_SECONDS = 2.35;
const WATER_JUMP_PREDICT_STEP = 0.08;
const WATER_JUMP_RECHECK_SECONDS = 0.22;

function predictJumpWaterEntry({ position, velocity, collisionAdapter, frameScratch }) {
  const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
  if (horizontalSpeed < PLAYER.walkSpeed * 0.25) return null;

  const probe = frameScratch.jumpWaterProbe || new THREE.Vector3();
  frameScratch.jumpWaterProbe = probe;
  const gravity = PLAYER.gravity * 1.12;
  for (let t = WATER_JUMP_PREDICT_STEP; t <= WATER_JUMP_PREDICT_SECONDS; t += WATER_JUMP_PREDICT_STEP) {
    const x = position.x + velocity.x * t;
    const z = position.z + velocity.z * t;
    const y = position.y + velocity.y * t - 0.5 * gravity * t * t;
    probe.set(x, y, z);
    const ground = collisionAdapter.groundInfo(probe, { ignoreObstacles: true });
    const waterDepth = WATER_LEVEL - ground.y;
    if (waterDepth < SWIM.enterDepth && y <= ground.y + PLAYER.groundContactEpsilon + 0.08) {
      return null;
    }
    if (waterDepth >= SWIM.enterDepth && y <= WATER_LEVEL - 0.08) {
      return 'dive';
    }
  }
  return null;
}

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
  jumpInputAllowed = true,
  delta,
  now,
}) {
  const jumpHeld = jumpInputAllowed && Boolean(keys.jump || touch.jump);
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
    const waterEntryIntent = predictJumpWaterEntry({
      position: group.current.position,
      velocity: velocity.current,
      collisionAdapter,
      frameScratch,
    });
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
      waterEntryIntent,
      launchedAt: now,
      launchY: group.current.position.y,
      launchX: group.current.position.x,
      launchZ: group.current.position.z,
    };
    stateRef.current.jumpCharging = false;
    stateRef.current.jumpPhase = 'takeoff';
    stateRef.current.jumpWasRunning = launchRunning;
    stateRef.current.jumpChargeAmount = charge;
    // Feeds the takeoff stretch in playerFrameFeedback.
    stateRef.current.impactTakeoffAt = now;
    stateRef.current.impactStretch = THREE.MathUtils.clamp(
      0.55 + charge * 0.45 + Math.hypot(velocity.current.x, velocity.current.z) / 9,
      0.55,
      1,
    );
    stateRef.current.jumpWaterEntryIntent = waterEntryIntent;
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

  if (
    jumpState.current.fromPlayerJump
    && wasAirborne.current
    && !swimState.current.active
    && now - jumpState.current.launchedAt <= WATER_JUMP_RECHECK_SECONDS
  ) {
    const waterEntryIntent = predictJumpWaterEntry({
      position: group.current.position,
      velocity: velocity.current,
      collisionAdapter,
      frameScratch,
    });
    jumpState.current.waterEntryIntent = waterEntryIntent;
    stateRef.current.jumpWaterEntryIntent = waterEntryIntent;
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
  collisionAdapter,
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
        waterEntryIntent: null,
        launchedAt: -10,
        launchY: group.current.position.y,
        launchX: group.current.position.x,
        launchZ: group.current.position.z,
      };
      stateRef.current.jumpPhase = 'landing';
      stateRef.current.jumpWaterEntryIntent = null;
    }

    const landingSpeed = Math.hypot(velocity.current.x, velocity.current.z);
    if (wasAirborne.current && (falling > 0.35 || intentionalPlayerJump)) {
      const landingBiome = terrainBiomeAt(group.current.position.x, group.current.position.z, group.current.position.y, currentZoneId);
      const supportContact = characterMove.collisionDetails?.find(contact => (contact.normal?.y || 0) > 0.45);
      const supportTarget = supportContact?.userData || supportContact?.rigidBody?.userData || null;
      const authoredSupport = collisionAdapter?.groundInfo?.(group.current.position);
      const landingTarget = supportTarget || authoredSupport?.obstacle || null;
      const supportWitness = supportContact?.witness1;
      const interactiveSupport = Boolean(
        supportTarget?.id
        && !/terrain|ground|world/.test(String(supportTarget.kind || '').toLowerCase()),
      );
      const witnessMatchesSupport = supportWitness && (
        interactiveSupport
        || !authoredSupport?.obstacle
        || Math.abs(supportWitness.y - authoredSupport.y) < 0.45
      );
      const landingPoint = witnessMatchesSupport ? supportWitness : {
        x: group.current.position.x,
        y: authoredSupport?.y ?? group.current.position.y,
        z: group.current.position.z,
      };
      if (supportTarget?.id && String(supportTarget.kind || '').startsWith('physics-')) {
        const loadDirection = landingSpeed > 0.05
          ? { x: velocity.current.x / landingSpeed, y: 0, z: velocity.current.z / landingSpeed }
          : { x: facing.current.x, y: 0, z: facing.current.z };
        emitPropEvent('player-physics-prop-contact', {
          propId: supportTarget.id,
          contactKind: 'landing',
          position: { x: landingPoint.x, y: landingPoint.y, z: landingPoint.z },
          direction: loadDirection,
          impactSpeed: landingSpeed,
          verticalSpeed: falling,
          delta,
          now,
        });
      }
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
        0.44
          + falling / 12
          + landingSpeed / 11
          + landedJumpTravelDistance / 13
          + landedJumpCharge * 0.18
          + landingArcade.dustBonus
          + (landedJumpWasRunning ? 0.3 + Math.min(0.18, landingSpeed / 30) : 0),
        0.48,
        landedJumpWasRunning ? 1.18 : 0.95,
      );
      if (group.current.position.y < WATER_LEVEL + 0.02) {
        const splashPosition = { x: group.current.position.x, y: WATER_LEVEL, z: group.current.position.z };
        const entryDirection = frameScratch.launchDirection.set(velocity.current.x, 0, velocity.current.z);
        if (entryDirection.lengthSq() > 0.001) entryDirection.normalize();
        else entryDirection.copy(facing.current);
        emitPropEvent('water-ripple', {
          position: splashPosition,
          intensity: Math.min(1, dustIntensity + 0.12),
          direction: { x: entryDirection.x, y: 0, z: entryDirection.z },
        });
        // Plunge entries are allowed past 1.0: the splash system scales droplet
        // count and launch energy with intensity, so dives read bigger than
        // any wading step ever can.
        emitPropEvent('water-splash', {
          position: splashPosition,
          intensity: Math.min(1.35, dustIntensity + 0.45),
          direction: { x: entryDirection.x, y: 0, z: entryDirection.z },
        });
      } else {
        const landingDirection = frameScratch.launchDirection.set(velocity.current.x, 0, velocity.current.z);
        if (landingDirection.lengthSq() > 0.001) landingDirection.normalize();
        else landingDirection.copy(facing.current);
        landingDustTriggerRef.current?.({
          kind: intentionalPlayerJump ? 'landing-jump' : 'landing',
          intensity: dustIntensity,
          worldPosition: { x: landingPoint.x, y: landingPoint.y, z: landingPoint.z },
          biome: landingBiome,
          direction: { x: landingDirection.x, y: 0, z: landingDirection.z },
          normal: supportContact?.normal
            ? { x: supportContact.normal.x, y: supportContact.normal.y, z: supportContact.normal.z }
            : { x: 0, y: 1, z: 0 },
          target: landingTarget,
          fallSpeed: falling,
          horizontalSpeed: landingSpeed,
          travelDistance: landedJumpTravelDistance,
          airTime: landedAirTime,
          charge: landedJumpCharge,
          runningJump: intentionalPlayerJump && landedJumpWasRunning,
          radiusScale: THREE.MathUtils.clamp(
            (0.92 + landedJumpTravelDistance / 16 + landedJumpCharge * 0.16) * (landedJumpWasRunning ? 1.26 : 1),
            0.9,
            landedJumpWasRunning ? 1.72 : 1.42,
          ),
        });
      }
      // Tiered landing impact: small hops whisper, big drops thump. The
      // squash in playerFrameFeedback reads impactLandedAt/impactIntensity.
      stateRef.current.impactLandedAt = now;
      stateRef.current.impactIntensity = THREE.MathUtils.clamp(
        (falling - 1.2) / 9 + landedJumpCharge * 0.14,
        intentionalPlayerJump ? 0.22 : 0,
        1,
      );
      if (falling > 3.2) {
        cameraImpulse.current = {
          startedAt: now,
          intensity: THREE.MathUtils.clamp((falling - 2.2) / 20 + landingSpeed / 34, 0.07, 0.68),
          duration: 0.3,
          seed: cameraImpulse.current.seed + 1,
        };
      }
      // A beat of world freeze on genuinely big drops (player/camera run on
      // real time, so this reads as weight, not lag).
      if (falling > 8.5) triggerHitstop(0.06);
    }

    // A hard fall knocks the wind out: bump run effort so the recovery idle
    // reads winded (heavy breathing) once Darwin is back on his feet.
    if (falling > 8) {
      stateRef.current.runEffort = Math.max(stateRef.current.runEffort || 0, 7);
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
    // Walking off an obstacle: the character controller snap-follows steep
    // obstacle faces, so the descent often never registers as airborne and the
    // fall-speed thresholds above never fire. Track fast grounded descent by
    // accumulated height and play a landing when it bottoms out.
    const groundedY = group.current.position.y;
    let descent = stateRef.current.groundedDescent;
    if (!descent) {
      descent = { lastY: groundedY, drop: 0 };
      stateRef.current.groundedDescent = descent;
    }
    if (wasAirborne.current || stateRef.current.action || stateRef.current.swimming) {
      descent.drop = 0;
    } else {
      const descentDy = descent.lastY - groundedY;
      const descentRate = delta > 0 ? descentDy / delta : 0;
      const steepDescent = descentRate > 3
        && (terrainFeedback.current.groundSource === 'authored-obstacle' || descentRate > 5);
      if (steepDescent) {
        descent.drop += descentDy;
        descent.calmFor = 0;
      } else if ((descent.calmFor = (descent.calmFor || 0) + delta) > 0.12) {
        // Only settle after a short calm window so one flat frame mid-descent
        // doesn't split the drop into two sub-threshold pieces.
        if (descent.drop > 0.55) {
          const offLandingSpeed = Math.hypot(velocity.current.x, velocity.current.z);
          // Feed the landing squash so the settle reads in the silhouette,
          // not just as a clip swap.
          stateRef.current.impactLandedAt = now;
          stateRef.current.impactIntensity = THREE.MathUtils.clamp(0.12 + descent.drop * 0.16, 0.2, 0.62);
          // Waist-height step-offs keep the walk/run gait — squash, lean, and
          // dust sell the drop without a clip hijacking movement. Only
          // genuinely tall step-offs earn a landing animation.
          if (descent.drop > 2.3) {
            startAction('jumpDown', durationFor('jumpDown'), { lockMovement: 0.24 });
          } else if (descent.drop > 1.55 && offLandingSpeed > PLAYER.walkSpeed * 1.1) {
            startAction('runningLanding', ACTION_DURATION.runningLanding, { lockMovement: false });
          } else if (descent.drop > 1.55) {
            startAction('landing', ACTION_DURATION.landing, { lockMovement: false });
          }
          landingDustTriggerRef.current?.({
            kind: 'landing',
            intensity: THREE.MathUtils.clamp(0.3 + descent.drop * 0.16, 0.3, 0.7),
            biome: terrainBiomeAt(group.current.position.x, group.current.position.z, group.current.position.y, currentZoneId),
            fallSpeed: descentRate,
            horizontalSpeed: offLandingSpeed,
          });
        }
        descent.drop = 0;
      }
    }
    descent.lastY = groundedY;
    // Walking up a tall walk-over rock never leaves the ground — the support
    // surface ramps the character up, so the climb clips have nothing to
    // trigger on. Track fast grounded ascent on obstacle support and overlay
    // a short scamper once the rise adds up to more than a walk cycle can
    // sell. Overlay only: locomotion and the support ramp keep moving Darwin.
    let ascent = stateRef.current.groundedAscent;
    if (!ascent) {
      ascent = { lastY: groundedY, rise: 0, calmFor: 0, lastScamperAt: -10 };
      stateRef.current.groundedAscent = ascent;
    }
    if (wasAirborne.current || stateRef.current.action || stateRef.current.swimming) {
      ascent.rise = 0;
    } else {
      const ascentDy = groundedY - ascent.lastY;
      const ascentRate = delta > 0 ? ascentDy / delta : 0;
      const steepAscent = ascentRate > 2.4 && terrainFeedback.current.groundSource === 'authored-obstacle';
      if (steepAscent) {
        ascent.rise += ascentDy;
        ascent.calmFor = 0;
      } else if ((ascent.calmFor = (ascent.calmFor || 0) + delta) > 0.14) {
        ascent.rise = 0;
      }
      if (ascent.rise > 0.85
        && Math.hypot(velocity.current.x, velocity.current.z) > 0.8
        && now - ascent.lastScamperAt > 1.1
        && !stateRef.current.action) {
        ascent.lastScamperAt = now;
        const scamperDuration = THREE.MathUtils.clamp(0.5 + ascent.rise * 0.15, 0.55, 0.8);
        ascent.rise = 0;
        startAction('climbWaistHeight', scamperDuration, { lockMovement: false });
        cameraImpulse.current = {
          startedAt: now,
          intensity: 0.09,
          duration: 0.18,
          seed: cameraImpulse.current.seed + 1,
        };
      }
    }
    ascent.lastY = groundedY;
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
