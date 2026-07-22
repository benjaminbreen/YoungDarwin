import { getInteractiveFloraSites } from '../../../world/ecology';

// Sicyos villosus is known from Darwin's Charles Island collection, but the
// exact collection locality was not recorded. Sites therefore come only from
// habitat-scored ecology layers rather than pretending to know a coordinate.
export const SICYOS_SITES = {};

export function getSicyosSites(zoneId) {
  return [
    ...(SICYOS_SITES[zoneId] || []),
    ...getInteractiveFloraSites(zoneId, 'sicyos-villosus'),
  ];
}
