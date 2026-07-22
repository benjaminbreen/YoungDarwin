import * as THREE from 'three';
import { updateRuntimePlayerPose } from '../../store';
import { emitPropEvent } from '../../physics/props/propEvents';
import { WATER_LEVEL, WADE_DEPTH } from '../../world/water';
import { EMPTY_KEYS, IDLE_BEHAVIOR, PLAYER, SPRINT, SWIM } from './playerConfig';
import { playerControllerDebugEnabled } from './playerUtils';

const VISUAL_RUN_HOLD = 0.22;

function updateVisualLocomotionPhase(visual, {
  now,
  moving,
  physicalRunning,
  speed,
  action,
  actionUntil,
  disabled,
  playerConfig = PLAYER,
}) {
  if (disabled) {
    visual.phase = 'idle';
    visual.running = false;
    visual.walking = false;
    return visual;
  }

  if (action === 'runToStop') {
    visual.phase = 'runStop';
    visual.running = false;
    visual.walking = false;
    visual.stopUntil = Math.max(visual.stopUntil || 0, actionUntil || now);
    return visual;
  }
  if (action === 'runningTurn180' || action === 'runningTurnLeft' || action === 'runningTurnRight') {
    visual.phase = 'run';
    visual.running = true;
    visual.walking = false;
    visual.lastRunAt = now;
    return visual;
  }
  if (action === 'startWalking') {
    visual.phase = 'startWalk';
    visual.running = false;
    visual.walking = true;
    return visual;
  }
  if (action === 'startRunning') {
    visual.phase = 'startRun';
    visual.running = true;
    visual.walking = false;
    visual.lastRunAt = now;
    return visual;
  }
  if (action === 'stopWalking') {
    visual.phase = 'walkStop';
    visual.running = false;
    visual.walking = false;
    return visual;
  }

  if (physicalRunning) {
    visual.phase = 'run';
    visual.running = true;
    visual.walking = false;
    visual.lastRunAt = now;
    return visual;
  }

  const keepRun = visual.phase === 'run'
    && moving
    && speed > playerConfig.walkSpeed * 0.95
    && now - (visual.lastRunAt || -Infinity) <= VISUAL_RUN_HOLD;
  if (keepRun) {
    visual.running = true;
    visual.walking = false;
    return visual;
  }

  if (moving && speed > 0.55) {
    visual.phase = 'walk';
    visual.running = false;
    visual.walking = true;
    return visual;
  }

  visual.phase = 'idle';
  visual.running = false;
  visual.walking = false;
  return visual;
}

