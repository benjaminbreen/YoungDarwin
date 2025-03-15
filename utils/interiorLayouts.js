// utils/interiorLayouts.js
// Centralized definition of all interior spaces in the game

/**
 * Complete interior layout definitions for the Young Darwin game
 * Each interior has:
 * - id: Unique identifier for the interior
 * - name: Display name
 * - description: General description of the interior
 * - exteriorLocation: Which exterior location this interior is accessed from
 * - rooms: Array of room objects with positions and metadata
 * - npcs: NPCs that can appear in this interior generally
 * - grid: Size of the interior grid [width, height]
 * - styling: Visual properties for the UI
 * 
 * Each room has:
 * - id: Unique identifier for the room
 * - name: Display name
 * - x, y: Grid coordinates
 * - description: Text description
 * - emoji: Visual representation
 * - specimens: Array of specimen IDs available in this room
 * - npcs: Array of NPC IDs that can appear in this room
 * - accessible: Whether the player can move to this room
 */

export const interiorLayouts = {
  'cave': {
    id: 'CAVE',
    name: "Gabriel's Cave",
    description: "A hidden revolutionary's sanctuary carved into volcanic rock.",
    exteriorLocation: 'E_MID',
    rooms: [
      { 
        id: 'CAVE_ENTRANCE', 
        name: 'Cave Entrance', 
        x: 1, 
        y: 2, 
        description: 'The narrow entrance to the cave, dimly lit by filtered sunlight.',
        emoji: '🚪', 
        specimens: [],
        npcs: ['gabriel_puig'],
        accessible: true 
      },
      { 
        id: 'CAVE_MAIN', 
        name: 'Main Chamber', 
        x: 1, 
        y: 1, 
        description: 'A cramped space with makeshift furniture. Papers and revolutionary pamphlets are scattered on a rough table.',
        emoji: '🏮', 
        specimens: ['socialisttreatise'],
        npcs: ['gabriel_puig'],
        accessible: true 
      },
      { 
        id: 'CAVE_BACK', 
        name: 'Back Chamber', 
        x: 1, 
        y: 0, 
        description: 'A smaller space used as sleeping quarters. The rock walls are covered with scrawled quotes and manifestos.',
        emoji: '🛏️', 
        specimens: ['memoirsofautopian'],
        npcs: ['gabriel_puig'],
        accessible: true 
      },
      { 
        id: 'CAVE_STORAGE', 
        name: 'Hidden Cache', 
        x: 0, 
        y: 0, 
        description: "A secret compartment containing Gabriel's most treasured possessions and banned books.",
        emoji: '🗝️', 
        specimens: ['socialisttreatise', 'memoirsofautopian'],
        npcs: [],
        accessible: true 
      },
      { 
        id: 'CAVE_LOOKOUT', 
        name: 'Lookout Point', 
        x: 2, 
        y: 0, 
        description: 'A narrow opening that provides a view of the eastern coast of the island.',
        emoji: '👁️', 
        specimens: [],
        npcs: [],
        accessible: true 
      },
      { 
        id: 'CAVE_WRITING', 
        name: 'Writing Nook', 
        x: 0, 
        y: 1, 
        description: 'A small desk with quills and parchment where Gabriel drafts his manifestos.',
        emoji: '✍️', 
        specimens: ['socialisttreatise'],
        npcs: [],
        accessible: true 
      },
    ],
    npcs: ['gabriel_puig'],
    grid: [3, 3],
    floorColor: 'bg-stone-700',
    wallColor: 'bg-stone-800',
    accentColor: 'amber'
  },
  
  'hms_beagle': {
    id: 'HMS_BEAGLE',
    name: "HMS Beagle",
    description: "Captain FitzRoy's meticulously maintained survey vessel.",
    exteriorLocation: 'POST_OFFICE_BAY',
    rooms: [
      // Upper Deck (y=0)
      { 
        id: 'BEAGLE_BOW', 
        name: "Ship's Bow", 
        x: 0, 
        y: 0, 
        description: 'Forward part of the ship, offering views of the open ocean ahead.',
        emoji: '🌊', 
        specimens: [],
        npcs: [],
        accessible: true 
      },
      { 
        id: 'BEAGLE_FOREMAST', 
        name: 'Foremast', 
        x: 1, 
        y: 0, 
        description: 'Tall foremast with sailors working on the rigging.',
        emoji: '⛵', 
        specimens: [],
        npcs: ['lascar_joe'],
        accessible: true 
      },
      { 
        id: 'BEAGLE_MAINMAST', 
        name: 'Mainmast', 
        x: 2, 
        y: 0, 
        description: 'Primary mast with the ship bell nearby.',
        emoji: '🔔', 
        specimens: [],
        npcs: [],
        accessible: true 
      },
      { 
        id: 'BEAGLE_QUARTERDECK', 
        name: 'Quarterdeck', 
        x: 3, 
        y: 0, 
        description: 'Raised deck at the stern where Captain FitzRoy often stands surveying the horizon or consulting charts.',
        emoji: '🧭', 
        specimens: [],
        npcs: ['fitzroy'],
        accessible: true 
      },
      
      // Lower Deck (y=1)
      { 
        id: 'BEAGLE_FORECASTLE', 
        name: 'Forecastle', 
        x: 0, 
        y: 1, 
        description: 'Forward lower compartment where some crew sleep in hammocks slung close together.',
        emoji: '🛌', 
        specimens: [],
        npcs: ['syms_covington'],
        accessible: true 
      },
      { 
        id: 'BEAGLE_STORAGE', 
        name: 'Specimen Storage', 
        x: 1, 
        y: 1, 
        description: 'A cramped space filled with specimen jars, preservation materials, and collecting equipment.',
        emoji: '🧪', 
        specimens: ['rumflask'],
        npcs: ['syms_covington'],
        accessible: true 
      },
      { 
        id: 'BEAGLE_QUARTERS', 
        name: 'Your Quarters', 
        x: 2, 
        y: 1, 
        description: 'Your small but efficiently arranged berth for sleeping and studying. Books and notes are stacked neatly.',
        emoji: '📓', 
        specimens: [],
        npcs: [],
        accessible: true 
      },
      { 
        id: 'BEAGLE_CABIN', 
        name: "Captain's Cabin", 
        x: 3, 
        y: 1, 
        description: 'The private quarters of the Captain with navigational charts, precision instruments, and a small but well-curated library.',
        emoji: '📐', 
        specimens: [],
        npcs: ['fitzroy'],
        accessible: true 
      },
    ],
    npcs: ['fitzroy', 'syms_covington', 'lascar_joe'],
    grid: [4, 2],
    floorColor: 'bg-amber-800',
    wallColor: 'bg-amber-900',
    accentColor: 'blue'
  },
  
  'governors_house': {
    id: 'GOVERNORS_HOUSE',
    name: "Vice-Governor's House",
    description: "The colonial residence of Nicolás Lawson, modest yet befitting his station.",
    exteriorLocation: 'PENAL_COLONY',
    rooms: [
      // Entry level (y=0)
      { 
        id: 'GOVERNORS_HOUSE_ENTRANCE', 
        name: 'Entrance Hall', 
        x: 0, 
        y: 0, 
        description: 'A modest foyer with colonial furnishings. Lawson often greets visitors here.',
        emoji: '🚪', 
        specimens: [],
        npcs: ['nicolas_lawson'],
        accessible: true 
      },
      { 
        id: 'GOVERNORS_HOUSE_LIBRARY', 
        name: 'Small Library', 
        x: 1, 
        y: 0, 
        description: 'Shelves lined with books on navigation, natural history, and colonial administration.',
        emoji: '📚', 
        specimens: [],
        npcs: [],
        accessible: true 
      },
      { 
        id: 'GOVERNORS_HOUSE_PRIVATE', 
        name: 'Private Quarters', 
        x: 2, 
        y: 0, 
        description: "Lawson's personal living space, surprisingly elegant with items from his travels.",
        emoji: '🛏️', 
        specimens: ['governorsletter'],
        npcs: [],
        accessible: true 
      },
      
      // Lower level (y=1)
      { 
        id: 'GOVERNORS_HOUSE_DINING', 
        name: 'Dining Room', 
        x: 0, 
        y: 1, 
        description: 'A modest table set with mismatched china. A half-empty bottle of rum beside a maritime chart.',
        emoji: '🍽️', 
        specimens: [],
        npcs: [],
        accessible: true 
      },
      { 
        id: 'GOVERNORS_HOUSE_OFFICE', 
        name: 'Office', 
        x: 1, 
        y: 1, 
        description: "Lawson conducts the island's sparse official business here.",
        emoji: '📜', 
        specimens: ['governorsletter'],
        npcs: ['nicolas_lawson'],
        accessible: true 
      },
      { 
        id: 'GOVERNORS_HOUSE_GARDEN', 
        name: 'Rear Garden', 
        x: 2, 
        y: 1, 
        description: 'A small walled garden with exotic plants Lawson has collected from around the archipelago.',
        emoji: '🌱', 
        specimens: ['cactus', 'mangrove'],
        npcs: ['maria'],
        accessible: true 
      },
    ],
    npcs: ['nicolas_lawson', 'maria'],
    grid: [3, 2],
    floorColor: 'bg-amber-100',
    wallColor: 'bg-amber-200',
    accentColor: 'emerald'
  },
  
  'watkins_cabin': {
    id: 'WATKINS_CABIN',
    name: "Patrick Watkins's Cabin",
    description: "The crude shelter of the island's first settler, solitary and mysterious.",
    exteriorLocation: 'WATKINS',
    rooms: [
      { 
        id: 'WATKINS_CABIN_INTERIOR', 
        name: 'Cabin Interior', 
        x: 0, 
        y: 0, 
        description: 'A crude one-room shelter built from driftwood and volcanic stone. Dried gourds and animal hides litter the dirt floor.',
        emoji: '🏚️', 
        specimens: ['watkinswill'],
        npcs: [],
        accessible: true 
      },
    ],
    npcs: [],
    grid: [1, 1],
    floorColor: 'bg-amber-950',
    wallColor: 'bg-black',
    accentColor: 'amber'
  },
  
  'whalers_hut': {
    id: 'WHALERS_HUT',
    name: "Whaler's Hut",
    description: "A seasonal shelter used by American whalers for water and provisions.",
    exteriorLocation: 'W_LAVA',
    rooms: [
      { 
        id: 'WHALERS_HUT_INTERIOR', 
        name: 'Hut Interior', 
        x: 0, 
        y: 0, 
        description: 'A stone structure with a battered wooden roof. Broken barrel staves and scattered harpoon parts hint at its whaling history.',
        emoji: '🪵', 
        specimens: [],
        npcs: [],
        accessible: true 
      },
    ],
    npcs: [],
    grid: [1, 1],
    floorColor: 'bg-stone-500',
    wallColor: 'bg-stone-700',
    accentColor: 'amber'
  },
  
  'mail_barrel': {
    id: 'MAIL_BARREL',
    name: "Mail Barrel",
    description: "A wooden barrel used by sailors for mail exchange. Why are you in here?",
    exteriorLocation: 'POST_OFFICE_BAY',
    rooms: [
      { 
        id: 'MAIL_BARREL_INTERIOR', 
        name: 'Mail Barrel', 
        x: 0, 
        y: 0, 
        description: 'The cramped interior is mostly filled with sand, leaving just enough space for you to crouch inside. Alarmingly, you note the faint odor of urine.',
        emoji: '🛢', 
        specimens: ['whalersletter, timesoflondon'],
        npcs: [],
        accessible: true 
      },
    ],
    npcs: [],
    grid: [1, 1],
    floorColor: 'bg-amber-800',
    wallColor: 'bg-amber-900',
    accentColor: 'amber'
  }
};

