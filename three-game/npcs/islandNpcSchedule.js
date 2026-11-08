import { getRegionEdgeHints } from '../../game-core/regionMaps';
import { getLocalTransitions } from '../world/localTransitions';
import { regionSpawnPoint } from '../world/terrain';
import { PENAL_COLONY_GARDENS } from '../world/regions/penalColony/path';
import { ASILO_SPRING_SINKHOLE } from '../world/regions/asiloSpring/path';
import { POST_OFFICE_BAY_SEA_TUBE } from '../world/regions/postOfficeBay/seaTube';

export const WELL_BOY_ID = 'well_boy';
export const STOKES_ID = 'john_lort_stokes';

function site(zoneId, x, z, activity, { yaw = 0, busy = false, privateSite = false, clip = 'work', hidden = false } = {}) {
  return { zoneId, x, z, activity, yaw, busy, privateSite, clip, hidden };
}

function plotSide(id, side) {
  const plot = PENAL_COLONY_GARDENS.find(garden => garden.id === id);
  const offset = side * (plot.halfX + 1.15);
  return [plot.x + Math.cos(plot.yaw) * offset, plot.z - Math.sin(plot.yaw) * offset];
}

const mariaSites = {
  home: site('PENAL_COLONY', -14, 7.8, 'Resting by the house', { yaw: -0.6, busy: true, clip: 'idle' }),
  kitchen: site('PENAL_COLONY', -14, 7.8, 'Preparing the next meal', { yaw: -0.6, busy: true }),
  garden: site('PENAL_COLONY', ...plotSide('sweet-potato-plot', 1), 'Checking the sweet potato vines', { yaw: 1.62 }),
  maize: site('PENAL_COLONY', ...plotSide('maize-plot', -1), 'Checking the maize', { yaw: -1.5 }),
  cane: site('PENAL_COLONY', ...plotSide('cane-plot', -1), 'Sorting cut cane', { yaw: 1.4, busy: true }),
  water: site('ASILO_SPRING', -8, -9, 'Filling a jar at the spring', { yaw: 0.3, busy: true }),
  creek: site('WATKINS_CREEK', -6.5, -2.5, 'Looking for plants along the creek', { yaw: 0.4 }),
};

const wetGardenTasks = new WeakMap();
const gardenSites = new Set([mariaSites.garden, mariaSites.maize, mariaSites.cane]);
export function getIslandNpcWeatherLeg(npcId, leg, wet) {
  if (!wet || npcId !== 'maria' || !leg || leg.zoneId !== 'PENAL_COLONY') return leg;
  if (!gardenSites.has(leg.to)) return leg;
  if (!wetGardenTasks.has(leg)) {
    const kitchen = { ...mariaSites.kitchen, activity: 'Sorting greens beside the cookhouse', busy: false };
    wetGardenTasks.set(leg, { ...leg, ...kitchen, from: kitchen, to: kitchen });
  }
  return wetGardenTasks.get(leg);
}

const gabrielSites = {
  hearth: site('GABRIEL_QUARTERS', 1, 2.3, 'Keeping close to the hearth', { yaw: -2.1, privateSite: true, clip: 'idle' }),
  press: site('GABRIEL_PRESS', 0.3, 1.35, 'Working at the press', { yaw: Math.PI, privateSite: true }),
  type: site('GABRIEL_PRESS', -4.4, 0.1, 'Sorting loose type', { yaw: Math.PI, privateSite: true }),
  fern: site('GABRIEL_SPRING', -2.8, 1.4, 'Checking the cistern', { yaw: 0.9, privateSite: true }),
  lookout: site('ASILO_SPRING', ASILO_SPRING_SINKHOLE.promptX + 5.6, ASILO_SPRING_SINKHOLE.promptZ - 1.2,
    'Watching the highland trail', { yaw: 1.1, clip: 'look' }),
  gallery: site('GABRIEL_SEA_GALLERY', 0.4, 5.1, 'Listening at the sea passage', { yaw: 0.05, privateSite: true, clip: 'look' }),
  coast: site('POST_OFFICE_BAY', POST_OFFICE_BAY_SEA_TUBE.promptX + 4.0, POST_OFFICE_BAY_SEA_TUBE.promptZ - 2,
    'Watching the anchorage', { yaw: -0.9, clip: 'look' }),
};

