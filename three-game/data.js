import { baseSpecimens } from '../data/specimens';
import { collectionTools } from '../data/tools';
import { getZone } from './world/floreanaZones';

const activeZone = getZone();
const SELECTED_IDS = activeZone.specimens || ['crab', 'marineiguana', 'mediumgroundfinch', 'cactus', 'basalt'];

const SPECIMEN_POSITIONS = activeZone.specimenSpawns;

const SPECIMEN_SCALE = {
  crab: 1.45,
  marineiguana: 1.28,
  mediumgroundfinch: 1.35,
  floreanagianttortoise: 1.25,
  galapagospenguin: 1.18,
  cactus: 1.55,
  basalt: 1.25,
};

const SPECIMEN_BEHAVIOR = activeZone.specimenBehaviors;

export const threeSpecimens = SELECTED_IDS
  .map(id => baseSpecimens.find(specimen => specimen.id === id))
  .filter(Boolean)
  .map(specimen => ({
    ...specimen,
    spawnPoint: SPECIMEN_POSITIONS[specimen.id],
    sceneScale: SPECIMEN_SCALE[specimen.id] || 1,
    behavior: SPECIMEN_BEHAVIOR[specimen.id] || 'still',
  }));

export const threeTools = [
  ...collectionTools,
  {
    id: 'sketch',
    name: 'Field Journal',
    description: 'Observe, sketch, and document without taking the specimen.',
    detailedDescription: 'A pocket field book for locality, behavior, and specimen condition notes.',
    action: 'documented',
    icon: '✒️',
    usage: 'Best for cautious observation and educational progress.',
  },
];

export const islandLocation = {
  id: activeZone.id,
  name: activeZone.name,
  island: activeZone.island,
  historicalName: activeZone.historicalName,
  subtitle: activeZone.subtitle,
  type: activeZone.biome,
};

export const initialNarration = {
  narration: 'The boat leaves you on the black volcanic landing shelf of Post Office Bay. The Beagle rides beyond the turquoise water while Syms Covington checks the specimen bag against the ash-colored slopes of Floreana.',
  educationalNote: activeZone.educationalNote,
  weather: activeZone.weather,
  sounds: activeZone.sounds,
};
