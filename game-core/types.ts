export type ZoneId =
  | 'post-office-bay-anchorage'
  | 'floreana-highland-trail'
  | 'cerro-pajas-ridge'
  | 'marine-iguana-rocks'
  | 'black-lava-flow'
  | 'floreana-dry-scrub'
  | 'beagle-specimen-room';

export type LocalCellId = string;
export type SpecimenId = string;
export type ToolId = string;

export type Vec3Tuple = [number, number, number];

export type TerrainDefinition = {
  preset: string;
  bounds?: number;
  size?: number;
  segments?: number;
};

export type ZoneExitDefinition = {
  zoneId: ZoneId;
  label: string;
  exit: string;
  minutes: number;
  fatigue: number;
  note: string;
};

export type ZoneNarration = {
  loadingNote: string;
  educationalNote: string;
  sounds?: string[];
  weather?: string;
};

export type ZoneSpecimenSpawn = {
  specimenId: SpecimenId;
  position: Vec3Tuple;
  behavior?: string;
  sceneScale?: number;
};

export type ModelPlacement = {
  path: string;
  position: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: number | Vec3Tuple;
};

export type ColliderDefinition =
  | {
      type: 'ball' | 'cylinder' | 'capsule';
      radius: number;
      height?: number;
      offset?: Vec3Tuple;
    }
  | {
      type: 'box';
      size: Vec3Tuple;
      offset?: Vec3Tuple;
    }
  | {
      type: 'convex';
      points: [number, number][];
      height: number;
      yMin?: number;
      yMax?: number;
      offset?: Vec3Tuple;
    }
  | {
      type: 'compound';
      shapes: ColliderDefinition[];
    };

export type ObstacleDefinition = {
  id: string;
  kind: 'boulder' | 'tree' | 'log' | 'ledge' | 'prop';
  render: ModelPlacement;
  collider: ColliderDefinition;
  gameplay?: {
    climbable?: boolean;
    jumpable?: boolean;
    edgeRisk?: boolean;
    climbLabel?: string;
  };
};

export type ZoneDefinition = {
  id: ZoneId;
  name: string;
  shortName: string;
  island: string;
  historicalName: string;
  subtitle: string;
  biome: string;
  terrain: TerrainDefinition;
  localCellIds: LocalCellId[];
  defaultLocalCellId: LocalCellId;
  playerStart: Vec3Tuple;
  beaglePosition?: Vec3Tuple;
  livestock?: boolean;
  exits: ZoneExitDefinition[];
  specimens: ZoneSpecimenSpawn[];
  narration: ZoneNarration;
};

export type TravelCardData = {
  fromZoneId: ZoneId;
  toZoneId: ZoneId;
  title: string;
  terrainType: string;
  estimatedMinutes: number;
  fatigueDelta: number;
  routeLabel: string;
  bannerImage: string;
  description: string;
  specimens: SpecimenId[];
  notableFeatures: string[];
  educationalNote: string;
};

export type InventoryItem = {
  id: SpecimenId;
  name: string;
  latin?: string;
  condition?: string;
};

export type JournalEntry = {
  id: string;
  specimenId?: SpecimenId;
  specimenName?: string;
  latin?: string;
  location: string;
  method: string;
  condition?: string;
  content: string;
  createdAt: string;
};

export type ExpeditionState = {
  schemaVersion: number;
  seed: string;
  currentZoneId: ZoneId;
  currentLocalCellId: LocalCellId;
  playerSpawnId: string;
  timeMinutes: number;
  day: number;
  fatigue: number;
  health: number;
  inventory: InventoryItem[];
  journal: JournalEntry[];
  collectedSpecimenIds: SpecimenId[];
  documentedSpecimenIds: SpecimenId[];
  visitedZoneIds: ZoneId[];
  visitedLocalCellIds: LocalCellId[];
};
