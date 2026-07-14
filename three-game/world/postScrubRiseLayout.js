import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  POST_SCRUB_RISE,
  scrubRiseBasaltExposure,
  scrubRisePathInfo,
  scrubRiseWashMask,
} from './regions/postScrubRise/path';
import { postScrubRiseHeight } from './regions/postScrubRise/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.1,
  color = '#393832',
  obstacle = false,
}) {
  return {
    id,
    x,
    y: postScrubRiseHeight(x, z),
    z,
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color,
    obstacle,
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

const HERO_ROCKS = [
  makeRock({ id: 'north-trail-west', x: -13.5, z: -38, radiusX: 1.3, radiusY: 0.64, radiusZ: 0.92, yaw: 0.28, sink: 0.16, obstacle: true }),
  makeRock({ id: 'north-trail-east', x: -1.2, z: -31.5, radiusX: 1.05, radiusY: 0.48, radiusZ: 0.82, yaw: -0.55, sink: 0.13 }),
  makeRock({ id: 'wash-west-block', x: -23.5, z: -4.5, radiusX: 1.48, radiusY: 0.76, radiusZ: 1.06, yaw: 0.64, sink: 0.19, obstacle: true }),
  makeRock({ id: 'wash-east-block', x: 22.8, z: 1.6, radiusX: 1.22, radiusY: 0.61, radiusZ: 0.96, yaw: -0.34, sink: 0.16, obstacle: true }),
  makeRock({ id: 'fork-marker-west', x: -4.8, z: 23.8, radiusX: 0.98, radiusY: 0.44, radiusZ: 0.74, yaw: 0.18, sink: 0.12 }),
  makeRock({ id: 'fork-marker-east', x: 10.2, z: 20.8, radiusX: 1.12, radiusY: 0.55, radiusZ: 0.86, yaw: -0.72, sink: 0.14, obstacle: true }),
  makeRock({ id: 'south-shoulder-west', x: -13.4, z: 39.2, radiusX: 1.52, radiusY: 0.72, radiusZ: 1.14, yaw: 0.46, sink: 0.18, obstacle: true }),
  makeRock({ id: 'south-shoulder-east', x: 23.6, z: 42.2, radiusX: 1.16, radiusY: 0.52, radiusZ: 0.84, yaw: -0.42, sink: 0.14 }),
];

let postScrubRiseRocks = null;

export function getPostScrubRiseRocks() {
  if (postScrubRiseRocks) return postScrubRiseRocks;
  const rocks = [...HERO_ROCKS];
  let attempts = 0;
  while (rocks.length < 88 && attempts < 6400) {
    attempts += 1;
    const i = attempts + 2719;
    const x = -52 + seededRandom(i, 3) * 104;
    const z = -48 + seededRandom(i, 9) * 96;
    const path = scrubRisePathInfo(x, z);
    if (path.distance < path.width * 1.22) continue;
    const wash = scrubRiseWashMask(x, z);
    const exposure = scrubRiseBasaltExposure(x, z);
    const shoulderStone = path.distance < path.width * 2.5;
    if (exposure < 0.43 && wash < 0.38 && !shoulderStone) continue;
    if (seededRandom(i, 13) > 0.28 + exposure * 0.5 + wash * 0.22) continue;
    const tone = seededRandom(i, 17);
    const scale = 0.18 + tone * (exposure > 0.66 ? 0.72 : 0.46);
    rocks.push(makeRock({
      id: `scrub-rise-basalt-${rocks.length}`,
      x,
      z,
      radiusX: scale * (0.9 + seededRandom(i, 21) * 0.64),
      radiusY: scale * (0.3 + seededRandom(i, 23) * 0.33),
      radiusZ: scale * (0.72 + seededRandom(i, 25) * 0.62),
      yaw: seededRandom(i, 27) * Math.PI * 2,
      sink: scale * 0.18,
      color: tone > 0.62 ? '#504a3e' : tone > 0.34 ? '#3e3d37' : '#292b29',
      obstacle: exposure > 0.62 && scale > 0.64,
    }));
  }
  postScrubRiseRocks = rocks;
  return postScrubRiseRocks;
}

export function getPostScrubRiseRockObstacles() {
  return buildRockObstacles(getPostScrubRiseRocks(), {
    zoneId: POST_SCRUB_RISE,
    idPrefix: 'post-scrub-rise',
    radiusScale: 0.76,
    colliderShape: 'cylinder',
    traversalLabel: 'scramble over rough basalt',
    climbLabel: 'scrub-rise lava block',
    pushFriction: 0.92,
    filter: rock => rock.obstacle === true && rock.radiusY > 0.5,
  });
}