export function finalizePlayerFrame({
  group,
  updateCamera,
  collisionAdapter,
  facing,
  wasAirborne,
  velocity,
  stateRef,
  terrainFeedback,
  visualLocomotion,
  jumpCharge,
  swimState,
  wadeDepth,
  waterlineRef,
  footstepEffects,
  lastPublishedPose,
  lastPosePublishAt,
  previousMotion,
  cameraImpulse,
  playerConfig = PLAYER,
  swimConfig = SWIM,
  cameraProfile = null,
  setPlayerPose,
  applyMovementCost,
  applyDrowningDamage,
  drownDamage,
  swimFatigue,
  currentZoneId,
  viewMode,
  openingCamera = null,
  finchDroppingCamera = null,
  cameraDelta = delta,
  health,
  fatigue,
  now,
  delta,
  moving = false,
  running = false,
  crouchRunIntent = false,
  keys = EMPTY_KEYS,
  touch = EMPTY_KEYS,
  arcade = null,
  groundDistance = null,
  tiredRun = false,
  runInPlace = false,
  skipFootsteps = false,
  skipSwimEconomy = false,
}) {
  const p = group.current?.position;
  if (!p) return;
  const currentYaw = Number(group.current?.rotation?.y) || 0;
  const previousYaw = Number.isFinite(previousMotion.current.yaw) ? previousMotion.current.yaw : currentYaw;
  const yawDelta = Math.atan2(Math.sin(currentYaw - previousYaw), Math.cos(currentYaw - previousYaw));
  const turnRate = delta > 0 ? yawDelta / delta : 0;
  const horizontalSpeed = Math.hypot(velocity.current.x, velocity.current.z);
  const locomotionSpeed = runInPlace
    ? Math.max(horizontalSpeed, playerConfig.runSpeed * 0.86)
    : horizontalSpeed;
  const sprintingSwim = swimState.current.active && running && horizontalSpeed > swimConfig.speed * 1.05;
  const resolvedGroundDistance = Number.isFinite(groundDistance)
    ? groundDistance
    : p.y - collisionAdapter.groundInfo(p).y;

  updateCamera({
    playerPosition: p,
    facing: facing.current,
    collisionAdapter,
    wasAirborne: wasAirborne.current,
    cameraImpulse: cameraImpulse.current,
    viewMode,
    openingCamera,
    finchDroppingCamera,
    swimming: swimState.current.active,
    wadeDepth: Math.max(0, WATER_LEVEL - p.y),
    flying: Boolean(stateRef.current.flying),
    flightSpeedT: stateRef.current.flightSpeedT || 0,
    sprintT: stateRef.current.sprinting
      ? THREE.MathUtils.clamp(horizontalSpeed / (playerConfig.runSpeed * SPRINT.speedScale), 0, 1)
      : 0,
    // Signed skid for the camera roll: lean the frame into hard turns.
    skidRoll: (arcade?.skid || 0) * (Math.sign(turnRate) || 0),
    // Ground-speed fraction driving the hero view's auto-follow strength.
    moveSpeedT: THREE.MathUtils.clamp(horizontalSpeed / playerConfig.runSpeed, 0, 1),
    cameraProfile,
    now,
    delta: cameraDelta,
  });

  stateRef.current.speed = horizontalSpeed;
  stateRef.current.animationSpeed = locomotionSpeed;
  stateRef.current.travelRunInPlace = runInPlace;
  stateRef.current.turnRate = turnRate;
  stateRef.current.turnDirection = Math.sign(turnRate);
  stateRef.current.slopeGrade = terrainFeedback.current.grade;
  stateRef.current.uphillDot = terrainFeedback.current.uphillDot;
  stateRef.current.arcadeSkid = arcade?.skid || 0;
  stateRef.current.arcadeScramble = arcade?.scramble || 0;
  stateRef.current.stanceSpread = terrainFeedback.current.stanceSpread;
  stateRef.current.groundSource = terrainFeedback.current.groundSource;
  stateRef.current.groundPitch = terrainFeedback.current.grade * terrainFeedback.current.uphillDot;
  const facingDot = (horizontalSpeed > 0.2 && facing.current.lengthSq() > 0.001)
    ? (velocity.current.x * facing.current.x + velocity.current.z * facing.current.z) / horizontalSpeed
    : 1;
  stateRef.current.movingBackward = facingDot < -0.5;
  stateRef.current.groundDistance = resolvedGroundDistance;
  stateRef.current.verticalSpeed = velocity.current.y;
  stateRef.current.tiredRun = tiredRun;
  const physicalRunning = runInPlace || (running && (
    horizontalSpeed > playerConfig.walkSpeed * 0.92
    || (stateRef.current.running && horizontalSpeed > playerConfig.walkSpeed * 0.66)
  ));
  const visual = updateVisualLocomotionPhase(visualLocomotion.current, {
    now,
    moving: moving || runInPlace,
    physicalRunning,
    speed: locomotionSpeed,
    action: stateRef.current.action,
    actionUntil: stateRef.current.actionUntil,
    playerConfig,
    disabled: Boolean(
      wasAirborne.current
      || swimState.current.active
      || stateRef.current.crouching
      || stateRef.current.aiming
      || jumpCharge.current.active
      || stateRef.current.climbMotion
      || stateRef.current.traverseMotion
      || stateRef.current.rollMotion
    ),
  });
  stateRef.current.running = visual.running;
  stateRef.current.walking = !runInPlace
    && horizontalSpeed > 0.55
    && !stateRef.current.running
    && (visual.walking || moving);
  stateRef.current.locomotionPhase = visual.phase;
  stateRef.current.locomotionVisualRunning = visual.running;
  stateRef.current.crouchRunning = stateRef.current.crouching && crouchRunIntent && horizontalSpeed > playerConfig.walkSpeed * 0.5;
  stateRef.current.airborne = wasAirborne.current;
  stateRef.current.swimming = swimState.current.active;
  stateRef.current.swimSprinting = sprintingSwim;

  // Sprint spool-up: sustained near-max running upgrades run into the sprint
  // tier (gait + FOV + small speed lift). A running jump keeps the spool alive
  // so a sprint-jump-sprint chain never drops out of the tier mid-air.
  const sprintEffort = (
    visual.running
    && horizontalSpeed > playerConfig.runSpeed * SPRINT.minSpeedRatio
    && !tiredRun
    && !stateRef.current.crouching
    && !stateRef.current.aiming
    && !swimState.current.active
  ) || (wasAirborne.current && stateRef.current.jumpWasRunning && (stateRef.current.runHeldFor || 0) > 0);
  stateRef.current.runHeldFor = sprintEffort
    ? (stateRef.current.runHeldFor || 0) + delta
    : Math.max(0, (stateRef.current.runHeldFor || 0) - delta * 3);
  stateRef.current.sprinting = sprintEffort && stateRef.current.runHeldFor >= SPRINT.spoolTime;

  // Run effort accumulates while running and drains at rest; coming to a stop
  // with a big effort balance leaves Darwin winded (heavy-breathing idle +
  // boosted breathing layer) until it drains back down.
  const previousEffort = stateRef.current.runEffort || 0;
  stateRef.current.runEffort = ((visual.running && !runInPlace) || sprintingSwim)
    ? Math.min(previousEffort + delta * (stateRef.current.sprinting ? 1.35 : 1), 14)
    : Math.max(0, previousEffort - delta * (moving ? 0.55 : 1.35));
  const restingNow = !moving
    && !runInPlace
    && !stateRef.current.airborne
    && !swimState.current.active
    && horizontalSpeed < 0.5;
  const wasWinded = Boolean(stateRef.current.winded);
  if (restingNow && !stateRef.current.winded
    && stateRef.current.runEffort > (fatigue >= 50 ? IDLE_BEHAVIOR.windedEffortFatigued : IDLE_BEHAVIOR.windedEffort)) {
    stateRef.current.winded = true;
  }
  if (stateRef.current.winded && (moving || stateRef.current.runEffort < IDLE_BEHAVIOR.windedRecover)) {
    stateRef.current.winded = false;
  }
  if (wasWinded !== Boolean(stateRef.current.winded)) {
    emitPropEvent('player-winded', {
      active: Boolean(stateRef.current.winded),
      effort: stateRef.current.runEffort,
      fatigue,
    });
  }
  wadeDepth.current = stateRef.current.airborne ? 0 : Math.max(0, WATER_LEVEL - p.y);
  stateRef.current.wadeDepth = wadeDepth.current;

  if (waterlineRef.current) {
    const wet = THREE.MathUtils.clamp(wadeDepth.current / 0.85, 0, 1);
    waterlineRef.current.visible = wet > 0.025;
    waterlineRef.current.position.y = WATER_LEVEL - group.current.position.y + 0.018;
    waterlineRef.current.scale.setScalar(0.8 + wet * 0.18 + THREE.MathUtils.clamp(horizontalSpeed / playerConfig.walkSpeed, 0, 1) * 0.08);
    waterlineRef.current.rotation.z += delta * (0.12 + horizontalSpeed * 0.035);
    waterlineRef.current.material.opacity = wet > 0.025 ? (0.08 + wet * 0.08) : 0;
  }

  if (!skipSwimEconomy) {
    if (swimState.current.active && health > 0) {
      swimFatigue.current += delta * (sprintingSwim ? swimConfig.sprintFatiguePerSecond : swimConfig.fatiguePerSecond);
      if (swimFatigue.current >= 1.2) {
        applyMovementCost({ fatigueDelta: swimFatigue.current });
        swimFatigue.current = 0;
      }
      if (fatigue >= swimConfig.exhaustedFatigue) {
        drownDamage.current += delta * 7;
        if (drownDamage.current >= 4) {
          applyDrowningDamage(drownDamage.current);
          drownDamage.current = 0;
        }
      } else {
        drownDamage.current = 0;
      }
    } else if (wadeDepth.current > WADE_DEPTH && health > 0) {
      drownDamage.current += delta * 9;
      if (drownDamage.current >= 4) {
        applyDrowningDamage(drownDamage.current);
        drownDamage.current = 0;
      }
    } else {
      drownDamage.current = 0;
      swimFatigue.current = 0;
    }
  }

  if (!skipFootsteps) {
    footstepEffects.update({
      delta,
      position: p,
      facing: facing.current,
      zoneId: currentZoneId,
      moving: moving && !runInPlace,
      horizontalSpeed,
      running: stateRef.current.running,
      airborne: stateRef.current.airborne,
      jumpCharging: jumpCharge.current.active,
      wadeDepth: wadeDepth.current,
    });
  }

  if (!stateRef.current.airborne && !stateRef.current.action && !jumpCharge.current.active) {
    stateRef.current.jumpPhase = 'grounded';
    stateRef.current.jumpChargeAmount = 0;
    stateRef.current.jumpCharging = false;
  }
  stateRef.current.strafeLeft = Boolean((keys.left || touch.left) && !(keys.forward || keys.backward || touch.forward || touch.backward));
  stateRef.current.strafeRight = Boolean((keys.right || touch.right) && !(keys.forward || keys.backward || touch.forward || touch.backward));
  if (stateRef.current.aiming) {
    const aimSpeed = Math.hypot(velocity.current.x, velocity.current.z);
    const fx = facing.current.x;
    const fz = facing.current.z;
    if (aimSpeed > 0.35 && (fx * fx + fz * fz) > 0.001) {
      const fwd = (velocity.current.x * fx + velocity.current.z * fz) / aimSpeed;
      const rgt = (velocity.current.x * -fz + velocity.current.z * fx) / aimSpeed;
      const lateral = Math.abs(rgt) >= Math.abs(fwd);
      stateRef.current.movingBackward = !lateral && fwd < -0.35;
      stateRef.current.strafeLeft = lateral && rgt < -0.5;
      stateRef.current.strafeRight = lateral && rgt > 0.5;
    } else {
      stateRef.current.movingBackward = false;
      stateRef.current.strafeLeft = false;
      stateRef.current.strafeRight = false;
    }
  }

  const nextPose = {
    position: { x: p.x, y: p.y, z: p.z },
    facing: { x: facing.current.x, y: facing.current.y, z: facing.current.z },
  };
  updateRuntimePlayerPose(nextPose);
  const publishedPose = lastPublishedPose.current;
  const positionChanged = Math.abs(publishedPose.x - p.x) > 0.08
    || Math.abs(publishedPose.y - p.y) > 0.08
    || Math.abs(publishedPose.z - p.z) > 0.08;
  const facingChanged = Math.abs(publishedPose.fx - facing.current.x) > 0.015
    || Math.abs(publishedPose.fy - facing.current.y) > 0.015
    || Math.abs(publishedPose.fz - facing.current.z) > 0.015;
  const posePublishDue = now - lastPosePublishAt.current >= 1 / 15;
  if ((positionChanged || facingChanged) && posePublishDue) {
    publishedPose.x = p.x;
    publishedPose.y = p.y;
    publishedPose.z = p.z;
    publishedPose.fx = facing.current.x;
    publishedPose.fy = facing.current.y;
    publishedPose.fz = facing.current.z;
    lastPosePublishAt.current = now;
    setPlayerPose(nextPose);
  }
  if (playerControllerDebugEnabled()) {
    window.__darwinControllerDebug = {
      airborne: stateRef.current.airborne,
      playableModeId: stateRef.current.playableModeId,
      flying: Boolean(stateRef.current.flying),
      action: stateRef.current.action,
      bracing: Boolean(stateRef.current.bracing),
      braceIntensity: stateRef.current.braceIntensity || 0,
      locomotionPhase: stateRef.current.locomotionPhase,
      jumpPhase: stateRef.current.jumpPhase,
      jumpCharging: stateRef.current.jumpCharging,
      groundDistance: resolvedGroundDistance,
      groundSource: terrainFeedback.current.groundSource,
      stanceSpread: terrainFeedback.current.stanceSpread,
      stancePitch: terrainFeedback.current.stancePitch,
      stanceRoll: terrainFeedback.current.stanceRoll,
      verticalSpeed: velocity.current.y,
      speed: horizontalSpeed,
    };
  }
  previousMotion.current.moving = moving || runInPlace;
  previousMotion.current.running = stateRef.current.running;
  previousMotion.current.yaw = currentYaw;
}
