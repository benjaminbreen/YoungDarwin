export function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicChoice(items = [], seed = 'young-darwin') {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[hashString(seed) % items.length];
}
