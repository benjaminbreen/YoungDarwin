import { multiplayerMessage, parseMultiplayerMessage } from '../../game-core/multiplayer/protocol';
import { multiplayerSocketUrl } from './roomApi';

const RECONNECT_DELAYS_MS = [600, 1_200, 2_400, 4_000, 8_000];

function actorRuntime(actor) {
  return {
    ...actor,
    pose: actor.pose || null,
    targetPose: actor.pose || null,
    targetReceivedAt: performance.now(),
    action: actor.action || null,
  };
}

export class MultiplayerClient {
  constructor(session) {
    this.session = session;
    this.socket = null;
    this.closed = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.sequence = 0;
    this.readyPayload = null;
    this.actors = new Map();
    this.actorSnapshot = [];
    this.events = [];
    this.listeners = new Set();
    this.snapshot = {
      status: 'connecting',
      roomCode: session.roomCode,
      playerId: session.playerId,
      roleId: session.roleId,
      actors: this.actorSnapshot,
      events: this.events,
      error: null,
    };
  }

  subscribe = listener => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  emit(patch = {}) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }

  rebuildActorSnapshot() {
    this.actorSnapshot = Array.from(this.actors.values());
    this.emit({ actors: this.actorSnapshot });
  }

  setReadyPayload(payload) {
    this.readyPayload = payload;
    this.send(multiplayerMessage('actor.ready', payload));
  }

  connect() {
    // React development mode deliberately replays effects (setup, cleanup,
    // setup). Treat a new connect call as a fresh lifecycle so that the cleanup
    // from the first pass does not permanently poison this client instance.
    this.closed = false;
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    this.emit({ status: this.reconnectAttempt ? 'reconnecting' : 'connecting', error: null });
    const socket = new WebSocket(multiplayerSocketUrl(this.session));
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.emit({ status: 'connected', error: null });
      if (this.readyPayload) this.send(multiplayerMessage('actor.ready', this.readyPayload));
    });
    socket.addEventListener('message', event => this.receive(event.data));
    socket.addEventListener('close', event => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.closed) return;
      this.scheduleReconnect(event.code === 4001 ? 'Session opened in another tab.' : null);
    });
    socket.addEventListener('error', () => {
      if (this.socket === socket) this.emit({ status: 'reconnecting', error: 'Realtime connection interrupted.' });
    });
  }

  scheduleReconnect(error = null) {
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.emit({ status: 'reconnecting', error });
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  close() {
    this.closed = true;
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close(1000, 'Client left room');
    this.socket = null;
    this.emit({ status: 'closed' });
  }

  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  sendPose({ zoneId, pose, motion }) {
    this.sequence += 1;
    return this.send(multiplayerMessage('actor.pose', {
      sequence: this.sequence,
      zoneId,
      pose,
      motion,
    }));
  }

  sendIntent(intentId) {
    const commandId = crypto.randomUUID();
    this.emit({ error: null });
    const sent = this.send(multiplayerMessage('actor.intent', { commandId, intentId }));
    if (!sent) this.emit({ error: 'The room connection is not ready.' });
    return sent;
  }

  upsertActor(actor, notify = true) {
    if (!actor?.playerId) return null;
    const existing = this.actors.get(actor.playerId);
    if (existing) {
      Object.assign(existing, actor);
      if (actor.pose) {
        existing.targetPose = actor.pose;
        existing.targetReceivedAt = performance.now();
      }
    } else {
      this.actors.set(actor.playerId, actorRuntime(actor));
    }
    if (notify) this.rebuildActorSnapshot();
    return this.actors.get(actor.playerId);
  }

  receive(raw) {
    const message = parseMultiplayerMessage(raw);
    if (!message) return;
    if (message.type === 'room.snapshot') {
      this.actors = new Map((message.room?.actors || []).map(actor => [actor.playerId, actorRuntime(actor)]));
      this.rebuildActorSnapshot();
      return;
    }
    if (message.type === 'room.presence' || message.type === 'actor.ready') {
      if (message.kind === 'released' && message.playerId) {
        this.actors.delete(message.playerId);
        this.rebuildActorSnapshot();
        return;
      }
      if (message.actor) this.upsertActor(message.actor);
      return;
    }
    if (message.type === 'actor.pose') {
      const actor = this.actors.get(message.playerId);
      if (!actor) return;
      actor.zoneId = message.zoneId;
      actor.targetPose = message.pose;
      actor.targetReceivedAt = performance.now();
      actor.motion = message.motion || actor.motion;
      return;
    }
    if (message.type === 'actor.intent') {
      const event = message.event;
      const actor = this.actors.get(event?.actorId);
      if (actor && event) {
        actor.action = {
          id: event.animationAction,
          startedAt: event.at,
          until: event.at + event.duration * 1_000,
        };
      }
      if (event?.targetActorId === this.session.playerId) {
        this.events = [...this.events.slice(-7), event];
        this.emit({ events: this.events, error: null });
      } else {
        this.emit({ error: null });
      }
      return;
    }
    if (message.type === 'command.error') {
      this.emit({ error: message.code || 'The room rejected that action.' });
    }
  }
}
