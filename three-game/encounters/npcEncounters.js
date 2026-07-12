import { getNpcPoses } from '../world/npcRuntime';

export const NPC_ENCOUNTERS = {
  syms_covington: {
    npcId: 'syms_covington',
    name: 'Syms Covington',
    runtimeNpcId: 'syms',
    zones: ['POST_OFFICE_BAY', 'BEAGLE'],
    radius: 2.45,
    portrait: '/portraits/syms_covington.jpg',
    opener: '“I have the labels and the bag ready, sir. What is wanted?”',
    suggestedReplies: [
      'What have you noticed here?',
      'Let us review the specimens we have gathered.',
    ],
    ambient: {
      nearby: 'Syms keeps the label book open in one hand and watches the shore for work that needs doing.',
      collected: 'Syms crouches over the specimen bag, arranging the new acquisition with labels and twine.',
      startled: 'Syms steps aside from the commotion, keeping one hand over the specimen case.',
    },
    allowedFlags: [
      'discussed_specimens',
      'discussed_island_conditions',
      'discussed_shipboard_work',
      'offered_practical_help',
    ],
  },
};

export function getNpcEncounter(npcId) {
  return NPC_ENCOUNTERS[npcId] || null;
}

export function getNearestNpcEncounter(zoneId, position) {
  if (!zoneId || !position) return null;
  const poses = getNpcPoses(zoneId);
  if (!poses) return null;
  let nearest = null;
  for (const encounter of Object.values(NPC_ENCOUNTERS)) {
    if (!encounter.zones.includes(zoneId)) continue;
    const pose = poses.get(encounter.runtimeNpcId);
    if (!pose) continue;
    const distance = Math.hypot((position.x || 0) - pose.x, (position.z || 0) - pose.z);
    if (distance > encounter.radius || (nearest && distance >= nearest.distance)) continue;
    nearest = { ...encounter, distance, pose };
  }
  return nearest;
}

export function encounterAmbientLine(npcId, event = 'nearby') {
  return getNpcEncounter(npcId)?.ambient?.[event] || null;
}
