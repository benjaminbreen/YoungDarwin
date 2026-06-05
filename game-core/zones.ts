import type { SpecimenId, TravelCardData, Vec3Tuple, ZoneDefinition, ZoneId } from './types';

export const FLOREANA_ZONE_IDS = {
  POST_OFFICE_BAY: 'post-office-bay-anchorage',
  HIGHLAND_TRAIL: 'floreana-highland-trail',
  CERRO_PAJAS_RIDGE: 'cerro-pajas-ridge',
  MARINE_IGUANA_ROCKS: 'marine-iguana-rocks',
  BLACK_LAVA_FLOW: 'black-lava-flow',
  DRY_SCRUB: 'floreana-dry-scrub',
  BEAGLE_SPECIMEN_ROOM: 'beagle-specimen-room',
} as const satisfies Record<string, ZoneId>;

export const currentZoneId = FLOREANA_ZONE_IDS.POST_OFFICE_BAY;

const postOfficeBaySpecimens = [
  { specimenId: 'crab', position: [-6.4, 0, -10.8], behavior: 'skitter', sceneScale: 1.45 },
  { specimenId: 'marineiguana', position: [-13.5, 0, -19.5], behavior: 'bask', sceneScale: 1.28 },
  { specimenId: 'mediumgroundfinch', position: [8.5, 0, 7.2], behavior: 'curious', sceneScale: 1.35 },
  { specimenId: 'floreanagianttortoise', position: [-23.5, 0, 5.4], behavior: 'graze', sceneScale: 1.25 },
  { specimenId: 'galapagospenguin', position: [17.8, 0, -28.5], behavior: 'waddle', sceneScale: 1.18 },
  { specimenId: 'cactus', position: [20.5, 0, 14.5], behavior: 'still', sceneScale: 1.55 },
  { specimenId: 'basalt', position: [-17.5, 0, 10.5], behavior: 'still', sceneScale: 1.25 },
] satisfies Array<{ specimenId: SpecimenId; position: Vec3Tuple; behavior: string; sceneScale: number }>;

export const floreanaZones = {
  [FLOREANA_ZONE_IDS.POST_OFFICE_BAY]: {
    id: FLOREANA_ZONE_IDS.POST_OFFICE_BAY,
    name: 'Post Office Bay Anchorage',
    shortName: 'Post Office Bay',
    island: 'Floreana Island',
    historicalName: 'Charles Island',
    subtitle: 'Northern Floreana | September 1835',
    biome: 'volcanic cove',
    terrain: {
      preset: 'floreana-cove',
      bounds: 43,
      size: 118,
      segments: 360,
    },
    localCellIds: ['POST_OFFICE_BAY', 'LAVA_FLATS', 'N_SHORE', 'BEAGLE'],
    defaultLocalCellId: 'POST_OFFICE_BAY',
    livestock: false,
    playerStart: [0, 0, 7.5],
    beaglePosition: [13.5, -1.08, -48],
    narration: {
      weather: 'sunny',
      sounds: ['surf below black cliffs', 'rigging from the Beagle', 'distant seabirds'],
      educationalNote:
        'Darwin visited Floreana, then called Charles Island, where black lava shores, dry scrub, and human settlement made locality notes especially important.',
      loadingNote:
        'A black volcanic landing shelf rises from sheltered water, with the Beagle riding at anchor beyond Post Office Bay.',
    },
    exits: [
      {
        zoneId: FLOREANA_ZONE_IDS.HIGHLAND_TRAIL,
        label: 'Climb toward the highlands',
        exit: 'north highland path',
        minutes: 25,
        fatigue: 8,
        note: 'The path steepens toward the humid interior of Charles Island.',
      },
      {
        zoneId: FLOREANA_ZONE_IDS.MARINE_IGUANA_ROCKS,
        label: 'Scramble down to the lava tide pools',
        exit: 'southern rocks',
        minutes: 15,
        fatigue: 4,
        note: 'Wet basalt shelves expose crabs, iguanas, and shell fragments.',
      },
      {
        zoneId: FLOREANA_ZONE_IDS.BEAGLE_SPECIMEN_ROOM,
        label: 'Return to the Beagle',
        exit: 'ship boat',
        minutes: 10,
        fatigue: 1,
        note: 'Syms can prepare labels and storage aboard ship.',
      },
    ],
    specimens: postOfficeBaySpecimens,
  },
  [FLOREANA_ZONE_IDS.HIGHLAND_TRAIL]: plannedZone({
    id: FLOREANA_ZONE_IDS.HIGHLAND_TRAIL,
    name: 'Floreana Highland Trail',
    shortName: 'Highland Trail',
    subtitle: 'Path above Post Office Bay',
    biome: 'volcanic trail and dry scrub',
    defaultLocalCellId: 'NORTHERN_HIGHLANDS',
    educationalNote: 'The climb inland links shore, dry scrub, and highland habitats, making specimen locality notes central to later comparison.',
    loadingNote: 'Loose ash and fractured rock make the climb slow, but the view opens rapidly over the anchorage.',
  }),
  [FLOREANA_ZONE_IDS.CERRO_PAJAS_RIDGE]: plannedZone({
    id: FLOREANA_ZONE_IDS.CERRO_PAJAS_RIDGE,
    name: 'Cerro Pajas Ridge',
    shortName: 'Cerro Pajas',
    subtitle: 'Highland ridge above the coast',
    biome: 'humid highland ridge',
    defaultLocalCellId: 'HIGHLAND_RIDGE',
    educationalNote: 'Floreana highlands show how elevation changes moisture, vegetation, and the animals a collector is likely to encounter.',
    loadingNote: 'The trail crests among cooler highland vegetation, far above the black shore.',
  }),
  [FLOREANA_ZONE_IDS.MARINE_IGUANA_ROCKS]: plannedZone({
    id: FLOREANA_ZONE_IDS.MARINE_IGUANA_ROCKS,
    name: 'Marine Iguana Rocks',
    shortName: 'Iguana Rocks',
    subtitle: 'Basalt shore below Post Office Bay',
    biome: 'intertidal basalt',
    defaultLocalCellId: 'BLACK_BEACH',
    educationalNote: 'Marine iguanas and Sally Lightfoot crabs make the shore a compact lesson in adaptation to the intertidal zone.',
    loadingNote: 'The path drops to slick basalt shelves where tide pools flash between black rock ledges.',
  }),
  [FLOREANA_ZONE_IDS.BLACK_LAVA_FLOW]: plannedZone({
    id: FLOREANA_ZONE_IDS.BLACK_LAVA_FLOW,
    name: 'Black Lava Flow',
    shortName: 'Lava Flow',
    subtitle: 'Young volcanic ground',
    biome: 'lava field',
    defaultLocalCellId: 'LAVA_FLATS',
    educationalNote: 'Fresh lava flows create harsh, low-nutrient surfaces where pioneer plants and lizards are easiest to notice.',
    loadingNote: 'Broken black lava spreads inland in ropes, plates, and sharp clinker under the equatorial sun.',
  }),
  [FLOREANA_ZONE_IDS.DRY_SCRUB]: plannedZone({
    id: FLOREANA_ZONE_IDS.DRY_SCRUB,
    name: 'Floreana Dry Scrub',
    shortName: 'Dry Scrub',
    subtitle: 'Dry-zone vegetation above the cove',
    biome: 'dry scrub',
    defaultLocalCellId: 'NORTHERN_HIGHLANDS',
    educationalNote: 'Dry-zone plants create feeding and nesting opportunities for finches, iguanas, and tortoises during brief wet periods.',
    loadingNote: 'Grey-green shrubs and Opuntia stand apart on pale ash, with finches working the seed heads.',
  }),
  [FLOREANA_ZONE_IDS.BEAGLE_SPECIMEN_ROOM]: plannedZone({
    id: FLOREANA_ZONE_IDS.BEAGLE_SPECIMEN_ROOM,
    name: 'Beagle Specimen Room',
    shortName: 'Specimen Room',
    island: 'HMS Beagle',
    historicalName: 'HMS Beagle',
    subtitle: 'Aboard ship, off Floreana',
    biome: 'interior',
    terrainPreset: 'planned-interior',
    defaultLocalCellId: 'BEAGLE',
    educationalNote: 'Specimens only become scientific evidence when labeled, preserved, compared, and tied to locality notes.',
    loadingNote: 'Below decks, Syms clears a narrow work surface among jars, twine, labels, and drying paper.',
  }),
} as const satisfies Record<ZoneId, ZoneDefinition>;

