export const faunaBehaviorProfiles = {};

export function getFaunaBehaviorProfile(specimen) {
  if (!specimen?.id) return null;
  return faunaBehaviorProfiles[specimen.id] || null;
}

// Animals docile enough for Darwin to pick up bare-handed. holdHeight is the
// carry height above the player's feet; heavier animals ride lower.
export const faunaCarryProfiles = {
  floreanagianttortoise: { label: 'tortoise', holdHeight: 0.7 },
  marineiguana: { label: 'marine iguana', holdHeight: 0.88 },
  galapagospenguin: { label: 'penguin', holdHeight: 0.95 },
};

export function getFaunaCarryProfile(specimen) {
  if (!specimen?.id) return null;
  return faunaCarryProfiles[specimen.id] || null;
}
