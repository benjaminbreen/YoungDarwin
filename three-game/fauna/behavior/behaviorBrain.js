// One animal's choices: what it wants, what it is doing, and whom with.
//
// The brain sits on top of the motion archetypes. Between behaviours it
// returns no intent and the archetype carries on as before (wander, graze,
// bask, hop, flee). When a behaviour is running it returns an intent (where
// to go, how fast, what to face, what the body should show) that
// intentLocomotion executes in place of the archetype. A threat always wins:
// any panic interrupts the behaviour and hands the animal back to the
// archetype's flight.
//
// Choice is by need. Drives rise with time; each behaviour serves one and
// spends it. A behaviour is eligible only in its hours and habitats, with its
// partner present, and off cooldown; the eligible ones are weighed by need,
// with a seeded draw so two birds of the same kind are not in lockstep.
// Animals answer each other through social signals (repertoire.responses),
// spot predators through the social field, and spread alarm by stimuli, so
// chains of behaviour emerge without being scripted: a finch hops up to a
// tortoise, the tortoise rises, other finches see it raised and come to
// glean; a mockingbird sees an owl, scolds, and the rest of the group joins.

import { pushSpecimenStimulus } from '../../world/specimenRuntime';
import { getRuntimeObstacles } from '../../world/obstacles';
import { sunDirection } from '../../world/celestial';
import { ecologyForageTargets, seededUnit } from '../motion/motionUtils';
import { habitatForZone, traitsForSpecies, trueTraitValue } from '../../examine/populationTraits';
import { pickLavaLizardSize } from '../../wildlife/reptiles/lavaLizardModel';
import { getWildlifeSpecies } from '../../wildlife/wildlifeCatalog';
import { DRIVES, getRepertoire, hourInWindow } from './repertoires';
import {
  broadcastAlarm,
  getSocialEntry,
  publishSocial,
  sendSocialSignal,
  socialNeighbors,
  takeSocialSignals,
} from './socialField';
import { closeBehaviorEpisode, openBehaviorEpisode, updateBehaviorEpisode } from './behaviorEpisodes';
import { clearBehaviorPresentation, setBehaviorPresentation } from './behaviorPresentation';

// Longest an animal keeps going after a partner before it gives up.
const MAX_TRAVEL_SECONDS = 12;
const PREDATOR_SCAN_INTERVAL = 0.4;
const PREDATOR_ALARM_COOLDOWN = 25;
const CONTAGION_COOLDOWN = 3;
// How long Darwin must keep still near an animal before it starts to accept
// him, and how far that acceptance goes.
const HABITUATION_START = 3;
const HABITUATION_FULL = 15;
const HABITUATION_TOLERANCE = 0.55;
// Behaviours never lead an animal further than this from home.
const ROAM_LIMIT = 2.4;

const shadeObstacleCache = new Map();
// One bird calls about a predator and the rest hear it: a call raised by any
// animal stands for the whole group for a while. Keyed zone:predator.
const recentPredatorCalls = new Map();
const SHARED_CALL_SECONDS = 20;
// Live brains by actor, for the harness and the notebook's debugging.
const brainRegistry = new Map();

export function getBehaviorBrain(actorId) {
  return brainRegistry.get(actorId) || null;
}

function shadeObstacles(zoneId) {
  if (shadeObstacleCache.has(zoneId)) return shadeObstacleCache.get(zoneId);
  let list = [];
  try {
    list = getRuntimeObstacles(zoneId).filter(obstacle => (
      Number.isFinite(obstacle?.x)
      && Number.isFinite(obstacle?.z)
      && (Number(obstacle.radius) || 0) >= 0.3
      && (Number(obstacle.radius) || 0) <= 6
      && (obstacle.colliderTop || obstacle.height || 1) >= 0.35
    ));
  } catch {
    list = [];
  }
  shadeObstacleCache.set(zoneId, list);
  return list;
}

