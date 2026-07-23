import assert from 'node:assert/strict';
import {
  cleanupExpiredRoomLeases,
  communicateTortoiseIntent,
  connectRoomActor,
  createRoomState,
  disconnectRoomActor,
  readyRoomActor,
  reserveRoomRole,
  updateRoomActorPose,
} from '../multiplayer-worker/src/roomState.js';

const start = 10_000;
const room = createRoomState('TEST23', start, 3);
const darwinReservation = reserveRoomRole(room, {
  roleId: 'darwin',
  displayName: 'Charles',
  playerId: 'player-darwin',
  token: 'token-darwin',
}, start);
const tortoiseReservation = reserveRoomRole(room, {
  roleId: 'tortoise',
  displayName: 'Harriet',
  playerId: 'player-tortoise',
  token: 'token-tortoise',
}, start);

assert.equal(darwinReservation.ok, true);
assert.equal(tortoiseReservation.ok, true);
assert.deepEqual(reserveRoomRole(room, { roleId: 'darwin' }, start), { ok: false, code: 'role-taken' });
assert.equal(connectRoomActor(room, 'token-darwin', start + 50).ok, true);
assert.equal(connectRoomActor(room, 'token-tortoise', start + 50).ok, true);

const darwinReady = readyRoomActor(room, 'player-darwin', {
  zoneId: 'POST_OFFICE_BAY',
  pose: {
    position: { x: 0, y: 1, z: 7 },
    facing: { x: 0, y: 0, z: -1 },
  },
});
const tortoiseReady = readyRoomActor(room, 'player-tortoise', {
  zoneId: 'POST_OFFICE_BAY',
  sourceActorId: 'POST_OFFICE_BAY:floreanagianttortoise:0',
  pose: {
    position: { x: 2, y: 1, z: 7 },
    facing: { x: -1, y: 0, z: 0 },
  },
});
assert.equal(darwinReady.ok, true);
assert.equal(tortoiseReady.ok, true);

assert.equal(updateRoomActorPose(room, 'player-tortoise', {
  sequence: 1,
  zoneId: 'POST_OFFICE_BAY',
  pose: {
    position: { x: 2.1, y: 1, z: 7 },
    facing: { x: -1, y: 0, z: 0 },
  },
  motion: { speed: 0.6, walking: true },
}, start + 1_000).ok, true);

// Client terrain settling can change height substantially without implying
// impossible planar movement; the room never tries to reproduce terrain Y.
assert.equal(updateRoomActorPose(room, 'player-tortoise', {
  sequence: 2,
  zoneId: 'POST_OFFICE_BAY',
  pose: {
    position: { x: 2.1, y: 18, z: 7 },
    facing: { x: -1, y: 0, z: 0 },
  },
  motion: { speed: 0, walking: false },
}, start + 6_000).ok, true);

assert.deepEqual(updateRoomActorPose(room, 'player-tortoise', {
  sequence: 3,
  zoneId: 'POST_OFFICE_BAY',
  pose: {
    position: { x: 80, y: 1, z: 7 },
    facing: { x: -1, y: 0, z: 0 },
  },
}, start + 6_100), { ok: false, code: 'outside-zone-bounds' });

const intent = communicateTortoiseIntent(room, 'player-tortoise', 'curious_look', start + 8_000);
assert.equal(intent.ok, true);
assert.equal(intent.event.text, 'The tortoise looks at you curiously.');
assert.equal(intent.event.targetActorId, 'player-darwin');
assert.equal(room.actors['player-tortoise'].action.id, 'animalSignalCurious');

const disconnected = disconnectRoomActor(room, 'player-tortoise', start + 9_000);
assert.equal(disconnected.ok, true);
assert.equal(cleanupExpiredRoomLeases(room, start + 9_001).length, 0);
assert.deepEqual(cleanupExpiredRoomLeases(room, disconnected.actor.reconnectUntil + 1), [{
  playerId: 'player-tortoise',
  token: 'token-tortoise',
  roleId: 'tortoise',
}]);

console.log('Multiplayer room smoke tests passed.');
