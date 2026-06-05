export const DEFAULT_HYBRID_BATCH_SIZE = Number(process.env.NEXT_PUBLIC_DEFAULT_HYBRID_BATCH_SIZE || 3);
export const MAX_HYBRID_BATCH_SIZE = Number(process.env.NEXT_PUBLIC_MAX_HYBRID_BATCH_SIZE || 4);

export function clampHybridBatchSize(value, fallback = DEFAULT_HYBRID_BATCH_SIZE) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(MAX_HYBRID_BATCH_SIZE, Math.round(numeric)));
}

export function shouldAutoGenerateHybrids({ isVisible, hybridityMode, explicitStart = false } = {}) {
  return Boolean(explicitStart && isVisible && hybridityMode && hybridityMode !== 'none');
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededIndex(length, seed) {
  if (length <= 0) return 0;
  return hashString(seed) % length;
}

export function selectDeterministicParentPairs(groups = {}, count = DEFAULT_HYBRID_BATCH_SIZE, seed = 'young-darwin') {
  const targetCount = clampHybridBatchSize(count);
  const potentialGroups = Object.entries(groups)
    .filter(([, specimens]) => Array.isArray(specimens) && specimens.length > 1)
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
  const selectedParents = [];

  for (let i = 0; i < targetCount && potentialGroups.length > 0; i += 1) {
    const groupIndex = seededIndex(potentialGroups.length, `${seed}:group:${i}`);
    const [taxonomicGroup, specimens] = potentialGroups.splice(groupIndex, 1)[0];
    const firstIndex = seededIndex(specimens.length, `${seed}:${taxonomicGroup}:first:${i}`);
    const remaining = specimens
      .map((specimen, index) => ({ specimen, index }))
      .filter(item => item.index !== firstIndex);
    const second = remaining[seededIndex(remaining.length, `${seed}:${taxonomicGroup}:second:${i}`)];

    if (second) {
      selectedParents.push({
        taxonomicGroup,
        parent1: specimens[firstIndex],
        parent2: second.specimen,
      });
    }
  }

  return selectedParents;
}
