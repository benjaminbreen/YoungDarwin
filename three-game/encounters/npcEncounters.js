import { getNpcPoses } from '../world/npcRuntime';

export const NPC_ENCOUNTERS = {
  syms_covington: {
    npcId: 'syms_covington',
    name: 'Syms Covington',
    runtimeNpcId: 'syms',
    zones: ['POST_OFFICE_BAY', 'BEAGLE'],
    travelsWithPlayer: true,
    radius: 2.45,
    portrait: '/portraits/syms_covington.jpg',
    opener: '“I have the labels and twine ready, sir. What is wanted?”',
    suggestedReplies: [
      'What have you noticed here?',
      'Let us review the specimens we have gathered.',
    ],
    ambient: {
      nearby: 'Syms keeps the label book open in one hand and watches the ground for work that needs doing.',
      collected: 'Syms checks the locality note, wraps the new acquisition, and marks it for the collecting case.',
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

export function getNpcEncounterPresentation(npcId, relation = {}) {
  const encounter = getNpcEncounter(npcId);
  if (!encounter) return null;
  const flags = new Set(relation.flags || []);
  const trust = Math.max(0, Math.min(100, Number(relation.trust) || 50));
  if (npcId !== 'syms_covington') return encounter;
  if (flags.has('offered_practical_help')) {
    return {
      ...encounter,
      opener: '“I have put the labels, twine, and spare paper where you can reach them, sir. What shall we make of the day?”',
      suggestedReplies: ['What work needs doing next?', 'Let us review the specimens we have gathered.'],
    };
  }
  if (flags.has('discussed_specimens') || trust >= 60) {
    return {
      ...encounter,
      opener: '“The specimen case is in better order than yesterday, sir. I have been thinking about the labels.”',
      suggestedReplies: ['What have you noticed about the specimens?', 'What work needs doing next?'],
    };
  }
  return encounter;
}

export function clampNpcEncounterEffects(npcId, effects = {}) {
  const encounter = getNpcEncounter(npcId);
  if (!encounter) return { trustDelta: 0, flags: [] };
  const allowedFlags = new Set(encounter.allowedFlags || []);
  const flags = Array.isArray(effects.flags)
    ? effects.flags
      .map(flag => String(flag || '').replace(/^.*:/, '').replace(/[^a-z0-9_]/gi, '').toLowerCase())
      .filter(flag => allowedFlags.has(flag))
    : [];
  return {
    trustDelta: Math.max(-5, Math.min(5, Math.round(Number(effects.trustDelta) || 0))),
    flags: [...new Set(flags)],
  };
}

export function getNearestNpcEncounter(zoneId, position) {
  if (!zoneId || !position) return null;
  const poses = getNpcPoses(zoneId);
  if (!poses) return null;
  let nearest = null;
  for (const encounter of Object.values(NPC_ENCOUNTERS)) {
    if (!encounter.zones.includes(zoneId) && !encounter.travelsWithPlayer) continue;
    const pose = poses.get(encounter.runtimeNpcId);
    if (!pose) continue;
    const distance = Math.hypot((position.x || 0) - pose.x, (position.z || 0) - pose.z);
    if (distance > encounter.radius || (nearest && distance >= nearest.distance)) continue;
    nearest = { ...encounter, distance, pose };
  }
  return nearest;
}

export function encounterAmbientLine(npcId, event = 'nearby', relation = {}) {
  const encounter = getNpcEncounter(npcId);
  if (npcId === 'syms_covington' && event === 'nearby' && (relation.flags || []).includes('offered_practical_help')) {
    return 'Syms has already laid out twine and labels beside the collecting case, anticipating the next task.';
  }
  return encounter?.ambient?.[event] || null;
}