// Body size for contests: the measured trait when the species has one, the
// rendered size for lava lizards, otherwise a small seeded spread.
export function bodySizeFor(speciesId, actorId, zoneId) {
  if (speciesId === 'lavalizard') return pickLavaLizardSize(actorId);
  const trait = (traitsForSpecies(speciesId) || []).find(item => item.scalesBody);
  if (trait) return trueTraitValue(trait, actorId, zoneId) / trait.base;
  return 0.9 + seededUnit(String(actorId).length * 7.31 + (actorId?.charCodeAt?.(0) || 0)) * 0.2;
}

// A predator only alarms when it is about its business: a racer coiled in
// the sun or a hawk sitting on a post is watched, not fled.
function predatorActive(entry) {
  const activity = String(entry.activity || '');
  if (entry.speciesId === 'galapagosracer') return /hunt|strike/.test(activity);
  return !/perch|roost|sleep|rest/.test(activity);
}

function within(range, unit) {
  return range[0] + (range[1] - range[0]) * unit;
}

export function createBehaviorBrain({ speciesId, actorId, seed = 0.5, profile = null, zoneId = null, size = null }) {
  const repertoire = getRepertoire(speciesId);
  if (!repertoire || !actorId) return null;
  const kinGroup = getWildlifeSpecies(speciesId)?.kinGroup || null;
  const bodySize = Number.isFinite(size) ? size : bodySizeFor(speciesId, actorId, zoneId);
  const drives = Object.fromEntries(DRIVES.map((drive, index) => [drive, seededUnit(seed * 811 + index * 37) * 0.7]));
  const cooldowns = new Map();
  const predatorAlarmAt = new Map();
  // Predators this animal has already joined a mob against, by time.
  const joinedAt = new Map();
  const scratch = [];
  const intent = {
    active: false,
    behaviorId: null,
    action: null,
    moveTo: { x: 0, z: 0 },
    moving: false,
    speed: 0,
    running: false,
    face: { x: 0, z: 0 },
    facing: false,
  };
  const brain = {
    current: null,
    cycle: 0,
    nextDecisionAt: 0,
    nextPredatorScanAt: 0,
    playerStillTime: 0,
    lastContagionAt: -Infinity,
    prevPanic: 0,
    moved: false,
    zoneId,
  };

  function unit(salt) {
    return seededUnit(seed * 7919 + brain.cycle * 131 + salt);
  }

  function reset(now = 0, nextZoneId = brain.zoneId) {
    endCurrent(now, 'interrupted');
    brain.zoneId = nextZoneId;
    brain.cycle = 0;
    brain.nextDecisionAt = now + 1.5 + seed * 4;
    brain.playerStillTime = 0;
    brain.moved = false;
    cooldowns.clear();
    predatorAlarmAt.clear();
    joinedAt.clear();
  }

  function walkSpeed() {
    return Math.max(0.08, profile?.walkSpeed || 0.25);
  }

  function runSpeed() {
    return Math.max(walkSpeed() * 2.2, (profile?.fleeSpeed || 1.2) * 0.85);
  }

  // --- partners -------------------------------------------------------------
  function matchesPartner(spec, entry, self) {
    if (!entry || entry.alarmed) return false;
    if (spec.kind === 'kin' && entry.speciesId !== speciesId) return false;
    if (spec.kind === 'kinGroup') {
      const same = entry.speciesId === speciesId || (kinGroup && entry.kinGroup === kinGroup);
      if (!same) return false;
    }
    if (spec.kind === 'species' && !spec.species.includes(entry.speciesId)) return false;
    if (spec.requires === 'solicit' && !entry.solicit) return false;
    if (spec.activity && !spec.activity.includes(entry.activity || 'default')) return false;
    if (spec.notActivity && spec.notActivity.includes(entry.activity)) return false;
    if (spec.smaller && !(entry.size < self.size * 0.95)) return false;
    return true;
  }

  function findPartner(spec, self, ctx) {
    if (!spec) return { partnerId: null };
    if (spec.kind === 'player') {
      if (!ctx.player || ctx.playerDistance > spec.radius) return null;
      if (spec.stillFor && brain.playerStillTime < spec.stillFor) return null;
      return { partnerId: 'player', partnerSpeciesId: 'darwin', x: ctx.player.x, z: ctx.player.z };
    }
    const neighbors = socialNeighbors(ctx.zoneId, self.x, self.z, spec.radius, {
      selfId: actorId,
      now: ctx.t,
      out: scratch,
    });
    if (spec.minDistance) {
      // Followers and huddlers only move when the nearest of their own kind
      // is far enough off to be worth joining.
      const nearestKin = neighbors.find(entry => matchesPartner({ kind: spec.kind }, entry, self));
      if (!nearestKin || nearestKin.distance < spec.minDistance) return null;
      return { partnerId: nearestKin.actorId, partnerSpeciesId: nearestKin.speciesId, x: nearestKin.x, z: nearestKin.z };
    }
    const match = neighbors.find(entry => matchesPartner(spec, entry, self));
    if (!match) return null;
    return { partnerId: match.actorId, partnerSpeciesId: match.speciesId, x: match.x, z: match.z };
  }

  function partnerPosition(ctx) {
    const current = brain.current;
    if (!current?.partnerId) return null;
    if (current.partnerId === 'player') return ctx.player;
    return getSocialEntry(ctx.zoneId, current.partnerId, ctx.t);
  }

  // --- targets --------------------------------------------------------------
  function plantTarget(self, ctx) {
    const targets = ecologyForageTargets(ctx.zoneId);
    let best = null;
    let bestScore = Infinity;
    const jitter = unit(17);
    for (const target of targets) {
      const dx = target.x - self.x;
      const dz = target.z - self.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 4.5 || distance < 0.3) continue;
      if (Math.hypot(target.x - ctx.base.x, target.z - ctx.base.z) > ctx.roam) continue;
      // Prefer near plants, with a seeded nudge so a bird does not always
      // pick the same one.
      const score = distance * (0.7 + seededUnit(jitter * 997 + target.x * 13.1 + target.z * 7.7) * 0.6);
      if (score < bestScore) {
        bestScore = score;
        best = target;
      }
    }
    if (!best) return null;
    // Stand at the plant's foot, not inside it.
    const dx = self.x - best.x;
    const dz = self.z - best.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: best.x + (dx / length) * 0.22, z: best.z + (dz / length) * 0.22 };
  }

  function shadeTarget(self, ctx) {
    const sun = sunDirection(ctx.hour, 1);
    const sunX = sun[0];
    const sunZ = sun[2];
    const sunLength = Math.hypot(sunX, sunZ) || 1;
    let best = null;
    let bestDistance = 9;
    for (const obstacle of shadeObstacles(ctx.zoneId)) {
      const distance = Math.hypot(obstacle.x - self.x, obstacle.z - self.z);
      if (distance >= bestDistance) continue;
      if (Math.hypot(obstacle.x - ctx.base.x, obstacle.z - ctx.base.z) > ctx.roam + 2) continue;
      bestDistance = distance;
      best = obstacle;
    }
    if (!best) return null;
    // The shaded side is the one away from the sun (straight under a high
    // sun, any side close in will do).
    const offset = (Number(best.radius) || 0.5) + Math.max(0.12, ctx.bodyRadius) + 0.08;
    return {
      x: best.x - (sunX / sunLength) * offset,
      z: best.z - (sunZ / sunLength) * offset,
      obstacleId: best.id || null,
    };
  }

  // --- lifecycle ------------------------------------------------------------
  function openEpisode(ctx) {
    const current = brain.current;
    if (!current || current.episodeId || current.def.record === false || !current.def.note) return;
    current.episodeId = openBehaviorEpisode(ctx.zoneId, {
      actorId,
      speciesId,
      behaviorId: current.def.id,
      partnerActorId: current.partnerId,
      partnerSpeciesId: current.partnerSpeciesId,
      x: ctx.self.x,
      y: ctx.self.y,
      z: ctx.self.z,
      now: ctx.t,
      detail: { habitat: habitatForZone(ctx.zoneId), hour: ctx.hour },
    });
  }

  function endCurrent(now, outcome = 'complete') {
    const current = brain.current;
    if (!current) return;
    if (current.episodeId) closeBehaviorEpisode(brain.zoneId, current.episodeId, { now, outcome });
    if (outcome === 'complete' && current.def.drive) {
      drives[current.def.drive] = Math.max(0, drives[current.def.drive] - 0.75);
    }
    cooldowns.set(current.def.id, now);
    if (current.moved) brain.moved = true;
    brain.current = null;
    brain.cycle += 1;
    intent.active = false;
    setBehaviorPresentation(actorId, null, null, now);
  }

  function start(def, ctx, { partner = null, kind = 'behavior', source = null } = {}) {
    endCurrent(ctx.t, 'interrupted');
    const duration = within(def.duration || [3, 6], unit(3));
    const current = {
      def,
      kind,
      startedAt: ctx.t,
      until: ctx.t + duration,
      phase: 'go',
      partnerId: partner?.partnerId || null,
      partnerSpeciesId: partner?.partnerSpeciesId || null,
      target: null,
      episodeId: null,
      moved: false,
      struck: false,
      source,
    };
    brain.current = current;
    if (def.move === 'toPlant') current.target = plantTarget(ctx.self, ctx);
    if (def.move === 'shade') {
      current.target = shadeTarget(ctx.self, ctx);
      if (!current.target) {
        brain.current = null;
        return false;
      }
    }
    if (def.move === 'stay' || def.move === 'chase' || def.move === 'retreat' || def.move === 'stalk') {
      current.phase = def.move === 'stay' ? 'act' : 'go';
      openEpisode(ctx);
    }
    if (def.signal && current.partnerId && current.partnerId !== 'player') {
      sendSocialSignal(ctx.zoneId, current.partnerId, {
        type: def.signal,
        fromId: actorId,
        fromSpeciesId: speciesId,
        fromSize: bodySize,
        x: ctx.self.x,
        z: ctx.self.z,
      }, ctx.t);
    }
    // Only the one that spotted it recruits; those that joined do not recruit
    // again, or a group would keep calling itself back to the mob.
    if (def.alarm && !(def.alarm.join && kind === 'reaction')) raiseAlarm(def.alarm, ctx, source);
    return true;
  }

  function raiseAlarm(alarm, ctx, source) {
    const hears = entry => alarm.hears.includes(entry.speciesId);
    if (alarm.join) {
      const listeners = socialNeighbors(ctx.zoneId, ctx.self.x, ctx.self.z, alarm.radius, {
        selfId: actorId,
        now: ctx.t,
        filter: hears,
        out: scratch,
      });
      for (const entry of listeners) {
        sendSocialSignal(ctx.zoneId, entry.actorId, {
          type: 'join',
          behaviorId: alarm.join,
          partnerId: brain.current?.partnerId || null,
          partnerSpeciesId: brain.current?.partnerSpeciesId || null,
          fromId: actorId,
          x: ctx.self.x,
          z: ctx.self.z,
        }, ctx.t);
      }
      return;
    }
    broadcastAlarm(ctx.zoneId, {
      fromId: actorId,
      x: ctx.self.x,
      z: ctx.self.z,
      sourceX: source?.x ?? ctx.self.x,
      sourceZ: source?.z ?? ctx.self.z,
      radius: alarm.radius,
      intensity: alarm.intensity,
      hears,
      now: ctx.t,
    });
  }

  function reactionById(id) {
    return repertoire.reactions.find(item => item.id === id) || repertoire.behaviors.find(item => item.id === id) || null;
  }

  // --- signals and predators ------------------------------------------------
  function handleSignals(ctx) {
    const signals = takeSocialSignals(ctx.zoneId, actorId);
    if (!signals) return;
    for (const signal of signals) {
      if (brain.current?.kind === 'alarm') continue;
      const reactionId = signal.type === 'join' ? signal.behaviorId : repertoire.responses?.[signal.type];
      let def = reactionId ? reactionById(reactionId) : null;
      if (!def) continue;
      if (def.yieldIfSmaller && Number.isFinite(signal.fromSize) && bodySize < signal.fromSize * def.yieldIfSmaller) {
        def = reactionById('yield') || reactionById('withdraw');
        if (!def) continue;
      }
      if (signal.type === 'join' && signal.partnerId) {
        // Already had its say about this predator.
        if (ctx.t - (joinedAt.get(signal.partnerId) ?? -Infinity) < PREDATOR_ALARM_COOLDOWN) continue;
        joinedAt.set(signal.partnerId, ctx.t);
      }
      const partner = signal.type === 'join'
        ? { partnerId: signal.partnerId, partnerSpeciesId: signal.partnerSpeciesId }
        : { partnerId: signal.fromId, partnerSpeciesId: signal.fromSpeciesId };
      start(def, ctx, { partner, kind: 'reaction', source: { x: signal.x, z: signal.z } });
    }
  }

  function scanPredators(ctx) {
    const predators = repertoire.predators;
    if (!predators || ctx.t < brain.nextPredatorScanAt) return;
    brain.nextPredatorScanAt = ctx.t + PREDATOR_SCAN_INTERVAL;
    const maxRadius = Math.max(...Object.values(predators));
    const neighbors = socialNeighbors(ctx.zoneId, ctx.self.x, ctx.self.z, maxRadius, {
      selfId: actorId,
      now: ctx.t,
      filter: entry => Number.isFinite(predators[entry.speciesId]) && predatorActive(entry),
      out: scratch,
    });
    const threat = neighbors.find(entry => entry.distance <= predators[entry.speciesId]);
    if (!threat) return;
    if (ctx.t - (predatorAlarmAt.get(threat.actorId) ?? -Infinity) < PREDATOR_ALARM_COOLDOWN) return;
    predatorAlarmAt.set(threat.actorId, ctx.t);
    if (brain.current?.kind === 'alarm') return;
    const callKey = `${ctx.zoneId}:${threat.actorId}`;
    const calledAt = recentPredatorCalls.get(callKey) ?? -Infinity;
    if (ctx.t - calledAt < SHARED_CALL_SECONDS && ctx.t >= calledAt) return;
    recentPredatorCalls.set(callKey, ctx.t);
    const partner = { partnerId: threat.actorId, partnerSpeciesId: threat.speciesId };
    const source = { x: threat.x, z: threat.z };
    let def = null;
    if (repertoire.mobs?.includes(threat.speciesId)) def = reactionById('mobPredator');
    else if (repertoire.freezes?.includes(threat.speciesId)) def = reactionById('freeze');
    else def = reactionById('alarmCall');
    if (def && start(def, ctx, { partner, kind: 'alarm', source })) {
      // A caller flees once it has called; a freezer stays put.
      if (def.id === 'alarmCall') brain.current.fleeAfter = source;
      return;
    }
    // No display for this one: just get away from it.
    pushSpecimenStimulus(ctx.zoneId, actorId, {
      kind: 'contact',
      source: 'predator',
      position: { x: source.x, y: 0, z: source.z },
      radius: predators[threat.speciesId] + 2,
      intensity: 1,
      duration: 1.6,
    });
  }

  function spreadFlush(ctx) {
    const contagion = repertoire.flushContagion;
    const rising = ctx.panic > 0.3 && brain.prevPanic <= 0.3;
    brain.prevPanic = ctx.panic;
    if (!contagion || !rising || ctx.t - brain.lastContagionAt < CONTAGION_COOLDOWN) return;
    brain.lastContagionAt = ctx.t;
    const nearPlayer = ctx.player && ctx.playerDistance < 9;
    broadcastAlarm(ctx.zoneId, {
      fromId: actorId,
      x: ctx.self.x,
      z: ctx.self.z,
      sourceX: nearPlayer ? ctx.player.x : ctx.self.x,
      sourceZ: nearPlayer ? ctx.player.z : ctx.self.z,
      radius: contagion.radius,
      intensity: contagion.intensity,
      hears: entry => contagion.hears.includes(entry.speciesId),
      now: ctx.t,
    });
  }

  // --- choosing -------------------------------------------------------------
  function eligible(def, ctx) {
    if (!def.hours || !(hourInWindow(ctx.hour, def.hours) || hourInWindow(ctx.hour, def.lateHours))) return null;
    if (def.habitats && !def.habitats.includes(ctx.habitat)) return null;
    if (def.tameOnly && !ctx.tame) return null;
    if (def.cooldown && ctx.t - (cooldowns.get(def.id) ?? -Infinity) < def.cooldown) return null;
    if (!def.partner) return { partnerId: null };
    return findPartner(def.partner, ctx.self, ctx)
      || (def.fallbackPartner ? findPartner(def.fallbackPartner, ctx.self, ctx) : null);
  }

  function choose(ctx) {
    const options = [];
    let total = 0;
    for (const def of repertoire.behaviors) {
      const partner = eligible(def, ctx);
      if (!partner) continue;
      const need = def.drive ? drives[def.drive] : 0.5;
      // Behaviours that just ended are less likely to repeat at once.
      const recent = ctx.t - (cooldowns.get(def.id) ?? -Infinity) < 20 ? 0.45 : 1;
      const score = def.weight * (0.3 + need) * recent;
      if (score <= 0) continue;
      options.push({ def, partner, score });
      total += score;
    }
    const idle = repertoire.defaultWeight ?? 1;
    total += idle;
    let roll = unit(29) * total;
    for (const option of options) {
      roll -= option.score;
      if (roll <= 0) {
        if (start(option.def, ctx, { partner: option.partner })) return;
        break;
      }
    }
    // Leave it to the archetype for a while.
    brain.cycle += 1;
    brain.nextDecisionAt = ctx.t + within(repertoire.defaultDuration || [4, 9], unit(41));
  }

  // --- running --------------------------------------------------------------
  function setIntentStay(def, face) {
    intent.active = true;
    intent.behaviorId = def.id;
    intent.action = def.action || null;
    intent.moving = false;
    intent.speed = 0;
    intent.running = false;
    intent.facing = Boolean(face);
    if (face) {
      intent.face.x = face.x;
      intent.face.z = face.z;
    }
  }

  function setIntentMove(def, x, z, speed, running) {
    intent.active = true;
    intent.behaviorId = def.id;
    intent.action = running ? null : (def.move === 'stalk' ? 'creep' : null);
    intent.moving = true;
    intent.moveTo.x = x;
    intent.moveTo.z = z;
    intent.speed = speed;
    intent.running = running;
    intent.facing = false;
  }

  function clampToRoam(point, ctx) {
    const dx = point.x - ctx.base.x;
    const dz = point.z - ctx.base.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= ctx.roam) return point;
    point.x = ctx.base.x + (dx / distance) * ctx.roam;
    point.z = ctx.base.z + (dz / distance) * ctx.roam;
    return point;
  }

  const roamScratch = { x: 0, z: 0 };

  function run(ctx) {
    const current = brain.current;
    const def = current.def;
    if (ctx.t >= current.until) {
      if (current.fleeAfter) {
        pushSpecimenStimulus(ctx.zoneId, actorId, {
          kind: 'contact',
          source: 'predator',
          position: { x: current.fleeAfter.x, y: 0, z: current.fleeAfter.z },
          radius: 12,
          intensity: 1,
          duration: 1.6,
        });
      }
      endCurrent(ctx.t, current.struck ? 'escaped' : 'complete');
      brain.nextDecisionAt = ctx.t + 0.4 + unit(5) * 1.2;
      return null;
    }
    const partner = partnerPosition(ctx);
    if (current.partnerId && !partner && def.move !== 'retreat') {
      endCurrent(ctx.t, 'lost');
      brain.nextDecisionAt = ctx.t + 0.6;
      return null;
    }
    if (current.partnerId === 'player' && (ctx.playerSpeed > 2.2 || ctx.playerDistance > (def.partner?.radius || 8) + 3)) {
      endCurrent(ctx.t, 'interrupted');
      brain.nextDecisionAt = ctx.t + 2;
      return null;
    }
    if (current.episodeId) {
      updateBehaviorEpisode(ctx.zoneId, current.episodeId, { x: ctx.self.x, y: ctx.self.y, z: ctx.self.z, now: ctx.t });
    }
    const distanceTo = point => Math.hypot(point.x - ctx.self.x, point.z - ctx.self.z);

    switch (def.move) {
      case 'stay':
        setIntentStay(def, def.faceTarget && partner ? partner : null);
        break;
      case 'toPlant':
      case 'shade': {
        if (current.phase === 'go' && current.target && distanceTo(current.target) > 0.18) {
          setIntentMove(def, current.target.x, current.target.z, walkSpeed(), false);
          current.moved = true;
          // Do not let the walk eat the whole behaviour.
          current.until = Math.max(current.until, ctx.t + 1.5);
        } else {
          if (current.phase === 'go') {
            current.phase = 'act';
            openEpisode(ctx);
          }
          setIntentStay(def, null);
        }
        break;
      }
      case 'approach':
      case 'follow': {
        const reach = def.reach || 1;
        if (distanceTo(partner) > reach) {
          if (current.phase === 'act' && distanceTo(partner) < reach * 1.6) {
            // Already there: small drift of the partner does not restart the walk.
            setIntentStay(def, def.faceTarget ? partner : null);
            break;
          }
          roamScratch.x = partner.x;
          roamScratch.z = partner.z;
          clampToRoam(roamScratch, ctx);
          // Small birds cover any real distance in quick hops and short
          // flights, not at a forage walk.
          const far = distanceTo(partner) > 2.5;
          setIntentMove(def, roamScratch.x, roamScratch.z, far ? runSpeed() : walkSpeed() * (def.move === 'follow' ? 1.3 : 1), far);
          current.moved = true;
          current.until = Math.max(current.until, ctx.t + 1.2);
          // Clamped short of its partner, or never closing on it: give up.
          if (distanceTo(roamScratch) < 0.12 || ctx.t - current.startedAt > MAX_TRAVEL_SECONDS) {
            endCurrent(ctx.t, 'lost');
            brain.nextDecisionAt = ctx.t + 2;
            return null;
          }
        } else {
          if (def.move === 'follow') {
            endCurrent(ctx.t, 'complete');
            brain.nextDecisionAt = ctx.t + 0.5;
            return null;
          }
          if (current.phase !== 'act') {
            current.phase = 'act';
            // The act gets its full duration from arrival.
            current.until = ctx.t + within(def.duration || [3, 6], unit(7));
            openEpisode(ctx);
            if (def.arriveSignal && current.partnerId && current.partnerId !== 'player') {
              sendSocialSignal(ctx.zoneId, current.partnerId, {
                type: def.arriveSignal,
                fromId: actorId,
                fromSpeciesId: speciesId,
                fromSize: bodySize,
                x: ctx.self.x,
                z: ctx.self.z,
              }, ctx.t);
            }
          }
          setIntentStay(def, def.faceTarget ? partner : null);
        }
        break;
      }
      case 'chase': {
        roamScratch.x = partner.x;
        roamScratch.z = partner.z;
        clampToRoam(roamScratch, ctx);
        if (distanceTo(partner) > 0.4) {
          setIntentMove(def, roamScratch.x, roamScratch.z, runSpeed(), true);
          current.moved = true;
        } else {
          setIntentStay(def, partner);
        }
        break;
      }
      case 'retreat': {
        const from = partner || current.source || ctx.self;
        let dx = ctx.self.x - from.x;
        let dz = ctx.self.z - from.z;
        const length = Math.hypot(dx, dz) || 1;
        dx /= length;
        dz /= length;
        roamScratch.x = ctx.self.x + dx * 2.5;
        roamScratch.z = ctx.self.z + dz * 2.5;
        clampToRoam(roamScratch, ctx);
        const speed = def.speed === 'run' ? runSpeed() : walkSpeed();
        setIntentMove(def, roamScratch.x, roamScratch.z, speed, def.speed === 'run');
        current.moved = true;
        break;
      }
      case 'stalk': {
        const distance = distanceTo(partner);
        const strike = def.strikeRange || 0.6;
        if (!current.struck && distance <= strike) {
          current.struck = true;
          current.phase = 'act';
          current.until = ctx.t + 0.9;
          pushSpecimenStimulus(ctx.zoneId, current.partnerId, {
            kind: 'contact',
            source: 'predator',
            fromId: actorId,
            position: { x: ctx.self.x, y: ctx.self.y, z: ctx.self.z },
            radius: 3,
            intensity: 1.3,
            duration: 1.2,
          });
        }
        if (current.struck) {
          setIntentStay(def, partner);
        } else {
          const dashing = distance < strike * 2.6;
          roamScratch.x = partner.x;
          roamScratch.z = partner.z;
          clampToRoam(roamScratch, ctx);
          setIntentMove(def, roamScratch.x, roamScratch.z, dashing ? runSpeed() * 1.15 : walkSpeed() * 0.55, dashing);
          current.moved = true;
        }
        break;
      }
      default:
        setIntentStay(def, null);
    }
    setBehaviorPresentation(
      actorId,
      intent.moving ? intent.action : def.action || null,
      intent.facing ? intent.face : partner,
      ctx.t,
    );
    return intent;
  }

  // ctx: { zoneId, t, dt, hour, self:{x,y,z}, base:{x,z}, habitatRadius,
  //        panic, busy, player:{x,z}|null, playerSpeed, playerDistance,
  //        tame, bodyRadius }
  function step(ctx) {
    // The brain that is actually stepping is the one the harness should see
    // (dev double-mounts build and discard a twin).
    if (brainRegistry.get(actorId) !== api) brainRegistry.set(actorId, api);
    ctx.habitat = habitatForZone(ctx.zoneId);
    ctx.roam = Math.max(3, (ctx.habitatRadius || 3) * ROAM_LIMIT);
    for (const drive of DRIVES) {
      drives[drive] = Math.min(1.5, drives[drive] + (repertoire.driveRates?.[drive] || 0) * ctx.dt);
    }
    const playerNear = ctx.player && ctx.playerDistance < 14;
    if (playerNear && ctx.playerSpeed < 0.35) brain.playerStillTime += ctx.dt;
    else brain.playerStillTime = Math.max(0, brain.playerStillTime - ctx.dt * (ctx.playerSpeed > 2.5 ? 6 : 2));

    spreadFlush(ctx);
    publish(ctx);

    if (ctx.panic > 0.05) {
      if (brain.current) {
        endCurrent(ctx.t, 'interrupted');
        brain.nextDecisionAt = ctx.t + 3 + unit(11) * 3;
      }
      return null;
    }
    handleSignals(ctx);
    if (brain.forced) {
      const def = reactionById(brain.forced);
      brain.forced = null;
      if (def) {
        const partner = def.partner ? (findPartner(def.partner, ctx.self, ctx) || findPartner(def.fallbackPartner || def.partner, ctx.self, ctx)) : { partnerId: null };
        if (partner || !def.partner) start(def, ctx, { partner, kind: 'behavior' });
      }
    }
    scanPredators(ctx);
    if (brain.current) return run(ctx);
    if (ctx.busy || ctx.t < brain.nextDecisionAt) return null;
    choose(ctx);
    return brain.current ? run(ctx) : null;
  }

  function publish(ctx) {
    const current = brain.current;
    publishSocial(ctx.zoneId, actorId, {
      speciesId,
      kinGroup,
      x: ctx.self.x,
      y: ctx.self.y,
      z: ctx.self.z,
      activity: current?.def.id || 'default',
      alarmed: ctx.panic > 0.12,
      solicit: Boolean(current?.def.solicit && current.phase === 'act'),
      size: bodySize,
    }, ctx.t);
  }

  // Alert distances shrink while Darwin keeps still nearby, and a curious
  // animal that has walked up to him does not then bolt from its own nearness.
  function tolerance() {
    if (brain.current?.partnerId === 'player') return 0.3;
    const settled = Math.min(1, Math.max(0, (brain.playerStillTime - HABITUATION_START) / (HABITUATION_FULL - HABITUATION_START)));
    return 1 - settled * (1 - HABITUATION_TOLERANCE);
  }

  function takeMoved() {
    const moved = brain.moved;
    brain.moved = false;
    return moved;
  }

  function dispose(now = 0) {
    endCurrent(now, 'interrupted');
    clearBehaviorPresentation(actorId);
    if (brainRegistry.get(actorId) === api) brainRegistry.delete(actorId);
  }

  const api = {
    speciesId,
    actorId,
    size: bodySize,
    drives,
    step,
    reset,
    tolerance,
    takeMoved,
    dispose,
    current: () => brain.current,
    playerStillTime: () => brain.playerStillTime,
    // Start a behaviour on the next step regardless of hours and cooldown
    // (its partner must still be present). For the harness.
    force: behaviorId => {
      brain.forced = behaviorId;
      return true;
    },
  };
  brainRegistry.set(actorId, api);
  return api;
}
