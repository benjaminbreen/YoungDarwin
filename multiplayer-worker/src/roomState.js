import {
  MULTIPLAYER_FIXED_ZONE_ID,
  MULTIPLAYER_NORMAL_ROOM_CAPACITY,
  MULTIPLAYER_RECONNECT_GRACE_MS,
  MULTIPLAYER_RESERVATION_MS,
  finitePose,
  isMultiplayerRole,
  sanitizeMultiplayerName,
} from '../../game-core/multiplayer/protocol.js';
import { getTortoiseCommunicationIntent } from '../../game-core/multiplayer/tortoiseIntents.js';

const ROLE_REPORTED_SPEED_CAPS = Object.freeze({ darwin: 10, tortoise: 2.2 });
const COARSE_ZONE_BOUND = 75;
const INTENT_RANGE = 14;
const INTENT_COOLDOWN_MS = 1_200;
const MIN_POSE_INTERVAL_MS = (1_000 / 15) - 4;

export function createRoomState(roomCode, now = Date.now(), capacity = MULTIPLAYER_NORMAL_ROOM_CAPACITY) {
  return {
    roomCode,
    capacity,
    createdAt: now,
    version: 0,
    actors: {},
    tokenToPlayerId: {},
  };
}

export function publicActor(actor) {
  if (!actor) return null;
  return {
    playerId: actor.playerId,
    roleId: actor.roleId,
    displayName: actor.displayName,
    zoneId: actor.zoneId,
    connected: Boolean(actor.connected),
    sourceActorId: actor.sourceActorId || null,
    pose: actor.pose || null,
    motion: actor.motion || null,
    action: actor.action || null,
  };
}

export function publicRoomSnapshot(state) {
  return {
    roomCode: state.roomCode,
    capacity: state.capacity,
    version: state.version,
    actors: Object.values(state.actors).map(publicActor),
  };
}

export function cleanupExpiredRoomLeases(state, now = Date.now()) {
  const released = [];
  Object.values(state.actors).forEach(actor => {
    const expiredReservation = !actor.connected && actor.reservedUntil && actor.reservedUntil <= now;
    const expiredReconnect = !actor.connected && actor.reconnectUntil && actor.reconnectUntil <= now;
    if (!expiredReservation && !expiredReconnect) return;
    delete state.actors[actor.playerId];
    delete state.tokenToPlayerId[actor.token];
    released.push({ playerId: actor.playerId, token: actor.token, roleId: actor.roleId });
    state.version += 1;
  });
  return released;
}

export function reserveRoomRole(state, input, now = Date.now()) {
  cleanupExpiredRoomLeases(state, now);
  const roleId = String(input?.roleId || '');
  if (!isMultiplayerRole(roleId)) return { ok: false, code: 'invalid-role' };
  if (Object.keys(state.actors).length >= state.capacity) return { ok: false, code: 'room-full' };
  if (Object.values(state.actors).some(actor => actor.roleId === roleId)) {
    return { ok: false, code: 'role-taken' };
  }

  const playerId = input.playerId || crypto.randomUUID();
  const token = input.token || crypto.randomUUID();
  const actor = {
    playerId,
    token,
    roleId,
    displayName: sanitizeMultiplayerName(input?.displayName, roleId === 'darwin' ? 'Darwin' : 'Tortoise'),
    zoneId: MULTIPLAYER_FIXED_ZONE_ID,
    connected: false,
    reservedUntil: now + MULTIPLAYER_RESERVATION_MS,
    reconnectUntil: null,
    sourceActorId: null,
    pose: null,
    motion: null,
    action: null,
    lastPoseAt: 0,
    lastPoseSequence: -1,
    lastIntentAt: 0,
  };
  state.actors[playerId] = actor;
  state.tokenToPlayerId[token] = playerId;
  state.version += 1;
  return { ok: true, actor, token, playerId };
}

export function releaseRoomLease(state, token) {
  const playerId = state.tokenToPlayerId[token];
  const actor = playerId ? state.actors[playerId] : null;
  if (!actor) return { ok: false, code: 'unknown-lease' };
  delete state.tokenToPlayerId[token];
  delete state.actors[playerId];
  state.version += 1;
  return { ok: true, actor };
}

