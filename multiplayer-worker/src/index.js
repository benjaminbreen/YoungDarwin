import {
  MULTIPLAYER_ABSOLUTE_ROOM_CAPACITY,
  MULTIPLAYER_GLOBAL_CAPACITY,
  MULTIPLAYER_PROTOCOL_VERSION,
  MULTIPLAYER_RESERVATION_MS,
  isMultiplayerRole,
  multiplayerMessage,
  normalizeRoomCode,
  parseMultiplayerMessage,
  sanitizeMultiplayerName,
} from '../../game-core/multiplayer/protocol.js';
import {
  cleanupExpiredRoomLeases,
  communicateTortoiseIntent,
  connectRoomActor,
  createRoomState,
  disconnectRoomActor,
  publicActor,
  publicRoomSnapshot,
  readyRoomActor,
  releaseRoomLease,
  reserveRoomRole,
  updateRoomActorPose,
} from './roomState.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...configured,
  ]);
}

function loopbackDevelopmentOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function originAllowed(request, env) {
  const origin = request.headers.get('origin');
  return !origin || allowedOrigins(env).has(origin) || loopbackDevelopmentOrigin(origin);
}

function withCors(response, request, env) {
  const origin = request.headers.get('origin');
  const headers = new Headers(response.headers);
  if (origin && (allowedOrigins(env).has(origin) || loopbackDevelopmentOrigin(origin))) {
    headers.set('access-control-allow-origin', origin);
  }
  headers.set('vary', 'Origin');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readJson(request) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > 4_096) throw new Error('request-too-large');
  const raw = await request.text();
  if (raw.length > 4_096) throw new Error('request-too-large');
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new Error('invalid-json');
  }
}

function randomRoomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}

function roomStub(env, roomCode) {
  return env.EXPEDITION_ROOMS.get(env.EXPEDITION_ROOMS.idFromName(roomCode));
}

function admissionStub(env) {
  return env.ADMISSION.get(env.ADMISSION.idFromName('global-v1'));
}

async function internalJson(stub, path, body = null) {
  const response = await stub.fetch(`https://internal${path}`, {
    method: body == null ? 'GET' : 'POST',
    headers: body == null ? undefined : { 'content-type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

async function createRoom(request, env) {
  const body = await readJson(request);
  if (!isMultiplayerRole(body.roleId)) return json({ ok: false, code: 'invalid-role' }, { status: 400 });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = randomRoomCode();
    const admission = await claimDeploymentSeat(env, roomCode);
    if (!admission.ok) return admission.response;
    const room = roomStub(env, roomCode);
    const initialized = await internalJson(room, '/initialize', {
      roomCode,
      capacity: Math.min(
        MULTIPLAYER_ABSOLUTE_ROOM_CAPACITY,
        Math.max(2, Number(body.capacity) || 20),
      ),
    });
    if (!initialized.data.ok) {
      await releaseDeploymentSeat(env, admission.token);
      continue;
    }
    return reserveClaimedSeat(env, roomCode, body, admission);
  }
  return json({ ok: false, code: 'room-code-exhausted' }, { status: 503 });
}

async function joinRoom(request, env, roomCode) {
  const body = await readJson(request);
  if (!isMultiplayerRole(body.roleId)) return json({ ok: false, code: 'invalid-role' }, { status: 400 });
  const admission = await claimDeploymentSeat(env, roomCode);
  if (!admission.ok) return admission.response;
  return reserveClaimedSeat(env, roomCode, body, admission);
}

async function claimDeploymentSeat(env, roomCode) {
  const token = crypto.randomUUID();
  const playerId = crypto.randomUUID();
  const expiresAt = Date.now() + MULTIPLAYER_RESERVATION_MS;
  const admission = await internalJson(admissionStub(env), '/claim', {
    token,
    roomCode,
    playerId,
    expiresAt,
  });
  if (!admission.data.ok) {
    return {
      ok: false,
      response: json(admission.data, { status: 503, headers: { 'retry-after': '45' } }),
    };
  }
  return { ok: true, token, playerId, expiresAt };
}

function releaseDeploymentSeat(env, token) {
  return internalJson(admissionStub(env), '/release', { token });
}

async function reserveClaimedSeat(env, roomCode, body, admission) {
  const room = roomStub(env, roomCode);
  const reservation = await internalJson(room, '/reserve', {
    roleId: body.roleId,
    displayName: sanitizeMultiplayerName(body.displayName),
    token: admission.token,
    playerId: admission.playerId,
  });
  if (!reservation.data.ok) {
    await releaseDeploymentSeat(env, admission.token);
    const status = reservation.data.code === 'room-not-found' ? 404 : 409;
    return json(reservation.data, { status });
  }

  return json({
    ok: true,
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    roomCode,
    playerId: reservation.data.playerId,
    roleId: body.roleId,
    token: reservation.data.token,
    expiresAt: reservation.data.expiresAt,
  });
}

async function routeRequest(request, env) {
  if (!originAllowed(request, env)) return json({ ok: false, code: 'origin-not-allowed' }, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ ok: true, service: 'young-darwin-multiplayer', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION });
  }
  if (request.method === 'POST' && url.pathname === '/rooms') return createRoom(request, env);

  const joinMatch = url.pathname.match(/^\/rooms\/([A-Z2-9]{6})\/join$/);
  if (request.method === 'POST' && joinMatch) return joinRoom(request, env, joinMatch[1]);

  const socketMatch = url.pathname.match(/^\/rooms\/([A-Z2-9]{6})\/socket$/);
  if (request.method === 'GET' && socketMatch) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return json({ ok: false, code: 'websocket-required' }, { status: 426 });
    }
    return roomStub(env, socketMatch[1]).fetch(request);
  }

  return json({ ok: false, code: 'not-found' }, { status: 404 });
}

