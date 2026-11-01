// Readable papers in Gabriel's cave. Each one is an examinable item with a
// `readable` body: pages transcribed as Darwin sees them, with his rendering
// into English where the original is Catalan or Spanish, and a short gloss of
// what he makes of it. Read together they carry the cave's story: a printer
// hiding in the lava tube, a press feeding sheets to the whaling crews through
// the post barrel, and a plan, timed to the dark of the moon and a New Bedford
// whaler, to take eleven convicts off the island.
//
// `worldPlacement` coordinates are in the cave zone's own frame. `surface:
// 'cave'` lifts the point off the rock floor under (x, z); `wall` finds the
// rock face the way the props that show the paper do (props/anchors.js).
// `prop: 'none'` means the paper is already drawn by the cave furnishings.

const PRESS = 'GABRIEL_PRESS';
const QUARTERS = 'GABRIEL_QUARTERS';
const MOUTH = 'CAVE_ENTRANCE';
const SPRING = 'GABRIEL_SPRING';

function doc(entry) {
  // A paper on the wall is anchored at its middle; one on a table at the
  // surface it lies on, which the camera lifts from by default.
  const frameHint = entry.worldPlacement?.wall
    ? { centerY: 0, ...entry.frameHint }
    : entry.frameHint;
  return {
    kind: 'item',
    category: 'Item',
    collectable: false,
    collectVerb: 'Take it',
    uncertainties: [],
    ...entry,
    frameHint,
  };
}

