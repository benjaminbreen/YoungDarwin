// Where stationary NPCs stand, per zone.
//
// Syms walks a plan (symsActivityPlan) because he follows the player around.
// Everyone else so far keeps to one place, which needs a position and a facing
// and nothing more. Keeping that in a table rather than a component means the
// next NPC is a few lines of data instead of another 600-line actor.
//
// `resolve` runs at mount and may read the region layout, so a placement can be
// pinned to authored geometry (a door, a fence gate) instead of a magic number
// that silently drifts when the layout moves.
import { getGovernorHouseFrontEntry } from '../world/penalColonyLayout';

const PLACEMENTS = {
  nicolas_lawson: {
    runtimeNpcId: 'lawson',
    zones: {
      // Outside his own front door, a pace to the side so he is not standing in
      // the doorway the player needs to walk through.
      PENAL_COLONY: () => {
        const entry = getGovernorHouseFrontEntry();
        return {
          x: entry.position.x + entry.facing.z * 1.15,
          z: entry.position.z - entry.facing.x * 1.15,
          facing: entry.facing,
        };
      },
      // No LAWSON_HOUSE placement yet. Interiors do not take their floor height
      // from `movementTerrainHeight`, so a spot in there needs coordinates read
      // off the house blueprint rather than guessed; an unverified one puts the
      // Vice-Governor inside a wall or under the boards.
    },
  },
};

export function getNpcPlacement(npcId, zoneId) {
  const entry = PLACEMENTS[npcId];
  const resolve = entry?.zones?.[zoneId];
  if (!resolve) return null;
  const spot = resolve();
  if (!spot || !Number.isFinite(spot.x) || !Number.isFinite(spot.z)) return null;
  const facing = spot.facing && Number.isFinite(spot.facing.x) && Number.isFinite(spot.facing.z)
    ? spot.facing
    : { x: 0, z: 1 };
  return { runtimeNpcId: entry.runtimeNpcId, x: spot.x, z: spot.z, facing };
}

// Every stationary NPC that could appear in this zone. Returns [] for most
// zones, which is why the actor list is cheap to mount everywhere.
export function getStationaryNpcsForZone(zoneId) {
  if (!zoneId) return [];
  const out = [];
  for (const [npcId, entry] of Object.entries(PLACEMENTS)) {
    if (!entry.zones[zoneId]) continue;
    out.push({ npcId, runtimeNpcId: entry.runtimeNpcId });
  }
  return out;
}
