// Species-agnostic secondary-animation runtime for hand-authored procedural
// reptiles. A species module builds a jointed group hierarchy (no skinning,
// no clips — the ProceduralTortoisePlayer technique) and hands the animator a
// node map; the animator poses it every frame from *observed* motion (speed,
// player position, weather), so the same rig works under the fauna AI, in an
// examine close-up, or carried in Darwin's hands.
//
// Node contract — all animated groups MUST be built with zero rotation at
// neutral pose (rest offsets baked into mesh transforms/geometry, which the
// animator never touches except `breathe`):
//   root         — group whose local y rides at `config.rootHeight`.
//   torso        — trunk group (legs + tail chain attach here); yaw carries
//                  the walking undulation, pitch carries push-up displays.
//   head         — group at the neck pivot, forward -z.
//   jaw          — optional lower-jaw group; rotation.x > 0 opens.
//   gular        — optional throat mesh; scale pulses with the gular pump.
//   tongue       — optional group scaled along z (0 hidden → 1 full flick).
//   eyeL/eyeR    — optional eyeball groups; posed with micro-saccades and a
//                  player-tracking lead ahead of the head turn.
//   lidL/lidR    — optional eyelid groups; rotation.x runs 0 (open) →
//                  `lidClosedAngle` (closed; sign sets wipe direction).
//   lidClosedAngle — number, radians for a fully closed lid.
//   legs         — [{ hip, knee, side (+1 right / -1 left), front, phase }]
//                  hip yaw swings the sprawled limb fore-aft, knee z lifts.
//   tailSegments — chained groups base→tip; yaw carries the travelling wave.
//   breathe      — mesh whose scale may pulse (the trunk mesh, no children).
//
// The `update` input is plain data so the runtime stays render-agnostic:
//   { dt, time, speed, playerLocal, playerDist, daylight, rain, downed, held }
// playerLocal is the player position in root-local space (or null when far).

const TAU = Math.PI * 2;

export const DEFAULT_REPTILE_GAIT = {
  rootHeight: 0.048,
  // --- locomotion -----------------------------------------------------------
  strideLength: 0.12, // meters per full gait cycle
  maxStrideHz: 7,
  sprintSpeed: 1.2, // observed m/s treated as a full flee sprint
  hipSwingAmp: 0.5,
  kneeLiftAmp: 0.42,
  hipLiftAmp: 0.14,
  undulationAmp: 0.14, // trunk yaw S-wave
  headStabilize: 0.75, // fraction of trunk yaw the head cancels
  tailSwingAmp: 0.22,
  tailLag: 0.85, // phase lag per tail segment (travelling wave)
  bobAmp: 0.0035,
  sprintCrouch: 0.006, // body drops this much at full sprint
  // --- breathing -------------------------------------------------------------
  breathRate: 1.15,
  breathAmp: 0.02,
  alertBreathRate: 2.1, // when the player is close or just after a flee
  // --- blinking ---------------------------------------------------------------
  blinkMin: 2.2,
  blinkMax: 6.5,
  blinkDuration: 0.11,
  doubleBlinkChance: 0.3,
  asyncBlinkChance: 0.08, // one eye trails the other — rare, charming
  asyncBlinkDelay: 0.07,
  // --- tongue flicks ----------------------------------------------------------
  tongueMin: 2.6,
  tongueMax: 8.5,
  tongueDuration: 0.2,
  tongueNearRange: 3.2, // player inside this range makes flicks more frequent
  tongueNearScale: 0.45,
  // --- eye saccades -------------------------------------------------------------
  saccadeMin: 0.8, // independent micro-darts of the eyes between blinks
  saccadeMax: 3.4,
  saccadeAmp: 0.16,
  saccadeDamp: 16, // snappy — saccades jump, they don't glide
  eyeLead: 0.55, // eyes reach the player this far ahead of the head turn
  // --- gular pump (throat breathing, faster than the body cycle) ---------------
  gularAmp: 0.09,
  gularRateScale: 2.3,
  // --- idle head scanning (slow lookout sweep while stationary) ------------------
  scanAmp: 0.1,
  scanRate: 0.42,
  // --- push-up territorial display --------------------------------------------
  pushup: {
    range: 4.8, // player must be watching from inside this
    minGap: 6,
    maxGap: 15,
    pumpsMin: 3,
    pumpsMax: 5,
    rate: 2.6, // pumps per second
    pitchAmp: 0.26, // forebody rise
    legAmp: 0.5, // front-knee extension
    jawGape: 0.2, // agape at the top of each pump
    lift: 0.008,
  },
  // --- freeze-and-cock (after a flee sprint stops dead) ------------------------
  cockDuration: 0.9,
  cockRoll: 0.3,
  cockChance: 0.85,
  // --- basking -----------------------------------------------------------------
  bask: {
    after: 6, // idle seconds before settling (baskers rest a lot)
    playerRange: 4.8, // only with the player at a comfortable distance
    minDaylight: 0.45,
    maxRain: 0.35,
    drop: 0.014, // belly settles toward the rock
    splay: 0.22, // limbs flatten outward
    lid: 0.45, // half-lidded doze
    breathScale: 0.55, // slower, deeper breaths
    blendRate: 1.1,
    tailCurl: 0.14, // tail sweeps into a lazy sideways curl
  },
  // --- head tracking -------------------------------------------------------------
  look: {
    range: 5.2,
    yawClamp: 0.7,
    pitchClamp: 0.32,
    damp: 6,
  },
  // --- idle tail life --------------------------------------------------------------
  tailIdleAmp: 0.05,
  tailIdleRate: 0.4,
  tailFlickMin: 7,
  tailFlickMax: 16,
  tailFlickDuration: 0.5,
  // Rest pose baked by the animator (the rig authors segments straight):
  // per-segment pitch droop in radians, plus a lazy sideways rest curl
  // (signed per-lizard by curlDir) so the tail never reads as a spike.
  tailRestPitch: null,
  tailRestCurl: 0,
};

