import { getNpcPoses } from '../world/npcRuntime';
import { BEAGLE_CABIN_ZONE_ID } from '../interiors/interiorRegistry';
import { STOKES_ID, WELL_BOY_ID } from '../npcs/islandNpcSchedule';

export const FITZROY_NPC_ID = 'fitzroy';

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
    activity: 'Vice-Governor',
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
  [FITZROY_NPC_ID]: {
    npcId: FITZROY_NPC_ID,
    name: 'Captain Robert FitzRoy',
    runtimeNpcId: FITZROY_NPC_ID,
    modelAssetId: FITZROY_NPC_ID,
    activity: 'Captain of HMS Beagle',
    zones: [BEAGLE_CABIN_ZONE_ID],
    radius: 2.1,
    portrait: '/portraits/fitzroy.jpg',
    authoredOnly: true,
    opener: '“Mr Darwin. Have you found a landing where a boat can come in without striking those black rocks? Show me where on the chart.”',
    suggestedReplies: ['What are you marking on the chart?', 'When do we sail?'],
    recovery: {
      opener: '“Lie still a moment, Mr Darwin. Covington brought you aboard with the boat crew. There is water here. We can speak of the island when your hands stop shaking.”',
      suggestedReplies: ['Who brought me aboard?', 'When may I go ashore again?'],
    },
    ambient: {
      nearby: 'FitzRoy looks up, waiting to hear what Darwin has to report.',
    },
    allowedFlags: ['discussed_beagle_survey', 'discussed_beagle_departure', 'discussed_shipboard_recovery'],
  },
  maria: {
    npcId: 'maria',
    name: 'María de la Concepción',
    runtimeNpcId: 'maria',
    modelAssetId: 'maria',
    activity: 'Tending the garden',
    markerHeight: 2.07,
    zones: ['PENAL_COLONY', 'ASILO_SPRING', 'WATKINS_CREEK'],
    roaming: true,
    radius: 2.1,
    portrait: '/portraits/maria.jpg',
    authoredOnly: true,
    opener: '“Por el sendero, señor. Las guías del camote llegan hasta sus botas.”\n“Keep to the path, sir. The sweet potato vines reach right to your boots.”',
    suggestedReplies: [
      '¿Qué cultiva aquí?\nWhat do you grow here?',
      '¿Puedo recoger una mazorca?\nMay I pick an ear of maize?',
    ],
    ambient: {
      approached: 'María puts her work aside and comes over to meet you.',
      armed: 'María leaves the path when she sees the gun.',
    },
    allowedFlags: ['discussed_garden_crops', 'discussed_maize_harvest'],
  },
  gabriel_puig: {
    npcId: 'gabriel_puig',
    name: 'Gabriel Puig i Ferrer',
    runtimeNpcId: 'gabriel_puig',
    modelAssetId: 'gabriel',
    zones: [],
    roaming: true,
    radius: 2.1,
    portrait: '/portraits/gabriel_puig.jpg',
    authoredOnly: true,
    opener: '“Quédese ahí. ¿Viene de parte de Lawson?”\n“Stay there. Has Lawson sent you?”',
    suggestedReplies: ['No. I came to look at the island.', 'Why are you hiding from Lawson?'],
    ambient: {
      fled: 'A man in a work apron catches sight of you and runs.',
      startled: 'A man in a work apron backs away and watches your hands.',
      armed: 'Gabriel sees the gun and makes for cover.',
      gave_space: 'The man stops to look back once you give him room.',
      pursued: 'The man looks back, sees you following, and keeps running.',
      approached: 'Gabriel looks over the path, then walks over to you.',
    },
    allowedFlags: ['gabriel_first_sighting', 'gabriel_gave_space', 'gabriel_pursued', 'gabriel_kept_confidence', 'gabriel_discussed_press'],
  },
  [WELL_BOY_ID]: {
    npcId: WELL_BOY_ID,
    name: 'Boy at the Well',
    runtimeNpcId: WELL_BOY_ID,
    modelAssetId: 'wellBoy',
    zones: [],
    roaming: true,
    radius: 2.4,
    markerHeight: 1.62,
    portrait: '/portraits/well-boy.jpg',
    authoredOnly: true,
    opener: '“Despacio, señor. Si se queda quieto, vuelven.”\n“Slowly, sir. If you keep still, they’ll come back.”',
    suggestedReplies: ['What are you waiting for?', 'Where do you take the water?'],
    ambient: {
      waved_back: 'The boy lifts a hand to wave you back from the water.',
      armed: 'The boy sees the gun and runs back up the path.',
      waited_together: 'The boy makes room beside him. The doves are back on the bank.',
    },
    allowedFlags: ['rushed_the_well', 'waited_quietly_at_the_well'],
  },
  [STOKES_ID]: {
    npcId: STOKES_ID,
    name: 'John Lort Stokes',
    runtimeNpcId: STOKES_ID,
    modelAssetId: 'stokes',
    zones: [],
    roaming: true,
    radius: 2.3,
    portrait: '/portraits/john-lort-stokes.jpg',
    authoredOnly: true,
    opener: '“Darwin. Come and look at these folds. I’ve been trying to get them down on paper.”',
    suggestedReplies: ['What have you noticed about the lava?', 'What are you marking on your chart?'],
    ambient: {
      armed: 'Stokes moves clear of the gun.',
      approached: 'Stokes closes the chart against his coat and comes over.',
    },
    allowedFlags: ['compared_lava_with_stokes'],
  },
};

