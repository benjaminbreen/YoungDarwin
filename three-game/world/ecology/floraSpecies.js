// Lightweight species identities shared by ecology, inspection, and dev UI.
// Keep model-specific preparation details in floraAssets.js.

export const DARWINIOTHAMNUS_SPECIES = Object.freeze({
  id: 'darwiniothamnus-tenuifolius',
  commonName: "Thin-leafed Darwin's shrub",
  scientificName: 'Darwiniothamnus tenuifolius',
  spanishName: 'Margarita de Darwin',
  label: "Thin-leafed Darwin's shrub / Darwiniothamnus tenuifolius",
  origin: 'Galápagos endemic',
  heightMeters: [0.5, 2],
  habitat: {
    minimumSuitability: 0.24,
    preferences: {
      moisture: { preferred: [0.32, 0.68], tolerated: [0.14, 0.84], weight: 1.2 },
      canopy: { preferred: [0.12, 0.58], tolerated: [0, 0.82], weight: 0.9 },
      exposure: { preferred: [0.28, 0.82], tolerated: [0.08, 1], weight: 0.8 },
      disturbance: { preferred: [0, 0.18], tolerated: [0, 0.52], weight: 1.45 },
      salinity: { preferred: [0, 0.06], tolerated: [0, 0.18], weight: 1.6 },
    },
  },
  placement: {
    scale: [0.8, 2.45],
    scaleExponent: 1.85,
    patchRadius: [3, 6.4],
    maxGrade: 0.82,
    variation: {
      width: [0.88, 1.15],
      height: [0.88, 1.12],
      depth: [0.88, 1.15],
      maxLean: 0.04,
    },
  },
});

export const OPUNTIA_MEGASPERMA_SPECIES = Object.freeze({
  id: 'opuntia-megasperma',
  commonName: 'Floreana prickly pear cactus',
  scientificName: 'Opuntia megasperma var. megasperma',
  spanishName: 'Tuna de semilla grande',
  label: 'Floreana prickly pear / Opuntia megasperma',
  origin: 'Galápagos endemic',
  heightMeters: [3, 12],
  modeledLifeStage: 'young plant',
  habitat: {
    minimumSuitability: 0.22,
    preferences: {
      moisture: { preferred: [0.1, 0.36], tolerated: [0.02, 0.58], weight: 1.05 },
      canopy: { preferred: [0, 0.22], tolerated: [0, 0.5], weight: 0.9 },
      exposure: { preferred: [0.56, 1], tolerated: [0.3, 1], weight: 1.05 },
      disturbance: { preferred: [0, 0.16], tolerated: [0, 0.46], weight: 1.35 },
      salinity: { preferred: [0, 0.14], tolerated: [0, 0.3], weight: 0.65 },
      rockiness: { preferred: [0.3, 0.78], tolerated: [0.08, 1], weight: 1.2 },
    },
  },
  placement: {
    // Site size scales the existing young, breakable plant simulation rather
    // than claiming to represent a mature 3–12 m tree cactus.
    scale: [0.75, 1.3],
    scaleExponent: 1.1,
    patchRadius: [7, 10],
    maxGrade: 0.66,
  },
});

export const CROTON_SCOULERI_SPECIES = Object.freeze({
  id: 'croton-scouleri',
  commonName: 'Chala',
  scientificName: 'Croton scouleri',
  label: 'Chala / Croton scouleri',
  origin: 'Galápagos endemic',
  habitat: {
    minimumSuitability: 0.2,
    preferences: {
      moisture: { preferred: [0.18, 0.62], tolerated: [0.08, 0.86], weight: 1 },
      canopy: { preferred: [0.05, 0.5], tolerated: [0, 0.76], weight: 0.8 },
      exposure: { preferred: [0.32, 0.9], tolerated: [0.14, 1], weight: 0.75 },
      disturbance: { preferred: [0, 0.2], tolerated: [0, 0.52], weight: 1.25 },
      salinity: { preferred: [0, 0.12], tolerated: [0, 0.26], weight: 0.9 },
      rockiness: { preferred: [0.1, 0.58], tolerated: [0, 0.86], weight: 0.7 },
    },
  },
  placement: {
    scale: [0.5, 1.05],
    scaleExponent: 1.2,
    patchRadius: [4, 7.5],
    maxGrade: 0.76,
    variation: {
      width: [0.88, 1.14],
      height: [0.9, 1.14],
      depth: [0.9, 1.12],
      maxLean: 0.04,
    },
  },
});
