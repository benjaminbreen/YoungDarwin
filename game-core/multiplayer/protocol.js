export const MULTIPLAYER_PROTOCOL_VERSION = 1;

export const MULTIPLAYER_ROLES = Object.freeze({
  darwin: Object.freeze({ id: 'darwin', label: 'Darwin', kind: 'human', unique: true }),
  tortoise: Object.freeze({ id: 'tortoise', label: 'Tortoise', kind: 'animal', unique: true }),
});

export const MULTIPLAYER_FIXED_ZONE_ID = 'POST_OFFICE_BAY';
export const MULTIPLAYER_NORMAL_ROOM_CAPACITY = 20;
export const MULTIPLAYER_ABSOLUTE_ROOM_CAPACITY = 30;
export const MULTIPLAYER_GLOBAL_CAPACITY = 30;
export const MULTIPLAYER_RESERVATION_MS = 60_000;
export const MULTIPLAYER_RECONNECT_GRACE_MS = 60_000;
export const MULTIPLAYER_POSE_TARGET_HZ = 10;
export const MULTIPLAYER_POSE_MAX_HZ = 15;

export function isMultiplayerRole(roleId) {
  return Boolean(MULTIPLAYER_ROLES[roleId]);
}

export function normalizeRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
}

export function sanitizeMultiplayerName(value, fallback = 'Explorer') {
  const normalized = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28);
  return normalized || fallback;
}

export function parseMultiplayerMessage(value) {
  let message = value;
  if (typeof value === 'string') {
    if (value.length > 4_096) return null;
    try {
      message = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  if (message.v !== MULTIPLAYER_PROTOCOL_VERSION || typeof message.type !== 'string') return null;
  return message;
}

export function finitePose(pose) {
  if (!pose || typeof pose !== 'object') return null;
  const position = pose.position || {};
  const facing = pose.facing || {};
  const values = [
    Number(position.x),
    Number(position.y),
    Number(position.z),
    Number(facing.x),
    Number(facing.y),
    Number(facing.z),
  ];
  if (!values.every(Number.isFinite)) return null;
  const facingLength = Math.hypot(values[3], values[4], values[5]);
  if (facingLength < 0.001) return null;
  return {
    position: { x: values[0], y: values[1], z: values[2] },
    facing: {
      x: values[3] / facingLength,
      y: values[4] / facingLength,
      z: values[5] / facingLength,
    },
  };
}

export function multiplayerMessage(type, payload = {}) {
  return {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    type,
    ...payload,
  };
}
