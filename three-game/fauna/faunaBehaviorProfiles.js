import {
  getWildlifeBehaviorProfile,
  getWildlifeCarryProfile,
  wildlifeBehaviorProfiles,
  wildlifeCarryProfiles,
} from '../wildlife/wildlifeCatalog';

export const faunaBehaviorProfiles = wildlifeBehaviorProfiles;

export function getFaunaBehaviorProfile(specimen) {
  return getWildlifeBehaviorProfile(specimen);
}

// Animals docile enough for Darwin to pick up bare-handed. holdHeight is the
// carry height above the player's feet; heavier animals ride lower.
export const faunaCarryProfiles = wildlifeCarryProfiles;

export function getFaunaCarryProfile(specimen) {
  return getWildlifeCarryProfile(specimen);
}
