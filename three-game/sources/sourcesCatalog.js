// Bibliography, provenance, and methods disclosure for the Sources page.
//
// This file is content, not runtime logic: nothing here is read by the
// simulation. Edit entries freely. The one live coupling is the readable-book
// section, which is derived from `three-game/books/bookCatalog.js` so the shelf
// the player can actually pick up and the shelf cited here cannot drift apart.
//
// DRAFT NOTICE: citation details below were assembled from standard scholarship
// and have not been checked against the physical volumes. Verify page ranges,
// editions, and publishers before this page is cited anywhere that matters.

import { getReadableBooks } from '../books/bookCatalog';

export const SOURCES_PAGE = {
  title: 'Sources & Further Reading',
  subtitle: 'Young Darwin — Floreana / Charles Island, September 1835',
  standfirst:
    'This game is an argument made out of evidence, and the evidence is listed here. What follows is the reading behind the island, an account of what is documented and what is reconstructed, an explanation of its authored prose and source retrieval, and a note for instructors.',
};

// ---------------------------------------------------------------------------
// In-game library
// ---------------------------------------------------------------------------

export const IN_GAME_LIBRARY = {
  heading: 'Books You Can Read in the Game',
  blurb: 'Four scanned historical books can be read and searched in the Library.',
  // Derived so the cited shelf and the playable shelf stay identical.
  entries: getReadableBooks().map(book => ({
    id: book.id,
    author: book.author,
    title: book.title,
    edition: book.edition,
    provenance: book.provenance,
    sourceUrl: book.sourceUrl,
  })),
};

// ---------------------------------------------------------------------------
// Annotated bibliography
// ---------------------------------------------------------------------------

