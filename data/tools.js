// tools.js component
export const tools = [
  // Specimen Analysis Tools
 
  { 
    id: 'magnifier', 
    name: 'Lens', 
    description: 'Study minute details.',
    detailedDescription: 'A brass pocket magnifier that reveals tiny structures invisible to the naked eye. Among your prized possessions, you purchased it in London for three guineas.',
    action: 'examined with hand lens',
    icon: '🔍',
    image: '/tools/magnifier.jpg',
    usage: 'Used to examine fine details like insect anatomy, plant structures, and mineral textures'
  },
  { 
    id: 'dissection', 
    name: 'Dissection Kit', 
    description: 'Examine internal structures.',
    detailedDescription: 'A set of fine scalpels, forceps, and scissors for careful internal examination.',
    action: 'dissected',
    icon: '✂️',
    image: '/tools/dissect.jpg',
    usage: 'For revealing internal anatomy and structures not visible from the exterior'
  },

  { 
    id: 'measure', 
    name: 'Calipers', 
    description: 'Take precise measurements.',
    detailedDescription: 'Brass measuring instruments for determining exact dimensions of specimens.',
    action: 'measured dimensions of',
    icon: '📏',
    image: '/tools/measure.jpg',
    usage: 'Critical for comparing specimens and documenting variations in size'
  },
  { 
    id: 'sample', 
    name: 'Sample', 
    description: 'Collect tissue, feathers, or other samples for chemical analysis or preservation.',
    detailedDescription: 'Tools for taking small portions of specimens for preservation or later study.',
    action: 'collected samples from',
    icon: '🧪',
    image: '/tools/sample.jpg',
    usage: 'For collecting representative portions without damaging the entire specimen'
  },
  { 
    id: 'compare', 
    name: 'Comparative Analysis', 
    description: 'Compare with other specimens.',
    detailedDescription: 'The scientific process of examining similarities and differences between specimens.',
    action: 'compared with other specimens',
    icon: '⚖️',
    image: '/tools/compare.jpg',
    usage: 'Vital for establishing relationships between different species and varieties'
  }
];

// Collection Tools for Selecting a Collection Method
export const collectionTools = [
  { 
    id: 'shotgun', 
    name: 'Shotgun', 
    description: 'Used to collect birds and small mammals from a distance.', 
    detailedDescription: 'A double-barreled shotgun, the standard tool for naturalists collecting bird specimens.',
    action: 'shot and retrieved', 
    icon: '💥',
    image: '/tools/shotgun.jpg',
    usage: 'Most effective for birds in flight and animals that can’t be approached closely'
  },
  { 
    id: 'insect_net', 
    name: 'Insect Net', 
    description: 'A fine muslin net for capturing butterflies, beetles, and other flying insects.', 
    detailedDescription: 'A lightweight net with fine mesh and a long handle for catching insects in flight.',
    action: 'caught with insect net', 
    icon: '🦋',
    image: '/tools/net.jpg',
    usage: 'Essential for capturing delicate flying insects without damage'
  },
  { 
    id: 'snare', 
    name: 'Snare', 
    description: 'A looped snare used to catch lizards and other small reptiles.', 
    detailedDescription: 'A simple but effective trap with a loop that tightens when triggered.',
    action: 'snared', 
    icon: '🔗',
    image: '/tools/snare.jpg',
    usage: 'Best for capturing elusive reptiles and small mammals without injury'
  },
  { 
    id: 'hammer', 
    name: 'Geologist’s Hammer & Chisel', 
    description: 'A hammer and chisel for breaking rocks and extracting fossils.', 
    detailedDescription: 'Specialized tools for extracting geological specimens and embedded fossils.',
    action: 'chipped from rock', 
    icon: '⛏️',
    image: '/tools/hammer.jpg',
    usage: 'For collecting rock samples, fossils, and minerals from larger formations'
  },
  { 
    id: 'hands', 
    name: 'Hands', 
    description: 'Used to pick up small creatures, overturn rocks, and dig up plants.', 
    detailedDescription: 'Sometimes the simplest tool is the most appropriate for careful collection.',
    action: 'carefully picked up', 
    icon: '👐',
    image: '/tools/hands.jpg',
    usage: 'Ideal for delicate plants, slow-moving creatures, and fragile specimens'
  }
];