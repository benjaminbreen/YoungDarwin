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
    minPatchSeparation: 7.5,
    minItemSeparation: 0.8,
    maxGrade: 0.82,
    densityPerHectare: 34,
    maximumPerRegion: 42,
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
  modeledLifeStages: ['breakable young plant', 'mature tree cactus'],
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
    minPatchSeparation: 15,
    minItemSeparation: 4.5,
    maxGrade: 0.66,
    densityPerHectare: 4,
    maximumPerRegion: 6,
  },
});

export const LAVA_CACTUS_SPECIES = Object.freeze({
  id: 'brachycereus-nesioticus',
  commonName: 'Lava cactus',
  scientificName: 'Brachycereus nesioticus',
  spanishName: 'Cactus de lava',
  label: 'Lava cactus / Brachycereus nesioticus',
  origin: 'Galápagos endemic',
  heightMeters: [0.15, 0.6],
  modeledLifeStages: ['young golden columns', 'weathered grey clumps'],
  habitat: {
    minimumSuitability: 0.22,
    preferences: {
      moisture: { preferred: [0.02, 0.2], tolerated: [0, 0.38], weight: 1.3 },
      canopy: { preferred: [0, 0.08], tolerated: [0, 0.28], weight: 1.05 },
      exposure: { preferred: [0.7, 1], tolerated: [0.48, 1], weight: 1.2 },
      disturbance: { preferred: [0, 0.18], tolerated: [0, 0.48], weight: 1.25 },
      salinity: { preferred: [0, 0.1], tolerated: [0, 0.28], weight: 0.65 },
      rockiness: { preferred: [0.62, 1], tolerated: [0.32, 1], weight: 1.5 },
    },
  },
  placement: {
    // The physical cactus is naturally low. This restrained range is a
    // legibility lift for ground-level play, not a claim that it grows tall.
    scale: [0.82, 1.5],
    scaleExponent: 1.15,
    patchRadius: [2.4, 5.2],
    maxGrade: 0.68,
  },
});

export const CANDELABRA_CACTUS_SPECIES = Object.freeze({
  id: 'jasminocereus-thouarsii',
  commonName: 'Candelabra cactus',
  scientificName: 'Jasminocereus thouarsii var. thouarsii',
  spanishName: 'Cactus candelabro',
  label: 'Candelabra cactus / Jasminocereus thouarsii',
  origin: 'Galápagos endemic',
  heightMeters: [2, 5],
  habitat: {
    minimumSuitability: 0.28,
    preferences: {
      moisture: { preferred: [0.03, 0.28], tolerated: [0, 0.48], weight: 1.25 },
      canopy: { preferred: [0, 0.16], tolerated: [0, 0.38], weight: 1.05 },
      exposure: { preferred: [0.62, 1], tolerated: [0.38, 1], weight: 1.1 },
      disturbance: { preferred: [0, 0.14], tolerated: [0, 0.42], weight: 1.4 },
      salinity: { preferred: [0, 0.12], tolerated: [0, 0.3], weight: 0.75 },
      rockiness: { preferred: [0.24, 0.9], tolerated: [0.06, 1], weight: 0.9 },
    },
  },
  placement: {
    // The prepared asset is approximately one metre high. Runtime scale makes
    // readable 2–5 m adults while preserving sparse dry-zone spacing.
    scale: [2.05, 5.05],
    scaleExponent: 1.25,
    patchRadius: [5.5, 9.5],
    minPatchSeparation: 11,
    minItemSeparation: 8.5,
    maxGrade: 0.56,
    densityPerHectare: 5,
    maximumPerRegion: 7,
    variation: {
      width: [0.93, 1.08],
      height: [0.94, 1.08],
      depth: [0.93, 1.08],
      maxLean: 0.018,
    },
  },
});

export const PLEOPELTIS_POLYPODIOIDES_SPECIES = Object.freeze({
  id: 'pleopeltis-polypodioides',
  commonName: 'Floreana resurrection fern',
  scientificName: 'Pleopeltis polypodioides',
  label: 'Floreana resurrection fern / Pleopeltis polypodioides',
  origin: 'Galápagos native',
  heightMeters: [0.12, 0.45],
  habitat: {
    minimumSuitability: 0.24,
    preferences: {
      moisture: { preferred: [0.58, 0.92], tolerated: [0.34, 1], weight: 1.45 },
      canopy: { preferred: [0.24, 0.78], tolerated: [0.08, 0.96], weight: 1.05 },
      exposure: { preferred: [0.08, 0.44], tolerated: [0, 0.7], weight: 1.05 },
      disturbance: { preferred: [0, 0.16], tolerated: [0, 0.46], weight: 1.2 },
      salinity: { preferred: [0, 0.05], tolerated: [0, 0.14], weight: 1.3 },
      rockiness: { preferred: [0.16, 0.62], tolerated: [0, 0.88], weight: 0.65 },
    },
  },
  placement: {
    scale: [0.48, 1.02],
    scaleExponent: 1.3,
    patchRadius: [1.4, 3.8],
    minPatchSeparation: 5,
    minItemSeparation: 0.55,
    maxGrade: 0.74,
    densityPerHectare: 42,
    maximumPerRegion: 48,
    variation: {
      width: [0.86, 1.16],
      height: [0.9, 1.1],
      depth: [0.86, 1.16],
      maxLean: 0.07,
    },
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

export const PALO_SANTO_SPECIES = Object.freeze({
  id: 'bursera-graveolens',
  commonName: 'Palo santo',
  scientificName: 'Bursera graveolens',
  spanishName: 'Palo santo',
  label: 'Palo santo / Bursera graveolens',
  origin: 'Galápagos native',
  heightMeters: [2, 10],
  modeledLifeStages: ['young crooked tree', 'mature open-crowned dry-season tree'],
  habitat: {
    minimumSuitability: 0.25,
    preferences: {
      moisture: { preferred: [0.14, 0.44], tolerated: [0.06, 0.68], weight: 1.1 },
      canopy: { preferred: [0, 0.28], tolerated: [0, 0.52], weight: 0.9 },
      exposure: { preferred: [0.46, 0.9], tolerated: [0.24, 1], weight: 0.9 },
      disturbance: { preferred: [0, 0.14], tolerated: [0, 0.42], weight: 1.35 },
      salinity: { preferred: [0, 0.06], tolerated: [0, 0.18], weight: 1.3 },
      rockiness: { preferred: [0.18, 0.62], tolerated: [0.04, 0.84], weight: 0.65 },
    },
  },
  placement: {
    scale: [0.72, 1.38],
    scaleExponent: 1.2,
    patchRadius: [7, 12],
    maxGrade: 0.58,
  },
});
