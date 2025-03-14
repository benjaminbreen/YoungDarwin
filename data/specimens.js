// specimens.js - Updated with expanded specimen list and dynamic generation

// Base specimen list 
export const baseSpecimens = [
  {
    id: 'easternsantacruztortoise',
    name: 'Eastern Santa Cruz Tortoise',
    latin: 'Chelonoidis niger donfaustoi',
    ontology: 'Animal',
    order: 'Reptile',
    sub_order: 'Tortoise',
    description: 'A moderately sized giant tortoise with a domed shell, found in the eastern highlands of Santa Cruz Island.',
    details: [
      'Smaller and more rounded shell than western varieties',
      'Neck proportions suggest browsing on lower vegetation',
      'Often seen resting for long hours, conserving energy',
      'Broad, sturdy limbs for steady movement over rocky ground'
    ],
    habitat: 'scrubland, forest, CoastalTrail',
    collected: false,
    observations: [],
    scientificValue: 9,
    hybrid_ease: 7,
    hybrid_temperature: 5,
    danger: 2,  
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/eastern_santa_cruz_tortoise.jpg',
    memoryText: '“There can be little doubt this tortoise is native to these islands. Could their isolation alone shape such divergent forms?”',
    contents: 'Upon opening the creature, one would likely find fibrous green plant matter and a large, spacious body cavity.',
    keywords: ['tortoise', 'chelonian', 'giant', 'galápagos', 'reptile', 'chelonoidis', 'isolation']
  },

  {
    id: 'floreanagianttortoise',
    name: 'Floreana Giant Tortoise',
    latin: 'Chelonoidis niger niger',
    ontology: 'Animal',
    order: 'Reptile',
    sub_order: 'Tortoise',
    description: 'A saddlebacked tortoise, once abundant on Floreana, now increasingly scarce due to hunting by passing sailors.',
    details: [
      'High-arched shell for reaching taller foliage',
      'Longer limbs compared to domed tortoises',
      'Locals report steep declines from overharvesting',
      'Sometimes seen congregating near water sources'
    ],
    habitat: 'scrubland, coastalTrail',
    collected: false,
    observations: [],
    scientificValue: 9,
    hybrid_ease: 8,
    hybrid_temperature: 6,
    danger: 2,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/floreana_giant_tortoise.jpg',
    memoryText: '“I met two such massive tortoises amidst black lava and leafless shrubs. If their numbers keep dwindling, shall any remain?”',
    contents: 'Within its broad cavity, one might discover coarse stems of prickly vegetation and fibrous pulp from island flora.',
    keywords: ['tortoise', 'saddleback', 'giant', 'galápagos', 'extinction', 'reptile', 'chelonoidis', 'isolation']
  },

  {
    id: 'galapagosmockingbird',
    name: 'Galápagos Mockingbird',
    latin: 'Mimus parvulus',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Mockingbird',
    description: 'A bold, inquisitive bird often seen hopping near human visitors in search of scraps.',
    details: [
      'Mottled brown-gray plumage blends with volcanic soil',
      'Remarkably fearless, venturing close to observers',
      'Slightly curved bill suitable for probing under stones',
      'Diet includes insects, fruit, and any carrion it can find'
    ],
    habitat: 'scrubland, coastalTrail',
    collected: false,
    observations: [],
    scientificValue: 7,
    hybrid_ease: 7,
    hybrid_temperature: 6,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/galapagos_mockingbird.jpg',
    memoryText: '“They show no great inclination to flee, a tameness I have observed in many island creatures.”',
    contents: 'Dissection would likely reveal insects, bits of fruit, and occasionally small scraps of carrion within the gizzard.',
    keywords: ['mockingbird', 'bird', 'mimus', 'songbird', 'curved beak', 'foraging', 'island adaptation']
  },

  {
    id: 'floreanamockingbird',
    name: 'Floreana Mockingbird',
    latin: 'Mimus trifasciatus',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Mockingbird',
    description: 'A rare, quarrelsome mockingbird found only on Floreana, fiercely guarding its feeding grounds.',
    details: [
      'Darker feathers than mainland forms, with pale eye markings',
      'Observed harassing other birds over food sources',
      'Maintains strict territorial perches along scrubby trails',
      'Diet includes insects, nectar, and occasionally eggs'
    ],
    habitat: 'scrubland, coastalTrail',
    collected: false,
    observations: [],
    scientificValue: 7,
    hybrid_ease: 7,
    hybrid_temperature: 6,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/floreana_mockingbird.jpg',
    memoryText: '“Unlike their tamer cousins, these are bold and quarrelsome. Might competition here be forcing their more aggressive manner?”',
    contents: 'If opened, the stomach might contain beetles, seeds, and occasionally traces of eggshell or soft pulp.',
    keywords: ['mockingbird', 'bird', 'floreana', 'mimus', 'territorial', 'foraging', 'variation']
  },

  {
    id: 'largegroundfinch',
    name: 'Large Ground Finch',
    latin: 'Geospiza magnirostris',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Finch',
    description: 'A stout finch with a tremendously large beak, adept at cracking the toughest seeds.',
    details: [
      'Beak dwarfs that of smaller finches, appearing almost disproportionate',
      'Plumage a dull brown, blending well with arid ground',
      'Frequently seen pecking at robust seeds other birds cannot open',
      'Remarkably unconcerned by human presence, hopping near campsites'
    ],
    habitat: 'scrubland, forest',
    collected: false,
    observations: [],
    scientificValue: 7,
    hybrid_ease: 10,
    hybrid_temperature: 8,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/large_ground_finch.jpg',
    memoryText: '“I find the beak so exaggerated as to suggest a separate species entirely. Yet it is but another variety in this curious family.”',
    contents: 'Within the crop, one would discover large, thick-shelled seeds and a scattering of grit used for grinding.',
    keywords: ['large ground finch', 'bird', 'geospiza', 'beak', 'seed-eater', 'darwin', 'floreana']
  },

  {
    id: 'mediumgroundfinch',
    name: 'Medium Ground Finch',
    latin: 'Geospiza fortis',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Finch',
    description: 'A small, adaptable finch with a variable beak shape, feeding on seeds, fruit, and small insects.',
    details: [
      'Plumage dark brown with faint streaking',
      'Some individuals show stouter beaks, others more slender',
      'Often found in mixed flocks among cacti and scrub',
      'Hops busily on the ground, pecking at scattered seeds'
    ],
    habitat: 'scrubland, bay, forest',
    collected: false,
    observations: [],
    scientificValue: 7,
    hybrid_ease: 10,
    hybrid_temperature: 7,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/medium_ground_finch.jpg',
    memoryText: '“Within one species, a remarkable range of beak forms exists. This fact perplexes me greatly—what might such variation portend?”',
    contents: 'Upon examination, seeds of varying sizes, fruit pulp, and occasional insect remains would be found.',
    keywords: ['medium ground finch', 'bird', 'geospiza', 'beak', 'variation', 'darwin', 'floreana']
  },

  {
    id: 'marineiguana',
    name: 'Marine Iguana',
    latin: 'Amblyrhynchus cristatus',
    ontology: 'Animal',
    order: 'Reptile',
    sub_order: 'Marine Iguana',
    description: 'A dark, rugged-looking lizard that ventures into the sea to graze on marine algae.',
    details: [
      'Blackish scales help it warm quickly after swimming',
      'Often found clinging to coastal rocks, spitting out salt',
      'Slow, ungainly gait on land, yet graceful underwater',
      'Gives a low hiss when approached, flattening its body'
    ],
    habitat: 'shore, rocky shoreline',
    collected: false,
    observations: [],
    scientificValue: 6,
    hybrid_ease: 5,
    hybrid_temperature: 5,
    danger: 3,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/iguana.jpg',
    memoryText: '“A hideous creature, though fascinating: it swims with ease, living off the sea’s algae. One wonders how it first reached these shores.”',
    contents: 'The stomach would reveal wet clumps of seaweed, occasionally gritty sand, and swallowed fragments of algae-covered rock.',
    keywords: ['iguana', 'lizard', 'reptile', 'marine', 'black', 'swimming', 'amblyrhynchus']
  },

  {
    id: 'terrestrialiguana',
    name: 'Galápagos Land Iguana',
    latin: 'Amblyrhynchus demarlii',
    ontology: 'Animal',
    order: 'Reptile',
    sub_order: 'Land Iguana',
    description: 'A stout iguana with a round tail, dwelling in arid inland regions.',
    details: [
      'Scales of a dull reddish-brown with paler underbelly',
      'Digs shallow burrows, often among volcanic rubble',
      'Feeds primarily on fallen cactus pads and tough vegetation',
      'Slow movements, occasionally bobbing its head in warning'
    ],
    habitat: 'scrubland, lavafield',
    collected: false,
    observations: [],
    scientificValue: 6,
    hybrid_ease: 5,
    hybrid_temperature: 5,
    danger: 3,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/terrestrialiguana.jpg',
    memoryText: '“They inhabit burrows and crawl awkwardly when startled. Yet, if one stamps the ground, they scurry off with surprising haste.”',
    contents: 'Upon inspection, one might find fibrous cactus pads, small leaves, and coarse vegetable matter within its gut.',
    keywords: ['iguana', 'lizard', 'reptile', 'land iguana', 'amblyrhynchus', 'burrow']
  },

  {
    id: 'cactus',
    name: 'San Cristóbal Lava Cactus',
    latin: 'Brachycereus nesioticus',
    ontology: 'Plant',
    order: 'Cactus',
    sub_order: 'Lava Cactus',
    description: 'A pale cactus emerging from bare lava, bearing sharp spines and small, waxy flesh.',
    details: [
      'Grows in sparse clumps on solidified lava fields',
      'Spines glisten under intense sunlight',
      'Stores water in its pulpy interior',
      'Roots spread widely to capture scant rainfall'
    ],
    habitat: 'lavafield, coastallava',
    collected: false,
    observations: [],
    scientificValue: 3,
    hybrid_ease: 6,
    hybrid_temperature: 7,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/cactus.jpg',
    memoryText: '“How any plant manages to thrive on bare volcanic rock is beyond me. Yet these cacti appear healthy, if sparse.”',
    contents: 'If cut open, a watery pulp and stringy fibrous strands are found, with tiny droplets of stored moisture.',
    keywords: ['cactus', 'plant', 'succulent', 'spines', 'green', 'nesioticus']
  },

  {
    id: 'lavalizard',
    name: 'Lava Lizard',
    latin: 'Microlophus bivittatus',
    ontology: 'Animal',
    order: 'Reptile',
    sub_order: 'Lizard',
    description: 'A small, nimble reptile that darts across sun-scorched rocks, often displaying territorial push-ups.',
    details: [
      'Males show a ruddy throat patch in mating season',
      'Moves with quick bursts, pausing to bask on warm stones',
      'Coloration shifts slightly to blend with local rock hues',
      'Defends small patches of ground with bobbing gestures'
    ],
    habitat: 'lavafield, coastallava',
    collected: false,
    observations: [],
    scientificValue: 4,
    hybrid_ease: 5,
    hybrid_temperature: 5,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/lavalizard.jpg',
    memoryText: '“These lizards remind me of the wall lizards of Europe, though their behavior in this blistering heat is a marvel of adaptation.”',
    contents: 'Dissection would reveal small insects, bits of plant matter, and occasional grit swallowed for digestion.',
    keywords: ['lizard', 'lava', 'reptile', 'small', 'quick', 'darting', 'microlophus']
  },

  {
    id: 'crab',
    name: 'Sally Lightfoot Crab',
    latin: 'Grapsus grapsus',
    ontology: 'Animal',
    order: 'Crustacean',
    sub_order: 'True Crab',
    description: 'A brilliantly hued crab scuttling over intertidal rocks, surprisingly swift in its movements.',
    details: [
      'Shell often a vivid red, with patches of blue or yellow',
      'Seen clinging to wet rocks, sidling away at great speed',
      'Feeds on algae or scraps of carrion left by the tide',
      'Juveniles sport duller colors, blending with the stones'
    ],
    habitat: 'shore, bay, beach',
    collected: false,
    observations: [],
    scientificValue: 2,
    hybrid_ease: 3,
    hybrid_temperature: 3,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/sallylightfoot.jpg',
    memoryText: '“The sailors spoke of their agility, which I initially doubted. But indeed, they move in any direction with startling quickness.”',
    contents: 'Within its shell, bits of algae, tiny shell fragments, and occasional morsels of rotting fish may be discovered.',
    keywords: ['crab', 'red', 'crustacean', 'sally', 'lightfoot', 'grapsus', 'tide', 'rock']
  },

  {
    id: 'sealion',
    name: 'Galápagos Sea Lion',
    latin: 'Zalophus wollebaeki',
    ontology: 'Animal',
    order: 'Mammal',
    sub_order: 'Sea Lion',
    description: 'A sociable marine mammal, known for barking calls and playful interactions along sandy shores.',
    details: [
      'Males grow a noticeable crest on the head with age',
      'Forms colonies where dominant males guard harems',
      'Remarkably agile underwater, clumsy on land',
      'Often basks on warm sand in the midday sun'
    ],
    habitat: 'shore, beach',
    collected: false,
    observations: [],
    scientificValue: 4,
    hybrid_ease: 2,
    hybrid_temperature: 2,
    danger: 3,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/sealion.jpg',
    memoryText: '“These creatures show little fear, lazing near our camps. Their calls resemble barking dogs, echoing across the beach.”',
    contents: 'Stomach contents might include half-digested fish, occasional squid beaks, and gritty salt water.',
    keywords: ['sea lion', 'seal', 'mammal', 'zalophus']
  },

  {
    id: 'booby',
    name: 'Blue-footed Booby',
    latin: 'Sula nebouxii',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Seabird',
    description: 'A coastal bird famous for its bright blue feet and dramatic plunge-diving for fish.',
    details: [
      'Feet color intensifies in breeding season, displayed in courtship dances',
      'Nests in sparse scrapes on cliffs or flat ground',
      'Dives from heights, folding wings to pierce the water’s surface',
      'Waddles clumsily on land, yet soars adeptly at sea'
    ],
    habitat: 'coastalTrail, coastal cliffs',
    collected: false,
    observations: [],
    scientificValue: 3,
    hybrid_ease: 4,
    hybrid_temperature: 4,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/booby.jpg',
    memoryText: '“Their name stems from the Spanish ‘bobo,’ meaning foolish, though their diving feats are anything but foolish to behold.”',
    contents: 'A quick examination reveals partially digested fish, often silver-scaled, within the crop or gullet.',
    keywords: ['booby', 'bird', 'blue', 'feet', 'diving', 'sula', 'seabird']
  },

  {
    id: 'frigatebird',
    name: 'Magnificent Frigatebird',
    latin: 'Fregata magnificens',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Seabird',
    description: 'A large seabird with a forked tail and an inflatable red pouch on the male’s throat.',
    details: [
      'Long, pointed wings enabling effortless soaring',
      'Males puff out the red gular sac to attract mates',
      'Often seen harassing other seabirds for food',
      'Rests on rocky outcrops or stunted coastal trees'
    ],
    habitat: 'coastalTrail, cliff',
    collected: false,
    observations: [],
    scientificValue: 3,
    hybrid_ease: 4,
    hybrid_temperature: 4,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/frigatebird.jpg',
    memoryText: '“Dubbed ‘man-of-war birds’ by sailors, they swoop down to snatch fish or provoke others to disgorge their meals.”',
    contents: 'Inspection would uncover partly swallowed fish scraps, occasionally gleaned from other birds under duress.',
    keywords: ['frigatebird', 'bird', 'seabird', 'black', 'pouch', 'red', 'fregata', 'magnificent']
  },

  {
    id: 'coral',
    name: 'Coral Fragment',
    latin: 'Various species',
    ontology: 'Animal',
    order: 'Cnidarian',
    sub_order: 'Coral',
    description: 'A bleached piece of coral washed ashore, showing intricate chambers once inhabited by tiny polyps.',
    details: [
      'Hard, white structure with many small pores and ridges',
      'Found stranded on beaches after storms or high tides',
      'Appears brittle, easily fractured by hand',
      'Often tangled with seaweed or driftwood upon discovery'
    ],
    habitat: 'shore, beach, reef',
    collected: false,
    observations: [],
    scientificValue: 2,
    hybrid_ease: 2,
    hybrid_temperature: 2,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/coralfragment.jpg',
    memoryText: '“A relic of the reef—its once-living architecture is now a mere skeleton, polished by the waves.”',
    contents: 'Broken open, one finds only hollow calcified passages, long since emptied of life.',
    keywords: ['coral', 'calcium', 'marine', 'white', 'fragment', 'reef', 'polyp', 'skeleton']
  },

  {
  id: 'seaurchin',
  name: 'Black Sea Urchin',
  latin: 'Arbacia galapagensis',
  ontology: 'Animal',
  order: 'Echinoderm',
  sub_order: 'Sea Urchin',
  description: 'A dark, spiny sea creature found clinging to submerged rocks in tidal pools and along the shore.',
  details: [
    'Round body covered in long, needle-like black spines',
    'Spines sway gently in the current, appearing almost plant-like',
    'Clings to submerged rocks with hundreds of tiny tube feet',
    'When prodded, the spines move slightly, revealing a living creature beneath',
    'Can be difficult to pick up, as its spines shift to resist handling'
  ],
  habitat: 'shore, reef, bay, ocean',
  collected: false,
  observations: [],
  scientificValue: 3, // A common but intriguing marine invertebrate
  hybrid_ease: 1, // Highly unlikely to hybridize
  hybrid_temperature: 1,
  danger: 5, // Painful spines can puncture the skin
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/seaurchin.jpg',
  memoryText: '“The black spines of these creatures shift slightly when touched, as if resisting capture. Scattered along the rocky pools, they seem almost vegetable-like, until disturbed.”',
  contents: 'If split open, the interior reveals five symmetrical orange lobes of soft, edible flesh, surrounded by a delicate web of calcareous plates.',
  keywords: ['sea urchin', 'echinoderm', 'spines', 'tidal', 'arbacia', 'marine']
},


  {
    id: 'basalt',
    name: 'Basalt Formation',
    latin: 'Lava basaltica',
    ontology: 'Mineral',
    order: 'Igneous',
    sub_order: 'Volcanic',
    description: 'A piece of dark volcanic rock with telltale bubbles and cooling fractures.',
    details: [
      'Surface sometimes pitted with small cavities where gases escaped',
      'Edges can be sharp and jagged underfoot',
      'A dull, dark coloration that glistens when wet',
      'Occasionally streaked with red scoria or ash deposits'
    ],
    habitat: 'lavafield, bay',
    collected: false,
    observations: [],
    scientificValue: 6,
    hybrid_ease: 3,
    hybrid_temperature: 2,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/volcanorock.jpg',
    memoryText: '“Black truncated cones abound, their slopes composed of such basaltic rubble. The heat underfoot can be punishing.”',
    contents: 'Split open, the stone reveals small air pockets and a dense interior of dark minerals.',
    keywords: ['basalt', 'rock', 'lava', 'formation', 'volcanic', 'black', 'vesicular', 'jagged']
  },

  {
    id: 'barnacle',
    name: 'Volcanic Shore Barnacle',
    latin: 'Megabalanus sp.',
    ontology: 'Animal',
    order: 'Crustacean',
    sub_order: 'Barnacle',
    description: 'A conical crustacean that cements itself to rocks in the intertidal zone.',
    details: [
      'Shell plates often thicker than typical barnacles, likely due to rough waves',
      'Clustered in dense patches, each individual with a sharp, volcano-like peak',
      'Feathery appendages visible at high tide, filtering water for plankton',
      'Color ranges from chalky white to faint pinkish hues'
    ],
    habitat: 'shore, bay, beach',
    collected: false,
    observations: [],
    scientificValue: 2,
    hybrid_ease: 3,
    hybrid_temperature: 3,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/barnacle.jpg',
    memoryText: '“Their presence is so abundant on these rocks that one must tread carefully to avoid slicing a foot on their conical shells.”',
    contents: 'Inside the shell is a small crustacean body with feathery cirri, used for catching food in the tide.',
    keywords: ['barnacle', 'crustacean', 'conical', 'sessile', 'megabalanus', 'shell', 'rocks', 'intertidal']
  },

  {
    id: 'mangrove',
    name: 'Island Mangrove Seedling',
    latin: 'Rhizophora sp.',
    ontology: 'Plant',
    order: 'Mangrove',
    sub_order: 'Rhizophora',
    description: 'A young mangrove with arching prop roots, sprouting in brackish waters along the coast.',
    details: [
      'Long, pencil-like seed pods that embed in wet soil',
      'Roots raise the trunk above tidal surges',
      'Leaves appear thick and waxy, resisting salt spray',
      'Often found in clusters, forming dense thickets'
    ],
    habitat: 'wetland',
    collected: false,
    observations: [],
    scientificValue: 3,
    hybrid_ease: 4,
    hybrid_temperature: 4,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/mangrove.jpg',
    memoryText: '“Their roots stand like stilts, enabling the seedling to endure the ceaseless ebb and flow of the tide.”',
    contents: 'Cutting into the trunk reveals pale, fibrous wood and pockets of brackish water stored within its tissues.',
    keywords: ['mangrove', 'plant', 'root', 'prop', 'aerial', 'rhizophora', 'seedling', 'coastal']
  },

  // =========================
  // newly added species - check and update as needed
  // =========================

  {
    id: 'greenturtle',
    name: 'Green Sea Turtle',
    latin: 'Chelonia mydas',
    ontology: 'Animal',
    order: 'Reptile',
    sub_order: 'Sea Turtle',
    description: 'A serene marine turtle with a smooth, rounded carapace, often sighted grazing near coastal shallows.',
    details: [
      'Shell a dark olive shade, occasionally with faint mottling',
      'Limbs flattened into flippers for calm, graceful swimming',
      'Surfaces periodically to breathe, resting near calm coves',
      'Females rumored to come ashore at night to lay eggs'
    ],
    habitat: 'beach, ocean',
    collected: false,
    observations: [],
    scientificValue: 4,
    hybrid_ease: 2,
    hybrid_temperature: 2,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/greenturtle.jpg',
    memoryText: '“These gentle turtles drift with the currents, cropping at seaweed in the shallows. They appear untroubled by my approach.”',
    contents: 'Opening one would reveal partially digested seaweeds and a watery fluid in the gut, faintly briny in odor.',
    keywords: ['turtle', 'marine', 'cheloniid', 'green turtle', 'reptile']
  },

  {
    id: 'parrotfish',
    name: 'Parrotfish',
    latin: 'Scarus sp.',
    ontology: 'Animal',
    order: 'Fish',
    sub_order: 'Marine Fish',
    description: 'A vividly colored fish with a stout, beak-like jaw, seen scraping algae off submerged rocks.',
    details: [
      'Scales shimmer in shades of turquoise, green, or pink',
      'Found in small groups grazing near rocky reefs',
      'Makes audible scraping sounds while nibbling algae',
      'Occasionally seen spitting fragments of rock or shell'
    ],
    habitat: 'ocean, reef,',
    collected: false,
    observations: [],
    scientificValue: 5,
    hybrid_ease: 1,
    hybrid_temperature: 1,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/parrotfish.jpg',
    memoryText: '“Its jaws appear fused into a single, parrot-like structure, which it uses to scrape growth from the rocks. The colors are almost unreal.”',
    contents: 'Inside the belly, one would find clumps of green algae and small bits of rocky debris worn from the reef.',
    keywords: ['parrotfish', 'fish', 'reef', 'scarus', 'marine']
  },

  {
    id: 'hammerhead',
    name: 'Scalloped Hammerhead Shark',
    latin: 'Sphyrna lewini',
    ontology: 'Animal',
    order: 'Fish',
    sub_order: 'Shark',
    description: 'A large shark noted for its flattened, hammer-shaped head and cautious circling near reefs.',
    details: [
      'Head broadened into lateral lobes with eyes set wide apart',
      'Grayish upper body fading to white below',
      'Swims in slow arcs near drop-offs, sometimes in small groups',
      'Occasionally glimpsed at dawn or dusk, though sightings vary'
    ],
    habitat: 'ocean, reef',
    collected: false,
    observations: [],
    scientificValue: 5,
    hybrid_ease: 1,
    hybrid_temperature: 1,
    danger: 10,
    timeofday: 'Diurnal', // though often more active in twilight, we keep it simple
    quote: '',
    image: '/specimens/hammerhead.jpg',
    memoryText: '“Sailors speak in hushed tones of these strange-headed sharks. They circle curiously, yet seldom attack unless cornered.”',
    contents: 'A dissected specimen would show partial remains of fish, with a powerful stomach thickly lined for digestion.',
    keywords: ['hammerhead', 'shark', 'fish', 'marine', 'predator', 'sphyrna']
  },

  {
    id: 'mantaRay',
    name: 'Giant Manta Ray',
    latin: 'Mobula birostris',
    ontology: 'Animal',
    order: 'Fish',
    sub_order: 'Ray',
    description: 'An immense, winged fish that seems to glide like a bird beneath the waves, often spotted in deeper waters.',
    details: [
      'Broad, diamond-shaped body with sweeping pectoral fins',
      'Blackish upper surface, pale underside',
      'Seen gracefully “flying” through open ocean near the surface',
      'Occasionally leaps clear of the water, creating a splash'
    ],
    habitat: 'ocean, reef',
    collected: false,
    observations: [],
    scientificValue: 5,
    hybrid_ease: 1,
    hybrid_temperature: 1,
    danger: 2,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/mantaray.jpg',
    memoryText: '“One might think it a great shadow drifting below. It moves so gently that it appears to fly rather than swim.”',
    contents: 'Within the stomach lies a watery mixture of small drifting morsels, including tiny fish or shrimplike fragments.',
    keywords: ['manta', 'ray', 'marine', 'mobula']
  },

  {
    id: 'flamingo',
    name: 'American Flamingo',
    latin: 'Phoenicopterus ruber',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Wading Bird',
    description: 'A tall, pinkish wading bird often found in shallow lagoons or brackish pools.',
    details: [
      'Long, slender legs supporting a stately posture',
      'Curved bill held upside-down when feeding',
      'Observed sifting through murky water with slow, deliberate motions',
      'Feathers varying from pale salmon to deeper rose hues'
    ],
    habitat: 'wetland',
    collected: false,
    observations: [],
    scientificValue: 4,
    hybrid_ease: 2,
    hybrid_temperature: 3,
    danger: 1,
    timeofday: 'Crepuscular',
    quote: '',
    image: '/specimens/flamingo.jpg',
    memoryText: '“A most elegant sight: they congregate in flocks, stepping with curious grace in the shallows. Their hue is unlike any local bird I have seen.”',
    contents: 'Inside, one might find fine mud and tiny aquatic insects or seeds gleaned from the sediment.',
    keywords: ['flamingo', 'bird', 'phoenicopterus', 'wetland', 'pink', 'wading']
  },

  {
    id: 'olivine',
    name: 'Olivine',
    latin: 'Chrysolite',
    ontology: 'Mineral',
    order: 'Igneous',
    sub_order: 'Volcanic',
    description: 'A greenish mineral occasionally found in basaltic lava, its crystals glinting in the sunlight.',
    details: [
      'Small, glassy crystals often flecked in the dark lava matrix',
      'Color ranges from pale yellow-green to deeper olive',
      'Loose fragments sometimes spotted in eroded gullies',
      'May appear translucent when held to strong light'
    ],
    habitat: 'lavafield, coastalTrail',
    collected: false,
    observations: [],
    scientificValue: 7,
    hybrid_ease: 2,
    hybrid_temperature: 2,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/olivine_chrysolite.jpg',
    memoryText: '“Among the dark volcanic rubble, these green crystals catch the eye, shining like scattered jewels upon the ground.”',
    contents: 'When broken apart, the stone reveals tiny angular crystals with a glossy greenish hue.',
    keywords: ['olivine', 'chrysolite', 'mineral', 'volcanic', 'green']
  },

  {
    id: 'plicopurpura',
    name: 'Plicopurpura shell',
    latin: 'Plicopurpura patula',
    ontology: 'Animal',
    order: 'Gastropod',
    sub_order: 'Sea Snail',
    description: 'The empty shell of a snail found in intertidal zones. A common and uninteresting specimen.',
    details: [
      'Shell ridged, appearing robust to withstand wave impacts',
      'Clings to rocks just above the waterline, secreting a faint odor',
      'Sailors note a purple stain left on fingers if handled carelessly',
    ],
    habitat: 'beach, tidal pools, bay',
    collected: false,
    observations: [],
    scientificValue: 4,
    hybrid_ease: 4,
    hybrid_temperature: 3,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/plicopurpura_patula.jpg',
    memoryText: '“In examining these snails, one finds a peculiar purple fluid marking one’s fingers—a curiosity indeed.”',
    contents: 'Upon opening, a soft-bodied mollusk is revealed, and faint traces of purple fluid within the mantle cavity.',
    keywords: ['sea snail', 'gastropod', 'purpura', 'shell', 'tidal', 'intertidal']
  },

  {
    id: 'neorapana',
    name: 'Neorapana shell',
    latin: 'Neorapana grandis',
    ontology: 'Animal',
    order: 'Gastropod',
    sub_order: 'Sea Snail',
    description: 'Large shell that once protected a marine snail. A familiar and not particularly interesting specimen.',
    details: [
      'Mottled coloration blends in with wet stones'
    ],
    habitat: 'beach, tidal pools',
    collected: false,
    observations: [],
    scientificValue: 5,
    hybrid_ease: 4,
    hybrid_temperature: 3,
    danger: 2, 
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/neorapana_grandis.jpg',
    memoryText: '“Its shell is formidable, thick and encrusted, suggesting a life spent among harsh waves and opportunistic predators.”',
    contents: 'Inside, one would find sand. This is an empty shell.',
    keywords: ['neorapana', 'grandis', 'gastropod', 'shell', 'marine']
  },

  {
  id: 'galapagospenguin',
  name: 'Galápagos Penguin',
  latin: 'Spheniscus mendiculus',
  ontology: 'Animal',
  order: 'Bird',
  sub_order: 'Penguin',
  description: 'The northernmost penguin species, thriving in cool currents along the rocky shores despite the tropical latitude.',
  details: [
    'Small stature compared to Antarctic relatives',
    'Black and white plumage with a distinctive band across the chest',
    'Nests in crevices of lava rocks near the waterline',
    'Remarkably agile underwater, chasing fish in swift bursts'
  ],
  habitat: 'cliff',
  collected: false,
  observations: [],
  scientificValue: 7,
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 2,
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/galapagospenguin.jpg',
  memoryText: '“I confess surprise in seeing these creatures, so reminiscent of the southern latitudes, happily bobbing along the equator.”',
  contents: 'If opened, the stomach would reveal small fish, bits of crustaceans, and gritty salt residue.',
  keywords: ['penguin', 'bird', 'galapagos', 'spheniscus', 'marine', 'equator'],
  emoji: '🐧'
},
{
  id: 'shortearedowl',
  name: 'Galápagos Short-eared Owl',
  latin: 'Asio flammeus galapagoensis',
  ontology: 'Animal',
  order: 'Bird',
  sub_order: 'Owl',
  description: 'A stealthy hunter that has adapted to open arid landscapes, ambushing small birds, reptiles, or rodents.',
  details: [
    'Mottled brown and buff feathers for camouflage',
    'Short ear-tufts often lie flat, barely visible',
    'Flight can be silent, skimming near the ground',
    'Remarkably variable diet, even scavenging on carcasses'
  ],
  habitat: 'camp',
  collected: false,
  observations: [],
  scientificValue: 6,
  hybrid_ease: 2,
  hybrid_temperature: 2,
  danger: 3,
  timeofday: 'Nocturnal',
  quote: '',
  image: '/specimens/shortearedowl.jpg',
  memoryText: '“Upon a silent wing it glided, all but invisible in the dusk, seizing a finch so quickly I scarcely had time to blink.”',
  contents: 'Should it be dissected, pellets of fur, feathers, and small bone fragments lie within.',
  keywords: ['owl', 'bird', 'asio', 'nocturnal', 'raptor'],
  emoji: '🦉'
},
{
  id: 'galapagosracer',
  name: 'Galápagos Racer Snake',
  latin: 'Pseudalsophis biserialis',
  ontology: 'Animal',
  order: 'Reptile',
  sub_order: 'Snake',
  description: 'A slender, mildly venomous snake known for its speed when hunting lava lizards and small rodents.',
  details: [
    'Brownish or gray mottled scales, blending with volcanic rocks',
    'Uncertain temperament—some appear shy, others more boldly investigative',
    'Primarily diurnal, basking on lava outcrops before foraging',
    'Delivers quick, targeted strikes at prey'
  ],
  habitat: 'highland',
  collected: false,
  observations: [],
  scientificValue: 6,
  hybrid_ease: 2,
  hybrid_temperature: 3,
  danger: 4,
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/galapagosracer.jpg',
  memoryText: '“Its darting movement across the black lava was a fleeting specter—difficult to catch sight of, yet undeniably present.”',
  contents: 'Lizard scales, rodent fur, or occasional small bird remains may be discovered in its digestive tract.',
  keywords: ['galapagos racer', 'snake', 'reptile', 'pseudalsophis', 'lava', 'fast'],
  emoji: '🐍'
},


  // Additional "Outside the Box" Specimens

// 1) Socialist Treatise
{
  id: 'socialisttreatise',
  name: 'Socialist Treatise',
  latin: 'Homage á Saint-Simon',
  ontology: 'Document',
  order: 'Political',
  sub_order: 'Saint-Simonian',
  description: 'A tattered manuscript penned by Gabriel Puig, advocating radical change and workers’ unity.',
  details: [
    'Heavily influenced by the ideas of Henri de Saint-Simon',
    'Critiques harsh labor conditions in Ecuador and beyond',
    'Calls for a pan-Bolivarian revolution among Spanish-speaking colonies',
    'Handwritten on cheap paper, with many crossed-out lines'
  ],
  habitat: 'cave',  // Found among Puig’s possessions in the penal colony
  collected: false,
  observations: [],
  scientificValue: 1, // Not a natural specimen, but historically revealing
  hybrid_ease: 1,  // Not really subject to biological hybridization
  hybrid_temperature: 1,
  danger: 10, // Dangerous ideas from the viewpoint of colonial authorities
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/socialisttreatise.jpg',
  memoryText: '“Puig’s pages burn with indignation against oppression, his pen conjuring visions of a united Spanish America, free from tyranny.”',
  contents: 'The manuscript is filled with vehement calls for worker solidarity and annotated references to Saint-Simonian ideals.',
  keywords: ['document', 'puig', 'revolution', 'saint-simon', 'bolivarian', 'ecuador']
},

{
  id: 'whalersletter',
  name: 'Whaler\'s Letter',
  latin: 'Epistola marinarii',
  ontology: 'Document',
  order: 'Correspondence',
  sub_order: 'Personal Letter',
  description: 'A sealed letter addressed to a young woman in Nantucket, penned by a whaling captain who doubts he will return home.',
  details: [

    'Several passages suggest the writer fears his own mortality',
    'It’s rather sad...',

  ],
  habitat: 'hut',
  collected: false,
  observations: [],
  scientificValue: 2,
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 1,
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/whalersletter.jpg',
  memoryText: '"These letters—each a fragile tether between men at sea and those who wait for them. How many went unanswered, I wonder?"',
  contents: 'Inside are three pages of heartfelt prose to a woman named Sarah, describing Pacific islands, whale hunts, and profound loneliness.',
  keywords: ['letter', 'correspondence', 'whaler', 'mail', 'document', 'nantucket', 'personal']
},

// 2) Memoirs of a Utopian
{
  id: 'memoirsofautopian',
  name: 'Memoirs of a Utopian',
  latin: 'It seems to be some sort of radical literature',
  ontology: 'Document',
  order: 'Political',
  sub_order: 'Autobiography',
  description: 'Gabriel Puig’s personal writings, detailing his life from Barcelona to Boston to the Galápagos penal colony.',
  details: [
    'Recounts a youth spent in Barcelona under a liberal-minded father',
    'Describes Paris during the July Revolution, brimming with new ideas',
    'Chronicles an exile in Boston, inspired by Robert Owen’s communes',
    'Speaks bitterly of British “imperial arrogance,” culminating in captivity'
  ],
  habitat: 'clearing',
  collected: false,
  observations: [],
  scientificValue: 8, // Historical insight into exiled radicals
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 9, // Potentially seditious content
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/memoirsofautopian.jpg',
  memoryText: '“Puig’s life story unfolds like a tapestry of revolutionary fervor and bitter disappointment, culminating in banishment to these lonely shores.”',
  contents: 'Its pages are filled with recollections of travels, personal regrets, and polemics against oppressive regimes.',
  keywords: ['memoir', 'puig', 'utopia', 'revolution', 'exile', 'autobiography']
},

// 3) Governor’s Letter
{
  id: 'governorsletter',
  name: 'Governor’s Letter',
  latin: 'Epistola Vilamil',
  ontology: 'Document',
  order: 'Political',
  sub_order: 'Official Letter',
  description: 'A terse missive from Governor Vilamil to Vice-Governor Nicholas Lawson, criticizing his failures.',
  details: [
    'Handwritten in hurried script on thick parchment',
    'Accuses Lawson of mismanagement and negligence',
    'Mentions rumored abuses in the penal colony on Charles Island',
    'Signed with Vilamil’s official seal, pressed in red wax'
  ],
  habitat: 'office',
  collected: false,
  observations: [],
  scientificValue: 1,
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 8, // Political tensions can be perilous
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/governorsletter.jpg',
  memoryText: '“The letter bristles with resentment—Governor Vilamil spares no words in censuring Lawson’s lapses and moral shortcomings.”',
  contents: 'Its brief paragraphs contain pointed accusations and dire warnings about the colony’s deteriorating order.',
  keywords: ['letter', 'vilamil', 'governance', 'lawson', 'politics', 'galapagos']
},

// 4) Syms Covington’s Rum Flask
{
  id: 'rumflask',
  name: 'Mysterious flask',
  latin: 'It is marked with the initials S.C.',
  ontology: 'Object',
  order: 'Personal Item',
  sub_order: 'Flask',
  description: 'A battered metal flask apparently belonging to Syms Covington, Darwin’s assistant aboard the HMS Beagle.',
  details: [
    'Engraved initials “S.C.” on the underside',
    'The metal shows dents and scratches from rough seafaring',
    'Faint aroma of spiced rum still lingers inside',
  ],
  habitat: 'promontory',  // On board the HMS Beagle
  collected: false,
  observations: [],
  scientificValue: 1, // A curiosity, more than a scientific artifact
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 2, // Rum can be trouble in the wrong hands
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/rumflask.jpg',
  memoryText: '“Gods alive Syms... what will I do with you?”',
  contents: 'Inside is an extermely potent South American style rum, enough to make Darwin quite drunk.',
  keywords: ['rum', 'flask', 'beagle']
},

// 5) The Pet Monkey (HMS Beagle)
{
  id: 'jackothemonkey',
  name: 'Jacko the Monkey',
  latin: 'Cebus marinus (colloquial)',
  ontology: 'Animal',
  order: 'Mammal',
  sub_order: 'Primate',
  description: 'A mischievous capuchin-like monkey kept aboard the HMS Beagle as an unofficial mascot.',
  details: [
    'Brownish fur with a lighter underside, small dexterous hands',
    'Frequently found perched on the rigging or rummaging in sailors’ lockers',
    'Chitters loudly when excited, especially near food',
    'Shows uncanny curiosity about Darwin’s instruments'
  ],
  habitat: 'beagle',
  collected: false,
  observations: [],
  scientificValue: 2,
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 9, // Bites if cornered or frightened
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/petmonkey.jpg',
  memoryText: '“The crew has grown fond of Jacko’s antics, though his pranks can rouse even the mildest sailor to fury.”',
  contents: 'Were one to open the poor beast, one might find half-chewed fruit, bits of biscuit, and the occasional shiny trinket swallowed in mischief.',
  keywords: ['monkey', 'beagle', 'capuchin', 'pet', 'mascot']
},

// 6) Feral Goats
{
  id: 'feralgoat',
  name: 'Feral Goat',
  latin: 'Capra hircus feralis',
  ontology: 'Animal',
  order: 'Mammal',
  sub_order: 'Ungulate',
  description: 'A small herd of goats, once domesticated, now roaming wild in the highlands.',
  details: [
    'Scruffy coats ranging from black to speckled grey',
    'Skittish and quick to flee, though occasionally bold if cornered',
    'Feeds on scarce vegetation in upland areas, damaging fragile ecosystems',
    'Telltale bleating echoes among rocky slopes'
  ],
  habitat: 'forest',
  collected: false,
  observations: [],
  scientificValue: 3, // Impact on local flora and fauna
  hybrid_ease: 2,
  hybrid_temperature: 3,
  danger: 2, // Horned charges possible if threatened
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/feralgoat.jpg',
  memoryText: '“These goats were introduced by sailors and have multiplied, gnawing at the vegetation and evading all attempts at capture.”',
  contents: 'A rummage in the stomach would reveal half-chewed grasses, leaves, and possibly cacti spines swallowed in haste.',
  keywords: ['goat', 'mammal', 'feral', 'invasive', 'capra', 'highlands']
},


{
  id: 'scrimshawwhaletooth',
  name: 'Scrimshaw Whale Tooth',
  latin: 'Dentis Physeteris Incisus',
  ontology: 'Object',
  order: 'Maritime Artifact',
  sub_order: 'Scrimshaw',
  description: 'A polished sperm whale tooth etched with nautical scenes, likely done by a bored sailor aboard a whaling vessel.',
  details: [
    'Fine engravings depict ships and harpoons',
    'Yellowish ivory color with subtle cracks from age',
    'Edges smoothed by handling, perhaps a cherished keepsake',
    'Hints of brine and stale tobacco odor cling to the porous surface'
  ],
  habitat: 'hut',
  collected: false,
  observations: [],
  scientificValue: 2, // Interesting cultural artifact, not biologically crucial
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 1, // Generally harmless object
  timeofday: 'Any',
  quote: '',
  image: '/specimens/scrimshaw_whale_tooth.jpg',
  memoryText: '“Sailors often whittled their stories into bone, so each carved line holds a small piece of their watery world.”',
  contents: 'If fractured, layers of dense ivory reveal an inner grain once part of a mighty whale’s jaw.',
  keywords: ['scrimshaw', 'whale tooth', 'ivory', 'artifact', 'maritime']
},

{
  id: 'watkinswill',
  name: 'Last Will and Testament of Patrick Watkins',
  latin: 'Testamentum Patricii Watkins',
  ontology: 'Document',
  order: 'Legal Document',
  sub_order: 'Handwritten Will',
  description: 'A rum-stained parchment containing the frenzied final directives of Patrick Watkins, the half-mad Irish castaway said to be Floreana’s earliest settler.',
  details: [
    'Barely legible scrawl, blotched with suspicious dark stains',
    'Mentions a shack, a patch of tobacco, and rumored “hidden gold” inland',
    'Riddled with profanities and curses upon any who thwart his desires',
    'Believed to have been scrawled in a final rum-induced delirium'
  ],
  habitat: 'camp',
  collected: false,
  observations: [],
  scientificValue: 2, // Historical curiosity, but not scientific
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 4, // Potentially inflammatory or legally risky content
  timeofday: 'Any',
  quote: '',
  image: '/specimens/watkinswill.jpg',
  memoryText: '“They say Watkins ranted at the surf, cursing sailors and governors alike. His legacy rests in these torn, raging lines.”',
  contents: 'Broken sentences bequeath a ramshackle hut, empty rum bottles, and dire threats against would-be claimants.',
  keywords: ['will', 'document', 'patrick watkins', 'castaway', 'history']
},

{
  id: 'meteoriron',
  name: 'Meteoric Iron Fragment',
  latin: 'Ferrum Meteoriticum',
  ontology: 'Object',
  order: 'Cosmic Debris',
  sub_order: 'Meteorite',
  description: 'A dark, metallic rock fragment pitted by its fiery descent, bearing cosmic origins beyond this archipelago.',
  details: [
    'Considerably heavier than typical island stones',
    'Surface has a burned, fusion-crust look with faint regmaglypt “thumbprints”',
    'Slightly magnetic if tested with a metal instrument',
    'Local sailors whisper it grants luck if kept aboard, but ill fate if left behind'
  ],
  habitat: 'promontory',
  collected: false,
  observations: [],
  scientificValue: 9, // Rare cosmic sample
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 1, // No inherent harm, but prized
  timeofday: 'Any',
  quote: '',
  image: '/specimens/meteor_iron_fragment.jpg',
  memoryText: '“To hold stardust in one’s hand—an echo of the heavens, grounded here among black volcanic rubble.”',
  contents: 'Iron-nickel alloy core with tiny sulfide flecks, reminiscent of celestial forging.',
  keywords: ['meteorite', 'iron', 'nickel', 'cosmic', 'space']
},

{
  id: 'solidifiedsulphur',
  name: 'Solidified Sulphur',
  latin: 'Sulphuris Depositum',
  ontology: 'Object',
  order: 'Volcanic Curio',
  sub_order: 'Mineral Formation',
  description: 'A strange sulphur outgrowth shaped by volcanic gasses, bright yellow with a brittle, crystal-like texture.',
  details: [
    'Strong odor of rotten eggs when warmed by direct sun',
    'Incredibly fragile, leaving powdery residue on the skin',
    'Formed by sulphurous vapors condensing near fissures',
    'Stains fingers a pale lemon hue on prolonged contact'
  ],
  habitat: 'lavafield, coastallava',
  collected: false,
  observations: [],
  scientificValue: 7, // Ties to volcanic activity
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 2, // Sulphur dust can irritate eyes or lungs
  timeofday: 'Any',
  quote: '',
  image: '/specimens/solidified_sulphur.jpg',
  memoryText: '“Nature conjures these brilliant mounds from toxic fumes—the artistry and peril of volcanic life.”',
  contents: 'Layered sulfur crystals, highly prone to fracturing, with small pockets of trapped volcanic gas.',
  keywords: ['sulphur', 'volcanic', 'mineral', 'yellow', 'deposit']
},

{
  id: 'scurvyremedy',
  name: 'Scurvy Remedy',
  latin: 'Medicamentum Anti-Scorbuticum',
  ontology: 'Object',
  order: 'Medicine Bottle',
  sub_order: 'Folk Cure',
  description: 'A small glass vial that appears to be labeled “Fennec’s Tonic for Scurvy,” though the ink is faded and the contents viscous.',
  details: [
    'It looks... good?',
    'Maybe I should drink it.',
    'Do I have scurvy?'
  ],
  habitat: 'shipwreck',
  collected: false,
  observations: [],
  scientificValue: 2, // A quack remedy, interesting cultural item
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 10, // highly toxic, immediately kills darwin
  timeofday: 'Any',
  quote: '',
  image: '/specimens/fennec_scurvy_remedy.jpg',
  memoryText: '“A questionable elixir promising swift cures. Perhaps it offered hope to scurvy-ridden souls, if not real relief.”',
  contents: 'Sticky residue, likely a mix of citrus peel extract, odd herbs, and exceptionally poisonous binders. Kills Darwin if drunk.',
  keywords: ['poison', 'bottle', 'scurvy', 'folk remedy', 'quackery']
},

// 8) Murdered Captain’s Skull (Outside the Box #2)
{
  id: 'captainsskull',
  name: 'Murdered Captain’s Skull',
  latin: 'Calvaria Capitanei Interfecti',
  ontology: 'Object',
  order: 'Personal Item',
  sub_order: 'Skull',
  description: 'A sun-bleached human skull found among the bushes near a secluded salt-lake.',
  details: [
    'Yellowed bone, with a jagged fracture near the temple',
    'There is a half-rotten golden epaullette with threads of blue cloth attached to it. The uniform of a naval sea captain...',
    'Partially hidden amid a pile of driftwood and sand',
  ],
  habitat: 'shipwreck',
  collected: false,
  observations: [],
  scientificValue: 2, // Morbid historical curiosity
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 4, // Symbolic of a violent past
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/skull.jpg',
  memoryText: '“A chilling relic of man’s darker impulses. I stumbled upon it among the bushes, the empty eye sockets staring blankly.”',
  contents: 'Within the cranial cavity, only dust and brittle remnants remain, testifying to a brutal end years ago.',
  keywords: ['skull', 'murder', 'remains', 'captain', 'history']
}

];


