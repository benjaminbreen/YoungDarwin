export const locations = [
  // Row 1 (y=0)

  // 1) BEAGLE
  {
    id: 'BEAGLE',
    name: 'HMS Beagle',
    description: 'The trusty ship that has carried you and its crew across the world.',
    x: 0,
    y: -1,
    color: 'tan',
    type: 'ship',
    validMoves: [],
    specimens: [],
    npcs: ['fitzroy', 'lascar_joe'],
    boundaries: { north: 'ocean', west: 'ocean', south: 'ocean' },
    discoveries: [
      'The scent of salt and tar lingers in the air, mingling with the faint aroma of ship provisions.',
      'Looking over the side, you spot schools of fish darting through the waves.',
      'You hear the rhythmic creak of the ship’s timbers as the Beagle rocks gently with the ocean swell.'
    ],
    notableFeatures: [
      'The sturdy wooden deck, worn smooth by countless footsteps, stretches beneath your feet.',
      'Rigging and sails flutter high above, the lifeblood of this expedition.',
      'Crates of supplies and barrels of fresh water are stacked near the main mast, essential for the long journey ahead.',
      'The captain’s quarters are tucked away at the stern, where FitzRoy studies his charts and logs.',
      'A lascar sailor works quietly near the ropes, adjusting knots with practiced ease.'
    ]
  },

  // 2) NW_REEF
  {
    id: 'NW_REEF',
    name: 'Northwest Reef',
    description: 'Shallow reef with sea turtles and reef fish.',
    x: 0,
    y: 0,
    color: '#4682b4',
    type: 'reef',
    validMoves: ['SE','SW','S','E'],
    specimens: ['greenTurtle','parrotfish','seaLion'],
    npcs: [],
    boundaries: { north: 'ocean', west: 'ocean' },
    discoveries: [
      'This might be a good place to go swimming, if you have the time and inclination.'
    ],
    notableFeatures: [
      'The coral heads visible in the clear waters are teeming with life.',
      'Gentle swells roll across turquoise shallows. It is beautiful here.',
      'It is likely that this would be a good sea turtle nesting ground.'
    ]
  },

  // 3) POST_OFFICE_BAY
  {
    id: 'POST_OFFICE_BAY',
    name: 'Post Office Bay',
    description: 'A sheltered cove where sailors leave letters in a barrel and crabs flourish.',
    x: 1,
    y: 0,
    color: 'beige',
    type: 'bay',
    validMoves: ['W','E','SW','S'],
    specimens: ['crab','basalt','barnacle'],
    npcs: ['lascar_joe'],
    boundaries: { north: 'ocean' },
    discoveries: [
      'You notice a weathered barrel filled with letters. If you were nosy, you might read some...'
    ],
    notableFeatures: [
      'According to a crewmate on the Beagle, this makeshift mail system has been in place since the Napoleonic era.',
      'Seabirds and crabs patrol the calm cove.',
      'Footprints in the sand lead inland.'
    ]
  },

  // 4) N_SHORE
  {
    id: 'N_SHORE',
    name: 'Northern Shore',
    description: 'Black volcanic sand beach. Peaceful.',
    x: 2,
    y: 0,
    color: '#5f9ea0',
    type: 'beach',
    validMoves: ['W','E','SW','S'],
    specimens: ['frigatebird','booby','seaLion'],
    npcs: [],
    boundaries: { north: 'ocean' },
    discoveries: [
      'Bleached driftwood and seaweed litter the black sand, giving clues to the strong tides here.'
    ],
    notableFeatures: [
      'A sharp breeze carries salty spray across the shoreline.',
      'In the distance, jagged volcanic rocks jut out into the surf.',
      'Black volcanic sand glitters with minute minerals in the midday sun.'
    ]
  },

  // 5) CORMORANT_BAY
  {
    id: 'CORMORANT_BAY',
    name: 'Cormorant Bay',
    description: 'A lagoon with flamingos and brackish water.',
    x: 3,
    y: 0,
    color: '#6b8e23',
    type: 'wetland',
    validMoves: ['W','SW','S','E'],
    specimens: ['flamingo','frigatebird','booby'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'A flock of flamingos wades through the shallows, their pink reflections dancing on the surface.'
    ],
    notableFeatures: [
      'Brackish lagoon merges salt and fresh water.',
      'Mosquitoes buzz in the humid air.',
      'Faint bird calls echo across the reeds.'
    ]
  },

  // 6) DEVILS_CROWN
  {
    id: 'DEVILS_CROWN',
    name: "Devil's Crown",
    description: 'A partially submerged volcanic crater teeming with marine life.',
    x: 4,
    y: 0,
    color: '#20b2aa',
    type: 'coastallava',
    validMoves: ['W','S'],
    specimens: ['mantaRay','greenTurtle','booby'],
    npcs: [],
    boundaries: { north: 'ocean', east: 'ocean' },
    discoveries: [
      'Underwater pinnacles hide colorful fish and coral formations—an excellent spot for collecting marine samples.'
    ],
    notableFeatures: [
      'Dark lava spires jut from the sea in a ring-like formation.',
      'Birds wheel overhead, scanning for prey just below the surface.',
      'A sense of foreboding beauty as currents swirl around the crater walls.'
    ]
  },

  // 7) N_OUTCROP
  {
    id: 'N_OUTCROP',
    name: 'Desolate Outcrop',
    description: 'A lonely jetty of volcanic rock.',
    x: 2,
    y: -1,
    color: '#696969',
    type: 'ocean',
    validMoves: ['S'],
    specimens: ['seaLion'],
    npcs: ['gabriel_puig'],
    boundaries: { north: 'ocean', east: 'ocean', west: 'ocean' },
    discoveries: [
      'No sign of footprints. This place is rarely visited by anyone except the occasional sea lion.'
    ],
    notableFeatures: [
      'Sharp black rocks protrude from the waterline.',
      'Waves crash incessantly, sending brine into the air.',
      'A bleak isolation pervades the area—perfect for reflection or secrecy.'
    ]
  },

  // 8) BLACK_BEACH_OCEAN
  {
    id: 'BLACK_BEACH_OCEAN',
    name: 'Black Beach, Surf',
    description: 'Waist-deep in the choppy ocean surf. The undertow seems quite dangerous.',
    x: -1,
    y: 1,
    color: '#4682b4',
    type: 'ocean',
    validMoves: ['E','SE','S'],
    specimens: ['seaLion','marineIguana'],
    npcs: [],
    boundaries: { west: 'ocean' },
    discoveries: [
      'Powerful currents swirl around your legs, threatening to pull you seaward.'
    ],
    notableFeatures: [
      'Foam-topped waves crash rhythmically against volcanic sand.',
      'Dark shapes flicker beneath the surface—perhaps iguanas or large fish.',
      'The hiss of receding water hints at hidden currents.'
    ]
  },

  // 9) BLACK_BEACH
  {
    id: 'BLACK_BEACH',
    name: 'Black Beach Uplands',
    description: 'Volcanic sand, home to sea lions and iguanas.',
    x: 0,
    y: 1,
    color: '#bdb76b',
    type: 'coastallava',
    validMoves: ['E','SE','S'],
    specimens: ['seaLion','marineIguana'],
    npcs: [],
    boundaries: { west: 'ocean' },
    discoveries: [
      'Iguana tracks lead away from the water, disappearing behind a rocky outcropping.'
    ],
    notableFeatures: [
      'Dark sand sparkles faintly with volcanic minerals.',
      'Sea lions sprawl at ease, unbothered by your presence.',
      'One sees a transition from bare coastal plain to rockier inland slopes.'
    ]
  },

  // 10) LAVA_FLATS
  {
    id: 'LAVA_FLATS',
    name: 'Lava Flats',
    description: 'Barren lava field with sparse vegetation.',
    x: 1,
    y: 1,
    color: '#696969',
    type: 'lavaField',
    validMoves: ['W','E','SW','S','SE','NW','NE','N'],
    specimens: ['lavaLizard','basalt'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'A human-made path leads south into the mountains, though it seems seldom used.'
    ],
    notableFeatures: [
      'Heat radiates off black rock, distorting the air.',
      'Hardy pioneer plants cling to life in cracks.',
      'A sense of stark stillness broken only by the skitter of a lone lava lizard.'
    ]
  },

  // 11) NORTHERN_HIGHLANDS
  {
    id: 'NORTHERN_HIGHLANDS',
    name: 'Northern Highlands',
    description: 'Scrubby terrain with finches and cacti, plus small introduced crops.',
    x: 2,
    y: 1,
    color: '#bdb76b',
    type: 'scrubland',
    validMoves: ['N','E','W','S'],
    specimens: ['cactus','large_ground_finch','medium_ground_finch','floreana_giant_tortoise'],
    npcs: ['maria'],
    boundaries: {},
    discoveries: [
      'Signs of a small, experimental garden—likely the work of settlers or the penal colony—dot the dusty ground.'
    ],
    notableFeatures: [
      'Low shrubs and prickly cacti stand out against brown soil.',
      'Finches flit around in search of seeds.',
      'A hush broken by the slow steps of a giant tortoise meandering through.'
    ]
  },

  // 12) EASTERN_CLIFFS
  {
    id: 'EASTERN_CLIFFS',
    name: 'Eastern Cliffs',
    description: 'Steep cliffs where frigatebirds nest.',
    x: 3,
    y: 1,
    color: '#8fbc8f',
    type: 'cliff',
    validMoves: ['N','W','SW','S'],
    specimens: ['frigatebird','galapagos_mockingbird'],
    npcs: ['gabriel_puig'],
    boundaries: {},
    discoveries: [
      'A path, evidently human-made, leads uphill to the west. The tracks appear fresh.'
    ],
    notableFeatures: [
      'Vertical rock faces loom over crashing waves far below.',
      'Nesting birds circle overhead, calling sharply into the wind.',
      'Jagged edges carved by centuries of ocean gusts.'
    ]
  },

  // 13) ENDERBY
  {
    id: 'ENDERBY',
    name: 'Enderby Sector',
    description: 'A windswept eastern stretch of scrubland frequented by mockingbirds.',
    x: 4,
    y: 1,
    color: '#bdb76b',
    type: 'scrubland',
    validMoves: ['W','S'],
    specimens: ['floreana_mockingbird','cactus','gray_warbler_finch'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'Enderby is known among whalers for occasional fresh water seeps, though they may be dried up at this season.'
    ],
    notableFeatures: [
      'Dust devils swirl across the sparse, open ground.',
      'Mockingbirds dart between cacti, eager for seeds.',
      'Gritty wind stings your eyes, carrying faint salt from the distant sea.'
    ]
  },

  // 14) PUNTA_CORMORANT
  {
    id: 'PUNTA_CORMORANT',
    name: 'Punta Cormorant',
    description: 'Headland with a strangely green-colored beach and a brackish lagoon inland.',
    x: 5,
    y: 1,
    color: '#5f9ea0',
    type: 'beach',
    validMoves: ['N','W','SW'],
    specimens: ['flamingo','frigatebird'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'The green tinge of the sand, caused by olivine crystals, intrigues you—perhaps worthy of a geological sample.'
    ],
    notableFeatures: [
      'A short path leads inland to a shallow lagoon, home to wading birds.',
      'A stiff breeze keeps the insects at bay.',
      'The beach squeaks softly underfoot, finer than typical black volcanic sand.'
    ]
  },

  // 15) W_LAVA
  {
    id: 'W_LAVA',
    name: 'Western Lowlands',
    description: 'A half-flooded tidal lagoon with a few dilapidated whaler huts.',
    x: -1,
    y: 2,
    color: '#bdb76b',
    type: 'coastalTrail',
    validMoves: ['N','E','NE','SE'],
    specimens: ['floreana_giant_tortoise'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'The remnants of an old whaler’s camp are here, complete with a drying rack and some crude furniture.'
    ],
    notableFeatures: [
      'Patches of wet, black volcanic rock gleam in the sun.',
      'A makeshift shelter stands abandoned, used by whalers or stranded sailors in prior years.',
      'Signs that giant tortoises once foraged near the water’s edge.'
    ]
  },

  // 16) W_HIGH
  {
    id: 'W_HIGH',
    name: 'Western Highlands',
    description: 'Mist-covered forest with giant tortoises.',
    x: 0,
    y: 2,
    color: 'green',
    type: 'forest',
    validMoves: ['N','SE','E','SW','S','W'],
    specimens: ['floreana_giant_tortoise','floreana_mockingbird'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'A faint, overgrown trail leads deeper into the mist—rarely traveled, if at all.'
    ],
    notableFeatures: [
      'Cool, damp air thick with the scent of moss and wet leaves.',
      'Broad-leaved plants and twisting vines cling to the trunks.',
      'Quiet scuffling of giant tortoises rummaging for food.'
    ]
  },

  // 17) C_HIGH
  {
    id: 'C_HIGH',
    name: 'Cerro Pajas',
    description: 'The highest point of the island.',
    x: 1,
    y: 2,
    color: 'black',
    type: 'highland',
    validMoves: ['N','E','S','W'],
    specimens: ['galapagos_mockingbird'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'From here, the entire coastline can be seen—ridges of ancient lava flows stretch below.'
    ],
    notableFeatures: [
      'Winds swirl around the summit, bringing a refreshing chill.',
      'Tangles of brush yield to rocky outcrops near the peak.',
      'A vantage that reveals the stark contrasts of shoreline, plains, and forest.'
    ]
  },

  // 18) SETTLEMENT
  {
    id: 'SETTLEMENT',
    name: 'Asilo de la Paz (Penal Colony)',
    description: 'A small, gloomy settlement of prisoners and soldiers. The Vice Governor’s house stands out.',
    x: 2,
    y: 2,
    color: '#cd853f',
    type: 'settlement',
    validMoves: ['N','E','W','S'],
    specimens: ['mangrove','medium_ground_finch'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'You overhear whispers of contraband or banned literature hidden somewhere in the colony.'
    ],
    notableFeatures: [
      'Ramshackle huts ring a central courtyard behind a crude fence.',
      'Soldiers appear anxious, as if recent troubles have them on edge.',
      'Garden plots struggle against the dry, rocky soil.'
    ]
  },

  // 19) E_MID
  {
    id: 'E_MID',
    name: 'Rocky Clearing',
    description: 'Mountainous terrain with mysterious caves.',
    x: 3,
    y: 2,
    color: '#bdb76b',
    type: 'highland',
    validMoves: ['N','E','W','S'],
    specimens: ['floreana_mockingbird','cactus'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'You find ash from a recent campfire near the largest cave. Someone has been living here.'
    ],
    notableFeatures: [
      'Sheer walls of volcanic rock overshadow the clearing.',
      'A faint smell of smoke and damp earth lingers in the air.',
      'The hush suggests few creatures dwell in these rocky heights.'
    ]
  },

  // 20) EL_MIRADOR
  {
    id: 'EL_MIRADOR',
    name: 'El Mirador',
    description: 'A vantage point in the eastern highlands with steep drops and panoramic views.',
    x: 4,
    y: 2,
    color: '#bdb76b',
    type: 'highland',
    validMoves: ['W','S','E'],
    specimens: ['floreana_giant_tortoise','large_ground_finch'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'From this cliff edge, you glimpse hidden coves along the southeastern coast.'
    ],
    notableFeatures: [
      'Jagged precipices fade into swirling mist down-slope.',
      'A hush broken only by the breeze rattling sparse foliage.',
      'A vantage revealing both ocean and highland in a single sweep.'
    ]
  },

  // 21) WATKINS
  {
    id: 'WATKINS',
    name: 'Watkins Camp',
    description: 'Ruined campsite of the Irish castaway Patrick Watkins, the first resident of the island.',
    x: 5,
    y: 2,
    color: '#bdb76b',
    type: 'camp',
    validMoves: ['W'],
    specimens: ['watkinswill'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'Tattered remnants of Watkins’ makeshift shelter and half-burned planks remain.'
    ],
    notableFeatures: [
      'Scraps of cloth and old nails litter the site of a long-forsaken camp.',
      'A battered trunk suggests he once stored valuables or supplies here.',
      'Local lore insists Watkins grew vegetables to trade with passing ships, but little remains.'
    ]
  },

  // 22) SW_BEACH
  {
    id: 'SW_BEACH',
    name: 'Marine Iguana Colony',
    description: 'Volcanic rock covered in basking iguanas.',
    x: 0,
    y: 3,
    color: '#8b4513',
    type: 'coastalTrail',
    validMoves: ['N','E','S'],
    specimens: ['marineIguana','sallyLightfoot'],
    npcs: [],
    boundaries: { west: 'ocean' },
    discoveries: [
      'The iguanas smell absolutely atrocious, reeking of seaweed and brine.'
    ],
    notableFeatures: [
      'Iguanas cling to black lava for warmth in the sun.',
      'A pungent odor of reptile musk and damp algae lingers.',
      'Ruddy crabs scuttle around the edges, scavenging scraps.'
    ]
  },

  // 23) MANGROVES
  {
    id: 'MANGROVES',
    name: 'Southern Forest',
    description: 'A lush jungle, choked with vines. Travel is difficult here.',
    x: 1,
    y: 3,
    color: 'green',
    type: 'forest',
    validMoves: ['N','E','W','S'],
    specimens: ['mangrove','floreana_giant_tortoise'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'Dense tangles of roots and vines hamper your movement, though the shade provides relief from the sun.'
    ],
    notableFeatures: [
      'Towering mangroves create a canopy above brackish pools.',
      'Muddy ground teems with insect life, buzzing and chirping in the gloom.',
      'Tortoise tracks lead deeper into the forest, where large ferns flourish.'
    ]
  },

  // 24) S_VOLCANIC
  {
    id: 'S_VOLCANIC',
    name: 'Basalt Plains',
    description: 'A stark, black volcanic plain.',
    x: 2,
    y: 3,
    color: '#696969',
    type: 'lavaField',
    validMoves: ['N','E','W','S'],
    specimens: ['lavaLizard'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'Geological investigations would be warranted here—layers of basalt stretch across the horizon.'
    ],
    notableFeatures: [
      'Flat, cracked basalt stretches under a pitiless sun.',
      'Occasional fumaroles vent faint sulfuric steam.',
      'Minimal shade, save for a few rugged boulders.'
    ]
  },

  // 25) SE_PROMONTORY
  {
    id: 'SE_PROMONTORY',
    name: 'Wind-Swept Promontory',
    description: 'A high, rocky outcrop.',
    x: 3,
    y: 3,
    color: 'gray',
    type: 'promontory',
    validMoves: ['N','W','S'],
    specimens: ['frigatebird'],
    npcs: [],
    boundaries: { east: 'cliff' },
    discoveries: [
      'The vantage reveals glimpses of the vast southern seas.'
    ],
    notableFeatures: [
      'Rugged stone ledges battered by unrelenting winds.',
      'A precipitous drop leads to a beach far below.',
      'A majestic sense of isolation among swirling gusts.'
    ]
  },

  // 26) SE_COAST
  {
    id: 'SE_COAST',
    name: 'Southeastern Coast',
    description: 'A remote, windblown coastline littered with wreckage.',
    x: 4,
    y: 3,
    color: '#5f9ea0',
    type: 'coastalTrail',
    validMoves: ['N','W'],
    specimens: ['booby','seaLion'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'You find a rusted metal plate among debris, bearing the faint name of a lost ship.'
    ],
    notableFeatures: [
      'Waves crash against broken timbers and driftwood.',
      'Wind whips up grains of sand into your eyes.',
      'Salt-laden air reveals old scraps of sail and rope.'
    ]
  },

  // 27) SE_SHALLOW_SURF
  {
    id: 'SE_SHALLOW_SURF',
    name: 'Shallow Surf',
    description: 'Calm, shallow waters near the shore, where sea lions and green turtles swim.',
    x: 4,
    y: 4,
    color: 'lightblue',
    type: 'ocean',
    validMoves: ['N','W'],
    specimens: ['greenTurtle','parrotfish','seaLion'],
    npcs: [],
    boundaries: { south: 'ocean', east: 'ocean' },
    discoveries: [
      'Peering through the gentle waves, you spy a bright parrotfish nibbling algae off a rock.'
    ],
    notableFeatures: [
      'Gentle swells lap quietly at your knees.',
      'Sunlight sparkles across turquoise water.',
      'Turtles and sea lions glide slowly, utterly unafraid of humans.'
    ]
  },

  // 28) SW_CLIFFS
  {
    id: 'SW_CLIFFS',
    name: 'Southwestern Cliffs',
    description: 'Sheer cliffs with crashing waves and seabird nests.',
    x: 0,
    y: 4,
    color: '#8b4513',
    type: 'cliff',
    validMoves: ['N','E'],
    specimens: ['booby','frigatebird'],
    npcs: [],
    boundaries: { south: 'ocean', west: 'ocean' },
    discoveries: [
      'A precarious ledge below the cliff’s lip might be a nesting site or hideaway.'
    ],
    notableFeatures: [
      'Foam and spray lash the base of the towering rock face.',
      'Bird cries echo in the wind-carved hollows.',
      'Narrow switchbacks along the cliff could challenge even the sure-footed.'
    ]
  },

  // 29) PUNTA_SUR
  {
    id: 'PUNTA_SUR',
    name: 'Punta Sur',
    description: 'A dramatic headland with steep cliffs and frequent rainbows.',
    x: 2,
    y: 4,
    color: '#8b4513',
    type: 'promontory',
    validMoves: ['N','E','W'],
    specimens: ['frigatebird','booby'],
    npcs: [],
    boundaries: { south: 'cliff' },
    discoveries: [
      'At certain hours, the crashing spray refracts the light, creating rainbow arcs in mid-air.'
    ],
    notableFeatures: [
      'Rocky precipices battered by incoming swells.',
      'A vantage for miles of open ocean to the south.',
      'Spray and sun combine in ephemeral arcs of color.'
    ]
  },

  // 30) S_WETLANDS
  {
    id: 'S_WETLANDS',
    name: 'Wetlands Forest',
    description: 'Mangroves in the lowlands, moving up to dense tropical vegetation.',
    x: 3,
    y: 4,
    color: '#6b8e23',
    type: 'wetland',
    validMoves: ['N','E','W'],
    specimens: ['mangrove'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'A scrap of red cloth is tied to a branch, near what looks like a crumbled low stone wall—evidence of past habitation.'
    ],
    notableFeatures: [
      'Thick mud and tangled roots hamper progress.',
      'Egrets and flamingos feed among shallow pools (when in season).',
      'A square of land seems to have been cleared for some attempt at farming.'
    ]
  },

  // 31) S_INTERTIDAL
  {
    id: 'S_INTERTIDAL',
    name: 'Intertidal Flats',
    description: 'Mangroves and rocky tide pools teeming with marine life.',
    x: 1,
    y: 4,
    color: '#5f9ea0',
    type: 'wetland',
    validMoves: ['N','E','W'],
    specimens: ['crab','mangrove','sallyLightfoot','greenTurtle'],
    npcs: [],
    boundaries: { south: 'ocean' },
    discoveries: [
      'You glimpse many small creatures scuttling among the shallows at low tide.'
    ],
    notableFeatures: [
      'Rocky pools reveal starfish, crabs, and sea urchins on close inspection.',
      'Overhanging mangrove branches create pockets of shade along the waterline.',
      'Soft mud thick with decaying vegetation releases a sulfuric odor.'
    ]
  },

  // 32) S_HUT
  {
    id: 'S_HUT',
    name: 'Abandoned Beach Hut',
    description: 'A protected beach with a small hut and the remains of a household garden.',
    x: 1,
    y: 5,
    color: '#5f9ea0',
    type: 'hut',
    validMoves: ['N','E'],
    specimens: ['crab','sallyLightfoot','greenTurtle'],
    npcs: [],
    boundaries: { south: 'ocean', west: 'ocean' },
    discoveries: [
      'Stunted tomato plants and empty seedbeds remain from an earlier attempt at cultivation.'
    ],
    notableFeatures: [
      'A crumbling wooden hut stands near the treeline, half-buried in sand drifts.',
      'Rusty tools lie abandoned, hinting at hasty departure.',
      'One corner of the hut’s roof has collapsed, letting in sea spray and sunlight.'
    ]
  },

  // 33) S_REEFS
  {
    id: 'S_REEFS',
    name: 'Southern Reefs',
    description: 'Shallow reefs with rich biodiversity, frequented by sea turtles and rays.',
    x: 2,
    y: 5,
    color: '#4682b4',
    type: 'reef',
    validMoves: ['N','W'],
    specimens: ['greenTurtle','mantaRay','parrotfish'],
    npcs: [],
    boundaries: { south: 'ocean' },
    discoveries: [
      'In calm weather, you can wade far out on the reef shelf, catching glimpses of rays gliding below.'
    ],
    notableFeatures: [
      'Shallow coral heads form labyrinthine channels.',
      'Mosaic of colorful fish flit through crystal-clear water.',
      'A sense of abundance and vitality, though storms can make these waters perilous.'
    ]
  }

]; // end of locations array


export default locations;



// Add compatibility with island grid
export const syncWithIslandGrid = (islandGrid) => {
  if (!islandGrid) return;
  
  // Add any missing locations from islandGrid to the locations array
  islandGrid.forEach(gridCell => {
    // Check if this cell already exists in locations
    const exists = locations.some(loc => 
      loc.id === gridCell.id || loc.name === gridCell.name
    );
    
    if (!exists) {
      // Add this location
      locations.push({
        id: gridCell.id,
        name: gridCell.name,
        description: gridCell.description,
        x: gridCell.x * 10 + 25, // Scale for display
        y: gridCell.y * 10 + 25, // Scale for display
        color: gridCell.color || '#777',
        discoveries: gridCell.specimens || []
      });
    }
  });
  
  return locations;
};

// Helper to get all location info at once
export const getAllLocations = () => {
  try {
    // Try to import the islandGrid and sync
    import('../utils/locationSystem').then(module => {
      if (module && module.islandGrid) {
        return syncWithIslandGrid(module.islandGrid);
      }
      return locations;
    }).catch(() => {
      return locations;
    });
  } catch (e) {
    return locations;
  }
};