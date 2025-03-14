// utils/specimenUtils.js

/**
 * Returns an emoji icon for a given specimen ID
 * @param {string} id - The specimen ID
 * @returns {string} The emoji representing the specimen
 */
export function getSpecimenIcon(id) {
  // First handle all the standard specimens with a direct mapping
  switch(id) {
    case 'easternsantacruztortoise': return '🐢';
    case 'floreanagianttortoise': return '🐢';
    case 'galapagosmockingbird': return '🐦';
    case 'floreanamockingbird': return '🐦';
    case 'largegroundfinch': return '🐤';
    case 'mediumgroundfinch': return '🐤';
    case 'marineiguana': return '🐊';
    case 'terrestrialiguana': return '🐊';
    case 'cactus': return '🌵';
    case 'lavalizard': return '🦎';
    case 'crab': return '🦀';
    case 'sealion': return '🦭';
    case 'booby': return '🐦';
    case 'frigatebird': return '🕊️';
    case 'coral': return '🪸';
    case 'plicopurpura': return '🐚';
    case 'seashell': return '🐚';
    case 'neorapana': return '🐚';
    case 'olivine': return '🦠';
    case 'basalt': return '🪨';
    case 'barnacle': return '🐌';
    case 'mangrove': return '🌱';
    case 'greenturtle': return '🐢';
    case 'parrotfish': return '🐠';
    case 'hammerhead': return '🦈';
    case 'mantaRay': return '🐟';
    case 'flamingo': return '🦩';
    case 'seaurchin': return '🪸';
    case 'socialisttreatise': return '📜';
    case 'memoirsofautopian': return '📖';
    case 'governorsletter': return '✉️';
    case 'rumflask': return '⚱️';
    case 'feralgoat': return '🐐';
    case 'captainsskull': return '💀';
    case 'shortearedowl': return '🦉';
    case 'galapagospenguin': return '🐧';
    case 'galapagosracer': return '🐍';
    case 'solidifiedsulphur': return '🌕';
    case 'meteoriron': return '☄️';
          case 'jackothemonkey': return '🙈';
          case 'whalersletter': return '💌';
          case 'scrimshawwhaletooth': return '🦷';

    // Handle hybrid IDs by pattern matching
    default:
      // Check if this is a hybrid ID (starts with 'hybrid_')
      if (id && typeof id === 'string' && id.startsWith('hybrid_')) {
        // Extract parent type hints from the hybrid ID if possible
        if (id.includes('tortoise')) return '🐢';
        if (id.includes('mock') || id.includes('finch') || id.includes('bird')) return '🐦';
        if (id.includes('iguana') || id.includes('lizard')) return '🦎';
        if (id.includes('fish')) return '🐠';
        if (id.includes('crab')) return '🦀';
        if (id.includes('plant') || id.includes('cactus')) return '🌱';
        
        // Default hybrid emoji
        return '🧬';
      }
      
      // Default for unknown specimens
      return '🔍';
  }
}