// Function to generate a random location on the island
const generateRandomLocation = () => {
  // Ensure locations are within the visible island on the map
  // These values represent percentages of map width/height
  const minX = 15; // Left boundary of island
  const maxX = 85; // Right boundary of island
  const minY = 15; // Top boundary of island
  const maxY = 85; // Bottom boundary of island

  return {
    x: Math.floor(Math.random() * (maxX - minX) + minX),
    y: Math.floor(Math.random() * (maxY - minY) + minY)
  };
};

// Initialize specimens with random locations when the game starts
export const initializeSpecimens = () => {
  return baseSpecimens.map(specimen => ({
    ...specimen,
    location: generateRandomLocation(),
    collected: false,
    observations: []
  }));
};

//  function to analyze narrative text for collectible specimens
export const analyzeNarrativeForSpecimens = (narrativeText) => {
  if (!narrativeText) return [];
  
  const narrative = narrativeText.toLowerCase();
  
  // 1. Check for direct collectability markers from LLM
  const collectabilityMarkers = narrative.match(/\[COLLECTIBLE:(.*?)\]/g);
  if (collectabilityMarkers) {
    return collectabilityMarkers.map(marker => 
      marker.replace('[COLLECTIBLE:', '').replace(']', '').trim()
    );
  }
  
  // 2. As a fallback, check for bold-formatted specimens in the text
  const boldItems = narrativeText.match(/\*\*(.*?)\*\*/g) || [];
  const specimenIds = [];
  
  for (const boldItem of boldItems) {
    const cleanItem = boldItem.replace(/\*\*/g, '').toLowerCase();
    
    // Find corresponding specimen ID
    const matchedSpecimen = baseSpecimens.find(specimen => 
      cleanItem.includes(specimen.id.toLowerCase()) || 
      specimen.keywords.some(keyword => cleanItem.includes(keyword.toLowerCase()))
    );
    
    if (matchedSpecimen && !specimenIds.includes(matchedSpecimen.id)) {
      specimenIds.push(matchedSpecimen.id);
    }
  }
  
  return specimenIds;
};


// Integration with GameContainer component - add this to your parse function
export const parseLLMResponseForCollectibility = (response) => {
  const collectibles = [];
  
  // Extract collectibility markers if present
  const collectibleMatches = response.match(/\[COLLECTIBLE:(.*?)\]/g);
  if (collectibleMatches) {
    collectibleMatches.forEach(match => {
      const specimenId = match.replace('[COLLECTIBLE:', '').replace(']', '').trim();
      if (specimenId && !collectibles.includes(specimenId)) {
        collectibles.push(specimenId);
      }
    });
  }
  
  return collectibles;
};

// Export a default set of specimens for initial game state
export const specimens = initializeSpecimens();