type PlannedZoneInput = {
  id: ZoneId;
  name: string;
  shortName: string;
  island?: string;
  historicalName?: string;
  subtitle: string;
  biome: string;
  terrainPreset?: string;
  defaultLocalCellId: string;
  educationalNote: string;
  loadingNote: string;
};

function plannedZone(input: PlannedZoneInput): ZoneDefinition {
  return {
    id: input.id,
    name: input.name,
    shortName: input.shortName,
    island: input.island || 'Floreana Island',
    historicalName: input.historicalName || 'Charles Island',
    subtitle: input.subtitle,
    biome: input.biome,
    terrain: {
      preset: input.terrainPreset || 'planned',
    },
    localCellIds: [input.defaultLocalCellId],
    defaultLocalCellId: input.defaultLocalCellId,
    playerStart: [0, 0, 7.5],
    exits: [],
    specimens: [],
    narration: {
      educationalNote: input.educationalNote,
      loadingNote: input.loadingNote,
    },
  };
}

export function getZone(zoneId: ZoneId = currentZoneId): ZoneDefinition {
  return floreanaZones[zoneId] || floreanaZones[currentZoneId];
}

export function getZoneExits(zoneId: ZoneId = currentZoneId) {
  return getZone(zoneId).exits;
}

export function getZoneSpecimenIds(zoneId: ZoneId = currentZoneId): SpecimenId[] {
  return getZone(zoneId).specimens.map(spawn => spawn.specimenId);
}

export function getZoneSpecimenSpawns(zoneId: ZoneId = currentZoneId) {
  return getZone(zoneId).specimens;
}

export function getTravelCard(fromZoneId: ZoneId, toZoneId: ZoneId): TravelCardData | null {
  const fromZone = getZone(fromZoneId);
  const route = fromZone.exits.find(exit => exit.zoneId === toZoneId);
  if (!route) return null;
  const toZone = getZone(route.zoneId);

  return {
    fromZoneId,
    toZoneId,
    title: route.label,
    terrainType: toZone.biome,
    estimatedMinutes: route.minutes,
    fatigueDelta: route.fatigue,
    routeLabel: route.exit,
    bannerImage: '',
    description: route.note,
    specimens: toZone.specimens.map(spawn => spawn.specimenId),
    notableFeatures: [toZone.shortName, toZone.biome, toZone.historicalName],
    educationalNote: toZone.narration.educationalNote,
  };
}