export function getNpcEncounter(npcId) {
  return NPC_ENCOUNTERS[npcId] || null;
}

export function getNpcEncounterPresentation(npcId, relation = {}, { zoneId, activity } = {}) {
  const encounter = getNpcEncounter(npcId);
  if (!encounter) return null;
  const flags = new Set(relation.flags || []);
  const trust = Math.max(0, Math.min(100, Number(relation.trust) || 50));
  if (npcId === WELL_BOY_ID) {
    const atWater = activity === 'Waiting for doves by the water' || activity === 'Making room by the water';
    return {
      ...encounter,
      opener: atWater && flags.has('waited_quietly_at_the_well')
        ? '“¿Los ve? Desde aquí se ve dónde beben.”\n“Do you see them? From here you can see where they drink.”'
        : atWater && flags.has('rushed_the_well')
        ? '“Ahora espere aquí conmigo. Van a volver.”\n“Wait here with me this time. They’ll be back.”'
        : atWater ? encounter.opener
          : '“¿Necesita agua, señor? Voy con el balde.”\n“Do you need water, sir? I’m on my way with the pail.”',
    };
  }
  if (npcId === STOKES_ID && zoneId === 'PENAL_COLONY') {
    return { ...encounter, opener: '“Darwin. I’m taking the southern path to look at the lava. Have you been that way yet?”' };
  }
  if (npcId === STOKES_ID && zoneId === 'S_VOLCANIC') {
    return {
      ...encounter,
      opener: activity === 'Pausing the survey in the rain'
        ? '“Hold a moment, Darwin. The paper won’t take another drop. We can still see the ridges from here.”'
        : activity === 'Showing Darwin the lava ridges'
          ? '“Here. Look back the way we came. See where the folds turn?”'
          : encounter.opener,
      suggestedReplies: [...encounter.suggestedReplies, 'Can you show me the lava ridge?'],
    };
  }
  if (npcId === 'gabriel_puig' && flags.has('gabriel_kept_confidence') && trust >= 50) {
    return {
      ...encounter,
      opener: '“Ah, usted. Hablemos bajo.”\n“Ah, it’s you. Let’s speak quietly.”',
      suggestedReplies: ['What do you print here?', 'How do you get down to the bay?'],
    };
  }
  if (npcId === 'gabriel_puig' && flags.has('gabriel_pursued')) {
    return {
      ...encounter,
      opener: '“La última vez me siguió. Dígame qué quiere desde ahí.”\n“You followed me last time. Tell me what you want from there.”',
      suggestedReplies: ['I should have given you room.', ...encounter.suggestedReplies],
    };
  }
  if (npcId === 'maria' && zoneId && zoneId !== 'PENAL_COLONY') {
    const creek = zoneId === 'WATKINS_CREEK';
    return {
      ...encounter,
      opener: creek
        ? '“Busco lo que crece junto al agua. Mire debajo de las piedras.”\n“I’m looking for what grows close to the water. Look underneath the stones.”'
        : '“Pise en piedra firme. La orilla del manantial cede con el peso.”\n“Step on firm stone. The bank by the spring gives under your weight.”',
      suggestedReplies: [
        creek ? 'What grows along the creek?' : 'What do you use the spring water for?',
        'What do you grow in the settlement?',
      ],
    };
  }
  if (npcId === 'maria' && activity === 'On the trail') {
    return {
      ...encounter,
      opener: '“Buenos días, señor Darwin. ¿Va de camino al poblado?”\n“Good day, Mr Darwin. Are you on your way to the settlement?”',
    };
  }
  if (npcId === 'maria' && zoneId === 'PENAL_COLONY') {
    return {
      ...encounter,
      opener: activity === 'Showing Darwin the maize' || activity === 'Checking the maize'
        ? '“Mire dónde puse el maíz. Aquí tiene más sol.”\n“Look where I put the maize. It gets more sun here.”'
        : activity === 'Sorting greens beside the cookhouse'
          ? '“Con esta lluvia se pega la tierra a las botas. Voy a limpiar las hojas aquí.”\n“In this rain the soil sticks to your boots. I’ll clean the greens here.”'
        : encounter.opener,
      suggestedReplies: [...encounter.suggestedReplies, 'Can you show me the maize plot?'],
    };
  }
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

export function createNpcEncounterSession(npcId, relation = { trust: 50, flags: [] }, { recovery = false, zoneId, activity } = {}) {
  const encounter = getNpcEncounterPresentation(npcId, relation, { zoneId, activity });
  if (!encounter) return null;
  const wake = recovery ? encounter.recovery : null;
  const presentation = wake || encounter;
  return {
    npcId,
    openedAt: Date.now(),
    turns: [{ role: 'npc', text: presentation.opener }],
    suggestedReplies: presentation.suggestedReplies,
    trust: relation.trust,
    flags: relation.flags || [],
    activity,
    ...(wake ? { recovery: true } : {}),
  };
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
    if (!encounter.zones.includes(zoneId) && !encounter.travelsWithPlayer && !encounter.roaming) continue;
    const pose = poses.get(encounter.runtimeNpcId);
    if (!pose || pose.encounterEnabled === false) continue;
    if (encounter.roaming && Number.isFinite(position.y) && Math.abs(position.y - pose.y) > 1.65) continue;
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
      dialogue: '“The tortoises? I can do better than describe them, sir — bring me a shell from any island in this group and I will name you the island it came from. They differ. Charles Island beasts are not the beasts of Albemarle, nor of Chatham, and any man who has victualled a ship here knows it. It is a talent of mine, long cultivated. Even on this one island the beasts that keep to the springs above the settlement grow larger than those that come down to the dry shore — put a tape over a few of each, if you doubt me.”',
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
      dialogue: '“Take what you like of it. The small birds are so tame you may knock them down with a hat, which says something about how long men have been absent. The settlers swear the finches on the coast have heavier beaks than ours up here; I have never troubled to look. The iguanas keep to the black rock on the coast. Mind the manzanillo — the settlers will show you which tree it is, and you should believe them.”',
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

function fitzroyReply(input) {
  if (/brought|carried|crew|covington|recover|faint|collapse/.test(input)) {
    return {
      dialogue: '“Covington came down with you. The boat crew got you across the surf and into this hammock. Your case came aboard too. He would sooner have left his own coat behind.”',
      trustDelta: 1,
      flags: ['discussed_shipboard_recovery'],
    };
  }
  if (/ashore|go back/.test(input)) {
    return {
      dialogue: '“Eat something first. If you go ashore again, tell the officer of the watch where you mean to land. A boat can search one cove at a time.”',
      trustDelta: 0,
      flags: ['discussed_shipboard_recovery'],
    };
  }
  if (/sail|depart|anchor|leave/.test(input)) {
    return {
      dialogue: '“We weigh anchor at first light after our third day here. If there is a place you mean to see twice, make the second visit while the boat is still ours to send.”',
      trustDelta: 0,
      flags: ['discussed_beagle_departure'],
    };
  }
  if (/chart|survey|landing|mark|depth|rock/.test(input)) {
    return {
      dialogue: '“Soundings, mostly. A smooth patch of water can hide a shelf of lava. Where you land matters to me for much the same reason it matters to the labels on your specimens. Another man ought to be able to find the spot again.”',
      trustDelta: 1,
      flags: ['discussed_beagle_survey'],
    };
  }
  return {
    dialogue: '“Put your finger on the chart, Mr Darwin. We shall do better if we know which part of the island we are speaking of.”',
    trustDelta: 0,
    flags: [],
  };
}

function mariaReply(input, zoneId) {
  if (/spring|water|creek|manantial|arroyo/.test(input) && zoneId && zoneId !== 'PENAL_COLONY') {
    return {
      dialogue: zoneId === 'WATKINS_CREEK'
        ? '“Vuelvo a ver qué plantas siguen verdes cuando baja el arroyo. Así sé dónde buscar cuando se seca el sendero.”\n“I come back to see which plants stay green when the creek falls. Then I know where to look when the path dries out.”'
        : '“Para beber, si el agua sale clara. Si sobra al volver, la guardo para las plantas tiernas, no para las grandes.”\n“For drinking, if it comes out clear. If there’s any left when I get back, I save it for the seedlings. The big plants can wait.”',
      trustDelta: 1,
      flags: ['discussed_garden_crops'],
    };
  }
  if (/mazorca|ma[ií]z|maize|pick|recoger/.test(input)) {
    return {
      dialogue: '“Una de la orilla del maizal, si quiere. Sujete el tallo con una mano y tuerza la mazorca con la otra. Déjeme la planta en pie.”\n“Take one from the edge of the maize plot if you like. Hold the stalk with one hand and twist the ear with the other. Leave the plant standing for me.”',
      trustDelta: 1,
      flags: ['discussed_maize_harvest'],
    };
  }
  if (/cultiv|grow|plant|garden|camote|sweet potato|caña/.test(input)) {
    return {
      dialogue: zoneId && zoneId !== 'PENAL_COLONY'
        ? '“En el poblado, camote, maíz y caña. Cuando vuelva, fíjese en la tierra debajo de las guías del camote. Guarda humedad aun cuando el camino ya parece polvo.”\n“At the settlement, sweet potatoes, maize and cane. When you go back, look at the soil under the sweet potato vines. It holds water even when the path already looks like dust.”'
        : '“Aquí, camote. Las guías tapan la tierra y la raíz engorda debajo. Al otro lado del sendero tengo maíz. La caña queda camino al cuartel. ¿Ve cómo cada planta deja el suelo de otra manera?”\n“Here, sweet potatoes. The vines cover the ground and the roots swell underneath. Across the path I have maize. The cane is up toward the barracks. See how each plant leaves the soil looking different?”',
      trustDelta: 1,
      flags: ['discussed_garden_crops'],
    };
  }
  return {
    dialogue: '“Señáleme la planta, señor. Así sabré cuál dice.”\n“Point to the plant, sir. Then I’ll know which one you mean.”',
    trustDelta: 0,
    flags: [],
  };
}

export function getAuthoredNpcReply(npcId, playerInput, context = {}) {
  const input = String(playerInput || '').toLowerCase();
  if (npcId === FITZROY_NPC_ID) return fitzroyReply(input);
  if (npcId === 'maria') {
    if (context.zoneId === 'PENAL_COLONY' && /(?:show|take|walk|lead).*(?:maize|maíz|maizal)/.test(input)) {
      if (context.activity === 'Showing Darwin the maize' || context.activity === 'Checking the maize') {
        return { dialogue: '“Aquí mismo. Desde el sendero puede ver las mazorcas.”\n“Right here. You can see the ears from the path.”' };
      }
      return {
        dialogue: '“Venga por el sendero. Le enseño por dónde entrar sin pisar las guías.”\n“Come along the path. I’ll show you where to step clear of the vines.”',
        guideId: 'maize',
      };
    }
    return mariaReply(input, context.zoneId);
  }
  if (npcId === WELL_BOY_ID) {
    if (/wait|dove|bird|stick/.test(input)) {
      return {
        dialogue: '“Las palomas bajan a beber. Con un palo basta. Llevo las que cojo a casa para la cena.”\n“The doves come down to drink. A stick is enough. I take what I catch home for supper.”',
      };
    }
    if (/water|pail|well|spring/.test(input)) {
      return {
        dialogue: '“A casa. Cuando voy deprisa, se me sale la mitad antes de llegar.”\n“Home. If I go too fast, half of it spills before I get there.”',
      };
    }
    return { dialogue: '“Hable bajito, señor. Estoy esperando.”\n“Keep your voice down, sir. I’m waiting.”' };
  }
  if (npcId === STOKES_ID) {
    if (context.zoneId === 'S_VOLCANIC' && /(?:show|lead|walk|take).*(?:ridge|bearing)/.test(input)) {
      if (context.activity === 'Showing Darwin the lava ridges' || context.activity === 'Taking a bearing across the lava') {
        return { dialogue: '“We’re on it. Look back across the plain. Those folds run towards us, then turn.”' };
      }
      return {
        dialogue: '“Follow me to the rise. We can see both sets of folds from there.”',
        guideId: 'lavaRidge',
      };
    }
    if (/lava|fold|rock|sea/.test(input)) {
      return {
        dialogue: '“Look along the ridges from here. They put me in mind of a rough sea that has gone solid all at once. What I can’t see from my sketch is whether the folds run that way across the whole plain.”',
        flags: ['compared_lava_with_stokes'],
      };
    }
    return {
      dialogue: '“I can take a bearing on a hill from the boat. A break in the lava like this one is another matter. For that I have to come ashore and walk it.”',
    };
  }
  if (npcId === 'gabriel_puig') {
    if (/give|given|keep.*distance/.test(input) && /room|space|distance/.test(input)
        && context.flags?.includes('gabriel_pursued')) {
      return {
        dialogue: '“Eso habría ayudado. Si vuelve a verme, deje que yo me acerque.”\n“That would have helped. If you see me again, let me be the one to come over.”',
        trustDelta: 5,
        flags: ['gabriel_kept_confidence'],
      };
    }
    if (/look at the island|alone|confidence|quiet/.test(input)) {
      return {
        dialogue: '“Entonces mire por dónde pisa. Si alguien pregunta, aquí no ha visto a nadie.”\n“Then mind where you step. If anybody asks, you’ve seen nobody here.”',
        trustDelta: 5,
        flags: ['gabriel_kept_confidence'],
      };
    }
    if (/hid(e|ing)|lawson/.test(input)) {
      return {
        dialogue: '“Porque él puede salir de aquí cuando quiera. Los demás tenemos que encontrar nuestros propios caminos.”\n“Because he can leave here whenever he likes. The rest of us have to find our own ways out.”',
        trustDelta: 0,
        flags: [],
      };
    }
    if (/print|press|paper/.test(input)) {
      return {
        dialogue: '“Hojas sueltas. Una página viaja más lejos que un preso, si encuentra quien la lleve.”\n“Single sheets. A page travels farther than a prisoner, if it can find someone to carry it.”',
        trustDelta: 2,
        flags: ['gabriel_discussed_press'],
      };
    }
    if (/bay|coast|passage/.test(input)) {
      return {
        dialogue: '“Por el tubo que baja al mar. Cuando oscurece se ven las luces de los barcos antes de que ellos lo vean a uno.”\n“By the tube that goes down to the sea. After dark you can see the ships’ lights before anyone aboard can see you.”',
        trustDelta: 1,
        flags: [],
      };
    }
    return {
      dialogue: '“Pregúntele a Lawson por sus presos. A mí déjeme trabajar.”\n“Ask Lawson about his prisoners. Let me work.”',
      trustDelta: -5,
      flags: [],
    };
  }
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
