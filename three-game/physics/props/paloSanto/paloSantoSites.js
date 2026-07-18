import { getInteractiveFloraSites } from '../../../world/ecology';

// Palo santo placement is ecology-owned. Keeping this authored registry empty
// makes new adoption incremental and prevents a second placement source from
// drifting away from the region habitat masks.
export const PALO_SANTO_SITES = {};

export function getPaloSantoSites(zoneId) {
  return [
    ...(PALO_SANTO_SITES[zoneId] || []),
    ...getInteractiveFloraSites(zoneId, 'palo-santo'),
  ];
}
