import assert from 'node:assert/strict';

const baseUrl = String(process.env.MULTIPLAYER_SMOKE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.ok, true, JSON.stringify(data));
  assert.equal(data.ok, true, JSON.stringify(data));
  return data;
}

function openRoomSocket(session) {
  const socketUrl = baseUrl
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:');
  const socket = new WebSocket(`${socketUrl}/rooms/${session.roomCode}/socket?token=${session.token}`);
  const messages = [];
  const waiters = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    messages.push(message);
    waiters.splice(0).forEach(waiter => waiter());
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const waitFor = async (type, timeoutMs = 4_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = messages.find(message => message.type === type);
      if (found) return found;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), Math.max(1, deadline - Date.now()));
        waiters.push(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    throw new Error(`Timed out waiting for ${type}`);
  };
  return { socket, opened, waitFor };
}

const darwin = await post('/rooms', { roleId: 'darwin', displayName: 'Charles' });
const tortoise = await post(`/rooms/${darwin.roomCode}/join`, { roleId: 'tortoise', displayName: 'Harriet' });
assert.equal(tortoise.roomCode, darwin.roomCode);

const darwinClient = openRoomSocket(darwin);
const tortoiseClient = openRoomSocket(tortoise);
await Promise.all([darwinClient.opened, tortoiseClient.opened]);
await Promise.all([
  darwinClient.waitFor('room.snapshot'),
  tortoiseClient.waitFor('room.snapshot'),
]);

const ready = (socket, roleId, sourceActorId, x) => socket.send(JSON.stringify({
  v: 1,
  type: 'actor.ready',
  zoneId: 'POST_OFFICE_BAY',
  sourceActorId,
  pose: {
    position: { x, y: 1, z: 7 },
    facing: { x: roleId === 'darwin' ? 1 : -1, y: 0, z: 0 },
  },
}));
ready(darwinClient.socket, 'darwin', null, 0);
ready(tortoiseClient.socket, 'tortoise', 'POST_OFFICE_BAY:floreanagianttortoise:0', 2);

await new Promise(resolve => setTimeout(resolve, 100));
tortoiseClient.socket.send(JSON.stringify({
  v: 1,
  type: 'actor.intent',
  commandId: crypto.randomUUID(),
  intentId: 'curious_look',
}));
const observed = await darwinClient.waitFor('actor.intent');
assert.equal(observed.event.text, 'The tortoise looks at you curiously.');
assert.equal(observed.event.targetActorId, darwin.playerId);

darwinClient.socket.close(1000, 'smoke complete');
tortoiseClient.socket.close(1000, 'smoke complete');
console.log(`Live multiplayer smoke passed for room ${darwin.roomCode}.`);
