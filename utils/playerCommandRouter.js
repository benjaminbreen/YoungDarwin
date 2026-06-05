const DIRECTION_ALIASES = {
  n: 'north',
  north: 'north',
  ne: 'northeast',
  northeast: 'northeast',
  e: 'east',
  east: 'east',
  se: 'southeast',
  southeast: 'southeast',
  s: 'south',
  south: 'south',
  sw: 'southwest',
  southwest: 'southwest',
  w: 'west',
  west: 'west',
  nw: 'northwest',
  northwest: 'northwest',
};

const LOCATION_ALIASES = [
  { pattern: /\b(?:return|go|travel|head|walk|move|sail|row|board)\s+(?:back\s+)?(?:to|toward|towards|aboard)\s+(?:the\s+)?(?:hms\s+)?beagle\b/i, locationId: 'BEAGLE' },
  { pattern: /\b(?:return|go|travel|head|walk|move|sail|row)\s+(?:back\s+)?(?:to|toward|towards)\s+(?:the\s+)?post\s+office\s+bay\b/i, locationId: 'POST_OFFICE_BAY' },
  { pattern: /\b(?:return|go|travel|head|walk|move)\s+(?:back\s+)?(?:to|toward|towards)\s+(?:the\s+)?settlement\b/i, locationId: 'SETTLEMENT' },
];

const INTERIOR_PATTERNS = [
  {
    interiorType: 'cave',
    patterns: [
      /\b(?:enter|explore|investigate|go\s+in(?:to)?|check\s+out)\s+(?:the\s+)?(?:caves?|pirate'?s?\s+caves?)\b/i,
      /\b(?:go|head|walk)\s+(?:to|into|in)\s+(?:the\s+)?(?:caves?|pirate'?s?\s+caves?)\b/i,
      /\bexamine\s+(?:the\s+)?cave\s+entrance\b/i,
    ],
  },
  {
    interiorType: 'hms_beagle',
    patterns: [
      /\b(?:board|enter|go\s+(?:on|into|aboard))\s+(?:the\s+)?(?:hms\s+)?(?:beagle|ship|vessel)\b/i,
      /\b(?:climb|go)\s+(?:up|on)\s+(?:the\s+)?(?:gangplank|ladder|aboard)\b/i,
      /\bvisit\s+(?:the\s+)?(?:captain|fitzroy|ship|beagle)\b/i,
    ],
  },
  {
    interiorType: 'governors_house',
    patterns: [
      /\b(?:enter|go\s+in(?:to)?|visit|head\s+into)\s+(?:the\s+)?(?:governor'?s?|lawson'?s?|vice[\s-]governor'?s?)\s+(?:house|residence|home|quarters)\b/i,
      /\b(?:accept|take\s+up)\s+lawson'?s?\s+(?:offer|invitation)\b/i,
      /\b(?:follow|go\s+with)\s+lawson\b/i,
      /\bmay\s+i\s+(?:come|go|enter|visit)\s+in(?:side)?\b/i,
    ],
  },
];

const cleanInput = (input = '') => String(input).trim().replace(/\s+/g, ' ');

const stripTrailingPunctuation = (text = '') => text.replace(/[.!?]+$/g, '').trim();

function detectDirectionCommand(input) {
  const normalized = stripTrailingPunctuation(cleanInput(input).toLowerCase());
  if (!normalized) return null;

  if (DIRECTION_ALIASES[normalized]) {
    return DIRECTION_ALIASES[normalized];
  }

  const match = normalized.match(/\b(?:go|move|walk|travel|head|proceed|continue|push|strike|turn)\s+(?:to|towards|toward|into|for|the)?\s*(north|south|east|west|northeast|northwest|southeast|southwest|n|s|e|w|ne|nw|se|sw)\b/);
  return match ? DIRECTION_ALIASES[match[1]] : null;
}

export function detectInteriorEntry(input) {
  const text = cleanInput(input);
  if (!text) return null;

  for (const group of INTERIOR_PATTERNS) {
    if (group.patterns.some(pattern => pattern.test(text))) {
      return group.interiorType;
    }
  }

  return null;
}

export function routePlayerCommand(input) {
  const raw = cleanInput(input);
  const lowered = raw.toLowerCase();
  if (!raw) return { type: 'empty' };

  const slashMove = raw.match(/^\/move\s+(.+)$/i);
  if (slashMove) return { type: 'move_location', locationId: slashMove[1].trim() };

  const slashCollect = raw.match(/^\/collect\s+(.+)$/i);
  if (slashCollect) return { type: 'collect_specimen', query: slashCollect[1].trim() };

  const slashUse = raw.match(/^\/use\s+(.+?)\s+on\s+(.+)$/i);
  if (slashUse) {
    return { type: 'use_tool', tool: slashUse[1].trim(), target: slashUse[2].trim() };
  }

  if (/\b(?:check|inspect|examine)\s+(?:my\s+|the\s+|any\s+)?traps?\b/i.test(raw)) {
    return { type: 'check_traps' };
  }

  if (/\b(?:abandon|retrieve|remove|pull\s+up|take\s+up)\s+(?:my\s+|the\s+)?traps?\b/i.test(raw)) {
    return { type: 'abandon_trap' };
  }

  if (/\b(?:rest|sleep|nap|lie\s+down|lay\s+down|make\s+camp|build\s+shelter)\b/i.test(raw)) {
    return { type: 'rest' };
  }

  if (/\b(?:survey|map|transect|take\s+a\s+transect|inspect\s+the\s+site|observe\s+surroundings|look\s+around|record\s+the\s+habitat)\b/i.test(raw)) {
    return { type: 'survey_site' };
  }

  const documentMatch = raw.match(/\b(?:document|sketch|draw|observe|record|describe|measure|make\s+notes?\s+on)\s+(?:the\s+|a\s+|an\s+)?(.+)$/i);
  if (documentMatch && !/\b(?:surroundings|site|area|route|path|weather|camp)\b/i.test(documentMatch[1])) {
    return { type: 'document_specimen', query: documentMatch[1].trim() };
  }

  const collectMatch = raw.match(/\b(?:collect|capture|take|bag|net)\s+(?:the\s+|a\s+|an\s+)?(.+)$/i);
  if (collectMatch) return { type: 'collect_specimen', query: collectMatch[1].trim() };

  const interiorType = detectInteriorEntry(raw);
  if (interiorType) return { type: 'enter_interior', interiorType };

  for (const alias of LOCATION_ALIASES) {
    if (alias.pattern.test(raw)) {
      return { type: 'move_location', locationId: alias.locationId };
    }
  }

  const direction = detectDirectionCommand(raw);
  if (direction) return { type: 'move_direction', direction };

  if (lowered === 'journal' || lowered === 'field book' || lowered === 'open journal') {
    return { type: 'open_journal' };
  }

  return { type: 'narrative' };
}

export default routePlayerCommand;