const sitesByNpc = {
  maria: mariaSites,
  gabriel_puig: gabrielSites,
  [WELL_BOY_ID]: {
    home: site('PENAL_COLONY', -11.5, 3.5, 'At home', { hidden: true }),
    lane: site('PENAL_COLONY', -7, 3, 'Carrying the water pail', { clip: 'hold_pail' }),
    spring: site('ASILO_SPRING', -4.5, 8.4, 'Filling the pail', { yaw: -2.9, clip: 'fill' }),
    wait: site('ASILO_SPRING', -4.5, 8.4, 'Waiting for doves by the water', { yaw: -2.9, clip: 'wait' }),
  },
  [STOKES_ID]: {
    away: site('PENAL_COLONY', -3, 15, 'Off duty', { hidden: true }),
    lane: site('PENAL_COLONY', -3, 15, 'Checking his bearings', { yaw: 0.4, clip: 'look' }),
    lava: site('S_VOLCANIC', -10, -3, 'Sketching the lava folds', { yaw: 0.8, clip: 'sketch' }),
    ridge: site('S_VOLCANIC', 15, 12, 'Taking a bearing across the lava', { yaw: -0.7, clip: 'look' }),
  },
};

export const ISLAND_NPC_IDS = Object.keys(sitesByNpc);

const guides = {
  maize: { npcId: 'maria', site: mariaSites.maize, leading: 'Leading the way to the maize', arrival: 'Showing Darwin the maize' },
  lavaRidge: { npcId: STOKES_ID, site: sitesByNpc[STOKES_ID].ridge, leading: 'Leading the way to the lava ridge', arrival: 'Showing Darwin the lava ridges' },
};

export function getIslandNpcGuide(id, npcId, zoneId) {
  const guide = Object.hasOwn(guides, id) ? guides[id] : null;
  return guide?.npcId === npcId && guide.site.zoneId === zoneId ? guide : null;
}

// Times are local expedition time. The gap between visits is reserved for travel.
// María checks the creek on the second day and draws water on the other days.
// Gabriel uses the seaward tube after dark, never the settlement's public paths.
const schedules = {
  maria: [
    [0, 315, 'home'], [315, 430, 'kitchen'], [440, 620, 'garden'], [628, 665, 'maize'],
    [710, 765, 'water'], [815, 880, 'cane'], [888, 1038, 'garden'],
    [1052, 1160, 'kitchen'], [1160, 1440, 'home'],
  ],
  gabriel_puig: [
    [0, 430, 'hearth'], [440, 605, 'press'], [612, 711, 'type'],
    [721, 816, 'fern'], [830, 1015, 'press'], [1028, 1122, 'lookout', ['GABRIEL_SPRING']],
    [1160, 1203, 'gallery', ['GABRIEL_SPRING', 'GABRIEL_PRESS']],
    [1214, 1316, 'coast'], [1350, 1440, 'hearth', ['GABRIEL_SEA_GALLERY', 'GABRIEL_PRESS']],
  ],
  [WELL_BOY_ID]: [
    [0, 408, 'home'], [416, 438, 'lane'], [480, 503, 'spring'], [503, 567, 'wait'],
    [607, 628, 'lane'], [638, 1440, 'home'],
  ],
  [STOKES_ID]: [
    [0, 490, 'away'], [490, 540, 'lane'], [595, 675, 'lava'], [689, 752, 'ridge'],
    [764, 865, 'lava'], [920, 960, 'lane'], [960, 1440, 'away'],
  ],
};

