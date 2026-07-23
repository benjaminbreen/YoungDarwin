import { normalizeRoomCode } from '../../game-core/multiplayer/protocol';

export function multiplayerServiceUrl() {
  const configured = String(process.env.NEXT_PUBLIC_MULTIPLAYER_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return 'http://127.0.0.1:8787';
  }
  return '';
}

async function roomRequest(path, body) {
  const baseUrl = multiplayerServiceUrl();
  if (!baseUrl) throw new Error('multiplayer-not-configured');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ ok: false, code: 'invalid-service-response' }));
  if (!response.ok || !data.ok) {
    const error = new Error(data.code || `multiplayer-http-${response.status}`);
    error.code = data.code;
    throw error;
  }
  return { ...data, serviceUrl: baseUrl };
}

export function createMultiplayerRoom({ roleId, displayName }) {
  return roomRequest('/rooms', { roleId, displayName, capacity: 20 });
}

export function joinMultiplayerRoom({ roomCode, roleId, displayName }) {
  const normalized = normalizeRoomCode(roomCode);
  if (normalized.length !== 6) return Promise.reject(new Error('invalid-room-code'));
  return roomRequest(`/rooms/${normalized}/join`, { roleId, displayName });
}

export function multiplayerSocketUrl(session) {
  const base = String(session?.serviceUrl || multiplayerServiceUrl()).replace(/\/$/, '');
  const socketBase = base.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  return `${socketBase}/rooms/${encodeURIComponent(session.roomCode)}/socket?token=${encodeURIComponent(session.token)}`;
}
