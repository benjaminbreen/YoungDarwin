import {
  POST_OFFICE_BAY_3,
  postOfficeBay3CoastZ,
  postOfficeBay3TerrainHeight,
} from './regions/postOfficeBay3/terrain';
import { buildRockObstacles, rockVisualBounds } from './proceduralRocks';
import { makeZoneScatter } from './scatter';

const scatter = (layer, count, seed, opts) => makeZoneScatter(POST_OFFICE_BAY_3, layer, count, seed, opts);

let rockCache = null;

export function getPostOfficeBay3Rocks() {
  if (rockCache) return rockCache;
  const westRocks = scatter('pob3-west-basalt', 18, 211, {
    minX: -52,
    maxX: -14,
    minZ: -38,
    maxZ: 5,
    scale: [0.28, 1.05],
    maxGrade: 3,
    accept: (biome, x, z) => {
      const d = z - postOfficeBay3CoastZ(x);
      return d > -5.5 && d < 5 && (biome === 'wet-sand' || biome === 'green-headland' || biome === 'basalt');
    },
  });
  const eastRocks = scatter('pob3-east-basalt', 14, 223, {
    minX: 34,
    maxX: 57,
    minZ: -29,
    maxZ: -5,
    scale: [0.35, 1.2],
    maxGrade: 3,
    accept: (biome, x, z) => {
      const d = z - postOfficeBay3CoastZ(x);
      return d > -6 && d < 4.5 && (biome === 'wet-sand' || biome === 'basalt' || biome === 'shell-sand');
    },
  });
  const pathEdgeStones = scatter('pob3-path-stone', 7, 239, {
    minX: -12,
    maxX: 26,
    minZ: 9,
    maxZ: 45,
    scale: [0.18, 0.42],
    maxGrade: 0.55,
    accept: biome => biome === 'path-shoulder' || biome === 'dense-scrub',
  });

  rockCache = [...westRocks, ...eastRocks, ...pathEdgeStones].map(item => ({
    ...item,
    color: item.tone > 0.65 ? '#292720' : item.tone > 0.3 ? '#38342b' : '#24231f',
    radiusX: item.scale * (1.0 + item.tone * 0.5),
    radiusY: item.scale * (0.42 + item.tone * 0.34),
    radiusZ: item.scale * (0.78 + item.tone * 0.28),
    sink: item.scale * 0.16,
  }));
  return rockCache;
}

export function getPostOfficeBay3RockObstacles() {
  return buildRockObstacles(getPostOfficeBay3Rocks(), {
    zoneId: POST_OFFICE_BAY_3,
    idPrefix: 'pob3',
    radiusScale: 0.84,
    filter: rock => rockVisualBounds(rock).height > 0.5,
  });
}

export function terrainYForPostOfficeBay3(x, z) {
  return postOfficeBay3TerrainHeight(x, z);
}