export function connectRoomActor(state, token, now = Date.now()) {
  cleanupExpiredRoomLeases(state, now);
  const playerId = state.tokenToPlayerId[token];
  const actor = playerId ? state.actors[playerId] : null;
  if (!actor) return { ok: false, code: 'expired-reservation' };
  actor.connected = true;
  actor.reservedUntil = null;
  actor.reconnectUntil = null;
  state.version += 1;
  return { ok: true, actor };
}

export function disconnectRoomActor(state, playerId, now = Date.now()) {
  const actor = state.actors[playerId];
  if (!actor) return { ok: false, code: 'unknown-player' };
  actor.connected = false;
  actor.reconnectUntil = now + MULTIPLAYER_RECONNECT_GRACE_MS;
  state.version += 1;
  return { ok: true, actor };
}

export function readyRoomActor(state, playerId, input = {}) {
  const actor = state.actors[playerId];
  if (!actor) return { ok: false, code: 'unknown-player' };
  if (input.zoneId !== MULTIPLAYER_FIXED_ZONE_ID) return { ok: false, code: 'zone-locked' };
  actor.sourceActorId = typeof input.sourceActorId === 'string' ? input.sourceActorId.slice(0, 160) : null;
  const pose = finitePose(input.pose);
  if (pose) actor.pose = pose;
  actor.zoneId = MULTIPLAYER_FIXED_ZONE_ID;
  state.version += 1;
  return { ok: true, actor };
}

export function updateRoomActorPose(state, playerId, input, now = Date.now()) {
  const actor = state.actors[playerId];
  if (!actor?.connected) return { ok: false, code: 'not-connected' };
  const sequence = Number(input?.sequence);
  if (!Number.isInteger(sequence) || sequence <= actor.lastPoseSequence) {
    return { ok: false, code: 'stale-sequence' };
  }
  if (actor.lastPoseAt && now - actor.lastPoseAt < MIN_POSE_INTERVAL_MS) {
    return { ok: false, code: 'pose-rate' };
  }
  if (input.zoneId !== MULTIPLAYER_FIXED_ZONE_ID) return { ok: false, code: 'zone-locked' };
  const pose = finitePose(input.pose);
  if (!pose) return { ok: false, code: 'invalid-pose' };
  if (Math.abs(pose.position.x) > COARSE_ZONE_BOUND || Math.abs(pose.position.z) > COARSE_ZONE_BOUND) {
    return { ok: false, code: 'outside-zone-bounds' };
  }
  actor.pose = pose;
  actor.motion = {
    speed: Math.max(0, Math.min(Number(input?.motion?.speed) || 0, ROLE_REPORTED_SPEED_CAPS[actor.roleId] || 8)),
    running: Boolean(input?.motion?.running),
    walking: Boolean(input?.motion?.walking),
  };
  actor.lastPoseAt = now;
  actor.lastPoseSequence = sequence;
  return { ok: true, actor };
}

export function communicateTortoiseIntent(state, playerId, intentId, now = Date.now()) {
  const actor = state.actors[playerId];
  if (!actor?.connected || actor.roleId !== 'tortoise') return { ok: false, code: 'not-tortoise' };
  const intent = getTortoiseCommunicationIntent(intentId);
  if (!intent) return { ok: false, code: 'invalid-intent' };
  if (now - actor.lastIntentAt < INTENT_COOLDOWN_MS) return { ok: false, code: 'intent-cooldown' };
  const darwin = Object.values(state.actors).find(candidate => candidate.roleId === 'darwin' && candidate.connected);
  if (!darwin) return { ok: false, code: 'darwin-unavailable' };
  if (darwin.zoneId !== actor.zoneId) return { ok: false, code: 'darwin-in-another-zone' };
  if (actor.pose && darwin.pose) {
    const distance = Math.hypot(
      actor.pose.position.x - darwin.pose.position.x,
      actor.pose.position.z - darwin.pose.position.z,
    );
    if (distance > INTENT_RANGE) return { ok: false, code: 'darwin-too-far' };
  }
  actor.lastIntentAt = now;
  actor.action = {
    id: intent.animationAction,
    startedAt: now,
    until: now + intent.duration * 1_000,
  };
  state.version += 1;
  return {
    ok: true,
    actor,
    darwin,
    event: {
      eventId: crypto.randomUUID(),
      actorId: actor.playerId,
      targetActorId: darwin.playerId,
      roleId: actor.roleId,
      displayName: actor.displayName,
      intentId: intent.id,
      text: intent.text,
      animationAction: intent.animationAction,
      duration: intent.duration,
      zoneId: actor.zoneId,
      at: now,
    },
  };
}
