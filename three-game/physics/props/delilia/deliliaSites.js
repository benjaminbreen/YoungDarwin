import { getInteractiveFloraSites } from '../../../world/ecology';

// Darwin's Delilia specimen has no surviving collection coordinate beyond
// Charles Island. Every living reconstruction is therefore selected by the
// ecology scorer rather than pinned to a falsely precise historical site.
export const DELILIA_SITES = {};

export function getDeliliaSites(zoneId) {
  return [
    ...(DELILIA_SITES[zoneId] || []),
    ...getInteractiveFloraSites(zoneId, 'delilia-inelegans'),
  ];
}
