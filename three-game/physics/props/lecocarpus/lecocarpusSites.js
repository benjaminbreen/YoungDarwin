import { getInteractiveFloraSites } from '../../../world/ecology';

export const LECOCARPUS_SITES = {};

export function getLecocarpusSites(zoneId) {
  return [
    ...(LECOCARPUS_SITES[zoneId] || []),
    ...getInteractiveFloraSites(zoneId, 'lecocarpus-pinnatifidus'),
  ];
}
