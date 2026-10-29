import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  CERRO_PAJAS,
  CERRO_PAJAS_SUMMIT_CROWN,
  cerroPajasConeInfo,
  cerroPajasPathInfo,
  cerroPajasRockExposure,
} from './regions/cerroPajas/path';
import { cerroPajasHeight } from './regions/cerroPajas/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.1,
  color = '#5f5649',
  collide = false,
}) {
  return {
    id,
    x,
    y: cerroPajasHeight(x, z),
    z,
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color,
    collide,
    // Highland tuff, not the dark coastal gravel RockField falls back to.
    materialKey: 'weatheredHighlandBasalt',
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

const crown = CERRO_PAJAS_SUMMIT_CROWN;

// The summit crown: a stacked, weathered tuff outcrop on the highest part of
// the rim. It is the map's landmark silhouette from all four trailheads, so
// its blocks are large, upright, and collidable.
const CROWN_ROCKS = [
  makeRock({ id: 'crown-pillar', x: crown.x, z: crown.z, radiusX: 1.9, radiusY: 3.5, radiusZ: 1.6, yaw: 0.4, sink: 0.3, color: '#6a5d4b', collide: true }),
  makeRock({ id: 'crown-pillar-twin', x: crown.x - 1.7, z: crown.z + 1.2, radiusX: 1.4, radiusY: 2.7, radiusZ: 1.3, yaw: -0.7, sink: 0.26, color: '#5e5446', collide: true }),
  makeRock({ id: 'crown-shoulder-west', x: crown.x - 3.2, z: crown.z + 1.1, radiusX: 2.3, radiusY: 1.4, radiusZ: 1.7, yaw: -0.5, sink: 0.24, color: '#5b5143', collide: true }),
  makeRock({ id: 'crown-shoulder-east', x: crown.x + 3, z: crown.z - 0.6, radiusX: 2.0, radiusY: 1.55, radiusZ: 1.4, yaw: 1.1, sink: 0.22, color: '#71644f', collide: true }),
  makeRock({ id: 'crown-slab-north', x: crown.x + 0.6, z: crown.z - 3.1, radiusX: 2.6, radiusY: 0.9, radiusZ: 1.5, yaw: 0.15, sink: 0.18, color: '#564d42', collide: true }),
  makeRock({ id: 'crown-block-south', x: crown.x + 1.2, z: crown.z + 3.2, radiusX: 1.3, radiusY: 1.05, radiusZ: 1.1, yaw: -0.9, sink: 0.16, color: '#665a48', collide: true }),
];

let rockCache = null;

export function getCerroPajasRocks() {
  if (rockCache) return rockCache;
  const rocks = [...CROWN_ROCKS];
  let attempts = 0;
  while (rocks.length < 64 && attempts < 6000) {
    attempts += 1;
    const i = attempts + 7121;
    const x = -50 + seededRandom(i, 3) * 100;
    const z = -46 + seededRandom(i, 9) * 92;
    const path = cerroPajasPathInfo(x, z);
    if (path.distance < path.width * 1.4) continue;
    const cone = cerroPajasConeInfo(x, z);
    const exposure = cerroPajasRockExposure(x, z);
    const rimCandidate = cone.rim > 0.35;
    if (exposure < 0.32 && !rimCandidate && seededRandom(i, 11) > 0.04) continue;
    if (seededRandom(i, 13) > 0.18 + exposure * 0.6 + (rimCandidate ? 0.2 : 0)) continue;
    const tone = seededRandom(i, 17);
    const scale = 0.2 + tone * (exposure > 0.6 ? 0.85 : 0.48);
    rocks.push(makeRock({
      id: `summit-tuff-${rocks.length}`,
      x,
      z,
      radiusX: scale * (0.9 + seededRandom(i, 21) * 0.6),
      radiusY: scale * (0.5 + seededRandom(i, 23) * 0.4),
      radiusZ: scale * (0.72 + seededRandom(i, 25) * 0.58),
      yaw: seededRandom(i, 27) * Math.PI * 2,
      sink: scale * 0.14,
      // Warm weathered tuff; darker greys read as wet holes under the summit mist.
      color: tone > 0.62 ? '#86775d' : tone > 0.32 ? '#73674f' : '#5f5646',
      collide: scale > 0.62,
    }));
  }
  rockCache = rocks;
  return rockCache;
}

export function getCerroPajasRockObstacles() {
  return buildRockObstacles(getCerroPajasRocks(), {
    zoneId: CERRO_PAJAS,
    idPrefix: 'cerro-pajas',
    radiusScale: 0.8,
    colliderShape: 'cylinder',
    traversalLabel: 'step over weathered tuff',
    climbLabel: 'summit tuff block',
    pushFriction: 0.94,
    filter: rock => rock.collide === true,
  });
}
