import { getSpecimenById, specimenActorId } from '../../../game-core/specimens';
import { isGroundSpotClear } from '../../fauna/motion/steering';
import { getZoneProps } from '../../physics/props/propRegistry';
import { getRuntimeObstacles } from '../obstacles';
import { makeZonePatchScatter } from '../scatter';
import { getRegionTerrainConfig, movementTerrainHeight, WATER_LEVEL } from '../terrain';
import { postOfficeBayCoastZ } from '../regions/postOfficeBay/terrain';

// The strandline and sheltered pools have food and discarded shells. Keep
// populations on those bands even in large regions that extend far inland.
const SHORE_HABITATS = {
  POST_OFFICE_BAY: {
    count: 12, patches: 3, bounds: { minX: -13, maxX: 35, minZ: -9, maxZ: 13 },
    accept: (_, x, z) => z - postOfficeBayCoastZ(x) > 0.8 && z - postOfficeBayCoastZ(x) < 7.5,
  },
  ALT_POST_OFFICE_BAY: { count: 8, patches: 2, biomes: ['sand-beach', 'wet-sand'] },
  N_SHORE: { count: 8, patches: 2, biomes: ['black-sand', 'ash-beach', 'sesuvium-flat'] },
  BLACK_BEACH: { count: 9, patches: 3, biomes: ['black-sand', 'wet-black-sand'] },
  CORMORANT_BAY: { count: 12, patches: 3, biomes: ['wet-white-sand', 'white-sand', 'wet-mud'] },
  PUNTA_CORMORANT: { count: 15, patches: 4, biomes: ['green-beach', 'wet-mud'] },
  S_HUT: { count: 8, patches: 2, biomes: ['white-sand', 'wet-white-sand'] },
  S_INTERTIDAL: { count: 12, patches: 3, biomes: ['wrack-line', 'backshore-scrub'] },
  SW_BEACH: { count: 5, patches: 2, biomes: ['white-shell-beach'] },
  MANGROVES: { count: 10, patches: 3, biomes: ['pool-edge', 'mangrove-root-wall'] },
};

export const HERMIT_CRAB_MIN_GROUND = WATER_LEVEL + 0.07;

export function buildHermitCrabPopulation(zoneId) {
  const habitat = SHORE_HABITATS[zoneId];
  if (!habitat) return [];
  const { width, depth } = getRegionTerrainConfig(zoneId);
  const bounds = habitat.bounds || {
    minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2,
  };
  let sources;
  const seed = [...zoneId].reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0, 73) % 10000;
  const patches = makeZonePatchScatter(zoneId, 'hermitcrab', habitat.count, seed, {
    ...bounds,
    scale: [0.82, 1.12],
    maxGrade: 0.34,
    patchCount: habitat.patches,
    patchRadius: [2.0, 4.5],
    minPatchSeparation: 10,
    minItemSeparation: 0.9,
    accept: (biome, x, z, y) => {
      if (y < HERMIT_CRAB_MIN_GROUND || y > WATER_LEVEL + 2.5) return false;
      if (!(habitat.accept?.(biome, x, z) ?? habitat.biomes?.includes(biome))) return false;
      if (movementTerrainHeight(x, z, zoneId) < HERMIT_CRAB_MIN_GROUND) return false;
      sources ||= { obstacles: getRuntimeObstacles(zoneId), props: getZoneProps(zoneId) };
      return isGroundSpotClear(x, z, zoneId, { sources, radius: 0.18, maxClimbHeight: 0.1 });
    },
  });
  const specimen = getSpecimenById('hermitcrab');
  return patches.map(item => ({
    ...specimen,
    instanceId: specimenActorId(zoneId, item.id),
    localInstanceId: item.id,
    spawnPoint: [item.x, item.y, item.z],
    sceneScale: item.scale,
    behavior: 'ambient',
    population: true,
  }));
}