/**
 * Get the exterior location ID that an interior is accessed from
 * @param {string} interiorId - The ID of the interior location
 * @returns {string|null} - The exterior location ID or null if not found
 */
export function getExteriorLocation(interiorId) {
  // First check if it's a top-level interior
  const interiorKey = Object.keys(interiorLayouts).find(key => 
    interiorLayouts[key].id === interiorId
  );
  
  if (interiorKey) {
    return interiorLayouts[interiorKey].exteriorLocation;
  }
  
  // Then check if it's a room within an interior
  for (const key in interiorLayouts) {
    const layout = interiorLayouts[key];
    const room = layout.rooms.find(room => room.id === interiorId);
    if (room) {
      return layout.exteriorLocation;
    }
  }
  
  return null;
}

/**
 * Find a room by its ID
 * @param {string} roomId - The ID of the room to find
 * @returns {object|null} - The room object or null if not found
 */
export function findRoomById(roomId) {
  for (const key in interiorLayouts) {
    const layout = interiorLayouts[key];
    const room = layout.rooms.find(room => room.id === roomId);
    if (room) {
      return {
        ...room,
        interiorType: key,
        interiorId: layout.id
      };
    }
  }
  
  return null;
}

/**
 * Get the interior type from a room ID
 * @param {string} roomId - The ID of a room
 * @returns {string|null} - The interior type (key) or null if not found
 */
export function getInteriorTypeFromRoomId(roomId) {
  for (const key in interiorLayouts) {
    const layout = interiorLayouts[key];
    const room = layout.rooms.find(room => room.id === roomId);
    if (room) {
      return key;
    }
  }
  
  return null;
}

/**
 * Get NPCs that should be present in a specific room
 * @param {string} roomId - The ID of the room
 * @returns {string[]} - Array of NPC IDs that can appear in this room
 */
export function getNPCsForRoom(roomId) {
  const room = findRoomById(roomId);
  if (!room) return [];
  
  return room.npcs || [];
}

/**
 * Get specimens that can be found in a specific room
 * @param {string} roomId - The ID of the room
 * @returns {string[]} - Array of specimen IDs that can be found in this room
 */
export function getSpecimensForRoom(roomId) {
  const room = findRoomById(roomId);
  if (!room) return [];
  
  return room.specimens || [];
}

export default interiorLayouts;