export default {
  async fetch(request, env) {
    try {
      const response = await routeRequest(request, env);
      if (response.webSocket) return response;
      return withCors(response, request, env);
    } catch (error) {
      return withCors(json({ ok: false, code: error?.message || 'internal-error' }, { status: 500 }), request, env);
    }
  },
};

export class AdmissionCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async load() {
    return (await this.ctx.storage.get('leases')) || {};
  }

  async save(leases) {
    await this.ctx.storage.put('leases', leases);
    const expiries = Object.values(leases).map(lease => lease.expiresAt).filter(Number.isFinite);
    if (expiries.length) await this.ctx.storage.setAlarm(Math.min(...expiries));
  }

  cleanup(leases, now = Date.now()) {
    Object.entries(leases).forEach(([token, lease]) => {
      if (lease.expiresAt && lease.expiresAt <= now) delete leases[token];
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await readJson(request) : {};
    const leases = await this.load();
    this.cleanup(leases);

    if (url.pathname === '/claim') {
      if (leases[body.token]) return json({ ok: true });
      if (Object.keys(leases).length >= MULTIPLAYER_GLOBAL_CAPACITY) {
        await this.save(leases);
        return json({ ok: false, code: 'deployment-full' }, { status: 503 });
      }
      leases[body.token] = {
        token: body.token,
        roomCode: body.roomCode,
        playerId: body.playerId,
        expiresAt: Number(body.expiresAt) || Date.now() + MULTIPLAYER_RESERVATION_MS,
      };
      await this.save(leases);
      return json({ ok: true });
    }
    if (url.pathname === '/activate') {
      const lease = leases[body.token];
      if (!lease) return json({ ok: false, code: 'unknown-lease' }, { status: 404 });
      lease.expiresAt = null;
      await this.save(leases);
      return json({ ok: true });
    }
    if (url.pathname === '/release') {
      delete leases[body.token];
      await this.save(leases);
      return json({ ok: true });
    }
    return json({ ok: false, code: 'not-found' }, { status: 404 });
  }

  async alarm() {
    const leases = await this.load();
    this.cleanup(leases);
    await this.save(leases);
  }
}

export class ExpeditionRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = null;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get('room')) || null;
    });
  }

  async persist() {
    if (this.state) await this.ctx.storage.put('room', this.state);
  }

  async releaseGlobal(token) {
    await internalJson(admissionStub(this.env), '/release', { token });
  }

  send(socket, message) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // A concurrently closing peer will be handled by webSocketClose.
    }
  }

  broadcast(message, exceptPlayerId = null) {
    this.ctx.getWebSockets().forEach(socket => {
      const attachment = socket.deserializeAttachment();
      if (exceptPlayerId && attachment?.playerId === exceptPlayerId) return;
      this.send(socket, message);
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (url.pathname === '/initialize') {
      const body = await readJson(request);
      if (this.state) return json({ ok: false, code: 'room-exists' }, { status: 409 });
      this.state = createRoomState(normalizeRoomCode(body.roomCode), Date.now(), body.capacity);
      await this.persist();
      return json({ ok: true });
    }
    if (!this.state) return json({ ok: false, code: 'room-not-found' }, { status: 404 });

    if (url.pathname === '/reserve') {
      const body = await readJson(request);
      const result = reserveRoomRole(this.state, body);
      if (result.ok) {
        await this.persist();
        await this.ctx.storage.setAlarm(result.actor.reservedUntil);
      }
      return json(result.ok ? {
        ok: true,
        token: result.token,
        playerId: result.playerId,
        expiresAt: result.actor.reservedUntil,
      } : result, { status: result.ok ? 200 : 409 });
    }
    if (url.pathname === '/release') {
      const body = await readJson(request);
      const result = releaseRoomLease(this.state, body.token);
      if (result.ok) await this.persist();
      return json(result);
    }
    if (url.pathname !== `/rooms/${this.state.roomCode}/socket`) {
      return json({ ok: false, code: 'not-found' }, { status: 404 });
    }

    const token = url.searchParams.get('token');
    const connected = connectRoomActor(this.state, token);
    if (!connected.ok) return json(connected, { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.getWebSockets().forEach(socket => {
      const attachment = socket.deserializeAttachment();
      if (attachment?.playerId === connected.actor.playerId) socket.close(4001, 'Reconnected elsewhere');
    });
    server.serializeAttachment({ playerId: connected.actor.playerId, token });
    this.ctx.acceptWebSocket(server);
    await internalJson(admissionStub(this.env), '/activate', { token });
    await this.persist();
    this.send(server, multiplayerMessage('room.snapshot', {
      selfPlayerId: connected.actor.playerId,
      room: publicRoomSnapshot(this.state),
    }));
    this.broadcast(multiplayerMessage('room.presence', {
      kind: 'connected',
      actor: publicActor(connected.actor),
      roomVersion: this.state.version,
    }), connected.actor.playerId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, rawMessage) {
    await this.ready;
    const message = parseMultiplayerMessage(rawMessage);
    const attachment = socket.deserializeAttachment();
    const playerId = attachment?.playerId;
    if (!message || !playerId) {
      this.send(socket, multiplayerMessage('command.error', { code: 'invalid-message' }));
      return;
    }

    if (message.type === 'actor.ready') {
      const result = readyRoomActor(this.state, playerId, message);
      if (!result.ok) return this.send(socket, multiplayerMessage('command.error', { code: result.code }));
      await this.persist();
      this.broadcast(multiplayerMessage('actor.ready', {
        actor: publicActor(result.actor),
        roomVersion: this.state.version,
      }));
      return;
    }
    if (message.type === 'actor.pose') {
      const result = updateRoomActorPose(this.state, playerId, message);
      if (!result.ok) {
        if (result.code !== 'stale-sequence' && result.code !== 'pose-rate') {
          this.send(socket, multiplayerMessage('command.error', { code: result.code }));
        }
        return;
      }
      this.broadcast(multiplayerMessage('actor.pose', {
        playerId,
        zoneId: result.actor.zoneId,
        sequence: result.actor.lastPoseSequence,
        pose: result.actor.pose,
        motion: result.actor.motion,
      }), playerId);
      return;
    }
    if (message.type === 'actor.intent') {
      const result = communicateTortoiseIntent(this.state, playerId, message.intentId);
      if (!result.ok) return this.send(socket, multiplayerMessage('command.error', { code: result.code, commandId: message.commandId }));
      await this.persist();
      this.broadcast(multiplayerMessage('actor.intent', {
        commandId: message.commandId,
        roomVersion: this.state.version,
        event: result.event,
      }));
      return;
    }
    this.send(socket, multiplayerMessage('command.error', { code: 'unknown-command' }));
  }

  async webSocketClose(socket) {
    await this.ready;
    const attachment = socket.deserializeAttachment();
    const playerId = attachment?.playerId;
    if (!playerId || !this.state?.actors[playerId]) return;
    const otherSocket = this.ctx.getWebSockets().some(candidate => (
      candidate !== socket && candidate.deserializeAttachment()?.playerId === playerId
    ));
    if (otherSocket) return;
    const result = disconnectRoomActor(this.state, playerId);
    if (!result.ok) return;
    await this.persist();
    await this.ctx.storage.setAlarm(result.actor.reconnectUntil);
    this.broadcast(multiplayerMessage('room.presence', {
      kind: 'reconnecting',
      actor: publicActor(result.actor),
      roomVersion: this.state.version,
    }));
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }

  async alarm() {
    await this.ready;
    if (!this.state) return;
    const released = cleanupExpiredRoomLeases(this.state);
    for (const lease of released) await this.releaseGlobal(lease.token);
    if (released.length) {
      await this.persist();
      released.forEach(lease => this.broadcast(multiplayerMessage('room.presence', {
        kind: 'released',
        playerId: lease.playerId,
        roomVersion: this.state.version,
      })));
    }
    const nextExpiry = Object.values(this.state.actors)
      .flatMap(actor => [actor.reservedUntil, actor.reconnectUntil])
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    if (nextExpiry) await this.ctx.storage.setAlarm(nextExpiry);
  }
}
