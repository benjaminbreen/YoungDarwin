export const BOOK_CATALOG = {
  'lawson-bowditch-navigator': {
    id: 'lawson-bowditch-navigator',
    shortTitle: 'Practical Navigator',
    title: 'The New American Practical Navigator',
    author: 'Nathaniel Bowditch',
    edition: 'E. & G. W. Blunt edition, New York, 1826',
    provenance: 'Historically plausible maritime reference for Lawson; not a documented personal possession.',
    pdfPath: '/assets/books/bowditch-practical-navigator-1826.pdf',
    sourceUrl: 'https://books.google.com/books?id=uGNGAAAAYAAJ',
    cover: '#243d4d',
    coverAccent: '#d7bd78',
    startPage: 9,
  },
  'lawson-dampier-voyage': {
    id: 'lawson-dampier-voyage',
    shortTitle: 'A New Voyage',
    title: 'A New Voyage Round the World',
    author: 'William Dampier',
    edition: 'Volume I, London, 1703',
    provenance: 'Historically plausible Pacific reference for Lawson; not a documented personal possession.',
    pdfPath: '/assets/books/dampier-new-voyage-round-world-1703.pdf',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:A_new_voyage_round_the_world._-_Describing_particularly,_the_isthmus_of_America,_several_coasts_and_islands_in_the_West_Indies,_the_Isles_of_Cape_Verd,_the_passage_by_Terra_del_Fuego_(IA_newvoyageroundwo01damp).pdf',
    cover: '#573a24',
    coverAccent: '#d7bd78',
    startPage: 7,
  },
  'lawson-juan-ulloa': {
    id: 'lawson-juan-ulloa',
    shortTitle: 'Viaje a América',
    title: 'Relación histórica del viaje a la América Meridional',
    author: 'Jorge Juan and Antonio de Ulloa',
    edition: 'Madrid, 1748',
    provenance: 'Historically plausible Spanish scientific and administrative reference for Lawson; not a documented personal possession.',
    pdfPath: '/assets/books/juan-ulloa-viaje-america-meridional-1748.pdf',
    sourceUrl: 'https://ocw.uca.es/pluginfile.php/448/mod_resource/content/1/Relacion_del_viaje_de_Jorge_juan.pdf',
    cover: '#4e3d28',
    coverAccent: '#d7bd78',
    startPage: 9,
  },
  'humboldt-personal-narrative': {
    id: 'humboldt-personal-narrative',
    shortTitle: 'Personal Narrative',
    title: 'Personal Narrative of Travels to the Equinoctial Regions',
    author: 'Alexander von Humboldt and Aime Bonpland',
    edition: 'Volumes I-II, English translation by Helen Maria Williams, 1814',
    provenance: "Henslow's departure gift to Darwin",
    pdfPath: '/assets/books/humboldt-personal-narrative-vols-1-2-1814.pdf',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Alexander_von_Humboldt_-_Personal_Narrative_of_Travels_to_the_Equinoctial_Regions_-_tr._Helen_Maria_Williams_-_Vols._1-2_(1814).pdf',
    cover: '#31584f',
    coverAccent: '#d7bd78',
    startPage: 9,
  },
  'lyell-principles-vol1': {
    id: 'lyell-principles-vol1',
    shortTitle: 'Principles of Geology',
    title: 'Principles of Geology, Volume I',
    author: 'Charles Lyell',
    edition: 'First edition, John Murray, London, 1830',
    provenance: "FitzRoy's gift to Darwin",
    pdfPath: '/assets/books/lyell-principles-of-geology-vol-1-1830.pdf',
    sourceUrl: 'https://library.si.edu/digital-library/book/principlesgeolovol1lyel',
    cover: '#6a342a',
    coverAccent: '#d7bd78',
    startPage: 7,
  },
};

export function getReadableBook(bookId) {
  return BOOK_CATALOG[bookId] || null;
}

export function getReadableBooks() {
  return Object.values(BOOK_CATALOG);
}
