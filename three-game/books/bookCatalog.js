export const BOOK_CATALOG = {
  'lawson-juan-ulloa': {
    id: 'lawson-juan-ulloa',
    railLabel: 'JU',
    shortTitle: 'Viaje a América',
    title: 'Relación histórica del viaje a la América Meridional',
    author: 'Jorge Juan and Antonio de Ulloa',
    edition: 'Madrid, 1748',
    provenance: 'Historically plausible Spanish scientific and administrative reference for Lawson; not a documented personal possession.',
    sourceLanguage: 'Spanish',
    pdfPath: '/assets/books/juan-ulloa-viaje-america-meridional-1748.pdf',
    sourceUrl: 'https://ocw.uca.es/pluginfile.php/448/mod_resource/content/1/Relacion_del_viaje_de_Jorge_juan.pdf',
    cover: '#4e3d28',
    coverAccent: '#d7bd78',
    startPage: 9,
  },
  'humboldt-personal-narrative': {
    id: 'humboldt-personal-narrative',
    railLabel: 'AH',
    shortTitle: 'Personal Narrative',
    title: 'Personal Narrative of Travels to the Equinoctial Regions',
    author: 'Alexander von Humboldt and Aime Bonpland',
    edition: 'Volumes I-II, English translation by Helen Maria Williams, 1814',
    provenance: "Henslow's departure gift to Darwin",
    sourceLanguage: 'English',
    pdfPath: '/assets/books/humboldt-personal-narrative-vols-1-2-1814.pdf',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Alexander_von_Humboldt_-_Personal_Narrative_of_Travels_to_the_Equinoctial_Regions_-_tr._Helen_Maria_Williams_-_Vols._1-2_(1814).pdf',
    cover: '#31584f',
    coverAccent: '#d7bd78',
    startPage: 9,
  },
  'lyell-principles-vol1': {
    id: 'lyell-principles-vol1',
    railLabel: 'CL',
    shortTitle: 'Principles of Geology',
    title: 'Principles of Geology, Volume I',
    author: 'Charles Lyell',
    edition: 'First edition, John Murray, London, 1830',
    provenance: "FitzRoy's gift to Darwin",
    sourceLanguage: 'English',
    pdfPath: '/assets/books/lyell-principles-of-geology-vol-1-1830.pdf',
    sourceUrl: 'https://library.si.edu/digital-library/book/principlesgeolovol1lyel',
    cover: '#6a342a',
    coverAccent: '#d7bd78',
    startPage: 7,
  },
  'herschel-preliminary-discourse': {
    id: 'herschel-preliminary-discourse',
    railLabel: 'JH',
    shortTitle: 'Preliminary Discourse',
    title: 'A Preliminary Discourse on the Study of Natural Philosophy',
    author: 'John F. W. Herschel',
    edition: 'First edition, Longman and John Taylor, London, 1831',
    provenance: 'Documented reading in the Beagle library and an important methodological influence.',
    sourceLanguage: 'English',
    pdfPath: '/assets/books/herschel-preliminary-discourse-1831.pdf',
    sourceUrl: 'https://archive.org/details/preliminarydisco00hers_0',
    cover: '#4d596d',
    coverAccent: '#d7bd78',
    startPage: 15,
  },
};

export function getReadableBook(bookId) {
  return BOOK_CATALOG[bookId] || null;
}

export function getReadableBooks() {
  return Object.values(BOOK_CATALOG);
}
