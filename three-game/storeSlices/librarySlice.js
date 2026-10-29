// Library shelves, readable books and reading notes.
// Spread into useThreeGameStore in three-game/store.js.

import { cameraFocusPoint } from '../camera/focusPoint';
import { getReadableBook, getReadableBooks } from '../books/bookCatalog';
import { getThreeIslandLocation } from '../data';

export const createLibraryActions = (set, get) => ({
  openLibrary: (options = {}) => set(state => {
    const requestedBookId = options.bookId || state.readableBookSession?.bookId;
    const book = getReadableBook(requestedBookId) || getReadableBooks()[0];
    if (!book) return {};
    const firstConsultation = !state.consultedBookIds.includes(book.id);
    return {
      readableBookSession: {
        bookId: book.id,
        pdfPage: Number.isFinite(Number(options.pdfPage)) ? Math.max(1, Math.round(Number(options.pdfPage))) : null,
        passageId: options.passageId || null,
        termId: options.termId || null,
        query: options.query || '',
        resultIds: Array.isArray(options.resultIds) ? options.resultIds : [],
        drawerOpen: options.drawerOpen !== false,
        focus: cameraFocusPoint(options.focus),
        // Why the library opened, kept separate from where the camera looks.
        focusIntent: typeof options.focus === 'string' ? options.focus : (options.focusIntent || null),
        openedAt: Date.now(),
      },
      consultedBookIds: firstConsultation
        ? [...state.consultedBookIds, book.id]
        : state.consultedBookIds,
      inspectedObject: null,
      inspectedScreenPosition: null,
    };
  }),
  openReadableBook: (bookId, options = {}) => {
    get().openLibrary({ ...options, bookId, drawerOpen: options.drawerOpen ?? false });
  },
  updateLibrarySession: updates => set(state => (
    state.readableBookSession
      ? { readableBookSession: { ...state.readableBookSession, ...(updates || {}) } }
      : {}
  )),
  closeReadableBook: () => set({ readableBookSession: null }),
  setReadableBookPage: (bookId, page) => set(state => ({
    bookLastPages: {
      ...state.bookLastPages,
      [bookId]: Math.max(1, Math.round(Number(page) || 1)),
    },
  })),
  saveReadableBookNote: ({ bookId, page, content, printedPage = null, citation = null }) => set(state => {
    const book = getReadableBook(bookId);
    const trimmed = String(content || '').trim();
    if (!book || !trimmed) return {};
    const location = getThreeIslandLocation(state.currentZoneId);
    const pageNumber = Math.max(1, Math.round(Number(page) || 1));
    // The scan number and the printed number differ by the front matter, so a
    // note titled with the scan misfiles the citation the player would quote.
    const pageLabel = printedPage ? `p. ${printedPage}` : `scan p. ${pageNumber}`;
    return {
      journal: [...state.journal, {
        id: `${Date.now()}-reading-${book.id}-${pageNumber}`,
        day: state.day,
        timeOfDay: state.timeOfDay,
        location: location.name,
        method: 'reading and comparison',
        kind: 'reading',
        authorship: 'player',
        title: `${book.shortTitle}, ${pageLabel}`,
        content: trimmed,
        source: {
          type: 'book',
          bookId: book.id,
          page: pageNumber,
          printedPage: printedPage || null,
          citation: citation || `${book.author}, ${book.shortTitle}, ${pageLabel}`,
        },
        createdAt: new Date().toISOString(),
      }],
      message: `You add a note from ${book.shortTitle} to the field journal.`,
    };
  }),
});