function hashSeed(value) {
  let hash = 2166136261;
  const text = String(value || 'reptile');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function createReptileAnimator({ nodes, config: overrides = {}, seed = 'reptile' }) {
  const config = {
    ...DEFAULT_REPTILE_GAIT,
    ...overrides,
    pushup: { ...DEFAULT_REPTILE_GAIT.pushup, ...(overrides.pushup || {}) },
    bask: { ...DEFAULT_REPTILE_GAIT.bask, ...(overrides.bask || {}) },
    look: { ...DEFAULT_REPTILE_GAIT.look, ...(overrides.look || {}) },
  };
  let rngState = hashSeed(seed) || 1;
  const rng = () => {
    // xorshift32: cheap deterministic stream per lizard.
    rngState ^= rngState << 13; rngState >>>= 0;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5; rngState >>>= 0;
    return rngState / 4294967296;
  };
  const range = (min, max) => min + rng() * (max - min);

  const state = {
    stridePhase: rng() * TAU,
    move: 0, // 0 rest ↔ 1 walking blend
    speedSmooth: 0,
    breathPhase: rng() * TAU,
    breathRate: config.breathRate,
    // blink
    nextBlinkAt: range(0.5, 3),
    blinkT: -1, // active blink progress in seconds, -1 idle
    blinkAsync: 0, // extra delay applied to the right eye
    doublePending: false,
    // tongue
    nextTongueAt: range(1, 4),
    tongueT: -1,
    // eye saccades
    nextSaccadeAt: range(0.4, 2),
    saccadeYaw: 0,
    saccadePitch: 0,
    eyeYaw: 0,
    eyePitch: 0,
    // idle scanning + bask tail curl personality
    scanPhase: rng() * TAU,
    curlDir: rng() < 0.5 ? -1 : 1,
    // push-up
    nextPushupAt: range(2, config.pushup.maxGap),
    pushup: null, // { t, duration }
    // freeze-and-cock
    wasSprinting: false,
    cockT: -1,
    cockDir: 1,
    // bask
    idleTime: 0,
    baskBlend: 0,
    // look
    lookYaw: 0,
    lookPitch: 0,
    // tail
    nextTailFlickAt: range(3, 10),
    tailFlickT: -1,
    // downed slack
    slack: 0,
  };

  function scheduleBlink() {
    state.nextBlinkAt = range(config.blinkMin, config.blinkMax);
    state.doublePending = rng() < config.doubleBlinkChance;
    state.blinkAsync = rng() < config.asyncBlinkChance ? config.asyncBlinkDelay : 0;
  }

  function blinkAmountAt(t, extraDelay) {
    const local = t - extraDelay;
    if (local < 0 || local > config.blinkDuration) return 0;
    return Math.sin((local / config.blinkDuration) * Math.PI);
  }

  function update(input) {
    const dt = Math.min(input.dt || 0, 0.05);
    if (dt <= 0) return;
    const time = input.time || 0;
    const speed = Math.max(0, input.speed || 0);
    const playerDist = Number.isFinite(input.playerDist) ? input.playerDist : Infinity;
    const downed = Boolean(input.downed);
    const held = Boolean(input.held);

    // --- downed: everything drains into a slack carcass pose -----------------
    state.slack = damp(state.slack, downed ? 1 : 0, downed ? 9 : 4, dt);
    const alive = 1 - state.slack;

    // --- locomotion blend ------------------------------------------------------
    state.speedSmooth = damp(state.speedSmooth, speed, 8, dt);
    const moving = !downed && state.speedSmooth > 0.02;
    const sprintFactor = Math.min(1, state.speedSmooth / config.sprintSpeed);
    state.move = damp(state.move, moving ? 1 : 0, moving ? 12 : 8, dt);
    if (moving) {
      const strideHz = Math.min(config.maxStrideHz, state.speedSmooth / config.strideLength);
      state.stridePhase = (state.stridePhase + dt * TAU * strideHz) % TAU;
    } else if (held && !downed) {
      // Carried: a slow, slightly indignant paddle.
      state.stridePhase = (state.stridePhase + dt * TAU * 1.4) % TAU;
    }
    const move = held && !downed ? Math.max(state.move, 0.3) : state.move;

    // --- freeze-and-cock trigger ------------------------------------------------
    const sprintingNow = state.speedSmooth > config.sprintSpeed * 0.6;
    if (state.wasSprinting && !sprintingNow && speed < 0.08 && rng() < config.cockChance) {
      state.cockT = 0;
      state.cockDir = rng() < 0.5 ? -1 : 1;
    }
    state.wasSprinting = sprintingNow;
    let cock = 0;
    if (state.cockT >= 0) {
      state.cockT += dt;
      const p = state.cockT / config.cockDuration;
      if (p >= 1) state.cockT = -1;
      else cock = Math.sin(Math.min(1, p * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, p - 0.7) / 0.3);
    }

    // --- basking ------------------------------------------------------------------
    state.idleTime = moving || downed || held ? 0 : state.idleTime + dt;
    const wantsBask = !downed && !held
      && state.idleTime > config.bask.after
      && playerDist > config.bask.playerRange
      && (input.daylight ?? 1) > config.bask.minDaylight
      && (input.rain ?? 0) < config.bask.maxRain;
    state.baskBlend = damp(state.baskBlend, wantsBask ? 1 : 0, wantsBask ? config.bask.blendRate : 4, dt);
    const bask = state.baskBlend;

    // --- push-up display -------------------------------------------------------------
    let pump = 0;
    let pushupBlend = 0;
    if (!downed && !held) {
      if (!state.pushup && !moving && bask < 0.4 && playerDist < config.pushup.range) {
        state.nextPushupAt -= dt;
        if (state.nextPushupAt <= 0) {
          const pumps = Math.round(range(config.pushup.pumpsMin, config.pushup.pumpsMax));
          state.pushup = { t: 0, duration: pumps / config.pushup.rate };
          state.nextPushupAt = range(config.pushup.minGap, config.pushup.maxGap);
        }
      }
      if (state.pushup) {
        state.pushup.t += dt;
        const p = state.pushup.t / state.pushup.duration;
        if (p >= 1 || moving) {
          state.pushup = null;
        } else {
          // Envelope eases the set in and out so the first pump doesn't pop.
          pushupBlend = Math.min(1, p * 6) * Math.min(1, (1 - p) * 6);
          pump = Math.max(0, Math.sin(state.pushup.t * TAU * config.pushup.rate)) * pushupBlend;
        }
      }
    } else {
      state.pushup = null;
    }

    // --- breathing ----------------------------------------------------------------------
    const alert = playerDist < 2.6 || sprintFactor > 0.4 || held;
    const targetBreathRate = (alert ? config.alertBreathRate : config.breathRate)
      * (1 - bask * (1 - config.bask.breathScale));
    state.breathRate = damp(state.breathRate, targetBreathRate, 2, dt);
    state.breathPhase += dt * TAU * state.breathRate;
    const breath = Math.sin(state.breathPhase) * config.breathAmp * (1 + bask * 0.5) * alive;

    // --- blink scheduler --------------------------------------------------------------------
    let blinkL = state.slack;
    let blinkR = state.slack;
    if (!downed) {
      if (state.blinkT < 0) {
        state.nextBlinkAt -= dt;
        if (state.nextBlinkAt <= 0) {
          state.blinkT = 0;
        }
      } else {
        state.blinkT += dt;
        const total = config.blinkDuration + state.blinkAsync
          + (state.doublePending ? config.blinkDuration + 0.09 : 0);
        if (state.blinkT > total) {
          state.blinkT = -1;
          scheduleBlink();
        } else {
          let t = state.blinkT;
          let amount = blinkAmountAt(t, 0);
          let amountR = blinkAmountAt(t, state.blinkAsync);
          if (state.doublePending) {
            const second = config.blinkDuration + 0.09;
            amount = Math.max(amount, blinkAmountAt(t - second, 0));
            amountR = Math.max(amountR, blinkAmountAt(t - second, state.blinkAsync));
          }
          blinkL = Math.max(blinkL, amount);
          blinkR = Math.max(blinkR, amountR);
        }
      }
      const doze = bask * config.bask.lid;
      blinkL = Math.max(blinkL, doze);
      blinkR = Math.max(blinkR, doze);
    }

    // --- tongue scheduler ----------------------------------------------------------------------
    let tongueOut = state.slack * 0.3;
    if (!downed) {
      if (state.tongueT < 0) {
        const nearScale = playerDist < config.tongueNearRange ? config.tongueNearScale : 1;
        state.nextTongueAt -= dt / nearScale;
        if (state.nextTongueAt <= 0 && !state.pushup) {
          state.tongueT = 0;
          state.nextTongueAt = range(config.tongueMin, config.tongueMax);
        }
      } else {
        state.tongueT += dt;
        if (state.tongueT > config.tongueDuration) state.tongueT = -1;
        else tongueOut = Math.sin((state.tongueT / config.tongueDuration) * Math.PI);
      }
    }

    // --- head look-at ------------------------------------------------------------------------------
    let lookYawTarget = 0;
    let lookPitchTarget = 0;
    const local = input.playerLocal;
    if (!downed && local && playerDist < config.look.range && move < 0.55) {
      const horiz = Math.hypot(local.x, local.z);
      if (horiz > 0.05) {
        // Rig forward is -z; positive yaw turns the nose toward +x targets.
        const yaw = Math.atan2(-local.x, -local.z);
        lookYawTarget = Math.max(-config.look.yawClamp, Math.min(config.look.yawClamp, yaw));
        lookPitchTarget = Math.max(
          -config.look.pitchClamp,
          Math.min(config.look.pitchClamp, Math.atan2(local.y, horiz)),
        );
      }
    }
    state.lookYaw = damp(state.lookYaw, lookYawTarget * alive, config.look.damp, dt);
    state.lookPitch = damp(state.lookPitch, lookPitchTarget * alive, config.look.damp, dt);

    // --- eye saccades -------------------------------------------------------------------------------
    // Eyes lead the head: they snap to the target the head is still turning
    // toward, plus independent micro-darts while idle. Dozing eyes go still.
    let eyeYawTarget = (lookYawTarget - state.lookYaw) * config.eyeLead;
    let eyePitchTarget = (lookPitchTarget - state.lookPitch) * config.eyeLead;
    if (!downed) {
      state.nextSaccadeAt -= dt;
      if (state.nextSaccadeAt <= 0) {
        state.nextSaccadeAt = range(config.saccadeMin, config.saccadeMax);
        state.saccadeYaw = (rng() - 0.5) * 2 * config.saccadeAmp;
        state.saccadePitch = (rng() - 0.5) * 1.2 * config.saccadeAmp;
      }
      const calm = 1 - bask * 0.85;
      eyeYawTarget += state.saccadeYaw * calm;
      eyePitchTarget += state.saccadePitch * calm;
    }
    state.eyeYaw = damp(state.eyeYaw, eyeYawTarget * alive, config.saccadeDamp, dt);
    state.eyePitch = damp(state.eyePitch, eyePitchTarget * alive, config.saccadeDamp, dt);

    // --- tail flick scheduler -----------------------------------------------------------------------
    let tailFlick = 0;
    if (!downed && move < 0.3) {
      if (state.tailFlickT < 0) {
        state.nextTailFlickAt -= dt;
        if (state.nextTailFlickAt <= 0) {
          state.tailFlickT = 0;
          state.nextTailFlickAt = range(config.tailFlickMin, config.tailFlickMax);
        }
      } else {
        state.tailFlickT += dt;
        if (state.tailFlickT > config.tailFlickDuration) state.tailFlickT = -1;
        else {
          const p = state.tailFlickT / config.tailFlickDuration;
          tailFlick = Math.sin(p * Math.PI) * Math.sin(p * Math.PI * 5);
        }
      }
    }

    // ==================== pose the rig ====================
    const phase = state.stridePhase;
    const speedCurve = 0.55 + 0.45 * sprintFactor;

    // Root: gait bob, sprint crouch, bask settle, push-up lift.
    if (nodes.root) {
      nodes.root.position.y = config.rootHeight
        + Math.abs(Math.sin(phase)) * config.bobAmp * move
        - sprintFactor * config.sprintCrouch * move
        - bask * config.bask.drop
        - state.slack * config.bask.drop * 1.3
        + pump * config.pushup.lift;
    }

    // Trunk: undulation yaw + push-up pitch (nose at -z rises with +x pitch).
    if (nodes.torso) {
      const undulation = Math.sin(phase) * config.undulationAmp * move * speedCurve;
      nodes.torso.rotation.y = undulation * alive;
      nodes.torso.rotation.x = pump * config.pushup.pitchAmp * alive;
      nodes.torso.rotation.z = 0;
    }

    // Head: stabilized against the trunk wave, plus look-at, a slow lookout
    // scan while stationary, and the cock.
    if (nodes.head) {
      const stabilize = nodes.torso ? -nodes.torso.rotation.y * config.headStabilize : 0;
      const scan = Math.sin(time * config.scanRate + state.scanPhase)
        * config.scanAmp * (1 - move) * (1 - bask * 0.6) * alive;
      nodes.head.rotation.y = stabilize + state.lookYaw + scan;
      nodes.head.rotation.x = (state.lookPitch + pump * 0.1) * alive - state.slack * 0.12;
      nodes.head.rotation.z = cock * config.cockRoll * state.cockDir * alive;
    }

    if (nodes.eyeL) {
      nodes.eyeL.rotation.y = state.eyeYaw;
      nodes.eyeL.rotation.x = state.eyePitch;
    }
    if (nodes.eyeR) {
      nodes.eyeR.rotation.y = state.eyeYaw;
      nodes.eyeR.rotation.x = state.eyePitch;
    }

    if (nodes.jaw) {
      nodes.jaw.rotation.x = (pump * config.pushup.jawGape + tongueOut * 0.08) * alive
        + state.slack * 0.1;
    }
    if (nodes.gular) {
      // Throat pump runs faster than the body breath — the visible tell of a
      // reptile at rest, quickening when alert.
      const gular = Math.max(0, Math.sin(state.breathPhase * config.gularRateScale))
        * config.gularAmp * (alert ? 1.4 : 0.7 + bask * 0.3) * alive;
      nodes.gular.scale.set(1 + gular * 0.85, 1 + gular, 1 + gular * 0.35);
    }
    if (nodes.tongue) {
      const out = Math.max(0.02, tongueOut);
      nodes.tongue.scale.z = out;
      nodes.tongue.scale.x = 0.7 + out * 0.3;
    }

    const lidClosed = nodes.lidClosedAngle ?? 1;
    if (nodes.lidL) nodes.lidL.rotation.x = blinkL * lidClosed;
    if (nodes.lidR) nodes.lidR.rotation.x = blinkR * lidClosed;

    // Legs: diagonal pairs, sprawled swing with protraction lift. Sign
    // convention: for a right-side leg positive hip yaw carries the foot
    // toward -z (forward); left legs mirror via `side`.
    if (nodes.legs) {
      for (const leg of nodes.legs) {
        const p = phase + leg.phase;
        const swing = Math.sin(p) * config.hipSwingAmp * speedCurve * move;
        const lift = Math.pow(Math.max(0, Math.cos(p)), 1.4) * move;
        const frontPump = leg.front ? pump * config.pushup.legAmp : pump * 0.08;
        const splay = (bask * config.bask.splay + state.slack * 0.32) * leg.side;
        if (leg.hip) {
          leg.hip.rotation.y = leg.side * swing * alive;
          leg.hip.rotation.z = (leg.side * lift * config.hipLiftAmp) * alive + splay;
          leg.hip.rotation.x = 0;
        }
        if (leg.knee) {
          leg.knee.rotation.z = leg.side * (
            lift * config.kneeLiftAmp
            - frontPump
            + bask * config.bask.splay * 0.8
          ) * alive;
        }
      }
    }

    // Tail: travelling wave while moving; at rest a baked droop with a slow
    // sideways drift, a gentle vertical breathe, and the occasional tip
    // flick. Straightens and lifts slightly at full sprint.
    if (nodes.tailSegments) {
      const segments = nodes.tailSegments;
      const restPitch = config.tailRestPitch;
      for (let k = 0; k < segments.length; k += 1) {
        const wave = Math.sin(phase - (k + 1) * config.tailLag)
          * config.tailSwingAmp * (0.45 + k * 0.55) * move * speedCurve;
        const idle = Math.sin(time * config.tailIdleRate + state.scanPhase + k * 1.05)
          * config.tailIdleAmp * (1 - move) * (0.4 + k * 0.6);
        const flick = k === segments.length - 1 ? tailFlick * 0.5 : tailFlick * 0.12 * k;
        const curl = (bask * config.bask.tailCurl
          + config.tailRestCurl * (1 - move * 0.6))
          * state.curlDir * (0.4 + k * 0.6);
        segments[k].rotation.y = (wave + idle + flick + curl) * alive;
        const droop = (restPitch ? restPitch[k] ?? 0 : 0)
          * (1 - sprintFactor * move * 0.6);
        const settle = Math.sin(time * 0.55 + state.scanPhase + k * 0.7)
          * 0.018 * (1 - move) * alive;
        segments[k].rotation.x = droop + settle
          - sprintFactor * move * 0.06 * (k === 0 ? 1 : 0.4);
      }
    }

    if (nodes.breathe) {
      nodes.breathe.scale.set(1 + breath * 0.7, 1 + breath, 1);
    }
  }

  return { update, state, config };
}