export const GABRIEL_CAVE_DOCUMENTS = [
  // ---- The press gallery -------------------------------------------------
  doc({
    typeId: 'cave_broadside_catalan',
    name: 'Broadside in Catalan',
    subtitle: 'pasted to the rock by the ink bench',
    description: 'A broadside pulled on the hand press and pasted to the wall to dry, the drop capital so over-inked it has bled into the paper.',
    details: ['Printed, not written: a hand press, worn type', 'The language is Catalan, not Castilian', 'Dated from this island'],
    uncertainties: ['Who on this island reads Catalan?'],
    frameHint: { height: 0.75, radius: 0.42 },
    zoneId: PRESS,
    worldPlacement: { x: -3.0, z: 2.0, wall: { y: 1.6, dir: [0, 1] }, prop: 'none' },
    readable: {
      form: 'broadside',
      pages: [{
        hand: 'print',
        language: 'Catalan',
        lines: [
          '# ALS TREBALLADORS',
          '# DE TOTES LES ILLES',
          '## LA TERRA ÉS DE QUI LA TREBALLA',
          'Companys: el govern de Quito us ha enviat aquí a morir de set i de feina, i en diu colonitzar. La terra que llaureu és vostra; l’aigua que traieu és vostra; el blat de moro que plantareu el menjarà el governador.',
          'No us demano armes. Us demano que aprengueu a llegir, i que no oblideu el nom de cap home que us hagi pegat.',
          '_Passa aquest full a qui no sap llegir._',
          '— Illa Charles, 1835 —',
        ],
        translation: [
          '# TO THE WORKERS',
          '# OF ALL THE ISLANDS',
          '## THE LAND BELONGS TO THOSE WHO WORK IT',
          'Comrades: the government at Quito has sent you here to die of thirst and labour, and calls it colonising. The ground you till is yours; the water you draw is yours; the maize you plant, the governor will eat.',
          'I do not ask you for arms. I ask you to learn to read, and to forget the name of no man who has beaten you.',
          '_Pass this sheet to one who cannot read._',
          '— Charles Island, 1835 —',
        ],
      }],
      gloss: 'Catalan. I can follow it by way of Spanish and my Latin. Printed here, on this island, this year, and addressed to the convicts of Mr. Lawson’s settlement.',
    },
  }),
  doc({
    typeId: 'cave_broadside_catechism',
    name: 'Catechism of the Exile',
    subtitle: 'a printed sheet in a border of flowers',
    description: 'A broadside set as a catechism, question and answer, in a border of printer’s flowers. Beneath the last answer, two lines have been added by hand in brown ink.',
    details: ['Spanish, set in the form of the Church catechism', 'Two hands: the printed answers, and a later pen', 'The pen argues with itself'],
    uncertainties: ['The handwritten lines are not in the same hand as the cave’s other notes.'],
    frameHint: { height: 0.75, radius: 0.42 },
    zoneId: PRESS,
    worldPlacement: { x: 0.4, z: 2.0, wall: { y: 1.6, dir: [0, 1] }, prop: 'none' },
    readable: {
      form: 'broadside',
      pages: [{
        hand: 'print',
        language: 'Spanish',
        lines: [
          '# CATECISMO',
          '## DEL DESTERRADO',
          'P. ¿Quién es tu amo?',
          '_R. Ningún hombre._',
          'P. ¿De quién es el manantial?',
          '_R. Del que tiene sed._',
          'P. ¿Quién te desterró?',
          '_R. Los que temen la imprenta._',
          'P. ¿Qué te queda?',
          '_R. Las manos y la letra._',
          'P. ¿Y la isla?',
          '~R. Del Estado.~',
          '> — de todos',
          '> — de nadie',
        ],
        translation: [
          '# CATECHISM',
          '## OF THE EXILE',
          'Q. Who is your master?',
          '_A. No man._',
          'Q. Whose is the spring?',
          '_A. His who is thirsty._',
          'Q. Who banished you?',
          '_A. Those who fear the press._',
          'Q. What is left to you?',
          '_A. Your hands and your letters._',
          'Q. And the island?',
          '~A. The State’s.~',
          '> — everyone’s',
          '> — no one’s',
        ],
      }],
      gloss: 'The last printed answer struck through, and two others written beneath it in different inks: "everyone’s", and then "no one’s". Two people have been arguing over this sheet. The printer does not work alone.',
    },
  }),
  doc({
    typeId: 'cave_broadside_english',
    name: 'Broadside to the Whalemen',
    subtitle: 'a smaller sheet, in English',
    description: 'A smaller broadside in English, the type uneven, as though set by someone who knew the language better by ear than by eye.',
    details: ['English, but with no letter W in the fount', 'Addressed to whaling crews', 'Names the post barrel at the bay'],
    uncertainties: ['How do these sheets reach the ships?'],
    frameHint: { height: 0.6, radius: 0.36 },
    zoneId: PRESS,
    worldPlacement: { x: 3.6, z: 1.6, wall: { y: 1.6, dir: [0, 1] }, prop: 'none' },
    readable: {
      form: 'broadside',
      pages: [{
        hand: 'print',
        language: 'English',
        lines: [
          '# TO THE SAILORS',
          '## OF THE VVHALE SHIPS.',
          'Your oVVners groVV rich at home while you eat VVorms at sea. Your lay is a hundred and fiftieth part, and the slop chest takes it back before you see Nantucket.',
          '# ON THIS ISLAND',
          '# NO MAN NEED BE',
          '# A SERVANT.',
          '_Ask at the barrel. VVe are near._',
        ],
      }],
      gloss: 'Every W is set as two Vs: a Spanish fount has no W in it. "Ask at the barrel" can only mean the post barrel at the bay, where the whalers leave and take letters. So that is the road by which these sheets go out.',
    },
  }),
  doc({
    typeId: 'cave_forme_on_stone',
    name: 'Type Locked in the Forme',
    subtitle: 'on the imposing stone, not yet printed',
    description: 'A page of type locked up in its iron chase on the stone, inked once for a proof and not yet printed. The letters stand reversed, as type does; it has to be read as in a looking-glass.',
    details: ['Spanish', 'The last lines are not set: the stick beside it holds the next words', 'A proof has been pulled and is gone'],
    uncertainties: ['The date it names is close.'],
    frameHint: { height: 0.28, radius: 0.34 },
    zoneId: PRESS,
    worldPlacement: { x: 3.85, z: -2.11, surface: 'cave', lift: 0.9, prop: 'none' },
    readable: {
      form: 'forme',
      pages: [{
        hand: 'mirror',
        language: 'Spanish',
        lines: [
          '# A LOS DESTERRADOS',
          '## DEL ASENTAMIENTO',
          'Cuando la luna no se vea, y la ballenera haga aguada en la Bahía del Correo, estad en la playa a la hora de la segunda guardia. No llevéis más que agua y lo que quepa en las manos.',
          'Once hombres. No uno más: el capitán no quiere otro.',
          'Quien hable de esto al Inglés del Gobernador',
          '[the line breaks off; the composing stick holds “NO VERÁ”]',
        ],
        translation: [
          '# TO THE EXILES',
          '## OF THE SETTLEMENT',
          'When the moon cannot be seen, and the whaler takes on water in Post Office Bay, be on the beach at the hour of the second watch. Bring nothing but water and what will fit in your hands.',
          'Eleven men. Not one more: the captain will not take another.',
          'Whoever speaks of this to the Governor’s Englishman',
          '[the line breaks off; the composing stick holds “WILL NOT SEE”]',
        ],
      }],
      gloss: 'Not a pamphlet: instructions. Eleven men taken off at Post Office Bay by a whaler, on a moonless night. "The Governor’s Englishman" is Mr. Lawson. The next new moon falls within the month.',
    },
  }),
  doc({
    typeId: 'cave_compositors_slip',
    name: 'Type Cases and Slip',
    subtitle: 'on the compositor’s frame',
    description: 'Two shallow cases of lead type on a sloping frame, capitals above and small letters below, each in its own box, with a composing stick across the lower case. Wedged into the frame above them is a slip listing the sorts that are short, in a small upright Catalan hand.',
    details: ['The box for W has never held anything', 'Some sorts are rough, cast here rather than bought', 'A printer’s working list'],
    frameHint: { height: 0.2, radius: 0.24 },
    zoneId: PRESS,
    worldPlacement: { x: -4.3, z: -2.12, surface: 'cave', lift: 0.95, prop: 'none' },
    readable: {
      form: 'slip',
      pages: [{
        hand: 'script',
        language: 'Catalan',
        lines: [
          'Falten:',
          'W — cap. Posar VV.',
          'K — cap. Posar C.',
          'Ñ — tres. No n’hi ha prou per al full castellà; posar NN.',
          'Ç — fosa malament, tornar a fondre amb el plom de les xarxes.',
          'Tinta: per a dos fulls més. Negre de fum i oli de balena.',
          'Paper: el dels llibres de bitàcola que porta en T.',
        ],
        translation: [
          'Short:',
          'W — none. Use VV.',
          'K — none. Use C.',
          'Ñ — three. Not enough for the Spanish sheet; use NN.',
          'Ç — badly cast; melt again with the lead from the nets.',
          'Ink: enough for two more sheets. Lampblack and whale oil.',
          'Paper: from the ship’s log-books T. brings.',
        ],
      }],
      gloss: 'He casts his own sorts from net weights and makes ink of lampblack and whale oil. And someone, "T.", brings him paper from a whaler’s log-books.',
    },
  }),
  doc({
    typeId: 'cave_gutted_logbook',
    name: 'Gutted Log-book',
    subtitle: 'by the paper trough',
    description: 'The paper is the press’s weakest point: rag stock from the settlement store, the endpapers of books, and this, the boards and a few remaining leaves of a ship’s log, the rest cut out at the stitching to be soaked in the trough. What is left is a whaler’s record, and one entry in a different hand.',
    details: ['A New Bedford whaler’s log', 'Most leaves cut away to be damped and printed on', 'The last entry is not in the mate’s hand'],
    frameHint: { height: 0.2, radius: 0.26 },
    zoneId: PRESS,
    worldPlacement: { x: 5.72, z: 1.9, surface: 'cave', lift: 0.66, prop: 'none' },
    readable: {
      form: 'book',
      pages: [
        {
          caption: 'Inside the board',
          hand: 'script',
          language: 'English',
          lines: [
            'Log of the Ship Sophronia of New Bedford',
            'Abner Coffin, Master',
            'Towards the Pacific Ocean, 1834',
          ],
        },
        {
          caption: 'A surviving leaf',
          hand: 'script',
          language: 'English',
          lines: [
            'Sat. 14th. Light airs from SE. Charles Island bearing NNW 4 leagues. Lowered for a school of sperm whale, no success.',
            'Sun. 15th. Came to in Post Office Bay. Sent boats for water and terrapin. Left 3 letters in the barrel and took 1.',
          ],
        },
        {
          caption: 'The last leaf, another hand',
          hand: 'script',
          language: 'English',
          lines: [
            'Recd of the printer 3 Reams spoilt paper for wadding, in exchange for the blank leaves of this book.',
            'Capt. C. says he will come back for water at the dark of the moon in October and will take ELEVEN, no more, and land them at Tumbez.',
            'He asks 40 dollars a head or the same in labour aboard.',
            '— T. W., cooper',
          ],
        },
      ],
      gloss: 'The Sophronia, Captain Coffin, and a cooper signing T. W. — the "T." of the compositor’s slip. The whaler comes back for water at the dark of the moon in October, and will carry eleven men to Tumbez on the coast of Peru, at forty dollars a head.',
    },
  }),
  doc({
    typeId: 'cave_bundle_chalk',
    name: 'Chalked Bundles',
    subtitle: 'stacked by the eastern crawl',
    description: 'Finished sheets folded and wrapped in oilcloth, tied with twine, the destinations chalked on the cloth.',
    details: ['Three destinations', 'Counts beside each, in strokes'],
    frameHint: { height: 0.5, radius: 0.6 },
    zoneId: PRESS,
    worldPlacement: { x: 8.3, z: 1.0, surface: 'cave', lift: 0.65, prop: 'none' },
    readable: {
      form: 'chalk',
      pages: [{
        hand: 'chalk',
        language: 'Spanish',
        lines: [
          'GUAYAQUIL — 200',
          'CALLAO — 150',
          'BOSTON — 60',
          'por el barril · con T.',
        ],
        translation: [
          'GUAYAQUIL — 200',
          'CALLAO — 150',
          'BOSTON — 60',
          'by the barrel · with T.',
        ],
      }],
      gloss: 'Four hundred sheets for the ports of the coast and for Boston, all to go "by the barrel". The press is not one angry man’s hobby; it is a correspondence.',
    },
  }),

  // ---- Gabriel's quarters --------------------------------------------------
  doc({
    typeId: 'cave_hide_map',
    name: 'Map on a Goat Hide',
    subtitle: 'pegged to the wall above the table',
    description: 'A map of the island’s south and west drawn in charcoal and ink on a scraped goat hide: hills hatched, springs circled, the settlement a square, a cross for this cave, and a small barrel at the bay. Dotted paths carry hours beside them.',
    details: ['The guards’ beats are marked with the hours they walk them', 'The cave is marked; the route to the bay avoids every dotted path', 'Written legend along the lower edge'],
    frameHint: { height: 0.8, radius: 0.6 },
    zoneId: QUARTERS,
    worldPlacement: { x: 1.0, z: -3.4, wall: { y: 1.55, dir: [0, -1] }, prop: 'none' },
    readable: {
      form: 'map',
      pages: [{
        caption: 'Legend, along the lower edge',
        hand: 'script',
        language: 'Catalan',
        lines: [
          '✚ — la cova',
          '□ — el presidi',
          '○ — fonts: la de dalt no s’asseca mai',
          '··· — rondes. A les 6 i a les 12 pel camí de la Badia; a les 18 només fins a la font.',
          'Després de les 18 ningú no surt del presidi. Lawson tanca la porta i beu.',
          'Camí dels porcs: dues hores fins al barril, sense passar per cap ronda.',
        ],
        translation: [
          '✚ — the cave',
          '□ — the settlement',
          '○ — springs: the upper one never dries',
          '··· — patrols. At 6 and at 12 along the Bay road; at 18 only as far as the spring.',
          'After 18 no one leaves the settlement. Lawson shuts the door and drinks.',
          'The pig track: two hours to the barrel, crossing no patrol.',
        ],
      }],
      gloss: 'A route from the settlement to the post barrel that misses every patrol, walked after six in the evening. It is not a map for living here. It is a map for leaving.',
    },
  }),
  doc({
    typeId: 'cave_tally_wall',
    name: 'Tally on the Rock',
    subtitle: 'scratched through the crust by the bed',
    description: 'Day-marks scratched in bundles of five through the dark crust of the wall, row after row, with notes scratched among them at intervals.',
    details: ['Begins in 1833', 'More than seven hundred marks', 'Notes in Catalan at a few of them'],
    frameHint: { height: 0.6, radius: 0.55 },
    zoneId: QUARTERS,
    worldPlacement: { x: -6.9, z: -1.6, wall: { y: 1.55, dir: [-0.55, -0.83] }, prop: 'none' },
    readable: {
      form: 'tally',
      pages: [{
        hand: 'scratched',
        language: 'Catalan',
        lines: [
          '1833 · dia 1 — desembarcat. Encadenat amb Ruiz.',
          'dia 54 — fugit.',
          'dia 61 — trobada la cova.',
          'dia 200 — primer full.',
          'dia 410 — en T. al barril.',
          'dia 612 — Ruiz ha vingut. Són onze.',
          'dia 734 — un vaixell anglès a la Badia. Un home que cull pedres i ocells.',
        ],
        translation: [
          '1833 · day 1 — landed. Chained with Ruiz.',
          'day 54 — escaped.',
          'day 61 — found the cave.',
          'day 200 — first sheet.',
          'day 410 — T. at the barrel.',
          'day 612 — Ruiz has come. They are eleven.',
          'day 734 — an English ship in the Bay. A man who gathers stones and birds.',
        ],
      }],
      gloss: 'Two years, counted a scratch at a time. Ruiz, his fellow in chains, is the second hand on the catechism. And the last note is about me.',
    },
  }),
  doc({
    typeId: 'cave_tied_letters',
    name: 'Letters Tied with Tape',
    subtitle: 'on the crate table',
    description: 'A packet of letters tied in red tape, much handled, some sea-stained. They came, by their folds, through the post barrel.',
    details: ['Three hands, two languages', 'One from Boston, one from Guayaquil, one scrawled on a scrap'],
    frameHint: { height: 0.18, radius: 0.22 },
    zoneId: QUARTERS,
    worldPlacement: { x: 2.69, z: -1.95, surface: 'cave', lift: 0.82, prop: 'none' },
    readable: {
      form: 'letter',
      pages: [
        {
          caption: 'From Boston',
          hand: 'script',
          language: 'English',
          lines: [
            'Boston, 3rd March 1834',
            'Friend Puig — Your sheets came by the Sophronia’s people and were read aloud at the Association. Some of us laughed at the VVs and then were ashamed of laughing.',
            'You ask whether there is a place for eleven men. There is work on the wharves at Tumbez, and a ship’s chandler there named Ortiz who will not ask where they came from.',
            'Do not come yourself. A man who prints is worth more where he is. — J. H.',
          ],
        },
        {
          caption: 'From Guayaquil',
          hand: 'script',
          language: 'Spanish',
          lines: [
            'Guayaquil, 20 de enero de 1835',
            'Gabriel: el Gobierno sabe que hay una imprenta en la isla. No sabe dónde. Villamil ha escrito a Lawson; le llama inútil.',
            'Se habla de mandar soldados en el próximo bergantín. Si has de hacer algo, hazlo antes.',
          ],
          translation: [
            'Guayaquil, 20 January 1835',
            'Gabriel: the Government knows there is a press on the island. It does not know where. Villamil has written to Lawson; he calls him useless.',
            'There is talk of sending soldiers on the next brig. If you mean to do something, do it before.',
          ],
        },
        {
          caption: 'A scrap, in pencil',
          hand: 'script',
          language: 'Spanish',
          lines: [
            'G. — los once están. Mateo tiene fiebre pero caminará. Ruiz',
          ],
          translation: [
            'G. — the eleven are ready. Mateo has a fever but he will walk. Ruiz',
          ],
        },
      ],
      gloss: 'Boston friends, a contact at Tumbez, and a warning from Guayaquil that soldiers may come on the next brig. Villamil’s letter to Lawson, calling him useless, is spoken of here as common knowledge.',
    },
  }),
  doc({
    typeId: 'cave_daybook',
    name: 'Open Daybook',
    subtitle: 'weighted open with a stone',
    description: 'A small bound book of blank leaves, kept as a daybook, held open with a stone. The hand is the same small upright Catalan as the compositor’s slip.',
    details: ['The latest entries', 'Written in Catalan', 'The ink of the last line is not quite dry'],
    frameHint: { height: 0.16, radius: 0.24 },
    zoneId: QUARTERS,
    worldPlacement: { x: 3.17, z: -2.05, surface: 'cave', lift: 0.81, prop: 'none' },
    readable: {
      form: 'journal',
      pages: [
        {
          caption: 'Left-hand page',
          hand: 'script',
          language: 'Catalan',
          lines: [
            'Al Presidi han penjat el full a la porta de l’església per escarni. L’han llegit tots abans que en Lawson el fes cremar. Millor que si l’hagués penjat jo.',
            'En Ruiz vol que diguem que la illa és de tots. Jo dic que de ningú: el que és de tots, el governador ho reparteix.',
          ],
          translation: [
            'At the Settlement they nailed the sheet to the church door in mockery. Everyone read it before Lawson had it burned. Better than if I had nailed it there myself.',
            'Ruiz wants us to say the island is everyone’s. I say no one’s: what is everyone’s, the governor shares out.',
          ],
        },
        {
          caption: 'Right-hand page',
          hand: 'script',
          language: 'Catalan',
          lines: [
            'L’anglès ha tornat avui. Ha seguit el camí fins a la font. Porta un martell, una caixa de llauna i un quadern. Escriu de tot, també de les tortugues.',
            'Si és home del Govern, ens ha trobat. Si és naturalista, és pitjor: ho escriurà en un llibre.',
            'La lluna és nova d’aquí a vint-i-dos dies.',
          ],
          translation: [
            'The Englishman came again today. He followed the track as far as the spring. He carries a hammer, a tin box and a notebook. He writes of everything, even the tortoises.',
            'If he is the Government’s man, he has found us. If he is a naturalist, it is worse: he will put it in a book.',
            'The moon is new in twenty-two days.',
          ],
        },
      ],
      gloss: 'He has been watching me as I have been watching finches. Twenty-two days to the new moon. Whatever I write in my own journal tonight, he has thought of it first.',
    },
  }),
  doc({
    typeId: 'cave_unsent_letter',
    name: 'Unsent Letter',
    subtitle: 'on the paper by the inkwell',
    description: 'A letter in Catalan, begun and rewritten on the top sheet of the writing paper, never folded or addressed.',
    details: ['To a sister in Barcelona', 'Crossed out and begun again', 'Never folded for sending'],
    frameHint: { height: 0.16, radius: 0.24 },
    zoneId: QUARTERS,
    worldPlacement: { x: 2.28, z: -2.04, surface: 'cave', lift: 0.8, prop: 'none' },
    readable: {
      form: 'letter',
      pages: [{
        hand: 'script',
        language: 'Catalan',
        lines: [
          'Estimada Montserrat,',
          '~Sóc viu.~ Encara sóc viu, que és més del que el rei volia.',
          'Visc en una cova com un ermità dels que la mare admirava. Tinc una premsa feta de fusta de naufragi i de la paciència que no vaig tenir mai al taller del pare.',
          'Si aquesta carta t’arriba és que algú ha cregut que una carta d’un home que no és ningú valia el viatge. Això ja és una revolució petita.',
          'No et puc dir on sóc. No et puc dir quan',
        ],
        translation: [
          'Dearest Montserrat,',
          '~I am alive.~ I am still alive, which is more than the King wished.',
          'I live in a cave like one of the hermits our mother admired. I have a press made of wreck timber and of the patience I never had in father’s shop.',
          'If this letter reaches you it is because someone thought a letter from a man who is no one was worth the voyage. That is already a small revolution.',
          'I cannot tell you where I am. I cannot tell you when',
        ],
      }],
      gloss: 'It stops mid-sentence. He has not decided whether he is going with them.',
    },
  }),
  doc({
    typeId: 'cave_owen_book',
    name: 'Book Left Face Down',
    subtitle: 'on the sleeping platform',
    description: 'A worn octavo left open and face down on the blankets: Robert Owen’s A New View of Society, the English edition, its margins full of pencil in two languages.',
    details: ['Robert Owen, A New View of Society', 'Annotated in Catalan and English', 'Brought, by its stamp, from a Boston bookseller'],
    frameHint: { height: 0.12, radius: 0.22 },
    zoneId: QUARTERS,
    worldPlacement: { x: -7.04, z: -0.69, surface: 'cave', lift: 0.53, prop: 'none' },
    readable: {
      form: 'book',
      pages: [
        {
          caption: 'The printed page, marked in pencil',
          hand: 'print',
          language: 'English',
          lines: [
            '“Any general character, from the best to the worst, from the most ignorant to the most enlightened, may be given to any community… by the application of proper means.”',
          ],
        },
        {
          caption: 'In the margin',
          hand: 'script',
          language: 'Catalan',
          lines: [
            'Sí. Però qui aplica els mitjans? Owen és amo d’una fàbrica.',
            'A New Lanark els obrers no van votar els mitjans.',
            'Aquí tampoc. Encara.',
          ],
          translation: [
            'Yes. But who applies the means? Owen owns a mill.',
            'At New Lanark the workers did not vote on the means.',
            'Nor here. Yet.',
          ],
        },
      ],
      gloss: 'Owen, who thinks character is made by circumstance. The printer agrees, and asks who is to make the circumstances. I know men in Cambridge who would not care to be asked that.',
    },
  }),

  // ---- The mouth -----------------------------------------------------------
  doc({
    typeId: 'cave_rules_board',
    name: 'Board on the Lantern Post',
    subtitle: 'nailed below the lamp',
    description: 'A short board nailed to the lantern staff at eye height, with a few lines burned into it with a hot iron, in Spanish so that more of those who come can read them.',
    details: ['Rules for visitors', 'The shell cord is an alarm'],
    frameHint: { height: 0.3, radius: 0.32 },
    zoneId: MOUTH,
    worldPlacement: { x: -0.1, z: -6.38, surface: 'cave', lift: 1.35, prop: 'board', rotationY: 0 },
    readable: {
      form: 'board',
      pages: [{
        hand: 'burned',
        language: 'Spanish',
        lines: [
          'QUIEN ENTRE:',
          'Si suenan las conchas, apaga la luz y no hables.',
          'No subas de día por el camino de los chanchos.',
          'El agua del barril es de todos. Llénalo si lo vacías.',
          'No digas mi nombre en el Asentamiento.',
        ],
        translation: [
          'WHOEVER COMES IN:',
          'If the shells ring, put out the light and do not speak.',
          'Do not come up the pig track by day.',
          'The water in the cask is everyone’s. Fill it if you empty it.',
          'Do not say my name in the Settlement.',
        ],
      }],
      gloss: 'Rules for guests. This is not a hermit’s cave; men come up from the settlement by night, and the cord of shells across the passage is there to warn them.',
    },
  }),

  // ---- The fern spring -----------------------------------------------------
  doc({
    typeId: 'cave_oilcloth_cache',
    name: 'Tin behind the Loose Block',
    subtitle: 'in the niche by the spring',
    description: 'Behind a loose block of the wall, a tobacco tin wrapped in oilcloth. Inside: a few Spanish dollars, a lock of dark hair tied with thread, and a folded list.',
    details: ['Kept apart from everything else in the cave', 'A list of names, and a sum on the back', 'The hair is not explained'],
    uncertainties: ['To read this is to know what Mr. Lawson would hang men for.'],
    frameHint: { height: 0.2, radius: 0.24 },
    zoneId: SPRING,
    worldPlacement: { x: -4.6, z: -3.8, wall: { y: 1.1, dir: [-0.78, -0.62] }, prop: 'none' },
    readable: {
      form: 'list',
      pages: [
        {
          caption: 'The list',
          hand: 'script',
          language: 'Spanish',
          lines: [
            'Ruiz, José — herrero',
            'Mateo Quishpe — leñador',
            'Domingo Cevallos — soldado (desertor)',
            'Juan y Pedro Villón — pescadores',
            'Tomás Anchundia — carpintero',
            'Andrés Chalén — vaquero',
            'Felipe Carchi — ~tiene mujer en el Asentamiento~ viene',
            'Ignacio Torres — sabe leer',
            'Rafael Moncayo — sabe leer',
            'Lucas Bajaña — cocinero',
          ],
          translation: [
            'Ruiz, José — smith',
            'Mateo Quishpe — woodcutter',
            'Domingo Cevallos — soldier (deserter)',
            'Juan and Pedro Villón — fishermen',
            'Tomás Anchundia — carpenter',
            'Andrés Chalén — cowherd',
            'Felipe Carchi — ~has a woman at the Settlement~ is coming',
            'Ignacio Torres — can read',
            'Rafael Moncayo — can read',
            'Lucas Bajaña — cook',
          ],
        },
        {
          caption: 'On the back',
          hand: 'script',
          language: 'Catalan',
          lines: [
            'Onze. 440 pesos, o la feina a bord.',
            'Tenim 212.',
            'La resta, en feina. Coffin diu que sí.',
            'Jo no compto.',
          ],
          translation: [
            'Eleven. 440 pesos, or work aboard.',
            'We have 212.',
            'The rest in labour. Coffin says yes.',
            'I am not counted.',
          ],
        },
      ],
      gloss: 'Eleven convicts by name and trade, and the passage money short by half. "I am not counted": the printer means to stay behind with his press. Mr. Lawson would give a good deal for this paper. So, I think, would the eleven.',
    },
  }),
];
