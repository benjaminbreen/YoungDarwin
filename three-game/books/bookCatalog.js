export const BOOK_CATALOG = {
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
