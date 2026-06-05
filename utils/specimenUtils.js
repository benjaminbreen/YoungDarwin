// utils/specimenUtils.js

import { canonicalSpecimenId } from './canonicalIds';

/**
 * Returns an emoji icon for a given specimen ID
 * @param {string} id - The specimen ID
 * @returns {string} The emoji representing the specimen
 */
export function getSpecimenIcon(id) {
  const canonicalId = canonicalSpecimenId(id);
  // First handle all the standard specimens with a direct mapping
  switch(canonicalId) {
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
    case 'mantaray': return '🐟';
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
          case 'timesoflondon': return '📰';

    // Handle hybrid IDs by pattern matching
    default:
      // Check if this is a hybrid ID (starts with 'hybrid_')
      if (canonicalId && typeof canonicalId === 'string' && canonicalId.startsWith('hybrid_')) {
        // Extract parent type hints from the hybrid ID if possible
        if (canonicalId.includes('tortoise')) return '🐢';
        if (canonicalId.includes('mock') || canonicalId.includes('finch') || canonicalId.includes('bird')) return '🐦';
        if (canonicalId.includes('iguana') || canonicalId.includes('lizard')) return '🦎';
        if (canonicalId.includes('fish')) return '🐠';
        if (canonicalId.includes('crab')) return '🦀';
        if (canonicalId.includes('plant') || canonicalId.includes('cactus')) return '🌱';
        
        // Default hybrid emoji
        return '🧬';
      }
      
      // Default for unknown specimens
      return '🔍';
  }
}
