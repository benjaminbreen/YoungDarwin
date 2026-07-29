'use client';

import { searchLibraryCorpus } from './searchCore';

let libraryPromise = null;

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Library data could not be loaded (${response.status}).`);
  return response.json();
}

export function loadLibraryData() {
  if (libraryPromise) return libraryPromise;
  libraryPromise = fetchJson('/assets/library/manifest.json')
    .then(async manifest => {
      const [passagePayload, lexicalIndex, termPayload] = await Promise.all([
        fetchJson(manifest.artifacts.passages),
        fetchJson(manifest.artifacts.lexicalIndex),
        fetchJson(manifest.artifacts.memoryTerms),
      ]);
      const passages = passagePayload.passages || [];
      const terms = termPayload.terms || [];
      return {
        manifest,
        passages,
        lexicalIndex,
        terms,
        passagesById: new Map(passages.map(passage => [passage.id, passage])),
        termsById: new Map(terms.map(term => [term.id, term])),
      };
    })
    .catch(error => {
      libraryPromise = null;
      throw error;
    });
  return libraryPromise;
}

export function searchLoadedLibrary(library, query, limit = 6) {
  if (!library) return [];
  return searchLibraryCorpus({
    passages: library.passages,
    index: library.lexicalIndex,
    query,
    limit,
  });
}

export function resolveMemoryTerm(library, termId) {
  const term = library?.termsById?.get(termId);
  if (!term) return null;
  const resultIds = [term.primaryPassageId, ...(term.relatedPassageIds || [])].filter(Boolean);
  return {
    term,
    passages: resultIds.map(id => library.passagesById.get(id)).filter(Boolean),
  };
}
