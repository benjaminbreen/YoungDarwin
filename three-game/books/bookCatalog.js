export const BOOK_CATALOG = {
  'lawson-juan-ulloa': {
    id: 'lawson-juan-ulloa',
    railLabel: 'JU',
    shortTitle: 'Relación histórica',
    title: 'Relación histórica del viage a la América Meridional',
    author: 'Jorge Juan and Antonio de Ulloa',
    // Replaced a modern Word-processor transcription (Times New Roman, no scan
    // at all) with the actual Madrid printing at 400 ppi.
    edition: 'Primera parte, tomo segundo, Antonio Marín, Madrid, 1748',
    provenance: 'Historically plausible Spanish scientific and administrative reference for Lawson; not a documented personal possession.',
    sourceLanguage: 'Spanish',
    pdfPath: '/assets/books/juan-ulloa-relacion-historica-tomo-2-1748.pdf',
    sourceUrl: 'https://archive.org/details/relacionhistoric14ullo_0',
    cover: '#4e3d28',
    coverAccent: '#d7bd78',
    startPage: 12,
  },
  'humboldt-personal-narrative': {
    id: 'humboldt-personal-narrative',
    railLabel: 'AH',
    shortTitle: 'Personal Narrative',
    title: 'Personal Narrative of Travels to the Equinoctial Regions',
    author: 'Alexander von Humboldt and Aime Bonpland',
    // The previous file was a British Library scan re-encoded through
    // Ghostscript down to 72 ppi — 316 pixels across a five-inch page, and
    // unreadable at any zoom. This is the same translation at 300 ppi.
    edition: 'Volume I, English translation by Helen Maria Williams, Longman, London, 1814',
    provenance: "Henslow's departure gift to Darwin",
    sourceLanguage: 'English',
    pdfPath: '/assets/books/humboldt-personal-narrative-vol-1-1814.pdf',
    sourceUrl: 'https://archive.org/details/personalnarrati1humba',
    cover: '#31584f',
    coverAccent: '#d7bd78',
    startPage: 75,
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
