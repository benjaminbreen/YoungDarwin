const LIBRARY_STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'among', 'and', 'are', 'been',
  'before', 'being', 'between', 'both', 'but', 'can', 'could', 'did', 'does',
  'each', 'for', 'from', 'had', 'has', 'have', 'her', 'here', 'him', 'his',
  'how', 'into', 'its', 'may', 'more', 'most', 'not', 'our', 'out', 'over',
  'same', 'she', 'should', 'some', 'such', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'under',
  'very', 'was', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'will', 'with', 'would', 'you', 'your',
  'como', 'con', 'del', 'desde', 'donde', 'dos', 'entre', 'era', 'esta',
  'estas', 'este', 'estos', 'fue', 'han', 'las', 'los', 'mas', 'muy', 'para',
  'pero', 'por', 'que', 'sin', 'sobre', 'son', 'sus', 'una', 'uno',
]);

export function normalizeLibraryText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ſﬀﬁﬂﬃﬄ]/g, character => ({
      'ſ': 's',
      'ﬀ': 'ff',
      'ﬁ': 'fi',
      'ﬂ': 'fl',
      'ﬃ': 'ffi',
      'ﬄ': 'ffl',
    })[character] || character)
    .replace(/æ/gi, match => (match === 'Æ' ? 'Ae' : 'ae'))
    .replace(/œ/gi, match => (match === 'Œ' ? 'Oe' : 'oe'))
    .replace(/(?<=\p{L})[-¬]\s+(?=\p{L})/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeLibraryText(value, { keepStopWords = false } = {}) {
  return normalizeLibraryText(value)
    .split(/\s+/)
    .map(token => token.replace(/^['-]+|['-]+$/g, ''))
    .filter(token => token.length >= 3 && (keepStopWords || !LIBRARY_STOP_WORDS.has(token)));
}

function postingsForToken(index, token) {
  const exact = index.postings?.[token];
  if (exact) return [{ token, postings: exact, weight: 1 }];
  if (token.length < 5) return [];
  return Object.keys(index.postings || {})
    .filter(candidate => candidate.startsWith(token) || token.startsWith(candidate))
    .sort((left, right) => Math.abs(left.length - token.length) - Math.abs(right.length - token.length))
    .slice(0, 6)
    .map(candidate => ({ token: candidate, postings: index.postings[candidate], weight: 0.72 }));
}

export function searchLibraryCorpus({ passages = [], index = null, query, limit = 6 } = {}) {
  if (!index || !passages.length) return [];
  const normalizedQuery = normalizeLibraryText(query).slice(0, 160);
  const queryTokens = [...new Set(tokenizeLibraryText(normalizedQuery))];
  if (!queryTokens.length) return [];

  const documentCount = Number(index.documentCount) || passages.length;
  const averageLength = Number(index.averageDocumentLength) || 1;
  const documentLengths = index.documentLengths || [];
  const scores = new Map();

  for (const queryToken of queryTokens) {
    for (const expansion of postingsForToken(index, queryToken)) {
      const postings = expansion.postings || [];
      const documentFrequency = postings.length / 2;
      const inverseDocumentFrequency = Math.log(
        1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5),
      );
      for (let cursor = 0; cursor < postings.length; cursor += 2) {
        const documentIndex = postings[cursor];
        const frequency = postings[cursor + 1];
        const documentLength = documentLengths[documentIndex] || averageLength;
        const denominator = frequency + 1.25 * (0.25 + 0.75 * (documentLength / averageLength));
        const bm25 = inverseDocumentFrequency * ((frequency * 2.25) / denominator) * expansion.weight;
        scores.set(documentIndex, (scores.get(documentIndex) || 0) + bm25);
      }
    }
  }

  for (const [documentIndex, score] of scores) {
    const passage = passages[documentIndex];
    if (!passage) continue;
    const phraseBonus = passage.searchText?.includes(normalizedQuery) ? 5 : 0;
    const coverage = queryTokens.filter(token => passage.searchText?.includes(token)).length;
    scores.set(documentIndex, score + phraseBonus + coverage * 0.35);
  }

  const ranked = [...scores.entries()]
    .map(([documentIndex, score]) => ({ ...passages[documentIndex], score }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const selected = [];
  const perBook = new Map();
  for (const result of ranked) {
    const count = perBook.get(result.bookId) || 0;
    if (count >= 3 && selected.length < Math.min(limit, 4)) continue;
    selected.push(result);
    perBook.set(result.bookId, count + 1);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) {
    for (const result of ranked) {
      if (selected.some(item => item.id === result.id)) continue;
      selected.push(result);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}
