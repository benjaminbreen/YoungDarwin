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
    opener: '“I have the collecting case ready, sir. What is wanted?”',
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
  // The Vice-Governor is the reason the expedition has a question to answer.
  // The real Lawson told Darwin the tortoises differed from island to island
  // and that he could name the island from the shell; Darwin, by his own
  // account, "did not for some time pay sufficient attention to this
  // statement." Asking him about tortoises is how a player is handed the idea
  // the two-landings objective is asking them to test.
  nicolas_lawson: {
    npcId: 'nicolas_lawson',
    name: 'Nicolás Lawson',
    runtimeNpcId: 'lawson',
    modelAssetId: 'lawson',
    // Outside his own front door at the settlement. He belongs indoors too, but
    // interior placement needs blueprint coordinates — see npcPlacements.
    zones: ['PENAL_COLONY'],
    travelsWithPlayer: false,
    radius: 2.6,
    portrait: '/portraits/nicolas_lawson.jpg',
    opener: '“Darwin, is it? The geologist. I was glad to have met you and your Captain at the bay yesterday — one is starved of news here. Has FitzRoy answered my invitation to dine?”',
    suggestedReplies: [
      'What can you tell me of the tortoises?',
      'How does the colony feed itself?',
    ],
    ambient: {
      nearby: 'Lawson stands where he can be seen from the whole clearing, hands behind his back.',
      collected: 'Lawson watches the specimen go into the case and says nothing, which is its own remark.',
      startled: 'Lawson does not move, and looks instead at whoever else did.',
    },
    allowedFlags: [
      'named_the_tortoise_difference',
      'discussed_colony_supply',
      'discussed_natural_history',
      'offended_by_politics',
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
  if (npcId === 'nicolas_lawson') {
    // Offence outranks everything else he might otherwise be pleased about.
    if (flags.has('offended_by_politics') || trust < 40) {
      return {
        ...encounter,
        opener: '“You again. I will say plainly that I do not care to discuss the settlers a second time. Ask me about the animals, or ask me nothing.”',
        suggestedReplies: ['What can you tell me of the tortoises?', 'I meant no offence.'],
      };
    }
    if (flags.has('named_the_tortoise_difference')) {
      return {
        ...encounter,
        opener: '“Back again. You have been thinking about the shells, I expect. Everybody does, once it is pointed out to them.”',
        suggestedReplies: ['Tell me again about the tortoise shells.', 'How does the colony feed itself?'],
      };
    }
    return encounter;
  }
  if (npcId !== 'syms_covington') return encounter;
  if (flags.has('offered_practical_help')) {
    return {
      ...encounter,
      opener: '“I have put the collecting things where you can reach them, sir. What shall we make of the day?”',
      suggestedReplies: ['What work needs doing next?', 'Let us review the specimens we have gathered.'],
    };
  }
  if (flags.has('discussed_specimens') || trust >= 60) {
    return {
      ...encounter,
      opener: '“The specimen case is in better order than yesterday, sir. I have been thinking about the specimens.”',
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
    return 'Syms has already made the collecting case ready, anticipating the next task.';
  }
  return encounter?.ambient?.[event] || null;
}

// Lawson answers on natural history and on the running of the colony, and
// closes hard on the settlers. The tortoise branch is the one that matters:
// it is the claim the expedition exists to test, and it has to be reachable by
// asking the obvious question rather than by guessing a keyword.
function lawsonReply(input) {
  if (/tortoise|turtle|shell|galapago/.test(input)) {
    return {
      dialogue: '“The tortoises? I can do better than describe them, sir — bring me a shell from any island in this group and I will name you the island it came from. They differ. Charles Island beasts are not the beasts of Albemarle, nor of Chatham, and any man who has victualled a ship here knows it. It is a talent of mine, long cultivated.”',
      trustDelta: 2,
      flags: ['named_the_tortoise_difference'],
    };
  }
  if (/prison|convict|settler|politic|crime|punish|flog|escape|banish/.test(input)) {
    return {
      dialogue: '“They are not prisoners, sir, they are settlers, and they are fortunate to be alive and at liberty. In Britain you would have packed them into a workhouse or shipped them to New South Wales. I would take it kindly if you did not raise the subject again, nor raise it with them.”',
      trustDelta: -3,
      flags: ['offended_by_politics'],
    };
  }
  if (/food|feed|supply|supplies|water|provision|crop|garden|whaler|ship|trade/.test(input)) {
    return {
      dialogue: '“We feed ourselves and we feed the whalers, which is the more profitable half of it. Sweet potato, plantain, and as much tortoise meat as a crew can strike below. The springs in the highland keep the settlement alive; below them the island is dry as a biscuit.”',
      trustDelta: 1,
      flags: ['discussed_colony_supply'],
    };
  }
  if (/bird|finch|mockingbird|iguana|plant|animal|specimen|collect|natural/.test(input)) {
    return {
      dialogue: '“Take what you like of it. The small birds are so tame you may knock them down with a hat, which says something about how long men have been absent. The iguanas keep to the black rock on the coast. Mind the manzanillo — the settlers will show you which tree it is, and you should believe them.”',
      trustDelta: 1,
      flags: ['discussed_natural_history'],
    };
  }
  return {
    dialogue: '“I have governed here long enough to know the island better than the charts do, and the charts are mine. Ask me something particular, sir, and I will answer it particularly.”',
    trustDelta: 0,
    flags: [],
  };
}

export function getAuthoredNpcReply(npcId, playerInput, context = {}) {
  const input = String(playerInput || '').toLowerCase();
  if (npcId === 'nicolas_lawson') return lawsonReply(input);
  if (npcId !== 'syms_covington') return null;
  if (input.includes('specimen') || input.includes('gather')) {
    const count = Math.max(0, Number(context.specimenCount) || 0);
    return {
      dialogue: count
        ? `“There are ${count} entries in order, sir. The locality and date matter nearly as much as the object itself.”`
        : '“The case is empty yet, sir. Better one sound specimen with its place and date than a dozen without them.”',
      trustDelta: 1,
      flags: ['discussed_specimens'],
    };
  }
  if (input.includes('work') || input.includes('next')) {
    return {
      dialogue: '“The collecting case is ready. I should take the higher ground slowly and mark the place of anything unfamiliar before disturbing it.”',
      trustDelta: 1,
      flags: ['offered_practical_help'],
    };
  }
  return {
    dialogue: '“The ground changes quickly here, sir—bare lava below, greener country above. The creatures seem to keep to their own parts of it.”',
    trustDelta: 1,
    flags: ['discussed_island_conditions'],
  };
}