export const READING_SECTIONS = [
  {
    id: 'darwin-primary',
    heading: 'Darwin in His Own Hand',
    blurb:
      'The Galápagos Darwin of 1835 is not the Darwin of 1859. These are the documents in which he is still a young collector who has not yet understood what he is holding.',
    entries: [
      {
        citation:
          'Keynes, Richard Darwin, ed. <i>Charles Darwin\'s Beagle Diary</i>. Cambridge: Cambridge University Press, 1988.',
        note: 'The day-by-day field diary, including the Galápagos weeks. The primary source for the game\'s calendar, weather, fatigue, and the texture of a shore day.',
      },
      {
        citation:
          'Darwin, Charles. <i>Journal of Researches into the Geology and Natural History of the Various Countries Visited by H.M.S. Beagle</i>. London: Henry Colburn, 1839.',
        note: 'The published voyage narrative, written and revised after the fact. Reading it against the Diary is the single clearest lesson in how field notes become an argument.',
      },
      {
        citation:
          'Keynes, Richard Darwin, ed. <i>Charles Darwin\'s Zoology Notes &amp; Specimen Lists from H.M.S. Beagle</i>. Cambridge: Cambridge University Press, 2000.',
        note: 'The specimen ledger. The model for the game\'s collection system, including its tedium and its gaps.',
      },
      {
        citation:
          'Barlow, Nora, ed. "Darwin\'s Ornithological Notes." <i>Bulletin of the British Museum (Natural History), Historical Series</i> 2, no. 7 (1963): 201–278.',
        note: 'Where the mockingbirds — not the finches — first unsettle him.',
      },
      {
        citation:
          'Chancellor, Gordon, and John van Wyhe, eds. <i>Charles Darwin\'s Notebooks from the Voyage of the Beagle</i>. Cambridge: Cambridge University Press, 2009.',
        note: 'The pocket field notebooks, written standing up and in the wet. The physical form of these notebooks shaped the game\'s journal.',
      },
      {
        citation:
          'Burkhardt, Frederick, et al., eds. <i>The Correspondence of Charles Darwin</i>, vol. 1: 1821–1836. Cambridge: Cambridge University Press, 1985.',
        note: 'Letters to and from Henslow, the family, and the ship. Evidence of how slowly information moved and how long Darwin worked without an answer.',
      },
      {
        citation:
          'Barlow, Nora, ed. <i>The Autobiography of Charles Darwin, 1809–1882</i>. London: Collins, 1958.',
        note: 'Late, retrospective, and unreliable in exactly the ways worth teaching.',
      },
    ],
  },
  {
    id: 'voyage-primary',
    heading: 'The Voyage, the Ship, and the Islands Before Darwin',
    blurb:
      'Darwin arrived at an archipelago that had already been surveyed, provisioned, hunted, and colonized. These are the accounts he arrived after.',
    entries: [
      {
        citation:
          'FitzRoy, Robert. <i>Narrative of the Surveying Voyages of His Majesty\'s Ships Adventure and Beagle</i>, vol. 2. London: Henry Colburn, 1839.',
        note: 'The captain\'s parallel account. FitzRoy\'s Galápagos is a hydrographic and moral problem, not a biological one — the friction the game gives him.',
      },
      {
        citation:
          'Covington, Syms. <i>Journal</i>. Manuscript, c. 1831–1836. Transcription available via Darwin Online.',
        note: 'The voyage seen from below decks by the man who did much of the actual killing, skinning, and labelling. Excerpted directly in the game\'s characterization of Covington.',
      },
      {
        citation:
          'Colnett, James. <i>A Voyage to the South Atlantic and Round Cape Horn into the Pacific Ocean</i>. London: W. Bennett, 1798.',
        note: 'The survey that opened the Galápagos to British whaling. The Post Office Bay barrel belongs to this world, not to Darwin\'s.',
      },
      {
        citation:
          'Porter, David. <i>Journal of a Cruise Made to the Pacific Ocean … in the United States Frigate Essex</i>. Philadelphia: Bradford and Inskeep, 1815.',
        note: 'The source for Patrick Watkins, the Irish castaway of Floreana, and for the scale of tortoise harvesting. The game\'s Watkins Camp descends from this text.',
      },
      {
        citation:
          'Melville, Herman. "The Encantadas, or Enchanted Isles." <i>Putnam\'s Monthly Magazine</i>, March–May 1854.',
        note: 'Not evidence, but the literary afterlife of Porter — and the reason Floreana\'s castaways are remembered as fable. Useful for teaching the difference.',
      },
    ],
  },
  {
    id: 'floreana',
    heading: 'Floreana, Settlement, and Ecological Change',
    blurb:
      'The island in this game is a colony with a prison on it, three years old and already failing, sitting on an ecology being dismantled in real time.',
    entries: [
      {
        citation: 'Larson, Edward J. <i>Evolution\'s Workshop: God and Science on the Galápagos Islands</i>. New York: Basic Books, 2001.',
        note: 'The best single history of the archipelago as a site of scientific work. Start here.',
      },
      {
        citation:
          'Steadman, David W. "Holocene Vertebrate Fossils from Isla Floreana, Galápagos." <i>Smithsonian Contributions to Zoology</i> 413 (1986).',
        note: 'What lived on Floreana before people did. The baseline against which 1835 is already a depleted landscape.',
      },
      {
        citation: 'Latorre, Octavio. <i>La maldición de la tortuga: historias trágicas de las Islas Galápagos</i>. Quito, 1990.',
        note: 'Ecuadorian settlement history, including Villamil\'s colony and the penal regime. An essential corrective to Anglophone accounts of the islands.',
      },
      {
        citation: 'Nicholls, Henry. <i>The Galápagos: A Natural History</i>. New York: Basic Books, 2014.',
        note: 'Accessible synthesis of the archipelago\'s biology and its introduced-species crisis.',
      },
      {
        citation: 'Treherne, John. <i>The Galapagos Affair</i>. London: Jonathan Cape, 1983.',
        note: 'A century later than the game, but the classic account of what happens to people who try to settle Floreana.',
      },
      {
        citation:
          'Grant, Peter R., and B. Rosemary Grant. <i>How and Why Species Multiply: The Radiation of Darwin\'s Finches</i>. Princeton: Princeton University Press, 2008.',
        note: 'What was actually going on with the finches, established a century and a half after Darwin failed to label them by island.',
      },
      {
        citation: 'Weiner, Jonathan. <i>The Beak of the Finch</i>. New York: Knopf, 1994.',
        note: 'The Grants\' fieldwork as narrative. Pairs well with the game for showing what sustained observation costs.',
      },
    ],
  },
  {
    id: 'darwin-scholarship',
    heading: 'Darwin Scholarship',
    blurb:
      'On what Darwin actually understood in 1835, and on the long process by which the Galápagos became the origin story it is now.',
    entries: [
      {
        citation: 'Browne, Janet. <i>Charles Darwin: Voyaging</i>. Princeton: Princeton University Press, 1995.',
        note: 'The definitive biography of the young Darwin. The single most important secondary source behind this game.',
      },
      {
        citation:
          'Sulloway, Frank J. "Darwin and His Finches: The Evolution of a Legend." <i>Journal of the History of Biology</i> 15, no. 1 (1982): 1–53.',
        note: 'Demolishes the eureka narrative. Darwin did not label his finches by island and had to reconstruct the data later from Covington\'s and FitzRoy\'s collections. The game\'s insistence that collection is fallible labor comes from here.',
      },
      {
        citation:
          'Sulloway, Frank J. "Darwin\'s Conversion: The Beagle Voyage and Its Aftermath." <i>Journal of the History of Biology</i> 15, no. 3 (1982): 325–396.',
        note: 'When and how Darwin actually changed his mind — years after the islands, in London.',
      },
      {
        citation: 'Herbert, Sandra. <i>Charles Darwin, Geologist</i>. Ithaca: Cornell University Press, 2005.',
        note: 'A reminder that in 1835 Darwin was primarily a geologist, and read the Galápagos as a volcanic problem first.',
      },
      {
        citation:
          'Keynes, Richard. <i>Fossils, Finches and Fuegians: Darwin\'s Adventures and Discoveries on the Beagle</i>. Oxford: Oxford University Press, 2003.',
        note: 'Voyage narrative by the editor of the Diary and Zoology Notes.',
      },
    ],
  },
  {
    id: 'field-practice',
    heading: 'How Field Science Was Actually Done',
    blurb:
      'The game treats naturalism as a craft with tools, costs, and bodily limits. This is the scholarship that makes that case.',
    entries: [
      {
        citation:
          'Larsen, Anne. "Equipment for the Field." In <i>Cultures of Natural History</i>, edited by N. Jardine, J. A. Secord, and E. C. Spary, 358–377. Cambridge: Cambridge University Press, 1996.',
        note: 'Nets, jars, guns, presses, spirit casks. The direct ancestor of the game\'s tool belt.',
      },
      {
        citation:
          'Nyhart, Lynn K. "Natural History and the \'New\' Biology." In <i>Cultures of Natural History</i>, 426–443. Cambridge: Cambridge University Press, 1996.',
        note: 'How the discipline Darwin trained in became something else.',
      },
      {
        citation: 'Endersby, Jim. <i>Imperial Nature: Joseph Hooker and the Practices of Victorian Science</i>. Chicago: University of Chicago Press, 2008.',
        note: 'The best account of Victorian botanical practice as labor, correspondence, and logistics rather than genius.',
      },
      {
        citation:
          'Sloan, Phillip. "The Gaze of Natural History." In <i>Inventing Human Science</i>, edited by Christopher Fox, Roy Porter, and Robert Wokler. Berkeley: University of California Press, 1995.',
        note: 'On observation as a trained and historically specific act — the premise of the game\'s examine mechanic.',
      },
      {
        citation: 'Secord, James A. <i>Victorian Sensation</i>. Chicago: University of Chicago Press, 2000.',
        note: 'On how evolutionary ideas circulated before and around Darwin.',
      },
      {
        citation: 'Livingstone, David N. <i>Putting Science in Its Place: Geographies of Scientific Knowledge</i>. Chicago: University of Chicago Press, 2003.',
        note: 'Why it matters that knowledge is made somewhere specific. The theoretical case for building a game about one island.',
      },
    ],
  },
  {
    id: 'empire',
    heading: 'Science, Empire, and Labor',
    blurb:
      'Darwin travelled on a naval survey vessel, in a world of convicts, indentured servants, and conscripted sailors. The game does not treat that as backdrop.',
    entries: [
      {
        citation: 'Sivasundaram, Sujit. <i>Nature and the Godly Empire: Science and Evangelical Mission in the Pacific, 1795–1850</i>. Cambridge: Cambridge University Press, 2005.',
        note: 'The Pacific world Darwin was moving through, and the missionary-scientific project he was part of.',
      },
      {
        citation: 'Schiebinger, Londa. <i>Plants and Empire: Colonial Bioprospecting in the Atlantic World</i>. Cambridge, MA: Harvard University Press, 2004.',
        note: 'On whose botanical knowledge gets recorded and whose is discarded — the argument behind María\'s role in the game.',
      },
      {
        citation: 'Safier, Neil. <i>Measuring the New World: Enlightenment Science and South America</i>. Chicago: University of Chicago Press, 2008.',
        note: 'The Spanish American scientific world that produced Juan and Ulloa, and that the British survey inherited.',
      },
      {
        citation: 'Fan, Fa-ti. <i>British Naturalists in Qing China: Science, Empire, and Cultural Encounter</i>. Cambridge, MA: Harvard University Press, 2004.',
        note: 'Naturalists as guests, intruders, and dependents on local knowledge.',
      },
      {
        citation: 'Jaffer, Aaron. <i>Lascars and Indian Ocean Seafaring, 1780–1860</i>. Woodbridge: Boydell &amp; Brewer, 2015.',
        note: 'The conditions of South Asian sailors in British service. Background for the game\'s composite character Yusuf bin Abdul Rahim.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Archives
// ---------------------------------------------------------------------------

export const ARCHIVES = {
  heading: 'Open Archives',
  blurb: 'Everything below is free, complete, and citable. Students can check the game against the record themselves.',
  entries: [
    {
      label: 'Darwin Online',
      url: 'https://darwin-online.org.uk/',
      note: 'Complete published works, manuscripts, field notebooks, and Covington\'s journal. Edited by John van Wyhe.',
    },
    {
      label: 'Darwin Correspondence Project',
      url: 'https://www.darwinproject.ac.uk/',
      note: 'Every surviving letter, annotated and searchable.',
    },
    {
      label: 'Natural History Museum — Darwin Manuscripts',
      url: 'https://www.nhm.ac.uk/our-science/departments-and-staff/library-and-archives/digital-collections/darwin-manuscripts.html',
      note: 'High-resolution scans of the scientific manuscripts.',
    },
    {
      label: 'Charles Darwin Foundation',
      url: 'https://www.darwinfoundation.org/',
      note: 'Current research and conservation in the Galápagos, including the Floreana restoration programme.',
    },
    {
      label: 'Biodiversity Heritage Library',
      url: 'https://www.biodiversitylibrary.org/',
      note: 'Digitized natural history literature, including most nineteenth-century voyage narratives.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Documented vs. reconstructed vs. invented
// ---------------------------------------------------------------------------

export const HISTORICAL_RECORD = {
  heading: 'What Is Documented, What Is Reconstructed, What Is Invented',
  blurb:
    'A historical simulation that will not say where the evidence stops is not doing history. The distinction below is the same one the game makes internally: every readable book in the world carries a provenance line for exactly this reason.',
  columns: [
    {
      id: 'documented',
      label: 'Documented',
      caption: 'Attested in the primary record.',
      items: [
        'HMS <i>Beagle</i> surveyed the Galápagos in September and October 1835. Darwin was ashore on Charles Island for several days in the last week of September.',
        'Nicolás Lawson — born Nicolai Olaus Lossius — was vice-governor of the archipelago and met Darwin and FitzRoy. His claim that he could identify a tortoise\'s island from its shell is recorded by Darwin himself, who admits he "did not for some time pay sufficient attention to this statement."',
        'Syms Covington, aged nineteen, served as Darwin\'s assistant and did much of the shooting, skinning, and preserving. He kept his own journal.',
        'Robert FitzRoy commanded the <i>Beagle</i> and gave Darwin the first volume of Lyell\'s <i>Principles of Geology</i>. Henslow gave him Humboldt\'s <i>Personal Narrative</i>.',
        'The Ecuadorian penal settlement on Floreana was founded in 1832 under José de Villamil and was already deteriorating by 1835.',
        'The Post Office Bay barrel predates Darwin by decades and belongs to the whaling trade.',
        'Patrick Watkins, an Irish castaway, lived alone on Floreana around 1807–1809 and is described in David Porter\'s journal.',
        'The Floreana mockingbird (<i>Mimus trifasciatus</i>), which Darwin collected here, no longer survives on Floreana itself.',
      ],
    },
    {
      id: 'reconstructed',
      label: 'Reconstructed',
      caption: 'Built from evidence, but not directly attested.',
      items: [
        'The island\'s traversable geography. Real place names — Post Office Bay, Punta Cormorant, Devil\'s Crown, Black Beach, Cerro Pajas, Asilo de la Paz, Watkins — sit in a landscape compressed and simplified for play. Distances are not survey-accurate.',
        'Lawson\'s copy of Juan and Ulloa is a plausible holding for a man in his position, not a documented personal possession, and says so when opened.',
        'The interiors of the Lawson house, the penal settlement, and the <i>Beagle</i>\'s cabin and deck, built from period plans and conventions rather than from surviving drawings of these specific rooms.',
        'Weather, tides, light, and the movement of sun, moon, and stars, modelled for the correct latitude and date but not drawn from a log.',
        'Species distributions and animal behavior, drawn from modern Galápagos ecology and back-dated to a pre-collapse baseline.',
      ],
    },
    {
      id: 'invented',
      label: 'Invented',
      caption: 'Fiction, offered as fiction.',
      items: [
        'María de la Concepción, the Kichwa-descended cook and herbalist, is invented. The historical conditions she represents — indentured Andean labor in the colony, unrecorded botanical expertise — are not.',
        'Gabriel Puig i Ferrer, the escaped Catalan printer, is invented. Political exiles were genuinely deported to the colony.',
        'Yusuf bin Abdul Rahim, called "Lascar Joe," is invented, and the <i>Beagle</i>\'s documented crew list does not include him. Lascars were widespread in British maritime service; this ship is the wrong place to meet one, and the character is a deliberate composite.',
        'All spoken dialogue. No line any character speaks is a quotation unless it is explicitly marked as one in the journal.',
        'The finch and tortoise modes. These are an interpretive device for making the island legible through another body, not a claim about animal cognition.',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Authored text and source retrieval
// ---------------------------------------------------------------------------

export const METHODS_NOTE = {
  heading: 'A Note on Authored Text and Source Retrieval',
  paragraphs: [
    'The public game does not ask a language model to write historical narration, character dialogue, specimen observations, or the expedition assessment. Those surfaces use authored prose, authored choices, and deterministic game rules.',
    'The Library searches OCR transcriptions of four historical books associated with Darwin\'s intellectual world in 1835. Search results are verbatim passages from those transcriptions. Selecting one opens the corresponding original scanned page and draws a temporary navigation overlay over the OCR lines; the overlay is not part of the historical page.',
    'The first release uses local lexical retrieval and makes no model request. A later optional semantic search may use an embedding model to rank passages, but embeddings may retrieve only: they may not answer, summarize, translate, or interpret a source. Private development experiments with generated prose require explicit flags and are not the public runtime.',
  ],
  caution: {
    heading: 'How to read the Library',
    body:
      'A retrieved passage is a primary-source artifact, not an answer supplied by the game. The link between a scene and a passage is an editorial invitation to compare them, not a claim that the source explains the scene. OCR is imperfect, especially around damaged type and line endings; verify important wording against the displayed scan and cite the source edition rather than the game interface.',
  },
};

// ---------------------------------------------------------------------------
// Classroom
// ---------------------------------------------------------------------------

export const CLASSROOM_NOTE = {
  heading: 'For Instructors',
  paragraphs: [
    'This is a game, not courseware. It contains no quizzes, no lecture modules, and no assessment that reports to anyone. It makes an argument — that field science is embodied, local, uncertain, and ecologically entangled — by making you do it badly at first.',
    'What it produces for a classroom is experience rather than content: a student who has spent an hour failing to label specimens properly, or watching an island\'s ecology thin out around them, or trying to talk to a woman who will not answer in English, has something specific to argue about. The journal each expedition generates is a concrete artifact that can be read, compared between students, and set against Darwin\'s own field notes.',
    'It pairs most naturally with Sulloway on the finch legend and Browne on the young Darwin. Curriculum materials, assignments, and assessment guidance are in development and will be published alongside the game rather than inside it.',
  ],
};

// ---------------------------------------------------------------------------
// Colophon
// ---------------------------------------------------------------------------

export const COLOPHON = {
  heading: 'Colophon',
  lines: [
    'Young Darwin is created by Benjamin Breen, Associate Professor of History at the University of California, Santa Cruz, in association with Pranav Anand and Zac Zimmer.',
    'It is part of the HistoryLens project and an early prototype of work continuing under the THINK (Technology + Humanities Integrated Knowledge) initiative at UC Santa Cruz, supported by a National Endowment for the Humanities Humanities Initiatives grant.',
    'Original code and project materials are released under the MIT License. Third-party assets and dependencies remain under their own terms.',
  ],
  links: [
    { label: 'benjaminpbreen.com', url: 'https://benjaminpbreen.com' },
    { label: 'HistoryLens', url: 'https://historylens.org' },
    { label: 'UC Santa Cruz', url: 'https://ucsc.edu' },
  ],
};
