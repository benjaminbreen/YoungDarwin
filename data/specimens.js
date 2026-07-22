// specimens.js - Updated with expanded specimen list and dynamic generation

import { canonicalizeSpecimen, canonicalSpecimenId } from '../utils/canonicalIds';

// Base specimen list 
export const baseSpecimens = [
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
    image: '/specimens/floreanagianttortoise.jpg',
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
    image: '/specimens/galapagosmockingbird.jpg',
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
    id: 'galapagosdove',
    name: 'Galapagos Dove',
    latin: 'Zenaida galapagoensis',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Dove',
    description: 'A compact island dove with a gray crown, cinnamon breast, blue eye-ring, and boldly spotted wings, usually feeding on the ground.',
    details: [
      'Bright blue orbital skin makes the face conspicuous at close range',
      'Black-and-ivory spots break up the chestnut wing coverts',
      'Walks between low plants to take seeds, fruit, and small invertebrates',
      'Its reluctance to flee makes island tameness immediately observable'
    ],
    habitat: 'scrubland, highland, settlement',
    collected: false,
    observations: [],
    scientificValue: 7,
    hybrid_ease: 7,
    hybrid_temperature: 6,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/placeholder.jpg',
    memoryText: 'Near the island well, doves came down within reach to drink—an unsettling measure of how little they feared people.',
    contents: 'The crop would likely contain small seeds and fruit fragments, with grit and occasional insect remains in the gizzard.',
    keywords: ['galapagos dove', 'dove', 'bird', 'zenaida', 'blue eye ring', 'spotted wing', 'island tameness', 'ground forager', 'floreana']
  },

  {
    id: 'galapagoshawk',
    name: 'Galapagos Hawk',
    latin: 'Buteo galapagoensis',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Hawk',
    description: 'A broad-winged endemic raptor that circles on still wings above the highlands and watches from the crowns of island trees.',
    details: [
      'Heavy hooked bill and powerful yellow feet distinguish it from the island’s smaller birds',
      'Broad wings and a banded tail are adapted to slow soaring over broken volcanic country',
      'Takes lizards, insects, rodents, young birds, carrion, and other available prey',
      'Often remains remarkably calm near people, even when perched within easy reach'
    ],
    habitat: 'forest, highland, scrubland',
    collected: false,
    observations: [],
    scientificValue: 8,
    hybrid_ease: 4,
    hybrid_temperature: 5,
    danger: 3,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/placeholder.jpg',
    memoryText: 'An island hawk allowed an observer to approach its branch with almost no alarm—a predator displaying the same unfamiliar tameness as its prey.',
    contents: 'The crop and stomach might contain lizard scales, insect fragments, fur, feathers, or carrion, revealing an opportunistic island diet.',
    keywords: ['galapagos hawk', 'hawk', 'raptor', 'buteo', 'soaring', 'hooked bill', 'island tameness', 'predator', 'floreana']
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
    image: '/specimens/largegroundfinch.jpg',
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
    image: '/specimens/mediumgroundfinch.jpg',
    memoryText: '“Within one species, a remarkable range of beak forms exists. This fact perplexes me greatly—what might such variation portend?”',
    contents: 'Upon examination, seeds of varying sizes, fruit pulp, and occasional insect remains would be found.',
    keywords: ['medium ground finch', 'bird', 'geospiza', 'beak', 'variation', 'darwin', 'floreana']
  },

  {
    id: 'flightlesscormorant',
    name: 'Flightless Cormorant',
    latin: 'Nannopterum harrisi',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Cormorant',
    description: 'A heavy coastal cormorant with reduced wings and strong legs, better suited to scrambling and diving than flight.',
    details: [
      'Small wings contrast sharply with its sturdy body',
      'Walks with a deliberate coastal waddle over lava and sand',
      'Feeds by diving after fish and other nearshore prey',
      'Its form makes flightlessness immediately visible'
    ],
    habitat: 'shore, rocky shoreline, bay',
    collected: false,
    observations: [],
    scientificValue: 8,
    hybrid_ease: 4,
    hybrid_temperature: 5,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/flightlesscormorant.jpg',
    memoryText: '“Here is a bird whose wings seem almost an afterthought. It walks the shore as if the sea, not the air, were its proper element.”',
    contents: 'A careful examination would likely reveal fish remains and grit from the rocky shore.',
    keywords: ['flightless cormorant', 'bird', 'cormorant', 'galapagos', 'flightless', 'coastal', 'diving']
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
    image: '/specimens/marineiguana.jpg',
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
    name: 'Lava Cactus',
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
    id: 'pricklypearpad',
    name: 'Prickly Pear Pad',
    latin: 'Opuntia megasperma',
    ontology: 'Plant',
    order: 'Cactus',
    sub_order: 'Prickly Pear',
    description: 'A fleshy, spine-studded pad broken from a Galápagos prickly pear, its waxy hide guarding stored water.',
    details: [
      'Flat obovate pads joined rim to rim, each sprouting from the last',
      'Areoles dot the surface in diamond rows, every one armed with barbs',
      'Watery pulp within sustains the plant through long droughts',
      'Tortoises and land iguanas devour fallen pads, spines and all'
    ],
    habitat: 'scrubland, lavafield',
    collected: false,
    observations: [],
    scientificValue: 3,
    hybrid_ease: 6,
    hybrid_temperature: 7,
    danger: 2,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/cactus.jpg',
    memoryText: '“The pads part from the plant with a green snap, and woe to the hand that catches one carelessly — the finer barbs work through cloth and linger for days.”',
    contents: 'Slicing the pad reveals cool mucilaginous pulp, stringy fibres, and a surprising store of clear moisture.',
    keywords: ['cactus', 'prickly pear', 'opuntia', 'pad', 'plant', 'succulent', 'spines', 'megasperma']
  },

  {
    id: 'pricklypearblossom',
    name: 'Prickly Pear Blossom',
    latin: 'Opuntia megasperma',
    ontology: 'Plant',
    order: 'Cactus',
    sub_order: 'Prickly Pear',
    description: 'A broad yellow cactus flower with ranks of silken petals about a deep orange heart.',
    details: [
      'Blooms perch on the upper rims of the highest pads',
      'Petals open with the morning sun and close by dusk',
      'Finches and native bees crowd the pollen-heavy centers',
      'Each flower ripens toward a reddish, seed-filled fruit'
    ],
    habitat: 'scrubland, lavafield',
    collected: false,
    observations: [],
    scientificValue: 4,
    hybrid_ease: 6,
    hybrid_temperature: 7,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/cactus.jpg',
    memoryText: '“So gay a flower upon so grim a plant! The blossoms are of a rich yellow, much beset by finches, and make the dry ground almost cheerful.”',
    contents: 'Pressed flat, the blossom yields fine yellow petals, abundant pollen, and a faintly sweet vegetable scent.',
    keywords: ['cactus', 'prickly pear', 'opuntia', 'flower', 'blossom', 'yellow', 'plant', 'megasperma']
  },

  {
    id: 'lavacactusflower',
    name: 'Lava Cactus Flower',
    latin: 'Brachycereus nesioticus',
    ontology: 'Plant',
    order: 'Cactus',
    sub_order: 'Lava Cactus',
    description: 'A small creamy-white flower crowning a bristled lava cactus column, open only in the cool of morning.',
    details: [
      'Blooms on the tips of the youngest golden columns',
      'Petals open before dawn and wilt in the midday heat',
      'Pollinators must visit in the brief cool hours',
      'A rare sight — the plant flowers sparingly on bare rock'
    ],
    habitat: 'lavafield, scrubland',
    collected: false,
    observations: [],
    scientificValue: 4,
    hybrid_ease: 6,
    hybrid_temperature: 7,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/cactus.jpg',
    memoryText: '“A flower of the purest cream upon the blackest rock — it had wilted by noon, and I was glad to have pressed one at first light.”',
    contents: 'Pressed flat, the flower yields waxy pale petals and a scatter of golden pollen with a faint honeyed scent.',
    keywords: ['cactus', 'lava cactus', 'flower', 'blossom', 'cream', 'white', 'plant', 'nesioticus']
  },

  {
    id: 'galapagoscotton',
    name: 'Galapagos Cotton',
    latin: 'Gossypium darwinii',
    ontology: 'Plant',
    order: 'Malvaceae',
    sub_order: 'Cotton',
    description: 'A dry-zone cotton shrub with soft leaves and pale flowers, rooted in the arid scrub above the shore.',
    details: [
      'Grows as a low shrub in dry coastal and scrubland habitats',
      'Leaves are broad and slightly rough to the touch',
      'Flowers and cottony seed fibers make it stand out among darker lava plants',
      'Its island distribution makes locality notes especially important'
    ],
    habitat: 'scrubland, bay, coastalTrail',
    collected: false,
    observations: [],
    scientificValue: 5,
    hybrid_ease: 6,
    hybrid_temperature: 6,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: '“A cotton-like shrub grows here despite the dry heat and black lava. Its place on this island may prove as important as its form.”',
    contents: 'Pressed leaves, flowers, and seed fibers would preserve the useful characters better than a bulky branch.',
    keywords: ['galapagos cotton', 'plant', 'gossypium', 'darwinii', 'shrub', 'flora', 'dry scrub']
  },

  {
    id: 'palosantotwig',
    name: 'Palo Santo Twig',
    latin: 'Bursera graveolens',
    ontology: 'Plant',
    order: 'Sapindales',
    sub_order: 'Burseraceae',
    description: 'A pale, crooked twig from the dominant dry-zone tree, carrying a persistent balsamic fragrance beneath its mottled bark.',
    details: [
      'Pale bark breaks into cream, grey, and warm brown patches',
      'Crooked branches form an open crown during the dry season',
      'Small leaves are shed when drought intensifies and return after rain',
      'Aromatic resin remains perceptible in freshly broken wood'
    ],
    habitat: 'dry scrub, transition zone, rocky slopes',
    collected: false,
    observations: [],
    scientificValue: 4,
    hybrid_ease: 5,
    hybrid_temperature: 5,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: '“The low crooked tree is nearly bare, yet a broken twig gives a surprisingly strong balsamic odour.”',
    contents: 'A cut section shows pale fibrous wood with aromatic resin concentrated beneath the bark.',
    keywords: ['palo santo', 'bursera', 'graveolens', 'tree', 'plant', 'resin', 'aromatic', 'dry zone']
  },

  {
    id: 'sicyosvillosus',
    name: "Darwin's Lost Vine",
    latin: 'Sicyos villosus',
    ontology: 'Plant',
    order: 'Cucurbitales',
    sub_order: 'Cucurbitaceae',
    description: 'A sprawling glandular-hairy vine found by Darwin on Charles Island, with broad heart-shaped leaves, divided tendrils, small yellow flowers, and bristly fruit.',
    details: [
      'Broad, nearly round leaves are deeply heart-shaped at the base and lightly lobed or toothed',
      'Loose spreading glandular hairs cover the stems, petioles, and flower panicles',
      'Each tendril divides into several slender branches that take hold of neighboring vegetation',
      'Small yellow male flowers form many-flowered panicles; the elliptic fruit bears stiff retrorse bristles',
      'Hooker recorded Darwin’s note that the vine formed great beds and was injurious to other vegetation'
    ],
    habitat: 'humid highland clearing edges; exact 1835 locality unrecorded',
    rarity: 'ultra_rare',
    collected: false,
    observations: [],
    scientificValue: 9,
    hybrid_ease: 4,
    hybrid_temperature: 5,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: '“A scandent plant spreading in great beds, its divided tendrils catching upon every neighboring stem; I have preserved leaf, flower, and the curious bristled fruit together.”',
    contents: 'A pressed cutting preserves the cordate leaf, glandular pubescence, branching tendril, flower arrangement, and one-seeded bristly fruit used to distinguish the species.',
    keywords: ['sicyos', 'villosus', 'lost plant', 'extinct plant', 'vine', 'cucurbit', 'charles island', 'floreana', 'darwin']
  },

  {
    id: 'deliliainelegans',
    name: "Darwin's Lost Herb",
    latin: 'Delilia inelegans',
    ontology: 'Plant',
    order: 'Asterales',
    sub_order: 'Asteraceae',
    description: 'A slight annual composite collected by Darwin on Charles Island, branching by threes and carrying opposite serrated leaves with dense flattened flower-heads in their axils.',
    details: [
      'The erect cylindrical stem divides trichotomously from near the base into pubescent ascending branches',
      'Opposite petiolate leaves are ovate, blunt, coriaceous, and doubly serrate',
      'Leaf surfaces are rough and somewhat glossy above, with pubescence beneath',
      'Inconspicuous composite flower-heads crowd the leaf axils in depressed spherical masses about half an inch across',
      'Hooker described the species from Darwin’s Charles Island material; no later living collection is known'
    ],
    habitat: 'highland transition clearings; exact 1835 locality unrecorded',
    rarity: 'ultra_rare',
    collected: false,
    observations: [],
    scientificValue: 9,
    hybrid_ease: 5,
    hybrid_temperature: 5,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: 'A low annual herb divides neatly into three ascending axes. Its paired leaves and crowded axillary heads are plain at first glance, but unusually exact in arrangement.',
    contents: 'A carefully pressed flowering sprig preserves the trichotomous branching, opposite doubly-serrate leaves, pubescence, and depressed axillary heads used to distinguish the species.',
    keywords: ['delilia', 'inelegans', 'desmocephalum', 'lost plant', 'extinct plant', 'annual herb', 'asteraceae', 'charles island', 'floreana', 'darwin']
  },

  {
    id: 'lecocarpuspinnatifidus',
    name: 'Wing-fruited Floreana Daisy',
    latin: 'Lecocarpus pinnatifidus',
    ontology: 'Plant',
    order: 'Asterales',
    sub_order: 'Asteraceae',
    description: 'A low Floreana-endemic daisy shrub collected by Darwin, with remarkably variable cut leaves, yellow flower-heads on long stalks, and papery winged fruit.',
    details: [
      'Leaves vary from broadly lanceolate and incised to deeply pinnatifid with narrow lobes',
      'Warm yellow composite heads rise above the foliage on slender peduncles',
      'The winged fruit is unique within Lecocarpus and may aid wind dispersal',
      'Modern plants range from small 20 cm shrubs to forms approaching 2 m',
      'The species survives only on Floreana and is now considered critically endangered'
    ],
    habitat: 'Floreana littoral, arid, and transition scrub',
    rarity: 'ultra_rare',
    collected: false,
    observations: [],
    scientificValue: 8,
    hybrid_ease: 5,
    hybrid_temperature: 5,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: 'The cut of the leaves varies markedly even upon one shrub, while the yellow heads and flat-winged fruits give firmer characters for comparison.',
    contents: 'A terminal sprig preserves a sequence of pinnatifid leaves, a composite head, and the diagnostic winged fruit without sacrificing the woody rootstock.',
    keywords: ['lecocarpus', 'pinnatifidus', 'floreana daisy', 'winged fruit', 'yellow flower', 'asteraceae', 'charles island', 'floreana', 'darwin', 'critically endangered']
  },

  {
    id: 'scalesiavillosa',
    name: 'Longhaired Scalesia',
    latin: 'Scalesia villosa',
    ontology: 'Plant',
    order: 'Asterales',
    sub_order: 'Asteraceae',
    description: 'A woody daisy shrub endemic to northern Floreana, recognizable by its broad, softly white-haired leaves.',
    details: [
      'Broad leaves are slightly undulate and conspicuously covered in pale hairs',
      'The woody shrub belongs to the same family as mainland daisies and sunflowers',
      'It colonizes barren cinder slopes and cracks in comparatively young lava',
      'Its restricted Floreana range makes an exact locality label unusually important'
    ],
    habitat: 'scrubland, coastallava, northern shore',
    collected: false,
    observations: [],
    scientificValue: 7,
    hybrid_ease: 5,
    hybrid_temperature: 6,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: '“A daisy in affinity, yet grown woody upon the lava: the islands repeatedly give familiar families an unfamiliar stature.”',
    contents: 'A pressed shoot preserves the woolly leaf surface, the leaf margins, and any flower heads; a locality note distinguishes the observation from other island Scalesia.',
    keywords: ['scalesia', 'villosa', 'longhaired scalesia', 'lechoso', 'woody daisy', 'asteraceae', 'floreana', 'endemic']
  },

  {
    id: 'galapagosjusticia',
    name: 'Galápagos Justicia',
    latin: 'Justicia galapagana',
    ontology: 'Plant',
    order: 'Lamiales',
    sub_order: 'Acanthaceae',
    description: 'A small Galápagos-endemic shrub bearing striking lilac-to-purple flowers in humid and transition vegetation.',
    details: [
      'The flowers range from pale lilac to deep purple',
      'Individual flowers have an orchid-like, bilaterally symmetric form',
      'The plant remains a shrub rather than forming a highland tree canopy',
      'Floreana is one of the islands on which the species has been recorded'
    ],
    habitat: 'forest, highland, humid understory',
    collected: false,
    observations: [],
    scientificValue: 6,
    hybrid_ease: 5,
    hybrid_temperature: 5,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: '“The purple flowers are the first character to seize the eye, but the form of the corolla will prove the sounder character once pressed.”',
    contents: 'A flowering sprig pressed at once would retain the paired leaves and the arrangement of its purple corollas, though much of their colour may fade.',
    keywords: ['justicia', 'galapagana', 'galapagos justicia', 'purple flower', 'lilac', 'acanthaceae', 'floreana', 'endemic']
  },

  {
    id: 'crotonscouleri',
    name: 'Chala',
    latin: 'Croton scouleri',
    ontology: 'Plant',
    order: 'Malpighiales',
    sub_order: 'Euphorbiaceae',
    description: 'A common Galápagos woody shrub with blue-green hairy leaves and minute pale flowers carried in spikes.',
    details: [
      'Leaf form varies from narrow and small to comparatively broad',
      'Fine hairs give the foliage a muted blue-green or grey-green cast',
      'Male and female flowers occur separately and are grouped in slender spikes',
      'Its abundance across dry and transition vegetation makes variation within a population worth recording'
    ],
    habitat: 'scrubland, transition zone, dry forest',
    collected: false,
    observations: [],
    scientificValue: 5,
    hybrid_ease: 6,
    hybrid_temperature: 6,
    danger: 2,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: '“The same chala alters greatly from one thicket to the next; several shoots and exact stations will be more useful than a single handsome branch.”',
    contents: 'A pressed leafy shoot and separate flowering spike preserve the variable leaf proportions and the tiny unisexual flowers.',
    keywords: ['chala', 'croton', 'scouleri', 'galapagos croton', 'euphorbiaceae', 'shrub', 'blue green leaves', 'floreana']
  },

  {
    id: 'resurrectionfern',
    name: 'Resurrection Fern',
    latin: 'Pleopeltis polypodioides',
    ontology: 'Plant',
    order: 'Polypodiales',
    sub_order: 'Polypodiaceae',
    description: 'A native fern whose fronds curl and appear lifeless in drought, then spread again after mist or rain.',
    details: [
      'Dry fronds contract tightly, reducing exposed surface during water stress',
      'Moisture restores the green, spreading form without the plant growing a new frond',
      'It favors humid, sheltered rock, bark, and forest-edge microsites',
      'The sori beneath a mature frond provide better evidence than foliage alone'
    ],
    habitat: 'forest, highland, humid understory, wet rock',
    collected: false,
    observations: [],
    scientificValue: 6,
    hybrid_ease: 4,
    hybrid_temperature: 4,
    danger: 1,
    timeofday: 'Any',
    quote: '',
    memoryText: '“What seemed a dead and brittle fern has opened in the mist. A specimen should be kept with a note of both states.”',
    contents: 'A complete frond with its rhizome and fertile underside would preserve the scale pattern and rows of sori used for comparison.',
    keywords: ['fern', 'resurrection fern', 'pleopeltis', 'polypodioides', 'polypodium', 'frond', 'sori', 'highland']
  },

  {
    id: 'sesuviumportulacastrum',
    name: 'Galápagos Carpetweed',
    latin: 'Sesuvium portulacastrum',
    ontology: 'Plant',
    order: 'Caryophyllales',
    sub_order: 'Aizoaceae',
    description: 'A salt-tolerant shoreline creeper forming dense fleshy mats over sand and rock around lagoons and exposed coasts.',
    details: [
      'Grey-green succulent leaves store water and tolerate salt spray',
      'Low trailing stems root into sandy and rocky coastal ground',
      'Small star-shaped flowers are pink and attract Galápagos carpenter bees',
      'Cool-season mats may turn orange or red across whole shoreline patches'
    ],
    habitat: 'wetland, beach, rocky shoreline, saline flat',
    collected: false,
    observations: [],
    scientificValue: 5,
    hybrid_ease: 5,
    hybrid_temperature: 7,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: '“The fleshy mat lies where ordinary shrubs would be burned by salt. Its station may tell as much as its small pink flower.”',
    contents: 'Several connected stem nodes, leaves, and a flower can be pressed together to preserve the creeping habit rather than only an isolated leaf.',
    keywords: ['sesuvium', 'portulacastrum', 'carpetweed', 'sea purslane', 'shoreline seapurslane', 'succulent', 'salt tolerant', 'lagoon']
  },

  {
    id: 'candelabracactus',
    name: 'Candelabra Cactus',
    latin: 'Jasminocereus thouarsii var. thouarsii',
    ontology: 'Plant',
    order: 'Caryophyllales',
    sub_order: 'Cactaceae',
    description: 'A tall endemic columnar cactus whose upright branches give the dry-zone plant its candelabrum silhouette.',
    details: [
      'Succulent ribbed stems rise upright and branch above the base',
      'Mature plants can reach roughly five metres in height',
      'Large yellow flowers are visited by insects during their flowering season',
      'Red fruits provide food for island birds and help move its seeds'
    ],
    habitat: 'scrubland, coastallava, dry forest',
    collected: false,
    observations: [],
    scientificValue: 7,
    hybrid_ease: 5,
    hybrid_temperature: 8,
    danger: 3,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: '“The columns divide like the arms of a candlestick and stand well above the scrub; a fallen flower will serve better than cutting the living stem.”',
    contents: 'A fallen flower, fruit, or carefully clipped spine cluster can be labeled without removing a large section of the slow-growing stem.',
    keywords: ['candelabra cactus', 'jasminocereus', 'thouarsii', 'cactus', 'cactaceae', 'columnar', 'yellow flower', 'floreana']
  },

  {
    id: 'manzanillo',
    name: 'Manzanillo / Poison Apple',
    latin: 'Hippomane mancinella',
    ontology: 'Plant',
    order: 'Malpighiales',
    sub_order: 'Euphorbiaceae',
    description: 'A native evergreen shore and forest tree whose glossy foliage and apple-like fruit conceal dangerously caustic milky latex.',
    details: [
      'A straight trunk with grey bark can support a crown up to about fifteen metres high',
      'Simple alternate leaves are elliptical to ovate with prominent veins',
      'Rounded fruit turns yellow when ripe and should not be tasted or handled carelessly',
      'Milky sap can cause severe skin and eye irritation, making observation safer than collection'
    ],
    habitat: 'beach, dry forest, forest edge, lagoon margin',
    collected: false,
    observations: [],
    scientificValue: 6,
    hybrid_ease: 2,
    hybrid_temperature: 3,
    danger: 9,
    timeofday: 'Diurnal',
    quote: '',
    memoryText: '“The innocent-looking fruit and shining leaf invite a dangerous mistake. I shall sketch the whole tree before deciding whether any fragment can be safely taken.”',
    contents: 'A safely dried leaf or fallen fruit, isolated from skin and eyes and marked poisonous, would preserve useful characters; fresh cuts exude caustic white latex.',
    keywords: ['manzanillo', 'manchineel', 'poison apple', 'hippomane', 'mancinella', 'toxic', 'latex', 'tree', 'floreana']
  },

  {
    id: 'maize',
    name: 'Maize',
    latin: 'Zea mays',
    ontology: 'Plant',
    order: 'Poaceae',
    sub_order: 'Cultivated grain',
    description: 'An ear of maize from the penal colony gardens, grown from mainland seed in the damp highland soil.',
    details: [
      'Planted in furrowed rows of dark volcanic earth',
      'Fed the two to three hundred exiles of the settlement',
      'A mainland cultivar, wholly foreign to the island flora',
      'Its survival here depends on the garua mists of the highlands'
    ],
    habitat: 'settlement',
    collected: false,
    observations: [],
    scientificValue: 2,
    hybrid_ease: 6,
    hybrid_temperature: 6,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/maize.jpg',
    memoryText: '“The colonists coax Indian corn from this black soil. Cultivation, like the tortoise, tells a story of what these islands can and cannot support.”',
    contents: 'Kernels stripped from the cob would travel better than the whole ear, though Syms argues for roasting it instead.',
    keywords: ['maize', 'corn', 'indian corn', 'crop', 'plant', 'cultivated', 'settlement', 'garden']
  },

  {
    id: 'sweetpotato',
    name: 'Sweet Potato',
    latin: 'Ipomoea batatas',
    ontology: 'Plant',
    order: 'Convolvulaceae',
    sub_order: 'Root crop',
    description: 'A fat sweet-potato tuber dug from the settlement plots — the staple Darwin saw cultivated on the flat highland ground.',
    details: [
      'Grown in low mounded vines over black mud',
      'One of the two crops Darwin explicitly recorded at the settlement',
      'The tuber keeps well and feeds the colony through the dry season',
      'Trailing vines root wherever a node touches wet earth'
    ],
    habitat: 'settlement',
    collected: false,
    observations: [],
    scientificValue: 2,
    hybrid_ease: 6,
    hybrid_temperature: 6,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/sweetpotato.jpg',
    memoryText: '“The houses stand on ground cultivated with sweet potatoes and bananas. After the parched coast, the sight of black mud is strangely pleasant.”',
    contents: 'Cut open, the tuber is pale orange and starchy; a slip pressed between papers would document the vine.',
    keywords: ['sweet potato', 'tuber', 'crop', 'plant', 'cultivated', 'settlement', 'garden', 'batatas']
  },

  {
    id: 'sugarcane',
    name: 'Sugar Cane',
    latin: 'Saccharum officinarum',
    ontology: 'Plant',
    order: 'Poaceae',
    sub_order: 'Cultivated cane',
    description: 'A cut length of sugar cane from the small settlement plot, jointed and sweet with sap.',
    details: [
      'Grows in a dense clump taller than a man',
      'Raised from mainland stock in the wettest corner of the gardens',
      'Chewed for its sweet pith by colonists and soldiers alike',
      'Banded stems show the growth of each wet month'
    ],
    habitat: 'settlement',
    collected: false,
    observations: [],
    scientificValue: 2,
    hybrid_ease: 5,
    hybrid_temperature: 7,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/sugarcane.jpg',
    memoryText: '“Cane from the tropics, corn from the Andes, potatoes from the coast — the colony is a living experiment in what will take root here.”',
    contents: 'The jointed stem is heavy with sweet sap; a section with a node would be the useful specimen.',
    keywords: ['sugar cane', 'cane', 'crop', 'plant', 'cultivated', 'settlement', 'garden', 'saccharum']
  },

  {
    id: 'lavalizard',
    name: 'Floreana Lava Lizard',
    latin: 'Microlophus grayii',
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
    image: '/specimens/crab.jpg',
    memoryText: '“The sailors spoke of their agility, which I initially doubted. But indeed, they move in any direction with startling quickness.”',
    contents: 'Within its shell, bits of algae, tiny shell fragments, and occasional morsels of rotting fish may be discovered.',
    keywords: ['crab', 'red', 'crustacean', 'sally', 'lightfoot', 'grapsus', 'tide', 'rock']
  },

  {
    id: 'galapagoscarpenterbee',
    name: 'Galápagos Carpenter Bee',
    latin: 'Xylocopa darwini',
    ontology: 'Animal',
    order: 'Insect',
    sub_order: 'Bee',
    description: 'A glossy blue-black carpenter bee working deliberately among the island flowers.',
    details: ['Large native bee with a dark metallic sheen', 'Visits cactus, cotton, and other island flowers', 'Females excavate nesting tunnels in dry wood', 'An important pollinator on the arid island'],
    habitat: 'scrubland, flowers, cactus',
    collected: false, observations: [], scientificValue: 4, hybrid_ease: 4, hybrid_temperature: 5, danger: 1,
    timeofday: 'Diurnal', quote: '', image: '', memoryText: '', contents: '',
    keywords: ['bee', 'carpenter bee', 'pollinator', 'xylocopa'],
    pollinator: true, worldMarker: false, collisionRadius: 0, interactionHeight: 0.06, examineRadius: 0.07,
  },
  {
    id: 'galapagossulphur',
    name: 'Galápagos Sulphur Butterfly',
    latin: 'Phoebis sennae marcellina',
    ontology: 'Animal',
    order: 'Insect',
    sub_order: 'Butterfly',
    description: 'A loose-flying yellow sulphur butterfly moving between flowers in the dry scrub.',
    details: ['Warm yellow wings catch the sun in flight', 'Flight is wandering and buoyant', 'Frequently visits low flowers in dry country', 'Closes its wings upright when resting'],
    habitat: 'dry scrub, flowers, cactus',
    collected: false, observations: [], scientificValue: 3, hybrid_ease: 5, hybrid_temperature: 5, danger: 0,
    timeofday: 'Diurnal', quote: '', image: '', memoryText: '', contents: '',
    keywords: ['butterfly', 'sulphur', 'yellow', 'pollinator', 'phoebis'],
    pollinator: true, worldMarker: false, collisionRadius: 0, interactionHeight: 0.1, examineRadius: 0.11,
  },
  {
    id: 'galapagosgulffritillary',
    name: 'Galápagos Gulf Fritillary',
    latin: 'Agraulis vanillae galapagensis',
    ontology: 'Animal',
    order: 'Insect',
    sub_order: 'Butterfly',
    description: 'An orange, silver-spotted fritillary sailing quickly over the greener margins of the scrub.',
    details: ['Long orange forewings carry dark markings', 'Silvery spots flash on the wing undersides', 'Flies more directly than the yellow sulphur', 'Basks with its wings spread in strong sun'],
    habitat: 'grass, scrub margins, flowers',
    collected: false, observations: [], scientificValue: 4, hybrid_ease: 5, hybrid_temperature: 5, danger: 0,
    timeofday: 'Diurnal', quote: '', image: '', memoryText: '', contents: '',
    keywords: ['butterfly', 'fritillary', 'orange', 'pollinator', 'agraulis'],
    pollinator: true, worldMarker: false, collisionRadius: 0, interactionHeight: 0.1, examineRadius: 0.11,
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
    id: 'lavagull',
    name: 'Lava Gull',
    latin: 'Leucophaeus fuliginosus',
    ontology: 'Animal',
    order: 'Bird',
    sub_order: 'Seabird',
    description: 'A dark Galapagos gull of lava shores and sheltered beaches, quick to rise from the tideline when approached.',
    details: [
      'Charcoal-gray plumage blends with black lava and wet sand',
      'Forages along the swash line for fish scraps, crabs, and stranded prey',
      'Often walks alone or in pairs rather than forming dense noisy flocks',
      'Takes off low over the beach before circling back to feed'
    ],
    habitat: 'shore, beach, rocky shoreline',
    collected: false,
    observations: [],
    scientificValue: 4,
    hybrid_ease: 4,
    hybrid_temperature: 4,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/lavagull.jpg',
    memoryText: '“A dark gull works the shore alone, rising only when I press too close to the tide.”',
    contents: 'A field examination would likely find fish fragments, crab remains, and grit from the beach.',
    keywords: ['lava gull', 'gull', 'seagull', 'bird', 'seabird', 'galapagos', 'shore', 'leucophaeus']
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
    image: '/specimens/coral.jpg',
    memoryText: '“A relic of the reef—its once-living architecture is now a mere skeleton, polished by the waves.”',
    contents: 'Broken open, one finds only hollow calcified passages, long since emptied of life.',
    keywords: ['coral', 'calcium', 'marine', 'white', 'fragment', 'reef', 'polyp', 'skeleton']
  },

  {
  id: 'seaurchin',
  name: 'Slate-pencil Urchin',
  latin: 'Eucidaris galapagensis',
  ontology: 'Animal',
  order: 'Echinoderm',
  sub_order: 'Sea Urchin',
  description: 'A reddish sea creature bearing thick, blunt spines like stubs of pencil, found wedged into rock crevices in tidal pools and along the shore.',
  details: [
    'Round body ringed with stout, club-like spines, often worn smooth',
    'Wedges itself firmly into rock crevices by day',
    'Clings to submerged rocks with hundreds of tiny tube feet',
    'When prodded, the spines move slightly, revealing a living creature beneath',
    'Old spines are frequently encrusted with coralline algae'
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
  memoryText: '“Its spines are not needles but stout batons, worn like old pencils. Wedged in its crevice, it resisted my efforts with surprising obstinacy.”',
  contents: 'If split open, the interior reveals five symmetrical orange lobes of soft, edible flesh, surrounded by a delicate web of calcareous plates.',
  keywords: ['sea urchin', 'echinoderm', 'spines', 'tidal', 'eucidaris', 'marine']
},


  {
    id: 'basalt',
    name: 'Vesicular Basalt Exposure',
    latin: 'Lava basaltica',
    ontology: 'Mineral',
    order: 'Igneous',
    sub_order: 'Volcanic',
    description: 'A low exposure of dark volcanic rock with telltale bubbles and cooling fractures.',
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
    image: '/specimens/basalt.jpg',
    memoryText: '“Black truncated cones abound, their slopes composed of such basaltic rubble. The heat underfoot can be punishing.”',
    contents: 'Split open, the stone reveals small air pockets and a dense interior of dark minerals.',
    keywords: ['basalt', 'rock', 'lava', 'formation', 'volcanic', 'black', 'vesicular', 'jagged']
  },

  {
    id: 'scoria',
    name: 'Red Scoria',
    latin: 'Scoria rubra',
    ontology: 'Mineral',
    order: 'Igneous',
    sub_order: 'Volcanic',
    description: 'A rusty red volcanic fragment, light for its size and pocked by escaped gas bubbles.',
    details: [
      'Porous texture preserves the froth of gas-rich lava',
      'Reddish color comes from oxidized iron minerals',
      'Breaks into rough, sharp-edged chips under a hammer',
      'Often found mixed with darker basalt rubble on dry volcanic slopes'
    ],
    habitat: 'lavafield, cliff, highland',
    collected: false,
    observations: [],
    scientificValue: 5,
    hybrid_ease: 2,
    hybrid_temperature: 2,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/scoria.jpg',
    memoryText: '“Some fragments are red as brick, filled throughout with cavities, as if the lava had boiled in place.”',
    contents: 'A fresh break shows a reddish, vesicular interior with black mineral flecks and occasional glassy edges.',
    keywords: ['scoria', 'red', 'volcanic', 'vesicular', 'iron', 'lava', 'porous']
  },

  {
    id: 'tuff',
    name: 'Volcanic Tuff',
    latin: 'Tufum volcanicum',
    ontology: 'Mineral',
    order: 'Igneous',
    sub_order: 'Pyroclastic',
    description: 'A pale, compacted ash stone that flakes and powders more readily than dense basalt.',
    details: [
      'Formed from consolidated volcanic ash and small ejecta',
      'Often tan, ochre, or gray rather than black',
      'A hammer leaves a dusty pale fracture instead of a ringing chip',
      'Layering can preserve evidence of successive eruptions'
    ],
    habitat: 'cliff, highland, coastalTrail',
    collected: false,
    observations: [],
    scientificValue: 6,
    hybrid_ease: 2,
    hybrid_temperature: 2,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/tuff.jpg',
    memoryText: '“The softer volcanic beds crumble beneath the hammer, their pale dust unlike the hard black lava below.”',
    contents: 'Inside, the sample shows fine ash grains, small lithic fragments, and faint bedding planes.',
    keywords: ['tuff', 'ash', 'volcanic', 'pyroclastic', 'pale', 'layered', 'soft']
  },

  {
    id: 'ironoxidecrust',
    name: 'Iron-stained Crust',
    latin: 'Ferrugo oxidata',
    ontology: 'Mineral',
    order: 'Oxide',
    sub_order: 'Weathering Product',
    description: 'A thin rust-colored weathering crust where iron-rich minerals have oxidized near the surface.',
    details: [
      'Usually forms as a coating rather than a solid rock type',
      'Color can range from ochre to deep reddish brown',
      'A light hammer tap flakes the crust away from darker stone beneath',
      'Useful as evidence of weathering, moisture, and mineral alteration'
    ],
    habitat: 'lavafield, shore, cliff',
    collected: false,
    observations: [],
    scientificValue: 4,
    hybrid_ease: 2,
    hybrid_temperature: 2,
    danger: 1,
    timeofday: 'Diurnal',
    quote: '',
    image: '/specimens/ironoxidecrust.jpg',
    memoryText: '“The red stain is no separate lava but a skin of weathering, marking where air and water have worked on the stone.”',
    contents: 'A flake reveals a rusty outer surface and a darker, denser volcanic substrate beneath.',
    keywords: ['iron', 'oxide', 'rust', 'weathering', 'crust', 'red', 'mineral']
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
    image: '/specimens/olivine.jpg',
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
    image: '/specimens/plicopurpura.jpg',
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
    image: '/specimens/neorapana.jpg',
    memoryText: '“Its shell is formidable, thick and encrusted, suggesting a life spent among harsh waves and opportunistic predators.”',
    contents: 'Inside, one would find sand. This is an empty shell.',
    keywords: ['neorapana', 'grandis', 'gastropod', 'shell', 'marine']
  },

  {
  id: 'shortearedowl',
  name: 'Galápagos Short-eared Owl',
  latin: 'Asio flammeus galapagoensis',
  ontology: 'Animal',
  order: 'Bird',
  sub_order: 'Owl',
  description: 'A compact, dark island owl that quarters low over open lava and scrub, listening for small birds, reptiles, insects, or rodents.',
  details: [
    'Broad buff facial disc surrounds large forward-facing golden eyes',
    'Short ear-tufts usually lie flat, but lift briefly when the bird listens',
    'Long rounded wings give its low flight a buoyant, moth-like quality',
    'Mottled brown, ochre, and black plumage vanishes against weathered lava',
    'Remarkably variable diet includes insects, lava lizards, small birds, rodents, and carrion'
  ],
  habitat: 'highland, scrubland, camp',
  collected: false,
  observations: [],
  scientificValue: 6,
  hybrid_ease: 2,
  hybrid_temperature: 2,
  danger: 3,
  timeofday: 'Nocturnal',
  quote: '',
  image: '/specimens/shortearedowl.jpg',
  memoryText: 'At dusk an owl floated low over the lava, paused almost motionless to listen, then folded down upon something too small to see.',
  contents: 'Should it be dissected, pellets of fur, feathers, and small bone fragments lie within.',
  keywords: ['owl', 'bird', 'asio', 'nocturnal', 'raptor'],
  emoji: '🦉'
},
{
  id: 'galapagosracer',
  name: 'Floreana Racer Snake',
  latin: 'Pseudalsophis biserialis biserialis',
  ontology: 'Animal',
  order: 'Reptile',
  sub_order: 'Snake',
  description: 'A slender Floreana racer, active in the warmth of day and quick to vanish among lava crevices while hunting small reptiles and insects.',
  details: [
    'Warm brown flanks carry dark twin bands and broken saddles that disappear against weathered lava',
    'The forked tongue samples airborne scent particles while the head remains nearly still',
    'Primarily diurnal, coiling in sun-warmed pockets before short foraging runs',
    'Darwin preserved several snakes from Charles Island, the contemporary name for Floreana'
  ],
  habitat: 'scrubland, lavafield',
  collected: false,
  observations: [],
  scientificValue: 6,
  hybrid_ease: 2,
  hybrid_temperature: 3,
  danger: 2,
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/galapagosracer.jpg',
  memoryText: 'A narrow brown snake lay doubled in the warmth, tasted the air twice, and poured into a crack in the basalt without seeming to hurry.',
  contents: 'Tiny lava-lizard scales, gecko skin, and insect fragments may be discovered in its digestive tract.',
  keywords: ['floreana racer', 'galapagos racer', 'snake', 'reptile', 'pseudalsophis', 'charles island', 'lava'],
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
  latin: 'A piece of unsent mail',
  ontology: 'Document',
  order: 'Correspondence',
  sub_order: 'Personal Letter',
  description: 'A sealed letter addressed to a young woman in Nantucket, penned by a whaling captain who doubts he will return home.',
  details: [

    'Several passages suggest the writer fears his own mortality',
    'It’s rather sad...',

  ],
  habitat: 'hut, mailbarrel',
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
  habitat: 'governorshouse',
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

{
  id: 'timesoflondon',
  name: 'Times of London',
  latin: 'June, 1835. Three months out of date... perhaps the Governor is a subscriber.',
  ontology: 'Document',
  order: 'Newspaper',
  sub_order: 'English Press',
  description: 'A wrinkled copy of The Times from the third week of June, 1835, filled with the latest happenings back in England.',
 details: [
  "“We cannot but observe the continued disputes in Parliament regarding labour reform; debates echo the growing public concern for factory conditions and worker welfare.”",
  "“Let it be remembered that the prosperity of the realm depends, in no small measure, upon just treatment of its industrious classes.”",
  "“His Majesty’s Government, though wavering on some points, acknowledges that urgent remedies must be sought for these most pressing social ills.”"
],
  habitat: 'mailbarrel',
  collected: false,
  observations: [],
  scientificValue: 1,
  hybrid_ease: 1,
  hybrid_temperature: 1,
  danger: 1, // Not dangerous to handle
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/timesoflondon.jpg',
  memoryText: '“The paper crackles as you unfold it, its headlines a reminder of a distant home and a world still spinning outside these islands.”',
  contents: 'Covers the third week of June, 1835, with notable editorials on trade issues, parliamentary reforms, and a smattering of local advertisements.',
  keywords: ['newspaper', 'London', 'press', 'Times', '1835', 'English news']
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
  image: '/specimens/jackothemonkey.jpg',
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

// 7) Feral Horse
{
  id: 'feralhorse',
  name: 'Feral Horse',
  latin: 'Equus ferus caballus',
  ontology: 'Animal',
  order: 'Mammal',
  sub_order: 'Ungulate',
  description: 'A wary horse living around the settlement edge, browsing coarse grasses and keeping its distance from people.',
  details: [
    'Tall and nervous, with a saddle-worn silhouette from its domestic past',
    'Browses grasses and low plants near cultivated ground',
    'Bolts into open space if approached too quickly',
    'May rear or kick if cornered'
  ],
  habitat: 'settlement',
  collected: false,
  observations: [],
  scientificValue: 2,
  hybrid_ease: 2,
  hybrid_temperature: 3,
  danger: 4,
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/feralhorse.jpg',
  memoryText: '“The settlement animals are no less out of place than the men who brought them, shaping the island by tooth and hoof.”',
  contents: 'The stomach would hold coarse grass, leaves, and settlement weeds cropped close to the ground.',
  keywords: ['horse', 'mammal', 'feral', 'introduced', 'equus', 'settlement']
},

{
  id: 'cat',
  name: 'Settlement Cat',
  latin: 'Felis catus',
  ontology: 'Animal',
  order: 'Mammal',
  sub_order: 'Carnivore',
  description: 'A lean domestic cat living around the Asilo de la Paz settlement, tolerated for its work around stores and gardens.',
  details: [
    'Keeps close to huts, crop edges, and storage sheds rather than open lava',
    'Moves quietly through trampled ground and pauses to groom in the shade',
    'A familiar settlement animal, but a dangerous presence for tame island birds',
    'Likely arrived with colonists or passing ships rather than belonging to the native fauna'
  ],
  habitat: 'settlement',
  collected: false,
  observations: [],
  scientificValue: 2,
  hybrid_ease: 2,
  hybrid_temperature: 3,
  danger: 3,
  timeofday: 'Diurnal',
  quote: '',
  image: '/specimens/cat.jpg',
  memoryText: '“Even the common animals of a settlement alter an island, for the native birds possess little fear of such hunters.”',
  contents: 'A field note would record hair, bones, and scraps gathered from stores or around the colony.',
  keywords: ['cat', 'settlement', 'domestic', 'feral', 'predator', 'asilo', 'penal colony']
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
  image: '/specimens/scrimshawwhaletooth.jpg',
  memoryText: '“Sailors often whittled their stories into bone, so each carved line holds a small piece of their watery world.”',
  contents: 'If fractured, layers of dense ivory reveal an inner grain once part of a mighty whale’s jaw.',
  keywords: ['scrimshaw', 'whale tooth', 'ivory', 'artifact', 'maritime']
},

{
  id: 'watkinswill',
  name: 'Last Will and Testament of Patrick Watkins',
  latin: 'Clearly the work of a madman,',
  ontology: 'Document',
  order: 'Legal Document',
  sub_order: 'Handwritten Will',
  description: 'A rum-stained parchment containing the frenzied final directives of Patrick Watkins, the half-mad Irish castaway said to be Floreana’s earliest settler.',
  details: [
    'Barely legible scrawl, blotched with suspicious dark stains',
    'Mentions a shack, a patch of tobacco, and rumored “hidden gold” inland',
    'Riddled with profanities and curses upon any who thwart his desires',
  ],
  habitat: 'camp, cabin',
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
  image: '/specimens/meteoriron.jpg',
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
  image: '/specimens/solidifiedsulphur.jpg',
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
  image: '/specimens/scurvyremedy.jpg',
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
  image: '/specimens/captainsskull.jpg',
  memoryText: '“A chilling relic of man’s darker impulses. I stumbled upon it among the bushes, the empty eye sockets staring blankly.”',
  contents: 'Within the cranial cavity, only dust and brittle remnants remain, testifying to a brutal end years ago.',
  keywords: ['skull', 'murder', 'remains', 'captain', 'history']
}

];



// Initialize specimens when the game starts
export const initializeSpecimens = () => {
  return baseSpecimens.map(specimen => canonicalizeSpecimen({
    ...specimen,
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
      cleanItem.includes(canonicalSpecimenId(specimen.id)) || 
      specimen.keywords.some(keyword => cleanItem.includes(keyword.toLowerCase()))
    );
    
    if (matchedSpecimen && !specimenIds.includes(matchedSpecimen.id)) {
      specimenIds.push(canonicalSpecimenId(matchedSpecimen.id));
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
      const specimenId = canonicalSpecimenId(match.replace('[COLLECTIBLE:', '').replace(']', '').trim());
      if (specimenId && !collectibles.includes(specimenId)) {
        collectibles.push(specimenId);
      }
    });
  }
  
  return collectibles;
};

// Export a default set of specimens for initial game state
export const specimens = initializeSpecimens();