function visitsForDay(npcId, day) {
  if (day % 2 !== 0 || (npcId !== 'maria' && npcId !== 'gabriel_puig')) return schedules[npcId];
  if (npcId === 'maria') return schedules.maria.map(visit => visit[2] === 'water' ? [710, 765, 'creek'] : visit);
  // On alternating evenings he stays underground instead of risking the bay.
  return [
    ...schedules.gabriel_puig.slice(0, 6),
    [1160, 1265, 'gallery', ['GABRIEL_SPRING', 'GABRIEL_PRESS']],
    [1298, 1440, 'hearth', ['GABRIEL_PRESS']],
  ];
}

function spawn(zoneId, entryId) {
  const { x, z } = regionSpawnPoint(zoneId, entryId);
  return { x, z };
}

function passage(from, to) {
  const door = getLocalTransitions(from).find(link => link.toRegionId === to);
  if (door) return { exit: door.position, entry: spawn(to, door.entryEdge), minutes: 1.5 };
  const edge = getRegionEdgeHints(from).find(link => link.kind === 'open' && link.toRegionId === to);
  const reverse = getRegionEdgeHints(to).find(link => link.kind === 'open' && link.toRegionId === from);
  if (edge && reverse && edge.routeKind !== 'water') {
    return {
      exit: spawn(from, edge.edge), entry: spawn(to, reverse.edge),
      minutes: Math.max(1.5, (edge.minutes || 10) * 0.45),
    };
  }
  throw new Error(`No walking connection for island NPCs from ${from} to ${to}`);
}

const days = new Map();
export function getIslandNpcDay(npcId, day = 1) {
  const variant = day % 2;
  const key = `${npcId}:${variant}`;
  if (days.has(key)) return days.get(key);
  const visits = visitsForDay(npcId, variant);
  const sites = sitesByNpc[npcId];
  const timeline = [];
  for (let i = 0; i < visits.length; i += 1) {
    const [start, end, name, via = []] = visits[i];
    const current = sites[name];
    const previous = visits[i - 1];
    if (previous && start > previous[1]) {
      const last = sites[previous[2]];
      const zones = [last.zoneId, ...via, current.zoneId];
      const legs = [];
      let entry = last;
      for (let j = 0; j < zones.length - 1; j += 1) {
        const zoneId = zones[j];
        if (zoneId === zones[j + 1]) continue;
        const next = passage(zoneId, zones[j + 1]);
        legs.push({ zoneId, from: entry, to: next.exit });
        legs.push({ zoneId: null, minutes: next.minutes });
        entry = next.entry;
      }
      legs.push({ zoneId: current.zoneId, from: entry, to: current });
      const weights = legs.map(leg => leg.minutes ?? Math.max(0.4,
        Math.hypot(leg.from.x - leg.to.x, leg.from.z - leg.to.z) / 7));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let cursor = previous[1];
      legs.forEach((leg, j) => {
        const next = j === legs.length - 1 ? start : cursor + (start - previous[1]) * weights[j] / total;
        const carryingPail = npcId === WELL_BOY_ID;
        timeline.push({
          ...leg, start: cursor, end: next,
          privateSite: leg.zoneId?.startsWith('GABRIEL_'),
          activity: carryingPail ? 'Carrying the water pail' : 'On the trail',
          clip: 'walk', moveClip: carryingPail ? 'carry' : 'walk',
        });
        cursor = next;
      });
    }
    timeline.push({ ...current, start, end, from: current, to: current });
  }
  days.set(key, timeline);
  return timeline;
}

export function getIslandNpcSchedule(npcId, day, timeOfDay) {
  const minute = Math.min(1439.999, Math.max(0, timeOfDay * 60));
  return getIslandNpcDay(npcId, day).find(leg => minute >= leg.start && minute < leg.end);
}

export function getIslandNpcIdsForZone(zoneId) {
  return ISLAND_NPC_IDS.filter(id => [1, 2].some(day => getIslandNpcDay(id, day).some(leg => leg.zoneId === zoneId)));
}
