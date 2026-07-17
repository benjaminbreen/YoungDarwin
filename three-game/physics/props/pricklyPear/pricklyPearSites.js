// Authored placements for destructible prickly pears, keyed by zone id.
// Coordinates were checked against each region's path/cave masks so plants
// stay off walking routes. size scales the whole plant (~0.7 small – 1.3
// large); flowerCount is the number of yellow blossoms (0–3).

import { getInteractiveFloraSites } from '../../../world/ecology';

export const PRICKLY_PEAR_SITES = {
  POST_OFFICE_BAY: [
    { id: 'pob-1', x: 13.8, z: 12.4, yaw: 0.4, seed: 'pob-1', size: 1.15, flowerCount: 2 },
    { id: 'pob-2', x: 23.2, z: 17.8, yaw: -0.8, seed: 'pob-2', size: 0.95, flowerCount: 0 },
    { id: 'pob-3', x: -18.8, z: 9.2, yaw: 1.45, seed: 'pob-3', size: 0.8, flowerCount: 1 },
    { id: 'pob-4', x: 6.8, z: 26.5, yaw: -0.25, seed: 'pob-4', size: 1.3, flowerCount: 3 },
  ],
  E_MID: [
    { id: 'rc-1', x: -24, z: 10, yaw: 0.7, seed: 'rc-1', size: 1.2, flowerCount: 2 },
    { id: 'rc-2', x: -15, z: 22, yaw: -1.2, seed: 'rc-2', size: 0.75, flowerCount: 0 },
    { id: 'rc-3', x: 9, z: 18, yaw: 2.1, seed: 'rc-3', size: 1.0, flowerCount: 1 },
    { id: 'rc-4', x: 22, z: 8, yaw: -0.4, seed: 'rc-4', size: 0.9, flowerCount: 3 },
    { id: 'rc-5', x: 30, z: 24, yaw: 1.0, seed: 'rc-5', size: 1.25, flowerCount: 1 },
  ],
};

export function getPricklyPearSites(zoneId) {
  return [
    ...(PRICKLY_PEAR_SITES[zoneId] || []),
    ...getInteractiveFloraSites(zoneId, 'prickly-pear'),
  ];
}
