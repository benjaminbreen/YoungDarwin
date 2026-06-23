export const faunaBehaviorProfiles = {
  crab: {
    habitatRadiusX: 5.8,
    habitatRadiusZ: 2.8,
    walkSpeed: 0.55,
    fleeSpeed: 2.25,
    patrolRate: 0.55,
    alertRadius: 5.2,
    panicRadius: 1.55,
    targetInterval: [1.0, 3.0],
    dwellTime: [0.15, 0.65],
    bobAmount: 0.018,
    groundOffset: 0.04,
    turnRate: 14,
    cornerable: true,
    allowedBiomes: ['wet-basalt', 'ash-slope', 'black-lava', 'trail'],
    avoidBiomes: ['water', 'dry-scrub', 'palo-santo'],
  },
  flightlesscormorant: {
    habitatRadiusX: 8.5,
    habitatRadiusZ: 4.2,
    walkSpeed: 0.42,
    fleeSpeed: 1.15,
    patrolRate: 0.32,
    alertRadius: 6.0,
    panicRadius: 1.8,
    targetInterval: [2.5, 5.8],
    dwellTime: [0.65, 1.75],
    bobAmount: 0.025,
    groundOffset: 0.04,
    turnRate: 7,
    cornerable: true,
    allowedBiomes: ['wet-basalt', 'ash-slope', 'black-lava', 'trail'],
    avoidBiomes: ['water', 'dry-scrub', 'palo-santo'],
  },
  lavalizard: {
    habitatRadiusX: 3.2,
    habitatRadiusZ: 1.6,
    walkSpeed: 0.35,
    fleeSpeed: 2.6,
    patrolRate: 0.7,
    alertRadius: 4.2,
    panicRadius: 1.2,
    targetInterval: [1.2, 4.0],
    dwellTime: [0.35, 1.2],
    bobAmount: 0.008,
    groundOffset: 0.04,
    turnRate: 16,
    allowedBiomes: ['black-lava', 'ash-slope', 'wet-basalt', 'trail'],
    avoidBiomes: ['water', 'dry-scrub'],
  },
};

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
