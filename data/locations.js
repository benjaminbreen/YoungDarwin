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
    type: 'beagle',
    validMoves: ['SE'],
    specimens: ['Jacko the Monkey'],
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
    specimens: ['greenTurtle','parrotfish','seaLion','lavagull'],
    specimenPlacements: [
      {
        specimenId: 'greenTurtle',
        position: [-18, 0, -28],
        behavior: 'still',
        sceneScale: 1.1,
        habitatRadiusX: 0.4,
        habitatRadiusZ: 0.3,
      },
      {
        specimenId: 'parrotfish',
        position: [6, 0, -32],
        behavior: 'skitter',
        sceneScale: 1,
        habitatRadiusX: 0.35,
        habitatRadiusZ: 0.25,
      },
      {
        specimenId: 'seaLion',
        position: [-7, 0, -23.5],
        behavior: 'bask',
        sceneScale: 1.15,
      },
      {
        instanceId: 'nw-reef-lavagull-tideline-1',
        specimenId: 'lavagull',
        position: [-3.5, 0, -18.2],
        behavior: 'shorebird',
        sceneScale: 0.92,
        habitatRadiusX: 10.5,
        habitatRadiusZ: 4.8,
      },
      {
        instanceId: 'nw-reef-lavagull-tideline-2',
        specimenId: 'lavagull',
        position: [18.5, 0, -15.4],
        behavior: 'shorebird',
        sceneScale: 0.86,
        habitatRadiusX: 9.2,
        habitatRadiusZ: 4.2,
      },
    ],
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
    validMoves: ['W','E','SW','S','NW','N'],
    playerStart: [12.6, 0, 13.0],
    specimens: ['crab','basalt','barnacle','galapagoscotton','flightlesscormorant','lavalizard','lavagull'],
    specimenPlacements: [
      {
        specimenId: 'flightlesscormorant',
        position: [-26.5, 0, -3.8],
        behavior: 'waddle',
        sceneScale: 1.05,
        habitatRadiusX: 8.5,
        habitatRadiusZ: 4.2,
        spawnScatter: {
          radiusX: 4.2,
          radiusZ: 2.4,
          bounds: { minX: -34, maxX: -18, minZ: -8.2, maxZ: 2.4 },
        },
      },
      {
        specimenId: 'lavalizard',
        position: [-12, 0, 0],
        behavior: 'bask',
        sceneScale: 1.9,
        habitatRadiusX: 2.4,
        habitatRadiusZ: 1.2,
        spawnScatter: {
          radiusX: 1.8,
          radiusZ: 0.8,
          bounds: { minX: -16, maxX: -7, minZ: -2.5, maxZ: 3.5 },
        },
      },
      {
        specimenId: 'crab',
        position: [-29.5, 0, -3.2],
        behavior: 'skitter',
        sceneScale: 1.45,
        habitatRadiusX: 5.8,
        habitatRadiusZ: 2.8,
        spawnScatter: {
          radiusX: 3.6,
          radiusZ: 1.2,
          bounds: { minX: -35, maxX: -22, minZ: -5, maxZ: -0.8 },
        },
      },
      {
        instanceId: 'post-office-lavagull-swash-1',
        specimenId: 'lavagull',
        position: [-13.2, 0, -5.8],
        behavior: 'shorebird',
        sceneScale: 0.9,
        habitatRadiusX: 9.5,
        habitatRadiusZ: 4.2,
      },
      {
        instanceId: 'post-office-lavagull-swash-2',
        specimenId: 'lavagull',
        position: [3.8, 0, -6.6],
        behavior: 'shorebird',
        sceneScale: 0.84,
        habitatRadiusX: 8.6,
        habitatRadiusZ: 3.8,
      },
      {
        specimenId: 'galapagoscotton',
        position: [18.6, 0, 21.4],
        behavior: 'still',
        sceneScale: 0.78,
        habitatRadiusX: 0.68,
        habitatRadiusZ: 0.48,
      },
      {
        specimenId: 'galapagoscotton',
        position: [-18.4, 0, 12.8],
        behavior: 'still',
        sceneScale: 0.72,
        habitatRadiusX: 0.62,
        habitatRadiusZ: 0.46,
      },
    ],
    npcs: ['lascar_joe'],
    discoveries: [
      'You notice a weathered barrel filled with letters. If you were nosy, you might read some...'
    ],
    notableFeatures: [
      'According to a crewmate on the Beagle, this makeshift mail system has been in place since the Napoleonic era.',
      'Seabirds and crabs patrol the calm cove.',
      'Footprints in the sand lead inland.'
    ]
  },

  // 3b) ALT_POST_OFFICE_BAY — experimental rework of the anchorage shaped
  // from the real satellite contour. Reached from Post Office Bay (north
  // edge), the island map, or /three?zone=ALT_POST_OFFICE_BAY.
  {
    id: 'ALT_POST_OFFICE_BAY',
    name: 'Post Office Bay (New)',
    description: 'The sheltered crescent anchorage: pale sand, a mangrove headland, and the sailors’ barrel above the landing.',
    x: 1,
    y: -1,
    color: 'beige',
    type: 'bay',
    validMoves: ['S'],
    specimens: ['crab','basalt','barnacle','galapagoscotton'],
    specimenPlacements: [
      {
        specimenId: 'lavalizard',
        position: [34, 0, -6],
        behavior: 'bask',
        sceneScale: 1.7,
        habitatRadiusX: 2.4,
        habitatRadiusZ: 1.2,
      },
      {
        specimenId: 'crab',
        position: [6, 0, 2],
        behavior: 'skitter',
        sceneScale: 1.45,
      },
      {
        specimenId: 'galapagoscotton',
        position: [14, 0, 22],
        behavior: 'still',
        sceneScale: 0.92,
        habitatRadiusX: 0.74,
        habitatRadiusZ: 0.52,
      },
      {
        specimenId: 'galapagoscotton',
        position: [-12, 0, 18],
        behavior: 'still',
        sceneScale: 0.78,
        habitatRadiusX: 0.68,
        habitatRadiusZ: 0.48,
      },
    ],
    npcs: ['lascar_joe'],
    boundaries: { north: 'ocean', east: 'ocean', west: 'ocean' },
    discoveries: [
      'You notice a weathered barrel filled with letters. If you were nosy, you might read some...'
    ],
    notableFeatures: [
      'A crescent of pale sand curves between a green mangrove headland and a low basalt point.',
      'The old sailors’ barrel stands on a white shell-sand flat above the landing.',
      'A worn trail, lined with weathered posts, climbs inland through the dry scrub.'
    ]
  },

  // 3c) POST_OFFICE_BAY_3 — isolated visual prototype for the anchorage.
  // Reached directly at /postofficebay3 or /three?zone=POST_OFFICE_BAY_3.
  {
    id: 'POST_OFFICE_BAY_3',
    name: 'Post Office Bay III',
    description: 'A ground-first reconstruction of the sheltered anchorage: shallow northern water, a compacted post trail, and dense dry scrub massing behind the landing.',
    x: 1,
    y: -2,
    color: 'beige',
    type: 'bay',
    validMoves: ['S'],
    specimens: ['crab','basalt','galapagoscotton','cactus'],
    specimenPlacements: [
      {
        specimenId: 'lavalizard',
        position: [40, 0, -8],
        behavior: 'bask',
        sceneScale: 1.7,
        habitatRadiusX: 2.4,
        habitatRadiusZ: 1.2,
      },
      {
        specimenId: 'crab',
        position: [8, 0, -1],
        behavior: 'skitter',
        sceneScale: 1.4,
      },
      {
        specimenId: 'galapagoscotton',
        position: [18, 0, 28],
        behavior: 'still',
        sceneScale: 0.86,
        habitatRadiusX: 0.72,
        habitatRadiusZ: 0.5,
      },
      {
        specimenId: 'cactus',
        position: [30, 0, 18],
        behavior: 'still',
        sceneScale: 1.08,
        habitatRadiusX: 0.68,
        habitatRadiusZ: 0.5,
      },
    ],
    npcs: ['lascar_joe'],
    boundaries: { north: 'ocean', east: 'ocean', west: 'ocean' },
    discoveries: [
      'The sailors’ barrel stands above a pale landing flat, with a worn track leading inland through close dry scrub.'
    ],
    notableFeatures: [
      'The path is the main landmark: compacted sand and ash run from the post barrel toward the inland scrub.',
      'Dense salt-pruned shrubs crowd the track edges instead of spreading evenly across the beach.',
      'Basalt frames the bay mouth, but the landing remains open and readable.'
    ]
  },

  // 3d) GRASS_TEST — textured coastal grass/path material test.
  // Reachable from the island map; keep as the current art-direction proving ground.
  {
    id: 'GRASS_TEST',
    name: 'Grass Test',
    description: 'A playable coastal grass path test for tuning reusable sandy track textures, dry grass clumps, and shoulder transitions before the setup is folded back into Floreana.',
    x: 2,
    y: -2,
    color: '#79a84c',
    type: 'grassland',
    validMoves: [],
    specimens: [],
    npcs: [],
    boundaries: {},
    discoveries: [
      'A sandy footpath cuts through salt-pruned coastal grass, with dry stems crowding the shoulders.'
    ],
    notableFeatures: [
      'The ground uses repeated path and shoulder textures blended by splat masks instead of a flat procedural color.',
      'The grass uses the reusable dry-grass GLB clumps with per-instance scale, tint, and wind variation.',
      'This map is the current standardization test for reusable coastal grass and footpath assets.'
    ],
    narration: {
      weather: 'sunny',
      sounds: ['wind through dry grass', 'soft sand footfalls', 'distant surf'],
      loadingNote: 'A textured coastal grass path test for reusable Floreana terrain assets.',
      educationalNote: 'This test map isolates path, shoulder, and dry-grass rendering so the materials can be reused consistently in authored regions.',
    },
  },

  // 3e) GRASS_HYBRID_TEST — renderer lab for hybrid grass LOD.
  // Keeps GRASS_TEST intact while testing terrain splats + near blades + mid impostors.
  {
    id: 'GRASS_HYBRID_TEST',
    name: 'Hybrid Grass Test',
    description: 'A second temporary grass field for testing a cheaper hybrid rendering stack: splatted underbrush terrain, near interactive blades, and mid-distance tuft impostors.',
    x: 3,
    y: -2,
    color: '#5f8d47',
    type: 'grassland',
    validMoves: [],
    specimens: ['lavalizard','booby'],
    specimenPlacements: [
      {
        specimenId: 'lavalizard',
        position: [-6, 0, -2],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 5.2,
        habitatRadiusZ: 3.0,
      },
      {
        specimenId: 'booby',
        position: [6, 0, -1.5],
        behavior: 'curious',
        sceneScale: 1.28,
        habitatRadiusX: 6.5,
        habitatRadiusZ: 3.5,
      },
    ],
    npcs: [],
    boundaries: {},
    discoveries: [
      'The field is built in layers: painted undergrowth at distance, clustered tufts in the middle ground, and interactive blades near Darwin.'
    ],
    notableFeatures: [
      'A red dirt path cuts through the field to make grass edges, ruts, and far-field texture easy to judge.',
      'Near grass should visibly part around Darwin, while distant grass should resolve into terrain splats instead of sparkling hairlines.',
      'This map is a renderer experiment and should not be treated as final Floreana content.'
    ],
    narration: {
      weather: 'sunny',
      sounds: ['wind through uneven grass', 'dry seed heads', 'boots on red dirt'],
      loadingNote: 'A hybrid renderer test field for grass LOD and path readability.',
      educationalNote: 'This test isolates a cheaper grass stack: terrain underbrush, clustered impostors, and near interactive blades.',
    },
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
    specimens: ['frigatebird','booby','seaLion','lavagull'],
    specimenPlacements: [
      {
        specimenId: 'frigatebird',
        position: [-30, 0, -13.5],
        behavior: 'wary',
        sceneScale: 1.0,
        habitatRadiusX: 10.5,
        habitatRadiusZ: 4.8,
        spawnScatter: {
          radiusX: 8,
          radiusZ: 2.8,
          bounds: { minX: -43, maxX: -16, minZ: -19, maxZ: -6 },
        },
      },
      {
        specimenId: 'lavalizard',
        position: [10, 0, -8],
        behavior: 'scurry',
        sceneScale: 1.45,
        habitatRadiusX: 3.2,
        habitatRadiusZ: 1.6,
        spawnScatter: {
          radiusX: 2.8,
          radiusZ: 1.2,
          bounds: { minX: 5, maxX: 17, minZ: -11.5, maxZ: -5.5 },
        },
      },
      {
        specimenId: 'booby',
        position: [-7.5, 0, -8.8],
        behavior: 'curious',
        sceneScale: 1.05,
        habitatRadiusX: 7.5,
        habitatRadiusZ: 3.2,
        spawnScatter: {
          radiusX: 4.4,
          radiusZ: 1.6,
          bounds: { minX: -16, maxX: 2, minZ: -12, maxZ: -5.2 },
        },
      },
      {
        instanceId: 'north-shore-lavagull-swash-1',
        specimenId: 'lavagull',
        position: [14.5, 0, -9.6],
        behavior: 'shorebird',
        sceneScale: 0.92,
        habitatRadiusX: 11,
        habitatRadiusZ: 4.6,
      },
      {
        instanceId: 'north-shore-lavagull-swash-2',
        specimenId: 'lavagull',
        position: [35.2, 0, -7.2],
        behavior: 'shorebird',
        sceneScale: 0.86,
        habitatRadiusX: 9.5,
        habitatRadiusZ: 4.0,
      },
      {
        specimenId: 'marineIguana',
        position: [30.6, 0, -5.8],
        behavior: 'bask',
      },
    ],
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

  // 5b) CORMORANT_BAY_SPLAT_TEST — side-by-side authored wetland prototype.
  {
    id: 'CORMORANT_BAY_SPLAT_TEST',
    name: 'Cormorant Bay Splat Test',
    description: 'A renderer-focused reconstruction of the olivine beach and brackish flamingo lagoon at Punta Cormorant.',
    x: 3,
    y: -1,
    color: '#6f8f4e',
    type: 'wetland',
    validMoves: ['S'],
    specimens: ['flamingo','frigatebird','booby','lavalizard'],
    specimenPlacements: [
      {
        specimenId: 'flamingo',
        position: [-8, 0, -2.5],
        behavior: 'still',
        sceneScale: 1.05,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.4,
      },
      {
        specimenId: 'flamingo',
        position: [3.5, 0, 1.2],
        behavior: 'still',
        sceneScale: 0.96,
        habitatRadiusX: 4.2,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'flamingo',
        position: [14, 0, 6.6],
        behavior: 'still',
        sceneScale: 0.9,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2,
      },
      {
        specimenId: 'lavalizard',
        position: [-18, 0, 14],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 4.6,
        habitatRadiusZ: 2.5,
      },
      {
        specimenId: 'booby',
        position: [-6, 0, 14],
        behavior: 'curious',
        sceneScale: 1.25,
        habitatRadiusX: 7.2,
        habitatRadiusZ: 3.6,
      },
    ],
    npcs: [],
    boundaries: {},
    discoveries: [
      'A pink line of flamingos feeds in the brackish water while olivine crystals tint the beach a muted green.'
    ],
    notableFeatures: [
      'The lagoon edge is the focus: wet mud, salt crust, algae, and sparse saltgrass should read clearly before any splat backdrop is enabled.',
      'A walkable olivine path skirts the lagoon and frames the flamingos rather than cutting through them.',
      'Optional static splats may later enrich the distant reed and scrub shell, but gameplay remains mesh-based.'
    ],
    narration: {
      weather: 'sunny',
      sounds: ['soft lagoon wind', 'distant seabirds', 'mud sucking underfoot'],
      loadingNote: 'A side-by-side Cormorant Bay prototype for lagoon, olivine beach, and optional splat backdrop rendering.',
      educationalNote: 'Punta Cormorant is known for a brackish flamingo lagoon and greenish olivine sand, making it ideal for testing wetland rendering.',
    },
  },

  // 5c) CORMORANT_BAY_TEST_2 — stable grass LOD prototype.
  {
    id: 'CORMORANT_BAY_TEST_2',
    name: 'Cormorant Bay Test 2',
    description: 'A renderer-focused Cormorant Bay variant testing near blades, mid grass clumps, and far terrain meadow detail.',
    x: 4,
    y: -1,
    color: '#758c4a',
    type: 'wetland',
    validMoves: ['SW'],
    specimens: ['flamingo','frigatebird','booby','lavalizard'],
    specimenPlacements: [
      {
        specimenId: 'flamingo',
        position: [-8, 0, -2.5],
        behavior: 'still',
        sceneScale: 1.05,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.4,
      },
      {
        specimenId: 'flamingo',
        position: [3.5, 0, 1.2],
        behavior: 'still',
        sceneScale: 0.96,
        habitatRadiusX: 4.2,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'flamingo',
        position: [14, 0, 6.6],
        behavior: 'still',
        sceneScale: 0.9,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2,
      },
      {
        specimenId: 'lavalizard',
        position: [-24, 0, 14],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'lavalizard',
        position: [-18, 0, 14],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'lavalizard',
        position: [-12, 0, 14],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'lavalizard',
        position: [-6, 0, 14],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'lavalizard',
        position: [0, 0, 14],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'lavalizard',
        position: [8, 0, 14.2],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'lavalizard',
        position: [16, 0, 10],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'lavalizard',
        position: [24, 0, 14],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'booby',
        position: [-27, 0, 10],
        behavior: 'curious',
        sceneScale: 1.32,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.8,
      },
      {
        specimenId: 'booby',
        position: [-20, 0, 10],
        behavior: 'curious',
        sceneScale: 1.32,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.8,
      },
      {
        specimenId: 'booby',
        position: [-13, 0, 10],
        behavior: 'curious',
        sceneScale: 1.32,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.8,
      },
      {
        specimenId: 'booby',
        position: [-4, 0, 12],
        behavior: 'curious',
        sceneScale: 1.32,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.8,
      },
      {
        specimenId: 'booby',
        position: [6, 0, 14.2],
        behavior: 'curious',
        sceneScale: 1.32,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.8,
      },
      {
        specimenId: 'booby',
        position: [15, 0, 8],
        behavior: 'curious',
        sceneScale: 1.32,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.8,
      },
      {
        specimenId: 'booby',
        position: [22, 0, 14],
        behavior: 'curious',
        sceneScale: 1.32,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.8,
      },
      {
        specimenId: 'booby',
        position: [28, 0, -2],
        behavior: 'curious',
        sceneScale: 1.32,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.8,
      },
    ],
    npcs: [],
    boundaries: {},
    discoveries: [
      'Dry beach grass resolves into real blades near Darwin, clumps at middle distance, and a stable meadow texture toward the horizon.'
    ],
    notableFeatures: [
      'Near grass keeps the close-up blade quality from the first Cormorant prototype.',
      'Mid-distance vegetation is card-based and muted to avoid single-pixel shimmer.',
      'Far meadow detail is carried by the terrain shader rather than thousands of visible straw lines.'
    ],
    narration: {
      weather: 'sunny',
      sounds: ['soft lagoon wind', 'distant seabirds', 'dry beach grass'],
      loadingNote: 'A second Cormorant Bay prototype focused on professional grass LOD stability.',
      educationalNote: 'Punta Cormorant combines brackish lagoon habitat with dry coastal grasses and olivine sand, making it a useful scene for testing vegetation LOD.',
    },
  },

  // 5d) CORMORANT_BAY_TEST_3 — opaque stylized grass LOD prototype.
  {
    id: 'CORMORANT_BAY_TEST_3',
    name: 'Cormorant Bay Test 3',
    description: 'A stylized Cormorant Bay grass prototype using opaque ribbon tufts and a matching terrain meadow atlas.',
    x: 5,
    y: -1,
    color: '#788d4c',
    type: 'wetland',
    validMoves: ['W','SW'],
    specimens: ['flamingo','frigatebird','booby'],
    specimenPlacements: [
      {
        specimenId: 'flamingo',
        position: [-8, 0, -2.5],
        behavior: 'still',
        sceneScale: 1.05,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.4,
      },
      {
        specimenId: 'flamingo',
        position: [3.5, 0, 1.2],
        behavior: 'still',
        sceneScale: 0.96,
        habitatRadiusX: 4.2,
        habitatRadiusZ: 2.2,
      },
      {
        specimenId: 'flamingo',
        position: [14, 0, 6.6],
        behavior: 'still',
        sceneScale: 0.9,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2,
      },
      {
        specimenId: 'lavalizard',
        position: [-18, 0, 14],
        behavior: 'scurry',
        sceneScale: 2.0,
        habitatRadiusX: 4.6,
        habitatRadiusZ: 2.5,
      },
      {
        specimenId: 'booby',
        position: [-6, 0, 14],
        behavior: 'curious',
        sceneScale: 1.25,
        habitatRadiusX: 7.2,
        habitatRadiusZ: 3.6,
      },
    ],
    npcs: [],
    boundaries: {},
    discoveries: [
      'The beach grass resolves as stylized ribbon tufts nearby and a filtered meadow mass toward the horizon.'
    ],
    notableFeatures: [
      'Opaque toon-shaded grass avoids black alpha-card clumps.',
      'Near and mid grass share the same meadow density, dryness, and direction fields.',
      'The distant meadow is carried by a filtered terrain atlas instead of sub-pixel blade geometry.'
    ],
    narration: {
      weather: 'sunny',
      sounds: ['coherent wind through dry grass', 'distant seabirds', 'lagoon shallows'],
      loadingNote: 'A third Cormorant Bay prototype focused on unified stylized grass LOD.',
      educationalNote: 'Punta Cormorant combines brackish lagoon habitat with dry coastal grasses and olivine sand, making it a useful scene for testing readable vegetation at several distances.',
    },
  },

  // 6) DEVILS_CROWN
  {
    id: 'DEVILS_CROWN',
    name: "Devil's Crown",
    description: 'A broken volcanic crown offshore: Darwin must swim from the landing rock to reach the crater rim and lagoon.',
    x: 4,
    y: -2,
    color: '#20b2aa',
    type: 'coastallava',
    playerStart: [0, 0, 39],
    validMoves: ['SW','S'],
    routeOverrides: { SW: 'N_OUTCROP', S: 'PUNTA_CORMORANT' },
    routeOverrideTravel: {
      SW: {
        minutes: 42,
        fatigue: 5,
        routeLabel: 'SW',
        description: 'Return southwest by boat and surf line toward the desolate outcrop.',
      },
      S: {
        minutes: 48,
        fatigue: 4,
        routeLabel: 'S',
        description: 'Swim back to the landing rock, then travel south toward Punta Cormorant.',
      },
    },
    specimens: ['greenTurtle','booby','coral'],
    specimenPlacements: [
      {
        specimenId: 'booby',
        position: [-12, 0, -24],
        behavior: 'curious',
        sceneScale: 1.08,
        habitatRadiusX: 7.4,
        habitatRadiusZ: 3.6,
      },
      {
        specimenId: 'greenTurtle',
        position: [10, 0, 6],
        behavior: 'still',
        sceneScale: 1.05,
        habitatRadiusX: 4.4,
        habitatRadiusZ: 2.4,
      },
      {
        specimenId: 'coral',
        position: [-3, 0, 37],
        behavior: 'still',
        sceneScale: 0.9,
        habitatRadiusX: 0.7,
        habitatRadiusZ: 0.5,
      },
    ],
    npcs: [],
    boundaries: { north: 'ocean', east: 'ocean', west: 'ocean' },
    discoveries: [
      'Underwater pinnacles hide colorful fish and coral formations, but the crater rim can only be reached by swimming the channel.'
    ],
    notableFeatures: [
      'Dark lava spires form a broken crown around a clear inner lagoon.',
      'A small southern landing rock leaves a swim-depth channel between Darwin and the crater rim.',
      'Manta rays and fish move through the blue water while seabirds hold the high black rock.'
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
    playerStart: [0, 0, 32],
    validMoves: ['S','NE'],
    routeOverrides: { NE: 'DEVILS_CROWN' },
    routeOverrideTravel: {
      NE: {
        minutes: 42,
        fatigue: 5,
        routeLabel: 'NE',
        description: 'Cross northeast by boat and swimming approach toward Devil\'s Crown.',
      },
    },
    specimens: ['seaLion','marineIguana','crab','lavaLizard'],
    specimenPlacements: [
      {
        specimenId: 'seaLion',
        position: [3, 0, -19],
        behavior: 'bask',
        sceneScale: 1.12,
        habitatRadiusX: 5.2,
        habitatRadiusZ: 2.6,
      },
      {
        specimenId: 'marineIguana',
        position: [7.5, 0, -7.5],
        behavior: 'bask',
        sceneScale: 1.08,
        habitatRadiusX: 5.2,
        habitatRadiusZ: 2.8,
        spawnScatter: {
          radiusX: 2.8,
          radiusZ: 1.4,
          bounds: { minX: 2, maxX: 13, minZ: -13, maxZ: -2 },
        },
      },
      {
        specimenId: 'crab',
        position: [13, 0, 20],
        behavior: 'skitter',
        sceneScale: 1.38,
        habitatRadiusX: 3.8,
        habitatRadiusZ: 2.0,
      },
      {
        specimenId: 'lavaLizard',
        position: [-3.8, 0, 21.5],
        behavior: 'scurry',
        sceneScale: 1.42,
        habitatRadiusX: 3.2,
        habitatRadiusZ: 1.6,
        spawnScatter: {
          radiusX: 2.4,
          radiusZ: 1.2,
          bounds: { minX: -9, maxX: 3, minZ: 17, maxZ: 26 },
        },
      },
    ],
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

  // 8) BLACK_BEACH_SURF
  {
    id: 'BLACK_BEACH_SURF',
    name: 'Black Beach Surf',
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
      'Dangerous currents swirl around your legs, threatening to pull you seaward.'
    ],
    notableFeatures: [
      'Foam-topped waves crash rhythmically against volcanic sand.',
      'Dark shapes flicker beneath the surface—perhaps iguanas or large fish.',
      'The hiss of receding water hints at hidden currents. Be careful.'
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
    type: 'lavafield',
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
    specimens: ['frigatebird','floreana_mockingbird'],
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

  // 13) COASTAL SCRUBLAND
  {
    id: 'COASTAL_SCRUBLAND',
    name: 'Coastal Scrubland',
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
      'An area known among whalers for occasional fresh water seeps, though they may be dried up at this season.'
    ],
    notableFeatures: [
      'Sparse, open ground. Not much of visual interest.',
      'Mockingbirds dart between cacti, eager for seeds.',
      'Gritty wind stings your eyes, carrying faint salt from the sea.'
    ]
  },

  // 14) PUNTA_CORMORANT
  {
    id: 'PUNTA_CORMORANT',
    name: 'Punta Cormorant',
    description: 'An olivine-tinted beach opening onto a broad, shallow brackish lagoon where flamingos feed.',
    x: 5,
    y: 1,
    color: '#6f8f72',
    type: 'wetland',
    playerStart: [0, 0, 38],
    validMoves: ['N','W','SW'],
    routeOverrides: { N: 'DEVILS_CROWN' },
    routeOverrideTravel: {
      N: {
        minutes: 48,
        fatigue: 4,
        routeLabel: 'N',
        description: 'Travel north along the lagoon rim toward Devil\'s Crown.',
      },
    },
    specimens: ['flamingo','frigatebird'],
    specimenPlacements: [
      {
        specimenId: 'flamingo',
        position: [-28, 0, -7],
        behavior: 'still',
        sceneScale: 1.02,
        habitatRadiusX: 5.2,
        habitatRadiusZ: 2.8,
      },
      {
        specimenId: 'flamingo',
        position: [-13, 0, -1.5],
        behavior: 'still',
        sceneScale: 0.96,
        habitatRadiusX: 4.8,
        habitatRadiusZ: 2.5,
      },
      {
        specimenId: 'flamingo',
        position: [4, 0, 3.5],
        behavior: 'still',
        sceneScale: 1.05,
        habitatRadiusX: 5.5,
        habitatRadiusZ: 2.8,
      },
      {
        specimenId: 'flamingo',
        position: [20, 0, -4],
        behavior: 'still',
        sceneScale: 0.92,
        habitatRadiusX: 4.6,
        habitatRadiusZ: 2.3,
      },
      {
        specimenId: 'flamingo',
        position: [31, 0, 7],
        behavior: 'still',
        sceneScale: 0.88,
        habitatRadiusX: 4.2,
        habitatRadiusZ: 2.2,
      },
    ],
    npcs: [],
    boundaries: { east: 'ocean', south: 'ocean' },
    discoveries: [
      'The green tinge of the sand, caused by olivine crystals, intrigues you - perhaps worthy of a geological sample.',
      'Flamingos feed across the brackish lagoon, their long legs and pink bodies mirrored in the still water.'
    ],
    notableFeatures: [
      'A narrow beach shelf gives way almost immediately to shallow lagoon water.',
      'Dark mangrove-mud texture and saltgrass fringe the lagoon edge without turning the scene into dense forest.',
      'The northern rim opens toward Devil\'s Crown beyond the lagoon.'
    ],
    narration: {
      weather: 'sunny',
      sounds: ['soft lagoon wind', 'distant seabirds', 'slow water around boots'],
      loadingNote: 'An olivine beach leads into the broad flamingo lagoon at Punta Cormorant.',
      educationalNote: 'Punta Cormorant is known for greenish olivine sand and a brackish lagoon where flamingos feed in shallow water.',
    },
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
    specimenPlacements: [
      { specimenId: 'floreana_giant_tortoise', position: [-6.5, 0, 13.5], behavior: 'grazing', sceneScale: 1.1, habitatRadiusX: 8, habitatRadiusZ: 6 },
      { specimenId: 'floreana_mockingbird', position: [8.8, 0, -15.5], behavior: 'curious', sceneScale: 1.0, habitatRadiusX: 10, habitatRadiusZ: 8 },
    ],
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
    specimens: ['floreana_mockingbird'],
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

  // 18) PENAL COLONY
  {
    id: 'PENAL_COLONY',
    name: 'Ecuadorian Penal Colony',
    description: 'The Asilo de la Paz settlement: scattered huts, black-mud gardens, and soldiers on a green highland flat. The Vice Governor’s house stands apart on its knoll.',
    x: 2,
    y: 2,
    color: '#cd853f',
    type: 'settlement',
    validMoves: ['N','E','W','S'],
    specimens: ['medium_ground_finch','floreana_mockingbird'],
    npcs: [],
    boundaries: {},
    specimenPlacements: [
      {
        instanceId: 'penal-colony-medium-finch-garden-1',
        specimenId: 'medium_ground_finch',
        position: [-9.4, 0, 4.8],
        behavior: 'curious',
        sceneScale: 1.05,
        habitatRadiusX: 7.5,
        habitatRadiusZ: 4.5,
      },
      {
        instanceId: 'penal-colony-medium-finch-garden-2',
        specimenId: 'medium_ground_finch',
        position: [6.2, 0, -2.6],
        behavior: 'curious',
        sceneScale: 0.95,
        habitatRadiusX: 5.5,
        habitatRadiusZ: 3.8,
      },
    ],
    discoveries: [
      'You overhear whispers of contraband or banned literature hidden somewhere in the colony.'
    ],
    notableFeatures: [
      'Ramshackle huts ring a trampled courtyard behind a crude fence.',
      'Furrowed plots of sweet potato, maize, and cane sit dark and wet against the green.',
      'A red-dirt track climbs in from the north coast and forks toward the springs and caves.'
    ],
    narration: {
      weather: 'misty',
      sounds: ['hoes striking wet earth', 'a soldier’s cough from the barracks', 'finches in the garden rows'],
      loadingNote: 'The track levels out onto cultivated ground: Asilo de la Paz, the Ecuadorian penal settlement, Vice-Governor Lawson presiding.',
      educationalNote: 'Darwin found two to three hundred exiles here in 1835, farming sweet potatoes and bananas on the damp highland flat — and heard Lawson claim he could name any tortoise’s island from its shell.',
    },
  },

  // 19) E_MID
  {
    id: 'E_MID',
    name: 'Rocky Clearing',
    description: 'A dry highland clearing where a red-dirt path crosses volcanic rubble below a shadowed cave mouth.',
    x: 3,
    y: 2,
    color: '#bdb76b',
    type: 'clearing',
    validMoves: ['N','E','W','S'],
    playerStart: [-5, 0, 3.2],
    specimens: ['lavalizard','medium_ground_finch','basalt','scoria'],
    npcs: [],
    boundaries: {},
    specimenPlacements: [
      {
        instanceId: 'rocky-clearing-lava-lizard-warm-rocks-1',
        specimenId: 'lavalizard',
        position: [11.2, 0, -4.8],
        behavior: 'skittish',
        sceneScale: 0.92,
        habitatRadiusX: 8.5,
        habitatRadiusZ: 5.4,
      },
      {
        instanceId: 'rocky-clearing-medium-finch-path-edge-1',
        specimenId: 'medium_ground_finch',
        position: [-17.8, 0, 6.4],
        behavior: 'curious',
        sceneScale: 0.95,
        habitatRadiusX: 7.0,
        habitatRadiusZ: 4.5,
      },
      {
        instanceId: 'rocky-clearing-basalt-cave-apron-1',
        specimenId: 'basalt',
        position: [-7.2, 0, -6.8],
        behavior: 'still',
        sceneScale: 0.72,
      },
      {
        instanceId: 'rocky-clearing-scoria-camp-ash-1',
        specimenId: 'scoria',
        position: [4.8, 0, -5.2],
        behavior: 'still',
        sceneScale: 0.62,
      },
    ],
    discoveries: [
      'You find ash from a recent campfire near the largest cave. Someone has been living here.'
    ],
    notableFeatures: [
      'A compacted red-dirt path cuts east to west through dry highland grass.',
      'Basalt piles and loose scoria collect around a cave mouth set into the north rise.',
      'A small ash patch and charred sticks near the threshold suggest recent shelter.'
    ],
    narration: {
      weather: 'sunny',
      sounds: ['wind over dry grass', 'loose stones shifting underfoot', 'a finch calling from the scrub'],
      loadingNote: 'The path opens into a rocky highland clearing, where basalt rubble gathers below Gabriel’s cave.',
      educationalNote: 'Volcanic clearings expose the island’s recent geology: basalt blocks, red scoria, and ash tell different parts of the same eruptive history.',
    },
  },

  // 20) EL_MIRADOR
  {
    id: 'EL_MIRADOR',
    name: 'El Mirador',
    description: 'A grassy highland lookout where a red dirt footpath climbs toward steep drops and panoramic views.',
    x: 4,
    y: 2,
    color: '#bdb76b',
    type: 'highland',
    validMoves: ['W','S','E'],
    specimens: ['floreana_giant_tortoise','large_ground_finch'],
    npcs: [],
    boundaries: {},
    discoveries: [
      'From this cliff edge, a red dirt track winds through dry grass before the slope falls toward hidden southeastern coves.'
    ],
    notableFeatures: [
      'A compacted red dirt path cuts across the hillside and stays readable through grass-litter shoulders.',
      'Dry highland grass thickens away from the tread, with stones and pale shell flecks breaking up the ground.',
      'The ridge reveals both ocean and highland in a single sweep.'
    ],
    narration: {
      weather: 'sunny',
      sounds: ['wind through dry highland grass', 'loose gravel underfoot', 'distant surf below the ridge'],
      loadingNote: 'A red dirt highland path climbs through dry grass toward El Mirador.',
      educationalNote: 'El Mirador tests the transition from coastal dry grass to steeper highland terrain, where slope and wind shape vegetation density.',
    },
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
    narration: {
      weather: 'drizzle',
    },
    specimenPlacements: [
      {
        specimenId: 'mangrove',
        position: [-11.5, 0, -11.8],
        behavior: 'still',
        sceneScale: 1,
        habitatRadiusX: 5,
        habitatRadiusZ: 4,
      },
      {
        specimenId: 'floreana_giant_tortoise',
        position: [10.8, 0, 18.6],
        behavior: 'grazing',
        sceneScale: 1.08,
        habitatRadiusX: 7,
        habitatRadiusZ: 5,
      },
    ],
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
    type: 'lavafield',
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
    name: 'Windy Promontory',
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
    type: 'shipwreck',
    validMoves: ['N','W'],
    specimens: ['scurvyremedy','seaLion'],
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
    validMoves: ['N','S','W'],
    specimens: ['frigatebird','booby'],
    npcs: [],
    boundaries: { east: 'cliff' },
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
    name: 'Beach with Hut',
    description: 'A protected beach with a small hut and the remains of a household garden.',
    x: 1,
    y: 5,
    color: '#5f9ea0',
    type: 'hut',
    validMoves: ['N','E'],
    playerStart: [16, 0, -18],
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
    playerStart: [0, 0, -8],
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
  },
  {
  id: 'CAVE_ENTRANCE',
  name: "Gabriel's Cave",
  description: "A hidden revolutionary's sanctuary carved into volcanic rock.",
  x: 999,
  y: 999,
  color: '#333333',
  type: 'cave',
  validMoves: ['S'],
  playerStart: [0, 0, 10],
  specimens: [],
  npcs: ['gabriel_puig'],
  routeOverrides: { S: 'E_MID' },
  routeOverrideTravel: {
    S: {
      description: 'Step back through the cave mouth into Rocky Clearing.',
      minutes: 2,
      fatigue: 0,
      routeLabel: 'Cave mouth',
    },
  },
  boundaries: {},
  discoveries: [
    "A dark passage leads deeper into the rock, faintly lit by dripping candles.",
    "You notice scattered pamphlets and scribbled manifestos in Spanish and Catalan."
  ],
  notableFeatures: [
    "Volcanic walls glistening with condensation.",
    "Rudimentary living arrangements—a bedroll and hidden stash of supplies."
  ]
},

{
  id: 'GOVERNORS_HOUSE_OFFICE',
  name: 'GOVERNORS OFFICE',
  description: "Lawson conducts the island’s sparse official business here.",
  x: 900,  // Fake coords so these won't appear on the main island map
  y: 100,
  color: '#c2b280',
  type: 'office',
  validMoves: [], 
  npcs: ['nicolas_lawson'],
  specimens: [],
  boundaries: {},
  discoveries: [
    'A worn wooden desk covered with half-finished paperwork.'
  ],
  notableFeatures: [
    'Maps pinned to the wall, marked with red ink around penal colony boundaries.',
    'A faint smell of spilled ink and stale coffee.'
  ]
},
{
  id: 'GOVERNORS_HOUSE_PRIVATE',
  name: 'PRIVATE QUARTERS',
  description: "Lawson’s personal living space, surprisingly elegant with items from his travels.",
  x: 901,
  y: 100,
  color: '#c2b280',
  type: 'interior',
  validMoves: [], 
  npcs: ['nicolas_lawson'],
  specimens: [],
  boundaries: {},
  discoveries: [
    'A hidden drawer containing personal letters and trinkets from faraway places.'
  ],
  notableFeatures: [
    'A plush armchair and small bookshelf with a handful of novels.',
    'Curtains made from fine fabric, unusual in such a remote penal colony.'
  ]
},
{
  id: 'GOVERNORS_HOUSE_LIBRARY',
  name: 'SMALL LIBRARY',
  description: "Shelves lined with books on navigation, natural history, and colonial administration.",
  x: 902,
  y: 100,
  color: '#c2b280',
  type: 'governorslibrary',
  validMoves: [], 
  npcs: ['nicolas_lawson'],
  specimens: ['governorsletter'],
  boundaries: {},
  discoveries: [
    'Most titles concern hydrography, law, and the latest scientific debates from Europe. There is also a recent looking letter from the Governor.'
  ],
  notableFeatures: [
    'A large globe stands in the corner, well-worn from repeated use.',
    'A few volumes have pressed flowers tucked between their pages.'
  ]
},
{
  id: 'GOVERNORS_HOUSE_DINING',
  name: 'DINING ROOM',
  description: "A modest table set with mismatched china. A half-empty bottle of rum beside a maritime chart.",
  x: 903,
  y: 100,
  color: '#c2b280',
  type: 'governorshouse',
  validMoves: [], 
  npcs: ['nicolas_lawson'],
  specimens: [],
  boundaries: {},
  discoveries: [
    'A scrawled menu in Spanish and English suggests visits from passing sailors.'
  ],
  notableFeatures: [
    'Squeaky wooden chairs that have seen better days.',
    'Traces of a meal remain—fish bones and a stale crust of bread.'
  ]
},
{
  id: 'GOVERNORS_HOUSE_ENTRANCE',
  name: 'ENTRANCE HALL',
  description: "A modest foyer with colonial furnishings. Lawson often greets visitors here.",
  x: 904,
  y: 100,
  color: '#c2b280',
  type: 'interior',
  validMoves: [], 
  npcs: ['nicolas_lawson'],
  specimens: [],
  boundaries: {},
  discoveries: [
    'A small table holds calling cards and a dusty lamp.'
  ],
  notableFeatures: [
    'A coatrack stands near the door, with a single well-worn cloak hanging.',
    'The floor squeaks with each step, showing its age.'
  ]
},
{
  id: 'GOVERNORS_HOUSE_GARDEN',
  name: 'REAR GARDEN',
  description: "A small walled garden with exotic plants Lawson has collected from around the archipelago.",
  x: 905,
  y: 100,
  color: '#c2b280',
  type: 'interior',
  validMoves: [], 
  npcs: ['maria'],
  specimens: [],
  boundaries: {},
  discoveries: [
    'Mainland agriculural crops mostly, carefully tended, possibly an experimental project.'
  ],
  notableFeatures: [
    'Vines climbing the walls, bearing strange blossoms unfamiliar to Darwin.',
    'A faint trickle of water from a makeshift irrigation channel.'
  ]
},

// === Patrick Watkins’s Cabin (1x1 interior) ===
{
  id: 'WATKINS_INTERIOR',
  name: 'Watkins Cabin Interior',
  description: "A crude one-room shelter built from driftwood and volcanic stone. Dried gourds and animal hides litter the dirt floor.",
  x: 910,
  y: 100,
  color: '#2f2f2f',
  type: 'cabin',
  validMoves: [],
  npcs: [],
  specimens: [],
  boundaries: {},
  discoveries: [
    'A rough wooden crate lined with moldy rags, once Watkins’s makeshift bed.',
  ],
  notableFeatures: [
    'A pungent odor of fermentation and unwashed humanity still lingers.',
    'Dim light peeking through cracks between the driftwood planks.'
  ]
},

{ 
  id: 'MAIL_BARREL', 
  name: "Mail Barrel", 
  description: "A wooden barrel serving as a makeshift postal system for sailors passing through the islands. Mostly filled with sand and very dark inside.", 
  x: 950, 
  y: 100, 
  color: '#8B4513', 
  type: 'mailbarrel', 
  validMoves: [], 
  specimens: ["timesoflondon"],  // You could add a discoverable old letter here
  npcs: [], 
  boundaries: {}, 
  discoveries: [
    "Peering inside, you find a few tattered letters nestled in the sand, some dating back several years.",
    "The barrel is surprisingly deep, with most of its volume filled with gritty sand."
  ], 
  notableFeatures: [
    "A curious, faint smell of urine lingers in the stale air.",
    "The wood of the barrel is warped and weathered by sea salt and tropical sun.",
    "You find yourself reflecting mournfully on how you've come to find yourself in a barrel on a desert island."
  ] 
},

// === Whaler’s Hut (1x1 interior) ===
{
  id: 'WHALERS_HUT_INTERIOR',
  name: 'HUT INTERIOR',
  description: "A stone structure with a battered wooden roof. Broken barrel staves and scattered harpoon parts hint at its whaling history.",
  x: 920,
  y: 100,
  color: '#6b6b6b',
  type: 'interior',
  validMoves: [],
  npcs: [],
  specimens: [],
  boundaries: {},
  discoveries: [
    'Soot-blackened rocks form a rough firepit near the center.',
  ],
  notableFeatures: [
    'A bitter draft seeps through gaps, carrying the scent of old brine.',
    'Scratched tally marks on a plank—perhaps a crewman’s lonely record of days.'
  ]
},

{
  id: 'hms_beagle_interior',
  name: "HMS Beagle (Below Decks)",
  description: "Captain FitzRoy's survey vessel, cramped yet meticulously maintained.",
  x: 997,
  y: 999,
  color: '#8fbc8f',
  type: 'interior',
  validMoves: [],
  specimens: ["ship_logs"],
  npcs: ['fitzroy'],
  boundaries: {},
  discoveries: [
    "Barrels of ship's biscuits, crates of dried goods, and FitzRoy’s impeccable navigational charts."
  ],
  notableFeatures: [
    "The faint smell of brine and tar permeates the narrow corridors.",
    "A hammock strung up next to a microscope stand for your many specimens."
  ]
},

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
