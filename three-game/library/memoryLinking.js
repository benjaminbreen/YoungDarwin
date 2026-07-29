import { LIBRARY_MEMORY_TERMS } from './memoryTerms';

const MEMORY_ALIASES = LIBRARY_MEMORY_TERMS.flatMap(term => (
  [...new Set([term.label, ...(term.aliases || [])])]
    .filter(alias => alias.length >= 4)
    .map(alias => ({ alias, lower: alias.toLocaleLowerCase(), term }))
)).sort((left, right) => right.alias.length - left.alias.length);

function isWordCharacter(character) {
  return Boolean(character && /[\p{L}\p{N}]/u.test(character));
}

export function findMemoryLinks(text, maximumLinks = 2) {
  const source = String(text || '');
  const lowerText = source.toLocaleLowerCase();
  const candidates = [];
  for (const entry of MEMORY_ALIASES) {
    let fromIndex = 0;
    while (fromIndex < lowerText.length) {
      const index = lowerText.indexOf(entry.lower, fromIndex);
      if (index < 0) break;
      const end = index + entry.alias.length;
      if (!isWordCharacter(source[index - 1]) && !isWordCharacter(source[end])) {
        candidates.push({ start: index, end, term: entry.term });
        break;
      }
      fromIndex = index + 1;
    }
  }
  candidates.sort((left, right) => (
    left.start - right.start
    || (right.end - right.start) - (left.end - left.start)
    || left.term.priority - right.term.priority
  ));

  const selected = [];
  const usedTerms = new Set();
  for (const candidate of candidates) {
    if (usedTerms.has(candidate.term.id)) continue;
    if (selected.some(item => candidate.start < item.end && candidate.end > item.start)) continue;
    selected.push(candidate);
    usedTerms.add(candidate.term.id);
    if (selected.length >= maximumLinks) break;
  }
  return selected.sort((left, right) => left.start - right.start);
}
